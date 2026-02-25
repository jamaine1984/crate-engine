'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Zap, Loader2 } from 'lucide-react';

const GATEWAY_URL = 'ws://127.0.0.1:18789';

export default function ZaChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "⚡ Hey Kohari. What's up?" }
  ]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const reconnectTimer = useRef(null);
  const pendingReply = useRef('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setConnecting(true);

    try {
      const ws = new WebSocket(GATEWAY_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setConnecting(false);
        // Authenticate with session
        ws.send(JSON.stringify({
          type: 'session_start',
          channel: 'dashboard',
          session: 'dashboard-chat'
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'chunk' || data.type === 'text') {
            const text = data.text || data.content || data.chunk || '';
            if (text && text !== 'HEARTBEAT_OK' && text !== 'NO_REPLY') {
              pendingReply.current += text;
            }
          }
          
          if (data.type === 'message' || data.type === 'response') {
            const text = data.text || data.content || data.message || '';
            if (text && text !== 'HEARTBEAT_OK' && text !== 'NO_REPLY') {
              setMessages(prev => [...prev, { role: 'assistant', text }]);
              setSending(false);
              pendingReply.current = '';
            } else if (pendingReply.current) {
              setMessages(prev => [...prev, { role: 'assistant', text: pendingReply.current }]);
              setSending(false);
              pendingReply.current = '';
            }
          }
          
          if (data.type === 'done' || data.type === 'end') {
            if (pendingReply.current) {
              setMessages(prev => [...prev, { role: 'assistant', text: pendingReply.current }]);
              pendingReply.current = '';
            }
            setSending(false);
          }

          if (data.type === 'error') {
            setMessages(prev => [...prev, { role: 'system', text: `Error: ${data.message || data.error || 'Unknown error'}` }]);
            setSending(false);
          }
        } catch (e) {
          // Non-JSON message
          const text = event.data;
          if (text && text !== 'HEARTBEAT_OK' && text !== 'NO_REPLY') {
            setMessages(prev => [...prev, { role: 'assistant', text }]);
            setSending(false);
          }
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
        wsRef.current = null;
        // Auto-reconnect after 3s
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setConnected(false);
        setConnecting(false);
      };
    } catch (e) {
      setConnecting(false);
    }
  }, []);

  useEffect(() => {
    if (open) connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [open, connect]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setSending(true);
    pendingReply.current = '';

    wsRef.current.send(JSON.stringify({
      type: 'message',
      text,
      channel: 'dashboard',
      session: 'dashboard-chat'
    }));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Chat bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => { e.target.style.transform = 'scale(1.1)'; }}
          onMouseLeave={e => { e.target.style.transform = 'scale(1)'; }}
        >
          <Zap size={24} color="white" />
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 380, height: 520, borderRadius: 16,
          background: '#1a1a2e', border: '1px solid rgba(139, 92, 246, 0.3)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Zap size={20} color="white" />
              <div>
                <div style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>Za</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  {connected ? '● Connected' : connecting ? '○ Connecting...' : '○ Offline'}
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
              width: 32, height: 32, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={16} color="white" />
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: 16,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
              }}>
                <div style={{
                  padding: '10px 14px', borderRadius: 12,
                  fontSize: 13, lineHeight: 1.5,
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)'
                    : msg.role === 'system'
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(255,255,255,0.08)',
                  color: msg.role === 'system' ? '#FCA5A5' : 'white',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {sending && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Za is thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', gap: 8,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={connected ? "Message Za..." : "Connecting..."}
              disabled={!connected}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'white', fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || !connected || sending}
              style={{
                width: 40, height: 40, borderRadius: 10,
                background: input.trim() && connected ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)' : 'rgba(255,255,255,0.06)',
                border: 'none', cursor: input.trim() && connected ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Send size={16} color={input.trim() && connected ? 'white' : 'rgba(255,255,255,0.3)'} />
            </button>
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </>
  );
}
