"""
SmartContainer Risk Engine — Data Loading
==========================================
Reads raw CSVs from the data/ directory.
"""

import pandas as pd

from src.config import TRAIN_PATH, TEST_PATH


def load_raw_data():
    """Read raw CSVs and return train / test DataFrames."""
    train_df = pd.read_csv(TRAIN_PATH)
    test_df = pd.read_csv(TEST_PATH)
    print(f"[Load] Train: {train_df.shape}  Test: {test_df.shape}")
    return train_df, test_df
