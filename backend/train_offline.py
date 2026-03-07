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

    train_df, test_df = load_raw_data()

    X_train, X_test, y_train, train_ids, test_ids = preprocess_and_engineer(
        train_df, test_df
    )

    X_train, X_test = prepare_features(X_train, X_test)

    sample_weights = compute_weights(y_train)

    best_params = optimise_hyperparams(X_train, y_train, sample_weights)

    (
        xgb_model, lgb_model, cat_model,
        iso, iso_rmin, iso_rmax,
        X_train_enriched, X_test_enriched,
        proba, predictions, risk_scores,
    ) = train_and_predict(X_train, y_train, X_test, sample_weights, best_params)

    evaluate_on_train_cv(X_train, y_train, sample_weights, best_params)

    save_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saved_models")
    os.makedirs(save_dir, exist_ok=True)

    joblib.dump(xgb_model, os.path.join(save_dir, "xgb_model.pkl"))
    joblib.dump(lgb_model, os.path.join(save_dir, "lgb_model.pkl"))
    joblib.dump(cat_model, os.path.join(save_dir, "cat_model.pkl"))
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
