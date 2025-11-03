import io
import json
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pandas as pd
import streamlit as st

from create_sample import create_sample_data
from pipeline.optuna_tune import optimize_hyperparams_on_df
from pipeline.viz import plot_topic_sizes
from pipeline.metrics import evaluate_topics
from stages.cleaning import clean_texts
from stages.normalization import normalize_texts
from stages.filtering import filter_texts
from stages.embedding import get_embeddings
from stages.topic_modeling import run_topic_modeling


@dataclass
class UiState:
    model_name: str
    use_optuna: bool
    nr_topics: Optional[int]
    min_topic_size: int
    umap_n_neighbors: int
    umap_min_dist: float
    top_n_words: int
    n_gram_range: tuple[int, int]
    vec_min_df: int
    vec_max_df: float
    device: str


def infer_device() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def sidebar_controls() -> UiState:
    st.sidebar.header("Settings")
    model_name = st.sidebar.selectbox("Model", ["BERTopic", "LDA", "NIP (API)"])
    use_optuna = st.sidebar.checkbox("Use Optuna", value=False)
    nr_topics = st.sidebar.number_input("nr_topics (max)", min_value=5, max_value=500, value=60, step=5)
    min_topic_size = st.sidebar.slider("min_topic_size", 5, 200, 15, step=5)
    umap_n_neighbors = st.sidebar.slider("umap_n_neighbors", 5, 100, 40, step=1)
    umap_min_dist = st.sidebar.slider("umap_min_dist", 0.0, 0.99, 0.56, step=0.01)
    top_n_words = st.sidebar.slider("top_n_words", 5, 30, 12, step=1)
    ngram_max = st.sidebar.selectbox("n_gram max", [1, 2])
    vec_min_df = st.sidebar.number_input("vectorizer.min_df", min_value=1, max_value=100, value=3)
    vec_max_df = st.sidebar.slider("vectorizer.max_df", 0.5, 0.99, 0.89, step=0.01)
    device = st.sidebar.selectbox("Device", [infer_device(), "cpu", "cuda"])
    return UiState(
        model_name=model_name,
        use_optuna=use_optuna,
        nr_topics=int(nr_topics),
        min_topic_size=int(min_topic_size),
        umap_n_neighbors=int(umap_n_neighbors),
        umap_min_dist=float(umap_min_dist),
        top_n_words=int(top_n_words),
        n_gram_range=(1, int(ngram_max)),
        vec_min_df=int(vec_min_df),
        vec_max_df=float(vec_max_df),
        device=device,
    )


def preprocess_column(df: pd.DataFrame, text_col: str, cfg: Dict[str, Any]) -> pd.DataFrame:
    return pd.DataFrame({
        text_col: filter_texts(
            normalize_texts(
                clean_texts(df[text_col].astype(str).tolist()),
                cfg
            ),
            cfg
        )
    })


def build_cfg_from_state(state: UiState) -> Dict[str, Any]:
    return {
        "topic_modeling": {
            "n_gram_range": list(state.n_gram_range),
            "min_topic_size": state.min_topic_size,
            "umap_n_neighbors": state.umap_n_neighbors,
            "umap_min_dist": state.umap_min_dist,
            "hdbscan_min_cluster_size": state.min_topic_size,
            "nr_topics": state.nr_topics,
            "top_n_words": state.top_n_words,
            "vectorizer": {"min_df": state.vec_min_df, "max_df": state.vec_max_df},
            "random_state": 42,
        },
        "embedding": {
            "model": "paraphrase-multilingual-MiniLM-L12-v2",
            "batch_size": 32,
            "device": state.device,
        },
        "normalization": {"language": "ru", "lemmatize": True},
        "filtering": {"min_length": 5, "drop_links": True},
    }


def run_bertopic(df: pd.DataFrame, text_col: str, cfg: Dict[str, Any]):
    # Clean
    clean_df = preprocess_column(df, text_col, cfg)
    # Compute embeddings directly to match current texts length
    from sentence_transformers import SentenceTransformer
    st_model = SentenceTransformer(cfg["embedding"]["model"], device=cfg["embedding"]["device"])
    embs = st_model.encode(
        clean_df[text_col].tolist(),
        batch_size=cfg["embedding"]["batch_size"],
        show_progress_bar=False,
    )
    # Run model
    model, topics, probs = run_topic_modeling(clean_df[text_col].tolist(), embs, cfg)
    return model, topics, probs, clean_df


def run_lda(df: pd.DataFrame, text_col: str, n_topics: int = 20):
    from gensim.corpora import Dictionary
    from gensim.models.ldamodel import LdaModel

    texts = [row.split() for row in df[text_col].astype(str).tolist()]
    dictionary = Dictionary(texts)
    corpus = [dictionary.doc2bow(t) for t in texts]
    lda = LdaModel(corpus=corpus, id2word=dictionary, num_topics=n_topics, random_state=42)
    topics = [max(lda[corpus[i]], key=lambda x: x[1])[0] if lda[corpus[i]] else -1 for i in range(len(corpus))]
    return lda, topics, None, dictionary, corpus


def run_nip_api(df: pd.DataFrame, text_col: str, params: Dict[str, Any]):
    # Placeholder for external API integration
    # Expected to return topics and per-topic keywords
    raise NotImplementedError("NIP API integration not implemented. Provide endpoint and auth.")


def export_report(topics: List[int], model_keywords: Dict[int, List[str]], examples: Dict[int, List[str]]) -> bytes:
    report = {
        "n_topics": len({t for t in topics if t != -1}),
        "topics": [
            {
                "topic_id": int(tid),
                "keywords": model_keywords.get(tid, []),
                "examples": examples.get(tid, [])[:5],
            }
            for tid in sorted({t for t in topics if t != -1})
        ],
    }
    return json.dumps(report, ensure_ascii=False, indent=2).encode("utf-8")


def main():
    st.set_page_config(page_title="Topic Modeling Lab", layout="wide")
    st.title("Topic Modeling Lab")

    state = sidebar_controls()
    text_col = st.text_input("Text column name", value="log_text")
    uploaded = st.file_uploader("Upload CSV", type=["csv"])

    if uploaded is None:
        st.info("Upload a CSV file with a text column.")
        return

    df = pd.read_csv(uploaded)
    if text_col not in df.columns:
        st.error(f"Column '{text_col}' not found in CSV")
        return

    cfg = build_cfg_from_state(state)

    if st.button("Run"):
        with st.spinner("Running topic modeling..."):
            if state.model_name == "BERTopic":
                if state.use_optuna:
                    sample_df = df.sample(frac=0.10, random_state=42)
                    best_params = optimize_hyperparams_on_df(sample_df, cfg, n_trials=20)
                    tm = cfg.setdefault("topic_modeling", {})
                    tm.update({
                        "min_topic_size": best_params.get("min_topic_size", tm["min_topic_size"]),
                        "hdbscan_min_cluster_size": best_params.get("min_topic_size", tm["min_topic_size"]),
                        "nr_topics": best_params.get("nr_topics", tm["nr_topics"]),
                        "top_n_words": best_params.get("top_n_words", tm["top_n_words"]),
                        "umap_n_neighbors": best_params.get("umap_n_neighbors", tm["umap_n_neighbors"]),
                        "umap_min_dist": best_params.get("umap_min_dist", tm["umap_min_dist"]),
                        "n_gram_range": list(best_params.get("n_gram_range", tuple(tm["n_gram_range"]))),
                    })
                    vec = tm.setdefault("vectorizer", {})
                    vec["min_df"] = best_params.get("min_df", vec.get("min_df", cfg["topic_modeling"]["vectorizer"]["min_df"]))
                    vec["max_df"] = best_params.get("max_df", vec.get("max_df", cfg["topic_modeling"]["vectorizer"]["max_df"]))

                model, topics, probs, clean_df = run_bertopic(df, text_col, cfg)
                keywords = {tid: [w for w, _ in (model.get_topic(tid) or [])] for tid in set(topics) if tid != -1}
                examples = {}
                for tid in set(topics):
                    if tid == -1:
                        continue
                    idxs = [i for i, t in enumerate(topics) if t == tid][:5]
                    examples[tid] = [clean_df.iloc[i][text_col] for i in idxs]

                st.subheader("Metrics")
                metrics = evaluate_topics(model, clean_df[text_col].tolist())
                st.json(metrics)

                st.subheader("Visualizations")
                sizes_path = plot_topic_sizes(topics, name="topic_sizes_ui.png")
                st.image(str(sizes_path))

                st.subheader("Report")
                report_bytes = export_report(topics, keywords, examples)
                st.download_button("Download JSON report", data=report_bytes, file_name="report.json")

            elif state.model_name == "LDA":
                clean_df = preprocess_column(df, text_col, cfg)
                lda, topics, _, dictionary, corpus = run_lda(clean_df, text_col, n_topics=state.nr_topics)
                keywords = {}
                for tid in range(state.nr_topics):
                    keywords[tid] = [w for w, _ in lda.show_topic(tid, topn=state.top_n_words)]
                examples = {}
                for tid in set(topics):
                    if tid == -1:
                        continue
                    idxs = [i for i, t in enumerate(topics) if t == tid][:5]
                    examples[tid] = [clean_df.iloc[i][text_col] for i in idxs]

                st.subheader("Report")
                report_bytes = export_report(topics, keywords, examples)
                st.download_button("Download JSON report", data=report_bytes, file_name="report.json")

            else:  # NIP (API)
                st.warning("NIP API is not configured. Provide endpoint and auth to enable.")


if __name__ == "__main__":
    main()


