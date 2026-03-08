import React, { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'

// ═══════════════════════════════════════════════════════════
//  🔧 CHANGE ONLY THESE LINES TOMORROW BASED ON PROBLEM
// ═══════════════════════════════════════════════════════════
const GEMINI_API_KEY  = "AIzaSyAWEGwVLcPnbmqdktLQYq_8QnsYpYhXOck"
const APP_TITLE       = "AI Assistant"
const APP_TAGLINE     = "Your intelligent companion"
const PLACEHOLDER     = "Ask me anything..."
const SYSTEM_PROMPT   = `You are a helpful, accurate, and concise AI assistant. 
Format responses clearly using markdown when helpful. 
Always be specific and actionable.`
const SUGGESTED = [
  "What can you help me with?",
  "Give me a quick summary of your capabilities",
  "Show me an example of what you can do",
]
// ═══════════════════════════════════════════════════════════

// Line 1 — Change the URL model name:
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

// Line 2 — Change the sidebar label (find "gemini-2.0-flash" in JSX):
async function callGemini(messages) {
  const contents = [
    {
      role: 'user',
      parts: [{ text: `SYSTEM INSTRUCTIONS: ${SYSTEM_PROMPT}\n\nNow respond to my first message.` }]
    },
    {
      role: 'model',
      parts: [{ text: 'Understood! I will follow those instructions. How can I help you?' }]
    },
    ...messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
  ]

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    })
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.candidates[0].content.parts[0].text
}

// Typewriter effect for AI responses
function useTypewriter(text, active) {
  const [shown, setShown] = useState(active ? '' : text)
  const [done,  setDone]  = useState(!active)
  useEffect(() => {
    if (!active) { setShown(text); setDone(true); return }
    setShown(''); setDone(false)
    let i = 0
    const t = setInterval(() => {
      i += 5
      if (i >= text.length) { setShown(text); setDone(true); clearInterval(t) }
      else setShown(text.slice(0, i))
    }, 12)
    return () => clearInterval(t)
  }, [text, active])
  return { shown, done }
}

function CopyBtn({ text }) {
  const [ok, setOk] = useState(false)
  return (
    <button className="copy-btn" onClick={() => {
      navigator.clipboard.writeText(text)
      setOk(true); setTimeout(() => setOk(false), 2000)
    }}>
      {ok ? '✓ Copied' : '⎘ Copy'}
    </button>
  )
}

function AIMessage({ content, active }) {
  const { shown, done } = useTypewriter(content, active)
  return (
    <div className="msg-content">
      <ReactMarkdown>{shown}</ReactMarkdown>
      {active && !done && <span className="cursor">▋</span>}
      {done && <CopyBtn text={content} />}
    </div>
  )
}

export default function App() {
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [history,  setHistory]  = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const sessionId  = useRef(Date.now())
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setError(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const userMsg  = { role: 'user', content: msg }
    const withUser = [...messages, userMsg]
    setMessages(withUser)
    setLoading(true)

    try {
      const reply = await callGemini(withUser)
      const final = [...withUser, { role: 'assistant', content: reply }]
      setMessages(final)

      // update sidebar history
      const id = sessionId.current
      setHistory(prev => {
        const exists = prev.find(h => h.id === id)
        const title  = withUser[0].content.slice(0, 42) + (withUser[0].content.length > 42 ? '…' : '')
        if (exists) return prev.map(h => h.id === id ? { ...h, msgs: final } : h)
        return [{ id, title, msgs: final, time: new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) }, ...prev]
      })
      setActiveSession(id)
    } catch (e) {
      setError(e.message || 'Something went wrong. Check your API key!')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, messages, loading])

  function newChat() {
    setMessages([]); setInput(''); setError(null)
    sessionId.current = Date.now(); setActiveSession(null)
    inputRef.current?.focus()
  }

  function loadSession(item) {
    setMessages(item.msgs); setActiveSession(item.id)
    sessionId.current = item.id
  }

  function exportChat() {
    const txt = messages.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }))
    a.download = `chat-${Date.now()}.txt`; a.click()
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function autoResize(e) {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px'
  }

  const isEmpty = messages.length === 0

  return (
    <div className="shell">

      {/* ── SIDEBAR ─────────────────────────────── */}
      <aside className="sidebar">
        <div className="sb-top">
          <div className="brand">
            <div className="brand-gem">✦</div>
            <div>
              <div className="brand-name">{APP_TITLE}</div>
              <div className="brand-sub">{APP_TAGLINE}</div>
            </div>
          </div>
          <button className="new-btn" onClick={newChat}>＋ New Chat</button>
        </div>

        <div className="sb-section-label">Recent</div>
        <div className="sb-list">
          {history.length === 0
            ? <div className="sb-empty">Start a conversation</div>
            : history.map(item => (
              <button
                key={item.id}
                className={`sb-item ${activeSession === item.id ? 'active' : ''}`}
                onClick={() => loadSession(item)}
              >
                <div className="sb-item-icon">💬</div>
                <div className="sb-item-body">
                  <div className="sb-item-title">{item.title}</div>
                  <div className="sb-item-time">{item.time}</div>
                </div>
              </button>
            ))
          }
        </div>

        <div className="sb-footer">
          <div className="model-tag">
            <div className="model-led" />
            gemini-2.0-flash
          </div>
          {messages.length > 0 &&
            <button className="export-btn" onClick={exportChat}>↓ Export</button>
          }
        </div>
      </aside>

      {/* ── MAIN ────────────────────────────────── */}
      <div className="main">

        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-info">
            {isEmpty ? 'New conversation' : `${Math.ceil(messages.length / 2)} exchange${messages.length > 2 ? 's' : ''}`}
          </div>
          <div className="live-pill">
            <div className="live-dot" />
            Live
          </div>
        </div>

        {/* Feed */}
        <div className="feed">
          {isEmpty ? (
            <div className="welcome">
              <div className="welcome-orb">
                <div className="orb-ring" />
                <div className="orb-ring r2" />
                <span className="orb-icon">✦</span>
              </div>
              <h1 className="welcome-title">{APP_TITLE}</h1>
              <p className="welcome-sub">{APP_TAGLINE}</p>
              <div className="chips">
                {SUGGESTED.map((s, i) => (
                  <button key={i} className="chip"
                    style={{ animationDelay: `${0.1 + i * 0.08}s` }}
                    onClick={() => send(s)}>{s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, i) => (
                <div key={i} className={`row ${m.role}`}>
                  <div className="avatar">
                    {m.role === 'assistant'
                      ? <div className="av-ai">✦</div>
                      : <div className="av-user">◈</div>
                    }
                  </div>
                  <div className="bubble-wrap">
                    <div className="bubble-role">
                      {m.role === 'assistant' ? APP_TITLE : 'You'}
                    </div>
                    {m.role === 'assistant'
                      ? <AIMessage content={m.content} active={i === messages.length - 1 && !loading} />
                      : <div className="msg-content user-content">{m.content}</div>
                    }
                  </div>
                </div>
              ))}

              {loading && (
                <div className="row assistant">
                  <div className="avatar"><div className="av-ai pulse">✦</div></div>
                  <div className="bubble-wrap">
                    <div className="bubble-role">{APP_TITLE}</div>
                    <div className="thinking">
                      <span /><span /><span />
                    </div>
                  </div>
                </div>
              )}

              {error && <div className="err-bar">⚠ {error}</div>}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input dock */}
        <div className="dock">
          <div className={`dock-inner ${input ? 'active' : ''}`}>
            <textarea
              ref={el => { inputRef.current = el; textareaRef.current = el }}
              className="dock-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              onInput={autoResize}
              placeholder={PLACEHOLDER}
              rows={1}
            />
            <button
              className={`dock-send ${input.trim() && !loading ? 'ready' : ''}`}
              onClick={() => send()}
              disabled={!input.trim() || loading}
            >
              <svg width="15" height="15" viewBox="0 0 15 15">
                <path d="M13 7.5L1.5 1.5L5 7.5L1.5 13.5L13 7.5Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <div className="dock-hint">
            {input.length > 0 && <span className="char-count">{input.length} chars</span>}
            <span>Enter to send · Shift+Enter for new line</span>
          </div>
        </div>
      </div>
    </div>
  )
}
