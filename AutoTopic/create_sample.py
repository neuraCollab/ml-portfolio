import pandas as pd


def create_sample_data(path: str = "data.csv", frac: float = 0.10, random_state: int = 42) -> pd.DataFrame:
    df = pd.read_csv(path)
    # Ensure text column exists
    if "log_text" not in df.columns:
        raise ValueError("Expected column 'log_text' in data.csv")
    return df.sample(frac=frac, random_state=random_state)


