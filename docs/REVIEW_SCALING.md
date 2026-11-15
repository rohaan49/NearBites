# Review workload and safe automation

## Implemented now

The admin workspace combines pending kitchens, seller proofs, dish listings, and buyer hygiene reports into one queue. Each item shows its age, the reason for its priority, and an assigned admin. Hygiene reports come first; repeated open reports and missed review targets raise priority. Assignments and decisions are recorded. Overdue items stay in review and become more visible.
Pending kitchen and training proof work is now one application queue item per kitchen. The application shows email and location readiness plus every active lesson. The admin opens that case to inspect the latest proof and approve or reject each lesson's evidence. Proofs from active kitchens remain separate retraining cases. Final kitchen approval is blocked by the API until email, location, and all active lessons are complete; the reviewer's decision remains explicit.
New listings must provide a photo and a meaningful description; duplicate active or pending dish names in the same kitchen are rejected before they reach a reviewer. ChefCam already asks for a new frame when either required object is missing. These checks reduce avoidable queue entries without making a safety decision.
When a seller edits a listing and sends it back for review, a new review-request timestamp starts that case's waiting clock. The original listing creation date remains available separately.

Seller track records are recomputed from the last 90 days: delivered orders, cancellations or rejections, reviews, and open or resolved hygiene reports. The **established** label requires current training verification, an active kitchen, at least 20 delivered orders, five reviews, an average rating of at least 4.5, at most 5% cancelled or rejected orders, and no open or resolved hygiene reports. It is internal review context, not a public safety certification.

ChefCam has a shadow audit of the proposed rule “both hairnet and glove detections at least 0.85.” Admin analytics show how many recorded proofs would meet that rule and how many of those a human rejected. The rule does not approve evidence.

The app records the date a seller successfully completes training verification. It keeps earlier dates when retraining is required, but buyer screens show a date only while the seller is currently verified. Existing legacy approvals without a completion date display only “Training verified.”

## Decisions before automation

1. Build a representative labeled set of acceptable and unacceptable hygiene photos, including difficult lighting, uncovered heads, bare hands, and misleading backgrounds. Compare the proposed rule with independent human labels, not only past admin decisions.
2. Measure the false-accept rate of the **whole** photo approval rule at the exact deployment threshold. The existing object-detection mAP and confidence values do not establish that rate.
3. Audit seller tier outcomes over time: listing rejections, hygiene reports per delivered order, and reversal rates. Revise thresholds if the tier misses important cases.
4. If routine listing auto-publication is enabled later, start with a limited class of established sellers, keep an adjustable random spot-check sample and a quick rollback, and review the observed error rate before expansion.
5. Keep buyer hygiene reports, severe safety concerns, and disputed cases under human review. Review targets trigger escalation or reassignment, never automatic clearance.

This sequence reduces routine work only when measured outcomes support it. Review throughput, wait time, and disagreements are visible in the admin dashboard so the team can tell whether the process scales.
