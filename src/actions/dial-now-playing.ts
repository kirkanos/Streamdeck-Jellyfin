import {
  action,
  type DialAction,
  type DialDownEvent,
  type DialRotateEvent,
  type DidReceiveSettingsEvent,
  SingletonAction,
  type TouchTapEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { PLUGIN_ID } from "../config";
import { activeSessions, selectSession, type Session, stepSession } from "../jellyfin/model";
import { jellyfin } from "../jellyfin/service";
import { dialCanvas, dialMessage } from "../render/dial";
import { updates } from "../throttle";
import { type NowPlayingSettings, selectionOptions } from "./now-playing";

/** A dial browsing through the playing sessions; the touch strip shows cover, title and progress. */
@action({ UUID: `${PLUGIN_ID}.dial-now-playing` })
export class DialNowPlayingAction extends SingletonAction<NowPlayingSettings> {
  readonly #settings = new Map<string, NowPlayingSettings>();
  /** Session picked with the dial; session ids are transient, so this is not persisted. */
  readonly #selected = new Map<string, string>();

  override onWillAppear(ev: WillAppearEvent<NowPlayingSettings>): Promise<void> {
    this.#settings.set(ev.action.id, ev.payload.settings);
    return this.#render(ev.action.id);
  }

  override onWillDisappear(ev: WillDisappearEvent<NowPlayingSettings>): void {
    this.#settings.delete(ev.action.id);
    this.#selected.delete(ev.action.id);
    updates.forget(ev.action.id);
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<NowPlayingSettings>): Promise<void> {
    this.#settings.set(ev.action.id, ev.payload.settings);
    return this.#render(ev.action.id);
  }

  override async onDialRotate(ev: DialRotateEvent<NowPlayingSettings>): Promise<void> {
    const options = selectionOptions(ev.payload.settings);
    const current = this.#session(ev.action.id, ev.payload.settings);
    const next = stepSession(jellyfin.sessions(), options.excludeClients, current?.id, Math.sign(ev.payload.ticks));
    if (!next) {
      return;
    }
    this.#selected.set(ev.action.id, next.id);
    await this.#render(ev.action.id);
  }

  override onDialDown(ev: DialDownEvent<NowPlayingSettings>): Promise<void> {
    return this.#press(ev.action, ev.payload.settings);
  }

  override onTouchTap(ev: TouchTapEvent<NowPlayingSettings>): Promise<void> {
    return this.#press(ev.action, ev.payload.settings);
  }

  /** Re-renders all visible dials. */
  async refresh(): Promise<void> {
    for (const id of this.#settings.keys()) {
      await this.#render(id);
    }
  }

  /** The session shown on the dial: the dial selection wins over the preferred client while it plays. */
  #session(actionId: string, settings: NowPlayingSettings): Session | undefined {
    const options = selectionOptions(settings);
    const sessions = jellyfin.sessions();
    const selected = jellyfin.session(this.#selected.get(actionId));
    if (selected && activeSessions([selected], options.excludeClients).length > 0) {
      return selected;
    }
    return selectSession(sessions, options);
  }

  async #press(dial: DialAction<NowPlayingSettings>, settings: NowPlayingSettings): Promise<void> {
    const session = this.#session(dial.id, settings);
    if (!session || !(await jellyfin.playPause(session.id))) {
      await dial.showAlert();
    }
  }

  async #render(actionId: string): Promise<void> {
    const dial = this.actions.find((a) => a.id === actionId);
    const settings = this.#settings.get(actionId);
    if (!dial?.isDial() || !settings) {
      return;
    }

    let canvas: string;
    if (jellyfin.state === "unconfigured") {
      canvas = dialMessage("Set up", "open the dial settings");
    } else if (!jellyfin.isConnected) {
      canvas = dialMessage("Offline", jellyfin.state === "error" ? "check server" : "connecting…");
    } else {
      const session = this.#session(actionId, settings);
      if (!session) {
        canvas = dialMessage("Idle", "nothing playing");
      } else {
        const candidates = activeSessions(jellyfin.sessions(), selectionOptions(settings).excludeClients);
        const cover = await jellyfin.cover(session.item.coverItemId);
        // The session may have ended while the cover was loading.
        if (!this.#settings.has(actionId)) {
          return;
        }
        canvas = dialCanvas({
          title: session.item.title,
          subtitle: session.item.subtitle,
          cover,
          paused: session.paused,
          positionTicks: session.positionTicks,
          runTimeTicks: session.item.runTimeTicks,
          progress: session.progress,
          client: session.client,
          index: candidates.findIndex((s) => s.id === session.id) + 1,
          count: candidates.length,
        });
      }
    }
    updates.update(dial.id, canvas, (value) => dial.setFeedback({ canvas: value }));
  }
}
