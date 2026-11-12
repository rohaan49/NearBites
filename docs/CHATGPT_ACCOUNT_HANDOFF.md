# NearBites handoff

Prepared 12 November 2026.

## Start on this laptop

The project folder is `E:\downloads\NearBites-Windows-Local\NearBites`. Sign in to your new ChatGPT/Codex account, open this folder as a local project, then start a new Codex chat and paste:

> Continue my NearBites final year project from this local folder. Read `AGENTS.md`, `docs/CHATGPT_ACCOUNT_HANDOFF.md`, `docs/EVALUATION_EVIDENCE.md`, and `docs/DEMO_DATA_GUIDE.md`. Then check `git status --short` and preserve any local changes. The GitHub repository is `https://github.com/rohaan49/NearBites.git`, branch `main`. Never reveal or commit `backend/.env`, passwords, or other secrets. Demo analytics are fictional; check the evidence notes before making claims. The corrected evaluation PowerPoint is `docs/NearBites_Revised_Technical_Evaluation_Corrected.pptx`.

## GitHub status

- The latest work was committed and pushed to `main` as `4aec04a` (`Complete NearBites analytics and account handoff`).
- The project folder on this laptop was clean after that push. New local edits must be committed and pushed before they appear on another computer.
- The repository includes the application code, project documentation, ChefCheck code/checkpoint/results that were already tracked, and the corrected presentation.
- Private `.env` settings, the local SQLite database, uploads, login credentials, and raw downloaded ChefCheck dataset are not included. Configure `.env` privately on each computer. To recreate demo activity, follow `docs/DEMO_DATA_GUIDE.md`; local database history does not sync through GitHub.

## Work with a partner

Do not share your ChatGPT/Codex password. Your partner can use her own ChatGPT account on her laptop; GitHub collaboration is separate from ChatGPT Plus. Invite her GitHub username as a collaborator to `rohaan49/NearBites`.

For each change, one person works on a separate Git branch, pushes it to GitHub, and opens a pull request. After reviewing and merging it into `main`, the other person pulls the latest `main` before starting more work. This is how code changes move between laptops; they do not appear on the other laptop until pulled. Avoid both people editing and pushing directly to `main` at the same time.

On a new computer, clone `https://github.com/rohaan49/NearBites.git`, open the cloned `NearBites` folder in Codex, set up its private `.env`, and follow `docs/DEMO_DATA_GUIDE.md` if demo data is needed.

## Project evidence notes

- App analytics on seeded accounts are demonstrations, not real marketplace results. The supervisor-provided Excel demo dataset is separate from the app's local SQLite demo data.
- ChefCam is a two-class visible-equipment screen; a human admin still decides whether proof is accepted. Use recorded detector precision/recall/mAP, not an invented training accuracy or hygiene pass/fail accuracy.
- The raw downloaded dataset and merged image/split folders are not in GitHub. See `chefcheck/sources.yaml`, `chefcheck/HANDOFF.md`, and `docs/EVALUATION_EVIDENCE.md` for provenance and count limitations.
- Competitor uniqueness and delivery-distance claims in the corrected presentation still need later verification; do not present them as newly verified facts.
