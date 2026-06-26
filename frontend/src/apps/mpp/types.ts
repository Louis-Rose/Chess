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

export interface MppHistory {
  rows: Array<{ date: string } & Record<string, number | null>>;
  users: { id: string; name: string }[];
  me_user_id: string | null;
}

export interface MppCoteCell {
  cote: { home: number | null; draw: number | null; away: number | null };
  prono: { home: number | null; draw: number | null; away: number | null };
}

export interface MppTestMatch {
  match_id: string;
  home: string | null;
  away: string | null;
  home_crest: string | null;
  away_crest: string | null;
  date: string | null;
  status: 'final' | 'live' | 'upcoming' | null;
  cells: Record<string, MppCoteCell>; // keyed by fetch column (batch_at ISO)
}

export interface MppTests {
  columns: string[]; // batch_at ISO strings, oldest first
  matches: MppTestMatch[];
}
