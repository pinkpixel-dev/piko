/**
 * The application shell. Owns file actions, drag and drop, the window title,
 * and the one-off notices shown in the banner.
 */

import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { APP_NAME } from "./lib/app-info";
import {
  isTauriRuntime,
  openMidiFile,
  readMidiPath,
  saveMidiFile,
  saveMidiFileAs,
  type OpenedFile,
} from "./lib/files";
import { useKeyboardShortcuts } from "./lib/useKeyboardShortcuts";
import { serialiseMidi, suggestedFileName } from "./midi/export";
import { parseMidi } from "./midi/import";
import { MAX_PITCH, pitchRange } from "./midi/types";
import { useEditorStore } from "./state/editorStore";
import { useProjectStore } from "./state/projectStore";
import { useTransportStore } from "./state/transportStore";
import { EmptyState } from "./components/EmptyState";
import { PianoRoll } from "./components/PianoRoll/PianoRoll";
import { ShortcutsDialog } from "./components/Dialogs/ShortcutsDialog";
import { StatusBanner } from "./components/common/StatusBanner";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { TrackRail } from "./components/TrackRail/TrackRail";
import { Transport } from "./components/Transport/Transport";
import "./App.css";

interface Notice {
  tone: "error" | "info";
  message: string;
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function App() {
  const doc = useProjectStore((state) => state.history.present);
  const filePath = useProjectStore((state) => state.filePath);
  const isDirty = useProjectStore((state) => state.isDirty);
  const loadProject = useProjectStore((state) => state.loadProject);
  const markSaved = useProjectStore((state) => state.markSaved);

  const setActiveTrackId = useEditorStore((state) => state.setActiveTrackId);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const setScrollTicks = useEditorStore((state) => state.setScrollTicks);
  const setTopPitch = useEditorStore((state) => state.setTopPitch);
  const railOpen = useEditorStore((state) => state.railOpen);
  const setRailOpen = useEditorStore((state) => state.setRailOpen);

  const engineStatus = useTransportStore((state) => state.status);
  const engineError = useTransportStore((state) => state.errorMessage);
  const stop = useTransportStore((state) => state.stop);
  const clearLoop = useTransportStore((state) => state.clearLoop);

  const [notice, setNotice] = useState<Notice | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const adoptFile = useCallback(
    (file: OpenedFile) => {
      const parsed = parseMidi(file.bytes, file.name);
      stop();
      clearLoop();
      clearSelection();
      setScrollTicks(0);

      // Frame the song vertically. Without this a file whose notes sit low on
      // the keyboard opens showing empty staves, and you have to scroll to find
      // the music. A couple of rows of headroom keeps the top note off the edge.
      const range = pitchRange(parsed);
      if (range) setTopPitch(Math.min(MAX_PITCH, range.high + 2));

      loadProject(parsed, file.path);
      setActiveTrackId(parsed.tracks[0]?.id ?? null);
      setNotice(null);
    },
    [clearLoop, clearSelection, loadProject, setActiveTrackId, setScrollTicks, setTopPitch, stop],
  );

  const handleOpen = useCallback(async () => {
    setIsBusy(true);
    try {
      const file = await openMidiFile();
      if (file) adoptFile(file);
    } catch (error) {
      setNotice({ tone: "error", message: describeError(error, "That file could not be opened.") });
    } finally {
      setIsBusy(false);
    }
  }, [adoptFile]);

  const writeFile = useCallback(
    async (forceNewPath: boolean) => {
      if (doc.tracks.length === 0) return;
      setIsBusy(true);
      try {
        const bytes = serialiseMidi(doc);
        const name = suggestedFileName(doc);
        const written = forceNewPath
          ? await saveMidiFileAs(bytes, name)
          : await saveMidiFile(bytes, name, filePath);

        if (written) {
          markSaved(written);
          setNotice({ tone: "info", message: `Saved to ${written}` });
        }
      } catch (error) {
        setNotice({ tone: "error", message: describeError(error, "That file could not be saved.") });
      } finally {
        setIsBusy(false);
      }
    },
    [doc, filePath, markSaved],
  );

  const handleSave = useCallback(() => void writeFile(false), [writeFile]);
  const handleSaveAs = useCallback(() => void writeFile(true), [writeFile]);

  useKeyboardShortcuts({
    onOpen: handleOpen,
    onSave: handleSave,
    onSaveAs: handleSaveAs,
    onToggleShortcuts: () => setShowShortcuts((open) => !open),
  });

  // Start the audio engine as soon as the app loads. It cannot make sound until
  // a user gesture resumes the context, but loading the soundfont ahead of time
  // means the first press of play is immediate.
  useEffect(() => {
    void useTransportStore.getState().prepare();
  }, []);

  // Files dropped on the window. Tauri intercepts the drop itself when
  // dragDropEnabled is on, so the event comes from the window rather than the
  // DOM, and it carries real paths.
  useEffect(() => {
    // No Tauri window to listen to when the frontend runs in a plain browser
    // during development. Opening through the toolbar still works there.
    if (!isTauriRuntime()) return;

    let unlisten: (() => void) | undefined;

    getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const path = event.payload.paths.find((candidate) =>
          /\.(mid|midi|rmi)$/i.test(candidate),
        );
        if (!path) {
          setNotice({ tone: "error", message: "Drop a .mid, .midi, or .rmi file." });
          return;
        }
        readMidiPath(path)
          .then(adoptFile)
          .catch((error) =>
            setNotice({
              tone: "error",
              message: describeError(error, "That file could not be opened."),
            }),
          );
      })
      .then((dispose) => {
        unlisten = dispose;
      })
      .catch(() => {
        // The window refused the listener; drag and drop is simply unavailable.
      });

    return () => unlisten?.();
  }, [adoptFile]);

  // Keep the window title in step with the song and its saved state.
  useEffect(() => {
    const title = doc.tracks.length === 0 ? APP_NAME : `${doc.name}${isDirty ? " •" : ""} — ${APP_NAME}`;
    document.title = title;
    if (!isTauriRuntime()) return;
    getCurrentWindow()
      .setTitle(title)
      .catch(() => {
        // A failed title update is not worth surfacing to the person.
      });
  }, [doc.name, doc.tracks.length, isDirty]);

  // Warn before closing with unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const banner = notice ?? (engineStatus === "error" && engineError
    ? { tone: "error" as const, message: engineError }
    : null);

  return (
    <div className="app">
      <Toolbar
        onOpen={handleOpen}
        onSave={handleSave}
        onShowShortcuts={() => setShowShortcuts(true)}
        isBusy={isBusy}
      />

      {banner ? (
        <StatusBanner
          tone={banner.tone}
          message={banner.message}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      <main className="app__body" data-rail-open={railOpen || undefined}>
        {doc.tracks.length === 0 ? (
          <EmptyState onOpen={handleOpen} />
        ) : (
          <>
            <TrackRail />
            {/*
              On a narrow screen the rail slides over the roll, so a tap on the
              roll should put it away again. The scrim only exists while the
              rail is open, and is hidden entirely on a wide window.
            */}
            <div
              className="app__scrim"
              onPointerDown={() => setRailOpen(false)}
              aria-hidden="true"
            />
            <PianoRoll />
          </>
        )}
      </main>

      <Transport />

      {showShortcuts ? <ShortcutsDialog onClose={() => setShowShortcuts(false)} /> : null}
    </div>
  );
}
