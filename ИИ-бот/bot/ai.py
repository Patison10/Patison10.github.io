import asyncio
import logging

import httpx

log = logging.getLogger(__name__)


class AIError(Exception):
    pass


class AIClient:
    """Клиент любого OpenAI-совместимого API (OpenRouter, Groq, Gemini и т.д.)."""

    def __init__(self, base_url: str, api_key: str, models: list[str], timeout: float = 60):
        self.base_url = base_url
        self.api_key = api_key
        self.models = models
        self._http = httpx.AsyncClient(timeout=timeout)

    async def chat(self, messages: list[dict], rounds: int = 3) -> str:
        """Перебирает модели; бесплатные часто перегружены (429), поэтому несколько кругов с паузой."""
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        last_err: Exception | None = None
        for attempt in range(rounds):
            if attempt:
                await asyncio.sleep(2 * attempt)
            for model in self.models:
                try:
                    r = await self._http.post(
                        f"{self.base_url}/chat/completions",
                        headers=headers,
                        json={"model": model, "messages": messages, "temperature": 0.7, "max_tokens": 600},
                    )
                    r.raise_for_status()
                    text = (r.json()["choices"][0]["message"].get("content") or "").strip()
                    if text:
                        return text
                    last_err = AIError(f"{model}: пустой ответ")
                except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
                    log.warning("Модель %s не ответила: %s", model, e)
                    last_err = e
        raise AIError(f"Все модели недоступны: {last_err}")

    async def close(self) -> None:
        await self._http.aclose()
