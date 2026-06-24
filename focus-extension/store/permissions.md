# Permission justifications — for the Web Store "Privacy practices" tab

Paste each justification next to its permission. These are the questions that
most often trip up review for an extension with broad host access, so keep them
specific.

## declarativeNetRequest
Used to block the websites the user has chosen by redirecting them to the
extension's "stay focused" page while blocking is on.

## host_permissions: `*://*/*` (all sites)
The user can block **any** website they choose, so the extension needs to act on
any site. declarativeNetRequest **redirect** rules require host access to the
request's URL, and the extension reads tab URLs to reload tabs already on a
blocked site. It does not read page content and sends nothing from these sites
anywhere.

## tabs
To reload tabs that are already open on a blocked site the moment blocking turns
on (so they are blocked immediately), and to send them back to the original site
when blocking turns off. Tab URLs are used locally and never transmitted.

## storage
To save the connection token and a small status cache (on/off, site count, last
sync time) locally.

## alarms
To refresh the block list on a one-minute schedule as a fallback, so changes
made on another device are picked up.

## Content script on https://lumna.co/*
Only on the user's own LUMNA Focus page: detects that the extension is installed
(to show a "Connected" badge) and relays the page's signal to re-sync. No other
sites are touched by the content script.

## Remote code
None. The extension contains all its code; blocking rules are data fetched from
lumna.co, not executable code.

## Are you using the requested permissions for the stated single purpose?
Yes — every permission above is used solely to block the user's chosen websites.
