/**
 * A dismissible message strip for errors and notices.
 *
 * Errors use an icon and a word as well as colour, so the message still reads
 * as an error to someone who cannot distinguish the red.
 */

import { AlertTriangle, Info, X } from "lucide-react";
import { IconButton } from "./IconButton";
import "./StatusBanner.css";

interface StatusBannerProps {
  tone: "error" | "info";
  message: string;
  onDismiss: () => void;
}

export function StatusBanner({ tone, message, onDismiss }: StatusBannerProps) {
  const Icon = tone === "error" ? AlertTriangle : Info;

  return (
    <div className="status-banner" data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      <Icon size={15} strokeWidth={2} aria-hidden="true" />
      <span className="status-banner__label">{tone === "error" ? "Error" : "Note"}</span>
      <p className="status-banner__message">{message}</p>
      <IconButton icon={X} label="Dismiss this message" size="sm" onClick={onDismiss} />
    </div>
  );
}
