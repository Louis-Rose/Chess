import { Outlet } from 'react-router-dom';
import axios from 'axios';
import { LogOut } from 'lucide-react';
import { TabbedSidebarLayout } from '../../components/TabbedSidebarLayout';
import { LangToggle } from '../../components/LangToggle';
import { useLanguage } from '../../contexts/LanguageContext';
import { MPP_NAV } from './mppNav';

// Sidebar shell for the MPP section: the shared tabbed layout (desktop rail +
// collapsible mobile drawer) wired with the MPP tabs and the account
// "Disconnect" action in the profile menu.
export function MppLayout({ onDisconnect }: { onDisconnect: () => void }) {
  const { t } = useLanguage();
  const disconnect = () => {
    axios.post('/api/mpp/disconnect').then(onDisconnect);
  };
  const nav = MPP_NAV.map(({ to, labelKey, icon }) => ({ to, label: t(labelKey), icon }));
  const profileItems = [
    { icon: LogOut, label: t('mpp.common.disconnect'), onClick: disconnect, danger: true },
  ];

  return (
    <TabbedSidebarLayout title="MPP" nav={nav} profileItems={profileItems} headerRight={<LangToggle />}>
      <Outlet />
    </TabbedSidebarLayout>
  );
}
