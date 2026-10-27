import json
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent


def _ids(raw: str) -> set[int]:
    return {int(x) for x in raw.replace(" ", "").split(",") if x.strip().lstrip("-").isdigit()}


@dataclass
class Settings:
    token: str
    admin_ids: set[int]
    ai_base_url: str
    ai_api_key: str
    ai_models: list[str]
    db_path: str
    history_limit: int
    rate_limit: int
    shop: dict = field(default_factory=dict)


def load_settings() -> Settings:
    load_dotenv(ROOT / ".env")
    models = [os.getenv("AI_MODEL", "deepseek/deepseek-chat-v3-0324:free").strip()]
    models += [m.strip() for m in os.getenv("AI_FALLBACK_MODELS", "").split(",") if m.strip()]
    shop = json.loads((ROOT / "shop.json").read_text(encoding="utf-8"))
    return Settings(
        token=os.getenv("TELEGRAM_BOT_TOKEN", ""),
        admin_ids=_ids(os.getenv("ADMIN_IDS", "")),
        ai_base_url=os.getenv("AI_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/"),
        ai_api_key=os.getenv("AI_API_KEY", ""),
        ai_models=models,
        db_path=os.getenv("DB_PATH", str(ROOT / "barbershop.db")),
        history_limit=int(os.getenv("HISTORY_LIMIT", "16")),
        rate_limit=int(os.getenv("RATE_LIMIT_PER_MIN", "8")),
        shop=shop,
    )
