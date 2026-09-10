# AutoTopic — Unsupervised Topic Discovery in Unstructured Text Logs

## Summary

AutoTopic groups unlabeled chat/prompt logs into interpretable topics without any manual
annotation. It runs an embedding → dimensionality-reduction → clustering → labeling pipeline
(BERTopic: SentenceTransformers + UMAP + HDBSCAN + c-TF-IDF), tunes its own hyperparameters via
Optuna, and validates the approach against a classical LDA baseline before committing to the
neural pipeline. On the project's dataset (373,657 rows), it discovers 59 topics from 236,495
analyzed documents.

## Problem

Support/product logs accumulate faster than anyone can read them, and most of that text has no
labels to train a classifier on. The question this project answers: can a pipeline discover
useful topical structure in that text with zero manual labeling, and can the quality of what it
finds be measured rather than eyeballed?

## Approach

**Pipeline.** Each document goes through cleaning (HTML/emoji/code/link stripping, LLM-mention
removal), lemmatization (`pymorphy3` for Russian, spaCy for English), length/link filtering,
multilingual sentence embedding (`paraphrase-multilingual-MiniLM-L12-v2`), UMAP dimensionality
reduction (`n_components=5`, cosine metric), HDBSCAN density clustering, and c-TF-IDF for
per-topic keyword labeling.

**Hyperparameter search.** Eight parameters (`min_topic_size`, `nr_topics`, UMAP
`n_neighbors`/`min_dist`, vectorizer `min_df`/`max_df`, `top_n_words`, n-gram range) are tuned by
Optuna's TPE sampler against a composite objective, `coherence_uci + 0.2 × diversity`, with
trials pruned early if a configuration collapses to fewer than 2 topics or diversity below 0.05.

**Baseline before committing to BERTopic.** Before adopting the neural pipeline, the project ran
a classical LDA study to check whether the added complexity was worth it. That study first tried
*supervised* evaluation — classifying documents against topic labels an LLM had generated — but
the resulting confusion matrix came back almost empty off a handful of cells: the generated
labels weren't reliable enough to score against. That's what motivated switching to unsupervised,
intrinsic metrics (coherence, diversity, cross-run stability) instead of forcing a supervised
comparison to work.

## Results

- **59 topics** discovered from **236,495** analyzed documents (of 373,657 rows total).
- Coherence (`c_v`) for the LDA-10 baseline: 0.4551, well above a random-baseline distribution
  built from the top 2,000 unigrams — the discovered structure isn't noise.
- Diversity (unique keywords / total keywords) is one intrinsic signal among several checked, not
  a standalone ranking: BERTopic scores marginally higher on that single metric (0.966 vs.
  LDA-10's ~0.91), while LDA-10's own topic stability across 5 reruns passed on aggregate (mean
  Jaccard overlap 0.376, threshold 0.3) but not for 4 of its 10 individual topics.
- ~79.5% of documents in the sample run land in the outlier/noise cluster rather than a named
  topic — expected behavior for HDBSCAN on short, heterogeneous chat text, not a bug.

## Engineering notes

- **A version-specific BERTopic bug.** Constructing `BERTopic(embedding_model=None, ...)` to
  reuse precomputed embeddings is a documented pattern, but on the BERTopic release this project
  pins (0.17.4) that combination corrupts every per-topic document into an empty string before
  c-TF-IDF vectorization, crashing with an "empty vocabulary" error on any non-English corpus.
  Passing the cached `SentenceTransformer` object instead of `None` avoids the code path
  entirely.
- **A unit mismatch in a default.** `vectorizerMaxDf` defaults to `0.9`, intended as a
  document-frequency *fraction*. On a small demo corpus that collapses to 1-2 topic groups, 0.9
  as a fraction of 1 excludes every term (100% of documents exceed 90%), again raising "empty
  vocabulary." Default changed to `1.0`.
- **A known cleaning-stage limitation.** The character filter keeps Cyrillic-only text regardless
  of the configured language mode — the "mixed" branch is unreachable in the current
  implementation. English-heavy input gets stripped aggressively during cleaning; the UI reports
  how many documents were dropped after each run rather than hiding it.

## Limitations

- The interactive demo runs the same code path as the full pipeline, on a smaller sample so it
  fits a request/response cycle rather than a background job.
- Diversity and coherence are intrinsic metrics; neither substitutes for a downstream task-based
  evaluation of topic usefulness.
- The dataset (`data/raw/labeled_requests.parquet`) isn't checked into the repository (118MB); a
  sample dataset ships instead for local runs without it.

## Tech stack

BERTopic, UMAP, HDBSCAN, sentence-transformers, gensim (LDA baseline), Optuna, MLflow, pandas,
spaCy, pymorphy3, Streamlit, FastAPI, React.

## Running it

Standalone (original Streamlit app):

```bash
pip install -r requirements.txt
python -m spacy download ru_core_news_sm en_core_web_sm
streamlit run app.py
```

Upload a CSV with a `log_text` column, pick a model (BERTopic / LDA), and view the discovered
topics, keywords, and quality metrics.

As part of the portfolio app: see the root [README](../README.md) for the Docker Compose setup;
open the AutoTopic tab to run the pipeline on the bundled sample or an uploaded CSV.
