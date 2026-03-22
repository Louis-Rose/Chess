// My Students panel — placeholder

import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelHeader } from '../components/PanelHeader';

export function StudentsPanel() {
  const { t } = useLanguage();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PanelHeader title={t('coaches.navStudents')} />
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-500 text-sm italic">{t('coaches.mistakes.comingSoon')}</p>
      </div>
    </div>
  );
}
