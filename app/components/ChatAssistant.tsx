import {useEffect, useRef, useState} from 'react';
import {useFetcher} from 'react-router';
import {Icon} from '~/lib/icons';
import {renderChatMarkdown} from '~/lib/chatMarkdown';

type ChatMessage = {role: 'user' | 'assistant'; content: string};
type ChatResponse = {reply?: string; error?: string};

const GREETING: ChatMessage = {
  role: 'assistant',
  content: '¡Hola! Soy el asistente de Victor So Professional. ¿En qué puedo ayudarte?',
};

export function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const fetcher = useFetcher<ChatResponse>();
  const isLoading = fetcher.state !== 'idle';
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      const {reply, error} = fetcher.data;
      setMessages((prev) => [...prev, {role: 'assistant', content: reply || error || ''}]);
    }
  }, [fetcher.state, fetcher.data]);

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const nextMessages = [...messages, {role: 'user' as const, content: trimmed}];
    setMessages(nextMessages);
    setInput('');

    void fetcher.submit(
      {messages: nextMessages},
      {method: 'post', action: '/api/chat', encType: 'application/json'},
    );
  }

  return (
    <>
      <button
        type="button"
        className="chat-float"
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={open ? 'close' : 'chat'} />
      </button>

      {open && (
        <div className="chat-panel">
          <div className="chat-panel__head">
            <span>Asistente Victor So</span>
            <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)}>
              <Icon name="close" />
            </button>
          </div>

          <div className="chat-panel__body" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg chat-msg--${m.role}`}>
                {m.role === 'assistant' ? renderChatMarkdown(m.content) : m.content}
              </div>
            ))}
            {isLoading && <div className="chat-msg chat-msg--assistant chat-msg--typing">Escribiendo…</div>}
          </div>

          <form className="chat-panel__form" onSubmit={sendMessage}>
            <input
              type="text"
              placeholder="Escribe tu pregunta…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />
            <button type="submit" aria-label="Enviar" disabled={isLoading || !input.trim()}>
              <Icon name="arrowRight" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
