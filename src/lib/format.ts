/** Formatting helpers for the readouts in the transport bar. */

/** Seconds as m:ss.t, matching how a player shows elapsed time. */
export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}.${tenths}`;
}

/** Musical position as bar.beat, counting from one. */
export function formatBarBeat(bar: number, beat: number): string {
  return `${bar}.${beat}`;
}

/**
 * Tempo for display. MIDI stores tempo as whole microseconds per quarter note,
 * so an exact 90bpm comes back as 90.00009. Rounding here keeps the readout
 * sane while the document keeps the precise value for a lossless save.
 */
export function formatTempo(bpm: number): string {
  const rounded = Math.round(bpm * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatTimeSignature(numerator: number, denominator: number): string {
  return `${numerator}/${denominator}`;
}
