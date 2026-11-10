"""Draws the app artwork (original): a plate with a calorie-progress ring and a leaf.

Usage: python tools/make_icon.py app/assets
Writes icon.png (1024, opaque, for iOS), splash-icon.png (transparent mark for the launch screen),
favicon.png and the Android adaptive-icon layers. Drawn at 4x and downscaled for smooth edges.
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 1024
K = 4  # supersampling
N = S * K

GREEN_TOP = (46, 160, 104)
GREEN_BOTTOM = (15, 92, 60)
WHITE = (255, 255, 255)
GOLD_A = (255, 226, 122)
GOLD_B = (255, 176, 46)


def gradient(size, top, bottom):
    """Vertical gradient from `top` to `bottom`."""
    base = Image.new("RGB", (size, size), top)
    base.paste(Image.new("RGB", (size, size), bottom), mask=Image.linear_gradient("L").resize((size, size)))
    return base


def background():
    img = gradient(N, GREEN_TOP, GREEN_BOTTOM)
    # soft highlight in the top-left corner
    glow = Image.new("L", (N, N), 0)
    ImageDraw.Draw(glow).ellipse((-N * 0.35, -N * 0.45, N * 0.85, N * 0.6), fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(N * 0.12))
    img.paste(Image.new("RGB", (N, N), (120, 220, 160)), mask=glow)
    return img


def leaf_mask(cx, cy, length, width, angle):
    """A pointed leaf: two circular arcs meeting at both tips."""
    m = Image.new("L", (N, N), 0)
    r = (length * length / 4 + width * width / 4) / width  # radius of each arc
    a = Image.new("L", (N, N), 0)
    b = Image.new("L", (N, N), 0)
    off = r - width / 2
    ImageDraw.Draw(a).ellipse((cx - off - r, cy - r, cx - off + r, cy + r), fill=255)
    ImageDraw.Draw(b).ellipse((cx + off - r, cy - r, cx + off + r, cy + r), fill=255)
    m = ImageChops.multiply(a, b)
    return m.rotate(angle, center=(cx, cy), resample=Image.BICUBIC)


def mark(scale=1.0):
    """The ring + leaf on a transparent layer (RGBA, N×N), centred."""
    layer = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = N / 2
    R = N * 0.315 * scale  # ring centre-line radius
    w = N * 0.062 * scale  # ring width

    # track
    d.ellipse((c - R - w / 2, c - R - w / 2, c + R + w / 2, c + R + w / 2), outline=(255, 255, 255, 70), width=round(w))

    # progress arc with a gold gradient along the sweep, round caps
    start, sweep = -90, 262
    steps = 360
    for i in range(steps):
        t = i / (steps - 1)
        ang = math.radians(start + sweep * t)
        col = tuple(round(GOLD_A[k] + (GOLD_B[k] - GOLD_A[k]) * t) for k in range(3))
        x, y = c + R * math.cos(ang), c + R * math.sin(ang)
        d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=col + (255,))

    # leaf
    lm = leaf_mask(c, c + N * 0.005 * scale, N * 0.41 * scale, N * 0.215 * scale, -38)
    layer.paste(WHITE + (255,), mask=lm)
    # vein
    vein = Image.new("L", (N, N), 0)
    vd = ImageDraw.Draw(vein)
    L = N * 0.15 * scale
    vd.line((c, c - L, c, c + L * 1.2), fill=255, width=round(N * 0.014 * scale))
    for dy in (-0.05, 0.02):  # two pairs of side veins, pointing towards the tip
        y0 = c + N * dy * scale
        for sx in (-1, 1):
            vd.line((c, y0 + N * 0.04 * scale, c + sx * N * 0.042 * scale, y0), fill=255, width=round(N * 0.011 * scale))
    vein = vein.rotate(-38, center=(c, c), resample=Image.BICUBIC)
    vein = ImageChops.multiply(vein, lm)
    layer.paste(GREEN_BOTTOM + (255,), mask=vein)
    return layer


def with_shadow(layer, blur=0.012, dy=0.012, alpha=90):
    sh = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    a = layer.split()[3].point(lambda v: v * alpha // 255)
    a = ImageChops.offset(a, 0, round(N * dy)).filter(ImageFilter.GaussianBlur(N * blur))
    sh.paste((6, 50, 32, 255), mask=a)
    return Image.alpha_composite(sh, layer)


def down(img, size=S):
    return img.resize((size, size), Image.LANCZOS)


def main(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    bg = background()

    icon = bg.convert("RGBA")
    icon = Image.alpha_composite(icon, with_shadow(mark()))
    down(icon).convert("RGB").save(out / "icon.png")
    down(icon, 48).convert("RGB").save(out / "favicon.png")

    # launch screen: the same mark, slightly larger, on the solid brand colour set in app.json
    down(with_shadow(mark(1.25), alpha=60)).save(out / "splash-icon.png")

    # Android adaptive icon: the mark must sit inside the central 66 % safe zone
    down(bg).save(out / "android-icon-background.png")
    down(with_shadow(mark(0.72))).save(out / "android-icon-foreground.png")
    mono = mark(0.72)
    solid = Image.new("RGBA", (N, N), (255, 255, 255, 0))
    solid.paste((255, 255, 255, 255), mask=mono.split()[3])
    down(solid).save(out / "android-icon-monochrome.png")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
