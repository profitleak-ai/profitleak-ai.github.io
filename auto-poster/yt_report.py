#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
تقرير أسبوعي لأداء شورتس يوتيوب → تلغرام
يقرأ كل فيديوهات القناة (آخر 60) مع المشاهدات/الإعجابات/التعليقات، يربطها بالمنشور والخطّاف،
ويرتّبها ليُظهر أي الخطّافات تجذب أكثر.
"""
import os, sys, json, ssl, re, urllib.request, urllib.parse, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import youtube as YT
import post as P

ctx = ssl.create_default_context()


def get(url, tok):
    r = urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}"}), timeout=60, context=ctx)
    return json.load(r)


def fetch_videos(tok):
    ch = get("https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics,snippet&mine=true", tok)["items"][0]
    uploads = ch["contentDetails"]["relatedPlaylists"]["uploads"]
    ids, page = [], ""
    while len(ids) < 60:
        q = urllib.parse.urlencode({"part": "contentDetails", "playlistId": uploads, "maxResults": 50, "pageToken": page})
        d = get("https://www.googleapis.com/youtube/v3/playlistItems?" + q, tok)
        ids += [i["contentDetails"]["videoId"] for i in d.get("items", [])]
        page = d.get("nextPageToken", "")
        if not page:
            break
    vids = []
    for i in range(0, len(ids), 50):
        q = urllib.parse.urlencode({"part": "snippet,statistics", "id": ",".join(ids[i:i + 50])})
        vids += get("https://www.googleapis.com/youtube/v3/videos?" + q, tok).get("items", [])
    return ch, vids


def match_post(title, posts):
    t = re.sub(r"\s*#Shorts$", "", title).strip()
    for p in posts:
        vt = ((p.get("video") or {}).get("title") or "").strip()
        if vt and (vt == t or vt[:40] == t[:40]):
            return p
    return None


def build(posts):
    tok, note = YT.access_token()
    if not tok:
        return None, note
    ch, vids = fetch_videos(tok)
    now = datetime.datetime.now(datetime.timezone.utc)
    rows = []
    for v in vids:
        s, st = v["snippet"], v.get("statistics", {})
        pub = datetime.datetime.fromisoformat(s["publishedAt"].replace("Z", "+00:00"))
        days = max((now - pub).total_seconds() / 86400, 1.0)
        p = match_post(s["title"], posts)
        views = int(st.get("viewCount", 0)); likes = int(st.get("likeCount", 0)); com = int(st.get("commentCount", 0))
        rows.append(dict(id=v["id"], title=s["title"], pid=p["id"] if p else None,
                         hook=(p.get("video") or {}).get("hook", "") if p else "", lang=(p or {}).get("lang", "ar"),
                         views=views, likes=likes, com=com, days=days, vpd=views / days, pub=pub))
    week = [r for r in rows if r["days"] <= 7.5]
    rows.sort(key=lambda r: r["vpd"], reverse=True)
    tot_v = sum(r["views"] for r in week); tot_l = sum(r["likes"] for r in week); tot_c = sum(r["com"] for r in week)
    st = ch["statistics"]
    L = [f"📊 تقرير يوتيوب الأسبوعي — {now.date().isoformat()}",
         f"القناة: {ch['snippet']['title']} · المشتركون: {st.get('subscriberCount')} · إجمالي المشاهدات: {st.get('viewCount')}",
         f"هذا الأسبوع: {len(week)} شورت · {tot_v} مشاهدة · {tot_l} إعجاب · {tot_c} تعليق", ""]
    L.append("🏆 الأفضل (مشاهدات/يوم):")
    for i, r in enumerate(rows[:5], 1):
        tag = f"#{r['pid']}" if r["pid"] else "—"
        L.append(f"{i}. {tag} «{r['hook'] or r['title'][:40]}» → {r['views']} مشاهدة ({r['vpd']:.1f}/يوم) · 👍{r['likes']} 💬{r['com']}")
    if len(rows) > 5:
        L.append(""); L.append("🔻 الأضعف:")
        for r in rows[-3:]:
            tag = f"#{r['pid']}" if r["pid"] else "—"
            L.append(f"• {tag} «{r['hook'] or r['title'][:40]}» → {r['views']} مشاهدة ({r['vpd']:.1f}/يوم)")
    ar = [r for r in rows if r["lang"] == "ar" and r["pid"]]; en = [r for r in rows if r["lang"] == "en" and r["pid"]]
    if ar and en:
        avg = lambda xs: sum(x["vpd"] for x in xs) / len(xs)
        L.append(""); L.append(f"🌍 المتوسط/يوم — عربي: {avg(ar):.1f} · إنجليزي: {avg(en):.1f}")
    # توصية بسيطة
    if rows:
        best = rows[0]
        L.append("")
        kind = "سؤال" if "؟" in (best["hook"] or "") or "?" in (best["hook"] or "") else ("رقم صادم" if re.search(r"\d|[٠-٩]", best["hook"] or "") else "تحذير")
        L.append(f"💡 التوصية: خطّافات من نوع «{kind}» تؤدي أفضل هذا الأسبوع — سأرجّح هذا الأسلوب في الفيديوهات القادمة.")
    L.append(""); L.append("🔗 https://studio.youtube.com")
    return "\n".join(L), rows


def send_telegram(text):
    tok = os.environ.get("TELEGRAM_TOKEN", ""); chat = os.environ.get("TELEGRAM_ADMIN_CHAT", "").strip() or "5906873534"
    if not tok:
        return False
    data = urllib.parse.urlencode({"chat_id": chat, "text": text[:4000], "disable_web_page_preview": "true"}).encode()
    try:
        r = urllib.request.urlopen(urllib.request.Request(f"https://api.telegram.org/bot{tok}/sendMessage", data=data), timeout=30, context=ctx)
        return r.status == 200
    except Exception as e:
        print("telegram:", str(e)[:120]); return False


if __name__ == "__main__":
    posts = P.load()["posts"]
    text, rows = build(posts)
    print(text)
    if text and not os.environ.get("NO_SEND"):
        print("📨 telegram:", send_telegram(text))
