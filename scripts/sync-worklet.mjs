/**
 * Copies the spessasynth AudioWorklet processor into public/ so the browser can
 * load it with audioWorklet.addModule(). Runs before dev and build so the copy
 * never drifts from the installed package version.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = resolve(root, "node_modules/spessasynth_lib/dist/spessasynth_processor.min.js");
const to = resolve(root, "public/worklets/spessasynth_processor.min.js");

await mkdir(dirname(to), { recursive: true });
await copyFile(from, to);
console.log(`[sync-worklet] ${from} -> ${to}`);
