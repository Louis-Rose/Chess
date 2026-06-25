import { useEffect } from 'react';

// Public privacy policy for the LUMNA Focus browser extension, served at
// /focus/privacy (the URL given to the Chrome Web Store). No auth required.
export function FocusPrivacy() {
  useEffect(() => {
    document.title = 'Privacy Policy | LUMNA Focus';
  }, []);

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-200">
      <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
        <h1 className="text-2xl font-bold text-white">LUMNA Focus — Privacy Policy</h1>
        <p className="mt-1 text-sm text-slate-500">Last updated: 24 June 2026</p>

        <p className="mt-6 text-sm leading-relaxed text-slate-300">
          LUMNA Focus is a browser extension that blocks websites you choose, to help you stay
          focused. This policy explains what it handles and why.
        </p>

        <Section title="What the extension stores">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Your <strong>connection token</strong>, saved in the browser's local extension
              storage (<code>chrome.storage.local</code>). It identifies your block list on
              lumna.co. It never leaves your device except to talk to lumna.co (below).
            </li>
            <li>
              A small <strong>status cache</strong> (whether blocking is on, how many sites, last
              sync time), stored locally so the popup can display it.
            </li>
          </ul>
        </Section>

        <Section title="What it sends, and where">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              The extension contacts <strong>lumna.co only</strong>, sending your connection token
              to read and update your block list (the websites you chose and the on/off state).
            </li>
            <li>Nothing is sent to any other server. There is no analytics or tracking.</li>
          </ul>
        </Section>

        <Section title="Access to your tabs">
          <p>
            The extension reads open tab URLs <strong>locally</strong>, only to reload tabs that are
            on a blocked site (so blocking takes effect immediately) and to return them when you
            turn blocking off. These URLs are <strong>not transmitted anywhere</strong>.
          </p>
        </Section>

        <Section title="What it does NOT do">
          <ul className="list-disc space-y-2 pl-5">
            <li>It does not collect personal information, browsing history, or analytics.</li>
            <li>It does not sell or share any data with third parties.</li>
            <li>It does not run remote code; blocking rules are simple data, not scripts.</li>
          </ul>
        </Section>

        <Section title="Data retention and deletion">
          <p>
            Your block list lives in your LUMNA account on lumna.co. Remove the extension to stop
            all local storage and access. You can rotate or revoke your token from the Focus option
            in your account menu on lumna.co.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions:{' '}
            <a href="mailto:rose.louis.mail@gmail.com" className="text-emerald-400 hover:underline">
              rose.louis.mail@gmail.com
            </a>
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}
