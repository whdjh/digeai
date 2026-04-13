#!/usr/bin/env bash
# Claude Code 상태줄: 프로젝트명 · 모델 · 브랜치
input=$(cat)
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // "."')
model=$(echo "$input" | jq -r '.model.display_name // .model.id // "Claude"')

branch=""
if [ -d "$cwd/.git" ]; then
  branch=$(cd "$cwd" 2>/dev/null && git branch --show-current 2>/dev/null || echo "")
fi

if [ -n "$branch" ]; then
  printf "📰 digeai · %s · ⎇ %s" "$model" "$branch"
else
  printf "📰 digeai · %s" "$model"
fi
