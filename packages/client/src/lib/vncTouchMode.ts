export type VncTouchMode = 'touchscreen' | 'touchpad';

const STORAGE_KEY = 'gatwy.vnc.touchMode';

/** Primary pointer is a finger. Do not use maxTouchPoints (Windows 11 lies). */
export function isCoarsePointer(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function loadVncTouchMode(): VncTouchMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'touchpad' || v === 'touchscreen') return v;
  } catch { /* ignore */ }
  return 'touchscreen';
}

export function saveVncTouchMode(mode: VncTouchMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* ignore */ }
}
