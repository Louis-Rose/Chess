// Chess app type definitions

export type PanelType = 'welcome' | 'my-data' | 'win-prediction' | 'pros-tips' | 'weaknesses' | 'openings' | 'middle-game' | 'end-game';

export type TimeClass = 'rapid' | 'blitz';

export interface SavedPlayer {
  username: string;
  avatar: string | null;
}

export interface PlayerData {
  name: string;
  username: string;
  avatar: string | null;
  followers: number;
  joined: number; // Unix timestamp
}

export interface HistoryData {
  date: string;
  games_played: number;
}

export interface EloData {
  date: string;
  elo: number;
}

export interface OpeningData {
  opening: string;
  games: number;
  win_rate: number;
  ci_lower: number;
  ci_upper: number;
}

export interface GameNumberStats {
  game_number: number;
  win_rate: number;
  sample_size: number;
}

export interface HourlyStats {
  hour_group: number;
  start_hour: number;
  end_hour: number;
  win_rate: number;
  sample_size: number;
}

export interface FatigueInsight {
  type: 'warning' | 'positive' | 'info';
  title: string;
  message: string;
  recommendation: string;
}

export interface FatigueAnalysis {
  sample_size: number;
  error?: string;
  baseline_win_rate?: number;
  best_game_number?: number;
  best_win_rate?: number;
  worst_game_number?: number;
  worst_win_rate?: number;
  insights?: FatigueInsight[];
}

export interface WinPredictionInsight {
  type: 'warning' | 'positive' | 'info';
  title: string;
  message: string;
  recommendation: string;
}

export interface WinPredictionHourlyData {
  hour_group: number;
  start_hour: number;
  end_hour: number;
  win_rate: number;
  sample_size: number;
}

export interface AutocorrelationData {
  value: number;
  name: string;
}

export interface WinPredictionAnalysis {
  sample_size: number;
  error?: string;
  games_after_win?: number;
  games_after_loss?: number;
  games_after_draw?: number;
  win_rate_after_win?: number;
  win_rate_after_loss?: number;
  win_rate_after_draw?: number;
  odds_ratio?: number;
  odds_ratio_hour?: number;
  odds_ratio_day_balance?: number;
  odds_ratio_minutes?: number;
  coefficient?: number;
  coefficient_hour?: number;
  coefficient_day_balance?: number;
  coefficient_minutes?: number;
  is_significant?: boolean;
  is_hour_significant?: boolean;
  is_balance_significant?: boolean;
  is_minutes_significant?: boolean;
  baseline_win_rate?: number;
  best_hour?: number;
  worst_hour?: number;
  hourly_data?: WinPredictionHourlyData[];
  autocorrelations?: {
    prev_result: AutocorrelationData;
    hour: AutocorrelationData;
    day_balance: AutocorrelationData;
    minutes_gap: AutocorrelationData;
  };
  insights?: WinPredictionInsight[];
}

export interface ApiResponse {
  player: PlayerData;
  time_class: string;
  history: HistoryData[];
  elo_history: EloData[];
  total_games: number;
  total_rapid: number;
  total_blitz: number;
  openings: {
    white: OpeningData[];
    black: OpeningData[];
  };
  game_number_stats: GameNumberStats[];
  hourly_stats: HourlyStats[];
  win_prediction: WinPredictionAnalysis;
}

// SSE streaming types
export interface StreamProgress {
  current: number;
  total: number;
  month: string;  // e.g., "2024-01"
  cached?: boolean;  // true when data comes from cache
}

export interface VideoData {
  video_id: string;
  title: string;
  channel_title: string;
  thumbnail: string;
  channel_thumbnail: string;
  published_at: string;
  view_count: number;
  subscriber_count: number;
  url: string;
}

export interface ProPlayerTip {
  title: string;
  description: string;
}

export interface ProPlayer {
  name: string;
  country: string;
  rating: number;
  rank: number;
  videoId: string;
  videoTitle: string;
  tips: ProPlayerTip[];
}
