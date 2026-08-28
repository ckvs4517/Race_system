# Worker API rules

- The Worker is the authority for formal tournament mutations.
- `worker/index.js` is a thin entry point only: static assets, API delegation, and top-level error handling.
- `worker/routes/` owns HTTP path/method coordination and response shaping.
- `worker/services/` owns authorization, server validation, revision metadata helpers, and server-authoritative action dispatch.
- `worker/db/` owns D1 SQL and persistence mapping. Do not add `.prepare()` or `.batch()` calls outside this directory.
- `worker/tournament-domain.js` is the only Worker packaging bridge to the shared tournament domain.
- Keep authorization checks on every admin endpoint.
- Keep revision comparison and conditional `UPDATE ... WHERE revision = ?` behavior.
- Normal match operations must use the command API; full replacement is only for explicit backup restore.
- Never expose registration phone numbers or custom answers through public endpoints.
- Preserve ETag/304 behavior for read endpoints.
- Any API change requires `tests/api.test.mjs`; registration changes also require `tests/registration.test.mjs`; command changes require `tests/action-sync.test.mjs`.
- Refactor-only changes must preserve HTTP status codes, JSON payload shapes, tournament JSON semantics, and D1 schema.
