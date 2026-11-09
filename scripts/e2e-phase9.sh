#!/bin/bash
# Phase 9 E2E — single batch: server → API smoke → browser UI → shutdown
cd /home/z/my-project
PASS=0; FAIL=0
ck() { if [ "$1" = "0" ]; then echo "PASS: $2"; PASS=$((PASS+1)); else echo "FAIL: $2"; FAIL=$((FAIL+1)); fi }

# ── 1. server ────────────────────────────────────────────────────────────────
pkill -f "next dev" 2>/dev/null; pkill -f "agent-browser" 2>/dev/null; sleep 1
rm -f dev.log
nohup bun run dev > /dev/null 2>&1 &
for i in $(seq 1 120); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/)
  if [ -n "$CODE" ] && [ "$CODE" != "000" ]; then echo "READY after ${i}s"; break; fi
  sleep 1
done
curl -s -o /dev/null http://127.0.0.1:3000/ # first compile
curl -s -o /dev/null http://127.0.0.1:3000/ # confirm render

# ── 2. API smoke ─────────────────────────────────────────────────────────────
CJ=/tmp/sd-cookies.txt; rm -f $CJ
LOGIN=$(curl -s -c $CJ -X POST http://127.0.0.1:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@schooldesk.ng","password":"Password123!"}')
echo "$LOGIN" | rg -q '"role":"ADMIN"'; ck $? "login as admin"

ITEMS=$(curl -s -b $CJ "http://127.0.0.1:3000/api/v1/inventory/items?pageSize=200")
echo "$ITEMS" | rg -q '"lowStock"'; ck $? "GET /inventory/items has lowStock flags"
echo "$ITEMS" | rg -q '"stockValue"'; ck $? "GET /inventory/items has stats"
echo "$ITEMS" | rg -q 'Whiteboard markers'; ck $? "seeded item visible"
ITEM_ID=$(echo "$ITEMS" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['items']; print(next(i['id'] for i in d if i['name']=='Whiteboard markers'))")

# negative: OUT more than stock
NEG=$(curl -s -b $CJ -X POST http://127.0.0.1:3000/api/v1/inventory/movements -H "Content-Type: application/json" -d "{\"itemId\":\"$ITEM_ID\",\"type\":\"OUT\",\"quantity\":9999,\"date\":\"$(date +%F)\"}")
echo "$NEG" | rg -q 'Cannot issue'; ck $? "over-issue rejected with clear error"

# IN movement raises stock
BEFORE=$(echo "$ITEMS" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['items']; print(next(i['stockQty'] for i in d if i['name']=='Whiteboard markers'))")
IN=$(curl -s -b $CJ -X POST http://127.0.0.1:3000/api/v1/inventory/movements -H "Content-Type: application/json" -d "{\"itemId\":\"$ITEM_ID\",\"type\":\"IN\",\"quantity\":10,\"unitCost\":45000,\"reason\":\"E2E purchase\",\"date\":\"$(date +%F)\"}")
echo "$IN" | rg -q '"stockQty"' ; ck $? "IN movement returns new stock"
AFTER=$(echo "$IN" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(d['stockQty'])")
[ "$AFTER" -eq "$((BEFORE+10))" ]; ck $? "stock incremented $BEFORE → $AFTER"

BOOKS=$(curl -s -b $CJ "http://127.0.0.1:3000/api/v1/library/books?pageSize=200")
echo "$BOOKS" | rg -q 'Things Fall Apart'; ck $? "seeded book visible"
BOOK_ID=$(echo "$BOOKS" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['items']; print(next(b['id'] for b in d if b['title']=='Things Fall Apart' and b['availableCopies']>0))")
STUDENT_ID=$(curl -s -b $CJ "http://127.0.0.1:3000/api/v1/students?status=ACTIVE&pageSize=5" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['items'][0]['id'])")

LOANS=$(curl -s -b $CJ "http://127.0.0.1:3000/api/v1/library/loans?pageSize=50")
echo "$LOANS" | rg -q 'OVERDUE'; ck $? "seeded overdue loan flagged"

# issue → return cycle
DUE=$(date -d "+7 days" +%F 2>/dev/null || date -v+7d +%F)
ISSUE=$(curl -s -b $CJ -X POST http://127.0.0.1:3000/api/v1/library/loans -H "Content-Type: application/json" -d "{\"bookId\":\"$BOOK_ID\",\"borrowerType\":\"STUDENT\",\"borrowerId\":\"$STUDENT_ID\",\"dueDate\":\"$DUE\"}")
echo "$ISSUE" | rg -q '"status":"ISSUED"'; ck $? "issue loan creates ISSUED row"
LOAN_ID=$(echo "$ISSUE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")
RET=$(curl -s -b $CJ -X PATCH "http://127.0.0.1:3000/api/v1/library/loans/$LOAN_ID/return" -H "Content-Type: application/json" -d '{}')
echo "$RET" | rg -q '"fineAmount":0'; ck $? "on-time return → no fine"
echo "$RET" | rg -q '"status":"RETURNED"'; ck $? "return flips status"

# double return blocked
RET2=$(curl -s -b $CJ -X PATCH "http://127.0.0.1:3000/api/v1/library/loans/$LOAN_ID/return" -H "Content-Type: application/json" -d '{}')
echo "$RET2" | rg -q 'already been returned'; ck $? "double return rejected"

# RBAC: teacher (library.write absent) cannot issue
rm -f /tmp/sd-teacher.txt
curl -s -c /tmp/sd-teacher.txt -X POST http://127.0.0.1:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"tunde@schooldesk.ng","password":"Password123!"}' > /dev/null
FORBID=$(curl -s -b /tmp/sd-teacher.txt -X POST http://127.0.0.1:3000/api/v1/library/loans -H "Content-Type: application/json" -d "{\"bookId\":\"$BOOK_ID\",\"borrowerType\":\"STUDENT\",\"borrowerId\":\"$STUDENT_ID\",\"dueDate\":\"$DUE\"}")
echo "$FORBID" | rg -q 'Missing permission|FORBIDDEN'; ck $? "RBAC blocks teacher from issuing"

# ── 3. browser UI ────────────────────────────────────────────────────────────
AB="agent-browser"
$AB cookies clear > /dev/null 2>&1
$AB open http://127.0.0.1:3000/ > /dev/null 2>&1
sleep 2
$AB eval "fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@schooldesk.ng',password:'Password123!'})}).then(r=>r.status)" > /tmp/ab-login.txt 2>&1
grep -q "200" /tmp/ab-login.txt; ck $? "browser login via fetch"
$AB reload > /dev/null 2>&1; sleep 4

$AB eval "window.location.hash = '#/inventory'; 'ok'" > /dev/null 2>&1
sleep 4
$AB eval "document.body.innerText" > /tmp/ab-inv.txt 2>&1
grep -q "Inventory" /tmp/ab-inv.txt; ck $? "inventory page renders"
grep -qi "Items tracked" /tmp/ab-inv.txt; ck $? "inventory stats visible"
grep -q "Box of Chalk" /tmp/ab-inv.txt; ck $? "item rows visible (page 1)"
grep -qi "Low stock" /tmp/ab-inv.txt; ck $? "low stock badge visible"

$AB eval "window.location.hash = '#/library'; 'ok'" > /dev/null 2>&1
sleep 4
$AB eval "document.body.innerText" > /tmp/ab-lib.txt 2>&1
grep -q "Catalogue" /tmp/ab-lib.txt; ck $? "library page renders"
grep -q "Things Fall Apart" /tmp/ab-lib.txt; ck $? "book rows visible"
grep -qi "Titles catalogued" /tmp/ab-lib.txt; ck $? "library stats visible"

# switch to the Issued books tab (snapshot format: - tab "Label" [ref=eN])
$AB snapshot -i > /tmp/ab-lib-i.txt 2>&1
TABREF=$(rg '"Issued books"' /tmp/ab-lib-i.txt | rg -o 'ref=[A-Za-z0-9_-]+' | head -1 | sed 's/ref=//')
if [ -n "$TABREF" ]; then
  $AB click "@$TABREF" > /dev/null 2>&1; sleep 2
  $AB eval "document.body.innerText" > /tmp/ab-loans.txt 2>&1
  grep -qi "Issue book" /tmp/ab-loans.txt; ck $? "issue action visible on loans tab"
  grep -qi "OVERDUE" /tmp/ab-loans.txt; ck $? "overdue loan flagged in UI"
  REF=$(rg '"Issue book"' /tmp/ab-lib-i.txt 2>/dev/null | rg -o 'ref=[A-Za-z0-9_-]+' | head -1 | sed 's/ref=//')
  # re-snapshot after tab switch for fresh refs
  $AB snapshot -i > /tmp/ab-loans-i.txt 2>&1
  REF=$(rg '"Issue book"' /tmp/ab-loans-i.txt | rg -o 'ref=[A-Za-z0-9_-]+' | head -1 | sed 's/ref=//')
  if [ -n "$REF" ]; then
    $AB click "@$REF" > /dev/null 2>&1; sleep 1.5
    $AB eval "document.body.innerText" > /tmp/ab-issue.txt 2>&1
    grep -qi "Issue a book" /tmp/ab-issue.txt; ck $? "issue dialog opens"
    grep -qi "Return due date" /tmp/ab-issue.txt; ck $? "issue dialog shows due date"
    $AB press Escape > /dev/null 2>&1
  else
    echo "FAIL: could not resolve Issue book ref"; FAIL=$((FAIL+1))
  fi
else
  echo "FAIL: could not resolve Issued books tab ref"; FAIL=$((FAIL+1))
fi

$AB errors > /tmp/ab-err.txt 2>&1
if rg -qi "error" /tmp/ab-err.txt 2>/dev/null; then echo "--- browser errors ---"; cat /tmp/ab-err.txt | head -10; else echo "PASS: no browser page errors"; PASS=$((PASS+1)); fi

# ── 4. shutdown ──────────────────────────────────────────────────────────────
$AB close > /dev/null 2>&1
pkill -f "next dev" 2>/dev/null
echo "=============================="
echo "PASS=$PASS FAIL=$FAIL"
tail -5 dev.log
