"""
SmartContainer Risk Engine — Unified Feature Engineering
=========================================================
Merges smart_container_pipeline.py and recover_features.py into a single
in-memory pipeline.  Goes from raw DataFrames → X_train, X_test, y_train,
train_ids, test_ids with zero intermediate CSV I/O.
"""

import numpy as np
import pandas as pd
from category_encoders import TargetEncoder

from src.config import (
    TARGET_MAP, NUMERICAL_COLS, CATEGORICAL_COLS, RAW_DROP_COLS, SMOOTH_M,
)


# ═══════════════════════════════════════════════════════════════════════════
#  CLEANING  (mutates in-place for memory efficiency)
# ═══════════════════════════════════════════════════════════════════════════
def _clean(train_df, test_df):
    """Impute, parse dates / times.  Stats fitted on train only."""

    # ── Numerical imputation: Destination_Port group median (train) ───────
    train_port_medians = train_df.groupby("Destination_Port")[NUMERICAL_COLS].median()
    train_global_medians = train_df[NUMERICAL_COLS].median()

    for df in (train_df, test_df):
        for col in NUMERICAL_COLS:
            if df[col].isna().any():
                port_med = df["Destination_Port"].map(train_port_medians[col])
                df[col] = df[col].fillna(port_med).fillna(train_global_medians[col])

    # ── Categorical imputation ────────────────────────────────────────────
    for df in (train_df, test_df):
        for col in CATEGORICAL_COLS:
            if df[col].isna().any():
                df[col] = df[col].fillna("UNKNOWN")

    # ── Date / time conversion ────────────────────────────────────────────
    for df in (train_df, test_df):
        df["Declaration_Date (YYYY-MM-DD)"] = pd.to_datetime(
            df["Declaration_Date (YYYY-MM-DD)"], errors="coerce"
        )
        df["Declaration_DayOfWeek"] = df["Declaration_Date (YYYY-MM-DD)"].dt.dayofweek
        time_parsed = pd.to_datetime(
            df["Declaration_Time"], format="%H:%M:%S", errors="coerce"
        )
        df["Declaration_Hour"] = time_parsed.dt.hour

    return train_df, test_df


# ═══════════════════════════════════════════════════════════════════════════
#  DISCREPANCY & VARIANCE (log-scaled, row-level)
# ═══════════════════════════════════════════════════════════════════════════
def _engineer_discrepancy(df):
    """Create log-scaled value / weight discrepancy features."""
    df["Log_Declared_Value"] = np.log1p(df["Declared_Value"])

    safe_weight = df["Measured_Weight"].replace(0, np.nan).fillna(1)
    df["Log_Value_to_Weight_Ratio"] = np.log1p(df["Declared_Value"] / safe_weight)

    df["Weight_Diff_Ratio"] = (
        (df["Measured_Weight"] - df["Declared_Weight"]) / (df["Declared_Weight"] + 1)
    )
    return df


# ═══════════════════════════════════════════════════════════════════════════
#  BEHAVIOURAL & FREQUENCY  (fit on train, map both)
# ═══════════════════════════════════════════════════════════════════════════
def _engineer_behavioural(train_df, test_df):
    """Route, HS category, importer frequency, rare-route flag,
    shipping-line average dwell and dwell deviation."""

    # Route_ID
    for df in (train_df, test_df):
        df["Route_ID"] = df["Origin_Country"].str.cat(
            df["Destination_Country"], sep="_"
        )

    # HS_Category (first 2 digits of HS_Code)
    for df in (train_df, test_df):
        df["HS_Category"] = (df["HS_Code"].astype(str).str[:2]).astype(int)

    # Importer_Freq_Count (train counts → both)
    importer_freq = train_df["Importer_ID"].value_counts()
    global_importer_median = int(importer_freq.median())
    for df in (train_df, test_df):
        df["Importer_Freq_Count"] = (
            df["Importer_ID"]
            .map(importer_freq)
            .fillna(global_importer_median)
            .astype(int)
        )

    # Rare_Route_Flag (route freq < 5 in train)
    route_freq = train_df["Route_ID"].value_counts()
    rare_routes = set(route_freq[route_freq < 5].index)
    for df in (train_df, test_df):
        df["Rare_Route_Flag"] = df["Route_ID"].apply(
            lambda r: 1 if (r in rare_routes or r not in route_freq.index) else 0
        ).astype(np.int8)

    # Shipping_Line_Avg_Dwell (train mean → both)
    line_avg_dwell = train_df.groupby("Shipping_Line")["Dwell_Time_Hours"].mean()
    global_avg_dwell = train_df["Dwell_Time_Hours"].mean()
    for df in (train_df, test_df):
        df["Shipping_Line_Avg_Dwell"] = (
            df["Shipping_Line"].map(line_avg_dwell).fillna(global_avg_dwell)
        )

    # Dwell_Time_Deviation
    for df in (train_df, test_df):
        df["Dwell_Time_Deviation"] = (
            df["Dwell_Time_Hours"] / (df["Shipping_Line_Avg_Dwell"] + 1)
        )

    return train_df, test_df


# ═══════════════════════════════════════════════════════════════════════════
#  CUSTOM SMOOTHED TARGET ENCODING  (Importer_Risk_Index, HS_Risk_Index)
# ═══════════════════════════════════════════════════════════════════════════
def _engineer_smoothed_target_encoding(train_df, test_df):
    """Additive-smoothed encoding of Is_Risky by Importer_ID and HS_Category.
    Formula: (count * group_mean + m * global_mean) / (count + m)
    """
    # Multi-class target & binary risk flag
    train_df["Target"] = train_df["Clearance_Status"].map(TARGET_MAP)
    train_df["Is_Risky"] = (train_df["Target"] >= 1).astype(np.int8)

    global_risk_mean = train_df["Is_Risky"].mean()

    def _smoothed(group_col, feat_name):
        stats = train_df.groupby(group_col)["Is_Risky"].agg(["mean", "count"])
        smoothed = (
            (stats["count"] * stats["mean"] + SMOOTH_M * global_risk_mean)
            / (stats["count"] + SMOOTH_M)
        )
        for df in (train_df, test_df):
            df[feat_name] = df[group_col].map(smoothed).fillna(global_risk_mean)

    _smoothed("Importer_ID", "Importer_Risk_Index")
    _smoothed("HS_Category", "HS_Risk_Index")

    return train_df, test_df


# ═══════════════════════════════════════════════════════════════════════════
#  RECOVERED FEATURES  (Trade_Regime one-hot, Origin & Exporter target enc)
# ═══════════════════════════════════════════════════════════════════════════
def _engineer_recovered_features(train_df, test_df):
    """One-Hot encode Trade_Regime; TargetEncode Origin_Country & Exporter_ID.
    Uses binary Is_Risky for consistency with the smoothed encoding above."""

    trade_col = "Trade_Regime (Import / Export / Transit)"
    y_binary = train_df["Is_Risky"]           # already 0/1 from previous step

    # ── One-Hot Encode Trade Regime ───────────────────────────────────────
    trade_train = pd.get_dummies(
        train_df[[trade_col]], prefix="Trade", dtype=np.int8
    )
    trade_test = pd.get_dummies(
        test_df[[trade_col]], prefix="Trade", dtype=np.int8
    )
    trade_test = trade_test.reindex(columns=trade_train.columns, fill_value=0)

    train_df = pd.concat([train_df, trade_train], axis=1)
    test_df = pd.concat([test_df, trade_test], axis=1)

    print(f"  Trade Regime dummies: {trade_train.columns.tolist()}")

    # ── TargetEncode Origin_Country ───────────────────────────────────────
    origin_enc = TargetEncoder(cols=["Origin_Country"], smoothing=10)
    origin_train = origin_enc.fit_transform(
        train_df[["Origin_Country"]], y_binary
    ).rename(columns={"Origin_Country": "Origin_Country_Risk"})
    origin_test = origin_enc.transform(
        test_df[["Origin_Country"]]
    ).rename(columns={"Origin_Country": "Origin_Country_Risk"})

    train_df["Origin_Country_Risk"] = origin_train["Origin_Country_Risk"].values
    test_df["Origin_Country_Risk"] = origin_test["Origin_Country_Risk"].values

    # ── TargetEncode Exporter_ID ──────────────────────────────────────────
    exporter_enc = TargetEncoder(cols=["Exporter_ID"], smoothing=10)
    exporter_train = exporter_enc.fit_transform(
        train_df[["Exporter_ID"]], y_binary
    ).rename(columns={"Exporter_ID": "Exporter_Risk"})
    exporter_test = exporter_enc.transform(
        test_df[["Exporter_ID"]]
    ).rename(columns={"Exporter_ID": "Exporter_Risk"})

    train_df["Exporter_Risk"] = exporter_train["Exporter_Risk"].values
    test_df["Exporter_Risk"] = exporter_test["Exporter_Risk"].values

    print(f"  Origin_Country_Risk — train mean: "
          f"{train_df['Origin_Country_Risk'].mean():.4f}")
    print(f"  Exporter_Risk       — train mean: "
          f"{train_df['Exporter_Risk'].mean():.4f}")

    # ── Drop the raw categorical columns (encoding is done) ──────────────
    for df in (train_df, test_df):
        df.drop(
            columns=[trade_col, "Origin_Country", "Exporter_ID"],
            inplace=True,
        )

    return train_df, test_df


# ═══════════════════════════════════════════════════════════════════════════
#  PUBLIC API — Unified Pipeline
# ═══════════════════════════════════════════════════════════════════════════
def preprocess_and_engineer(train_df, test_df):
    """
    End-to-end preprocessing pipeline.
    Returns X_train, X_test, y_train, train_ids, test_ids.
    Entirely in-memory — no intermediate CSV I/O.
    """
    print("[Features] Cleaning...")
    train_df, test_df = _clean(train_df, test_df)

    print("[Features] Discrepancy features...")
    train_df = _engineer_discrepancy(train_df)
    test_df = _engineer_discrepancy(test_df)

    print("[Features] Behavioural features...")
    train_df, test_df = _engineer_behavioural(train_df, test_df)

    print("[Features] Smoothed target encoding (Importer, HS)...")
    train_df, test_df = _engineer_smoothed_target_encoding(train_df, test_df)

    print("[Features] Recovered features (Trade, Origin, Exporter)...")
    train_df, test_df = _engineer_recovered_features(train_df, test_df)

    # ── Separate IDs and target ───────────────────────────────────────────
    train_ids = train_df["Container_ID"].copy()
    test_ids = test_df["Container_ID"].copy()
    y_train = train_df["Target"].copy()

    # ── Drop raw / intermediate columns ───────────────────────────────────
    cols_to_drop = [c for c in RAW_DROP_COLS if c in train_df.columns]
    train_df.drop(columns=cols_to_drop + ["Container_ID", "Target"], inplace=True)

    test_cols_to_drop = [c for c in RAW_DROP_COLS if c in test_df.columns]
    test_df.drop(
        columns=test_cols_to_drop + ["Container_ID"],
        inplace=True, errors="ignore",
    )
    test_df.drop(columns=["Target"], inplace=True, errors="ignore")

    # ── Ensure identical column sets ──────────────────────────────────────
    common_cols = sorted(set(train_df.columns) & set(test_df.columns))
    X_train = train_df[common_cols].copy()
    X_test = test_df[common_cols].copy()

    print(f"[Features] Done — X_train {X_train.shape}  X_test {X_test.shape}")
    print(f"           Columns: {X_train.columns.tolist()}")

    return X_train, X_test, y_train, train_ids, test_ids
