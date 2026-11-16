"""Evaluate the integrated 0.40 hairnet/glove screen on labeled challenge photos.

CSV columns: path,scenario,acceptable. The acceptable column is 1 only for a
real person correctly wearing both items in usable conditions. This measures
the object-only screen, not human review or the two-frame challenge.
"""

import argparse
import csv
from collections import defaultdict
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.capture_quality import inspect_capture  # noqa: E402


def run(manifest: Path, weights: Path, output: Path | None) -> None:
    from ultralytics import YOLO

    rows = list(csv.DictReader(manifest.open(newline="", encoding="utf-8-sig")))
    if not rows or not {"path", "scenario", "acceptable"}.issubset(rows[0]):
        raise SystemExit("Manifest needs path,scenario,acceptable and at least one row")
    model = YOLO(str(weights))
    if set(model.names.values()) != {"hairnet", "glove"}:
        raise SystemExit("The model must have hairnet and glove classes")
    results = []
    totals = defaultdict(lambda: {"images": 0, "false_accept": 0, "false_reject": 0, "quality_reject": 0})
    for row in rows:
        path = Path(row["path"])
        if not path.is_absolute():
            path = manifest.parent / path
        if row["acceptable"] not in {"0", "1"}:
            raise SystemExit(f"Expected acceptable=0 or 1 for {path}")
        if not path.is_file():
            raise SystemExit(f"Missing photo: {path}")
        try:
            image, quality_issue = inspect_capture(path.read_bytes())
        except ValueError as exc:
            quality_issue = str(exc)
            image = None
        labels = []
        if image is not None:
            prediction = model.predict(image, conf=0.40, verbose=False)[0]
            labels = [model.names[int(cls)] for cls in prediction.boxes.cls]
        model_accepts = {"hairnet", "glove"}.issubset(labels)
        accepted = quality_issue is None and model_accepts
        expected = row["acceptable"] == "1"
        group = totals[row["scenario"]]
        group["images"] += 1
        group["false_accept"] += int(accepted and not expected)
        group["false_reject"] += int(not accepted and expected)
        group["quality_reject"] += int(bool(quality_issue))
        results.append({**row, "model_only_accepts": int(model_accepts), "quality_gated_accepts": int(accepted), "quality_issue": quality_issue or "", "detections": ",".join(labels)})
    for scenario, counts in sorted(totals.items()):
        print(f"{scenario}: {counts}")
    if output:
        with output.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(results[0]))
            writer.writeheader()
            writer.writerows(results)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--weights", type=Path, default=ROOT / "backend/models/chefcam-gloves-hairnet.pt")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    run(args.manifest, args.weights, args.output)
