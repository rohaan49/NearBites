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
- **Data sources:** eight public Roboflow projects are declared in [`../chefcheck/sources.yaml`](../chefcheck/sources.yaml). The preparation script maps source labels to the two target labels, removes exact duplicates, groups augmented copies of one source photo, and makes a planned 70/20/10 train/validation/test split.
- **Image counts:** the imported training notes state 50,067 prepared images and 25,127 images listed across the splits after capping background-only frames. These are historical run notes, not counts re-derived from a checked-in dataset. The raw images, final split manifests, and exact training split count are absent from this repository; do not present 25,127 as the number of training images.
- **To close the count gap:** restore the original `chefcheck/dataset/` and run `validate_dataset.py dataset`. Count the nonempty lines in `train.txt`, `val.txt`, and `test.txt`, retain `stats.json`, and record the source export versions and licenses alongside the resulting manifests. This cannot be done from the model weights alone.
- **Training status:** the imported run stopped at epoch 37 of a planned 120. The best checkpoint was reported at epoch 35. Do not call this a completed 120-epoch run.
- **Recorded held-out test results:** precision 0.8874, recall 0.8581, mAP@0.5 0.9027, and mAP@0.5:0.95 0.5572, evaluated at detection confidence 0.25 and matching IoU 0.5. Hairnet recall was 0.9275; glove recall was 0.7887. See [`../chefcheck/reports/report.md`](../chefcheck/reports/report.md).
- **Live use:** [`../backend/app/chefcam.py`](../backend/app/chefcam.py) uses `chefcam-gloves-hairnet.pt` at confidence 0.40. It accepts a frame for admin review only when both labels appear. The admin must inspect the actual image before approving the proof. The reported test metrics at 0.25 are not a direct measurement of the 0.40 live decision rule.

YOLO predicts boxes and confidence values for visible objects. A box confidence is not a calibrated probability that the seller meets all food safety requirements. A single photo also cannot show hygiene over time. NearBites therefore uses it as evidence during onboarding, with retraining requests and buyer hygiene reports available later. The new shadow audit counts where a proposed high-confidence rule agrees or disagrees with human proof decisions; it does not auto-approve.

## Analytics methods and limits

### Review topic demonstration

Seller Insights now includes a five-topic text classifier for taste, packaging, delivery, portion/value, and hygiene mentions. It uses TF-IDF word and word-pair features with five independent logistic classifiers, so one review can receive several topics. The bundled corpus contains 131 fictional labeled training examples and 30 separate fictional evaluation examples. The seller view shows per-topic precision, recall, and F1 from that synthetic holdout. Predictions on actual stored reviews are descriptive only; a hygiene topic is not a verified safety incident and does not create an admin report.

This demonstrates a reproducible text classification method, not validated performance on real customer language. The examples are short English phrases. Real reviews, especially Urdu, Roman Urdu, spelling variation, sarcasm, and mixed opinions, need separately labeled evaluation before the model is relied on operationally.

| View | Method | Data limit |
|---|---|---|
| Seller busy times | Count delivered orders by Pakistan local weekday/hour | Sparse history yields weak patterns |
| Seller best dishes and dish pairs | Sum delivered item quantities; count distinct dish pairs in the same delivered order | Pairs display after at least two orders |
| Seller retention | Follow first delivered-order cohorts and count second/third orders within 30 days | Only cohorts old enough for a full 30-day window enter the denominator |
| Seller planning estimate | Average same-weekday delivered orders over eight prior weeks | Shown after 20 delivered orders and 28 days of history; it is a simple baseline |
| Seller margin | Item sale price minus seller-entered portion cost, multiplied by quantity | Excludes labor, packaging, fees, and other expenses |
| Buyer reorder | Find dishes ordered on the current weekday on at least three distinct days in 12 weeks | No prompt when there is no repeat pattern or the dish is unavailable |
| Vendor cancellation history | Cancelled/rejected orders divided by finished orders over 90 days | Hidden below five finished orders; no on-time claim without a promised delivery time |
| Admin area gap | Delivered orders by buyer delivery area versus available verified kitchens by kitchen area | Area spellings must be normalized; area-level counts do not prove unmet demand |
| Admin review queue | Safety category, open reports, and elapsed time determine transparent priority | Priority is a workflow rule, not a validated safety probability |

Demo accounts and activity are labeled separately from live records in admin. Present seeded activity as fictional demonstration data.

## Comparison with an incumbent

Foodpanda Pakistan already has a [Homechef program](https://www.foodpanda.pk/contents/homechefs) with local delivery, seller training, onboarding, and home-cooked meals. NearBites should **not** claim that simply serving home chefs, offering nearby orders, or training sellers is unique. NearBites' current prototype focus is an inspectable hygiene proof flow that stores model detections alongside human decisions, plus buyer, seller, and admin analytics tied to its own order and review records. That is a description of this implementation, not a claim that Foodpanda lacks similar internal tools.

## Questions to answer in a defense

- **How does YOLO work here?** It predicts hairnet and glove bounding boxes in a camera frame. The app checks for both classes and sends the saved frame and detections for human review.
- **What does recall mean?** Of the labeled objects in the test split, recall is the fraction the detector found. Glove recall of 0.7887 signals missed gloves are a material limitation.
- **Why not automatically approve high-confidence frames?** Confidence does not establish all hygiene conditions. We first compare the proposed rule with human decisions and inspect disagreements.
- **How will admins cope with volume?** The shared queue prioritizes safety and overdue cases, assigns reviewers, and measures wait time. An earned seller track record informs routine review priority; safety decisions remain reviewed by a person.
- **What is still unproven?** The training images and exact final split counts are not stored in this repository, the recorded run stopped early, a single onboarding frame does not prove continuing hygiene, and the new business analytics need enough real activity before their patterns are reliable.
