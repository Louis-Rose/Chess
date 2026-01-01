// Investing Welcome panel

import { useNavigate } from 'react-router-dom';
import { Briefcase, Eye, Loader2 } from 'lucide-react';
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
        <h1 className="text-3xl md:text-5xl font-bold text-slate-100 text-center px-4">Track Your Investments</h1>
        <div className="flex items-start pt-6 md:pt-8">
          <span className="text-7xl md:text-9xl opacity-15">&#128200;</span>
        </div>
        <div className="flex flex-col items-center mt-6 md:mt-8 px-4">
          <p className="text-lg md:text-xl text-slate-300 mb-3 text-center max-w-lg font-light tracking-wide">
            Monitor your portfolio performance.
          </p>
          <p className="text-lg md:text-xl text-slate-300 mb-8 md:mb-10 text-center max-w-lg font-light tracking-wide">
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
        <h1 className="text-4xl font-bold text-slate-100">Your Investment Dashboard</h1>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-100 mb-2">
            Welcome{user?.name ? `, ${user.name}` : ''}!
          </h2>
          <p className="text-slate-400">
            Explore your investment tools:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {/* My Portfolio */}
          <button
            onClick={() => navigate('/investing/portfolio')}
            className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-green-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">My Portfolio</h3>
            </div>
            <p className="text-slate-400 text-sm">
              View your holdings, track performance, and analyze your investment distribution.
            </p>
          </button>

          {/* Watchlist - Coming Soon */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 transition-colors opacity-60 text-left">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-slate-600 rounded-lg flex items-center justify-center">
                <Eye className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">Watchlist</h3>
              <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">Coming Soon</span>
            </div>
            <p className="text-slate-400 text-sm">
              Monitor stocks you're interested in. Get alerts on price movements and key metrics.
            </p>
          </div>
          {/* Watchlist - Original clickable version (commented out)
          <button
            onClick={() => navigate('/investing/watchlist')}
            className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-blue-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Eye className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">Watchlist</h3>
            </div>
            <p className="text-slate-400 text-sm">
              Monitor stocks you're interested in. Get alerts on price movements and key metrics.
            </p>
          </button>
          */}
        </div>
      </div>
    </>
  );
}
