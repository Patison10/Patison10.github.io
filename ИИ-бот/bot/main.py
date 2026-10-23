import asyncio
import logging
import time
from collections import defaultdict, deque

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command, CommandObject
from aiogram.types import Message

from .ai import AIClient
from .config import load_settings
from .db import Database
from .service import Dialog

log = logging.getLogger("bot")

GREETING = (
    "Здравствуйте! Я Макс, администратор барбершопа «{name}». "
    "Подскажу по услугам и ценам, помогу выбрать стрижку и записаться. Чем помочь?"
)


def format_request(r) -> str:
    who = f"@{r['username']}" if r["username"] else f"id {r['chat_id']}"
    return (
        f"Заявка #{r['id']} ({r['status']})\n"
        f"Имя: {r['name']}\nТелефон: {r['phone']}\nУслуга: {r['service']}\n"
        f"Когда: {r['desired_time']}\nКомментарий: {r['comment'] or '-'}\nTelegram: {who}"
    )


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    s = load_settings()
    if not s.token or not s.ai_api_key:
        raise SystemExit("Заполни TELEGRAM_BOT_TOKEN и AI_API_KEY в .env (см. .env.example)")

    db = Database(s.db_path)
    ai = AIClient(s.ai_base_url, s.ai_api_key, s.ai_models)
    dialog = Dialog(db, ai, s.shop, s.history_limit)
    bot, dp = Bot(s.token), Dispatcher()
    hits: dict[int, deque] = defaultdict(deque)

    def is_admin(m: Message) -> bool:
        return m.from_user.id in s.admin_ids

    def limited(uid: int) -> bool:
        q, now = hits[uid], time.monotonic()
        while q and now - q[0] > 60:
            q.popleft()
        q.append(now)
        return len(q) > s.rate_limit

    @dp.message(Command("start"))
    async def start(m: Message):
        db.clear_history(m.chat.id)
        await m.answer(GREETING.format(name=s.shop["name"]))

    @dp.message(Command("myid"))
    async def myid(m: Message):
        await m.answer(f"Ваш Telegram ID: {m.from_user.id}")

    @dp.message(Command("requests"))
    async def requests(m: Message):
        if not is_admin(m):
            return
        rows = db.requests("new")
        await m.answer("\n\n".join(format_request(r) for r in rows) if rows else "Новых заявок нет.")

    @dp.message(Command("done"))
    async def done(m: Message, command: CommandObject):
        if not is_admin(m):
            return
        arg = (command.args or "").strip()
        ok = arg.isdigit() and db.set_status(int(arg), "done")
        await m.answer("Отмечено как обработанная." if ok else "Использование: /done <номер заявки>")

    @dp.message(F.text)
    async def chat(m: Message):
        if limited(m.from_user.id):
            await m.answer("Секунду, я не успеваю за вашими сообщениями 🙂 Подождите немного.")
            return
        await bot.send_chat_action(m.chat.id, "typing")
        answer, request_id = await dialog.reply(m.chat.id, m.from_user.username, m.text[:2000])
        await m.answer(answer)
        if request_id:
            row = db.requests(None, 1)[0]
            for admin in s.admin_ids:
                try:
                    await bot.send_message(admin, "🆕 Новая заявка\n" + format_request(row))
                except Exception:
                    log.exception("Не удалось уведомить администратора %s", admin)

    try:
        await dp.start_polling(bot)
    finally:
        await ai.close()


if __name__ == "__main__":
    asyncio.run(main())
