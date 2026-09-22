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
def build_bg():
    img = Image.new("RGB", (W, H), (7, 11, 24))
    d = ImageDraw.Draw(img)
    for y in range(0, H, 4):
        t = y / H
        d.line([(0, y), (W, y + 4)], fill=(int(7 + 20 * t), int(11 + 30 * t), int(24 + 55 * t)))
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
def brand_layer(ar):
    L = layer(880, 180)
    d = ImageDraw.Draw(L)
    rrect(d, [0, 30, 130, 160], 34, GOLD)
    for i, h in enumerate([104, 78, 52, 28]):
        rrect(d, [22 + i * 26, 142 - h, 40 + i * 26, 142], 6, (16, 22, 40) if i < 3 else RED)
    mp.draw(d, "ProfitLeak AI", 160, 34, mp.font(64, False), GOLD, False)
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


def build_frames(p):
    ar = p.get("lang", "ar") == "ar"
    fpath = mp.AR if ar else mp.EN
    bg = build_bg()
    glow1 = build_glow(1100, (58, 92, 180), 90)
    glow2 = build_glow(1000, (255, 199, 70), 34)
    grid = build_grid()
    vig = build_vignette()
    brand = brand_layer(ar)

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
            ov.paste(fade(tl, a), (int(x + (1 - a) * (60 if ar else -60)), int(y + (1 - a) * 18)), fade(tl, a))
            y += tf.size + 26

        # بطاقة الأرقام
        card_h = 118 * len(rows) + 250
        a = prog(f, 150, 26)
        if a:
            ca = layer(W - 160, card_h)
            cd = ImageDraw.Draw(ca)
            rrect(cd, [0, 0, W - 160, card_h], 36, CARD + (235,), CARD_EDGE, 3)
            ov.paste(fade(ca, a), (80, int(880 + (1 - a) * 50)), fade(ca, a))

            ny = 80 + 880
            for i, r in enumerate(rows):
                ra = prog(f, 172 + i * 15, 22)
                if not ra:
                    ny += 118
                    continue
                is_res = (r == result)
                if is_res:
                    rl = text_layer(r, resf, ar, (12, 18, 34))
                    pw, ph = rl.width + 60, resf.size + 46
                    pill = layer(pw, ph)
                    pd = ImageDraw.Draw(pill)
                    rrect(pd, [0, 0, pw, ph], 24, GOLD)
                    pd_rl = rl
                    pill.paste(pd_rl, (30, 22), pd_rl)
                    px = (W - 120 - pw) if ar else 120
                    pop = ease(min(1, ra)) * 0.08 + 0.92
                    pw2, ph2 = int(pw * pop), int(ph * pop)
                    pill = pill.resize((pw2, ph2), Image.LANCZOS)
                    ov.paste(fade(pill, ra), (int(px - (pw2 - pw) / 2), int(ny - (ph2 - ph) / 2)), fade(pill, ra))
                else:
                    rl = text_layer("• " + r, rf, ar, (220, 231, 247))
                    rx = (W - 130 - rl.width) if ar else 130
                    ov.paste(fade(rl, ra), (int(rx + (1 - ra) * (70 if ar else -70)), ny), fade(rl, ra))
                ny += 118

        # الرسم البياني
        base_y = 1720
        for i, (bh, col) in enumerate([(190, TEAL), (140, BLUE), (92, GOLD), (44, RED)]):
            g = prog(f, 260 + i * 10, 32)
            if not g:
                continue
            h = int(bh * g)
            x = int(W / 2 - 190 + i * 100)
            od.rounded_rectangle([x, base_y - h, x + 62, base_y], radius=14, fill=col + (255,))
        od.line([(W / 2 - 210, base_y + 14), (W / 2 + 210, base_y + 14)], fill=(70, 88, 130, 255), width=3)

        # نداء + رابط
        a = prog(f, 392, 26)
        if a and ct:
            probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
            cw = mp.tw(probe, ct, ctf, ar)
            pw, ph = int(cw + 130), 140
            pill = layer(pw, ph)
            pd = ImageDraw.Draw(pill)
            rrect(pd, [0, 0, pw, ph], 70, GOLD)
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


def make_video(p):
    out = os.path.join(OUT, f"{p['id']}.mp4")
    n = encode(build_frames(p), out)
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
