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

export const fetchFideRating = async (fideId: string) => {
  const response = await axios.get(`/api/chess/fide-rating?fide_id=${encodeURIComponent(fideId)}`);
  return response.data as {
    name: string | null;
    federation: string | null;
    fide_title: string | null;
    classical_rating: number | null;
    rapid_rating: number | null;
    blitz_rating: number | null;
  };
};

export const fetchFideId = async (username: string): Promise<string | null> => {
  const response = await axios.get(`/api/chess/fide-id?username=${encodeURIComponent(username)}`);
  return response.data.fide_id;
};

export const saveFideId = async (username: string, fideId: string) => {
  await axios.post('/api/chess/fide-id', { username, fide_id: fideId });
};

export const fetchFideFriends = async (username: string) => {
  const response = await axios.get(`/api/chess/fide-friends?username=${encodeURIComponent(username)}`);
  return response.data.friends as {
    fide_id: string;
    name: string | null;
    federation: string | null;
    fide_title: string | null;
    classical_rating: number | null;
    rapid_rating: number | null;
    blitz_rating: number | null;
  }[];
};

export const addFideFriend = async (username: string, fideId: string) => {
  await axios.post('/api/chess/fide-friends', { username, fide_id: fideId });
};

export const removeFideFriend = async (username: string, fideId: string) => {
  await axios.delete('/api/chess/fide-friends', { data: { username, fide_id: fideId } });
};

export const fetchChessInsight = async (
  type: string,
  rows: { games_per_day: number; win_rate: number }[],
): Promise<{ en: string; fr: string }> => {
  const response = await axios.post('/api/chess-insight', { type, rows });
  return { en: response.data.summary_en, fr: response.data.summary_fr };
};
