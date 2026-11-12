# NearBites

NearBites is a TanStack Start frontend with a FastAPI backend under `backend/`. Marketplace, ordering, seller training, moderation, and analytics use persistent API data.

One email and password can be used for both buying and selling. After signing in, choose **Continue as buyer** or **Continue as seller**. A buyer who chooses seller can create a kitchen and complete training on the same account. Existing sellers can switch to buying without a second account. The chosen workspace is saved to the account and can be changed from the header or Account page. Admin permission remains restricted and the ordinary login sends authorized admins to the admin area.

For the model provenance, analytics definitions, limitations, and supervisor defense notes, see [Technical evaluation evidence](docs/EVALUATION_EVIDENCE.md).
The [review scaling policy](docs/REVIEW_SCALING.md) explains how priority, seller track records, and ChefCam shadow checks work before any automatic safety decision is considered.
The [supervisor update](docs/SUPERVISOR_UPDATE.md) gives a short demonstration sequence and lists the evidence still needed.

## Frontend

On Windows, run `START-WINDOWS.bat` from the project folder. It starts the API and the built frontend preview, waits until both respond, then opens `http://127.0.0.1:8080`. The first launch can take longer because it builds the frontend. Keep the API and website terminal windows open while using the app.

For frontend development with hot reload, use the commands below. This dev-server route may behave differently from the Windows preview launcher.

```sh
bun install --frozen-lockfile
bun run dev --host 127.0.0.1
```

The frontend opens at `http://127.0.0.1:8080`. Set `VITE_API_BASE_URL` from `.env.example` if the API runs at a different address.

## Backend

See [backend/README.md](backend/README.md) for local setup, migrations, and the implemented API routes. The API docs open at `http://127.0.0.1:8000/api/v1/docs`.

The [FastAPI endpoint reference](BACKEND_API.md) lists the active routes and operating rules. The configured app uses cash on delivery and Brevo email; food recognition and digital payments are disabled.

For a populated local preview, `backend/app/seed_islamabad_samples.py` adds 10 fictional buyers, 10 fictional kitchens, and 20 Islamabad-inspired dishes. The expanded `backend/app/seed_demo_activity.py` adds more than 1,000 fictional orders and examples across buyer, seller, training, review, and admin analytics. Sample kitchens cannot receive orders. See the [demo data guide](docs/DEMO_DATA_GUIDE.md) and [backend setup](backend/README.md).
