# VNC touch mode milestones

Working notes for `feat/vnc-touch-mode`. Rebuild from this branch, then hard-refresh the iPad after each image.

## Current baseline

**Last known-good cursor:** `f853b55` / `b349aad` (remote cursor visible, no extra overlay pointer).

**Freeze fix (confirmed):** `a7182a3` — each tap is one left click; `window` `mouseup` after click so noVNC `setCapture()` releases. Do **not** remove `#noVNC_mouse_capture_elem`.

**Window drag (confirmed):** `602f829` — long-press then drag, or tap then drag, holds left button.

**Right-click polish (confirmed by user):** `a834729` — Moonlight-style two-finger tap. Aim with one finger, plant a second finger. Do **not** move the remote cursor for the second finger.

**Two-finger scroll:** `33644d7` locked the cursor (better, still a little wander on leftover finger). Speed was slow in **both** modes because noVNC only emits one wheel notch per `wheel` event and only after 50px of delta — leftover pixels are discarded.

**Scroll speed (in test):** Shared `vncWheel` helper: ~4 notches per 50px of two-finger travel. Touchpad still locks the cursor. Touchscreen intercepts two-finger gestures so noVNC does not move the pointer while scrolling.

Keep:

- Extra overlay cursor gone
- Remote VNC cursor visible and usable
- One-finger move / tap / hold-drag / freeze-free double-tap
- Two-finger tap right-click without moving the cursor

Do not reintroduce:

- Calls into minified noVNC internals (`_handleMouseMove`, `_handleMouseButton`, `_cursor.move`)
- A second local SVG cursor overlay
- Removing `#noVNC_mouse_capture_elem` as the primary cursor strategy

## Checklist

### Done

- [x] Touchscreen vs Touchpad toggle in the VNC sidebar while a session is running
- [x] Touchpad: one-finger drag moves the remote pointer
- [x] Touchpad: tap = left click
- [x] Touchpad: two-finger drag = scroll
- [x] Extra overlay cursor removed (only the remote VNC cursor)
- [x] Cursor visible and usable after extra-cursor removal (`f853b55` / `b349aad`)
- [x] Double-tap on iPad does not freeze (`a7182a3`)
- [x] Double-tap = left click, cursor still visible (`a7182a3`)
- [x] Touchpad: drag a Steam Deck / KDE window (`602f829`)
- [x] Right-click: aim with one finger, tap a second finger, cursor stays on the folder (`a834729`)

### In test

- [ ] Browser two-finger scroll is faster (touchscreen and touchpad)
- [ ] Touchpad scroll does not wander the cursor
- [ ] Touchscreen two-finger scroll does not wander the cursor
- [ ] One-finger cursor / tap still work in both modes

## What we already learned

| Attempt | Result |
| --- | --- |
| Extra SVG cursor on the overlay | Two cursors (one dummy, one real). Dummy sat above the real one. |
| Remove overlay cursor, send canvas `MouseEvent`s (`64df2e9` / `f853b55`) | **Cursor works.** Double-tap on a link still freezes. |
| Drive RFB private methods instead of DOM events (`6b83433`) | Cursor gone. Clicks unreliable. Built JS names do not match source internals. |
| Draw a local cursor again + strip capture overlay (`1c345d1`, `29fb141`) | Cursor missing, or only flashes after long-press drag, then vanishes. |
| Extra click on second tap (`f853b55` double-click path) | Freeze; a later single tap unfreezes (matches stuck `setCapture()`). |
| Window `mouseup` after each canvas click (`a7182a3`) | **Freeze gone.** Cursor still visible. |
| Long-press then drag / tap then drag (`602f829`) | **Window drag works.** |
| Two-finger tap moved the cursor (midpoint / first-finger jitter) | Right-click missed the folder. Moonlight iOS `RelativeTouchHandler` only moves on finger 1; two-finger tap clicks **where the cursor already is**. |
| Two-finger scroll (`a834729`) | Page scrolled slowly **and** the leftover finger moved the cursor off-screen (Safari often reports 1 touch mid-scroll). |
| Cursor lock (`33644d7`) | Wander reduced. Still slow: noVNC `WHEEL_STEP` is 50px and leftover delta is thrown away. |
| Extra wheel notches + touchscreen intercept (this change) | TBD. |

## Moonlight (iOS relative / trackpad) — what we copied

From `moonlight-ios` `RelativeTouchHandler.m` and `moonlight-qt` `reltouch.cpp`:

- Only the **primary finger** moves the mouse.
- Two-finger tap = right-click at the **current** pointer. Second finger does not aim.
- Tiny move deadzone (~5px) so a tap is not a drag.
- Going 2 fingers → 1 marks the remaining finger as moved so it does not left-click.
- Two-finger **drag** (after leaving the deadzone) is scroll, not a tap.

## Gestures (touchpad)

| Gesture | Action |
| --- | --- |
| One-finger move | Move remote cursor (button up). Small deadzone so a tap does not nudge. |
| Tap | Left click |
| Double-tap | Two left clicks (not a freeze) |
| Long-press (~350ms) then drag | Left button down, drag windows, up on lift |
| Tap, then immediately drag | Same window-drag (tap-and-a-half) |
| Aim, then second-finger tap | Right click **without moving** the cursor |
| Two-finger drag | Scroll only (cursor stays put, including leftover finger until both lift) |

## Next work

1. Confirm browser two-finger scroll feels faster in both modes.
2. Confirm the cursor stays put while scrolling.
3. Confirm right-click, window drag, tap, and freeze fix still good.

## Test rebuild

```bash
cd /docker/komodo/periphery/stacks/gatwy
docker compose build --no-cache --pull
docker compose up -d --force-recreate
```

Hard-refresh the iPad. Put the cursor on a folder, tap a second finger, lift. The menu should open on that folder.
