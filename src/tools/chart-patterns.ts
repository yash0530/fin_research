// Pure chart pattern geometry detectors. Ported from python donor pattern_detectors.py.
// Contracts use { closes: number[]; dates: string[] } (despiked closes, YYYY-MM-DD dates).

export interface PointDetail {
  date: string;
  price: number;
}

export interface PatternResult {
  detected: true;
  patternType: string;
  patternName: string;
  direction: "bullish" | "bearish";
  confidence: number;
  neckline?: number;
  startDate: string;
  endDate: string;
  patternHeightPct: number;

  // H&S / IHS specific
  left_shoulder?: PointDetail;
  head?: PointDetail;
  right_shoulder?: PointDetail;
  target_price?: number;
  current_price?: number;
  price_vs_neckline_pct?: number;

  // Double Top / Double Bottom specific
  first_peak?: PointDetail;
  second_peak?: PointDetail;
  trough?: PointDetail;
  first_trough?: PointDetail;
  second_trough?: PointDetail;
  peak?: PointDetail;

  // Triple Top / Triple Bottom specific
  third_peak?: PointDetail;
  third_trough?: PointDetail;

  // Triangle / Wedge specific
  resistance?: number;
  support_start?: number;
  support_current?: number;
  support?: number;
  resistance_start?: number;
  resistance_current?: number;
  breakout_level?: number;
  convergence_pct?: number;

  // Cup and Handle specific
  cup_bottom?: number;
  cup_bottom_date?: string;
  left_lip?: number;
  right_lip?: number;
  cup_depth_pct?: number;

  // Bullish Flag specific
  pole_low?: number;
  pole_high?: number;
  flag_high?: number;
  flag_low?: number;
  pole_gain_pct?: number;
}

/**
 * Fits an OLS linear regression line y = m * x + c and returns [slope, intercept, rSquared].
 */
export function _fit_ols_line(x: number[], y: number[]): [number, number, number] {
  if (x.length < 2) {
    return [0.0, 0.0, 0.0];
  }
  const n = x.length;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    den += dx * dx;
  }

  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yPred = slope * x[i] + intercept;
    const dyRes = y[i] - yPred;
    const dyTot = y[i] - meanY;
    ssRes += dyRes * dyRes;
    ssTot += dyTot * dyTot;
  }

  const rSquared = ssTot > 0 ? 1.0 - ssRes / ssTot : 1.0;
  return [slope, intercept, rSquared];
}

function findLocalMaxima(prices: number[], window: number): { index: number; price: number }[] {
  const localMaxima: { index: number; price: number }[] = [];
  const n = prices.length;
  for (let i = window; i < n - window; i++) {
    let isMax = true;
    const currentPrice = prices[i];
    for (let w = i - window; w <= i + window; w++) {
      if (prices[w] > currentPrice) {
        isMax = false;
        break;
      }
    }
    if (isMax) {
      localMaxima.push({ index: i, price: currentPrice });
    }
  }
  return localMaxima;
}

function findLocalMinima(prices: number[], window: number): { index: number; price: number }[] {
  const localMinima: { index: number; price: number }[] = [];
  const n = prices.length;
  for (let i = window; i < n - window; i++) {
    let isMin = true;
    const currentPrice = prices[i];
    for (let w = i - window; w <= i + window; w++) {
      if (prices[w] < currentPrice) {
        isMin = false;
        break;
      }
    }
    if (isMin) {
      localMinima.push({ index: i, price: currentPrice });
    }
  }
  return localMinima;
}

export function detectHeadAndShoulders(
  series: { closes: number[]; dates: string[] },
  window = 20
): PatternResult | null {
  const prices = series.closes;
  const dates = series.dates;
  const n = prices.length;
  if (n < window * 5) return null;

  const localMaxima = findLocalMaxima(prices, window);
  if (localMaxima.length < 3) return null;

  const localMinima = findLocalMinima(prices, window);
  if (localMinima.length < 2) return null;

  const searchStart = Math.max(0, n - 120);
  let bestPattern: PatternResult | null = null;
  let bestConfidence = 0;

  const recentMaxima = localMaxima.filter((m) => m.index >= searchStart).slice(-15);
  const mLen = recentMaxima.length;

  for (let i = 0; i < mLen - 2; i++) {
    for (let j = i + 1; j < mLen - 1; j++) {
      for (let k = j + 1; k < mLen; k++) {
        const { index: leftIdx, price: leftPrice } = recentMaxima[i];
        const { index: headIdx, price: headPrice } = recentMaxima[j];
        const { index: rightIdx, price: rightPrice } = recentMaxima[k];

        // Head must be higher than both shoulders
        if (headPrice <= leftPrice || headPrice <= rightPrice) {
          continue;
        }

        // Shoulders should be roughly equal (within 15%)
        const maxShoulder = Math.max(leftPrice, rightPrice);
        if (maxShoulder <= 0) {
          continue;
        }
        const shoulderDiff = Math.abs(leftPrice - rightPrice) / maxShoulder;
        if (shoulderDiff > 0.15) {
          continue;
        }

        // Find intermediate troughs between shoulders and head
        const leftTroughCandidates = localMinima.filter(
          (m) => leftIdx < m.index && m.index < headIdx
        );
        const rightTroughCandidates = localMinima.filter(
          (m) => headIdx < m.index && m.index < rightIdx
        );

        if (leftTroughCandidates.length === 0 || rightTroughCandidates.length === 0) {
          continue;
        }

        let leftTrough = leftTroughCandidates[0];
        for (let idx = 1; idx < leftTroughCandidates.length; idx++) {
          if (leftTroughCandidates[idx].price < leftTrough.price) {
            leftTrough = leftTroughCandidates[idx];
          }
        }

        let rightTrough = rightTroughCandidates[0];
        for (let idx = 1; idx < rightTroughCandidates.length; idx++) {
          if (rightTroughCandidates[idx].price < rightTrough.price) {
            rightTrough = rightTroughCandidates[idx];
          }
        }

        const t1Idx = leftTrough.index;
        const t1Price = leftTrough.price;
        const t2Idx = rightTrough.index;
        const t2Price = rightTrough.price;

        // Calculate Slanted Diagonal Neckline: y = m*x + c
        const dx = t2Idx - t1Idx;
        if (dx === 0) {
          continue;
        }
        const necklineSlope = (t2Price - t1Price) / dx;
        const necklineIntercept = t1Price - necklineSlope * t1Idx;

        // Head height relative to the slanted neckline at head's index
        const necklineAtHead = necklineSlope * headIdx + necklineIntercept;
        if (necklineAtHead <= 0) {
          continue;
        }

        const headHeight = headPrice - necklineAtHead;
        const headHeightRatio = headHeight / necklineAtHead;

        // Head should be significantly higher than neckline (at least 5%)
        if (headHeightRatio < 0.05) {
          continue;
        }

        // Calculate pattern confidence score (0-100)
        const shoulderSymmetry = 1.0 - shoulderDiff;
        const heightScore = Math.min(headHeightRatio * 5.0, 1.0);
        const recency = n - searchStart > 0 ? (rightIdx - searchStart) / (n - searchStart) : 1.0;

        const confidence = Math.floor((shoulderSymmetry * 0.3 + heightScore * 0.4 + recency * 0.3) * 100);

        if (confidence > bestConfidence) {
          bestConfidence = confidence;

          // Project slanted neckline to present day (n-1) and target
          const necklineToday = necklineSlope * (n - 1) + necklineIntercept;
          const targetPrice = necklineToday - headHeight;

          const currentPrice = prices[n - 1];
          const priceVsNeckline = necklineToday > 0 ? (currentPrice - necklineToday) / necklineToday : 0.0;

          bestPattern = {
            detected: true,
            patternType: "head_shoulders",
            patternName: "Head & Shoulders",
            direction: "bearish",
            confidence,
            left_shoulder: {
              date: dates[leftIdx],
              price: Math.round(leftPrice * 100) / 100,
            },
            head: {
              date: dates[headIdx],
              price: Math.round(headPrice * 100) / 100,
            },
            right_shoulder: {
              date: dates[rightIdx],
              price: Math.round(rightPrice * 100) / 100,
            },
            neckline: Math.round(necklineToday * 100) / 100,
            target_price: Math.round(targetPrice * 100) / 100,
            current_price: Math.round(currentPrice * 100) / 100,
            price_vs_neckline_pct: Math.round(priceVsNeckline * 10000) / 100,
            patternHeightPct: Math.round(headHeightRatio * 10000) / 100,
            startDate: dates[leftIdx],
            endDate: dates[rightIdx],
          };
        }
      }
    }
  }

  return bestPattern;
}

export function detectInverseHeadAndShoulders(
  series: { closes: number[]; dates: string[] },
  window = 20
): PatternResult | null {
  const prices = series.closes;
  const dates = series.dates;
  const n = prices.length;
  if (n < window * 5) return null;

  const localMinima = findLocalMinima(prices, window);
  if (localMinima.length < 3) return null;

  const localMaxima = findLocalMaxima(prices, window);
  if (localMaxima.length < 2) return null;

  const searchStart = Math.max(0, n - 120);
  let bestPattern: PatternResult | null = null;
  let bestConfidence = 0;

  const recentMinima = localMinima.filter((m) => m.index >= searchStart).slice(-15);
  const mLen = recentMinima.length;

  for (let i = 0; i < mLen - 2; i++) {
    for (let j = i + 1; j < mLen - 1; j++) {
      for (let k = j + 1; k < mLen; k++) {
        const { index: leftIdx, price: leftPrice } = recentMinima[i];
        const { index: headIdx, price: headPrice } = recentMinima[j];
        const { index: rightIdx, price: rightPrice } = recentMinima[k];

        // Head must be lower than both shoulders
        if (headPrice >= leftPrice || headPrice >= rightPrice) {
          continue;
        }

        // Shoulders should be roughly equal (within 15%)
        const maxShoulder = Math.max(leftPrice, rightPrice);
        if (maxShoulder <= 0) {
          continue;
        }
        const shoulderDiff = Math.abs(leftPrice - rightPrice) / maxShoulder;
        if (shoulderDiff > 0.15) {
          continue;
        }

        // Find intermediate peaks between shoulders and head
        const leftPeakCandidates = localMaxima.filter(
          (m) => leftIdx < m.index && m.index < headIdx
        );
        const rightPeakCandidates = localMaxima.filter(
          (m) => headIdx < m.index && m.index < rightIdx
        );

        if (leftPeakCandidates.length === 0 || rightPeakCandidates.length === 0) {
          continue;
        }

        let leftPeak = leftPeakCandidates[0];
        for (let idx = 1; idx < leftPeakCandidates.length; idx++) {
          if (leftPeakCandidates[idx].price > leftPeak.price) {
            leftPeak = leftPeakCandidates[idx];
          }
        }

        let rightPeak = rightPeakCandidates[0];
        for (let idx = 1; idx < rightPeakCandidates.length; idx++) {
          if (rightPeakCandidates[idx].price > rightPeak.price) {
            rightPeak = rightPeakCandidates[idx];
          }
        }

        const t1Idx = leftPeak.index;
        const t1Price = leftPeak.price;
        const t2Idx = rightPeak.index;
        const t2Price = rightPeak.price;

        // Calculate Slanted Diagonal Neckline: y = m*x + c
        const dx = t2Idx - t1Idx;
        if (dx === 0) {
          continue;
        }
        const necklineSlope = (t2Price - t1Price) / dx;
        const necklineIntercept = t1Price - necklineSlope * t1Idx;

        // Head depth relative to the slanted neckline at head's index
        const necklineAtHead = necklineSlope * headIdx + necklineIntercept;
        if (necklineAtHead <= 0) {
          continue;
        }

        const headDepth = necklineAtHead - headPrice;
        const headDepthRatio = headDepth / necklineAtHead;

        // Head should be significantly lower than neckline (at least 5%)
        if (headDepthRatio < 0.05) {
          continue;
        }

        // Calculate pattern confidence score (0-100)
        const shoulderSymmetry = 1.0 - shoulderDiff;
        const depthScore = Math.min(headDepthRatio * 5.0, 1.0);
        const recency = n - searchStart > 0 ? (rightIdx - searchStart) / (n - searchStart) : 1.0;

        const confidence = Math.floor((shoulderSymmetry * 0.3 + depthScore * 0.4 + recency * 0.3) * 100);

        if (confidence > bestConfidence) {
          bestConfidence = confidence;

          // Project slanted neckline to present day (n-1) and target
          const necklineToday = necklineSlope * (n - 1) + necklineIntercept;
          const targetPrice = necklineToday + headDepth;

          const currentPrice = prices[n - 1];
          const priceVsNeckline = necklineToday > 0 ? (currentPrice - necklineToday) / necklineToday : 0.0;

          bestPattern = {
            detected: true,
            patternType: "inverse_head_shoulders",
            patternName: "Inverse Head & Shoulders",
            direction: "bullish",
            confidence,
            left_shoulder: {
              date: dates[leftIdx],
              price: Math.round(leftPrice * 100) / 100,
            },
            head: {
              date: dates[headIdx],
              price: Math.round(headPrice * 100) / 100,
            },
            right_shoulder: {
              date: dates[rightIdx],
              price: Math.round(rightPrice * 100) / 100,
            },
            neckline: Math.round(necklineToday * 100) / 100,
            target_price: Math.round(targetPrice * 100) / 100,
            current_price: Math.round(currentPrice * 100) / 100,
            price_vs_neckline_pct: Math.round(priceVsNeckline * 10000) / 100,
            patternHeightPct: Math.round(headDepthRatio * 10000) / 100,
            startDate: dates[leftIdx],
            endDate: dates[rightIdx],
          };
        }
      }
    }
  }

  return bestPattern;
}

export function detectDoubleTop(
  series: { closes: number[]; dates: string[] },
  window = 15
): PatternResult | null {
  const prices = series.closes;
  const dates = series.dates;
  const n = prices.length;
  if (n < window * 4) return null;

  const localMaxima = findLocalMaxima(prices, window);
  if (localMaxima.length < 2) return null;

  const localMinima = findLocalMinima(prices, window);

  const searchStart = Math.max(0, n - 100);
  let bestPattern: PatternResult | null = null;
  let bestConfidence = 0;

  const recentMaxima = localMaxima.filter((m) => m.index >= searchStart).slice(-15);
  const mLen = recentMaxima.length;

  for (let i = 0; i < mLen - 1; i++) {
    for (let j = i + 1; j < mLen; j++) {
      const { index: firstIdx, price: firstPrice } = recentMaxima[i];
      const { index: secondIdx, price: secondPrice } = recentMaxima[j];

      // Peaks should be roughly equal (within 3%)
      const peakDiff = Math.abs(firstPrice - secondPrice) / Math.max(firstPrice, secondPrice);
      if (peakDiff > 0.03) {
        continue;
      }

      // Need sufficient distance between peaks
      if (secondIdx - firstIdx < window * 2) {
        continue;
      }

      // Find trough between peaks
      const troughCandidates = localMinima.filter(
        (m) => firstIdx < m.index && m.index < secondIdx
      );
      if (troughCandidates.length === 0) {
        continue;
      }

      // Absolute minimum trough between the two peaks = the neckline.
      let trough = troughCandidates[0];
      for (let idx = 1; idx < troughCandidates.length; idx++) {
        if (troughCandidates[idx].price < trough.price) {
          trough = troughCandidates[idx];
        }
      }

      const neckline = trough.price;
      const patternHeight = (firstPrice - neckline) / neckline;
      if (patternHeight < 0.05) {
        continue;
      }

      const peakSymmetry = 1.0 - peakDiff;
      const heightScore = Math.min(patternHeight * 5.0, 1.0);
      const recency = n - searchStart > 0 ? (secondIdx - searchStart) / (n - searchStart) : 1.0;

      const confidence = Math.floor((peakSymmetry * 0.4 + heightScore * 0.3 + recency * 0.3) * 100);

      if (confidence > bestConfidence) {
        bestConfidence = confidence;

        const targetPrice = neckline - (firstPrice - neckline);
        const currentPrice = prices[n - 1];

        bestPattern = {
          detected: true,
          patternType: "double_top",
          patternName: "Double Top",
          direction: "bearish",
          confidence,
          first_peak: { date: dates[firstIdx], price: Math.round(firstPrice * 100) / 100 },
          second_peak: { date: dates[secondIdx], price: Math.round(secondPrice * 100) / 100 },
          trough: { date: dates[trough.index], price: Math.round(trough.price * 100) / 100 },
          neckline: Math.round(neckline * 100) / 100,
          target_price: Math.round(targetPrice * 100) / 100,
          current_price: Math.round(currentPrice * 100) / 100,
          patternHeightPct: Math.round(patternHeight * 10000) / 100,
          startDate: dates[firstIdx],
          endDate: dates[secondIdx],
        };
      }
    }
  }

  return bestPattern;
}

export function detectDoubleBottom(
  series: { closes: number[]; dates: string[] },
  window = 15
): PatternResult | null {
  const prices = series.closes;
  const dates = series.dates;
  const n = prices.length;
  if (n < window * 4) return null;

  const localMinima = findLocalMinima(prices, window);
  if (localMinima.length < 2) return null;

  const localMaxima = findLocalMaxima(prices, window);

  const searchStart = Math.max(0, n - 100);
  let bestPattern: PatternResult | null = null;
  let bestConfidence = 0;

  const recentMinima = localMinima.filter((m) => m.index >= searchStart).slice(-15);
  const mLen = recentMinima.length;

  for (let i = 0; i < mLen - 1; i++) {
    for (let j = i + 1; j < mLen; j++) {
      const { index: firstIdx, price: firstPrice } = recentMinima[i];
      const { index: secondIdx, price: secondPrice } = recentMinima[j];

      // Troughs should be roughly equal (within 3%)
      const troughDiff = Math.abs(firstPrice - secondPrice) / Math.max(firstPrice, secondPrice);
      if (troughDiff > 0.03) {
        continue;
      }

      if (secondIdx - firstIdx < window * 2) {
        continue;
      }

      // Find peak between troughs
      const peakCandidates = localMaxima.filter(
        (m) => firstIdx < m.index && m.index < secondIdx
      );
      if (peakCandidates.length === 0) {
        continue;
      }

      let peak = peakCandidates[0];
      for (let idx = 1; idx < peakCandidates.length; idx++) {
        if (peakCandidates[idx].price > peak.price) {
          peak = peakCandidates[idx];
        }
      }

      const neckline = peak.price;
      const patternHeight = (neckline - firstPrice) / firstPrice;
      if (patternHeight < 0.05) {
        continue;
      }

      const troughSymmetry = 1.0 - troughDiff;
      const heightScore = Math.min(patternHeight * 5.0, 1.0);
      const recency = n - searchStart > 0 ? (secondIdx - searchStart) / (n - searchStart) : 1.0;

      const confidence = Math.floor((troughSymmetry * 0.4 + heightScore * 0.3 + recency * 0.3) * 100);

      if (confidence > bestConfidence) {
        bestConfidence = confidence;

        const targetPrice = neckline + (neckline - firstPrice);
        const currentPrice = prices[n - 1];

        bestPattern = {
          detected: true,
          patternType: "double_bottom",
          patternName: "Double Bottom",
          direction: "bullish",
          confidence,
          first_trough: { date: dates[firstIdx], price: Math.round(firstPrice * 100) / 100 },
          second_trough: { date: dates[secondIdx], price: Math.round(secondPrice * 100) / 100 },
          peak: { date: dates[peak.index], price: Math.round(peak.price * 100) / 100 },
          neckline: Math.round(neckline * 100) / 100,
          target_price: Math.round(targetPrice * 100) / 100,
          current_price: Math.round(currentPrice * 100) / 100,
          patternHeightPct: Math.round(patternHeight * 10000) / 100,
          startDate: dates[firstIdx],
          endDate: dates[secondIdx],
        };
      }
    }
  }

  return bestPattern;
}

export function detectTripleTop(
  series: { closes: number[]; dates: string[] },
  window = 12
): PatternResult | null {
  const prices = series.closes;
  const dates = series.dates;
  const n = prices.length;
  if (n < window * 6) return null;

  const localMaxima = findLocalMaxima(prices, window);
  if (localMaxima.length < 3) return null;

  const localMinima = findLocalMinima(prices, window);

  const searchStart = Math.max(0, n - 150);
  let bestPattern: PatternResult | null = null;
  let bestConfidence = 0;

  const recentMaxima = localMaxima.filter((m) => m.index >= searchStart).slice(-15);
  const mLen = recentMaxima.length;

  for (let i = 0; i < mLen - 2; i++) {
    for (let j = i + 1; j < mLen - 1; j++) {
      for (let k = j + 1; k < mLen; k++) {
        const { index: firstIdx, price: firstPrice } = recentMaxima[i];
        const { index: secondIdx, price: secondPrice } = recentMaxima[j];
        const { index: thirdIdx, price: thirdPrice } = recentMaxima[k];

        const avgPeak = (firstPrice + secondPrice + thirdPrice) / 3.0;
        const maxDiff =
          Math.max(
            Math.abs(firstPrice - avgPeak),
            Math.abs(secondPrice - avgPeak),
            Math.abs(thirdPrice - avgPeak)
          ) / avgPeak;

        if (maxDiff > 0.05) {
          continue;
        }

        // Find intermediate troughs between peaks
        const trough1Candidates = localMinima.filter(
          (m) => firstIdx < m.index && m.index < secondIdx
        );
        const trough2Candidates = localMinima.filter(
          (m) => secondIdx < m.index && m.index < thirdIdx
        );

        if (trough1Candidates.length === 0 || trough2Candidates.length === 0) {
          continue;
        }

        let trough1 = trough1Candidates[0];
        for (let idx = 1; idx < trough1Candidates.length; idx++) {
          if (trough1Candidates[idx].price < trough1.price) {
            trough1 = trough1Candidates[idx];
          }
        }

        let trough2 = trough2Candidates[0];
        for (let idx = 1; idx < trough2Candidates.length; idx++) {
          if (trough2Candidates[idx].price < trough2.price) {
            trough2 = trough2Candidates[idx];
          }
        }

        const neckline = Math.min(trough1.price, trough2.price);
        const patternHeight = (avgPeak - neckline) / neckline;
        if (patternHeight < 0.05) {
          continue;
        }

        const symmetry = 1.0 - maxDiff;
        const heightScore = Math.min(patternHeight * 5, 1.0);
        const recency = n - searchStart > 0 ? (thirdIdx - searchStart) / (n - searchStart) : 1.0;

        const confidence = Math.floor((symmetry * 0.4 + heightScore * 0.3 + recency * 0.3) * 100);

        if (confidence > bestConfidence) {
          bestConfidence = confidence;

          const targetPrice = neckline - (avgPeak - neckline);
          const currentPrice = prices[n - 1];

          bestPattern = {
            detected: true,
            patternType: "triple_top",
            patternName: "Triple Top",
            direction: "bearish",
            confidence,
            first_peak: { date: dates[firstIdx], price: Math.round(firstPrice * 100) / 100 },
            second_peak: { date: dates[secondIdx], price: Math.round(secondPrice * 100) / 100 },
            third_peak: { date: dates[thirdIdx], price: Math.round(thirdPrice * 100) / 100 },
            neckline: Math.round(neckline * 100) / 100,
            target_price: Math.round(targetPrice * 100) / 100,
            current_price: Math.round(currentPrice * 100) / 100,
            patternHeightPct: Math.round(patternHeight * 10000) / 100,
            startDate: dates[firstIdx],
            endDate: dates[thirdIdx],
          };
        }
      }
    }
  }

  return bestPattern;
}

export function detectTripleBottom(
  series: { closes: number[]; dates: string[] },
  window = 12
): PatternResult | null {
  const prices = series.closes;
  const dates = series.dates;
  const n = prices.length;
  if (n < window * 6) return null;

  const localMinima = findLocalMinima(prices, window);
  if (localMinima.length < 3) return null;

  const localMaxima = findLocalMaxima(prices, window);

  const searchStart = Math.max(0, n - 150);
  let bestPattern: PatternResult | null = null;
  let bestConfidence = 0;

  const recentMinima = localMinima.filter((m) => m.index >= searchStart).slice(-15);
  const mLen = recentMinima.length;

  for (let i = 0; i < mLen - 2; i++) {
    for (let j = i + 1; j < mLen - 1; j++) {
      for (let k = j + 1; k < mLen; k++) {
        const { index: firstIdx, price: firstPrice } = recentMinima[i];
        const { index: secondIdx, price: secondPrice } = recentMinima[j];
        const { index: thirdIdx, price: thirdPrice } = recentMinima[k];

        const avgTrough = (firstPrice + secondPrice + thirdPrice) / 3.0;
        const maxDiff =
          Math.max(
            Math.abs(firstPrice - avgTrough),
            Math.abs(secondPrice - avgTrough),
            Math.abs(thirdPrice - avgTrough)
          ) / avgTrough;

        if (maxDiff > 0.05) {
          continue;
        }

        // Find intermediate peaks between troughs
        const peak1Candidates = localMaxima.filter(
          (m) => firstIdx < m.index && m.index < secondIdx
        );
        const peak2Candidates = localMaxima.filter(
          (m) => secondIdx < m.index && m.index < thirdIdx
        );

        if (peak1Candidates.length === 0 || peak2Candidates.length === 0) {
          continue;
        }

        let peak1 = peak1Candidates[0];
        for (let idx = 1; idx < peak1Candidates.length; idx++) {
          if (peak1Candidates[idx].price > peak1.price) {
            peak1 = peak1Candidates[idx];
          }
        }

        let peak2 = peak2Candidates[0];
        for (let idx = 1; idx < peak2Candidates.length; idx++) {
          if (peak2Candidates[idx].price > peak2.price) {
            peak2 = peak2Candidates[idx];
          }
        }

        const neckline = Math.max(peak1.price, peak2.price);
        const patternHeight = (neckline - avgTrough) / avgTrough;
        if (patternHeight < 0.05) {
          continue;
        }

        const symmetry = 1.0 - maxDiff;
        const heightScore = Math.min(patternHeight * 5, 1.0);
        const recency = n - searchStart > 0 ? (thirdIdx - searchStart) / (n - searchStart) : 1.0;

        const confidence = Math.floor((symmetry * 0.4 + heightScore * 0.3 + recency * 0.3) * 100);

        if (confidence > bestConfidence) {
          bestConfidence = confidence;

          const targetPrice = neckline + (neckline - avgTrough);
          const currentPrice = prices[n - 1];

          bestPattern = {
            detected: true,
            patternType: "triple_bottom",
            patternName: "Triple Bottom",
            direction: "bullish",
            confidence,
            first_trough: { date: dates[firstIdx], price: Math.round(firstPrice * 100) / 100 },
            second_trough: { date: dates[secondIdx], price: Math.round(secondPrice * 100) / 100 },
            third_trough: { date: dates[thirdIdx], price: Math.round(thirdPrice * 100) / 100 },
            neckline: Math.round(neckline * 100) / 100,
            target_price: Math.round(targetPrice * 100) / 100,
            current_price: Math.round(currentPrice * 100) / 100,
            patternHeightPct: Math.round(patternHeight * 10000) / 100,
            startDate: dates[firstIdx],
            endDate: dates[thirdIdx],
          };
        }
      }
    }
  }

  return bestPattern;
}

export function detectAscendingTriangle(
  series: { closes: number[]; dates: string[] },
  window = 10
): PatternResult | null {
  const prices = series.closes;
  const dates = series.dates;
  const n = prices.length;
  if (n < 60) return null;

  const localMaxima = findLocalMaxima(prices, window);
  const localMinima = findLocalMinima(prices, window);

  if (localMaxima.length < 2 || localMinima.length < 2) return null;

  const searchStart = Math.max(0, n - 80);
  const recentMaxima = localMaxima.filter((m) => m.index >= searchStart);
  const recentMinima = localMinima.filter((m) => m.index >= searchStart);

  if (recentMaxima.length < 2 || recentMinima.length < 2) return null;

  const peakPrices = recentMaxima.map((m) => m.price);
  const sumPeaks = peakPrices.reduce((a, b) => a + b, 0);
  const resistance = sumPeaks / peakPrices.length;

  let maxResistanceFlatness = 0;
  for (const p of peakPrices) {
    const f = Math.abs(p - resistance) / resistance;
    if (f > maxResistanceFlatness) {
      maxResistanceFlatness = f;
    }
  }

  if (maxResistanceFlatness > 0.02) {
    return null;
  }

  const troughIndices = recentMinima.map((m) => m.index);
  const troughPrices = recentMinima.map((m) => m.price);

  const [slope, intercept, rSquared] = _fit_ols_line(troughIndices, troughPrices);
  if (slope <= 0 || rSquared < 0.70) {
    return null;
  }

  const currentSupport = slope * (n - 1) + intercept;
  const patternHeight = (resistance - currentSupport) / currentSupport;
  if (patternHeight < 0.03) {
    return null;
  }

  const flatnessScore = 1.0 - maxResistanceFlatness * 20;
  const heightScore = Math.min(patternHeight * 10, 1.0);
  const convergence = Math.min(slope * 1000, 1.0);

  let confidence = Math.floor((flatnessScore * 0.4 + heightScore * 0.3 + convergence * 0.3) * 100);
  confidence = Math.max(0, Math.min(100, confidence));

  if (confidence < 30) {
    return null;
  }

  const targetPrice = resistance + (resistance - currentSupport);
  const currentPrice = prices[n - 1];

  const startIdx = Math.min(recentMaxima[0].index, recentMinima[0].index);

  return {
    detected: true,
    patternType: "ascending_triangle",
    patternName: "Ascending Triangle",
    direction: "bullish",
    confidence,
    resistance: Math.round(resistance * 100) / 100,
    support_start: Math.round((slope * troughIndices[0] + intercept) * 100) / 100,
    support_current: Math.round(currentSupport * 100) / 100,
    target_price: Math.round(targetPrice * 100) / 100,
    current_price: Math.round(currentPrice * 100) / 100,
    patternHeightPct: Math.round(patternHeight * 10000) / 100,
    startDate: dates[startIdx],
    endDate: dates[n - 1],
  };
}

export function detectDescendingTriangle(
  series: { closes: number[]; dates: string[] },
  window = 10
): PatternResult | null {
  const prices = series.closes;
  const dates = series.dates;
  const n = prices.length;
  if (n < 60) return null;

  const localMaxima = findLocalMaxima(prices, window);
  const localMinima = findLocalMinima(prices, window);

  if (localMaxima.length < 2 || localMinima.length < 2) return null;

  const searchStart = Math.max(0, n - 80);
  const recentMaxima = localMaxima.filter((m) => m.index >= searchStart);
  const recentMinima = localMinima.filter((m) => m.index >= searchStart);

  if (recentMaxima.length < 2 || recentMinima.length < 2) return null;

  const troughPrices = recentMinima.map((m) => m.price);
  const sumTroughs = troughPrices.reduce((a, b) => a + b, 0);
  const support = sumTroughs / troughPrices.length;

  let maxSupportFlatness = 0;
  for (const p of troughPrices) {
    const f = Math.abs(p - support) / support;
    if (f > maxSupportFlatness) {
      maxSupportFlatness = f;
    }
  }

  if (maxSupportFlatness > 0.02) {
    return null;
  }

  const peakIndices = recentMaxima.map((m) => m.index);
  const peakPrices = recentMaxima.map((m) => m.price);

  const [slope, intercept, rSquared] = _fit_ols_line(peakIndices, peakPrices);
  if (slope >= 0 || rSquared < 0.70) {
    return null;
  }

  const currentResistance = slope * (n - 1) + intercept;
  const patternHeight = (currentResistance - support) / support;
  if (patternHeight < 0.03) {
    return null;
  }

  const flatnessScore = 1.0 - maxSupportFlatness * 20;
  const heightScore = Math.min(patternHeight * 10, 1.0);
  const convergence = Math.min(Math.abs(slope) * 1000, 1.0);

  let confidence = Math.floor((flatnessScore * 0.4 + heightScore * 0.3 + convergence * 0.3) * 100);
  confidence = Math.max(0, Math.min(100, confidence));

  if (confidence < 30) {
    return null;
  }

  const targetPrice = support - (currentResistance - support);
  const currentPrice = prices[n - 1];

  const startIdx = Math.min(recentMaxima[0].index, recentMinima[0].index);

  return {
    detected: true,
    patternType: "descending_triangle",
    patternName: "Descending Triangle",
    direction: "bearish",
    confidence,
    support: Math.round(support * 100) / 100,
    resistance_start: Math.round((slope * peakIndices[0] + intercept) * 100) / 100,
    resistance_current: Math.round(currentResistance * 100) / 100,
    target_price: Math.round(targetPrice * 100) / 100,
    current_price: Math.round(currentPrice * 100) / 100,
    patternHeightPct: Math.round(patternHeight * 10000) / 100,
    startDate: dates[startIdx],
    endDate: dates[n - 1],
  };
}

export function detectCupAndHandle(
  series: { closes: number[]; dates: string[] },
  window = 10
): PatternResult | null {
  const prices = series.closes;
  const dates = series.dates;
  const n = prices.length;
  if (n < 80) return null;

  const cupStart = Math.max(0, n - 100);
  const cupData = prices.slice(cupStart);
  const cupN = cupData.length;

  if (cupN < 40) return null;

  let cupBottomIdx = 0;
  let minPrice = cupData[0];
  for (let i = 1; i < cupN; i++) {
    if (cupData[i] < minPrice) {
      minPrice = cupData[i];
      cupBottomIdx = i;
    }
  }

  if (cupBottomIdx < 10 || cupBottomIdx > cupN - 15) {
    return null;
  }

  const leftHalf = cupData.slice(0, cupBottomIdx);
  const rightHalf = cupData.slice(cupBottomIdx);

  if (leftHalf.length < 5 || rightHalf.length < 10) {
    return null;
  }

  const leftLip = leftHalf.length >= 10
    ? Math.max(...leftHalf.slice(0, 10))
    : Math.max(...leftHalf);

  const rightLip = rightHalf.length >= 15
    ? Math.max(...rightHalf.slice(rightHalf.length - 15, rightHalf.length - 5))
    : Math.max(...rightHalf.slice(rightHalf.length - 5));

  const maxLip = Math.max(leftLip, rightLip);
  if (maxLip <= 0) return null;
  const lipDiff = Math.abs(leftLip - rightLip) / maxLip;
  if (lipDiff > 0.10) {
    return null;
  }

  const cupBottom = cupData[cupBottomIdx];
  if (leftLip <= 0) return null;
  const cupDepth = (leftLip - cupBottom) / leftLip;
  if (cupDepth < 0.10 || cupDepth > 0.50) {
    return null;
  }

  const handleData = cupData.slice(-15);
  const handleLow = Math.min(...handleData);

  if (rightLip <= 0) return null;
  const handleDepth = (rightLip - handleLow) / rightLip;
  if (handleDepth > cupDepth * 0.5 || handleDepth <= 0) {
    return null;
  }

  const lipUniformity = 1.0 - lipDiff;
  const depthScore = Math.min(cupDepth * 3, 1.0);
  const shapeScore = handleDepth < cupDepth * 0.3 ? 0.7 : 0.4;

  const confidence = Math.floor((lipUniformity * 0.3 + depthScore * 0.4 + shapeScore * 0.3) * 100);

  if (confidence < 35) {
    return null;
  }

  const resistance = Math.max(leftLip, rightLip);
  const targetPrice = resistance + (resistance - cupBottom);
  const currentPrice = prices[n - 1];

  return {
    detected: true,
    patternType: "cup_and_handle",
    patternName: "Cup and Handle",
    direction: "bullish",
    confidence,
    cup_bottom: Math.round(cupBottom * 100) / 100,
    cup_bottom_date: dates[cupStart + cupBottomIdx],
    left_lip: Math.round(leftLip * 100) / 100,
    right_lip: Math.round(rightLip * 100) / 100,
    resistance: Math.round(resistance * 100) / 100,
    target_price: Math.round(targetPrice * 100) / 100,
    current_price: Math.round(currentPrice * 100) / 100,
    cup_depth_pct: Math.round(cupDepth * 10000) / 100,
    patternHeightPct: Math.round(cupDepth * 10000) / 100,
    startDate: dates[cupStart],
    endDate: dates[n - 1],
  };
}

export function detectBullishFlag(
  series: { closes: number[]; dates: string[] },
  window = 5
): PatternResult | null {
  const prices = series.closes;
  const dates = series.dates;
  const n = prices.length;
  if (n < 40) return null;

  const poleEnd = n - 15;
  const poleStart = Math.max(0, poleEnd - 30);
  const poleData = prices.slice(poleStart, poleEnd);

  if (poleData.length < 15) return null;

  let poleLowIdx = 0;
  let minPoleVal = poleData[0];
  for (let i = 1; i < 10 && i < poleData.length; i++) {
    if (poleData[i] < minPoleVal) {
      minPoleVal = poleData[i];
      poleLowIdx = i;
    }
  }

  const last10Start = Math.max(0, poleData.length - 10);
  let poleHighIdx = last10Start;
  let maxPoleVal = poleData[last10Start];
  for (let i = last10Start + 1; i < poleData.length; i++) {
    if (poleData[i] > maxPoleVal) {
      maxPoleVal = poleData[i];
      poleHighIdx = i;
    }
  }

  const poleLow = poleData[poleLowIdx];
  const poleHigh = poleData[poleHighIdx];

  if (poleLow <= 0) return null;
  const poleGain = (poleHigh - poleLow) / poleLow;
  if (poleGain < 0.10) return null;

  const flagPrices = prices.slice(poleEnd);
  if (flagPrices.length < 8) return null;

  const flagIndices: number[] = [];
  for (let i = poleEnd; i < n; i++) {
    flagIndices.push(i);
  }

  const [slope, intercept, rSquared] = _fit_ols_line(flagIndices, flagPrices);

  const maxAllowableSlope = 0.01 * (poleHigh / flagPrices.length);
  if (slope > maxAllowableSlope) {
    return null;
  }

  const flagHigh = Math.max(...flagPrices);
  const flagLow = Math.min(...flagPrices);

  if (flagHigh <= 0) return null;
  const flagRange = (flagHigh - flagLow) / flagHigh;
  if (flagRange > 0.08) {
    return null;
  }

  if (poleHigh <= 0) return null;
  const flagPullback = (poleHigh - flagLow) / poleHigh;
  if (flagPullback > 0.10) {
    return null;
  }

  const poleStrength = Math.min(poleGain * 5, 1.0);
  const consolidation = 1.0 - flagRange * 10;
  const positionScore = 1.0 - flagPullback * 10;

  let confidence = Math.floor((poleStrength * 0.4 + consolidation * 0.3 + positionScore * 0.3) * 100);
  confidence = Math.max(0, Math.min(100, confidence));

  if (confidence < 35) {
    return null;
  }

  const targetPrice = poleHigh + (poleHigh - poleLow);
  const currentPrice = prices[n - 1];

  return {
    detected: true,
    patternType: "bullish_flag",
    patternName: "Bullish Flag",
    direction: "bullish",
    confidence,
    pole_low: Math.round(poleLow * 100) / 100,
    pole_high: Math.round(poleHigh * 100) / 100,
    flag_high: Math.round(flagHigh * 100) / 100,
    flag_low: Math.round(flagLow * 100) / 100,
    target_price: Math.round(targetPrice * 100) / 100,
    current_price: Math.round(currentPrice * 100) / 100,
    pole_gain_pct: Math.round(poleGain * 10000) / 100,
    patternHeightPct: Math.round(poleGain * 10000) / 100,
    startDate: dates[poleStart + poleLowIdx],
    endDate: dates[n - 1],
  };
}

export function detectFallingWedge(
  series: { closes: number[]; dates: string[] },
  window = 8
): PatternResult | null {
  const prices = series.closes;
  const dates = series.dates;
  const n = prices.length;
  if (n < 50) return null;

  const localMaxima = findLocalMaxima(prices, window);
  const localMinima = findLocalMinima(prices, window);

  if (localMaxima.length < 2 || localMinima.length < 2) return null;

  const searchStart = Math.max(0, n - 70);
  const recentMaxima = localMaxima.filter((m) => m.index >= searchStart);
  const recentMinima = localMinima.filter((m) => m.index >= searchStart);

  if (recentMaxima.length < 2 || recentMinima.length < 2) return null;

  const peakIndices = recentMaxima.map((m) => m.index);
  const peakPrices = recentMaxima.map((m) => m.price);
  const troughIndices = recentMinima.map((m) => m.index);
  const troughPrices = recentMinima.map((m) => m.price);

  const [resSlope, resIntercept, resR2] = _fit_ols_line(peakIndices, peakPrices);
  const [supSlope, supIntercept, supR2] = _fit_ols_line(troughIndices, troughPrices);

  if (resSlope >= 0 || supSlope >= 0) {
    return null;
  }

  if (resR2 < 0.70 || supR2 < 0.70) {
    return null;
  }

  if (Math.abs(supSlope) >= Math.abs(resSlope)) {
    return null;
  }

  const initialRes = resSlope * peakIndices[0] + resIntercept;
  const initialSup = supSlope * troughIndices[0] + supIntercept;
  const initialSpread = initialRes - initialSup;

  const currentRes = resSlope * (n - 1) + resIntercept;
  const currentSup = supSlope * (n - 1) + supIntercept;
  const currentSpread = currentRes - currentSup;

  if (currentSpread <= 0 || currentSpread >= initialSpread || initialSpread <= 0) {
    return null;
  }

  const convergence = (initialSpread - currentSpread) / initialSpread;
  if (convergence < 0.20) {
    return null;
  }

  const convergenceScore = Math.min(convergence * 2, 1.0);
  const slopeScore = Math.min(Math.abs(resSlope) * 100, 1.0);

  let confidence = Math.floor((convergenceScore * 0.5 + slopeScore * 0.5) * 100);
  confidence = Math.max(0, Math.min(100, confidence));

  if (confidence < 30) {
    return null;
  }

  const breakoutLevel = currentRes;
  const targetPrice = breakoutLevel + initialSpread;
  const currentPrice = prices[n - 1];

  const startIdx = Math.min(peakIndices[0], troughIndices[0]);

  return {
    detected: true,
    patternType: "falling_wedge",
    patternName: "Falling Wedge",
    direction: "bullish",
    confidence,
    resistance_start: Math.round(initialRes * 100) / 100,
    resistance_current: Math.round(currentRes * 100) / 100,
    support_start: Math.round(initialSup * 100) / 100,
    support_current: Math.round(currentSup * 100) / 100,
    breakout_level: Math.round(breakoutLevel * 100) / 100,
    target_price: Math.round(targetPrice * 100) / 100,
    current_price: Math.round(currentPrice * 100) / 100,
    convergence_pct: Math.round(convergence * 10000) / 100,
    patternHeightPct: Math.round((initialSpread / initialSup) * 10000) / 100,
    startDate: dates[startIdx],
    endDate: dates[n - 1],
  };
}

export function detectAllPatterns(series: { closes: number[]; dates: string[] }): PatternResult[] {
  if (!series || !series.closes || !series.dates || series.closes.length < 5 || series.dates.length < 5) {
    return [];
  }

  const detectors = [
    detectHeadAndShoulders,
    detectInverseHeadAndShoulders,
    detectDoubleTop,
    detectDoubleBottom,
    detectTripleTop,
    detectTripleBottom,
    detectAscendingTriangle,
    detectDescendingTriangle,
    detectCupAndHandle,
    detectBullishFlag,
    detectFallingWedge,
  ];

  const results: PatternResult[] = [];
  for (const detect of detectors) {
    try {
      const res = detect(series);
      if (res && res.detected) {
        results.push(res);
      }
    } catch (e) {
      // Guard: never throw
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}
