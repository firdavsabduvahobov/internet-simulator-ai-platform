"""
AI Network Simulator — Launcher
Ushbu fayl main.py orqali serverni ishga tushiradi.
Buyruq: python3 server.py
"""
import sys
from main import run_builtin_server, PORT, HAS_FASTAPI

if __name__ == '__main__':
    if HAS_FASTAPI:
        try:
            import uvicorn
            uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
        except Exception:
            run_builtin_server(PORT)
    else:
        run_builtin_server(PORT)
