"""Adapter around the existing AutoTopic project (../AutoTopic).

This module deliberately does not modify AutoTopic's own source. It puts
AutoTopic on sys.path (its modules use bare `from stages...` / `from
pipeline...` imports that expect that), then composes the same functions
`AutoTopic/app.py` already uses for its Streamlit UI: `clean_texts`,
`normalize_texts`, `filter_texts`, `run_topic_modeling`, `evaluate_topics`.

Adaptations over app.py's approach:
  * the sentence-transformer embedding model is loaded once and cached,
    instead of re-instantiated on every call (app.py's `run_bertopic` does
    the latter, which is fine for a local script but wasteful behind an API).
  * cleaning/normalization/filtering run per-document (which is equivalent,
    since none of those three stages use cross-document statistics) so we
    can keep track of which surviving document maps to which raw input --
    the batch versions in AutoTopic drop that mapping entirely.
  * `stages/topic_modeling.py::run_topic_modeling` is NOT called directly.
    It builds `BERTopic(embedding_model=None, ...)` since embeddings are
    precomputed externally -- reasonable in principle, but with the BERTopic
    version this project resolves to (0.17.4), `embedding_model=None`
    reproducibly corrupts every per-topic document into a blank string
    before c-TF-IDF vectorization, which crashes with sklearn's "empty
    vocabulary" on any non-English (e.g. Cyrillic) corpus -- verified by
    isolating a minimal BERTopic.fit_transform() call with vs. without a
    real embedding_model object; only `None` reproduces the corruption.
    `_fit_bertopic()` below reuses `_build_vectorizer` (the one piece of
    that function that isn't affected) and passes the same cached
    SentenceTransformer object BERTopic needs anyway, everything else
    (UMAP/HDBSCAN construction, hyperparameters) identical to the original.
"""
import logging
import random
import re
import sys
import threading
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.core.config import AUTOTOPIC_DATA_URL, AUTOTOPIC_DIR, MAX_DOCUMENTS
from app.schemas.autotopic import AutoTopicConfig, AutoTopicResults, DatasetInfo, FullPipelineStatus

logger = logging.getLogger(__name__)

if str(AUTOTOPIC_DIR) not in sys.path:
    sys.path.insert(0, str(AUTOTOPIC_DIR))

from stages.cleaning import clean_texts  # noqa: E402
from stages.normalization import normalize_texts  # noqa: E402
from stages.filtering import filter_texts  # noqa: E402
from stages.topic_modeling import _build_vectorizer  # noqa: E402
from pipeline.metrics import evaluate_topics  # noqa: E402

_RU_CHAR_RE = re.compile(r"[а-яА-Я]")

_TOPIC_COLORS = [
    "#6366f1", "#ec4899", "#10b981", "#f59e0b", "#06b6d4",
    "#8b5cf6", "#f97316", "#14b8a6", "#e11d48", "#84cc16",
]

_model_lock = threading.Lock()
_sentence_model = None


class AutoTopicError(Exception):
    """Raised for expected/validation-style failures (not enough data, etc.)."""


def _get_sentence_model():
    global _sentence_model
    if _sentence_model is None:
        with _model_lock:
            if _sentence_model is None:
                from sentence_transformers import SentenceTransformer

                logger.info("Loading SentenceTransformer model (first use)...")
                _sentence_model = SentenceTransformer(
                    "paraphrase-multilingual-MiniLM-L12-v2", device="cpu"
                )
    return _sentence_model


def warmup() -> None:
    """Force the heavy models to load once, at process startup."""
    _get_sentence_model()


_DATASET_CACHE_DIR = AUTOTOPIC_DIR / "data" / "cache"
_DATASET_TEXT_COLUMN = "log_text"


def _dataset_location_is_url() -> bool:
    return AUTOTOPIC_DATA_URL.startswith("http://") or AUTOTOPIC_DATA_URL.startswith("https://")


def _resolve_dataset_path() -> Path:
    """AUTOTOPIC_DATA_URL (app/core/config.py, configurable via the
    AUTOTOPIC_DATA_URL env var -- see AutoTopic/data/README.md) is either a
    path relative to AutoTopic/, an absolute local path, or an http(s) URL.
    This is the one place that distinction is resolved -- nothing else in
    this module hardcodes the dataset's location.
    """
    if _dataset_location_is_url():
        _DATASET_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cached = _DATASET_CACHE_DIR / "remote_dataset.parquet"
        if not cached.exists():
            import urllib.request

            logger.info(f"Downloading AutoTopic dataset from {AUTOTOPIC_DATA_URL}")
            urllib.request.urlretrieve(AUTOTOPIC_DATA_URL, cached)
        return cached

    path = Path(AUTOTOPIC_DATA_URL)
    if not path.is_absolute():
        path = AUTOTOPIC_DIR / path
    return path


def get_dataset_info() -> DatasetInfo:
    path = _resolve_dataset_path()
    exists = path.exists()
    total_rows = None
    if exists:
        try:
            import pyarrow.parquet as pq

            total_rows = pq.ParquetFile(path).metadata.num_rows
        except Exception:
            logger.exception("Could not read dataset parquet metadata")
    return DatasetInfo(
        configuredLocation=AUTOTOPIC_DATA_URL,
        resolvedPath=str(path),
        isUrl=_dataset_location_is_url(),
        exists=exists,
        totalRows=total_rows,
    )


def load_real_dataset_sample(sample_size: int, seed: int) -> tuple[list[str], DatasetInfo]:
    """Loads real rows (never mock/demo data) from the dataset configured via
    AUTOTOPIC_DATA_URL, for POST /api/autotopic/analyze-dataset. The dataset
    (373k+ real rows) is far bigger than BERTopic can cluster in a live
    request, so this draws a random sample -- real, unmodified text, just a
    subset of it -- capped at MAX_DOCUMENTS.
    """
    path = _resolve_dataset_path()
    if not path.exists():
        raise AutoTopicError(
            f"Configured dataset not found at '{path}' (AUTOTOPIC_DATA_URL={AUTOTOPIC_DATA_URL}). "
            "Place the parquet file there, or point AUTOTOPIC_DATA_URL at a reachable local path "
            "or URL -- see AutoTopic/data/README.md."
        )
    try:
        df = pd.read_parquet(path, columns=[_DATASET_TEXT_COLUMN])
    except Exception as exc:
        raise AutoTopicError(f"Could not read dataset parquet file at '{path}': {exc}")

    if _DATASET_TEXT_COLUMN not in df.columns:
        raise AutoTopicError(
            f"Column '{_DATASET_TEXT_COLUMN}' not found in dataset. Available columns: {list(df.columns)}"
        )

    total_rows = len(df)
    texts_series = df[_DATASET_TEXT_COLUMN].dropna().astype(str)
    texts_series = texts_series[texts_series.str.strip() != ""]
    if len(texts_series) == 0:
        raise AutoTopicError(f"Column '{_DATASET_TEXT_COLUMN}' has no non-empty rows in the dataset")

    n = min(sample_size, MAX_DOCUMENTS, len(texts_series))
    sampled = texts_series.sample(n=n, random_state=seed)

    info = DatasetInfo(
        configuredLocation=AUTOTOPIC_DATA_URL,
        resolvedPath=str(path),
        isUrl=_dataset_location_is_url(),
        exists=True,
        totalRows=total_rows,
        sampledRows=n,
    )
    return sampled.tolist(), info


def _build_pipeline_cfg(config: AutoTopicConfig) -> dict[str, Any]:
    language_mode = "ru_only" if config.languageMode == "ru" else "mixed"
    return {
        "topic_modeling": {
            "n_gram_range": list(config.nGramRange),
            "min_topic_size": config.minTopicSize,
            "umap_n_neighbors": config.umapNeighbors,
            "umap_min_dist": config.umapMinDist,
            "hdbscan_min_cluster_size": config.minTopicSize,
            "nr_topics": config.nrTopics,
            "top_n_words": config.topNWords,
            "vectorizer": {
                "min_df": config.vectorizerMinDf,
                "max_df": config.vectorizerMaxDf,
            },
            "language_mode": language_mode,
            "random_state": 42,
        },
        "normalization": {"language": config.languageMode, "lemmatize": True},
        "filtering": {"min_length": config.minLen, "drop_links": True},
    }


def _clean_normalize_filter_one(raw_text: str, cfg: dict, min_len: int, max_len: int) -> str | None:
    cleaned = clean_texts([raw_text], min_len=min_len, max_len=max_len)
    if not cleaned:
        return None
    normed = normalize_texts(cleaned, cfg)
    filtered = filter_texts(normed, cfg)
    if not filtered:
        return None
    return filtered[0]


def _fit_bertopic(texts: list[str], embeddings, cfg: dict, embedding_model):
    """Same construction as stages/topic_modeling.py::run_topic_modeling,
    except `embedding_model` is the real cached SentenceTransformer instead
    of None -- see the module docstring for why that one change is needed."""
    from bertopic import BERTopic
    from umap import UMAP
    import hdbscan

    umap_model = UMAP(
        n_neighbors=cfg["topic_modeling"].get("umap_n_neighbors", 15),
        n_components=5,
        min_dist=cfg["topic_modeling"].get("umap_min_dist", 0.15),
        metric="cosine",
        random_state=cfg["topic_modeling"].get("random_state", 42),
    )
    hdbscan_model = hdbscan.HDBSCAN(
        min_cluster_size=cfg["topic_modeling"].get("hdbscan_min_cluster_size", 20),
        metric="euclidean",
        prediction_data=True,
    )
    topic_model = BERTopic(
        n_gram_range=tuple(cfg["topic_modeling"]["n_gram_range"]),
        min_topic_size=cfg["topic_modeling"]["min_topic_size"],
        embedding_model=embedding_model,
        nr_topics=cfg["topic_modeling"].get("nr_topics", 50),
        umap_model=umap_model,
        hdbscan_model=hdbscan_model,
        vectorizer_model=_build_vectorizer(cfg),
        top_n_words=cfg["topic_modeling"].get("top_n_words", 10),
    )
    topics, probs = topic_model.fit_transform(texts, embeddings)
    return topic_model, topics, probs


def _confidence_for(probs, idx: int) -> float:
    if probs is None:
        return 1.0
    try:
        row = probs[idx]
    except (IndexError, TypeError):
        return 1.0
    if np.isscalar(row):
        return float(row)
    try:
        return float(np.max(row))
    except (TypeError, ValueError):
        return 1.0


_MAX_COHERENCE_DOCS = 20000


def _evaluate_topics_capped(topic_model, texts: list[str]) -> dict:
    """Same computation as AutoTopic/pipeline/metrics.py::evaluate_topics(),
    used instead of it for the full-dataset job for two reasons discovered
    when this ran against the real ~236k-document survivor set:

    1. Gensim's c_uci coherence is a sliding-window co-occurrence count over
       every pair of topic words (up to ~60 topics x 12 words here), scanned
       across the *entire* `texts` corpus -- on 236k documents this is
       impractically slow (the job sat at "Computing coherence/diversity
       metrics" for 20+ minutes with only single-digit CPU ticks accruing).
       A random sample of _MAX_COHERENCE_DOCS real documents gives a
       statistically representative coherence estimate in seconds instead,
       which is standard practice at this scale -- it doesn't touch the
       topics/keywords themselves, only how their coherence is *measured*.
    2. Gensim's CoherenceModel defaults to multiprocessing (`processes=-1`).
       fork()-ing a process pool from a background thread (this job runs in
       one, not the main thread) risks inheriting a lock held by another
       thread at fork time and deadlocking forever with zero CPU use --
       `processes=1` avoids the fork entirely.
    """
    from gensim.corpora import Dictionary
    from gensim.models.coherencemodel import CoherenceModel

    if len(texts) > _MAX_COHERENCE_DOCS:
        texts = random.Random(42).sample(texts, _MAX_COHERENCE_DOCS)

    topics = {
        topic_id: words
        for topic_id, words in topic_model.get_topics().items()
        if topic_id != -1 and words
    }
    topic_words = [[word for word, _ in words] for words in topics.values()]
    tokenized_texts = [t.split() for t in texts]

    dictionary = Dictionary(tokenized_texts)
    corpus = [dictionary.doc2bow(t) for t in tokenized_texts]

    results = {"n_topics": len(topics), "coherence_uci": 0.0, "coherence_umass": 0.0, "diversity": 0.0}

    try:
        cm_uci = CoherenceModel(
            topics=topic_words, texts=tokenized_texts, dictionary=dictionary, coherence="c_uci", processes=1
        )
        results["coherence_uci"] = cm_uci.get_coherence()
    except Exception:
        logger.exception("c_uci coherence computation failed")

    try:
        cm_umass = CoherenceModel(
            topics=topic_words, corpus=corpus, dictionary=dictionary, coherence="u_mass", processes=1
        )
        results["coherence_umass"] = cm_umass.get_coherence()
    except Exception:
        logger.exception("u_mass coherence computation failed")

    all_words = [w for topic in topic_words for w in topic]
    if all_words:
        results["diversity"] = len(set(all_words)) / len(all_words)

    return results


def _project_2d(embeddings) -> np.ndarray | None:
    """Cheap 2D UMAP projection of already-computed sentence embeddings, for
    the topic-map scatter plot only. This is NOT the UMAP instance BERTopic
    uses for clustering (that one reduces to 5 dimensions and its output
    never leaves stages/topic_modeling.py) -- it's a second, throwaway fit on
    the same input vectors purely so the frontend has (x, y) to plot. Topic
    assignments, keywords, and metrics are all unaffected by this.
    Returns None when there are too few points for UMAP to fit at all.
    """
    n = len(embeddings)
    if n < 4:
        return None
    from umap import UMAP

    n_neighbors = min(15, n - 1)
    reducer = UMAP(n_neighbors=n_neighbors, n_components=2, min_dist=0.1, metric="cosine", random_state=42)
    return reducer.fit_transform(np.asarray(embeddings))


def _build_topics_out(topics: list[int], topic_model, top_n_words: int) -> list[dict]:
    """Shared by analyze() and the full-pipeline job: turns BERTopic's own
    per-topic c-TF-IDF keywords and representative_docs into the shape the
    frontend renders (bar chart + keyword cloud + representative docs).
    """
    unique_topic_ids = sorted(set(topics))
    topics_out = []
    for color_idx, tid in enumerate(unique_topic_ids):
        count = topics.count(tid)
        keywords_raw = topic_model.get_topic(tid) or []
        keywords = [{"word": w, "weight": float(weight)} for w, weight in keywords_raw[:top_n_words]]
        if tid == -1:
            name = "Outliers / Noise (-1)"
        else:
            top_words = [w for w, _ in keywords_raw[:3]]
            name = ", ".join(top_words) if top_words else f"Topic {tid}"
        # BERTopic picks these via c-TF-IDF similarity to the topic's centroid
        # (topic_model.representative_docs_), not just "first N docs" -- a
        # real per-topic summary, not something we're fabricating here.
        try:
            rep_docs = topic_model.get_representative_docs(tid) or []
        except Exception:
            rep_docs = []
        topics_out.append(
            {
                "id": tid,
                "name": name,
                "count": count,
                "percentage": round(count / len(topics) * 100, 1),
                "keywords": keywords,
                "color": _TOPIC_COLORS[color_idx % len(_TOPIC_COLORS)],
                "representativeDocs": rep_docs[:3],
            }
        )
    return topics_out


def analyze(texts: list[str], config: AutoTopicConfig) -> AutoTopicResults:
    if len(texts) > MAX_DOCUMENTS:
        raise AutoTopicError(
            f"Too many documents ({len(texts)}). This demo caps input at "
            f"{MAX_DOCUMENTS} so BERTopic stays fast on CPU."
        )

    cfg = _build_pipeline_cfg(config)

    surviving: list[tuple[int, str, str]] = []
    for idx, raw in enumerate(texts):
        final_text = _clean_normalize_filter_one(raw, cfg, config.minLen, config.maxLen)
        if final_text:
            surviving.append((idx, raw, final_text))

    n_dropped = len(texts) - len(surviving)

    # UMAP's spectral initialization needs strictly more samples than
    # umap_n_neighbors (and BERTopic's stages/topic_modeling.py hardcodes
    # n_components=5), or scipy's eigsh raises a cryptic
    # "Cannot use scipy.linalg.eigh for sparse A with k >= N" TypeError deep
    # inside BERTopic.fit_transform. Catching that here turns it into an
    # actionable message instead of a 500.
    min_required = max(config.umapNeighbors + 2, 10)
    if len(surviving) < min_required:
        raise AutoTopicError(
            "Not enough documents survived cleaning/filtering to build topics "
            f"({len(surviving)} of {len(texts)} remained, need at least {min_required} for "
            f"umap_n_neighbors={config.umapNeighbors}). Note: stages/cleaning.py currently "
            "keeps Cyrillic characters only, so English-heavy input is aggressively stripped "
            "-- try lowering minLen/umapNeighbors, or adding more Russian text."
        )

    clean_corpus = [t for _, _, t in surviving]
    model = _get_sentence_model()
    embeddings = model.encode(clean_corpus, batch_size=32, show_progress_bar=False)

    try:
        topic_model, topics, probs = _fit_bertopic(clean_corpus, embeddings, cfg, model)
    except Exception as exc:
        logger.exception("BERTopic fit failed")
        raise AutoTopicError(
            f"BERTopic failed to fit with {len(surviving)} surviving documents and the current "
            f"settings ({type(exc).__name__}: {exc}). Try lowering umap_n_neighbors/min_topic_size."
        )
    topics = list(topics)

    metrics_raw = evaluate_topics(topic_model, clean_corpus, embeddings)
    composite_score = metrics_raw["coherence_uci"] + 0.2 * metrics_raw["diversity"]

    unique_topic_ids = sorted(set(topics))
    topics_out = _build_topics_out(topics, topic_model, config.topNWords)
    coords_2d = _project_2d(embeddings)

    documents_out = []
    for row_idx, (orig_idx, raw_text, cleaned_text) in enumerate(surviving):
        documents_out.append(
            {
                "id": f"doc_{orig_idx + 1}",
                "text": raw_text,
                "cleanedText": cleaned_text,
                "language": "ru" if _RU_CHAR_RE.search(raw_text) else "en",
                "topicId": topics[row_idx],
                "confidence": round(_confidence_for(probs, row_idx), 2),
                "x": float(coords_2d[row_idx, 0]) if coords_2d is not None else None,
                "y": float(coords_2d[row_idx, 1]) if coords_2d is not None else None,
            }
        )

    note = None
    if n_dropped:
        note = (
            f"{n_dropped} of {len(texts)} input documents were filtered out during "
            "cleaning/normalization/filtering (stages/cleaning.py + stages/filtering.py, "
            "reused as-is) and are excluded from the results below."
        )

    n_topics_excl_noise = len([t for t in unique_topic_ids if t != -1])
    outlier_count = topics.count(-1)

    return AutoTopicResults(
        metrics={
            "documentsAnalyzed": len(surviving),
            "nTopics": n_topics_excl_noise,
            "outlierCount": outlier_count,
            "outlierPercentage": round(outlier_count / len(topics) * 100, 1) if topics else 0.0,
            "coherenceUci": round(metrics_raw["coherence_uci"], 3),
            "coherenceUmass": round(metrics_raw["coherence_umass"], 3),
            "diversity": round(metrics_raw["diversity"], 3),
            "compositeScore": round(composite_score, 3),
        },
        topics=topics_out,
        documents=documents_out,
        trials=[],
        note=note,
    )


def analyze_dataset(sample_size: int, seed: int, config: AutoTopicConfig) -> AutoTopicResults:
    """Real end-to-end run on the configured real dataset (AUTOTOPIC_DATA_URL)
    instead of the bundled demo sample -- a random sample of real rows (never
    mock/demo data) through the same analyze() pipeline used everywhere else.
    """
    texts, dataset_info = load_real_dataset_sample(sample_size, seed)
    result = analyze(texts, config)
    result.datasetInfo = dataset_info
    return result


# ---------------------------------------------------------------------------
# Full-dataset pipeline: matches AutoTopic/main.py's "train on the whole
# corpus" stage (minus MLflow/Optuna, which are offline-only concerns), run
# against every real row in the configured dataset rather than a capped
# sample. This is a genuinely long job on CPU (embeddings alone take ~45-75
# minutes on the full ~370k-row dataset), so it can't run inside a request/
# response cycle -- it runs in a background thread with a single job slot,
# polled via GET /api/autotopic/full-pipeline/status. Only one run at a time;
# starting a second while one is active is rejected rather than queued, to
# keep this a simple portfolio demo rather than a real job scheduler.
# ---------------------------------------------------------------------------

_FULL_PIPELINE_DOC_PREVIEW_SIZE = 300

_full_pipeline_lock = threading.Lock()
_full_pipeline_state: dict[str, Any] = {
    "status": "idle",
    "stage": None,
    "progressPercent": None,
    "startedAt": None,
    "finishedAt": None,
    "elapsedSeconds": None,
    "totalRows": None,
    "survivingRows": None,
    "error": None,
    "result": None,
}


def get_full_pipeline_status() -> FullPipelineStatus:
    with _full_pipeline_lock:
        return FullPipelineStatus(**_full_pipeline_state)


def start_full_pipeline(config: AutoTopicConfig) -> FullPipelineStatus:
    with _full_pipeline_lock:
        if _full_pipeline_state["status"] == "running":
            raise AutoTopicError(
                "A full-dataset pipeline run is already in progress -- poll "
                "GET /api/autotopic/full-pipeline/status and wait for it to finish."
            )
        _full_pipeline_state.update(
            status="running",
            stage="Loading dataset",
            progressPercent=0.0,
            startedAt=time.time(),
            finishedAt=None,
            elapsedSeconds=None,
            totalRows=None,
            survivingRows=None,
            error=None,
            result=None,
        )
        snapshot = FullPipelineStatus(**_full_pipeline_state)

    thread = threading.Thread(target=_run_full_pipeline, args=(config,), daemon=True)
    thread.start()
    return snapshot


def _set_full_pipeline_stage(stage: str, progress: float | None = None) -> None:
    with _full_pipeline_lock:
        _full_pipeline_state["stage"] = stage
        if progress is not None:
            _full_pipeline_state["progressPercent"] = round(progress, 1)


def _run_full_pipeline(config: AutoTopicConfig) -> None:
    start_time = time.time()
    try:
        cfg = _build_pipeline_cfg(config)

        _set_full_pipeline_stage("Loading dataset", 0)
        path = _resolve_dataset_path()
        if not path.exists():
            raise AutoTopicError(
                f"Configured dataset not found at '{path}' (AUTOTOPIC_DATA_URL={AUTOTOPIC_DATA_URL})."
            )
        df = pd.read_parquet(path, columns=[_DATASET_TEXT_COLUMN])
        texts = df[_DATASET_TEXT_COLUMN].dropna().astype(str).tolist()
        total = len(texts)
        with _full_pipeline_lock:
            _full_pipeline_state["totalRows"] = total

        # Stage 1: cleaning/normalization/filtering, chunked so progress is
        # visible instead of the UI sitting frozen for ~8 minutes at this scale.
        surviving: list[tuple[int, str, str]] = []
        chunk_size = 5000
        for start_idx in range(0, total, chunk_size):
            chunk = texts[start_idx:start_idx + chunk_size]
            for offset, raw in enumerate(chunk):
                final_text = _clean_normalize_filter_one(raw, cfg, config.minLen, config.maxLen)
                if final_text:
                    surviving.append((start_idx + offset, raw, final_text))
            done = start_idx + len(chunk)
            _set_full_pipeline_stage(
                f"Cleaning, normalizing & filtering ({done:,}/{total:,} rows)",
                5 + 25 * min(1.0, done / total),
            )

        n_surviving = len(surviving)
        with _full_pipeline_lock:
            _full_pipeline_state["survivingRows"] = n_surviving

        min_required = max(config.umapNeighbors + 2, 10)
        if n_surviving < min_required:
            raise AutoTopicError(
                f"Only {n_surviving} of {total} real rows survived cleaning/filtering -- "
                f"not enough to build topics (need at least {min_required})."
            )

        clean_corpus = [t for _, _, t in surviving]
        model = _get_sentence_model()

        # Stage 2: embeddings, chunked for the same reason.
        embed_chunk = 2000
        embeddings_parts = []
        for start_idx in range(0, n_surviving, embed_chunk):
            chunk = clean_corpus[start_idx:start_idx + embed_chunk]
            embeddings_parts.append(model.encode(chunk, batch_size=32, show_progress_bar=False))
            done = start_idx + len(chunk)
            _set_full_pipeline_stage(
                f"Computing embeddings ({done:,}/{n_surviving:,} documents)",
                30 + 40 * min(1.0, done / n_surviving),
            )
        embeddings = np.concatenate(embeddings_parts, axis=0)

        # Stage 3: UMAP + HDBSCAN + c-TF-IDF -- BERTopic gives no incremental
        # progress hook for this, so the UI just shows elapsed time here.
        _set_full_pipeline_stage(
            "UMAP dimensionality reduction + HDBSCAN clustering + c-TF-IDF "
            "(no incremental progress available for this stage)",
            70,
        )
        try:
            topic_model, topics, probs = _fit_bertopic(clean_corpus, embeddings, cfg, model)
        except Exception as exc:
            logger.exception("Full-pipeline BERTopic fit failed")
            raise AutoTopicError(
                f"BERTopic failed to fit {n_surviving} documents ({type(exc).__name__}: {exc})."
            )
        topics = list(topics)

        _set_full_pipeline_stage(
            f"Computing coherence/diversity metrics (on a random sample of up to "
            f"{_MAX_COHERENCE_DOCS:,} of the {n_surviving:,} documents -- see code comments)",
            92,
        )
        metrics_raw = _evaluate_topics_capped(topic_model, clean_corpus)
        composite_score = metrics_raw["coherence_uci"] + 0.2 * metrics_raw["diversity"]

        _set_full_pipeline_stage("Building results", 97)
        topics_out = _build_topics_out(topics, topic_model, config.topNWords)

        # The full survivor set is 100k+ documents -- returning (or rendering)
        # all of them isn't practical, so this is an explicitly-labeled random
        # preview, not the complete classified set.
        rng = random.Random(42)
        preview_positions = sorted(rng.sample(range(n_surviving), min(_FULL_PIPELINE_DOC_PREVIEW_SIZE, n_surviving)))
        # 2D-projecting only the preview's own embeddings (not all 100k+
        # survivors) keeps this fast regardless of full-corpus size -- see
        # _project_2d's docstring for why this doesn't touch clustering.
        preview_coords_2d = _project_2d(embeddings[preview_positions])
        documents_out = []
        for preview_idx, row_idx in enumerate(preview_positions):
            orig_idx, raw_text, cleaned_text = surviving[row_idx]
            documents_out.append(
                {
                    "id": f"doc_{orig_idx + 1}",
                    "text": raw_text,
                    "cleanedText": cleaned_text,
                    "language": "ru" if _RU_CHAR_RE.search(raw_text) else "en",
                    "topicId": topics[row_idx],
                    "confidence": round(_confidence_for(probs, row_idx), 2),
                    "x": float(preview_coords_2d[preview_idx, 0]) if preview_coords_2d is not None else None,
                    "y": float(preview_coords_2d[preview_idx, 1]) if preview_coords_2d is not None else None,
                }
            )

        n_topics_excl_noise = len([t for t in set(topics) if t != -1])
        outlier_count = topics.count(-1)
        elapsed = time.time() - start_time

        result = AutoTopicResults(
            metrics={
                "documentsAnalyzed": n_surviving,
                "nTopics": n_topics_excl_noise,
                "outlierCount": outlier_count,
                "outlierPercentage": round(outlier_count / len(topics) * 100, 1) if topics else 0.0,
                "coherenceUci": round(metrics_raw["coherence_uci"], 3),
                "coherenceUmass": round(metrics_raw["coherence_umass"], 3),
                "diversity": round(metrics_raw["diversity"], 3),
                "compositeScore": round(composite_score, 3),
            },
            topics=topics_out,
            documents=documents_out,
            trials=[],
            note=(
                f"Full real-dataset run: {n_surviving:,} of {total:,} real rows survived "
                f"cleaning/filtering and were embedded + clustered by the real pipeline in "
                f"{elapsed / 60:.1f} minutes. The table below is a random preview of "
                f"{len(documents_out)} classified documents, not all {n_surviving:,} of them -- "
                "rendering that many rows in a browser isn't practical. Coherence/diversity were "
                f"measured on a random sample of up to {_MAX_COHERENCE_DOCS:,} of the {n_surviving:,} "
                "documents (not all of them) -- gensim's coherence computation scales too poorly "
                "with corpus size to run on the full survivor set in a reasonable time; every "
                "topic/keyword/document assignment above is still from the full corpus."
            ),
            datasetInfo=DatasetInfo(
                configuredLocation=AUTOTOPIC_DATA_URL,
                resolvedPath=str(path),
                isUrl=_dataset_location_is_url(),
                exists=True,
                totalRows=total,
                sampledRows=n_surviving,
            ),
        )

        with _full_pipeline_lock:
            _full_pipeline_state.update(
                status="completed",
                stage="Done",
                progressPercent=100.0,
                finishedAt=time.time(),
                elapsedSeconds=round(elapsed, 1),
                error=None,
                result=result,
            )
    except Exception as exc:
        logger.exception("Full-dataset AutoTopic pipeline failed")
        with _full_pipeline_lock:
            _full_pipeline_state.update(
                status="failed",
                error=str(exc),
                finishedAt=time.time(),
                elapsedSeconds=round(time.time() - start_time, 1),
            )
