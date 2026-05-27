#!/usr/bin/env bash

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL="http://localhost:2345/api/v1"
TOURNAMENT_ID="11c441e8-4d23-4cfa-a67b-fb196be6f09e"
# ─────────────────────────────────────────────────────────────────────────────

# Colour helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}==>${RESET} $*"; }
success() { echo -e "${GREEN}✓${RESET}  $*"; }
fail()    { echo -e "${RED}✗  $*${RESET}"; exit 1; }
section() { echo -e "\n${BOLD}${YELLOW}── $* ──${RESET}"; }

require_jq() {
  if ! command -v jq &>/dev/null; then
    fail "jq is required but not installed. Run: brew install jq"
  fi
}

require_jq

# ── 1. Register ───────────────────────────────────────────────────────────────
section "Register"

TIMESTAMP=$(date +%s)
EMAIL="testuser_${TIMESTAMP}@arena.test"
USERNAME="tester_${TIMESTAMP}"
PASSWORD="TestPass123!"

info "Email: $EMAIL"

REGISTER_RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}")

REGISTER_BODY=$(echo "$REGISTER_RES" | sed '\$d')
REGISTER_STATUS=$(echo "$REGISTER_RES" | tail -n 1)

if [ "$REGISTER_STATUS" != "201" ]; then
  echo "$REGISTER_BODY" | jq .
  fail "Registration failed (HTTP $REGISTER_STATUS)"
fi

success "Registered (HTTP $REGISTER_STATUS)"

# ── 2. Login ──────────────────────────────────────────────────────────────────
section "Login"

LOGIN_RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

LOGIN_BODY=$(echo "$LOGIN_RES" | sed '\$d')
LOGIN_STATUS=$(echo "$LOGIN_RES" | tail -n 1)

if [ "$LOGIN_STATUS" != "200" ]; then
  echo "$LOGIN_BODY" | jq .
  fail "Login failed (HTTP $LOGIN_STATUS)"
fi

TOKEN=$(echo "$LOGIN_BODY" | jq -r '.accessToken')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  fail "No token in login response"
fi

USER_ID=$(echo "$LOGIN_BODY" | jq -r '.user.id')
success "Logged in — userId: $USER_ID"

# ── 3. Get tournament ─────────────────────────────────────────────────────────
section "Get Tournament"

TOURNAMENT_RES=$(curl -s -w "\n%{http_code}" -X GET "${BASE_URL}/tournaments/${TOURNAMENT_ID}" \
  -H "Authorization: Bearer ${TOKEN}")

TOURNAMENT_BODY=$(echo "$TOURNAMENT_RES" | sed '\$d')
TOURNAMENT_STATUS=$(echo "$TOURNAMENT_RES" | tail -n 1)

if [ "$TOURNAMENT_STATUS" != "200" ]; then
  echo "$TOURNAMENT_BODY" | jq .
  fail "Tournament fetch failed (HTTP $TOURNAMENT_STATUS)"
fi

TOURNAMENT_TITLE=$(echo "$TOURNAMENT_BODY" | jq -r '.title')
TOURNAMENT_ARENA=$(echo "$TOURNAMENT_BODY" | jq -r '.arena')
TOURNAMENT_FEE=$(echo "$TOURNAMENT_BODY" | jq -r '.entryFee')
TOURNAMENT_STATUS_VAL=$(echo "$TOURNAMENT_BODY" | jq -r '.status')

success "Found: \"$TOURNAMENT_TITLE\" | arena=$TOURNAMENT_ARENA | fee=$TOURNAMENT_FEE | status=$TOURNAMENT_STATUS_VAL"

# ── 4. Join tournament ────────────────────────────────────────────────────────
section "Join Tournament"

JOIN_RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/tournaments/${TOURNAMENT_ID}/join" \
  -H "Authorization: Bearer ${TOKEN}")

JOIN_BODY=$(echo "$JOIN_RES" | sed '\$d')
JOIN_HTTP=$(echo "$JOIN_RES" | tail -n 1)

if [ "$JOIN_HTTP" != "200" ]; then
  echo "$JOIN_BODY" | jq .
  fail "Join failed (HTTP $JOIN_HTTP)"
fi

success "Joined tournament"

# ── 5. Start game session ─────────────────────────────────────────────────────
section "Start Session"

SESSION_RES=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/game-sessions" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"tournamentId\":\"${TOURNAMENT_ID}\"}")

SESSION_BODY=$(echo "$SESSION_RES" | sed '\$d')
SESSION_HTTP=$(echo "$SESSION_RES" | tail -n 1)

if [ "$SESSION_HTTP" != "201" ]; then
  echo "$SESSION_BODY" | jq .
  fail "Start session failed (HTTP $SESSION_HTTP)"
fi

SESSION_ID=$(echo "$SESSION_BODY" | jq -r '.id')
TOTAL_QUESTIONS=$(echo "$SESSION_BODY" | jq -r '.totalQuestions')

if [ "$SESSION_ID" = "null" ] || [ -z "$SESSION_ID" ]; then
  fail "No session ID in response"
fi

success "Session started — id=$SESSION_ID | questions=$TOTAL_QUESTIONS"

# ── 6. Question loop ──────────────────────────────────────────────────────────
section "Game Loop"

CORRECT_COUNT=0
QUESTION_NUM=0

while true; do
  QUESTION_NUM=$((QUESTION_NUM + 1))
  echo -e "\n${BOLD}Q${QUESTION_NUM}/${TOTAL_QUESTIONS}${RESET}"

  # Get next question
  NEXT_RES=$(curl -s -w "\n%{http_code}" -X GET \
    "${BASE_URL}/game-sessions/${SESSION_ID}/next-question" \
    -H "Authorization: Bearer ${TOKEN}")

  NEXT_BODY=$(echo "$NEXT_RES" | sed '\$d')
  NEXT_HTTP=$(echo "$NEXT_RES" | tail -n 1)

  if [ "$NEXT_HTTP" != "200" ]; then
    echo "$NEXT_BODY" | jq .
    fail "next-question failed (HTTP $NEXT_HTTP)"
  fi

  QUESTION_ID=$(echo "$NEXT_BODY" | jq -r '.id')
  CONTENT=$(echo "$NEXT_BODY" | jq -r '.content')
  OPTIONS=$(echo "$NEXT_BODY" | jq -r '.options | to_entries | map("[\(.key)] \(.value)") | join("  ")')

  echo "   $CONTENT"
  echo -e "   ${CYAN}${OPTIONS}${RESET}"

  # Submit answer index 0 with a safe timeTakenMs (above the 2000ms anti-cheat threshold)
  ANSWER_RES=$(curl -s -w "\n%{http_code}" -X POST \
    "${BASE_URL}/game-sessions/${SESSION_ID}/answer" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"questionId\":\"${QUESTION_ID}\",\"selectedAnswer\":0,\"timeTakenMs\":3000}")

  ANSWER_BODY=$(echo "$ANSWER_RES" | sed '\$d')
  ANSWER_HTTP=$(echo "$ANSWER_RES" | tail -n 1)

  if [ "$ANSWER_HTTP" != "200" ]; then
    echo "$ANSWER_BODY" | jq .
    fail "submit-answer failed (HTTP $ANSWER_HTTP)"
  fi

  IS_CORRECT=$(echo "$ANSWER_BODY" | jq -r '.isCorrect')
  CORRECT_ANSWER=$(echo "$ANSWER_BODY" | jq -r '.correctAnswer')
  SCORE=$(echo "$ANSWER_BODY" | jq -r '.score')
  IS_FLAGGED=$(echo "$ANSWER_BODY" | jq -r '.isFlagged')
  COMPLETED=$(echo "$ANSWER_BODY" | jq -r '.completed')

  if [ "$IS_CORRECT" = "true" ]; then
    CORRECT_COUNT=$((CORRECT_COUNT + 1))
    RESULT_LABEL="${GREEN}CORRECT${RESET}"
  else
    RESULT_LABEL="${RED}WRONG${RESET} (correct was [${CORRECT_ANSWER}])"
  fi

  echo -e "   Submitted [0] → ${RESULT_LABEL} | score=${SCORE}"

  if [ "$IS_FLAGGED" = "true" ]; then
    echo -e "   ${RED}⚠ Session flagged${RESET}"
  fi

  # ── Session complete ───────────────────────────────────────────────────────
  if [ "$COMPLETED" = "true" ]; then
    FINAL_SCORE=$(echo "$ANSWER_BODY" | jq -r '.finalScore')

    echo -e "\n${BOLD}${GREEN}══════════════════════════════${RESET}"
    echo -e "${BOLD}${GREEN}   SESSION COMPLETE${RESET}"
    echo -e "${BOLD}${GREEN}══════════════════════════════${RESET}"
    echo -e "  Final score  : ${BOLD}${FINAL_SCORE} / ${TOTAL_QUESTIONS}${RESET}"
    echo -e "  Correct      : ${CORRECT_COUNT}"
    echo -e "  Wrong        : $((TOTAL_QUESTIONS - CORRECT_COUNT))"
    echo -e "  Session ID   : $SESSION_ID"
    if [ "$IS_FLAGGED" = "true" ]; then
      echo -e "  ${RED}Status       : FLAGGED — awaiting admin review${RESET}"
    else
      echo -e "  ${GREEN}Status       : CLEAN${RESET}"
    fi
    echo -e "${BOLD}${GREEN}══════════════════════════════${RESET}"
    break
  fi
done
