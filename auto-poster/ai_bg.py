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

SPACES = ["Lightricks/LTX-2-3"]      # يمكن إضافة بدائل لاحقًا

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


def generate(p, timeout_s=900):
    """يولّد مشهدًا جديدًا عبر HF Space؛ يعيد المسار أو None"""
    tok = os.environ.get("HF_TOKEN", "")
    if not tok:
        print("⚪ لا يوجد HF_TOKEN — بلا خلفية AI")
        return None
    try:
        from gradio_client import Client
    except ImportError:
        print("⚪ gradio_client غير مثبت")
        return None
    for space in SPACES:
        try:
            c = Client(space, token=tok, verbose=False)
            r = c.predict(input_image=None, prompt=prompt_for(p), duration=5, enhance_prompt=False,
                          seed=int(p.get("id", 1)) * 101, randomize_seed=False, height=1216, width=704,
                          api_name="/generate_video")
            path = r[0] if isinstance(r, (list, tuple)) else r
            if isinstance(path, dict):
                path = path.get("video") or path.get("path")
            if path and os.path.exists(path) and os.path.getsize(path) > 50_000:
                os.makedirs(BG_DIR, exist_ok=True)
                out = os.path.join(BG_DIR, f"{p['id']}.mp4")
                shutil.copy(path, out)
                print(f"🎥 خلفية AI جديدة من {space} ({os.path.getsize(out)//1024} KB)")
                return out
        except Exception as e:
            print(f"⚠️ {space}: {str(e)[:160]}")
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
