---
title: Hypoxia Prediction API
emoji: 🫁
colorFrom: red
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Hypoxia Prediction API

LSTM-based model that predicts hypoxia risk **15 minutes in advance** using patient vitals.

## Input
- 30 timesteps of: SpO2 (%), Heart Rate (BPM), Respiratory Rate (breaths/min)

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | API status |
| POST | `/predict` | Run prediction |
| POST | `/predict/simulate` | Demo with simulated deterioration |

## Example Request

```bash
curl -X POST https://your-username-hypoxia-prediction-api.hf.space/predict \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": "PT-001",
    "vitals": [
      {"spo2": 97.0, "hr": 82.0, "rr": 16.0},
      ... (30 readings total)
    ]
  }'
```

## Example Response

```json
{
  "patient_id": "PT-001",
  "probability": 0.912,
  "risk_level": "Critical",
  "alert": true,
  "message": "HIGH RISK: Hypoxia predicted within 15 minutes (confidence: 91.2%)"
}
```
