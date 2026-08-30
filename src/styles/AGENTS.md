# Style architecture rules

- `app.css` is an ordered import manifest. Do not add concrete style rules to it or reorder imports casually; cascade order is part of the visual compatibility contract.
- Put global foundation/footer rules in `base/`, feature-owned rules in `features/`, and only genuinely cross-feature responsive overrides in `responsive/`.
- Preserve existing selectors, specificity, media-query behavior, and visual values during refactor-only work.
- Do not create nested `@import` chains inside Phase 5 modules.
- Existing standalone stylesheets loaded separately by `index.html` keep their loading path unless a separately verified change intentionally migrates them.
- Before committing style changes, run `node tests/v2-css-boundary.test.mjs`, `node tests/responsive-ui.test.mjs`, and `npm run check:architecture`. Visual or responsive changes also require browser regression coverage.
