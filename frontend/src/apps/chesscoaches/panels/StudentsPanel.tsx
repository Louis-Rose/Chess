// My Students panel — placeholder

import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell } from '../components/PanelShell';

export function StudentsPanel() {
  const { t } = useLanguage();

  return (
    <PanelShell title={t('coaches.navStudents')}>
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-500 text-sm italic">{t('coaches.mistakes.comingSoon')}</p>
      </div>
    </PanelShell>
  );
}
