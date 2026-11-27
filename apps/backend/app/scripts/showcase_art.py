"""Pillow-rendered artwork for the showcase seed: team crests, jersey portraits, tournament logos/banners.

Everything is drawn at 4x and downsampled with LANCZOS, so edges are crisp at the delivered size. The output
is plain PNG (WebP for the wide banner), passes `StorageService.validate_image_bytes`, and is small enough
(a few KB per crest or portrait) to embed as a data URI when R2 is not used.

Pure functions, no I/O and no randomness: the same inputs always produce the same pixels.
"""

import io
import math
from functools import lru_cache

from PIL import Image, ImageDraw, ImageFont

SS = 4  # supersampling factor
SLATE = (11, 15, 20)  # Deep Stadium Slate
EMERALD = (16, 185, 129)  # Pitch Emerald

_FONT_CANDIDATES = (
    "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf", "Arial Bold.ttf", "arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
)


@lru_cache(maxsize=32)
def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)  # Pillow >= 10.1: scalable built-in font


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def _luma(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast_text(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    return (255, 255, 255) if _luma(rgb) < 150 else (15, 23, 42)


def initials(name: str, limit: int = 2) -> str:
    parts = [w for w in name.replace("-", " ").split() if w[0].isalpha()]
    return "".join(w[0] for w in parts[:limit]).upper() or "?"


def _text_centered(draw: ImageDraw.ImageDraw, xy: tuple[float, float], text: str, size: int, fill, stroke=None,
                   stroke_width: int = 0) -> None:
    draw.text(xy, text, font=_font(size), fill=fill, anchor="mm", stroke_width=stroke_width, stroke_fill=stroke)


def _png(img: Image.Image, colors: int | None = None) -> bytes:
    buf = io.BytesIO()
    if colors:
        # a palette keeps flat-colour artwork tiny; FASTOCTREE is the quantiser that preserves alpha
        img = img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE if img.mode == "RGBA" else Image.Quantize.MEDIANCUT)
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ------------------------------------------------------------------------------------------- crests


def _shield_points(w: int, h: int, inset: float = 0.0) -> list[tuple[float, float]]:
    """A heater-shield outline filling a w x h box (inset shrinks it uniformly)."""
    m = (0.07 + inset) * w
    top, side_end, tip = (0.06 + inset) * h, 0.52 * h, (0.96 - inset) * h
    left, right, mid = m, w - m, w / 2
    pts = [(left, top), (right, top), (right, side_end)]
    steps = 40
    for i in range(1, steps + 1):  # right flank curving to the tip
        t = i / steps
        x = (1 - t) ** 2 * right + 2 * (1 - t) * t * (right - 0.02 * w) + t ** 2 * mid
        y = (1 - t) ** 2 * side_end + 2 * (1 - t) * t * (tip - 0.06 * h) + t ** 2 * tip
        pts.append((x, y))
    for x, y in reversed(pts[3:-1]):  # mirror for the left flank
        pts.append((w - x, y))
    pts.append((left, side_end))
    return pts


def _pattern(layer: ImageDraw.ImageDraw, template: int, w: int, h: int, color: tuple[int, int, int]) -> None:
    """Secondary-colour design laid over the primary shield. Eight distinct templates."""
    t = template % 8
    if t == 0:  # vertical half
        layer.rectangle([w / 2, 0, w, h], fill=color)
    elif t == 1:  # horizontal band
        layer.rectangle([0, 0.38 * h, w, 0.60 * h], fill=color)
    elif t == 2:  # diagonal sash
        layer.polygon([(0, 0.18 * h), (0, 0.46 * h), (w, 0.86 * h), (w, 0.58 * h)], fill=color)
    elif t == 3:  # chevron
        layer.polygon([(0, 0.30 * h), (w / 2, 0.62 * h), (w, 0.30 * h), (w, 0.50 * h), (w / 2, 0.82 * h),
                       (0, 0.50 * h)], fill=color)
    elif t == 4:  # three pales
        for i in (0, 2, 4):
            layer.rectangle([i * w / 5, 0, (i + 1) * w / 5, h], fill=color)
    elif t == 5:  # saltire-style cross
        layer.rectangle([0.42 * w, 0, 0.58 * w, h], fill=color)
        layer.rectangle([0, 0.34 * h, w, 0.50 * h], fill=color)
    elif t == 6:  # chief (top band)
        layer.rectangle([0, 0, w, 0.30 * h], fill=color)
    else:  # roundel
        layer.ellipse([0.18 * w, 0.20 * h, 0.82 * w, 0.72 * h], fill=color)


def crest_png(name: str, primary: str, secondary: str, template: int, size: int = 160) -> bytes:
    """A shield crest: primary field, secondary design, white keyline, initials, and a star."""
    w = h = size * SS
    p, s = hex_rgb(primary), hex_rgb(secondary)
    shield = Image.new("L", (w, h), 0)
    ImageDraw.Draw(shield).polygon(_shield_points(w, h), fill=255)

    body = Image.new("RGBA", (w, h), p + (255,))
    _pattern(ImageDraw.Draw(body), template, w, h, s)
    # soft shading on the right flank gives the shield some volume
    shade = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(shade).polygon([(w / 2, 0), (w, 0), (w, h), (w / 2, h)], fill=(0, 0, 0, 34))
    body = Image.alpha_composite(body, shade)

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(body, (0, 0), shield)
    d = ImageDraw.Draw(out)
    d.line(_shield_points(w, h) + [_shield_points(w, h)[0]], fill=(255, 255, 255, 255), width=int(0.035 * w), joint="curve")
    d.line(_shield_points(w, h, 0.045) + [_shield_points(w, h, 0.045)[0]], fill=SLATE + (150,), width=int(0.012 * w), joint="curve")

    text = initials(name)
    fill = (255, 255, 255)
    _text_centered(d, (w / 2, 0.50 * h), text, int(0.30 * w), fill, stroke=SLATE, stroke_width=int(0.020 * w))
    # a small star over the lettering
    cx, cy, r = w / 2, 0.24 * h, 0.060 * w
    star = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rad = r if i % 2 == 0 else r * 0.42
        star.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    d.polygon(star, fill=(251, 191, 36, 255), outline=SLATE + (255,))
    return _png(out.resize((size, size), Image.LANCZOS), colors=64)


# ----------------------------------------------------------------------------------------- portraits


def portrait_png(number: int, primary: str, secondary: str, size: int = 128, is_manager: bool = False) -> bytes:
    """A jersey avatar on a slate card: squad number in team colours (a coat for managers)."""
    w = h = size * SS
    p, s = hex_rgb(primary), hex_rgb(secondary)
    img = Image.new("RGB", (w, h), SLATE)
    d = ImageDraw.Draw(img)
    for y in range(h):  # vertical slate gradient
        t = y / h
        d.line([(0, y), (w, y)], fill=(int(17 + 22 * t), int(24 + 26 * t), int(39 + 34 * t)))
    d.ellipse([0.12 * w, 0.12 * h, 0.88 * w, 0.88 * h], fill=tuple(int(c * 0.30 + 20) for c in p))  # team-tinted halo

    # head and neck
    skin = (222, 184, 150)
    d.ellipse([0.39 * w, 0.14 * h, 0.61 * w, 0.37 * h], fill=skin)
    d.rectangle([0.45 * w, 0.32 * h, 0.55 * w, 0.42 * h], fill=skin)
    # jersey: sleeves then torso
    body = [(0.30 * w, 0.42 * h), (0.70 * w, 0.42 * h), (0.93 * w, 0.58 * h), (0.83 * w, 0.72 * h),
            (0.72 * w, 0.64 * h), (0.72 * w, 0.97 * h), (0.28 * w, 0.97 * h), (0.28 * w, 0.64 * h),
            (0.17 * w, 0.72 * h), (0.07 * w, 0.58 * h)]
    d.polygon(body, fill=p)
    if is_manager:
        d.polygon([(0.43 * w, 0.42 * h), (0.57 * w, 0.42 * h), (0.5 * w, 0.62 * h)], fill=(240, 244, 248))
    else:
        # sleeve cuffs and a V collar in the secondary colour
        d.polygon([(0.93 * w, 0.58 * h), (0.83 * w, 0.72 * h), (0.775 * w, 0.685 * h), (0.875 * w, 0.545 * h)], fill=s)
        d.polygon([(0.07 * w, 0.58 * h), (0.17 * w, 0.72 * h), (0.225 * w, 0.685 * h), (0.125 * w, 0.545 * h)], fill=s)
        d.polygon([(0.40 * w, 0.42 * h), (0.60 * w, 0.42 * h), (0.5 * w, 0.54 * h)], fill=skin)
        d.line([(0.40 * w, 0.42 * h), (0.5 * w, 0.54 * h), (0.60 * w, 0.42 * h)], fill=s, width=int(0.022 * w))
    label = "M" if is_manager else str(number)
    ink = (15, 23, 42) if is_manager else _contrast_text(p)
    _text_centered(d, (0.5 * w, 0.775 * h), label, int(0.27 * w), ink,
                   stroke=(255, 255, 255) if ink != (255, 255, 255) and not is_manager else None,
                   stroke_width=int(0.008 * w) if not is_manager and ink != (255, 255, 255) else 0)
    return _png(img.resize((size, size), Image.LANCZOS), colors=48)


# ------------------------------------------------------------------------------------ logo / banner


def logo_png(name: str, color: str, year: str = "", size: int = 192) -> bytes:
    """Round tournament badge: ring in the brand colour, laurel arcs, initials."""
    w = h = size * SS
    c = hex_rgb(color)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    d.ellipse([0.03 * w, 0.03 * h, 0.97 * w, 0.97 * h], fill=SLATE + (255,), outline=c + (255,), width=int(0.05 * w))
    d.ellipse([0.14 * w, 0.14 * h, 0.86 * w, 0.86 * h], fill=tuple(int(x * 0.35 + 12) for x in c) + (255,))
    d.arc([0.19 * w, 0.19 * h, 0.81 * w, 0.81 * h], 110, 250, fill=(251, 191, 36, 255), width=int(0.03 * w))
    d.arc([0.19 * w, 0.19 * h, 0.81 * w, 0.81 * h], 290, 70, fill=(251, 191, 36, 255), width=int(0.03 * w))
    _text_centered(d, (w / 2, 0.52 * h), initials(name, 3 if len(name.split()) > 2 else 2), int(0.22 * w),
                   (255, 255, 255), stroke=SLATE, stroke_width=int(0.012 * w))
    _text_centered(d, (w / 2, 0.69 * h), year, int(0.10 * w), (251, 191, 36))
    return _png(out.resize((size, size), Image.LANCZOS))


def banner_webp(title: str, subtitle: str, color: str, width: int = 1200, height: int = 300) -> bytes:
    """Wide hero banner: brand-colour to slate diagonal gradient, pitch markings, tournament title."""
    w, h = width * 2, height * 2  # 2x is plenty for a gradient, and keeps text crisp
    c = hex_rgb(color)
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = min(1.0, (x / w) * 0.75 + (y / h) * 0.45)
            px[x, y] = (int(c[0] * (1 - t) + SLATE[0] * t), int(c[1] * (1 - t) + SLATE[1] * t),
                        int(c[2] * (1 - t) + SLATE[2] * t))
    over = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(over)
    line = (255, 255, 255, 46)
    lw = max(3, w // 400)
    od.rectangle([0.05 * w, 0.14 * h, 0.95 * w, 0.86 * h], outline=line, width=lw)
    od.line([(w / 2, 0.14 * h), (w / 2, 0.86 * h)], fill=line, width=lw)
    od.ellipse([w / 2 - 0.09 * h, h / 2 - 0.09 * h, w / 2 + 0.09 * h, h / 2 + 0.09 * h], outline=line, width=lw)
    od.rectangle([0.05 * w, 0.32 * h, 0.15 * w, 0.68 * h], outline=line, width=lw)
    od.rectangle([0.85 * w, 0.32 * h, 0.95 * w, 0.68 * h], outline=line, width=lw)
    img = Image.alpha_composite(img.convert("RGBA"), over).convert("RGB")
    d = ImageDraw.Draw(img)
    d.text((0.07 * w, 0.46 * h), title, font=_font(int(0.115 * h)), fill=(255, 255, 255), anchor="lm",
           stroke_width=3, stroke_fill=SLATE)
    d.text((0.07 * w, 0.70 * h), subtitle, font=_font(int(0.062 * h)), fill=(167, 243, 208), anchor="lm")
    buf = io.BytesIO()
    img.resize((width, height), Image.LANCZOS).save(buf, format="WEBP", quality=84, method=6)
    return buf.getvalue()
