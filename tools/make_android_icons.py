"""Replace Capacitor's default launcher icons and splash with the Gym Log dumbbell.
Usage: python tools/make_android_icons.py   (after `npx cap add android`)"""
from pathlib import Path
from PIL import Image, ImageDraw

RES = Path(__file__).resolve().parent.parent / "android" / "app" / "src" / "main" / "res"
BG, ACC = (10, 12, 15, 255), (212, 255, 58, 255)


def glyph(d, cx, cy, k):
    bar_h = k * 0.16
    d.rounded_rectangle([cx - k * 0.62, cy - bar_h / 2, cx + k * 0.62, cy + bar_h / 2], radius=int(bar_h / 2), fill=ACC)
    for sign in (-1, 1):
        for off, w, h in ((0.62, 0.26, 1.25), (0.92, 0.20, 0.80)):
            x = cx + sign * k * off
            d.rounded_rectangle([x - k * w / 2, cy - k * h / 2, x + k * w / 2, cy + k * h / 2], radius=int(k * w * 0.35), fill=ACC)


def icon(size, shape):  # shape: square | round | foreground
    s = size * 4
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if shape == "square":
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)
        glyph(d, s / 2, s / 2, s * 0.31)
    elif shape == "round":
        d.ellipse([0, 0, s - 1, s - 1], fill=BG)
        glyph(d, s / 2, s / 2, s * 0.29)
    else:  # adaptive foreground: 108dp canvas, keep the glyph inside the 66dp safe zone
        glyph(d, s / 2, s / 2, s * 0.22)
    return im.resize((size, size), Image.LANCZOS)


DENS = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
for name, f in DENS.items():
    folder = RES / f"mipmap-{name}"
    icon(int(48 * f), "square").save(folder / "ic_launcher.png")
    icon(int(48 * f), "round").save(folder / "ic_launcher_round.png")
    icon(int(108 * f), "foreground").save(folder / "ic_launcher_foreground.png")

(RES / "values" / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0A0C0F</color>\n</resources>\n', encoding="utf-8")

for p in RES.glob("drawable*/splash.png"):
    w, h = Image.open(p).size
    im = Image.new("RGBA", (w, h), BG)
    glyph(ImageDraw.Draw(im), w / 2, h / 2, min(w, h) * 0.14)
    im.save(p)
print("android icons + splash written")
