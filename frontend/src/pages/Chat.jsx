import React, { useEffect, useRef, useState } from "react";
import { Panel } from "../components/Panel";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

export default function Chat() {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  function load() {
    api.chatList(token).then(setMessages).catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const msg = await api.chatSend(token, text.trim());
      setMessages((m) => [...m, msg]);
      setText("");
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <Panel title="Team chat" className="h-[calc(100vh-160px)]">
      {error && <div className="text-thread text-sm mb-2 font-mono">{error}</div>}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[70%] px-3 py-2 rounded text-sm ${
              m.username === user?.username
                ? "bg-cyan/15 text-paper ml-auto"
                : "bg-panel2 text-paper"
            }`}
          >
            <div className="font-mono text-[10px] text-faint mb-0.5">{m.username}</div>
            {m.body}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 mt-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the team..."
          className="flex-1 bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-cyan transition-colors"
        />
        <button
          type="submit"
          className="bg-cyan hover:brightness-110 text-onaccent text-sm font-semibold px-4 py-2 rounded transition-all"
        >
          Send
        </button>
      </form>
    </Panel>
  );
}
