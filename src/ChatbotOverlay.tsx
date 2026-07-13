import React, { useState, useRef, useEffect } from 'react';
import { X, Minus, Send, MessageSquare } from 'lucide-react';
import { useStore } from './store';
import './ChatbotOverlay.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

function parseMessage(text: string) {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return (
      <React.Fragment key={i}>
        {parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j} className="text-highlight-green">{part.slice(2, -2)}</strong>;
          }
          return part;
        })}
        {i < text.split('\n').length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export default function ChatbotOverlay() {
  const { currentUser } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userName = currentUser?.name?.split(' ')[0] || 'Abu';
  
  // Initialize welcome message when opened for the first time
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: `Hello ${userName}! I can help you analyze your spending or check your balances. What would you like to do?`,
        },
      ]);
    }
  }, [isOpen, messages.length, userName]);

  useEffect(() => {
    if (isOpen && !isCollapsed) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isCollapsed]);

  const handleSend = async (query: string = input) => {
    if (!query.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: query.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Add empty assistant message that will be populated via stream
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const token = localStorage.getItem('token');
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
      
      const response = await fetch(`${API_BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: query }),
      });

      if (!response.ok) {
        throw new Error(response.status === 429 ? 'Rate limit reached. Please try again later.' : 'Failed to connect to AI Assistant.');
      }

      if (!response.body) throw new Error('ReadableStream not yet supported in this browser.');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: updated[lastIdx].content + chunk,
            };
            return updated;
          });
        }
      }
    } catch (error: any) {
      setMessages((prev) => {
        const updated = [...prev];
        // Replace the empty/partial assistant message with the error message
        const lastIdx = updated.length - 1;
        updated[lastIdx] = {
          role: 'assistant',
          content: error.message || 'An unexpected error occurred.',
          isError: true,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button className="chatbot-fab" onClick={() => { setIsOpen(true); setIsCollapsed(false); }} aria-label="Open AI Assistant">
        <MessageSquare size={24} />
      </button>
    );
  }

  // If collapsed, we show the FAB but we could also do something else. 
  // Let's just make it disappear entirely using CSS and rely on the state for simplicity, 
  // but to show the fab again we need isOpen=false.
  // Wait, the prompt says '-' for collapse. If collapsed, it should hide the window, 
  // but how to bring it back? If we use CSS `transform: scale(0)` it hides but taking space? No, fixed bottom right.
  // We can just set isOpen(false) for collapse, or show FAB if collapsed.
  // I will just make the FAB show if !isOpen OR isCollapsed.
  if (isCollapsed) {
    return (
      <button className="chatbot-fab" onClick={() => { setIsCollapsed(false); setIsOpen(true); }} aria-label="Open AI Assistant">
        <MessageSquare size={24} />
      </button>
    );
  }

  return (
    <div className={`chatbot-overlay ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Decorative Sparkles */}
      <span className="sparkle sparkle-1">✨</span>
      <span className="sparkle sparkle-2">✨</span>
      <span className="sparkle sparkle-3">✨</span>

      <div className="chatbot-header">
        <h3 className="chatbot-header-title">Xpense AI Assistant</h3>
        <div className="chatbot-header-actions">
          <button onClick={() => setIsCollapsed(true)} aria-label="Collapse chat"><Minus size={18} /></button>
          <button onClick={() => setIsOpen(false)} aria-label="Close chat"><X size={18} /></button>
        </div>
      </div>

      <div className="chatbot-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message-row ${msg.role} ${msg.isError ? 'error' : ''}`}>
            {msg.role === 'assistant' && (
              <img src="/robot_avatar.jpg" alt="AI Avatar" className="message-avatar" />
            )}
            <div className="message-bubble">
              {parseMessage(msg.content) || (isLoading && idx === messages.length - 1 ? 'Typing...' : '')}
            </div>
          </div>
        ))}
        
        {/* Suggestion Chips only show after the first welcome message and before user replies */}
        {messages.length === 1 && !isLoading && (
          <div className="chatbot-suggestions">
            <button className="suggestion-chip" onClick={() => handleSend('Show financial summary')}>Show financial summary</button>
            <button className="suggestion-chip" onClick={() => handleSend('Recent expenses')}>Recent expenses</button>
            <button className="suggestion-chip" onClick={() => handleSend('Who owes me money?')}>Who owes me money?</button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chatbot-input-container">
        <form 
          className="chatbot-input-form" 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <input
            type="text"
            placeholder="Type your query..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button type="submit" className="chatbot-send-button" disabled={!input.trim() || isLoading}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
