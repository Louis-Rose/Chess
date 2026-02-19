// Chess API fetch functions

import axios from 'axios';
import type { VideoData, FatigueAnalysis, TimeClass } from '../utils/types';

export const fetchYouTubeVideos = async (opening: string, side: string): Promise<VideoData[]> => {
  const response = await axios.get(`/api/youtube-videos?opening=${encodeURIComponent(opening)}&side=${encodeURIComponent(side)}`);
  return response.data.videos;
};

export const fetchFatigueAnalysis = async (username: string, timeClass: TimeClass): Promise<FatigueAnalysis> => {
  const response = await axios.get(`/api/fatigue-analysis?username=${username}&time_class=${timeClass}`);
  return response.data;
};

export const fetchChessInsight = async (
  type: string,
  rows: { games_per_day: number; win_rate: number }[],
  lang: string
): Promise<string> => {
  const response = await axios.post('/api/chess-insight', { type, rows, lang });
  return response.data.summary;
};
