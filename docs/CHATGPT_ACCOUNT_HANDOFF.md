# NearBites handoff to another ChatGPT account

Prepared 12 November 2026.

## Continue on this same laptop

The code and working files are on this laptop at:

`E:\downloads\NearBites-Windows-Local\NearBites`

They are not stored inside the old ChatGPT account. After signing in to the new ChatGPT account in the desktop app, create/open a local project and attach this folder. Grant the app access when Windows asks. Then start a new Codex chat in that project.

Use this as the first message in the new account:

> Continue my NearBites FYP from this local project. First read `AGENTS.md`, `docs/CHATGPT_ACCOUNT_HANDOFF.md`, `docs/EVALUATION_EVIDENCE.md`, and `docs/DEMO_DATA_GUIDE.md`, then inspect `git status --short`. Preserve all local changes and do not run reset, clean, checkout, or pull operations that could overwrite them. Treat demo data as fictional and never expose `backend/.env` or credentials. The corrected evaluation PowerPoint is in `docs/NearBites_Revised_Technical_Evaluation_Corrected.pptx`.

OpenAI's project guide describes attaching local folders so chats can access a codebase, and recommends keeping durable project context in `AGENTS.md` or checked-in documentation. [Projects and chats](https://learn.chatgpt.com/docs/projects)

## Current project state

- Git remote: `https://github.com/rohaan49/NearBites.git`, branch `main`.
- The reviewed project changes and this handoff are being committed to the existing `main` branch and pushed to GitHub. After future edits, check `git status --short`; local changes are not shared with another computer until they are committed and pushed.
- Current functional work includes the unified buyer/seller account flow, expanded buyer/seller/admin analytics, fictional seeded demo activity, a priority-based admin review queue, seller track-record context, and review-topic demonstration. Inspect the code and `docs/EVALUATION_EVIDENCE.md` before relying on any claim.
- The corrected presentation is stored at `docs/NearBites_Revised_Technical_Evaluation_Corrected.pptx`. It retains the original slide layout, corrects ChefCam facts, and uses graphs calculated from the local app demo database.
- ChefCheck code, checkpoint, and saved results are in `chefcheck/`. The raw downloaded dataset and merged image/split folders are ignored and are not present in GitHub. See `chefcheck/sources.yaml`, `chefcheck/HANDOFF.md`, and `docs/EVALUATION_EVIDENCE.md` for provenance and count limits.
- `backend/.env` contains private service/JWT settings. `backend/nearbites.db` is a local SQLite database and is not the GitHub source of truth. Never add `.env` to Git. If working on a different computer, use a securely backed up database only if the existing local demo state is needed; otherwise follow the demo seeding instructions.

## If moving to another computer

1. Clone or pull the latest `main` branch from the existing `rohaan49/NearBites` repository.
2. On the other computer, clone that repository and open the cloned NearBites folder as a local project in ChatGPT.
3. Set up that computer's `.env` locally from the documented template or secret manager; never commit or upload the real `.env`.
4. Recreate demo data using `docs/DEMO_DATA_GUIDE.md`, or securely transfer a backup of `backend/nearbites.db` if the exact existing local history is required.
5. Start the app with `START-WINDOWS.bat` and keep the backend and frontend console windows open while using it.

## Important evidence boundaries

- App analytics on seeded accounts are demonstrations, not real marketplace results.
- The supervisor-provided Excel demo dataset is separate from the app's local SQLite demo data.
- ChefCam is a two-class visible-equipment screen; a human admin still decides the proof. Use the recorded detector precision/recall/mAP, not a made-up training accuracy or an unmeasured hygiene pass/fail accuracy.
- The slide claims about competitor uniqueness and the delivery distance are intentionally left for a later revision; do not silently present them as newly verified facts.
