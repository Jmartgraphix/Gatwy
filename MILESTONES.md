# VNC touch mode milestones

Working notes for `feat/vnc-touch-mode`. Rebuild from this branch, then hard-refresh the iPad after each image.

## Current baseline

**Last known-good cursor:** `f853b55` / `b349aad` (remote cursor visible, no extra overlay pointer).

**Current freeze attempt:** `feat/vnc-touch-mode` after `b349aad` — keep the working mouse-event path. Each tap is one left click (no extra click on the second tap). After click, dispatch `window` `mouseup` so noVNC `setCapture()` releases. Do **not** remove `#noVNC_mouse_capture_elem`.

That is the last build where:

- Extra overlay cursor was gone
- Remote VNC cursor was visible and usable in touchpad mode
- Drag / tap / two-finger tap / two-finger scroll worked

Later freeze-fix commits (`6b83433`, `1c345d1`, `29fb141`) broke the cursor (missing, or only flashes after a long-press drag). Those changes were reverted. Do not reintroduce:

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
- [x] Cursor visible and usable after extra-cursor removal (`f853b55`)

### Not done / broken

- [ ] Double-tap on iPad does not freeze the session (in test)
- [ ] Double-tap = left click, cursor still visible (in test)
- [ ] Right-click gesture (two-finger tap still sends right click; revisit after freeze is gone)

## What we already learned

| Attempt | Result |
| --- | --- |
| Extra SVG cursor on the overlay | Two cursors (one dummy, one real). Dummy sat above the real one. |
| Remove overlay cursor, send canvas `MouseEvent`s (`64df2e9` / `f853b55`) | **Cursor works.** Double-tap on a link still freezes. |
| Drive RFB private methods instead of DOM events (`6b83433`) | Cursor gone. Clicks unreliable. Built JS names do not match source internals. |
| Draw a local cursor again + strip capture overlay (`1c345d1`, `29fb141`) | Cursor missing, or only flashes after long-press drag, then vanishes. |
| Extra click on second tap (`f853b55` double-click path) | Freeze; a later single tap unfreezes (matches stuck `setCapture()`). |
| Window `mouseup` after each canvas click (this change) | TBD on iPad. |

## Next work

1. Confirm cursor still visible after this freeze-only change.
2. Confirm double-tap is a left click and does not freeze.
3. Then decide right-click (two-finger tap is still wired).

## Test rebuild

```bash
cd /docker/komodo/periphery/stacks/gatwy
docker compose build --no-cache --pull
docker compose up -d --force-recreate
```

Hard-refresh the iPad. Touchpad mode should show the remote cursor again.
