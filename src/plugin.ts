import streamDeck from "@elgato/streamdeck";
import { DialNowPlayingAction } from "./actions/dial-now-playing";
import { NowPlayingAction } from "./actions/now-playing";
import { jellyfin, type JellyfinSettings } from "./jellyfin/service";

type JsonValue = Parameters<typeof streamDeck.ui.sendToPropertyInspector>[0];

streamDeck.logger.setLevel("info");

const nowPlaying = new NowPlayingAction();
const dial = new DialNowPlayingAction();

streamDeck.actions.registerAction(nowPlaying);
streamDeck.actions.registerAction(dial);

// Keep every visible key and dial in sync with Jellyfin.

function refreshAll(): void {
  void nowPlaying.refresh();
  void dial.refresh();
}

jellyfin.on("sessions", () => {
  refreshAll();
  // Property inspectors with a hot-reloading client list pick this up.
  sendToPropertyInspector({ event: "getClients", items: clientItems() });
});

jellyfin.on("state", () => {
  streamDeck.logger.info(`jellyfin connection: ${jellyfin.state}${jellyfin.error ? ` (${jellyfin.error})` : ""}`);
  refreshAll();
  sendToPropertyInspector(statusMessage());
});

// Messages from the property inspectors (ui/*.html).

type UiMessage = { event: "getClients" | "getStatus" | "disconnect" } | { event: "connect"; url: string; apiKey: string };

streamDeck.ui.onSendToPlugin<UiMessage>(async (ev) => {
  const message = ev.payload;
  switch (message.event) {
    case "getClients":
      sendToPropertyInspector({ event: "getClients", items: clientItems() });
      break;
    case "getStatus":
      sendToPropertyInspector(statusMessage());
      break;
    case "connect": {
      const url = message.url.trim().replace(/\/+$/, "");
      const apiKey = message.apiKey.trim();
      const result = await jellyfin.test(url, apiKey);
      if (result.ok) {
        await saveSettings({ url, apiKey });
      }
      sendToPropertyInspector({ event: "connect", ...result });
      break;
    }
    case "disconnect":
      await saveSettings({ url: jellyfin.settings.url });
      break;
  }
});

function clientItems(): JsonValue {
  return jellyfin.clients().map((name) => ({ label: name, value: name }));
}

function statusMessage(): JsonValue {
  return {
    event: "status",
    state: jellyfin.state,
    url: jellyfin.settings.url ?? "",
    error: jellyfin.error ?? "",
    configured: Boolean(jellyfin.settings.apiKey),
    serverName: jellyfin.serverName ?? "",
    sessionCount: jellyfin.sessions().length,
  };
}

function sendToPropertyInspector(payload: JsonValue): void {
  if (streamDeck.ui.action) {
    streamDeck.ui.sendToPropertyInspector(payload).catch(() => undefined);
  }
}

async function saveSettings(settings: JellyfinSettings): Promise<void> {
  await streamDeck.settings.setGlobalSettings(settings);
  jellyfin.configure(settings);
  sendToPropertyInspector(statusMessage());
}

streamDeck.settings.onDidReceiveGlobalSettings<JellyfinSettings>((ev) => jellyfin.configure(ev.settings));

await streamDeck.connect();
jellyfin.configure(await streamDeck.settings.getGlobalSettings<JellyfinSettings>());
