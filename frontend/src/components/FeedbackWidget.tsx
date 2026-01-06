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
      {/* Expanded feedback form */}
      {isOpen && (
        <div className="absolute bottom-14 right-0 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="font-medium text-slate-800 dark:text-slate-200 text-sm">{t.title}</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {/* Success state */}
            {status === 'success' && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 py-4 justify-center">
                <Check className="w-5 h-5" />
                <span className="font-medium">{t.success}</span>
              </div>
            )}

            {/* Error state */}
            {status === 'error' && (
              <div className="flex items-center gap-2 text-red-500 text-sm mb-3">
                <X className="w-4 h-4" />
                <span>{errorMessage || t.error}</span>
              </div>
            )}

            {/* Input form */}
            {(status === 'idle' || status === 'sending' || status === 'error') && (
              <div className="space-y-3">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t.placeholder}
                  rows={4}
                  maxLength={5000}
                  className="w-full bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/50 border border-slate-200 dark:border-slate-600"
                  disabled={status === 'sending'}
                  autoFocus
                />
                <button
                  onClick={handleSubmit}
                  disabled={!message.trim() || status === 'sending'}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
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
        </div>
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
