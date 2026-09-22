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


def main():
    cal = P.load()
    posts = cal["posts"]
    today = datetime.date.today()
    idx = int(os.environ.get("INDEX") or P.pick_index(posts, today))
    p = posts[idx % len(posts)]
    print(f"🎬 توليد فيديو المنشور #{p['id']} — {p['theme']}")
    path, size, n = mv.make_video(p)
    print(f"✅ الفيديو: {path} ({size/1048576:.1f} MB · {n} إطار)")

    cover = f"{SITE}/pinterest/{p['id']}.jpg"
    results = []
    results.append(("تلغرام (فيديو)",) + P.telegram_video(p, path))
    results.append(("بينتوريست (بن فيديو)",) + P.pinterest_video_pin(p, os.environ.get("PINTEREST_BOARD_ID", ""), cover, path))
    if os.environ.get("PINTEREST_BOARD_ID") and results[-1][1] is not True:
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
    notify(p, results)
    return 0


if __name__ == "__main__":
    sys.exit(main())
