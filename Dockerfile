FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY Frontend/package.json Frontend/package-lock.json* /app/Frontend/
WORKDIR /app/Frontend
RUN npm install --production=false
WORKDIR /app

COPY backend/ /app/backend/
COPY Frontend/ /app/Frontend/

WORKDIR /app/Frontend
RUN npm run build
WORKDIR /app

EXPOSE 8000 4173

COPY <<'EOF' /app/start.sh
#!/bin/bash
cd /app/Frontend && npx vite preview --host 0.0.0.0 --port 4173 &
cd /app/backend && uvicorn main:app --host 0.0.0.0 --port 8000
EOF
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
