from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("REALMFLOW_SIDECAR_HOST", "127.0.0.1")
    port: int = int(os.getenv("REALMFLOW_SIDECAR_PORT", "8765"))


settings = Settings()
