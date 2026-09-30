# Hypoxia Prediction — Deployment Guide
## HuggingFace Space + MQTT (HiveMQ) + IoT

---

## STEP 1 — Prepare your files locally

Your folder structure must look exactly like this before uploading:

```
hypoxia-prediction-api/
├── Dockerfile
├── README.md
├── requirements.txt
├── inference.py         ← from this package
├── model.py             ← your model architecture
├── saved_models/
│   └── best_model.keras ← your trained weights
└── data/
    └── processed/
        └── scaler.pkl   ← your fitted StandardScaler
```

> ⚠️ You have model_weights.h5 — you need to convert it first (see Step 1b).

### Step 1b — Convert .h5 weights → best_model.keras

Run this once on your local machine:

```python
# convert_weights.py
import tensorflow as tf
from model import build_lstm_model

model = build_lstm_model(input_shape=(30, 3), lstm_units=[128, 64])
model.load_weights("model_weights.h5")
model.save("saved_models/best_model.keras")
print("Saved to saved_models/best_model.keras")
```

---

## STEP 2 — Create HuggingFace Space

1. Go to https://huggingface.co → click "New Space"
2. Name it: `hypoxia-prediction-api`
3. SDK: choose **Docker**
4. Visibility: **Private** (medical data!)
5. Click "Create Space"

---

## STEP 3 — Upload files to the Space

Option A — Git (recommended):
```bash
git clone https://huggingface.co/spaces/YOUR-USERNAME/hypoxia-prediction-api
cd hypoxia-prediction-api

# Copy all files from this package into the folder
cp -r ../hypoxia-deploy/* .

# Add your model files
mkdir -p saved_models data/processed
cp /path/to/saved_models/best_model.keras saved_models/
cp /path/to/data/processed/scaler.pkl data/processed/

git add .
git commit -m "Initial deployment"
git push
```

Option B — Upload via Web UI:
- Go to your Space → "Files" tab → "Add file" → upload each file

> ⚠️ model .keras files can be large. Use Git LFS if > 50MB:
```bash
git lfs install
git lfs track "*.keras" "*.pkl" "*.h5"
git add .gitattributes
```

---

## STEP 4 — Watch the build

- Go to your Space → "App" tab
- Watch the build logs (takes ~3-5 minutes first time)
- Once done, your API is live at:
  `https://YOUR-USERNAME-hypoxia-prediction-api.hf.space`

Test it:
```bash
curl https://YOUR-USERNAME-hypoxia-prediction-api.hf.space/health
```

---

## STEP 5 — Set up HiveMQ Cloud (MQTT Broker)

1. Go to https://www.hivemq.com/mqtt-cloud-broker/
2. Sign up for free → Create a free cluster
3. Go to "Credentials" tab → Create username + password
4. Note your Cluster URL (looks like: abc123.s1.eu.hivemq.cloud)

---

## STEP 6 — Run the MQTT Bridge

On any always-on computer (laptop, Raspberry Pi, small VPS):

```bash
pip install paho-mqtt requests python-dotenv

cp .env.example .env
# Edit .env with your HiveMQ and HF Space details

python mqtt_bridge.py
```

---

## STEP 7 — Connect your IoT devices

Each IoT sensor device should:
- Connect to HiveMQ broker using TLS (port 8883)
- Publish vitals every ~60 seconds to:
  `hospital/patient/{PATIENT_ID}/vitals`
- Subscribe to alerts from:
  `hospital/patient/{PATIENT_ID}/alert`

See `iot_device_example.py` for the full example.

---

## STEP 8 — Frontend integration (React / Web)

Install the MQTT client:
```bash
npm install mqtt
```

```javascript
import mqtt from 'mqtt'

const client = mqtt.connect('wss://YOUR-CLUSTER.hivemq.cloud:8884/mqtt', {
  username: 'your-hivemq-username',
  password: 'your-hivemq-password',
})

// Subscribe to all patient alerts
client.subscribe('hospital/patient/+/alert')

client.on('message', (topic, message) => {
  const alert = JSON.parse(message.toString())
  console.log('Alert:', alert)
  // Show in your dashboard UI
})

// You can also call the HF Space API directly from frontend:
const predict = async (patientId, vitals) => {
  const res = await fetch(
    'https://YOUR-USERNAME-hypoxia-prediction-api.hf.space/predict',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: patientId, vitals })
    }
  )
  return res.json()
}
```

---

## Testing Without Real Hardware

Use the built-in simulation endpoint:
```bash
curl -X POST https://YOUR-USERNAME-hypoxia-prediction-api.hf.space/predict/simulate
```

This simulates a deteriorating patient (SpO2 97→84, HR 75→112).

---

## Summary: What runs where

| Component | Runs On | Protocol |
|-----------|---------|----------|
| LSTM Model API | HuggingFace Space | HTTPS |
| MQTT Broker | HiveMQ Cloud | MQTT/TLS |
| MQTT Bridge | Your server/Pi | MQTT + HTTPS |
| IoT Sensors | Device | MQTT/TLS |
| Frontend Dashboard | Browser | HTTPS + WSS |
