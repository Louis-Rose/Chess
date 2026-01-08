// News Feed panel - YouTube videos from finance channels

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, Youtube, ExternalLink, Calendar, Eye, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

interface Video {
  video_id: string;
  channel_id: string;
  channel_name: string;
  title: string;
  thumbnail_url: string;
  published_at: string;
  view_count: number;
  url: string;
}

interface NewsFeedResponse {
  videos: Video[];
  total: number;
  from_cache: boolean;
}

const fetchNewsFeed = async (ticker?: string): Promise<NewsFeedResponse> => {
  const params = ticker ? { ticker } : {};
  const response = await axios.get('/api/investing/news-feed', { params });
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

function formatViewCount(count: number): string {
  if (!count) return '';
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(0)}K`;
  }
  return count.toString();
}

interface NewsPanelProps {
  ticker?: string;
}

export function NewsPanel({ ticker }: NewsPanelProps) {
  const { language } = useLanguage();
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['news-feed', ticker],
    queryFn: () => fetchNewsFeed(ticker),
    staleTime: 1000 * 60 * 15, // 15 minutes
  });

  const videos = data?.videos ?? [];

  // Get unique channels for filtering
  const channels = [...new Set(videos.map(v => v.channel_name))];

  // Filter videos by selected channel
  const filteredVideos = selectedChannel
    ? videos.filter(v => v.channel_name === selectedChannel)
    : videos;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400">{language === 'fr' ? 'Chargement des vidéos...' : 'Loading videos...'}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Youtube className="w-16 h-16 text-slate-500 mb-4" />
        <h2 className="text-2xl font-bold text-slate-300 mb-2">
          {language === 'fr' ? 'Erreur de chargement' : 'Failed to Load'}
        </h2>
        <p className="text-slate-500 mb-4">
          {language === 'fr' ? 'Impossible de charger les vidéos.' : 'Could not load videos.'}
        </p>
        <button
          onClick={() => refetch()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          {language === 'fr' ? 'Réessayer' : 'Try Again'}
        </button>
      </div>
    );
  }

  return (
    <div className="md:animate-in md:fade-in md:slide-in-from-bottom-4 md:duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          {ticker
            ? (language === 'fr' ? `Actualités ${ticker}` : `${ticker} News`)
            : (language === 'fr' ? 'Fil d\'actualités' : 'News Feed')}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-lg italic">
          {language === 'fr'
            ? 'Les dernières vidéos des chaînes financières'
            : 'Latest videos from finance channels'}
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Channel Filter */}
        {channels.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 px-2">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {language === 'fr' ? 'Chaîne:' : 'Channel:'}
            </span>
            <button
              onClick={() => setSelectedChannel(null)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                !selectedChannel
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'
              }`}
            >
              {language === 'fr' ? 'Toutes' : 'All'}
            </button>
            {channels.map(channel => (
              <button
                key={channel}
                onClick={() => setSelectedChannel(channel)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedChannel === channel
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'
                }`}
              >
                {channel}
              </button>
            ))}
          </div>
        )}

        {/* Refresh Button */}
        <div className="flex justify-end px-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-slate-500 hover:text-blue-600 flex items-center gap-1 text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            {language === 'fr' ? 'Actualiser' : 'Refresh'}
          </button>
        </div>

        {/* Videos Grid */}
        {filteredVideos.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-700 rounded-xl">
            <Youtube className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400">
              {ticker
                ? (language === 'fr'
                    ? `Aucune vidéo trouvée pour ${ticker}.`
                    : `No videos found for ${ticker}.`)
                : (language === 'fr'
                    ? 'Aucune vidéo disponible.'
                    : 'No videos available.')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredVideos.map(video => (
              <a
                key={video.video_id}
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-slate-50 dark:bg-slate-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group border border-slate-200 dark:border-slate-600"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-slate-200 dark:bg-slate-600">
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
                  {/* YouTube play icon overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                    <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all">
                      <svg className="w-5 h-5 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Video Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {video.title}
                  </h3>
                  <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Youtube className="w-4 h-4 text-red-500" />
                      {video.channel_name}
                    </span>
                    <div className="flex items-center gap-3">
                      {video.view_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {formatViewCount(video.view_count)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(video.published_at, language)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* External link indicator */}
                <div className="absolute top-2 right-2 bg-black/50 rounded px-2 py-1 text-white text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink className="w-3 h-3" />
                  YouTube
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Video count */}
        {filteredVideos.length > 0 && (
          <p className="text-center text-sm text-slate-400 dark:text-slate-500">
            {language === 'fr'
              ? `${filteredVideos.length} vidéo${filteredVideos.length > 1 ? 's' : ''}`
              : `${filteredVideos.length} video${filteredVideos.length > 1 ? 's' : ''}`}
            {data?.from_cache && (
              <span className="ml-2">
                ({language === 'fr' ? 'depuis le cache' : 'from cache'})
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
