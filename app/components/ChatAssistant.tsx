import {useEffect, useRef, useState} from 'react';
import {useFetcher} from 'react-router';
import {Icon} from '~/lib/icons';
import {renderChatMarkdown, type ChatProduct} from '~/lib/chatMarkdown';

type ChatMessage = {role: 'user' | 'assistant'; content: string; products?: ChatProduct[]};
type ChatResponse = {reply?: string; error?: string; products?: ChatProduct[]};

const GREETING: ChatMessage = {
  role: 'assistant',
  content: '¡Hola! Soy el asistente de Victor So Professional. ¿En qué puedo ayudarte?',
};

const QUICK_REPLIES = ['¿Cuál es vuestro horario?', '¿Tenéis envío gratis?', 'Busco un flight case'];

// Aviso en forma de globo que invita a abrir el chat la primera vez que
// alguien entra a la web — una sola vez por navegador (localStorage), no
// cada visita. Se guarda en cuanto se decide mostrarlo (no cuando se
// cierra), para que no vuelva a salir aunque la persona navegue a otra
// página antes de interactuar con él.
const GREETING_BUBBLE_SEEN_KEY = 'vsp_chat_greeting_seen';
const GREETING_BUBBLE_TITLE = '¡Hola! ¿En qué puedo ayudarte?';
const GREETING_BUBBLE_SUBTITLE = 'Pregunta sobre productos, envíos o tu pedido.';
// Tiene que ser la misma duración que la animación CSS "chat-greeting-out"
// (ver app.css) — el componente se queda montado este rato de más para
// que la animación de salida le dé tiempo a terminar antes de desaparecer
// de golpe.
const GREETING_BUBBLE_EXIT_MS = 220;

function Avatar() {
  return (
    <span className="chat-avatar" aria-hidden="true">
      <img src="/assets/chat-mascot.png" alt="" />
    </span>
  );
}

export function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [showGreetingBubble, setShowGreetingBubble] = useState(false);
  const [greetingClosing, setGreetingClosing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const fetcher = useFetcher<ChatResponse>();
  const isLoading = fetcher.state !== 'idle';
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // El listener de "open-chat-assistant" de abajo se registra una sola vez
  // (deps []), así que no puede llamar a submitText directamente — vería
  // siempre los "messages"/"isLoading" del primer render (closure
  // obsoleta) y reiniciaría la conversación cada vez. Este ref se
  // actualiza en cada render para que siempre apunte a la versión fresca.
  const submitTextRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    // En móvil no forzamos el foco: hacerlo a la vez que la animación de
    // aparición del panel y el teclado abriéndose es lo que provocaba el
    // bugueo/zoom raro. En escritorio (sin teclado virtual) sí es cómodo.
    if (open && typeof window !== 'undefined' && window.matchMedia('(min-width: 481px)').matches) {
      inputRef.current?.focus();
    }
  }, [open]);

  // Espera a que se cierre el aviso de cookies (misma esquina, se
  // solaparían) antes de mostrar el globo — con un tope de 15s por si
  // alguien lo deja abierto sin tocarlo, para que el aviso no se quede
  // esperando para siempre. Si ya se vio una vez, no hace nada.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let alreadySeen = false;
    try {
      alreadySeen = Boolean(window.localStorage.getItem(GREETING_BUBBLE_SEEN_KEY));
    } catch {
      alreadySeen = false;
    }
    if (alreadySeen) return;

    const startedAt = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const cookieBannerVisible = Boolean(document.querySelector('.cookie-consent'));
      if (elapsed < 2000) return;
      if (cookieBannerVisible && elapsed < 15000) return;
      clearInterval(interval);
      setShowGreetingBubble(true);
      try {
        window.localStorage.setItem(GREETING_BUBBLE_SEEN_KEY, '1');
      } catch {
        // Si localStorage no está disponible (modo privado...), no pasa
        // nada grave — el aviso saldrá de nuevo en la próxima visita.
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Reproduce la animación de salida (chat-greeting-out, ver app.css)
  // antes de desmontar el globo del todo, en vez de que desaparezca de
  // golpe a mitad de frame.
  function dismissGreeting() {
    setGreetingClosing(true);
    setTimeout(() => {
      setShowGreetingBubble(false);
      setGreetingClosing(false);
    }, GREETING_BUBBLE_EXIT_MS);
  }

  // El aviso se cierra solo si nadie lo toca, y siempre que se abra el
  // chat por cualquier otro camino (botón, "Modo IA"...).
  useEffect(() => {
    if (!showGreetingBubble) return;
    const timer = setTimeout(dismissGreeting, 10000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGreetingBubble]);

  useEffect(() => {
    if (open) dismissGreeting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Permite abrir el chat desde otros sitios de la web (ej. "sin
  // resultados de búsqueda, pregúntale al asistente", o el botón "Modo IA"
  // del buscador) sin acoplarse directamente a este componente. Si el
  // evento trae un "query" en el detail, se manda directa como primera
  // pregunta en vez de dejar el chat a la espera.
  useEffect(() => {
    const openChat = (e: Event) => {
      setOpen(true);
      const query = (e as CustomEvent<{query?: string}>).detail?.query?.trim();
      if (query) submitTextRef.current(query);
    };
    window.addEventListener('open-chat-assistant', openChat);
    return () => window.removeEventListener('open-chat-assistant', openChat);
  }, []);

  // En móvil el panel ocupa toda la pantalla (ver CSS @media max-width:
  // 480px) — bloqueamos el scroll del fondo mientras está abierto.
  useEffect(() => {
    document.body.classList.toggle('chat-open', open);
    return () => document.body.classList.remove('chat-open');
  }, [open]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      const {reply, error, products} = fetcher.data;
      setMessages((prev) => [...prev, {role: 'assistant', content: reply || error || '', products}]);
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

  useEffect(() => {
    submitTextRef.current = submitText;
  });

  // Nueva función para vaciar el chat
  function clearChat() {
    setMessages([GREETING]);
  }

  return (
    <>
      {showGreetingBubble && !open && (
        <div
          className={`chat-greeting${greetingClosing ? ' chat-greeting--closing' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setOpen(true);
          }}
        >
          <button
            type="button"
            className="chat-greeting__close"
            aria-label="Cerrar aviso"
            onClick={(e) => {
              e.stopPropagation();
              dismissGreeting();
            }}
          >
            <Icon name="close" />
          </button>
          <img className="chat-greeting__avatar" src="/assets/chat-mascot.png" alt="" aria-hidden="true" />
          <div className="chat-greeting__text">
            <strong>{GREETING_BUBBLE_TITLE}</strong>
            <span>{GREETING_BUBBLE_SUBTITLE}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        className={`chat-float${open ? ' open' : ''}`}
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'}
        onClick={() => setOpen((o) => !o)}
      >
        {showGreetingBubble && (
          <span className={`chat-float__ping${greetingClosing ? ' chat-float__ping--closing' : ''}`} aria-hidden="true" />
        )}
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
                  {m.role === 'assistant' ? renderChatMarkdown(m.content, m.products) : m.content}
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