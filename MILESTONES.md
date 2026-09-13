# VNC touch mode milestones

Working notes for `feat/vnc-touch-mode`. Rebuild from this branch, then hard-refresh the iPad after each image.

## Current baseline

**Last known-good cursor:** `f853b55` / `b349aad` (remote cursor visible, no extra overlay pointer).

**Freeze fix (confirmed):** `a7182a3` — each tap is one left click; `window` `mouseup` after click so noVNC `setCapture()` releases. Do **not** remove `#noVNC_mouse_capture_elem`.

**Window-drag attempt:** long-press then drag, or tap then drag (tap-and-a-half), holds the left button while the finger moves. Still uses canvas `MouseEvent`s only.

Keep:

- Extra overlay cursor gone
- Remote VNC cursor visible and usable
- Drag (cursor move) / tap / two-finger tap / two-finger scroll
- Double-tap does not freeze

Do not reintroduce:

- Calls into minified noVNC internals (`_handleMouseMove`, `_handleMouseButton`, `_cursor.move`)
- A second local SVG cursor overlay
- Removing `#noVNC_mouse_capture_elem` as the primary cursor strategy

## Checklist

### Done

- [x] Touchscreen vs Touchpad toggle in the VNC sidebar while a session is running
- [x] Touchpad: one-finger drag moves the remote pointer
- [x] Touchpad: tap = left click
- [x] Touchpad: two-finger tap = right click
- [x] Touchpad: two-finger drag = scroll
- [x] Extra overlay cursor removed (only the remote VNC cursor)
- [x] Cursor visible and usable after extra-cursor removal (`f853b55` / `b349aad`)
- [x] Double-tap on iPad does not freeze (`a7182a3`)
- [x] Double-tap = left click, cursor still visible (`a7182a3`)

### In test

- [ ] Touchpad: drag a Steam Deck / KDE window (title bar)
  - Press-and-hold (~350ms) then drag, **or**
  - Tap (click the title bar) then immediately drag

### Not done

- [ ] Right-click gesture polish (two-finger tap still sends right click)

## What we already learned

| Attempt | Result |
| --- | --- |
| Extra SVG cursor on the overlay | Two cursors (one dummy, one real). Dummy sat above the real one. |
| Remove overlay cursor, send canvas `MouseEvent`s (`64df2e9` / `f853b55`) | **Cursor works.** Double-tap on a link still freezes. |
| Drive RFB private methods instead of DOM events (`6b83433`) | Cursor gone. Clicks unreliable. Built JS names do not match source internals. |
| Draw a local cursor again + strip capture overlay (`1c345d1`, `29fb141`) | Cursor missing, or only flashes after long-press drag, then vanishes. |
| Extra click on second tap (`f853b55` double-click path) | Freeze; a later single tap unfreezes (matches stuck `setCapture()`). |
| Window `mouseup` after each canvas click (`a7182a3`) | **Freeze gone.** Cursor still visible. One-finger move still only moves the pointer, so GUI windows cannot be dragged. |
| Long-press then drag / tap then drag (this change) | TBD on iPad. |

## Gestures (touchpad)

| Gesture | Action |
| --- | --- |
| One-finger move | Move remote cursor (button up) |
| Tap | Left click |
| Double-tap | Two left clicks (not a freeze) |
| Long-press (~350ms) then drag | Left button down, drag windows, up on lift |
| Tap, then immediately drag | Same window-drag (tap-and-a-half) |
| Two-finger tap | Right click |
| Two-finger drag | Scroll |

## Next work

1. Confirm window drag on Steam Deck desktop from iPad.
2. Confirm cursor, tap, and freeze fix still good.
3. Then polish right-click if needed.

## Test rebuild

```bash
cd /docker/komodo/periphery/stacks/gatwy
docker compose build --no-cache --pull
docker compose up -d --force-recreate
```

Hard-refresh the iPad. Try moving a window: tap the title bar, then drag; or hold on the title bar until the hold, then drag.
