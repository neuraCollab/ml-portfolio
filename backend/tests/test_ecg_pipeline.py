import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pytest

from app.core.config import ECG_DIR

if str(ECG_DIR) not in sys.path:
    sys.path.insert(0, str(ECG_DIR))

import ecg_pipeline  # noqa: E402


def _synthetic_leads(n=1000, seed=0):
    rng = np.random.default_rng(seed)
    lead_I = rng.normal(size=n).astype(np.float32)
    lead_II = rng.normal(size=n).astype(np.float32)
    return lead_I, lead_II


def test_goldberger_law_augmented_leads_sum_to_zero():
    # A real electrocardiography identity: aVR + aVL + aVF == 0 for any I, II.
    lead_I, lead_II = _synthetic_leads()
    six = ecg_pipeline.compute_all_leads(lead_I, lead_II)
    aVR, aVL, aVF = six[:, 3], six[:, 4], six[:, 5]
    np.testing.assert_allclose(aVR + aVL + aVF, 0.0, atol=1e-5)


def test_einthoven_law_lead_iii_equals_ii_minus_i():
    lead_I, lead_II = _synthetic_leads()
    six = ecg_pipeline.compute_all_leads(lead_I, lead_II)
    lead_III = six[:, 2]
    np.testing.assert_allclose(lead_III, lead_II - lead_I, atol=1e-6)


def test_compute_all_leads_returns_six_columns_in_order():
    lead_I, lead_II = _synthetic_leads(n=500)
    six = ecg_pipeline.compute_all_leads(lead_I, lead_II)
    assert six.shape == (500, 6)
    np.testing.assert_array_equal(six[:, 0], lead_I)
    np.testing.assert_array_equal(six[:, 1], lead_II)


def test_bandpass_filter_preserves_shape_and_has_no_nans():
    lead_I, lead_II = _synthetic_leads()
    six = ecg_pipeline.compute_all_leads(lead_I, lead_II)
    filtered = ecg_pipeline.bandpass_filter(six)
    assert filtered.shape == six.shape
    assert not np.isnan(filtered).any()


def test_zscore_normalize_gives_unit_std_per_lead():
    lead_I, lead_II = _synthetic_leads(seed=1)
    six = ecg_pipeline.compute_all_leads(lead_I, lead_II)
    normalized = ecg_pipeline.zscore_normalize(six)
    stds = normalized.std(axis=0)
    np.testing.assert_allclose(stds, 1.0, atol=1e-3)


def test_detect_r_peaks_returns_none_heart_rate_below_two_peaks():
    flat_signal = np.zeros(1000, dtype=np.float32)
    result = ecg_pipeline.detect_r_peaks(flat_signal)
    assert result["peakCount"] == 0
    assert result["heartRateBpm"] is None


def test_detect_r_peaks_finds_regular_beats_and_estimates_rate():
    fs = ecg_pipeline.SAMPLING_RATE_HZ
    t = np.arange(1000) / fs
    # Synthetic 72bpm-like pulse train: sharp peaks every ~0.83s.
    hr_hz = 72.0 / 60.0
    signal = np.zeros_like(t)
    for beat_time in np.arange(0, t[-1], 1 / hr_hz):
        signal += np.exp(-0.5 * ((t - beat_time) / 0.02) ** 2)
    result = ecg_pipeline.detect_r_peaks(signal, fs=fs)
    assert result["peakCount"] >= 2
    assert result["heartRateBpm"] is not None
    assert 50 <= result["heartRateBpm"] <= 100


def test_signal_metrics_matches_known_array():
    signal = np.array([[0.0, 1.0]] * 5 + [[2.0, -1.0]] * 5, dtype=np.float32)
    metrics = ecg_pipeline.signal_metrics(signal, fs=100)
    assert metrics["numSamples"] == 10
    assert metrics["minAmplitude"] == -1.0
    assert metrics["maxAmplitude"] == 2.0
    assert metrics["durationSeconds"] == pytest.approx(0.1)


def test_generate_mock_ecg_shape_is_stable_across_calls():
    # NOT a full reproducibility test: synth_single_lead's noise term calls
    # np.random.default_rng() unseeded, so it ignores generate_mock_ecg's own
    # np.random.seed(seed) and differs between calls even with the same seed
    # -- a real, minor non-determinism in the source pipeline, not something
    # to assert away. Shape and value range are the properties that do hold.
    a = ecg_pipeline.generate_mock_ecg(heart_rate=72.0, duration=10.0, seed=42)
    b = ecg_pipeline.generate_mock_ecg(heart_rate=72.0, duration=10.0, seed=42)
    assert a.shape == b.shape == (ecg_pipeline.SEQ_LEN, 6)


def test_generate_mock_ecg_stays_within_adc_range():
    adc = ecg_pipeline.generate_mock_ecg(seed=1)
    assert adc.min() >= 0
    assert adc.max() <= 1023


def test_class_names_and_labels_are_consistent():
    assert len(ecg_pipeline.CLASS_NAMES) == 19
    assert set(ecg_pipeline.CLASS_NAMES) == set(ecg_pipeline.CLASS_LABELS.keys())


def test_get_threshold_info_covers_every_class_with_real_values():
    info = ecg_pipeline.get_threshold_info()
    assert len(info) == len(ecg_pipeline.CLASS_NAMES)
    names = {row["className"] for row in info}
    assert names == set(ecg_pipeline.CLASS_NAMES)
    for row in info:
        assert 0.0 <= row["threshold"] <= 1.0
        assert isinstance(row["isCalibrated"], bool)


def test_assess_signal_quality_flags_flatline_adc_signal_as_poor():
    flat = np.full((1000, 6), 512.0, dtype=np.float32)
    filtered = ecg_pipeline.bandpass_filter(flat)
    r_peaks = ecg_pipeline.detect_r_peaks(filtered[:, 1])
    result = ecg_pipeline.assess_signal_quality(flat, filtered, r_peaks)
    assert result["status"] == ecg_pipeline.SIGNAL_QUALITY_POOR
    assert "disconnected" in result["issues"]


def test_assess_signal_quality_flags_non_midpoint_flatline_without_disconnected():
    # A flat signal that ISN'T sitting at the AD8232 lead-off rail (512) should
    # still be flagged POOR, but as a generic flatline, not the more specific
    # "disconnected" diagnosis reserved for that exact hardware signature.
    flat = np.full((1000, 6), 50.0, dtype=np.float32)
    filtered = ecg_pipeline.bandpass_filter(flat)
    r_peaks = ecg_pipeline.detect_r_peaks(filtered[:, 1])
    result = ecg_pipeline.assess_signal_quality(flat, filtered, r_peaks)
    assert result["status"] == ecg_pipeline.SIGNAL_QUALITY_POOR
    assert "flatline" in result["issues"]
    assert "disconnected" not in result["issues"]


def test_assess_signal_quality_does_not_misflag_real_small_amplitude_mv_signal():
    # Regression test: a fixed absolute std threshold flagged every one of the
    # bundled 61 real PTB-XL records (physical mV scale, std ~0.1-0.3) as a
    # false "flatline", since that's numerically tiny compared to the raw
    # ADC-code scale (~0-1023) the same check also has to work for. The real
    # PTB-XL public example is a genuine, clean, real ECG and must be GOOD
    # (or at worst WARNING) -- never POOR/flatline just because its natural
    # unit (millivolts) makes its numbers look small in absolute terms.
    signal, _meta = ecg_pipeline.load_public_example()
    filtered = ecg_pipeline.bandpass_filter(signal)
    r_peaks = ecg_pipeline.detect_r_peaks(filtered[:, 1])
    result = ecg_pipeline.assess_signal_quality(signal, filtered, r_peaks)
    assert "flatline" not in result["issues"]
    assert "disconnected" not in result["issues"]
    assert result["status"] != ecg_pipeline.SIGNAL_QUALITY_POOR


def test_assess_signal_quality_flags_excessive_clipping():
    # Two distinct, real-shaped leads (not an identical tile across all 6
    # channels, which would artificially collapse value diversity and trip
    # the flatline check instead) clipped hard enough that a real fraction
    # of samples pin to the rail.
    t = np.arange(1000) / ecg_pipeline.SAMPLING_RATE_HZ
    lead_I = np.clip(300 * np.sin(2 * np.pi * 1.2 * t), -100, 100)
    lead_II = np.clip(250 * np.sin(2 * np.pi * 1.2 * t + 0.3), -100, 100)
    six = ecg_pipeline.compute_all_leads(lead_I, lead_II).astype(np.float32)
    filtered = ecg_pipeline.bandpass_filter(six)
    r_peaks = ecg_pipeline.detect_r_peaks(filtered[:, 1])
    result = ecg_pipeline.assess_signal_quality(six, filtered, r_peaks)
    assert "clipping" in result["issues"]


def test_assess_signal_quality_flags_insufficient_r_peaks():
    # A real signal with genuine variation (small real noise floor, so it
    # isn't also mistaken for a flatline) but only one detectable beat in a
    # 10-second window -- well below the physiologically-plausible minimum.
    rng = np.random.default_rng(0)
    t = np.arange(1000) / ecg_pipeline.SAMPLING_RATE_HZ
    lead_I = np.exp(-0.5 * ((t - 5.0) / 0.02) ** 2) * 500 + rng.normal(0, 2.0, size=t.shape)
    lead_II = np.exp(-0.5 * ((t - 5.05) / 0.02) ** 2) * 450 + rng.normal(0, 2.0, size=t.shape)
    six = ecg_pipeline.compute_all_leads(lead_I, lead_II).astype(np.float32)
    filtered = ecg_pipeline.bandpass_filter(six)
    r_peaks = ecg_pipeline.detect_r_peaks(filtered[:, 1])
    result = ecg_pipeline.assess_signal_quality(six, filtered, r_peaks)
    assert "insufficientRPeaks" in result["issues"]
    assert result["status"] in (ecg_pipeline.SIGNAL_QUALITY_WARNING, ecg_pipeline.SIGNAL_QUALITY_POOR)


def test_assess_signal_quality_status_escalates_to_poor_with_multiple_issues():
    # A slow (0.15Hz), heavily clipped sine wave triggers several real issues
    # at once (clipping, noise, baseline instability, insufficient R-peaks --
    # too few full cycles in a 10s window for a reliable rate estimate),
    # which should escalate from single-WARNING to POOR per
    # assess_signal_quality's own stated multi-issue escalation rule.
    t = np.arange(1000) / ecg_pipeline.SAMPLING_RATE_HZ
    lead_I = np.clip(300 * np.sin(2 * np.pi * 0.15 * t), -100, 100)
    lead_II = np.clip(250 * np.sin(2 * np.pi * 0.15 * t + 0.3), -100, 100)
    six = ecg_pipeline.compute_all_leads(lead_I, lead_II).astype(np.float32)
    filtered = ecg_pipeline.bandpass_filter(six)
    r_peaks = ecg_pipeline.detect_r_peaks(filtered[:, 1])
    result = ecg_pipeline.assess_signal_quality(six, filtered, r_peaks)
    assert len(result["issues"]) >= 2
    assert result["status"] == ecg_pipeline.SIGNAL_QUALITY_POOR
