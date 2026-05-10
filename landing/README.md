# switchdial — landing page

Minimal static landing site, deployable to Vercel.

## Deploy

From this directory:

```bash
vercel deploy --prod
```

(or `vercel` for a preview URL first.)

## Before going live, fill in:

- `index.html`: replace `nickvalcke` (3 places) with your GitHub username.
- `index.html`: replace `DOWNLOAD_URL_ARM64` and `DOWNLOAD_URL_INTEL` with your
  GitHub Release asset URLs, e.g.:
  - `https://github.com/USER/switchdial/releases/download/v0.0.0/switchdial-0.0.0-arm64.dmg`
  - `https://github.com/USER/switchdial/releases/download/v0.0.0/switchdial-0.0.0.dmg`
- `index.html`: when you publish a Homebrew tap, replace `YOUR_TAP` with the
  tap name (e.g. `nickvalcke/switchdial`).

## Distribution flow

1. `pnpm dist` from the project root → produces both DMGs in `release/`.
2. Create a GitHub release, upload the two DMGs as assets.
3. Update the URLs in `index.html`.
4. `vercel deploy --prod`.
