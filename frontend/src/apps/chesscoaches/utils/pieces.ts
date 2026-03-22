// Chess piece image URLs (CBurnett/Merida from Lichess, CC BY-SA 3.0)

export const BOARD_LIGHT = '#f0d9b5';
export const BOARD_DARK = '#b58863';

export function pieceImageUrl(piece: string): string {
  const color = piece === piece.toUpperCase() ? 'w' : 'b';
  return `/pieces/${color}${piece.toUpperCase()}.svg`;
}
