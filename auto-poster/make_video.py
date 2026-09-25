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
    mp.draw(d, tag, 160, 112, mp.font(34, ar), MUTED, False) if not ar else d.text((160, 112), tag, font=mp.font(34, True), fill=MUTED, anchor="la", direction="rtl", language="ar")
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


class BgStream:
    """يقرأ إطارات خلفية AI (1080×1920 RGB) من ffmpeg: ذهاب-إياب مُبطّأ + تعتيم لقراءة النص"""
    def __init__(self, path, total):
        need = total / FPS
        dur = 0.0
        try:
            pr = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True)
            import re as _re
            m = _re.search(r"Duration: (\d+):(\d+):([\d.]+)", pr.stderr)
            dur = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0.0
        except Exception:
            pass
        if dur >= need - 0.5:
            # لقطات حقيقية طويلة بما يكفي: تُعرض كما هي
            vf = (f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps={FPS},"
                  f"eq=brightness=-0.16:saturation=0.9,gblur=sigma=1.0,format=rgb24[v]")
        else:
            # مشهد AI قصير (5 ث) → ذهاب+إياب مُبطّأ لتغطية المدة بسلاسة
            k = max(1.0, need / max(2 * dur, 1.0))
            vf = (f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,split[a][b];"
                  f"[b]reverse[r];[a][r]concat=n=2:v=1:a=0,setpts={k:.3f}*PTS,fps={FPS},"
                  f"eq=brightness=-0.18:saturation=0.9,gblur=sigma=1.2,format=rgb24[v]")
        self.pr = subprocess.Popen([FFMPEG, "-v", "error", "-i", path, "-filter_complex", vf, "-map", "[v]",
                                    "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=W * H * 3 * 2)
        self.last = None
        self.n = W * H * 3

    def next(self):
        raw = self.pr.stdout.read(self.n) if self.pr.stdout else b""
        if len(raw) == self.n:
            self.last = Image.frombytes("RGB", (W, H), raw)
        return self.last

    def close(self):
        try:
            self.pr.kill()
        except Exception:
            pass


def build_frames(p, T=None, tname="", bg_path=None):
    T = T or TEMPLATES["midnight"]
    ar = p.get("lang", "ar") == "ar"
    fpath = mp.AR if ar else mp.EN
    bg = build_bg(T["bg"])
    glow1 = build_glow(1100, T["g1"][:3], T["g1"][3])
    glow2 = build_glow(1000, T["g2"][:3], T["g2"][3])
    grid = build_grid()
    vig = build_vignette()
    brand = brand_layer(ar, T)
    bgs = BgStream(bg_path, TOTAL) if bg_path else None

    V = p.get("video") or {}
    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    title_src = V.get("title") or p["title"]
    title_lines, tf = mp.fit(probe, mp.clean(title_src, fpath), ar, W - 200, start=78, min_s=50, max_lines=3)
    if V:
        rows = [mp.clean(x, fpath) for x in V.get("points", [])][:3]
        result = mp.clean(V.get("result", ""), fpath)
    else:
        body = mp.clean(p["body"].replace("**", "").replace("▪️", "•").replace("🔻", ""), fpath)
        rows = [l.strip() for l in body.split("\n") if l.strip()][:3]
        result = ""
    rf = mp.font(50 if ar else 46, ar)
    resf = mp.font(54, ar)
    # لفّ الأسطر داخل البطاقة (لا اقتطاع)
    inner = W - 160 - 110
    wrapped = []
    for r in rows:
        ls = mp.wrap(probe, r, rf, ar, inner - 10)[:2]
        wrapped.append(ls)
    res_lines = mp.wrap(probe, result, resf, ar, inner)[:2] if result else []
    row_h = [len(ls) * (rf.size + 14) + 30 for ls in wrapped]
    res_h = (len(res_lines) * (resf.size + 16) + 30) if res_lines else 0
    card_h = 70 + sum(row_h) + (24 if res_lines else 0) + res_h + 50
    title_h = len(title_lines) * (tf.size + 26)
    card_y = 430 + title_h + 50
    chart_top = card_y + card_h + 60
    ct = mp.clean(V.get("cta") or p.get("cta", ""), fpath)
    ctf = mp.font(54, ar)
    # الرسم البياني + النداء + الرابط تُوزَّع في المساحة المتبقية
    base_y = min(1660, max(chart_top + 200, 1500))
    pill_y = base_y + 40
    url_y = pill_y + 150

    frames = []
    for f in range(TOTAL):
        fr_ai = bgs.next() if bgs else None
        if fr_ai is not None:
            img = fr_ai.copy()
            # طبقة داكنة خلف النصوص + هالة القالب للحفاظ على الهوية اللونية
            img.paste(Image.new("RGB", (W, H), T["bg"]), (0, 0), Image.new("L", (W, H), 95))
            img.paste(glow1, (-320, int(-260 + f * 0.55)), glow1)
            img.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0), vig)
        else:
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
        a = prog(f, 150, 26)
        if a:
            ca = layer(W - 160, card_h)
            cd = ImageDraw.Draw(ca)
            rrect(cd, [0, 0, W - 160, card_h], 36, T["card"] + (242,), T["edge"], 3)
            ov.paste(fade(ca, a), (80, int(card_y + (1 - a) * 50)), fade(ca, a))

            ny = card_y + 50
            for i, ls in enumerate(wrapped):
                ra = prog(f, 172 + i * 15, 22)
                if ra:
                    for j, ln in enumerate(ls):
                        rl = text_layer(("• " + ln) if j == 0 else ln, rf, ar, T["text"])
                        rx = (W - 135 - rl.width) if ar else 135
                        ov.paste(fade(rl, ra), (int(rx + (1 - ra) * (70 if ar else -70)), ny + j * (rf.size + 14)), fade(rl, ra))
                ny += row_h[i]
            if res_lines:
                ra = prog(f, 172 + len(wrapped) * 15, 22)
                if ra:
                    # خط فاصل رفيع ثم النتيجة بالذهبي
                    od.line([(135, ny + 4), (W - 135, ny + 4)], fill=T["edge"] + (255,), width=2)
                    for j, ln in enumerate(res_lines):
                        rl = text_layer(ln, resf, ar, T["gold"])
                        rx = (W - 135 - rl.width) if ar else 135
                        ov.paste(fade(rl, ra), (rx, ny + 24 + j * (resf.size + 16)), fade(rl, ra))

        # الرسم البياني
        if T["chart"] == "line":
            k = prog(f, 262, 72)
            if k:
                vals = [20, 55, 95, 150]
                x0, dx = int(W / 2 - 300), 200
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
            for i, (bh, col) in enumerate([(120, T["accent"]), (90, T["bar2"]), (60, T["gold"]), (30, RED)]):
                g = prog(f, 260 + i * 10, 32)
                if not g:
                    continue
                h = int(bh * g)
                x = int(W / 2 - 300 + i * 90)
                od.rounded_rectangle([x, base_y - h, x + 56, base_y], radius=12, fill=col + (255,))
        od.line([(W / 2 - 320, base_y + 14), (W / 2 + 320, base_y + 14)], fill=(70, 88, 130, 255), width=3)

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
            ov.paste(fade(pill, a), (int((W - pill.width) / 2), pill_y), fade(pill, a))
        ua = prog(f, 408, 22)
        if ua:
            ul = text_layer("profitleakaii.qd.je", mp.font(40, False), False, MUTED)
            ov.paste(fade(ul, ua), (int((W - ul.width) / 2), url_y), fade(ul, ua))

        yield Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")
    if bgs:
        bgs.close()


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


# ───────── التعليق الصوتي (edge-tts — مجاني) ─────────
VOICES = {("ar", "f"): "ar-SA-ZariyahNeural", ("ar", "m"): "ar-SA-HamedNeural",
          ("en", "f"): "en-US-AriaNeural",  ("en", "m"): "en-US-GuyNeural"}


def pick_voice(p):
    """اللغة من المنشور؛ الجنس بالتناوب (فردي = نسائي، زوجي = رجالي) أو VOICE_GENDER=f/m"""
    lang = "en" if p.get("lang", "ar") == "en" else "ar"
    g = os.environ.get("VOICE_GENDER", "").strip().lower()[:1]
    if g not in ("f", "m"):
        g = "f" if int(p.get("id", 1)) % 2 else "m"
    return lang, g, VOICES[(lang, g)]


def narration_text(p):
    import re
    if (p.get("video") or {}).get("script"):
        return p["video"]["script"]
    body = re.sub(r"\*\*|__|`", "", p["body"])
    body = re.sub(r"[\U0001F000-\U0001FFFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F]", "", body)
    body = re.sub(r"https?://\S+", "", body)
    title = re.sub(r"[\U0001F000-\U0001FFFF\u2600-\u27BF\uFE0F]", "", p["title"])
    return f"{title}. {body.replace(chr(10), '. ')}. {p['cta']}."


def make_voice(p, out_mp3):
    """يولّد التعليق الصوتي؛ يعيد (المسار, المدة بالثواني) أو (None, 0) عند الفشل"""
    if os.environ.get("NO_VOICE"):
        return None, 0
    lang, g, voice = pick_voice(p)
    txt = narration_text(p)
    for attempt in range(3):
        r = subprocess.run([sys.executable, "-m", "edge_tts", "--voice", voice, "--rate=+0%",
                            "--text", txt, "--write-media", out_mp3],
                           capture_output=True, timeout=120)
        if r.returncode == 0 and os.path.exists(out_mp3) and os.path.getsize(out_mp3) > 2000:
            pr = subprocess.run([FFMPEG, "-i", out_mp3], capture_output=True, text=True)
            import re
            m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", pr.stderr)
            dur = (int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])) if m else 0
            print(f"🎙️ الصوت: {voice} ({'نسائي' if g == 'f' else 'رجالي'} · {lang}) · {dur:.1f}s")
            return out_mp3, dur
    print("⚠️ تعذّر توليد الصوت — فيديو صامت")
    return None, 0


def mux(video, audio, out, vdur, adur):
    """يدمج الصوت؛ يبطّئ الحركة بسلاسة لتطابق مدة التعليق (لا تجميد للإطار الأخير)"""
    target = adur + 1.6
    k = max(1.0, target / vdur)
    cmd = [FFMPEG, "-y", "-i", video, "-i", audio, "-filter_complex",
           f"[0:v]setpts={k:.4f}*PTS,fps={FPS}[v];[1:a]adelay=900|900,apad=pad_dur=1.5[a]",
           "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
           "-c:a", "aac", "-b:a", "128k", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-shortest", out]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("utf-8", "ignore")[-800:])


def make_video(p, template=None):
    name, T = (template, TEMPLATES[template]) if template in TEMPLATES else pick_template(p)
    print(f"🎨 القالب: {name}")
    out = os.path.join(OUT, f"{p['id']}.mp4")
    silent = os.path.join(OUT, f"{p['id']}-silent.mp4")
    bg_path = None
    # سلسلة الخلفية: لقطات حقيقية (Pexels→Pixabay) → مشهد AI (Hugging Face) → الخلفية العادية
    try:
        import footage
        bg_path = footage.get_footage(p, seconds=TOTAL / FPS + 1)
    except Exception as e:
        print("⚪ اللقطات غير متاحة:", str(e)[:120])
    if not bg_path:
        try:
            import ai_bg
            bg_path = ai_bg.get_background(p)
        except Exception as e:
            print("⚪ خلفية AI غير متاحة:", str(e)[:120])
    n = encode(build_frames(p, T, name, bg_path), silent)
    voice, adur = make_voice(p, os.path.join(OUT, f"{p['id']}-voice.mp3"))
    if voice:
        try:
            mux(silent, voice, out, n / FPS, adur)
            os.remove(silent)
            return out, os.path.getsize(out), n
        except Exception as e:
            print("⚠️ فشل دمج الصوت:", str(e)[:200])
    os.replace(silent, out)
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
