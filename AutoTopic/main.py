import mlflow
import pandas as pd
import yaml
from loguru import logger

from pipeline.cache import load_or_run, CACHE_DIR
from pipeline.metrics import evaluate_topics
from pipeline.viz import plot_topic_sizes, plot_wordcloud
from pipeline.optuna_tune import optimize_hyperparams_on_df
from create_sample import create_sample_data

from stages.embedding import get_embeddings
from stages.topic_modeling import load_or_train_bertopic
from stages.cleaning import clean_texts
from stages.normalization import normalize_texts
from stages.filtering import filter_texts


def main():
    mlflow.set_tracking_uri("http://localhost:5000")
    mlflow.set_experiment("topic_analysis")

    with mlflow.start_run():
        # --- загрузка конфигурации ---
        with open("config.yaml", "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f)

        # === Стадия 1: оптимизация на сэмпле ===
        if cfg.get("tuning", {}).get("enabled", False):
            sample_df = create_sample_data("data.csv", frac=0.10, random_state=42)
            best_params = optimize_hyperparams_on_df(
                sample_df,
                cfg,
                n_trials=cfg["tuning"].get("n_trials", 30),
                timeout=cfg["tuning"].get("timeout"),
            )
            mlflow.log_params({f"optuna_{k}": v for k, v in best_params.items()})

            # Встраиваем лучшие параметры в cfg
            tm = cfg.setdefault("topic_modeling", {})
            tm["min_topic_size"] = best_params.get(
                "min_topic_size", tm.get("min_topic_size", 15)
            )
            tm["hdbscan_min_cluster_size"] = tm["min_topic_size"]
            tm["nr_topics"] = best_params.get("nr_topics", tm.get("nr_topics", 50))
            tm["top_n_words"] = best_params.get(
                "top_n_words", tm.get("top_n_words", 10)
            )
            tm["umap_n_neighbors"] = best_params.get(
                "umap_n_neighbors", tm.get("umap_n_neighbors", 15)
            )
            tm["umap_min_dist"] = best_params.get(
                "umap_min_dist", tm.get("umap_min_dist", 0.15)
            )
            ngram = best_params.get("n_gram_range")
            if ngram is not None:
                tm["n_gram_range"] = list(ngram)
            vec = tm.setdefault("vectorizer", {})
            vec["min_df"] = best_params.get("min_df", vec.get("min_df", 5))
            vec["max_df"] = best_params.get("max_df", vec.get("max_df", 0.9))

        # === Стадия 2: финальное обучение на полном датасете ===
        raw = pd.read_csv("data.csv")
        full_clean = pd.DataFrame(
            {
                "log_text": filter_texts(
                    normalize_texts(
                        clean_texts(raw["log_text"].astype(str).tolist()), cfg
                    ),
                    cfg,
                )
            }
        )

        embeddings_df = get_embeddings(full_clean)
        embeddings = embeddings_df.to_numpy()

        topic_model, topics, probs = load_or_train_bertopic(full_clean, embeddings, cfg)

        # --- метрики ---
        metrics = evaluate_topics(
            topic_model, full_clean["log_text"].tolist(), embeddings
        )

        # --- визуализации ---
        path_sizes = plot_topic_sizes(topics)
        mlflow.log_artifact(path_sizes)

        for tid in set(topics):
            if tid == -1:
                continue
            wc_path = plot_wordcloud(topic_model, tid, name="wordcloud")
            if wc_path:
                mlflow.log_artifact(wc_path)

        # --- логирование ---
        mlflow.log_params({"embedding_model": "paraphrase-multilingual-MiniLM-L12-v2"})
        mlflow.log_metrics(metrics)
        mlflow.log_artifact(CACHE_DIR / "embeddings.parquet")
        mlflow.log_artifact(CACHE_DIR / "bertopic_model")
        logger.info(f"Metrics: {metrics}")


if __name__ == "__main__":
    main()
