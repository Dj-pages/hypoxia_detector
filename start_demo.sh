#!/bin/bash
echo "🚀 Starting Hypoxia Monitoring System..."

# Start Node.js MQTT Bridge
cd ~/projects/hypoxia-bridge
node index.js &
BRIDGE_PID=$!
echo "✅ MQTT Bridge running (PID: $BRIDGE_PID)"

# Start React Dashboard
cd ~/projects/hypoxia-dashboard
npm run dev &
REACT_PID=$!
echo "✅ Dashboard running (PID: $REACT_PID)"

sleep 4
echo ""
echo "🎯 Demo Ready!"
echo "   Dashboard: http://localhost:5173"
echo "   API:       https://DJ-jadhav-hypoxia-prediction-api.hf.space"
echo ""
echo "Press Ctrl+C to stop everything"

# Keep script running so background processes stay alive
wait
