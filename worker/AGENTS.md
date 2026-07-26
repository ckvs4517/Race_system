# Worker API rules

- The Worker is the authority for formal tournament mutations.
- Keep authorization checks on every admin endpoint.
- Keep revision comparison and conditional `UPDATE ... WHERE revision = ?` behavior.
- Normal match operations must use the command API; full replacement is only for explicit backup restore.
- Never expose registration phone numbers or custom answers through public endpoints.
- Preserve ETag/304 behavior for read endpoints.
- Any API change requires `tests/api.test.mjs`; registration changes also require `tests/registration.test.mjs`; command changes require `tests/action-sync.test.mjs`.
