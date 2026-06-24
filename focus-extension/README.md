# LUMNA Focus — browser extension

Blocks the sites on your LUMNA Focus list (lumna.co/focus) inside your own
browser, while focus mode is on. This is the per-user enforcement for people
who don't run the owner's local Mac watcher.

## How it works

- You flip blocking on/off and edit your list at **lumna.co/focus**.
- This extension polls your list every minute (using your personal token) and,
  while blocking is on, redirects those sites to a "stay focused" page via
  Chrome's `declarativeNetRequest` API.
- Only **websites** are enforced — a browser extension can't quit macOS apps.

## Install (unpacked, for now)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `focus-extension/` folder.
4. Click the LUMNA Focus toolbar icon, paste the **connection token** from
   lumna.co/focus, and hit **Save & sync**.

## Notes

- The server is hardcoded to `https://lumna.co` (`API_BASE` in background.js).
- The token only authorises reading your own block list. If it leaks, rotate it
  from lumna.co/focus (issues a new one and invalidates the old).
- For a one-click Chrome Web Store install we'd add icons and submit for review;
  this unpacked build is functionally complete.
