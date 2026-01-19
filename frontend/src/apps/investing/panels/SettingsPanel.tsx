// Settings Panel

import { useNavigate } from 'react-router-dom';
import { Settings, Trash2, ArrowLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';

export function SettingsPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();

  if (!user) {
    navigate('/investing');
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-400 hover:text-slate-200 mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {language === 'fr' ? 'Retour' : 'Back'}
      </button>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center">
          <Settings className="w-6 h-6 text-slate-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            {language === 'fr' ? 'Paramètres' : 'Settings'}
          </h1>
          <p className="text-slate-400 text-sm">{user.email}</p>
        </div>
      </div>

      {/* Account Section */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
            {language === 'fr' ? 'Compte' : 'Account'}
          </h2>
        </div>

        <button
          onClick={() => navigate('/investing/settings/delete-account')}
          className="w-full flex items-center justify-between px-4 py-4 hover:bg-slate-700/50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <div className="text-left">
              <p className="text-slate-200 font-medium">
                {language === 'fr' ? 'Supprimer mon compte' : 'Delete my account'}
              </p>
              <p className="text-slate-500 text-sm">
                {language === 'fr' ? 'Supprimer définitivement toutes vos données' : 'Permanently delete all your data'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-slate-300 transition-colors" />
        </button>
      </div>
    </div>
  );
}
