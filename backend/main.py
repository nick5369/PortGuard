"""
SmartContainer Risk Engine — FastAPI Backend
=============================================
Offline-Train, Online-Serve architecture.
Models are loaded once at startup and kept in memory for fast inference.

Workflow:
    1. Run train_offline.py to train and save models to saved_models/
    2. Start this server:  uvicorn main:app --reload
    3. POST a CSV to /api/predict-batch  →  receive final_predictions.csv

Expected upload schema (no Clearance_Status column):
    Container_ID, Declaration_Date (YYYY-MM-DD), Declaration_Time,
    Trade_Regime (Import / Export / Transit), Origin_Country,
    Destination_Port, Destination_Country, HS_Code, Importer_ID,
    Exporter_ID, Declared_Value, Declared_Weight, Measured_Weight,
    Shipping_Line, Dwell_Time_Hours
"""

import io
import os
import joblib
import httpx
import pandas as pd
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# ── News API key (server-side only, never exposed to frontend) ────────────
GNEWS_API_KEY = os.environ.get("GNEWS_API_KEY", "")

from src.config import TRAIN_PATH
from src.features import preprocess_and_engineer
from src.model import prepare_features, inference_predict, explain_and_save

# ── Global model / data store (populated at startup) ──────────────────────
_store: dict = {}
SAVED_MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saved_models")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load all artifacts into memory once at startup; release on shutdown."""
    print("[Startup] Loading models from saved_models/ ...")
    _store["xgb"] = joblib.load(os.path.join(SAVED_MODELS_DIR, "xgb_model.pkl"))
    _store["lgb"] = joblib.load(os.path.join(SAVED_MODELS_DIR, "lgb_model.pkl"))
    _store["cat"] = joblib.load(os.path.join(SAVED_MODELS_DIR, "cat_model.pkl"))
    detector = joblib.load(os.path.join(SAVED_MODELS_DIR, "anomaly_detector.pkl"))
    _store["iso"]     = detector["iso"]
    _store["iso_rmin"] = detector["rmin"]
    _store["iso_rmax"] = detector["rmax"]

    # Cache Historical Data once — copied per-request to avoid in-place mutation.
    _store["train_df_raw"] = pd.read_csv(TRAIN_PATH)
    print(f"[Startup] Cached train data: {_store['train_df_raw'].shape}")
    print("[Startup] All models ready.")
    yield
    _store.clear()


app = FastAPI(
    title="SmartContainer Risk Engine",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api")
def server_status():
    return {"status": "ok", "message": "Server is running"}

@app.get("/health")
async def health():
    return {"status": "ok", "artifacts": list(_store.keys())}


@app.post("/api/predict-batch")
async def predict_batch(file: UploadFile = File(...)):
    """
    Accept a container manifest CSV (no Clearance_Status column).
    Returns final_predictions.csv as a streaming download.

    Output columns: Container_ID, Risk_Score, Risk_Level, Explanation_Summary
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted.")

    # ── Read uploaded test data ───────────────────────────────────────────
    contents = await file.read()
    try:
        test_df = pd.read_csv(io.BytesIO(contents))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {exc}")

    # ── Fresh copy of cached train data prevents in-place mutation leaking
    #    across concurrent requests.                                        ─
    train_df = _store["train_df_raw"].copy()

    # ── Feature engineering: stats fitted on train_df, mapped to test_df ──
    X_train, X_test, y_train, train_ids, test_ids = preprocess_and_engineer(
        train_df, test_df
    )

    # ── Drop zero-variance Trade_ columns (same step as offline training) ─
    X_train, X_test = prepare_features(X_train, X_test)

    # ── Safe index alignment before all downstream ops ─────────────────────
    X_test    = X_test.reset_index(drop=True)
    test_ids  = test_ids.reset_index(drop=True)

    # ── Inference: inject anomaly score + weighted ensemble predict ────────
    X_test_enriched, proba, predictions, risk_scores = inference_predict(
        _store["xgb"],
        _store["lgb"],
        _store["cat"],
        _store["iso"],
        _store["iso_rmin"],
        _store["iso_rmax"],
        X_test,
    )

    # ── SHAP explanations via XGBoost + build output DataFrame ────────────
    # X_test_enriched already has Anomaly_Score; test_ids is 0-indexed.
    output = explain_and_save(
        _store["xgb"], X_test_enriched, test_ids, predictions, risk_scores
    )

    # Integrity guard: lengths must match before streaming
    if len(output) != len(test_ids):
        raise HTTPException(
            status_code=500,
            detail=f"Row count mismatch: output={len(output)}, ids={len(test_ids)}",
        )

    # ── Stream result as CSV (index=False → no 'Unnamed: 0' column) ────────
    stream = io.StringIO()
    output.to_csv(stream, index=False)
    stream.seek(0)

    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=final_predictions.csv"},
    )


# ═══════════════════════════════════════════════════════════════════════════
#  TRADE INTELLIGENCE — News endpoint (GNews upstream)
# ═══════════════════════════════════════════════════════════════════════════
_CATEGORY_TERMS = {
    "congestion":  "congestion",
    "shipping":    "shipping",
    "container":   "container",
    "trade":       "trade",
    "terminal":    "terminal",
}


@app.get("/api/trade/trade-intelligence/news")
async def trade_intelligence_news(
    keyword:  str = Query(..., min_length=1),
    category: str = Query("all"),
    limit:    int = Query(10, ge=1, le=50),
):
    """
    Proxy to GNews API.  Maps upstream response to the article schema
    expected by the React frontend.
    """
    if not GNEWS_API_KEY:
        raise HTTPException(
            status_code=401,
            detail="News API key is not configured on the server.",
        )

    # Build search query — use OR to broaden instead of AND-narrowing
    if category != "all" and category in _CATEGORY_TERMS:
        search_q = f"{keyword} OR {_CATEGORY_TERMS[category]}"
    else:
        search_q = keyword

    params = {
        "q":        search_q,
        "language": "en",           
        "pageSize": str(limit),    
        "apiKey":   GNEWS_API_KEY,   
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get("https://newsapi.org/v2/everything", params=params)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504)
    except httpx.RequestError:
        raise HTTPException(status_code=502)

    # Map upstream status codes to what the frontend expects
    if resp.status_code == 401 or resp.status_code == 403:
        raise HTTPException(status_code=401)
    if resp.status_code == 429:
        raise HTTPException(status_code=429)
    if resp.status_code >= 500:
        raise HTTPException(status_code=502)
    if resp.status_code != 200:
        raise HTTPException(status_code=500)

    data = resp.json()
    raw_articles = data.get("articles", [])

    articles = [
        {
            "title":        a.get("title", ""),
            "description":  a.get("description"),
            "url":          a.get("url", ""),
            "image_url":    a.get("image"),
            "source_name":  (a.get("source") or {}).get("name", "Unknown"),
            "published_at": a.get("publishedAt", ""),
        }
        for a in raw_articles
    ]

    return {"articles": articles}

