// Floating feedback widget - bottom-right corner of the page

import { useState } from 'react';
import { MessageSquare, Send, Loader2, Check, X } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

interface FeedbackWidgetProps {
  language?: 'en' | 'fr';
}

export function FeedbackWidget({ language = 'en' }: FeedbackWidgetProps) {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const texts = {
    en: {
      title: 'Send Feedback',
      placeholder: 'Share your thoughts, report bugs, or suggest features...',
      send: 'Send',
      success: 'Thanks for your feedback!',
      error: 'Failed to send',
      loginRequired: 'Sign in to send feedback',
      tooltip: 'Feedback',
      cta: 'Got feedback?',
      screenshotHint: 'To add a screenshot: close this, take your screenshot, reopen and paste (Ctrl+V)',
    },
    fr: {
      title: 'Envoyer un feedback',
      placeholder: 'Partagez vos idées, signalez des bugs ou suggérez des fonctionnalités...',
      send: 'Envoyer',
      success: 'Merci pour votre retour !',
      error: 'Échec de l\'envoi',
      loginRequired: 'Connectez-vous pour envoyer',
      tooltip: 'Feedback',
      cta: 'Un avis ?',
      screenshotHint: 'Pour ajouter une capture : fermez, prenez votre capture, rouvrez et collez (Ctrl+V)',
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
      // Close and reset after 2 seconds
      setTimeout(() => {
        setStatus('idle');
        setIsOpen(false);
      }, 2000);
    } catch (err: unknown) {
      setStatus('error');
      const errorMsg = axios.isAxiosError(err) && err.response?.data?.error
        ? err.response.data.error
        : (language === 'fr' ? 'Une erreur est survenue' : 'Something went wrong');
      setErrorMessage(errorMsg);
      // Reset to idle after 3 seconds
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  // Don't render for non-authenticated users
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Expanded feedback form - centered modal */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />
          {/* Modal */}
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-w-[90vw] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-lg">{t.title}</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Success state */}
              {status === 'success' && (
                <div className="flex items-center gap-3 text-green-600 dark:text-green-400 py-6 justify-center">
                  <Check className="w-6 h-6" />
                  <span className="font-medium text-lg">{t.success}</span>
                </div>
              )}

              {/* Error state */}
              {status === 'error' && (
                <div className="flex items-center gap-2 text-red-500 mb-4">
                  <X className="w-5 h-5" />
                  <span>{errorMessage || t.error}</span>
                </div>
              )}

              {/* Input form */}
              {(status === 'idle' || status === 'sending' || status === 'error') && (
                <div className="space-y-4">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t.placeholder}
                    rows={5}
                    maxLength={5000}
                    className="w-full bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-base placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/50 border border-slate-200 dark:border-slate-600"
                    disabled={status === 'sending'}
                    autoFocus
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                    {t.screenshotHint}
                  </p>
                  <button
                    onClick={handleSubmit}
                    disabled={!message.trim() || status === 'sending'}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-base font-medium py-3 rounded-xl transition-colors"
                  >
                    {status === 'sending' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                    {t.send}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Floating button with label */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`shadow-lg flex items-center gap-2 transition-all duration-200 ${
          isOpen
            ? 'w-12 h-12 rounded-full bg-slate-600 hover:bg-slate-700 justify-center'
            : 'px-4 py-3 rounded-full bg-green-600 hover:bg-green-700 hover:scale-105'
        }`}
        title={t.tooltip}
      >
        {isOpen ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <>
            <MessageSquare className="w-5 h-5 text-white" />
            <span className="text-white text-sm font-medium">{t.cta}</span>
          </>
        )}
      </button>
    </div>
  );
}
