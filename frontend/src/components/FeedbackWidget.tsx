// Floating feedback widget - bottom-right corner of the page

import { useState, useRef } from 'react';
import type { ClipboardEvent } from 'react';
import { MessageSquare, Send, Loader2, Check, X, Image as ImageIcon } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

interface FeedbackWidgetProps {
  language?: 'en' | 'fr';
}

export function FeedbackWidget({ language = 'en' }: FeedbackWidgetProps) {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<string[]>([]); // base64 images
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      screenshotHint: 'Tip: Close this modal, take a screenshot, reopen and paste it here (Ctrl+V)',
      imageAdded: 'Screenshot added!',
      removeImage: 'Remove',
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
      screenshotHint: 'Astuce : Fermez cette fenêtre, prenez une capture, rouvrez et collez-la ici (Ctrl+V)',
      imageAdded: 'Capture ajoutée !',
      removeImage: 'Supprimer',
    },
  };

  const t = texts[language];

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            if (base64) {
              setImages((prev) => [...prev, base64]);
            }
          };
          reader.readAsDataURL(file);
        }
        break;
      }
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if ((!message.trim() && images.length === 0) || status === 'sending') return;

    setStatus('sending');
    setErrorMessage('');

    try {
      await axios.post('/api/feedback', {
        message: message.trim(),
        images: images
      });
      setStatus('success');
      setMessage('');
      setImages([]);
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
                  {/* Screenshot hint - above textarea */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <ImageIcon className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      {t.screenshotHint}
                    </p>
                  </div>

                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onPaste={handlePaste}
                    placeholder={t.placeholder}
                    rows={5}
                    maxLength={5000}
                    className="w-full bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-base placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/50 border border-slate-200 dark:border-slate-600"
                    disabled={status === 'sending'}
                    autoFocus
                  />

                  {/* Image previews */}
                  {images.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {images.map((img, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={img}
                            alt={`Screenshot ${index + 1}`}
                            className="h-20 w-auto rounded-lg border border-slate-300 dark:border-slate-600 object-cover"
                          />
                          <button
                            onClick={() => removeImage(index)}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            title={t.removeImage}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={(!message.trim() && images.length === 0) || status === 'sending'}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-base font-medium py-3 rounded-xl transition-colors"
                  >
                    {status === 'sending' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                    {t.send}
                    {images.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-sm">
                        +{images.length} {images.length === 1 ? 'image' : 'images'}
                      </span>
                    )}
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
