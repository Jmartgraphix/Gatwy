import { useCallback, useEffect, useRef, type RefObject } from 'react';

interface VncTouchPadProps {
  /** noVNC host div that contains the canvas */
  hostRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
}

const TAP_MS = 280;
const SENSITIVITY = 1.15;
const SCROLL_SCALE = 0.6;

function canvasOf(host: HTMLDivElement | null): HTMLCanvasElement | null {
  return host?.querySelector('canvas') ?? null;
}

function fireMouse(
  canvas: HTMLCanvasElement,
  type: 'mousemove' | 'mousedown' | 'mouseup',
  clientX: number,
  clientY: number,
  buttons: number,
  button = 0,
): void {
  canvas.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX,
    clientY,
    buttons,
    button,
  }));
}

function fireWheel(canvas: HTMLCanvasElement, clientX: number, clientY: number, deltaX: number, deltaY: number): void {
  canvas.dispatchEvent(new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX,
    clientY,
    deltaX,
    deltaY,
    deltaMode: 0,
  }));
}

function clientOf(canvas: HTMLCanvasElement, x: number, y: number): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: r.left + x, y: r.top + y };
}

/**
 * Moonlight-style trackpad overlay.
 * One-finger drag moves the cursor. Tap = left click. Two-finger tap = right click.
 * Two-finger drag scrolls.
 */
export function VncTouchPad({ hostRef, enabled }: VncTouchPadProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const cursorEl = useRef<HTMLDivElement>(null);
  const gesture = useRef({
    fingers: 0,
    startTime: 0,
    moved: false,
    lastX: 0,
    lastY: 0,
    lastMidX: 0,
    lastMidY: 0,
  });

  const placeCursor = useCallback((x: number, y: number) => {
    const el = cursorEl.current;
    if (!el) return;
    el.style.transform = `translate(${x}px, ${y}px)`;
  }, []);

  const clampToCanvas = useCallback((canvas: HTMLCanvasElement, x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width - 1);
    const h = Math.max(1, r.height - 1);
    return {
      x: Math.max(0, Math.min(w, x)),
      y: Math.max(0, Math.min(h, y)),
    };
  }, []);

  useEffect(() => {
    const canvas = canvasOf(hostRef.current);
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    pos.current = { x: r.width / 2, y: r.height / 2 };
    placeCursor(pos.current.x, pos.current.y);
  }, [enabled, hostRef, placeCursor]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    const t = e.touches;
    const g = gesture.current;
    g.fingers = t.length;
    g.startTime = Date.now();
    g.moved = false;
    if (t.length === 1) {
      g.lastX = t[0].clientX;
      g.lastY = t[0].clientY;
    } else if (t.length >= 2) {
      g.lastMidX = (t[0].clientX + t[1].clientX) / 2;
      g.lastMidY = (t[0].clientY + t[1].clientY) / 2;
    }
  }, [enabled]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasOf(hostRef.current);
    if (!canvas) return;
    const t = e.touches;
    const g = gesture.current;

    if (t.length === 1) {
      const dx = (t[0].clientX - g.lastX) * SENSITIVITY;
      const dy = (t[0].clientY - g.lastY) * SENSITIVITY;
      g.lastX = t[0].clientX;
      g.lastY = t[0].clientY;
      if (Math.hypot(dx, dy) > 1) g.moved = true;
      const next = clampToCanvas(canvas, pos.current.x + dx, pos.current.y + dy);
      pos.current = next;
      placeCursor(next.x, next.y);
      const c = clientOf(canvas, next.x, next.y);
      fireMouse(canvas, 'mousemove', c.x, c.y, 0);
    } else if (t.length >= 2) {
      const midX = (t[0].clientX + t[1].clientX) / 2;
      const midY = (t[0].clientY + t[1].clientY) / 2;
      const dx = midX - g.lastMidX;
      const dy = midY - g.lastMidY;
      g.lastMidX = midX;
      g.lastMidY = midY;
      if (Math.hypot(dx, dy) > 1) g.moved = true;
      const c = clientOf(canvas, pos.current.x, pos.current.y);
      fireWheel(canvas, c.x, c.y, -dx * SCROLL_SCALE, -dy * SCROLL_SCALE);
    }
  }, [clampToCanvas, enabled, hostRef, placeCursor]);

  const clickAtCursor = useCallback((canvas: HTMLCanvasElement, button: 0 | 2) => {
    const c = clientOf(canvas, pos.current.x, pos.current.y);
    const buttons = button === 0 ? 1 : 2;
    fireMouse(canvas, 'mousemove', c.x, c.y, 0);
    fireMouse(canvas, 'mousedown', c.x, c.y, buttons, button);
    fireMouse(canvas, 'mouseup', c.x, c.y, 0, button);
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasOf(hostRef.current);
    if (!canvas) return;
    const g = gesture.current;
    const remaining = e.touches.length;
    if (remaining > 0) {
      g.fingers = remaining;
      return;
    }
    const dt = Date.now() - g.startTime;
    const tap = !g.moved && dt <= TAP_MS;
    if (tap) {
      clickAtCursor(canvas, g.fingers >= 2 ? 2 : 0);
    }
    g.fingers = 0;
  }, [clickAtCursor, enabled, hostRef]);

  if (!enabled) return null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10 touch-none"
      style={{ touchAction: 'none' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        ref={cursorEl}
        className="pointer-events-none absolute top-0 left-0 -translate-x-px -translate-y-px"
        aria-hidden
      >
        <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
          <path
            d="M1.5 1.5 L1.5 17.5 L6.2 13.2 L9.8 20.6 L12.4 19.4 L8.7 12.1 L15.2 12.1 Z"
            fill="white"
            stroke="black"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
