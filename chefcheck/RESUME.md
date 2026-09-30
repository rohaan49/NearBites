# Resume training

You left a run in progress. This is how to pick it up.

## TL;DR

```bash
cd /lambda/nfs/finetune/chefcheck
nvidia-smi                                   # confirm a GPU is free
.venv/bin/python train.py --set resume=true model=runs/baseline/weights/last.pt
```

That restores weights, optimizer state, LR schedule and the epoch counter, and continues
to epoch 120. It does not restart the schedule.

## Check first: is it still running?

The box may never have gone down.

```bash
pgrep -af train.py | grep -v 'bash -c'                # empty = not running
tail -1 runs/baseline/results.csv | cut -d, -f1,8,9   # last epoch, mAP50, mAP50-95
```

If it is still running, **do not resume** - you would start a second competing run. Wait
for it, or skip to *When training ends* using the `best.pt` it has already written.

## Where it was left

| | |
|---|---|
| epoch reached | 37 of 120 (stopped with SIGINT) |
| best mAP50 | 0.9016 |
| best mAP50-95 | 0.5614 |
| precision / recall | 0.878 / 0.842 |
| seconds per epoch | ~95 |
| checkpoints | `best.pt` (epoch 35), `last.pt` (epoch 36) - resume restarts at 37 |

Gains had slowed to roughly +0.002 mAP50 per epoch, so `patience: 25` early stopping was
plausible around epoch 55-70. Budget 30-90 minutes to finish, 2h20m worst case.

## If resume fails

Ultralytics refuses to resume when the run directory moved or the checkpoint came from a
different config. Fall back to fine-tuning from the best weights - this loses optimizer
state but keeps everything learned:

```bash
.venv/bin/python train.py --set model=runs/baseline/weights/best.pt epochs=60 name=baseline_cont
```

## When training ends

```bash
.venv/bin/python evaluate.py --weights runs/baseline/weights/best.pt
```

Writes `reports/report.md` (per-class precision / recall / mAP50 / mAP50-95 for `hairnet`
and `glove`), `reports/metrics.json`, the confusion matrix, and `reports/errors/<category>/`
full of annotated failure images (green = ground truth, red = prediction).

Then sanity-check the end-to-end path:

```bash
.venv/bin/python verify.py                                    # business logic self-check, no GPU
.venv/bin/python infer.py --weights runs/baseline/weights/best.pt --image <some_kitchen.jpg>
```

## Nothing needs re-downloading

All of this survives on the filesystem:

| path | size | regenerate with |
|---|---|---|
| `raw/` | ~3.4 GB, 8 datasets | `prepare_dataset.py` (needs `.env` key) |
| `dataset/` | 50,067 images, 25,127 listed | `prepare_dataset.py --skip-download` |
| `.venv/` | ~5 GB | `pip install -r requirements.txt` |
| `runs/baseline/` | checkpoints + results.csv | not regenerable - this IS the training |

`.env` holds the Roboflow API key and is gitignored. If it is gone, get a free key from
roboflow.com -> Settings -> API Key. You do not need it to resume training, only to
rebuild the dataset from scratch.

## Two things to watch

**Shared GPU.** If another job (vLLM, Sieve) is on the card, do not let AutoBatch size the
batch - it reads free memory from PyTorch's own reserved bytes, ignores other processes,
OOMs, and falls back to batch 8. Pass an explicit size:

```bash
.venv/bin/python train.py --set batch=64 ...      # 64 fits alongside a ~20GB neighbour
```

**Divergence.** If you change `lr0`, watch `train/box_loss` and `train/cls_loss` at epochs
3-5 in `runs/baseline/results.csv`. Rising = diverging, kill it. `lr0: 0.01` blew up twice
on this dataset. See the comment block in `train.yaml`.

## If the filesystem is gone

Checkpoints are mirrored to GitHub Releases, so `runs/` is recoverable even if this box is
not. Weights live there rather than in the repo because they are 72.5 MB each and get
rewritten every epoch - committing them would bloat history permanently.

```bash
gh release download checkpoint-epoch36 --repo atifibrahim7/chefcheck --dir runs/baseline/weights
```

That restores `best.pt`, `last.pt` and `results.csv`. Resume works from `last.pt` as above.

List every snapshot: `gh release list --repo atifibrahim7/chefcheck`

### Cutting a new snapshot

Do this before shutting the box down, or any time you want a safe point. Copy first -
uploading `runs/baseline/weights/*.pt` directly can catch a file mid-write:

```bash
E=$(tail -1 runs/baseline/results.csv | cut -d, -f1)
M=$(tail -1 runs/baseline/results.csv | cut -d, -f8)
mkdir -p /tmp/ckpt && cp runs/baseline/weights/*.pt runs/baseline/results.csv /tmp/ckpt/
gh release create "checkpoint-epoch$E" /tmp/ckpt/best.pt /tmp/ckpt/last.pt /tmp/ckpt/results.csv \
  --repo atifibrahim7/chefcheck --title "Training checkpoint - epoch $E (mAP50 $M)" \
  --notes "Mid-training snapshot."
rm -rf /tmp/ckpt
```
