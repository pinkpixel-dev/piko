/**
 * Monotonic id generator.
 *
 * Ids only need to be unique inside one running session, not globally, so a
 * counter beats crypto.randomUUID() here: it is faster when importing a file
 * with tens of thousands of notes, and it produces shorter keys.
 */

let counter = 0;

export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${counter.toString(36)}`;
}
