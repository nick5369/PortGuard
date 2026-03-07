"""
SmartContainer Risk Engine — Evaluation Report Generator
=========================================================
Standalone script.  Does NOT start the FastAPI server.
Loads saved .pkl models, runs inference on both train and test sets,
and writes a formatted evaluation_report.txt.

Usage (from PortGuard/backend/):
    python generate_eval_report.py
"""

import os
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.metrics import (
    f1_score, recall_score, confusion_matrix, classification_report,
)

from src.config import (
    TRAIN_PATH, TEST_PATH, TARGET_MAP,
    CRITICAL_THRESHOLD, MEDIUM_THRESHOLD,
)
from src.features import preprocess_and_engineer
from src.model import prepare_features

# ── Paths ─────────────────────────────────────────────────────────────────
BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
SAVED_MODELS   = os.path.join(BASE_DIR, "saved_models")
REPORT_PATH    = os.path.join(BASE_DIR, "evaluation_report.txt")
TARGET_NAMES   = ["Low (0)", "Medium (1)", "Critical (2)"]


# ── Helpers ────────────────────────────────────────────────────────────────
def _apply_thresholds(proba: np.ndarray) -> np.ndarray:
    """Apply custom critical/medium probability thresholds."""
    preds = np.zeros(len(proba), dtype=int)
    preds[proba[:, 2] > CRITICAL_THRESHOLD] = 2
    medium_mask = (preds != 2) & (proba[:, 1] > MEDIUM_THRESHOLD)
    preds[medium_mask] = 1
    return preds


def _blend(xgb_p, lgb_p, cat_p) -> np.ndarray:
    """Weighted ensemble: 0.5 XGB + 0.3 LGB + 0.2 CAT."""
    return (0.5 * xgb_p) + (0.3 * lgb_p) + (0.2 * cat_p)


def _section(lines: list, title: str):
    """Append a titled section header to the lines list."""
    lines.append("\n" + "═" * 64)
    lines.append(f"  {title}")
    lines.append("═" * 64)


def _metrics_block(lines: list, split_name: str, y_true, y_pred):
    """Compute and append all metrics for one data split."""
    macro_f1     = f1_score(y_true, y_pred, average="macro")
    weighted_f1  = f1_score(y_true, y_pred, average="weighted")
    per_class_f1 = f1_score(y_true, y_pred, average=None, labels=[0, 1, 2])
    recall_crit  = recall_score(y_true, y_pred, labels=[2], average=None)[0]
    cm           = confusion_matrix(y_true, y_pred, labels=[0, 1, 2])

    _section(lines, f"{split_name.upper()} SET METRICS")

    lines.append(f"\n  ▸ Macro F1          (PRIMARY)  : {macro_f1:.4f}")
    lines.append(f"  ▸ Weighted F1                  : {weighted_f1:.4f}")
    lines.append(f"  ▸ F1   — Critical  (class 2)   : {per_class_f1[2]:.4f}")
    lines.append(f"  ▸ Recall — Critical (class 2)  : {recall_crit:.4f}")
    lines.append(f"  ▸ F1   — Medium    (class 1)   : {per_class_f1[1]:.4f}")
    lines.append(f"  ▸ F1   — Low       (class 0)   : {per_class_f1[0]:.4f}")

    # ── Confusion Matrix ──────────────────────────────────────────────────
    lines.append(f"\n{'─'*40}")
    lines.append("  Confusion Matrix")
    lines.append(f"{'─'*40}")
    cm_df = pd.DataFrame(cm, index=TARGET_NAMES, columns=TARGET_NAMES)
    cm_df.index.name   = "Actual \\ Predicted"
    for row in cm_df.to_string().split("\n"):
        lines.append(f"  {row}")

    # ── Full Classification Report ────────────────────────────────────────
    lines.append(f"\n{'─'*40}")
    lines.append("  Full Classification Report")
    lines.append(f"{'─'*40}")
    report = classification_report(
        y_true, y_pred, target_names=TARGET_NAMES, digits=4
    )
    for row in report.split("\n"):
        lines.append(f"  {row}")

    # ── Class distribution ────────────────────────────────────────────────
    lines.append(f"\n{'─'*40}")
    lines.append("  Prediction Distribution")
    lines.append(f"{'─'*40}")
    unique, counts = np.unique(y_pred, return_counts=True)
    for cls, cnt in zip(unique, counts):
        pct = cnt / len(y_pred) * 100
        lines.append(f"  {TARGET_NAMES[cls]:<20}: {cnt:>6}  ({pct:.1f}%)")


# ── Main ───────────────────────────────────────────────────────────────────
def main():
    lines = []

    # Header
    lines.append("=" * 64)
    lines.append("  SmartContainer Risk Engine — Evaluation Report")
    lines.append(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("=" * 64)

    # ── 1. Load raw data ──────────────────────────────────────────────────
    print("[1/5] Loading data...")
    train_df = pd.read_csv(TRAIN_PATH)
    test_df  = pd.read_csv(TEST_PATH)

    # Ground-truth labels extracted BEFORE feature engineering
    y_train_true = train_df["Clearance_Status"].map(TARGET_MAP).values
    y_test_true  = test_df["Clearance_Status"].map(TARGET_MAP).values

    lines.append(f"\n  Train samples : {len(y_train_true)}")
    lines.append(f"  Test  samples : {len(y_test_true)}")

    # ── 2. Feature engineering ────────────────────────────────────────────
    print("[2/5] Running feature engineering...")
    X_train, X_test, y_train_fe, _, _ = preprocess_and_engineer(train_df, test_df)
    X_train, X_test = prepare_features(X_train, X_test)

    X_train = X_train.reset_index(drop=True)
    X_test  = X_test.reset_index(drop=True)

    lines.append(f"\n  Feature columns ({len(X_train.columns)}): {X_train.columns.tolist()}")

    # ── 3. Load saved models ──────────────────────────────────────────────
    print("[3/5] Loading saved models...")
    xgb_model = joblib.load(os.path.join(SAVED_MODELS, "xgb_model.pkl"))
    lgb_model = joblib.load(os.path.join(SAVED_MODELS, "lgb_model.pkl"))
    cat_model = joblib.load(os.path.join(SAVED_MODELS, "cat_model.pkl"))
    detector  = joblib.load(os.path.join(SAVED_MODELS, "anomaly_detector.pkl"))

    iso, iso_rmin, iso_rmax = detector["iso"], detector["rmin"], detector["rmax"]

    # ── 4. Inject anomaly scores (training-time normalisation) ────────────
    print("[4/5] Computing anomaly scores...")
    denom = iso_rmax - iso_rmin if iso_rmax != iso_rmin else 1.0

    raw_tr = -iso.decision_function(X_train)
    X_train = X_train.copy()
    X_train["Anomaly_Score"] = np.clip((raw_tr - iso_rmin) / denom * 100, 0, 100)

    raw_te = -iso.decision_function(X_test)
    X_test = X_test.copy()
    X_test["Anomaly_Score"] = np.clip((raw_te - iso_rmin) / denom * 100, 0, 100)

    # ── 5. Generate ensemble probabilities & predictions ──────────────────
    print("[5/5] Running ensemble predictions and computing metrics...")

    # Train set
    train_proba = _blend(
        xgb_model.predict_proba(X_train),
        lgb_model.predict_proba(X_train),
        cat_model.predict_proba(X_train),
    )
    train_preds = _apply_thresholds(train_proba)

    # Test set
    test_proba = _blend(
        xgb_model.predict_proba(X_test),
        lgb_model.predict_proba(X_test),
        cat_model.predict_proba(X_test),
    )
    test_preds = _apply_thresholds(test_proba)

    # ── 6. Build report ───────────────────────────────────────────────────
    _section(lines, "MODEL CONFIGURATION")
    lines.append(f"\n  Ensemble weights   : XGBoost 0.5 · LightGBM 0.3 · CatBoost 0.2")
    lines.append(f"  Critical threshold : P(class=2) > {CRITICAL_THRESHOLD}")
    lines.append(f"  Medium  threshold  : P(class=1) > {MEDIUM_THRESHOLD}")

    _metrics_block(lines, "Train", y_train_true, train_preds)
    _metrics_block(lines, "Test",  y_test_true,  test_preds)

    lines.append("\n" + "=" * 64)
    lines.append("  End of Report")
    lines.append("=" * 64 + "\n")

    # ── 7. Write to file ──────────────────────────────────────────────────
    report_text = "\n".join(lines)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report_text)

    print(f"\n✓ Report written to:  {REPORT_PATH}")
    print(f"\n  Train Macro F1 : {f1_score(y_train_true, train_preds, average='macro'):.4f}")
    print(f"  Test  Macro F1 : {f1_score(y_test_true,  test_preds,  average='macro'):.4f}")


if __name__ == "__main__":
    main()
