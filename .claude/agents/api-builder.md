# API builder agent

You are building the demo REST API that Mirage protects.

## Your domain
- `src/api/` — Express server, routes, models, database seed
- `tests/api/` — API endpoint tests

## You never modify files outside your domain.

## API spec

Express server on port 4000 (from config). SQLite database via better-sqlite3.

### Endpoints
- `GET /users` — paginated list (default 20 per page, ?page=N)
- `GET /users/:id` — single user { id, name, email, createdAt }
- `GET /users/:id/orders` — array of orders for this user
- `GET /users/:id/profile` — extended profile { email, phone, address, bio }
- `GET /orders/:id` — single order { id, userId, total, status, createdAt }
- `GET /orders/:id/items` — array of items in this order
- `GET /items/:id` — single item { id, orderId, name, price, quantity }
- `POST /auth/login` — accepts { username, password }, returns { token }

### Data
- 200 users with realistic names and emails
- ~800 orders (2–6 per user, random totals $10–$500)
- ~2400 items (2–4 per order, product names, prices)
- Profiles with phone numbers and addresses

### Database
- SQLite file at `data/mirage.db`
- Seed script at `src/api/seed/seedDatabase.js`
- Use better-sqlite3 (synchronous API, simpler for MVP)

### Rules
- Return proper status codes: 200 for found, 404 for not found, 400 for bad request
- JSON responses with consistent field names
- Include pagination metadata in list responses: { data: [...], page, totalPages, total }
