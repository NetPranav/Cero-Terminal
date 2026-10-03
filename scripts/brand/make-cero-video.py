#!/usr/bin/env python3
"""
make-cero-video.py: the Cero logo animation as a video, built from the real logo photo so every texture is kept.

  A glowing smooth sphere  ->  the sphere turns into a textured moon (the glow never leaves)
  ->  the moon splits down the middle  ->  its surface divides into pieces, one by one from the middle outward,
  and each piece breaks down into a dot  ->  the dots settle into the halftone and the picture is exactly the logo.

  python3 scripts/brand/make-cero-video.py [--preview] [--fps 30]
Reads  assets/brand/Application_LOGO.jpeg   Writes  assets/brand/cero-logo-animation.mp4
Needs numpy, scipy, opencv-python and ffmpeg. The same inputs give the same video (fixed random seed).
"""
import argparse, os, subprocess, sys
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

# ---------------------------------------------------------------- 2. a moon built from the photo's own texture
def fbm(shape, octaves=6, base=3):
    out = np.zeros(shape, np.float32); amp = 1.0; total = 0
    for o in range(octaves):
        g = rng.random((base * 2 ** o + 2, base * 2 ** o + 2)).astype(np.float32)
        out += amp * cv2.resize(g, (shape[1], shape[0]), interpolation=cv2.INTER_CUBIC)
        total += amp; amp *= 0.5
    return out / total

nx, ny = (xx - CX) / RAD, (yy - CY) / RAD
r2 = np.clip(nx * nx + ny * ny, 0, 1)
nz = np.sqrt(1 - r2)
Ldir = np.array([0.62, -0.55, 0.56]); Ldir /= np.linalg.norm(Ldir)
lam = np.clip(nx * Ldir[0] + ny * Ldir[1] + nz * Ldir[2], 0, 1)
tex_src = cv2.cvtColor((REST * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
tex = tex_src - cv2.GaussianBlur(tex_src, (0, 0), 4)
tex = np.where(dist < RAD - 12, tex, 0)
maria = fbm((H, W), 6, 3)
grain = fbm((H, W), 7, 24)
shade = 0.05 + 0.80 * lam ** 0.9
moon_l = shade * (0.62 + 0.55 * maria) * (0.94 + 0.10 * grain) + 2.2 * tex
# craters: a dark floor with a bright rim on the side facing the light
cr = np.zeros((H, W), np.float32)
for _ in range(90):
    a = rng.random() * 2 * np.pi; d = np.sqrt(rng.random()) * (RAD - 30)
    ccx, ccy = CX + d * np.cos(a), CY + d * np.sin(a)
    rad = float(rng.choice([5, 7, 9, 12, 16, 22, 30], p=[.25, .22, .18, .15, .1, .07, .03]))
    x0, x1, y0, y1 = int(ccx - rad * 2), int(ccx + rad * 2), int(ccy - rad * 2), int(ccy + rad * 2)
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W), min(y1, H)
    if x1 <= x0 or y1 <= y0: continue
    px, py = xx[y0:y1, x0:x1] - ccx, yy[y0:y1, x0:x1] - ccy
    q = np.hypot(px, py) / rad
    floor = -0.5 * np.exp(-(q / 0.85) ** 4)
    lit_side = (px * Ldir[0] + py * Ldir[1]) / (rad * np.hypot(Ldir[0], Ldir[1]) + 1e-6)
    rim = 0.45 * np.exp(-((q - 1.0) / 0.16) ** 2) * (0.35 + 0.65 * np.clip(-lit_side, 0, 1))
    cr[y0:y1, x0:x1] += (floor + rim) * 0.5
moon_l = np.clip(moon_l * (1 + cr) , 0, 1)
edge_soft = smooth(1.0, 0.93, np.sqrt(r2))
MOON = np.clip(moon_l * 0.58, 0, 1)[:, :, None] * np.array([1.0, 0.99, 0.97], np.float32)[None, None, :]
SPHERE = (np.clip(0.03 + 0.20 * lam ** 1.2, 0, 1) * (0.85 + 0.15 * smooth(0, 0.5, nz)))[:, :, None] * np.ones(3, np.float32)
IN_R = RAD - 8                                                        # the moon and sphere stop just inside the rim
disc = smooth(IN_R + 3, IN_R - 3, dist)[:, :, None]                   # 1 inside, 0 outside, soft edge

# ---------------------------------------------------------------- 3. pieces: one cell per dot, plus cells for the rest of the surface
cent_dots = np.array([c for _, _, c in dot_list], np.float32)
seeds = [tuple(c) for c in cent_dots]
SP = 30.0
for gy in np.arange(CY - RAD, CY + RAD, SP * 0.866):
    row = int(round((gy - CY) / (SP * 0.866)))
    for gx in np.arange(CX - RAD, CX + RAD, SP):
        x, y = gx + (SP / 2 if row % 2 else 0) + rng.uniform(-5, 5), gy + rng.uniform(-5, 5)
        if np.hypot(x - CX, y - CY) < IN_R + 4 and (cKDTree(cent_dots).query((x, y))[0] > 19):
            seeds.append((x, y))
seeds = np.array(seeds, np.float32)
tree = cKDTree(seeds)
_, label = tree.query(np.c_[xx.ravel(), yy.ravel()])
label = label.reshape(H, W).astype(np.int32)
label[dist > IN_R + 3] = -1
K = len(seeds)
is_dot_cell = np.zeros(K, bool); is_dot_cell[:len(cent_dots)] = True
sx = seeds[:, 0]; sy = seeds[:, 1]
side = np.where(sx < CX, -1.0, 1.0)
order_x = np.abs(sx - CX) / RAD                                       # 0 at the middle seam, 1 at the edges
cell_info = []
for k in range(K):
    ys, xs = np.where(label == k)
    if len(xs) == 0:
        cell_info.append(None); continue
    x0, x1, y0, y1 = xs.min() - 2, xs.max() + 3, ys.min() - 2, ys.max() + 3
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W), min(y1, H)
    m = cv2.GaussianBlur((label[y0:y1, x0:x1] == k).astype(np.float32), (0, 0), 0.8)
    cell_info.append((x0, y0, x1, y1, m))
# dot sprites: each dot's own pixels (premultiplied) in a box around it
sprites = []
for (x, y, w, h), m, (ccx, ccy) in dot_list:
    pad = 5
    x0, y0, x1, y1 = max(x - pad, 0), max(y - pad, 0), min(x + w + pad, W), min(y + h + pad, H)
    full = np.zeros((y1 - y0, x1 - x0), np.uint8)
    full[y - y0:y - y0 + h, x - x0:x - x0 + w] = m.astype(np.uint8)
    own = cv2.GaussianBlur(cv2.dilate(full, np.ones((5, 5), np.uint8)).astype(np.float32), (0, 0), 1.3)
    own = np.clip(own * 1.2, 0, 1)
    sprites.append((x0, y0, x1, y1, P[y0:y1, x0:x1] * own[:, :, None], own, ccx, ccy))

# ---------------------------------------------------------------- 4. timing
FPS = args.fps
T_END = 14.6
T_GLOW = (0.0, 0.9)          # the glow arrives and stays
T_SPHERE = (0.4, 1.6)        # a smooth sphere appears
T_MOON = (1.6, 4.4)          # the sphere turns into the moon
T_HOLD = (4.4, 5.4)          # the moon, lit
T_SPLIT = (5.2, 6.4)         # it parts down the middle
T_BREAK = (6.2, 12.4)        # pieces go one by one, from the middle outward
T_FINAL = (12.9, 13.6)       # last blend to the exact logo
GAP = 24.0
jit = rng.uniform(-0.22, 0.22, K).astype(np.float32)
start = T_BREAK[0] + (T_BREAK[1] - T_BREAK[0] - 1.5) * np.clip(order_x / order_x.max(), 0, 1) ** 0.9 + jit
start = np.clip(start, T_BREAK[0], T_BREAK[1] - 1.3)
DUR = np.where(is_dot_cell, 1.35, 0.9).astype(np.float32)
noise_reveal = fbm((H, W), 5, 4)
light_dist = np.clip(((xx - (CX + 0.6 * RAD)) ** 2 + (yy - (CY - 0.55 * RAD)) ** 2) ** 0.5 / (2 * RAD), 0, 1)

def ease(x): x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)
def lin(t, a, b): return float(np.clip((t - a) / (b - a), 0, 1))

def blit(canvas, patch_rgb, patch_a, box, center, scale, shift, opacity):
    """Draw a premultiplied patch scaled about `center`, moved by `shift`, onto the canvas."""
    x0, y0, x1, y1 = box
    if opacity <= 0.002 or scale <= 0.02: return
    pad = 6
    ox = int(np.floor(x0 + shift[0] - pad)); oy = int(np.floor(y0 + shift[1] - pad))
    w, h = (x1 - x0) + 2 * pad, (y1 - y0) + 2 * pad
    # patch pixel (u, v) sits at (x0 + u, y0 + v) in the picture; scale about `center`, then move
    M = np.array([[scale, 0, scale * (x0 - center[0]) + center[0] + shift[0] - ox],
                  [0, scale, scale * (y0 - center[1]) + center[1] + shift[1] - oy]], np.float32)
    src = np.dstack([patch_rgb, patch_a]).astype(np.float32)
    out = cv2.warpAffine(src, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
    rgb, a = out[:, :, :3] * opacity, out[:, :, 3:4] * opacity
    cx0, cy0, cx1, cy1 = max(ox, 0), max(oy, 0), min(ox + w, W), min(oy + h, H)
    if cx1 <= cx0 or cy1 <= cy0: return
    rgb, a = rgb[cy0 - oy:cy1 - oy, cx0 - ox:cx1 - ox], a[cy0 - oy:cy1 - oy, cx0 - ox:cx1 - ox]
    canvas[cy0:cy1, cx0:cx1] = canvas[cy0:cy1, cx0:cx1] * (1 - a) + rgb

# the glow: everything of the photo that is not the dots or the body, so it is exactly the photo's own glow
body_hint = disc
GLOW = REST * (1 - body_hint)
REST_IN = REST * body_hint

def frame(t):
    glow_k = ease(lin(t, *T_GLOW)) * (1.0 + 0.04 * np.sin(t * 2.1))
    canvas = GLOW * glow_k
    sph_k = ease(lin(t, *T_SPHERE))
    moon_prog = lin(t, *T_MOON)
    split_k = ease(lin(t, *T_SPLIT))
    # the reveal of the moon texture spreads from the lit side
    reveal = smooth(0, 0.22, moon_prog * 1.5 - (0.62 * light_dist + 0.38 * noise_reveal))
    body = SPHERE * (1 - reveal[:, :, None]) + MOON * reveal[:, :, None]
    breathe = 1.0 + 0.035 * np.sin(t * 1.7)
    if t < T_SPLIT[0]:
        canvas = canvas + body * disc * sph_k * breathe
    else:
        # background behind the parting halves: the dark body of the logo, with a light seam
        back = REST_IN * ease(lin(t, T_SPLIT[0], T_SPLIT[0] + 0.6))
        canvas = canvas + back
        closing = 1.0 - ease(lin(t, T_BREAK[0] + 1.0, T_BREAK[1]))      # the halves come back together as they dissolve
        dx = GAP * split_k * closing
        state = np.clip((t - start) / DUR, 0, 1)                          # 0 untouched .. 1 gone
        untouched = (state <= 0).astype(np.float32)
        alive_lut = np.concatenate([untouched, [0.0]])                    # label -1 maps to the last entry
        alive = alive_lut[label][:, :, None]
        left_lut = np.concatenate([(side < 0).astype(np.float32), [0.0]])
        left = left_lut[label][:, :, None]
        for sgn, part in ((-1.0, alive * left), (1.0, alive * (1 - left))):
            moved = cv2.warpAffine((body * part * disc).astype(np.float32), np.float32([[1, 0, sgn * dx], [0, 1, 0]]), (W, H), flags=cv2.INTER_LINEAR)
            canvas = canvas + moved
        # the seam: a thin bright light between the halves, strongest as they part
        if dx > 0.5:
            seam = np.exp(-((xx - CX) / (1.0 + dx * 0.45)) ** 2) * smooth(RAD * 0.99, RAD * 0.80, np.abs(yy - CY))
            seam = seam * (dist < IN_R + 2) * min(1.0, dx / 8) * 0.7
            canvas = canvas + seam[:, :, None] * np.array([1.0, 1.0, 1.0], np.float32)
        # pieces in motion
        active = np.where((state > 0) & (state < 1))[0]
        for k in active:
            info = cell_info[k]
            if info is None: continue
            x0, y0, x1, y1, m = info
            s = float(ease(state[k]))
            shift = (side[k] * dx, 0.0)
            piece = (body[y0:y1, x0:x1] * m[:, :, None])
            if is_dot_cell[k]:
                dot_scale = 1.0 - 0.72 * s                                  # the piece shrinks...
                fade_piece = 1.0 - ease(lin(state[k], 0.25, 0.8))           # ...turns white...
                blit(canvas, piece * (1 + 0.7 * s), m, (x0, y0, x1, y1), (sx[k], sy[k]), dot_scale, shift, fade_piece)
                # ...and becomes the dot, which grows into its own size and drifts to rest as the halves close
                d = sprites[k]
                grow = 0.35 + 0.65 * ease(lin(state[k], 0.2, 1.0))
                blit(canvas, d[4], d[5], d[:4], (d[6], d[7]), grow, (shift[0] * (1 - ease(lin(state[k], 0.5, 1.0))), 0.0), ease(lin(state[k], 0.18, 0.7)))
            else:
                blit(canvas, piece * (1 + 0.5 * s), m, (x0, y0, x1, y1), (sx[k], sy[k]), 1.0 - 0.9 * s, shift, 1.0 - ease(lin(state[k], 0.0, 0.85)))
        # dots that are finished sit in place
        done = np.where(state >= 1)[0]
        for k in done:
            if k < len(sprites):
                d = sprites[k]
                blit(canvas, d[4], d[5], d[:4], (d[6], d[7]), 1.0, (0.0, 0.0), 1.0)
    # the end: blend to the exact logo
    fin = ease(lin(t, *T_FINAL))
    out = canvas * (1 - fin) + P * fin
    return np.clip(out, 0, 1)

if args.preview:
    os.makedirs('/tmp/cero-preview', exist_ok=True)
    for t in [0.5, 1.2, 2.4, 3.6, 4.8, 5.8, 7.0, 8.4, 9.8, 11.2, 12.6, 14.0]:
        cv2.imwrite(f'/tmp/cero-preview/t{t:05.2f}.png', (frame(t)[:, :, ::-1] * 255).astype(np.uint8))
    print('wrote /tmp/cero-preview'); sys.exit(0)

cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
       '-vf', 'scale=1080:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', args.out]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
frames = int(T_END * FPS)
for i in range(frames):
    f8 = (frame(i / FPS) * 255 + 0.5).astype(np.uint8)
    proc.stdin.write(f8.tobytes())
    if i % 30 == 0: print(f'{i}/{frames}', flush=True)
proc.stdin.close(); proc.wait()
print('wrote', args.out)
