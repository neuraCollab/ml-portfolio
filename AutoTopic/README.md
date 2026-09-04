# AutoTopic — NLP Topic Modeling

Unsupervised topic discovery on unstructured text logs (Russian + English), no manual labeling.
Compares three approaches on the same pipeline:

- **LDA** — the primary model. Fast at inference and reliably semantically coherent, so it's
  the default for production-style scoring.
- **NMF** — the original baseline this project started from, later replaced by LDA.
- **BERTopic** (embeddings + UMAP + HDBSCAN) — the highest topic quality, included to show the
  ceiling, but uncontrolled (topic count isn't fixed) and much slower to run.

Ships with a real 373K+ row dataset of Russian LLM-prompt logs. Includes hyperparameter tuning
(Optuna) and experiment tracking (MLflow).

**Tech:** Python, BERTopic, gensim (LDA/NMF), scikit-learn, sentence-transformers, UMAP, HDBSCAN,
Optuna, MLflow, Streamlit.

## Run

```bash
pip install -r requirements.txt
streamlit run app.py
```

Upload a CSV with a `log_text` column, pick a model (BERTopic / LDA), and view topics.
