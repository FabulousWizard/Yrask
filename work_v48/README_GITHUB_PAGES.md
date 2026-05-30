# GitHub Pages deployment

This bundle is prepared for GitHub Pages hosting.

## What changed

- Vite base path can be set from `VITE_BASE_PATH`.
- Public assets are fetched with `import.meta.env.BASE_URL`, so the app works under `/repo-name/`.
- A service worker and manifest were added for installable/PWA behavior.
- A visible install banner was added to the UI.
- `404.html` redirects GitHub Pages SPA fallback traffic back to the app.

## Deploy

1. Push the project to GitHub.
2. Make sure GitHub Pages is enabled for the repository.
3. The included workflow `.github/workflows/deploy.yml` builds the app and publishes `dist/`.

The workflow derives `VITE_BASE_PATH` from the repository name automatically. If you prefer manual builds, set `VITE_BASE_PATH` yourself before running `bun run build`.
