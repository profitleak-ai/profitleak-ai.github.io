#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
📌 بن فيديو «مخفي» يوميًا على بينتوريست (بيئة Sandbox — يراه صاحب الحساب فقط):
  1) يولّد فيديو المنشور (1080×1920)
  2) يرفعه إلى الموقع  →  https://profitleakaii.qd.je/videos/pin-<id>.mp4  (للتحميل على الهاتف)
  3) ينشئه بنًّا مخفيًا على لوحة الاختبار، رابطه = رابط تحميل الفيديو، ووصفه = النص الجاهز للنسخ
  4) يرسل للهاتف (ntfy) الحزمة كاملة: رابط الفيديو + العنوان + الوصف + الهاشتاجات + الرابط
أنتِ: تحمّلين الفيديو → تنسخين النصوص → تنشرينه دبوسًا عامًا من تطبيق Pinterest.
لا يلمس تلغرام إطلاقًا.
"""
import os, sys, json, time, base64, ssl, datetime, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import post as P

SITE = os.environ.get("SITE", "https://profitleakaii.qd.je").rstrip("/")
NTFY = os.environ.get("NTFY_TOPIC", "profitleak-alerts-34d2c8377c")
REPO = os.environ.get("GITHUB_REPOSITORY", "profitleak-ai/profitleak-ai.github.io")
GH = os.environ.get("GITHUB_TOKEN", "")
ctx = ssl.create_default_context()


def envflag(k):
    return os.environ.get(k, "").strip().lower() in ("1", "true", "yes", "on")


# ─────────── النص الجاهز للدبوس العام (عنوان + وصف مع هاشتاجات + رابط) ───────────
def manual_copy(p):
    title, _ = P.render(p, "pinterest")
    tags = " ".join("#" + h.strip().lstrip("#") for h in p.get("hashtags", []))
    tags = (tags + " #ProfitLeakAI #ربح #تجارة_الكترونية").strip()
    body = P.strip_md(p["body"]).replace("\n", " ")
    link = P.link("pinterest")
    desc = f"{body} — {p['cta']} 👇 {link}\n\n{tags}"
    return title[:100], desc[:800], link, tags


# ─────────── رفع الفيديو إلى الموقع (GitHub Contents API) ───────────
def upload_to_site(path, rel):
    if not GH:
        return None, "لا يوجد GITHUB_TOKEN"
    api = f"https://api.github.com/repos/{REPO}/contents/{urllib.parse.quote(rel)}"
    hdr = {"Authorization": f"Bearer {GH}", "Accept": "application/vnd.github+json", "User-Agent": "ProfitLeak/1.0"}
    st, out, _ = P.http(api, headers=hdr, method="GET")
    sha = None
    if st == 200:
        try:
            sha = json.loads(out).get("sha")
        except Exception:
            pass
    payload = {"message": f"hidden-pin: {rel}", "content": base64.b64encode(open(path, "rb").read()).decode()}
    if sha:
        payload["sha"] = sha
    st, out, _ = P.http(api, data=payload, json_body=True, headers={**hdr, "Content-Type": "application/json"}, method="PUT")
    if st not in (200, 201):
        return False, f"رفع الفيديو للموقع فشل {st}: {out[:90]}"
    url = f"{SITE}/{urllib.parse.quote(rel)}"
    # انتظار نشر GitHub Pages (حتى ~6 دقائق)
    for _ in range(36):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, method="HEAD", headers={"User-Agent": "ProfitLeak/1.0"}),
                                       timeout=20, context=ctx)
            if r.status == 200:
                return url, "الفيديو على الموقع ✅"
        except Exception:
            pass
        time.sleep(10)
    return url, "رُفع (سيظهر على الموقع خلال دقائق)"


def pinterest_has(board, title):
    tok = os.environ.get("PINTEREST_TOKEN", "")
    st, out, _ = P.http(P.pbase() + f"/v5/boards/{board}/pins?page_size=50",
                        headers={"Authorization": f"Bearer {tok}"}, method="GET")
    if st != 200:
        return None
    try:
        return any((i.get("title") or "").strip() == title.strip() for i in (json.loads(out).get("items") or []))
    except Exception:
        return None


def hidden_pin(p, board, cover, video_path, video_url, title, desc):
    """بن فيديو مخفي: الرابط = تحميل الفيديو، الوصف = النص الجاهز"""
    tok = os.environ["PINTEREST_TOKEN"]
    auth = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    st, out, _ = P.http(P.pbase() + "/v5/media", data={"media_type": "video"}, json_body=True, headers=auth)
    try:
        d = json.loads(out)
    except Exception:
        return False, f"تسجيل الرفع فشل {st}: {out[:90]}"
    mid, up, params = d.get("media_id"), d.get("upload_url"), d.get("upload_parameters") or {}
    if not (mid and up):
        return False, f"استجابة غير متوقعة: {out[:100]}"
    body, ctype = P.multipart(params, {"file": ("video.mp4", open(video_path, "rb").read(), "video/mp4")})
    st2, out2, _ = P.http(up, data=body, headers={"Content-Type": ctype}, timeout=300)
    if st2 not in (200, 201, 204):
        return False, f"رفع S3 فشل {st2}"
    status = ""
    for _ in range(40):
        s3, o3, _ = P.http(P.pbase() + f"/v5/media/{mid}", headers=auth)
        try:
            status = json.loads(o3).get("status", "")
        except Exception:
            pass
        if status.lower() in ("succeeded", "processed"):
            break
        time.sleep(10)
    payload = {"board_id": board, "title": title, "description": desc[:800],
               "link": video_url or P.link("pinterest"), "alt_text": p["title"][:480],
               "media_source": {"source_type": "video_id", "media_id": mid, "cover_image_url": cover}}
    st4, out4, _ = P.http(P.pbase() + "/v5/pins", data=payload, json_body=True, headers=auth)
    ok = st4 in (200, 201)
    pid = ""
    if ok:
        try:
            pid = json.loads(out4).get("id", "")
        except Exception:
            pass
    return ok, (f"بن مخفي {st4} id={pid}" if ok else f"بن مخفي {st4} — {out4[:100]}")


def notify(p, title, desc, link, tags, video_url, pin_note):
    body = (
        f"🎬 فيديو #{p['id']} — {p['theme']}\n"
        f"⬇️ حمّلي الفيديو (اضغطي الزر أو الرابط):\n{video_url}\n\n"
        f"📌 ثم في Pinterest: ＋ → Épingle → Vidéo → اختاري الفيديو من المعرض\n\n"
        f"━━━━━━━━ انسخي ━━━━━━━━\n"
        f"📝 Titre:\n{title}\n\n"
        f"📄 Description:\n{desc}\n\n"
        f"🔗 Lien:\n{link}\n\n"
        f"📋 Tableau: ProfitLeak AI\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n"
        f"ℹ️ {pin_note}"
    )
    headers = {"Title": f"ProfitLeak - Pinterest Video #{p['id']}", "Tags": "movie_camera,pushpin",
               "Actions": json.dumps([
                   {"action": "view", "label": "Download video", "url": video_url},
                   {"action": "view", "label": "Pinterest", "url": "https://www.pinterest.com/pin-creation-tool/"}])}
    req = urllib.request.Request(f"https://ntfy.sh/{NTFY}", data=body.encode("utf-8"), headers=headers, method="POST")
    try:
        return urllib.request.urlopen(req, timeout=30, context=ctx).status == 200
    except Exception:
        return False


def main():
    posts = P.load()["posts"]
    today = datetime.date.today()
    idx = int(os.environ.get("INDEX") or P.pick_index(posts, today))
    p = posts[idx % len(posts)]
    title, desc, link, tags = manual_copy(p)
    print(f"📌 بن مخفي — المنشور #{p['id']} ({p['theme']})")

    tok = os.environ.get("PINTEREST_TOKEN", "")
    board = os.environ.get("PINTEREST_BOARD_ID", "")
    if tok and not board:
        board, _ = P.pinterest_board(tok)

    # 1) الفيديو
    import make_video as mv
    path, size, n = mv.make_video(p)
    print(f"🎬 الفيديو جاهز ({size/1048576:.2f} MB · {n} إطار)")

    # 2) رفعه للموقع
    video_url, unote = upload_to_site(path, f"videos/pin-{p['id']}.mp4")
    print(f"🌐 {unote}: {video_url}")
    video_url = video_url or f"{SITE}/videos/pin-{p['id']}.mp4"

    # 3) البن المخفي (بلا تكرار)
    pin_note = "لا يوجد رمز بينتوريست"
    if tok and board:
        exists = pinterest_has(board, title)
        if exists:
            pin_note = "البن المخفي موجود مسبقًا (لم يُكرَّر)"
        else:
            ok, pin_note = hidden_pin(p, board, f"{SITE}/pinterest/{p['id']}.jpg", path, video_url, title, desc)
    print("📌", pin_note)

    # 4) الهاتف
    if envflag("SKIP_NTFY"):
        print("🧪 تجاهُل إشعار الهاتف")
    else:
        print("📲 ntfy:", "✅" if notify(p, title, desc, link, tags, video_url, pin_note) else "❌")

    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ:
        with open(summ, "a", encoding="utf-8") as f:
            f.write(f"## 📌 بن مخفي #{p['id']} — {p['theme']}\n\n- 🎬 {video_url}\n- 📌 {pin_note}\n\n"
                    f"**Titre:** {title}\n\n**Description:**\n\n```\n{desc}\n```\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
