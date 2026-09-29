import { describe, expect, it } from "vitest";
import { TICKS_PER_SECOND } from "../jellyfin/model";
import { dialCanvas, dialMessage } from "./dial";
import { idleKey, messageKey, nowPlayingKey, progressBar, timeLabel } from "./keys";
import { escapeXml, wrapText } from "./svg";
import { THEME } from "./theme";

const decode = (dataUrl: string) => Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");

const playing = {
  title: "Breaking Bad",
  subtitle: "S05E14 · Ozymandias",
  paused: false,
  positionTicks: 600 * TICKS_PER_SECOND,
  runTimeTicks: 2820 * TICKS_PER_SECOND,
  progress: 600 / 2820,
  client: "Office Mac",
};

describe("wrapText", () => {
  it("keeps short titles on one line and breaks long ones", () => {
    expect(wrapText("Heat", 12, 2)).toEqual(["Heat"]);
    expect(wrapText("Breaking Bad", 12, 2)).toEqual(["Breaking Bad"]);
    expect(wrapText("The Lord of the Rings", 12, 2)).toEqual(["The Lord of", "the Rings"]);
    expect(wrapText("Star Wars: The Empire Strikes Back", 12, 2)).toEqual(["Star Wars:", "The Empire…"]);
  });
});

describe("timeLabel", () => {
  it("adds the runtime when both fit", () => {
    expect(timeLabel(75 * TICKS_PER_SECOND, 300 * TICKS_PER_SECOND)).toEqual({ value: "1:15", suffix: "/ 5:00" });
  });

  it("drops the runtime for long values", () => {
    expect(timeLabel(3725 * TICKS_PER_SECOND, 7200 * TICKS_PER_SECOND)).toEqual({ value: "1:02:05" });
    expect(timeLabel(60 * TICKS_PER_SECOND, 7200 * TICKS_PER_SECOND)).toEqual({ value: "1:00" });
    expect(timeLabel(60 * TICKS_PER_SECOND, undefined)).toEqual({ value: "1:00" });
  });
});

describe("progressBar", () => {
  it("fills the bar proportionally", () => {
    expect(progressBar(0.5, 10, 0, 100, 8, "#fff")).toContain('width="50"');
    expect(progressBar(1.5, 10, 0, 100, 8, "#fff")).toContain('width="100"');
  });

  it("keeps a minimal dot at the start and draws only the track without progress", () => {
    expect(progressBar(0, 10, 0, 100, 8, "#fff")).toContain('width="8"');
    expect(progressBar(undefined, 10, 0, 100, 8, "#fff").match(/<rect/g)).toHaveLength(1);
  });
});

describe("now playing key", () => {
  it("shows title, episode, time, client and the progress", () => {
    const svg = decode(nowPlayingKey(playing));
    expect(svg).toContain("Breaking Bad");
    expect(svg).toContain("S05E14 · Ozymandias");
    expect(svg).toContain(">10:00<tspan");
    expect(svg).toContain("/ 47:00");
    expect(svg).toContain("Office Mac");
    expect(svg).toContain(`fill="${THEME.ok}"`);
    expect(svg).not.toContain(THEME.warn);
    // Progress bar: 120 px wide track, 600/2820 filled.
    expect(svg).toContain(`width="${Math.round(120 * (600 / 2820))}" height="8"`);
  });

  it("marks paused sessions with the pause color and glyph", () => {
    const svg = decode(nowPlayingKey({ ...playing, paused: true }));
    expect(svg).toContain(`fill="${THEME.warn}"`);
    expect(svg).not.toContain(`fill="${THEME.ok}"`);
    expect(svg).not.toContain("<path");
  });

  it("leaves the title out when the user sets their own", () => {
    const svg = decode(nowPlayingKey({ ...playing, title: undefined }));
    expect(svg).not.toContain("Breaking Bad");
    expect(svg).toContain("S05E14");
  });

  it("escapes titles", () => {
    expect(escapeXml(`<a & "b">`)).toBe("&lt;a &amp; &quot;b&quot;&gt;");
    const svg = decode(nowPlayingKey({ ...playing, title: "Tom & Jerry <HD>", subtitle: undefined }));
    expect(svg).toContain("Tom &amp; Jerry");
    expect(svg).not.toContain("<HD>");
  });

  it("draws an idle placeholder and messages", () => {
    expect(decode(idleKey())).toContain("nothing playing");
    const svg = decode(messageKey("Set up", "see settings"));
    expect(svg).toContain("Set up");
    expect(svg).toContain("see settings");
  });
});

describe("dial canvas", () => {
  it("embeds the cover and shows the session position", () => {
    const svg = decode(dialCanvas({ ...playing, cover: "data:image/jpeg;base64,AAAA", index: 2, count: 3 }));
    expect(svg).toContain('width="200" height="100"');
    expect(svg).toContain('<image xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="data:image/jpeg;base64,AAAA"');
    expect(svg).toContain("Breaking Bad");
    expect(svg).toContain(">2/3<");
  });

  it("draws a placeholder without a cover and hides the position for one session", () => {
    const svg = decode(dialCanvas({ ...playing, count: 1, index: 1 }));
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain(">1/1<");
    expect(decode(dialMessage("Idle", "nothing playing"))).toContain("nothing playing");
  });
});
