---
name: api-server dev hot-reload misses new routes
description: Newly added Express routes in the api-server don't appear until the workflow is restarted.
---

When you add a brand-new route to the api-server (e.g. a new
`router.get(...)` in `artifacts/api-server/src/routes/*.ts`), the running
dev workflow may keep serving the old route table — the new path returns
`Cannot GET ...` (404 HTML) while sibling routes in the same file still
work.

**Why:** the dev watcher did not reliably re-register a freshly added
route handler; editing an existing route's body is picked up, but adding a
new path was not.

**How to apply:** after adding a new route, restart the
`artifacts/api-server: API Server` workflow before smoke-testing, or you'll
chase a phantom 404. Confirm with a quick curl to `localhost:8080/api/...`
(dev localPort is 8080; the `$REPLIT_DEV_DOMAIN` root does not proxy to the
api-server).
