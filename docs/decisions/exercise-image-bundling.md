# Decision: Bundle all exercise images locally, full size

## Decision

Import the full [free-exercise-db](https://github.com/yuhonas/free-exercise-db) dataset (873 exercises, 1,746 images, ~98MB) and bundle every image directly into the app as a local asset, at original resolution/quality.

## Reasoning

- This app is explicitly offline-first with no backend server (see `docs/decisions/database-choice.md`) — there's no CDN to lazy-load images from, so "bundle locally" vs "fetch remotely" isn't really a choice, only "bundle" vs "skip images"
- The app is installed on the user's own device, not distributed via an app store to strangers — install size is far less of a concern than it would be for a public release
- User explicitly asked for all exercises "along with their images and guides," not a curated subset
- Compressing/resizing first was considered but rejected: the source images are already reasonably sized (~58KB average, 750x500 JPEG), so further compression would only save ~30-50MB at the cost of visible quality loss, not enough to change the fundamental tradeoff

## Alternatives Considered

**Compress/resize before bundling** — would cut the footprint to roughly 30-50MB. Rejected: modest savings, real quality cost, and not necessary given this is a personal device install.

**Skip images, import text data only** — smallest footprint, but directly contradicts the request ("along with their images and guides"). Would need a second pass later to add images anyway.

**Remote CDN / lazy loading** — would keep the app tiny and let images load on demand. Rejected: requires standing up and paying for image hosting, breaks the app's offline-first guarantee (training log screens would need network access to render exercise images), and there's no backend in this project's architecture at all currently.

## Consequences

- Installed app size increases by ~98MB
- Images ship via a generated static `require()` manifest (`app/src/assets/exerciseImages.ts`) rather than a runtime path lookup, because Metro (React Native's bundler) only resolves local assets through static string-literal `require()` calls — see `docs/architecture.md` for the generation pipeline (`scripts/import-free-exercise-db.py`)
- First app build/bundle after this change will be noticeably slower (~1,746 extra asset files for Metro to process) — a one-time cost, not a runtime one
- Re-running the import script after an upstream free-exercise-db update fully regenerates the data file, image folder, and manifest — safe to re-run any time
