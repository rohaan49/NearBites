# NearBites supervisor update

## Response to the technical evaluation

**Analytics:** Admin analytics now include a shared review workload, wait times, area demand versus available kitchens, seller trajectories, buyer signup cohorts, and a descriptive verification outcome monitor. Sellers see real order timing, retention, dish pairings, review words, a synthetic-trained review-topic classifier with a synthetic holdout summary, optional estimated margins, and a simple demand planning baseline. Buyers see a kitchen's order completion history, current training verification status, and personal reorder prompts when there is enough history. Fictional activity remains labeled as demo data.

**Admin scalability:** Open kitchen, listing, proof, and hygiene cases appear in one priority queue with reasons, waiting time, and reviewer assignment. Hygiene and overdue cases rise in priority. Seller track records provide context for routine listing review. ChefCam high-confidence approval is evaluated in shadow mode against human decisions; it does not approve a seller automatically. See [Review scaling](REVIEW_SCALING.md).

**Model and dataset evidence:** The integrated model uses a YOLO11 small checkpoint for hairnet and glove detection. The checked-in report records precision 0.8874, recall 0.8581, mAP@0.5 0.9027, and mAP@0.5:0.95 0.5572 at confidence 0.25. The live app uses confidence 0.40 and human review. The imported training run stopped at epoch 37 of a planned 120. Source declarations and preparation scripts exist, but raw images and final split manifests are not present in this repository, so exact final training counts cannot yet be rechecked. See [Technical evaluation evidence](EVALUATION_EVIDENCE.md).

**Differentiation:** Foodpanda Pakistan already supports home chefs, local delivery, and training. The project comparison now focuses on the NearBites prototype's inspectable hygiene evidence workflow and transparent role-specific analytics rather than claiming the home-chef concept itself is new.

## Demonstration order

1. Admin: open the review queue, show why one hygiene case outranks a routine listing, assign a reviewer, and show review workload analytics.
2. Seller: use the fictional demo seller account or your own seller account to open the kitchen dashboard and insights; show busy times, dish pairings, retention, and the optional cost input used for estimated margin. The sample account's dishes remain non-orderable.
3. Buyer: open a vendor profile to show order completion history and training verification; show a reorder suggestion only if the signed-in buyer has a repeat pattern.
4. ChefCam: submit a real camera frame, inspect the saved detections and photo as admin, then show the shadow audit and its limitations.

## Remaining evidence gates

- Rebuild or provide the original dataset to produce exact train/validation/test manifest counts and check source licenses.
- Validate the complete live ChefCam approval rule on independently labeled photos at its actual threshold before enabling any automatic safety approval.
- Collect enough real activity to evaluate forecast accuracy, review keyword usefulness, seller tier thresholds, and whether verification outcomes differ over time.
- Define a promised delivery time before reporting an on-time delivery rate.
