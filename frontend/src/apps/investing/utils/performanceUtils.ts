/**
 * Performance Metrics Utility Module
 *
 * Provides robust calculation functions for investment performance metrics:
 * - Simple Return (SR)
 * - Compound Annual Growth Rate (CAGR)
 * - Time-Weighted Return (TWR) - GIPS compliant
 * - Money-Weighted Return (MWR) / Internal Rate of Return (IRR)
 *
 * @module performanceUtils
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Represents a cash flow event (deposit or withdrawal).
 * Convention: Negative = Deposit/Investment, Positive = Withdrawal/Distribution
 */
export interface CashFlow {
  /** Date of the cash flow */
  date: Date;
  /** Amount of the cash flow (negative = deposit, positive = withdrawal) */
  amount: number;
}

/**
 * Represents the portfolio value at a specific point in time.
 */
export interface ValuationPoint {
  /** Date of the valuation */
  date: Date;
  /** Total portfolio value at this date (after any transactions) */
  value: number;
  /** Portfolio value excluding stocks bought on this date (for TWR end values) */
  valueExcludingNewPurchases?: number;
}

/**
 * Result of a performance calculation.
 */
export interface PerformanceResult {
  /** The calculated value as a decimal (e.g., 0.15 for 15%) */
  value: number;
  /** The calculated value as a percentage (e.g., 15 for 15%) */
  percentage: number;
  /** Whether the calculation was successful */
  success: boolean;
  /** Error message if calculation failed */
  error?: string;
}

/**
 * Detailed sub-period information for TWR calculation.
 */
export interface TWRSubPeriod {
  /** Start date of the sub-period */
  startDate: Date;
  /** End date of the sub-period */
  endDate: Date;
  /** Portfolio value at start (after any cash flow) */
  startValue: number;
  /** Portfolio value at end (before any cash flow) */
  endValue: number;
  /** Sub-period return as decimal */
  return: number;
  /** Sub-period return as percentage */
  returnPct: number;
}

/**
 * Detailed result of TWR calculation with sub-period breakdown.
 */
export interface TWRDetailedResult extends PerformanceResult {
  /** Sub-period details for the chain-linking calculation */
  subPeriods: TWRSubPeriod[];
}

/**
 * Options for CAGR calculation.
 */
export interface CAGROptions {
  /**
   * How to handle periods less than 1 year.
   * - 'extrapolate': Annualize the return (projects what the return would be over a full year)
   * - 'simple': Return the simple return instead of annualizing (default, recommended)
   *
   * Note: Extrapolation for short periods can produce misleading results.
   */
  shortPeriodBehavior?: 'extrapolate' | 'simple';

  /**
   * Minimum period in days to calculate CAGR.
   * Below this threshold, returns error to avoid unrealistic results.
   * Default: 30 days
   */
  minimumDays?: number;
}

/**
 * Options for MWR/IRR calculation.
 */
export interface MWROptions {
  /** Maximum iterations for Newton-Raphson method (default: 100) */
  maxIterations?: number;
  /** Convergence tolerance (default: 1e-7) */
  tolerance?: number;
  /** Initial guess for the rate (default: 0.1 = 10%) */
  initialGuess?: number;
}

/**
 * Period information between two dates.
 */
export interface DatePeriod {
  /** Period in years (fractional) */
  years: number;
  /** Period in days */
  days: number;
  /** Whether the period is valid (positive) */
  isValid: boolean;
  /** Error message if invalid */
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Milliseconds per day */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Days per year for calculations */
const DAYS_PER_YEAR = 365;

/** Milliseconds per year */
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;

/** Default minimum days for CAGR calculation */
const DEFAULT_MINIMUM_DAYS = 30;

/** Default max iterations for Newton-Raphson */
const DEFAULT_MAX_ITERATIONS = 100;

/** Default tolerance for Newton-Raphson convergence */
const DEFAULT_TOLERANCE = 1e-7;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculates the period between two dates in years (fractional).
 * Uses precise millisecond calculation.
 */
export function calculatePeriod(startDate: Date, endDate: Date): DatePeriod {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    return { years: 0, days: 0, isValid: false, error: 'Invalid date provided' };
  }

  const diffMs = endMs - startMs;
  const days = diffMs / MS_PER_DAY;

  if (days < 0) {
    return { years: days / DAYS_PER_YEAR, days, isValid: false, error: 'Start date is after end date' };
  }

  if (days === 0) {
    return { years: 0, days: 0, isValid: false, error: 'Start and end dates are the same' };
  }

  return { years: diffMs / MS_PER_YEAR, days, isValid: true };
}

/**
 * Parses a date string or Date object into a Date.
 */
function parseDate(date: Date | string): Date {
  if (date instanceof Date) return date;
  return new Date(date);
}

/**
 * Gets the date string (YYYY-MM-DD) from a Date object.
 * Used to compare dates without timezone issues.
 */
function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Rounds a number to avoid floating-point precision issues.
 */
function roundPrecision(value: number, decimals: number = 10): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Converts a decimal to percentage with rounding.
 */
function toPercentage(decimal: number, decimals: number = 1): number {
  return Math.round(decimal * Math.pow(10, decimals + 2)) / Math.pow(10, decimals);
}

// ============================================================================
// Core Calculation Functions
// ============================================================================

/**
 * Calculates Simple Return (SR).
 *
 * Formula: SR = (Ending Value - Beginning Value) / Beginning Value
 *
 * ⚠️ Note: Simple Return does NOT account for intermediate cash flows.
 * For portfolios with deposits/withdrawals, use TWR or MWR instead.
 *
 * @param beginningValue - Initial investment value
 * @param endingValue - Final investment value
 * @returns PerformanceResult with the simple return
 *
 * @example
 * calculateSimpleReturn(10000, 12000)
 * // => { value: 0.2, percentage: 20, success: true }
 */
export function calculateSimpleReturn(
  beginningValue: number,
  endingValue: number
): PerformanceResult {
  if (beginningValue === 0) {
    return { value: 0, percentage: 0, success: false, error: 'Beginning value cannot be zero' };
  }

  if (beginningValue < 0) {
    return { value: 0, percentage: 0, success: false, error: 'Beginning value cannot be negative' };
  }

  const simpleReturn = (endingValue - beginningValue) / beginningValue;
  const roundedValue = roundPrecision(simpleReturn);

  return {
    value: roundedValue,
    percentage: toPercentage(roundedValue),
    success: true,
  };
}

/**
 * Calculates Compound Annual Growth Rate (CAGR).
 *
 * Formula: CAGR = (Ending / Beginning)^(1/n) - 1
 * Where n is the number of years (fractional).
 *
 * ⚠️ Note: CAGR does NOT account for intermediate cash flows.
 * It assumes a single initial investment held for the entire period.
 * For portfolios with deposits/withdrawals, use TWR or MWR instead.
 *
 * @param beginningValue - Initial investment value
 * @param endingValue - Final investment value
 * @param startDate - Start date of the investment period
 * @param endDate - End date of the investment period
 * @param options - Configuration options
 * @returns PerformanceResult with the CAGR
 *
 * @example
 * // 2-year investment: $10,000 → $12,100 = 10% CAGR
 * calculateCAGR(10000, 12100, new Date('2022-01-01'), new Date('2024-01-01'))
 */
export function calculateCAGR(
  beginningValue: number,
  endingValue: number,
  startDate: Date | string,
  endDate: Date | string,
  options: CAGROptions = {}
): PerformanceResult {
  const { shortPeriodBehavior = 'simple', minimumDays = DEFAULT_MINIMUM_DAYS } = options;

  if (beginningValue === 0) {
    return { value: 0, percentage: 0, success: false, error: 'Beginning value cannot be zero' };
  }

  if (beginningValue < 0) {
    return { value: 0, percentage: 0, success: false, error: 'Beginning value cannot be negative' };
  }

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const period = calculatePeriod(start, end);

  if (!period.isValid) {
    return { value: 0, percentage: 0, success: false, error: period.error };
  }

  if (period.days < minimumDays) {
    return {
      value: 0,
      percentage: 0,
      success: false,
      error: `Period too short (${Math.round(period.days)} days, minimum: ${minimumDays})`,
    };
  }

  // For periods less than 1 year, return simple return by default
  if (period.years < 1 && shortPeriodBehavior === 'simple') {
    return calculateSimpleReturn(beginningValue, endingValue);
  }

  if (endingValue < 0) {
    return { value: -1, percentage: -100, success: true };
  }

  const totalReturn = endingValue / beginningValue;
  const cagr = Math.pow(totalReturn, 1 / period.years) - 1;
  const roundedValue = roundPrecision(cagr);

  return {
    value: roundedValue,
    percentage: toPercentage(roundedValue),
    success: true,
  };
}

/**
 * Calculates Time-Weighted Return (TWR) using the GIPS chain-linking method.
 *
 * TWR measures the compound rate of growth, eliminating the effect of cash flows.
 * It's the industry standard for comparing investment manager performance.
 *
 * Algorithm (GIPS Compliant):
 * 1. Break the timeframe into sub-periods at each cash flow date
 * 2. For each sub-period: Return = (V_end - V_start) / V_start
 * 3. Chain-link: TWR = ∏(1 + R_i) - 1
 *
 * @param valuations - Portfolio values at key dates (must include values on cash flow dates, BEFORE the flow)
 * @param cashFlows - Array of cash flows (negative = deposit, positive = withdrawal)
 * @returns PerformanceResult with the TWR
 *
 * @example
 * const valuations = [
 *   { date: new Date('2024-01-01'), value: 10000 },
 *   { date: new Date('2024-06-01'), value: 10500 },  // Value BEFORE deposit
 *   { date: new Date('2024-12-31'), value: 16000 },
 * ];
 * const cashFlows = [
 *   { date: new Date('2024-06-01'), amount: -5000 },  // Deposit of 5000
 * ];
 * calculateTWR(valuations, cashFlows)
 * // Returns the time-weighted return excluding the effect of the deposit
 */
export function calculateTWR(
  valuations: ValuationPoint[],
  cashFlows: CashFlow[]
): PerformanceResult {
  if (valuations.length < 2) {
    return { value: 0, percentage: 0, success: false, error: 'Need at least 2 valuation points' };
  }

  // Sort valuations by date
  const sortedValuations = [...valuations].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Sort cash flows by date
  const sortedCashFlows = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Calculate sub-period returns
  const subPeriodReturns: number[] = [];
  let previousValue = sortedValuations[0].value;
  let previousDate = sortedValuations[0].date;

  for (let i = 1; i < sortedValuations.length; i++) {
    const currentValuation = sortedValuations[i];
    const currentDate = currentValuation.date;
    const currentValueRaw = currentValuation.value;

    // End value should exclude stocks bought on the end date
    // Use valueExcludingNewPurchases if available, otherwise fall back to raw value
    const endValue = currentValuation.valueExcludingNewPurchases ?? currentValueRaw;

    // Starting value = previous valuation (end-of-day value, already AFTER any cash flow on that date)
    const startingValue = previousValue;

    if (startingValue <= 0) {
      // Skip periods with zero or negative starting value
      previousValue = currentValueRaw;
      previousDate = currentDate;
      continue;
    }

    // Sub-period return = (ending value - starting value) / starting value
    const subPeriodReturn = (endValue - startingValue) / startingValue;
    subPeriodReturns.push(subPeriodReturn);

    previousValue = currentValueRaw;
    previousDate = currentDate;
  }

  if (subPeriodReturns.length === 0) {
    return { value: 0, percentage: 0, success: false, error: 'No valid sub-periods found' };
  }

  // Chain-link the returns: TWR = ∏(1 + R_i) - 1
  const twr = subPeriodReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
  const roundedValue = roundPrecision(twr);

  return {
    value: roundedValue,
    percentage: toPercentage(roundedValue),
    success: true,
  };
}

/**
 * Calculates Time-Weighted Return (TWR) with detailed sub-period breakdown.
 * Returns the same result as calculateTWR but includes sub-period details
 * for displaying the chain-linking calculation.
 *
 * @param valuations - Portfolio values at key dates (must include values on cash flow dates, BEFORE the flow)
 * @param cashFlows - Array of cash flows (negative = deposit, positive = withdrawal)
 * @returns TWRDetailedResult with the TWR and sub-period breakdown
 */
export function calculateTWRDetailed(
  valuations: ValuationPoint[],
  cashFlows: CashFlow[]
): TWRDetailedResult {
  if (valuations.length < 2) {
    return { value: 0, percentage: 0, success: false, error: 'Need at least 2 valuation points', subPeriods: [] };
  }

  // Sort valuations by date
  const sortedValuations = [...valuations].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Sort cash flows by date
  const sortedCashFlows = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Calculate sub-period returns with details
  const subPeriods: TWRSubPeriod[] = [];
  let previousValue = sortedValuations[0].value;
  let previousDate = sortedValuations[0].date;

  for (let i = 1; i < sortedValuations.length; i++) {
    const currentValuation = sortedValuations[i];
    const currentDate = currentValuation.date;
    const currentValueRaw = currentValuation.value;

    // End value should exclude stocks bought on the end date
    // Use valueExcludingNewPurchases if available, otherwise fall back to raw value
    const endValue = currentValuation.valueExcludingNewPurchases ?? currentValueRaw;

    // Starting value = previous valuation (end-of-day value, already AFTER any cash flow on that date)
    const startingValue = previousValue;

    if (startingValue <= 0) {
      // Skip periods with zero or negative starting value
      previousValue = currentValueRaw;
      previousDate = currentDate;
      continue;
    }

    // Sub-period return = (ending value - starting value) / starting value
    const subPeriodReturn = (endValue - startingValue) / startingValue;

    subPeriods.push({
      startDate: previousDate,
      endDate: currentDate,
      startValue: startingValue,
      endValue: endValue,
      return: subPeriodReturn,
      returnPct: Math.round(subPeriodReturn * 1000) / 10,
    });

    previousValue = currentValueRaw;
    previousDate = currentDate;
  }

  if (subPeriods.length === 0) {
    return { value: 0, percentage: 0, success: false, error: 'No valid sub-periods found', subPeriods: [] };
  }

  // Chain-link the returns: TWR = ∏(1 + R_i) - 1
  const twr = subPeriods.reduce((acc, sp) => acc * (1 + sp.return), 1) - 1;
  const roundedValue = roundPrecision(twr);

  return {
    value: roundedValue,
    percentage: toPercentage(roundedValue),
    success: true,
    subPeriods,
  };
}

/**
 * Calculates Money-Weighted Return (MWR) / Internal Rate of Return (IRR).
 *
 * MWR measures the rate of return that makes the NPV of all cash flows equal to zero.
 * Unlike TWR, it IS affected by the timing and size of cash flows.
 * Use this when you control the timing of investments.
 *
 * Algorithm: Newton-Raphson method to solve for r where NPV = 0
 * NPV = Σ(CF_i / (1 + r)^((Date_i - Date_0) / 365))
 *
 * @param initialInvestment - The initial investment amount (as positive number)
 * @param cashFlows - Subsequent cash flows (negative = deposit, positive = withdrawal)
 * @param endingValue - Current portfolio value (treated as final withdrawal)
 * @param endDate - Date of the ending valuation
 * @param startDate - Date of the initial investment
 * @param options - Calculation options
 * @returns PerformanceResult with the MWR/IRR
 *
 * @example
 * calculateMWR(
 *   10000,  // Initial investment
 *   [{ date: new Date('2024-06-01'), amount: -5000 }],  // Additional deposit
 *   16500,  // Current value
 *   new Date('2024-12-31'),
 *   new Date('2024-01-01')
 * )
 */
export function calculateMWR(
  initialInvestment: number,
  cashFlows: CashFlow[],
  endingValue: number,
  endDate: Date | string,
  startDate: Date | string,
  options: MWROptions = {}
): PerformanceResult {
  const {
    maxIterations = DEFAULT_MAX_ITERATIONS,
    tolerance = DEFAULT_TOLERANCE,
    initialGuess = 0.1,
  } = options;

  const start = parseDate(startDate);
  const end = parseDate(endDate);

  // Build the complete cash flow series for XIRR
  // Convention: negative = outflow (investment), positive = inflow (return)
  const allCashFlows: { date: Date; amount: number }[] = [
    { date: start, amount: -initialInvestment },  // Initial investment (outflow)
    ...cashFlows.map(cf => ({ date: parseDate(cf.date as unknown as string), amount: cf.amount })),
    { date: end, amount: endingValue },  // Ending value (as if withdrawn)
  ];

  // Sort by date
  allCashFlows.sort((a, b) => a.date.getTime() - b.date.getTime());

  const baseDate = allCashFlows[0].date;

  // NPV function: sum of CF / (1+r)^t
  const npv = (rate: number): number => {
    return allCashFlows.reduce((sum, cf) => {
      const years = (cf.date.getTime() - baseDate.getTime()) / MS_PER_YEAR;
      // Handle edge case where rate = -1 (would cause division by zero for t > 0)
      if (rate <= -1 && years > 0) return Infinity;
      return sum + cf.amount / Math.pow(1 + rate, years);
    }, 0);
  };

  // Derivative of NPV with respect to rate
  const npvDerivative = (rate: number): number => {
    return allCashFlows.reduce((sum, cf) => {
      const years = (cf.date.getTime() - baseDate.getTime()) / MS_PER_YEAR;
      if (years === 0) return sum;  // Derivative is 0 for t=0
      if (rate <= -1 && years > 0) return -Infinity;
      return sum - years * cf.amount / Math.pow(1 + rate, years + 1);
    }, 0);
  };

  // Newton-Raphson iteration
  let rate = initialGuess;

  for (let i = 0; i < maxIterations; i++) {
    const f = npv(rate);
    const fPrime = npvDerivative(rate);

    if (Math.abs(fPrime) < 1e-12) {
      // Derivative too small, try a different approach
      // Use bisection as fallback
      return calculateMWRBisection(allCashFlows, baseDate, options);
    }

    const newRate = rate - f / fPrime;

    // Check for convergence
    if (Math.abs(newRate - rate) < tolerance) {
      const roundedValue = roundPrecision(newRate);
      return {
        value: roundedValue,
        percentage: toPercentage(roundedValue),
        success: true,
      };
    }

    // Bound the rate to prevent divergence
    rate = Math.max(-0.99, Math.min(10, newRate));
  }

  // Newton-Raphson didn't converge, try bisection
  return calculateMWRBisection(allCashFlows, baseDate, options);
}

/**
 * Fallback bisection method for MWR when Newton-Raphson doesn't converge.
 */
function calculateMWRBisection(
  allCashFlows: { date: Date; amount: number }[],
  baseDate: Date,
  options: MWROptions = {}
): PerformanceResult {
  const { maxIterations = DEFAULT_MAX_ITERATIONS, tolerance = DEFAULT_TOLERANCE } = options;

  const npv = (rate: number): number => {
    return allCashFlows.reduce((sum, cf) => {
      const years = (cf.date.getTime() - baseDate.getTime()) / MS_PER_YEAR;
      if (rate <= -1 && years > 0) return Infinity;
      return sum + cf.amount / Math.pow(1 + rate, years);
    }, 0);
  };

  // Find bounds where NPV changes sign
  let lower = -0.99;
  let upper = 10;

  const npvLower = npv(lower);
  const npvUpper = npv(upper);

  if (npvLower * npvUpper > 0) {
    return { value: 0, percentage: 0, success: false, error: 'Could not find IRR bounds' };
  }

  // Bisection method
  for (let i = 0; i < maxIterations; i++) {
    const mid = (lower + upper) / 2;
    const npvMid = npv(mid);

    if (Math.abs(npvMid) < tolerance || (upper - lower) / 2 < tolerance) {
      const roundedValue = roundPrecision(mid);
      return {
        value: roundedValue,
        percentage: toPercentage(roundedValue),
        success: true,
      };
    }

    if (npvMid * npv(lower) < 0) {
      upper = mid;
    } else {
      lower = mid;
    }
  }

  return { value: 0, percentage: 0, success: false, error: 'IRR calculation did not converge' };
}

/**
 * Alias for calculateMWR - calculates Internal Rate of Return.
 * IRR and MWR are the same calculation.
 */
export const calculateIRR = calculateMWR;

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Calculates all performance metrics for a portfolio.
 */
export function calculateAllMetrics(
  initialValue: number,
  currentValue: number,
  startDate: Date | string,
  endDate: Date | string,
  cashFlows: CashFlow[] = [],
  valuations: ValuationPoint[] = []
): {
  simpleReturn: PerformanceResult;
  cagr: PerformanceResult;
  twr: PerformanceResult;
  mwr: PerformanceResult;
} {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  // Simple Return (ignores cash flows)
  const simpleReturn = calculateSimpleReturn(initialValue, currentValue);

  // CAGR (ignores cash flows)
  const cagr = calculateCAGR(initialValue, currentValue, start, end);

  // TWR (if we have valuations)
  let twr: PerformanceResult = { value: 0, percentage: 0, success: false, error: 'No valuations provided' };
  if (valuations.length >= 2) {
    twr = calculateTWR(valuations, cashFlows);
  }

  // MWR/IRR
  let mwr: PerformanceResult = { value: 0, percentage: 0, success: false, error: 'Insufficient data' };
  if (initialValue > 0) {
    mwr = calculateMWR(initialValue, cashFlows, currentValue, end, start);
  }

  return { simpleReturn, cagr, twr, mwr };
}

/**
 * Formats a performance percentage for display.
 */
export function formatPerformancePercentage(
  percentage: number,
  options: { showSign?: boolean; decimals?: number } = {}
): string {
  const { showSign = true, decimals = 1 } = options;
  const formatted = percentage.toFixed(decimals);
  const sign = showSign && percentage > 0 ? '+' : '';
  return `${sign}${formatted}%`;
}

/**
 * Checks if a period is considered "short" for annualization purposes.
 */
export function isShortPeriod(
  startDate: Date | string,
  endDate: Date | string,
  thresholdYears: number = 1
): boolean {
  const period = calculatePeriod(parseDate(startDate), parseDate(endDate));
  return period.isValid && period.years < thresholdYears;
}
