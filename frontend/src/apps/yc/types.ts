// Shape of GET /api/yc/videos (see backend/blueprints/yc.py).
export interface YcVideo {
  id: string;
  title: string;
  published: string | null;
  description: string;
  views: number | null;
  thumbnail: string;
  url: string;
}

export interface YcVideosResponse {
  videos: YcVideo[];
  error?: string;
}
