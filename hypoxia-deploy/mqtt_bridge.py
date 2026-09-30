"""
mqtt_bridge.py
─────────────────────────────────────────────────────
Listens to IoT sensor data via MQTT,
calls the HuggingFace Space API for prediction,
and publishes alerts back via MQTT.

Run this on any always-on server (Raspberry Pi, VPS, etc.)

MQTT Topics:
  Subscribe: hospital/patient/+/vitals
  Publish:   hospital/patient/{id}/alert

Setup:
  pip install paho-mqtt requests python-dotenv
  Copy .env.example → .env and fill in your credentials
"""

import json
import time
import requests
import paho.mqtt.client as mqtt
from collections import defaultdict
from dotenv import load_dotenv
import os

load_dotenv()

# ── Config (set in .env file) ─────────────────────────────────────────────────
HF_API_URL   = os.getenv("HF_API_URL",   "https://YOUR-USERNAME-hypoxia-prediction-api.hf.space/predict")
BROKER_HOST  = os.getenv("MQTT_BROKER",  "your-cluster.hivemq.cloud")
BROKER_PORT  = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USER    = os.getenv("MQTT_USER",    "")
MQTT_PASS    = os.getenv("MQTT_PASS",    "")
WINDOW_SIZE  = 30

# ── Sliding window buffer per patient ────────────────────────────────────────
patient_buffers = defaultdict(list)

# ── MQTT Callbacks ────────────────────────────────────────────────────────────
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to MQTT broker!")
        client.subscribe("hospital/patient/+/vitals")
        print("Subscribed to hospital/patient/+/vitals")
    else:
        print(f"Connection failed: rc={rc}")

def on_message(client, userdata, msg):
    try:
        topic   = msg.topic
        payload = json.loads(msg.payload.decode())

        # Extract patient ID from topic: hospital/patient/{id}/vitals
        patient_id = topic.split("/")[2]

        # Add reading to sliding window buffer
        reading = {
            "spo2": float(payload.get("spo2", payload.get("SpO2", 0))),
            "hr":   float(payload.get("hr",   payload.get("HR",   0))),
            "rr":   float(payload.get("rr",   payload.get("Resp", 0))),
        }
        patient_buffers[patient_id].append(reading)

        # Keep only last 30 readings (sliding window)
        if len(patient_buffers[patient_id]) > WINDOW_SIZE:
            patient_buffers[patient_id] = patient_buffers[patient_id][-WINDOW_SIZE:]

        # Only predict when we have a full window
        if len(patient_buffers[patient_id]) == WINDOW_SIZE:
            run_prediction(client, patient_id, patient_buffers[patient_id])

    except Exception as e:
        print(f"Error processing message: {e}")

def run_prediction(client, patient_id: str, vitals_window: list):
    try:
        response = requests.post(
            HF_API_URL,
            json={"patient_id": patient_id, "vitals": vitals_window},
            timeout=10
        )
        result = response.json()

        print(f"[{patient_id}] Risk: {result['risk_level']} | P={result['probability']:.3f}")

        # Publish alert if risk is elevated
        if result["alert"] or result["risk_level"] == "Warning":
            alert_payload = json.dumps({
                "patient_id":  patient_id,
                "risk_level":  result["risk_level"],
                "probability": result["probability"],
                "alert":       result["alert"],
                "message":     result["message"],
                "timestamp":   time.time()
            })
            alert_topic = f"hospital/patient/{patient_id}/alert"
            client.publish(alert_topic, alert_payload, qos=1)
            print(f"  ⚠️  Alert published to {alert_topic}")

    except requests.exceptions.Timeout:
        print(f"[{patient_id}] HF API timeout — retrying next reading")
    except Exception as e:
        print(f"[{patient_id}] Prediction error: {e}")

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    client = mqtt.Client(client_id="hypoxia-bridge", protocol=mqtt.MQTTv311)
    client.username_pw_set(MQTT_USER, MQTT_PASS)
    client.tls_set()  # TLS required for HiveMQ Cloud (port 8883)
    client.on_connect = on_connect
    client.on_message = on_message

    print(f"Connecting to {BROKER_HOST}:{BROKER_PORT}...")
    client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
    client.loop_forever()

if __name__ == "__main__":
    main()
