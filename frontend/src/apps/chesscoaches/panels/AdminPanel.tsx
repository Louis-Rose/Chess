// Admin panel for coaches app (admin only)

import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, ChevronUp, ChevronDown, Clock, Cpu, AlertTriangle, Download, Image, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell } from '../components/PanelShell';

interface AdminUser {
  id: number;
  email: string;
  name: string;
  picture: string;
  is_admin: number;
  created_at: string;
  total_seconds: number;
  last_active: string | null;
  session_count: number;
  sign_in_count: number;
}

interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
}

interface TimeSpentDay {
  activity_date: string;
  total_seconds: number;
}

interface ApiUsageRow {
  id: number;
  feature: string;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  elapsed_seconds: number;
  error: string | null;
  created_at: string;
}

interface ApiUsageByModel {
  model_id: string;
  call_count: number;
  paid_count: number;
  free_count: number;
  total_input: number;
  total_output: number;
  total_thinking: number;
  error_count: number;
  avg_elapsed: number;
  cost_usd: number;
}

interface ApiInvocationModel {
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  billing_tier: string;
  elapsed_seconds: number;
  error: string | null;
  cost_usd: number;
  retry_free_error?: string | null;
  retry_free_elapsed?: number | null;
}

interface ApiInvocation {
  request_id: string;
  feature: string;
  model_count: number;
  total_input: number;
  total_output: number;
  elapsed_seconds: number;
  error_count: number;
  free_count: number;
  cost_usd: number;
  created_at: string;
  models: ApiInvocationModel[];
}

interface ApiUsageResponse {
  history: ApiUsageRow[];
  by_model: ApiUsageByModel[];
  by_feature: { feature: string; call_count: number; invocation_count?: number; total_input: number; total_output: number; cost_usd: number }[];
  invocations: ApiInvocation[];
  total_cost_usd: number;
  pricing: Record<string, { input: number; output: number }>;
}

interface UserUpload {
  filename: string;
  size: number;
  created_at: number;
}

type SortColumn = 'name' | 'created_at' | 'last_active' | 'total_seconds' | 'session_count';
type SortDirection = 'asc' | 'desc';

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatDate(dateStr: string | null, lang: string): string {
  if (!dateStr) return '—';
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  return new Date(dateStr).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function timeAgo(dateStr: string | null, lang: string): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (lang === 'fr') {
    if (minutes < 60) return `il y a ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours} heure${hours !== 1 ? 's' : ''}`;
    const days = Math.floor(hours / 24);
    return `il y a ${days} jour${days !== 1 ? 's' : ''}`;
  }
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

function formatTokens(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0';
  return `$${usd.toFixed(2)}`;
}

function shortModel(id: string): string {
  return id.replace('gemini-', '').replace('-preview', '');
}

const FEATURE_LABELS: Record<string, string> = {
  scoresheet: 'Scoresheet \u2192 PGN',
  reread: 'Re-read',
  diagram: 'Diagram \u2192 FEN',
};

export function AdminPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [expandedInvocation, setExpandedInvocation] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>('total_seconds');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [usersCollapsed, setUsersCollapsed] = useState(false);

  const toggleUser = (id: number) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const userIdsParam = useMemo(() => {
    if (selectedUserIds.size === 0) return undefined;
    return [...selectedUserIds].join(',');
  }, [selectedUserIds]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-coach-users'],
    queryFn: async (): Promise<AdminUsersResponse> => {
      const response = await axios.get('/api/admin/coach-users');
      return response.data;
    },
    enabled: !!user?.is_admin,
  });

  const { data: timeSpentData } = useQuery({
    queryKey: ['admin-coach-time-spent', userIdsParam],
    queryFn: async (): Promise<TimeSpentDay[]> => {
      const response = await axios.get('/api/admin/coach-time-spent', {
        params: userIdsParam ? { user_ids: userIdsParam } : {},
      });
      return response.data.daily_stats;
    },
    enabled: !!user?.is_admin,
  });

  const { data: apiUsage } = useQuery({
    queryKey: ['admin-api-usage', userIdsParam],
    queryFn: async (): Promise<ApiUsageResponse> => {
      const response = await axios.get('/api/admin/api-usage', {
        params: userIdsParam ? { user_ids: userIdsParam } : {},
      });
      return response.data;
    },
    enabled: !!user?.is_admin,
  });

  const { data: uploadsData, isLoading: uploadsLoading } = useQuery({
    queryKey: ['admin-user-uploads', expandedUserId],
    queryFn: async (): Promise<{ uploads: UserUpload[] }> => {
      const response = await axios.get(`/api/admin/user-uploads/${expandedUserId}`);
      return response.data;
    },
    enabled: expandedUserId !== null,
  });

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const sortedUsers = useMemo(() => {
    if (!data?.users) return [];
    return [...data.users].sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'name': cmp = (a.name || '').localeCompare(b.name || ''); break;
        case 'created_at': cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
        case 'last_active': cmp = (a.last_active ? new Date(a.last_active).getTime() : 0) - (b.last_active ? new Date(b.last_active).getTime() : 0); break;
        case 'total_seconds': cmp = a.total_seconds - b.total_seconds; break;
        case 'session_count': cmp = (a.session_count || 0) - (b.session_count || 0); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [data?.users, sortColumn, sortDirection]);

  // Fill in missing dates so the chart has no gaps
  const chartData = useMemo(() => {
    if (!timeSpentData || timeSpentData.length === 0) return [];
    const LAUNCH = '2026-03-23';
    const today = new Date().toISOString().split('T')[0];
    const start = new Date(LAUNCH);
    const end = new Date(today);
    const byDate: Record<string, number> = {};
    timeSpentData.forEach(d => { byDate[d.activity_date] = d.total_seconds; });

    const result: { date: string; label: string; minutes: number }[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const key = cur.toISOString().split('T')[0];
      const seconds = byDate[key] || 0;
      result.push({
        date: key,
        label: cur.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long' }),
        minutes: Math.round(seconds / 60),
      });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [timeSpentData, language]);

  if (!authLoading && (!user || !user.is_admin)) {
    return <Navigate to="/" replace />;
  }

  if (authLoading || isLoading) {
    return (
      <PanelShell title={t('coaches.navAdmin')}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        </div>
      </PanelShell>
    );
  }

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc'
      ? <ChevronUp className="w-3 h-3 inline ml-1" />
      : <ChevronDown className="w-3 h-3 inline ml-1" />;
  };

  return (
    <PanelShell title={t('coaches.navAdmin')}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Users Table */}
        {error ? (
          <p className="text-red-400 text-center py-8">{t('coaches.admin.failedLoad')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="bg-slate-700/50 text-slate-400 text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-700/70 transition-colors"
                  onClick={() => setUsersCollapsed(c => !c)}
                >
                  <th className="w-8 px-2 py-2" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={sortedUsers.length > 0 && selectedUserIds.size === sortedUsers.length}
                      ref={el => { if (el) el.indeterminate = selectedUserIds.size > 0 && selectedUserIds.size < sortedUsers.length; }}
                      onChange={() => {
                        if (selectedUserIds.size === sortedUsers.length) {
                          setSelectedUserIds(new Set());
                        } else {
                          setSelectedUserIds(new Set(sortedUsers.map(u => u.id)));
                        }
                      }}
                      className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer w-3.5 h-3.5"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-sm normal-case tracking-normal text-slate-300" colSpan={usersCollapsed ? 5 : 1}>
                    {data?.total ?? 0} {(data?.total ?? 0) === 1 ? t('coaches.admin.user1') : t('coaches.admin.users')}
                    {selectedUserIds.size > 0 && <span className="text-blue-400 ml-2">({selectedUserIds.size} selected)</span>}
                  </th>
                  {!usersCollapsed && <>
                    <th className="px-3 py-2 text-center cursor-pointer hover:text-slate-200" onClick={e => { e.stopPropagation(); handleSort('created_at'); }}>
                      {t('coaches.admin.joined')} <SortIcon column="created_at" />
                    </th>
                    <th className="px-3 py-2 text-center cursor-pointer hover:text-slate-200" onClick={e => { e.stopPropagation(); handleSort('last_active'); }}>
                      {t('coaches.admin.lastActive')} <SortIcon column="last_active" />
                    </th>
                    <th className="px-3 py-2 text-center cursor-pointer hover:text-slate-200" onClick={e => { e.stopPropagation(); handleSort('session_count'); }}>
                      {t('coaches.admin.sessions')} <SortIcon column="session_count" />
                    </th>
                  </>}
                  <th className="px-3 py-2 text-right">
                    {!usersCollapsed && <span className="cursor-pointer hover:text-slate-200 mr-2" onClick={e => { e.stopPropagation(); handleSort('total_seconds'); }}>{t('coaches.admin.time')} <SortIcon column="total_seconds" /></span>}
                    {usersCollapsed ? <ChevronDown className="w-4 h-4 inline text-slate-400" /> : <ChevronUp className="w-4 h-4 inline text-slate-400" />}
                  </th>
                </tr>
              </thead>
              {!usersCollapsed && <tbody className="divide-y divide-slate-700/50">
                {sortedUsers.map(u => (
                  <React.Fragment key={u.id}>
                    <tr
                      onClick={() => setExpandedUserId(prev => prev === u.id ? null : u.id)}
                      className={`hover:bg-slate-700/30 transition-colors cursor-pointer ${selectedUserIds.has(u.id) ? 'bg-slate-700/20' : ''}`}
                    >
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.has(u.id)}
                          onChange={() => toggleUser(u.id)}
                          onClick={e => e.stopPropagation()}
                          className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer w-3.5 h-3.5"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {u.picture ? (
                            <img src={u.picture} alt="" className="w-6 h-6 rounded-full" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-xs text-slate-300">
                              {(u.name || u.email).charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-slate-200 truncate">{u.name || u.email}</p>
                            <p className="text-slate-500 text-xs truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-400 text-center whitespace-nowrap">{formatDate(u.created_at, language)}</td>
                      <td className="px-3 py-2 text-slate-400 text-center whitespace-nowrap">{timeAgo(u.last_active, language)}</td>
                      <td className="px-3 py-2 text-slate-400 text-center">{u.session_count || 0}</td>
                      <td className="px-3 py-2 text-slate-400 text-center whitespace-nowrap">{formatDuration(u.total_seconds)}</td>
                    </tr>
                    {expandedUserId === u.id && (
                      <tr>
                        <td colSpan={6} className="px-3 py-3 bg-slate-800/50">
                          <div className="flex items-center gap-2 mb-2">
                            <Image className="w-4 h-4 text-slate-400" />
                            <span className="text-sm text-slate-300 font-medium">Uploads</span>
                          </div>
                          {uploadsLoading ? (
                            <div className="flex justify-center py-3">
                              <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                            </div>
                          ) : !uploadsData?.uploads?.length ? (
                            <p className="text-slate-500 text-xs italic">No uploads yet</p>
                          ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {uploadsData.uploads.map(file => (
                                <div
                                  key={file.filename}
                                  className="group relative bg-slate-700/50 rounded-lg overflow-hidden border border-slate-600 hover:border-blue-500 transition-colors"
                                >
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await axios.delete(`/api/admin/user-uploads/${u.id}/${file.filename}`);
                                      queryClient.invalidateQueries({ queryKey: ['admin-user-uploads', u.id] });
                                    }}
                                    className="absolute top-1 right-1 z-10 w-5 h-5 bg-slate-900/80 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
                                  >
                                    <X className="w-3 h-3 text-slate-300" />
                                  </button>
                                  <a
                                    href={`/api/admin/user-uploads/${u.id}/${file.filename}`}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <img
                                      src={`/api/admin/user-uploads/${u.id}/${file.filename}`}
                                      alt={file.filename}
                                      className="w-full h-24 object-cover"
                                    />
                                    <div className="p-1.5 flex items-center justify-between">
                                      <span className="text-xs text-slate-400 truncate">{file.filename}</span>
                                      <Download className="w-3 h-3 text-slate-500 group-hover:text-blue-400 flex-shrink-0" />
                                    </div>
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>}
            </table>
          </div>
        )}

        {/* Time Spent Chart */}
        {chartData.length > 0 && (
          <div className="bg-slate-700/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-medium text-slate-300">{t('coaches.admin.dailyTimeSpent')}</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: '#e2e8f0', fontSize: 13 }} />
                <YAxis tick={{ fill: '#e2e8f0', fontSize: 13 }} ticks={(() => { const max = Math.max(...chartData.map(d => d.minutes)); const ceil = Math.max(60, Math.ceil(max / 60) * 60); return Array.from({ length: ceil / 30 + 1 }, (_, i) => i * 30); })()} domain={[0, (max: number) => Math.max(60, Math.ceil(max / 60) * 60)]} />
                <Tooltip
                  cursor={false}
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }}
                  formatter={(value) => [`${value} min`, t('coaches.admin.time')]}
                />
                <Bar dataKey="minutes" fill="#16a34a" radius={[2, 2, 0, 0]} activeBar={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Gemini API Usage */}
        {apiUsage && (
          <div className="bg-slate-700/30 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-slate-300">Gemini API Usage</h3>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1">
                  <span className="text-green-400 font-medium">{formatCost(apiUsage.total_cost_usd)}</span>
                  <span className="text-slate-500">total</span>
                </div>
                <a href="https://aistudio.google.com/spend" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Google Billing</a>
              </div>
            </div>

            {/* Per-feature summary */}
            {apiUsage.by_feature.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-600/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700/50 text-slate-400 text-xs uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">Feature</th>
                      <th className="px-3 py-2 text-center">Uses</th>
                      <th className="px-3 py-2 text-center">Tokens</th>
                      <th className="px-3 py-2 text-center">Avg time</th>
                      <th className="px-3 py-2 text-center">Avg cost</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {apiUsage.by_feature.map(f => {
                      const featureInvocations = apiUsage.invocations.filter(i => i.feature === f.feature);
                      const uses = f.invocation_count || featureInvocations.length || f.call_count;
                      const avgTime = featureInvocations.length > 0
                        ? Math.round(featureInvocations.reduce((s, i) => s + i.elapsed_seconds, 0) / featureInvocations.length)
                        : 0;
                      return (
                        <tr key={f.feature} className="hover:bg-slate-700/30">
                          <td className="px-3 py-2 text-slate-200">{FEATURE_LABELS[f.feature] || f.feature}</td>
                          <td className="px-3 py-2 text-slate-400 text-center">{uses}</td>
                          <td className="px-3 py-2 text-slate-400 text-center">{formatTokens((f.total_input || 0) + (f.total_output || 0))}</td>
                          <td className="px-3 py-2 text-slate-400 text-center">{avgTime > 0 ? `${avgTime}s` : '—'}</td>
                          <td className="px-3 py-2 text-slate-400 text-center">{uses > 0 ? formatCost(f.cost_usd / uses) : '—'}</td>
                          <td className="px-3 py-2 text-green-400 text-right font-medium">{formatCost(f.cost_usd)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Cost per model */}
            {apiUsage.by_model.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-600/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700/50 text-slate-400 text-xs uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">Model</th>
                      <th className="px-3 py-2 text-center">Calls</th>
                      <th className="px-3 py-2 text-center">Paid</th>
                      <th className="px-3 py-2 text-center">Free</th>
                      <th className="px-3 py-2 text-center">Input</th>
                      <th className="px-3 py-2 text-center">Output</th>
                      <th className="px-3 py-2 text-center">Thinking</th>
                      <th className="px-3 py-2 text-center">Avg time</th>
                      <th className="px-3 py-2 text-center">Errors</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {apiUsage.by_model.map(m => (
                      <tr key={m.model_id} className="hover:bg-slate-700/30">
                        <td className="px-3 py-2 text-slate-200 font-mono text-xs">{shortModel(m.model_id)}</td>
                        <td className="px-3 py-2 text-slate-400 text-center">{m.call_count}</td>
                        <td className="px-3 py-2 text-center">{m.paid_count > 0 ? <span className="text-slate-300">{m.paid_count}</span> : <span className="text-slate-600">0</span>}</td>
                        <td className="px-3 py-2 text-center">{m.free_count > 0 ? <span className="text-emerald-400">{m.free_count}</span> : <span className="text-slate-600">0</span>}</td>
                        <td className="px-3 py-2 text-slate-400 text-center">{formatTokens(m.total_input)}</td>
                        <td className="px-3 py-2 text-slate-400 text-center">{formatTokens(m.total_output)}</td>
                        <td className="px-3 py-2 text-center">{m.total_thinking ? <span className="text-amber-400">{formatTokens(m.total_thinking)}</span> : <span className="text-slate-600">0</span>}</td>
                        <td className="px-3 py-2 text-slate-400 text-center">{m.avg_elapsed}s</td>
                        <td className="px-3 py-2 text-center">
                          {m.error_count > 0
                            ? <span className="text-red-400">{m.error_count}</span>
                            : <span className="text-slate-600">0</span>}
                        </td>
                        <td className="px-3 py-2 text-green-400 text-right font-medium">{formatCost(m.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Invocation history (feature-level) */}
            {apiUsage.invocations.length > 0 && (
              <div>
                <h4 className="text-xs text-slate-500 mb-2">History ({apiUsage.invocations.length} invocations)</h4>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-600/50">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0">
                      <tr className="bg-slate-700/80 text-slate-400 uppercase tracking-wider">
                        <th className="px-2 py-1.5 text-left">Time</th>
                        <th className="px-2 py-1.5 text-left">Feature</th>
                        <th className="px-2 py-1.5 text-center">Models</th>
                        <th className="px-2 py-1.5 text-center">Tokens</th>
                        <th className="px-2 py-1.5 text-center">Time</th>
                        <th className="px-2 py-1.5 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {apiUsage.invocations.map(inv => {
                        const expanded = expandedInvocation === inv.request_id;
                        return (
                          <React.Fragment key={inv.request_id}>
                            <tr
                              className={`hover:bg-slate-700/20 cursor-pointer ${inv.error_count >= inv.model_count ? 'bg-red-900/10' : ''}`}
                              onClick={() => setExpandedInvocation(expanded ? null : inv.request_id)}
                            >
                              <td className="px-2 py-1 text-slate-500 whitespace-nowrap">
                                {new Date(inv.created_at).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short' })}
                                {' '}
                                {new Date(inv.created_at).toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-2 py-1 text-slate-300">
                                {FEATURE_LABELS[inv.feature] || inv.feature}
                                {inv.free_count > 0 && <span className="ml-1.5 text-[10px] text-emerald-400 bg-emerald-400/10 px-1 rounded">{inv.free_count} free</span>}
                              </td>
                              <td className="px-2 py-1 text-slate-400 text-center">{inv.model_count}</td>
                              <td className="px-2 py-1 text-slate-400 text-center">{formatTokens((inv.total_input || 0) + (inv.total_output || 0))}</td>
                              <td className="px-2 py-1 text-slate-400 text-center">{inv.elapsed_seconds}s</td>
                              <td className="px-2 py-1 text-right">
                                {inv.error_count >= inv.model_count
                                  ? <span className="text-red-400 flex items-center justify-end gap-1"><AlertTriangle className="w-3 h-3" />{formatCost(inv.cost_usd)}</span>
                                  : <span className="text-green-400">{formatCost(inv.cost_usd)}</span>}
                              </td>
                            </tr>
                            {expanded && inv.models && (
                              <tr>
                                <td colSpan={6} className="px-2 py-2 bg-slate-800/50">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-slate-500 text-[10px] uppercase">
                                        <th className="px-2 py-1 text-left">Model</th>
                                        <th className="px-2 py-1 text-center">Tier</th>
                                        <th className="px-2 py-1 text-center">Retry</th>
                                        <th className="px-2 py-1 text-center">Input</th>
                                        <th className="px-2 py-1 text-center">Output</th>
                                        <th className="px-2 py-1 text-center">Thinking</th>
                                        <th className="px-2 py-1 text-center">Time</th>
                                        <th className="px-2 py-1 text-right">Cost</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {inv.models.map((m, i) => (
                                        <tr key={i} className={m.error ? 'text-red-400/70' : ''}>
                                          <td className="px-2 py-0.5 font-mono">{shortModel(m.model_id)}</td>
                                          <td className="px-2 py-0.5 text-center">
                                            {m.retry_free_error ? (
                                              <span title={m.retry_free_error}>
                                                <span className="text-red-400/70 line-through">free</span>
                                                <span className="text-slate-600 mx-0.5">→</span>
                                                <span className="text-slate-500">paid</span>
                                              </span>
                                            ) : m.billing_tier === 'free' ? <span className="text-emerald-400">free</span> : <span className="text-slate-500">paid</span>}
                                          </td>
                                          <td className="px-2 py-0.5 text-center">
                                            {m.retry_free_error ? (
                                              <span className="text-yellow-400" title={m.retry_free_error}>free {m.retry_free_elapsed}s</span>
                                            ) : <span className="text-slate-600">—</span>}
                                          </td>
                                          <td className="px-2 py-0.5 text-slate-400 text-center">{formatTokens(m.input_tokens)}</td>
                                          <td className="px-2 py-0.5 text-slate-400 text-center">{formatTokens(m.output_tokens)}</td>
                                          <td className="px-2 py-0.5 text-center">{m.thinking_tokens ? <span className="text-amber-400">{formatTokens(m.thinking_tokens)}</span> : <span className="text-slate-600">0</span>}</td>
                                          <td className="px-2 py-0.5 text-slate-400 text-center">{m.elapsed_seconds}s</td>
                                          <td className="px-2 py-0.5 text-right">{m.error ? <span className="text-red-400">err</span> : <span className="text-green-400">{formatCost(m.cost_usd)}</span>}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {apiUsage.by_model.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-4">No API calls recorded yet</p>
            )}
          </div>
        )}

      </div>
    </PanelShell>
  );
}
