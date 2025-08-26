import React, { useEffect, useRef, useState } from "react";
import "./ChatBot.css";

// 1) стабильный sessionId в localStorage
const SESSION_KEY = "chat_session_id";
function getSessionId(): string {
  try {
    let id: string | null = localStorage.getItem(SESSION_KEY);
    if (id == null || id === "") {
      const newId =
        (crypto as any)?.randomUUID?.() ??
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, newId);
      return newId;
    }
    return id;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

type Message = {
  id: string;
  from: "user" | "bot";
  text: string;
  ts: number;
};

const MAKE_WEBHOOK_URL =
  "https://hook.eu2.make.com/9woeodiordj6x9fj7wiv799jpolqcy55";

// !!! Задай любой секрет и добавь проверку в Make (headers.x-webhook-token)
const MAKE_WEBHOOK_SECRET = "snugens_2025";

// --- utils ---

const safeText = (v: unknown) =>
  typeof v === "string" ? v : v == null ? "" : String(v);

const fetchWithTimeout = async (url: string, opts: RequestInit, ms = 15000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

// Универсальная отправка событий в Make
async function postToMake(payload: any, timeoutMs = 20000) {
  return fetchWithTimeout(
    MAKE_WEBHOOK_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Token": MAKE_WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    },
    timeoutMs
  );
}

// Лояльно вытаскиваем телефон из текста
function extractPhone(raw: string): string | null {
  if (!raw) return null;
  // убираем пробелы/скобки/дефисы для поиска
  const compact = raw.replace(/[\s\-\(\)]/g, "");
  // примитив: ищем 10–15 цифр, возможно с +
  const m = compact.match(/(\+?\d{10,15})/);
  return m ? m[1] : null;
}

function cleanPhone(p: string): string {
  return p.replace(/[^\d+]/g, "");
}

// Парсим ответ от твоего сценария Make
function parseRelaxed(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.reply === "string") return parsed.reply.trim();
    if (typeof (parsed?.content ?? parsed?.result) === "string")
      return (parsed.content ?? parsed.result).trim();
  } catch {
    // не JSON — норм
  }
  const tmp = document.createElement("div");
  tmp.innerHTML = raw;
  return (tmp.textContent || tmp.innerText || "").trim();
}

function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: crypto.randomUUID(),
      from: "bot",
      text: "Привіт 👋 Я онлайн-асистент. Питай що завгодно.",
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const listRef = useRef<HTMLDivElement>(null);

  // автоскролл вниз
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const sessionId = getSessionId();
    const now = Date.now();
    const page = location.pathname;
    const ua = navigator.userAgent;
    const source = "webChat";

    const userMsg: Message = {
      id: crypto.randomUUID(),
      from: "user",
      text,
      ts: now,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    // 1) логируем сообщение пользователя в Make → Sheets
    postToMake({
      event: "message",
      actor: "user",
      message: text,
      sessionId,
      source,
      timestamp: now,
      name: null, // если на странице есть поле "Имя", подставь сюда
      phone: null, // явная передача, пусть сценарий не путается
      meta: {
        page,
        ua,
      },
    }).catch(() => { /* не мешаем UX, но в консоль можно кинуть */ });

    // 2) если нашли телефон — шлём отдельное событие "lead" (для Firebase+Telegram)
    const maybePhone = extractPhone(text);
    if (maybePhone) {
      const phone = cleanPhone(maybePhone);
      postToMake({
        event: "lead",
        sessionId,
        source,
        timestamp: now,
        name: null, // подставишь если знаешь имя
        phone,
        meta: {
          page,
          ua,
        },
      }).catch(() => {});
    }

    try {
      // 3) основной запрос за ответом бота (как у тебя и было)
      const res = await postToMake(
        {
          event: "chat",
          message: text,
          sessionId,
          meta: { page, ua },
          source,
        },
        20000
      );

      const raw = await res.text();
      let reply = parseRelaxed(raw);

      if (!reply) {
        reply = res.ok
          ? "Я тебя услышал(а), но ответ выглядит пустым 🤔"
          : `Сервер ответил ошибкой ${res.status}`;
      }

      const botMsg: Message = {
        id: crypto.randomUUID(),
        from: "bot",
        text: safeText(reply),
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, botMsg]);

      // 4) логируем сообщение бота в Make → Sheets
      postToMake({
        event: "message",
        actor: "bot",
        message: botMsg.text,
        sessionId,
        source,
        timestamp: botMsg.ts,
        name: "bot",
        phone: null,
        meta: { page, ua },
      }).catch(() => {});
    } catch (err: any) {
      const reason =
        err?.name === "AbortError"
          ? "⏱️ Таймаут соединения. Попробуй ещё раз."
          : "⚠️ Нет связи с ботом. Проверь Make или сеть.";
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), from: "bot", text: reason, ts: Date.now() },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-container" role="region" aria-label="Онлайн-чат">
      <div ref={listRef} className="chat-messages">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`chat-message ${m.from}`}
            title={new Date(m.ts).toLocaleString()}
          >
            {m.text}
          </div>
        ))}
      </div>

      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={sending ? "Бот печатает..." : "Напиши сообщение..."}
          disabled={sending}
          aria-label="Поле ввода сообщения"
        />
        <button
          onClick={sendMessage}
          disabled={sending}
          aria-label="Отправить сообщение"
          title="Enter — отправить"
        >
          ➤
        </button>
      </div>

      <div className="chat-hint">
        Подсказка: жми <kbd>Enter</kbd>, чтобы отправить.
      </div>
    </div>
  );
}
export default ChatBot;
