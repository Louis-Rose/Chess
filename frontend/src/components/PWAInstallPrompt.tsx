// PWA Install Prompt - shows device-specific instructions for installing the app

import { useState } from 'react';
import { Share, MoreVertical, Plus, Download, Copy, Check, X, ChevronDown } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type Platform = 'ios-safari' | 'ios-other' | 'android-chrome' | 'android-other' | 'desktop' | 'unknown';

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

// Get initial state synchronously to avoid re-render scroll jumps
function getInitialState(): { hidden: boolean; platform: Platform } {
  if (typeof window === 'undefined') {
    return { hidden: true, platform: 'unknown' };
  }
  if (isStandalone()) {
    return { hidden: true, platform: 'unknown' }; // Don't show if already installed as PWA
  }
  if (sessionStorage.getItem('pwa-prompt-dismissed')) {
    return { hidden: true, platform: 'unknown' }; // User dismissed this session
  }
  return { hidden: false, platform: detectPlatform() };
}

export function PWAInstallPrompt({ className = '' }: PWAInstallPromptProps) {
  const { language } = useLanguage();
  const [state, setState] = useState(getInitialState);
  const [copied, setCopied] = useState(false);
  const { hidden, platform } = state;
  const isFr = language === 'fr';

  const handleDismiss = () => {
    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
    setState({ hidden: true, platform });
  };

  const handleCopyUrl = async () => {
    // Include chess username and language in URL so they carry over to the other browser
    let url = window.location.href;
    try {
      const u = new URL(url);
      const prefs = JSON.parse(localStorage.getItem('coaches_preferences') || '{}');
      if (prefs.chess_username) u.searchParams.set('u', prefs.chess_username);
      if (language) u.searchParams.set('lang', language);
      url = u.toString();
    } catch {}
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
    }
  };

  if (hidden) return null;

  const content = getContent(platform, language);
  if (!content) return null;

  const isNonPreferredBrowser = platform === 'ios-other' || platform === 'android-other';
  const preferredBrowser = platform === 'ios-other' ? 'Safari' : 'Chrome';

  return (
    <div className={`bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-4 relative overflow-hidden ${className}`}>
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex flex-col items-center text-center gap-2">
        <h3 className="font-semibold text-green-900 dark:text-green-100 flex items-center gap-2">
          <Download className="w-4 h-4" />
          {content.title}
        </h3>
        <div className="w-full">

          <div className="text-sm text-green-800 dark:text-green-200 space-y-1">
            {content.steps.map((step, i) => (
              <p key={i} className="flex items-center justify-center gap-2">
                {!isNonPreferredBrowser && step.icon && <><span className="font-medium">{i + 1}.</span><step.icon className="w-4 h-4 inline flex-shrink-0" /></>}
                {!isNonPreferredBrowser && step.iconSrc && <img src={step.iconSrc} alt="" className="w-7 h-7 inline flex-shrink-0" />}
                {!isNonPreferredBrowser && !step.icon && !step.iconSrc && <span className="font-medium">{i + 1}.</span>}
                <span>{step.text}</span>
              </p>
            ))}
          </div>

          {/* Non-preferred browser: copy URL button after steps */}
          {isNonPreferredBrowser && (<>
            <button
              onClick={handleCopyUrl}
              className="flex items-center gap-2 mt-3 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors w-full justify-center"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  {isFr ? 'Lien copié !' : 'Link copied!'}
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  {isFr ? `Copier le lien pour ${preferredBrowser}` : `Copy link for ${preferredBrowser}`}
                </>
              )}
            </button>
            {copied && (
              <p className="flex items-center justify-center gap-2 mt-3 text-sm text-green-800 dark:text-green-200">
                {platform === 'ios-other' && <img src="/icons/safari-logo.jpeg" alt="Safari" className="w-5 h-5 rounded" />}
                {platform === 'android-other' && <img src="/icons/chrome.svg" alt="Chrome" className="w-5 h-5" />}
                {isFr
                  ? `Ouvrez ${preferredBrowser}, collez le lien et reconnectez-vous`
                  : `Now open ${preferredBrowser}, paste the link and sign in again`}
              </p>
            )}
          </>)}


        </div>
      </div>
    </div>
  );
}

interface StepContent {
  text: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconSrc?: string; // For image icons (e.g., Safari logo)
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
        title: isFr ? 'Comment installer Lumna sur iPhone' : 'How to install Lumna on iPhone',
        steps: [
          {
            text: isFr ? 'Appuyez sur "..." dans la barre d\'adresse' : 'Tap "..." in the address bar',
            icon: MoreVertical
          },
          {
            text: isFr ? 'Appuyez sur "Partager"' : 'Tap "Share"',
            icon: Share
          },
          {
            text: isFr ? 'Appuyez sur "En voir plus"' : 'Tap "More"',
            icon: ChevronDown
          },
          {
            text: isFr ? 'Appuyez sur "Sur l\'écran d\'accueil"' : 'Tap "Add to Home Screen"',
          },
        ],
        screenshots: ['/pwa-screenshots/step1.png', '/pwa-screenshots/step2.png', '/pwa-screenshots/step3.png', '/pwa-screenshots/step4.png'],
      };

    case 'ios-other':
      return {
        title: isFr ? 'Comment installer Lumna sur iPhone' : 'How to install Lumna on iPhone',
        steps: [],
      };

    case 'android-chrome':
      return {
        title: isFr ? 'Comment installer Lumna sur votre téléphone' : 'How to install Lumna on your phone',
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
        title: isFr ? 'Comment installer Lumna sur votre téléphone' : 'How to install Lumna on your phone',
        steps: [],
      };

    case 'desktop':
      // Don't show on desktop - less relevant
      return null;

    default:
      return null;
  }
}
