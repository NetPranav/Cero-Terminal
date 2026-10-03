#!/usr/bin/env python3
"""
make-cero-video.py: the Cero logo animation as a video, built from the real logo photo so every texture is kept.

  The sphere starts in the logo's own shape and texture (lit, with the fine etched surface of the photo) and the glow
  is there all the time. Then the surface turns into dots: they form first at the edge and the change moves
  inward, until the picture is exactly the logo.

  python3 scripts/brand/make-cero-video.py [--preview] [--fps 30]
Reads  assets/brand/Application_LOGO.jpeg   Writes  assets/brand/cero-logo-animation.mp4
Needs numpy, scipy, opencv-python and ffmpeg. The same inputs give the same video (fixed random seed).
"""
import argparse, glob, os, subprocess, sys
import cv2
import numpy as np
from scipy.spatial import cKDTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets/brand/Application_LOGO.jpeg')
OUT = os.path.join(ROOT, 'assets/brand/cero-logo-animation.mp4')
ap = argparse.ArgumentParser()
ap.add_argument('--fps', type=int, default=30)
ap.add_argument('--preview', action='store_true', help='write a few still frames instead of the video')
ap.add_argument('--out', default=OUT)
args = ap.parse_args()

rng = np.random.default_rng(7)
P = cv2.imread(SRC).astype(np.float32)[:, :, ::-1] / 255.0          # RGB, 0..1
H, W = P.shape[:2]
CX, CY, RAD = 419.0, 430.0, 341.0                                    # the sphere in the photo
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
dist = np.hypot(xx - CX, yy - CY)
gray = P.mean(2)
smooth = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))

# ---------------------------------------------------------------- 1. split the photo into layers
# dots: small bright blobs, found with a top-hat (what is brighter than its surroundings and smaller than ~25 px).
# The bright crescent on the light side is long and thin, so it is left out of the search and stays with the glow.
nxp, nyp = (xx - CX) / RAD, (yy - CY) / RAD
Lscreen = np.array([0.62, -0.55])
toward_light = (nxp * Lscreen[0] + nyp * Lscreen[1]) / np.linalg.norm(Lscreen)
crescent_zone = (dist > RAD - 34) & (toward_light > 0.30)
tophat = gray - cv2.morphologyEx(gray, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (27, 27)))
band = (dist > RAD - 26) & (dist < RAD + 10) & (~crescent_zone) & (gray > 0.40)
bright_c = (((tophat > 0.30) & (dist < RAD + 9) & (~crescent_zone)) | band).astype(np.uint8)
bright_c = cv2.morphologyEx(bright_c, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
# the dim dots are what is left once the bright ones (and their glow) are set aside
dim_c = ((tophat > 0.06) & (dist < RAD + 9) & (~crescent_zone) & (cv2.dilate(bright_c, np.ones((13, 13), np.uint8)) == 0)).astype(np.uint8)
dim_c = cv2.morphologyEx(dim_c, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
dot_list = []                                  # (bounding box, mask inside it, centre)
for cand_mask, max_area in ((bright_c, 3000), (dim_c, 500)):
    n, lab, stats, cents = cv2.connectedComponentsWithStats(cand_mask, connectivity=8)
    for i in range(1, n):
        if 5 <= stats[i, cv2.CC_STAT_AREA] <= max_area:
            x, y, w, h = stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP], stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
            dot_list.append(((x, y, w, h), (lab[y:y + h, x:x + w] == i), (float(cents[i][0]), float(cents[i][1]))))
dot_mask = np.zeros((H, W), np.uint8)
for (x, y, w, h), m, _ in dot_list:
    dot_mask[y:y + h, x:x + w] |= m.astype(np.uint8)
dot_alpha = cv2.GaussianBlur(cv2.dilate(dot_mask, np.ones((5, 5), np.uint8)).astype(np.float32), (0, 0), 1.3)
dot_alpha = np.clip(dot_alpha * 1.2, 0, 1)
# the logo without its dots: inpaint them from the surrounding dark body and glow
hole = cv2.dilate(dot_mask, np.ones((9, 9), np.uint8))
rest8 = cv2.inpaint((P[:, :, ::-1] * 255).astype(np.uint8), hole, 5, cv2.INPAINT_TELEA)
REST = rest8[:, :, ::-1].astype(np.float32) / 255.0
DOTS = P * dot_alpha[:, :, None]                                     # premultiplied
print(f'{len(dot_list)} dots')

# ---------------------------------------------------------------- 2. the textured sphere the animation starts from
# the photo's own surface texture, lit more strongly so it reads like the grey etched surface near the rim
nx, ny = (xx - CX) / RAD, (yy - CY) / RAD
r2 = np.clip(nx * nx + ny * ny, 0, 1)
nz = np.sqrt(1 - r2)
Ldir = np.array([0.62, -0.55, 0.56]); Ldir /= np.linalg.norm(Ldir)
lam = np.clip(nx * Ldir[0] + ny * Ldir[1] + nz * Ldir[2], 0, 1)
tex_src = cv2.cvtColor((REST * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
tex = tex_src - cv2.GaussianBlur(tex_src, (0, 0), 2.2)
tex = np.where(dist < RAD - 10, tex, 0)
tex_fine = tex_src - cv2.GaussianBlur(tex_src, (0, 0), 6)
lit = (0.04 + 0.52 * lam ** 2.2)                                      # grey toward the light, dark away from it
LIT_BODY = np.clip(tex_src * 0.6 + lit * (1.0 + 7.0 * tex + 4.0 * tex_fine), 0, 1)[:, :, None] * np.ones(3, np.float32)
IN_R = RAD - 8
disc = smooth(IN_R + 3, IN_R - 3, dist)[:, :, None]                   # 1 inside, 0 outside, soft edge
GLOW = REST * (1 - disc)
REST_IN = REST * disc
depth = np.clip((RAD - dist) / RAD, 0, 1)                             # 0 at the rim, 1 in the middle

# ---------------------------------------------------------------- 3. dots
sprites = []
for (x, y, w, h), m, (ccx, ccy) in dot_list:
    pad = 5
    x0, y0, x1, y1 = max(x - pad, 0), max(y - pad, 0), min(x + w + pad, W), min(y + h + pad, H)
    full = np.zeros((y1 - y0, x1 - x0), np.uint8)
    full[y - y0:y - y0 + h, x - x0:x - x0 + w] = m.astype(np.uint8)
    own = cv2.GaussianBlur(cv2.dilate(full, np.ones((5, 5), np.uint8)).astype(np.float32), (0, 0), 1.3)
    own = np.clip(own * 1.2, 0, 1)
    d = float(np.clip((RAD - np.hypot(ccx - CX, ccy - CY)) / RAD, 0, 1))
    sprites.append((x0, y0, x1, y1, P[y0:y1, x0:x1] * own[:, :, None], own, ccx, ccy, d))
dmax = max(sp[8] for sp in sprites)

# ---------------------------------------------------------------- 4. timing
FPS = args.fps
T_END = 12.0
T_GLOW = (0.0, 0.8)          # the glow arrives and stays
T_WAVE = (1.6, 9.2)          # dots form from the edge inward
T_FINAL = (9.8, 10.6)        # last blend to the exact logo
DOT_TIME = 1.3
rng2 = np.random.default_rng(11)
jit = rng2.uniform(-0.15, 0.15, len(sprites))
ts = np.array([T_WAVE[0] + (T_WAVE[1] - T_WAVE[0] - DOT_TIME) * (sp[8] / dmax) for sp in sprites]) + jit
ts = np.clip(ts, T_WAVE[0], T_WAVE[1] - DOT_TIME)

def ease(x): x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)
def lin(t, a, b): return float(np.clip((t - a) / (b - a), 0, 1))

def blit(canvas, patch_rgb, patch_a, box, center, scale, opacity):
    """Draw a premultiplied patch scaled about `center` onto the canvas."""
    x0, y0, x1, y1 = box
    if opacity <= 0.002 or scale <= 0.02: return
    pad = 6
    ox, oy = int(x0 - pad), int(y0 - pad)
    w, h = (x1 - x0) + 2 * pad, (y1 - y0) + 2 * pad
    M = np.array([[scale, 0, scale * (x0 - center[0]) + center[0] - ox],
                  [0, scale, scale * (y0 - center[1]) + center[1] - oy]], np.float32)
    out = cv2.warpAffine(np.dstack([patch_rgb, patch_a]).astype(np.float32), M, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
    rgb, a = out[:, :, :3] * opacity, out[:, :, 3:4] * opacity
    cx0, cy0, cx1, cy1 = max(ox, 0), max(oy, 0), min(ox + w, W), min(oy + h, H)
    if cx1 <= cx0 or cy1 <= cy0: return
    rgb, a = rgb[cy0 - oy:cy1 - oy, cx0 - ox:cx1 - ox], a[cy0 - oy:cy1 - oy, cx0 - ox:cx1 - ox]
    canvas[cy0:cy1, cx0:cx1] = canvas[cy0:cy1, cx0:cx1] * (1 - a) + rgb

def frame(t):
    glow_k = ease(lin(t, *T_GLOW)) * (1.0 + 0.03 * np.sin(t * 2.0))
    canvas = GLOW * glow_k
    # the surface settles from its lit, textured look to the dark body of the logo as the wave of dots passes inward
    front = -0.12 + 1.5 * lin(t, T_WAVE[0], T_WAVE[1] - 1.8)
    settled = smooth(0.0, 0.22, front - depth)[:, :, None]            # 1 where the wave has passed
    breathe = 1.0 + 0.03 * np.sin(t * 1.6)
    body = (LIT_BODY * breathe) * (1 - settled) + REST_IN * settled
    canvas = canvas + body * disc * (ease(lin(t, 0.2, 1.0)))
    for k, d in enumerate(sprites):
        s = lin(t, ts[k], ts[k] + DOT_TIME)
        if s <= 0: continue
        e = ease(s)
        blit(canvas, d[4], d[5], d[:4], (d[6], d[7]), 0.2 + 0.8 * e, ease(lin(s, 0.0, 0.55)))
    fin = ease(lin(t, *T_FINAL))
    return np.clip(canvas * (1 - fin) + P * fin, 0, 1)

if args.preview:
    os.makedirs('/tmp/cero-preview', exist_ok=True)
    for f in glob.glob('/tmp/cero-preview/t*.png'): os.remove(f)
    for t in [0.4, 1.2, 2.4, 3.6, 4.8, 6.0, 7.2, 8.4, 9.4, 10.2, 11.0, 11.8]:
        cv2.imwrite(f'/tmp/cero-preview/t{t:05.2f}.png', (frame(t)[:, :, ::-1] * 255).astype(np.uint8))
    print('wrote /tmp/cero-preview'); sys.exit(0)

cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
       '-vf', 'scale=1080:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', args.out]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
frames = int(T_END * FPS)
for i in range(frames):
    proc.stdin.write((frame(i / FPS) * 255 + 0.5).astype(np.uint8).tobytes())
    if i % 30 == 0: print(f'{i}/{frames}', flush=True)
proc.stdin.close(); proc.wait()
print('wrote', args.out)
