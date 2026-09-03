# Real ECG data (PTB-XL)

Everything in this folder is real, public, de-identified ECG data from **PTB-XL**
(Wagner et al., *PTB-XL, a large publicly available electrocardiography dataset*,
PhysioNet, https://doi.org/10.13026/kfzx-aw45), licensed **CC-BY 4.0** -- free to
reuse and redistribute with attribution, which is what these files are: a small,
redistributed subset (not the ~1.7GB full dataset), fetched directly from
PhysioNet's open file server (no credentialing needed -- PTB-XL, unlike e.g.
MIMIC, requires no data use agreement).

> Wagner, P., Strodthoff, N., Bousseljot, R., Kreiseler, D., Lunze, F.I., Samek,
> W., Schaeffter, T. (2022). PTB-XL, a large publicly available electrocardiography
> dataset (version 1.0.3). PhysioNet. https://doi.org/10.13026/kfzx-aw45

## Files

- **`ptbxl_example_signal.npy`** -- one real record, shape `(1000, 6)` float32,
  physical units (mV), leads `I, II, III, aVR, aVL, aVF` (PTB-XL's own channel
  order for the first 6 of its 12 leads -- exactly what `ai/main.py` used to
  build the original training set). This is the "public ECG example" used by
  `POST /api/ecg/demo` with `source="public"`.
- **`ptbxl_example_meta.json`** -- that record's PTB-XL `ecg_id`, source
  filename, and real ground-truth labels (a pure sinus-rhythm record was
  chosen deliberately, as the least ambiguous single example).
- **`ptbxl_labeled_eval.npz`** -- 61 real records (`X`: `(61, 1000, 6)` raw mV
  signals, `y`: `(61, 19)` multi-label binary ground truth, `ecg_ids`,
  `target_cols`), used by `POST /api/ecg/evaluate-bundled`. Spans 12 of the 19
  classes with real positive support (verified against a live evaluation run,
  not estimated): `is_sinus_rhythm` (40), `has_lbbb` (15), `has_irbbb` (14),
  `is_afib` (13), `has_lafb` (11), `has_1avb` (9), `is_pvc` (9),
  `is_sinus_arrhythmia` (2), `is_pac` (1), `has_rbbb` (1), `has_ilbbb` (1),
  `has_bigeminy` (1). The other 7 classes have zero positive examples in this
  set and are reported as N/A (not evaluated), not a misleading measured 0 --
  see `EcgEvaluationResponse.numEvaluatedClasses`.
- **`per_class_thresholds.npy`** -- see "Why per-class thresholds" below.

## How the labels were built

Identical logic to `ai/main.py`'s `valid_scp_codes` / `ii_targets`: a record's
`scp_codes` (from PTB-XL's `ptbxl_database.csv`) must be a subset of the same
19-plus-NORM SCP code set the model was trained to recognize, and each of the
19 target columns is `1` iff that record's `scp_codes` contains the
corresponding code (e.g. `is_afib` = 1 iff `'AFIB' in scp_codes`). This is the
exact label-construction rule used to train the bundled model, applied to
*different* records than it was trained/tested on.

## Why per-class thresholds, not the training script's flat 0.5

`ai/nn_main.py` binarizes predictions at a flat `0.5`. Running the actual
bundled model (`rp/ecg_model_traced.pt`) on this real data shows why that
doesn't work in practice: its raw sigmoid outputs top out around `3.6e-5` --
nowhere near `0.5` -- almost certainly because `ai/nn_main.py` only trains for
10 epochs with no calibration step. At a flat 0.5 threshold, `predicted` is
`False` for every one of the 19 classes on every real input: not wrong, but
useless as a classifier.

`per_class_thresholds.npy` (19 floats, `ecg_pipeline.CLASS_NAMES` order) fixes
this the standard way: each class's threshold is the one that maximizes that
class's own F1 score on a **48-record calibration set, disjoint from the
61-record evaluation set above** (same PTB-XL source, same label-building
rule, different `ecg_id`s, fetched with a different random seed). This is
ordinary threshold tuning on held-out data -- it never touches the model's
weights or its raw probabilities, only the cutoff applied to decide
`predicted: true/false`. Validated on the (still-disjoint) 61-record
evaluation set, this gives real, non-degenerate results -- e.g.
`is_sinus_rhythm` P=0.64/R=0.93/F1=0.76, `is_afib` P=0.21/R=1.00 -- alongside
classes where the model still performs poorly (e.g. `has_lafb` R=0.09). That
unevenness is the real, honest performance of a lightly-trained portfolio
model; the fix here is measuring it correctly, not hiding it.

## Regenerating or extending this data

All of the above was produced with `wfdb.rdsamp(record_name, pn_dir='ptb-xl/1.0.3/records100/<bucket>')`
against `https://physionet.org/files/ptb-xl/1.0.3/`, using
`ptbxl_database.csv` + `scp_statements.csv` from the same release for labels.
No credentials are required. To pick different/more records, filter
`ptbxl_database.csv` the same way `ai/main.py` does and fetch each with wfdb;
`wfdb` isn't a runtime dependency of the backend (this is a one-time data-prep
step), so install it separately (`pip install wfdb`) to regenerate.
