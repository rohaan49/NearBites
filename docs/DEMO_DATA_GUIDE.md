# Fictional demo data walkthrough

The local demo is already seeded on the presentation laptop. For a fresh local database, first apply migrations and run `app.bootstrap_content`, then run `app.seed_islamabad_samples` and `app.seed_demo_activity` from `backend` with `.env` loaded. The activity seeder also creates the separate local checkout-test kitchen. It is repeatable and requires a localhost `FRONTEND_ORIGIN`.

Every account using `@demo.nearbites.invalid`, its orders, evidence, reviews, and analytics are fictional. The admin page starts in **Demo data** view. Switch to **Live data** for real accounts. Sample kitchens and their preview menus cannot take orders. The **Order Test Kitchen** has three explicitly marked dishes for local cart and cash-on-delivery flow practice; no food is actually prepared or delivered.

| Screen | What the demo supplies | What to show |
| --- | --- | --- |
| Buyer home and vendor profiles | Ten sample buyers plus six extra fictional buyers, all with delivered orders. Every sample buyer has a nearby default demo address, four weeks of repeat orders for the three local test dishes, reorder prompts, and recommendations. | Sign into any sample buyer. Open the home page and order history; recommendations use the nearby demo address. Sample kitchen menus remain preview-only. |
| Cart and checkout | Three clearly marked orderable local test dishes and a nearby saved address for each sample buyer. | Add a test dish, choose the demo address, and place a fictional cash-on-delivery test order. No meal is prepared or delivered. |
| Seller dashboard and insights | Every one of the ten sample kitchens has at least two preview dishes, dated delivered-order history, dish pairs, reviews, review topics, retention, optional cost data, a validated demo forecast comparison, and surplus planning cards. | Sign into any sample seller, open Dashboard and Insights, then expand the technical details only if needed. The dishes are still non-orderable previews. |
| Review topics | The classifier uses 219 fictional labeled training examples, including 88 Roman Urdu examples, and 54 separate fictional evaluation examples, including 24 Roman Urdu examples. Every sample seller has Roman Urdu review text in their fictional order history. | Open seller Insights → Review themes. Expand the method section to see combined and Roman Urdu synthetic holdout metrics. These do not measure accuracy on real customer reviews. |
| Seller training | Quiz attempts, allergen acknowledgements, and illustrated proofs. Some sample sellers are verified; others intentionally show pending or rejected evidence. | Open training and the admin proof queue to explain the different stages. Illustrated proof and detection scores are fictional. |
| Admin review queue | Pending kitchen cases, listing reviews for all ten sample kitchens, training proof states, hygiene reports, reasons, wait times, and reviewer assignments. | Show one application checklist, proof review, and why hygiene cases have priority. |
| Admin analytics | Buyer cohorts, seller growth histories, demand areas, training results, review workload, verification views, and fictional moderation decisions. | Switch through the Demo data analytics tabs. |
| ChefCam shadow chart | Simulated hairnet/glove scores on illustrated proofs, including a fictional high-confidence/human-rejection disagreement. | Explain why a real, independently labeled photo set is needed before automatic approval. |

All demo orders and reviews are fictional. Seller previews remain non-orderable so the demo activity does not imply real food is being sold. Buyer checkout uses the separate Order Test Kitchen. The demo activity seeder is repeatable and adds missing records without duplicating its fixed-ID examples.

The local presentation database now lets you sign into sample sellers 1–10 using the existing sample seller 1 password, and sample buyers 1–10 plus the six `demo-first-buyer` accounts using the existing sample buyer 1 password. The `app.enable_all_sample_logins` command copies the existing demo password hashes only on localhost; it does not print or store plaintext passwords in the repository. Run it after enabling sample seller 1 and sample buyer 1 on a fresh laptop.

The example accounts are `sample-seller-1@demo.nearbites.invalid` and `sample-buyer-1@demo.nearbites.invalid`. Set their local passwords through `app.enable_demo_seller` and `app.enable_demo_buyer`; passwords are kept in the local database as hashes and are never stored in this repository. Use an existing admin account for the admin pages.

The data illustrates how the screens behave. It is not evidence of genuine food orders, payment, hygiene, verification accuracy, forecast accuracy, or model quality.

## Weekly meal plans

After applying migrations, run `uv run --env-file .env python -m app.seed_meal_plan_demo` from the backend folder to add the fictional Workweek Lunch Plan. Open [Meal plans](http://127.0.0.1:8080/meal-plans), sign in as `sample-buyer-1@demo.nearbites.invalid`, and select **Meal Plan Demo Address**. Choose one dish per weekday you want to book. Review the full month and cash due at each delivery, then confirm. In **My subscriptions**, skip or restore future meals or cancel the plan. Renewal requires a new booking.

To try the seller side, run the seed command again with `--enable-seller` and choose a local password at the prompt. Sign in as `order-test-seller@demo.nearbites.invalid`, choose seller mode, and open **Plans**. You can edit the menu and see the scheduled deliveries. The demo seller can only publish meal plans on localhost.
