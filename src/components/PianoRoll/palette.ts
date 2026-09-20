/**
 * Reads drawing colours from the CSS custom properties in tokens.css.
 *
 * The canvas cannot use CSS variables directly, so they are resolved once from
 * the document and cached. Keeping the values in CSS means the stylesheet stays
 * the single source of truth rather than colours being duplicated in script.
 */

import { TRACK_COLOR_COUNT } from "../../midi/types";

export interface RollPalette {
  background: string;
  rowBlack: string;
  lineBeat: string;
  lineBar: string;
  lineOctave: string;
  loopRegion: string;
  loopEdge: string;
  selection: string;
  selectionFill: string;
  trackColors: string[];
  noteOutline: string;
  textMuted: string;
}

let cached: RollPalette | null = null;

function readToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

export function getRollPalette(): RollPalette {
  if (cached) return cached;

  const styles = getComputedStyle(document.documentElement);
  const trackColors: string[] = [];
  for (let index = 0; index < TRACK_COLOR_COUNT; index += 1) {
    trackColors.push(readToken(styles, `--track-${index + 1}`, "#888888"));
  }

  const palette: RollPalette = {
    trackColors,
    background: readToken(styles, "--roll-bg", "#1a1b1f"),
    rowBlack: readToken(styles, "--roll-row-black", "#141519"),
    lineBeat: readToken(styles, "--roll-line-beat", "#232429"),
    lineBar: readToken(styles, "--roll-line-bar", "#33353c"),
    lineOctave: readToken(styles, "--roll-line-octave", "#2b2d33"),
    loopRegion: readToken(styles, "--loop-region", "rgba(80,180,200,0.1)"),
    loopEdge: readToken(styles, "--loop-edge", "rgba(80,180,200,0.55)"),
    selection: readToken(styles, "--accent", "#4fc3d9"),
    selectionFill: readToken(styles, "--accent-muted", "rgba(80,180,200,0.16)"),
    noteOutline: readToken(styles, "--text-primary", "#f5f5f7"),
    textMuted: readToken(styles, "--text-muted", "#9a9aa2"),
  };

  cached = palette;
  return palette;
}

/** Drops the cache so the next draw re-reads the stylesheet. */
export function invalidateRollPalette(): void {
  cached = null;
}
