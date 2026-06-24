# LUMNA Focus — browser extension

Blocks the sites on your LUMNA Focus list inside your own browser while focus
mode is on. Manage your list and the on/off switch from the extension popup (or
lumna.co/focus).

## How it works

- This extension polls your list every minute (using your personal token) and,
  while blocking is on, blocks those sites with Chrome's `declarativeNetRequest`
  block rules. Visiting a blocked site shows the browser's standard "site
  blocked" page.
- Block rules need no host permission, so the extension only requests access to
  **lumna.co** (its own API), not to every site.
- When you flip blocking on, tabs already open on a blocked site reload into the
  block; flip it off and they reload back to the site. (Uses the `tabs`
  permission to read tab URLs locally.)
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
