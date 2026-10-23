import sqlite3
import threading
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);
CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    username TEXT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    service TEXT NOT NULL,
    desired_time TEXT NOT NULL,
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Database:
    """Тонкая обёртка над sqlite3. Вызовы короткие, поэтому достаточно lock."""

    def __init__(self, path: str):
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._conn.executescript(SCHEMA)

    def add_message(self, chat_id: int, role: str, content: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO messages(chat_id, role, content, created_at) VALUES (?,?,?,?)",
                (chat_id, role, content, _now()),
            )

    def history(self, chat_id: int, limit: int) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT role, content FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT ?",
                (chat_id, limit),
            ).fetchall()
        return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]

    def clear_history(self, chat_id: int) -> None:
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM messages WHERE chat_id=?", (chat_id,))

    def add_request(self, chat_id: int, username: str | None, data: dict) -> int:
        with self._lock, self._conn:
            cur = self._conn.execute(
                "INSERT INTO requests(chat_id, username, name, phone, service, desired_time,"
                " comment, created_at) VALUES (?,?,?,?,?,?,?,?)",
                (
                    chat_id,
                    username,
                    data["name"],
                    data["phone"],
                    data["service"],
                    data["datetime"],
                    data.get("comment") or "",
                    _now(),
                ),
            )
            return cur.lastrowid

    def requests(self, status: str | None = "new", limit: int = 20) -> list[sqlite3.Row]:
        q, args = "SELECT * FROM requests", []
        if status:
            q += " WHERE status=?"
            args.append(status)
        q += " ORDER BY id DESC LIMIT ?"
        args.append(limit)
        with self._lock:
            return self._conn.execute(q, args).fetchall()

    def set_status(self, request_id: int, status: str) -> bool:
        with self._lock, self._conn:
            cur = self._conn.execute(
                "UPDATE requests SET status=? WHERE id=?", (status, request_id)
            )
            return cur.rowcount > 0
