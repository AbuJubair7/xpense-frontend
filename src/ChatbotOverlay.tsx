import { useState, useRef, useEffect } from 'react';
import { Minus, Send, MessageSquare, Copy, Check, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useStore } from './store';
import './ChatbotOverlay.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

const CodeBlock = ({ inline, className, children, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    return (
      <div className="code-block-container">
        <div className="code-block-header">
          <span className="code-language">{match[1]}</span>
          <button className="code-copy-btn" onClick={handleCopy} aria-label="Copy code">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus as any}
          language={match[1]}
          PreTag="div"
          customStyle={{ margin: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, fontSize: '13px' }}
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    );
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

export default function ChatbotOverlay() {
  const { currentUser } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userName = currentUser?.name?.split(' ')[0] || 'Abu';
  
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  const handleCopyMessage = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleClearChat = async () => {
    if (!window.confirm('Are you sure you want to clear your chat history?')) return;
    try {
      const token = localStorage.getItem('token');
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
      
      const response = await fetch(`${API_BASE_URL}/ai/chat`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) throw new Error('Failed to clear chat');
      setMessages([]);
    } catch (error) {
      console.error(error);
      alert('Failed to clear chat history');
    }
  };

  const handleSend = async (query: string = input) => {
    if (!query.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: query.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

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

  const parseMessageContent = (content: string) => {
    let displayContent = content;
    let suggestion = null;

    // Use a flexible regex to catch the delimiter since AI models often alter formatting (e.g., "SUGGESTION:", "***SUGGESTION***", "---SUGGESTION---")
    const delimiterMatch = content.match(/(?:\n|^)[-*]*\s*SUGGESTION\s*[-*:]*\s*([\s\S]*)$/i);

    if (delimiterMatch) {
      suggestion = delimiterMatch[1].trim();
      // Remove everything from the delimiter onwards
      displayContent = content.slice(0, delimiterMatch.index).trim();
      
      // Clean up any stray markdown formatting the AI might add to the suggestion itself
      suggestion = suggestion.replace(/(?:\*\*|)?(?:Follow-up|Question)(?:\*\*|)?:\s*/gi, '').trim();
    } else {
      // Hide the delimiter while it is partially streaming (e.g., "---SUG" or "SUGGESTI")
      displayContent = content.replace(/(?:\n|^)[-*]*\s*S[UGESTON]*$/i, '').trim();
      
      // Fallback: If the AI completely ignored the delimiter, check if the very last sentence is a question.
      const trimmedContent = displayContent.trim();
      if (trimmedContent.endsWith('?')) {
        const sentences = trimmedContent.match(/[^.!?]+[.!?]+/g) || [trimmedContent];
        let lastSentence = sentences[sentences.length - 1].trim();
        
        if (lastSentence.endsWith('?')) {
          suggestion = lastSentence.replace(/(?:\*\*|)?(?:Suggestion|Follow-up|Question)(?:\*\*|)?:\s*/gi, '');
          displayContent = displayContent.slice(0, displayContent.lastIndexOf(sentences[sentences.length - 1])).trim();
        }
      }
    }

    return { displayContent, suggestion };
  };

  return (
    <>
      <button className={`chatbot-fab ${isOpen ? 'hidden' : ''}`} onClick={() => setIsOpen(true)} aria-label="Open AI Assistant">
        <MessageSquare size={24} />
      </button>

      <div className={`chatbot-wrapper ${!isOpen ? 'collapsed' : ''}`}>
        <img src="/peeking_robot.jpg" alt="Robot Mascot" className="peeking-robot-mascot" />
      <div className="chatbot-overlay">
        <span className="sparkle sparkle-1">✨</span>
      <span className="sparkle sparkle-2">✨</span>
      <span className="sparkle sparkle-3">✨</span>

      <div className="chatbot-header">
        <h3 className="chatbot-header-title">Xpense AI Assistant</h3>
        <div className="chatbot-header-actions">
          {messages.length > 0 && (
            <button onClick={handleClearChat} aria-label="Clear chat" title="Clear chat"><Trash2 size={16} /></button>
          )}
          <button onClick={() => setIsOpen(false)} aria-label="Close chat"><Minus size={18} /></button>
        </div>
      </div>

      <div className="chatbot-messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👋</div>
            <h4 className="empty-state-title">Hi {userName}!</h4>
            <p className="empty-state-subtitle">What can I help with today?</p>
            <div className="empty-state-suggestions">
              <button onClick={() => handleSend('Show my financial summary')}>📊 Financial Summary</button>
              <button onClick={() => handleSend('What are my recent expenses?')}>💸 Recent Expenses</button>
              <button onClick={() => handleSend('Who owes me money?')}>🤝 Outstanding Loans</button>
              <button onClick={() => handleSend('How is my budget looking this month?')}>📅 Monthly Budget</button>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const { displayContent, suggestion } = parseMessageContent(msg.content);
            const isLatestAiMessage = msg.role === 'assistant' && idx === messages.length - 1;
            
            return (
              <div key={idx} className={`message-row-container ${msg.role}`}>
                <div className={`message-row ${msg.role} ${msg.isError ? 'error' : ''}`}>
                  {msg.role === 'assistant' && (
                    <img src="/robot_avatar.jpg" alt="AI Avatar" className="message-avatar" />
                  )}
                  <div className="message-bubble-wrapper">
                    {msg.role === 'assistant' && (
                      <button 
                        className="message-copy-action"
                        onClick={() => handleCopyMessage(displayContent, idx)}
                        aria-label="Copy message"
                        title="Copy message"
                      >
                        {copiedIndex === idx ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    )}
                    <div className={`message-bubble ${msg.role === 'assistant' ? 'markdown-body' : ''}`}>
                      {msg.role === 'assistant' ? (
                        <>
                          {displayContent || (msg.content && !suggestion) ? (
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code: CodeBlock,
                                a: ({node, ...props}) => <a target="_blank" rel="noopener noreferrer" {...props} />
                              }}
                            >
                              {displayContent + (isLoading && isLatestAiMessage ? ' ▋' : '')}
                            </ReactMarkdown>
                          ) : isLoading && isLatestAiMessage ? (
                            <div className="typing-indicator">
                              <span></span><span></span><span></span>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                </div>
                {suggestion && !isLoading && isLatestAiMessage && (
                  <div className="dynamic-suggestion-wrapper">
                    <button 
                      className="dynamic-suggestion-btn" 
                      onClick={() => handleSend(suggestion)}
                    >
                      ✨ {suggestion}
                    </button>
                  </div>
                )}
              </div>
            );
          })
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
      </div>
    </>
  );
}
