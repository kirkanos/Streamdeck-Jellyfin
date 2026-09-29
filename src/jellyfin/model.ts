/** Data model of the playback sessions reported by Jellyfin. */

/** Subset of a Jellyfin `SessionInfo` (GET /Sessions). */
export type RawSession = {
  Id: string;
  UserName?: string;
  Client?: string;
  DeviceName?: string;
  PlayState?: {
    PositionTicks?: number | null;
    IsPaused?: boolean;
  };
  NowPlayingItem?: RawItem | null;
};

/** Subset of a Jellyfin `BaseItemDto`. */
export type RawItem = {
  Id: string;
  Name?: string;
  Type?: string;
  RunTimeTicks?: number | null;
  ProductionYear?: number | null;
  SeriesName?: string | null;
  SeriesId?: string | null;
  SeriesPrimaryImageTag?: string | null;
  ParentIndexNumber?: number | null;
  IndexNumber?: number | null;
  Artists?: string[] | null;
  AlbumArtist?: string | null;
  AlbumId?: string | null;
  AlbumPrimaryImageTag?: string | null;
  ImageTags?: { Primary?: string } | null;
};

export type ItemType = "episode" | "movie" | "audio" | "other";

export type PlayingItem = {
  id: string;
  type: ItemType;
  /** Main line: series name, movie name or track name. */
  title: string;
  /** Second line: "S01E02 · Episode name", the production year or the artists. */
  subtitle?: string;
  /** Item whose primary image is the best cover: series poster, album art or the item itself. */
  coverItemId: string;
  runTimeTicks?: number;
};

export type Session = {
  id: string;
  /** DeviceName, or Client when Jellyfin reports no device name. */
  client: string;
  /** App name (e.g. "Jellyfin Web"), if different from the device name. */
  app?: string;
  userName?: string;
  paused: boolean;
  positionTicks: number;
  /** Playback position 0..1; undefined for streams without a known runtime. */
  progress?: number;
  item: PlayingItem;
};

/** Jellyfin ticks are 100 ns. */
export const TICKS_PER_SECOND = 10_000_000;

export function itemType(raw: RawItem): ItemType {
  switch (raw.Type) {
    case "Episode":
      return "episode";
    case "Movie":
      return "movie";
    case "Audio":
      return "audio";
    default:
      return "other";
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "S01E02" from the season and episode numbers, as far as they are known. */
export function episodeCode(item: RawItem): string | undefined {
  const season = item.ParentIndexNumber;
  const episode = item.IndexNumber;
  if (typeof season === "number" && typeof episode === "number") {
    return `S${pad2(season)}E${pad2(episode)}`;
  }
  if (typeof episode === "number") {
    return `E${pad2(episode)}`;
  }
  return undefined;
}

/** Title and subtitle of a playing item by type. */
export function formatTitle(item: RawItem): { title: string; subtitle?: string } {
  const name = (item.Name ?? "").trim();
  switch (itemType(item)) {
    case "episode": {
      const series = (item.SeriesName ?? "").trim();
      const code = episodeCode(item);
      const parts = [code, name].filter((p): p is string => Boolean(p));
      if (!series) {
        return { title: name || "Episode", subtitle: code };
      }
      return { title: series, subtitle: parts.length > 0 ? parts.join(" · ") : undefined };
    }
    case "movie":
      return { title: name || "Movie", subtitle: item.ProductionYear ? String(item.ProductionYear) : undefined };
    case "audio": {
      const artists = (item.Artists ?? []).map((a) => a.trim()).filter(Boolean);
      const artist = artists.length > 0 ? artists.join(", ") : (item.AlbumArtist ?? "").trim();
      return { title: name || "Track", subtitle: artist || undefined };
    }
    default:
      return { title: name || "Unknown" };
  }
}

/** One-line title, e.g. for logs: "Series · S01E02 · Name". */
export function titleLine(item: RawItem): string {
  const { title, subtitle } = formatTitle(item);
  return subtitle ? `${title} · ${subtitle}` : title;
}

export function coverItemId(item: RawItem): string {
  if (itemType(item) === "episode" && item.SeriesId && item.SeriesPrimaryImageTag) {
    return item.SeriesId;
  }
  if (itemType(item) === "audio" && item.AlbumId && item.AlbumPrimaryImageTag) {
    return item.AlbumId;
  }
  return item.Id;
}

/** Playback position as a fraction 0..1, or undefined without a runtime. */
export function progress(positionTicks: number | null | undefined, runTimeTicks: number | null | undefined): number | undefined {
  if (!runTimeTicks || runTimeTicks <= 0) {
    return undefined;
  }
  const fraction = (positionTicks ?? 0) / runTimeTicks;
  return Math.min(1, Math.max(0, fraction));
}

/** "1:23:45" or "23:45" from ticks. */
export function formatTicks(ticks: number | null | undefined): string {
  const total = Math.max(0, Math.floor((ticks ?? 0) / TICKS_PER_SECOND));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

export function clientName(raw: Pick<RawSession, "DeviceName" | "Client">): string {
  return (raw.DeviceName ?? "").trim() || (raw.Client ?? "").trim() || "Unknown device";
}

/** Converts a raw session into the plugin model; undefined when nothing is playing on it. */
export function normalizeSession(raw: RawSession): Session | undefined {
  const item = raw.NowPlayingItem;
  if (!item || !item.Id) {
    return undefined;
  }
  const client = clientName(raw);
  const app = (raw.Client ?? "").trim();
  const positionTicks = Math.max(0, raw.PlayState?.PositionTicks ?? 0);
  return {
    id: raw.Id,
    client,
    app: app && app !== client ? app : undefined,
    userName: raw.UserName?.trim() || undefined,
    paused: Boolean(raw.PlayState?.IsPaused),
    positionTicks,
    progress: progress(positionTicks, item.RunTimeTicks),
    item: {
      id: item.Id,
      type: itemType(item),
      ...formatTitle(item),
      coverItemId: coverItemId(item),
      runTimeTicks: item.RunTimeTicks || undefined,
    },
  };
}

/** All sessions with something playing, in a stable order (by client name). */
export function normalizeSessions(raw: RawSession[]): Session[] {
  return raw
    .map(normalizeSession)
    .filter((s): s is Session => s !== undefined)
    .sort((a, b) => a.client.localeCompare(b.client) || a.id.localeCompare(b.id));
}

export type SelectionOptions = {
  /** Client (device) name that should be shown when it is playing. */
  preferredClient?: string;
  /** Client (device) names never to show. */
  excludeClients?: string[];
  /** Session shown so far; kept as long as it is still playing (dial selection). */
  currentId?: string;
};

const norm = (name: string | undefined) => (name ?? "").trim().toLowerCase();

function matchesClient(session: Session, name: string): boolean {
  const n = norm(name);
  return n !== "" && (norm(session.client) === n || norm(session.app) === n);
}

/** Sessions that are not excluded by the settings. */
export function activeSessions(sessions: Session[], excludeClients: string[] | undefined): Session[] {
  const excluded = (excludeClients ?? []).filter((c) => norm(c) !== "");
  return sessions.filter((s) => !excluded.some((c) => matchesClient(s, c)));
}

/**
 * Picks the session to show: the preferred client if it is playing, otherwise
 * the current selection if still playing, otherwise the first one.
 */
export function selectSession(sessions: Session[], options: SelectionOptions = {}): Session | undefined {
  const candidates = activeSessions(sessions, options.excludeClients);
  if (candidates.length === 0) {
    return undefined;
  }
  const preferred = options.preferredClient ? candidates.find((s) => matchesClient(s, options.preferredClient!)) : undefined;
  if (preferred) {
    return preferred;
  }
  const current = options.currentId ? candidates.find((s) => s.id === options.currentId) : undefined;
  return current ?? candidates[0];
}

/** The session `steps` positions after `currentId` in the candidate list (wrapping around). */
export function stepSession(sessions: Session[], excludeClients: string[] | undefined, currentId: string | undefined, steps: number): Session | undefined {
  const candidates = activeSessions(sessions, excludeClients);
  if (candidates.length === 0) {
    return undefined;
  }
  const current = candidates.findIndex((s) => s.id === currentId);
  if (current < 0) {
    return candidates[0];
  }
  const n = candidates.length;
  return candidates[(((current + steps) % n) + n) % n];
}
