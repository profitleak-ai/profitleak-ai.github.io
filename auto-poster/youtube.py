#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
رفع فيديو اليوم إلى يوتيوب شورتس — YouTube Data API v3 (مجاني)
يحتاج الأسرار: YT_CLIENT_ID · YT_CLIENT_SECRET · YT_REFRESH_TOKEN
"""
import os, json, ssl, urllib.request, urllib.error, urllib.parse

ctx = ssl.create_default_context()
SITE = os.environ.get("SITE", "https://profitleakaii.qd.je").rstrip("/")


def access_token():
    cid, sec, rt = (os.environ.get("YT_CLIENT_ID", ""), os.environ.get("YT_CLIENT_SECRET", ""),
                    os.environ.get("YT_REFRESH_TOKEN", ""))
    if not (cid and sec and rt):
        return None, "لا توجد بيانات يوتيوب (YT_CLIENT_ID/SECRET/REFRESH_TOKEN)"
    data = urllib.parse.urlencode(dict(client_id=cid, client_secret=sec, refresh_token=rt,
                                       grant_type="refresh_token")).encode()
    try:
        r = urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", data=data),
                                   timeout=30, context=ctx)
        return json.load(r)["access_token"], "ok"
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")[:200]
        hint = " — انتهى رمز التحديث (التطبيق في وضع الاختبار؟ انشري التطبيق في Google Cloud)" if "invalid_grant" in body else ""
        return None, f"فشل تحديث الرمز {e.code}: {body}{hint}"
    except Exception as e:
        return None, f"خطأ شبكة: {str(e)[:120]}"


def metadata(p):
    """عنوان ووصف ووسوم الشورت من كتلة الفيديو (فصحى/إنجليزية)"""
    V = p.get("video") or {}
    ar = p.get("lang", "ar") == "ar"
    import post as P
    base = (V.get("title") or P.strip_md(p["title"])).strip()
    hook = (V.get("hook") or "").strip().rstrip("!؟?…").strip()
    # العنوان = الخطّاف (أقوى جذبًا في خلاصة الشورتس) + العنوان الأصلي إن اتسع
    title = base if not hook or len(hook) > 70 else (f"{hook} | {base}" if len(hook) + len(base) < 85 else hook)
    title = (title[:92] + " #Shorts") if len(title) > 92 else (title + " #Shorts")
    points = [x for x in V.get("points", []) if x]
    link = P.link("youtube") if hasattr(P, "link") else f"{SITE}/?ref=youtube"
    body = "\n".join("• " + x for x in points)
    if ar:
        desc = (f"{V.get('hook', '')}\n\n{body}\n\n✨ {V.get('result', '')}\n\n"
                f"👈 {V.get('cta') or p.get('cta', '')} مجانًا ودون تسجيل:\n{link}\n\n"
                f"ProfitLeak AI — احسب ربحك الحقيقي من التجارة الإلكترونية في 30 ثانية.\n\n"
                f"#ProfitLeakAI #التجارة_الإلكترونية #الربح_الحقيقي #دروبشيبينغ #Shorts")
        tags = ["ProfitLeak AI", "التجارة الإلكترونية", "الربح الحقيقي", "دروبشيبينغ", "حساب الربح", "Shorts"]
    else:
        desc = (f"{V.get('hook', '')}\n\n{body}\n\n✨ {V.get('result', '')}\n\n"
                f"👉 {V.get('cta') or p.get('cta', '')} — free, no signup:\n{link}\n\n"
                f"ProfitLeak AI — find your real e-commerce profit in 30 seconds.\n\n"
                f"#ProfitLeakAI #ecommerce #dropshipping #profit #Shorts")
        tags = ["ProfitLeak AI", "ecommerce", "dropshipping", "profit calculator", "Shorts"]
    return title, desc[:4900], tags, ("ar" if ar else "en")


def upload(p, path, privacy=None):
    """يعيد (ok, note). privacy: public/unlisted/private (افتراضي public)"""
    tok, note = access_token()
    if not tok:
        return None, note
    title, desc, tags, lang = metadata(p)
    privacy = privacy or os.environ.get("YT_PRIVACY", "public")
    status = {"privacyStatus": privacy, "selfDeclaredMadeForKids": False}
    publish_at = os.environ.get("YT_PUBLISH_AT", "").strip()   # ISO-8601 UTC مثل 2026-10-13T12:00:00Z → نشر مجدول
    if publish_at:
        status["privacyStatus"] = "private"
        status["publishAt"] = publish_at
    meta = {"snippet": {"title": title, "description": desc, "tags": tags, "categoryId": "27",
                        "defaultLanguage": lang, "defaultAudioLanguage": lang},
            "status": status}
    size = os.path.getsize(path)
    # 1) بدء الرفع القابل للاستئناف
    init = urllib.request.Request(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        data=json.dumps(meta).encode("utf-8"), method="POST",
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json; charset=UTF-8",
                 "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)})
    try:
        r = urllib.request.urlopen(init, timeout=60, context=ctx)
        loc = r.headers.get("Location")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        if "quotaExceeded" in body:
            return False, "تجاوز حصة يوتيوب اليومية (10,000 وحدة) — سيُعاد غدًا"
        if "youtubeSignupRequired" in body:
            return False, "الحساب بلا قناة يوتيوب — أنشئي القناة أولًا"
        return False, f"فشل بدء الرفع {e.code}: {body[:200]}"
    if not loc:
        return False, "لا يوجد رابط رفع"
    # 2) رفع الملف كاملًا
    with open(path, "rb") as f:
        data = f.read()
    put = urllib.request.Request(loc, data=data, method="PUT",
                                 headers={"Content-Type": "video/mp4", "Content-Length": str(size)})
    try:
        r = urllib.request.urlopen(put, timeout=600, context=ctx)
        res = json.load(r)
    except urllib.error.HTTPError as e:
        return False, f"فشل الرفع {e.code}: {e.read().decode('utf-8', 'ignore')[:200]}"
    vid = res.get("id")
    st = res.get("status", {})
    note = f"https://youtube.com/shorts/{vid}"
    try:
        extras = []
        if first_comment(tok, vid, p, lang):
            extras.append("تعليق مثبّت")
        if add_to_playlist(tok, vid, lang):
            extras.append("قائمة تشغيل")
        if extras:
            note += " · " + " + ".join(extras)
    except Exception as e:
        print("⚪ إضافات يوتيوب:", str(e)[:100])
    if publish_at:
        note += f" (مجدول للنشر {publish_at})"
    elif st.get("uploadStatus") == "rejected" or st.get("privacyStatus") != privacy:
        note += f" ({st.get('privacyStatus')}/{st.get('uploadStatus')}{(' — ' + st.get('rejectionReason')) if st.get('rejectionReason') else ''})"
    return True, note


def _post(tok, url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json; charset=UTF-8"})
    return json.load(urllib.request.urlopen(req, timeout=60, context=ctx))


def first_comment(tok, vid, p, lang):
    """تعليق أول من القناة فيه الرابط (وصف الشورتس مخفي في الخلاصة، التعليق أوضح للنقر)"""
    import post as P
    link = P.link("yt-comment")
    V = p.get("video") or {}
    if lang == "ar":
        txt = (f"👈 {V.get('cta') or 'احسب ربحك الحقيقي'} مجانًا ودون تسجيل:\n{link}\n\n"
               f"ما أكبر تكلفة تنسى حسابها؟ اكتب لنا في التعليقات 👇")
    else:
        txt = (f"👉 {V.get('cta') or 'Calculate your real profit'} — free, no signup:\n{link}\n\n"
               f"Which cost do you usually forget? Tell us below 👇")
    try:
        _post(tok, "https://www.googleapis.com/youtube/v3/commentThreads?part=snippet",
              {"snippet": {"videoId": vid, "topLevelComment": {"snippet": {"textOriginal": txt}}}})
        return True
    except urllib.error.HTTPError as e:
        print("⚪ تعليق:", e.code, e.read().decode("utf-8", "ignore")[:120]); return False


_PL_CACHE = {}


def add_to_playlist(tok, vid, lang):
    """يضيف الشورت إلى قائمة تشغيل اللغة (تُنشأ مرة واحدة) — يساعد على المشاهدة المتسلسلة"""
    title = "ProfitLeak AI — الربح الحقيقي (بالعربية)" if lang == "ar" else "ProfitLeak AI — Real Profit (English)"
    pid = _PL_CACHE.get(title)
    if not pid:
        r = urllib.request.urlopen(urllib.request.Request(
            "https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50",
            headers={"Authorization": f"Bearer {tok}"}), timeout=30, context=ctx)
        for it in json.load(r).get("items", []):
            if it["snippet"]["title"] == title:
                pid = it["id"]
        if not pid:
            desc = ("شورتس يومية لبائعي التجارة الإلكترونية: كيف تحسب ربحك الحقيقي بعد الإعلان والتوصيل والمرتجعات. "
                    "الأداة مجانية: https://profitleakaii.qd.je" if lang == "ar" else
                    "Daily Shorts for e-commerce sellers: your real profit after ads, shipping and returns. Free tool: https://profitleakaii.qd.je")
            pid = _post(tok, "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status",
                        {"snippet": {"title": title, "description": desc, "defaultLanguage": lang},
                         "status": {"privacyStatus": "public"}})["id"]
        _PL_CACHE[title] = pid
    import time
    for attempt in range(4):   # يوتيوب يعيد 409 أحيانًا مباشرة بعد الرفع — إعادة محاولة
        try:
            _post(tok, "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",
                  {"snippet": {"playlistId": pid, "resourceId": {"kind": "youtube#video", "videoId": vid}}})
            return True
        except urllib.error.HTTPError as e:
            if e.code != 409 or attempt == 3:
                print("⚪ قائمة التشغيل:", e.code); return False
            time.sleep(3 * (attempt + 1))
    return False


def channel_info():
    tok, note = access_token()
    if not tok:
        return None
    r = urllib.request.urlopen(urllib.request.Request(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
        headers={"Authorization": f"Bearer {tok}"}), timeout=30, context=ctx)
    return json.load(r).get("items", [None])[0]


if __name__ == "__main__":
    print(json.dumps(channel_info(), ensure_ascii=False, indent=1)[:600])
