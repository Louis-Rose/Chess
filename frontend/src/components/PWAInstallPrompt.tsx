// PWA Install Prompt - shows device-specific instructions for installing the app

import { useState } from 'react';
import { X, Share, MoreVertical, Plus, Download, Copy, Check } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type Platform = 'ios-safari' | 'ios-other' | 'android-chrome' | 'android-other' | 'desktop' | 'unknown';

type IOSBrowser = 'chrome' | 'firefox' | 'edge' | 'opera' | 'brave' | 'unknown';

function detectIOSBrowser(): IOSBrowser {
  const ua = navigator.userAgent;
  if (/CriOS/.test(ua)) return 'chrome';
  if (/FxiOS/.test(ua)) return 'firefox';
  if (/EdgiOS/.test(ua)) return 'edge';
  if (/OPiOS/.test(ua)) return 'opera';
  if (/Brave/.test(ua)) return 'brave';
  return 'unknown';
}

function getBrowserDisplayName(browser: IOSBrowser, isFr: boolean): string {
  const names: Record<IOSBrowser, string> = {
    chrome: 'Chrome',
    firefox: 'Firefox',
    edge: 'Edge',
    opera: 'Opera',
    brave: 'Brave',
    unknown: isFr ? 'ce navigateur' : 'this browser',
  };
  return names[browser];
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua) && !/FxiOS/.test(ua) && !/EdgiOS/.test(ua) && !/OPiOS/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edge/.test(ua);

  if (isIOS) {
    return isSafari ? 'ios-safari' : 'ios-other';
  }
  if (isAndroid) {
    return isChrome ? 'android-chrome' : 'android-other';
  }
  return 'desktop';
}

// Safari logo SVG component
function SafariLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 1.5c4.687 0 8.5 3.813 8.5 8.5s-3.813 8.5-8.5 8.5-8.5-3.813-8.5-8.5 3.813-8.5 8.5-8.5zm0 1a7.5 7.5 0 100 15 7.5 7.5 0 000-15zm4.243 2.257l-5.657 3.536-3.536 5.657 5.657-3.536 3.536-5.657zm-4.243 4.493a.75.75 0 110 1.5.75.75 0 010-1.5z"/>
    </svg>
  );
}

function isStandalone(): boolean {
  // Check if running as installed PWA
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

interface PWAInstallPromptProps {
  className?: string;
}

// Initialize state synchronously to avoid re-render scroll jumps
function getInitialState(): { dismissed: boolean; platform: Platform } {
  if (typeof window === 'undefined') {
    return { dismissed: true, platform: 'unknown' };
  }

  if (isStandalone()) {
    return { dismissed: true, platform: 'unknown' };
  }

  if (localStorage.getItem('pwa-prompt-dismissed')) {
    return { dismissed: true, platform: 'unknown' };
  }

  return { dismissed: false, platform: detectPlatform() };
}

export function PWAInstallPrompt({ className = '' }: PWAInstallPromptProps) {
  const { language } = useLanguage();
  const [state, setState] = useState(getInitialState);
  const [copied, setCopied] = useState(false);
  const { dismissed, platform } = state;
  const isFr = language === 'fr';

  const handleDismiss = () => {
    localStorage.setItem('pwa-prompt-dismissed', 'true');
    setState({ dismissed: true, platform });
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (dismissed) return null;

  const content = getContent(platform, language);
  if (!content) return null;

  const iosBrowser = platform === 'ios-other' ? detectIOSBrowser() : null;
  const browserName = iosBrowser ? getBrowserDisplayName(iosBrowser, isFr) : null;

  return (
    <div className={`bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-4 relative ${className}`}>
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-green-900 dark:text-green-100 mb-1">
            {content.title}
          </h3>

          {/* Show current browser warning for iOS non-Safari users */}
          {platform === 'ios-other' && browserName && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-amber-100 dark:bg-amber-900/40 rounded-lg">
              <span className="text-amber-800 dark:text-amber-200 text-sm">
                {isFr
                  ? `Vous utilisez ${browserName}. Ouvrez Safari pour installer l'app :`
                  : `You're using ${browserName}. Open Safari to install the app:`
                }
              </span>
              <SafariLogo className="w-5 h-5 text-[#006CFF] flex-shrink-0" />
            </div>
          )}

          {/* Copy URL button for iOS non-Safari users */}
          {platform === 'ios-other' && (
            <button
              onClick={handleCopyUrl}
              className="flex items-center gap-2 mb-3 px-3 py-2 bg-[#006CFF] hover:bg-[#0055CC] text-white rounded-lg text-sm font-medium transition-colors w-full justify-center"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  {isFr ? 'Lien copié !' : 'Link copied!'}
                </>
              ) : (
                <>
                  <SafariLogo className="w-4 h-4" />
                  <Copy className="w-4 h-4" />
                  {isFr ? 'Copier le lien pour Safari' : 'Copy link for Safari'}
                </>
              )}
            </button>
          )}

          <div className="text-sm text-green-800 dark:text-green-200 space-y-1">
            {content.steps.map((step, i) => (
              <p key={i} className="flex items-center gap-2">
                <span className="font-medium">{i + 1}.</span>
                {step.icon && <step.icon className="w-4 h-4 inline flex-shrink-0" />}
                <span>{step.text}</span>
              </p>
            ))}
          </div>

          {/* Screenshot placeholders - will be filled in later */}
          {content.screenshots && content.screenshots.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {content.screenshots.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`${isFr ? 'Étape' : 'Step'} ${i + 1}`}
                  className="h-32 rounded-lg border border-green-200 dark:border-green-700 flex-shrink-0"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface StepContent {
  text: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface ContentData {
  title: string;
  steps: StepContent[];
  screenshots?: string[]; // URLs to screenshot images
}

function getContent(platform: Platform, language: string): ContentData | null {
  const isFr = language === 'fr';

  switch (platform) {
    case 'ios-safari':
      return {
        title: isFr ? 'Installer l\'app sur votre iPhone' : 'Install app on your iPhone',
        steps: [
          {
            text: isFr ? 'Appuyez sur le bouton Partager' : 'Tap the Share button',
            icon: Share
          },
          {
            text: isFr ? 'Faites défiler et appuyez sur "Sur l\'écran d\'accueil"' : 'Scroll down and tap "Add to Home Screen"',
            icon: Plus
          },
        ],
        screenshots: ['/pwa-screenshots/step1.png', '/pwa-screenshots/step2.png', '/pwa-screenshots/step3.png', '/pwa-screenshots/step4.png'],
      };

    case 'ios-other':
      return {
        title: isFr ? 'Installer l\'app sur votre iPhone' : 'Install app on your iPhone',
        steps: [
          {
            text: isFr ? 'Copiez le lien ci-dessus et ouvrez-le dans Safari' : 'Copy the link above and open it in Safari',
          },
          {
            text: isFr ? 'Appuyez sur le bouton Partager' : 'Tap the Share button',
            icon: Share
          },
          {
            text: isFr ? 'Appuyez sur "Sur l\'écran d\'accueil"' : 'Tap "Add to Home Screen"',
            icon: Plus
          },
        ],
        screenshots: ['/pwa-screenshots/step1.png', '/pwa-screenshots/step2.png', '/pwa-screenshots/step3.png', '/pwa-screenshots/step4.png'],
      };

    case 'android-chrome':
      return {
        title: isFr ? 'Installer l\'app sur votre téléphone' : 'Install app on your phone',
        steps: [
          {
            text: isFr ? 'Appuyez sur le menu (⋮)' : 'Tap the menu (⋮)',
            icon: MoreVertical
          },
          {
            text: isFr ? 'Appuyez sur "Installer l\'application"' : 'Tap "Install app"',
          },
        ],
      };

    case 'android-other':
      return {
        title: isFr ? 'Installer l\'app sur votre téléphone' : 'Install app on your phone',
        steps: [
          {
            text: isFr ? 'Ouvrez cette page dans Chrome' : 'Open this page in Chrome',
          },
          {
            text: isFr ? 'Menu → "Installer l\'application"' : 'Menu → "Install app"',
            icon: MoreVertical
          },
        ],
      };

    case 'desktop':
      // Don't show on desktop - less relevant
      return null;

    default:
      return null;
  }
}
