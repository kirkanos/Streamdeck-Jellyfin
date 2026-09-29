import { describe, expect, it } from "vitest";
import {
  activeSessions,
  coverItemId,
  formatTicks,
  formatTitle,
  normalizeSession,
  normalizeSessions,
  progress,
  type RawSession,
  selectSession,
  type Session,
  stepSession,
  TICKS_PER_SECOND,
} from "./model";

const episode = {
  Id: "ep1",
  Name: "Ozymandias",
  Type: "Episode",
  SeriesName: "Breaking Bad",
  SeriesId: "series1",
  SeriesPrimaryImageTag: "abc",
  ParentIndexNumber: 5,
  IndexNumber: 14,
  RunTimeTicks: 47 * 60 * TICKS_PER_SECOND,
};

const movie = { Id: "mv1", Name: "Heat", Type: "Movie", ProductionYear: 1995, RunTimeTicks: 170 * 60 * TICKS_PER_SECOND };

const track = {
  Id: "tr1",
  Name: "Karma Police",
  Type: "Audio",
  Artists: ["Radiohead"],
  AlbumId: "album1",
  AlbumPrimaryImageTag: "def",
  RunTimeTicks: 264 * TICKS_PER_SECOND,
};

const raw = (over: Partial<RawSession> = {}): RawSession => ({
  Id: "s1",
  UserName: "andreas",
  Client: "Jellyfin Web",
  DeviceName: "Office Mac",
  PlayState: { PositionTicks: 10 * 60 * TICKS_PER_SECOND, IsPaused: false },
  NowPlayingItem: episode,
  ...over,
});

describe("formatTitle", () => {
  it("formats episodes as series, code and name", () => {
    expect(formatTitle(episode)).toEqual({ title: "Breaking Bad", subtitle: "S05E14 · Ozymandias" });
  });

  it("copes with episodes without season or series", () => {
    expect(formatTitle({ ...episode, ParentIndexNumber: null })).toEqual({ title: "Breaking Bad", subtitle: "E14 · Ozymandias" });
    expect(formatTitle({ ...episode, ParentIndexNumber: null, IndexNumber: null })).toEqual({ title: "Breaking Bad", subtitle: "Ozymandias" });
    expect(formatTitle({ ...episode, SeriesName: null })).toEqual({ title: "Ozymandias", subtitle: "S05E14" });
  });

  it("formats movies as name and year", () => {
    expect(formatTitle(movie)).toEqual({ title: "Heat", subtitle: "1995" });
    expect(formatTitle({ ...movie, ProductionYear: null })).toEqual({ title: "Heat", subtitle: undefined });
  });

  it("formats audio as track and artists", () => {
    expect(formatTitle(track)).toEqual({ title: "Karma Police", subtitle: "Radiohead" });
    expect(formatTitle({ ...track, Artists: ["A", "B"] })).toEqual({ title: "Karma Police", subtitle: "A, B" });
    expect(formatTitle({ ...track, Artists: [], AlbumArtist: "Various" })).toEqual({ title: "Karma Police", subtitle: "Various" });
  });

  it("falls back to the name for other types", () => {
    expect(formatTitle({ Id: "x", Name: "Live TV", Type: "TvChannel" })).toEqual({ title: "Live TV" });
    expect(formatTitle({ Id: "x" })).toEqual({ title: "Unknown" });
  });
});

describe("progress and time", () => {
  it("computes the fraction from ticks and clamps it", () => {
    expect(progress(25, 100)).toBe(0.25);
    expect(progress(150, 100)).toBe(1);
    expect(progress(-5, 100)).toBe(0);
    expect(progress(undefined, 100)).toBe(0);
  });

  it("is undefined without a runtime", () => {
    expect(progress(10, undefined)).toBeUndefined();
    expect(progress(10, 0)).toBeUndefined();
  });

  it("formats ticks as m:ss or h:mm:ss", () => {
    expect(formatTicks(0)).toBe("0:00");
    expect(formatTicks(75 * TICKS_PER_SECOND)).toBe("1:15");
    expect(formatTicks(3725 * TICKS_PER_SECOND)).toBe("1:02:05");
    expect(formatTicks(undefined)).toBe("0:00");
  });
});

describe("normalizeSession", () => {
  it("maps a playing session", () => {
    const s = normalizeSession(raw());
    expect(s).toMatchObject({
      id: "s1",
      client: "Office Mac",
      app: "Jellyfin Web",
      userName: "andreas",
      paused: false,
      item: { id: "ep1", type: "episode", title: "Breaking Bad", subtitle: "S05E14 · Ozymandias", coverItemId: "series1" },
    });
    expect(s?.progress).toBeCloseTo(10 / 47);
  });

  it("skips sessions without a playing item", () => {
    expect(normalizeSession(raw({ NowPlayingItem: null }))).toBeUndefined();
    expect(normalizeSession(raw({ NowPlayingItem: undefined }))).toBeUndefined();
  });

  it("takes paused state and falls back to the client name", () => {
    const s = normalizeSession(raw({ DeviceName: "", PlayState: { IsPaused: true } }));
    expect(s).toMatchObject({ client: "Jellyfin Web", app: undefined, paused: true, positionTicks: 0 });
  });

  it("uses the series poster or album art as cover", () => {
    expect(coverItemId(episode)).toBe("series1");
    expect(coverItemId({ ...episode, SeriesPrimaryImageTag: null })).toBe("ep1");
    expect(coverItemId(track)).toBe("album1");
    expect(coverItemId(movie)).toBe("mv1");
  });

  it("sorts playing sessions by client name", () => {
    const list = normalizeSessions([
      raw({ Id: "b", DeviceName: "TV" }),
      raw({ Id: "a", DeviceName: "Office Mac" }),
      raw({ Id: "c", NowPlayingItem: null }),
    ]);
    expect(list.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("session selection", () => {
  const session = (id: string, client: string, app = "Jellyfin Web"): Session => ({
    id,
    client,
    app,
    paused: false,
    positionTicks: 0,
    item: { id: `item-${id}`, type: "movie", title: id, coverItemId: `item-${id}` },
  });
  const sessions = [session("1", "Living Room TV", "Jellyfin Android TV"), session("2", "Office Mac"), session("3", "Phone")];

  it("prefers the preferred client when it is playing", () => {
    expect(selectSession(sessions, { preferredClient: "office mac" })?.id).toBe("2");
    expect(selectSession(sessions, { preferredClient: "Jellyfin Android TV" })?.id).toBe("1");
  });

  it("keeps the current session while it is playing", () => {
    expect(selectSession(sessions, { currentId: "3" })?.id).toBe("3");
    expect(selectSession(sessions, { currentId: "gone" })?.id).toBe("1");
    expect(selectSession(sessions, { preferredClient: "Phone", currentId: "2" })?.id).toBe("3");
  });

  it("falls back to the first session", () => {
    expect(selectSession(sessions, { preferredClient: "Kitchen" })?.id).toBe("1");
    expect(selectSession(sessions)?.id).toBe("1");
    expect(selectSession([])).toBeUndefined();
  });

  it("never shows excluded clients", () => {
    expect(activeSessions(sessions, ["living room tv", " "]).map((s) => s.id)).toEqual(["2", "3"]);
    expect(selectSession(sessions, { excludeClients: ["Living Room TV"] })?.id).toBe("2");
    expect(selectSession(sessions, { preferredClient: "Living Room TV", excludeClients: ["Living Room TV"] })?.id).toBe("2");
    expect(selectSession(sessions, { excludeClients: ["Living Room TV", "Office Mac", "Phone"] })).toBeUndefined();
  });

  it("steps through the sessions with wrap-around", () => {
    expect(stepSession(sessions, undefined, "1", 1)?.id).toBe("2");
    expect(stepSession(sessions, undefined, "3", 1)?.id).toBe("1");
    expect(stepSession(sessions, undefined, "1", -1)?.id).toBe("3");
    expect(stepSession(sessions, ["Office Mac"], "1", 1)?.id).toBe("3");
    expect(stepSession(sessions, undefined, undefined, 1)?.id).toBe("1");
    expect(stepSession([], undefined, "1", 1)).toBeUndefined();
  });
});
