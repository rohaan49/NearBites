# ChefCheck upstream source

Imported from https://github.com/atifibrahim7/chefcheck/tree/main

Upstream commit: `5e85e4b12880f2ed92dce842c4fb6b61d5e4d640`

The source repository contains the training, dataset-preparation, verification, inference, and evaluation code plus its committed evaluation report. Its `main` branch excludes `*.pt` weights and the downloaded dataset. The `checkpoint-epoch36` release supplies `best.pt`, `last.pt`, and `results.csv`; those release artifacts are included under `runs/baseline/`. The `best.pt` checkpoint is byte-identical to the NearBites integration model at `backend/models/chefcam-gloves-hairnet.pt`.

No separate code license file was present in the upstream repository at the imported commit. Dataset source and attribution details are retained in `sources.yaml`.
