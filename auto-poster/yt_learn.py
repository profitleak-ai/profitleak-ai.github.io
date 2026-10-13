#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
محرّك التعلّم من الأداء — يقرأ إحصاءات كل شورت على يوتيوب ويبني خطة فيديوهات اليوم:
  • يحسب لكل منشور: مشاهدات/يوم، معدل الإعجاب، أفضل خطّاف جرّبناه
  • يصنّف أسلوب الخطّاف (سؤال / رقم / تحذير / قصة) ويعرف الأنجح
  • يختار فيديوهات اليوم: حصّتان «استثمار» من الموضوعات الرابحة (بخطّاف/قالب مختلف) + حصة «استكشاف» لموضوع لم يُجرَّب
النتيجة تُحفظ في yt_perf.json ويقرأها publish_video.py
"""
import os, sys, json, re, datetime, ssl, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import youtube as YT
import post as P

PERF = os.path.join(HERE, "yt_perf.json")
ctx = ssl.create_default_context()
TEMPLATES = ["midnight", "royal", "emerald", "sunset"]


def load_perf():
    try:
        return json.load(open(PERF, encoding="utf-8"))
    except Exception:
        return {"uploads": [], "posts": {}, "styles": {}, "plan": {}}


def save_perf(d):
    json.dump(d, open(PERF, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def style_of(hook):
    h = hook or ""
    if re.search(r"[?؟]", h):
        return "سؤال"
    if re.search(r"\d|[٠-٩]|\$|%|٪", h):
        return "رقم"
    if re.search(r"قصة|خسرت|كنت|story|I was|I sold", h, re.I):
        return "قصة"
    return "تحذير"


def fetch_stats(video_ids):
    tok, note = YT.access_token()
    if not tok:
        return {}, note
    out = {}
    ids = list(video_ids)
    for i in range(0, len(ids), 50):
        q = urllib.parse.urlencode({"part": "statistics,status,snippet", "id": ",".join(ids[i:i + 50])})
        r = urllib.request.urlopen(urllib.request.Request("https://www.googleapis.com/youtube/v3/videos?" + q,
                                                          headers={"Authorization": f"Bearer {tok}"}), timeout=60, context=ctx)
        for it in json.load(r).get("items", []):
            st = it.get("statistics", {})
            pub = it["status"].get("publishAt") or it["snippet"]["publishedAt"]
            out[it["id"]] = dict(views=int(st.get("viewCount", 0)), likes=int(st.get("likeCount", 0)),
                                 comments=int(st.get("commentCount", 0)), published=pub,
                                 privacy=it["status"].get("privacyStatus"))
    return out, "ok"


def analyze(posts):
    perf = load_perf()
    now = datetime.datetime.now(datetime.timezone.utc)
    # أضف أي فيديوهات على القناة لم نسجّلها (مثل المنشورة يدويًا) عبر مطابقة العنوان
    try:
        import yt_report
        tok, _ = YT.access_token()
        if tok:
            _, vids = yt_report.fetch_videos(tok)
            known = {u["video_id"] for u in perf["uploads"]}
            for v in vids:
                if v["id"] in known:
                    continue
                p = yt_report.match_post(v["snippet"]["title"], posts)
                if p:
                    perf["uploads"].append(dict(video_id=v["id"], post_id=p["id"], hook=p["video"].get("hook", ""),
                                                template="", date=v["snippet"]["publishedAt"][:10], source="matched"))
    except Exception as e:
        print("⚪ مطابقة القناة:", str(e)[:100])

    stats, note = fetch_stats([u["video_id"] for u in perf["uploads"]])
    if not stats and perf["uploads"]:
        print("⚠️", note)
    by_post, by_style, by_hook = {}, {}, {}
    for u in perf["uploads"]:
        s = stats.get(u["video_id"])
        if not s or s.get("privacy") == "private":
            continue
        try:
            pub = datetime.datetime.fromisoformat(s["published"].replace("Z", "+00:00"))
        except Exception:
            continue
        age = max((now - pub).total_seconds() / 86400, 0.25)
        if age < 0.25 or pub > now:
            continue
        vpd = s["views"] / min(age, 7.0)           # نركّز على سرعة الانتشار في أول أسبوع
        eng = (s["likes"] * 5 + s["comments"] * 10) / max(s["views"], 1)
        score = vpd * (1 + eng)
        u.update(views=s["views"], likes=s["likes"], comments=s["comments"], vpd=round(vpd, 2), score=round(score, 2))
        by_post.setdefault(str(u["post_id"]), []).append(score)
        by_style.setdefault(style_of(u.get("hook", "")), []).append(score)
        by_hook.setdefault(u.get("hook", ""), []).append(score)
    perf["posts"] = {k: dict(score=round(sum(v) / len(v), 2), n=len(v), best=round(max(v), 2)) for k, v in by_post.items()}
    perf["styles"] = {k: dict(score=round(sum(v) / len(v), 2), n=len(v)) for k, v in by_style.items()}
    perf["hooks"] = {k: round(sum(v) / len(v), 2) for k, v in by_hook.items() if k}
    perf["updated"] = now.isoformat()
    return perf


def last_dates(perf):
    d = {}
    for u in perf["uploads"]:
        d[str(u["post_id"])] = max(d.get(str(u["post_id"]), ""), u.get("date", ""))
    return d


def choose_hook(p, perf):
    """أفضل خطّاف مجرَّب لهذا المنشور؛ وإن لم يُجرَّب بعضها بعدُ نجرّب الجديد (استكشاف) مع ترجيح الأسلوب الأنجح"""
    hooks = p["video"].get("hooks") or [p["video"].get("hook", "")]
    tried = {h: perf.get("hooks", {}).get(h) for h in hooks}
    untried = [h for h, s in tried.items() if s is None]
    styles = perf.get("styles", {})
    best_style = max(styles, key=lambda k: styles[k]["score"]) if styles else None
    if untried:
        pref = [h for h in untried if best_style and style_of(h) == best_style]
        return (pref or untried)[0]
    return max(tried, key=lambda h: tried[h] or 0)


def plan_today(posts, perf, today):
    """3 حصص: 0=عربي 10:00 · 1=إنجليزي 13:00 · 2=عربي 18:00"""
    last = last_dates(perf)
    key = today.isoformat()
    if perf.get("plan", {}).get("date") == key and perf["plan"].get("slots"):
        return perf["plan"]
    ar = [p for p in posts if p.get("lang", "ar") != "en"]
    en = [p for p in posts if p.get("lang") == "en"]

    def fresh(cands, days=3):
        cutoff = (today - datetime.timedelta(days=days)).isoformat()
        f = [p for p in cands if last.get(str(p["id"]), "") < cutoff]
        return f or cands

    def top(cands):
        scored = [(perf["posts"].get(str(p["id"]), {}).get("score", -1), p) for p in cands]
        scored.sort(key=lambda x: x[0], reverse=True)
        return [p for s, p in scored if s > 0]

    def explore(cands):
        # الأقل نشرًا / غير المجرَّب أولًا
        return sorted(cands, key=lambda p: (last.get(str(p["id"]), ""), perf["posts"].get(str(p["id"]), {}).get("n", 0)))

    slots, used = [], set()

    def pick(cands, mode):
        c = fresh(cands)
        order = (top(c) + explore(c)) if mode == "exploit" else explore(c)
        for p in order:
            if p["id"] not in used:
                used.add(p["id"]); return p
        return c[0]

    s0 = pick(ar, "exploit")      # صباح: الموضوع العربي الأنجح (بخطّاف/قالب مختلف)
    s1 = pick(en, "exploit")      # ظهر: الإنجليزي الأنجح
    s2 = pick(ar, "explore")      # مساء: استكشاف موضوع جديد/أقل تجربة
    day_i = (today - datetime.date(2026, 10, 12)).days
    out = []
    for i, p in enumerate((s0, s1, s2)):
        hook = choose_hook(p, perf)
        n_prev = perf["posts"].get(str(p["id"]), {}).get("n", 0)
        tmpl = TEMPLATES[(p["id"] + n_prev + day_i) % 4]   # قالب مختلف في كل إعادة
        reason = ("رابح — إعادة بخطّاف/قالب جديد" if perf["posts"].get(str(p["id"]), {}).get("score", 0) > 0
                  else "استكشاف — لم يُقَس بعد")
        out.append(dict(slot=i, index=posts.index(p), post_id=p["id"], hook=hook, template=tmpl, reason=reason))
    perf["plan"] = dict(date=key, slots=out)
    return perf["plan"]


def summary(perf, plan, posts):
    L = [f"🧠 تعلّم من الأداء — {plan['date']}"]
    st = perf.get("styles", {})
    if st:
        order = sorted(st.items(), key=lambda kv: kv[1]["score"], reverse=True)
        L.append("أساليب الخطّاف: " + " · ".join(f"{k} {v['score']:.1f}" for k, v in order))
    tops = sorted(perf.get("posts", {}).items(), key=lambda kv: kv[1]["score"], reverse=True)[:3]
    if tops:
        L.append("🏆 الأسرع انتشارًا: " + " · ".join(f"#{k} ({v['score']:.1f}/يوم)" for k, v in tops))
    L.append("")
    L.append("خطة اليوم (3 شورتس):")
    for s in plan["slots"]:
        t = ["10:00", "13:00", "18:00"][s["slot"]]
        L.append(f"• {t} #{s['post_id']} «{s['hook']}» · {s['template']} — {s['reason']}")
    return "\n".join(L)


if __name__ == "__main__":
    posts = P.load()["posts"]
    perf = analyze(posts)
    today = datetime.date.today()
    plan = plan_today(posts, perf, today)
    save_perf(perf)
    text = summary(perf, plan, posts)
    print(text)
    if not os.environ.get("NO_SEND"):
        try:
            import yt_report
            yt_report.send_telegram(text)
        except Exception as e:
            print("telegram:", e)
