# VNC touch mode milestones

Working notes for `feat/vnc-touch-mode`. Rebuild from this branch, then hard-refresh the iPad after each image.

## Current baseline

**Commit to test from:** `f853b55` (`fix(vnc): restore VncSession.tsx emptied in last touchpad commit`)

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

- [ ] Double-tap on a web link does not freeze the session
- [ ] Double-tap should send a real double-click without losing the cursor

## What we already learned

| Attempt | Result |
| --- | --- |
| Extra SVG cursor on the overlay | Two cursors (one dummy, one real). Dummy sat above the real one. |
| Remove overlay cursor, send canvas `MouseEvent`s (`64df2e9` / `f853b55`) | **Cursor works.** Double-tap on a link still freezes. |
| Drive RFB private methods instead of DOM events (`6b83433`) | Cursor gone. Clicks unreliable. Built JS names do not match source internals. |
| Draw a local cursor again + strip capture overlay (`1c345d1`, `29fb141`) | Cursor missing, or only flashes after long-press drag, then vanishes. |

## Next work (after this baseline is confirmed)

1. Confirm iPad still has a visible, draggable remote cursor on `f853b55` behavior.
2. Only then fix the freeze. Likely Safari double-tap-zoom / noVNC `setCapture()` overlay after a second tap.
3. Keep the working cursor path. Do not hide noVNC’s cursor and do not add a second pointer.

## Test rebuild

```bash
cd /docker/komodo/periphery/stacks/gatwy
docker compose build --no-cache --pull
docker compose up -d --force-recreate
```

Hard-refresh the iPad. Touchpad mode should show the remote cursor again.
