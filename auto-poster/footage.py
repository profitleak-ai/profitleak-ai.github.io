#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🎬 لقطات حقيقية مجانية (قلب MoneyPrinterTurbo مُعادًا بخفّة):
  • لكل منشور: قائمة كلمات بحث إنجليزية حسب موضوعه (scene)
  • Pexels → Pixabay: أفضل لقطات عمودية (≥720p)، مدة 6–20 ث، بلا وجوه/نصوص قدر الإمكان
  • تُقطَّع وتُدمج بـ FFmpeg في خلفية واحدة 1080×1920 تغطي مدة الفيديو كاملة (لقطة كل ~5 ث)
  • ذاكرة تخزين: videos/stock/<id>.mp4 على الموقع — تُبنى مرة واحدة ويُعاد استخدامها
  • السلسلة: stock مخزَّن → Pexels → Pixabay → None (فيعود المحرّك إلى خلفية AI/العادية)
"""
import os, sys, json, ssl, base64, random, subprocess, tempfile, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.environ.get("SITE", "https://profitleakaii.qd.je").rstrip("/")
REPO = os.environ.get("GITHUB_REPOSITORY", "profitleak-ai/profitleak-ai.github.io")
STOCK = os.path.join(os.path.dirname(HERE), "videos", "stock")
ctx = ssl.create_default_context()
try:
    import imageio_ffmpeg
    FF = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FF = "ffmpeg"

# كلمات بحث لكل نوع مشهد (نفس تصنيف ai_bg.BY_ID)
QUERIES = {
    "money":     ["counting cash money", "coins stack desk", "calculator finance dark", "banknotes close up"],
    "parcel":    ["delivery parcel box", "packing boxes ecommerce", "courier package handover", "cardboard boxes warehouse"],
    "phone":     ["smartphone analytics app", "hand scrolling phone dark", "mobile dashboard chart", "phone typing night"],
    "ads":       ["laptop marketing dashboard", "social media ads screen", "typing laptop dark office", "digital marketing analytics"],
    "return":    ["returning package", "opening cardboard box", "delivery van night", "parcel on doorstep"],
    "whatsapp":  ["texting smartphone green chat", "hand holding phone messaging", "online shopping phone", "phone notification"],
    "chart":     ["stock chart screen", "financial graph rising", "data analytics dashboard", "business growth chart"],
    "report":    ["printed report desk", "tablet charts office", "accountant documents", "spreadsheet laptop"],
    "shop":      ["online store packing", "small business owner packing orders", "label printer shipping", "ecommerce warehouse"],
    "sunglasses":["sunglasses product studio", "sunglasses on table light", "fashion accessories dark", "product photography studio"],
}


def _get(url, headers=None, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "ProfitLeak/1.0", **(headers or {})})
    try:
        r = urllib.request.urlopen(req, timeout=timeout, context=ctx)
        return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return 0, str(e).encode()


def scene_key(p):
    try:
        import ai_bg
        return (p.get("video") or {}).get("scene") or ai_bg.BY_ID.get(int(p.get("id", 1)), "chart")
    except Exception:
        return "chart"


# ───────── مزوّدو اللقطات ─────────
def pexels(q, n=6):
    k = os.environ.get("PEXELS_API_KEY", "")
    if not k:
        return []
    st, body = _get("https://api.pexels.com/videos/search?" + urllib.parse.urlencode(
        {"query": q, "orientation": "portrait", "size": "medium", "per_page": 15}), {"Authorization": k})
    if st != 200:
        return []
    out = []
    for v in json.loads(body).get("videos", []):
        if not (5 <= v.get("duration", 0) <= 40):
            continue
        files = [f for f in v.get("video_files", []) if f.get("height", 0) >= f.get("width", 0) >= 700
                 and f.get("file_type") == "video/mp4"]
        if not files:
            continue
        f = sorted(files, key=lambda f: abs(f["width"] - 1080))[0]
        out.append({"src": "pexels", "id": v["id"], "url": f["link"], "dur": v["duration"]})
    return out[:n]


def pixabay(q, n=6):
    k = os.environ.get("PIXABAY_API_KEY", "")
    if not k:
        return []
    st, body = _get("https://pixabay.com/api/videos/?" + urllib.parse.urlencode(
        {"key": k, "q": q, "per_page": 20, "safesearch": "true", "video_type": "film"}))
    if st != 200:
        return []
    out = []
    for v in json.loads(body).get("hits", []):
        if not (5 <= v.get("duration", 0) <= 40):
            continue
        vs = v.get("videos", {})
        f = vs.get("large") or vs.get("medium")
        if not f or not f.get("url"):
            continue
        out.append({"src": "pixabay", "id": v["id"], "url": f["url"], "dur": v["duration"]})
    return out[:n]


def collect(p, want=4):
    """يجمع لقطات متنوعة لموضوع المنشور من المزوّدين بالترتيب"""
    key = scene_key(p)
    qs = list(QUERIES.get(key, QUERIES["chart"]))
    random.Random(int(p.get("id", 1))).shuffle(qs)
    picked, seen = [], set()
    for provider in (pexels, pixabay):
        for q in qs:
            for c in provider(q):
                sig = (c["src"], c["id"])
                if sig in seen:
                    continue
                seen.add(sig)
                picked.append(c)
                if len(picked) >= want:
                    return picked, key
    return picked, key


# ───────── البناء ─────────
def build(p, seconds=18):
    """ينزّل اللقطات ويبني خلفية 1080×1920 بمدة `seconds` (لقطة كل ~5 ث) — يعيد المسار أو None"""
    clips, key = collect(p)
    if not clips:
        print("⚪ لا لقطات متاحة لهذا الموضوع")
        return None
    tmp = tempfile.mkdtemp(prefix="stock-")
    per = max(4.0, seconds / len(clips))
    parts = []
    for i, c in enumerate(clips):
        st, body = _get(c["url"], timeout=180)
        if st != 200 or len(body) < 100_000:
            continue
        raw = os.path.join(tmp, f"raw{i}.mp4")
        open(raw, "wb").write(body)
        start = max(0.0, min(c["dur"] - per - 0.5, c["dur"] * 0.15))
        out = os.path.join(tmp, f"part{i}.mp4")
        # قصّ + توحيد الحجم 1080×1920 + 30fps + تعتيم خفيف + تلاشٍ في البداية والنهاية
        vf = ("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,"
              "eq=brightness=-0.06:saturation=1.05,"
              f"fade=t=in:st=0:d=0.5,fade=t=out:st={per-0.5:.2f}:d=0.5,setsar=1")
        r = subprocess.run([FF, "-y", "-v", "error", "-ss", f"{start:.2f}", "-t", f"{per:.2f}", "-i", raw,
                            "-an", "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                            "-pix_fmt", "yuv420p", out], capture_output=True)
        if r.returncode == 0 and os.path.exists(out):
            parts.append(out)
    if not parts:
        print("⚪ فشل تجهيز اللقطات")
        return None
    lst = os.path.join(tmp, "list.txt")
    open(lst, "w").write("".join(f"file '{x}'\n" for x in parts))
    os.makedirs(STOCK, exist_ok=True)
    dst = os.path.join(STOCK, f"{p['id']}.mp4")
    r = subprocess.run([FF, "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", dst],
                       capture_output=True)
    if r.returncode != 0:
        print("⚪ فشل الدمج:", r.stderr.decode()[-200:])
        return None
    srcs = ", ".join(sorted({c["src"] for c in clips}))
    print(f"🎬 لقطات حقيقية: {len(parts)} مقطع ({key}) من {srcs} → {os.path.getsize(dst)//1024} KB")
    return dst


def cached(pid):
    os.makedirs(STOCK, exist_ok=True)
    local = os.path.join(STOCK, f"{pid}.mp4")
    if os.path.exists(local) and os.path.getsize(local) > 200_000:
        return local
    st, body = _get(f"{SITE}/videos/stock/{pid}.mp4", timeout=120)
    if st == 200 and len(body) > 200_000:
        open(local, "wb").write(body)
        return local
    return None


def upload(path, pid):
    gh = os.environ.get("GITHUB_TOKEN", "")
    if not gh:
        return False
    rel = f"videos/stock/{pid}.mp4"
    api = f"https://api.github.com/repos/{REPO}/contents/{rel}"
    hdr = {"Authorization": f"Bearer {gh}", "Accept": "application/vnd.github+json", "User-Agent": "ProfitLeak/1.0",
           "Content-Type": "application/json"}
    st, body = _get(api, hdr)
    sha = json.loads(body).get("sha") if st == 200 else None
    payload = {"message": f"stock: footage {pid}", "content": base64.b64encode(open(path, "rb").read()).decode()}
    if sha:
        payload["sha"] = sha
    req = urllib.request.Request(api, data=json.dumps(payload).encode(), headers=hdr, method="PUT")
    try:
        st = urllib.request.urlopen(req, timeout=180, context=ctx).status
    except urllib.error.HTTPError as e:
        st = e.code
    print("☁️ حفظ اللقطات في الموقع:", st)
    return st in (200, 201)


def get_footage(p, seconds=18):
    """المدخل: مخزَّن → بناء جديد (+حفظ) → None"""
    if os.environ.get("NO_STOCK"):
        return None
    if not os.environ.get("FORCE_STOCK"):
        c = cached(p["id"])
        if c:
            print("🎬 لقطات حقيقية محفوظة مسبقًا")
            return c
    out = build(p, seconds)
    if out:
        upload(out, p["id"])
    return out


if __name__ == "__main__":
    cal = json.load(open(os.path.join(HERE, "calendar.json"), encoding="utf-8"))
    pid = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    print(get_footage(next(x for x in cal["posts"] if x["id"] == pid)))
