export interface MppStatus {
  connected: boolean;
  updated_at: string | null;
}

export interface MppContest {
  id: string | number | null;
  title: string | null;
  ranking: number | null;
  points: number | null;
  participants: number | null;
  image_url: string | null;
  season: number | null;
  is_live: boolean | null;
}

export interface MppData {
  contests: MppContest[];
}

export interface MppStanding {
  user_id: string;
  username: string;
  avatar_url: string | null;
  level: number | null;
  rank: number;
  points: number;
  good: number;
  exact: number;
}

export interface MppStandings {
  standings: MppStanding[];
  me_user_id: string | null;
  total: number | null;
}
