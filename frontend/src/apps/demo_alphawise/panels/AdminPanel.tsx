// Admin panel for managing the AlphaWise model portfolio

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, Plus, Trash2, RefreshCw, AlertCircle, Check, Settings } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { getCompanyLogoUrl } from '../../investing/utils/companyLogos';

interface ModelStock {
  id: number;
  ticker: string;
  allocation_pct: number;
  created_at: string;
  updated_at: string;
}

interface ModelPortfolioAdminData {
  stocks: ModelStock[];
  total_allocation: number;
}

const fetchModelPortfolioAdmin = async (): Promise<ModelPortfolioAdminData> => {
  const response = await axios.get('/api/demo/admin/model-portfolio');
  return response.data;
};

const addStock = async (data: { ticker: string; allocation_pct: number }) => {
  const response = await axios.post('/api/demo/admin/model-portfolio', data);
  return response.data;
};

const updateStock = async ({ id, allocation_pct }: { id: number; allocation_pct: number }) => {
  const response = await axios.put(`/api/demo/admin/model-portfolio/${id}`, { allocation_pct });
  return response.data;
};

const deleteStock = async (id: number) => {
  const response = await axios.delete(`/api/demo/admin/model-portfolio/${id}`);
  return response.data;
};

const resetPortfolio = async () => {
  const response = await axios.post('/api/demo/admin/model-portfolio/reset');
  return response.data;
};

export function AdminPanel() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [newTicker, setNewTicker] = useState('');
  const [newAllocation, setNewAllocation] = useState('5');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAllocation, setEditAllocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch model portfolio
  const { data, isLoading, isError } = useQuery({
    queryKey: ['model-portfolio-admin'],
    queryFn: fetchModelPortfolioAdmin,
    retry: 1,
  });

  // Mutations
  const addMutation = useMutation({
    mutationFn: addStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-portfolio-admin'] });
      queryClient.invalidateQueries({ queryKey: ['model-portfolio'] });
      setNewTicker('');
      setNewAllocation('5');
      setSuccess(language === 'fr' ? 'Action ajoutée' : 'Stock added');
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || 'Failed to add stock');
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-portfolio-admin'] });
      queryClient.invalidateQueries({ queryKey: ['model-portfolio'] });
      setEditingId(null);
      setSuccess(language === 'fr' ? 'Allocation mise à jour' : 'Allocation updated');
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || 'Failed to update');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-portfolio-admin'] });
      queryClient.invalidateQueries({ queryKey: ['model-portfolio'] });
      setSuccess(language === 'fr' ? 'Action supprimée' : 'Stock removed');
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || 'Failed to delete');
    },
  });

  const resetMutation = useMutation({
    mutationFn: resetPortfolio,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-portfolio-admin'] });
      queryClient.invalidateQueries({ queryKey: ['model-portfolio'] });
      setSuccess(language === 'fr' ? 'Portefeuille réinitialisé' : 'Portfolio reset');
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || 'Failed to reset');
    },
  });

  const handleAddStock = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const ticker = newTicker.trim().toUpperCase();
    const allocation = parseFloat(newAllocation);

    if (!ticker) {
      setError(language === 'fr' ? 'Ticker requis' : 'Ticker required');
      return;
    }
    if (isNaN(allocation) || allocation <= 0 || allocation > 100) {
      setError(language === 'fr' ? 'Allocation invalide (0-100)' : 'Invalid allocation (0-100)');
      return;
    }

    addMutation.mutate({ ticker, allocation_pct: allocation });
  };

  const handleUpdateAllocation = (id: number) => {
    setError(null);
    const allocation = parseFloat(editAllocation);
    if (isNaN(allocation) || allocation <= 0 || allocation > 100) {
      setError(language === 'fr' ? 'Allocation invalide (0-100)' : 'Invalid allocation (0-100)');
      return;
    }
    updateMutation.mutate({ id, allocation_pct: allocation });
  };

  const startEditing = (stock: ModelStock) => {
    setEditingId(stock.id);
    setEditAllocation(stock.allocation_pct.toString());
  };

  // Check if user is admin
  if (!user?.is_admin) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          {language === 'fr' ? 'Accès refusé' : 'Access Denied'}
        </h2>
        <p className="text-slate-500">
          {language === 'fr' ? 'Cette page est réservée aux administrateurs.' : 'This page is for administrators only.'}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          {language === 'fr' ? 'Erreur' : 'Error'}
        </h2>
        <p className="text-slate-500">
          {language === 'fr' ? 'Impossible de charger le portefeuille.' : 'Failed to load portfolio.'}
        </p>
      </div>
    );
  }

  const stocks = data?.stocks ?? [];
  const totalAllocation = data?.total_allocation ?? 0;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {language === 'fr' ? 'Administration du Portefeuille Modèle' : 'Model Portfolio Admin'}
            </h1>
            <p className="text-sm text-slate-500">
              {language === 'fr' ? 'Gérer la composition du portefeuille AlphaWise' : 'Manage AlphaWise portfolio composition'}
            </p>
          </div>
        </div>
        <button
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {resetMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {language === 'fr' ? 'Réinitialiser' : 'Reset to Default'}
        </button>
      </div>

      {/* Success/Error messages */}
      {success && (
        <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-400">
          <Check className="w-4 h-4" />
          {success}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400">
          <AlertCircle className="w-4 h-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-100">×</button>
        </div>
      )}

      {/* Add Stock Form */}
      <div className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-4 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {language === 'fr' ? 'Ajouter une action' : 'Add Stock'}
        </h2>
        <form onSubmit={handleAddStock} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">
              {language === 'fr' ? 'Ticker' : 'Ticker'}
            </label>
            <input
              type="text"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              placeholder="AAPL"
              className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="w-32">
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">
              {language === 'fr' ? 'Allocation (%)' : 'Allocation (%)'}
            </label>
            <input
              type="number"
              value={newAllocation}
              onChange={(e) => setNewAllocation(e.target.value)}
              min="0.1"
              max="100"
              step="0.1"
              className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {addMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {language === 'fr' ? 'Ajouter' : 'Add'}
          </button>
        </form>
      </div>

      {/* Total Allocation */}
      <div className={`mb-4 p-3 rounded-lg flex items-center justify-between ${
        totalAllocation === 100
          ? 'bg-green-500/20 border border-green-500/30 text-green-400'
          : 'bg-yellow-500/20 border border-yellow-500/30 text-yellow-400'
      }`}>
        <span className="font-medium">
          {language === 'fr' ? 'Allocation totale' : 'Total Allocation'}
        </span>
        <span className="font-bold text-lg">
          {totalAllocation}%
          {totalAllocation !== 100 && (
            <span className="ml-2 text-sm font-normal">
              ({totalAllocation < 100 ? `${(100 - totalAllocation).toFixed(1)}% ${language === 'fr' ? 'manquant' : 'remaining'}` : `${(totalAllocation - 100).toFixed(1)}% ${language === 'fr' ? 'en excès' : 'over'}`})
            </span>
          )}
        </span>
      </div>

      {/* Stocks Table */}
      <div className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-700">
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 dark:text-slate-300">
                {language === 'fr' ? 'Action' : 'Stock'}
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-slate-600 dark:text-slate-300">
                {language === 'fr' ? 'Allocation' : 'Allocation'}
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-slate-600 dark:text-slate-300">
                {language === 'fr' ? 'Actions' : 'Actions'}
              </th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((stock) => {
              const logoUrl = getCompanyLogoUrl(stock.ticker);
              const isEditing = editingId === stock.id;

              return (
                <tr key={stock.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                        {logoUrl ? (
                          <img src={logoUrl} alt={stock.ticker} className="w-6 h-6 object-contain" />
                        ) : (
                          <span className="text-xs font-bold text-slate-500">{stock.ticker.slice(0, 2)}</span>
                        )}
                      </div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{stock.ticker}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-2">
                        <input
                          type="number"
                          value={editAllocation}
                          onChange={(e) => setEditAllocation(e.target.value)}
                          min="0.1"
                          max="100"
                          step="0.1"
                          className="w-20 px-2 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-right text-slate-900 dark:text-slate-100"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateAllocation(stock.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <span className="text-slate-500">%</span>
                        <button
                          onClick={() => handleUpdateAllocation(stock.id)}
                          disabled={updateMutation.isPending}
                          className="p-1 text-green-500 hover:text-green-400"
                        >
                          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditing(stock)}
                        className="text-slate-700 dark:text-slate-300 hover:text-blue-500 transition-colors"
                      >
                        {stock.allocation_pct}%
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteMutation.mutate(stock.id)}
                      disabled={deleteMutation.isPending}
                      className="p-2 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title={language === 'fr' ? 'Supprimer' : 'Delete'}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
            {stocks.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  {language === 'fr' ? 'Aucune action dans le portefeuille' : 'No stocks in portfolio'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
