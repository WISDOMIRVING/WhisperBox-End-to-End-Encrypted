import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { userAPI, messageAPI } from '../utils/api';
import * as crypto from '../utils/crypto';
import { 
  Search, 
  Send, 
  Shield, 
  LogOut, 
  User as UserIcon, 
  Lock, 
  CheckCheck,
  Plus,
  Loader2,
  MoreVertical,
  Paperclip,
  Smile,
  Mic,
  MessageSquare,
  Check
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

const Chat = () => {
  const { user, privateKey, logout } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef(null);

  const token = localStorage.getItem('access_token');

  // WebSocket handling
  const { connected, sendMessage: wsSendMessage } = useWebSocket(
    token,
    async (msg) => {
      const decryptedText = await crypto.decryptMessage(msg.payload, privateKey);
      const newMessage = { ...msg, decryptedText };
      
      if (activeChat && (msg.from_user_id === activeChat.id || msg.to_user_id === activeChat.id)) {
        setMessages(prev => [newMessage, ...prev]);
      }
      fetchConversations();
    },
    (status) => {
      console.log("User status change:", status);
    }
  );

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (activeChat) {
      fetchMessages(activeChat.id);
    }
  }, [activeChat]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchConversations = async () => {
    try {
      const res = await messageAPI.getConversations();
      setConversations(res.data);
    } catch (err) {
      console.error("Failed to fetch conversations", err);
    }
  };

  const fetchMessages = async (userId) => {
    setLoadingHistory(true);
    try {
      const res = await messageAPI.getMessages(userId);
      const decryptedMessages = await Promise.all(res.data.map(async (msg) => {
        const decryptedText = await crypto.decryptMessage(msg.payload, privateKey);
        return { ...msg, decryptedText };
      }));
      setMessages(decryptedMessages);
    } catch (err) {
      console.error("Failed to fetch messages", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // Always search, even if query is short or empty, to get suggestions
    setIsSearching(true);
    try {
      const res = await userAPI.search(query);
      setSearchResults(res.data);
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChat) return;

    const text = inputText;
    setInputText('');

    // 1. Optimistic Update (Immediate feedback)
    const optimisticMsg = {
      id: Date.now().toString(),
      from_user_id: user.id,
      to_user_id: activeChat.id,
      decryptedText: text,
      created_at: new Date().toISOString(),
      delivered: false // Initially false
    };
    setMessages(prev => [optimisticMsg, ...prev]);
    fetchConversations();

    try {
      const keyRes = await userAPI.getPublicKey(activeChat.id);
      const recipientPublicKey = await crypto.importPublicKey(keyRes.data.public_key);
      const senderPublicKey = await crypto.importPublicKey(user.public_key);
      const payload = await crypto.encryptMessage(text, recipientPublicKey, senderPublicKey);

      const sent = wsSendMessage(activeChat.id, payload);
      if (!sent) {
        await messageAPI.sendMessage({ to: activeChat.id, payload });
      }
      
      // Update the optimistic message to "delivered"
      setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? { ...m, delivered: true } : m));
    } catch (err) {
      console.error("Failed to send message", err);
      // Optional: mark message as failed in UI
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      alert("Failed to send message. Please check your connection.");
    }
  };

  const selectUser = (u) => {
    setActiveChat({
      id: u.user_id || u.id,
      display_name: u.display_name,
      username: u.username
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Sidebar Header */}
        <div style={{ background: 'var(--bg-elevated)', height: '60px', padding: '0 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="avatar" style={{ width: '40px', height: '40px' }}>
            {user?.display_name[0]}
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-dim)' }}>
            <MessageSquare size={20} />
            <MoreVertical size={20} onClick={logout} style={{ cursor: 'pointer' }} />
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-surface)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input 
              type="text" 
              placeholder="Search or start new chat"
              style={{ width: '100%', padding: '8px 8px 8px 45px', background: 'var(--bg-elevated)', border: 'none', borderRadius: '8px', color: 'var(--text-main)', fontSize: '0.9rem' }}
              value={searchQuery}
              onFocus={() => handleSearch({ target: { value: searchQuery } })}
              onChange={handleSearch}
            />
            
            {/* Search Results */}
            <AnimatePresence>
              {searchQuery.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', zIndex: 100, overflow: 'hidden' }}
                >
                  {isSearching ? (
                    <div style={{ padding: '1rem', textAlign: 'center' }}><Loader2 className="animate-spin" size={20} style={{ margin: '0 auto', color: 'var(--primary)' }} /></div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map(u => (
                      <div key={u.id} className="user-item" onClick={() => selectUser(u)}>
                        <div className="avatar" style={{ width: '40px', height: '40px', fontSize: '0.9rem' }}>{u.display_name[0]}</div>
                        <div className="user-info">
                          <h4>{u.display_name}</h4>
                          <p>@{u.username}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>No users found</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Conversations List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversations.length > 0 ? (
            conversations.map(conv => (
              <div 
                key={conv.user_id} 
                className={`user-item ${activeChat?.id === conv.user_id ? 'active' : ''}`}
                onClick={() => selectUser(conv)}
              >
                <div className="avatar">{conv.display_name[0]}</div>
                <div className="user-info">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4>{conv.display_name}</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      {format(new Date(conv.last_message_at), 'HH:mm')}
                    </span>
                  </div>
                  <p>@{conv.username}</p>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              <p style={{ fontSize: '0.9rem' }}>No chats yet. Use search to find friends.</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="main-content">
        {activeChat ? (
          <>
            <header className="chat-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="avatar" style={{ width: '40px', height: '40px' }}>{activeChat.display_name[0]}</div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: '500' }}>{activeChat.display_name}</h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    {connected ? 'online' : 'offline'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1.25rem', color: 'var(--text-dim)' }}>
                <Search size={20} />
                <MoreVertical size={20} />
              </div>
            </header>

            <div className="chat-messages">
              {/* Security Banner */}
              <div style={{ alignSelf: 'center', background: '#182229', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', color: '#ffd279', textAlign: 'center', margin: '1rem 0', maxWidth: '85%', border: '1px solid rgba(255, 210, 121, 0.1)' }}>
                <Lock size={12} style={{ display: 'inline', marginRight: '5px', verticalAlign: 'text-bottom' }} />
                Messages are end-to-end encrypted. No one outside of this chat, not even WhisperBox, can read them.
              </div>

              {loadingHistory ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 className="animate-spin" size={24} color="var(--primary)" />
                </div>
              ) : (
                [...messages].reverse().map((msg) => (
                  <motion.div 
                    key={msg.id} 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`message-bubble ${msg.from_user_id === user.id ? 'message-sent' : 'message-received'}`}
                  >
                    {msg.decryptedText}
                    <div className="message-info">
                      {format(new Date(msg.created_at), 'HH:mm')}
                      {msg.from_user_id === user.id && (
                        <CheckCheck size={14} style={{ color: msg.delivered ? '#53bdeb' : 'inherit' }} />
                      )}
                    </div>
                  </motion.div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              <div style={{ display: 'flex', gap: '1.25rem', color: 'var(--text-dim)', padding: '0 0.5rem' }}>
                <Smile size={24} />
                <Paperclip size={24} />
              </div>
              <form onSubmit={handleSendMessage} className="input-wrapper">
                <input 
                  type="text" 
                  placeholder="Type a message" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              </form>
              <button 
                onClick={handleSendMessage} 
                className={`send-btn ${inputText.trim() ? 'active' : ''}`}
                style={{ background: inputText.trim() ? 'var(--primary)' : 'transparent', borderRadius: '50%', width: '45px', height: '45px', color: inputText.trim() ? '#0b141a' : 'var(--text-dim)' }}
              >
                {inputText.trim() ? <Send size={20} /> : <Mic size={24} />}
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', background: '#222e35' }}>
            <div style={{ maxWidth: '400px' }}>
              <div style={{ width: '300px', height: '200px', margin: '0 auto 2rem', opacity: 0.1, backgroundImage: 'url(https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png)', backgroundSize: 'cover' }}></div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: '300', color: 'var(--text-main)', marginBottom: '1rem' }}>WhisperBox Web</h2>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', lineHeight: '1.6' }}>
                Send and receive end-to-end encrypted messages without keeping your phone online. 
                Use WhisperBox on up to 4 linked devices and 1 phone at the same time.
              </p>
              <div style={{ marginTop: '3rem', borderTop: '1px solid var(--border)', paddingTop: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                <Lock size={14} /> End-to-end encrypted
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Chat;
