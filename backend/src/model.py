"""
SmartContainer Risk Engine — Big Three Probability Ensemble
============================================================
Phase 1: Imbalance Handling              (Cost-Sensitive Weights)
Phase 2: Hyperparameter Optimization     (Optuna + XGBClassifier)
Phase 3: Final Ensemble Training & Custom Threshold Inference
         XGBoost (Optuna best) + LightGBM + CatBoost
         Anomaly scores computed here for the first time.
Phase 4: SHAP Explainability & Output Generation
Evaluation: Stratified CV + Test-set metrics
"""

import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

import numpy as np
import pandas as pd
import optuna
import shap
from sklearn.ensemble import IsolationForest
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import (
    classification_report, confusion_matrix, f1_score, recall_score,
)
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from catboost import CatBoostClassifier

from src.config import (
    RANDOM_STATE, OPTUNA_TRIALS, CV_FOLDS, IF_CONTAMINATION,
    CRITICAL_THRESHOLD, MEDIUM_THRESHOLD, RISK_LABELS, OUTPUT_PATH,
)

optuna.logging.set_verbosity(optuna.logging.WARNING)


# ═══════════════════════════════════════════════════════════════════════════
#  PREPARE FEATURES — drop near-zero-variance Trade_ dummies
# ═══════════════════════════════════════════════════════════════════════════
def prepare_features(X_train, X_test):
    """Drop near-zero-variance Trade_ dummy columns before modelling."""
    trade_cols = [c for c in X_train.columns if "Trade_" in c]
    if trade_cols:
        X_train = X_train.drop(columns=trade_cols)
        X_test = X_test.drop(columns=trade_cols)
        print(f"[Model] Dropped zero-variance columns: {trade_cols}")
    print(f"[Model] X_train {X_train.shape}  X_test {X_test.shape}")
    return X_train, X_test


# ═══════════════════════════════════════════════════════════════════════════
#  ANOMALY SCORE HELPER — fit on Xtr, score both Xtr & Xother
# ═══════════════════════════════════════════════════════════════════════════
def _inject_anomaly(Xtr, Xother):
    """
    Fit IsolationForest on Xtr (which must NOT contain Anomaly_Score).
    Normalise scores to 0-100 using Xtr min/max.
    Return copies of both DataFrames with Anomaly_Score appended.
    """
    iso = IsolationForest(
        contamination=IF_CONTAMINATION, random_state=RANDOM_STATE, n_jobs=-1,
    )
    iso.fit(Xtr)

    raw_tr = -iso.decision_function(Xtr)
    raw_other = -iso.decision_function(Xother)

    rmin, rmax = raw_tr.min(), raw_tr.max()
    denom = rmax - rmin if rmax != rmin else 1.0

    Xtr = Xtr.copy()
    Xother = Xother.copy()
    Xtr["Anomaly_Score"] = np.clip((raw_tr - rmin) / denom * 100, 0, 100)
    Xother["Anomaly_Score"] = np.clip((raw_other - rmin) / denom * 100, 0, 100)
    return Xtr, Xother


# ═══════════════════════════════════════════════════════════════════════════
#  PHASE 1 — IMBALANCE HANDLING (COST-SENSITIVE WEIGHTS)
# ═══════════════════════════════════════════════════════════════════════════
def compute_weights(y_train):
    """Balanced sample weights so the model penalises missing rare classes."""
    weights = compute_sample_weight(class_weight="balanced", y=y_train)
    print(f"[Phase 1] Sample weights — "
          f"min {weights.min():.4f}  max {weights.max():.4f}  "
          f"mean {weights.mean():.4f}")
    return weights


# ═══════════════════════════════════════════════════════════════════════════
#  PHASE 2 — HYPERPARAMETER OPTIMIZATION (OPTUNA)
#  X_train here is PURE (no Anomaly_Score column).
#  Anomaly scores are built fresh inside each CV fold.
# ═══════════════════════════════════════════════════════════════════════════
def optimise_hyperparams(X_train, y_train, sample_weights):
    """
    20-trial Optuna study maximising macro-F1 via 3-fold stratified CV.
    IsolationForest is re-fitted per fold to avoid anomaly-score leakage.
    """
    def objective(trial):
        params = {
            "objective": "multi:softprob",
            "num_class": 3,
            "eval_metric": "mlogloss",
            "use_label_encoder": False,
            "tree_method": "hist",
            "random_state": RANDOM_STATE,
            "n_estimators": 500,
            "early_stopping_rounds": 30,
            "max_depth": trial.suggest_int("max_depth", 3, 9),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "subsample": trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        }

        skf = StratifiedKFold(
            n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE
        )
        scores = []

        for train_idx, val_idx in skf.split(X_train, y_train):
            Xtr_raw = X_train.iloc[train_idx]
            Xval_raw = X_train.iloc[val_idx]
            ytr, yval = y_train.iloc[train_idx], y_train.iloc[val_idx]
            wtr = sample_weights[train_idx]

            # Anomaly scores built from scratch per fold
            Xtr, Xval = _inject_anomaly(Xtr_raw, Xval_raw)

            model = XGBClassifier(**params)
            model.fit(
                Xtr, ytr,
                sample_weight=wtr,
                eval_set=[(Xval, yval)],
                verbose=False,
            )

            preds = model.predict(Xval)
            scores.append(f1_score(yval, preds, average="macro"))

        return np.mean(scores)

    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=RANDOM_STATE),
    )
    study.optimize(objective, n_trials=OPTUNA_TRIALS, show_progress_bar=True)

    best = study.best_params
    print(f"[Phase 2] Best macro-F1 = {study.best_value:.4f}")
    print(f"          Params: {best}")
    return best


# ═══════════════════════════════════════════════════════════════════════════
#  PHASE 3 — FINAL TRAINING & CUSTOM THRESHOLD INFERENCE
#  Anomaly scores are computed HERE for the first and only global time.
# ═══════════════════════════════════════════════════════════════════════════
def train_and_predict(X_train, y_train, X_test, sample_weights, best_params):
    """
    Big Three Probability Ensemble:
    1. Fit IsolationForest on the full (pure) X_train → inject Anomaly_Score.
       The fitted iso + normalisation stats (rmin/rmax) are returned so
       train_offline.py can save them for consistent production inference.
    2. Train XGBoost (Optuna best) + LightGBM + CatBoost.
    3. Average their probabilities → apply custom thresholds.
    Returns (xgb_model, lgb_model, cat_model, iso, iso_rmin, iso_rmax,
             X_train, X_test, proba, predictions, risk_scores).
    """
    # ── Anomaly injection (iso exposed so caller can persist it) ───────────
    iso = IsolationForest(
        contamination=IF_CONTAMINATION, random_state=RANDOM_STATE, n_jobs=-1,
    )
    iso.fit(X_train)
    raw_tr = -iso.decision_function(X_train)
    raw_te = -iso.decision_function(X_test)
    iso_rmin, iso_rmax = float(raw_tr.min()), float(raw_tr.max())
    _denom = iso_rmax - iso_rmin if iso_rmax != iso_rmin else 1.0
    X_train = X_train.copy()
    X_test  = X_test.copy()
    X_train["Anomaly_Score"] = np.clip((raw_tr - iso_rmin) / _denom * 100, 0, 100)
    X_test["Anomaly_Score"]  = np.clip((raw_te - iso_rmin) / _denom * 100, 0, 100)
    print(f"[Phase 3] Anomaly_Score injected — "
          f"train mean {X_train['Anomaly_Score'].mean():.2f}, "
          f"test mean {X_test['Anomaly_Score'].mean():.2f}")

    # ── 1. XGBoost (Optuna-tuned) ────────────────────────────────────────
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
    print(f"[Phase 3] XGBoost trained on {X_train.shape}")

    # ── 2. LightGBM ──────────────────────────────────────────────────────
    lgb_model = LGBMClassifier(
        n_estimators=800,
        num_class=3,
        class_weight="balanced",
        random_state=RANDOM_STATE,
        verbose=-1,
    )
    lgb_model.fit(X_train, y_train)
    print(f"[Phase 3] LightGBM trained")

    # ── 3. CatBoost ──────────────────────────────────────────────────────
    cat_model = CatBoostClassifier(
        iterations=800,
        auto_class_weights="Balanced",
        random_seed=RANDOM_STATE,
        verbose=False,
    )
    cat_model.fit(X_train, y_train)
    print(f"[Phase 3] CatBoost trained")

    # ── Ensemble probabilities (simple average) ──────────────────────────
    xgb_proba = xgb_model.predict_proba(X_test)
    lgb_proba = lgb_model.predict_proba(X_test)
    cat_proba = cat_model.predict_proba(X_test)
    proba = (0.5*xgb_proba) + (0.3*lgb_proba) + (0.2*cat_proba)
    print(f"[Phase 3] Ensemble probabilities blended (XGB + LGB + CAT)")

    # ── Custom threshold logic ────────────────────────────────────────────
    predictions = np.zeros(len(X_test), dtype=int)

    critical_mask = proba[:, 2] > CRITICAL_THRESHOLD
    medium_mask = (~critical_mask) & (proba[:, 1] > MEDIUM_THRESHOLD)

    predictions[critical_mask] = 2
    predictions[medium_mask] = 1
    # remaining stay 0

    # ── Continuous Risk Score (0-100) with rank-based spread per tier ──
    #   Low: 0-33  |  Medium: 34-66  |  Critical: 67-100
    # Rank (percentile) scaling within each tier guarantees uniform
    # spread even when the model's probabilities are highly confident.
    raw_score = (proba[:, 1] * 50) + (proba[:, 2] * 100)
    TIERS = {0: (0.0, 33.0), 1: (34.0, 66.0), 2: (67.0, 100.0)}
    risk_scores = np.empty(len(predictions), dtype=float)
    for cls, (lo, hi) in TIERS.items():
        mask = predictions == cls
        if not mask.any():
            continue
        vals = raw_score[mask]
        n = mask.sum()
        if n == 1:
            risk_scores[mask] = (lo + hi) / 2
        else:
            # Rank-based: sort order → evenly spaced percentiles
            ranks = vals.argsort().argsort()   # 0 .. n-1
            risk_scores[mask] = lo + ranks / (n - 1) * (hi - lo)

    print(f"[Phase 3] Predictions — "
          f"Low: {(predictions==0).sum()}, "
          f"Medium: {(predictions==1).sum()}, "
          f"Critical: {(predictions==2).sum()}")

    # Return all 3 models + iso detector for offline saving.
    # xgb_model is the one passed to SHAP (TreeExplainer, single tree model).
    return (
        xgb_model, lgb_model, cat_model,
        iso, iso_rmin, iso_rmax,
        X_train, X_test, proba, predictions, risk_scores,
    )


# ═══════════════════════════════════════════════════════════════════════════
#  INFERENCE HELPER — apply saved models to new data (FastAPI endpoint)
# ═══════════════════════════════════════════════════════════════════════════
def inference_predict(
    xgb_model, lgb_model, cat_model,
    iso, iso_rmin, iso_rmax,
    X_test_pure,
):
    """
    Production inference path (no re-fitting, no training data required).
    Applies the training-time IsolationForest using saved min/max stats so
    Anomaly_Score is consistent with what the models saw during training.

    Returns (X_test_enriched, proba, predictions, risk_scores).
    X_test_enriched is a copy with Anomaly_Score appended — pass it directly
    to explain_and_save().
    """
    X_test = X_test_pure.copy().reset_index(drop=True)

    # ── Anomaly score: saved training-time normalisation ──────────────────
    raw   = -iso.decision_function(X_test)
    denom = iso_rmax - iso_rmin if iso_rmax != iso_rmin else 1.0
    X_test["Anomaly_Score"] = np.clip((raw - iso_rmin) / denom * 100, 0, 100)

    # ── Weighted ensemble (0.5 XGB + 0.3 LGB + 0.2 CAT) ─────────────────
    xgb_proba = xgb_model.predict_proba(X_test)
    lgb_proba = lgb_model.predict_proba(X_test)
    cat_proba = cat_model.predict_proba(X_test)
    proba = (0.5 * xgb_proba) + (0.3 * lgb_proba) + (0.2 * cat_proba)

    # ── Custom threshold classification ───────────────────────────────────
    predictions   = np.zeros(len(X_test), dtype=int)
    critical_mask = proba[:, 2] > CRITICAL_THRESHOLD
    medium_mask   = (~critical_mask) & (proba[:, 1] > MEDIUM_THRESHOLD)
    predictions[critical_mask] = 2
    predictions[medium_mask]   = 1

    # ── Rank-based risk score (0-100, spread within each tier) ───────────
    raw_score = (proba[:, 1] * 50) + (proba[:, 2] * 100)
    TIERS = {0: (0.0, 33.0), 1: (34.0, 66.0), 2: (67.0, 100.0)}
    risk_scores = np.empty(len(predictions), dtype=float)
    for cls, (lo, hi) in TIERS.items():
        mask = predictions == cls
        if not mask.any():
            continue
        vals = raw_score[mask]
        n    = mask.sum()
        if n == 1:
            risk_scores[mask] = (lo + hi) / 2
        else:
            ranks = vals.argsort().argsort()   # 0 .. n-1
            risk_scores[mask] = lo + ranks / (n - 1) * (hi - lo)

    return X_test, proba, predictions, risk_scores


# ═══════════════════════════════════════════════════════════════════════════
#  PHASE 4 — SHAP EXPLAINABILITY & OUTPUT
# ═══════════════════════════════════════════════════════════════════════════
def explain_and_save(model, X_test, test_ids, predictions, risk_scores):
    """SHAP TreeExplainer → top 3 features per row → plain English explanation."""
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_test)

    # Handle both SHAP formats:
    #   Old: list of 3 arrays, each (n_samples, n_features)
    #   New: single 3D array (n_samples, n_features, n_classes)
    if isinstance(shap_values, list):
        def get_row_shap(sample_idx, class_idx):
            return shap_values[class_idx][sample_idx]
    else:
        def get_row_shap(sample_idx, class_idx):
            return shap_values[sample_idx, :, class_idx]

    feature_names = X_test.columns.tolist()
    n_features = len(feature_names)
    n = len(X_test)

    # Guarantee we never request more indices than features available
    top_k = min(3, n_features)

    explanations = []
    for i in range(n):
        pred_class = predictions[i]
        row_shap = get_row_shap(i, pred_class)

        # Indices of the top-k features sorted by descending SHAP value
        top_indices = np.argsort(row_shap)[-top_k:][::-1]
        top_feats = [feature_names[idx] for idx in top_indices]

        # Build a numbered list: "1. Feature_A, 2. Feature_B, 3. Feature_C"
        feat_str = ", ".join(
            f"{rank}. {name}" for rank, name in enumerate(top_feats, 1)
        )

        score = risk_scores[i]

        if pred_class == 2:
            explanations.append(
                f"Flagged as Critical (score {score:.1f}) driven by "
                f"unusual patterns in {feat_str}."
            )
        elif pred_class == 1:
            explanations.append(
                f"Elevated to Medium risk (score {score:.1f}). "
                f"Top drivers: {feat_str}."
            )
        else:
            explanations.append(
                f"Classified as Low risk (score {score:.1f}). "
                f"Primary factors: {feat_str}."
            )

    output = pd.DataFrame({
        "Container_ID": test_ids.values,
        "Risk_Score": np.round(risk_scores, 2),
        "Risk_Level": [RISK_LABELS[p] for p in predictions],
        "Explanation_Summary": explanations,
    })

    output.to_csv(OUTPUT_PATH, index=False)

    print(f"\n[Phase 4] Saved final_predictions.csv  ({output.shape[0]} rows)")
    print(f"\nRisk Level distribution:")
    print(output["Risk_Level"].value_counts())
    print(f"\nSample output:\n{output.head(10).to_string()}")
    return output


# ═══════════════════════════════════════════════════════════════════════════
#  EVALUATION — Stratified CV on PURE train (zero leakage)
# ═══════════════════════════════════════════════════════════════════════════
def evaluate_on_train_cv(X_train_pure, y_train, sample_weights, best_params):
    """
    3-fold stratified CV on the PURE X_train (no Anomaly_Score column).
    IsolationForest is re-fitted per fold → zero anomaly leakage.
    """
    skf = StratifiedKFold(
        n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE
    )
    oof_preds = np.full(len(y_train), -1, dtype=int)

    for fold, (tr_idx, val_idx) in enumerate(
        skf.split(X_train_pure, y_train), 1
    ):
        Xtr_raw = X_train_pure.iloc[tr_idx]
        Xval_raw = X_train_pure.iloc[val_idx]
        ytr = y_train.iloc[tr_idx]
        wtr = sample_weights[tr_idx]

        # Anomaly scores built from scratch per fold
        Xtr, Xval = _inject_anomaly(Xtr_raw, Xval_raw)

        fold_model = XGBClassifier(
            objective="multi:softprob",
            num_class=3,
            eval_metric="mlogloss",
            use_label_encoder=False,
            tree_method="hist",
            random_state=RANDOM_STATE,
            n_estimators=800,
            **best_params,
        )
        fold_model.fit(Xtr, ytr, sample_weight=wtr, verbose=False)
        oof_preds[val_idx] = fold_model.predict(Xval)

    _print_metrics(
        "MODEL EVALUATION  (3-Fold Stratified CV · Train Only)",
        y_train, oof_preds,
    )


def evaluate_on_test(predictions, y_test_true):
    """Evaluate final Phase 3 predictions against actual test labels."""
    _print_metrics(
        "TEST SET EVALUATION  (Unseen Data · Ground Truth from CSV)",
        y_test_true, predictions,
    )


def _print_metrics(title, y_true, y_pred):
    """Shared metric printer."""
    target_names = ["Low (0)", "Medium (1)", "Critical (2)"]

    macro_f1    = f1_score(y_true, y_pred, average="macro")
    weighted_f1 = f1_score(y_true, y_pred, average="weighted")
    per_class   = f1_score(y_true, y_pred, average=None)
    recall_crit = recall_score(y_true, y_pred, labels=[2], average=None)[0]

    cm = confusion_matrix(y_true, y_pred)
    cm_df = pd.DataFrame(cm, index=target_names, columns=target_names)

    print("\n" + "=" * 64)
    print(f"  {title}")
    print("=" * 64)
    print(f"\n  ▸ Macro F1  (PRIMARY)    : {macro_f1:.4f}")
    print(f"  ▸ Weighted F1            : {weighted_f1:.4f}")
    print(f"  ▸ F1  Critical (class 2) : {per_class[2]:.4f}")
    print(f"  ▸ Recall Critical        : {recall_crit:.4f}")
    print(f"  ▸ F1  Medium  (class 1)  : {per_class[1]:.4f}")
    print(f"  ▸ F1  Low     (class 0)  : {per_class[0]:.4f}")
    print(f"\n── Confusion Matrix ──")
    print(cm_df.to_string())
    print(f"\n── Full Classification Report ──")
    print(classification_report(
        y_true, y_pred, target_names=target_names, digits=4
    ))
    print("=" * 64)
