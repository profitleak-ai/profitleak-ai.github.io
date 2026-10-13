#!/usr/bin/env bash
# حفظ state.json بأمان: يدمج مفاتيحنا الجديدة فوق أحدث نسخة من GitHub (لا تعارضات ولو تزامنت المهام)
set -e
cd "$(git rev-parse --show-toplevel)"
cp auto-poster/state.json /tmp/new_state.json 2>/dev/null || exit 0
git config user.name  "ProfitLeak Auto-Poster"
git config user.email "autoposter@profitleakaii.qd.je"
for attempt in 1 2 3 4 5; do
  git fetch -q origin main
  git checkout -q -f origin/main -- auto-poster/state.json 2>/dev/null || true
  python3 - <<'PY'
import json, re
def load(p):
    try:
        t = open(p, encoding="utf-8").read()
        t = re.sub(r"^(<<<<<<<|=======|>>>>>>>).*$", "", t, flags=re.M)   # تنظيف أي علامات تعارض قديمة
        return json.loads(t)
    except Exception:
        return {}
remote, new = load("auto-poster/state.json"), load("/tmp/new_state.json")
remote.update(new)
json.dump(remote, open("auto-poster/state.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
  if git diff --quiet -- auto-poster/state.json; then echo "لا جديد لحفظه"; exit 0; fi
  git add auto-poster/state.json
  git commit -q -m "auto-poster: state $(date -u +%FT%H:%MZ)" || true
  if git push -q origin HEAD:main 2>/dev/null; then echo "💾 state.json محفوظ"; exit 0; fi
  echo "↻ تعارض دفع — إعادة المحاولة $attempt"; git reset -q --soft origin/main; sleep $((attempt*7))
done
echo "⚠️ تعذّر حفظ الحالة بعد 5 محاولات"; exit 0
