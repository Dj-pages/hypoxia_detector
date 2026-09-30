#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <U8g2lib.h>
#include <ArduinoJson.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

// ── CONFIG — UPDATE THESE ─────────────────────────────────────────────────────
const char* WIFI_SSID     = "OPPO11";
const char* WIFI_PASSWORD = "12345678";
const char* MQTT_HOST     = "bbe621bde73b48a59738066e59df7a1b.s1.eu.hivemq.cloud";
const int   MQTT_PORT     = 8883;
const char* MQTT_USERNAME = "djadhav";
const char* MQTT_PASSWORD = "Dhananjay@2006";
const char* PATIENT_ID    = "ESP32-001";
const char* PUB_TOPIC     = "hypoxia/vitals";
const char* SUB_TOPIC     = "hypoxia/alert/ESP32-001";

// ── OBJECTS ───────────────────────────────────────────────────────────────────
U8G2_SH1106_128X64_NONAME_F_HW_I2C display(U8G2_R0, U8X8_PIN_NONE);
MAX30105         sensor;
WiFiClientSecure wifiClient;
PubSubClient     mqtt(wifiClient);

// ── SPO2 BUFFERS ──────────────────────────────────────────────────────────────
#define BUFFER_LENGTH 100
uint32_t irBuffer[BUFFER_LENGTH];
uint32_t redBuffer[BUFFER_LENGTH];
int32_t  spo2;      int8_t spo2Valid;
int32_t  heartRate; int8_t hrValid;

// ── STATE ─────────────────────────────────────────────────────────────────────
float  lastSpO2    = 0;
float  lastHR      = 0;
float  lastRR      = 0;
bool   alertActive = false;
String riskLevel   = "Stable";
unsigned long lastPublish    = 0;
unsigned long lastAlertBlink = 0;
bool   blinkState  = false;
const int PUBLISH_INTERVAL   = 2000;

// ── HELPERS ───────────────────────────────────────────────────────────────────
float estimateRR(float hr) {
  return constrain(hr / 4.5, 8.0, 40.0);
}

// ── DISPLAY FUNCTIONS ─────────────────────────────────────────────────────────
void drawStatus(const char* line1, const char* line2 = "") {
  display.clearBuffer();
  display.setFont(u8g2_font_6x10_tf);
  display.drawStr(0, 20, line1);
  if (strlen(line2) > 0) display.drawStr(0, 35, line2);
  display.sendBuffer();
}

void drawVitals() {
  char buf[32];
  display.clearBuffer();
  display.setFont(u8g2_font_6x10_tf);
  display.drawStr(0, 10, "Hypoxia Monitor");
  display.drawHLine(0, 12, 128);
  sprintf(buf, "SpO2: %.1f%%", lastSpO2);
  display.drawStr(0, 26, buf);
  sprintf(buf, "HR:   %.0f bpm", lastHR);
  display.drawStr(0, 38, buf);
  sprintf(buf, "RR:   %.0f br/m", lastRR);
  display.drawStr(0, 50, buf);
  display.drawStr(0, 62, riskLevel.c_str());
  display.sendBuffer();
}

void drawAlert() {
  display.clearBuffer();
  display.setFont(u8g2_font_9x15B_tf);
  if (blinkState) display.drawStr(10, 20, "!! ALERT !!");
  display.setFont(u8g2_font_6x10_tf);
  display.drawStr(0, 35, "Hypoxia Predicted");
  display.drawStr(0, 47, "in ~15 minutes!");
  char buf[32];
  sprintf(buf, "SpO2: %.1f%%", lastSpO2);
  display.drawStr(0, 62, buf);
  display.sendBuffer();
}

// ── MQTT CALLBACK ─────────────────────────────────────────────────────────────
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (int i = 0; i < length; i++) msg += (char)payload[i];
  Serial.println("Alert received: " + msg);

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, msg)) return;

  riskLevel   = doc["risk_level"] | "Stable";
  alertActive = doc["alert"] | false;
  Serial.printf("Risk: %s | Alert: %s\n", riskLevel.c_str(), alertActive ? "YES" : "NO");
}

// ── WIFI SETUP ────────────────────────────────────────────────────────────────
void setupWiFi() {
  drawStatus("Connecting WiFi...", WIFI_SSID);
  Serial.println("Connecting to WiFi: " + String(WIFI_SSID));
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    drawStatus("WiFi Connected!", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\nWiFi FAILED!");
    drawStatus("WiFi Failed!", "Check credentials");
  }
  delay(1500);
}

// ── MQTT RECONNECT ────────────────────────────────────────────────────────────
void reconnectMQTT() {
  drawStatus("Connecting MQTT...", MQTT_HOST);
  Serial.println("Connecting to HiveMQ: " + String(MQTT_HOST));

  int attempts = 0;
  while (!mqtt.connected() && attempts < 5) {
    String clientId = "ESP32-" + String(random(0xffff), HEX);
    Serial.printf("Attempt %d with client: %s\n", attempts + 1, clientId.c_str());

    if (mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("MQTT connected to HiveMQ!");
      drawStatus("MQTT Connected!", "HiveMQ Cloud");
      mqtt.subscribe(SUB_TOPIC);
      delay(1000);
    } else {
      Serial.printf("MQTT failed rc=%d\n", mqtt.state());
      attempts++;
      delay(3000);
    }
  }

  if (!mqtt.connected()) {
    Serial.println("MQTT connection failed — continuing without cloud");
    drawStatus("No Cloud", "Local mode only");
    delay(1500);
  }
}

// ── SETUP ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(21, 22);

  // Display
  display.begin();
  drawStatus("Starting...", "Hypoxia Monitor");
  delay(1000);

  // WiFi
  setupWiFi();

  // Sensor
  drawStatus("Init sensor...", "MAX30102");
  Serial.println("Initializing MAX30102...");
  if (!sensor.begin(Wire, I2C_SPEED_FAST)) {
    drawStatus("Sensor FAILED!", "Check wiring");
    Serial.println("MAX30102 FAILED!");
    while (1) delay(1000);
  }
  sensor.setup(60, 4, 2, 100, 411, 4096);
  Serial.println("Sensor ready!");
  drawStatus("Sensor Ready!", "");
  delay(1000);

  // MQTT — using setInsecure() to skip cert verification
  wifiClient.setInsecure();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(512);
  reconnectMQTT();

  // Fill initial buffer
  drawStatus("Calibrating...", "Place finger");
  Serial.println("Filling sensor buffer...");
  for (int i = 0; i < BUFFER_LENGTH; i++) {
    while (!sensor.available()) sensor.check();
    redBuffer[i] = sensor.getRed();
    irBuffer[i]  = sensor.getIR();
    sensor.nextSample();
  }

  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, BUFFER_LENGTH, redBuffer,
    &spo2, &spo2Valid, &heartRate, &hrValid
  );

  drawStatus("System Ready!", "Monitoring...");
  Serial.println("System ready!");
  delay(1000);
}

// ── LOOP ──────────────────────────────────────────────────────────────────────
void loop() {
  // Reconnect MQTT if dropped
  if (!mqtt.connected()) {
    reconnectMQTT();
  }
  mqtt.loop();

  // Blink alert display
  if (alertActive) {
    unsigned long now = millis();
    if (now - lastAlertBlink > 500) {
      blinkState     = !blinkState;
      lastAlertBlink = now;
      drawAlert();
    }
  }

  // Shift buffer — discard oldest 25, add 25 new
  for (int i = 0; i < 25; i++) {
    while (!sensor.available()) sensor.check();
    redBuffer[i] = redBuffer[i + 25];
    irBuffer[i]  = irBuffer[i + 25];
    sensor.nextSample();
  }
  for (int i = 25; i < BUFFER_LENGTH; i++) {
    while (!sensor.available()) sensor.check();
    redBuffer[i] = sensor.getRed();
    irBuffer[i]  = sensor.getIR();
    sensor.nextSample();
  }

  // Recalculate SpO2 and HR
  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, BUFFER_LENGTH, redBuffer,
    &spo2, &spo2Valid, &heartRate, &hrValid
  );

  if (spo2Valid && hrValid && spo2 > 0 && heartRate > 0) {
    lastSpO2 = (float)spo2;
    lastHR   = (float)heartRate;
    lastRR   = estimateRR(lastHR);
  }

  // Publish every 2 seconds
  unsigned long now = millis();
  if (now - lastPublish >= PUBLISH_INTERVAL) {
    lastPublish = now;

    // No finger detected
    if (irBuffer[BUFFER_LENGTH - 1] < 50000) {
      display.clearBuffer();
      display.setFont(u8g2_font_6x10_tf);
      display.drawStr(0, 30, "Place finger");
      display.drawStr(0, 45, "on sensor...");
      display.sendBuffer();
      return;
    }

    // Build JSON payload
    StaticJsonDocument<128> doc;
    doc["patient_id"] = PATIENT_ID;
    doc["spo2"]       = lastSpO2;
    doc["hr"]         = lastHR;
    doc["rr"]         = lastRR;
    char payload[128];
    serializeJson(doc, payload);

    // Publish to HiveMQ
    if (mqtt.connected()) {
      bool ok = mqtt.publish(PUB_TOPIC, payload);
      Serial.printf("Published: %s [%s]\n", payload, ok ? "OK" : "FAIL");
    } else {
      Serial.println("No MQTT — local only: " + String(payload));
    }

    // Update display if no alert
    if (!alertActive) drawVitals();
  }
}
