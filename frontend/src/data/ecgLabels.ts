// Mirrors CLASS_LABELS in raspberry-pi-ecg/ecg_pipeline.py -- kept here so the
// frontend can show human-readable labels without an extra round-trip. The
// backend response's `predictions` keys are always these same class names.
export const CLASS_LABELS: Record<string, string> = {
  is_sinus_rhythm: 'Sinus rhythm',
  is_afib: 'Atrial fibrillation',
  is_aflt: 'Atrial flutter',
  is_pac: 'Premature atrial contraction',
  is_pvc: 'Premature ventricular contraction',
  is_svt: 'Supraventricular tachycardia',
  is_sinus_arrhythmia: 'Sinus arrhythmia',
  has_1avb: '1st degree AV block',
  has_2avb: '2nd degree AV block',
  has_3avb: '3rd degree AV block',
  has_rbbb: 'Right bundle branch block (complete)',
  has_lbbb: 'Left bundle branch block (complete)',
  has_irbbb: 'Right bundle branch block (incomplete)',
  has_ilbbb: 'Left bundle branch block (incomplete)',
  has_lafb: 'Left anterior fascicular block',
  has_lpfb: 'Left posterior fascicular block',
  has_wpw: 'Wolff-Parkinson-White pattern',
  has_bigeminy: 'Bigeminy',
  has_trigeminy: 'Trigeminy',
};
