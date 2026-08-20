FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN apt-get update \
    && apt-get install --no-install-recommends --yes tesseract-ocr tesseract-ocr-deu \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir --requirement requirements.txt \
    && addgroup --system coreline \
    && adduser --system --ingroup coreline coreline

COPY app ./app

USER coreline
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT','8000') + '/api/health', timeout=3)"

CMD ["sh", "-c", "uvicorn app.integration_app:app --host 0.0.0.0 --port ${PORT:-8000}"]
