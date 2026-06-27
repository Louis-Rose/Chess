import { Outlet } from 'react-router-dom';
import { Search, BookOpen, Store } from 'lucide-react';
import { TabbedSidebarLayout, type TabNavItem } from '../../components/TabbedSidebarLayout';
import { LangToggle } from '../../components/LangToggle';
import { useLanguage } from '../../contexts/LanguageContext';

// Sidebar shell for the Clothing section: the shared tabbed layout (desktop rail
// + collapsible mobile drawer) wired with the app's tabs (Find, How-to, Stores).
export function ClothingLayout() {
  const { t } = useLanguage();
  const nav: TabNavItem[] = [
    { to: '/clothing', label: t('clothing.nav.find'), icon: Search, end: true },
    { to: '/clothing/how-to', label: t('clothing.nav.howTo'), icon: BookOpen },
    { to: '/clothing/stores', label: t('clothing.nav.stores'), icon: Store },
  ];

  return (
    <TabbedSidebarLayout
      title="Clothing"
      titleLabel={t('clothing.title')}
      nav={nav}
      headerRight={<LangToggle />}
    >
      <Outlet />
    </TabbedSidebarLayout>
  );
}
