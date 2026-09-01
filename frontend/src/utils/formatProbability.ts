/**
 * The bundled ECGNet checkpoint is undertrained (see raspberry-pi-ecg/data/README.md):
 * its raw sigmoid outputs top out around 1e-4 and are typically 1e-6 to 1e-19,
 * nowhere near the 0-1 range a "probability" naively suggests. Formatting that
 * as a percentage with a couple of decimal places (`(p * 100).toFixed(1) + '%'`)
 * rounds every real value down to a static, identical-looking "0.0%" -- not a
 * bug in the number itself, just a display bug that made real, varying model
 * output look frozen and broken. This shows the real value instead.
 */
export function formatProbability(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value < 0.001) return value.toExponential(2);
  return `${(value * 100).toFixed(2)}%`;
}
