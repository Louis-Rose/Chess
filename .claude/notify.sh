#!/bin/bash
# Get the name of the frontmost application
FRONTMOST=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true')

# Only notify if you are NOT currently in VS Code
if [ "$FRONTMOST" != "Code" ]; then
    osascript -e "display notification \"Task complete!\" with title \"Claude Code\""
    afplay /System/Library/Sounds/Glass.aiff &
fi
