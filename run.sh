#!/bin/bash
# Launch script for Internet Performance & Security Simulator
set -e

# Loyiha joylashgan papkaga o'tish
cd "$(dirname "$0")"

# Virtual environment mavjud bo'lsa faollashtirish
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
elif [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
fi

echo "=========================================================="
echo "🚀 Internet unumdorligi va xavfsizlik simulyatori boshlanmoqda..."
echo "🔗 Brauzerda ochilmoqda: http://127.0.0.1:8080"
echo "🛡️ Admin Panel manzili: http://127.0.0.1:8080/admin"
echo "=========================================================="

# Brauzerni 1 soniyadan keyin avtomatik ochish
(sleep 1.2 && open http://127.0.0.1:8080) &

# Uvicorn orqali main:app ni 8080-portda ishga tushirish
# Agar uvicorn bo'lmasa, server.py orqali ishlaydi
if python3 -c "import uvicorn" 2>/dev/null; then
    exec python3 -m uvicorn main:app --host 127.0.0.1 --port 8080 --reload
else
    exec python3 server.py
fi
