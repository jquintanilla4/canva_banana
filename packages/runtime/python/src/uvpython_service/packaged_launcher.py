from __future__ import annotations

import os

import uvicorn

from uvpython_service.main import app


def _read_port() -> int:
    raw_port = os.environ.get("CANVA_BANANA_PYTHON_PORT", "8000").strip()
    return int(raw_port)  # Electron assigns a loopback port before launching this process.


def main() -> None:
    host = os.environ.get("CANVA_BANANA_PYTHON_HOST", "127.0.0.1").strip() or "127.0.0.1"
    uvicorn.run(
        app,
        host=host,
        port=_read_port(),
        log_level=os.environ.get("CANVA_BANANA_PYTHON_LOG_LEVEL", "info").strip() or "info",
    )  # Start the same FastAPI app without requiring uv or a repo checkout.


if __name__ == "__main__":
    main()
