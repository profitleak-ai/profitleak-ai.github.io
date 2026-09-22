#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
يولّد صورة بينتوريست عمودية (1000×1500) لكل منشور في التقويم.
تصميم: خلفية تقنية داكنة + عنوان عريض + بطاقة أرقام + زر نداء + الرابط.
"""
import json, os, sys, re
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "pinterest-pins")
os.makedirs(OUT, exist_ok=True)
AR_FONT = "/home/user/arabic-bold.ttf"
EN_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

W, H = 1000, 1500
GOLD = (255, 201, 77)
WHITE = (255, 255, 255)
MUTED = (160, 172, 200)
TEAL = (45, 212, 191)
BG_TOP = (10, 15, 30)
BG_BOT = (22, 33, 62)


_CMAPS = {}


def cmap_of(path):
    if path not in _CMAPS:
        from fontTools.ttLib import TTFont
        _CMAPS[path] = TTFont(path, fontNumber=0).getBestCmap()
    return _CMAPS[path]


def clean(txt, path):
    """يحذف أي محرف ليس له رسم في الخط (إيموجي/رموز) لمنع المربّعات الفارغة"""
    cm = cmap_of(path)
    return re.sub(r"\s+", " ", "".join(c for c in txt if ord(c) < 128 or ord(c) in cm)).strip()


def fix(txt, arabic):
    txt = clean(txt, AR_FONT if arabic else EN_FONT)
    if not arabic:
        return txt
    try:
        return get_display(arabic_reshaper.reshape(txt))
    except Exception:
        return txt


def font(size, arabic):
    return ImageFont.truetype(AR_FONT if arabic else EN_FONT, size)


def wrap(draw, txt, f, max_w):
    words, lines, cur = txt.split(" "), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def fit_lines(draw, txt, arabic, max_w, start=76, min_s=44, max_lines=5):
    for s in range(start, min_s - 1, -4):
        f = font(s, arabic)
        ls = wrap(draw, txt, f, max_w)
        if len(ls) <= max_lines:
            return ls, f
    return ls, f


def gradient():
    img = Image.new("RGB", (W, H), BG_TOP)
    d = ImageDraw.Draw(img)
    for y in range(H):
        r = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * r) for i in range(3)))
    # شبكة تقنية خفيفة
    for x in range(0, W, 100):
        d.line([(x, 0), (x, H)], fill=(255, 255, 255, 12), width=1)
    for y in range(0, H, 100):
        d.line([(0, y), (W, y)], fill=(255, 255, 255, 8), width=1)
    return img


def chart_icon(d, cx, cy, s=1.0):
    """أعمدة تنازلية + سهم هابط = تسرّب الأرباح"""
    bars = [(0, 120, TEAL), (70, 90, (90, 200, 245)), (140, 60, GOLD), (210, 30, (255, 120, 120))]
    for dx, h, col in bars:
        x = cx - 130 * s + dx * s
        d.rounded_rectangle([x, cy - h * s, x + 44 * s, cy + 30 * s], radius=8, fill=col)


def make_pin(p):
    ar = p.get("lang", "ar") == "ar"
    img = gradient()
    d = ImageDraw.Draw(img)
    M = 70

    # الهوية أعلى
    d.text((M, 62), "ProfitLeak AI", font=font(42, False), fill=GOLD)
    d.text((M, 118), fix("احسب ربحك الحقيقي" if ar else "Find your real profit", ar), font=font(28, ar), fill=MUTED)
    d.line([(M, 168), (W - M, 168)], fill=GOLD, width=3)

    # العنوان
    title = fix(p["title"], ar)
    lines, f = fit_lines(d, title, ar, W - 2 * M, start=76, min_s=46, max_lines=4)
    y = 230
    for ln in lines:
        d.text((M, y), ln, font=f, fill=WHITE)
        y += f.size + 16

    # بطاقة الأرقام
    body = p["body"].replace("**", "").replace("▪️", "•").replace("🔻", "").replace("😳", "").replace("😅", "")
    nums = [l.strip() for l in body.split("\n") if l.strip() and (l.strip().startswith(("•", "-", "= ", "=")) or "= " in l)]
    if not nums:
        nums = [l.strip() for l in body.split("\n") if l.strip()][:3]
    nums = nums[:5]
    card_top, card_bot = 700, 700 + 96 * len(nums) + 70
    d.rounded_rectangle([M, card_top, W - M, min(card_bot, 1210)], radius=26, fill=(18, 26, 48), outline=(70, 88, 130), width=2)
    ny = card_top + 36
    for ln in nums:
        col = GOLD if ("= " in ln or ln.startswith("=")) else WHITE
        d.text((M + 34, ny), fix(ln, ar), font=font(40 if not ar else 38, ar), fill=col)
        ny += 96
        if ny > 1190:
            break

    # أيقونة + سهم (تسرّب)
    chart_icon(d, W // 2, 1290, s=1.05)

    # زر النداء
    cta = fix(p.get("cta", ""), ar)
    if cta:
        cf = font(44, ar)
        tw = d.textlength(cta, font=cf)
        bx0 = (W - tw - 80) / 2
        d.rounded_rectangle([bx0, 1350, bx0 + tw + 80, 1426], radius=38, fill=GOLD)
        d.text((bx0 + 40, 1362), cta, font=cf, fill=(12, 18, 35))

    # الرابط
    url = "profitleakaii.qd.je"
    uf = font(30, False)
    d.text(((W - d.textlength(url, font=uf)) / 2, 1444), url, font=uf, fill=MUTED)

    path = os.path.join(OUT, f"{p['id']}.jpg")
    img.save(path, "JPEG", quality=88, optimize=True)
    return path, os.path.getsize(path)


if __name__ == "__main__":
    cal = json.load(open(os.path.join(HERE, "calendar.json"), encoding="utf-8"))
    total = 0
    for p in cal["posts"]:
        path, size = make_pin(p)
        total += size
        print(f"✅ {os.path.basename(path):>6}  {size/1024:6.0f} KB  — #{p['id']} {p['theme']}")
    print(f"\n📦 المجموع: {len(cal['posts'])} صورة · {total/1024/1024:.1f} MB → {OUT}")
