import os

import uvicorn

from app import create_app


if __name__ == "__main__":
    uvicorn.run(
        create_app(),
        host=os.getenv("REALMFLOW_SIDECAR_HOST", "127.0.0.1"),
        port=int(os.getenv("REALMFLOW_SIDECAR_PORT", "8765")),
        log_level=os.getenv("REALMFLOW_LOG_LEVEL", "info"),
    )
