#!/bin/bash
# Dismisses Claude notification banners when you switch back to VS Code.
#
# notify.sh posts a per-session banner and clears it only when you ACT in that
# session (type a prompt, or Claude runs its next tool). This watcher adds the
# missing case: clear banners the moment VS Code regains focus, even if you
# don't act.
#
# Edge-triggered on purpose -- it only fires on the transition INTO VS Code
# (non-VSCode -> VSCode). A banner posted WHILE VS Code is already frontmost
# (you're sitting in another tab) survives until you re-focus VS Code or act in
# the session, preserving notify.sh's per-tab behavior.
#
# Frontmost app is read via lsappinfo (no Apple Events, so no TCC "control
# System Events" prompt) -- important for running unattended as a LaunchAgent.
#
# Lifecycle: started + kept alive by the LaunchAgent co.lumna.claude-notify-focus.

STATE_DIR="/tmp/claude-notify-groups"
VSCODE_BUNDLE="com.microsoft.VSCode"
POLL=1

TN=""
for p in /opt/homebrew/bin/terminal-notifier /usr/local/bin/terminal-notifier; do
  [ -x "$p" ] && TN="$p" && break
done
[ -z "$TN" ] && exit 0

front_bundle() {
  /usr/bin/lsappinfo info -only bundleID "$(/usr/bin/lsappinfo front)" 2>/dev/null
}

# Remove every banner notify.sh currently has tracked, and forget them.
clear_all() {
  [ -d "$STATE_DIR" ] || return
  for f in "$STATE_DIR"/*; do
    [ -e "$f" ] || continue
    "$TN" -remove "$(basename "$f")" >/dev/null 2>&1
    rm -f "$f"
  done
}

was_vscode=0
while :; do
  case "$(front_bundle)" in
    *"$VSCODE_BUNDLE"*)
      [ "$was_vscode" = "0" ] && clear_all   # transition into VS Code
      was_vscode=1
      ;;
    *)
      was_vscode=0
      ;;
  esac
  sleep "$POLL"
done
