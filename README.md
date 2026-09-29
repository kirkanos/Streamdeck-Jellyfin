# Jellyfin Now Playing

What is playing on your [Jellyfin](https://jellyfin.org) server, with pause and stop, on your Elgato Stream Deck.

Unofficial plugin, not affiliated with the Jellyfin project.

## Features

* **Now Playing** key for the playing session:
  * Series and episode (`S05E14 · Name`), movie and year, or track and artists.
  * Playback position, runtime and a progress bar; 🟩 playing, 🟨 paused.
  * The client (device) that is playing.
  * Press to pause / resume, hold the key (0.6 s) to stop the playback.
  * A gray "Idle" key while nothing plays.
* **Dial Now Playing** (Stream Deck + / + XL): turn the dial to switch between the playing sessions, push or tap to pause / resume. The touch strip shows the cover (series poster, movie poster or album art), title, client and progress.
* Per key / dial: a **preferred client** that is shown whenever it plays, and clients to **exclude** (for example the living room TV on a key meant for the office).
* Polls the Jellyfin REST API every 5 seconds while something plays and every 30 seconds when idle.

## Installation

Download the [latest release](https://github.com/kirkanos/Streamdeck-Jellyfin/releases/latest) and open `com.kirkanos.jellyfin.streamDeckPlugin`. Requires Stream Deck 7.1 or newer.

## Settings

Create an API key in Jellyfin under **Dashboard > API Keys**. Then add a key, open its settings, enter the server URL (e.g. `https://jellyfin.example.com`) and the API key and press **Test & connect**. The plugin checks the key against the server and stores URL and key in the Stream Deck settings; all keys and dials share the connection.

Per key or dial:

* **Preferred client:** the device whose session is shown whenever it plays. Otherwise the first playing session is shown.
* **Exclude clients:** devices that are never shown.

Only devices that have been connected to Jellyfin since the plugin started are listed. If you set your own title on a key, the item title is left out of the key image.

## Development

Jellyfin Now Playing is a Node.js plugin built with the official [Stream Deck SDK](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/) (`@elgato/streamdeck`, TypeScript, rollup). The settings pages use [sdpi-components](https://sdpi-components.dev).

| Path | Content |
| --- | --- |
| `src/actions/` | One class per Stream Deck action |
| `src/jellyfin/` | Session model and the REST client polling Jellyfin |
| `src/render/` | SVG images for keys and touch strips |
| `plugin/` | Static plugin files: manifest, icons, settings pages (`ui/`), dial layout |
| `assets/` | Plugin icon source (rendered to PNG by the build) |
| `scripts/` | Build |

```sh
npm install
npm test               # unit tests
npm run typecheck

# Development: a parallel-installable copy "Jellyfin Now Playing (dev)"
npm run link:dev       # build + link into Stream Deck (once)
npm run watch:dev      # rebuild and restart the plugin on every change

npm run pack           # Release/com.kirkanos.jellyfin.streamDeckPlugin
```

Linking and restarting need the Stream Deck developer mode (`npx streamdeck dev`, then restart the Stream Deck app once). Plugin logs are written to `dist/<plugin id>.sdPlugin/logs/`.

GitHub Actions builds and tests every push (`.github/workflows/ci.yml`) and publishes a release with the packed plugin for tags like `v1.0.0` (`.github/workflows/release.yml`).

## Troubleshooting

* **Keys show "Offline":** check the server URL in the key settings and that Jellyfin is reachable from this computer.
* **Keys show "check server":** the API key may have been revoked in Jellyfin; disconnect and connect again with a new key.
* **A device is missing from the client lists:** the lists contain the devices that were connected to Jellyfin since the plugin started. Play something on the device once and reopen the settings.
* Anything else: [open an issue](https://github.com/kirkanos/Streamdeck-Jellyfin/issues).
