// PWA Install Prompt - shows device-specific instructions for installing the app

import { useState } from 'react';
import { Share, MoreVertical, Plus, Download, Copy, Check } from 'lucide-react';
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
  if (localStorage.getItem('pwa-installed')) {
    return { hidden: true, platform: 'unknown' }; // User marked as already installed
  }
  return { hidden: false, platform: detectPlatform() };
}

export function PWAInstallPrompt({ className = '' }: PWAInstallPromptProps) {
  const { language } = useLanguage();
  const [state, setState] = useState(getInitialState);
  const [copied, setCopied] = useState(false);
  const { hidden, platform } = state;
  const isFr = language === 'fr';

  const handleAlreadyInstalled = () => {
    localStorage.setItem('pwa-installed', 'true');
    setState({ hidden: true, platform });
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

  if (hidden) return null;

  const content = getContent(platform, language);
  if (!content) return null;

  const iosBrowser = platform === 'ios-other' ? detectIOSBrowser() : null;
  const browserName = iosBrowser ? getBrowserDisplayName(iosBrowser, isFr) : null;

  return (
    <div className={`bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-4 relative overflow-hidden ${className}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
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
                  <Copy className="w-4 h-4" />
                  {isFr ? 'Copier le lien pour Safari' : 'Copy link for Safari'}
                </>
              )}
            </button>
          )}

          <div className="text-sm text-green-800 dark:text-green-200 space-y-3">
            {content.steps.map((step, i) => (
              <div key={i}>
                <p className="flex items-center gap-2">
                  {step.icon && <><span className="font-medium">{i + 1}.</span><step.icon className="w-4 h-4 inline flex-shrink-0" /></>}
                  {step.iconSrc && <img src={step.iconSrc} alt="" className="w-7 h-7 inline flex-shrink-0" />}
                  {!step.icon && !step.iconSrc && <span className="font-medium">{i + 1}.</span>}
                  <span>{step.text}</span>
                </p>
                {content.screenshots?.[i] && (
                  <img
                    src={content.screenshots[i]}
                    alt={`${isFr ? 'Étape' : 'Step'} ${i + 1}`}
                    className={`mt-2 rounded-lg border border-green-200 dark:border-green-700 mx-auto block ${
                      i === 1 || i === 3 ? 'h-44' : 'h-28'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleAlreadyInstalled}
            className="mt-3 text-xs text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 underline"
          >
            {isFr ? "J'ai déjà installé l'app" : "I've already installed the app"}
          </button>
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
        title: isFr ? 'Installer Lumna sur votre iPhone' : 'Install Lumna on your iPhone',
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
            text: isFr ? 'Appuyez sur "Plus"' : 'Tap "More"',
            icon: Plus
          },
          {
            text: isFr ? 'Appuyez sur "Sur l\'écran d\'accueil"' : 'Tap "Add to Home Screen"',
          },
        ],
        screenshots: ['/pwa-screenshots/step1.png', '/pwa-screenshots/step2.png', '/pwa-screenshots/step3.png', '/pwa-screenshots/step4.png'],
      };

    case 'ios-other':
      return {
        title: isFr ? 'Installer Lumna sur votre iPhone' : 'Install Lumna on your iPhone',
        steps: [
          {
            text: isFr ? 'Copiez le lien et ouvrez-le dans Safari' : 'Copy the link and open it in Safari',
            iconSrc: '/safari-logo.jpeg',
          },
        ],
      };

    case 'android-chrome':
      return {
        title: isFr ? 'Installer Lumna sur votre téléphone' : 'Install Lumna on your phone',
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
        title: isFr ? 'Installer Lumna sur votre téléphone' : 'Install Lumna on your phone',
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
