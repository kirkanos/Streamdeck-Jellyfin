import { formatTicks } from "../jellyfin/model";
import { background, mix, svg, text, toDataUrl, truncate, wrapText } from "./svg";
import { THEME } from "./theme";

/** Key images are drawn at 144×144 and scaled by Stream Deck. */
const S = 144;

export type NowPlayingKey = {
  /** Series, movie or track name; omitted when the user shows their own title on the key. */
  title?: string;
  /** "S01E02 · Name", the year or the artists. */
  subtitle?: string;
  paused: boolean;
  positionTicks: number;
  runTimeTicks?: number;
  /** 0..1, undefined without a known runtime. */
  progress?: number;
  client: string;
};

/** Accent color of the playback state. */
export function stateColor(paused: boolean): string {
  return paused ? THEME.warn : THEME.ok;
}

/** Play triangle or pause bars, `size` pixels high, top-left at (x, y). */
export function stateGlyph(paused: boolean, x: number, y: number, size: number, fill = "#FFFFFF"): string {
  if (paused) {
    const w = Math.round(size * 0.3);
    const gap = Math.round(size * 0.22);
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${size}" rx="${Math.max(1, w / 4)}" fill="${fill}"/>` +
      `<rect x="${x + w + gap}" y="${y}" width="${w}" height="${size}" rx="${Math.max(1, w / 4)}" fill="${fill}"/>`
    );
  }
  const w = Math.round(size * 0.85);
  return `<path d="M ${x} ${y} L ${x + w} ${y + size / 2} L ${x} ${y + size} Z" fill="${fill}"/>`;
}

/** Horizontal progress bar; `fraction` undefined draws only the track. */
export function progressBar(fraction: number | undefined, x: number, y: number, width: number, height: number, color: string): string {
  const track = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" fill="${THEME.muted}"/>`;
  if (fraction === undefined) {
    return track;
  }
  const filled = Math.max(height, Math.round(width * Math.min(1, Math.max(0, fraction))));
  return track + `<rect x="${x}" y="${y}" width="${filled}" height="${height}" rx="${height / 2}" fill="${color}"/>`;
}

/** Position, plus the runtime when both fit on the key. */
export function timeLabel(positionTicks: number, runTimeTicks: number | undefined): { value: string; suffix?: string } {
  const value = formatTicks(positionTicks);
  if (runTimeTicks && value.length <= 5) {
    const total = formatTicks(runTimeTicks);
    if (total.length <= 5) {
      return { value, suffix: `/ ${total}` };
    }
  }
  return { value };
}

export function nowPlayingKey(k: NowPlayingKey): string {
  const color = stateColor(k.paused);
  const bg = background("bg", mix(color, THEME.base, k.paused ? 0.82 : 0.74), THEME.base, S, S);
  const accent = `<rect x="0" y="0" width="${S}" height="5" fill="${color}"/>`;

  const lines = k.title ? wrapText(k.title, 12, 2) : [];
  const names = lines.map((line, i) => text(line, { x: S / 2, y: 30 + i * 20, size: 18 })).join("");
  const subtitleY = 30 + lines.length * 20;
  const subtitle = k.subtitle ? text(truncate(k.subtitle, 20), { x: S / 2, y: subtitleY, size: 13, weight: 600, opacity: 0.8 }) : "";

  const time = timeLabel(k.positionTicks, k.runTimeTicks);
  const glyph = stateGlyph(k.paused, 14, 84, 18, color);
  const timeText = text(time.value, { x: 36, y: 100, size: 21, weight: 800, anchor: "start", suffix: time.suffix, suffixSize: 11 });

  const bar = progressBar(k.progress, 12, 110, S - 24, 8, color);
  const client = text(truncate(k.client, 20), { x: S / 2, y: 134, size: 12, weight: 600, opacity: 0.7 });

  return toDataUrl(svg(S, S, bg + accent + names + subtitle + glyph + timeText + bar + client));
}

/** Gray key shown while nothing plays. */
export function idleKey(): string {
  return toDataUrl(
    svg(
      S,
      S,
      background("bg", THEME.surface, THEME.base, S, S) +
        stateGlyph(false, 60, 40, 30, THEME.idle) +
        text("Idle", { x: S / 2, y: 100, size: 22, weight: 800, fill: THEME.subtle }) +
        text("nothing playing", { x: S / 2, y: 122, size: 13, weight: 600, fill: THEME.idle }),
    ),
  );
}

/** Neutral key with two lines of text, e.g. "Set up / see settings" or "Offline". */
export function messageKey(title: string, subtitle: string): string {
  return toDataUrl(
    svg(
      S,
      S,
      background("bg", THEME.surface, THEME.base, S, S) +
        `<rect x="3" y="3" width="${S - 6}" height="${S - 6}" rx="14" fill="none" stroke="${THEME.muted}" stroke-width="2"/>` +
        text(title, { x: S / 2, y: 68, size: 22, weight: 800 }) +
        text(subtitle, { x: S / 2, y: 92, size: 15, weight: 600, fill: THEME.subtle }),
    ),
  );
}
