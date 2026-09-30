# NearBites FastAPI endpoints

This is the implementation reference for the NearBites frontend and FastAPI backend. All paths below use `/api/v1`. The generated request/response schema is available at `http://127.0.0.1:8000/api/v1/docs` while the local API is running.

**Configured product scope:** cash on delivery, Brevo transactional email, local filesystem uploads, and no food recognition. JazzCash, Easypaisa, card payments, and image AI are absent from the UI and API until real provider credentials and operating workflows exist. Optional demo seed commands add clearly labeled sample profiles and menus plus fictional training, orders, reviews, reports, and analytics for presentations. A separate local seed creates approved, orderable test dishes.

## Authentication and accounts

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create an account, hash its password, and send a Brevo verification code. |
| POST | `/auth/login` | Start a buyer, seller, or admin session. |
| POST | `/auth/refresh` | Rotate a refresh session and issue new tokens. |
| POST | `/auth/logout` | Revoke a refresh session. |
| POST | `/auth/email/verify` | Confirm a six-digit code sent to the account email. |
| POST | `/auth/email/resend` | Resend a verification code, with a cooldown. |
| POST | `/auth/password/forgot` | Email a password reset code without revealing whether an account exists. |
| POST | `/auth/password/reset` | Validate the code, change the password, and revoke refresh sessions. |
| GET | `/users/me` | Read the authenticated account and roles. |
| PATCH | `/users/me` | Change the display name. |
| PATCH | `/users/me/preferences` | Save buyer, seller, or both view preference. It does not grant seller or admin rights. |
| POST | `/auth/admin-invite/accept` | Accept an emailed admin invitation and set credentials. |

Buyer/seller signup cannot assign an admin role. Seller listings require a verified email, approved kitchen, completed training, and a map location. Passwords are stored only as Argon2 hashes. The frontend stores session credentials locally; old mock account and proof records are removed from browser storage on launch.

## Marketplace and location

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/vendors` | Public approved kitchens and labeled sample previews; supports `q`, `area`, `lat`, `lng`, `radius_km`, and `limit`. |
| GET | `/vendors/{vendor_id}` | Public kitchen profile and rating from submitted reviews. |
| GET | `/vendors/{vendor_id}/dishes` | Approved menu or labeled sample preview. |
| GET | `/vendors/{vendor_id}/reviews` | Real customer reviews. |
| GET | `/dishes` | Search approved dishes and labeled samples; supports `q`, `area`, `vendor_id`, coordinates, radius, and limit. |
| GET | `/dishes/{dish_id}` | Current listing price and stock. |
| GET | `/users/me/recommendations` | Rank available dishes from real delivered sales and the buyer's kitchen history. |

Distance is calculated server-side using the saved kitchen coordinates and a buyer supplied location. Public responses contain distance and area, never exact kitchen coordinates. Kitchens without map locations are not shown in the public catalog.

Sample preview dishes have `is_sample: true` and sample kitchen status. Their names, sector-center locations, dishes, prices, and illustrative photos are preview content; the people and kitchens are fictional. The cart disables sample dishes, and the API rejects new orders from sample kitchens. The optional demo activity seed inserts historical fictional orders directly into the local database for presentation; it does not enable checkout for sample dishes. A separate local command can enable password login for the first fictional buyer; no demo password is stored in Git.

Run `uv run --env-file .env python -m app.seed_order_test_listing` in `backend/` to create three approved, orderable **Order flow test** dishes in a local test kitchen. These use the real checkout endpoints but do not represent prepared food or delivery. They are marked `is_demo: true` and excluded from live analytics. The command refuses non-local frontend origins.

## Seller onboarding, listings, and files

| Method | Path | Purpose |
| --- | --- | --- |
| POST, GET, PATCH | `/seller/kitchen` | Create, read, and update the owner's kitchen and location. |
| GET, POST | `/seller/listings` | List owned listings or submit a new listing for review. |
| PATCH | `/seller/listings/{listing_id}` | Edit listing content; material changes return to moderation. |
| PATCH | `/seller/listings/{listing_id}/availability` | Change stock or pause/resume an approved listing. |
| POST | `/uploads/images` | Validate and save a JPEG, PNG, or WebP dish photo on local disk. |
| GET | `/media/{file_id}` | Serve a public listing photo. Private training proof files use a separate authorized route. |
| GET | `/seller/dashboard` | Real order counts, paid earnings, rating, daily series, and top delivered dishes. |
| GET | `/seller/insights` | Actual delivered order history, busy hours, and repeat-buyer count. |
| GET | `/seller/review-insights` | Real review totals, average rating, and recent comments. |

Uploads have file type and size checks. A listing photo must be an upload owned by that seller. Private proof files are only available to their seller and admins. Uploaded files live under `backend/uploads/` locally; that directory is ignored by Git.

## Training and proof approval

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/training/modules` | Five practical lessons with completion instructions and quiz questions; correct answers stay server-side. The Food Safety lesson links to WHO guidance. |
| GET | `/seller/training` | Per-module quiz attempt, proof and review state, kitchen status, and seller eligibility. |
| POST | `/seller/training/{module_id}/quiz-attempts` | Grade answers on the server and record the result. |
| POST | `/seller/training/allergens/acknowledgements` | After passing the Allergens quiz, confirm understanding. No photo or admin proof review is required. Retraining requires a new quiz and confirmation. |
| POST | `/seller/training/{module_id}/proofs` | Upload real photo/MP4 evidence after passing a quiz for Packaging, Portion Sizing, and Order Fulfilment. These lessons can also capture a JPEG from the live browser camera, preview or retake it, then submit it here. |
| POST | `/seller/training/food-safety/camera-check` | Analyze a live browser camera frame with the bundled YOLO model. When both `hairnet` and `glove` are detected, store the frame as a private proof pending admin review. |
| GET | `/seller/training/proofs` | View the seller's submissions and rejection reasons. |
| GET | `/training/proofs/{proof_id}/file` | Download proof with owner/admin authorization. |
| GET | `/admin/training/proofs` | Review queue. |
| GET | `/admin/kitchens/{kitchen_id}/review` | Admin-only kitchen dossier with seller identity, verification, current training progress, quiz scores and attempt history, quiz questions and correct answers, and every submitted proof with status, rejection reason, and media type. Seller-selected quiz answers were not stored. |
| POST | `/admin/training/proofs/{proof_id}/decision` | Approve/reject evidence, record reviewer and reason, and recompute seller eligibility. Food Safety approval requires a recorded camera check. |
| POST | `/admin/vendors/{vendor_id}/retraining` | Require fresh quiz attempts and proofs before listings go public again. |
| GET | `/admin/analytics/training` | Seller and proof funnel counts from the database. |

The five lessons are real curriculum content loaded into the database by `python -m app.bootstrap_content`. Approval is a human admin action; the browser cannot mark its own modules complete.

## Addresses, orders, reviews, and COD

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/users/me/addresses` | List or create private delivery addresses with map coordinates. |
| PATCH, DELETE | `/users/me/addresses/{address_id}` | Edit or remove an address not referenced by an order. |
| POST | `/orders/quote` | Check one-kitchen stock, delivery radius, and calculate price/fee on the server. |
| POST | `/orders` | Create a cash-on-delivery order and decrement stock atomically. Requires `Idempotency-Key`. |
| GET | `/orders` | Buyer order history with actual statuses. |
| GET | `/orders/{order_id}` | Buyer, involved seller, or admin detail. |
| GET | `/seller/orders` | Seller's incoming and previous orders. |
| PATCH | `/seller/orders/{order_id}/status` | Accept, reject, cook, or mark ready using allowed transitions. |
| GET | `/admin/orders` | Admin order queue. |
| PATCH | `/admin/orders/{order_id}/status` | Record dispatch, delivery, or cancellation. |
| POST | `/admin/orders/{order_id}/cash-received` | Confirm exact COD cash amount after delivery. Paid revenue counts only after this action. |
| POST | `/orders/{order_id}/review` | Review a delivered order once. |
| POST | `/orders/{order_id}/hygiene-reports` | File one safety report linked to an actual prepared order. |

Order states: `placed → accepted → cooking → ready → out_for_delivery → delivered`. Seller rejection is allowed from `placed`; admin cancellation follows configured transitions. Stock is restored only when an order is rejected or cancelled before cooking. A checkout contains dishes from one kitchen, and the frontend asks before replacing a cart from another kitchen. Cash remains `unpaid` until an admin confirms receipt.

## Admin operations and analytics

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/overview` | Live delivered orders, paid revenue, eligible kitchens, queue sizes, and overdue reviews. |
| GET | `/admin/kitchens` | Kitchen approval queue and status. |
| POST | `/admin/kitchens/{kitchen_id}/decision` | Approve/reject a kitchen with an audit event. |
| GET | `/admin/vendors/{vendor_id}` | Kitchen owner, orders, training, and hygiene detail. |
| GET | `/admin/buyers` | Account and order summary. |
| GET | `/admin/listings` | Listing moderation queue. |
| POST | `/admin/listings/{listing_id}/decision` | Approve/reject a listing with reviewer and reason. |
| GET | `/admin/hygiene/flags` | Open reports tied to orders. |
| PATCH | `/admin/hygiene/flags/{flag_id}` | Resolve or dismiss with reason and audit trail. |
| GET | `/admin/hygiene/watchlist` | Kitchens over the saved open-report threshold. |
| POST, DELETE | `/admin/vendors/{vendor_id}/suspension` | Suspend or reinstate a kitchen. Suspension hides it from the marketplace immediately. |
| GET, PATCH | `/admin/settings` | Save hygiene threshold, review SLA, and email notification preference. |
| GET | `/admin/users` | List admin accounts. |
| POST | `/admin/users/invitations` | Send a Brevo admin invitation. |
| DELETE | `/admin/users/{user_id}` | Revoke admin role; the last admin is protected. |
| GET | `/admin/analytics/leaderboard` | Top kitchens by paid revenue and dishes by delivered portions. |
| GET | `/admin/analytics/demand` | Actual order counts by day, area, weekday, and hour. |
| GET | `/admin/analytics/revenue` | Confirmed COD revenue by day and area. |

`GET /admin/overview` and the four `/admin/analytics/*` routes default to live records only. Pass `?demo=true` to view seeded sample records and figures separately. Demo evidence images say “DEMO EVIDENCE” and are not camera or model verification.

Admin decisions, cash confirmation, retraining, invitations, and settings changes are persisted. Training and listing moderation require a server-side admin role. Settings affect the watchlist threshold, overdue review count, and Brevo order notifications.

The Food Safety camera check uses `backend/models/chefcam-gloves-hairnet.pt`, copied from the supplied `chefcam/best.pt`. It uses the model's `hairnet` and `glove` classes at a 0.4 confidence threshold. Detection indicates those objects appear in one captured frame; it does not prove correct use or overall hygiene, so the image and model scores remain subject to admin review. Failed checks do not create a proof or mark training complete.

## Local configuration

1. Copy `backend/.env.example` to `backend/.env`; set a random `JWT_SECRET`.
2. Set `BREVO_API_KEY` and a Brevo verified `BREVO_SENDER_EMAIL`. Account creation, verification, password reset, and admin invitations use Brevo's real transactional API. The app does not invent or display a successful email when Brevo is unavailable.
3. Run `uv sync`, `uv run --env-file .env alembic upgrade head`, and `uv run --env-file .env python -m app.bootstrap_content` from `backend/`.
4. Create the first admin from a local terminal using `ADMIN_EMAIL` and `ADMIN_PASSWORD` with `python -m app.bootstrap_admin`. There is no public admin signup.
5. Start the backend on port 8000 and frontend on port 8080; see the two READMEs for commands. Set the frontend `VITE_API_BASE_URL` for any nonlocal deployment.

SQLite is the default local persistent database. PostgreSQL is supported through `DATABASE_URL=postgresql+psycopg://...`. Production deployment must provide durable storage for both the database and `UPLOAD_DIR`, HTTPS origins, verified Brevo sender, and backups.

## Operational limits

- COD delivery and cash confirmation are recorded by admin staff; no courier or payment provider is integrated.
- Food recognition is disabled at the user's request.
- Market data and analytics start empty and grow only from real accounts, listings, orders, and reviews.
- Browser cart items are a convenience cache. Every price, stock count, delivery range, order total, training approval, and moderation decision is checked by FastAPI.
