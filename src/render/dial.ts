import { progressBar, stateColor, stateGlyph, timeLabel } from "./keys";
import { background, mix, svg, text, toDataUrl, truncate } from "./svg";
import { THEME } from "./theme";

/** Touch strip segment of one dial (Stream Deck + / + XL). */
const W = 200;
const H = 100;
/** Width of the cover column on the left. */
const COVER_W = 68;

export type DialCanvas = {
  title: string;
  subtitle?: string;
  /** Cover as data URL (PNG/JPEG); a placeholder is drawn without one. */
  cover?: string;
  paused: boolean;
  positionTicks: number;
  runTimeTicks?: number;
  progress?: number;
  client: string;
  /** Position in the session list, shown as "2/3" when several sessions play. */
  index?: number;
  count?: number;
};

function coverArt(cover: string | undefined): string {
  const clip = `<clipPath id="cover"><rect x="0" y="0" width="${COVER_W}" height="${H}"/></clipPath>`;
  if (!cover) {
    return (
      `<rect x="0" y="0" width="${COVER_W}" height="${H}" fill="${THEME.muted}" fill-opacity="0.6"/>` +
      stateGlyph(false, 26, 36, 28, THEME.subtle)
    );
  }
  return (
    `<defs>${clip}</defs>` +
    `<image xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${cover}" href="${cover}" x="0" y="0" width="${COVER_W}" height="${H}" ` +
    `preserveAspectRatio="xMidYMid slice" clip-path="url(#cover)"/>`
  );
}

export function dialCanvas(d: DialCanvas): string {
  const color = stateColor(d.paused);
  const bg = background("bg", mix(color, THEME.base, 0.8), THEME.base, W, H);
  const x = COVER_W + 10;

  const title = text(truncate(d.title, 15), { x, y: 24, size: 16, anchor: "start" });
  const subtitle = d.subtitle ? text(truncate(d.subtitle, 18), { x, y: 42, size: 12, weight: 600, opacity: 0.8, anchor: "start" }) : "";
  const client = text(truncate(d.client, 20), { x, y: 58, size: 11, weight: 600, opacity: 0.6, anchor: "start" });

  const time = timeLabel(d.positionTicks, d.runTimeTicks);
  const glyph = stateGlyph(d.paused, x, 67, 12, color);
  const timeText = text(time.value, { x: x + 17, y: 78, size: 14, weight: 800, anchor: "start", suffix: time.suffix, suffixSize: 9 });
  const index =
    d.count && d.count > 1 && d.index ? text(`${d.index}/${d.count}`, { x: W - 8, y: 78, size: 11, weight: 600, opacity: 0.7, anchor: "end" }) : "";

  const bar = progressBar(d.progress, x, 86, W - x - 8, 6, color);

  return toDataUrl(svg(W, H, bg + coverArt(d.cover) + title + subtitle + client + glyph + timeText + index + bar));
}

export function dialMessage(title: string, subtitle: string): string {
  return toDataUrl(
    svg(
      W,
      H,
      background("bg", THEME.surface, THEME.base, W, H) +
        text(title, { x: 12, y: 44, size: 20, weight: 800, anchor: "start" }) +
        text(subtitle, { x: 12, y: 70, size: 14, weight: 600, fill: THEME.subtle, anchor: "start" }),
    ),
  );
}
