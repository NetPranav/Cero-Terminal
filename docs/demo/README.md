# The demo video

`docs/media/cero-demo.mp4` (about 2.5 minutes, recorded for Cero 2.2) is made of one slide per feature followed by a real, unedited clip
of the macOS app doing it. Nothing in it is mocked up.

- `storyboard.json`: the slides (text, icon, length) and the order, including which seconds of each clip are shown.
- The slides are drawn by headless Chromium and the clips are screen recordings of the app window, joined with
  ffmpeg over a quiet synthesized pad. The tools are in the `product-demo` skill (`~/.claude/skills/product-demo`):
  `slides.mjs`, `record.sh`, `assemble.py`, `pad.py`, `contact_sheet.py`. No paid service, no download.

Rules that kept it honest: real clips at normal speed (only dead time is cut); a rectangle inside the app window
is recorded, never the whole screen; the Wi-Fi clip runs in one command that turns Wi-Fi back on however it ends;
apps that are not installed are not shown.
