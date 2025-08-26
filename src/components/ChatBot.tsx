import React, { useEffect, useRef, useState } from "react";
import "./ChatBot.css"; // важно: относительный импорт


// 1) стабильный sessionId в localStorage
const SESSION_KEY = "chat_session_id";
function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      // fallback, если вдруг нет crypto.randomUUID
      const gen =
        (crypto as any)?.randomUUID?.() ??
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      id = gen;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // на всякий случай — если localStorage недоступен
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
  "https://hook.eu2.make.com/wn3hlh6fj2p91zf3au0mrkrjbzs8lccu";

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

  const parseRelaxed = (raw: string) => {
    // 1) пробуем JSON
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.reply === "string") return parsed.reply.trim();
      // на всякий случай если структура другая
      if (typeof (parsed?.content ?? parsed?.result) === "string")
        return (parsed.content ?? parsed.result).trim();
    } catch {
      // 2) не JSON — вернём как текст
    }
    // 3) вырежем HTML (если кто-то случайно прислал)
    const tmp = document.createElement("div");
    tmp.innerHTML = raw;
    return (tmp.textContent || tmp.innerText || "").trim();
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      from: "user",
      text,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetchWithTimeout(
  MAKE_WEBHOOK_URL,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: text,
      sessionId: getSessionId(), // ← вот этот helper мы вынесли наверх файла
      meta: {
        page: location.pathname,
        ua: navigator.userAgent
      }
    }),
  },
  20000
);


      const raw = await res.text(); // читаем как текст всегда
      let reply = parseRelaxed(raw);

      if (!reply) {
        reply = res.ok
          ? "Я почув(ла) тебе, але відповідь виглядає порожньою 🤔"
          : `Сервер відповів помилкою ${res.status}`;
      }

      const botMsg: Message = {
        id: crypto.randomUUID(),
        from: "bot",
        text: safeText(reply),
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const reason =
        err?.name === "AbortError"
          ? "⏱️ Таймаут з'єднання. Спробуй ще раз."
          : "⚠️ Нема зв'язку з ботом. Перевір Make або мережу.";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          from: "bot",
          text: reason,
          ts: Date.now(),
        },
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
          placeholder={sending ? "Бот друкує..." : "Напиши повідомлення..."}
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
        Порада: натисни <kbd>Enter</kbd>, щоб відправити.
      </div>
    </div>
  );
}
export default ChatBot;