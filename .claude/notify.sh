#!/bin/bash
# Per-session, persistent notifications. $1 selects the case:
#   permission -> Claude is blocked, needs a decision        (PermissionRequest hook)
#   done       -> Claude finished its turn, your turn         (Stop hook)
#   auto       -> inspect the Notification payload, route it  (Notification hook)
#   answered   -> this session is active again, drop its banner
#                 (UserPromptSubmit + PostToolUse hooks)
#
# Each Claude session gets its OWN banner, keyed by session_id, so sessions
# running as separate VS Code tabs don't clobber each other's banners. The
# banner + sound fire ONCE (even if VS Code is already frontmost) and the banner
# stays in Notification Center until that session is "answered" -- i.e. you typed
# a prompt in that tab, or Claude resumed there after you granted permission.
#
# NOTE: macOS can't focus an individual VS Code terminal/editor tab from outside
# the app, so clicking a banner raises the VS Code window but can't jump to the
# exact tab. The banner names the folder so you know which tab to click into.

CASE="$1"
payload="$(cat 2>/dev/null)"

# Every Claude hook pipes a JSON payload on stdin. Pull out session + cwd.
sid="$(printf '%s' "$payload" | grep -o '"session_id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"$//')"
cwd="$(printf '%s' "$payload" | grep -o '"cwd":"[^"]*"'        | head -1 | sed 's/.*:"//;s/"$//')"
[ -z "$sid" ] && sid="default"
SHORT="${sid: -6}"
FOLDER="$(basename "${cwd:-$PWD}")"

GROUP="claude-notify-$SHORT"

# terminal-notifier (if installed) makes the banner clickable -> activates VS
# Code. Plain osascript notifications aren't clickable, so fall back to those.
TN=""
for p in /opt/homebrew/bin/terminal-notifier /usr/local/bin/terminal-notifier; do
  [ -x "$p" ] && TN="$p" && break
done

# Drop THIS session's banner (leaves other sessions' banners alone).
clear_nag() {
  [ -n "$TN" ] && "$TN" -remove "$GROUP" >/dev/null 2>&1
}

# auto: decide from the Notification event's payload.
if [ "$CASE" = "auto" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') $payload" >> /tmp/claude-notify.log
  msg="$(printf '%s' "$payload" | tr '[:upper:]' '[:lower:]')"
  case "$msg" in
    *waiting*|*idle*)        CASE="skip" ;;        # idle -> Stop already covered "done"
    *permission*|*approve*)  CASE="skip" ;;        # tool permission -> PermissionRequest handles it
    *)                       CASE="permission" ;;  # plan approval / question -> needs a decision
  esac
fi

# answered: you're back in this session's tab -> dismiss its banner and stop.
if [ "$CASE" = "answered" ]; then
  clear_nag
  exit 0
fi

# skip: another hook owns this event -- leave any running nagger alone.
[ "$CASE" = "skip" ] && exit 0

# Replace any previous banner for THIS session only, then post the new one.
clear_nag

case "$CASE" in
  permission) SUBT="Action needed"; BODY="needs your input"; SOUND="Funk" ;;
  *)          SUBT="Done";          BODY="task complete, your turn"; SOUND="Glass" ;;
esac
MSG="$FOLDER: $BODY"

# Post the banner once, and play the sound once (backgrounded so the hook
# returns immediately). The banner stays in Notification Center until the
# "answered" case removes it.
if [ -n "$TN" ]; then
  "$TN" -title "Claude Code" -subtitle "$SUBT" -message "$MSG" -group "$GROUP" -activate com.microsoft.VSCode >/dev/null 2>&1
else
  /usr/bin/osascript -e "display notification \"$MSG\" with title \"Claude Code\" subtitle \"$SUBT\"" 2>/dev/null
fi
/usr/bin/afplay "/System/Library/Sounds/$SOUND.aiff" >/dev/null 2>&1 &
