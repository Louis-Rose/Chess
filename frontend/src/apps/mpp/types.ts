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
}

export interface MppData {
  contests: MppContest[];
  raw: unknown;
}
