/**
 * Icon-only button with a label available to everyone: a tooltip on hover and
 * on keyboard focus, and an aria-label for screen readers. An icon button with
 * no label is unusable for anyone who does not already recognise the icon.
 *
 * The tooltip is rendered into document.body through a portal rather than
 * being positioned inside the button. Several of these buttons sit inside
 * scrolling panels, and an absolutely positioned tooltip is clipped by any
 * ancestor with overflow set. A portal escapes that, and being fixed-position
 * it can also flip above the button when there is no room below, which is what
 * the buttons in the transport bar need.
 */

import { useCallback, useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./IconButton.css";

export interface IconButtonProps {
  icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  label: string;
  onClick?: () => void;
  /** Marks a toggle as on, and exposes that state to assistive software. */
  active?: boolean;
  disabled?: boolean;
  /** Colour hint for a toggle that is on, such as mute or solo. */
  tone?: "default" | "accent" | "mute" | "solo" | "danger";
  size?: "sm" | "md" | "lg";
  /** Set when the button toggles, so aria-pressed is reported correctly. */
  isToggle?: boolean;
  children?: ReactNode;
}

const ICON_SIZES = { sm: 14, md: 16, lg: 20 } as const;
const TOOLTIP_GAP = 8;
/** Room a tooltip needs below the button before it flips above it. */
const TOOLTIP_SPACE = 48;
/** Smallest gap kept between a tooltip and the window edge. */
const TOOLTIP_MARGIN = 6;
/** Rough half-width used to keep a tooltip inside the window before measuring. */
const TOOLTIP_HALF_WIDTH = 70;

interface TooltipPosition {
  left: number;
  top: number;
  placement: "top" | "bottom";
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
  tone = "default",
  size = "md",
  isToggle = false,
  children,
}: IconButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const tooltipId = useId();

  const show = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom > TOOLTIP_SPACE;

    // The tooltip is centred on the button, so one near either edge of the
    // window would hang off it. Clamping the centre keeps the whole label on
    // screen, which matters most for the leftmost and rightmost buttons in the
    // toolbar and the track rail.
    const minCentre = TOOLTIP_MARGIN + TOOLTIP_HALF_WIDTH;
    const maxCentre = window.innerWidth - TOOLTIP_MARGIN - TOOLTIP_HALF_WIDTH;
    const centre = rect.left + rect.width / 2;

    setPosition({
      left: Math.min(Math.max(centre, minCentre), Math.max(minCentre, maxCentre)),
      top: below ? rect.bottom + TOOLTIP_GAP : rect.top - TOOLTIP_GAP,
      placement: below ? "bottom" : "top",
    });
  }, []);

  const hide = useCallback(() => setPosition(null), []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        data-size={size}
        data-tone={tone}
        data-active={active || undefined}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-describedby={position ? tooltipId : undefined}
        aria-pressed={isToggle ? active : undefined}
        onPointerEnter={(event) => {
          // A touch never hovers, so showing a tooltip there would only appear
          // after the tap has already done something.
          if (event.pointerType === "mouse") show();
        }}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <Icon size={ICON_SIZES[size]} strokeWidth={2} />
        {children}
      </button>

      {position
        ? createPortal(
            <span
              id={tooltipId}
              role="tooltip"
              className="icon-tooltip"
              data-placement={position.placement}
              style={{ left: position.left, top: position.top }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
