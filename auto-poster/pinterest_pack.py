#!/usr/bin/env python3
"""بث يومي على ntfy: صورة Pinterest جاهزة + عنوان + وصف — تلصقينها يدويًا في 20 ثانية (مجاني، رسمي).
يعمل حتى يكتمل trial access في Pinterest، ثم ينتقل النشر تلقائيًا عبر API."""
import json, os, sys, urllib.request, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import post as P

NTFY = os.environ.get("NTFY_TOPIC", "profitleak-alerts-34d2c8377c")


def send(body, img_url, link, p):
    payload = {
        "topic": NTFY,
        "message": body,
        "title": f"📌 Pinterest Manual — المنشور #{p['id']} ({p['theme']})",
        "tags": ["memo", "pin"],
        "attach": img_url,
        "filename": f"pin-{p['id']}.jpg",
        "actions": [{"action": "view", "label": "افتح Pinterest", "url": "https://www.pinterest.com/pin-builder/"},
                     {"action": "view", "label": "افتح موقعك", "url": link}],
    }
    req = urllib.request.Request(
        f"https://ntfy.sh/{NTFY}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    urllib.request.urlopen(req, timeout=20)


def main():
    cal = P.load()
    posts = cal["posts"]
    idx = int(os.environ.get("INDEX") or P.pick_index(posts, datetime.date.today()))
    p = posts[idx % len(posts)]
    title, desc = P.render(p, "pinterest")
    pin_img = f"{P.MEDIA_BASE.rstrip('/')}/pinterest/{p['id']}.jpg"
    link = P.link("pinterest")
    body = (
        "📌 بينتوريست يدوي — جاهز للّصق (أقل من دقيقة)\n\n"
        "1️⃣ افتحي Pinterest → + → Create Pin\n"
        "2️⃣ ارفعي الصورة المرفقة (أو الرابط أدناه)\n"
        f"{pin_img}\n\n"
        "3️⃣ العنوان — انسخي والصقي:\n"
        f"{title}\n\n"
        "4️⃣ الوصف — انسخي والصقي:\n"
        f"{desc}\n\n"
        "5️⃣ الرابط الوجهة:\n"
        f"{link}\n\n"
        "6️⃣ اللوحة: ProfitLeak AI → نشر ✅\n\n"
        "💡 سأستمر بإرسال هذه الحزمة يوميًا حتى يكتمل تفعيل التطبيق، فيصبح النشر تلقائيًا."
    )
    send(body, pin_img, link, p)
    print("✅ أُرسلت حزمة البن إلى هاتفك")


if __name__ == "__main__":
    main()
