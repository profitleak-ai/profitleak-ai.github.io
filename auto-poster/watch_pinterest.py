#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
حارس التفعيل: يفحص كل 6 ساعات إن كان بينتوريست قد فعّل التطبيق.
• إن لم يُفعّل → صامت (بلا إزعاج)
• لحظة التفعيل → إشعار فوري على الهاتف + يجهّز اللوحة تلقائيًا
"""
import json, os, sys, ssl, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import post as P

ctx = ssl.create_default_context()
NTFY = os.environ.get("NTFY_TOPIC", "profitleak-alerts-34d2c8377c")


def notify(title, msg, prio="default", tags="bell"):
    req = urllib.request.Request(f"https://ntfy.sh/{NTFY}", data=msg.encode("utf-8"), method="POST",
                                 headers={"Title": title, "Priority": prio, "Tags": tags})
    try:
        return urllib.request.urlopen(req, timeout=25, context=ctx).status == 200
    except Exception:
        return False


def main():
    token = os.environ.get("PINTEREST_TOKEN", "")
    if not token:
        print("⚪ لا يوجد توكن بينتوريست")
        return 0
    st, out, _ = P.http("https://api.pinterest.com/v5/user_account",
                        headers={"Authorization": f"Bearer {token}", "User-Agent": "ProfitLeak/1.0"},
                        method="GET")
    if st == 200:
        try:
            acc = json.loads(out)
        except Exception:
            acc = {}
        board, note = P.pinterest_board(token)
        msg = (f"تم تفعيل بينتوريست! الحساب: {acc.get('username','?')} · "
               f"{note} · معرّف اللوحة: {board or 'غير متاح'}")
        notify("ProfitLeak - بينتوريست مُفعّل!", msg, prio="high", tags="tada,rocket")
        print("🎉 " + msg)
        print("🚀 إطلاق أول دفعة تلقائيًا (بن صورة + بن فيديو)…")
        os.system(f"python3 {os.path.join(HERE, 'first_pins.py')}")
        summ = os.environ.get("GITHUB_STEP_SUMMARY")
        if summ:
            with open(summ, "a", encoding="utf-8") as f:
                f.write("## 🎉 بينتوريست مُفعّل!\n\n" + msg + "\n")
    else:
        print(f"⏳ لم يُفعّل بعد — الحالة {st}: {out[:100]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
