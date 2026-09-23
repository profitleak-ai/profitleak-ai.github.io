#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
أول دفعة بينتوريست: بن صورة + بن فيديو لبينتوريست فقط.
لا يلمس تلغرام إطلاقًا → صفر خطر لتكرار منشور في القناة.
"""
import os, sys, datetime, ssl, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import post as P

SITE = os.environ.get("SITE", "https://profitleakaii.qd.je")
NTFY = os.environ.get("NTFY_TOPIC", "profitleak-alerts-34d2c8377c")
ctx = ssl.create_default_context()


def envflag(k):
    return os.environ.get(k, "").strip().lower() in ("1", "true", "yes", "on")


def notify(msg):
    try:
        req = urllib.request.Request(f"https://ntfy.sh/{NTFY}", data=msg.encode("utf-8"), method="POST",
                                     headers={"Title": "ProfitLeak - أول بن على بينتوريست", "Tags": "pushpin"})
        return urllib.request.urlopen(req, timeout=25, context=ctx).status == 200
    except Exception:
        return False


def main():
    cal = P.load()
    posts = cal["posts"]
    today = datetime.date.today()
    idx = int(os.environ.get("INDEX") or P.pick_index(posts, today))
    p = posts[idx % len(posts)]
    cover = f"{SITE}/pinterest/{p['id']}.jpg"
    print(f"🚀 أول دفعة بينتوريست — المنشور #{p['id']} ({p.get('theme','')})")

    results = [("بينتوريست (بن صورة)",) + P.to_pinterest(p, cover)]
    try:
        import make_video as mv
        path, size, n = mv.make_video(p)
        print(f"🎬 الفيديو جاهز ({size/1048576:.1f} MB · {n} إطار)")
        results.append(("بينتوريست (بن فيديو)",) +
                       P.pinterest_video_pin(p, os.environ.get("PINTEREST_BOARD_ID", ""), cover, path))
    except Exception as e:
        print("⚠️ تعذّر توليد الفيديو:", str(e)[:120])

    print("\n" + "=" * 60)
    ok_all = True
    for name, ok, note in results:
        ok_all = ok_all and ok is True
        print(("✅ " if ok else ("⚪ " if ok is None else "❌ ")) + f"{name}: {note}")
    print("=" * 60)

    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ:
        with open(summ, "a", encoding="utf-8") as f:
            f.write(f"## 🚀 أول دفعة بينتوريست — #{p['id']}\n\n")
            for name, ok, note in results:
                f.write(f"- {'✅' if ok else ('⚪' if ok is None else '❌')} {name}: {note}\n")

    if ok_all and not envflag("SKIP_NTFY"):
        notify("نُشر أول بن صورة + بن فيديو على لوحة ProfitLeak AI ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
