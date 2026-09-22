export type ProbabilityMap = Record<string, number>;

export function temperatureScale(probabilities: ProbabilityMap, temperature: number): ProbabilityMap {
  if (!Number.isFinite(temperature) || temperature <= 0) throw new Error("temperature must be positive");
  const entries = Object.entries(probabilities).filter(([, value]) => Number.isFinite(value) && value >= 0);
  if (!entries.length) return {};
  const scaled = entries.map(([key, value]) => [key, Math.pow(Math.max(value, 1e-8), 1 / temperature)] as const);
  const total = scaled.reduce((sum, [, value]) => sum + value, 0);
  return Object.fromEntries(scaled.map(([key, value]) => [key, value / total]));
}

export function argmax(probabilities: ProbabilityMap): string | null {
  const entries = Object.entries(probabilities);
  if (!entries.length) return null;
  return entries.reduce((best, current) => current[1] > best[1] ? current : best)[0];
}

export function negativeLogLikelihood(rows: Array<{ gold: string; probabilities: ProbabilityMap }>): number {
  if (!rows.length) return Number.POSITIVE_INFINITY;
  return -rows.reduce((sum, row) => sum + Math.log(Math.max(row.probabilities[row.gold] ?? 0, 1e-8)), 0) / rows.length;
}

export function fitTemperature(rows: Array<{ gold: string; probabilities: ProbabilityMap }>, candidates = Array.from({ length: 91 }, (_, index) => 0.5 + index * 0.05)): number {
  if (!rows.length) throw new Error("cannot fit temperature without rows");
  return candidates.reduce((best, candidate) => negativeLogLikelihood(rows.map((row) => ({ ...row, probabilities: temperatureScale(row.probabilities, candidate) }))) < negativeLogLikelihood(rows.map((row) => ({ ...row, probabilities: temperatureScale(row.probabilities, best) }))) ? candidate : best, 1);
}

export function brierScore(rows: Array<{ gold: string; probabilities: ProbabilityMap }>, classes: string[]): number {
  if (!rows.length) return 0;
  return rows.reduce((sum, row) => sum + classes.reduce((part, value) => part + ((row.probabilities[value] ?? 0) - Number(value === row.gold)) ** 2, 0), 0) / rows.length;
}

export function ece(rows: Array<{ gold: string; probabilities: ProbabilityMap }>, bins = 10): number {
  if (!rows.length) return 0;
  let error = 0;
  for (let index = 0; index < bins; index += 1) {
    const group = rows.filter((row) => {
      const prediction = argmax(row.probabilities);
      const probability = prediction ? row.probabilities[prediction] ?? 0 : 0;
      return probability >= index / bins && (index === bins - 1 ? probability <= 1 : probability < (index + 1) / bins);
    });
    if (!group.length) continue;
    const accuracy = group.filter((row) => argmax(row.probabilities) === row.gold).length / group.length;
    const confidence = group.reduce((sum, row) => { const prediction = argmax(row.probabilities); return sum + (prediction ? row.probabilities[prediction] ?? 0 : 0); }, 0) / group.length;
    error += group.length / rows.length * Math.abs(accuracy - confidence);
  }
  return error;
}

export function riskCoverage(rows: Array<{ gold: string; probabilities: ProbabilityMap }>, thresholds = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]): Array<Record<string, number | null>> {
  return thresholds.map((threshold) => {
    const accepted = rows.filter((row) => { const prediction = argmax(row.probabilities); return prediction !== null && (row.probabilities[prediction] ?? 0) >= threshold; });
    const correct = accepted.filter((row) => argmax(row.probabilities) === row.gold).length;
    return { threshold, accepted: accepted.length, coverage: rows.length ? accepted.length / rows.length : 0, errorRate: accepted.length ? 1 - correct / accepted.length : null };
  });
}
