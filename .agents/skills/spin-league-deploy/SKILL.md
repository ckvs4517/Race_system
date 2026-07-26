---
name: spin-league-deploy
description: Build, review, and safely update the existing Spin League ChatGPT Site without replacing production D1 data.
---

# Deployment workflow

1. Confirm deployment was explicitly requested.
2. Read `references/sites-checklist.md`.
3. Inspect `git diff` and ensure no secrets or production backups are included.
4. Run `node scripts/test-full.mjs --browser=required` when Chrome is available.
5. Run `node scripts/build-site.mjs`.
6. Confirm `.openai/hosting.json` still points to the existing project and D1 binding.
7. Update the existing Site; do not create a replacement Site.
8. Do not run backup restore or D1 migration unless the change explicitly requires it.
9. Review a preview before production publication when the platform offers one.
10. After publication, run `node scripts/verify-deployment.mjs <site-url>`.
11. Verify at least one existing tournament remains readable before entering new scores.
