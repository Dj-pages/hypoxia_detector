require('dotenv').config()
const mqtt  = require("mqtt")
const axios = require("axios")

const HIVEMQ_HOST = process.env.HIVEMQ_HOST
const HIVEMQ_PORT = process.env.HIVEMQ_PORT
const USERNAME    = process.env.HIVEMQ_USERNAME
const PASSWORD    = process.env.HIVEMQ_PASSWORD
const HF_URL      = process.env.HUGGINGFACE_URL
const TOPIC       = "hypoxia/vitals"
const WINDOW_SIZE = 30

let window = []

// Connect to HiveMQ cloud with TLS
const client = mqtt.connect(`mqtts://${HIVEMQ_HOST}:${HIVEMQ_PORT}`, {
  username: USERNAME,
  password: PASSWORD,
  rejectUnauthorized: true
})

client.on("connect", () => {
  console.log("✅ Connected to HiveMQ Cloud")
  client.subscribe(TOPIC, (err) => {
    if (err) console.error("Subscribe error:", err)
    else console.log(`📡 Subscribed to: ${TOPIC}`)
  })
})

client.on("message", async (topic, message) => {
  try {
    const data = JSON.parse(message.toString())
    console.log(`📥 Received: SpO2=${data.spo2} HR=${data.hr} RR=${data.rr}`)

    window.push({
      spo2: parseFloat(data.spo2),
      hr:   parseFloat(data.hr),
      rr:   parseFloat(data.rr),
    })

    if (window.length > WINDOW_SIZE) {
      window = window.slice(-WINDOW_SIZE)
    }

    if (window.length < WINDOW_SIZE) {
      console.log(`⏳ Building window... (${window.length}/${WINDOW_SIZE})`)
      return
    }

    const response = await axios.post(`${HF_URL}/predict`, {
      patient_id: data.patient_id || "ESP32-001",
      vitals:     window
    })

    const result = response.data
    console.log(`🧠 ${result.risk_level} (${(result.probability * 100).toFixed(1)}%)`)

    if (result.alert) {
      console.log(`🚨 ALERT: ${result.message}`)
      // Publish alert back to HiveMQ so ESP32 display can show it
      client.publish(
        `hypoxia/alert/${data.patient_id || "ESP32-001"}`,
        JSON.stringify(result)
      )
    }

  } catch (err) {
    console.error("Error:", err.message)
  }
})

client.on("error", (err) => {
  console.error("MQTT error:", err.message)
})

console.log("🚀 Hypoxia Bridge starting...")
console.log(`📡 Connecting to HiveMQ: ${HIVEMQ_HOST}`)
console.log(`🤖 HuggingFace API: ${HF_URL}`)
