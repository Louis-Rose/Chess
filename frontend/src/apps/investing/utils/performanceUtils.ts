/**
 * Performance Metrics Utility Module
 *
 * Provides robust calculation functions for investment performance metrics
 * including Simple Return (SR) and Compound Annual Growth Rate (CAGR).
 *
 * @module performanceUtils
 */

// ============================================================================
// Types
// ============================================================================

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

export interface CAGROptions {
  /**
   * How to handle periods less than 1 year.
   * - 'extrapolate': Annualize the return (default) - projects what the return would be over a full year
   * - 'simple': Return the simple return instead of annualizing
   *
   * Note: Extrapolation for very short periods can produce misleading results.
   * A 5% gain in 1 month extrapolates to ~79.6% CAGR, which may not be realistic.
   */
  shortPeriodBehavior?: 'extrapolate' | 'simple';

  /**
   * Minimum period in days to calculate CAGR.
   * Below this threshold, returns null to avoid unrealistic annualization.
   * Default: 30 days
   */
  minimumDays?: number;
}

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

/** Number of days in a year for calculations */
const DAYS_PER_YEAR = 365;

/** Default minimum days for CAGR calculation */
const DEFAULT_MINIMUM_DAYS = 30;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculates the period between two dates in years (fractional).
 * Uses exact day count divided by 365.
 *
 * @param startDate - Start date
 * @param endDate - End date
 * @returns DatePeriod object with years, days, and validity
 *
 * @example
 * calculatePeriod(new Date('2023-01-01'), new Date('2024-01-01'))
 * // => { years: 1.0, days: 365, isValid: true }
 *
 * calculatePeriod(new Date('2023-01-01'), new Date('2023-07-02'))
 * // => { years: 0.5, days: ~182, isValid: true }
 */
export function calculatePeriod(startDate: Date, endDate: Date): DatePeriod {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  // Check for invalid dates
  if (isNaN(startMs) || isNaN(endMs)) {
    return {
      years: 0,
      days: 0,
      isValid: false,
      error: 'Invalid date provided',
    };
  }

  const diffMs = endMs - startMs;
  const days = diffMs / (1000 * 60 * 60 * 24);

  // Check for negative period (start date after end date)
  if (days < 0) {
    return {
      years: days / DAYS_PER_YEAR,
      days,
      isValid: false,
      error: 'Start date is after end date (negative period)',
    };
  }

  // Check for zero period
  if (days === 0) {
    return {
      years: 0,
      days: 0,
      isValid: false,
      error: 'Start and end dates are the same (zero period)',
    };
  }

  return {
    years: days / DAYS_PER_YEAR,
    days,
    isValid: true,
  };
}

/**
 * Parses a date string or Date object into a Date.
 * Handles ISO strings, date strings, and Date objects.
 */
function parseDate(date: Date | string): Date {
  if (date instanceof Date) return date;
  return new Date(date);
}

// ============================================================================
// Core Calculation Functions
// ============================================================================

/**
 * Calculates Simple Return (SR).
 *
 * Formula: SR = (Ending Value - Beginning Value) / Beginning Value
 *
 * @param beginningValue - Initial investment value
 * @param endingValue - Final investment value
 * @returns PerformanceResult with the simple return
 *
 * @example
 * calculateSimpleReturn(10000, 12000)
 * // => { value: 0.2, percentage: 20, success: true }
 *
 * calculateSimpleReturn(10000, 8000)
 * // => { value: -0.2, percentage: -20, success: true }
 */
export function calculateSimpleReturn(
  beginningValue: number,
  endingValue: number
): PerformanceResult {
  // Handle division by zero
  if (beginningValue === 0) {
    return {
      value: 0,
      percentage: 0,
      success: false,
      error: 'Beginning value cannot be zero (division by zero)',
    };
  }

  // Handle negative beginning value (unusual but possible in some scenarios)
  if (beginningValue < 0) {
    return {
      value: 0,
      percentage: 0,
      success: false,
      error: 'Beginning value cannot be negative',
    };
  }

  const simpleReturn = (endingValue - beginningValue) / beginningValue;

  // Round to avoid floating-point precision issues (10 decimal places)
  const roundedValue = Math.round(simpleReturn * 1e10) / 1e10;
  const roundedPercentage = Math.round(roundedValue * 1000) / 10;

  return {
    value: roundedValue,
    percentage: roundedPercentage,
    success: true,
  };
}

/**
 * Calculates Compound Annual Growth Rate (CAGR).
 *
 * Formula: CAGR = (Ending / Beginning)^(1/n) - 1
 * Where n is the number of years (fractional).
 *
 * @param beginningValue - Initial investment value
 * @param endingValue - Final investment value
 * @param startDate - Start date of the investment period
 * @param endDate - End date of the investment period
 * @param options - Configuration options
 * @returns PerformanceResult with the CAGR
 *
 * @example
 * // 2-year investment with 21% total return = 10% CAGR
 * calculateCAGR(10000, 12100, new Date('2022-01-01'), new Date('2024-01-01'))
 * // => { value: 0.1, percentage: 10, success: true }
 *
 * // Short period (< 1 year) with extrapolation
 * calculateCAGR(10000, 10500, new Date('2024-01-01'), new Date('2024-07-01'))
 * // => Extrapolates the 5% gain over 6 months to an annual rate
 */
export function calculateCAGR(
  beginningValue: number,
  endingValue: number,
  startDate: Date | string,
  endDate: Date | string,
  options: CAGROptions = {}
): PerformanceResult {
  const {
    shortPeriodBehavior = 'extrapolate',
    minimumDays = DEFAULT_MINIMUM_DAYS,
  } = options;

  // Validate beginning value
  if (beginningValue === 0) {
    return {
      value: 0,
      percentage: 0,
      success: false,
      error: 'Beginning value cannot be zero (division by zero)',
    };
  }

  if (beginningValue < 0) {
    return {
      value: 0,
      percentage: 0,
      success: false,
      error: 'Beginning value cannot be negative',
    };
  }

  // Parse dates
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  // Calculate period
  const period = calculatePeriod(start, end);

  if (!period.isValid) {
    return {
      value: 0,
      percentage: 0,
      success: false,
      error: period.error,
    };
  }

  // Check minimum period
  if (period.days < minimumDays) {
    return {
      value: 0,
      percentage: 0,
      success: false,
      error: `Period too short for meaningful CAGR (${Math.round(period.days)} days, minimum: ${minimumDays} days)`,
    };
  }

  // Handle negative ending value (complete loss)
  if (endingValue < 0) {
    return {
      value: -1,
      percentage: -100,
      success: true,
    };
  }

  // Calculate total return ratio
  const totalReturn = endingValue / beginningValue;

  // Handle short periods
  if (period.years < 1 && shortPeriodBehavior === 'simple') {
    return calculateSimpleReturn(beginningValue, endingValue);
  }

  // Calculate CAGR: (Ending/Beginning)^(1/n) - 1
  // For negative returns (totalReturn < 1), this still works correctly
  const cagr = Math.pow(totalReturn, 1 / period.years) - 1;

  // Round to avoid floating-point precision issues
  const roundedValue = Math.round(cagr * 1e10) / 1e10;
  const roundedPercentage = Math.round(roundedValue * 1000) / 10;

  return {
    value: roundedValue,
    percentage: roundedPercentage,
    success: true,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Calculates both Simple Return and CAGR for a given investment.
 * Useful when you need both metrics at once.
 *
 * @param beginningValue - Initial investment value
 * @param endingValue - Final investment value
 * @param startDate - Start date of the investment period
 * @param endDate - End date of the investment period
 * @param options - CAGR calculation options
 * @returns Object containing both simple return and CAGR results
 */
export function calculatePerformanceMetrics(
  beginningValue: number,
  endingValue: number,
  startDate: Date | string,
  endDate: Date | string,
  options: CAGROptions = {}
): {
  simpleReturn: PerformanceResult;
  cagr: PerformanceResult;
  period: DatePeriod;
} {
  const period = calculatePeriod(parseDate(startDate), parseDate(endDate));

  return {
    simpleReturn: calculateSimpleReturn(beginningValue, endingValue),
    cagr: calculateCAGR(beginningValue, endingValue, startDate, endDate, options),
    period,
  };
}

/**
 * Formats a performance percentage for display.
 *
 * @param percentage - The percentage value (e.g., 15.5 for 15.5%)
 * @param options - Formatting options
 * @returns Formatted string (e.g., "+15.5%" or "-3.2%")
 */
export function formatPerformancePercentage(
  percentage: number,
  options: {
    showSign?: boolean;
    decimals?: number;
  } = {}
): string {
  const { showSign = true, decimals = 1 } = options;

  const formatted = percentage.toFixed(decimals);
  const sign = showSign && percentage > 0 ? '+' : '';

  return `${sign}${formatted}%`;
}

/**
 * Determines if a period is considered "short" for CAGR purposes.
 * Short periods may produce misleading annualized results.
 *
 * @param startDate - Start date
 * @param endDate - End date
 * @param thresholdYears - Threshold below which period is considered short (default: 1)
 * @returns true if the period is less than the threshold
 */
export function isShortPeriod(
  startDate: Date | string,
  endDate: Date | string,
  thresholdYears: number = 1
): boolean {
  const period = calculatePeriod(parseDate(startDate), parseDate(endDate));
  return period.isValid && period.years < thresholdYears;
}
