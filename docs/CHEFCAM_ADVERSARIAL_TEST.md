# ChefCam challenge test protocol

The integrated detector looks for `hairnet` and `glove` at confidence 0.40 in the first camera frame and a `glove` in the second. Image quality gates reject very dark, overexposed, or unclear frames. An admin compares the initial frame and a prompted movement. Neither object detection nor two browser frames proves liveness or complete food safety.

## Collect real test photos

Use at least several different phones and backgrounds. Label each image **before** looking at predictions. Include a correctly dressed person, a bare hand, hairnet only, glove only, a doll wearing both, gear on a table, a printed photo or screen showing a dressed person, dim light, glare, blur, and partly hidden gear. Ask permission before keeping identifiable people's images. Keep test photos outside Git.

Create a local CSV with `path,scenario,acceptable`. Mark `acceptable=1` only for a real person actually wearing both items in a usable photo. For example:

```csv
path,scenario,acceptable
photos/person-clear.jpg,person-clear,1
photos/doll-with-gear.jpg,doll-with-gear,0
photos/person-dim.jpg,person-dim,0
```

From the repository root, run with the backend environment's Python:

```powershell
backend\.venv\Scripts\python.exe chefcheck\evaluate_scenarios.py local-challenge-photos.csv --output local-challenge-results.csv
```

The script prints per-scenario false accepts, false rejects, and quality rejections for the **object-only screen**. Separately, submit two-frame challenges in the app and record whether the admin correctly rejects staged or replayed setups. Report the number of photos and devices tested. Do not generalize from a few examples to "works in all lighting." The raw photos and result CSV remain local unless participants consent to sharing.

### Initial illustrative spot check, 17 November 2026

Two user-supplied still images were screened at the integrated 0.40 threshold. The doll wearing visible gear produced a hairnet detection but no glove detection, so the object-only rule did not accept it. The dim kitchen image produced no matching detections and the new quality gate asked for better lighting. These are **2 examples, 0 actual phone-camera sessions, and 0 two-frame challenge tests**. They do not establish a doll rejection rate, low-light recall, or liveness performance; the images are not committed to the repository.

## Food photo limit

Non-demo orderable listings require an in-app camera capture with a short-lived code. The seller is instructed to write the code on paper beside the cooked food. An admin compares the code and food in the image before publishing; a new daily photo sends the listing back for review. Exact image reuse is rejected and poor-quality frames require retakes. A newly captured photo is also required before adding more portions or resuming a paused dish. This increases evidence quality, but browser camera input and a handwritten code cannot establish that the seller cooked the pictured meal or prevent every staged image. The checkout blocks covered dishes whose last capture is over 24 hours old. Existing live listings become covered by the policy when the migration runs; their sellers must submit a fresh photo before new orders. Sample previews and the local checkout-test kitchen are exempt. This creates daily review work, so the review queue and staffing burden must be measured before scaling.
