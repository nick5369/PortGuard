"""
SmartContainer Risk Engine — Configuration
===========================================
All constants, paths, thresholds, and toggles in one place.
"""

import os

# ── Paths ─────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DEBUG_DIR = os.path.join(BASE_DIR, "debug_outputs")

TRAIN_PATH = os.path.join(DATA_DIR, "Historical Data.csv")
TEST_PATH = os.path.join(DATA_DIR, "Real-Time Data.csv")
OUTPUT_PATH = os.path.join(BASE_DIR, "final_predictions.csv")

# ── Debug Toggle ──────────────────────────────────────────────────────────
SAVE_DEBUG_CSVS = False

# ── Target Mapping ────────────────────────────────────────────────────────
TARGET_MAP = {"Clear": 0, "Low Risk": 1, "Critical": 2}

# ── Column Definitions ────────────────────────────────────────────────────
NUMERICAL_COLS = [
    "Declared_Value",
    "Declared_Weight",
    "Measured_Weight",
    "Dwell_Time_Hours",
]

CATEGORICAL_COLS = [
    "Trade_Regime (Import / Export / Transit)",
    "Origin_Country",
    "Destination_Port",
    "Destination_Country",
    "Importer_ID",
    "Exporter_ID",
    "Shipping_Line",
]

# Columns to drop after all feature engineering is complete.
# Origin_Country, Exporter_ID, and Trade_Regime are NOT listed here
# because they are encoded into new features before dropping.
RAW_DROP_COLS = [
    "Declaration_Date (YYYY-MM-DD)",
    "Declaration_Time",
    "Destination_Port",
    "Destination_Country",
    "HS_Code",
    "Importer_ID",
    "Declared_Value",
    "Declared_Weight",
    "Measured_Weight",
    "Shipping_Line",
    "Dwell_Time_Hours",
    "Clearance_Status",
    "Route_ID",
    "HS_Category",
    "Is_Risky",
]

# ── Model Constants ───────────────────────────────────────────────────────
RANDOM_STATE = 42
OPTUNA_TRIALS = 2
CV_FOLDS = 3
IF_CONTAMINATION = 0.05

# Custom inference thresholds (maximise Critical recall)
CRITICAL_THRESHOLD = 0.30
MEDIUM_THRESHOLD = 0.40

# Target encoding smoothing factor
SMOOTH_M = 10

RISK_LABELS = {0: "Low", 1: "Medium", 2: "Critical"}
