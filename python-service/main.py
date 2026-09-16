import uvicorn

from app import create_app
from app.core.config import settings


if __name__ == "__main__":
    uvicorn.run(
        create_app(),
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
    )
