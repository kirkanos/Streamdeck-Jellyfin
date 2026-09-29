# Streamdeck-Jellyfin

Stream Deck plugin `com.kirkanos.jellyfin`. Status: plan only, no code yet.

## Goal

See what is playing on the Jellyfin server and pause or resume it without a remote.

## Keys & dials

- **Now playing** key: title, series and episode or film name, progress bar, client name. Press toggles pause/play, long press stops. Gray "idle" when nothing plays.
- **Dial**: turn selects the session when several clients play, push toggles pause/play, touch strip shows cover art and title.

## Data source & API

- Jellyfin REST with header `X-Emby-Token: <api key>`:
  - `GET /Sessions?activeWithinSeconds=60`, keep sessions with `NowPlayingItem`.
  - `POST /Sessions/{id}/Playing/PlayPause`, `POST /Sessions/{id}/Playing/Stop`.
  - Cover: `GET /Items/{itemId}/Images/Primary?maxWidth=100&quality=80`.
- Poll every 5 s while a session is active, every 30 s when idle. The Jellyfin WebSocket (`/socket`, `SessionsStart` message) can replace polling in M3.
- The server is reachable without an SSO proxy in front of the API.

## Settings

- Base URL (e.g. `https://jellyfin.example.com`), API key (create under Dashboard > API Keys), preferred client name.

## Open questions

- Whether the session list should exclude the plugin's own account or specific clients (for example the TV when the key is meant for the office).
- Cover art on a 72x72 key is small; the key uses text and the progress bar, the touch strip gets the cover.

## Milestones

- M1: Now playing key read-only, tests for title formatting.
- M2: PlayPause and Stop.
- M3: dial with session selection, cover on the touch strip, WebSocket updates.
- M4: CI workflows, release `v1.0.0`.

## Scaffold

Copy the tooling from [Kuma Glance](https://github.com/kirkanos/kuma-glance) (`../Streamdeck-Uptime-Kuma`), not from Termine:

- `@elgato/streamdeck` ^3, `@elgato/cli`, TypeScript, rollup via `scripts/build.mjs` and `createRollupConfig()` from its `rollup.config.mjs`; `tsconfig` extends `@tsconfig/node20`, `moduleResolution: Bundler`, `customConditions: ["node"]`.
- Manifest: SDKVersion 3, Nodejs 24, `Software.MinimumVersion` 7.1, version `0.0.0.0` (the build fills it in).
- Layout: `plugin/` (manifest, `ui/`, `layouts/`, icons), `src/plugin.ts`, `src/actions/`, `src/<service>/`, `src/render/` (reuse `svg.ts` and `theme.ts`).
- Dev variant `<uuid>-dev` via `--dev`, `npm run link:dev`, `npm run watch:dev`.
- Settings pages: static HTML with vendored sdpi-components 4.0.1 in `plugin/ui/`.
- CI: `.github/workflows/ci.yml` (typecheck, vitest, pack, artifact) and `release.yml` (tag `v*`, `PLUGIN_VERSION`, `gh release create`).
- Tests: vitest for model and render code, like `render.test.ts` in Kuma Glance.
- Secrets live in the action settings, never in global settings. Passwords are exchanged for a token once and not stored.
- No license for now.
