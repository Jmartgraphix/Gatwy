import { useEffect, useRef, type RefObject } from 'react';

type RfbPointer = {
  _handleMouseMove?: (x: number, y: number) => void;
  _handleMouseButton?: (x: number, y: number, bmask: number) => void;
  _mouseButtonMask?: number;
};

interface VncTouchPadProps {
  /** noVNC host div that contains the canvas */
  hostRef: RefObject<HTMLDivElement | null>;
  rfbRef: RefObject<object | null>;
  enabled: boolean;
}

const TAP_MS = 280;
const SENSITIVITY = 1.15;
const SCROLL_SCALE = 0.6;
const BUTTON_HOLD_MS = 35;
const LEFT = 0x1;
const RIGHT = 0x4;
const WHEEL_UP = 1 << 3;
const WHEEL_DOWN = 1 << 4;
const WHEEL_LEFT = 1 << 5;
const WHEEL_RIGHT = 1 << 6;
const WHEEL_STEP = 16;

function canvasOf(host: HTMLDivElement | null): HTMLCanvasElement | null {
  return host?.querySelector('canvas') ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hideNovncCapture(): void {
  const el = document.getElementById('noVNC_mouse_capture_elem');
  if (el) el.style.display = 'none';
}

/**
 * Moonlight-style trackpad overlay (no extra cursor — the remote pointer is the cursor).
 * One-finger drag moves. Tap = click. Two taps = double-click. Two-finger tap = right-click.
 * Two-finger drag scrolls.
 *
 * Pointer events go through noVNC's RFB methods so we never synthesize DOM mouse
 * events (those call setCapture() and leave a full-screen overlay on iOS after a
 * double-tap, which freezes the cursor).
 */
export function VncTouchPad({ hostRef, rfbRef, enabled }: VncTouchPadProps) {
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
    wheelX: 0,
    wheelY: 0,
  });
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    if (!enabled) return;
    const overlay = overlayRef.current;
    if (!overlay) return;

    const canvasNow = () => canvasOf(hostRef.current);
    const rfb = () => rfbRef.current as RfbPointer | null;

    const clamp = (canvas: HTMLCanvasElement, x: number, y: number) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(Math.max(1, r.width - 1), x)),
        y: Math.max(0, Math.min(Math.max(1, r.height - 1), y)),
      };
    };

    const move = (x: number, y: number) => {
      rfb()?._handleMouseMove?.(x, y);
    };

    const button = (mask: number) => {
      const inst = rfb();
      if (!inst?._handleMouseButton) return;
      inst._handleMouseButton(pos.current.x, pos.current.y, mask);
      inst._mouseButtonMask = mask;
    };

    const enqueue = (fn: () => Promise<void>) => {
      queue.current = queue.current.then(fn).catch(() => undefined);
    };

    const click = (mask: number) => {
      enqueue(async () => {
        move(pos.current.x, pos.current.y);
        button(mask);
        await sleep(BUTTON_HOLD_MS);
        button(0);
        hideNovncCapture();
      });
    };

    const wheelStep = (mask: number) => {
      button(mask);
      button(0);
    };

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const t = e.touches;
      const g = gesture.current;
      g.fingers = Math.max(g.fingers, t.length);
      g.startTime = Date.now();
      g.moved = false;
      g.wheelX = 0;
      g.wheelY = 0;
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
        move(pos.current.x, pos.current.y);
      } else if (t.length >= 2) {
        const midX = (t[0].clientX + t[1].clientX) / 2;
        const midY = (t[0].clientY + t[1].clientY) / 2;
        const dx = midX - g.lastMidX;
        const dy = midY - g.lastMidY;
        g.lastMidX = midX;
        g.lastMidY = midY;
        if (Math.hypot(dx, dy) > 1) g.moved = true;
        g.wheelX += -dx * SCROLL_SCALE;
        g.wheelY += -dy * SCROLL_SCALE;
        while (Math.abs(g.wheelX) >= WHEEL_STEP) {
          wheelStep(g.wheelX < 0 ? WHEEL_LEFT : WHEEL_RIGHT);
          g.wheelX -= Math.sign(g.wheelX) * WHEEL_STEP;
        }
        while (Math.abs(g.wheelY) >= WHEEL_STEP) {
          wheelStep(g.wheelY < 0 ? WHEEL_UP : WHEEL_DOWN);
          g.wheelY -= Math.sign(g.wheelY) * WHEEL_STEP;
        }
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
        click(g.fingers >= 2 ? RIGHT : LEFT);
      } else {
        button(0);
      }
      g.fingers = 0;
      hideNovncCapture();
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
    overlay.addEventListener('click', block, opts);

    const canvas = canvasNow();
    if (canvas) {
      const r = canvas.getBoundingClientRect();
      pos.current = { x: r.width / 2, y: r.height / 2 };
      move(pos.current.x, pos.current.y);
    }
    hideNovncCapture();

    return () => {
      button(0);
      hideNovncCapture();
      overlay.removeEventListener('touchstart', onStart, opts);
      overlay.removeEventListener('touchmove', onMove, opts);
      overlay.removeEventListener('touchend', onEnd, opts);
      overlay.removeEventListener('touchcancel', onEnd, opts);
      overlay.removeEventListener('gesturestart', block, opts);
      overlay.removeEventListener('gesturechange', block, opts);
      overlay.removeEventListener('gestureend', block, opts);
      overlay.removeEventListener('dblclick', block, opts);
      overlay.removeEventListener('click', block, opts);
    };
  }, [enabled, hostRef, rfbRef]);

  if (!enabled) return null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10"
      style={{
        touchAction: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    />
  );
}
