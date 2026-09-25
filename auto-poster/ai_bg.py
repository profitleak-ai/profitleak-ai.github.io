#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🎥 خلفية سينمائية بالذكاء الاصطناعي (مجانًا — Hugging Face ZeroGPU):
  • LTX-2.3 (Lightricks) يولّد مشهدًا عموديًا 5 ثوانٍ بلا نصوص، حسب موضوع المنشور
  • المشهد يُحفظ في الموقع videos/bg/<id>.mp4 ويُعاد استخدامه للأبد (توليد مرة واحدة فقط)
  • عند الفشل/انتهاء الحصة → يعود المحرّك إلى الخلفية المعتادة (لا يتعطّل أي يوم)
"""
import os, sys, json, base64, ssl, urllib.request, urllib.parse, subprocess, shutil, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.environ.get("SITE", "https://profitleakaii.qd.je").rstrip("/")
REPO = os.environ.get("GITHUB_REPOSITORY", "profitleak-ai/profitleak-ai.github.io")
BG_DIR = os.path.join(os.path.dirname(HERE), "videos", "bg")
ctx = ssl.create_default_context()
try:
    import imageio_ffmpeg
    FF = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FF = "ffmpeg"
sys.path.insert(0, HERE)

# سلسلة الأدوات: تُجرَّب بالترتيب، وعند فشل واحدة (حصة/عطل/طابور) ينتقل تلقائيًا للتالية
TOOLS = [
    ("Lightricks/LTX-2-3",                          "ltx23"),
    ("alexnasa/ltx-2-TURBO",                        "ltxturbo"),
    ("Lightricks/ltx-video-distilled",              "ltxdist"),
    ("prithivMLmods/Wan2.2-Fast",                   "wanfast"),
    ("Saravutw/WAN2.2_I2V_LIGHTNING_4-8step_custom", "wani2v"),
    ("Pixazo LTX (REST, حصة مستقلة)",                "pixazo"),   # يحتاج PIXAZO_API_KEY
]
TOOL_TIMEOUT = int(os.environ.get("AI_BG_TIMEOUT", "600"))   # ثانية لكل أداة

STYLE = ("Cinematic vertical 9:16 shot, dark premium fintech atmosphere, teal and gold rim light, "
         "golden bokeh particles drifting, shallow depth of field, slow smooth camera move, moody high-end "
         "commercial look. No text, no letters, no numbers, no logos, no people faces.")

SCENES = {
    "money":   "close-up of banknotes and coins on a dark desk beside a glowing calculator, slow dolly",
    "parcel":  "cash-on-delivery parcels stacked on a dark table, a smartphone showing a rising profit chart, slow dolly",
    "phone":   "a smartphone on a sleek desk displaying an analytics dashboard with glowing bars, slow orbit",
    "ads":     "a laptop screen glowing with an advertising dashboard, coins scattered, coffee cup, slow push-in",
    "return":  "a returned parcel with tape being opened on a dark counter, courier van lights bokeh, slow pan",
    "whatsapp":"a hand holding a smartphone with a chat bubble interface glowing green, parcels blurred behind, slow tilt",
    "chart":   "a floating 3D holographic bar chart rising over a dark reflective surface, gold highlights, slow orbit",
    "report":  "printed reports and a tablet with charts on a dark desk, pen, warm lamp light, slow dolly",
    "shop":    "an e-commerce packing station at night, boxes, label printer, monitor glow, slow dolly",
    "sunglasses":"a pair of sunglasses on a dark studio table with dramatic gold light sweep, slow rotate",
}
BY_ID = {1: "money", 2: "chart", 3: "sunglasses", 4: "whatsapp", 5: "chart", 6: "money", 7: "return", 8: "chart",
         9: "phone", 10: "phone", 11: "parcel", 12: "chart", 13: "report", 14: "ads", 15: "shop", 16: "parcel",
         17: "money", 18: "ads", 19: "money", 20: "chart", 21: "money", 22: "chart", 23: "shop", 24: "whatsapp",
         25: "chart", 26: "chart", 27: "return", 28: "phone", 29: "report", 30: "phone"}


def prompt_for(p):
    key = (p.get("video") or {}).get("scene") or BY_ID.get(int(p.get("id", 1)), "chart")
    return SCENES.get(key, SCENES["chart"]) + ". " + STYLE


def _http(url, data=None, headers=None, method=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method or ("POST" if data else "GET"))
    try:
        r = urllib.request.urlopen(req, timeout=timeout, context=ctx)
        return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), {}
    except Exception as e:
        return 0, str(e).encode(), {}


def cached(pid):
    """يعيد مسار الخلفية المحفوظة (محليًا أو من الموقع) أو None"""
    os.makedirs(BG_DIR, exist_ok=True)
    local = os.path.join(BG_DIR, f"{pid}.mp4")
    if os.path.exists(local) and os.path.getsize(local) > 50_000:
        return local
    st, body, _ = _http(f"{SITE}/videos/bg/{pid}.mp4", headers={"User-Agent": "ProfitLeak/1.0"}, timeout=60)
    if st == 200 and len(body) > 50_000:
        open(local, "wb").write(body)
        return local
    return None


def seed_image(p):
    """صورة بذرة بلا نصوص (704×1216) لأدوات صورة→فيديو: خلفية القالب + هالة + شبكة"""
    try:
        import make_video as mv
        from PIL import Image
        name, T = mv.pick_template(p)
        img = mv.build_bg(T["bg"])
        g1 = mv.build_glow(1100, T["g1"][:3], T["g1"][3]); g2 = mv.build_glow(1000, T["g2"][:3], T["g2"][3])
        img.paste(g1, (-320, -260), g1); img.paste(g2, (mv.W - 700, mv.H - 620), g2)
        grid = mv.build_grid(); img.paste(grid, (-120, -120), grid)
        out = os.path.join(tempfile.gettempdir(), f"seed-{p['id']}.jpg")
        img.resize((704, 1216)).save(out, quality=92)
        return out
    except Exception as e:
        print("⚪ تعذّر إنشاء صورة البذرة:", str(e)[:80])
        return None


def _call_tool(space, kind, prompt, seed, seed_img):
    """يستدعي أداة واحدة ويعيد مسار الفيديو الناتج (يُنفَّذ داخل عملية فرعية بمهلة)"""
    from gradio_client import Client, handle_file
    import base64 as b64
    tok = os.environ.get("HF_TOKEN", "")
    c = Client(space, token=tok, verbose=False)
    if kind == "ltx23":
        r = c.predict(input_image=None, prompt=prompt, duration=5, enhance_prompt=False, seed=seed,
                      randomize_seed=False, height=1216, width=704, api_name="/generate_video")
    elif kind == "ltxturbo":
        r = c.predict(first_frame=handle_file(seed_img) if seed_img else None, end_frame=None, prompt=prompt,
                      input_video=None, generation_mode="Image-to-Video" if seed_img else "Text-to-Video",
                      enhance_prompt=False, seed=seed, randomize_seed=False, height=1216, width=704,
                      camera_lora="Zoom In", audio_path=None, api_name="/generate_video")
    elif kind == "ltxdist":
        r = c.predict(prompt=prompt, negative_prompt="text, letters, watermark, worst quality, blurry, jitter",
                      input_image_filepath=None, input_video_filepath=None, height_ui=1216, width_ui=704,
                      mode="text-to-video", duration_ui=5, ui_frames_to_use=9, seed_ui=seed, randomize_seed=False,
                      ui_guidance_scale=1, improve_texture_flag=True, api_name="/text_to_video")
    elif kind == "wanfast":
        b = b64.b64encode(open(seed_img, "rb").read()).decode()
        r = c.predict(image_b64="data:image/jpeg;base64," + b, prompt=prompt, steps=4,
                      negative_prompt="text, letters, watermark, blurry, static", duration_seconds=5,
                      guidance_scale=1, guidance_scale_2=1, seed=seed, randomize_seed=False, api_name="/generate_video")
    elif kind == "wani2v":
        r = c.predict(input_image=handle_file(seed_img), last_image=None, prompt=prompt, steps=4,
                      negative_prompt="text, letters, watermark, blurry, static", duration_seconds=3.5,
                      guidance_scale=1, guidance_scale_2=1, seed=seed, randomize_seed=False, quality=5,
                      scheduler="UniPCMultistep", flow_shift=3.0, frame_multiplier="16", safe_mode=True,
                      video_component=True, api_name="/generate_video")
    elif kind == "pixazo":
        import urllib.request, json as _j, tempfile as _t, re as _re, time as _time
        key = os.environ.get("PIXAZO_API_KEY", "")
        if not key:
            raise RuntimeError("PIXAZO_API_KEY غير مضبوط")
        hdr = {"Content-Type": "application/json", "Ocp-Apim-Subscription-Key": key}
        body = _j.dumps({"prompt": prompt, "aspect_ratio": "9:16", "duration": 5, "seed": seed}).encode()
        req = urllib.request.Request("https://gateway.pixazo.ai/ltx/text-to-video", data=body, headers=hdr, method="POST")
        txt = urllib.request.urlopen(req, timeout=600).read().decode("utf-8", "ignore")
        url = None
        for _ in range(60):
            m = _re.search(r"https?://[^\"'\s]+\.mp4[^\"'\s]*", txt)
            if m:
                url = m.group(0); break
            try:
                d = _j.loads(txt)
            except Exception:
                break
            tid = d.get("id") or d.get("task_id") or d.get("request_id")
            if not tid:
                break
            _time.sleep(10)
            txt = urllib.request.urlopen(urllib.request.Request(f"https://gateway.pixazo.ai/ltx/status/{tid}", headers=hdr),
                                         timeout=60).read().decode("utf-8", "ignore")
        if not url:
            raise RuntimeError("Pixazo: لا رابط فيديو في الاستجابة: " + txt[:160])
        out = os.path.join(_t.gettempdir(), f"pixazo-{seed}.mp4")
        urllib.request.urlretrieve(url, out)
        r = out
    else:
        raise ValueError(kind)
    # استخراج المسار من أي شكل استجابة
    def find(o):
        if isinstance(o, str) and o.endswith((".mp4", ".webm", ".mov")):
            return o
        if isinstance(o, dict):
            return find(o.get("video")) or find(o.get("path")) or find(o.get("url"))
        if isinstance(o, (list, tuple)):
            for x in o:
                f = find(x)
                if f:
                    return f
        return None
    return find(r)


def generate(p):
    """يمرّ على سلسلة الأدوات بالترتيب؛ أول نجاح يُعتمد"""
    if not os.environ.get("HF_TOKEN", ""):
        print("⚪ لا يوجد HF_TOKEN — بلا خلفية AI")
        return None
    prompt = prompt_for(p)
    seed = int(p.get("id", 1)) * 101
    seed_img = None
    only = os.environ.get("AI_BG_ONLY", "").strip()
    for i, (space, kind) in enumerate(TOOLS, 1):
        if only and kind != only:
            continue
        if kind == "pixazo" and not os.environ.get("PIXAZO_API_KEY"):
            continue
        if kind in ("ltxturbo", "wanfast", "wani2v") and not seed_img:
            seed_img = seed_image(p)
            if not seed_img and kind in ("wanfast", "wani2v"):
                continue
        print(f"🔗 الأداة {i}/{len(TOOLS)}: {space} …", flush=True)
        code = ("import sys,os,json;sys.path.insert(0,%r);import ai_bg;"
                "r=ai_bg._call_tool(%r,%r,%r,%d,%r);print('RESULT:'+str(r or ''))"
                % (HERE, space, kind, prompt, seed, seed_img))
        try:
            pr = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=TOOL_TIMEOUT)
            out = pr.stdout.strip().splitlines()
            res = next((l[7:] for l in reversed(out) if l.startswith("RESULT:")), "")
            if res and os.path.exists(res) and os.path.getsize(res) > 30_000:
                os.makedirs(BG_DIR, exist_ok=True)
                dst = os.path.join(BG_DIR, f"{p['id']}.mp4")
                # توحيد الصيغة (mp4/h264) لأي أداة
                subprocess.run([FF, "-y", "-v", "error", "-i", res, "-an", "-c:v", "libx264", "-preset", "veryfast",
                                "-crf", "22", "-pix_fmt", "yuv420p", dst], check=True, timeout=300)
                print(f"🎥 خلفية AI جديدة من {space} ({os.path.getsize(dst)//1024} KB)")
                return dst
            err = (pr.stderr.strip().splitlines() or [""])[-1]
            print(f"   ↪ فشل: {err[:150]}")
        except subprocess.TimeoutExpired:
            print(f"   ↪ تجاوز المهلة ({TOOL_TIMEOUT}s) — الانتقال للأداة التالية")
        except Exception as e:
            print(f"   ↪ خطأ: {str(e)[:150]}")
    print("⚪ كل الأدوات فشلت اليوم — الخلفية العادية")
    return None


def upload(path, pid):
    """يرفع المشهد إلى الموقع ليُعاد استخدامه (GitHub Contents API)"""
    gh = os.environ.get("GITHUB_TOKEN", "")
    if not gh:
        return False
    rel = f"videos/bg/{pid}.mp4"
    api = f"https://api.github.com/repos/{REPO}/contents/{rel}"
    hdr = {"Authorization": f"Bearer {gh}", "Accept": "application/vnd.github+json", "User-Agent": "ProfitLeak/1.0",
           "Content-Type": "application/json"}
    st, body, _ = _http(api, headers=hdr)
    sha = json.loads(body).get("sha") if st == 200 else None
    payload = {"message": f"ai-bg: scene {pid}", "content": base64.b64encode(open(path, "rb").read()).decode()}
    if sha:
        payload["sha"] = sha
    st, body, _ = _http(api, data=json.dumps(payload).encode(), headers=hdr, method="PUT", timeout=120)
    print("☁️ حفظ المشهد في الموقع:", st)
    return st in (200, 201)


def get_background(p):
    """المدخل الرئيسي: مشهد محفوظ → وإلا توليد + حفظ → وإلا None"""
    if os.environ.get("NO_AI_BG"):
        return None
    c = cached(p["id"])
    if c:
        print("🎥 خلفية AI محفوظة مسبقًا")
        return c
    out = generate(p)
    if out:
        upload(out, p["id"])
    return out


if __name__ == "__main__":
    cal = json.load(open(os.path.join(HERE, "calendar.json"), encoding="utf-8"))
    pid = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    p = next(x for x in cal["posts"] if x["id"] == pid)
    print(get_background(p))
