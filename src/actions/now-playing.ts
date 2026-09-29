import {
  action,
  type DidReceiveSettingsEvent,
  type KeyAction,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type TitleParametersDidChangeEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { PLUGIN_ID } from "../config";
import { selectSession, type Session } from "../jellyfin/model";
import { jellyfin } from "../jellyfin/service";
import { idleKey, messageKey, nowPlayingKey } from "../render/keys";
import { showImage, updates } from "../throttle";

export type NowPlayingSettings = {
  /** Device whose session is shown whenever it plays. */
  preferredClient?: string;
  /** Devices never shown. */
  excludeClients?: string[];
};

/** Holding the key this long stops the playback instead of toggling pause. */
export const LONG_PRESS_MS = 600;

/** Image for keys that cannot show a session (not configured, server unreachable). */
export function unavailableImage(): string | undefined {
  if (jellyfin.state === "unconfigured") {
    return messageKey("Set up", "see settings");
  }
  if (!jellyfin.isConnected) {
    return messageKey("Offline", jellyfin.state === "error" ? "check server" : "connecting…");
  }
  return undefined;
}

/** Normalizes the settings from the property inspector. */
export function selectionOptions(settings: NowPlayingSettings): { preferredClient?: string; excludeClients: string[] } {
  const exclude = settings.excludeClients;
  return {
    preferredClient: settings.preferredClient?.trim() || undefined,
    excludeClients: Array.isArray(exclude) ? exclude : typeof exclude === "string" ? [exclude] : [],
  };
}

/** A key showing the playing session; press toggles pause, a long press stops. */
@action({ UUID: `${PLUGIN_ID}.now-playing` })
export class NowPlayingAction extends SingletonAction<NowPlayingSettings> {
  readonly #settings = new Map<string, NowPlayingSettings>();
  /** Keys with a user-defined title: the item title is not drawn into the image then. */
  readonly #hasTitle = new Map<string, boolean>();
  readonly #presses = new Map<string, { timer: ReturnType<typeof setTimeout>; fired: boolean }>();

  override onWillAppear(ev: WillAppearEvent<NowPlayingSettings>): Promise<void> {
    this.#settings.set(ev.action.id, ev.payload.settings);
    return this.#render(ev.action.id);
  }

  override onWillDisappear(ev: WillDisappearEvent<NowPlayingSettings>): void {
    this.#settings.delete(ev.action.id);
    this.#hasTitle.delete(ev.action.id);
    this.#clearPress(ev.action.id);
    updates.forget(ev.action.id);
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<NowPlayingSettings>): Promise<void> {
    this.#settings.set(ev.action.id, ev.payload.settings);
    return this.#render(ev.action.id);
  }

  override onTitleParametersDidChange(ev: TitleParametersDidChangeEvent<NowPlayingSettings>): Promise<void> {
    this.#hasTitle.set(ev.action.id, ev.payload.title.trim() !== "");
    return this.#render(ev.action.id);
  }

  override onKeyDown(ev: KeyDownEvent<NowPlayingSettings>): void {
    this.#clearPress(ev.action.id);
    const session = this.#session(ev.payload.settings);
    if (!session) {
      return;
    }
    const press = {
      fired: false,
      timer: setTimeout(async () => {
        press.fired = true;
        const ok = await jellyfin.stop(session.id);
        await (ok ? ev.action.showOk() : ev.action.showAlert());
      }, LONG_PRESS_MS),
    };
    this.#presses.set(ev.action.id, press);
  }

  override async onKeyUp(ev: KeyUpEvent<NowPlayingSettings>): Promise<void> {
    const press = this.#presses.get(ev.action.id);
    this.#clearPress(ev.action.id);
    if (!press || press.fired) {
      return;
    }
    const session = this.#session(ev.payload.settings);
    if (!session || !(await jellyfin.playPause(session.id))) {
      await ev.action.showAlert();
    }
  }

  /** Re-renders all visible keys. */
  async refresh(): Promise<void> {
    for (const id of this.#settings.keys()) {
      await this.#render(id);
    }
  }

  #session(settings: NowPlayingSettings): Session | undefined {
    return selectSession(jellyfin.sessions(), selectionOptions(settings));
  }

  #clearPress(actionId: string): void {
    const press = this.#presses.get(actionId);
    if (press) {
      clearTimeout(press.timer);
      this.#presses.delete(actionId);
    }
  }

  async #render(actionId: string): Promise<void> {
    const key = this.actions.find((a) => a.id === actionId) as KeyAction<NowPlayingSettings> | undefined;
    const settings = this.#settings.get(actionId);
    if (!key || !settings) {
      return;
    }

    const unavailable = unavailableImage();
    if (unavailable) {
      showImage(key, unavailable);
      return;
    }

    const session = this.#session(settings);
    if (!session) {
      showImage(key, idleKey());
      return;
    }

    showImage(
      key,
      nowPlayingKey({
        title: this.#hasTitle.get(actionId) ? undefined : session.item.title,
        subtitle: session.item.subtitle,
        paused: session.paused,
        positionTicks: session.positionTicks,
        runTimeTicks: session.item.runTimeTicks,
        progress: session.progress,
        client: session.client,
      }),
    );
  }
}
