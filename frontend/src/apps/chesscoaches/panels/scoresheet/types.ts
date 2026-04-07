export interface VoteState {
  setEditValue: (san: string) => void;
  moveIdx: number;
  color: 'white' | 'black';
  goToMove: (moveNumber: number, color: 'white' | 'black', ply: number) => void;
  clearSelection: () => void;
}

export interface PlyEntry {
  fen: string;
  lastMove: { from: string; to: string } | null;
  illegal?: { moveNumber: number; color: 'white' | 'black'; san: string; reason?: string };
  san?: string;
  reason?: string;
}

export interface ConsensusMeta {
  white?: string;
  black?: string;
  result?: string;
  date?: string;
  event?: string;
  notation?: string;
}
