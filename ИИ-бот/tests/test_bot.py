import pytest

from bot.ai import AIError
from bot.db import Database
from bot.prompt import extract_booking
from bot.service import FALLBACK, Dialog

SHOP = {"name": "Тест", "address": "a", "phone": "1", "hours": "h", "services": [], "barbers": []}
GOOD = '{"name":"Иван","phone":"+79990000000","service":"Стрижка","datetime":"завтра 18:00"}'


class FakeAI:
    def __init__(self, answer=None, error=False):
        self.answer, self.error = answer, error

    async def chat(self, messages):
        if self.error:
            raise AIError("down")
        return self.answer


def test_extract_ok():
    text, data = extract_booking(f"Готово!\n[[BOOKING {GOOD}]]")
    assert text == "Готово!" and data["name"] == "Иван"


def test_extract_missing_field_or_bad_json():
    assert extract_booking('Ок [[BOOKING {"name":"x"}]]')[1] is None
    assert extract_booking("Ок [[BOOKING {oops}]]") == ("Ок", None)
    assert extract_booking("просто текст") == ("просто текст", None)


@pytest.mark.asyncio
async def test_booking_saved_and_hidden():
    db = Database(":memory:")
    d = Dialog(db, FakeAI(f"<think>hmm</think>Записал!\n[[BOOKING {GOOD}]]"), SHOP, 10)
    answer, rid = await d.reply(1, "u", "да, отправляй")
    assert answer == "Записал!" and rid == 1
    assert db.requests()[0]["phone"] == "+79990000000"
    assert [m["role"] for m in db.history(1, 10)] == ["user", "assistant"]


@pytest.mark.asyncio
async def test_ai_down_gives_fallback():
    db = Database(":memory:")
    answer, rid = await Dialog(db, FakeAI(error=True), SHOP, 10).reply(1, None, "привет")
    assert answer == FALLBACK and rid is None


def test_status():
    db = Database(":memory:")
    rid = db.add_request(1, "u", dict(name="a", phone="b", service="c", datetime="d"))
    assert db.set_status(rid, "done") and not db.requests("new")
