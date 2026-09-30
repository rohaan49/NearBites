# Chef hygiene verification — YOLO hairnet + glove detector

Detects two classes in food-preparation imagery and turns them into a pass/fail
hygiene verdict.

```
0 = hairnet
1 = glove
```

There is no `chef` class: the verification rule only needs the equipment, and a person
class would add a third imbalance for nothing.

## Data — real, not generated

Every image comes from a live public dataset. Nothing here is synthetic, stubbed, or
placeholder. Sources are declared in [`sources.yaml`](sources.yaml) and downloaded by
`prepare_dataset.py`; all eight are Roboflow Universe projects under **CC BY 4.0**.

| source | images | why it is in the mix |
|---|---|---|
| `seniorproject-y8seu/kitchen-hygiene-gear` v5 | 31,371 | backbone: kitchen scenes, both classes, un-augmented, with explicit no-glove / no-hairnet negatives |
| `safety-food-system/safety-food` v3 | 9,897 | food-service domain, both classes |
| `pilasa/hairnet-7rn33` v9 | 7,906 | hairnet volume and variety |
| `danny-joel-5ledp/hygiene-check` v1 | 4,922 | food-prep gear, glove-heavy, bouffant caps |
| `sabina-jashir/hairnet-detection` v3 | 1,176 | the dataset you linked |
| `glove-detection-3vldq/glove-hand-and-bare-hand` v3 | 1,219 | the single hardest confusion: gloved hand vs bare hand |
| `bio-safety-el/food-processing` v1 | 689 | food processing, hair covers |
| `annotation-jvyum/gear-chef` v1 | 243 | chef-specific gear |

Between them these cover what the spec asks for — varied skin tones, glove and hairnet
colours, kitchen lighting, front/side/angled views, camera distances, occlusion,
multiple people per frame, hands leaving the frame, and all four positive/negative
combinations (hairnet+gloves, hairnet only, gloves only, neither).

### Annotation rules enforced in `sources.yaml`

The merge maps source class names onto ours and **drops** everything else, which is how
the spec's labelling rules get enforced mechanically rather than by hand:

- `bouffant_cap`, `Hair_Cover` → **hairnet** (a bouffant cap is a hairnet)
- `chef-cap`, `helmet`, `hardhat` → **dropped** — hats and caps are not hairnets
- `bare_hand`, `Front_Palm`, `Back_Palm`, `no_glove` → **dropped** — bare hands are not gloves
- `no_hairnet`, `nohairnet` → **dropped** — that box sits on a bare head
- `mask`, `apron`, `shoe_covers`, `rat`, `cockroach`, … → **dropped**

Dropping a box does not drop the image. Sources with `keep_negatives: true` keep those
frames as real negatives, so the model sees uncovered heads and bare hands during
training instead of only ever seeing the positive class.

### Split integrity

Roboflow exports contain augmented copies of the same photograph. Splitting per-image
would scatter those copies across train/val/test and inflate the metrics. `prepare_dataset.py`
instead strips the `.rf.<hash>` suffix to recover the source photo, and splits
**by source photo**, 70/20/10, keyed on a fixed seed. Exact byte-duplicates across the
eight overlapping datasets are removed first. `validate_dataset.py` fails the build if
an identical image still turns up in two splits.

## Setup

```bash
cd chefcheck
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

echo 'ROBOFLOW_API_KEY=your_key_here' > .env   # free key: roboflow.com -> Settings -> API Key
```

Verify the GPU before anything else:

```bash
nvidia-smi
.venv/bin/python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

`train.py` exits if CUDA is unavailable rather than silently falling back to CPU.

## Run it

```bash
# 1. download all eight sources and merge into dataset/  (~60k images)
.venv/bin/python prepare_dataset.py

# 2. audit before training: missing/corrupt files, out-of-range coords, zero-area
#    boxes, split leakage, class imbalance, box-size distribution. Non-zero exit = stop.
.venv/bin/python validate_dataset.py dataset

# 3. train (config in train.yaml; batch size auto-sized to GPU memory)
.venv/bin/python train.py

# 4. evaluate on the held-out test split + write the error analysis
.venv/bin/python evaluate.py --weights runs/baseline/weights/best.pt

# 5. inference
.venv/bin/python infer.py --weights runs/baseline/weights/best.pt --image some_kitchen.jpg
.venv/bin/python infer.py --weights runs/baseline/weights/best.pt --serve   # POST /verify
```

Smoke-test the business logic on its own, no GPU or weights needed:

```bash
.venv/bin/python verify.py
```

## Training configuration

All of it lives in [`train.yaml`](train.yaml). Baseline is `yolo11s.pt` — a small
pretrained checkpoint, per the spec, so there is a real number to beat before reaching
for `yolo11m`/`l`. Transfer learning from COCO weights, 640px, `batch: 0.80` (Ultralytics
sizes the batch to use 80% of GPU memory), 120 epochs with `patience: 25` early stopping,
validation every epoch, `best.pt` kept automatically, `seed: 0` + `deterministic: true`.

Augmentation is tuned for kitchens rather than for throughput: `hsv_v: 0.5` for the
lighting swings, `degrees: 10` for tilted cameras, `erasing: 0.4` for partial occlusion,
`close_mosaic: 15` so the final epochs train on undistorted frames. `flipud` is off —
chefs are not upside down.

Override without editing the file:

```bash
.venv/bin/python train.py --set epochs=30 model=yolo11n.pt batch=64
```

Each run writes `run_manifest.json` next to its weights with the exact config, torch
version, GPU and git SHA.

## Verification logic

Detection is not the verdict. [`verify.py`](verify.py) is a separate layer so thresholds
can be retuned and unit-tested without touching the model.

```python
HAIRNET_CONFIDENCE = 0.60
GLOVE_CONFIDENCE   = 0.60
REQUIRED_GLOVES    = 2
REQUIRE_HAIRNET    = True
```

A normal single-chef image passes when a hairnet clears its threshold **and** at least
`REQUIRED_GLOVES` gloves clear theirs. Every value is overridable per deployment:

```bash
HAIRNET_CONFIDENCE=0.5 GLOVE_CONFIDENCE=0.7 REQUIRED_GLOVES=1 \
  .venv/bin/python infer.py --image x.jpg
```

The detector runs at half the lowest policy threshold, so `verify()` owns the cutoff and
near-miss detections still show up in `raw_detections` for debugging.

### Example output

Pass:

```json
{
  "verified": true,
  "hairnet": { "detected": true, "confidence": 0.94 },
  "gloves":  { "detected": true, "count": 2, "confidences": [0.91, 0.88] },
  "reasons": [],
  "policy": { "hairnet_confidence": 0.6, "glove_confidence": 0.6, "required_gloves": 2, "require_hairnet": true }
}
```

Fail:

```json
{
  "verified": false,
  "hairnet": { "detected": true, "confidence": 0.91 },
  "gloves":  { "detected": false, "count": 0, "confidences": [] },
  "reasons": ["found 0 glove(s), need 2 at confidence >= 0.6"]
}
```

## Known limitation — presence, not correct use

**Object detection cannot tell you a glove is being worn.** A glove on the prep bench,
a spare box of gloves on a shelf, or a hairnet hanging on a hook all produce a `glove` /
`hairnet` detection, and this v1 will count them. The same applies in reverse: it cannot
tell a correctly worn hairnet from one pushed back off the hairline.

v1 therefore verifies **presence of the hygiene equipment**, and nothing stronger. Treat
a `verified: true` as "the kit is in the frame", not "the chef is compliant".

Closes that gap in a later version:

- pose estimation / hand keypoints, to require a glove box to overlap a detected hand
- head keypoints, to require a hairnet to sit on a detected head
- instance segmentation instead of boxes, for a real hand/glove overlap test
- several verification images from different angles
- temporal consistency across video frames rather than one still

## Evaluation output

`evaluate.py` writes to `reports/`:

- `report.md` — overall and per-class precision / recall / mAP50 / mAP50-95, split out for `hairnet` and `glove` separately
- `metrics.json` — the same numbers, machine-readable
- `val/confusion_matrix_normalized.png` and the standard PR/F1 curves
- `errors/<category>/*.jpg` — actual annotated test images, green = ground truth, red = prediction:
  - `missed_hairnet`, `missed_glove` (false negatives)
  - `false_positive_hairnet`, `false_positive_glove`
  - `misclassified` (right box, wrong class — hairnet called glove or vice versa)

Matching uses IoU ≥ 0.5 against ground truth.

## Files

| file | role |
|---|---|
| `sources.yaml` | dataset sources + class mapping. The only place sources are declared. |
| `prepare_dataset.py` | download, remap, dedupe, leak-safe split, emit `dataset/data.yaml` |
| `validate_dataset.py` | pre-training audit; non-zero exit on anything fatal |
| `train.yaml` / `train.py` | training config and runner |
| `evaluate.py` | test-split metrics + error analysis |
| `verify.py` | business logic, thresholds, self-check |
| `infer.py` | CLI and FastAPI interface |
| `requirements.txt` | pinned dependencies |
