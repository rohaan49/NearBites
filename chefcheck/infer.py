#!/usr/bin/env python3
"""Inference interface: image in, compliance verdict out.

    python infer.py --weights runs/baseline/weights/best.pt --image kitchen.jpg
    python infer.py --weights runs/baseline/weights/best.pt --serve   # POST /verify
"""
import argparse, json, os, sys
from pathlib import Path

from verify import Policy, verify

ROOT = Path(__file__).resolve().parent
_model = None


def get_model(weights):
    global _model
    if _model is None:
        from ultralytics import YOLO
        w = Path(weights)
        if not w.is_absolute():
            w = ROOT / w
        if not w.exists():
            sys.exit(f"ERROR: weights not found at {w}. Train first; there is no fallback model.")
        _model = YOLO(str(w))
    return _model


def predict(source, weights, policy=None, conf=None, imgsz=640):
    """source: path, URL, numpy array or PIL image."""
    p = policy or Policy.from_env()
    # Detect below the policy thresholds so verify() -- not the detector -- owns the cutoff.
    floor = conf if conf is not None else min(p.hairnet_confidence, p.glove_confidence) / 2
    res = get_model(weights).predict(source, conf=floor, imgsz=imgsz, verbose=False)[0]
    dets = [(int(b.cls), float(b.conf)) for b in res.boxes]
    out = verify(dets, p)
    out["raw_detections"] = [
        {"class": res.names[int(b.cls)], "confidence": round(float(b.conf), 4),
         "xyxy": [round(v, 1) for v in map(float, b.xyxy[0])]}
        for b in res.boxes
    ]
    return out


def serve(weights, host, port):
    from fastapi import FastAPI, File, UploadFile
    import numpy as np, cv2, uvicorn

    app = FastAPI(title="Chef hygiene verification")
    get_model(weights)  # fail at boot, not on the first request

    @app.get("/health")
    def health():
        return {"ok": True, "weights": str(weights), "policy": Policy.from_env().__dict__}

    @app.post("/verify")
    async def verify_endpoint(file: UploadFile = File(...)):
        buf = np.frombuffer(await file.read(), np.uint8)
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if img is None:
            return {"error": "could not decode image"}
        return predict(img, weights)

    uvicorn.run(app, host=host, port=port)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", default="runs/baseline/weights/best.pt")
    ap.add_argument("--image")
    ap.add_argument("--serve", action="store_true")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--conf", type=float)
    a = ap.parse_args()

    if a.serve:
        return serve(a.weights, a.host, a.port)
    if not a.image:
        ap.error("pass --image or --serve")
    print(json.dumps(predict(a.image, a.weights, conf=a.conf), indent=2))


if __name__ == "__main__":
    main()
