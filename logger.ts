import { Telegraf, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { logger } from "./lib/logger";

const token = process.env["BOT_TOKEN"];
if (!token) throw new Error("BOT_TOKEN is required");

const OWNER_ID = Number(process.env["OWNER_ID"]);
if (!OWNER_ID) throw new Error("OWNER_ID is required");

const supabaseUrl = process.env["SUPABASE_URL"];
const supabaseKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!supabaseUrl || !supabaseKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

export const bot = new Telegraf(token);
const supabase = createClient(supabaseUrl, supabaseKey);

const pendingPayments = new Map<number, { chatId: number; username: string; firstName: string }>();

// ─── helpers ────────────────────────────────────────────────────────────────

function generateToken(): string {
  return `KRT-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

async function hasPurchased(tgId: number): Promise<boolean> {
  const { data } = await supabase
    .from("purchases")
    .select("id")
    .eq("tg_id", tgId.toString())
    .eq("is_active", true)
    .limit(1);
  return (data ?? []).length > 0;
}

// ─── menus ──────────────────────────────────────────────────────────────────

const mainMenu = Markup.keyboard([
  ["🚀 Открыть Квиз", "💰 Купить доступ"],
  ["🔍 Мой статус",   "❓ Помощь"],
]).resize().persistent();

// ─── messages ───────────────────────────────────────────────────────────────

const buyMessage =
  "🔥 *Полный доступ — всего 1490 рублей*\n\n" +
  "И это не просто «доступ» — это уверенность на экзамене.\n\n" +
  "✅ Вся база вопросов без ограничений\n" +
  "✅ Доступ навсегда — платишь один раз\n" +
  "✅ Персональная ссылка сразу после оплаты\n\n" +
  "Подумай: один провал на госах — это пересдача, нервы, потерянное лето. " +
  "1490 рублей — это страховка от этого.\n\n" +
  "💳 *Оплата по СБП:*\n" +
  "+7 917 223-39-13 (Сбербанк)\n\n" +
  "После оплаты нажми кнопку 👇";

const helpMessage =
  "❓ *Помощь*\n\n" +
  "Kurutob Quiz — платформа для подготовки к госэкзаменам КФУ.\n\n" +
  "Что умею:\n" +
  "🚀 *Открыть Квиз* — запустить демо прямо в Telegram\n" +
  "💰 *Купить доступ* — получить полную базу навсегда\n" +
  "🔍 *Мой статус* — проверить уровень доступа\n\n" +
  "Есть вопросы? Пиши разработчику: @muradzade\\_o1";

// ─── user commands ───────────────────────────────────────────────────────────

bot.start((ctx) => {
  ctx.reply(
    "🎓 Привет! Рад видеть тебя здесь.\n\n" +
    "*Kurutob Quiz* — это платформа, на которой студенты КФУ сдают госы уверенно.\n\n" +
    "👇 Выбери действие в меню ниже:",
    { parse_mode: "Markdown", ...mainMenu }
  );
});

bot.hears("🚀 Открыть Квиз", (ctx) => {
  ctx.reply("🚀 Нажми кнопку ниже:", {
    reply_markup: {
      inline_keyboard: [[{ text: "▶️ Запустить демо", web_app: { url: "https://anushervono1.github.io/Demo/" } }]]
    }
  });
});

bot.hears("💰 Купить доступ", async (ctx) => {
  const already = await hasPurchased(ctx.from.id);
  if (already) {
    ctx.reply(
      "🎓 У тебя уже есть полный доступ!\n\n" +
      "Ты уже оплатил и получил персональную ссылку ранее.\n" +
      "Повторная покупка невозможна — доступ уже активирован навсегда.\n\n" +
      "Если потерял ссылку или токен — напиши напрямую: @muradzade\\_o1",
      { parse_mode: "Markdown" }
    );
    return;
  }
  ctx.reply(buyMessage, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [[{ text: "💳 Я оплатил!", callback_data: "paid" }]] }
  });
});

bot.hears("🔍 Мой статус", async (ctx) => {
  const already = await hasPurchased(ctx.from.id);
  if (already) {
    ctx.reply(
      "✅ *Статус: Полный доступ активирован*\n\n" +
      "Ты — в числе подготовленных! Твой доступ к полной базе действует навсегда.\n\n" +
      "🔗 Ссылка: https://anushervono1.github.io/Kurutob/\n\n" +
      "Если потерял токен — напиши @muradzade\\_o1",
      { parse_mode: "Markdown" }
    );
  } else {
    ctx.reply(
      "📊 *Твой текущий статус: Демо-версия*\n\n" +
      "В демо ты видишь лишь малую часть базы. Полная версия — это:\n\n" +
      "🔓 Все вопросы по твоему направлению\n" +
      "🔓 Режим экзамена с таймером\n" +
      "🔓 Разбор правильных ответов\n\n" +
      "Нажми *«💰 Купить доступ»* и закрой вопрос с госами навсегда. 💪",
      { parse_mode: "Markdown" }
    );
  }
});

bot.hears("❓ Помощь", (ctx) => {
  ctx.reply(helpMessage, { parse_mode: "Markdown" });
});

// ─── payment flow ────────────────────────────────────────────────────────────

bot.action("paid", async (ctx) => {
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

  const userId = ctx.from.id;

  // Block duplicate purchases
  const already = await hasPurchased(userId);
  if (already) {
    await ctx.reply(
      "⚠️ У тебя уже есть активный доступ.\n\n" +
      "Повторная оплата невозможна. Если есть вопросы — пиши @muradzade\\_o1",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const firstName = ctx.from.first_name;

  pendingPayments.set(userId, { chatId: ctx.chat!.id, username, firstName });

  await ctx.replyWithAnimation(
    { url: "https://media1.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif" },
    {
      caption:
        "🎉 Ура! Оплата получена — ты молодец!\n\n" +
        "⏳ Сейчас проверяем поступление средств...\n" +
        "Обычно это занимает до 15 минут.\n\n" +
        "Как только подтвердим — сразу пришлём твою персональную ссылку! 🚀",
      parse_mode: "Markdown"
    }
  );

  try {
    await bot.telegram.sendMessage(
      OWNER_ID,
      `💰 Новая заявка на оплату!\n\n` +
      `Пользователь: ${username}\n` +
      `ID: ${userId}\n\n` +
      `Подтвердить: /confirm ${userId}\n` +
      `Отклонить: /reject ${userId}`
    );
  } catch (err) {
    logger.error({ err }, "Failed to notify owner about payment");
  }
});

// ─── admin: only visible & usable by owner ───────────────────────────────────

// /confirm <userId> — подтвердить оплату и выдать доступ
bot.command("confirm", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;

  const targetId = Number(ctx.message.text.split(" ")[1]);
  if (!targetId) return ctx.reply("Использование: /confirm 123456789");

  const pending = pendingPayments.get(targetId);
  if (!pending) return ctx.reply(`Пользователь ${targetId} не найден в ожидающих.\nЕсли нужно выдать вручную — используй /gift`);

  // Prevent double-confirm
  const alreadyBought = await hasPurchased(targetId);
  if (alreadyBought) {
    pendingPayments.delete(targetId);
    return ctx.reply(`⚠️ Пользователь ${pending.username} уже есть в базе как покупатель. Повторная запись не нужна.`);
  }

  const newToken = generateToken();

  // Save to Supabase FIRST — this is the source of truth
  const { error: insertError } = await supabase.from("purchases").insert({
    tg_id: targetId.toString(),
    tg_username: pending.username,
    token: newToken,
    direction: "Не указано",
    is_active: true,
    purchased_at: new Date()
  });

  if (insertError) {
    logger.error({ err: insertError, targetId }, "Failed to insert purchase into Supabase");
    return ctx.reply(`❌ Ошибка записи в базу данных: ${insertError.message}\nПопробуй ещё раз или используй /gift`);
  }

  // Supabase OK — remove from pending immediately
  pendingPayments.delete(targetId);
  logger.info({ targetId, token: newToken }, "Purchase saved to Supabase");

  // Send token to user
  const userMessage =
    `🎊 Поздравляем, ${pending.firstName}!\n\n` +
    `✅ Оплата подтверждена! Доступ навсегда активирован.\n\n` +
    `🔗 Ссылка на полную версию:\nhttps://anushervono1.github.io/Kurutob/\n\n` +
    `🔑 Твой токен: ${newToken}\n\n` +
    `Введи токен на сайте для активации полной базы.\n\n` +
    `Вопросы — пиши @muradzade_o1`;

  try {
    await bot.telegram.sendAnimation(
      pending.chatId,
      { url: "https://media1.giphy.com/media/26tOZ42Mg6pbTUPHW/giphy.gif" },
      { caption: userMessage }
    );
  } catch {
    // Animation failed — send plain text instead
    try {
      await bot.telegram.sendMessage(pending.chatId, userMessage);
    } catch (msgErr) {
      logger.error({ err: msgErr, targetId }, "Failed to send any message to user");
      // Tell owner the token so they can forward it manually
      await ctx.reply(
        `⚠️ Не удалось отправить сообщение пользователю ${pending.username}.\n\n` +
        `Токен для ручной передачи:\n${newToken}\n\n` +
        `Ссылка: https://anushervono1.github.io/Kurutob/`
      );
    }
  }

  await ctx.reply(`✅ Доступ выдан пользователю ${pending.username} (${targetId})\nТокен: ${newToken}`);
  logger.info({ targetId, token: newToken }, "Access granted to user");
});

// /reject <userId> — отклонить заявку
bot.command("reject", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;

  const targetId = Number(ctx.message.text.split(" ")[1]);
  if (!targetId) return ctx.reply("Использование: /reject 123456789");

  const pending = pendingPayments.get(targetId);
  if (!pending) return ctx.reply("Пользователь не найден в ожидающих.");

  pendingPayments.delete(targetId);

  try {
    await bot.telegram.sendMessage(
      pending.chatId,
      "❌ К сожалению, оплата не была подтверждена.\n\n" +
      "Если ты точно переводил — пришли скриншот чека сюда или напиши @muradzade_o1"
    );
    await ctx.reply(`🚫 Заявка ${pending.username} отклонена.`);
  } catch (err) {
    ctx.reply("Ошибка при отправке уведомления пользователю.");
  }
});

// /gift <userId> — выдать доступ вручную без оплаты
bot.command("gift", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;

  const args = ctx.message.text.split(" ").slice(1);
  const tgId = args[0];
  if (!tgId) return ctx.reply("Использование: /gift 123456789");

  const newToken = generateToken();

  await supabase.from("purchases").insert({
    tg_id: tgId,
    tg_username: tgId,
    token: newToken,
    is_active: true,
    purchased_at: new Date()
  });

  ctx.reply(`✅ Доступ выдан!\nID: ${tgId}\nТокен: ${newToken}`);
});

// /stats — статистика
// /dbtest — диагностика подключения к Supabase
bot.command("dbtest", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;

  const url = process.env["SUPABASE_URL"] ?? "(не задан)";
  const keyOk = !!(process.env["SUPABASE_SERVICE_ROLE_KEY"]);

  // Показываем URL без секретов
  await ctx.reply(`🔍 Диагностика Supabase:\n\nURL: ${url}\nKey задан: ${keyOk ? "✅ Да" : "❌ Нет"}\n\nПроверяю подключение...`);

  // Тест 1: простой SELECT
  const { data: selectData, error: selectError } = await supabase
    .from("purchases")
    .select("id")
    .limit(1);

  if (selectError) {
    await ctx.reply(`❌ SELECT failed:\ncode: ${selectError.code}\nmessage: ${selectError.message}\nhint: ${selectError.hint ?? "нет"}`);
  } else {
    await ctx.reply(`✅ SELECT работает! Строк в ответе: ${selectData?.length ?? 0}`);
  }

  // Тест 2: INSERT тестовой строки
  const testToken = `TEST-${Date.now()}`;
  const { error: insertError } = await supabase.from("purchases").insert({
    tg_id: "0",
    tg_username: "test",
    token: testToken,
    is_active: false,
    purchased_at: new Date()
  });

  if (insertError) {
    await ctx.reply(`❌ INSERT failed:\ncode: ${insertError.code}\nmessage: ${insertError.message}\nhint: ${insertError.hint ?? "нет"}\n\nСкорее всего нужно выполнить SQL в Supabase (пришлю ниже)`);
    await ctx.reply(
      `Открой Supabase → SQL Editor → вставь и нажми Run:\n\n` +
      `ALTER TABLE purchases DISABLE ROW LEVEL SECURITY;\n\n` +
      `Потом снова напиши /dbtest`
    );
  } else {
    // Удаляем тестовую строку
    await supabase.from("purchases").delete().eq("token", testToken);
    await ctx.reply(`✅ INSERT работает! База данных подключена правильно.\n\nТеперь /confirm должен работать.`);
  }
});

bot.command("stats", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;

  const { count } = await supabase
    .from("purchases")
    .select("*", { count: "exact", head: true });

  ctx.reply(
    `📊 Статистика Kurutob Quiz\n\n` +
    `💳 Всего покупателей: ${count ?? 0}\n` +
    `⏳ Ожидают подтверждения: ${pendingPayments.size}\n\n` +
    `Подробный список: /list`
  );
});

// /list — список последних 10 покупателей
bot.command("list", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;

  const { data } = await supabase
    .from("purchases")
    .select("tg_username, token, purchased_at, is_active")
    .order("purchased_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) {
    return ctx.reply("Покупателей пока нет.");
  }

  const lines = data.map((p, i) => {
    const date = new Date(p.purchased_at).toLocaleDateString("ru-RU");
    const status = p.is_active ? "✅" : "❌";
    return `${i + 1}. ${status} ${p.tg_username} — ${date}\n    Токен: ${p.token}`;
  });

  ctx.reply(`📋 Последние покупатели:\n\n${lines.join("\n\n")}`);
});

// /pending — кто ожидает подтверждения прямо сейчас
bot.command("pending", (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;

  if (pendingPayments.size === 0) {
    return ctx.reply("Нет ожидающих подтверждения.");
  }

  const lines: string[] = [];
  pendingPayments.forEach((v, k) => {
    lines.push(`👤 ${v.username} (ID: ${k})\n   /confirm ${k} | /reject ${k}`);
  });

  ctx.reply(`⏳ Ожидают подтверждения (${pendingPayments.size}):\n\n${lines.join("\n\n")}`);
});

// /revoke <userId> — отозвать доступ
bot.command("revoke", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;

  const tgId = ctx.message.text.split(" ")[1];
  if (!tgId) return ctx.reply("Использование: /revoke 123456789");

  await supabase
    .from("purchases")
    .update({ is_active: false })
    .eq("tg_id", tgId);

  ctx.reply(`🚫 Доступ пользователя ${tgId} деактивирован.`);
});

// /broadcast <текст> — отправить сообщение всем покупателям
bot.command("broadcast", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;

  const text = ctx.message.text.split(" ").slice(1).join(" ");
  if (!text) return ctx.reply("Использование: /broadcast Привет всем!");

  const { data } = await supabase
    .from("purchases")
    .select("tg_id")
    .eq("is_active", true);

  if (!data || data.length === 0) return ctx.reply("Нет активных покупателей.");

  let sent = 0;
  let failed = 0;
  for (const row of data) {
    try {
      await bot.telegram.sendMessage(Number(row.tg_id), `📢 Сообщение от разработчика:\n\n${text}`);
      sent++;
    } catch {
      failed++;
    }
  }

  ctx.reply(`📢 Рассылка завершена.\n✅ Доставлено: ${sent}\n❌ Ошибок: ${failed}`);
});

// ─── text forwarding ─────────────────────────────────────────────────────────

bot.on("text", async (ctx) => {
  if (ctx.from.id === OWNER_ID) return;

  try {
    await bot.telegram.forwardMessage(OWNER_ID, ctx.chat.id, ctx.message.message_id);
  } catch (err) {
    logger.error({ err }, "Failed to forward message to owner");
  }

  if (ctx.message.text.toLowerCase().includes("оплачено")) {
    await ctx.reply("✅ Сообщение переслано разработчику. Ожидай подтверждение в течение 15 минут.");
  }
});

// ─── startup ─────────────────────────────────────────────────────────────────

export function startBot() {
  // Public commands (visible to all users)
  bot.telegram.setMyCommands([
    { command: "start", description: "🏠 Главное меню" },
  ]).catch((err) => logger.error({ err }, "Failed to set public commands"));

  // Admin commands (visible only in owner's chat)
  bot.telegram.setMyCommands([
    { command: "start",     description: "🏠 Главное меню" },
    { command: "confirm",   description: "✅ Подтвердить оплату — /confirm ID" },
    { command: "reject",    description: "❌ Отклонить заявку — /reject ID" },
    { command: "gift",      description: "🎁 Выдать доступ вручную — /gift ID" },
    { command: "revoke",    description: "🚫 Отозвать доступ — /revoke ID" },
    { command: "pending",   description: "⏳ Кто ждёт подтверждения" },
    { command: "list",      description: "📋 Список последних покупателей" },
    { command: "stats",     description: "📊 Статистика продаж" },
    { command: "broadcast", description: "📢 Рассылка всем покупателям" },
    { command: "dbtest",    description: "🔧 Проверить подключение к базе данных" },
  ], { type: "chat", chat_id: OWNER_ID }).catch((err) => logger.error({ err }, "Failed to set admin commands"));

  bot.launch().then(() => {
    logger.info("✅ Бот Kurutob запущен!");
  }).catch((err) => {
    logger.error({ err }, "Failed to start Telegram bot");
  });

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
