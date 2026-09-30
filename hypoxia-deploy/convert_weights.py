"""
convert_weights.py
─────────────────────────────────────────────────────
Converts model_weights.h5 → saved_models/best_model.keras

Run this ONCE on your local machine before uploading to HuggingFace.

Usage:
    python convert_weights.py
"""

import os
import tensorflow as tf
from model import build_lstm_model

WEIGHTS_PATH = "model_weights.h5"
OUTPUT_PATH  = "saved_models/best_model.keras"

os.makedirs("saved_models", exist_ok=True)

print("Building model architecture...")
model = build_lstm_model(
    input_shape=(30, 3),
    lstm_units=[128, 64],
    dropout_rate=0.3,
)

print(f"Loading weights from {WEIGHTS_PATH}...")
model.load_weights(WEIGHTS_PATH)

print(f"Saving full model to {OUTPUT_PATH}...")
model.save(OUTPUT_PATH)

print(f"\nDone! File size: {os.path.getsize(OUTPUT_PATH) / 1e6:.1f} MB")
print(f"Ready to upload: {OUTPUT_PATH}")
