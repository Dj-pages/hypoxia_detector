"""
FastAPI inference service for hypoxia prediction.
POST /predict → takes 30 timesteps of vitals → returns risk probability
Adapted for HuggingFace Spaces (port 7860)
"""

import numpy as np
import tensorflow as tf
import joblib
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

# ── Config ───────────────────────────────────────────────────────────────────
MODEL_PATH  = os.getenv("MODEL_PATH",  "saved_models/best_model.keras")
SCALER_PATH = os.getenv("SCALER_PATH", "data/processed/scaler.pkl")
THRESHOLD   = float(os.getenv("THRESHOLD", "0.870"))
WINDOW_SIZE = 30

# ── Load model and scaler once at startup ────────────────────────────────────
print("Loading model...")
model  = tf.keras.models.load_model(MODEL_PATH)
scaler = joblib.load(SCALER_PATH)
print("Model ready!")

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Hypoxia Prediction API",
    description="Predicts hypoxia risk 15 minutes in advance using LSTM",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request/Response schemas ──────────────────────────────────────────────────
class VitalReading(BaseModel):
    spo2: float   # SpO2 percentage (e.g. 97.0)
    hr:   float   # Heart rate BPM (e.g. 82.0)
    rr:   float   # Respiratory rate (e.g. 16.0)

class PredictRequest(BaseModel):
    vitals:     List[VitalReading]
    patient_id: str = "unknown"

class PredictResponse(BaseModel):
    patient_id:  str
    probability: float
    risk_level:  str
    alert:       bool
    message:     str

# ── Risk classification ───────────────────────────────────────────────────────
def classify_risk(probability: float) -> tuple:
    if probability >= THRESHOLD:
        return "Critical", True,  f"HIGH RISK: Hypoxia predicted within 15 minutes (confidence: {probability:.1%})"
    elif probability >= 0.5:
        return "Warning",  False, f"MODERATE RISK: Monitor closely (confidence: {probability:.1%})"
    else:
        return "Stable",   False, f"LOW RISK: Patient vitals stable (confidence: {probability:.1%})"

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "Hypoxia Prediction API is running", "docs": "/docs"}

@app.get("/health")
def health():
    return {
        "status":      "healthy",
        "model":       MODEL_PATH,
        "threshold":   THRESHOLD,
        "window_size": WINDOW_SIZE
    }

@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest):
    if len(request.vitals) != WINDOW_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Expected {WINDOW_SIZE} vital readings, got {len(request.vitals)}"
        )

    window = np.array(
        [[v.spo2, v.hr, v.rr] for v in request.vitals],
        dtype=np.float32
    )

    if np.any(np.isnan(window)):
        raise HTTPException(
            status_code=400,
            detail="Input contains NaN values — ensure all vitals are valid readings"
        )

    window_scaled = scaler.transform(window).reshape(1, WINDOW_SIZE, 3)
    probability   = float(model.predict(window_scaled, verbose=0)[0][0])
    risk_level, alert, message = classify_risk(probability)

    return PredictResponse(
        patient_id  = request.patient_id,
        probability = round(probability, 4),
        risk_level  = risk_level,
        alert       = alert,
        message     = message
    )

@app.post("/predict/simulate")
def simulate_deterioration():
    """Demo endpoint — simulates a deteriorating patient. No hardware needed."""
    spo2_values = np.linspace(97, 84, WINDOW_SIZE)
    hr_values   = np.linspace(75, 112, WINDOW_SIZE)
    rr_values   = np.linspace(14, 28,  WINDOW_SIZE)

    window        = np.column_stack([spo2_values, hr_values, rr_values]).astype(np.float32)
    window_scaled = scaler.transform(window).reshape(1, WINDOW_SIZE, 3)
    probability   = float(model.predict(window_scaled, verbose=0)[0][0])
    risk_level, alert, message = classify_risk(probability)

    return {
        "scenario":    "Simulated deterioration",
        "patient_id":  "DEMO-001",
        "probability": round(probability, 4),
        "risk_level":  risk_level,
        "alert":       alert,
        "message":     message,
        "vitals_used": {
            "spo2_range": "97 → 84",
            "hr_range":   "75 → 112",
            "rr_range":   "14 → 28"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
