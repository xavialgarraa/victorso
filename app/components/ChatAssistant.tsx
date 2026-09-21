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

const QUICK_REPLIES = ['¿Cuál es vuestro horario?', '¿Tenéis envío gratis?', 'Busco un flight case'];

function Avatar() {
  return (
    <span className="chat-avatar" aria-hidden="true">
      <Icon name="chat" />
    </span>
  );
}

export function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const fetcher = useFetcher<ChatResponse>();
  const isLoading = fetcher.state !== 'idle';
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      const {reply, error} = fetcher.data;
      setMessages((prev) => [...prev, {role: 'assistant', content: reply || error || ''}]);
    }
  }, [fetcher.state, fetcher.data]);

  function submitText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const nextMessages = [...messages, {role: 'user' as const, content: trimmed}];
    setMessages(nextMessages);
    setInput('');

    void fetcher.submit(
      {messages: nextMessages},
      {method: 'post', action: '/api/chat', encType: 'application/json'},
    );
  }

  // Nueva función para vaciar el chat
  function clearChat() {
    setMessages([GREETING]);
  }

  return (
    <>
      <button
        type="button"
        className={`chat-float${open ? ' open' : ''}`}
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={open ? 'close' : 'chat'} />
      </button>

      {open && (
        <div className="chat-panel">
          <div className="chat-panel__head">
            <div className="chat-panel__head-info">
              <Avatar />
              <div>
                <span className="chat-panel__title">Asistente Victor So</span>
                <span className="chat-panel__status">
                  <span className="chat-panel__dot" /> En línea
                </span>
              </div>
            </div>
            
            {/* Contenedor para agrupar los botones de la cabecera */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {messages.length > 1 && (
                <button 
                  type="button" 
                  aria-label="Vaciar chat" 
                  title="Vaciar chat"
                  onClick={clearChat}
                >
                  <Icon name="trash" /> {/* Asegúrate de tener este icono, o cámbialo por 'refresh' */}
                </button>
              )}
              <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)}>
                <Icon name="close" />
              </button>
            </div>
          </div>

          <div className="chat-panel__body" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg-row chat-msg-row--${m.role}`}>
                {m.role === 'assistant' && <Avatar />}
                <div className={`chat-msg chat-msg--${m.role}`}>
                  {m.role === 'assistant' ? renderChatMarkdown(m.content) : m.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="chat-msg-row chat-msg-row--assistant">
                <Avatar />
                <div className="chat-msg chat-msg--assistant chat-msg--typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            {messages.length === 1 && !isLoading && (
              <div className="chat-quick-replies">
                {QUICK_REPLIES.map((q) => (
                  <button key={q} type="button" onClick={() => submitText(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            className="chat-panel__form"
            onSubmit={(e) => {
              e.preventDefault();
              submitText(input);
            }}
          >
            <input
              ref={inputRef}
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