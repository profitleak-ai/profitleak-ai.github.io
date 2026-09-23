#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""يولّد عيّنة من كل قالب + صورة مقارنة (للعرض فقط، لا تُستخدم في النشر)"""
import json, os, sys, subprocess
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_video as mv
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
OUTV = os.path.join(os.path.dirname(HERE), "videos")
os.makedirs(OUTV, exist_ok=True)
LABEL = {"midnight": "منتصف الليل", "royal": "ملكي", "emerald": "زمردي", "sunset": "غروب"}
cal = json.load(open(os.path.join(HERE, "calendar.json"), encoding="utf-8"))
p = cal["posts"][0]

tiles = []
for name in mv.TEMPLATE_ORDER:
    path, size, n = mv.make_video(p, name)
    dst = os.path.join(OUTV, f"sample-{name}.mp4")
    os.replace(path, dst)
    print(f"✅ sample-{name}.mp4  {size/1048576:.2f} MB · {n} إطار")
    png = os.path.join(OUTV, f"frame-{name}.png")
    subprocess.run([FF, "-y", "-ss", "10", "-i", dst, "-frames:v", "1", png],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    tiles.append((name, Image.open(png).convert("RGB")))

# صورة مقارنة 2×2
tw, th = 420, 747
gap, top, side = 22, 66, 26
CW = side * 2 + tw * 2 + gap
CH = top + th * 2 + gap + side * 2 + 40
sheet = Image.new("RGB", (CW, CH), (10, 14, 28))
d = ImageDraw.Draw(sheet)
for x in range(0, CW, 3):
    d.line([(x, 0), (x, CH)], fill=(int(10 + x / CW * 8), int(14 + x / CW * 10), int(28 + x / CW * 12)))
try:
    f1 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 34)
    f2 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
except Exception:
    f1 = f2 = ImageFont.load_default()
d.text((side, 18), "ProfitLeak AI — قوالب الفيديو (تتغير تلقائيًا كل يوم)", font=f1, fill=(255, 199, 70))
for i, (name, im) in enumerate(tiles):
    r, c = divmod(i, 2)
    x = side + c * (tw + gap)
    y = top + r * (th + gap)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
    d.rectangle([x - 2, y - 2, x + tw + 2, y + th + 2], outline=(60, 78, 120), width=2)
    d.text((x + 6, y + th + 8), f"{name} — {LABEL[name]}", font=f2, fill=(200, 214, 240))
out = os.path.join(os.path.dirname(HERE), "قوالب-الفيديو.png")
sheet.save(out, quality=92)
print(f"\n🖼 صورة المقارنة: {out}  {os.path.getsize(out)/1024:.0f} KB")
