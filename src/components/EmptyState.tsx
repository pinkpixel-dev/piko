/**
 * What the window shows before a file is open. It states the one action worth
 * taking rather than sitting blank.
 */

import { FolderOpen, Music4 } from "lucide-react";
import "./EmptyState.css";

interface EmptyStateProps {
  onOpen: () => void;
}

export function EmptyState({ onOpen }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__inner">
        <Music4 size={26} strokeWidth={1.5} aria-hidden="true" />
        <h2>No song open</h2>
        <p>
          Open a MIDI file to see its notes on the piano roll. You can also drop a file straight
          onto this window.
        </p>
        <button type="button" className="empty-state__action" onClick={onOpen}>
          <FolderOpen size={15} strokeWidth={2} aria-hidden="true" />
          Open a MIDI file
        </button>
      </div>
    </div>
  );
}
