#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
يولّد صورة بينتوريست احترافية عمودية (1000×1500) لكل منشور.
• العربية تُرسم عبر HarfBuzz (Raqm) — الترتيب والتشكيل صحيحان 100% (لا انعكاس).
• تصميم: خلفية تقنية داكنة + شعار + عنوان عريض + بطاقة أرقام + نتيجة ذهبية + زر نداء.
"""
import json, os, re, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "pinterest-pins")
os.makedirs(OUT, exist_ok=True)
_LOCAL_AR = "/home/user/arabic-bold.ttf"
_LOCAL_EN = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
AR = os.environ.get("AR_FONT") or (_LOCAL_AR if os.path.exists(_LOCAL_AR) else os.path.join(HERE, "fonts", "arabic-bold.ttf"))
EN = os.environ.get("EN_FONT") or (_LOCAL_EN if os.path.exists(_LOCAL_EN) else os.path.join(HERE, "fonts", "latin-bold.ttf"))

W, H = 1000, 1500
GOLD = (255, 199, 70)
GOLD_D = (214, 158, 30)
WHITE = (255, 255, 255)
MUTED = (150, 164, 194)
CARD = (17, 26, 47)
CARD_EDGE = (58, 76, 116)

_CMAPS = {}


def cmap_of(p):
    if p not in _CMAPS:
        _CMAPS[p] = TTFont(p, fontNumber=0).getBestCmap()
    return _CMAPS[p]


def clean(txt, path):
    cm = cmap_of(path)
    return re.sub(r"\s+", " ", "".join(c for c in txt if ord(c) < 128 or ord(c) in cm)).strip()


def font(sz, ar):
    return ImageFont.truetype(AR if ar else EN, sz)


def kw(ar):
    return {"direction": "rtl", "language": "ar"} if ar else {}


def tw(d, txt, f, ar):
    return d.textlength(txt, font=f, **kw(ar))


def draw(d, txt, x, y, f, fill, ar):
    d.text((x, y), txt, font=f, fill=fill, anchor=("ra" if ar else "la"), **kw(ar))


def wrap(d, txt, f, ar, max_w):
    words, lines, cur = txt.split(" "), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if tw(d, t, f, ar) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def fit(d, txt, ar, max_w, start=82, min_s=46, max_lines=4):
    for s in range(start, min_s - 1, -4):
        f = font(s, ar)
        ls = wrap(d, txt, f, ar, max_w)
        if len(ls) <= max_lines:
            return ls, f
    return ls, f


def background():
    img = Image.new("RGB", (W, H), (8, 12, 26))
    d = ImageDraw.Draw(img)
    for y in range(H):
        r = y / H
        d.line([(0, y), (W, y)], fill=(int(9 + 13 * r), int(13 + 20 * r), int(26 + 36 * r)))
    # هالة ضوء علوية
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-250, -420, 620, 380], fill=(28, 44, 92))
    gd.ellipse([520, 1080, 1180, 1660], fill=(20, 32, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    img = Image.blend(img, Image.blend(img, glow, 0.55), 0.85)
    d = ImageDraw.Draw(img)
    for x in range(0, W, 100):
        d.line([(x, 0), (x, H)], fill=(255, 255, 255, 10), width=1)
    for y in range(0, H, 100):
        d.line([(0, y), (W, y)], fill=(255, 255, 255, 7), width=1)
    return img


def shadow(d, box, radius=28, off=8):
    x0, y0, x1, y1 = box
    d.rounded_rectangle([x0, y0 + off, x1, y1 + off], radius=radius, fill=(4, 7, 16))


def logo(d, x, y, s=1.0):
    """علامة: مربع ذهبي + أعمدة تنازلية"""
    d.rounded_rectangle([x, y, x + 62 * s, y + 62 * s], radius=16, fill=GOLD)
    bars = [(10, 34), (24, 24), (38, 15), (48, 8)]
    for i, (bx, bh) in enumerate(bars):
        col = (16, 22, 40) if i < 3 else (198, 60, 60)
        d.rounded_rectangle([x + bx * s, y + (40 - bh) * s, x + (bx + 8) * s, y + 40 * s], radius=3, fill=col)


def make_pin(p):
    ar = p.get("lang", "ar") == "ar"
    fp = AR if ar else EN
    img = background()
    d = ImageDraw.Draw(img)
    M, RX = 72, 72          # RX = الحد الأيمن للنص العربي
    LX = W - M              # الحد الأيسر للنص العربي = يمين الكادر ناقص الهامش

    # ── الشعار والهوية ──
    logo(d, M, 58)
    draw(d, "ProfitLeak AI", M + 82, 62, font(40, False), GOLD, False)
    draw(d, clean("احسب ربحك الحقيقي" if ar else "Find your real profit", fp), M + 82, 116, font(26, ar), MUTED, ar)
    d.line([(M, 178), (W - M, 178)], fill=(52, 68, 106), width=3)
    d.ellipse([M, 174, M + 9, 183], fill=GOLD)

    # ── العنوان ──
    lines, f = fit(d, clean(p["title"], fp), ar, W - 2 * M)
    y = 240
    for ln in lines:
        draw(d, ln, LX if ar else M, y, f, WHITE, ar)
        y += f.size + 18

    # ── بطاقة الأرقام ──
    body = clean(p["body"].replace("**", "").replace("▪️", "•").replace("🔻", ""), fp)
    rows = [l.strip() for l in body.split("\n") if l.strip() and
            (l.strip().startswith(("•", "-")) or "= " in l or l.strip().startswith("="))]
    if not rows:
        rows = [l.strip() for l in body.split("\n") if l.strip()][:3]
    rows = rows[:5]
    ch = 92 * len(rows) + 56
    top, bot = 720, min(720 + ch, 1225)
    shadow(d, [M, top, W - M, bot])
    d.rounded_rectangle([M, top, W - M, bot], radius=28, fill=CARD, outline=CARD_EDGE, width=2)
    ny = top + 30
    for ln in rows:
        is_res = ("= " in ln or ln.startswith("="))
        fs = 40 if not ar else 38
        ff = font(fs, ar)
        w = tw(d, ln, ff, ar)
        if is_res:
            # النتيجة: نص ذهبي فقط — بلا شريط
            draw(d, ln, (W - M - 26) if ar else (M + 26), ny, font(44 if not ar else 42, ar), GOLD, ar)
        else:
            draw(d, ln, (W - M - 26) if ar else (M + 26), ny, ff, WHITE, ar)
        ny += 92
        if ny > bot - 40:
            break

    # ── رسم بياني: تسرّب الأرباح ──
    cx, cy = W // 2, 1315
    for i, (bx, bh, col) in enumerate([(-140, 86, (45, 212, 191)), (-70, 64, (80, 150, 235)),
                                       (0, 42, GOLD), (70, 20, (235, 95, 95))]):
        d.rounded_rectangle([cx + bx, cy - bh, cx + bx + 44, cy + 26], radius=8, fill=col)
    d.line([(cx - 150, cy + 44), (cx + 150, cy + 44)], fill=(70, 88, 130), width=2)

    # ── زر النداء ──
    cta = clean(p.get("cta", ""), fp)
    if cta:
        cf = font(42, ar)
        w = tw(d, cta, cf, ar)
        bw = w + 84
        bx0 = (W - bw) / 2
        shadow(d, [bx0, 1372, bx0 + bw, 1444], radius=36, off=6)
        d.rounded_rectangle([bx0, 1372, bx0 + bw, 1444], radius=36, fill=GOLD)
        d.rounded_rectangle([bx0, 1372, bx0 + bw, 1406], radius=36, fill=GOLD)
        draw(d, cta, (bx0 + bw / 2 + w / 2) if ar else (bx0 + 42), 1384, cf, (14, 20, 38), ar)

    # ── الرابط ──
    url = "profitleakaii.qd.je"
    uf = font(28, False)
    d.text(((W - tw(d, url, uf, False)) / 2, 1456), url, font=uf, fill=MUTED)

    path = os.path.join(OUT, f"{p['id']}.jpg")
    img.save(path, "JPEG", quality=90, optimize=True, progressive=True)
    return path, os.path.getsize(path)


if __name__ == "__main__":
    cal = json.load(open(os.path.join(HERE, "calendar.json"), encoding="utf-8"))
    tot = 0
    for p in cal["posts"]:
        path, size = make_pin(p)
        tot += size
        print(f"✅ {os.path.basename(path):>6} {size/1024:6.0f} KB — #{p['id']} {p['theme']}")
    print(f"\n📦 {len(cal['posts'])} صورة · {tot/1048576:.1f} MB")
