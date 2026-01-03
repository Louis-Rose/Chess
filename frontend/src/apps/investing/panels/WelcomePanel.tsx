// Investing Welcome panel

import { useNavigate } from 'react-router-dom';
import { Briefcase, Eye, Calendar, TrendingUp, Loader2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { LoginButton } from '../../../components/LoginButton';

export function InvestingWelcomePanel() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center py-8 md:py-16">
        <h1 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-slate-100 text-center px-4">Track Your Investments</h1>
        <div className="flex items-start pt-6 md:pt-8 h-[72px] md:h-[144px]">
          <span className="text-7xl md:text-9xl opacity-15 leading-none">&#128200;</span>
        </div>
        <div className="flex flex-col items-center mt-6 md:mt-8 px-4">
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-3 text-center max-w-lg font-light tracking-wide">
            Monitor your portfolio performance.
          </p>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-8 md:mb-10 text-center max-w-lg font-light tracking-wide">
            Get insights to make better investment decisions.
          </p>
          <LoginButton />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">Your Investment Dashboard</h1>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Welcome{user?.name ? `, ${user.name}` : ''}!
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {/* My Portfolio */}
          <button
            onClick={() => navigate('/investing/portfolio')}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:border-green-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">My Portfolio</h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              View your holdings, track performance, and analyze your investment distribution.
            </p>
          </button>

          {/* My Watchlist */}
          <button
            onClick={() => navigate('/investing/watchlist')}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:border-blue-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Eye className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">My Watchlist</h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Manage the list of stocks you want to follow.
            </p>
          </button>

          {/* Earnings Calendar */}
          <button
            onClick={() => navigate('/investing/earnings')}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:border-amber-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Earnings Calendar</h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Track upcoming earnings releases for your holdings.
            </p>
          </button>

          {/* Financials */}
          <button
            onClick={() => navigate('/investing/financials')}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:border-purple-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Financials</h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              P/E ratios, market cap, and earnings growth for your watchlist.
            </p>
          </button>
        </div>
      </div>
    </>
  );
}
