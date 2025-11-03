import pandas as pd
from sentence_transformers import SentenceTransformer
from pipeline.cache import load_or_run

def get_embeddings(texts, cfg):
    model = SentenceTransformer(cfg["embedding"]["model"], device=cfg["embedding"]["device"])
    return model.encode(texts, batch_size=cfg["embedding"]["batch_size"], show_progress_bar=True)

def compute_embeddings(df: pd.DataFrame) -> pd.DataFrame:
    """Считает эмбеддинги для текстов."""
    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    arr = model.encode(df["log_text"].tolist(), show_progress_bar=True)
    return pd.DataFrame(arr)

def get_embeddings(clean_df: pd.DataFrame) -> pd.DataFrame:
    """Загружает эмбеддинги из кэша или пересчитывает."""
    return load_or_run("embeddings", compute_embeddings, clean_df)
