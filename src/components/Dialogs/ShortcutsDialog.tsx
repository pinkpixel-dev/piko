/** Lists every keyboard shortcut, grouped by what it affects. */

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { APP_NAME, APP_VERSION } from "../../lib/app-info";
import { SHORTCUTS, SHORTCUT_GROUPS } from "../../lib/shortcuts";
import { IconButton } from "../common/IconButton";
import "./ShortcutsDialog.css";

interface ShortcutsDialogProps {
  onClose: () => void;
}

export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  const closeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeRef.current?.querySelector("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="shortcuts__backdrop" onPointerDown={onClose}>
      <div
        className="shortcuts"
        ref={closeRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="shortcuts__header">
          <h2>Keyboard shortcuts</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>

        <div className="shortcuts__body">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group} className="shortcuts__group">
              <h3>{group}</h3>
              <dl>
                {SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
                  <div key={shortcut.id} className="shortcuts__item">
                    <dt>{shortcut.description}</dt>
                    <dd>
                      <kbd>{shortcut.keys}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <footer className="shortcuts__footer">
          <span>
            {APP_NAME} {APP_VERSION}
          </span>
          <span>On a Mac, use Command in place of Ctrl.</span>
        </footer>
      </div>
    </div>
  );
}
