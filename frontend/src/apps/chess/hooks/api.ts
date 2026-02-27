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

export const fetchChessGoal = async (username: string, timeClass: TimeClass) => {
  const response = await axios.get(`/api/chess/goal?username=${encodeURIComponent(username)}&time_class=${timeClass}`);
  return response.data.goal as { elo_goal: number; elo_goal_start_elo: number; elo_goal_start_date: string; elo_goal_months: number } | null;
};

export const saveChessGoal = async (
  username: string,
  timeClass: TimeClass,
  goal: { elo_goal: number; elo_goal_start_elo: number; elo_goal_start_date: string; elo_goal_months: number },
) => {
  await axios.post('/api/chess/goal', { username, time_class: timeClass, ...goal });
};

export const fetchChessUserPrefs = async (username: string): Promise<{ onboarding_done: boolean; preferred_time_class: string | null }> => {
  const response = await axios.get(`/api/chess/onboarding?username=${encodeURIComponent(username)}`);
  return { onboarding_done: response.data.onboarding_done, preferred_time_class: response.data.preferred_time_class };
};

export const saveOnboardingDone = async (username: string, preferred_time_class?: string) => {
  await axios.post('/api/chess/onboarding', { username, preferred_time_class });
};

export const fetchChessInsight = async (
  type: string,
  rows: { games_per_day: number; win_rate: number }[],
): Promise<{ en: string; fr: string }> => {
  const response = await axios.post('/api/chess-insight', { type, rows });
  return { en: response.data.summary_en, fr: response.data.summary_fr };
};
