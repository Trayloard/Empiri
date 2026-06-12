---
name: Companion DB schema drift in isolated envs
description: API 500 on conversation insert when the dev DB has columns not in the Drizzle code schema.
---

# Companion DB schema drift

If the Empiri API returns HTTP 500 on `POST /api/conversations` (insert into
`conversations`) but the code looks fine, suspect **schema drift**: the isolated
environment's Postgres table has a leftover column (e.g. a `user_id NOT NULL`
with no default) that the current Drizzle schema in `lib/db/src/schema/` does
not declare. Drizzle generates an insert that omits that column, so Postgres
rejects it with a NOT NULL violation surfaced as a 500.

**Why:** isolated task environments can start from a DB snapshot created by an
older/different schema (e.g. an auth-era `user_id`). The code schema is the
source of truth.

**How to apply:** run `pnpm --filter @workspace/db run push` (or `run push-force`)
to realign the DB to the code schema, then re-test the endpoint. Check actual
columns with `psql "$DATABASE_URL" -c "\d conversations"`.
