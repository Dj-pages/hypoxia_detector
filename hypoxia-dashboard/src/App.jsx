import { useState, useEffect, useRef } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import axios from "axios"
import "./index.css"

const API_URL = "https://DJ-jadhav-hypoxia-prediction-api.hf.space"
const POLL_INTERVAL = 2000  // fetch prediction every 2 seconds

// ── Simulated live vitals (replaces real ESP32 data for demo) ────────────────
function generateVitals(step) {
  const progress = Math.min(step / 60, 1)  // 0 to 1 over 60 steps
  return {
    spo2: +(97 - progress * 13 + (Math.random() - 0.5)).toFixed(1),
    hr:   +(75  + progress * 37 + (Math.random() - 0.5) * 2).toFixed(0),
    rr:   +(14  + progress * 14 + (Math.random() - 0.5)).toFixed(0),
  }
}

// ── Risk color mapping ────────────────────────────────────────────────────────
function getRiskColor(level) {
  if (level === "Critical") return "#ef4444"
  if (level === "Warning")  return "#f59e0b"
  return "#22c55e"
}

function getRiskBg(level) {
  if (level === "Critical") return "#fef2f2"
  if (level === "Warning")  return "#fffbeb"
  return "#f0fdf4"
}

// ── Vital Card ────────────────────────────────────────────────────────────────
function VitalCard({ label, value, unit, normal, warning }) {
  const color = value < warning ? "#ef4444" : value < normal ? "#f59e0b" : "#22c55e"
  return (
    <div style={{
      background: "white",
      borderRadius: 12,
      padding: "20px 24px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      borderLeft: `4px solid ${color}`,
      flex: 1,
    }}>
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, color }}>
        {value}<span style={{ fontSize: 16, fontWeight: 400, marginLeft: 4 }}>{unit}</span>
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [history, setHistory]       = useState([])
  const [prediction, setPrediction] = useState(null)
  const [step, setStep]             = useState(0)
  const [isRunning, setIsRunning]   = useState(false)
  const [alertActive, setAlertActive] = useState(false)
  const windowRef = useRef([])
  const stepRef   = useRef(0)

  // Build sliding window of 30 readings
  const addReading = (vitals) => {
    windowRef.current = [...windowRef.current, vitals].slice(-30)
  }

  // Call FastAPI prediction when window is full
  const fetchPrediction = async () => {
    if (windowRef.current.length < 30) return
    try {
      const payload = {
        patient_id: "DEMO-001",
        vitals: windowRef.current.map(v => ({
          spo2: v.spo2,
          hr:   v.hr,
          rr:   v.rr,
        }))
      }
      const res = await axios.post(`${API_URL}/predict`, payload)
      setPrediction(res.data)
      setAlertActive(res.data.alert)
    } catch (err) {
      console.error("Prediction error:", err)
    }
  }

  // Main simulation loop
  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => {
      const vitals = generateVitals(stepRef.current)
      stepRef.current += 1
      setStep(s => s + 1)

      addReading(vitals)
      setHistory(prev => [...prev.slice(-60), {
        time:  stepRef.current,
        spo2:  vitals.spo2,
        hr:    vitals.hr,
        rr:    vitals.rr,
      }])
      fetchPrediction()
    }, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [isRunning])

  const latest = history[history.length - 1] || { spo2: "--", hr: "--", rr: "--" }
  const riskColor = prediction ? getRiskColor(prediction.risk_level) : "#22c55e"
  const riskBg    = prediction ? getRiskBg(prediction.risk_level)    : "#f0fdf4"

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f3f4f6",
      fontFamily: "'Inter', sans-serif",
      padding: 24,
    }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>
            🫁 Predictive Hypoxia Monitor
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
            Patient: DEMO-001 · LSTM prediction horizon: 15 minutes
          </p>
        </div>
        <button
          onClick={() => {
            if (isRunning) {
              setIsRunning(false)
            } else {
              windowRef.current = []
              stepRef.current   = 0
              setStep(0)
              setHistory([])
              setPrediction(null)
              setAlertActive(false)
              setIsRunning(true)
            }
          }}
          style={{
            padding: "10px 24px",
            borderRadius: 8,
            border: "none",
            background: isRunning ? "#ef4444" : "#3b82f6",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          {isRunning ? "⏹ Stop Demo" : "▶ Start Demo"}
        </button>
      </div>

      {/* ── Alert Banner ── */}
      {alertActive && (
        <div style={{
          background: "#ef4444",
          color: "white",
          borderRadius: 12,
          padding: "16px 24px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 12,
          animation: "pulse 1s infinite",
        }}>
          <span style={{ fontSize: 24 }}>🚨</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>CRITICAL ALERT — Hypoxia Predicted</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>{prediction?.message}</div>
          </div>
        </div>
      )}

      {/* ── Vital Cards ── */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <VitalCard label="SpO₂"            value={latest.spo2} unit="%" normal={95} warning={90} />
        <VitalCard label="Heart Rate"      value={latest.hr}   unit="bpm" normal={100} warning={60} />
        <VitalCard label="Respiratory Rate" value={latest.rr}  unit="br/min" normal={20} warning={12} />
      </div>

      {/* ── Charts ── */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        {/* SpO2 Chart */}
        <div style={{ flex: 2, background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: "#111827" }}>SpO₂ Trend</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} label={{ value: "Time (steps)", position: "insideBottom", offset: -2 }} />
              <YAxis domain={[80, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "Hypoxia threshold", fill: "#ef4444", fontSize: 11 }} />
              <Line type="monotone" dataKey="spo2" stroke="#3b82f6" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* HR + RR Chart */}
        <div style={{ flex: 1, background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: "#111827" }}>HR & RR Trend</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="hr" stroke="#f59e0b" dot={false} strokeWidth={2} name="HR" />
              <Line type="monotone" dataKey="rr" stroke="#8b5cf6" dot={false} strokeWidth={2} name="RR" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Risk Prediction Panel ── */}
      <div style={{
        background: riskBg,
        border: `2px solid ${riskColor}`,
        borderRadius: 12,
        padding: 24,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
      }}>
        <div style={{ fontWeight: 600, color: "#111827", marginBottom: 16 }}>
          🧠 LSTM Prediction Engine
        </div>
        {prediction ? (
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>Risk Level</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: riskColor }}>
                {prediction.risk_level}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>Hypoxia Probability</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: riskColor }}>
                {(prediction.probability * 100).toFixed(1)}%
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>Risk Meter</div>
              <div style={{ background: "#e5e7eb", borderRadius: 999, height: 12 }}>
                <div style={{
                  width: `${prediction.probability * 100}%`,
                  background: riskColor,
                  borderRadius: 999,
                  height: "100%",
                  transition: "width 0.5s ease"
                }} />
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                Alert threshold: 87%
              </div>
            </div>
            <div style={{ maxWidth: 300 }}>
              <div style={{ fontSize: 13, color: "#6b7280" }}>Message</div>
              <div style={{ fontSize: 14, color: "#374151" }}>{prediction.message}</div>
            </div>
          </div>
        ) : (
          <div style={{ color: "#6b7280", fontSize: 14 }}>
            {isRunning ? "Collecting vitals... (need 30 readings before prediction)" : "Press Start Demo to begin simulation"}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  )
}
