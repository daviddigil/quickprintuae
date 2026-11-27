#!/usr/bin/env python3
"""
Builds the web-ready brand files in web/public/brand and the app icons from the supplied logos in ../Quickprint_logos.
Run from the repo root:  python3 web/scripts/build-brand-assets.py
Requires Pillow. Derived files (clearly derived from the supplied artwork, not redrawn):
  *-dark   navy wordmark recoloured to white, for dark backgrounds
  mark-*   the QP loop cropped out of the Stacked logo
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "Quickprint_logos")
OUT = os.path.join(ROOT, "web", "public", "brand")
APP = os.path.join(ROOT, "web", "src", "app")
os.makedirs(OUT, exist_ok=True)
BLUE = (51, 0, 255)

def load(n): return Image.open(os.path.join(SRC, f"Quickprint-{n}.png")).convert("RGBA")

def to_white(im, x0=0, y0=0):
    """Recolour the dark navy wordmark (inside the region x>=x0, y>=y0) to white, keeping alpha."""
    im = im.copy(); px = im.load(); w, h = im.size
    for y in range(y0, h):
        for x in range(x0, w):
            r, g, b, a = px[x, y]
            if a and (0.299 * r + 0.587 * g + 0.114 * b) < 115 and not (g > r + 40 and g > 110):
                px[x, y] = (255, 255, 255, a)
    return im

def save(im, name, widths):
    for w in widths:
        h = round(im.height * w / im.width)
        r = im.resize((w, h), Image.LANCZOS)
        r.save(os.path.join(OUT, f"{name}-{w}.png"), optimize=True)
        r.save(os.path.join(OUT, f"{name}-{w}.webp"), quality=92, method=6)

H, S, G = load("Horizontal"), load("Stacked"), load("Signature")
variants = {"horizontal": (H, (240, 480, 960), (410, 0)), "stacked": (S, (320, 640), (0, 540)), "signature": (G, (280, 560), (150, 0))}
for name, (im, widths, (x0, y0)) in variants.items():
    save(im, name, widths)
    save(to_white(im, x0, y0), f"{name}-dark", widths)

# mark-only: the QP loop at the top of the stacked logo
top = S.crop((0, 0, S.width, 500)); bb = top.getbbox(); mark = top.crop(bb)
side = max(mark.size); sq = Image.new("RGBA", (side, side), (0, 0, 0, 0)); sq.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2), mark)
for s in (64, 128, 256, 512): sq.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f"mark-{s}.png"), optimize=True)

def on_bg(mark_sq, size, bg, pad=0.14, radius=0.0):
    c = Image.new("RGBA", (size, size), bg)
    inner = round(size * (1 - 2 * pad)); m = mark_sq.resize((inner, inner), Image.LANCZOS)
    c.paste(m, ((size - inner) // 2, (size - inner) // 2), m)
    if radius:
        mask = Image.new("L", (size, size), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), round(size * radius), fill=255)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0)); out.paste(c, (0, 0), mask); return out
    return c

# app icons: transparent-corner 512 for the browser tab/app, white 180 for iOS, maskable with extra padding for Android
on_bg(sq, 512, (255, 255, 255, 255), 0.12, 0.22).save(os.path.join(APP, "icon.png"), optimize=True)
on_bg(sq, 180, (255, 255, 255, 255), 0.14).convert("RGB").save(os.path.join(APP, "apple-icon.png"), optimize=True)
on_bg(sq, 192, (255, 255, 255, 255), 0.12, 0.22).save(os.path.join(OUT, "icon-192.png"), optimize=True)
on_bg(sq, 512, (255, 255, 255, 255), 0.12, 0.22).save(os.path.join(OUT, "icon-512.png"), optimize=True)
on_bg(sq, 512, (255, 255, 255, 255), 0.26).convert("RGB").save(os.path.join(OUT, "icon-maskable-512.png"), optimize=True)
ico = [on_bg(sq, s, (255, 255, 255, 255), 0.06, 0.2) for s in (16, 32, 48)]
ico[2].save(os.path.join(APP, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])

# social share image 1200x630: clean white, stacked logo centred, thin brand gradient bar
def social(path):
    c = Image.new("RGB", (1200, 630), (255, 255, 255)); logo = S.copy(); logo.thumbnail((620, 520), Image.LANCZOS)
    c.paste(logo, ((1200 - logo.width) // 2, (630 - logo.height) // 2 - 6), logo)
    bar = Image.new("RGB", (1200, 14)); d = ImageDraw.Draw(bar)
    stops = [(0, 255, 204), (255, 0, 127), (51, 0, 255)]
    for x in range(1200):
        t = x / 1199 * 2; i = min(int(t), 1); f = t - i
        d.line((x, 0, x, 14), fill=tuple(round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f) for k in range(3)))
    c.paste(bar, (0, 616)); c.save(path, optimize=True)
social(os.path.join(APP, "opengraph-image.png")); social(os.path.join(APP, "twitter-image.png"))
print("brand assets written to", OUT)
