import re

from .ai import AIClient, AIError
from .db import Database
from .prompt import build_system_prompt, extract_booking

THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)
FALLBACK = (
    "Простите, сейчас небольшой сбой. Напишите чуть позже или позвоните нам, "
    "администратор всё подскажет."
)


class Dialog:
    """Один ответ клиенту: история -> ИИ -> (опционально) заявка."""

    def __init__(self, db: Database, ai: AIClient, shop: dict, history_limit: int):
        self.db, self.ai, self.history_limit = db, ai, history_limit
        self.system = build_system_prompt(shop)

    async def reply(self, chat_id: int, username: str | None, text: str) -> tuple[str, int | None]:
        """Возвращает (ответ клиенту, id созданной заявки или None)."""
        self.db.add_message(chat_id, "user", text)
        messages = [{"role": "system", "content": self.system}]
        messages += self.db.history(chat_id, self.history_limit)
        try:
            raw = await self.ai.chat(messages)
        except AIError:
            return FALLBACK, None
        raw = THINK_RE.sub("", raw).strip()  # у reasoning-моделей (R1) отрезаем рассуждения
        answer, booking = extract_booking(raw)
        request_id = None
        if booking:
            request_id = self.db.add_request(chat_id, username, booking)
        answer = answer or "Готово, передал заявку администратору."
        self.db.add_message(chat_id, "assistant", answer)
        return answer, request_id
