import { EventEmitter } from "node:events";
import { clientName, normalizeSessions, type RawSession, type Session } from "./model";

export type JellyfinSettings = { url?: string; apiKey?: string };

export type ConnectionState = "unconfigured" | "connecting" | "connected" | "error";

export type TestResult = { ok: true; serverName: string; version: string } | { ok: false; error: string };

type SystemInfo = { ServerName?: string; Version?: string };

/** Poll intervals: fast while something plays, slow when idle. */
export const POLL_ACTIVE_MS = 5_000;
export const POLL_IDLE_MS = 30_000;
const RETRY_MS = 30_000;
const TIMEOUT_MS = 10_000;
const MAX_COVERS = 24;

/**
 * Polls the Jellyfin REST API for the playback sessions and sends the
 * playback commands.
 *
 * Events:
 *   "sessions"  the session list or a playback state changed
 *   "state"     the connection state changed
 */
export class JellyfinService extends EventEmitter<{ sessions: []; state: [] }> {
  #settings: JellyfinSettings = {};
  #state: ConnectionState = "unconfigured";
  #error: string | undefined;
  #serverName: string | undefined;
  #sessions: Session[] = [];
  /** Device names seen since the plugin started, for the settings pages. */
  readonly #clients = new Set<string>();
  readonly #covers = new Map<string, string | undefined>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #generation = 0;

  get settings(): JellyfinSettings {
    return this.#settings;
  }

  get state(): ConnectionState {
    return this.#state;
  }

  get error(): string | undefined {
    return this.#error;
  }

  get serverName(): string | undefined {
    return this.#serverName;
  }

  get isConnected(): boolean {
    return this.#state === "connected";
  }

  /** Sessions with something playing, sorted by client name. */
  sessions(): Session[] {
    return this.#sessions;
  }

  session(id: string | undefined): Session | undefined {
    return id === undefined ? undefined : this.#sessions.find((s) => s.id === id);
  }

  /** Device names known so far, sorted. */
  clients(): string[] {
    return [...this.#clients].sort((a, b) => a.localeCompare(b));
  }

  /** Applies new connection settings; reconnects only when they changed. */
  configure(settings: JellyfinSettings): void {
    const url = normalizeUrl(settings.url);
    const apiKey = settings.apiKey?.trim() || undefined;
    if (url === this.#settings.url && apiKey === this.#settings.apiKey && this.#state !== "unconfigured") {
      return;
    }
    this.#settings = { url, apiKey };
    this.#stop();
    this.#sessions = [];
    this.#serverName = undefined;
    this.#covers.clear();
    this.emit("sessions");

    if (url && apiKey) {
      void this.#connect();
    } else {
      this.#setState("unconfigured");
    }
  }

  /** Checks URL and API key against /System/Info without changing the configuration. */
  async test(url: string, apiKey: string): Promise<TestResult> {
    const base = normalizeUrl(url);
    if (!base || !apiKey.trim()) {
      return { ok: false, error: "Please enter the server URL and an API key" };
    }
    try {
      const info = await request<SystemInfo>(base, apiKey.trim(), "GET", "/System/Info");
      return { ok: true, serverName: info.ServerName ?? base, version: info.Version ?? "" };
    } catch (err) {
      return { ok: false, error: errorMessage(err, base) };
    }
  }

  async playPause(sessionId: string): Promise<boolean> {
    const ok = await this.#command(sessionId, "PlayPause");
    const session = this.session(sessionId);
    if (ok && session) {
      // Show the change right away; the next poll confirms it.
      session.paused = !session.paused;
      this.emit("sessions");
    }
    return ok;
  }

  async stop(sessionId: string): Promise<boolean> {
    const ok = await this.#command(sessionId, "Stop");
    if (ok) {
      this.#sessions = this.#sessions.filter((s) => s.id !== sessionId);
      this.emit("sessions");
    }
    return ok;
  }

  /** Primary image of an item as data URL (cached); undefined when the item has none. */
  async cover(itemId: string): Promise<string | undefined> {
    const { url, apiKey } = this.#settings;
    if (!url || !apiKey) {
      return undefined;
    }
    if (this.#covers.has(itemId)) {
      return this.#covers.get(itemId);
    }
    let image: string | undefined;
    try {
      const res = await fetch(`${url}/Items/${encodeURIComponent(itemId)}/Images/Primary?maxWidth=100&quality=80`, {
        headers: { "X-Emby-Token": apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        const type = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
        const bytes = Buffer.from(await res.arrayBuffer());
        image = `data:${type};base64,${bytes.toString("base64")}`;
      }
    } catch {
      // No cover then; not worth retrying every few seconds.
    }
    if (this.#covers.size >= MAX_COVERS) {
      const oldest = this.#covers.keys().next().value;
      if (oldest !== undefined) {
        this.#covers.delete(oldest);
      }
    }
    this.#covers.set(itemId, image);
    return image;
  }

  async #command(sessionId: string, command: "PlayPause" | "Stop"): Promise<boolean> {
    const { url, apiKey } = this.#settings;
    if (!url || !apiKey || !this.isConnected) {
      return false;
    }
    try {
      await request(url, apiKey, "POST", `/Sessions/${encodeURIComponent(sessionId)}/Playing/${command}`);
      this.#schedule(1_000);
      return true;
    } catch {
      return false;
    }
  }

  async #connect(): Promise<void> {
    const generation = ++this.#generation;
    const { url, apiKey } = this.#settings;
    if (!url || !apiKey) {
      return;
    }
    this.#setState("connecting");
    try {
      const info = await request<SystemInfo>(url, apiKey, "GET", "/System/Info");
      if (generation !== this.#generation) {
        return;
      }
      this.#serverName = info.ServerName;
      this.#setState("connected");
      this.#schedule(0);
    } catch (err) {
      if (generation !== this.#generation) {
        return;
      }
      this.#setState("error", errorMessage(err, url));
      this.#timer = setTimeout(() => void this.#connect(), RETRY_MS);
    }
  }

  async #poll(): Promise<void> {
    const generation = this.#generation;
    const { url, apiKey } = this.#settings;
    if (!url || !apiKey) {
      return;
    }
    try {
      const raw = await request<RawSession[]>(url, apiKey, "GET", "/Sessions?activeWithinSeconds=60");
      if (generation !== this.#generation) {
        return;
      }
      for (const s of raw) {
        this.#clients.add(clientName(s));
      }
      this.#sessions = normalizeSessions(raw);
      this.#setState("connected");
      this.emit("sessions");
    } catch (err) {
      if (generation !== this.#generation) {
        return;
      }
      this.#setState("error", errorMessage(err, url));
    }
    this.#schedule(this.#sessions.length > 0 ? POLL_ACTIVE_MS : POLL_IDLE_MS);
  }

  #schedule(delay: number): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.#poll(), delay);
  }

  #stop(): void {
    this.#generation++;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #setState(state: ConnectionState, error?: string): void {
    if (state === this.#state && error === this.#error) {
      return;
    }
    this.#state = state;
    this.#error = error;
    this.emit("state");
  }
}

export function normalizeUrl(url: string | undefined): string | undefined {
  const trimmed = (url ?? "").trim().replace(/\/+$/, "");
  return trimmed || undefined;
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function request<T = unknown>(base: string, apiKey: string, method: "GET" | "POST", path: string): Promise<T> {
  const res = await fetch(base + path, {
    method,
    headers: { "X-Emby-Token": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new HttpError(res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function errorMessage(err: unknown, url: string): string {
  if (err instanceof HttpError) {
    if (err.status === 401 || err.status === 403) {
      return "API key rejected";
    }
    return `${url} answered with HTTP ${err.status}`;
  }
  const e = err as Error & { cause?: Error };
  if (e?.name === "TimeoutError") {
    return `Timeout reaching ${url}`;
  }
  return `Cannot reach ${url}: ${e?.cause?.message ?? e?.message ?? String(err)}`;
}

export const jellyfin = new JellyfinService();
