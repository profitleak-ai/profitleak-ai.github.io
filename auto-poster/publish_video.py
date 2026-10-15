#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
يولّد فيديو اليوم (1080×1920) وينشره تلقائيًا:
  📲 تلغرام (فيديو مباشر) · 📌 بينتوريست (بن فيديو — رفع مباشر) · 🔔 إشعار للهاتف
لا يحتاج أي استضافة: الفيديو يُرفع مباشرة إلى كل منصة.
"""
import os, sys, json, base64, ssl, urllib.request, urllib.error, urllib.parse, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_video as mv
import post as P

ctx = ssl.create_default_context()
OUT = mv.OUT
SITE = os.environ.get("SITE", "https://profitleakaii.qd.je").rstrip("/")


def notify(p, ok_list):
    body = (f"🎬 فيديو اليوم جاهز ونُشر:\n#{p['id']} — {p['theme']}\n\n" +
            "\n".join(f"{'✅' if ok else ('⚪' if ok is None else '❌')} {name}: {note}" for name, ok, note in ok_list))
    headers = {"Title": f"ProfitLeak - Daily Video #{p['id']}", "Tags": "movie_camera",
               "Actions": json.dumps([{"action": "view", "label": "Open site", "url": SITE + "/?ref=video"}])}
    req = urllib.request.Request(f"https://ntfy.sh/{P.NTFY}", data=body.encode("utf-8"), headers=headers, method="POST")
    try:
        return urllib.request.urlopen(req, timeout=30, context=ctx).status == 200
    except Exception:
        return False


def _plan_slot(posts, today, slot):
    """يقرأ خطة اليوم من محرّك التعلّم (yt_perf.json)؛ يبنيها إن لم تكن موجودة"""
    try:
        import yt_learn
        perf = yt_learn.load_perf()
        if perf.get("plan", {}).get("date") != today.isoformat():
            perf = yt_learn.analyze(posts)
            yt_learn.plan_today(posts, perf, today)
            yt_learn.save_perf(perf)
        for ps in perf.get("plan", {}).get("slots", []):
            if ps["slot"] == slot:
                return ps
    except Exception as e:
        print("⚪ خطة التعلّم غير متاحة:", str(e)[:120])
    return None


def _record_upload(p, note, template):
    """يسجّل الرفع في yt_perf.json ليُقاس أداؤه لاحقًا"""
    try:
        import re, yt_learn
        m = re.search(r"shorts/([\w-]+)", note or "")
        if not m:
            return
        perf = yt_learn.load_perf()
        perf.setdefault("uploads", []).append(dict(video_id=m.group(1), post_id=p["id"], hook=(p.get("video") or {}).get("hook", ""),
                                                   template=template or "", date=(os.environ.get("YT_PUBLISH_AT", "")[:10] or datetime.date.today().isoformat()), source="auto"))
        yt_learn.save_perf(perf)
    except Exception as e:
        print("⚪ تسجيل الرفع:", str(e)[:100])


def envflag(k):
    """يقرأ متغيّرًا منطقيًا بأمان: "false"/""/"0" كلها = معطّل"""
    return os.environ.get(k, "").strip().lower() in ("1", "true", "yes", "on")


def main():
    cal = P.load()
    posts = cal["posts"]
    today = datetime.date.today()
    # جدول الشورتس: 3 حصص يوميًا (0=10:00 عربي · 1=13:00 إنجليزي · 2=18:00 عربي)
    # يغطي كل المنشورات العربية (20) والإنجليزية (10) خلال 10 أيام دون تكرار داخل الدورة
    slot = os.environ.get("SHORT_SLOT", "").strip()
    if os.environ.get("INDEX"):
        idx = int(os.environ["INDEX"]) % len(posts); slot_key = "video"
        if os.environ.get("HOOK", "").strip():
            posts[idx].setdefault("video", {})["hook"] = os.environ["HOOK"].strip()
    elif slot in ("0", "1", "2") and _plan_slot(posts, today, int(slot)):
        slot = int(slot)
        ps = _plan_slot(posts, today, slot)
        idx = ps["index"] % len(posts)
        posts[idx].setdefault("video", {})["hook"] = ps["hook"]          # الخطّاف المختار من محرّك التعلّم
        if ps.get("template") and not os.environ.get("VIDEO_TEMPLATE"):
            os.environ["VIDEO_TEMPLATE"] = ps["template"]
        slot_key = "video" if slot == 1 else f"video_s{slot}"
        print(f"🧠 خطة التعلّم: الحصة {slot} → #{posts[idx]['id']} · «{ps['hook']}» · {ps.get('template')} — {ps.get('reason','')}")
    elif slot in ("0", "1", "2"):
        slot = int(slot)
        d = max((today - datetime.date(2026, 10, 12)).days, 0)
        ar = [i for i, x in enumerate(posts) if x.get("lang", "ar") != "en"]
        en = [i for i, x in enumerate(posts) if x.get("lang") == "en"] or ar
        idx = en[d % len(en)] if slot == 1 else ar[(2 * d + (0 if slot == 0 else 1)) % len(ar)]
        slot_key = "video" if slot == 1 else f"video_s{slot}"
    else:
        offset = int(os.environ.get("SHORT_OFFSET") or 0)
        idx = (P.pick_index(posts, today) + offset) % len(posts)
        slot_key = "video" if offset == 0 else f"video_{offset}"
    p = posts[idx]

    # ── حماية من التكرار: فيديو واحد يوميًا ──
    STATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "state.json")
    today_s = today.isoformat()
    stt = {}
    if os.path.exists(STATE):
        try:
            stt = json.load(open(STATE, encoding="utf-8"))
        except Exception:
            stt = {}
    if stt.get(slot_key) == today_s and not envflag("FORCE_VIDEO"):
        print(f"⏭  نُشر فيديو هذه الحصة ({slot_key} · {today_s}) مسبقًا — تخطي (FORCE_VIDEO لإعادة النشر)")
        return 0

    print(f"🎬 توليد فيديو المنشور #{p['id']} — {p['theme']}")
    path, size, n = mv.make_video(p)
    print(f"✅ الفيديو: {path} ({size/1048576:.1f} MB · {n} إطار)")

    cover = f"{SITE}/pinterest/{p['id']}.jpg"
    results = []
    if envflag("SKIP_TELEGRAM"):
        print("🧪 اختبار: تجاهُل تلغرام (لا منشور)")
    else:
        results.append(("تلغرام (فيديو)",) + P.telegram_video(p, path))
    if envflag("SKIP_YOUTUBE"):
        print("🧪 اختبار: تجاهُل يوتيوب")
    else:
        try:
            import youtube as YT
            yt_ok, yt_note = YT.upload(p, path)
            results.append(("يوتيوب شورتس", yt_ok, yt_note))
            if yt_ok:
                _record_upload(p, yt_note, os.environ.get("VIDEO_TEMPLATE", ""))
                if "تعليق" in (yt_note or ""):
                    try:
                        import yt_learn; perf = yt_learn.load_perf(); perf["uploads"][-1]["commented"] = datetime.date.today().isoformat(); yt_learn.save_perf(perf)
                    except Exception:
                        pass
        except Exception as e:
            results.append(("يوتيوب شورتس", False, f"خطأ: {str(e)[:150]}"))
    if envflag("SKIP_PINTEREST") or not os.environ.get("PINTEREST_TOKEN"):
        print("⚪ بينتوريست: متجاوَز في هذه الحصة")
    else:
        results.append(("بينتوريست (بن فيديو)",) + P.pinterest_video_pin(p, os.environ.get("PINTEREST_BOARD_ID", ""), cover, path))
    if not envflag("SKIP_PINTEREST") and os.environ.get("PINTEREST_BOARD_ID") and results and results[-1][0].startswith("بينتوريست") and results[-1][1] is not True:
        # احتياط: بن صورة إن فشل الفيديو
        pin_media = f"{SITE}/pinterest/{p['id']}.jpg"
        results.append(("بينتوريست (بن صورة — احتياط)",) + P.to_pinterest(p, pin_media))

    print("\n" + "=" * 60)
    for name, ok, note in results:
        print(("✅ " if ok else ("⚪ " if ok is None else "❌ ")) + f"{name}: {note}")
    print("=" * 60)

    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ:
        with open(summ, "a", encoding="utf-8") as f:
            f.write(f"## 🎬 فيديو اليوم — #{p['id']} ({p['theme']})\n\n")
            for name, ok, note in results:
                f.write(f"- {'✅' if ok else ('⚪' if ok is None else '❌')} {name}: {note}\n")
    # حفظ حالة اليوم (لمنع تكرار الفيديو)
    stt[slot_key] = today_s
    try:
        json.dump(stt, open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"💾 حُفظت الحالة: {slot_key}={today_s}")
    except Exception as e:
        print("⚠️ تعذّر حفظ الحالة:", str(e)[:80])

    if envflag("SKIP_NTFY"):
        print("🧪 اختبار: تجاهُل إشعار الهاتف")
    else:
        notify(p, results)
    return 0


SLOT_UTC_HOURS = {0: 9, 1: 12, 2: 17}     # 10:00 · 13:00 · 18:00 بتوقيت المغرب


def due_slots():
    """الحصص التي حان وقتها اليوم ولم تُنشر بعد (تعويض تلقائي لأي تأخير في جدولة GitHub)"""
    STATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "state.json")
    try:
        stt = json.load(open(STATE, encoding="utf-8"))
    except Exception:
        stt = {}
    now = datetime.datetime.now(datetime.timezone.utc)
    today_s = now.date().isoformat()
    if stt.get("prescheduled_until", "") >= today_s:
        print(f"📅 اليوم مغطّى بفيديوهات مجدولة مسبقًا (حتى {stt['prescheduled_until']}) — لا نشر إضافي")
        return []
    out = []
    for slot, h in SLOT_UTC_HOURS.items():
        key = "video" if slot == 1 else f"video_s{slot}"
        if now.hour >= h and stt.get(key) != today_s:
            out.append(slot)
    return out


def comment_when_live():
    """للفيديوهات المجدولة: يضيف التعليق الأول بالرابط فور أن تصبح عامة (لا يمكن التعليق وهي خاصة)"""
    try:
        import yt_learn, youtube as YT
        perf = yt_learn.load_perf()
        pend = [u for u in perf.get("uploads", []) if not u.get("commented") and not str(u.get("video_id", "")).startswith("planned")]
        if not pend:
            return
        tok, _ = YT.access_token()
        if not tok:
            return
        stats, _ = yt_learn.fetch_stats([u["video_id"] for u in pend])
        posts = {p["id"]: p for p in P.load()["posts"]}
        for u in pend:
            st = stats.get(u["video_id"])
            if not st:
                u["commented"] = "missing"; continue
            if st.get("privacy") != "public":
                continue
            p = posts.get(u["post_id"])
            if p and YT.first_comment(tok, u["video_id"], p, "en" if p.get("lang") == "en" else "ar"):
                u["commented"] = datetime.date.today().isoformat()
                print(f"💬 تعليق الرابط أُضيف: {u['video_id']} (#{u['post_id']})")
            else:
                u["commented"] = "failed"
        yt_learn.save_perf(perf)
    except Exception as e:
        print("⚪ تعليقات الفيديوهات المجدولة:", str(e)[:120])


if __name__ == "__main__":
    if envflag("SLOT_AUTO"):
        comment_when_live()
        due = due_slots()
        _now = datetime.datetime.now(datetime.timezone.utc)
        if _now.hour >= 22 and due:
            # تنبيه نهاية اليوم: ما زالت حصص ناقصة رغم محاولات التعويض
            try:
                import yt_report
                yt_report.send_telegram(f"⚠️ تنبيه: نُشر اليوم {3 - len(due)} من 3 شورتس فقط — الحصص الناقصة {due}. سأحاول الآن مرة أخيرة.")
            except Exception:
                pass
        if not due:
            print("✅ لا حصص مستحقة الآن — كل فيديوهات اليوم حتى هذه الساعة منشورة")
            sys.exit(0)
        print(f"⏰ الحصص المستحقة: {due}")
        rc = 0
        for sl in due:
            os.environ["SHORT_SLOT"] = str(sl)
            os.environ.pop("VIDEO_TEMPLATE", None)
            try:
                rc |= (main() or 0)
            except Exception as e:
                print(f"❌ الحصة {sl} فشلت:", str(e)[:200]); rc = 1
        sys.exit(rc)
    sys.exit(main())
