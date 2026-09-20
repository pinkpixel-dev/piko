/**
 * Undo history.
 *
 * Every edit produces a new document while leaving untouched tracks as the same
 * array references, so a snapshot costs roughly one track's worth of memory
 * rather than the whole song. That makes plain snapshots cheap enough here and
 * avoids the bookkeeping an inverse-command system would need.
 */

const HISTORY_LIMIT = 200;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Records a new state as the present, discarding any redo branch. */
export function pushHistory<T>(history: History<T>, next: T): History<T> {
  const past = [...history.past, history.present];
  // Oldest entries fall off the back so a long session cannot grow forever.
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [] };
}

/** Replaces the present without creating an undo step. */
export function replacePresent<T>(history: History<T>, next: T): History<T> {
  return { ...history, present: next };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  const past = [...history.past];
  const present = past.pop() as T;
  return { past, present, future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;
  const [present, ...future] = history.future;
  return { past: [...history.past, history.present], present, future };
}

export function resetHistory<T>(present: T): History<T> {
  return createHistory(present);
}
