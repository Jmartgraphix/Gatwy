import { useEffect, useRef, type RefObject } from 'react';

interface VncTouchPadProps {
  hostRef: RefObject<HTMLDivElement | null>;
  rfbRef?: RefObject<object | null>;
  enabled: boolean;
}

const TAP_MS = 280;
const SENSITIVITY = 1.15;
const SCROLL_SCALE = 0.55;

function canvasOf(host: HTMLDivElement | null): HTMLCanvasElement | null {
  return host?.querySelector('canvas') ?? null;
}

function dropCapture(): void {
  const el = document.getElementById('noVNC_mouse_capture_elem');
  if (el) {
    el.style.display = 'none';
    el.remove();
  }
  const rec = document as Document & { captureElement?: Element | null };
  rec.captureElement = null;
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
    detail: type === 'mousemove' ? 0 : 1,
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
 * Moonlight-style trackpad. One local cursor on the overlay (noVNC hides its
 * own pointer while the overlay is on top). Drag moves, tap clicks, two taps
 * double-click, two-finger tap right-clicks, two-finger drag scrolls.
 */
export function VncTouchPad({ hostRef, enabled }: VncTouchPadProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const inited = useRef(false);
  const gesture = useRef({
    fingers: 0,
    startTime: 0,
    moved: false,
    lastX: 0,
    lastY: 0,
    lastMidX: 0,
    lastMidY: 0,
  });

  useEffect(() => {
    if (!enabled) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    inited.current = false;

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

    const ensurePos = (canvas: HTMLCanvasElement) => {
      if (inited.current) return;
      const r = canvas.getBoundingClientRect();
      pos.current = { x: r.width / 2, y: r.height / 2 };
      placeCursor(pos.current.x, pos.current.y);
      inited.current = true;
    };

    const client = (canvas: HTMLCanvasElement) => {
      const r = canvas.getBoundingClientRect();
      return { x: r.left + pos.current.x, y: r.top + pos.current.y };
    };

    const moveRemote = (canvas: HTMLCanvasElement) => {
      const c = client(canvas);
      fireMouse(canvas, 'mousemove', c.x, c.y, 0, 0);
      dropCapture();
    };

    const click = (canvas: HTMLCanvasElement, button: 0 | 2) => {
      const c = client(canvas);
      const buttons = button === 0 ? 1 : 2;
      fireMouse(canvas, 'mousemove', c.x, c.y, 0, 0);
      fireMouse(canvas, 'mousedown', c.x, c.y, buttons, button);
      fireMouse(canvas, 'mouseup', c.x, c.y, 0, button);
      window.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: c.x,
        clientY: c.y,
        buttons: 0,
        button,
      }));
      dropCapture();
    };

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const canvas = canvasNow();
      if (canvas) ensurePos(canvas);
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
      ensurePos(canvas);
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
      ensurePos(canvas);
      const dt = Date.now() - g.startTime;
      const tap = !g.moved && dt <= TAP_MS;
      if (tap) click(canvas, g.fingers >= 2 ? 2 : 0);
      g.fingers = 0;
      dropCapture();
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
      ensurePos(canvas);
      moveRemote(canvas);
    }
    dropCapture();

    return () => {
      dropCapture();
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
        style={{ zIndex: 20 }}
        aria-hidden
      >
        <svg width="20" height="24" viewBox="0 0 18 22" fill="none">
          <path
            d="M1.5 1.5 L1.5 17.5 L6.2 13.2 L9.8 20.6 L12.4 19.4 L8.7 12.1 L15.2 12.1 Z"
            fill="#f8fafc"
            stroke="#0f172a"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
