import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';

type Language = 'en' | 'fr';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Portfolio
    'portfolio.title': 'My Portfolio',
    'portfolio.subtitle': 'Track your investment transactions and performance',
    'portfolio.editButton': 'Edit transactions',
    'portfolio.privateMode': 'Private mode',
    'portfolio.totalValue': 'Current Value (EUR)',
    'portfolio.costBasis': 'Invested Capital (EUR)',
    'portfolio.totalGain': 'Total Gain',

    // Accounts
    'accounts.title': 'Investment Accounts',
    'accounts.addAccount': 'Add Account',
    'accounts.accountType': 'Account Type',
    'accounts.bank': 'Bank / Broker',
    'accounts.selectType': 'Select type...',
    'accounts.selectBank': 'Select bank...',
    'accounts.create': 'Create',
    'accounts.cancel': 'Cancel',
    'accounts.noAccounts': 'No accounts yet. Create an account to track fees.',
    'accounts.type': 'Type',
    'accounts.tax': 'tax',
    'accounts.fees': 'Fees',

    // Transactions
    'transactions.title': 'Transaction History',
    'transactions.addTransaction': 'Add Manually',
    'transactions.importRevolut': 'Import directly from Revolut',
    'transactions.close': 'Close',
    'transactions.allStocks': 'All stocks',
    'transactions.searchStocks': 'Search stocks...',
    'transactions.buy': 'Buy',
    'transactions.sell': 'Sell',
    'transactions.quantity': 'Quantity',
    'transactions.year': 'Year',
    'transactions.month': 'Month',
    'transactions.day': 'Day',
    'transactions.noAccount': 'No account',
    'transactions.add': 'Add',
    'transactions.done': 'Done',
    'transactions.priceNote': 'The price will be fetched automatically from market data for the selected date.',
    'transactions.selectAccount': 'Select an account to track fees.',
    'transactions.noTransactions': 'No transactions yet. Add your first transaction to get started.',
    'transactions.shares': 'shares',

    // Holdings
    'holdings.title': 'Current Holdings',
    'holdings.stock': 'Stock',
    'holdings.shares': 'Shares',
    'holdings.price': 'Price',
    'holdings.value': 'Value (EUR)',
    'holdings.weight': 'Weight',
    'holdings.gain': 'Gain',

    // Performance
    'performance.title': 'Portfolio Performance',
    'performance.cagr': 'CAGR',
    'performance.year': 'year',
    'performance.years': 'years',
    'performance.month': 'month',
    'performance.months': 'months',
    'performance.since': 'Since',
    'performance.totalReturn': 'Portfolio Gains',
    'performance.benchmark.qqq': 'Benchmark: QQQ (Nasdaq-100)',
    'performance.benchmark.sp500': 'Benchmark: S&P 500',
    'performance.portfolio': 'Portfolio',
    'performance.invested': 'Invested capital',

    // Common
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.signInRequired': 'Sign In Required',
    'common.signInMessage': 'Please sign in to view your portfolio.',
  },
  fr: {
    // Portfolio
    'portfolio.title': 'Mon Portefeuille',
    'portfolio.subtitle': 'Suivez vos transactions et performances d\'investissement',
    'portfolio.editButton': 'Modifier les transactions',
    'portfolio.privateMode': 'Mode privé',
    'portfolio.totalValue': 'Valeur Actuelle (EUR)',
    'portfolio.costBasis': 'Capital Investi (EUR)',
    'portfolio.totalGain': 'Gain Total',

    // Accounts
    'accounts.title': 'Comptes d\'Investissement',
    'accounts.addAccount': 'Ajouter un compte',
    'accounts.accountType': 'Type de compte',
    'accounts.bank': 'Banque / Courtier',
    'accounts.selectType': 'Sélectionner...',
    'accounts.selectBank': 'Sélectionner...',
    'accounts.create': 'Créer',
    'accounts.cancel': 'Annuler',
    'accounts.noAccounts': 'Aucun compte. Créez un compte pour suivre les frais.',
    'accounts.type': 'Type',
    'accounts.tax': 'impôt',
    'accounts.fees': 'Frais',

    // Transactions
    'transactions.title': 'Historique des Transactions',
    'transactions.addTransaction': 'Ajouter manuellement',
    'transactions.importRevolut': 'Importer directement depuis Revolut',
    'transactions.close': 'Fermer',
    'transactions.allStocks': 'Toutes les actions',
    'transactions.searchStocks': 'Rechercher...',
    'transactions.buy': 'Achat',
    'transactions.sell': 'Vente',
    'transactions.quantity': 'Quantité',
    'transactions.year': 'Année',
    'transactions.month': 'Mois',
    'transactions.day': 'Jour',
    'transactions.noAccount': 'Aucun compte',
    'transactions.add': 'Ajouter',
    'transactions.done': 'Terminé',
    'transactions.priceNote': 'Le prix sera récupéré automatiquement depuis les données de marché.',
    'transactions.selectAccount': 'Sélectionnez un compte pour suivre les frais.',
    'transactions.noTransactions': 'Aucune transaction. Ajoutez votre première transaction.',
    'transactions.shares': 'actions',

    // Holdings
    'holdings.title': 'Positions Actuelles',
    'holdings.stock': 'Action',
    'holdings.shares': 'Actions',
    'holdings.price': 'Prix',
    'holdings.value': 'Valeur (EUR)',
    'holdings.weight': 'Poids',
    'holdings.gain': 'Gain',

    // Performance
    'performance.title': 'Performance du Portefeuille',
    'performance.cagr': 'TCAC',
    'performance.year': 'an',
    'performance.years': 'ans',
    'performance.month': 'mois',
    'performance.months': 'mois',
    'performance.since': 'Depuis le',
    'performance.totalReturn': 'Gains du portefeuille',
    'performance.benchmark.qqq': 'Indice: QQQ (Nasdaq-100)',
    'performance.benchmark.sp500': 'Indice: S&P 500',
    'performance.portfolio': 'Portefeuille',
    'performance.invested': 'Capital investi',

    // Common
    'common.loading': 'Chargement...',
    'common.error': 'Erreur',
    'common.signInRequired': 'Connexion Requise',
    'common.signInMessage': 'Veuillez vous connecter pour voir votre portefeuille.',
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    return (saved as Language) || 'en';
  });

  // Record language to backend for analytics (called when user changes language)
  const recordLanguage = (lang: Language) => {
    axios.post('/api/language', { language: lang }).catch(() => {});
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
    recordLanguage(lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
