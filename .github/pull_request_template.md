## Summary

Describe the behavior or refactor in one or two paragraphs.

## Architecture checklist

- [ ] I identified the owning feature/layer before adding code.
- [ ] I did not add feature-specific behavior to `src/main.js`.
- [ ] `src/domain/` and `src/formats/` remain browser/network independent.
- [ ] API/network communication remains in an existing data/service boundary and moves toward `src/services/` when the feature is migrated.
- [ ] I did not create a generic dumping-ground module (`utils.js`, `helpers.js`, `common.js`, `misc.js`, `shared.js`).
- [ ] Existing V2 hotspots did not grow without an explicit architecture reason.
- [ ] Refactor-only changes preserve user-visible behavior and persisted tournament data.
- [ ] `npm run check:architecture` passes.

## Verification

- [ ] Focused regression tests pass.
- [ ] `node scripts/test-fast.mjs` passes where applicable.
- [ ] `node scripts/test-full.mjs` passes before merge.
- [ ] Browser tournament flows pass when UI behavior is touched.
- [ ] No D1/schema migration is required, or the migration is explicitly documented and reviewed.

## Compatibility / risk

Document:

- production data compatibility;
- API compatibility;
- remaining risk;
- whether deployment was performed.
