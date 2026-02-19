import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';

type Language = 'en' | 'fr';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  tAll: (key: string) => { en: string; fr: string };
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
    'transactions.title': 'Transactions History',
    'transactions.addTransaction': 'Add transactions manually',
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
    'holdings.price': 'Share Price',
    'holdings.value': 'Value (EUR)',
    'holdings.weight': 'Weight',
    'holdings.gain': 'Gain',
    'holdings.held': 'Held',

    // Performance
    'performance.title': 'Portfolio Performance',
    'performance.cagr': 'Compound Annual Growth Rate (CAGR)',
    'performance.cagrFull': 'Compound Annual Growth Rate',
    'performance.cagrTooltip': 'The annualized rate of return, assuming profits are reinvested. Shows what your investment would grow at per year if growth was constant.',
    'performance.simpleReturn': 'Simple Return (SR)',
    'performance.simpleReturnTooltip': 'Total percentage gain or loss on your investment, calculated as (Current Value - Invested) / Invested.',
    'performance.twr': 'Time-Weighted Return (TWR)',
    'performance.twrFull': 'Time-Weighted Return',
    'performance.twrTooltip': 'Measures investment performance excluding the impact of deposits and withdrawals. Best for comparing portfolio manager performance.',
    'performance.mwr': 'Money-Weighted Return (MWR)',
    'performance.mwrFull': 'Money-Weighted Return',
    'performance.mwrTooltip': 'Measures your actual return including the timing and size of your deposits/withdrawals. Sensitive to when you add or withdraw money.',
    'performance.irr': 'Internal Rate of Return (IRR)',
    'performance.irrFull': 'Internal Rate of Return',
    'performance.irrTooltip': 'The annualized rate that makes the net present value of all cash flows equal to zero. Same calculation as MWR.',
    'performance.metricsInfoTitle': 'About Performance Metrics',
    'performance.metricsInfoText': 'Simple Return and CAGR do not account for intermediate cash flows (deposits/withdrawals). For portfolios with multiple transactions, TWR and MWR provide more accurate performance measures.',
    'performance.advancedMetrics': 'Advanced Performance Metrics',
    'performance.allTime': 'All Time',
    'performance.annualized': 'Annualized',
    'performance.srCagrExample': 'You invest €1,000 at the start of Year 0.\nAfter 1 year, you add €500.\nAfter 2 years, your portfolio is worth €1,815.\n\nSimple Return = (1815 - 1500) / 1500 = +21%\nCAGR = (1815 / 1500)^(1/2) - 1 = +10% per year\n\nNote: These metrics ignore WHEN you added the €500. They only compare total invested vs final value.',
    'performance.twrMwrExample': 'In January, you invest €10,000.\nBy June, it has grown to €11,000.\nYou then add €5,000.\nBy December, the total value is €17,000.\n\nTWR = (11000/10000) × (17000/16000) - 1 = +16.9%\n→ Measures pure investment performance by chaining sub-period returns.\n\nMWR = the rate r where: -10000 + (-5000)/(1+r)^0.5 + 17000/(1+r)^1 = 0 → r = +11.5%\n→ Your actual return, accounting for when you added money.\n\nNote: IRR is simply the annualized version of MWR.',
    'performance.perYear': '(per year)',
    'performance.showExample': 'Show example',
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

    // Chess
    'chess.myData': 'My Data',
    'chess.noData': 'No Data Available',
    'chess.searchPrompt': 'Search for a player using the sidebar to view their statistics.',
    'chess.eloTitle': 'Elo Rating & Games Played',
    'chess.dailyVolumeTitle': 'How many games should you play every day?',
    'chess.winRate': 'Win Rate',
    'chess.winRateFormula': 'Win rate = (wins + draws / 2) / total.',
    'chess.winRateFilter': 'Only game counts with at least 10 days of data are shown.',
    'chess.gamesPerDay': 'Games per day',
    'chess.gamePerDay': 'Game per day',
    'chess.daysOfData': 'days of data',
    'chess.gameNumberTitle': 'Which games are your best games?',
    'chess.gameNumber': 'Game number',
    'chess.nthGame': 'game of the day',
    'chess.nthGames': 'games of the day',
    'chess.bestResults': 'Best Results',
    'chess.worstResults': 'Worst Results',
    'chess.situation': 'Situation',
    'chess.games': 'games',
    'chess.loadingCached': 'Loading...',
    'chess.fetchingGamesFrom': 'Fetching your games from {month}...',
    'chess.fetchingGames': 'Fetching your games...',
    'chess.analyzedGames': 'Analyzed {count} game{plural}{username}.',
    'chess.after1Win': 'After 1 win',
    'chess.afterNWins': 'After {n} wins',
    'chess.after1Loss': 'After 1 loss',
    'chess.afterNLosses': 'After {n} losses',
    'chess.insufficientData': 'Insufficient data',
    'chess.analysisLoading': 'Analysis loading...',
    'chess.keepPlayingWhileWinning': 'Keep playing as long as you are winning.',
    'chess.keepPlayingUpTo': 'Keep playing up to {n} wins in a row.',
    'chess.stopAfter1Loss': 'Stop playing after 1 loss.',
    'chess.stopAfterNLosses': 'Stop playing after {n} losses in a row.',
    'chess.todaysData': "Today's data",
    'chess.currentSituation': 'Current situation',
    'chess.gamesPlayed': 'Games Played',
    'chess.currentStreak': 'Current streak',
    'chess.predictedWinRate': 'Predicted win rate',
    'chess.win': 'Win',
    'chess.wins': 'Wins',
    'chess.loss': 'Loss',
    'chess.losses': 'Losses',
    'chess.fromDailyVolume': 'from daily volume',
    'chess.fromStreak': 'from streak',
    'chess.welcomeTitle': 'Your AI chess assistant',
    'chess.welcomeBack': 'Welcome back, {name}!',
    'chess.welcome': 'Welcome!',
    'chess.welcomeSubtitle': 'Explore these powerful analysis tools to improve your game:',
    'chess.usernamePrompt': 'What is your Chess.com username?',
    'chess.usernamePlaceholder': 'Enter your chess.com username',
    'chess.fetchData': 'Fetch data',
    'chess.recentSearches': 'Recent searches',
    'chess.loginTitle': "Let's improve your chess rating!",
    'chess.loginSubtitle1': 'Analyze your Chess.com games.',
    'chess.loginSubtitle2': 'Get personalized insights to improve your play.',
    'chess.eloDescription': 'Track your Elo progression and games played over time.',
    'chess.todayTitle': "Next game's predicted win rate",
    'chess.bestGamesTitle': 'Best Games',
    'chess.bestGamesCardTitle': 'Are you better on your 1st, 3rd or 5th game of the day?',
    'chess.streaksCardTitle': 'Should you keep playing after a loss?',
    'chess.breaksCardTitle': 'Should you take breaks between games?',
    'chess.breakGap': 'Break duration',
    'chess.breakBetweenGames': 'between games',
    'chess.breakRegression': 'Linear regression',
    'chess.onboardingInstruction': 'Enter your Chess.com username to get your personalized data analysis.',
    'chess.onboardingDescription': 'LUMNA is an AI-powered chess analytics tool which provides insights on how and when you should play to improve faster, based on your complete games history.',
    'chess.navHome': 'Home',
    'chess.navElo': 'Elo',
    'chess.navToday': 'Today',
    'chess.navDailyVolume': 'Daily Volume',
    'chess.navBestGames': 'Best Games',
    'chess.navStreaks': 'Streaks',
    'chess.navBreaks': 'Breaks',
    'chess.logout': 'Log out',
    'chess.continue': 'Continue',
    'chess.selectLanguage': 'Select preferred language',
    'chess.explore': 'Click to explore',
    'chess.fetchingData': 'Your data is being fetched...',

    // Tax Calculator
    'taxCalc.title': 'Tax Calculator',
    'taxCalc.subtitle': 'CTO (31.4% on unrealized gains) vs Holding (IS 15% + flat tax 31.4%)',
    'taxCalc.parameters': 'Simulation Parameters',
    'taxCalc.years': 'Investment period (years)',
    'taxCalc.growthRate': 'Annual growth rate',
    'taxCalc.initialValue': 'Initial portfolio value (€)',
    'taxCalc.chartTitle': 'Portfolio Value Over Time',
    'taxCalc.tableTitle': 'Year-by-Year Breakdown',
    'taxCalc.yearCol': 'Year',
    'taxCalc.verdict': 'Final Comparison (Net in Pocket)',
    'taxCalc.totalTaxPaid': 'Total tax paid',
    'taxCalc.differenceLabel': 'Difference',

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
    'transactions.addTransaction': 'Ajouter des transactions manuellement',
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
    'holdings.price': 'Prix/action',
    'holdings.value': 'Valeur (EUR)',
    'holdings.weight': 'Poids',
    'holdings.gain': 'Gain',
    'holdings.held': 'Détenu',

    // Performance
    'performance.title': 'Performance du Portefeuille',
    'performance.cagr': 'Taux de Croissance Annuel Composé (TCAC)',
    'performance.cagrFull': 'Taux de Croissance Annuel Composé',
    'performance.cagrTooltip': 'Le taux de rendement annualisé, en supposant que les profits sont réinvestis. Montre à quel taux votre investissement croîtrait par an si la croissance était constante.',
    'performance.simpleReturn': 'Rendement Simple (RS)',
    'performance.simpleReturnTooltip': 'Pourcentage total de gain ou perte sur votre investissement, calculé comme (Valeur Actuelle - Investi) / Investi.',
    'performance.twr': 'Rendement Pondéré par le Temps (RPT)',
    'performance.twrFull': 'Rendement Pondéré par le Temps',
    'performance.twrTooltip': 'Mesure la performance des investissements en excluant l\'impact des dépôts et retraits. Idéal pour comparer les gestionnaires de portefeuille.',
    'performance.mwr': 'Rendement Pondéré par l\'Argent (RPA)',
    'performance.mwrFull': 'Rendement Pondéré par l\'Argent',
    'performance.mwrTooltip': 'Mesure votre rendement réel en tenant compte du timing et du montant de vos dépôts/retraits. Sensible au moment où vous ajoutez ou retirez de l\'argent.',
    'performance.irr': 'Taux de Rendement Interne (TRI)',
    'performance.irrFull': 'Taux de Rendement Interne',
    'performance.irrTooltip': 'Le taux annualisé qui rend la valeur actuelle nette de tous les flux de trésorerie égale à zéro. Même calcul que le RPA.',
    'performance.metricsInfoTitle': 'À propos des métriques de performance',
    'performance.metricsInfoText': 'Le Rendement Simple et le TCAC ne tiennent pas compte des flux de trésorerie intermédiaires (dépôts/retraits). Pour les portefeuilles avec plusieurs transactions, le TRI et le TRM fournissent des mesures de performance plus précises.',
    'performance.advancedMetrics': 'Métriques de Performance Avancées',
    'performance.allTime': 'Cumul',
    'performance.annualized': 'Annualisé',
    'performance.srCagrExample': 'Vous investissez 1 000€ au début de l\'année 0.\nAprès 1 an, vous ajoutez 500€.\nAprès 2 ans, votre portefeuille vaut 1 815€.\n\nRendement Simple = (1815 - 1500) / 1500 = +21%\nTCAC = (1815 / 1500)^(1/2) - 1 = +10% par an\n\nNote : Ces métriques ignorent QUAND vous avez ajouté les 500€. Elles comparent uniquement le total investi vs la valeur finale.',
    'performance.twrMwrExample': 'En janvier, vous investissez 10 000€.\nEn juin, la valeur est de 11 000€.\nVous ajoutez alors 5 000€.\nEn décembre, la valeur totale est de 17 000€.\n\nRPT = (11000/10000) × (17000/16000) - 1 = +16.9%\n→ Mesure la performance pure en chaînant les rendements des sous-périodes.\n\nRPA = le taux r où : -10000 + (-5000)/(1+r)^0.5 + 17000/(1+r)^1 = 0 → r = +11.5%\n→ Votre rendement réel, tenant compte du moment où vous avez ajouté de l\'argent.\n\nNote : Le TRI est simplement la version annualisée du RPA.',
    'performance.perYear': '(par an)',
    'performance.showExample': 'Voir exemple',
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

    // Chess
    'chess.myData': 'Mes Données',
    'chess.noData': 'Aucune donnée disponible',
    'chess.searchPrompt': 'Recherchez un joueur via la barre latérale pour voir ses statistiques.',
    'chess.eloTitle': 'Classement Elo & Parties Jouées',
    'chess.dailyVolumeTitle': 'Combien de parties jouer par jour ?',
    'chess.winRate': 'Taux de Victoire',
    'chess.winRateFormula': 'Taux de victoire = (Taux de victoires + 0.5 x Taux de nulles)',
    'chess.winRateFilter': 'Seuls les volumes avec au moins 10 jours de données sont affichés.',
    'chess.gamesPerDay': 'Parties par jour',
    'chess.gamePerDay': 'Partie par jour',
    'chess.daysOfData': 'jours de données',
    'chess.gameNumberTitle': 'Quelles sont vos meilleures parties ?',
    'chess.gameNumber': 'Numéro de partie',
    'chess.nthGame': 'partie de la journée',
    'chess.nthGames': 'parties de la journée',
    'chess.bestResults': 'Meilleurs résultats',
    'chess.worstResults': 'Pires résultats',
    'chess.situation': 'Situation',
    'chess.games': 'parties',
    'chess.loadingCached': 'Chargement...',
    'chess.fetchingGamesFrom': 'Récupération de vos parties de {month}...',
    'chess.fetchingGames': 'Récupération de vos parties...',
    'chess.analyzedGames': '{count} partie{plural}{username} analysée{plural}.',
    'chess.after1Win': 'Après 1 victoire',
    'chess.afterNWins': 'Après {n} victoires',
    'chess.after1Loss': 'Après 1 défaite',
    'chess.afterNLosses': 'Après {n} défaites',
    'chess.insufficientData': 'Données insuffisantes',
    'chess.analysisLoading': 'Analyse en cours...',
    'chess.keepPlayingWhileWinning': 'Continuez à jouer tant que vous gagnez.',
    'chess.keepPlayingUpTo': "Continuez à jouer jusqu'à {n} victoires d'affilée.",
    'chess.stopAfter1Loss': 'Arrêtez de jouer après 1 défaite.',
    'chess.stopAfterNLosses': 'Arrêtez de jouer après {n} défaites consécutives.',
    'chess.todaysData': "Données du jour",
    'chess.currentSituation': 'Situation actuelle',
    'chess.gamesPlayed': 'Parties jouées',
    'chess.currentStreak': 'Série en cours',
    'chess.predictedWinRate': 'Taux de victoire prédit',
    'chess.win': 'Victoire',
    'chess.wins': 'Victoires',
    'chess.loss': 'Défaite',
    'chess.losses': 'Défaites',
    'chess.fromDailyVolume': 'du volume quotidien',
    'chess.fromStreak': 'de la série',
    'chess.welcomeTitle': 'Votre assistant échecs IA',
    'chess.welcomeBack': 'Bienvenue, {name} !',
    'chess.welcome': 'Bienvenue !',
    'chess.welcomeSubtitle': 'Explorez ces outils d\'analyse pour améliorer votre jeu :',
    'chess.usernamePrompt': 'Quel est votre nom d\'utilisateur Chess.com ?',
    'chess.usernamePlaceholder': 'Entrez votre nom d\'utilisateur chess.com',
    'chess.fetchData': 'Récupérer',
    'chess.recentSearches': 'Recherches récentes',
    'chess.loginTitle': 'Améliorons votre classement aux échecs !',
    'chess.loginSubtitle1': 'Analysez vos parties Chess.com.',
    'chess.loginSubtitle2': 'Obtenez des insights personnalisés pour progresser.',
    'chess.eloDescription': 'Suivez votre progression Elo et vos parties jouées.',
    'chess.todayTitle': 'Taux de victoire prédit de votre prochaine partie',
    'chess.bestGamesTitle': 'Meilleures Parties',
    'chess.bestGamesCardTitle': 'Êtes-vous meilleur à votre 1ère, 3ème ou 5ème partie du jour ?',
    'chess.streaksCardTitle': 'Devriez-vous continuer à jouer après une défaite ?',
    'chess.breaksCardTitle': 'Devriez-vous faire des pauses entre vos parties ?',
    'chess.breakGap': 'Durée de la pause',
    'chess.breakBetweenGames': 'entre les parties',
    'chess.breakRegression': 'Régression linéaire',
    'chess.onboardingInstruction': 'Entrez votre nom d\'utilisateur Chess.com pour obtenir votre analyse personnalisée.',
    'chess.onboardingDescription': 'LUMNA est un outil d\'analyse IA qui vous indique quand et comment jouer pour progresser plus vite aux échecs, en se basant sur votre historique complet de parties.',
    'chess.navHome': 'Accueil',
    'chess.navElo': 'Elo',
    'chess.navToday': 'Aujourd\'hui',
    'chess.navDailyVolume': 'Volume quotidien',
    'chess.navBestGames': 'Meilleures parties',
    'chess.navStreaks': 'Séries',
    'chess.navBreaks': 'Pauses',
    'chess.logout': 'Se déconnecter',
    'chess.continue': 'Continuer',
    'chess.selectLanguage': 'Choisissez votre langue',
    'chess.explore': 'Cliquez pour explorer',
    'chess.fetchingData': 'Vos données sont en cours de chargement...',

    // Tax Calculator
    'taxCalc.title': 'Simulateur Fiscal',
    'taxCalc.subtitle': 'CTO (31.4% sur gains latents) vs Holding (IS 15% + PFU 31.4%)',
    'taxCalc.parameters': 'Paramètres de simulation',
    'taxCalc.years': 'Durée d\'investissement (années)',
    'taxCalc.growthRate': 'Taux de croissance annuel',
    'taxCalc.initialValue': 'Valeur initiale du portefeuille (€)',
    'taxCalc.chartTitle': 'Valeur du portefeuille dans le temps',
    'taxCalc.tableTitle': 'Détail année par année',
    'taxCalc.yearCol': 'Année',
    'taxCalc.verdict': 'Comparaison finale (Net en poche)',
    'taxCalc.totalTaxPaid': 'Impôts totaux payés',
    'taxCalc.differenceLabel': 'Différence',

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
    if (saved) return saved as Language;
    const browserLang = navigator.language || navigator.languages?.[0] || '';
    return browserLang.startsWith('fr') ? 'fr' : 'en';
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

  const tAll = (key: string) => ({
    en: translations.en[key] || key,
    fr: translations.fr[key] || key,
  });

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tAll }}>
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
