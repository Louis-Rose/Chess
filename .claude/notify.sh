#!/bin/bash
# Distinct notification per case. $1 selects which:
#   permission -> GROUP A: Claude is blocked, needs a decision
#                 (tool authorization / plan approval / a question)
#   done       -> GROUP B: Claude finished its turn / idle, it's your turn
#   auto       -> inspect the Notification payload on stdin and pick the case
#
# Group A and Group B each get one sound + one message, shared across all the
# situations that belong to them.

CASE="$1"

# auto: decide from the Notification event's JSON payload (read from stdin).
if [ "$CASE" = "auto" ]; then
  payload="$(cat)"
  echo "$(date '+%Y-%m-%d %H:%M:%S') $payload" >> /tmp/claude-notify.log
  msg="$(printf '%s' "$payload" | tr '[:upper:]' '[:lower:]')"
  case "$msg" in
    *waiting*|*idle*)        CASE="done" ;;        # waiting for your input -> group B
    *permission*|*approve*)  CASE="skip" ;;        # tool permission -> PermissionRequest hook handles it
    *)                       CASE="permission" ;;  # plan approval / question / other -> group A
  esac
fi

case "$CASE" in
  permission)  # GROUP A — a decision is blocking Claude
    osascript -e "display notification \"Claude needs your input to continue.\" with title \"Claude Code\" subtitle \"Action needed\""
    afplay /System/Library/Sounds/Funk.aiff &
    ;;
  skip)
    : ;;  # already handled by another hook — stay silent to avoid double-firing
  *)  # GROUP B — done / your turn (also the default)
    osascript -e "display notification \"Task complete, your turn.\" with title \"Claude Code\" subtitle \"Done\""
    afplay /System/Library/Sounds/Glass.aiff &
    ;;
esac
