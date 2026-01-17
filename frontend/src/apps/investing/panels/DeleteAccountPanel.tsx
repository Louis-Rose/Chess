// Delete Account Panel

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Trash2, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useQueryClient } from '@tanstack/react-query';
import posthog from 'posthog-js';

export function DeleteAccountPanel() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredText = language === 'fr' ? 'supprimer mon compte' : 'delete my account';
  const isConfirmed = confirmText.toLowerCase() === requiredText;

  const handleDelete = async () => {
    if (!isConfirmed) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/account', {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to delete account');
      }

      // Clear everything
      queryClient.clear();
      posthog.reset();
      await logout();
      navigate('/investing');
    } catch {
      setError(language === 'fr'
        ? 'Une erreur est survenue. Veuillez réessayer.'
        : 'An error occurred. Please try again.');
      setIsDeleting(false);
    }
  };

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

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              {language === 'fr' ? 'Supprimer mon compte' : 'Delete my account'}
            </h1>
            <p className="text-slate-400 text-sm">{user.email}</p>
          </div>
        </div>

        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
          <p className="text-red-400 font-medium mb-3">
            {language === 'fr'
              ? 'Cette action est irréversible. Les données suivantes seront supprimées définitivement :'
              : 'This action is irreversible. The following data will be permanently deleted:'}
          </p>
          <ul className="text-slate-300 space-y-1 text-sm ml-4">
            <li>• {language === 'fr' ? 'Votre profil et préférences' : 'Your profile and preferences'}</li>
            <li>• {language === 'fr' ? 'Vos comptes d\'investissement (PEA, CTO, etc.)' : 'Your investment accounts (PEA, CTO, etc.)'}</li>
            <li>• {language === 'fr' ? 'Toutes vos transactions' : 'All your transactions'}</li>
            <li>• {language === 'fr' ? 'Votre watchlist' : 'Your watchlist'}</li>
            <li>• {language === 'fr' ? 'Vos alertes earnings' : 'Your earnings alerts'}</li>
            <li>• {language === 'fr' ? 'Votre historique d\'activité' : 'Your activity history'}</li>
          </ul>
        </div>

        <div className="mb-6">
          <label className="block text-slate-300 text-sm mb-2">
            {language === 'fr'
              ? <>Pour confirmer, tapez <span className="font-mono text-red-400">supprimer mon compte</span> ci-dessous :</>
              : <>To confirm, type <span className="font-mono text-red-400">delete my account</span> below:</>}
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={requiredText}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        <button
          onClick={handleDelete}
          disabled={!isConfirmed || isDeleting}
          className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          {isDeleting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {language === 'fr' ? 'Suppression...' : 'Deleting...'}
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4" />
              {language === 'fr' ? 'Supprimer définitivement mon compte' : 'Permanently delete my account'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
