/**
 * Opening and saving MIDI files.
 *
 * Reading and writing go through two small Rust commands rather than the
 * filesystem plugin, so the webview is never granted broad disk access: it can
 * only ask the backend to touch a path with a MIDI extension.
 *
 * Running `npm run dev` in a plain browser has no Tauri backend, so the same
 * functions fall back to a file input and a download. That keeps the frontend
 * developable without launching the whole desktop shell.
 */

import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

const MIDI_FILTER = { name: "MIDI", extensions: ["mid", "midi", "rmi"] };

export interface OpenedFile {
  bytes: Uint8Array;
  /** Absolute path, or null when opened through a browser file input. */
  path: string | null;
  name: string;
}

export class FileOperationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FileOperationError";
  }
}

/**
 * True when running inside the Tauri shell rather than a plain browser tab.
 *
 * Exported because several Tauri APIs, getCurrentWindow among them, throw the
 * moment they are called outside the shell rather than rejecting a promise. A
 * try/catch around the await is too late, so callers have to check first.
 */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

async function openViaBrowser(): Promise<OpenedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".mid,.midi,.rmi,audio/midi";

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file
        .arrayBuffer()
        .then((buffer) =>
          resolve({ bytes: new Uint8Array(buffer), path: null, name: file.name }),
        )
        .catch((cause) => reject(new FileOperationError("That file could not be read.", { cause })));
    });

    // A cancelled picker fires no change event in some browsers, so a focus
    // return with no file selected resolves as a cancel rather than hanging.
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (!input.files || input.files.length === 0) resolve(null);
        }, 300);
      },
      { once: true },
    );

    input.click();
  });
}

export async function openMidiFile(): Promise<OpenedFile | null> {
  if (!isTauriRuntime()) return openViaBrowser();

  const selected = await openDialog({ multiple: false, filters: [MIDI_FILTER] });
  if (typeof selected !== "string") return null;

  try {
    const bytes = await invoke<number[]>("read_midi_file", { path: selected });
    return { bytes: new Uint8Array(bytes), path: selected, name: baseName(selected) };
  } catch (cause) {
    throw new FileOperationError(
      typeof cause === "string" ? cause : "That file could not be read.",
      { cause },
    );
  }
}

/** Reads a path handed over by a drag and drop onto the window. */
export async function readMidiPath(path: string): Promise<OpenedFile> {
  try {
    const bytes = await invoke<number[]>("read_midi_file", { path });
    return { bytes: new Uint8Array(bytes), path, name: baseName(path) };
  } catch (cause) {
    throw new FileOperationError(
      typeof cause === "string" ? cause : "That file could not be read.",
      { cause },
    );
  }
}

function saveViaBrowser(bytes: Uint8Array, suggestedName: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Writes the file and returns the path it went to, or null if the person
 * cancelled the dialog.
 */
export async function saveMidiFile(
  bytes: Uint8Array,
  suggestedName: string,
  existingPath: string | null,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    saveViaBrowser(bytes, suggestedName);
    return null;
  }

  const target =
    existingPath ?? (await saveDialog({ defaultPath: suggestedName, filters: [MIDI_FILTER] }));
  if (typeof target !== "string") return null;

  try {
    await invoke("write_midi_file", { path: target, contents: Array.from(bytes) });
    return target;
  } catch (cause) {
    throw new FileOperationError(
      typeof cause === "string" ? cause : "That file could not be saved.",
      { cause },
    );
  }
}

export async function saveMidiFileAs(
  bytes: Uint8Array,
  suggestedName: string,
): Promise<string | null> {
  return saveMidiFile(bytes, suggestedName, null);
}
