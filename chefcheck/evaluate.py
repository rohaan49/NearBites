#!/usr/bin/env python3
"""Evaluate on the held-out test split and write an error analysis.

Produces per-class P / R / mAP50 / mAP50-95, the confusion matrix, and directories of
actual annotated failure images so the numbers can be looked at, not just read.

    python evaluate.py --weights runs/baseline/weights/best.pt
"""
import argparse, json, shutil
from collections import Counter
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent
IOU_MATCH = 0.5
ERROR_DIRS = ["false_positive_hairnet", "false_positive_glove",
              "missed_hairnet", "missed_glove", "misclassified"]


def iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix, iy = max(0, min(ax2, bx2) - max(ax1, bx1)), max(0, min(ay2, by2) - max(ay1, by1))
    inter = ix * iy
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union > 0 else 0.0


def load_gt(label_path, w, h):
    out = []
    if not label_path.exists():
        return out
    for line in label_path.read_text().splitlines():
        p = line.split()
        if len(p) == 5:
            c, cx, cy, bw, bh = int(p[0]), *map(float, p[1:])
            out.append((c, ((cx - bw / 2) * w, (cy - bh / 2) * h, (cx + bw / 2) * w, (cy + bh / 2) * h)))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", default="runs/baseline/weights/best.pt")
    ap.add_argument("--data", default="dataset/data.yaml")
    ap.add_argument("--split", default="test")
    ap.add_argument("--conf", type=float, default=0.25)
    ap.add_argument("--out", default="reports")
    ap.add_argument("--max-error-images", type=int, default=40, help="per error category")
    a = ap.parse_args()

    import cv2
    from ultralytics import YOLO

    weights = ROOT / a.weights
    if not weights.exists():
        raise SystemExit(f"ERROR: {weights} not found. Train first.")
    data = ROOT / a.data
    names = yaml.safe_load(data.read_text())["names"]
    out = ROOT / a.out
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    model = YOLO(str(weights))
    m = model.val(data=str(data), split=a.split, plots=True, project=str(out), name="val")

    metrics = {"overall": {
        "precision": float(m.box.mp), "recall": float(m.box.mr),
        "mAP50": float(m.box.map50), "mAP50-95": float(m.box.map),
    }, "per_class": {}}
    for i, c in enumerate(m.box.ap_class_index):
        p, r, ap50, ap = m.box.class_result(i)
        metrics["per_class"][names[int(c)]] = {
            "precision": float(p), "recall": float(r), "mAP50": float(ap50), "mAP50-95": float(ap)}

    # ---- error analysis on real test images ----
    for d in ERROR_DIRS:
        (out / "errors" / d).mkdir(parents=True)
    img_dir = data.parent / "images" / a.split
    lbl_dir = data.parent / "labels" / a.split
    tally, saved = Counter(), Counter()

    for img_path in sorted(img_dir.iterdir()):
        im = cv2.imread(str(img_path))
        if im is None:
            continue
        h, w = im.shape[:2]
        gt = load_gt(lbl_dir / f"{img_path.stem}.txt", w, h)
        res = model.predict(str(img_path), conf=a.conf, verbose=False)[0]
        preds = [(int(b.cls), tuple(map(float, b.xyxy[0])), float(b.conf)) for b in res.boxes]

        used, buckets = set(), []
        for pi, (pc, pbox, pconf) in enumerate(preds):
            best, bi = 0.0, None
            for gi, (gc, gbox) in enumerate(gt):
                if gi in used:
                    continue
                v = iou(pbox, gbox)
                if v > best:
                    best, bi = v, gi
            if best >= IOU_MATCH and gt[bi][0] == pc:
                used.add(bi)
            elif best >= IOU_MATCH:  # right place, wrong class
                used.add(bi)
                buckets.append("misclassified")
            else:
                buckets.append(f"false_positive_{names[pc]}")
        for gi, (gc, _) in enumerate(gt):
            if gi not in used:
                buckets.append(f"missed_{names[gc]}")

        tally.update(buckets)
        for b in set(buckets):
            if saved[b] < a.max_error_images:
                saved[b] += 1
                vis = im.copy()
                for gc, (x1, y1, x2, y2) in gt:  # green = ground truth
                    cv2.rectangle(vis, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
                    cv2.putText(vis, f"GT {names[gc]}", (int(x1), int(y1) - 5),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
                for pc, (x1, y1, x2, y2), pconf in preds:  # red = prediction
                    cv2.rectangle(vis, (int(x1), int(y1)), (int(x2), int(y2)), (0, 0, 255), 2)
                    cv2.putText(vis, f"{names[pc]} {pconf:.2f}", (int(x1), int(y2) + 15),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
                cv2.imwrite(str(out / "errors" / b / img_path.name), vis)

    metrics["error_counts"] = dict(tally)
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2))

    # ---- report ----
    L = [f"# Model performance report\n", f"weights: `{a.weights}`  ",
         f"split: `{a.split}`  conf: {a.conf}  IoU match: {IOU_MATCH}\n",
         "## Overall\n",
         "| metric | value |", "|---|---|"]
    L += [f"| {k} | {v:.4f} |" for k, v in metrics["overall"].items()]
    L += ["\n## Per class\n", "| class | precision | recall | mAP50 | mAP50-95 |", "|---|---|---|---|---|"]
    for n, v in metrics["per_class"].items():
        L.append(f"| {n} | {v['precision']:.4f} | {v['recall']:.4f} | {v['mAP50']:.4f} | {v['mAP50-95']:.4f} |")
    L += ["\n## Error analysis\n",
          f"Annotated examples written to `{a.out}/errors/<category>/` "
          "(green = ground truth, red = prediction).\n",
          "| category | count |", "|---|---|"]
    L += [f"| {k} | {v} |" for k, v in sorted(tally.items(), key=lambda x: -x[1])]
    L += ["\n## Confusion matrix\n", f"`{a.out}/val/confusion_matrix_normalized.png`\n"]
    (out / "report.md").write_text("\n".join(L) + "\n")

    print("\n".join(L))
    print(f"\nwrote {out}/report.md, {out}/metrics.json, {out}/errors/")


if __name__ == "__main__":
    main()
