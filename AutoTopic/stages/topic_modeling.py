from bertopic import BERTopic
from umap import UMAP
import hdbscan
from pipeline.cache import CACHE_DIR
from loguru import logger
from sklearn.feature_extraction.text import CountVectorizer

def _build_vectorizer(cfg):
    vec_cfg = cfg["topic_modeling"].get("vectorizer", {})
    ngram = tuple(cfg["topic_modeling"]["n_gram_range"])
    lang_mode = cfg["topic_modeling"].get("language_mode", "ru_only")

    if lang_mode == "mixed":
        token_pattern = r"(?u)\b(?:[а-яёА-ЯЁ]{3,}|[a-zA-Z]{3,})\b"
    else:  # ru_only
        token_pattern = r"(?u)\b[а-яёА-ЯЁ]{3,}\b"

    return CountVectorizer(
        ngram_range=ngram,
        min_df=vec_cfg.get("min_df", 5),
        max_df=vec_cfg.get("max_df", 0.9),
        lowercase=True,
        analyzer="word",
        token_pattern=token_pattern,
    )


def train_bertopic(df, embeddings, cfg):
    """Обучает BERTopic и сохраняет модель."""
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
        nr_topics=cfg["topic_modeling"].get("nr_topics", 75),
        vectorizer_model=_build_vectorizer(cfg),
        top_n_words=cfg["topic_modeling"].get("top_n_words", 10),
        umap_model=umap_model,
        hdbscan_model=hdbscan_model,
        verbose=True,
    )
    topic_model.fit(df["log_text"].tolist(), embeddings)
    topic_model.save(str(CACHE_DIR / "bertopic_model"))
    logger.info(f"BertTopic saved at: {str(CACHE_DIR / 'bertopic_model')}")

    return topic_model

def load_or_train_bertopic(df, embeddings, cfg):
    """Загружает модель, если есть, иначе обучает."""
    model_path = CACHE_DIR / "bertopic_model"
    try:
        topic_model = BERTopic.load(model_path)
        logger.info(f"Loaded cache {model_path}")
        topics, probs = topic_model.transform(df["log_text"].tolist(), embeddings)
    except Exception:
        topic_model = train_bertopic(df, embeddings, cfg)
        topics, probs = topic_model.transform(df["log_text"].tolist(), embeddings)
    return topic_model, topics, probs


def run_topic_modeling(texts, embeddings, cfg):
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
        prediction_data=True
    )

    topic_model = BERTopic(
        n_gram_range=tuple(cfg["topic_modeling"]["n_gram_range"]),
        min_topic_size=cfg["topic_modeling"]["min_topic_size"],
        embedding_model=None,
        nr_topics=cfg["topic_modeling"].get("nr_topics", 50),
        umap_model=umap_model,
        hdbscan_model=hdbscan_model,
        vectorizer_model=_build_vectorizer(cfg),
        top_n_words=cfg["topic_modeling"].get("top_n_words", 10),
    )
    topics, probs = topic_model.fit_transform(texts, embeddings)
    return topic_model, topics, probs
