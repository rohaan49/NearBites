# NearBites FastAPI backend

The API serves accounts, kitchens, listings, training, orders, reviews, moderation, and analytics. The route reference is [BACKEND_API.md](../BACKEND_API.md). Demo data is opt-in through the seed commands below and remains clearly labeled.

## Local setup

Requires Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```sh
cd backend
cp .env.example .env
# Set JWT_SECRET to a unique random secret (for example: openssl rand -hex 32)
# Set BREVO_API_KEY and BREVO_SENDER_EMAIL to your Brevo API key and verified sender.
uv sync
uv run --env-file .env alembic upgrade head
uv run --env-file .env python -m app.bootstrap_content
uv run --env-file .env uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/api/v1/docs`. The default database is a persistent local SQLite file at `backend/nearbites.db`. For PostgreSQL set `DATABASE_URL=postgresql+psycopg://user:password@host:5432/nearbites` and apply migrations before starting the API.

Create the first admin from a local terminal:

```sh
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='unique-password-at-least-10-characters' uv run --env-file .env python -m app.bootstrap_admin
```

Later admins can be invited through the admin UI and Brevo email. Never put the API key, JWT secret, admin password, database, or uploaded files into Git.

## Environment

| Variable | Use |
| --- | --- |
| `DATABASE_URL` | SQLite locally or PostgreSQL through psycopg. |
| `JWT_SECRET` | Required random signing secret, at least 32 characters. |
| `FRONTEND_ORIGIN` | Exact browser origin permitted by CORS and used in invitation links. |
| `API_PUBLIC_BASE_URL` | Public `/api/v1` URL used in listing image links. |
| `BREVO_API_KEY` | Brevo transactional email API key. |
| `BREVO_SENDER_EMAIL` | Sender address verified in Brevo. |
| `UPLOAD_DIR` | Durable local folder for listing photos and private proofs; defaults to `uploads/`. |
| `DELIVERY_FEE_PKR` | Current fixed delivery charge. |
| `MAX_DELIVERY_KM` | Maximum distance from kitchen to buyer's address. |

Account registration and password reset require working Brevo credentials; they do not fake delivery. In the configured app, buyers pay cash on delivery. An admin records cash receipt after delivery, which is when the order counts as paid revenue.

The Food Safety training module uses the bundled `models/chefcam-gloves-hairnet.pt` YOLO model from the supplied ChefCam project. `uv sync` installs Ultralytics and its inference dependencies. A seller passes the quiz, opens the browser camera on localhost or HTTPS, and submits one frame to `POST /api/v1/seller/training/food-safety/camera-check`. The API reports hairnet and glove detections; when both are present it stores the frame privately for admin review. A model match never auto-approves training.

Packaging, Allergens, Portion Sizing, and Order Fulfilment also show a live browser camera after the quiz. The seller captures and reviews a still image, then sends the JPEG to `POST /api/v1/seller/training/{module_id}/proofs` for admin review. They can retake the photo or upload an existing photo or MP4 instead.

The seller training screen teaches five practical topics in short lessons, then shows each quiz and proof step when the seller reaches it. All quiz answers must be correct; proof is reviewed by an admin. Rejected proof can be resubmitted, and the kitchen must also receive admin approval before listings can go public. The Food Safety guidance is based on the [WHO Five Keys to Safer Food](https://www.who.int/activities/promoting-safe-food-handling/five-key-to-safer-food).

## Frontend

From the project root, install with `bun install --frozen-lockfile` and run `bun run dev --host 127.0.0.1`. The frontend reads `VITE_API_BASE_URL` and defaults to `http://127.0.0.1:8000/api/v1`.

The browser keeps only a convenience cart and session/view cache. The API checks stock, price, eligibility, delivery distance, ownership, and order status before writing anything. Existing Lovable mock account/order/proof browser records are cleared when the new frontend starts.

## Islamabad preview content

For a local preview with Islamabad-inspired names and home menus, run:

```sh
uv run --env-file .env python -m app.seed_islamabad_samples
```

This creates 10 fictional buyer profiles, 10 fictional seller profiles and kitchens, and 20 sample dishes. It can be run again without duplicating them. The app labels sample content, and sample dishes cannot be ordered.

For a fuller local presentation, run:

```sh
uv run --env-file .env python -m app.seed_demo_activity
```

This adds 50 quiz attempts, 50 visibly watermarked proof illustrations, five pending demo listings, 20 demo orders with several statuses, buyer reviews, and hygiene reports. The command is repeatable. The admin workspace starts in **Demo data** view and can switch to **Live data**; live overview and analytics exclude sample activity. Sample evidence is an illustration and never a genuine camera/model verification. Do not use demo records as proof of actual sales, payment, hygiene, or seller training. Remove the sample records before using a live marketplace with real customers.

For local checkout testing, create the separate orderable kitchen and three approved dishes:

```sh
uv run --env-file .env python -m app.seed_order_test_listing
```

These listings use the normal cart, quote, and cash-on-delivery order endpoints. They are visibly labeled **Order flow test**. No meal is prepared or delivered by this seed. The command only runs with a localhost frontend origin and can be repeated without duplicates. Activity from this kitchen stays in demo analytics.

To log in as the first fictional buyer and show the seeded buyer orders, set a local password (do not commit it):

```sh
DEMO_BUYER_PASSWORD='your-local-demo-password' uv run --env-file .env python -m app.enable_demo_buyer
```

Then sign in with `sample-buyer-1@demo.nearbites.invalid` and that password. This only enables the existing local sample account; public registration still requires a normal email address.
