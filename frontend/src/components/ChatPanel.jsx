import React, { useRef, useState } from 'react';

export default function ChatPanel({ messages, onSend, loading, disabledReason }) {
  const [value, setValue] = useState('');
  const listRef = useRef(null);

  const handleSend = () => {
    const text = value.trim();
    if (!text || loading) return;
    onSend(text);
    setValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="panel-section chat">
      <div className="panel-heading">
        Test your agent
        {messages.length > 0 && <span className="count">{messages.length}</span>}
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            Send a message below to chat with your agent. Watch the canvas light up when it
            reaches for a tool.
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.text}
          </div>
        ))}

        {loading && (
          <div className="chat-msg thinking">
            <span className="dot-bounce">
              <span />
              <span />
              <span />
            </span>
            thinking
          </div>
        )}
      </div>

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={1}
          placeholder={disabledReason || 'Ask your agent something...'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn primary" onClick={handleSend} disabled={loading || !value.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
