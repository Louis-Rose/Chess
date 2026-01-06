// Feedback widget for sidebar - allows users to quickly send feedback

import { useState } from 'react';
import { MessageSquare, Send, Loader2, Check, X } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

interface FeedbackWidgetProps {
  collapsed?: boolean;
  language?: 'en' | 'fr';
}

export function FeedbackWidget({ collapsed = false, language = 'en' }: FeedbackWidgetProps) {
  const { isAuthenticated } = useAuth();
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const texts = {
    en: {
      title: 'Feedback',
      placeholder: 'Share your thoughts, report bugs, or suggest features...',
      send: 'Send',
      success: 'Thanks for your feedback!',
      error: 'Failed to send',
      loginRequired: 'Sign in to send feedback',
    },
    fr: {
      title: 'Feedback',
      placeholder: 'Partagez vos idées, signalez des bugs ou suggérez des fonctionnalités...',
      send: 'Envoyer',
      success: 'Merci pour votre retour !',
      error: 'Échec de l\'envoi',
      loginRequired: 'Connectez-vous pour envoyer',
    },
  };

  const t = texts[language];

  const handleSubmit = async () => {
    if (!message.trim() || status === 'sending') return;

    setStatus('sending');
    setErrorMessage('');

    try {
      await axios.post('/api/feedback', { message: message.trim() });
      setStatus('success');
      setMessage('');
      // Reset to idle after 3 seconds
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: unknown) {
      setStatus('error');
      const errorMsg = axios.isAxiosError(err) && err.response?.data?.error
        ? err.response.data.error
        : (language === 'fr' ? 'Une erreur est survenue' : 'Something went wrong');
      setErrorMessage(errorMsg);
      // Reset to idle after 4 seconds
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  // Collapsed view - just show icon
  if (collapsed) {
    return (
      <div className="flex justify-center" title={t.title}>
        <MessageSquare className="w-5 h-5 text-slate-400" />
      </div>
    );
  }

  // Not authenticated - show hint to sign in
  if (!isAuthenticated) {
    return (
      <div className="bg-slate-800 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2 text-slate-400">
          <MessageSquare className="w-4 h-4" />
          <span className="text-xs font-medium">{t.title}</span>
        </div>
        <p className="text-xs text-slate-500 text-center py-2">{t.loginRequired}</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2 text-slate-400">
        <MessageSquare className="w-4 h-4" />
        <span className="text-xs font-medium">{t.title}</span>
      </div>

      {/* Success state */}
      {status === 'success' && (
        <div className="flex items-center gap-2 text-green-400 text-xs py-2">
          <Check className="w-4 h-4" />
          <span>{t.success}</span>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="flex items-center gap-2 text-red-400 text-xs py-2">
          <X className="w-4 h-4" />
          <span>{errorMessage || t.error}</span>
        </div>
      )}

      {/* Input form */}
      {(status === 'idle' || status === 'sending') && (
        <div className="space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t.placeholder}
            rows={3}
            maxLength={5000}
            className="w-full bg-slate-700 text-slate-200 text-sm placeholder:text-slate-500 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/50"
            disabled={status === 'sending'}
          />
          <button
            onClick={handleSubmit}
            disabled={!message.trim() || status === 'sending'}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {status === 'sending' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {t.send}
          </button>
        </div>
      )}
    </div>
  );
}
