// PWA Install Prompt - shows device-specific instructions for installing the app

import { useState, useEffect } from 'react';
import { X, Share, MoreVertical, Plus, Download } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type Platform = 'ios-safari' | 'ios-other' | 'android-chrome' | 'android-other' | 'desktop' | 'unknown';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
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

export function PWAInstallPrompt({ className = '' }: PWAInstallPromptProps) {
  const { language } = useLanguage();
  const [dismissed, setDismissed] = useState(true); // Start hidden until we check
  const [platform, setPlatform] = useState<Platform>('unknown');

  useEffect(() => {
    // Check if already installed or dismissed
    if (isStandalone()) {
      setDismissed(true);
      return;
    }

    const wasDismissed = localStorage.getItem('pwa-prompt-dismissed');
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    setPlatform(detectPlatform());
    setDismissed(false);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('pwa-prompt-dismissed', 'true');
    setDismissed(true);
  };

  if (dismissed) return null;

  const content = getContent(platform, language);
  if (!content) return null;

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
        <div>
          <h3 className="font-semibold text-green-900 dark:text-green-100 mb-1">
            {content.title}
          </h3>
          <div className="text-sm text-green-800 dark:text-green-200 space-y-1">
            {content.steps.map((step, i) => (
              <p key={i} className="flex items-center gap-2">
                <span className="font-medium">{i + 1}.</span>
                {step.icon && <step.icon className="w-4 h-4 inline flex-shrink-0" />}
                <span>{step.text}</span>
              </p>
            ))}
          </div>
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
      };

    case 'ios-other':
      return {
        title: isFr ? 'Installer l\'app sur votre iPhone' : 'Install app on your iPhone',
        steps: [
          {
            text: isFr ? 'Ouvrez cette page dans Safari' : 'Open this page in Safari',
          },
          {
            text: isFr ? 'Appuyez sur Partager → "Sur l\'écran d\'accueil"' : 'Tap Share → "Add to Home Screen"',
            icon: Share
          },
        ],
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
