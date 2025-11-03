from pathlib import Path
import pandas as pd
from loguru import logger

CACHE_DIR = Path("cache")
CACHE_DIR.mkdir(exist_ok=True)

def cache_stage(df: pd.DataFrame, name: str) -> pd.DataFrame:
    path = CACHE_DIR / f"{name}.parquet"
    df.to_parquet(path, index=False)
    logger.info(f"Saved {name} → {path}")
    return df

def load_or_run(stage_name: str, fn, *args, **kwargs):
    path = CACHE_DIR / f"{stage_name}.parquet"
    if path.exists():
        logger.info(f"Loaded cache {path}")
        return pd.read_parquet(path)
    df = fn(*args, **kwargs)
    return cache_stage(df, stage_name)
