// Landing page - app selector

import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoginButton } from '../components/LoginButton';

export function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-slate-800 flex flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold text-slate-100 mb-4 text-center">
        Improve Your Skills
      </h1>
      <p className="text-xl text-slate-400 mb-12 text-center max-w-lg">
        Data-driven insights to help you master chess and investing
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl w-full">
        {/* Investing Card */}
        <Link
          to="/investing"
          className="bg-slate-700 p-8 rounded-2xl hover:bg-slate-600 transition-all hover:scale-105 group"
        >
          <div className="text-7xl mb-6 text-center">&#128200;</div>
          <h2 className="text-2xl font-bold text-white text-center mb-3">Investing</h2>
          <p className="text-slate-400 text-center">
            Track your portfolio performance, manage your watchlist, and discover investment opportunities.
          </p>
          <div className="mt-6 text-center">
            <span className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg group-hover:bg-green-500 transition-colors">
              Open Investing App
            </span>
          </div>
        </Link>

        {/* Chess Card */}
        <Link
          to="/chess"
          className="bg-slate-700 p-8 rounded-2xl hover:bg-slate-600 transition-all hover:scale-105 group"
        >
          <div className="text-7xl mb-6 text-center">&#9822;</div>
          <h2 className="text-2xl font-bold text-white text-center mb-3">Chess</h2>
          <p className="text-slate-400 text-center">
            Analyze your Chess.com games, track your ELO progression, and get personalized insights to improve your play.
          </p>
          <div className="mt-6 text-center">
            <span className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg group-hover:bg-blue-500 transition-colors">
              Open Chess App
            </span>
          </div>
        </Link>
      </div>

      {!isAuthenticated && (
        <div className="mt-16 text-center">
          <p className="text-slate-400 mb-4">Sign in to save your preferences</p>
          <LoginButton />
        </div>
      )}

      {isAuthenticated && (
        <div className="mt-16 text-center">
          <p className="text-slate-500 text-sm">
            You're signed in. Choose an app above to get started.
          </p>
        </div>
      )}

      <footer className="mt-auto pt-16">
        <Link
          to="/cgu"
          className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
        >
          Mentions Légales, CGUs & Confidentialité
        </Link>
      </footer>
    </div>
  );
}
