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


def gh_secret(name, value):
    """يحدّث سرّ GitHub (يحتاج GH_PAT) — لتجديد رمز بينتوريست تلقائيًا"""
    pat, repo = os.environ.get("GH_PAT", ""), os.environ.get("GITHUB_REPOSITORY", "profitleak-ai/profitleak-ai.github.io")
    if not pat:
        return False
    try:
        import base64
        from nacl import encoding, public
    except ImportError:
        return False
    st, out, _ = P.http(f"https://api.github.com/repos/{repo}/actions/secrets/public-key",
                        headers={"Authorization": f"Bearer {pat}", "User-Agent": "ProfitLeak/1.0"}, method="GET")
    if st != 200:
        return False
    pk = json.loads(out)
    sealed = public.SealedBox(public.PublicKey(pk["key"].encode(), encoding.Base64Encoder())).encrypt(value.encode())
    st2, _, _ = P.http(f"https://api.github.com/repos/{repo}/actions/secrets/{name}",
                       data={"encrypted_value": base64.b64encode(sealed).decode(), "key_id": pk["key_id"]},
                       json_body=True, method="PUT",
                       headers={"Authorization": f"Bearer {pat}", "User-Agent": "ProfitLeak/1.0", "Content-Type": "application/json"})
    return st2 in (201, 204)


def refresh_token():
    """يجدّد رمز الوصول عبر refresh_token (صالح 60 يومًا، والوصول 30 يومًا)"""
    rt, sec = os.environ.get("PINTEREST_REFRESH_TOKEN", ""), os.environ.get("PINTEREST_APP_SECRET", "")
    if not (rt and sec):
        return ""
    import base64
    auth = base64.b64encode(f"1614476:{sec}".encode()).decode()
    st, out, _ = P.http("https://api.pinterest.com/v5/oauth/token",
                        data={"grant_type": "refresh_token", "refresh_token": rt},
                        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"})
    if st != 200:
        print("⚠️ فشل تجديد الرمز:", st, out[:120])
        return ""
    d = json.loads(out)
    new = d.get("access_token", "")
    if new:
        ok = gh_secret("PINTEREST_TOKEN", new)
        if d.get("refresh_token"):
            gh_secret("PINTEREST_REFRESH_TOKEN", d["refresh_token"])
        print("🔄 جُدِّد رمز بينتوريست تلقائيًا", "وحُفظ ✅" if ok else "(لم يُحفظ — GH_PAT؟)")
    return new


def main():
    token = os.environ.get("PINTEREST_TOKEN", "")
    if not token:
        print("⚪ لا يوجد توكن بينتوريست")
        return 0
    st, out, _ = P.http("https://api.pinterest.com/v5/user_account",
                        headers={"Authorization": f"Bearer {token}", "User-Agent": "ProfitLeak/1.0"},
                        method="GET")
    # فحص صلاحية الكتابة بأمان: POST فارغ → 404 (لوحة غير موجودة) = الصلاحيات كاملة، 401 code 3 = الكتابة غير مفعّلة بعد
    stw, outw, _ = P.http("https://api.pinterest.com/v5/pins", data={}, json_body=True,
                          headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                   "User-Agent": "ProfitLeak/1.0"})
    can_write = stw not in (401, 403)
    if st == 401 and os.environ.get("PINTEREST_REFRESH_TOKEN"):
        token = refresh_token() or token
        st, out, _ = P.http("https://api.pinterest.com/v5/user_account",
                            headers={"Authorization": f"Bearer {token}", "User-Agent": "ProfitLeak/1.0"}, method="GET")
    if st == 200 and not can_write:
        print(f"⏳ القراءة تعمل، لكن الكتابة غير مفعّلة بعد — {stw}: {outw[:140]}")
        return 0
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
