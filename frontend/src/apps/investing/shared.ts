export interface CorrelationResponse {
  tickers: string[];
  names: Record<string, string>;
  matrix: number[][];
  volatilities: Record<string, number>;
  avg_volatility: number;
  start: string;
  observations: number;
}

// Emerald for positive correlation, rose for negative. The diagonal is always 1.
const POS_RGB = '16, 185, 129'; // emerald-500
const NEG_RGB = '244, 63, 94'; // rose-500

// Translucent fill for a matrix cell, opacity scaled by correlation strength.
export function cellColor(v: number): string {
  const t = Math.max(-1, Math.min(1, v));
  const a = (0.12 + 0.55 * Math.abs(t)).toFixed(2);
  return `rgba(${t >= 0 ? POS_RGB : NEG_RGB}, ${a})`;
}

// Solid version of the same hue, for text.
export function solidColor(v: number): string {
  return `rgb(${v >= 0 ? POS_RGB : NEG_RGB})`;
}

// Average correlation (rho-bar): the arithmetic mean of every unique pairwise
// coefficient, i.e. the upper triangle of the matrix, diagonal excluded.
export function averageCorrelation(matrix: number[][]): number | null {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix.length; j++) {
      sum += matrix[i][j];
      count += 1;
    }
  }
  return count ? sum / count : null;
}

// Effective Number of Constituents: how many fully uncorrelated stocks the
// portfolio behaves like. N / (1 + rho-bar * (N - 1)).
export function effectiveNumber(rho: number, n: number): number | null {
  const denom = 1 + rho * (n - 1);
  return denom > 0 ? n / denom : null;
}

// Format a fraction as a one-decimal percentage.
export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
