import React, { useEffect, useRef, useState } from "react";
import "./ChatBot.css";

type Message = {
  id: string;
  from: "user" | "bot";
  text: string;
  ts: number;
};

const MAKE_WEBHOOK_URL =
  "https://hook.eu2.make.com/3avlu7axojiz4ausryvj5sexnwhigvh6";

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

  // автоскролл вниз при новых сообщениях
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

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
      const res = await fetch(MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // при желании добавь userId/sessionId в payload
        body: JSON.stringify({ message: text }),
      });

      const data: { reply?: string } = await res.json().catch(() => ({}));
      const replyText =
        (typeof data?.reply === "string" && data.reply.trim()) ||
        (res.ok
          ? "Я почув(ла) тебе, але щось пішло не так із відповіддю 🤔"
          : `Сервер відповів помилкою ${res.status}`);

      const botMsg: Message = {
        id: crypto.randomUUID(),
        from: "bot",
        text: replyText,
        ts: Date.now(),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          from: "bot",
          text: "⚠️ Нема зв'язку з ботом. Перевір Make або мережу.",
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