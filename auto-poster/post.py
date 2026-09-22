#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ProfitLeak AI — الناشر التلقائي اليومي
=====================================
• يختار منشور اليوم من التقويم تلقائيًا (بلا تكرار في نفس اليوم).
• يولّد نسخة مخصصة لكل منصة: فيسبوك / انستغرام / تيكتوك / تلغرام / واتساب.
• ينشر تلقائيًا بالكامل في: تلغرام (قناتك) + فيسبوك (صفحتك) — إن كانت المفاتيح مضبوطة.
• يرسل لك كل النسخ على الهاتف عبر ntfy لتنسخي والصقي في الباقي.
• وسم المصدر (?ref=facebook/tiktok...) يُضاف تلقائيًا لكل رابط لتعرفي من أين جاء الزائر.

يعمل على: GitHub Actions (مجانًا للأبد) — أو محليًا: python3 post.py --test
"""
import json, os, sys, ssl, urllib.request, urllib.parse, datetime, textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
CAL = os.path.join(HERE, "calendar.json")
STATE = os.path.join(HERE, "state.json")

SITE = os.environ.get("SITE", "https://profitleakaii.qd.je/").rstrip("/") + "/"
MEDIA_BASE = os.environ.get("MEDIA_BASE", "")  # رابط مجلد الصور (raw.githubusercontent)
NTFY = os.environ.get("NTFY_TOPIC", "profitleak-alerts-34d2c8377c")
SLOT = os.environ.get("SLOT", "morning")  # morning | evening
DRY = "--dry" in sys.argv or os.environ.get("DRY_RUN") == "1"
TEST = "--test" in sys.argv
FORCE = "--force" in sys.argv

ctx = ssl.create_default_context()


def http(url, data=None, headers=None, method=None, timeout=45):
    body = None
    if data is not None:
        body = data if isinstance(data, bytes) else urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, headers=headers or {}, method=method or ("POST" if body else "GET"))
    try:
        r = urllib.request.urlopen(req, timeout=timeout, context=ctx)
        return r.status, r.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "ignore")
    except Exception as e:
        return 0, str(e)


def load():
    with open(CAL, encoding="utf-8") as f:
        return json.load(f)


def pick_index(posts, today):
    """مؤشر ثابت لليوم + الفترة (صباح/مساء) — بلا تخزين، ودورة كاملة بلا تكرار."""
    epoch = datetime.date(2026, 9, 22)
    days = (today - epoch).days
    if days < 0:
        days = 0
    slot = 0 if SLOT == "morning" else 1
    return (days * 2 + slot) % len(posts)


def link(ref):
    return f"{SITE}?ref={ref}"


def media_url(rel):
    if not rel:
        return ""
    if rel.startswith("http"):
        return rel
    return (MEDIA_BASE.rstrip("/") + "/" + rel) if MEDIA_BASE else ""


# ───────────────────────── صياغة النسخ ─────────────────────────
def render(p, platform):
    t, b, cta = p["title"], p["body"], p["cta"]
    tags = " ".join(("#" + h.strip().lstrip("#")) for h in p.get("hashtags", []))
    url = link(platform)
    if platform == "facebook":
        return f"{t}\n\n{b}\n\n👉 {cta}: {url}"
    if platform == "instagram":
        return f"{t}\n\n{b}\n\n👉 {cta}\n(الرابط في البايو 👆 أو انسخيه: {url})\n.\n.\n.\n{tags}"
    if platform == "tiktok":
        short = b.split("\n")[0]
        return f"{t}\n\n{short}\n\n👉 {url}\n{tags}"
    if platform == "telegram":
        return f"<b>{t}</b>\n\n{b.replace('**', '')}\n\n👉 <a href=\"{url}\">{cta}</a>"
    if platform == "whatsapp":
        return f"{t}\n\n{b.split(chr(10))[0]}\n👉 {url}"
    return f"{t}\n\n{b}\n\n{url}"


# ───────────────────────── قنوات النشر ─────────────────────────
def to_ntfy(p, media):
    title = f"ProfitLeak - Daily Post #{p['id']} ({SLOT})"
    body = (
        f"📘 فيسبوك:\n{render(p, 'facebook')}\n\n"
        f"📸 انستغرام:\n{render(p, 'instagram')}\n\n"
        f"🎵 تيكتوك:\n{render(p, 'tiktok')}\n\n"
        f"🟢 حالة واتساب:\n{render(p, 'whatsapp')}"
    )
    headers = {
        "Title": title.encode("ascii", "ignore").decode(),
        "Tags": "calendar,rocket",
        "Priority": "default",
        "Markdown": "no",
        "Actions": json.dumps([{"action": "view", "label": "Open site", "url": link(SLOT)}], ensure_ascii=False),
    }
    if media:
        headers["Attach"] = media
        headers["Filename"] = media.split("/")[-1]
    st, out = http(f"https://ntfy.sh/{NTFY}", data=body.encode("utf-8"), headers=headers)
    return st == 200, f"ntfy {st}"


def to_telegram(p, media):
    tok, chat = os.environ.get("TELEGRAM_TOKEN"), os.environ.get("TELEGRAM_CHAT")
    if not (tok and chat):
        return None, "غير مضبوط (اختياري)"
    text = render(p, "telegram")
    if media:
        st, out = http(f"https://api.telegram.org/bot{tok}/sendPhoto",
                       data={"chat_id": chat, "photo": media, "caption": text, "parse_mode": "HTML"})
    else:
        st, out = http(f"https://api.telegram.org/bot{tok}/sendMessage",
                       data={"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": "false"})
    ok = st == 200 and '"ok":true' in out
    return ok, f"telegram HTTP {st}" + ("" if ok else " — " + out[:120])


def to_facebook(p, media):
    pid, tok = os.environ.get("FACEBOOK_PAGE_ID"), os.environ.get("FACEBOOK_TOKEN")
    if not (pid and tok):
        return None, "غير مضبوط (اختياري)"
    msg = render(p, "facebook")
    if media:
        st, out = http(f"https://graph.facebook.com/v20.0/{pid}/photos",
                       data={"url": media, "message": msg, "access_token": tok})
    else:
        st, out = http(f"https://graph.facebook.com/v20.0/{pid}/feed",
                       data={"message": msg, "link": link("facebook"), "access_token": tok})
    ok = st == 200 and '"id"' in out
    return ok, f"facebook HTTP {st}" + ("" if ok else " — " + out[:120])


def main():
    data = load()
    posts = data["posts"]
    today = datetime.date.today()
    idx = int(os.environ.get("INDEX", pick_index(posts, today)))
    p = posts[idx % len(posts)]
    media = media_url(p.get("media", ""))

    # حاجز التكرار: لا ننشر نفس الفترة مرتين في اليوم
    key = f"{today.isoformat()}-{SLOT}"
    if os.path.exists(STATE) and not FORCE:
        try:
            if json.load(open(STATE, encoding="utf-8")).get("last") == key:
                print(f"⏭  تم النشر مسبقًا لـ {key} — تخطي (استعمل --force للإعادة)")
                return 0
        except Exception:
            pass

    print("=" * 60)
    print(f"📅 {today.isoformat()} — الفترة: {SLOT} — المنشور #{p['id']} ({p['theme']})")
    print("=" * 60)
    for pl in ("facebook", "instagram", "tiktok", "whatsapp"):
        print(f"\n─── {pl} ───\n{render(p, pl)}\n")

    if DRY:
        print("🧪 وضع تجريبي — بلا إرسال فعلي")
        return 0

    results = []
    results.append(("ntfy (هاتفك)",) + to_ntfy(p, media))
    if TEST:
        print("🧪 اختبار: لن يُنشر في تلغرام/فيسبوك (فقط الهاتف)")
    else:
        results.append(("تلغرام (تلقائي)",) + to_telegram(p, media))
        results.append(("فيسبوك (تلقائي)",) + to_facebook(p, media))

    print("\n" + "=" * 60)
    for name, ok, note in results:
        if ok is None:
            print(f"⚪  {name}: {note}")
        elif ok:
            print(f"✅  {name}: نُشر ({note})")
        else:
            print(f"❌  {name}: {note}")
    print("=" * 60)

    # ملخّص GitHub Actions
    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ:
        with open(summ, "a", encoding="utf-8") as f:
            f.write(f"## 📅 منشور اليوم — #{p['id']} ({p['theme']})\n\n")
            for name, ok, note in results:
                f.write(f"- {'✅' if ok else ('⚪' if ok is None else '❌')} {name}: {note}\n")
            f.write(f"\n```\n{render(p, 'facebook')}\n```\n")

    # حفظ الحالة (يَمنع التكرار)
    try:
        json.dump({"last": key, "post_id": p["id"], "at": datetime.datetime.utcnow().isoformat() + "Z"},
                  open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    except Exception as e:
        print("تحذير: تعذّر حفظ الحالة:", e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
