import { useEffect, useRef, type RefObject } from 'react';

interface VncTouchPadProps {
  hostRef: RefObject<HTMLDivElement | null>;
  rfbRef: RefObject<object | null>;
  enabled: boolean;
}

const TAP_MS = 280;
const DOUBLE_TAP_MS = 350;
const SENSITIVITY = 1.15;
const SCROLL_SCALE = 0.55;

function canvasOf(host: HTMLDivElement | null): HTMLCanvasElement | null {
  return host?.querySelector('canvas') ?? null;
}

function hideNovncJunk(): void {
  document.getElementById('noVNC_mouse_capture_elem')?.remove();
  const cap = document.querySelector('[id*="noVNC_mouse_capture"]');
  if (cap instanceof HTMLElement) cap.remove();
}

function fireMouse(
  canvas: HTMLCanvasElement,
  type: 'mousemove' | 'mousedown' | 'mouseup',
  clientX: number,
  clientY: number,
  buttons: number,
  button = 0,
  detail = 1,
): void {
  canvas.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX,
    clientY,
    buttons,
    button,
    detail,
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

/**
 * Moonlight-style trackpad. One local cursor on the overlay (the remote
 * sprite is hidden so there is not a second pointer). Finger drag moves it.
 * Tap = click, double-tap = double-click, two-finger tap = right-click,
 * two-finger drag = scroll.
 */
export function VncTouchPad({ hostRef, enabled }: VncTouchPadProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
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

    const placeCursor = (x: number, y: number) => {
      const el = cursorRef.current;
      if (!el) return;
      el.style.transform = `translate(${x}px, ${y}px)`;
    };

    const clamp = (canvas: HTMLCanvasElement, x: number, y: number) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(Math.max(1, r.width - 1), x)),
        y: Math.max(0, Math.min(Math.max(1, r.height - 1), y)),
      };
    };

    const client = (canvas: HTMLCanvasElement) => {
      const r = canvas.getBoundingClientRect();
      return { x: r.left + pos.current.x, y: r.top + pos.current.y };
    };

    const moveRemote = (canvas: HTMLCanvasElement) => {
      const c = client(canvas);
      fireMouse(canvas, 'mousemove', c.x, c.y, 0, 0, 0);
      hideNovncJunk();
    };

    const click = (canvas: HTMLCanvasElement, button: 0 | 2, detail = 1) => {
      const c = client(canvas);
      const buttons = button === 0 ? 1 : 2;
      fireMouse(canvas, 'mousemove', c.x, c.y, 0, 0, 0);
      fireMouse(canvas, 'mousedown', c.x, c.y, buttons, button, detail);
      fireMouse(canvas, 'mouseup', c.x, c.y, 0, button, detail);
      hideNovncJunk();
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
        placeCursor(pos.current.x, pos.current.y);
        moveRemote(canvas);
      } else if (t.length >= 2) {
        const midX = (t[0].clientX + t[1].clientX) / 2;
        const midY = (t[0].clientY + t[1].clientY) / 2;
        const dx = midX - g.lastMidX;
        const dy = midY - g.lastMidY;
        g.lastMidX = midX;
        g.lastMidY = midY;
        if (Math.hypot(dx, dy) > 1) g.moved = true;
        const c = client(canvas);
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
          click(canvas, 0, dbl ? 2 : 1);
          if (dbl) {
            click(canvas, 0, 2);
            g.lastTapAt = 0;
          } else {
            g.lastTapAt = now;
          }
        }
      }
      g.fingers = 0;
      hideNovncJunk();
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
    overlay.addEventListener('gestureend', block, opts);
    overlay.addEventListener('dblclick', block, opts);

    const canvas = canvasNow();
    if (canvas) {
      const r = canvas.getBoundingClientRect();
      pos.current = { x: r.width / 2, y: r.height / 2 };
      placeCursor(pos.current.x, pos.current.y);
      moveRemote(canvas);
    }
    hideNovncJunk();

    return () => {
      hideNovncJunk();
      overlay.removeEventListener('touchstart', onStart, opts);
      overlay.removeEventListener('touchmove', onMove, opts);
      overlay.removeEventListener('touchend', onEnd, opts);
      overlay.removeEventListener('touchcancel', onEnd, opts);
      overlay.removeEventListener('gesturestart', block, opts);
      overlay.removeEventListener('gesturechange', block, opts);
      overlay.removeEventListener('gestureend', block, opts);
      overlay.removeEventListener('dblclick', block, opts);
    };
  }, [enabled, hostRef]);

  if (!enabled) return null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10"
      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      <div
        ref={cursorRef}
        className="pointer-events-none absolute top-0 left-0"
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
