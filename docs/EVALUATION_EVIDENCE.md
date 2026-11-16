# NearBites technical evaluation evidence

This document separates implemented behavior, recorded model results, and proposed work. Use the live app and source files as evidence during the supervisor review.

## What the system does

1. A buyer browses kitchens and approved dishes, saves an address, places an order, and can review or report a delivered order.
2. A seller creates a kitchen, completes quizzes and proof checks, submits dishes, manages portions, and fulfils orders.
3. An admin reviews kitchens, proof, listings, and hygiene reports. The review queue now shows priority reasons, waiting time, and reviewer assignment.

The React/TanStack Start frontend calls a FastAPI REST API. The API checks the signed-in user's role, reads and writes records through SQLAlchemy, and stores them in SQLite locally or PostgreSQL when configured. Alembic migrations change the schema. Authentication uses hashed passwords and signed JWT access tokens. The current ordering flow uses cash on delivery; paid revenue is only counted after cash is recorded.

### Explain the technology internally

- **React/TanStack Start:** route components hold screen state and call typed API helpers. When data changes, React renders the affected screen again. TanStack's file routes map URLs such as `/dashboard` and `/admin` to these components.
- **FastAPI/Pydantic:** a request reaches a route; Pydantic validates the payload; dependencies supply the signed-in user and a database session; the route checks ownership and status transitions before committing changes.
- **SQLAlchemy/Alembic:** SQLAlchemy maps Python models to tables and manages queries and transactions. Alembic versioned migrations add columns and tables without replacing the user's existing database.
- **JWT:** after login, the server signs a short-lived access token. On later requests it verifies the signature and expiry and loads the user from the database before applying role checks.
- **YOLO11:** its backbone extracts image features at several scales, its neck combines those features, and its detection head predicts object boxes and class scores. Ultralytics documents the [YOLO architecture](https://docs.ultralytics.com/guides/yolo-architecture). NearBites loads the trained checkpoint for inference, filters detections by confidence, and stores the evidence with the submitted frame.

## ChefCam: what was trained and how it is used

- **Task:** object detection for two labels, `hairnet` and `glove`. This does not recognize every possible hygiene issue.
- **Base model:** pretrained `yolo11s.pt`, fine-tuned with Ultralytics at 640-pixel image size. Training settings are in [`../chefcheck/train.yaml`](../chefcheck/train.yaml).
- **Data sources:** eight public Roboflow projects are declared in [`../chefcheck/sources.yaml`](../chefcheck/sources.yaml), but the [`../chefcheck/HANDOFF.md`](../chefcheck/HANDOFF.md) notes that `hygiene_check` and `sabina_hairnet` were downloaded but not merged into the recorded training run. The preparation script maps source labels to `hairnet` and `glove`, removes exact duplicates, groups augmented copies of one source photo, and splits by source photo.
- **Recorded image counts:** the handoff records 50,067 prepared images on disk. After limiting background-only images, its split lists contain **17,714 train**, **4,878 validation**, and **2,535 test** images: 25,127 total. Thus 25,127 is not the training count. These are specific historical run records, not counts independently re-derived from the raw images or split lists, which are absent from this repository.
- **To independently verify the recorded counts and sources:** restore the original `chefcheck/dataset/` and run `validate_dataset.py dataset`. Count the nonempty lines in `train.txt`, `val.txt`, and `test.txt`, retain `stats.json`, and compare the source files with the handoff. Rebuilding from all eight declared sources would be a different dataset from the recorded run unless the same six-source selection is used.
- **Training status:** the imported run stopped at epoch 37 of a planned 120. The best checkpoint was reported at epoch 35. Do not call this a completed 120-epoch run.
- **Recorded held-out test results:** precision 0.8874, recall 0.8581, mAP@0.5 0.9027, and mAP@0.5:0.95 0.5572, evaluated at detection confidence 0.25 and matching IoU 0.5. Hairnet recall was 0.9275; glove recall was 0.7887. See [`../chefcheck/reports/report.md`](../chefcheck/reports/report.md).
- **Live use:** [`../backend/app/chefcam.py`](../backend/app/chefcam.py) uses `chefcam-gloves-hairnet.pt` at confidence 0.40. The updated capture flow asks for two browser-camera frames and a prompted movement. The first frame must show both labels, the second must show a glove, and both must pass conservative image-quality gates before the paired image goes to admin review. The admin must inspect whether a real person performs the movement. This is not authenticated camera or liveness proof. The reported test metrics at 0.25 are not a direct measurement of the 0.40 live decision rule.

YOLO predicts boxes and confidence values for visible objects. A box confidence is not a calibrated probability that the seller meets all food safety requirements. Two browser frames also cannot establish hygiene over time or rule out a staged doll or injected camera source. NearBites therefore uses them as evidence during onboarding, with retraining requests and buyer hygiene reports available later. The shadow audit counts where a proposed high-confidence rule agrees or disagrees with human proof decisions; it does not auto-approve. The challenge test protocol and its limits are in [`CHEFCAM_ADVERSARIAL_TEST.md`](CHEFCAM_ADVERSARIAL_TEST.md).

## Analytics methods and limits

### Review topic demonstration

Seller Insights includes a five-topic text classifier for taste, packaging, delivery, portion/value, and hygiene mentions. It uses TF-IDF word and word-pair features with five independent logistic classifiers, so one review can receive several topics. The bundled corpus now contains 219 fictional labeled training examples, including 88 Roman Urdu examples, and 54 separate fictional evaluation examples, including 24 Roman Urdu examples. The seller view shows per-topic precision, recall, and F1 from the combined and Roman Urdu synthetic holdouts. Predictions on stored reviews are descriptive only; a hygiene topic is not a verified safety incident and does not create an admin report.

This demonstrates a reproducible text classification method, not validated performance on real customer language. The examples include short English and Roman Urdu phrases. Real reviews, especially native-script Urdu, different Roman Urdu spellings, sarcasm, and mixed opinions, need separately labeled evaluation before the model is relied on operationally.

| View | Method | Data limit |
|---|---|---|
| Seller busy times | Count delivered orders by Pakistan local weekday/hour | Sparse history yields weak patterns |
| Seller best dishes and dish pairs | Sum delivered item quantities; count distinct dish pairs in the same delivered order | Pairs display after at least two orders |
| Seller retention | Follow first delivered-order cohorts and count second/third orders within 30 days | Only cohorts old enough for a full 30-day window enter the denominator |
| Seller planning estimate | Holt-Winters additive level, trend and seven-day seasonality compared with the eight-week same-weekday average | After at least 56 complete days and 20 delivered orders, compare both on the most recent 14 complete days using MAE; select the lower-error method. Sparse histories use the weekday average. Demo holdout error does not validate real demand. |
| Buyer kitchen rating | (sum of kitchen ratings + 5 × cohort-wide mean) / (review count + 5) | Demo and live reviews have separate priors. Unreviewed kitchens show New. The five-review prior is a transparent prototype choice, not calibrated evidence of trust. |
| Seller margin | Item sale price minus seller-entered portion cost, multiplied by quantity | Excludes labor, packaging, fees, and other expenses |
| Buyer reorder | Find dishes ordered on the current weekday on at least three distinct days in 12 weeks | No prompt when there is no repeat pattern or the dish is unavailable |
| Vendor cancellation history | Cancelled/rejected orders divided by finished orders over 90 days | Hidden below five finished orders; no on-time claim without a promised delivery time |
| Admin area gap | Delivered orders by buyer delivery area versus available verified kitchens by kitchen area | Area spellings must be normalized; area-level counts do not prove unmet demand |
| Admin review queue | Safety category, open reports, and elapsed time determine transparent priority | Priority is a workflow rule, not a validated safety probability |

Demo accounts and activity are labeled separately from live records in admin. Present seeded activity as fictional demonstration data.

The buyer feed now uses delivered-order item associations, the buyer's own dish and kitchen history, recent demand, live portion counts, and the buyer's default-address delivery radius. Its ranking number is an internal ordering aid, not a calibrated probability. Seller insights show currently available portions and the most common local order hour for dishes with at least five delivered portions of history. The seller chooses when and how much to list; without historical stock snapshots this does not estimate sell-through or food waste avoided. Fictional order history demonstrates the flow and does not validate predictive performance.

## Comparison with an incumbent

Foodpanda Pakistan already has a [Homechef program](https://www.foodpanda.pk/contents/homechefs) with local delivery, seller training, onboarding, and home-cooked meals. NearBites should **not** claim that simply serving home chefs, offering nearby orders, or training sellers is unique. NearBites' current prototype focus is an inspectable hygiene proof flow that stores model detections alongside human decisions, plus buyer, seller, and admin analytics tied to its own order and review records. That is a description of this implementation, not a claim that Foodpanda lacks similar internal tools.

## Questions to answer in a defense

- **How does YOLO work here?** It predicts hairnet and glove bounding boxes in two camera frames. The app checks for both classes initially and a glove in the challenge frame, then sends a paired image and detections for human review of the requested movement.
- **What does recall mean?** Of the labeled objects in the test split, recall is the fraction the detector found. Glove recall of 0.7887 signals missed gloves are a material limitation.
- **Why not automatically approve high-confidence frames?** Confidence does not establish all hygiene conditions. We first compare the proposed rule with human decisions and inspect disagreements.
- **How will admins cope with volume?** The shared queue prioritizes safety and overdue cases, assigns reviewers, and measures wait time. An earned seller track record informs routine review priority; safety decisions remain reviewed by a person.
- **What is still unproven?** The handoff records exact split counts, but the raw images and split manifests are not stored in this repository for independent recounting. The recorded run stopped early, two onboarding frames do not prove continuing hygiene, and the new business analytics need enough real activity before their patterns are reliable. Live food listings require a fresh camera submission and manual listing review, but this does not prove who cooked the food; the daily review load still needs measurement.
