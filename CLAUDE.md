# Project conventions

## Commits
- Never add `Co-Authored-By: Claude …` to commit messages on this repo. Plain author trailer only.

## Library isolation
- The publishable packages (`@ipmotionmc/aicut-core`, `@ipmotionmc/aicut-react`, `@ipmotionmc/aicut-vue`) MUST NOT import from `examples/` or `e2e/`. Test fixtures, mock sources, and hard-coded video URLs stay in the demo or in e2e — never in `packages/*/src`. Reason: those packages ship to npm and any leak pollutes downstream bundles.
