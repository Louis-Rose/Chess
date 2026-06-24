# Publishing LUMNA Focus to the Chrome Web Store

Everything is prepped. These are the steps only you can do (account + upload).

## 1. One-time setup
1. Go to the **Chrome Web Store Developer Dashboard**:
   https://chrome.google.com/webstore/devconsole
2. Pay the **one-time $5** registration fee (your Google account).
3. (Recommended) Set up the publisher profile / verify your email.

## 2. Host the privacy policy
- Publish the text in `store/privacy-policy.md` at a public URL
  (e.g. add a `lumna.co/extension-privacy` page, or a public GitHub Gist).
- You'll paste that URL into the listing.

## 3. Upload the package
1. In the dashboard, click **Add new item**.
2. Upload `focus-extension.zip` (built by `store/build-zip.sh`, see below).
3. Fill the **Store listing** tab from `store/listing.md`.
4. Add at least one **screenshot** (1280×800 or 640×400). Suggested shots are
   listed in `listing.md`.
5. Fill the **Privacy practices** tab using `store/permissions.md`, and paste the
   privacy-policy URL.
6. Choose visibility:
   - **Public** — anyone can find and install it.
   - **Unlisted** — only people with the link can install (same review).

## 4. Submit for review
- Submit. Review usually takes a few days. The broad host permission (`*://*/*`)
  and `tabs` get scrutiny — the justifications in `permissions.md` cover them.

## 5. After approval
- You'll get an install link like `https://chromewebstore.google.com/detail/<id>`.
- Tell me the link and I'll add a one-click **Install extension** button on
  lumna.co/focus.

## Rebuilding the zip
From the repo root:

```bash
bash focus-extension/store/build-zip.sh
```

It produces `focus-extension.zip` at the repo root containing only the runtime
files (manifest, scripts, popup, blocked page, icons) — not the README or store
docs.
