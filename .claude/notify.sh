#!/bin/bash
# Distinct, persistent notification per case. $1 selects which:
#   permission -> GROUP A: Claude is blocked, needs a decision
#   done       -> GROUP B: Claude finished its turn, it's your turn (default)
#   auto       -> inspect the Notification payload on stdin and pick the case
#
# A backgrounded "nagger" re-alerts until VS Code is the frontmost app (you're
# back / came to answer). Sound plays once; re-alerts are silent. If VS Code is
# already frontmost, it doesn't notify at all.

CASE="$1"
NAG_PID_FILE="/tmp/claude-notify-nag.pid"

# auto: decide from the Notification event's JSON payload (read from stdin).
if [ "$CASE" = "auto" ]; then
  payload="$(cat)"
  echo "$(date '+%Y-%m-%d %H:%M:%S') $payload" >> /tmp/claude-notify.log
  msg="$(printf '%s' "$payload" | tr '[:upper:]' '[:lower:]')"
  case "$msg" in
    *waiting*|*idle*)        CASE="skip" ;;        # idle -> ignore (no re-ping; Stop already covered "done")
    *permission*|*approve*)  CASE="skip" ;;        # tool permission -> PermissionRequest handles it
    *)                       CASE="permission" ;;  # plan approval / question / other -> group A
  esac
fi

# skip: another hook owns this one — leave any running nagger alone.
[ "$CASE" = "skip" ] && exit 0

# Replace any previous nagger before starting a new one.
if [ -f "$NAG_PID_FILE" ]; then
  kill "$(cat "$NAG_PID_FILE")" 2>/dev/null
  rm -f "$NAG_PID_FILE"
fi

case "$CASE" in
  permission) SUBT="Action needed"; MSG="Claude needs your input to continue."; SOUND="Funk" ;;
  *)          SUBT="Done";          MSG="Task complete, your turn.";            SOUND="Glass" ;;
esac

# Detached nagger: alert now (with sound), then re-alert silently every few
# seconds until VS Code is frontmost, capped at ~1h.
NAG_SUBT="$SUBT" NAG_MSG="$MSG" NAG_SOUND="$SOUND" nohup bash -c '
  notify() { /usr/bin/osascript -e "display notification \"$NAG_MSG\" with title \"Claude Code\" subtitle \"$NAG_SUBT\"" 2>/dev/null; }
  in_vscode() {
    fm="$(/usr/bin/osascript -e "tell application \"System Events\" to name of first process whose frontmost is true" 2>/dev/null)"
    case "$fm" in Code|"Code - Insiders"|Cursor|"Code Helper"|Electron) return 0 ;; *) return 1 ;; esac
  }
  in_vscode && exit 0
  notify
  /usr/bin/afplay "/System/Library/Sounds/$NAG_SOUND.aiff" 2>/dev/null
  for i in $(seq 1 600); do
    sleep 6
    in_vscode && exit 0
    notify
  done
' >/dev/null 2>&1 &
echo $! > "$NAG_PID_FILE"
