// Watchlist panel

import { useState } from 'react';
import { Eye, Plus, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { LoginButton } from '../../../components/LoginButton';

export function WatchlistPanel() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [symbolInput, setSymbolInput] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>([]);

  const handleAddSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbolInput.trim() && !watchlist.includes(symbolInput.toUpperCase())) {
      setWatchlist([...watchlist, symbolInput.toUpperCase()]);
      setSymbolInput('');
    }
  };

  const handleRemoveSymbol = (symbol: string) => {
    setWatchlist(watchlist.filter(s => s !== symbol));
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center justify-center py-20">
          <Eye className="w-16 h-16 text-slate-500 mb-4" />
          <h2 className="text-2xl font-bold text-slate-300 mb-2">Sign In Required</h2>
          <p className="text-slate-500 mb-6">Please sign in to view your watchlist.</p>
          <LoginButton />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-center mb-8 mt-12">
        <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
      </div>

      <div className="flex flex-col items-center gap-2 mb-6">
        <h2 className="text-3xl font-bold text-slate-100">Watchlist</h2>
        <p className="text-slate-400 text-lg italic">Monitor stocks you're interested in</p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Add Symbol */}
        <div className="bg-slate-100 rounded-xl p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-4">Add Symbol</h3>
          <form onSubmit={handleAddSymbol} className="flex gap-2">
            <input
              type="text"
              placeholder="Enter stock symbol (e.g., AAPL)"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </form>
        </div>

        {/* Watchlist Table */}
        <div className="bg-slate-100 rounded-xl p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-4">Your Watchlist</h3>
          {watchlist.length === 0 ? (
            <div className="text-center py-12">
              <Eye className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-500">Your watchlist is empty.</p>
              <p className="text-slate-400 text-sm mt-2">
                Add symbols above to start tracking stocks.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {watchlist.map((symbol) => (
                <div
                  key={symbol}
                  className="flex items-center justify-between bg-white p-4 rounded-lg"
                >
                  <div>
                    <p className="font-bold text-slate-800">{symbol}</p>
                    <p className="text-slate-500 text-sm">Stock data coming soon</p>
                  </div>
                  <button
                    onClick={() => handleRemoveSymbol(symbol)}
                    className="text-slate-400 hover:text-red-500 p-2"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
