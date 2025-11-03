import copy
from typing import Dict, Any

import optuna
import pandas as pd
from sentence_transformers import SentenceTransformer

from pipeline.metrics import evaluate_topics
from stages.cleaning import clean_texts
from stages.normalization import normalize_texts
from stages.filtering import filter_texts
from stages.topic_modeling import run_topic_modeling


def _objective_builder(texts, embeddings, base_cfg: Dict[str, Any]):
    def objective(trial: optuna.Trial) -> float:
        cfg = copy.deepcopy(base_cfg)
        tm = cfg.setdefault("topic_modeling", {})

        # Sample hyperparameters
        tm["min_topic_size"] = trial.suggest_int("min_topic_size", 10, 50, step=5)
        tm["hdbscan_min_cluster_size"] = tm["min_topic_size"]  # sync

        tm["nr_topics"] = trial.suggest_int("nr_topics", 40, 75, step=5)
        tm["top_n_words"] = trial.suggest_int("top_n_words", 8, 20)

        tm["umap_n_neighbors"] = trial.suggest_int("umap_n_neighbors", 10, 50)
        tm["umap_min_dist"] = trial.suggest_float("umap_min_dist", 0.0, 0.8)

        # n-grams choice
        ngram_choice = trial.suggest_categorical("n_gram_range", [(1, 1), (1, 2)])
        tm["n_gram_range"] = list(ngram_choice)

        vec_cfg = tm.setdefault("vectorizer", {})
        vec_cfg["min_df"] = trial.suggest_int("min_df", 3, 20)
        vec_cfg["max_df"] = trial.suggest_float("max_df", 0.70, 0.98)

        # Train and evaluate
        topic_model, topics, _ = run_topic_modeling(texts, embeddings, cfg)
        metrics = evaluate_topics(topic_model, texts, embeddings)

        # Composite objective: prioritize coherence_uci, encourage diversity
        score = metrics.get("coherence_uci", 0.0) + 0.2 * metrics.get("diversity", 0.0)
        # Optional pruning on too many topics or poor diversity
        if metrics.get("n_topics", 0) < 2 or metrics.get("diversity", 0) < 0.05:
            raise optuna.exceptions.TrialPruned()

        return score

    return objective


def optimize_hyperparams_on_df(df: pd.DataFrame, cfg: Dict[str, Any], n_trials: int = 20,
                               timeout: int | None = None, seed: int = 42) -> Dict[str, Any]:
    """Run Optuna on a sample DataFrame and return best_params dict."""
    # Preprocess once for all trials
    texts_clean = clean_texts(df["log_text"].astype(str).tolist())
    texts_clean = filter_texts(normalize_texts(texts_clean, cfg), cfg)

    # Compute embeddings once for the sample
    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    embeddings = model.encode(texts_clean, show_progress_bar=False)

    sampler = optuna.samplers.TPESampler(seed=seed)
    study = optuna.create_study(direction="maximize", sampler=sampler)
    study.optimize(_objective_builder(texts_clean, embeddings, cfg), n_trials=n_trials, timeout=timeout)

    return study.best_trial.params


