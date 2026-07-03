# Changesets

Run `pnpm changeset` to record a version bump for any of the published packages (`@ipmotionmc/aicut-core`, `@ipmotionmc/aicut-react`, `@ipmotionmc/aicut-vue`). The three are pinned together via the `fixed` group in `config.json` so they always release at the same version.

`pnpm release` builds all library packages and runs `changeset publish`.
