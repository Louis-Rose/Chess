// News Feed panel - aggregated YouTube videos from portfolio and watchlist companies

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, Youtube, ChevronDown, ChevronRight, Eye, Briefcase, ExternalLink, FileText } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { findStockByTicker } from '../utils/allStocks';
import { getCompanyLogoUrl } from '../utils/companyLogos';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  isPortfolio?: boolean;
  isWatchlist?: boolean;
}

const fetchWatchlist = async (): Promise<{ symbols: string[] }> => {
  const response = await axios.get('/api/investing/watchlist');
  return response.data;
};

interface CompositionItem {
  ticker: string;
  quantity: number;
}

interface CompositionData {
  holdings: CompositionItem[];
}

const fetchComposition = async (): Promise<CompositionData> => {
  const response = await axios.get('/api/investing/portfolio/composition');
  return response.data;
};

const fetchNewsFeed = async (ticker: string, companyName: string): Promise<NewsFeedResponse> => {
  const response = await axios.get('/api/investing/news-feed', {
    params: { ticker, company_name: companyName, limit: 15 }
  });
  return response.data;
};

const fetchVideoSummary = async (videoId: string, ticker: string): Promise<{ summary?: string; transcript?: string; has_transcript?: boolean; pending?: boolean }> => {
  const response = await axios.get(`/api/investing/video-summary/${videoId}`, {
    params: { ticker }
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

// Video row with thumbnail on left, summary/transcript on right
function VideoRow({
  video,
  language,
  onPlay
}: {
  video: VideoWithCompany;
  language: string;
  onPlay: () => void;
}) {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [noTranscript, setNoTranscript] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const loadData = async () => {
    if (transcript || loading) return;
    setLoading(true);
    setPending(false);
    setNoTranscript(false);
    try {
      const data = await fetchVideoSummary(video.video_id, video.ticker);
      if (data.pending) {
        setPending(true);
      } else if (data.has_transcript === false) {
        setNoTranscript(true);
      } else {
        if (data.transcript) setTranscript(data.transcript);
        if (data.summary) setSummary(data.summary);
      }
    } catch {
      setPending(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [video.video_id, video.ticker]);

  return (
    <div className="flex gap-3 bg-white dark:bg-slate-600 rounded-lg overflow-hidden shadow-sm border border-slate-200 dark:border-slate-500">
      {/* Left side: Thumbnail + Title */}
      <div className="flex-shrink-0 w-80">
        <button
          onClick={onPlay}
          className="relative w-full h-[120px] bg-slate-200 dark:bg-slate-700 group"
        >
          {video.thumbnail_url ? (
            <img
              src={video.thumbnail_url}
              alt={video.title}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Youtube className="w-8 h-8 text-slate-400" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
            <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </button>
        <div className="p-2.5">
          <button onClick={onPlay} className="text-left w-full">
            <h4 className="font-medium text-sm text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {video.title}
            </h4>
          </button>
          <div className="flex items-center gap-1.5 mt-2 text-xs">
            <span className="text-slate-600 dark:text-slate-300 font-medium">{video.channel_name}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 dark:text-slate-400">{formatDate(video.published_at, language)}</span>
          </div>
        </div>
      </div>

      {/* Right side: Summary + Transcript button */}
      <div className="flex-1 py-2 pr-3 border-l border-slate-200 dark:border-slate-500 pl-3 flex flex-col">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            {language === 'fr' ? 'Chargement...' : 'Loading...'}
          </div>
        ) : pending ? (
          <p className="text-sm text-slate-400 italic">
            {language === 'fr' ? 'Transcription en cours...' : 'Fetching transcript...'}
          </p>
        ) : noTranscript ? (
          <p className="text-sm text-slate-400 italic">
            {language === 'fr' ? 'Pas de transcription disponible' : 'No transcript available'}
          </p>
        ) : (summary || transcript) ? (
          <>
            {/* Summary - full width */}
            {summary && (
              <div className="flex-1">
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                  {summary}
                </p>
              </div>
            )}

            {/* Transcript toggle at bottom */}
            {transcript && (
              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-500">
                {!showTranscript ? (
                  <button
                    onClick={() => setShowTranscript(true)}
                    className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
                  >
                    <FileText className="w-3 h-3" />
                    {language === 'fr' ? 'Voir la transcription' : 'Show transcript'}
                  </button>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">
                        ✓ {language === 'fr' ? 'Transcription' : 'Transcript'}
                      </p>
                      <button
                        onClick={() => setShowTranscript(false)}
                        className="text-[10px] text-blue-500 hover:text-blue-600"
                      >
                        {language === 'fr' ? 'Masquer' : 'Hide'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-h-32 overflow-y-auto">
                      {transcript}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

// Collapsible section with toggle on left
function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  children
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-4 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-5 h-5 text-slate-500" />
        ) : (
          <ChevronRight className="w-5 h-5 text-slate-500" />
        )}
        {icon}
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h3>
      </button>
      {isOpen && (
        <div className="px-6 pb-6">
          {children}
        </div>
      )}
    </div>
  );
}

// Filter videos - try 30 days first, extend to 90 days if less than 15 found
function filterRecentVideos(videos: VideoWithCompany[], maxCount: number = 15): VideoWithCompany[] {
  const now = new Date();
  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const cutoff90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Try 30 days first
  const recent30 = videos.filter(v => new Date(v.published_at) >= cutoff30);

  if (recent30.length >= maxCount) {
    return recent30.slice(0, maxCount);
  }

  // Extend to 90 days if we don't have enough
  return videos
    .filter(v => new Date(v.published_at) >= cutoff90)
    .slice(0, maxCount);
}

// Company section with vertical video list
function CompanySection({
  ticker,
  companyName,
  videos,
  language,
  onPlayVideo,
}: {
  ticker: string;
  companyName: string;
  videos: VideoWithCompany[];
  language: string;
  onPlayVideo: (video: VideoWithCompany) => void;
}) {
  const navigate = useNavigate();
  const logoUrl = getCompanyLogoUrl(ticker);
  const [isOpen, setIsOpen] = useState(false);

  // Filter to recent videos only (last 30 days, max 5)
  const recentVideos = filterRecentVideos(videos);

  return (
    <div className="mb-4">
      {/* Company header - clickable button style */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-500 hover:border-slate-400 dark:hover:border-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors cursor-pointer"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
        )}
        <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-500 flex-shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt={ticker} className="w-5 h-5 object-contain" />
          ) : (
            <span className="text-[10px] font-bold text-slate-500">{ticker.slice(0, 2)}</span>
          )}
        </div>
        <span className="font-medium text-sm text-slate-900 dark:text-slate-100">
          {companyName} ({ticker})
        </span>
        <span className="text-xs text-slate-400">
          {recentVideos.length === 0
            ? (language === 'fr' ? 'Aucune vidéo récente' : 'No recent videos')
            : `${recentVideos.length} ${recentVideos.length === 1 ? 'video' : 'videos'}`
          }
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/investing/stock/${ticker}`); }}
          className="ml-auto px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-500 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 rounded-md transition-colors flex items-center gap-1.5"
        >
          <ExternalLink className="w-3 h-3" />
          {language === 'fr' ? 'Page entreprise' : 'Go to company page'}
        </button>
      </div>

      {/* Scrollable vertical video list - height for ~2-3 videos */}
      {isOpen && recentVideos.length > 0 && (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-500 mt-3 ml-4">
          {recentVideos.map((video) => (
            <VideoRow
              key={video.video_id}
              video={video}
              language={language}
              onPlay={() => onPlayVideo(video)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Sortable wrapper for CompanySection
function SortableCompanySection({
  id,
  ticker,
  companyName,
  videos,
  language,
  onPlayVideo,
}: {
  id: string;
  ticker: string;
  companyName: string;
  videos: VideoWithCompany[];
  language: string;
  onPlayVideo: (video: VideoWithCompany) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CompanySection
        ticker={ticker}
        companyName={companyName}
        videos={videos}
        language={language}
        onPlayVideo={onPlayVideo}
      />
    </div>
  );
}

// Helper to load order from localStorage
function loadOrder(key: string): string[] {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Helper to save order to localStorage
function saveOrder(key: string, order: string[]) {
  localStorage.setItem(key, JSON.stringify(order));
}

// Apply custom order to companies array
function applyOrder<T extends { ticker: string }>(companies: T[], customOrder: string[]): T[] {
  if (customOrder.length === 0) return companies;

  const orderMap = new Map(customOrder.map((ticker, idx) => [ticker, idx]));
  const ordered = [...companies].sort((a, b) => {
    const aIdx = orderMap.get(a.ticker) ?? Infinity;
    const bIdx = orderMap.get(b.ticker) ?? Infinity;
    return aIdx - bIdx;
  });
  return ordered;
}

export function NewsFeedPanel() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();
  const [selectedVideo, setSelectedVideo] = useState<VideoWithCompany | null>(null);
  const [portfolioOrder, setPortfolioOrder] = useState<string[]>(() => loadOrder('newsfeed-portfolio-order'));
  const [watchlistOrder, setWatchlistOrder] = useState<string[]>(() => loadOrder('newsfeed-watchlist-order'));

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch watchlist (staleTime: Infinity - invalidated manually when user modifies)
  const { data: watchlistData, isLoading: watchlistLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
    enabled: isAuthenticated,
    staleTime: Infinity,
  });

  // Fetch portfolio composition (staleTime: Infinity - invalidated manually when user modifies)
  // Using ['composition', 'news'] so it gets invalidated by queryClient.invalidateQueries(['composition'])
  const { data: compositionData, isLoading: compositionLoading } = useQuery({
    queryKey: ['composition', 'news'],
    queryFn: fetchComposition,
    enabled: isAuthenticated,
    staleTime: Infinity,
  });

  const watchlist = watchlistData?.symbols ?? [];
  const portfolioTickers = compositionData?.holdings?.map(h => h.ticker) ?? [];

  // Separate portfolio-only and watchlist-only tickers
  const portfolioOnlyTickers = portfolioTickers.filter(t => !watchlist.includes(t));
  const watchlistOnlyTickers = watchlist.filter(t => !portfolioTickers.includes(t));
  const bothTickers = portfolioTickers.filter(t => watchlist.includes(t));

  // Order: portfolio first (including those in both), then watchlist-only
  const orderedPortfolioTickers = [...bothTickers, ...portfolioOnlyTickers];
  const allTrackedCompaniesRaw = [...orderedPortfolioTickers, ...watchlistOnlyTickers];

  // Deduplicate tickers that represent the same company (e.g., GOOGL/GOOG)
  // Always prefer GOOGL over GOOG if both are present
  const hasGOOGL = allTrackedCompaniesRaw.includes('GOOGL');
  const allTrackedCompanies = allTrackedCompaniesRaw.filter(ticker => {
    if (ticker === 'GOOG' && hasGOOGL) return false;
    return true;
  });

  // Fetch news for all tracked companies
  const { data: allNewsData, isLoading: newsLoading } = useQuery({
    queryKey: ['watchlist-news-feed', allTrackedCompanies],
    queryFn: async () => {
      if (allTrackedCompanies.length === 0) return [];

      // Company name overrides for tickers with multiple share classes
      const nameOverrides: Record<string, string> = { 'GOOGL': 'Alphabet', 'GOOG': 'Alphabet' };

      const results = await Promise.all(
        allTrackedCompanies.map(async (ticker) => {
          const stock = findStockByTicker(ticker);
          const companyName = nameOverrides[ticker] || stock?.name || ticker;
          try {
            const response = await fetchNewsFeed(ticker, companyName);
            return {
              ticker,
              companyName,
              videos: response.videos.map(v => ({
                ...v,
                ticker,
                companyName,
                isPortfolio: portfolioTickers.includes(ticker),
                isWatchlist: watchlist.includes(ticker),
              })),
              isPortfolio: portfolioTickers.includes(ticker),
              isWatchlist: watchlist.includes(ticker),
            };
          } catch {
            return { ticker, companyName, videos: [], isPortfolio: portfolioTickers.includes(ticker), isWatchlist: watchlist.includes(ticker) };
          }
        })
      );
      return results;
    },
    enabled: isAuthenticated && allTrackedCompanies.length > 0,
    staleTime: 1000 * 60 * 15,
  });

  // Separate into portfolio and watchlist sections, apply custom order
  const portfolioCompaniesRaw = (allNewsData || []).filter(c => c.isPortfolio);
  const watchlistCompaniesRaw = (allNewsData || []).filter(c => !c.isPortfolio && c.isWatchlist);

  const portfolioCompanies = useMemo(
    () => applyOrder(portfolioCompaniesRaw, portfolioOrder),
    [portfolioCompaniesRaw, portfolioOrder]
  );
  const watchlistCompanies = useMemo(
    () => applyOrder(watchlistCompaniesRaw, watchlistOrder),
    [watchlistCompaniesRaw, watchlistOrder]
  );

  // Handle drag end for portfolio section
  const handlePortfolioDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = portfolioCompanies.findIndex(c => c.ticker === active.id);
      const newIndex = portfolioCompanies.findIndex(c => c.ticker === over.id);
      const newOrder = arrayMove(portfolioCompanies, oldIndex, newIndex).map(c => c.ticker);
      setPortfolioOrder(newOrder);
      saveOrder('newsfeed-portfolio-order', newOrder);
    }
  };

  // Handle drag end for watchlist section
  const handleWatchlistDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = watchlistCompanies.findIndex(c => c.ticker === active.id);
      const newIndex = watchlistCompanies.findIndex(c => c.ticker === over.id);
      const newOrder = arrayMove(watchlistCompanies, oldIndex, newIndex).map(c => c.ticker);
      setWatchlistOrder(newOrder);
      saveOrder('newsfeed-watchlist-order', newOrder);
    }
  };

  // Loading state
  if (authLoading || (isAuthenticated && (watchlistLoading || compositionLoading))) {
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
                ? 'Connectez-vous pour voir les actualités de votre portefeuille'
                : 'Sign in to see news from your portfolio'}
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
      </div>

      <div className="max-w-6xl mx-auto space-y-6 px-4">
        {/* Empty state */}
        {allTrackedCompanies.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-8 text-center">
            <Youtube className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-300 mb-2">
              {language === 'fr'
                ? 'Ajoutez des entreprises ci-dessus pour voir leurs actualités'
                : 'Add companies above to see their news'}
            </p>
          </div>
        ) : newsLoading ? (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-8">
            <div className="flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            </div>
          </div>
        ) : (
          <>
            {/* Portfolio News Section */}
            {portfolioCompanies.length > 0 && (
              <CollapsibleSection
                title={language === 'fr' ? 'Actualités Portefeuille' : 'Portfolio News'}
                icon={<Briefcase className="w-5 h-5 text-green-600" />}
                defaultOpen={true}
              >
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handlePortfolioDragEnd}
                >
                  <SortableContext
                    items={portfolioCompanies.map(c => c.ticker)}
                    strategy={verticalListSortingStrategy}
                  >
                    {portfolioCompanies.map((company) => (
                      <SortableCompanySection
                        key={company.ticker}
                        id={company.ticker}
                        ticker={company.ticker}
                        companyName={company.companyName}
                        videos={company.videos}
                        language={language}
                        onPlayVideo={setSelectedVideo}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </CollapsibleSection>
            )}

            {/* Watchlist News Section */}
            {watchlistCompanies.length > 0 && (
              <CollapsibleSection
                title={language === 'fr' ? 'Actualités Watchlist' : 'Watchlist News'}
                icon={<Eye className="w-5 h-5 text-blue-600" />}
                defaultOpen={true}
              >
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleWatchlistDragEnd}
                >
                  <SortableContext
                    items={watchlistCompanies.map(c => c.ticker)}
                    strategy={verticalListSortingStrategy}
                  >
                    {watchlistCompanies.map((company) => (
                      <SortableCompanySection
                        key={company.ticker}
                        id={company.ticker}
                        ticker={company.ticker}
                        companyName={company.companyName}
                        videos={company.videos}
                        language={language}
                        onPlayVideo={setSelectedVideo}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </CollapsibleSection>
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
            <button
              onClick={() => setSelectedVideo(null)}
              className="absolute top-3 right-3 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
            >
              <span className="sr-only">Close</span>
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

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
                <a
                  href={selectedVideo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <Youtube className="w-4 h-4" />
                  {language === 'fr' ? 'Ouvrir sur YouTube' : 'Open on YouTube'}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
