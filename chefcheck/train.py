#!/usr/bin/env python3
"""Train the hairnet/glove detector.

    python train.py                        # uses train.yaml as-is
    python train.py --set epochs=30 model=yolo11n.pt
"""
import argparse, json, subprocess, sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="train.yaml")
    ap.add_argument("--set", nargs="*", default=[], help="key=value overrides")
    a = ap.parse_args()

    cfg = yaml.safe_load((ROOT / a.config).read_text())
    for kv in a.set:
        k, v = kv.split("=", 1)
        cfg[k] = yaml.safe_load(v)

    data = ROOT / cfg["data"]
    if not data.exists():
        sys.exit(f"ERROR: {data} not found. Run prepare_dataset.py first.")
    cfg["data"] = str(data)
    # Absolute, or Ultralytics nests it under its own runs_dir -> runs/detect/runs/baseline.
    cfg["project"] = str(ROOT / cfg["project"])

    import torch
    from ultralytics import YOLO

    if not torch.cuda.is_available():
        sys.exit("ERROR: no CUDA device. This pipeline expects a GPU; refusing to fake it on CPU.")
    print(f"GPU: {torch.cuda.get_device_name(0)}  torch {torch.__version__}  cuda {torch.version.cuda}")

    results = YOLO(cfg.pop("model")).train(**cfg)
    out = Path(results.save_dir)

    # Freeze exactly what produced this run, next to the weights.
    (out / "run_manifest.json").write_text(json.dumps({
        "config": cfg,
        "torch": torch.__version__,
        "gpu": torch.cuda.get_device_name(0),
        "git": subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True,
                              cwd=ROOT).stdout.strip() or None,
    }, indent=2, default=str))
    print(f"\nbest weights: {out / 'weights' / 'best.pt'}")


if __name__ == "__main__":
    main()
