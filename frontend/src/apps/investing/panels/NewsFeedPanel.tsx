// News Feed panel - aggregated YouTube videos from watchlist companies

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, Youtube, Calendar, FileText, ChevronDown, ChevronUp, RefreshCw, Eye, X, Plus, Search, Info } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { searchAllStocks, findStockByTicker, type Stock, type IndexFilter } from '../utils/allStocks';
import { getCompanyLogoUrl } from '../utils/companyLogos';

interface Video {
  video_id: string;
  channel_name: string;
  title: string;
  description?: string;
  thumbnail_url: string;
  published_at: string;
  url: string;
}

interface NewsFeedResponse {
  videos: Video[];
  total: number;
  from_cache: boolean;
}

interface VideoWithCompany extends Video {
  ticker: string;
  companyName: string;
}

const fetchWatchlist = async (): Promise<{ symbols: string[] }> => {
  const response = await axios.get('/api/investing/watchlist');
  return response.data;
};

const addToWatchlist = async (symbol: string): Promise<void> => {
  await axios.post('/api/investing/watchlist', { symbol });
};

const removeFromWatchlist = async (symbol: string): Promise<void> => {
  await axios.delete(`/api/investing/watchlist/${symbol}`);
};

const fetchNewsFeed = async (ticker: string, companyName: string): Promise<NewsFeedResponse> => {
  const response = await axios.get('/api/investing/news-feed', {
    params: { ticker, company_name: companyName, limit: 10 }
  });
  return response.data;
};

function formatDate(dateStr: string, language: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) {
    return language === 'fr' ? "À l'instant" : 'Just now';
  } else if (diffHours < 24) {
    return language === 'fr' ? `Il y a ${diffHours}h` : `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return language === 'fr' ? `Il y a ${diffDays}j` : `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}

function getTranscriptUrl(videoId: string): string {
  // Link to YouTube video with transcript parameter
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function NewsFeedPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();
  const [videoFilter, setVideoFilter] = useState<'1M' | '3M' | 'ALL'>('ALL');
  const [selectedVideo, setSelectedVideo] = useState<VideoWithCompany | null>(null);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'combined' | 'by-company'>('combined');

  // Stock search state
  const [stockSearch, setStockSearch] = useState('');
  const [stockResults, setStockResults] = useState<Stock[]>([]);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [indexFilter] = useState<IndexFilter>({ sp500: true, stoxx600: true });
  const stockDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch watchlist
  const { data: watchlistData, isLoading: watchlistLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
    enabled: isAuthenticated,
  });

  const watchlist = watchlistData?.symbols ?? [];

  // Mutations for add/remove
  const addMutation = useMutation({
    mutationFn: addToWatchlist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist-news-feed'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeFromWatchlist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist-news-feed'] });
    },
  });

  // Stock search effect
  useEffect(() => {
    const results = searchAllStocks(stockSearch, indexFilter);
    setStockResults(results);
    setShowStockDropdown(results.length > 0 && stockSearch.length > 0);
  }, [stockSearch, indexFilter]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stockDropdownRef.current && !stockDropdownRef.current.contains(event.target as Node)) {
        setShowStockDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectStock = (stock: Stock) => {
    if (!watchlist.includes(stock.ticker)) {
      addMutation.mutate(stock.ticker);
    }
    setStockSearch('');
    setShowStockDropdown(false);
  };

  const handleRemoveStock = (ticker: string) => {
    removeMutation.mutate(ticker);
  };

  // Fetch news for all watchlist companies
  const { data: allNewsData, isLoading: newsLoading, refetch: refetchNews, isFetching: newsFetching } = useQuery({
    queryKey: ['watchlist-news-feed', watchlist],
    queryFn: async () => {
      if (watchlist.length === 0) return [];

      const results = await Promise.all(
        watchlist.map(async (ticker) => {
          const stock = findStockByTicker(ticker);
          const companyName = stock?.name || ticker;
          try {
            const response = await fetchNewsFeed(ticker, companyName);
            return {
              ticker,
              companyName,
              videos: response.videos,
            };
          } catch {
            return { ticker, companyName, videos: [] };
          }
        })
      );
      return results;
    },
    enabled: isAuthenticated && watchlist.length > 0,
    staleTime: 1000 * 60 * 15, // 15 minutes
  });

  // Combine all videos with company info
  const allVideos: VideoWithCompany[] = (allNewsData || []).flatMap((company) =>
    company.videos.map((video) => ({
      ...video,
      ticker: company.ticker,
      companyName: company.companyName,
    }))
  );

  // Sort by date (newest first)
  const sortedVideos = [...allVideos].sort(
    (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  );

  // Filter videos by time period
  const now = new Date();
  const filteredVideos = sortedVideos.filter((video) => {
    if (videoFilter === 'ALL') return true;
    const publishedDate = new Date(video.published_at);
    const diffDays = Math.floor((now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24));
    if (videoFilter === '1M') return diffDays <= 30;
    if (videoFilter === '3M') return diffDays <= 90;
    return true;
  });

  // Group videos by company for by-company view
  const videosByCompany = watchlist.map((ticker) => {
    const stock = findStockByTicker(ticker);
    const companyName = stock?.name || ticker;
    const companyVideos = filteredVideos.filter((v) => v.ticker === ticker);
    return { ticker, companyName, videos: companyVideos };
  });

  const toggleCompany = (ticker: string) => {
    const newExpanded = new Set(expandedCompanies);
    if (newExpanded.has(ticker)) {
      newExpanded.delete(ticker);
    } else {
      newExpanded.add(ticker);
    }
    setExpandedCompanies(newExpanded);
  };

  // Loading state
  if (authLoading || (isAuthenticated && watchlistLoading)) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-red-500 animate-spin mb-4" />
        <p className="text-slate-400">{language === 'fr' ? 'Chargement...' : 'Loading...'}</p>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="md:animate-in md:fade-in md:slide-in-from-bottom-4 md:duration-700">
        <div className="flex flex-col items-center gap-2 mb-6 mt-8">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            {language === 'fr' ? 'Fil d\'actualités' : 'News Feed'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg italic">
            {language === 'fr' ? 'Vidéos YouTube de chaines financières vérifiées' : 'YouTube videos from verified financial channels'}
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-8 text-center">
            <Youtube className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              {language === 'fr'
                ? 'Connectez-vous pour voir les actualités de votre watchlist'
                : 'Sign in to see news from your watchlist'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="md:animate-in md:fade-in md:slide-in-from-bottom-4 md:duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          {language === 'fr' ? 'Fil d\'actualités' : 'News Feed'}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-lg italic">
          {language === 'fr' ? 'Vidéos YouTube de votre watchlist' : 'YouTube videos from your watchlist'}
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Tracked Companies Section */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 shadow-sm">
          {/* Header with title and info tooltip */}
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {language === 'fr' ? 'Entreprises suivies' : 'Tracked Companies'}
            </h3>
            <span className="text-slate-500 dark:text-slate-400 text-sm">
              ({watchlist.length})
            </span>
            {/* Info tooltip */}
            <div className="relative group ml-1">
              <Info className="w-4 h-4 text-slate-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 w-72 text-left whitespace-pre-line pointer-events-none">
                {language === 'fr'
                  ? "Le fil d'actualités agrège les vidéos YouTube de toutes les entreprises de votre watchlist.\n\n• Ajoutez des entreprises avec la barre de recherche\n• Supprimez-les en cliquant sur le ✕\n• Les vidéos proviennent de chaînes financières vérifiées (CNBC, Bloomberg, Yahoo Finance...)\n• Cliquez sur une vidéo pour la regarder"
                  : "The news feed aggregates YouTube videos from all companies in your watchlist.\n\n• Add companies using the search bar\n• Remove them by clicking the ✕\n• Videos come from verified financial channels (CNBC, Bloomberg, Yahoo Finance...)\n• Click a video to watch it"}
              </div>
            </div>
          </div>

          {/* Company chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            {watchlist.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-sm italic">
                {language === 'fr'
                  ? 'Aucune entreprise suivie. Ajoutez-en ci-dessous.'
                  : 'No companies tracked. Add some below.'}
              </p>
            ) : (
              watchlist.map((ticker) => {
                const stock = findStockByTicker(ticker);
                const displayName = stock?.name || ticker;
                const logoUrl = getCompanyLogoUrl(ticker);

                return (
                  <div
                    key={ticker}
                    className="flex items-center gap-2 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-full pl-1 pr-2 py-1 group hover:border-blue-300 dark:hover:border-blue-500 transition-colors"
                  >
                    {/* Logo */}
                    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-500">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt={ticker}
                          className="w-5 h-5 object-contain"
                          onError={(e) => {
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              parent.innerHTML = `<span class="text-[8px] font-bold text-slate-500">${ticker.slice(0, 2)}</span>`;
                            }
                          }}
                        />
                      ) : (
                        <span className="text-[8px] font-bold text-slate-500">{ticker.slice(0, 2)}</span>
                      )}
                    </div>
                    {/* Ticker */}
                    <button
                      onClick={() => navigate(`/investing/stock/${ticker}`)}
                      className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      title={displayName}
                    >
                      {ticker}
                    </button>
                    {/* Remove button */}
                    <button
                      onClick={() => handleRemoveStock(ticker)}
                      disabled={removeMutation.isPending}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                      title={language === 'fr' ? 'Supprimer' : 'Remove'}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Add company search */}
          <div className="relative" ref={stockDropdownRef}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={language === 'fr' ? 'Ajouter une entreprise...' : 'Add a company...'}
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  onFocus={() => stockSearch && setShowStockDropdown(stockResults.length > 0)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              {addMutation.isPending && (
                <div className="flex items-center px-3">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                </div>
              )}
            </div>

            {/* Search dropdown */}
            {showStockDropdown && stockResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-500 rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
                {stockResults.map((stock) => {
                  const isInWatchlist = watchlist.includes(stock.ticker);
                  const logoUrl = getCompanyLogoUrl(stock.ticker);
                  return (
                    <button
                      key={stock.ticker}
                      type="button"
                      onClick={() => handleSelectStock(stock)}
                      disabled={isInWatchlist}
                      className={`w-full px-4 py-2 text-left flex items-center gap-3 border-b border-slate-100 dark:border-slate-600 last:border-b-0 ${
                        isInWatchlist
                          ? 'bg-slate-50 dark:bg-slate-600 text-slate-400 cursor-not-allowed'
                          : 'hover:bg-blue-50 dark:hover:bg-slate-600'
                      }`}
                    >
                      <div className="w-6 h-6 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-200">
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt={stock.ticker}
                            className="w-5 h-5 object-contain"
                            onError={(e) => {
                              const parent = e.currentTarget.parentElement;
                              if (parent) {
                                parent.innerHTML = `<span class="text-[8px] font-bold text-slate-500">${stock.ticker.slice(0, 2)}</span>`;
                              }
                            }}
                          />
                        ) : (
                          <span className="text-[8px] font-bold text-slate-500">{stock.ticker.slice(0, 2)}</span>
                        )}
                      </div>
                      <span className="font-bold text-slate-800 dark:text-slate-100 w-16">{stock.ticker}</span>
                      <span className="text-slate-600 dark:text-slate-300 text-sm truncate">{stock.name}</span>
                      {isInWatchlist && (
                        <span className="text-xs text-slate-400 ml-auto flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {language === 'fr' ? 'Suivi' : 'Tracked'}
                        </span>
                      )}
                      {!isInWatchlist && (
                        <Plus className="w-4 h-4 text-blue-500 ml-auto" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Empty state when no companies */}
        {watchlist.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-8 text-center">
            <Youtube className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-300 mb-2">
              {language === 'fr'
                ? 'Ajoutez des entreprises ci-dessus pour voir leurs actualités'
                : 'Add companies above to see their news'}
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {language === 'fr'
                ? 'Les vidéos des chaînes financières les plus populaires seront affichées ici'
                : 'Videos from popular financial channels will be displayed here'}
            </p>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-4">
              {/* View mode toggle */}
              <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-500">
                <button
                  onClick={() => setViewMode('combined')}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === 'combined'
                      ? 'bg-red-500 text-white'
                      : 'bg-white dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-500'
                  }`}
                >
                  {language === 'fr' ? 'Combiné' : 'Combined'}
                </button>
                <button
                  onClick={() => setViewMode('by-company')}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === 'by-company'
                      ? 'bg-red-500 text-white'
                      : 'bg-white dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-500'
                  }`}
                >
                  {language === 'fr' ? 'Par entreprise' : 'By Company'}
                </button>
              </div>

              {/* Time filter */}
              <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-500">
                {(['1M', '3M', 'ALL'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setVideoFilter(filter)}
                    className={`px-2 py-1.5 text-sm font-medium transition-colors ${
                      videoFilter === filter
                        ? 'bg-red-500 text-white'
                        : 'bg-white dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-500'
                    }`}
                  >
                    {filter === 'ALL' ? (language === 'fr' ? 'Tout' : 'All') : filter}
                  </button>
                ))}
              </div>

              {/* Refresh button */}
              <button
                onClick={() => refetchNews()}
                disabled={newsFetching}
                className="ml-auto text-slate-500 hover:text-red-600 flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${newsFetching ? 'animate-spin' : ''}`} />
                {language === 'fr' ? 'Actualiser' : 'Refresh'}
              </button>
            </div>

            {/* Loading news */}
            {newsLoading ? (
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-8">
                <div className="flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                </div>
              </div>
            ) : viewMode === 'combined' ? (
              /* Combined view */
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-600 flex items-center gap-3">
                  <Youtube className="w-5 h-5 text-red-500" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {language === 'fr' ? 'Toutes les vidéos' : 'All Videos'}
                  </h3>
                  <span className="text-slate-500 dark:text-slate-400 text-sm">
                    ({filteredVideos.length})
                  </span>
                </div>

                {filteredVideos.length === 0 ? (
                  <div className="p-8 text-center">
                    <Youtube className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                    <p className="text-slate-500 dark:text-slate-400">
                      {language === 'fr'
                        ? 'Aucune vidéo trouvée pour cette période'
                        : 'No videos found for this period'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-600">
                    {filteredVideos.map((video) => (
                      <VideoCard
                        key={`${video.ticker}-${video.video_id}`}
                        video={video}
                        language={language}
                        onPlay={() => setSelectedVideo(video)}
                        onCompanyClick={() => navigate(`/investing/stock/${video.ticker}`)}
                        showCompany
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* By company view */
              <div className="space-y-4">
                {videosByCompany.map(({ ticker, companyName, videos }) => {
                  const isExpanded = expandedCompanies.has(ticker) || expandedCompanies.size === 0;
                  const logoUrl = getCompanyLogoUrl(ticker);

                  return (
                    <div key={ticker} className="bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm overflow-hidden">
                      {/* Company header */}
                      <button
                        onClick={() => toggleCompany(ticker)}
                        className="w-full px-6 py-4 flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-500">
                          {logoUrl ? (
                            <img
                              src={logoUrl}
                              alt={`${ticker} logo`}
                              className="w-8 h-8 object-contain"
                              onError={(e) => {
                                const parent = e.currentTarget.parentElement;
                                if (parent) {
                                  parent.innerHTML = `<span class="text-xs font-bold text-slate-500">${ticker.slice(0, 2)}</span>`;
                                }
                              }}
                            />
                          ) : (
                            <span className="text-xs font-bold text-slate-500">{ticker.slice(0, 2)}</span>
                          )}
                        </div>
                        <div className="text-left min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{companyName}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{ticker}</p>
                        </div>
                        <span className="text-sm text-slate-500 dark:text-slate-400 mr-2">
                          {videos.length} {language === 'fr' ? 'vidéo(s)' : 'video(s)'}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        )}
                      </button>

                      {/* Videos */}
                      {isExpanded && (
                        <div className="border-t border-slate-200 dark:border-slate-600">
                          {videos.length === 0 ? (
                            <div className="p-6 text-center">
                              <p className="text-slate-500 dark:text-slate-400 text-sm">
                                {language === 'fr'
                                  ? 'Aucune vidéo trouvée pour cette période'
                                  : 'No videos found for this period'}
                              </p>
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-200 dark:divide-slate-600">
                              {videos.map((video) => (
                                <VideoCard
                                  key={video.video_id}
                                  video={video}
                                  language={language}
                                  onPlay={() => setSelectedVideo(video)}
                                  showCompany={false}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Video Modal */}
      {selectedVideo && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="relative w-full max-w-4xl bg-slate-900 rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setSelectedVideo(null)}
              className="absolute top-3 right-3 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
            >
              <span className="sr-only">Close</span>
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* YouTube Embed */}
            <div className="relative pt-[56.25%]">
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/embed/${selectedVideo.video_id}?autoplay=1`}
                title={selectedVideo.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            {/* Video info */}
            <div className="p-4">
              <h3 className="text-lg font-semibold text-white mb-2">{selectedVideo.title}</h3>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-slate-300">{selectedVideo.channel_name}</span>
                <span className="text-slate-500">·</span>
                <span className="text-sm text-slate-400">{formatDate(selectedVideo.published_at, language)}</span>
                <span className="text-slate-500">·</span>
                <button
                  onClick={() => navigate(`/investing/stock/${selectedVideo.ticker}`)}
                  className="text-sm text-green-400 hover:text-green-300"
                >
                  {selectedVideo.companyName} ({selectedVideo.ticker})
                </button>
                <div className="ml-auto flex items-center gap-3">
                  <a
                    href={getTranscriptUrl(selectedVideo.video_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <FileText className="w-4 h-4" />
                    {language === 'fr' ? 'Transcription' : 'Transcript'}
                  </a>
                  <a
                    href={selectedVideo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
                  >
                    <Youtube className="w-4 h-4" />
                    {language === 'fr' ? 'Ouvrir sur YouTube' : 'Open on YouTube'}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Video card component
interface VideoCardProps {
  video: VideoWithCompany;
  language: string;
  onPlay: () => void;
  onCompanyClick?: () => void;
  showCompany?: boolean;
}

function VideoCard({ video, language, onPlay, onCompanyClick, showCompany = true }: VideoCardProps) {
  const logoUrl = showCompany ? getCompanyLogoUrl(video.ticker) : null;

  return (
    <div className="p-4 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
      <div className="flex gap-4">
        {/* Thumbnail */}
        <button
          onClick={onPlay}
          className="relative w-40 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-600 group"
        >
          {video.thumbnail_url ? (
            <img
              src={video.thumbnail_url}
              alt={video.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Youtube className="w-10 h-10 text-slate-400" />
            </div>
          )}
          {/* Play icon overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
            <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </button>

        {/* Video info */}
        <div className="flex-1 min-w-0">
          <button
            onClick={onPlay}
            className="text-left w-full"
          >
            <h4 className="font-medium text-slate-800 dark:text-slate-100 line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {video.title}
            </h4>
          </button>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            {showCompany && (
              <button
                onClick={onCompanyClick}
                className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/50 px-2 py-0.5 rounded hover:bg-green-200 dark:hover:bg-green-800/50 transition-colors"
              >
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt={video.ticker}
                    className="w-4 h-4 object-contain rounded"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                {video.ticker}
              </button>
            )}
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-500 px-2 py-0.5 rounded">
              {video.channel_name}
            </span>
            <span className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-500 px-2 py-0.5 rounded">
              <Calendar className="w-3 h-3" />
              {formatDate(video.published_at, language)}
            </span>
          </div>

          {/* Transcript link */}
          <div className="mt-2">
            <a
              href={getTranscriptUrl(video.video_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
            >
              <FileText className="w-3 h-3" />
              {language === 'fr' ? 'Voir la transcription' : 'View transcript'}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
