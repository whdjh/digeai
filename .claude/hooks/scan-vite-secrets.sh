#!/usr/bin/env bash
# PreToolUse 훅: VITE_ prefix가 시크릿 이름에 붙는 것을 차단.
# Vite는 VITE_* 변수를 빌드 시 클라이언트 번들에 그대로 인라인하므로
# 시크릿이 DevTools에서 누구나 조회 가능해진다 (CLAUDE.md '환경변수/시크릿' 섹션).

set -e

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')

# 문서·예제·훅 자체는 패턴 설명을 위해 통과
case "$file_path" in
  *.md|*/.env.example|*/.claude/hooks/*) exit 0 ;;
esac

# VITE_ + 시크릿 이름 패턴 검사
if echo "$content" | grep -qE 'VITE_(GEMINI|RESEND|TURSO_AUTH|[A-Z_]*_API_KEY|[A-Z_]*_SECRET|[A-Z_]*_TOKEN)\b'; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "🚨 시크릿에 VITE_ prefix 금지. Vite는 VITE_* 변수를 클라이언트 번들에 인라인하므로 DevTools로 누구나 조회 가능. 시크릿은 Netlify Functions 또는 GitHub Actions에서 process.env로만 읽어야 함. (CLAUDE.md '환경변수/시크릿' 섹션 참조)"
  }
}
EOF
  exit 0
fi

exit 0
