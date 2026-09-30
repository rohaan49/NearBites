#!/usr/bin/env python3
"""Download real Roboflow Universe datasets and merge them into one 2-class YOLO set.

0 = hairnet, 1 = glove.  No synthetic images, no placeholders: if a source fails to
download, this script stops and says so.

    python prepare_dataset.py                 # all sources in sources.yaml
    python prepare_dataset.py --only kitchen_hygiene_gear
    python prepare_dataset.py --skip-download # re-merge from raw/ without re-fetching
"""
import argparse, hashlib, json, os, re, shutil, sys
from collections import Counter, defaultdict
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent
IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def die(msg):
    sys.exit(f"ERROR: {msg}")


def load_env():
    """Minimal .env reader so the API key never has to sit in a shell history."""
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def download(src, raw_dir):
    """Fetch one Roboflow project in YOLOv8 format. Returns its export directory."""
    from roboflow import Roboflow

    key = os.environ.get("ROBOFLOW_API_KEY")
    if not key:
        die("ROBOFLOW_API_KEY not set (put it in chefcheck/.env)")
    dest = raw_dir / src["name"]
    if (dest / "data.yaml").exists():
        print(f"  [{src['name']}] already downloaded")
        return dest
    proj = Roboflow(api_key=key).workspace(src["workspace"]).project(src["project"])
    ver = proj.version(src["version"]) if src.get("version") else proj.version(proj.versions()[0].version)
    ver.download("yolov8", location=str(dest), overwrite=True)
    if not (dest / "data.yaml").exists():
        die(f"{src['name']}: download produced no data.yaml at {dest}")
    return dest


def build_remap(source_names, class_map):
    """source class index -> our class id (or None to drop). Fails loudly on a dead rule."""
    remap, used = {}, set()
    for i, name in enumerate(source_names):
        for pat, ours in class_map.items():
            if re.fullmatch(pat, name.strip(), re.IGNORECASE):
                remap[i] = ours
                used.add(pat)
                break
    dead = set(class_map) - used
    if dead:
        print(f"    WARNING: rules matched nothing: {sorted(dead)} (source classes: {source_names})")
    return remap


def write_data_yaml(out_dir, classes, listed=True):
    """Point at <split>.txt when a background cap is in force, at the image dirs otherwise."""
    ref = (lambda s: f"{s}.txt") if listed else (lambda s: f"images/{s}")
    (out_dir / "data.yaml").write_text(yaml.safe_dump({
        "path": str(out_dir.resolve()),
        "train": ref("train"), "val": ref("val"), "test": ref("test"),
        "nc": len(classes), "names": classes,
    }, sort_keys=False))


def group_key(stem):
    """Strip Roboflow's augmentation suffix so all variants of one photo share a group.

    'chef_12_jpg.rf.a1b2c3....jpg' -> 'chef_12'.  Without this, augmented copies of the
    same photo land in different splits and the val/test numbers are fiction.
    """
    return re.split(r"\.rf\.|_jpg\.|_png\.", stem)[0]


def parse_label(path):
    rows = []
    for ln, line in enumerate(path.read_text().splitlines(), 1):
        parts = line.split()
        if not parts:
            continue
        if len(parts) < 5:
            raise ValueError(f"{path}:{ln}: expected 5+ fields, got {len(parts)}")
        if len(parts) > 5:  # polygon (segmentation export) -> take its bounding box
            xs = [float(v) for v in parts[1::2]]
            ys = [float(v) for v in parts[2::2]]
            cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
            w, h = max(xs) - min(xs), max(ys) - min(ys)
            rows.append((int(float(parts[0])), cx, cy, w, h))
        else:
            rows.append((int(float(parts[0])), *[float(v) for v in parts[1:5]]))
    return rows


def collect(src, export_dir):
    """Yield (image_path, [(cls,cx,cy,w,h)], group) for every usable image in one source."""
    meta = yaml.safe_load((export_dir / "data.yaml").read_text())
    names = meta["names"]
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]
    remap = build_remap(names, src["class_map"])
    if not remap:
        die(f"{src['name']}: no source class matched class_map. Source classes: {names}")

    out, dropped_boxes = [], 0
    for img in sorted(export_dir.rglob("*")):
        if img.suffix.lower() not in IMG_EXT or "images" not in img.parts:
            continue
        lbl = Path(str(img).replace("/images/", "/labels/")).with_suffix(".txt")
        rows = parse_label(lbl) if lbl.exists() else []
        kept = []
        for c, cx, cy, w, h in rows:
            if c not in remap:
                dropped_boxes += 1
                continue
            if not (w > 1e-4 and h > 1e-4):  # degenerate box in the source annotation
                dropped_boxes += 1
                continue
            kept.append((remap[c], min(max(cx, 0), 1), min(max(cy, 0), 1), min(w, 1), min(h, 1)))
        if kept or src.get("keep_negatives"):
            out.append((img, kept, f"{src['name']}/{group_key(img.stem)}"))
    print(f"    kept {len(out)} images, dropped {dropped_boxes} out-of-scope boxes")
    return out


def write_split_lists(out_dir, frac, seed):
    """Write dataset/<split>.txt listing the images to train on, capping background images.

    keep_negatives pulls in every "no hairnet / no gloves" frame, and once those boxes are
    dropped the image is pure background. Left unchecked that was 57% of the dataset, which
    teaches the model that predicting nothing is usually right and costs recall.

    This selects rather than deletes: every downloaded image stays on disk, so changing the
    cap is a rewrite of three text files, not a re-download. (Deleting the surplus was the
    first approach and ran at ~2 files/sec on NFS -- hours for one config change.)

    Positives are always listed. Which negatives survive is a deterministic hash of the
    filename, so the same cap always yields the same dataset.
    """
    counts = {}
    for s in ("train", "val", "test"):
        pos, bg = [], []
        for img in sorted((out_dir / "images" / s).iterdir()):
            if img.suffix.lower() not in IMG_EXT:
                continue
            lbl = out_dir / "labels" / s / f"{img.stem}.txt"
            # stat, not read: an empty label file is a background image, and stat'ing
            # 50k files over NFS is far cheaper than opening each one.
            (pos if lbl.exists() and lbl.stat().st_size else bg).append(img)
        keep = min(len(bg), int(len(pos) * frac / (1 - frac)))
        bg = sorted(bg, key=lambda p: hashlib.md5(f"{seed}:{p.stem}".encode()).hexdigest())[:keep]
        listed = sorted(pos + bg)
        (out_dir / f"{s}.txt").write_text("".join(f"{p.resolve()}\n" for p in listed))
        counts[s] = {"listed": len(listed), "positive": len(pos), "background": len(bg)}
        print(f"  {s}.txt: {len(listed)} images = {len(pos)} positive + {keep} background "
              f"({keep/max(len(listed),1):.0%})")
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="dataset")
    ap.add_argument("--raw", default="raw")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--skip-download", action="store_true")
    ap.add_argument("--append", action="store_true",
                    help="merge into an existing dataset/ instead of rebuilding it")
    ap.add_argument("--lists-only", action="store_true",
                    help="skip the build; just rewrite the split lists for an existing dataset/")
    a = ap.parse_args()

    load_env()
    cfg = yaml.safe_load((ROOT / "sources.yaml").read_text())
    raw_dir, out_dir = ROOT / a.raw, ROOT / a.out
    raw_dir.mkdir(exist_ok=True)
    bg_cap = cfg["split"].get("max_background_fraction")

    if a.lists_only:
        if not bg_cap:
            die("split.max_background_fraction is not set in sources.yaml")
        print(f"capping background images at {bg_cap:.0%} of each split")
        write_split_lists(out_dir, bg_cap, cfg["split"]["seed"])
        write_data_yaml(out_dir, cfg["classes"])
        return

    records = []
    for src in cfg["sources"]:
        if a.only and src["name"] not in a.only:
            continue
        print(f"[{src['name']}] {src['workspace']}/{src['project']} v{src.get('version')}")
        d = raw_dir / src["name"]
        if not a.skip_download:
            d = download(src, raw_dir)
        elif not (d / "data.yaml").exists():
            die(f"{src['name']}: --skip-download but {d} is not downloaded")
        records += collect(src, d)
    if not records:
        die("no images collected")

    # Deduplicate on image bytes: these datasets overlap and re-upload each other.
    seen, deduped = {}, []
    for img, boxes, grp in records:
        h = hashlib.md5(img.read_bytes()).hexdigest()
        if h in seen:
            continue
        seen[h] = grp
        deduped.append((img, boxes, grp, h))
    print(f"\n{len(records)} images -> {len(deduped)} after exact-duplicate removal")

    # Split by group, not by image, so augmented siblings stay on the same side.
    sp = cfg["split"]
    groups = sorted({r[2] for r in deduped})

    def bucket(g):
        r = int(hashlib.md5(f"{sp['seed']}:{g}".encode()).hexdigest(), 16) % 10_000 / 10_000
        return "train" if r < sp["train"] else "val" if r < sp["train"] + sp["val"] else "test"

    where = {g: bucket(g) for g in groups}

    if out_dir.exists() and not a.append:
        shutil.rmtree(out_dir)
    for s in ("train", "val", "test"):
        (out_dir / "images" / s).mkdir(parents=True, exist_ok=True)
        (out_dir / "labels" / s).mkdir(parents=True, exist_ok=True)

    stats = defaultdict(Counter)
    for img, boxes, grp, h in deduped:
        s = where[grp]
        name = f"{grp.split('/')[0]}_{h[:12]}"
        shutil.copy2(img, out_dir / "images" / s / f"{name}{img.suffix.lower()}")
        (out_dir / "labels" / s / f"{name}.txt").write_text(
            "".join(f"{c} {cx:.6f} {cy:.6f} {w:.6f} {hh:.6f}\n" for c, cx, cy, w, hh in boxes)
        )
        stats[s]["images"] += 1
        if not boxes:
            stats[s]["background_images"] += 1
        for c, *_ in boxes:
            stats[s][cfg["classes"][c]] += 1

    (out_dir / "stats.json").write_text(json.dumps({k: dict(v) for k, v in stats.items()}, indent=2))

    if bg_cap:
        print(f"\ncapping background images at {bg_cap:.0%} of each split")
        write_split_lists(out_dir, bg_cap, sp["seed"])
    write_data_yaml(out_dir, cfg["classes"], listed=bool(bg_cap))

    print("\nsplit               images  background  hairnet   glove")
    for s in ("train", "val", "test"):
        c = stats[s]
        print(f"{s:<18}{c['images']:>8}{c['background_images']:>12}{c['hairnet']:>9}{c['glove']:>8}")
    print(f"\nwrote {out_dir}/data.yaml")


if __name__ == "__main__":
    main()
