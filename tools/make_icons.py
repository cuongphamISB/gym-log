"""Draw the app icons (dumbbell on dark rounded square). Usage: python tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
BG, ACC = (10, 12, 15, 255), (212, 255, 58, 255)


def draw(size, safe=1.0, rounded=True):
    s = 4 * size  # supersample
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)
    else:
        d.rectangle([0, 0, s, s], fill=BG)
    c, k = s / 2, s * 0.62 * safe / 2  # half-width of the glyph area
    bar_h = k * 0.16
    d.rounded_rectangle([c - k * 0.62, c - bar_h / 2, c + k * 0.62, c + bar_h / 2], radius=int(bar_h / 2), fill=ACC)
    for sign in (-1, 1):
        # inner plate (tall) and outer plate (short)
        x1 = c + sign * k * 0.62
        w1, h1 = k * 0.26, k * 1.25
        x2 = c + sign * k * 0.92
        w2, h2 = k * 0.20, k * 0.80
        for x, w, h in ((x1, w1, h1), (x2, w2, h2)):
            d.rounded_rectangle([x - w / 2, c - h / 2, x + w / 2, c + h / 2], radius=int(w * 0.35), fill=ACC)
    return im.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
draw(192).save(OUT / "icon-192.png")
draw(512).save(OUT / "icon-512.png")
draw(512, safe=0.72, rounded=False).save(OUT / "maskable-512.png")
draw(180, rounded=False).save(OUT / "apple-touch-icon.png")
print("icons written to", OUT)
