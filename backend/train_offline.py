"""
SmartContainer Risk Engine — Offline Training Script
=====================================================
Run this once to train the Big Three ensemble and persist all required
artifacts to saved_models/.  The FastAPI server loads those artifacts
at startup — no re-training happens during inference.

Usage:
    python train_offline.py
"""

import os
import joblib

from src.data_loader import load_raw_data
from src.features import preprocess_and_engineer
from src.model import (
    prepare_features,
    compute_weights,
    optimise_hyperparams,
    train_and_predict,
    evaluate_on_train_cv,
)


def main():
    print("=" * 64)
    print("  SmartContainer Risk Engine — Offline Training")
    print("=" * 64)

    # ── 1. Load raw CSVs ──────────────────────────────────────────────────
    train_df, test_df = load_raw_data()

    # ── 2. Unified feature engineering (in-memory, zero leakage) ─────────
    X_train, X_test, y_train, train_ids, test_ids = preprocess_and_engineer(
        train_df, test_df
    )

    # ── 3. Drop zero-variance Trade_ columns ──────────────────────────────
    X_train, X_test = prepare_features(X_train, X_test)

    # ── 4. Phase 1: Cost-sensitive sample weights ──────────────────────────
    sample_weights = compute_weights(y_train)

    # ── 5. Phase 2: Optuna hyperparameter search (XGBoost only) ───────────
    best_params = optimise_hyperparams(X_train, y_train, sample_weights)

    # ── 6. Phase 3: Train Big Three ensemble ──────────────────────────────
    # X_train passed here is the PURE version (no Anomaly_Score).
    # train_and_predict returns X_train_enriched as a new variable so
    # X_train in this scope remains pure — safe to pass to evaluate_on_train_cv.
    (
        xgb_model, lgb_model, cat_model,
        iso, iso_rmin, iso_rmax,
        X_train_enriched, X_test_enriched,
        proba, predictions, risk_scores,
    ) = train_and_predict(X_train, y_train, X_test, sample_weights, best_params)

    # ── 7. CV evaluation (uses pure X_train, re-fits IF per fold) ─────────
    evaluate_on_train_cv(X_train, y_train, sample_weights, best_params)

    # ── 8. Save artifacts ─────────────────────────────────────────────────
    save_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saved_models")
    os.makedirs(save_dir, exist_ok=True)

    joblib.dump(xgb_model, os.path.join(save_dir, "xgb_model.pkl"))
    joblib.dump(lgb_model, os.path.join(save_dir, "lgb_model.pkl"))
    joblib.dump(cat_model, os.path.join(save_dir, "cat_model.pkl"))
    # Save iso + normalisation stats together so inference is reproducible.
    joblib.dump(
        {"iso": iso, "rmin": iso_rmin, "rmax": iso_rmax},
        os.path.join(save_dir, "anomaly_detector.pkl"),
    )

    print("\n[Train] Artifacts saved to saved_models/:")
    for fname in sorted(os.listdir(save_dir)):
        size_kb = os.path.getsize(os.path.join(save_dir, fname)) // 1024
        print(f"  {fname}  ({size_kb} KB)")

    print("\n✓ Offline training complete.")
    print("  Start the API with:  uvicorn main:app --reload")


if __name__ == "__main__":
    main()
