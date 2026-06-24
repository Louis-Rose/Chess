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
