# Session handoff

Everything decided, built and learned in the session that created this repo.
Read `RESUME.md` first if you only want to restart training.

## What this is

A YOLO object detector that finds **hairnets** and **gloves** in food-prep imagery, plus a
verification layer that turns detections into a hygiene pass/fail for a food-vendor
marketplace. Two classes only: `0 = hairnet`, `1 = glove`. No `chef` class - the
verification rule needs the equipment, and a person class would add a third imbalance for
nothing.

Repo: https://github.com/atifibrahim7/chefcheck (private)
Working dir: `/lambda/nfs/finetune/chefcheck`

## Hardware note

The spec said A100. This box is an **H100 80GB**. Same code path; nothing was changed for
it. The GPU is shared - a vLLM server and a `bm/Sieve` job were both on it during this
session, which caused a real failure (see *Gotchas*).

## The data: how the sources were found

The dataset was the hard part, and the answer was not the linked dataset.

Searched first, all dead ends:
- **HuggingFace** - 0 hits for "hairnet"/"hair net". PPE datasets exist but are
  construction-domain (hardhat/vest), wrong environment for kitchens.
- **Open Images V7** - has a boxable `Glove` class, but no hairnet in its 601 classes.
- **Kaggle** - no credentials on the box.
- **Roboflow Universe** - requires an API key. This was the blocker; the user supplied one.

The working discovery route was Roboflow's **`/universe/search?q=`** endpoint (not
`/query/search`, which 404s, and not the universe.roboflow.com web UI, which is
Cloudflare-blocked). 15 queries x 25 results, filtered to projects whose class list
mentions hairnet or glove. That surfaced 8 usable CC BY 4.0 projects, including two that
dwarf the originally-linked one.

**All 8 are declared in `sources.yaml`. No source is hard-coded in Python.**

| source | images | why |
|---|---|---|
| `seniorproject-y8seu/kitchen-hygiene-gear` v5 | 31,371 | backbone. Kitchen scenes, both classes, un-augmented, explicit no-glove/no-hairnet negatives |
| `safety-food-system/safety-food` v3 | 9,897 | food-service domain, both classes |
| `pilasa/hairnet-7rn33` v9 | 7,906 | hairnet volume |
| `danny-joel-5ledp/hygiene-check` v1 | 4,922 | food-prep gear, bouffant caps |
| `glove-detection-3vldq/glove-hand-and-bare-hand` v3 | 1,219 | the hardest confusion: gloved vs bare hand |
| `sabina-jashir/hairnet-detection` v3 | 1,176 | the dataset originally linked by the user |
| `bio-safety-el/food-processing` v1 | 689 | food processing, hair covers |
| `annotation-jvyum/gear-chef` v1 | 243 | chef-specific gear |

Every image is real and downloaded. Nothing synthetic, nothing stubbed.

## Annotation rules, enforced mechanically

`class_map` in `sources.yaml` maps source class names to ours and drops the rest, so the
spec's labelling rules are enforced by config rather than by hand:

- `bouffant_cap`, `Hair_Cover` -> **hairnet** (a bouffant cap is a hairnet)
- `chef-cap`, `helmet`, `hardhat` -> **dropped** (hats are not hairnets)
- `bare_hand`, `Front_Palm`, `Back_Palm`, `no_glove` -> **dropped** (bare hands are not gloves)
- `no_hairnet`, `nohairnet` -> **dropped** (that box sits on a bare head)
- `mask`, `apron`, `shoe_covers`, `rat`, `cockroach`, ... -> **dropped**

Dropping a box does not drop the image: sources with `keep_negatives: true` keep the frame
as a true negative, so the model trains on uncovered heads and bare hands.

## Two non-obvious dataset decisions

**1. Split by source photo, not by image.** Roboflow exports contain augmented copies of
the same photograph. Splitting per-image scatters them across train/val/test and inflates
every metric. `group_key()` strips the `.rf.<hash>` suffix to recover the original photo
and splits on that, 70/20/10 on a fixed seed. `validate_dataset.py` independently fails the
build if a byte-identical image appears in two splits.

**2. Background images are capped at 15%.** `keep_negatives` worked too well - after
dropping out-of-scope boxes, **57.3% of the dataset was images with no boxes at all**.
Ultralytics guidance is ~10%. At 57% the model learns that predicting nothing usually
wins, which costs recall - the expensive direction here, since a missed glove fails a
compliant chef. `max_background_fraction: 0.15` in `sources.yaml` fixes it.

The cap **selects rather than deletes**: `prepare_dataset.py` writes `dataset/train.txt`,
`val.txt`, `test.txt` and `data.yaml` points at those. First attempt deleted the surplus
and ran at ~2 files/sec on NFS - hours for one config change. Now retuning the cap is a
seconds-long rewrite of three text files, and every downloaded image stays on disk.

## Final dataset

50,067 images on disk, **25,127 listed for training**, 49,673 boxes.

| split | listed | positive | background | hairnet boxes | glove boxes |
|---|---|---|---|---|---|
| train | 17,714 | 15,057 | 2,657 (15%) | 19,379 | 15,595 |
| val | 4,878 | 4,146 | 732 (15%) | 5,478 | 4,111 |
| test | 2,535 | 2,155 | 380 (15%) | 2,848 | 2,262 |

Class balance 1.26:1 hairnet:glove - no class weighting needed. Validation: **0 fatal**,
17 warnings (16 sub-pixel boxes inherited from source annotations, plus 6 filename-prefix
group collisions out of ~20,000). No cross-split duplicate images.

Note: `hygiene_check` (4,922) and `sabina_hairnet` (1,176) are downloaded in `raw/` but
**not** in the current dataset - the user stopped the first merge partway to save time, and
the later top-up only added `gear_chef`, `glove_vs_barehand` and `food_processing`.
Adding them is `prepare_dataset.py --skip-download --append --only hygiene_check sabina_hairnet`
then `--lists-only`.

## Training

`yolo11s.pt`, COCO-pretrained, head rebuilt for 2 classes (`Transferred 493/499 items`).
Config is all in `train.yaml`; `train.py --set k=v` overrides it. Each run writes
`run_manifest.json` with the exact config, torch version, GPU and git SHA.

Augmentation is tuned for kitchens, not throughput: `hsv_v: 0.5` for lighting swings,
`degrees: 10` for tilted cameras, `erasing: 0.4` for occlusion, `close_mosaic: 15` so the
last epochs see undistorted frames. `flipud: 0.0` - chefs are not upside down.

**State at handoff: epoch 34/120, mAP50 0.898, mAP50-95 0.554, P 0.873, R 0.842, ~95s/epoch.**
Still improving; `patience: 25` had not come close to firing.

## Gotchas that cost real time

**1. `optimizer: auto` silently discards `lr0` and `momentum`.** Until the optimizer is
named explicitly, those knobs in `train.yaml` do nothing. It also selected `MuSGD`.

**2. `lr0: 0.01` diverges on this dataset.** Two runs (MuSGD and SGD alike) collapsed at
**exactly epoch 3** - the epoch `warmup_epochs: 3.0` finishes ramping lr to `lr0`. Training
loss started rising and mAP50 went 0.72 -> 0.54 -> 0.31. Initially misdiagnosed as an
optimizer problem; it is a learning-rate ceiling. Fixed with **AdamW at lr0 0.001**, which
climbed cleanly: 0.505 -> 0.561 -> 0.520 -> 0.648 -> 0.714 -> 0.752 -> ... -> 0.898.

**Diagnostic that matters: watch `train/box_loss` and `train/cls_loss` in
`runs/baseline/results.csv` at epochs 3-5. Rising = diverging. A validation-metric dip
while losses fall is just warmup.**

**3. AutoBatch is unsafe on a shared GPU.** `batch: 0.80` makes Ultralytics compute free
memory from PyTorch's own reserved bytes, ignoring other processes. With vLLM holding 74GB
of 79GB it reported "78.93G free", tried a huge batch, OOMed three times, and fell back to
**batch 8** - about 10x slower. Always pass `--set batch=64` when sharing the card.

**4. `project: runs` gets nested.** Ultralytics resolved it under its own runs_dir, giving
`runs/detect/runs/baseline`. `train.py` now makes it absolute.

**5. `pkill -f <pattern>` kills your own shell** when the pattern appears in the shell's
own command line. Cost several confusing "STILL RUNNING" readings. Kill by PID.

**6. NFS is slow at small-file operations.** Unlink ~2/sec, so never solve a data problem
by deleting tens of thousands of files. Use list files. Reading 50k labels to test
emptiness was also slow - `stat().st_size` instead of `read_text()`.

## Verification logic and its limit

`verify.py` is deliberately separate from the model so thresholds are retunable and
unit-testable without touching inference. Defaults: `HAIRNET_CONFIDENCE=0.60`,
`GLOVE_CONFIDENCE=0.60`, `REQUIRED_GLOVES=2`, `REQUIRE_HAIRNET=1`, all overridable by env
var. `infer.py` runs detection at half the lowest policy threshold so `verify()` owns the
cutoff and near-misses still appear in `raw_detections` for debugging.

`verify.py` has an assert-based self-check: `python verify.py`. No GPU or weights needed.

**The limitation, documented and not worked around:** object detection cannot tell you a
glove is being *worn*. A glove on the prep bench, a spare box on a shelf, or a hairnet on a
hook all produce detections and v1 counts them. v1 verifies *presence of the hygiene
equipment*, nothing stronger. Closing that gap needs pose/hand keypoints (require a glove
box to overlap a detected hand), segmentation, multiple angles, or temporal consistency
from video.

## What is done and what is not

Done: all 11 deliverables (dataset prep, validation, `data.yaml`, training, evaluation,
inference, verification layer, requirements, README, example output, and the report script).
Dataset built and audited. Training running and healthy. Pushed to a private repo with the
`.env` API key verified absent from every commit.

Not done:
- **Training has not finished** - see `RESUME.md`.
- **`evaluate.py` has never been run end to end.** It is chained to fire after training,
  but no per-class metrics or error-analysis images exist yet. This is the one script whose
  real-data behaviour is still unproven.
- `hygiene_check` and `sabina_hairnet` are downloaded but not in the dataset.
- No test-set numbers, so nothing here should be called production-ready yet.

## Environment

venv at `.venv/`. torch 2.14.0+cu126, ultralytics 8.4.163, roboflow 1.5.1, numpy 2.2.6,
cv2 5.0.0. `requirements.txt` is pinned to exactly these. Do not use the system python -
its torch is compiled against numpy 1.x and warns on every import.
