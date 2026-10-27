import shop from "../../shop.json";
import { buildSystemPrompt, extractBooking, stripThink } from "./logic.js";

const FALLBACK =
  "Простите, сейчас небольшой сбой. Напишите чуть позже или позвоните нам, администратор всё подскажет.";
const GREETING = `Здравствуйте! Я Макс, администратор барбершопа «${shop.name}». Подскажу по услугам и ценам, помогу выбрать стрижку и записаться. Чем помочь?`;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id)`,
  `CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, username TEXT, name TEXT NOT NULL, phone TEXT NOT NULL, service TEXT NOT NULL, desired_time TEXT NOT NULL, comment TEXT, status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL)`,
];
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((q) => db.prepare(q)));
  schemaReady = true;
}

async function tg(env, method, body) {
  const r = await fetch(`${env.TG_API || "https://api.telegram.org"}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function askAI(env, messages) {
  const models = [env.AI_MODEL, ...(env.AI_FALLBACK_MODELS || "").split(",")]
    .map((m) => m.trim())
    .filter(Boolean);
  for (let round = 0; round < 3; round++) {
    if (round) await sleep(1500 * round);
    for (const model of models) {
      try {
        const r = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.AI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 600 }),
        });
        if (!r.ok) continue;
        const j = await r.json();
        const text = (j.choices?.[0]?.message?.content || "").trim();
        if (text) return text;
      } catch {
        /* пробуем следующую модель */
      }
    }
  }
  return null;
}

function formatRequest(r) {
  const who = r.username ? `@${r.username}` : `id ${r.chat_id}`;
  return `Заявка #${r.id} (${r.status})\nИмя: ${r.name}\nТелефон: ${r.phone}\nУслуга: ${r.service}\nКогда: ${r.desired_time}\nКомментарий: ${r.comment || "-"}\nTelegram: ${who}`;
}

const adminIds = (env) =>
  (env.ADMIN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

async function handleMessage(env, msg) {
  const db = env.DB;
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  if (!text) return;
  const send = (t) => tg(env, "sendMessage", { chat_id: chatId, text: t });
  const isAdmin = adminIds(env).includes(String(msg.from.id));
  await ensureSchema(db);

  if (text.startsWith("/start")) {
    await db.prepare("DELETE FROM messages WHERE chat_id=?").bind(chatId).run();
    return send(GREETING);
  }
  if (text.startsWith("/myid")) return send(`Ваш Telegram ID: ${msg.from.id}`);
  if (text.startsWith("/requests")) {
    if (!isAdmin) return;
    const { results } = await db
      .prepare("SELECT * FROM requests WHERE status='new' ORDER BY id DESC LIMIT 20")
      .all();
    return send(results.length ? results.map(formatRequest).join("\n\n") : "Новых заявок нет.");
  }
  if (text.startsWith("/done")) {
    if (!isAdmin) return;
    const id = parseInt(text.split(/\s+/)[1], 10);
    const res = id ? await db.prepare("UPDATE requests SET status='done' WHERE id=?").bind(id).run() : null;
    return send(res?.meta?.changes ? "Отмечено как обработанная." : "Использование: /done <номер заявки>");
  }
  if (text.startsWith("/")) return;

  const limit = parseInt(env.RATE_LIMIT_PER_MIN || "8", 10);
  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE chat_id=? AND role='user' AND created_at>?")
    .bind(chatId, Date.now() - 60000)
    .first();
  if (recent.n >= limit) return send("Секунду, я не успеваю за вашими сообщениями 🙂 Подождите немного.");

  await tg(env, "sendChatAction", { chat_id: chatId, action: "typing" });
  await db
    .prepare("INSERT INTO messages(chat_id, role, content, created_at) VALUES (?,?,?,?)")
    .bind(chatId, "user", text.slice(0, 2000), Date.now())
    .run();
  const { results: rows } = await db
    .prepare("SELECT role, content FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT ?")
    .bind(chatId, parseInt(env.HISTORY_LIMIT || "16", 10))
    .all();
  const history = rows.reverse();
  const raw = await askAI(env, [{ role: "system", content: buildSystemPrompt(shop) }, ...history]);
  if (raw === null) return send(FALLBACK);

  const { text: clean, booking } = extractBooking(stripThink(raw));
  const answer = clean || "Готово, передал заявку администратору.";
  await db
    .prepare("INSERT INTO messages(chat_id, role, content, created_at) VALUES (?,?,?,?)")
    .bind(chatId, "assistant", answer, Date.now())
    .run();
  await send(answer);

  if (booking) {
    const res = await db
      .prepare(
        "INSERT INTO requests(chat_id, username, name, phone, service, desired_time, comment, created_at) VALUES (?,?,?,?,?,?,?,?)"
      )
      .bind(chatId, msg.from.username || null, booking.name, booking.phone, booking.service, booking.datetime, booking.comment || "", Date.now())
      .run();
    const row = await db.prepare("SELECT * FROM requests WHERE id=?").bind(res.meta.last_row_id).first();
    for (const admin of adminIds(env)) {
      await tg(env, "sendMessage", { chat_id: admin, text: "🆕 Новая заявка\n" + formatRequest(row) });
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Одноразовая регистрация вебхука: открыть https://<воркер>/setup?key=<WEBHOOK_SECRET>
    if (url.pathname === "/setup") {
      if (!env.WEBHOOK_SECRET || url.searchParams.get("key") !== env.WEBHOOK_SECRET)
        return new Response("forbidden", { status: 403 });
      const res = await tg(env, "setWebhook", {
        url: `${url.origin}/webhook`,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ["message"],
      });
      return new Response(JSON.stringify(res, null, 2), { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET)
        return new Response("forbidden", { status: 403 });
      const update = await request.json();
      if (update.message) ctx.waitUntil(handleMessage(env, update.message).catch((e) => console.error(e)));
      return new Response("ok"); // отвечаем сразу, чтобы Telegram не присылал повторы
    }

    return new Response("Barbershop bot is running");
  },
};
