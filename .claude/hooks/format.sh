#!/usr/bin/env bash
# PostToolUse (Edit|Write): formatiert die gerade bearbeitete Datei mit Prettier
# und prüft Kommentare auf ae/oe/ue statt Umlauten. Exit 2 gibt die Treffer an Claude zurück.
file=$(jq -r '.tool_input.file_path // empty')

case "$file" in
  *.ts | *.tsx | *.js | *.mjs | *.mts | *.json | *.scss | *.css | *.md) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" || exit 0
pnpm exec prettier --write --ignore-unknown "$file" > /dev/null 2>&1

case "$file" in
  *.ts | *.tsx | *.js | *.mjs | *.mts | *.scss | *.css)
    node .claude/hooks/umlaute-check.mjs "$file" || exit 2
    ;;
esac
exit 0
