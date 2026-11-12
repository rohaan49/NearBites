# NearBites project guidance

- Before changing code, inspect `git status --short`. The local checkout has important uncommitted work; preserve it and inspect diffs before any Git operation that could replace files.
- Use the running code as the source of truth. Read `docs/EVALUATION_EVIDENCE.md` for verified implementation and model claims, `docs/DEMO_DATA_GUIDE.md` for demo accounts/data, and `docs/REVIEW_SCALING.md` for the admin review design.
- Always label seeded/sample orders, accounts, kitchens, reviews, and dashboard values as fictional demo activity. Do not describe the supervisor's separate spreadsheet metrics as app features unless their implementation is confirmed.
- ChefCam's integrated detector is based on YOLO11s, labels are `0=hairnet` and `1=glove`, the app screens at confidence 0.40 and sends evidence for admin review. Do not claim automatic approval or call mAP "accuracy". Consult `docs/EVALUATION_EVIDENCE.md` for reported test results and dataset count caveats.
- Never print, copy into chat, or commit `backend/.env`, credentials, API keys, or local account data. The local SQLite database and configuration are not GitHub backups.
- Keep changes within the NearBites repository unless the user asks to create an external deliverable. Do not discard the working tree or push changes without an explicit request.
