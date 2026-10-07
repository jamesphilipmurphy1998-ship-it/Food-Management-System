#!/usr/bin/env bash
# Signs in to the NutriCost app as the disposable QA account and saves the session cookie to
# /tmp/qa_cookies.txt, which the spec scripts read. Run from PowerShell or Git Bash:
#   & "C:\Users\JamesMurphy\AppData\Local\Programs\Git\usr\bin\bash.exe" scripts/qa-login.sh
# It asks for the password (typed silently, never stored or printed). The account and its
# password are documented in ACCURACY-SCAN.md ("Running it", step 1).
set -u
# Launched from PowerShell, bash starts with a bare PATH: no rm, and Windows' own curl.exe would
# read /tmp as a different folder from the one the spec scripts use. Force Git's own tools.
export PATH="/mingw64/bin:/usr/bin:$PATH"

API="${NUTRICOST_API_BASE:-http://192.168.0.50:5001}"
EMAIL="${QA_EMAIL:-qa-tally-check@example.com}"
JAR=/tmp/qa_cookies.txt
RESP=/tmp/qa_login_response.txt
echo "Using: $(command -v curl)  |  session file: $(cygpath -w "$JAR" 2>/dev/null || echo "$JAR")"

read -r -s -p "Password for $EMAIL: " PW
echo
PW_JSON=${PW//\\/\\\\}
PW_JSON=${PW_JSON//\"/\\\"}
BODY=$(printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PW_JSON")
unset PW PW_JSON

LOGIN_CODE=$(curl -s -o "$RESP" -w '%{http_code}' -c "$JAR" -X POST "$API/api/auth/local/login" \
  -H "content-type: application/json" -d "$BODY")
unset BODY
echo "Login endpoint answered: HTTP $LOGIN_CODE  $(head -c 200 "$RESP" 2>/dev/null)"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$API/api/ingredients?includeUnlinked=true")
if [ "$CODE" = "200" ]; then
  echo "Signed in. Session saved to $JAR (ingredients endpoint returned HTTP 200)."
else
  rm -f "$JAR"
  echo "Sign-in did not work (ingredients endpoint returned HTTP $CODE)."
  echo "If the login answer above says the email or password is wrong, check the password."
  echo "If it says the account does not exist, tell Claude."
  exit 1
fi
