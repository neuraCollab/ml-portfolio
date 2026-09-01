"""Pure sampling logic for ingesting a subset of AutoTopic's real
labeled_requests.parquet into Cassandra (see cassandra_grpc_service.py for
the Cassandra I/O side). Kept separate and I/O-free so it's unit-testable
against a small synthetic DataFrame instead of the real 118MB file.
"""
import pandas as pd


def stratified_sample(
    df: pd.DataFrame, sample_size: int, seed: int = 42, label_column: str = "topic_id"
) -> pd.DataFrame:
    """Proportionally samples up to sample_size rows from df stratified by
    label_column, then assigns a 90/10 train/test split within each
    resulting class (every class with 2+ rows gets at least one test row).
    """
    if sample_size >= len(df):
        sampled = df.copy()
    else:
        frac = sample_size / len(df)
        # Manually group and sample to preserve the groupby column
        groups = []
        for name, group in df.groupby(label_column, sort=False):
            if len(group) > 1:
                sampled_group = group.sample(frac=frac, random_state=seed)
            else:
                sampled_group = group
            groups.append(sampled_group)
        sampled = pd.concat(groups, ignore_index=True)

        if len(sampled) > sample_size:
            sampled = sampled.sample(n=sample_size, random_state=seed)

    def _assign_split(group: pd.DataFrame) -> pd.DataFrame:
        shuffled = group.sample(frac=1.0, random_state=seed)
        n_test = max(1, int(len(shuffled) * 0.1)) if len(shuffled) > 1 else 0
        split = ["test"] * n_test + ["train"] * (len(shuffled) - n_test)
        return shuffled.assign(split=split)

    # Manually apply split assignment to preserve groupby column
    groups = []
    for name, group in sampled.groupby(label_column, sort=False):
        groups.append(_assign_split(group))
    sampled = pd.concat(groups, ignore_index=True)
    return sampled
