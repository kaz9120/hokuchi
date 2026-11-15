#!/bin/bash
# studio をログイン時に常駐させる (launchd の LaunchAgent)。ターミナルを開かずに使うため。
#   install-launchd.sh             入れる (入っていれば入れ直す)
#   install-launchd.sh --status    状態を見る
#   install-launchd.sh --uninstall 外す
#   install-launchd.sh --restart   立て直す (studio のコードを直したあと)。走っている Claude の作業が終わるまで待ってから立て直す
set -euo pipefail
LABEL=com.kaz9120.hokuchi-studio
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
LOG="$HOME/Library/Logs/hokuchi-studio.log"
DOMAIN="gui/$(id -u)"

case "${1:-}" in
  --status) launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -E 'state|pid|last exit' || echo "入っていません"; exit 0 ;;
  --uninstall) launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "外しました"; exit 0 ;;
  --restart)
    PORT="${HOKUCHI_STUDIO_PORT:-5300}"
    while :; do
      n=$(curl -s "http://localhost:$PORT/api/health" | sed -n 's/.*"running":\([0-9]*\).*/\1/p')
      [ -z "$n" ] || [ "$n" = "0" ] && break
      echo "Claude の作業が $n 件走っています。終わるのを待っています…"; sleep 15
    done
    launchctl kickstart -k "$DOMAIN/$LABEL"; echo "立て直しました"; exit 0 ;;
esac

NODE="$(command -v node)"
CLAUDE="$(command -v claude || true)"
[ -z "$CLAUDE" ] && { echo "claude が見つかりません。Claude Code を入れてから実行してください" >&2; exit 1; }
# launchd はログインシェルの PATH を引き継がないので、node・claude・bun・git の場所を渡す
PATHS="$(dirname "$NODE"):$(dirname "$CLAUDE"):$(dirname "$(command -v bun || echo /usr/local/bin/bun)"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--experimental-strip-types</string>
    <string>--disable-warning=ExperimentalWarning</string>
    <string>$REPO/apps/studio/server/main.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$PATHS</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "入れました。http://localhost:5300/ で開けます。ログは $LOG"
