# NearBites

NearBites is a TanStack Start frontend with a FastAPI backend under `backend/`. Marketplace, ordering, seller training, moderation, and analytics use persistent API data.

## Frontend

```sh
bun install --frozen-lockfile
bun run dev --host 127.0.0.1
```

The frontend opens at `http://127.0.0.1:8080`. Set `VITE_API_BASE_URL` from `.env.example` if the API runs at a different address.

## Backend

See [backend/README.md](backend/README.md) for local setup, migrations, and the implemented API routes. The API docs open at `http://127.0.0.1:8000/api/v1/docs`.

The [FastAPI endpoint reference](BACKEND_API.md) lists the active routes and operating rules. The configured app uses cash on delivery and Brevo email; food recognition and digital payments are disabled.

For a populated local preview, `backend/app/seed_islamabad_samples.py` adds 10 fictional buyers, 10 fictional kitchens, and 20 Islamabad-inspired dishes. They are labeled as samples and cannot receive orders. See [backend/README.md](backend/README.md) for the command.
