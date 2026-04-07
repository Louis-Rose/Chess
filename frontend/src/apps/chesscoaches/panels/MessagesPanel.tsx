// Messages panel — coach-student chat with invoice support

import { useState, useEffect, useCallback, useRef } from 'react';
import { Send, ArrowLeft, MessageCircle, Receipt, Check, ExternalLink } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell } from '../components/PanelShell';
import { authFetch } from '../utils/authFetch';

interface Conversation {
  user_id: number;
  student_id: number | null;
  name: string;
  picture: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

interface Message {
  id: number;
  sender_id: number;
  content: string;
  invoice_id: number | null;
  read_at: string | null;
  created_at: string;
}

interface InvoiceInfo {
  id: number;
  amount: number;
  currency: string;
  description: string | null;
  status: 'pending' | 'paid';
  revolut_link: string | null;
  paid_at: string | null;
}

export function MessagesPanel() {
  const { t } = useLanguage();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await authFetch('/api/messages/conversations');
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchConversations().then(() => setLoading(false));
  }, [fetchConversations]);

  // Poll for new conversations every 10s
  useEffect(() => {
    const id = setInterval(fetchConversations, 10000);
    return () => clearInterval(id);
  }, [fetchConversations]);

  if (activeChat) {
    return (
      <PanelShell title={t('coaches.messages.title')}>
        <ChatView
          conversation={activeChat}
          onBack={() => { setActiveChat(null); fetchConversations(); }}
        />
      </PanelShell>
    );
  }

  return (
    <PanelShell title={t('coaches.messages.title')}>
      <div className="max-w-2xl mx-auto">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-slate-700 rounded" />
                    <div className="h-3 w-48 bg-slate-700 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-blue-600/10 flex items-center justify-center mb-4">
              <MessageCircle className="w-8 h-8 text-blue-400" />
            </div>
            <p className="text-slate-300 text-lg">{t('coaches.messages.empty')}</p>
            <p className="text-slate-500 text-sm mt-1">{t('coaches.messages.emptyHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map(c => (
              <button
                key={c.user_id}
                onClick={() => setActiveChat(c)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-blue-500/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {c.picture ? (
                    <img src={c.picture} alt="" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400 font-bold text-sm">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-100 font-medium text-sm">{c.name}</span>
                      {c.last_message_at && (
                        <span className="text-slate-500 text-xs">
                          {formatTime(c.last_message_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-slate-400 text-sm truncate">
                        {c.last_message || '\u00A0'}
                      </span>
                      {c.unread_count > 0 && (
                        <span className="ml-2 w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  );
}

function ChatView({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const isCoach = user?.role === 'coach';
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceCache, setInvoiceCache] = useState<Record<number, InvoiceInfo>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await authFetch(`/api/messages/${conversation.user_id}`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch { /* ignore */ }
  }, [conversation.user_id]);

  useEffect(() => {
    fetchMessages().then(() => setLoading(false));
  }, [fetchMessages]);

  useEffect(() => {
    const id = setInterval(fetchMessages, 3000);
    return () => clearInterval(id);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!showInvoiceForm) inputRef.current?.focus();
  }, [showInvoiceForm]);

  // Fetch invoice details for invoice messages
  const fetchInvoice = useCallback(async (invoiceId: number) => {
    if (invoiceCache[invoiceId]) return;
    try {
      const res = await authFetch(`/api/invoices/${invoiceId}`);
      if (res.ok) {
        const data = await res.json();
        setInvoiceCache(prev => ({ ...prev, [invoiceId]: data }));
      }
    } catch { /* ignore */ }
  }, [invoiceCache]);

  // Fetch all invoice details when messages load
  useEffect(() => {
    for (const m of messages) {
      if (m.invoice_id && !invoiceCache[m.invoice_id]) fetchInvoice(m.invoice_id);
    }
  }, [messages, invoiceCache, fetchInvoice]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');
    try {
      const res = await authFetch(`/api/messages/${conversation.user_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => [...prev, msg]);
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleInvoiceSent = (msg: Message, invoice: InvoiceInfo) => {
    setMessages(prev => [...prev, msg]);
    setInvoiceCache(prev => ({ ...prev, [invoice.id]: invoice }));
    setShowInvoiceForm(false);
  };

  const handleMarkPaid = async (invoiceId: number) => {
    const res = await authFetch(`/api/invoices/${invoiceId}/mark-paid`, { method: 'PUT' });
    if (res.ok) {
      setInvoiceCache(prev => ({ ...prev, [invoiceId]: { ...prev[invoiceId], status: 'paid', paid_at: new Date().toISOString() } }));
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100dvh - 120px)' }}>
      {/* Chat header */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-700">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-200 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        {conversation.picture ? (
          <img src={conversation.picture} alt="" className="w-8 h-8 rounded-full" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400 font-bold text-xs">
            {conversation.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-slate-100 font-medium flex-1">{conversation.name}</span>
        {isCoach && conversation.student_id && (
          <button
            onClick={() => setShowInvoiceForm(!showInvoiceForm)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              showInvoiceForm ? 'bg-emerald-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            {t('coaches.invoice.send') || 'Send invoice'}
          </button>
        )}
      </div>

      {/* Invoice form */}
      {showInvoiceForm && conversation.student_id && (
        <InvoiceForm
          studentId={conversation.student_id}
          onSent={handleInvoiceSent}
          onCancel={() => setShowInvoiceForm(false)}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-12">
            Start the conversation...
          </p>
        ) : (
          messages.map(m => {
            const isMine = m.sender_id === user?.id;
            const invoice = m.invoice_id ? invoiceCache[m.invoice_id] : null;

            // Invoice message — special rendering
            if (m.invoice_id) {
              return (
                <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[85%] bg-slate-700 border border-slate-600 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-600/50 flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-400">Invoice</span>
                      {invoice?.status === 'paid' && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
                          <Check className="w-3 h-3" /> Paid
                        </span>
                      )}
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      {invoice ? (
                        <>
                          <div className="text-2xl font-bold text-slate-100">
                            {invoice.currency} {invoice.amount.toFixed(2)}
                          </div>
                          {invoice.description && (
                            <p className="text-sm text-slate-400">{invoice.description}</p>
                          )}
                          {/* Student sees Pay button */}
                          {!isCoach && invoice.status === 'pending' && invoice.revolut_link && (
                            <a
                              href={invoice.revolut_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 w-full mt-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" /> Pay with Revolut
                            </a>
                          )}
                          {!isCoach && invoice.status === 'pending' && !invoice.revolut_link && (
                            <p className="text-xs text-slate-500 mt-2">Your coach will share payment details</p>
                          )}
                          {/* Coach sees Mark as paid button */}
                          {isCoach && invoice.status === 'pending' && (
                            <button
                              onClick={() => handleMarkPaid(invoice.id)}
                              className="flex items-center justify-center gap-2 w-full mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors"
                            >
                              <Check className="w-4 h-4" /> Mark as paid
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="h-8 bg-slate-600 rounded animate-pulse" />
                      )}
                    </div>
                    <div className="px-4 py-1.5 text-[10px] text-slate-500">
                      {formatTime(m.created_at)}
                    </div>
                  </div>
                </div>
              );
            }

            // Regular message
            return (
              <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                  isMine
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-slate-700 text-slate-100 rounded-bl-md'
                }`}>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                  <p className={`text-[10px] mt-1 ${isMine ? 'text-blue-200' : 'text-slate-500'}`}>
                    {formatTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="pt-3 border-t border-slate-700">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a message..."
            className="flex-1 bg-slate-700 text-slate-100 text-sm px-4 py-3 rounded-xl border border-slate-600 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="p-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceForm({ studentId, onSent, onCancel }: {
  studentId: number;
  onSent: (msg: Message, invoice: InvoiceInfo) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0 || sending) return;
    setSending(true);
    try {
      const res = await authFetch('/api/coaches/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, amount: num, currency, description: description.trim() || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        onSent(data.message, { id: data.invoice_id, amount: num, currency, description: description.trim() || null, status: 'pending', revolut_link: null, paid_at: null });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-b border-slate-700 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={currency}
          onChange={e => setCurrency(e.target.value)}
          className="bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-emerald-500"
        >
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
          <option value="GBP">GBP</option>
          <option value="CHF">CHF</option>
        </select>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="Amount"
          className="flex-1 bg-slate-700 text-slate-100 text-sm px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-emerald-500"
          autoFocus
        />
      </div>
      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full bg-slate-700 text-slate-100 text-sm px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-emerald-500"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={!amount || parseFloat(amount) <= 0 || sending}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Receipt className="w-3.5 h-3.5" />
          {sending ? '...' : 'Send invoice'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
