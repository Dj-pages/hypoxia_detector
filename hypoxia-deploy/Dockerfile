FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy model files
COPY saved_models/ ./saved_models/
COPY data/processed/scaler.pkl ./data/processed/scaler.pkl
COPY inference.py .
COPY model.py .

# HuggingFace Spaces runs on port 7860
EXPOSE 7860

CMD ["uvicorn", "inference:app", "--host", "0.0.0.0", "--port", "7860"]
