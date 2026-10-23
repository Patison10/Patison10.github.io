# Бот на Cloudflare Workers (бесплатно, без карты, работает 24/7)

Та же логика, что в Python-версии, но в режиме webhook: Telegram сам вызывает воркер, ничего не нужно держать включённым. Заявки и история хранятся в D1 (SQLite от Cloudflare). Бесплатных лимитов (100 тыс. запросов в день) для барбершопа хватает с запасом.

## Установка с телефона (браузер)
1. Зарегистрируйтесь на https://dash.cloudflare.com (почта и пароль, карта не нужна).
2. **Workers & Pages → Create → Import a repository** (подключить GitHub). Выберите репозиторий `Patison10.github.io`, ветку `claude/barbershop-ai-bot-unq7ah`.
   - Root directory: `ИИ-бот/cloudflare`
   - Deploy command: `npx wrangler deploy`
   - Нажмите Deploy. База D1 `barbershop-bot` должна создаться автоматически. Если деплой пишет, что не найден `database_id`, создайте базу вручную: **Storage & Databases → D1 → Create** с именем `barbershop-bot`, скопируйте её ID в `wrangler.toml` (строка `database_id = "..."` в блоке `[[d1_databases]]`) и задеплойте снова.
3. Откройте воркер → **Settings → Variables and Secrets → Add** и добавьте как *Secret*:
   - `TELEGRAM_BOT_TOKEN` - токен от BotFather
   - `AI_API_KEY` - ключ OpenRouter
   - `ADMIN_IDS` - ваш Telegram ID (несколько - через запятую)
   - `WEBHOOK_SECRET` - любая длинная случайная строка из латинских букв и цифр
4. Один раз откройте в браузере `https://<имя-воркера>.<ваш-аккаунт>.workers.dev/setup?key=<WEBHOOK_SECRET>`. Ответ `"ok": true` значит, что Telegram подключён. Напишите боту.

## Запасной вариант без GitHub
Workers & Pages → Create → Hello World → Deploy → Edit code: вставьте содержимое `dist/worker.js` (уже собранный единый файл), затем добавьте D1 (Bindings → D1 database, имя переменной `DB`), переменные `AI_BASE_URL`, `AI_MODEL`, `AI_FALLBACK_MODELS` из `wrangler.toml` и секреты из шага 3.

## Обновление данных барбершопа
Правьте `../shop.json` в репозитории: воркер пересоберётся автоматически. Если ставили через `dist/worker.js`, пересоберите файл: `npx wrangler deploy --dry-run --outdir out`.

Важно: не запускайте одновременно Python-версию и воркер с одним токеном. Telegram отдаёт обновления только одному способу (webhook или polling).

Тесты логики: `npm install && npm test`.
