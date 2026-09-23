#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
محرك الفيديو الاحترافي — ProfitLeak AI
يولّد فيديو عمودي 1080×1920 (ريلز/شورتس/بن فيديو) لكل منشور:
• الإطارات: Pillow (العربية عبر HarfBuzz/Raqm — ترتيب صحيح 100%)
• الترميز: FFmpeg / H.264 + faststart
• المشاهد: هوية ← عنوان ← بطاقة أرقام ← نتيجة ذهبية ← رسم بياني ← نداء
"""
import json, os, sys, math, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_pins as mp

OUT = os.path.join(os.path.dirname(HERE), "videos")
os.makedirs(OUT, exist_ok=True)

W, H = 1080, 1920
FPS = 30
TOTAL = 510                 # 17 ثانية
GOLD = (255, 199, 70)
TEAL = (45, 212, 191)
RED = (235, 95, 95)
BLUE = (78, 140, 232)
WHITE = (255, 255, 255)
MUTED = (147, 164, 200)
CARD = (16, 25, 48)
CARD_EDGE = (51, 69, 110)

# ───────── قوالب بصرية (تتغير تلقائيًا كل يوم) ─────────
TEMPLATES = {
    "midnight": dict(bg=(7, 11, 24), g1=(58, 92, 180, 90), g2=(255, 199, 70, 34),
                     gold=(255, 199, 70), accent=(45, 212, 191), bar2=(78, 140, 232),
                     card=(16, 25, 48), edge=(51, 69, 110), text=(220, 231, 247),
                     chart="bars", entr="slide"),
    "royal":    dict(bg=(15, 9, 34), g1=(124, 58, 190, 95), g2=(255, 120, 180, 40),
                     gold=(255, 214, 102), accent=(167, 139, 250), bar2=(236, 72, 153),
                     card=(26, 17, 50), edge=(88, 56, 140), text=(232, 226, 255),
                     chart="line", entr="zoom"),
    "emerald":  dict(bg=(4, 22, 26), g1=(16, 150, 140, 95), g2=(255, 199, 70, 36),
                     gold=(255, 205, 90), accent=(52, 211, 153), bar2=(34, 211, 238),
                     card=(8, 34, 38), edge=(26, 96, 96), text=(214, 245, 240),
                     chart="line", entr="slide"),
    "sunset":   dict(bg=(26, 10, 16), g1=(198, 82, 62, 92), g2=(255, 176, 80, 46),
                     gold=(255, 176, 80), accent=(248, 113, 113), bar2=(251, 191, 36),
                     card=(36, 15, 20), edge=(120, 54, 54), text=(255, 232, 226),
                     chart="bars", entr="zoom"),
}
TEMPLATE_ORDER = ["midnight", "royal", "emerald", "sunset"]


def pick_template(p):
    """يختار القالب: من المتغيّر البيئي، أو بالتناوب حسب رقم المنشور"""
    name = os.environ.get("VIDEO_TEMPLATE", "").strip()
    if name in TEMPLATES:
        return name, TEMPLATES[name]
    if name == "random" or os.environ.get("VIDEO_TEMPLATE_RANDOM"):
        import random
        name = random.choice(TEMPLATE_ORDER)
        return name, TEMPLATES[name]
    name = TEMPLATE_ORDER[int(p.get("id", 1)) % len(TEMPLATE_ORDER)]
    return name, TEMPLATES[name]

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


# ───────── أدوات ─────────
def ease(x):
    x = max(0.0, min(1.0, x))
    return 1 - math.pow(1 - x, 3)


def prog(f, start, dur):
    return ease((f - start) / float(dur)) if f > start else 0.0


def layer(w, h):
    return Image.new("RGBA", (max(1, int(w)), max(1, int(h))), (0, 0, 0, 0))


def fade(img, a):
    if a >= 0.999:
        return img
    if a <= 0.001:
        return layer(img.width, img.height)
    img = img.copy()
    img.putalpha(img.getchannel("A").point(lambda v: int(v * a)))
    return img


def rrect(d, box, r, fill, outline=None, width=2):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


# ───────── طبقات ثابتة تُحسب مرة واحدة ─────────
def build_bg(base=(7, 11, 24)):
    img = Image.new("RGB", (W, H), base)
    d = ImageDraw.Draw(img)
    for y in range(0, H, 4):
        t = y / H
        d.line([(0, y), (W, y + 4)], fill=(int(base[0] + 20 * t), int(base[1] + 30 * t),
                                           int(base[2] + 55 * t)))
    return img


def build_glow(size, color, strength):
    g = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    d.ellipse([0, 0, size, size], fill=color + (strength,))
    return g.filter(ImageFilter.GaussianBlur(size / 5))


def build_grid(step=112):
    g = Image.new("RGBA", (W + 240, H + 240), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    for x in range(0, W + 240, step):
        d.line([(x, 0), (x, H + 240)], fill=(255, 255, 255, 12), width=1)
    for y in range(0, H + 240, step):
        d.line([(0, y), (W + 240, y)], fill=(255, 255, 255, 9), width=1)
    return g


def build_vignette():
    v = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(v)
    d.ellipse([-W * 0.35, -H * 0.12, W * 1.35, H * 1.12], fill=255)
    v = v.filter(ImageFilter.GaussianBlur(220))
    return v.point(lambda p: 255 - int(p * 0.55))


# ───────── عناصر ─────────
def brand_layer(ar, T=None):
    T = T or TEMPLATES["midnight"]
    gold = T["gold"]
    L = layer(880, 180)
    d = ImageDraw.Draw(L)
    rrect(d, [0, 30, 130, 160], 34, gold)
    for i, h in enumerate([104, 78, 52, 28]):
        rrect(d, [22 + i * 26, 142 - h, 40 + i * 26, 142], 6, (16, 22, 40) if i < 3 else RED)
    mp.draw(d, "ProfitLeak AI", 160, 34, mp.font(64, False), gold, False)
    tag = mp.clean("احسب ربحك الحقيقي" if ar else "Find your real profit", mp.AR if ar else mp.EN)
    mp.draw(d, tag, 160, 112, mp.font(34, ar), MUTED, ar)
    return L


def text_layer(txt, fnt, ar, color, maxw=980):
    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    w = mp.tw(probe, txt, fnt, ar)
    L = layer(min(int(w) + 40, W), int(fnt.size * 1.6))
    d = ImageDraw.Draw(L)
    mp.draw(d, txt, L.width - 20 if ar else 20, 10, fnt, color, ar)
    return L


def bar_layer():
    return None


def build_frames(p, T=None, tname=""):
    T = T or TEMPLATES["midnight"]
    ar = p.get("lang", "ar") == "ar"
    fpath = mp.AR if ar else mp.EN
    bg = build_bg(T["bg"])
    glow1 = build_glow(1100, T["g1"][:3], T["g1"][3])
    glow2 = build_glow(1000, T["g2"][:3], T["g2"][3])
    grid = build_grid()
    vig = build_vignette()
    brand = brand_layer(ar, T)

    title_lines, tf = mp.fit(ImageDraw.Draw(Image.new("RGB", (10, 10))),
                             mp.clean(p["title"], fpath), ar, W - 200)
    body = mp.clean(p["body"].replace("**", "").replace("▪️", "•").replace("🔻", ""), fpath)
    rows = [l.strip() for l in body.split("\n") if l.strip() and
            (l.strip().startswith(("•", "-")) or "= " in l or l.strip().startswith("="))]
    if not rows:
        rows = [l.strip() for l in body.split("\n") if l.strip()][:3]
    rows = rows[:4]
    result = next((r for r in rows if "= " in r or r.startswith("=")), rows[-1] if rows else "")
    rows = [r for r in rows if r != result][:3] + ([result] if result else [])

    rf = mp.font(52, ar)
    resf = mp.font(62, ar)
    ct = mp.clean(p.get("cta", ""), fpath)
    ctf = mp.font(58, ar)

    frames = []
    for f in range(TOTAL):
        img = bg.copy()
        # خلفية متحركة
        img.paste(glow1, (-320, int(-260 + f * 0.55)), glow1)
        img.paste(glow2, (int(W - 700), int(H - 620 - f * 0.42)), glow2)
        img.paste(grid, (-120, int(-120 - (f * 0.35) % 112)), grid)
        img.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0), vig)

        ov = layer(W, H)
        od = ImageDraw.Draw(ov)

        # الهوية
        a = prog(f, 8, 26)
        if a:
            ov.paste(fade(brand, a), (int((W - 880) / 2), int(150 + (1 - a) * 40)), fade(brand, a))

        # العنوان
        y = 430
        for i, ln in enumerate(title_lines):
            a = prog(f, 52 + i * 16, 24)
            if not a:
                y += tf.size + 26
                continue
            tl = text_layer(ln, tf, ar, WHITE, W - 180)
            x = (W - 90 - tl.width) if ar else 90
            if T["entr"] == "zoom":
                sc = 0.82 + 0.18 * a
                tl2 = tl.resize((max(1, int(tl.width * sc)), max(1, int(tl.height * sc))), Image.LANCZOS)
                ov.paste(fade(tl2, a), (int(x - (tl2.width - tl.width) / 2), int(y + (1 - a) * 10)), fade(tl2, a))
            else:
                ov.paste(fade(tl, a), (int(x + (1 - a) * (60 if ar else -60)), int(y + (1 - a) * 18)), fade(tl, a))
            y += tf.size + 26

        # بطاقة الأرقام
        card_h = 118 * len(rows) + 250
        a = prog(f, 150, 26)
        if a:
            ca = layer(W - 160, card_h)
            cd = ImageDraw.Draw(ca)
            rrect(cd, [0, 0, W - 160, card_h], 36, T["card"] + (235,), T["edge"], 3)
            ov.paste(fade(ca, a), (80, int(880 + (1 - a) * 50)), fade(ca, a))

            ny = 80 + 880
            for i, r in enumerate(rows):
                ra = prog(f, 172 + i * 15, 22)
                if not ra:
                    ny += 118
                    continue
                is_res = (r == result)
                # النتيجة: نص ذهبي فقط — بلا شريط/مربع
                rl = text_layer(r if is_res else "• " + r, resf if is_res else rf, ar,
                                T["gold"] if is_res else T["text"])
                rx = (W - 130 - rl.width) if ar else 130
                ov.paste(fade(rl, ra), (int(rx + (1 - ra) * (70 if ar else -70)), ny), fade(rl, ra))
                ny += 118

        # الرسم البياني
        base_y = 1720
        if T["chart"] == "line":
            k = prog(f, 262, 72)
            if k:
                vals = [40, 105, 175, 300]
                x0, dx = int(W / 2 - 240), 160
                pts, stop = [], k * (len(vals) - 1)
                for i, v in enumerate(vals):
                    if i <= stop:
                        pts.append((x0 + i * dx, base_y - v))
                i0 = int(stop)
                if i0 < len(vals) - 1:
                    fr = stop - i0
                    y0, y1 = base_y - vals[i0], base_y - vals[i0 + 1]
                    pts.append((x0 + (i0 + fr) * dx, y0 + (y1 - y0) * fr))
                if len(pts) >= 2:
                    od.polygon(pts + [(pts[-1][0], base_y), (pts[0][0], base_y)], fill=T["accent"] + (58,))
                    od.line(pts, fill=T["accent"] + (255,), width=8)
                    for (px, py) in pts:
                        od.ellipse([px - 9, py - 9, px + 9, py + 9], fill=T["gold"] + (255,))
        else:
            for i, (bh, col) in enumerate([(190, T["accent"]), (140, T["bar2"]), (92, T["gold"]), (44, RED)]):
                g = prog(f, 260 + i * 10, 32)
                if not g:
                    continue
                h = int(bh * g)
                x = int(W / 2 - 190 + i * 100)
                od.rounded_rectangle([x, base_y - h, x + 62, base_y], radius=14, fill=col + (255,))
        od.line([(W / 2 - 215, base_y + 14), (W / 2 + 255, base_y + 14)], fill=(70, 88, 130, 255), width=3)

        # نداء + رابط
        a = prog(f, 392, 26)
        if a and ct:
            probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
            cw = mp.tw(probe, ct, ctf, ar)
            pw, ph = int(cw + 130), 140
            pill = layer(pw, ph)
            pd = ImageDraw.Draw(pill)
            rrect(pd, [0, 0, pw, ph], 70, T["gold"])
            mp.draw(pd, ct, pw - 65 if ar else 65, 34, ctf, (12, 18, 34), ar)
            pop = ease(a) * 0.1 + 0.9
            pill = pill.resize((int(pw * pop), int(ph * pop)), Image.LANCZOS)
            ov.paste(fade(pill, a), (int((W - pill.width) / 2), 1520), fade(pill, a))
        ua = prog(f, 408, 22)
        if ua:
            ul = text_layer("profitleakaii.qd.je", mp.font(40, False), False, MUTED)
            ov.paste(fade(ul, ua), (int((W - ul.width) / 2), 1700), fade(ul, ua))

        yield Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def encode(stream, out):
    """يرمّز الإطارات أثناء توليدها — بلا تخزين في الذاكرة"""
    cmd = [FFMPEG, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    n = 0
    for fr in stream:
        pr.stdin.write(fr.tobytes())
        n += 1
    pr.stdin.close()
    err = pr.stderr.read().decode("utf-8", "ignore")
    if pr.wait() != 0:
        raise RuntimeError(err[-1500:])
    return n


def make_video(p, template=None):
    name, T = (template, TEMPLATES[template]) if template in TEMPLATES else pick_template(p)
    print(f"🎨 القالب: {name}")
    out = os.path.join(OUT, f"{p['id']}.mp4")
    n = encode(build_frames(p, T, name), out)
    return out, os.path.getsize(out), n


if __name__ == "__main__":
    cal = json.load(open(os.path.join(HERE, "calendar.json"), encoding="utf-8"))
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for p in cal["posts"]:
        if only and str(p["id"]) != only:
            continue
        path, size, n = make_video(p)
        print(f"✅ {os.path.basename(path):>7} {size/1024/1024:5.1f} MB · {n} إطار — #{p['id']} {p['theme']}")
    print(f"\n📦 المخرجات في {OUT}")
