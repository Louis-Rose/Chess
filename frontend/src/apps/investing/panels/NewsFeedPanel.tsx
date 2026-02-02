// News Feed panel - aggregated YouTube videos from portfolio and watchlist companies

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, Youtube, ChevronDown, ChevronUp, Eye, Briefcase } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { findStockByTicker } from '../utils/allStocks';
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
    params: { ticker, company_name: companyName, limit: 10 }
  });
  return response.data;
};

const fetchVideoSummary = async (videoId: string): Promise<{ summary?: string; transcript?: string; has_transcript?: boolean; pending?: boolean }> => {
  const response = await axios.get(`/api/investing/video-summary/${videoId}`);
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

// Video card with summary
function VideoCard({
  video,
  language,
  onPlay
}: {
  video: VideoWithCompany;
  language: string;
  onPlay: () => void;
}) {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [noTranscript, setNoTranscript] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadTranscript = async () => {
    if (transcript || loading) return;
    setLoading(true);
    setPending(false);
    setNoTranscript(false);
    try {
      const data = await fetchVideoSummary(video.video_id);
      if (data.pending) {
        setPending(true);
      } else if (data.has_transcript === false) {
        setNoTranscript(true);
      } else if (data.transcript) {
        setTranscript(data.transcript);
      }
    } catch {
      // Silently fail
      setPending(true);
    } finally {
      setLoading(false);
    }
  };

  // Load transcript on mount
  useEffect(() => {
    loadTranscript();
  }, [video.video_id]);

  return (
    <div className="flex-shrink-0 w-72 bg-white dark:bg-slate-600 rounded-lg overflow-hidden shadow-sm border border-slate-200 dark:border-slate-500">
      {/* Thumbnail */}
      <button
        onClick={onPlay}
        className="relative w-full h-40 bg-slate-200 dark:bg-slate-700 group"
      >
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Youtube className="w-12 h-12 text-slate-400" />
          </div>
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
          <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </button>

      {/* Content */}
      <div className="p-3">
        <button onClick={onPlay} className="text-left w-full">
          <h4 className="font-medium text-sm text-slate-800 dark:text-slate-100 line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            {video.title}
          </h4>
        </button>

        <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate">{video.channel_name}</span>
          <span>·</span>
          <span>{formatDate(video.published_at, language)}</span>
        </div>

        {/* Transcript section */}
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-500">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              {language === 'fr' ? 'Chargement...' : 'Loading...'}
            </div>
          ) : pending ? (
            <p className="text-xs text-slate-400 italic">
              {language === 'fr' ? 'Transcription en cours...' : 'Fetching transcript...'}
            </p>
          ) : noTranscript ? (
            <p className="text-xs text-slate-400 italic">
              {language === 'fr' ? 'Pas de transcription disponible' : 'No transcript available'}
            </p>
          ) : transcript ? (
            <div>
              <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">
                ✓ Transcript ({transcript.length} chars)
              </p>
              <p className={`text-xs text-slate-600 dark:text-slate-300 ${expanded ? '' : 'line-clamp-3'}`}>
                {transcript}
              </p>
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-blue-500 hover:text-blue-600 mt-1 flex items-center gap-0.5"
              >
                {expanded
                  ? (language === 'fr' ? 'Voir moins' : 'See less')
                  : (language === 'fr' ? 'Voir plus' : 'See more')
                }
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Company section with horizontal scrolling videos
function CompanySection({
  ticker,
  companyName,
  videos,
  isPortfolio,
  language,
  onPlayVideo,
}: {
  ticker: string;
  companyName: string;
  videos: VideoWithCompany[];
  isPortfolio: boolean;
  language: string;
  onPlayVideo: (video: VideoWithCompany) => void;
}) {
  const navigate = useNavigate();
  const logoUrl = getCompanyLogoUrl(ticker);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (videos.length === 0) return null;

  return (
    <div className="mb-6">
      {/* Company header */}
      <button
        onClick={() => navigate(`/investing/stock/${ticker}`)}
        className="flex items-center gap-3 mb-3 group"
      >
        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-500">
          {logoUrl ? (
            <img src={logoUrl} alt={ticker} className="w-6 h-6 object-contain" />
          ) : (
            <span className="text-xs font-bold text-slate-500">{ticker.slice(0, 2)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {companyName}
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400">({ticker})</span>
          {isPortfolio && (
            <span title={language === 'fr' ? 'Portefeuille' : 'Portfolio'}>
              <Briefcase className="w-4 h-4 text-green-600" />
            </span>
          )}
        </div>
      </button>

      {/* Horizontal scrolling videos */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {videos.slice(0, 10).map((video) => (
          <div key={video.video_id} style={{ scrollSnapAlign: 'start' }}>
            <VideoCard
              video={video}
              language={language}
              onPlay={() => onPlayVideo(video)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function NewsFeedPanel() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();
  const [selectedVideo, setSelectedVideo] = useState<VideoWithCompany | null>(null);

  // Fetch watchlist
  const { data: watchlistData, isLoading: watchlistLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
    enabled: isAuthenticated,
  });

  // Fetch portfolio composition
  const { data: compositionData, isLoading: compositionLoading } = useQuery({
    queryKey: ['composition-for-news'],
    queryFn: fetchComposition,
    enabled: isAuthenticated,
  });

  const watchlist = watchlistData?.symbols ?? [];
  const portfolioTickers = compositionData?.holdings?.map(h => h.ticker) ?? [];

  // Separate portfolio-only and watchlist-only tickers
  const portfolioOnlyTickers = portfolioTickers.filter(t => !watchlist.includes(t));
  const watchlistOnlyTickers = watchlist.filter(t => !portfolioTickers.includes(t));
  const bothTickers = portfolioTickers.filter(t => watchlist.includes(t));

  // Order: portfolio first (including those in both), then watchlist-only
  const orderedPortfolioTickers = [...bothTickers, ...portfolioOnlyTickers];
  const allTrackedCompanies = [...orderedPortfolioTickers, ...watchlistOnlyTickers];

  // Fetch news for all tracked companies
  const { data: allNewsData, isLoading: newsLoading } = useQuery({
    queryKey: ['watchlist-news-feed', allTrackedCompanies],
    queryFn: async () => {
      if (allTrackedCompanies.length === 0) return [];

      const results = await Promise.all(
        allTrackedCompanies.map(async (ticker) => {
          const stock = findStockByTicker(ticker);
          const companyName = stock?.name || ticker;
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

  // Separate into portfolio and watchlist sections
  const portfolioCompanies = (allNewsData || []).filter(c => c.isPortfolio);
  const watchlistCompanies = (allNewsData || []).filter(c => !c.isPortfolio && c.isWatchlist);

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
        <p className="text-slate-500 dark:text-slate-400 text-lg italic">
          {language === 'fr' ? 'Vidéos YouTube de votre portefeuille' : 'YouTube videos from your portfolio'}
        </p>
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
            {/* Portfolio Companies Section */}
            {portfolioCompanies.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Briefcase className="w-5 h-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {language === 'fr' ? 'Portefeuille' : 'Portfolio'}
                  </h3>
                </div>
                {portfolioCompanies.map((company) => (
                  <CompanySection
                    key={company.ticker}
                    ticker={company.ticker}
                    companyName={company.companyName}
                    videos={company.videos}
                    isPortfolio={true}
                    language={language}
                    onPlayVideo={setSelectedVideo}
                  />
                ))}
              </div>
            )}

            {/* Watchlist Companies Section */}
            {watchlistCompanies.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Eye className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Watchlist
                  </h3>
                </div>
                {watchlistCompanies.map((company) => (
                  <CompanySection
                    key={company.ticker}
                    ticker={company.ticker}
                    companyName={company.companyName}
                    videos={company.videos}
                    isPortfolio={false}
                    language={language}
                    onPlayVideo={setSelectedVideo}
                  />
                ))}
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
