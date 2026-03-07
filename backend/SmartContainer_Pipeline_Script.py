# %% [markdown]
# # SmartContainer Risk Engine — Full Pipeline
# **PortGuard | Hackathon Demo Notebook**
#
# End-to-end walkthrough from raw CSV → feature engineering → Big Three ensemble.
# Paste into VS Code and run **"Jupyter: Import as Jupyter Notebook"** or
# open directly in VS Code's interactive window (`.py` → `# %%` cells are natively supported).
#
# ---
# | Stage | Method | Zero-Leakage Guarantee |
# |---|---|---|
# | Imputation | Port-group median (train stats only) | ✅ |
# | Discrepancy Features | Log-scaled value/weight ratios | ✅ (row-level) |
# | Behavioural Features | Frequency maps from train only | ✅ |
# | Target Encoding | Additive smoothing + TargetEncoder (fit on train) | ✅ |
# | Anomaly Score | IsolationForest fit on train, normalised by train min/max | ✅ |
# | Ensemble | XGBoost (Optuna) + LightGBM + CatBoost, blend 0.5/0.3/0.2 | ✅ |

# %% [markdown]
# ## Cell 1 — Import Required Libraries

# %%
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

import os
import numpy as np
import pandas as pd
from category_encoders import TargetEncoder

import optuna
optuna.logging.set_verbosity(optuna.logging.WARNING)

from sklearn.ensemble import IsolationForest
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import classification_report, f1_score
from sklearn.utils.class_weight import compute_sample_weight

from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from catboost import CatBoostClassifier

print("All libraries loaded successfully.")

# %% [markdown]
# ## Cell 2 — Constants & Configuration

# %%
# ── Paths ─────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath("__file__"))
TRAIN_PATH = os.path.join(BASE_DIR, "data", "Historical Data.csv")
TEST_PATH  = os.path.join(BASE_DIR, "data", "Real-Time Data.csv")

# ── Target mapping ─────────────────────────────────────────────────────────
TARGET_MAP  = {"Clear": 0, "Low Risk": 1, "Critical": 2}
RISK_LABELS = {0: "Low", 1: "Medium", 2: "Critical"}

# ── Column groups ──────────────────────────────────────────────────────────
NUMERICAL_COLS = [
    "Declared_Value", "Declared_Weight", "Measured_Weight", "Dwell_Time_Hours",
]
CATEGORICAL_COLS = [
    "Trade_Regime (Import / Export / Transit)", "Origin_Country",
    "Destination_Port", "Destination_Country",
    "Importer_ID", "Exporter_ID", "Shipping_Line",
]
RAW_DROP_COLS = [
    "Declaration_Date (YYYY-MM-DD)", "Declaration_Time",
    "HS_Code", "Clearance_Status", "Is_Risky",
    "Destination_Country", "Importer_ID", "HS_Category",
    "Route_ID", "Shipping_Line", "Shipping_Line_Avg_Dwell",
    "Destination_Port",
]

# ── Hyperparameters ────────────────────────────────────────────────────────
SMOOTH_M           = 10          # additive smoothing factor for target encoding
IF_CONTAMINATION   = 0.05        # IsolationForest expected anomaly rate
RANDOM_STATE       = 42
OPTUNA_TRIALS      = 20
CV_FOLDS           = 3
CRITICAL_THRESHOLD = 0.30        # P(class=2) > this → Critical
MEDIUM_THRESHOLD   = 0.40        # P(class=1) > this → Medium
RARE_ROUTE_MIN     = 5           # routes appearing fewer than this → Rare

print("Configuration loaded.")

# %% [markdown]
# ## Cell 3 — Load Historical & Real-Time Data

# %%
train_df = pd.read_csv(TRAIN_PATH)
test_df  = pd.read_csv(TEST_PATH)

print(f"Train shape : {train_df.shape}")
print(f"Test  shape : {test_df.shape}")
print(f"\nTarget distribution (train):")
print(train_df["Clearance_Status"].value_counts())
print(f"\nNull counts (train):")
print(train_df.isnull().sum()[train_df.isnull().sum() > 0])

train_df.head(3)

# %% [markdown]
# ## Cell 4 — Data Cleaning
#
# **Steps:**
# 1. Numerical columns → fill nulls with **port-group median** (stats from train only), fallback to global median.
# 2. Categorical columns → fill nulls with `"UNKNOWN"`.
# 3. Parse `Declaration_Date` → extract `Declaration_DayOfWeek` (0–6).
# 4. Parse `Declaration_Time` → extract `Declaration_Hour` (0–23).

# %%
def _clean(train_df: pd.DataFrame, test_df: pd.DataFrame):
    """Port-group median imputation + date/time parsing.
    All statistics are fitted on train_df only to prevent leakage."""
    train_df, test_df = train_df.copy(), test_df.copy()

    # Numerical: port-group median (train), then global median (train)
    train_port_medians  = train_df.groupby("Destination_Port")[NUMERICAL_COLS].median()
    train_global_medians = train_df[NUMERICAL_COLS].median()
    for df in (train_df, test_df):
        for col in NUMERICAL_COLS:
            if df[col].isna().any():
                port_med = df["Destination_Port"].map(train_port_medians[col])
                df[col] = df[col].fillna(port_med).fillna(train_global_medians[col])

    # Categorical: fill with "UNKNOWN"
    for df in (train_df, test_df):
        for col in CATEGORICAL_COLS:
            if col in df.columns and df[col].isna().any():
                df[col] = df[col].fillna("UNKNOWN")

    # Date features
    for df in (train_df, test_df):
        dt = pd.to_datetime(df["Declaration_Date (YYYY-MM-DD)"], errors="coerce")
        df["Declaration_DayOfWeek"] = dt.dt.dayofweek.fillna(0).astype(int)
        t = pd.to_datetime(df["Declaration_Time"], format="%H:%M:%S", errors="coerce")
        df["Declaration_Hour"] = t.dt.hour.fillna(0).astype(int)

    return train_df, test_df


train_df, test_df = _clean(train_df, test_df)
print("Cleaning done.")
print(f"Remaining nulls (train): {train_df.isnull().sum().sum()}")

# %% [markdown]
# ## Cell 5 — Discrepancy Feature Engineering
#
# Three row-level features that capture **value / weight mis-declaration signals**:
#
# | Feature | Formula | Intuition |
# |---|---|---|
# | `Log_Declared_Value` | $\ln(1 + \text{Declared\_Value})$ | Compresses long-tailed value distribution |
# | `Log_Value_to_Weight_Ratio` | $\ln\!\left(1 + \dfrac{\text{Declared\_Value}}{\text{Measured\_Weight}}\right)$ | Value-per-kg — spikes indicate mis-declaration |
# | `Weight_Diff_Ratio` | $\dfrac{\text{Measured\_Weight} - \text{Declared\_Weight}}{\text{Declared\_Weight} + 1}$ | Signed relative discrepancy between declared and measured weight |

# %%
def _engineer_discrepancy(df: pd.DataFrame) -> pd.DataFrame:
    """Log-scaled value / weight discrepancy features (row-level, no leakage)."""
    df = df.copy()
    df["Log_Declared_Value"] = np.log1p(df["Declared_Value"])

    safe_weight = df["Measured_Weight"].replace(0, np.nan).fillna(1)
    df["Log_Value_to_Weight_Ratio"] = np.log1p(df["Declared_Value"] / safe_weight)

    df["Weight_Diff_Ratio"] = (
        (df["Measured_Weight"] - df["Declared_Weight"])
        / (df["Declared_Weight"] + 1)
    )
    return df


train_df = _engineer_discrepancy(train_df)
test_df  = _engineer_discrepancy(test_df)

print("Discrepancy features created.")
train_df[["Log_Declared_Value", "Log_Value_to_Weight_Ratio", "Weight_Diff_Ratio"]].describe()

# %% [markdown]
# ## 📊 [PLACEHOLDER] Correlation Analysis — Discrepancy Features
#
# > **Insert your correlation / distribution plots here.**
# >
# > Suggested visuals:
# > - Distribution of `Log_Declared_Value` split by `Clearance_Status`
# > - Distribution of `Weight_Diff_Ratio` split by `Clearance_Status`
# > - Correlation heatmap of all three discrepancy features vs numeric target

# %%
# INSERT: Your correlation / distribution plots for discrepancy features here.
pass

# %% [markdown]
# ## Cell 6 — Behavioural & Frequency Features
#
# All frequency maps and average statistics are **fitted on training data only**, preventing leakage.
#
# | Feature | Description |
# |---|---|
# | `Route_ID` | `Origin_Country` + `Destination_Country` concatenation |
# | `HS_Category` | First 2 digits of `HS_Code` (commodity group) |
# | `Importer_Freq_Count` | Number of times this importer appears in training data |
# | `Rare_Route_Flag` | `1` if route appears fewer than 5 times in training data |
# | `Shipping_Line_Avg_Dwell` | Mean dwell time for this shipping line (train-fitted) |
# | `Dwell_Time_Deviation` | `Dwell_Time_Hours / (Shipping_Line_Avg_Dwell + 1)` — relative deviation |

# %%
def _engineer_behavioural(train_df: pd.DataFrame, test_df: pd.DataFrame):
    """Frequency / behavioural features. All lookup maps fitted on train_df."""
    train_df, test_df = train_df.copy(), test_df.copy()

    # Route ID
    for df in (train_df, test_df):
        df["Route_ID"] = (
            df["Origin_Country"].astype(str) + "_" + df["Destination_Country"].astype(str)
        )

    # HS Category (first 2 digits of HS_Code)
    for df in (train_df, test_df):
        df["HS_Category"] = df["HS_Code"].astype(str).str[:2].astype(int, errors="ignore")

    # Importer frequency count (train → both)
    importer_freq           = train_df["Importer_ID"].value_counts()
    global_importer_median  = int(importer_freq.median())
    for df in (train_df, test_df):
        df["Importer_Freq_Count"] = (
            df["Importer_ID"].map(importer_freq).fillna(global_importer_median).astype(int)
        )

    # Rare route flag (routes with < RARE_ROUTE_MIN observations in train)
    route_freq  = train_df["Route_ID"].value_counts()
    rare_routes = set(route_freq[route_freq < RARE_ROUTE_MIN].index)
    for df in (train_df, test_df):
        df["Rare_Route_Flag"] = (
            df["Route_ID"].apply(
                lambda r: 1 if (r in rare_routes or r not in route_freq.index) else 0
            ).astype(int)
        )

    # Shipping line average dwell (train-fitted)
    line_avg_dwell   = train_df.groupby("Shipping_Line")["Dwell_Time_Hours"].mean()
    global_avg_dwell = train_df["Dwell_Time_Hours"].mean()
    for df in (train_df, test_df):
        df["Shipping_Line_Avg_Dwell"] = (
            df["Shipping_Line"].map(line_avg_dwell).fillna(global_avg_dwell)
        )

    # Dwell time deviation (ratio)
    for df in (train_df, test_df):
        df["Dwell_Time_Deviation"] = (
            df["Dwell_Time_Hours"] / (df["Shipping_Line_Avg_Dwell"] + 1)
        )

    return train_df, test_df


train_df, test_df = _engineer_behavioural(train_df, test_df)

print("Behavioural features created.")
beh_cols = ["Importer_Freq_Count", "Rare_Route_Flag", "Shipping_Line_Avg_Dwell", "Dwell_Time_Deviation"]
train_df[beh_cols].describe()

# %% [markdown]
# ## Cell 7 — Smoothed Target Encoding (Importer & HS Category)
#
# For high-cardinality columns we use **additive smoothing** to prevent overfitting on rare categories:
#
# $$\text{encoded}(x) = \frac{n_x \cdot \bar{y}_x + M \cdot \bar{y}_{\text{global}}}{n_x + M}$$
#
# - $n_x$ = count of category $x$ in training data
# - $\bar{y}_x$ = mean risk rate for category $x$
# - $\bar{y}_{\text{global}}$ = overall training risk rate
# - $M = 10$ (smoothing factor — rare categories shrink toward global mean)
#
# **Applied to:** `Importer_ID` → `Importer_Risk_Index` | `HS_Category` → `HS_Risk_Index`

# %%
def _engineer_smoothed_target_encoding(train_df: pd.DataFrame, test_df: pd.DataFrame):
    """Additive-smoothed target encoding for Importer_ID and HS_Category."""
    train_df, test_df = train_df.copy(), test_df.copy()

    train_df["Target"]   = train_df["Clearance_Status"].map(TARGET_MAP)
    train_df["Is_Risky"] = (train_df["Target"] >= 1).astype(int)  # binary risk flag
    global_risk_mean     = train_df["Is_Risky"].mean()

    def _smoothed_encode(group_col: str, feat_name: str):
        stats    = train_df.groupby(group_col)["Is_Risky"].agg(["mean", "count"])
        smoothed = (
            (stats["count"] * stats["mean"] + SMOOTH_M * global_risk_mean)
            / (stats["count"] + SMOOTH_M)
        )
        enc_map = smoothed.to_dict()
        train_df[feat_name] = train_df[group_col].map(enc_map).fillna(global_risk_mean)
        test_df[feat_name]  = test_df[group_col].map(enc_map).fillna(global_risk_mean)

    _smoothed_encode("Importer_ID", "Importer_Risk_Index")
    _smoothed_encode("HS_Category", "HS_Risk_Index")

    print(f"  Importer_Risk_Index — train mean: {train_df['Importer_Risk_Index'].mean():.4f}")
    print(f"  HS_Risk_Index       — train mean: {train_df['HS_Risk_Index'].mean():.4f}")

    return train_df, test_df


train_df, test_df = _engineer_smoothed_target_encoding(train_df, test_df)
print("Smoothed target encoding done.")

# %% [markdown]
# ## Cell 8 — Recovered Features (Trade Regime, Origin Country, Exporter)
#
# | Feature | Method |
# |---|---|
# | `Trade_Regime_*` | One-hot encoding of `Trade_Regime (Import / Export / Transit)` |
# | `Origin_Country_Risk` | TargetEncoder (smoothing=10) on `Origin_Country` against binary risk flag |
# | `Exporter_Risk` | TargetEncoder (smoothing=10) on `Exporter_ID` against binary risk flag |

# %%
def _engineer_recovered_features(train_df: pd.DataFrame, test_df: pd.DataFrame):
    """One-hot Trade_Regime + TargetEncoder for Origin_Country and Exporter_ID."""
    train_df, test_df = train_df.copy(), test_df.copy()
    trade_col = "Trade_Regime (Import / Export / Transit)"
    y_binary  = train_df["Is_Risky"]

    # One-hot encode Trade_Regime (align test columns to train schema)
    trade_train = pd.get_dummies(train_df[[trade_col]], prefix="Trade", dtype=int)
    trade_test  = pd.get_dummies(test_df[[trade_col]],  prefix="Trade", dtype=int)
    trade_test  = trade_test.reindex(columns=trade_train.columns, fill_value=0)
    train_df = pd.concat([train_df, trade_train], axis=1)
    test_df  = pd.concat([test_df,  trade_test],  axis=1)
    print(f"  Trade dummies: {trade_train.columns.tolist()}")

    # TargetEncoder — Origin_Country
    origin_enc = TargetEncoder(cols=["Origin_Country"], smoothing=10)
    train_df["Origin_Country_Risk"] = (
        origin_enc.fit_transform(train_df[["Origin_Country"]], y_binary)["Origin_Country"].values
    )
    test_df["Origin_Country_Risk"] = (
        origin_enc.transform(test_df[["Origin_Country"]])["Origin_Country"].values
    )

    # TargetEncoder — Exporter_ID
    exporter_enc = TargetEncoder(cols=["Exporter_ID"], smoothing=10)
    train_df["Exporter_Risk"] = (
        exporter_enc.fit_transform(train_df[["Exporter_ID"]], y_binary)["Exporter_ID"].values
    )
    test_df["Exporter_Risk"] = (
        exporter_enc.transform(test_df[["Exporter_ID"]])["Exporter_ID"].values
    )

    print(f"  Origin_Country_Risk — train mean: {train_df['Origin_Country_Risk'].mean():.4f}")
    print(f"  Exporter_Risk       — train mean: {train_df['Exporter_Risk'].mean():.4f}")

    return train_df, test_df


train_df, test_df = _engineer_recovered_features(train_df, test_df)
print("Recovered features done.")

# %% [markdown]
# ## 📊 [PLACEHOLDER] Correlation Analysis — Encoded Features
#
# > **Insert your correlation / distribution plots here.**
# >
# > Suggested visuals:
# > - Bar chart of `Importer_Risk_Index` vs `Clearance_Status`
# > - Distribution of `Origin_Country_Risk` split by `Clearance_Status`
# > - Correlation heatmap of all engineered features vs numeric target

# %%
# INSERT: Your correlation / distribution plots for encoded features here.
pass

# %% [markdown]
# ## Cell 9 — Prepare Final Feature Matrix
#
# **Steps:**
# 1. Extract `y_train` and separate row IDs (`Container_ID`).
# 2. Drop all raw/intermediate columns that were used only as inputs.
# 3. Drop `Trade_*` one-hot dummies (near-zero variance after smoothed encoding).
# 4. Align `X_train` and `X_test` to the same column set.

# %%
# Separate IDs and target
train_ids = train_df["Container_ID"].copy()
test_ids  = test_df["Container_ID"].copy()
y_train   = train_df["Target"].copy().reset_index(drop=True)

# Drop raw/intermediate columns
drop_train = [c for c in RAW_DROP_COLS if c in train_df.columns] + ["Container_ID", "Target"]
drop_test  = [c for c in RAW_DROP_COLS if c in test_df.columns]  + ["Container_ID"]

train_df.drop(columns=drop_train, inplace=True, errors="ignore")
test_df.drop(columns=drop_test,   inplace=True, errors="ignore")
test_df.drop(columns=["Target"],  inplace=True, errors="ignore")

# Drop Trade_ dummies (near-zero variance)
trade_cols = [c for c in train_df.columns if c.startswith("Trade_")]
train_df.drop(columns=trade_cols, inplace=True, errors="ignore")
test_df.drop(columns=trade_cols,  inplace=True, errors="ignore")

# Align to common feature set
common_cols = sorted(set(train_df.columns) & set(test_df.columns))
X_train = train_df[common_cols].reset_index(drop=True)
X_test  = test_df[common_cols].reset_index(drop=True)

print(f"X_train : {X_train.shape}")
print(f"X_test  : {X_test.shape}")
print(f"Features ({len(common_cols)}): {common_cols}")
X_train.head(3)

# %% [markdown]
# ## Cell 10 — IsolationForest Anomaly Score Injection
#
# An **IsolationForest** (contamination = 5%) is fitted on the training feature matrix.
# Its raw decision scores are **normalised to 0–100** using training-set min/max,
# then appended as `Anomaly_Score` to both `X_train` and `X_test`.
#
# The fitted `iso`, `iso_rmin`, and `iso_rmax` are saved so production inference
# applies the **same normalisation** without re-fitting.
#
# > Containers scoring close to 100 are structural outliers — atypical on multiple feature dimensions simultaneously.

# %%
iso = IsolationForest(
    contamination=IF_CONTAMINATION,
    random_state=RANDOM_STATE,
    n_jobs=-1,
)
iso.fit(X_train)

raw_tr = -iso.decision_function(X_train)
raw_te = -iso.decision_function(X_test)

iso_rmin = float(raw_tr.min())
iso_rmax = float(raw_tr.max())
_denom   = iso_rmax - iso_rmin if iso_rmax != iso_rmin else 1.0

X_train = X_train.copy()
X_test  = X_test.copy()
X_train["Anomaly_Score"] = np.clip((raw_tr - iso_rmin) / _denom * 100, 0, 100)
X_test["Anomaly_Score"]  = np.clip((raw_te - iso_rmin) / _denom * 100, 0, 100)

print(f"IsolationForest fitted.  iso_rmin={iso_rmin:.4f}  iso_rmax={iso_rmax:.4f}")
print(f"Anomaly_Score — train: mean={X_train['Anomaly_Score'].mean():.2f}  "
      f"max={X_train['Anomaly_Score'].max():.2f}")
print(f"Anomaly_Score — test:  mean={X_test['Anomaly_Score'].mean():.2f}  "
      f"max={X_test['Anomaly_Score'].max():.2f}")
print(f"\nFinal X_train shape: {X_train.shape}  |  X_test shape: {X_test.shape}")

# %% [markdown]
# ## Cell 11 — Compute Class Weights
#
# Class-balanced sample weights are fed to XGBoost so the model penalises
# missing rare (`Critical`) shipments more heavily than misclassifying common (`Clear`) ones.

# %%
sample_weights = compute_sample_weight(class_weight="balanced", y=y_train)
print(f"Sample weights — min: {sample_weights.min():.4f}  "
      f"max: {sample_weights.max():.4f}  "
      f"mean: {sample_weights.mean():.4f}")

# %% [markdown]
# ## Cell 12 — Hyperparameter Optimisation (Optuna × XGBoost)
#
# A **20-trial TPE study** maximises macro-F1 via 3-fold stratified cross-validation.
# `IsolationForest` is re-fitted inside each CV fold to avoid anomaly-score leakage.
#
# Tuned parameters: `max_depth`, `learning_rate`, `subsample`, `colsample_bytree`.

# %%
def _inject_anomaly_cv(Xtr: pd.DataFrame, Xval: pd.DataFrame):
    """Re-fit IsolationForest on fold train split to prevent leakage in CV."""
    iso_cv = IsolationForest(
        contamination=IF_CONTAMINATION, random_state=RANDOM_STATE, n_jobs=-1
    )
    iso_cv.fit(Xtr)
    raw_tr   = -iso_cv.decision_function(Xtr)
    raw_val  = -iso_cv.decision_function(Xval)
    rmin, rmax = raw_tr.min(), raw_tr.max()
    denom    = rmax - rmin if rmax != rmin else 1.0
    Xtr  = Xtr.copy();  Xtr["Anomaly_Score"]  = np.clip((raw_tr  - rmin) / denom * 100, 0, 100)
    Xval = Xval.copy(); Xval["Anomaly_Score"] = np.clip((raw_val - rmin) / denom * 100, 0, 100)
    return Xtr, Xval


def optimise_hyperparams(X_train: pd.DataFrame, y_train: pd.Series, sample_weights):
    """Optuna TPE study — maximises macro-F1 with per-fold anomaly injection."""

    def objective(trial):
        params = {
            "objective":            "multi:softprob",
            "num_class":            3,
            "eval_metric":          "mlogloss",
            "use_label_encoder":    False,
            "tree_method":          "hist",
            "random_state":         RANDOM_STATE,
            "n_estimators":         500,
            "early_stopping_rounds": 30,
            "max_depth":            trial.suggest_int("max_depth", 3, 9),
            "learning_rate":        trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "subsample":            trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree":     trial.suggest_float("colsample_bytree", 0.6, 1.0),
        }
        skf    = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)
        scores = []
        for train_idx, val_idx in skf.split(X_train, y_train):
            Xtr_raw = X_train.iloc[train_idx]
            Xval_raw = X_train.iloc[val_idx]
            ytr, yval = y_train.iloc[train_idx], y_train.iloc[val_idx]
            wtr  = sample_weights[train_idx]
            Xtr, Xval = _inject_anomaly_cv(Xtr_raw, Xval_raw)
            clf = XGBClassifier(**params)
            clf.fit(Xtr, ytr, sample_weight=wtr, eval_set=[(Xval, yval)], verbose=False)
            scores.append(f1_score(yval, clf.predict(Xval), average="macro"))
        return np.mean(scores)

    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=RANDOM_STATE),
    )
    study.optimize(objective, n_trials=OPTUNA_TRIALS, show_progress_bar=True)
    print(f"Best macro-F1 (CV): {study.best_value:.4f}")
    print(f"Best params:        {study.best_params}")
    return study.best_params


best_params = optimise_hyperparams(X_train, y_train, sample_weights)

# %% [markdown]
# ## Cell 13 — Train Big Three Ensemble
#
# | Model | Config | Weight |
# |---|---|---|
# | **XGBoost** | Optuna best params, `n_estimators=800`, cost-sensitive `sample_weight` | **0.5** |
# | **LightGBM** | `n_estimators=800`, `class_weight="balanced"` | **0.3** |
# | **CatBoost** | `iterations=800`, `auto_class_weights="Balanced"` | **0.2** |
#
# Ensemble probability: $P = 0.5 \cdot P_{\text{XGB}} + 0.3 \cdot P_{\text{LGB}} + 0.2 \cdot P_{\text{CAT}}$

# %%
# ── XGBoost (Optuna-tuned) ────────────────────────────────────────────────
xgb_model = XGBClassifier(
    objective="multi:softprob",
    num_class=3,
    eval_metric="mlogloss",
    use_label_encoder=False,
    tree_method="hist",
    random_state=RANDOM_STATE,
    n_estimators=800,
    **best_params,
)
xgb_model.fit(X_train, y_train, sample_weight=sample_weights, verbose=False)
print(f"XGBoost  trained — {X_train.shape}")

# ── LightGBM ──────────────────────────────────────────────────────────────
lgb_model = LGBMClassifier(
    n_estimators=800,
    num_class=3,
    class_weight="balanced",
    random_state=RANDOM_STATE,
    verbose=-1,
)
lgb_model.fit(X_train, y_train)
print("LightGBM trained")

# ── CatBoost ──────────────────────────────────────────────────────────────
cat_model = CatBoostClassifier(
    iterations=800,
    auto_class_weights="Balanced",
    random_seed=RANDOM_STATE,
    verbose=False,
)
cat_model.fit(X_train, y_train)
print("CatBoost trained")

# %% [markdown]
# ## Cell 14 — Ensemble Inference with Custom Thresholds
#
# Thresholds are applied to **blended probabilities**, not argmax, giving finer control over recall on the `Critical` class:
#
# | Rule | Label |
# |---|---|
# | $P(\text{Critical}) > 0.30$ | → `Critical` (class 2) |
# | $P(\text{Medium}) > 0.40$ and not Critical | → `Medium` (class 1) |
# | Otherwise | → `Low` (class 0) |
#
# **Continuous Risk Score (0–100):** Rank-based percentile within each tier so scores are uniformly distributed:
# - Low → 0–33 | Medium → 34–66 | Critical → 67–100

# %%
# Blend probabilities
xgb_proba = xgb_model.predict_proba(X_test)
lgb_proba = lgb_model.predict_proba(X_test)
cat_proba = cat_model.predict_proba(X_test)
proba = (0.5 * xgb_proba) + (0.3 * lgb_proba) + (0.2 * cat_proba)

# Custom threshold classification
predictions   = np.zeros(len(X_test), dtype=int)
critical_mask = proba[:, 2] > CRITICAL_THRESHOLD
medium_mask   = (~critical_mask) & (proba[:, 1] > MEDIUM_THRESHOLD)
predictions[critical_mask] = 2
predictions[medium_mask]   = 1

# Rank-based risk score (uniform spread within each tier)
raw_score = (proba[:, 1] * 50) + (proba[:, 2] * 100)
TIERS     = {0: (0.0, 33.0), 1: (34.0, 66.0), 2: (67.0, 100.0)}
risk_scores = np.empty(len(predictions), dtype=float)
for cls, (lo, hi) in TIERS.items():
    mask = predictions == cls
    if not mask.any():
        continue
    vals = raw_score[mask]
    n    = mask.sum()
    risk_scores[mask] = (lo + hi) / 2 if n == 1 else (
        lo + vals.argsort().argsort() / (n - 1) * (hi - lo)
    )

print(f"Predictions — Low: {(predictions==0).sum()}  "
      f"Medium: {(predictions==1).sum()}  "
      f"Critical: {(predictions==2).sum()}")

# Classification report on test set (labels are not available but shown for train CV context)
print("\nClassification report on X_train (sanity check):")
train_preds = np.argmax(
    (0.5 * xgb_model.predict_proba(X_train))
    + (0.3 * lgb_model.predict_proba(X_train))
    + (0.2 * cat_model.predict_proba(X_train)),
    axis=1,
)
print(classification_report(y_train, train_preds, target_names=["Low", "Medium", "Critical"]))

# %% [markdown]
# ## Cell 15 — Ensemble Feature Importance
#
# Normalised feature importances from all three models are averaged using the
# same blend weights (0.5 / 0.3 / 0.2) to produce a single ranked importance table.

# %%
feature_names = X_train.columns.tolist()

# Extract and normalise each model's importances
xgb_imp = xgb_model.feature_importances_
lgb_imp = lgb_model.feature_importances_
cat_imp = cat_model.feature_importances_

def _normed(arr):
    s = arr.sum()
    return arr / s if s > 0 else arr

xgb_norm = _normed(xgb_imp)
lgb_norm = _normed(lgb_imp)
cat_norm = _normed(cat_imp)

# Blended average
blended_imp = (0.5 * xgb_norm) + (0.3 * lgb_norm) + (0.2 * cat_norm)

importance_df = pd.DataFrame({
    "Feature":         feature_names,
    "XGBoost":         xgb_norm,
    "LightGBM":        lgb_norm,
    "CatBoost":        cat_norm,
    "Blended (0.5/0.3/0.2)": blended_imp,
}).sort_values("Blended (0.5/0.3/0.2)", ascending=False).reset_index(drop=True)

print("Ensemble Feature Importance (top features first):")
importance_df

# %% [markdown]
# ## 📊 [PLACEHOLDER] Feature Importance Chart
#
# > **Insert your feature importance bar chart here.**
# >
# > Suggested: horizontal bar chart of `Blended (0.5/0.3/0.2)` from `importance_df`

# %%
# INSERT: Your feature importance visualisation here.
pass

# %% [markdown]
# ## Cell 16 — Export Predictions

# %%
# Build output DataFrame
output_df = pd.DataFrame({
    "Container_ID":    test_ids.reset_index(drop=True),
    "Risk_Label":      pd.Series(predictions).map(RISK_LABELS),
    "Risk_Score":      np.round(risk_scores, 2),
    "P_Low":           np.round(proba[:, 0], 4),
    "P_Medium":        np.round(proba[:, 1], 4),
    "P_Critical":      np.round(proba[:, 2], 4),
    "Anomaly_Score":   np.round(X_test["Anomaly_Score"].values, 2),
})

print(output_df["Risk_Label"].value_counts())
print(f"\nRisk Score — mean: {output_df['Risk_Score'].mean():.2f}  "
      f"max: {output_df['Risk_Score'].max():.2f}")

output_df.head(10)
