import { Chess } from 'chess.js';
import type { ScoresheetMove as Move } from '../../contexts/CoachesDataContext';

/** Try to resolve shorthand pawn capture like 'ef' to 'exf6' (en passant or regular) */
export function resolvePawnCapture(chess: InstanceType<typeof Chess>, san: string): string | null {
  if (san.length !== 2 || !('abcdefgh'.includes(san[0])) || !('abcdefgh'.includes(san[1]))) return null;
  if (Math.abs(san.charCodeAt(0) - san.charCodeAt(1)) !== 1) return null;
  // Find any pawn capture from san[0]-file to san[1]-file
  const matches = chess.moves({ verbose: true }).filter(m =>
    !m.san[0].match(/[A-Z]/) && m.san[0] === san[0] && m.to[0] === san[1] && m.flags.includes('c')
  );
  if (matches.length === 1) return matches[0].san;
  // Multiple matches (rare) — prefer en passant
  const ep = matches.find(m => m.flags.includes('e'));
  return ep ? ep.san : matches[0]?.san || null;
}

const NOTATION_MAPS: Record<string, Record<string, string>> = {
  french: { R: 'T', B: 'F', Q: 'D', N: 'C', K: 'R' },
  armenian: { R: 'ն', B: 'փ', Q: 'թ', N: 'Ձ', K: 'Ա' },
};

export function toNotation(san: string, notation?: string): string {
  if (!san || !notation || notation === 'english') return san;
  const map = NOTATION_MAPS[notation];
  if (!map) return san;
  if (san[0] in map) return map[san[0]] + san.slice(1);
  return san;
}

/** Replay moves on a board and return copies with correct +/# annotations only (keeps original move text). */
export function normalizeMoves(moves: Move[]): Move[] {
  const chess = new Chess();
  return moves.map(m => {
    const out: Move = { ...m };
    for (const color of ['white', 'black'] as const) {
      const san = m[color];
      if (!san) continue;
      try {
        const move = chess.move(san);
        if (move) {
          // Keep original text but fix check/checkmate suffix
          const base = san.replace(/[+#]/g, '');
          const suffix = move.san.endsWith('#') ? '#' : move.san.endsWith('+') ? '+' : '';
          out[color] = base + suffix;
        }
      } catch {
        // illegal move — keep original text
      }
    }
    return out;
  });
}

export function buildPgn(moves: Move[], meta?: { white?: string; black?: string; result?: string; date?: string; event?: string; notation?: string }): string {
  const headers = [
    meta?.event ? `[Event "${meta.event}"]` : null,
    meta?.date ? `[Date "${meta.date}"]` : null,
    `[White "${meta?.white || '?'}"]`,
    `[Black "${meta?.black || '?'}"]`,
    `[Result "${meta?.result || '*'}"]`,
  ].filter(Boolean).join('\n');
  const normalized = normalizeMoves(moves);
  const moveText = normalized.map(m =>
    `${m.number}. ${m.white}${m.black ? ' ' + m.black : ''}`
  ).join(' ');
  return `${headers}\n\n${moveText} ${meta?.result || '*'}\n`;
}
