import { useEffect, useRef, type RefObject } from 'react';

interface VncTouchPadProps {
  /** noVNC host div that contains the canvas */
  hostRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
}

const TAP_MS = 280;
const DOUBLE_TAP_MS = 350;
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
    detail: type === 'mouseup' || type === 'mousedown' ? 1 : 0,
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
 * Moonlight-style trackpad overlay (no extra cursor — the remote pointer is the cursor).
 * One-finger drag moves. Tap = click. Two taps = double-click. Two-finger tap = right-click.
 * Two-finger drag scrolls.
 */
export function VncTouchPad({ hostRef, enabled }: VncTouchPadProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const gesture = useRef({
    fingers: 0,
    startTime: 0,
    moved: false,
    lastX: 0,
    lastY: 0,
    lastMidX: 0,
    lastMidY: 0,
    lastTapAt: 0,
  });

  useEffect(() => {
    if (!enabled) return;
    const overlay = overlayRef.current;
    if (!overlay) return;

    const canvasNow = () => canvasOf(hostRef.current);

    const clamp = (canvas: HTMLCanvasElement, x: number, y: number) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(Math.max(1, r.width - 1), x)),
        y: Math.max(0, Math.min(Math.max(1, r.height - 1), y)),
      };
    };

    const click = (canvas: HTMLCanvasElement, button: 0 | 2) => {
      const c = clientOf(canvas, pos.current.x, pos.current.y);
      const buttons = button === 0 ? 1 : 2;
      fireMouse(canvas, 'mousemove', c.x, c.y, 0);
      fireMouse(canvas, 'mousedown', c.x, c.y, buttons, button);
      fireMouse(canvas, 'mouseup', c.x, c.y, 0, button);
    };

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const t = e.touches;
      const g = gesture.current;
      g.fingers = Math.max(g.fingers, t.length);
      g.startTime = Date.now();
      g.moved = false;
      if (t.length === 1) {
        g.lastX = t[0].clientX;
        g.lastY = t[0].clientY;
      } else if (t.length >= 2) {
        g.lastMidX = (t[0].clientX + t[1].clientX) / 2;
        g.lastMidY = (t[0].clientY + t[1].clientY) / 2;
      }
    };

    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const canvas = canvasNow();
      if (!canvas) return;
      const t = e.touches;
      const g = gesture.current;
      if (t.length === 1) {
        const dx = (t[0].clientX - g.lastX) * SENSITIVITY;
        const dy = (t[0].clientY - g.lastY) * SENSITIVITY;
        g.lastX = t[0].clientX;
        g.lastY = t[0].clientY;
        if (Math.hypot(dx, dy) > 1) g.moved = true;
        pos.current = clamp(canvas, pos.current.x + dx, pos.current.y + dy);
        const c = clientOf(canvas, pos.current.x, pos.current.y);
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
    };

    const onEnd = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.touches.length > 0) return;
      const canvas = canvasNow();
      const g = gesture.current;
      if (!canvas) {
        g.fingers = 0;
        return;
      }
      const dt = Date.now() - g.startTime;
      const tap = !g.moved && dt <= TAP_MS;
      if (tap) {
        if (g.fingers >= 2) {
          click(canvas, 2);
          g.lastTapAt = 0;
        } else {
          const now = Date.now();
          const dbl = g.lastTapAt > 0 && now - g.lastTapAt <= DOUBLE_TAP_MS;
          click(canvas, 0);
          if (dbl) {
            click(canvas, 0);
            g.lastTapAt = 0;
          } else {
            g.lastTapAt = now;
          }
        }
      } else {
        g.lastTapAt = 0;
      }
      g.fingers = 0;
    };

    const block = (e: Event) => {
      e.preventDefault();
    };

    const opts: AddEventListenerOptions = { passive: false, capture: true };
    overlay.addEventListener('touchstart', onStart, opts);
    overlay.addEventListener('touchmove', onMove, opts);
    overlay.addEventListener('touchend', onEnd, opts);
    overlay.addEventListener('touchcancel', onEnd, opts);
    overlay.addEventListener('gesturestart', block, opts);
    overlay.addEventListener('gesturechange', block, opts);
    overlay.addEventListener('dblclick', block, opts);

    const canvas = canvasNow();
    if (canvas) {
      const r = canvas.getBoundingClientRect();
      pos.current = { x: r.width / 2, y: r.height / 2 };
    }

    return () => {
      overlay.removeEventListener('touchstart', onStart, opts);
      overlay.removeEventListener('touchmove', onMove, opts);
      overlay.removeEventListener('touchend', onEnd, opts);
      overlay.removeEventListener('touchcancel', onEnd, opts);
      overlay.removeEventListener('gesturestart', block, opts);
      overlay.removeEventListener('gesturechange', block, opts);
      overlay.removeEventListener('dblclick', block, opts);
    };
  }, [enabled, hostRef]);

  if (!enabled) return null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10"
      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
    />
  );
}
