#!/bin/bash
# Always notify — sound + macOS notification
osascript -e "display notification \"Task complete!\" with title \"Claude Code\""
afplay /System/Library/Sounds/Glass.aiff &
