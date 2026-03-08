import React, { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'

// ═══════════════════════════════════════════════════════════
//  🔧 CHANGE ONLY THESE 5 LINES TOMORROW
// ═══════════════════════════════════════════════════════════
const GEMINI_API_KEY = "AIzaSyAWEGwVLcPnbmqdktLQYq_8QnsYpYhXOck"
const APP_TITLE      = "AI Assistant"
const APP_TAGLINE    = "Your intelligent companion"
const PLACEHOLDER    = "Ask me anything..."
const SYSTEM_PROMPT  = `You are a helpful, accurate AI assistant.
Respond clearly and thoughtfully. Use markdown formatting when helpful.
Be specific, concise, and always actionable.`
const SUGGESTED = [
  "What can you help me with?",
  "Show me an example of what you can do",
  "Give me a quick overview of your capabilities",
]
// ═══════════════════════════════════════════════════════════

// Auto-fallback model chain
const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-1.5-pro',
  'gemini-pro',
]

async function callGemini(messages, modelIndex = 0) {
  if (modelIndex >= MODELS.length) throw new Error('All models failed. Check your API key.')
  const model = MODELS[modelIndex]
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`

  // Inject system prompt as first exchange
  const contents = [
    {
      role: 'user',
      parts: [{ text: `Instructions for you: ${SYSTEM_PROMPT}\n\nAcknowledge briefly.` }]
    },
    {
      role: 'model',
      parts: [{ text: 'Understood. Ready to help.' }]
    },
    ...messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
  ]

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        topP: 0.95,
      }
    })
  })

  const data = await res.json()

  if (data.error) {
    console.warn(`[${model}] failed:`, data.error.message)
    // Auto-try next model
    return callGemini(messages, modelIndex + 1)
  }

  return {
    text:  data.candidates[0].content.parts[0].text,
    model: model
  }
}

// Typewriter effect — exactly like Claude
function useTypewriter(text, active) {
  const [shown, setShown] = useState(active ? '' : text)
  const [done,  setDone]  = useState(!active)

  useEffect(() => {
    if (!active) { setShown(text); setDone(true); return }
    setShown(''); setDone(false)
    let i = 0
    const interval = setInterval(() => {
      i += 4
      if (i >= text.length) {
        setShown(text); setDone(true); clearInterval(interval)
      } else {
        setShown(text.slice(0, i))
      }
    }, 10)
    return () => clearInterval(interval)
  }, [text, active])

  return { shown, done }
}

// Copy button
function CopyBtn({ text }) {
  const [ok, setOk] = useState(false)
  return (
    <button className="copy-btn" onClick={() => {
      navigator.clipboard.writeText(text)
      setOk(true)
      setTimeout(() => setOk(false), 2000)
    }}>
      {ok ? '✓ Copied!' : '⎘ Copy'}
    </button>
  )
}

// AI message with typewriter + beautiful markdown
function AIMessage({ content, model, active }) {
  const { shown, done } = useTypewriter(content, active)

  return (
    <div className="ai-bubble">
      <ReactMarkdown
        components={{
          code({ inline, children, ...props }) {
            return inline
              ? <code className="inline-code" {...props}>{children}</code>
              : <pre className="code-block"><code>{children}</code></pre>
          },
          // Clean table rendering
          table({ children }) {
            return <table style={{ width:'100%', borderCollapse:'collapse', margin:'12px 0' }}>{children}</table>
          }
        }}
      >
        {shown}
      </ReactMarkdown>

      {active && !done && <span className="cursor" />}

      {done && (
        <div className="bubble-footer">
          <span className="model-used">{model}</span>
          <CopyBtn text={content} />
        </div>
      )}
    </div>
  )
}

function TypingDots() {
  return (
    <div className="typing-wrap">
      <div className="typing-dots">
        <span /><span /><span />
      </div>
      <span className="typing-label">Thinking…</span>
    </div>
  )
}

export default function App() {
  const [messages,      setMessages]      = useState([])
  const [input,         setInput]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [history,       setHistory]       = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [lastModel,     setLastModel]     = useState(MODELS[0])
  const [respTime,      setRespTime]      = useState(null)
  const [isOnline,      setIsOnline]      = useState(navigator.onLine)

  const sessionId   = useRef(Date.now())
  const bottomRef   = useRef(null)
  const inputRef    = useRef(null)
  const textareaRef = useRef(null)
  const lastUserMsg = useRef('')

  // Online/offline
  useEffect(() => {
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online',  on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    if (!isOnline) { setError('No internet connection. Please check your network.'); return }

    setInput('')
    setError(null)
    setRespTime(null)
    lastUserMsg.current = msg
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const time     = new Date().toLocaleTimeString('en', { hour:'2-digit', minute:'2-digit' })
    const userMsg  = { role:'user', content:msg, time }
    const withUser = [...messages, userMsg]
    setMessages(withUser)
    setLoading(true)

    const t0 = Date.now()

    try {
      const { text: reply, model } = await callGemini(withUser)
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

      setRespTime(elapsed)
      setLastModel(model)

      const aiMsg = {
        role: 'assistant', content: reply, model,
        time: new Date().toLocaleTimeString('en', { hour:'2-digit', minute:'2-digit' })
      }
      const final = [...withUser, aiMsg]
      setMessages(final)

      // Save to sidebar history
      const id    = sessionId.current
      const title = withUser[0].content.slice(0, 46) + (withUser[0].content.length > 46 ? '…' : '')
      setHistory(prev => {
        const exists = prev.find(h => h.id === id)
        if (exists) return prev.map(h => h.id === id ? { ...h, msgs: final } : h)
        return [{ id, title, msgs: final, time }, ...prev.slice(0, 19)]
      })
      setActiveSession(id)

    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, messages, loading, isOnline])

  // Retry last message
  function retry() {
    const last = lastUserMsg.current
    if (!last) return
    setError(null)
    setMessages(prev => prev.filter((_, i) => i < prev.length - (prev[prev.length-1]?.role === 'user' ? 0 : 1)))
    setTimeout(() => send(last), 100)
  }

  function newChat() {
    setMessages([]); setInput(''); setError(null); setRespTime(null)
    sessionId.current = Date.now(); setActiveSession(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  function loadSession(item) {
    setMessages(item.msgs); setActiveSession(item.id)
    sessionId.current = item.id; setError(null)
  }

  function exportChat() {
    const divider = '\n' + '─'.repeat(60) + '\n\n'
    const txt = messages
      .map(m => `[${m.role.toUpperCase()}${m.time ? ' · ' + m.time : ''}]\n${m.content}`)
      .join(divider)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([txt], { type:'text/plain' }))
    a.download = `chat-${new Date().toISOString().slice(0,10)}.txt`
    a.click()
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function autoResize(e) {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }

  const isEmpty = messages.length === 0
  const exchanges = Math.ceil(messages.length / 2)

  return (
    <div className="shell">

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sb-head">
          <div className="brand">
            <div className="brand-gem">✦</div>
            <div>
              <div className="brand-name">{APP_TITLE}</div>
              <div className="brand-sub">{APP_TAGLINE}</div>
            </div>
          </div>
          <button className="new-btn" onClick={newChat}>＋ New chat</button>
        </div>

        <div className="sb-label">Recents</div>

        <div className="sb-list">
          {history.length === 0
            ? <p className="sb-empty">Your conversations will appear here</p>
            : history.map(item => (
              <button
                key={item.id}
                className={`sb-item ${activeSession === item.id ? 'active' : ''}`}
                onClick={() => loadSession(item)}
              >
                <span className="sb-icon">💬</span>
                <div>
                  <div className="sb-title">{item.title}</div>
                  <div className="sb-time">{item.time}</div>
                </div>
              </button>
            ))
          }
        </div>

        <div className="sb-foot">
          <div className="model-row">
            <div className={`status-led ${isOnline ? 'online' : 'offline'}`} />
            <span className="model-name">{lastModel}</span>
          </div>
          {respTime && <div className="resp-time">⚡ {respTime}s</div>}
          {messages.length > 0 && (
            <button className="export-btn" onClick={exportChat}>↓ Export chat</button>
          )}
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="main">

        {/* Topbar */}
        <div className="topbar">
          <span className="topbar-info">
            {isEmpty ? 'New conversation' : `${exchanges} exchange${exchanges !== 1 ? 's' : ''}`}
          </span>
          <div className="topbar-right">
            {!isOnline && <span className="offline-badge">● No connection</span>}
            <div className={`live-pill ${isOnline ? '' : 'dim'}`}>
              <div className="live-dot" />
              {isOnline ? 'Live' : 'Offline'}
            </div>
          </div>
        </div>

        {/* Feed */}
        <div className="feed">
          {isEmpty ? (
            <div className="welcome">
              <div className="orb-wrap">
                <div className="orb-ring" />
                <div className="orb-ring r2" />
                <div className="orb-core">✦</div>
              </div>
              <h1 className="welcome-h1">{APP_TITLE}</h1>
              <p className="welcome-p">{APP_TAGLINE}</p>
              <div className="chips">
                {SUGGESTED.map((s, i) => (
                  <button
                    key={i} className="chip"
                    style={{ animationDelay: `${0.05 + i * 0.07}s` }}
                    onClick={() => send(s)}
                  >{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, i) => (
                <div key={i} className={`row ${m.role}`}>
                  <div className="av">
                    {m.role === 'assistant'
                      ? <div className="av-ai">✦</div>
                      : <div className="av-user">You</div>
                    }
                  </div>
                  <div className="msg-wrap">
                    <div className="msg-meta">
                      <span className="msg-role">
                        {m.role === 'assistant' ? APP_TITLE : 'You'}
                      </span>
                      {m.time && <span className="msg-time">{m.time}</span>}
                    </div>
                    {m.role === 'assistant'
                      ? <AIMessage
                          content={m.content}
                          model={m.model || lastModel}
                          active={i === messages.length - 1 && !loading}
                        />
                      : <div className="user-bubble">{m.content}</div>
                    }
                  </div>
                </div>
              ))}

              {loading && (
                <div className="row assistant">
                  <div className="av">
                    <div className="av-ai pulsing">✦</div>
                  </div>
                  <div className="msg-wrap">
                    <div className="msg-meta">
                      <span className="msg-role">{APP_TITLE}</span>
                    </div>
                    <TypingDots />
                  </div>
                </div>
              )}

              {error && (
                <div className="err-bar">
                  <span>⚠</span>
                  <span>{error}</span>
                  <button className="err-retry" onClick={retry}>↺ Retry</button>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input dock */}
        <div className="dock">
          <div className={`dock-box ${input ? 'has-text' : ''} ${loading ? 'busy' : ''}`}>
            <textarea
              ref={el => { inputRef.current = el; textareaRef.current = el }}
              className="dock-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              onInput={autoResize}
              placeholder={loading ? 'Generating…' : PLACEHOLDER}
              disabled={loading}
              rows={1}
            />
            <button
              className={`dock-send ${input.trim() && !loading && isOnline ? 'ready' : ''}`}
              onClick={() => send()}
              disabled={!input.trim() || loading || !isOnline}
            >
              {loading
                ? <div className="send-spinner" />
                : <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M13 7L1 1.5L4.2 7L1 12.5L13 7Z" fill="currentColor"/>
                  </svg>
              }
            </button>
          </div>
          <div className="dock-hint">
            {input.length > 20 && <span className="char-ct">{input.length}</span>}
            <span>Enter to send · Shift+Enter for new line</span>
          </div>
        </div>

      </div>
    </div>
  )
}
