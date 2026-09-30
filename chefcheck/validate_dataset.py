#!/usr/bin/env python3
"""Audit the merged dataset before training. Exits non-zero on anything fatal.

    python validate_dataset.py dataset
"""
import hashlib, sys
from collections import Counter, defaultdict
from pathlib import Path

import yaml
from PIL import Image

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def main(root="dataset"):
    root = Path(root)
    cfg = yaml.safe_load((root / "data.yaml").read_text())
    names = cfg["names"]
    fatal, warn = [], []
    per_split, areas, groups = {}, defaultdict(list), defaultdict(set)
    hashes = {}

    for split in ("train", "val", "test"):
        # Audit exactly what training will see: the split list when data.yaml uses one,
        # otherwise the whole image directory.
        listing = root / str(cfg[split])
        if listing.suffix == ".txt" and listing.exists():
            imgs = [Path(l) for l in listing.read_text().split() if l]
        else:
            imgs = sorted(p for p in (root / "images" / split).iterdir() if p.suffix.lower() in IMG_EXT)
        c = Counter()
        c["images"] = len(imgs)
        if not imgs:
            fatal.append(f"{split}: no images")
        for img in imgs:
            lbl = root / "labels" / split / f"{img.stem}.txt"  # YOLO's images/->labels/ convention
            if not lbl.exists():
                fatal.append(f"{split}: missing label for {img.name}")
                continue
            try:
                with Image.open(img) as im:
                    im.verify()
            except Exception as e:
                fatal.append(f"{split}: corrupt image {img.name}: {e}")
                continue

            h = hashlib.md5(img.read_bytes()).hexdigest()
            if h in hashes and hashes[h][0] != split:
                fatal.append(f"LEAK: identical image in {hashes[h][0]} and {split} ({img.name})")
            hashes.setdefault(h, (split, img.name))
            groups[img.name.split("_")[0]].add(split)

            rows = [l.split() for l in lbl.read_text().splitlines() if l.strip()]
            if not rows:
                c["background_images"] += 1
            for r in rows:
                if len(r) != 5:
                    fatal.append(f"{split}/{lbl.name}: bad field count {len(r)}")
                    continue
                cid = int(r[0])
                cx, cy, w, hh = map(float, r[1:])
                if not 0 <= cid < len(names):
                    fatal.append(f"{split}/{lbl.name}: class id {cid} out of range")
                    continue
                if not all(0.0 <= v <= 1.0 for v in (cx, cy, w, hh)):
                    fatal.append(f"{split}/{lbl.name}: coords outside 0-1: {r[1:]}")
                if w * hh <= 0:
                    fatal.append(f"{split}/{lbl.name}: zero-area box")
                elif w * hh < 1e-5:
                    warn.append(f"{split}/{lbl.name}: box area {w*hh:.2e} is near-invisible")
                if cx - w / 2 < -0.01 or cx + w / 2 > 1.01 or cy - hh / 2 < -0.01 or cy + hh / 2 > 1.01:
                    warn.append(f"{split}/{lbl.name}: box extends past the image edge")
                c[names[cid]] += 1
                areas[names[cid]].append(w * hh)
        per_split[split] = c

    # ---- report ----
    print(f"classes: {names}\n")
    print(f"{'split':<8}{'images':>8}{'background':>12}" + "".join(f"{n:>10}" for n in names))
    for s, c in per_split.items():
        print(f"{s:<8}{c['images']:>8}{c['background_images']:>12}" + "".join(f"{c[n]:>10}" for n in names))

    tot = Counter()
    for c in per_split.values():
        tot.update(c)
    print("\nbox size (fraction of image area):")
    for n in names:
        a = sorted(areas[n])
        if a:
            print(f"  {n:<10} n={len(a):<7} median={a[len(a)//2]:.4f}  p5={a[len(a)//20]:.4f}  p95={a[int(len(a)*0.95)]:.4f}")

    counts = [tot[n] for n in names]
    if min(counts) and max(counts) / min(counts) > 3:
        warn.append(f"class imbalance {dict(zip(names, counts))} -> ratio {max(counts)/min(counts):.1f}:1")
    for n, v in zip(names, counts):
        if v == 0:
            fatal.append(f"class '{n}' has zero boxes in the whole dataset")

    spread = {g: s for g, s in groups.items() if len(s) > 1}
    if spread:
        warn.append(f"{len(spread)} source-groups span more than one split (check group_key)")

    bg = tot["background_images"] / max(tot["images"], 1)
    print(f"\nbackground (negative) images: {bg:.1%} of the dataset")
    if bg > 0.5:
        warn.append(f"{bg:.0%} of images have no boxes at all; that is a lot of pure background")

    for w in warn[:40]:
        print(f"WARN  {w}")
    if len(warn) > 40:
        print(f"WARN  ... and {len(warn)-40} more")
    for f in fatal[:40]:
        print(f"FATAL {f}")
    if len(fatal) > 40:
        print(f"FATAL ... and {len(fatal)-40} more")

    print(f"\n{len(fatal)} fatal, {len(warn)} warnings")
    return 1 if fatal else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
