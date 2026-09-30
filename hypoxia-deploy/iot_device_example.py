"""
iot_device_example.py
─────────────────────────────────────────────────────
Example: How your IoT sensor device should publish
vitals to the MQTT broker.

Works on:
- Raspberry Pi  (pip install paho-mqtt)
- Any Python-capable microcontroller
- For ESP32/Arduino, use the PubSubClient library
  with the same topic format.
"""

import json
import time
import random
import paho.mqtt.client as mqtt
from dotenv import load_dotenv
import os

load_dotenv()

BROKER_HOST = os.getenv("MQTT_BROKER", "your-cluster.hivemq.cloud")
BROKER_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USER   = os.getenv("MQTT_USER", "")
MQTT_PASS   = os.getenv("MQTT_PASS", "")
PATIENT_ID  = "PT-001"   # change per device/patient

def read_sensors():
    """
    Replace this with your real sensor reading code.
    e.g. MAX30102 for SpO2/HR, or a wearable BLE device.
    """
    return {
        "spo2": round(random.uniform(94, 99), 1),
        "hr":   round(random.uniform(70, 95), 1),
        "rr":   round(random.uniform(14, 20), 1),
    }

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"Connected! Publishing vitals for patient {PATIENT_ID}")
        # Subscribe to alerts for this patient
        client.subscribe(f"hospital/patient/{PATIENT_ID}/alert")
    else:
        print(f"Connection failed: rc={rc}")

def on_message(client, userdata, msg):
    """Handle incoming alert from the bridge."""
    alert = json.loads(msg.payload.decode())
    print(f"\n🚨 ALERT RECEIVED: {alert['message']}")
    # Trigger buzzer / LED / display on your device here

def main():
    client = mqtt.Client(client_id=f"sensor-{PATIENT_ID}")
    client.username_pw_set(MQTT_USER, MQTT_PASS)
    client.tls_set()
    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
    client.loop_start()

    topic = f"hospital/patient/{PATIENT_ID}/vitals"
    print(f"Publishing to: {topic}")

    while True:
        vitals = read_sensors()
        payload = json.dumps(vitals)
        client.publish(topic, payload, qos=1)
        print(f"Published: {vitals}")
        time.sleep(60)   # publish every 1 minute (matches 30-step = 30 min window)

if __name__ == "__main__":
    main()
