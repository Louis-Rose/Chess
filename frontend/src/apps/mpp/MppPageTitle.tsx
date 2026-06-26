import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { mppTitleKey } from './mppNav';

// Centered page heading whose text is, by construction, the active tab's name —
// derived from the route via MPP_NAV, so it always matches the sidebar. An
// optional `action` (e.g. a Refresh button) sits on the right.
export function MppPageTitle({ action }: { action?: ReactNode }) {
  const { t } = useLanguage();
  const { pathname } = useLocation();
  const key = mppTitleKey(pathname);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div />
      <h2 className="text-center text-xl font-bold text-slate-100">{key ? t(key) : 'MPP'}</h2>
      <div className="flex justify-end">{action}</div>
    </div>
  );
}
