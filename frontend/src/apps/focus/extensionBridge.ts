// Talks to the LUMNA Focus browser extension's content script (injected on
// lumna.co) over window.postMessage. Used to detect that it's installed (drives
// the "Connected" badge); blocking itself is managed in the extension.
const PAGE_SOURCE = 'lumna-focus';
const EXT_SOURCE = 'lumna-focus-ext';

// Resolve true if the extension's content script answers a ping within the
// timeout. The content script also announces itself on load, so callers should
// additionally listen for unsolicited 'present' messages (see useExtensionPresent).
export function pingExtension(timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      resolve(v);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window) return;
      const d = e.data;
      if (d && d.source === EXT_SOURCE && d.type === 'present') finish(true);
    };
    window.addEventListener('message', onMsg);
    try {
      window.postMessage({ source: PAGE_SOURCE, type: 'ping' }, window.location.origin);
    } catch {
      // ignore
    }
    setTimeout(() => finish(false), timeoutMs);
  });
}

// True once the extension announces itself ('present'). Matches the message the
// content script emits on load and in reply to a ping.
export function isExtensionPresentMessage(e: MessageEvent): boolean {
  if (e.source !== window) return false;
  const d = e.data;
  return !!d && d.source === EXT_SOURCE && d.type === 'present';
}
