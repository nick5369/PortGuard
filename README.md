<h1 align="center">PortGuard — Smart Container Risk Engine</h1>

<p align="center">
  AI-powered customs risk assessment platform for container shipments at ports.<br/>
  Detects high-risk containers using ensemble ML models, anomaly detection & SHAP explanations.
</p>

<p align="center">
  <a href="https://port-guard.vercel.app">Live Frontend</a> |
  <a href="https://portguard.onrender.com/api">Live Backend API</a>
</p>

---

## Table of Contents

- [About the Project](#about-the-project)
- [Architecture Diagram](#architecture-diagram)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Setup — Manual](#setup--manual)
- [Setup — Docker](#setup--docker)
- [API Endpoints](#api-endpoints)
- [Deployment](#deployment)
- [Team](#team)

---

## About the Project

PortGuard is a full-stack intelligent port security and trade risk assessment platform. It helps customs authorities and port operators quickly identify high-risk containers from uploaded shipping manifests (CSV). The backend runs an offline-trained ensemble of XGBoost, LightGBM and CatBoost models along with an Isolation Forest anomaly detector. At inference time, it scores every container, assigns a risk level (Clear / Low Risk / Critical), and generates SHAP-based natural language explanations for each decision.

The frontend is a React SPA that provides:

- **Dashboard** — Overview of the platform with key features and CTA sections.
- **Risk Engine** — Upload a CSV manifest, get back risk scores, risk levels and explanations for every container. Visualise results with charts and detailed tables.
- **Port Search** — Search and explore port information using live data from an external ports API.
- **Trade Intelligence** — Browse curated trade and shipping news from NewsAPI, filtered by category and keyword.

The system follows an **Offline-Train, Online-Serve** architecture. Models are trained once using historical data and saved to disk. At server startup, all model artifacts are loaded into memory for fast, low-latency inference on incoming requests.

---

## Architecture Diagram

```
+-------------------------------------------------------------------------------------+
|                                    PortGuard System                                 |
+-------------------------------------------------------------------------------------+
|                                                                                     |
|   +----------------------------------+      +-----------------------------------+  |
|   |          FRONTEND (React)        |      |         BACKEND (FastAPI)         |  |
|   |  Deployed on: Vercel             |      |  Deployed on: Render              |  |
|   |  URL: port-guard.vercel.app      |      |  URL: portguard.onrender.com      |  |
|   +----------------------------------+      +-----------------------------------+  |
|   |                                  |      |                                   |  |
|   |  +----------------------------+  |      |  +-----------------------------+  |  |
|   |  |       Dashboard Page       |  |      |  |   Startup (Lifespan)        |  |  |
|   |  |  - Hero, Features, CTA     |  |      |  |   - Load XGBoost model      |  |  |
|   |  +----------------------------+  |      |  |   - Load LightGBM model     |  |  |
|   |                                  |      |  |   - Load CatBoost model     |  |  |
|   |  +----------------------------+  |      |  |   - Load Isolation Forest   |  |  |
|   |  |     Risk Engine Page       |  | HTTP |  |   - Cache Historical CSV    |  |  |
|   |  |  - Upload CSV              |--|----->|  +-----------------------------+  |  |
|   |  |  - View Risk Table         |  | POST |  |                               |  |
|   |  |  - View Risk Charts        |  |      |  |  +-------------------------+  |  |
|   |  |  - View Risk Detail        |  |      |  |  | /api/predict-batch      |  |  |
|   |  +----------------------------+  |      |  |  | 1. Read uploaded CSV     |  |  |
|   |                                  |      |  |  | 2. Feature Engineering   |  |  |
|   |  +----------------------------+  |      |  |  | 3. Prepare Features      |  |  |
|   |  |     Port Search Page       |--|----->|  |  | 4. Anomaly Scoring       |  |  |
|   |  |  - Search by port name     |  | GET  |  |  | 5. Ensemble Predict      |  |  |
|   |  |  - View port details       |  |      |  |  | 6. SHAP Explanations     |  |  |
|   |  +----------------------------+  |      |  |  | 7. Return CSV response   |  |  |
|   |                                  |      |  |  +-------------------------+  |  |
|   |  +----------------------------+  |      |  |                               |  |
|   |  | Trade Intelligence Page    |--|----->|  |  +-------------------------+  |  |
|   |  |  - News by keyword         |  | GET  |  |  | /api/trade/...news      |  |  |
|   |  |  - Filter by category      |  |      |  |  | Proxy to NewsAPI        |  |  |
|   |  +----------------------------+  |      |  |  +-------------------------+  |  |
|   |                                  |      |  |                               |  |
|   |  +----------------------------+  |      |  |  +-------------------------+  |  |
|   |  |      Shared Components     |  |      |  |  | /api/ports/...          |  |  |
|   |  |  - Navbar                  |  |      |  |  | Port lookup proxy       |  |  |
|   |  |  - Footer                  |  |      |  |  +-------------------------+  |  |
|   |  |  - Loader                  |  |      |  |                               |  |
|   |  |  - ThemeSwitcher           |  |      |  +-----------------------------+  |  |
|   |  +----------------------------+  |      |  |       ML Pipeline            |  |  |
|   |                                  |      |  |  - train_offline.py          |  |  |
|   |  Tech: React 19, Vite 7,        |      |  |  - src/features.py           |  |  |
|   |  TailwindCSS 4, Recharts,       |      |  |  - src/model.py              |  |  |
|   |  React Router 7                  |      |  |  - src/data_loader.py        |  |  |
|   +----------------------------------+      |  |  - src/config.py             |  |  |
|                                              |  +-----------------------------+  |  |
|                                              |                                   |  |
|                                              |  Tech: FastAPI, Python 3.11,      |  |
|                                              |  XGBoost, LightGBM, CatBoost,     |  |
|                                              |  Scikit-learn, SHAP, Pandas,       |  |
|                                              |  Uvicorn, HTTPX                    |  |
|                                              +-----------------------------------+  |
|                                                                                     |
|   +--------------------------------------------------------------------------------+|
|   |                          DATA FLOW (Predict Batch)                              ||
|   |                                                                                 ||
|   |   User uploads CSV ---> Frontend sends POST /api/predict-batch                  ||
|   |   ---> Backend reads CSV + cached Historical Data                               ||
|   |   ---> Feature Engineering (weight deviation, temporal, frequency, etc.)         ||
|   |   ---> Prepare Features (drop zero-variance cols, align columns)                ||
|   |   ---> Anomaly Score via Isolation Forest (min-max normalised)                  ||
|   |   ---> Weighted Ensemble: XGBoost (0.45) + LightGBM (0.35) + CatBoost (0.20)   ||
|   |   ---> SHAP Explanation per container (top contributing features)               ||
|   |   ---> Response: CSV with Container_ID, Risk_Score, Risk_Level, Explanation     ||
|   +--------------------------------------------------------------------------------+|
+-------------------------------------------------------------------------------------+
```

---

## Tech Stack

| Layer       | Technology                                                          |
|-------------|---------------------------------------------------------------------|
| Frontend    | React 19, Vite 7, TailwindCSS 4, Recharts, React Router 7          |
| Backend     | Python 3.11, FastAPI, Uvicorn                                       |
| ML Models   | XGBoost, LightGBM, CatBoost (weighted ensemble)                    |
| Anomaly     | Isolation Forest (scikit-learn)                                     |
| Explainer   | SHAP (TreeExplainer on XGBoost)                                     |
| News API    | NewsAPI.org (proxied through backend)                               |
| Deployment  | Frontend on Vercel, Backend on Render                               |
| Container   | Docker (single Dockerfile, runs both frontend and backend)          |

---

## Features

- **Batch Risk Prediction** — Upload container manifest CSV, get risk scores and levels back as downloadable CSV.
- **Ensemble ML Scoring** — Three gradient boosting models vote together for robust predictions.
- **Anomaly Detection** — Isolation Forest flags unusual shipment patterns.
- **SHAP Explanations** — Every risk decision comes with a human-readable explanation of top contributing features.
- **Trade Intelligence** — Browse real-time shipping and trade news filtered by category.
- **Port Search** — Lookup global port details.
- **Dark/Light Theme** — Theme switcher with system preference detection.
- **Responsive UI** — Works on desktop and mobile.

---

## Project Structure

```
PortGuard/
|
|-- README.md                        <-- You are here
|-- Dockerfile                       <-- Single Docker build for full stack
|
|-- backend/
|   |-- main.py                      <-- FastAPI application entry point
|   |-- train_offline.py             <-- Offline model training script
|   |-- requirements.txt             <-- Python dependencies
|   |-- .env                         <-- Backend environment variables
|   |-- data/
|   |   |-- Historical Data.csv      <-- Training dataset
|   |   |-- Real-Time Data.csv       <-- Sample test dataset
|   |-- saved_models/                <-- Serialised model artifacts (.pkl)
|   |-- src/
|   |   |-- config.py                <-- Paths, column names, constants
|   |   |-- data_loader.py           <-- CSV loading utilities
|   |   |-- features.py              <-- Feature engineering pipeline
|   |   |-- model.py                 <-- Model training, inference, SHAP
|
|-- Frontend/
|   |-- .env                         <-- Frontend environment variables
|   |-- package.json                 <-- Node dependencies
|   |-- vite.config.js               <-- Vite dev server config
|   |-- index.html                   <-- HTML entry
|   |-- src/
|   |   |-- App.jsx                  <-- Root component with routes
|   |   |-- main.jsx                 <-- React DOM render
|   |   |-- pages/
|   |   |   |-- dashboard/           <-- Landing page components
|   |   |   |-- risk-engine/         <-- Risk prediction UI
|   |   |   |-- port-search/         <-- Port lookup UI
|   |   |   |-- trade-intelligence/  <-- News feed UI
|   |   |-- components/              <-- Navbar, Footer, Loader, ThemeSwitcher
|   |   |-- styles/                  <-- CSS modules for each section
|   |   |-- utils/                   <-- Theme manager, env loader
```

---

## Environment Variables

PortGuard uses two `.env` files — one for the backend and one for the frontend. Both must be configured before running the project.

### Backend — `backend/.env`

| Variable        | Required | Description                                                                 | Example                              |
|-----------------|----------|-----------------------------------------------------------------------------|--------------------------------------|
| `GNEWS_API_KEY` | Yes      | API key for NewsAPI.org. Used to fetch trade intelligence news articles.     | `08fff24a65d840d5bf8d11948dbc550c`   |

The backend reads this file via `python-dotenv` at startup. If the key is missing, the `/api/trade/trade-intelligence/news` endpoint will return a 401 error.

To get your own key, sign up at [https://newsapi.org](https://newsapi.org) and copy the API key.

Create the file:

```bash
# backend/.env
GNEWS_API_KEY=your_newsapi_key_here
```

### Frontend — `Frontend/.env`

| Variable                 | Required | Description                                                       | Default / Example                            |
|--------------------------|----------|-------------------------------------------------------------------|----------------------------------------------|
| `VITE_API_BASE_URL`     | Yes      | Base URL of the backend API.                                       | `http://localhost:8000/api`                  |
| `VITE_APP_NAME`         | Yes      | Application display name shown in Navbar and Footer.               | `PortGuard`                                  |
| `VITE_ADDRESS`          | No       | Address shown in Footer.                                           | `Port Authority Building, Mumbai 400001`     |
| `VITE_EMAIL`            | No       | Contact email shown in Footer.                                     | `contact@portguard.io`                       |
| `VITE_PHONE`            | No       | Contact phone shown in Footer.                                     | `+91 6353941995`                             |
| `VITE_RISK_ENGINE_URL`  | Yes      | API URL for the risk engine predict-batch endpoint.                | `http://localhost:8000/api`                  |
| `VITE_TRADE_INTEL_URL`  | Yes      | API URL for trade intelligence news.                               | `http://localhost:8000/api/trade`            |
| `VITE_PORT_SEARCH_URL`  | Yes      | API URL for port search.                                           | `http://localhost:8000/api/ports`            |

**For local development**, all API URLs point to `http://localhost:8000/api`.

**For production**, replace them with the deployed backend URL:

```bash
# Frontend/.env (production)
VITE_API_BASE_URL=https://portguard.onrender.com/api
VITE_RISK_ENGINE_URL=https://portguard.onrender.com/api
VITE_TRADE_INTEL_URL=https://portguard.onrender.com/api/trade
VITE_PORT_SEARCH_URL=https://portguard.onrender.com/api/ports
```

> **Note:** All `VITE_` prefixed variables are embedded into the frontend build at compile time by Vite. They are NOT secret. Do not put any secret keys in the frontend `.env` file.

---

## Setup — Manual

### Prerequisites

- Python 3.11 or higher
- Node.js 20 or higher
- npm 9 or higher
- Git

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-username/PortGuard.git
cd PortGuard
```

### Step 2: Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Linux / macOS
# venv\Scripts\activate          # Windows

# Install dependencies
pip install -r requirements.txt

# Create .env file
echo "GNEWS_API_KEY=your_newsapi_key_here" > .env

# Train the models (one-time, generates saved_models/*.pkl)
python train_offline.py

# Start the backend server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend will be running at **http://localhost:8000**.

Verify by opening: `http://localhost:8000/api` — you should see `{"status": "ok", "message": "Server is running"}`.

### Step 3: Frontend Setup

Open a new terminal:

```bash
cd Frontend

# Install dependencies
npm install

# Create .env file (for local development, defaults should work)
# Make sure VITE_API_BASE_URL points to http://localhost:8000/api

# Start the dev server
npm run dev
```

The frontend will be running at **http://localhost:3000**.

### Step 4: Use the Application

1. Open `http://localhost:3000` in your browser.
2. Go to **Risk Engine** page.
3. Upload a CSV file (you can use `backend/data/Real-Time Data.csv` as a sample).
4. View risk scores, charts and explanations for each container.

---

## Setup — Docker

### Prerequisites

- Docker installed and running

### Step 1: Clone and Configure

```bash
git clone https://github.com/your-username/PortGuard.git
cd PortGuard
```

Make sure both `.env` files are properly configured (see [Environment Variables](#environment-variables) section above).

### Step 2: Build the Docker Image

```bash
docker build -t portguard .
```

This single Dockerfile does the following:

1. Uses `python:3.11-slim` as base image.
2. Installs Node.js 20 via NodeSource.
3. Installs Python backend dependencies from `backend/requirements.txt`.
4. Installs Frontend npm packages.
5. Builds the React frontend using `npm run build`.
6. At runtime, starts both the Vite preview server (port 4173) and the Uvicorn backend server (port 8000).

### Step 3: Run the Container

```bash
docker run -p 8000:8000 -p 4173:4173 portguard
```

| Service   | URL                          |
|-----------|------------------------------|
| Frontend  | http://localhost:4173         |
| Backend   | http://localhost:8000         |
| API Check | http://localhost:8000/api     |

### Docker with Environment Variables (Override)

If you want to pass environment variables at runtime instead of baking them in:

```bash
docker run -p 8000:8000 -p 4173:4173 \
  -e GNEWS_API_KEY=your_newsapi_key_here \
  portguard
```

---

## API Endpoints

| Method | Endpoint                                | Description                                      |
|--------|-----------------------------------------|--------------------------------------------------|
| GET    | `/api`                                  | Server health check.                             |
| GET    | `/health`                               | Returns loaded model artifacts list.             |
| POST   | `/api/predict-batch`                    | Upload CSV, get risk predictions as CSV.         |
| GET    | `/api/trade/trade-intelligence/news`    | Trade news (params: keyword, category, limit).   |
| GET    | `/api/ports/...`                        | Port search and information.                     |

### Example — Predict Batch (cURL)

```bash
curl -X POST http://localhost:8000/api/predict-batch \
  -F "file=@backend/data/Real-Time Data.csv" \
  --output predictions.csv
```

The response CSV will contain columns: `Container_ID`, `Risk_Score`, `Risk_Level`, `Explanation_Summary`.

---

## Deployment

### Frontend — Vercel

The frontend is deployed on Vercel at: **https://port-guard.vercel.app**

- Connect your GitHub repository to Vercel.
- Set the root directory to `Frontend`.
- Framework preset: Vite.
- Add all `VITE_*` environment variables in Vercel project settings, pointing API URLs to the Render backend.

### Backend — Render

The backend is deployed on Render at: **https://portguard.onrender.com**

- Connect your GitHub repository to Render.
- Set the root directory to `backend`.
- Build command: `pip install -r requirements.txt && python train_offline.py`
- Start command: `uvicorn main:app --host 0.0.0.0 --port 8000`
- Add `GNEWS_API_KEY` in Render environment variables.

---

## Team

Built by **Team Miend** for the Hackathon.

---

<p align="center">
  <strong>PortGuard</strong> — Making ports safer, one container at a time.
</p>
