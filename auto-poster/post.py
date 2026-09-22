#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ProfitLeak AI — الناشر التلقائي اليومي (متعدد المنصات)
=====================================================
المنصات المدعومة:
  🟢 تلغرام     — تلقائي كامل (واجهة البوت الرسمية، مجانية)
  🟢 ريديت      — تلقائي كامل (OAuth سكربت، مجاني للاستخدام الشخصي)
  🟢 بينتوريست  — تلقائي كامل (API v5، مجاني)
  🟡 فيسبوك     — تلقائي (مفتاح يتجدد كل 60 يومًا)
  🟡 تويتر/إكس  — الوحدة جاهزة (المنصة صارت مدفوعة: تحتاج رصيدًا)
  🟡 يوتيوب     — الوحدة جاهزة (تحتاج تفويض Google لمرة واحدة)
  📲 الهاتف     — دائمًا: كل النسخ + الصورة + وسوم المصدر

يعمل على GitHub Actions مجانًا للأبد — أو محليًا: python3 post.py --dry
"""
import json, os, sys, ssl, time, random, string, base64, hmac, hashlib
import urllib.request, urllib.parse, urllib.error, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
CAL = os.path.join(HERE, "calendar.json")
STATE = os.path.join(HERE, "state.json")

SITE = os.environ.get("SITE", "https://profitleakaii.qd.je/").rstrip("/") + "/"
MEDIA_BASE = os.environ.get("MEDIA_BASE", "")
NTFY = os.environ.get("NTFY_TOPIC", "profitleak-alerts-34d2c8377c")
SLOT = os.environ.get("SLOT", "morning")
DRY = "--dry" in sys.argv or os.environ.get("DRY_RUN") == "1"
TEST = "--test" in sys.argv
FORCE = "--force" in sys.argv
ctx = ssl.create_default_context()


def http(url, data=None, headers=None, method=None, timeout=60, json_body=False):
    body = None
    if data is not None:
        body = json.dumps(data).encode() if json_body else (data if isinstance(data, bytes) else urllib.parse.urlencode(data).encode())
    req = urllib.request.Request(url, data=body, headers=headers or {}, method=method or ("POST" if body else "GET"))
    try:
        r = urllib.request.urlopen(req, timeout=timeout, context=ctx)
        return r.status, r.read().decode("utf-8", "ignore"), dict(r.headers)
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read().decode("utf-8", "ignore"), dict(e.headers)
        except Exception:
            return e.code, "", {}
    except Exception as e:
        return 0, str(e), {}


def load():
    with open(CAL, encoding="utf-8") as f:
        return json.load(f)


def pick_index(posts, today):
    epoch = datetime.date(2026, 9, 22)
    days = max((today - epoch).days, 0)
    return (days * 2 + (0 if SLOT == "morning" else 1)) % len(posts)


def link(ref):
    return f"{SITE}?ref={ref}"


def media_url(rel):
    if not rel:
        return ""
    if rel.startswith("http"):
        return rel
    return (MEDIA_BASE.rstrip("/") + "/" + rel) if MEDIA_BASE else ""


# ───────────────────────── صياغة النسخ ─────────────────────────
def strip_md(s):
    return s.replace("**", "").replace("▪️", "-").replace("🔻", "")


# ───────────── نص ريديت اليدوي: صيغة إنسان، قيمة أولًا، بلا إعلان مباشر ─────────────
OP_AR = [
    "كنت كنخدم على تحليل أرباح متجر صغير هاد الأيام، وطلعات لي حاجة بقات فبالي:",
    "شي حد سولني مؤخرًا على كيفاش يحسب الربح الحقيقي ديالو — هاد الجواب خدمتو مع بزاف:",
    "من الأخطاء لي كنشوفها بزاف عند البائعين الصغار:",
    "وقفت على هاد النقطة وأنا كنراجع أرقام متجر ديال واحد صاحبي:",
]
OP_EN = [
    "Was helping a friend audit his small store's numbers last week and this came up:",
    "I keep seeing the same mistake with small ecommerce sellers, so here it is:",
    "Sharing something that changed how I look at product margins:",
    "A lot of sellers I talk to calculate profit the wrong way. Breakdown:",
]
CL_AR = [
    "\n\nسؤال للنقاش: نتوما كيفاش كتحسبو الربح ديالكم؟ واش كتدخلو الرجوع والتوصيل فالحساب؟",
    "\n\nإلى شي واحد عندو تجربة مع هادشي يتفضل — كنعرف بزاف ديال البائعين كيكتاشفو هادشي متأخر.",
]
CL_EN = [
    "\n\nCurious how you all do this: do you factor returns and shipping into your margin, or just cost vs price?",
    "\n\nIf anyone has dealt with this, would love to hear how you handled it.",
]
SUBS_EN = ["r/smallbusiness", "r/ecommerce", "r/Entrepreneur", "r/sideproject", "r/juststart"]
SUBS_AR = ["r/Morocco", "r/Maroc"]


def reddit_text(p):
    ar = p.get("lang", "ar") == "ar"
    # إزالة أي سطر دعائي/رابط من المتن — ريديت يعاقب الإعلان المباشر
    lines = [l.strip() for l in strip_md(p["body"]).split("\n")
             if l.strip() and not l.strip().endswith(":") and "http" not in l]
    body = "\n\n".join(lines)
    opener = (OP_AR if ar else OP_EN)[(p["id"] * 5) % len(OP_AR if ar else OP_EN)]
    closer = (CL_AR if ar else CL_EN)[(p["id"] * 3) % len(CL_AR if ar else CL_EN)]
    soft = (("\n\nملاحظة: بنيت حاسبة مجانية بسيطة لهاد الحساب (بلا تسجيل ولا إيميل): " + link("reddit") +
             " — شاركتها غير لأنها كتفيد، ماشي إشهار.")
            if ar else
            ("\n\nPS: I built a small free calculator for this (no signup, no email): " + link("reddit") +
             " — sharing because it helps, not promoting."))
    return f"{opener}\n\n{body}{closer}{soft}"


def reddit_suggestion(p):
    ar = p.get("lang", "ar") == "ar"
    subs = SUBS_AR if ar else SUBS_EN
    sub = subs[p["id"] % len(subs)]
    return (f"{sub} — اقرأي القوانين أولًا، وانشري كقصة شخصية لا كإعلان (1-2 مرات أسبوعيًا كحد أقصى)"
            if ar else
            f"{sub} — read the rules first, post as a personal story not an ad (max 1-2x/week)")


def render(p, platform):
    t, b, cta = p["title"], p["body"], p["cta"]
    tags = " ".join(("#" + h.strip().lstrip("#").strip()) for h in p.get("hashtags", []))
    url = link(platform)
    if platform == "facebook":
        return f"{t}\n\n{b}\n\n👉 {cta}: {url}"
    if platform == "instagram":
        return f"{t}\n\n{b}\n\n👉 {cta}\n(الرابط في البايو 👆 أو انسخيه: {url})\n.\n.\n.\n{tags}"
    if platform == "tiktok":
        return f"{t}\n\n{b.splitlines()[0]}\n\n👉 {url}\n{tags}"
    if platform == "telegram":
        return f"<b>{t}</b>\n\n{strip_md(b)}\n\n👉 <a href=\"{url}\">{cta}</a>"
    if platform == "whatsapp":
        return f"{t}\n\n{b.splitlines()[0]}\n👉 {url}"
    if platform == "reddit":
        return reddit_text(p)
    if platform == "pinterest":
        desc = strip_md(b).replace("\n", " ")
        return (t[:95], f"{desc} — {cta}. {url}"[:480])
    if platform == "twitter":
        base = f"{t}\n\n{b.splitlines()[0]}\n{url}"
        return base[:275]
    if platform == "youtube":
        return (t[:95], f"{strip_md(b)}\n\n{cta}: {url}\n\n{tags}")
    return f"{t}\n\n{b}\n\n{url}"


# ───────────────────────── الهاتف ─────────────────────────
def to_ntfy(p, media):
    body = (
        f"📘 فيسبوك:\n{render(p,'facebook')}\n\n📸 انستغرام:\n{render(p,'instagram')}\n\n"
        f"🎵 تيكتوك:\n{render(p,'tiktok')}\n\n🟢 واتساب:\n{render(p,'whatsapp')}\n\n"
        f"🔗 ريديت (نشر يدوي 1-2 مرة/أسبوع):\n{render(p,'reddit')}\n\n"
        f"📍 اقتراح المجتمع اليوم: {reddit_suggestion(p)}"
    )
    headers = {"Title": f"ProfitLeak - Daily Post #{p['id']} ({SLOT})", "Tags": "calendar,rocket",
               "Actions": json.dumps([{"action": "view", "label": "Open site", "url": link(SLOT)}])}
    if media:
        headers["Attach"] = media
        headers["Filename"] = media.split("/")[-1]
    st, out, _ = http(f"https://ntfy.sh/{NTFY}", data=body.encode("utf-8"), headers=headers)
    return st == 200, f"ntfy {st}"


# ───────────────────────── تلغرام ─────────────────────────
def to_telegram(p, media):
    tok, chat = os.environ.get("TELEGRAM_TOKEN"), os.environ.get("TELEGRAM_CHAT")
    if not (tok and chat):
        return None, "غير مضبوط (اختياري)"
    text = render(p, "telegram")
    if media:
        st, out, _ = http(f"https://api.telegram.org/bot{tok}/sendPhoto",
                          data={"chat_id": chat, "photo": media, "caption": text, "parse_mode": "HTML"})
    else:
        st, out, _ = http(f"https://api.telegram.org/bot{tok}/sendMessage",
                          data={"chat_id": chat, "text": text, "parse_mode": "HTML"})
    ok = st == 200 and '"ok":true' in out
    return ok, f"telegram {st}" + ("" if ok else " — " + out[:110])


# ───────────────────────── ريديت ─────────────────────────
def to_reddit(p):
    cid = os.environ.get("REDDIT_CLIENT_ID")
    sec = os.environ.get("REDDIT_CLIENT_SECRET")
    user = os.environ.get("REDDIT_USERNAME")
    pwd = os.environ.get("REDDIT_PASSWORD")
    if not all([cid, sec, user, pwd]):
        return None, "غير مضبوط (اختياري)"
    ua = f"ProfitLeakAutoPoster/1.0 (by /u/{user})"
    tok_url = "https://www.reddit.com/api/v1/access_token"
    auth = base64.b64encode(f"{cid}:{sec}".encode()).decode()
    st, out, _ = http(tok_url, data={"grant_type": "password", "username": user, "password": pwd},
                      headers={"Authorization": f"Basic {auth}", "User-Agent": ua})
    try:
        token = json.loads(out)["access_token"]
    except Exception:
        return False, f"فشل الدخول {st}: {out[:90]}"
    targets = os.environ.get("REDDIT_SUBS", "").strip()
    targets = [s.strip() for s in targets.split(",") if s.strip()] or [f"u_{user}"]
    last_ok, last_msg = False, ""
    for sr in targets:
        st2, out2, _ = http("https://oauth.reddit.com/api/submit",
                            data={"sr": sr, "kind": "self", "api_type": "json",
                                  "title": p["title"][:295], "text": render(p, "reddit")},
                            headers={"Authorization": f"bearer {token}", "User-Agent": ua})
        ok = st2 == 200 and '"errors"' in out2 and '"errors": []' in out2.replace(" ", "")
        last_ok, last_msg = ok, f"reddit/{sr} {st2}" + ("" if ok else " — " + out2[:90])
        if sr != targets[-1]:
            time.sleep(3)
    return last_ok, last_msg


# ───────────────────────── بينتوريست ─────────────────────────
def to_pinterest(p, media):
    token = os.environ.get("PINTEREST_TOKEN")
    board = os.environ.get("PINTEREST_BOARD_ID")
    if not (token and board):
        return None, "غير مضبوط (اختياري)"
    title, desc = render(p, "pinterest")
    # الصورة العمودية المخصّصة (1000×1500) لهذا المنشور، وإن لم توجد فالصورة العامة
    pin = f"{MEDIA_BASE.rstrip('/')}/pinterest/{p['id']}.jpg" if MEDIA_BASE else ""
    img = pin if os.environ.get("PINTEREST_PINS", "1") == "1" else media
    payload = {"board_id": board, "title": title, "description": desc, "link": link("pinterest"),
               "media_source": {"source_type": "image_url", "url": img or media or link("pinterest")}}
    st, out, _ = http("https://api.pinterest.com/v5/pins", data=payload, json_body=True,
                      headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    ok = st in (200, 201)
    return ok, f"pinterest {st}" + ("" if ok else " — " + out[:110])


# ───────────────────────── تويتر / إكس (OAuth 1.0a) ─────────────────────────
def oauth1_header(method, url, ck, cs, at, ats):
    oa = {"oauth_consumer_key": ck, "oauth_nonce": "".join(random.choices(string.ascii_letters + string.digits, k=32)),
          "oauth_signature_method": "HMAC-SHA1", "oauth_timestamp": str(int(time.time())),
          "oauth_token": at, "oauth_version": "1.0"}
    base = "&".join([method.upper(), urllib.parse.quote(url, safe=""),
                     urllib.parse.quote("&".join(f"{k}={urllib.parse.quote(str(oa[k]), safe='')}" for k in sorted(oa)), safe="")])
    sig = base64.b64encode(hmac.new(f"{urllib.parse.quote(cs)}&{urllib.parse.quote(ats)}".encode(),
                                    base.encode(), hashlib.sha1).digest()).decode()
    oa["oauth_signature"] = sig
    return "OAuth " + ", ".join(f'{k}="{urllib.parse.quote(str(v), safe="")}"' for k, v in sorted(oa.items()))


def to_twitter(p):
    ck = os.environ.get("TWITTER_API_KEY")
    cs = os.environ.get("TWITTER_API_SECRET")
    at = os.environ.get("TWITTER_ACCESS_TOKEN")
    ats = os.environ.get("TWITTER_ACCESS_SECRET")
    if not all([ck, cs, at, ats]):
        return None, "غير مضبوط (المنصة مدفوعة — اختياري)"
    url = "https://api.twitter.com/2/tweets"
    st, out, _ = http(url, data={"text": render(p, "twitter")}, json_body=True,
                      headers={"Authorization": oauth1_header("POST", url, ck, cs, at, ats),
                               "Content-Type": "application/json"})
    ok = st in (200, 201)
    return ok, f"twitter {st}" + ("" if ok else " — " + out[:110])


# ───────────────────────── يوتيوب ─────────────────────────
def to_youtube(p):
    cid = os.environ.get("YOUTUBE_CLIENT_ID")
    cs = os.environ.get("YOUTUBE_CLIENT_SECRET")
    rt = os.environ.get("YOUTUBE_REFRESH_TOKEN")
    vid = os.environ.get("YOUTUBE_VIDEO_URL")
    if not all([cid, cs, rt, vid]):
        return None, "غير مضبوط (يحتاج تفويض Google لمرة واحدة)"
    st, out, _ = http("https://oauth2.googleapis.com/token",
                      data={"client_id": cid, "client_secret": cs, "refresh_token": rt, "grant_type": "refresh_token"})
    try:
        access = json.loads(out)["access_token"]
    except Exception:
        return False, f"فشل التوكن {st}"
    st2, raw, _ = http(vid, method="GET")
    if st2 != 200:
        return False, f"تعذّر تحميل الفيديو {st2}"
    title, desc = render(p, "youtube")
    meta = {"snippet": {"title": title, "description": desc, "tags": [h.strip() for h in p.get("hashtags", [])],
                        "categoryId": "22"},
            "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False}}
    st3, out3, hdr = http("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
                          data=meta, json_body=True,
                          headers={"Authorization": f"Bearer {access}", "Content-Type": "application/json"})
    loc = hdr.get("Location") or hdr.get("location")
    if st3 not in (200, 201) or not loc:
        return False, f"فشل بدء الرفع {st3}"
    st4, out4, _ = http(loc, data=raw, method="PUT",
                        headers={"Authorization": f"Bearer {access}", "Content-Type": "video/mp4"}, timeout=300)
    return st4 in (200, 201), f"youtube {st4}"


# ───────────────────────── فيسبوك ─────────────────────────
def to_facebook(p, media):
    pid, tok = os.environ.get("FACEBOOK_PAGE_ID"), os.environ.get("FACEBOOK_TOKEN")
    if not (pid and tok):
        return None, "غير مضبوط (اختياري)"
    msg = render(p, "facebook")
    if media:
        st, out, _ = http(f"https://graph.facebook.com/v20.0/{pid}/photos",
                          data={"url": media, "message": msg, "access_token": tok})
    else:
        st, out, _ = http(f"https://graph.facebook.com/v20.0/{pid}/feed",
                          data={"message": msg, "link": link("facebook"), "access_token": tok})
    ok = st == 200 and '"id"' in out
    return ok, f"facebook {st}" + ("" if ok else " — " + out[:110])


# ───────────────────────── الرئيسية ─────────────────────────
def main():
    data = load()
    posts = data["posts"]
    today = datetime.date.today()
    idx = int(os.environ.get("INDEX", pick_index(posts, today)))
    p = posts[idx % len(posts)]
    media = media_url(p.get("media", ""))

    key = f"{today.isoformat()}-{SLOT}"
    if os.path.exists(STATE) and not FORCE:
        try:
            if json.load(open(STATE, encoding="utf-8")).get("last") == key:
                print(f"⏭  نُشر مسبقًا لـ {key} — تخطي (--force للإعادة)")
                return 0
        except Exception:
            pass

    print("=" * 62)
    print(f"📅 {today} | {SLOT} | المنشور #{p['id']} — {p['theme']}")
    print("=" * 62)
    for pl in ("facebook", "instagram", "tiktok", "reddit", "whatsapp"):
        print(f"\n─── {pl} ───\n{render(p, pl)}\n")

    if DRY:
        print("🧪 تجربة جافة — بلا إرسال")
        return 0

    results = [("ntfy (هاتفك)",) + to_ntfy(p, media)]
    if TEST:
        print("🧪 اختبار: الهاتف فقط")
    else:
        results.append(("تلغرام",) + to_telegram(p, media))
        if SLOT == "morning":                       # مرة يوميًا (أمان من الحظر)
            results.append(("ريديت",) + to_reddit(p))
            results.append(("بينتوريست",) + to_pinterest(p, media))
        results.append(("تويتر/إكس",) + to_twitter(p))
        if today.weekday() == int(os.environ.get("YOUTUBE_DAY", "5")) and SLOT == "evening":
            results.append(("يوتيوب",) + to_youtube(p))
        results.append(("فيسبوك",) + to_facebook(p, media))

    print("\n" + "=" * 62)
    for name, ok, note in results:
        print(("✅ " if ok else ("⚪ " if ok is None else "❌ ")) + f"{name}: {note}")
    print("=" * 62)

    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ:
        with open(summ, "a", encoding="utf-8") as f:
            f.write(f"## 📅 منشور #{p['id']} — {p['theme']} ({SLOT})\n\n")
            for name, ok, note in results:
                f.write(f"- {'✅' if ok else ('⚪' if ok is None else '❌')} {name}: {note}\n")
    try:
        json.dump({"last": key, "post_id": p["id"], "at": datetime.datetime.utcnow().isoformat() + "Z"},
                  open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    except Exception as e:
        print("تحذير:", e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
