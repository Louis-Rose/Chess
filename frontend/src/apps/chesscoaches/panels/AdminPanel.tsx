// Admin panel for coaches app (admin only)

import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, ChevronUp, ChevronDown, Clock, Cpu, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getCoachesPrefs, saveCoachesPrefs } from '../contexts/CoachesDataContext';
import { PanelShell } from '../components/PanelShell';
import { ImageZoomModal } from '../components/ImageZoomModal';
import { NAV_SECTIONS } from '../ChessCoachesLayout';

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
  cost_usd: number;
  coaches_chess_username: string | null;
  lichess_username: string | null;
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
  user_id: number | null;
  user_name: string | null;
  user_picture: string | null;
  models: ApiInvocationModel[];
}

interface ApiUsageResponse {
  history: ApiUsageRow[];
  by_model: ApiUsageByModel[];
  by_feature: { feature: string; call_count: number; invocation_count?: number; total_input: number; total_output: number; cost_usd: number }[];
  invocations: ApiInvocation[];
  daily_invocations: { feature: string; date: string; count: number }[];
  total_cost_usd: number;
  pricing: Record<string, { input: number; output: number }>;
}

interface UserUpload {
  filename: string;
  size: number;
  created_at: number;
}

type SortColumn = 'name' | 'created_at' | 'last_active' | 'total_seconds' | 'session_count' | 'cost_usd';
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

// Map page ids to their associated API feature names
const PAGE_TO_API_FEATURES: Record<string, string[]> = {
  scoresheets: ['scoresheet', 'reread'],
  diagram: ['diagram'],
  mistakes: ['mistakes'],
};

// Enabled features — derived from NAV_SECTIONS with same filter as sidebar
const ENABLED_FEATURE_FILTER = (path: string) => ['/scoresheets', '/payments', '/students'].includes(path);
const COACH_FEATURES: { id: string; labelKey: string }[] = NAV_SECTIONS
  .flatMap(s => s.items)
  .filter(({ path }) => ENABLED_FEATURE_FILTER(path))
  .map(({ path, labelKey }) => ({ id: path.slice(1), labelKey }));

export function AdminPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const { t, language } = useLanguage();

  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [expandedInvocation, setExpandedInvocation] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>('total_seconds');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [usersCollapsed, setUsersCollapsed] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [chartCollapsed, setChartCollapsed] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [usersInitialized, setUsersInitialized] = useState(false);
  const [zoomedImageSrc, setZoomedImageSrc] = useState<string | null>(null);

  const toggleUser = (id: number) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-coach-users'],
    queryFn: async (): Promise<AdminUsersResponse> => {
      const response = await axios.get('/api/admin/coach-users');
      return response.data;
    },
    enabled: !!user?.is_admin,
  });

  // Select all users by default once data loads
  useEffect(() => {
    if (data?.users && !usersInitialized) {
      setSelectedUserIds(new Set(data.users.map(u => u.id)));
      setUsersInitialized(true);
    }
  }, [data?.users, usersInitialized]);

  // "all selected" = no filter (undefined), "none selected" = empty string sentinel to exclude everything
  const userIdsParam = useMemo(() => {
    if (!data?.users) return undefined;
    if (selectedUserIds.size === 0) return '';
    if (selectedUserIds.size === data.users.length) return undefined;
    return [...selectedUserIds].join(',');
  }, [selectedUserIds, data?.users]);

  const pagesParam = useMemo(() => {
    if (!selectedFeature) return undefined; // no feature filter = all pages
    return selectedFeature;
  }, [selectedFeature]);

  const nothingSelected = userIdsParam === '';

  // Global time spent (no feature filter)
  const { data: timeSpentData } = useQuery({
    queryKey: ['admin-coach-time-spent', userIdsParam],
    queryFn: async (): Promise<TimeSpentDay[]> => {
      if (nothingSelected) return [];
      const params: Record<string, string> = {};
      if (userIdsParam) params.user_ids = userIdsParam;
      const response = await axios.get('/api/admin/coach-time-spent', { params });
      return response.data.daily_stats;
    },
    enabled: !!user?.is_admin,
  });

  // Per-feature time spent (when a feature is selected)
  const { data: featureTimeSpentData } = useQuery({
    queryKey: ['admin-coach-time-spent-feature', userIdsParam, pagesParam],
    queryFn: async (): Promise<TimeSpentDay[]> => {
      if (nothingSelected || !pagesParam) return [];
      const params: Record<string, string> = { pages: pagesParam };
      if (userIdsParam) params.user_ids = userIdsParam;
      const response = await axios.get('/api/admin/coach-time-spent', { params });
      return response.data.daily_stats;
    },
    enabled: !!user?.is_admin && !!selectedFeature,
  });

  const { data: apiUsage } = useQuery({
    queryKey: ['admin-api-usage', userIdsParam],
    queryFn: async (): Promise<ApiUsageResponse> => {
      if (nothingSelected) return { history: [], by_model: [], by_feature: [], invocations: [], daily_invocations: [], total_cost_usd: 0, pricing: {} };
      const params: Record<string, string> = {};
      if (userIdsParam) params.user_ids = userIdsParam;
      const response = await axios.get('/api/admin/api-usage', { params });
      return response.data;
    },
    enabled: !!user?.is_admin,
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
        case 'cost_usd': cmp = (a.cost_usd || 0) - (b.cost_usd || 0); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [data?.users, sortColumn, sortDirection]);

  // Build chart data from time spent days (fills gaps so chart has no holes)
  const buildChartData = (days: TimeSpentDay[] | undefined) => {
    const LAUNCH = '2026-03-23';
    const today = new Date().toISOString().split('T')[0];
    const start = new Date(LAUNCH);
    const end = new Date(today);
    const byDate: Record<string, number> = {};
    (days || []).forEach(d => { byDate[d.activity_date] = d.total_seconds; });
    const result: { date: string; label: string; minutes: number }[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const key = cur.toISOString().split('T')[0];
      result.push({
        date: key,
        label: cur.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long' }),
        minutes: Math.round((byDate[key] || 0) / 60),
      });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  };

  const chartData = useMemo(() => buildChartData(timeSpentData), [timeSpentData, language]); // eslint-disable-line react-hooks/exhaustive-deps
  const featureChartData = useMemo(() => buildChartData(featureTimeSpentData), [featureTimeSpentData, language]); // eslint-disable-line react-hooks/exhaustive-deps

  // Students data (for "students" feature view)
  const { data: allStudentsData } = useQuery({
    queryKey: ['admin-coach-students'],
    queryFn: async () => {
      const response = await axios.get('/api/admin/coach-students');
      return response.data.coaches as { coach_user_id: number; coach_name: string; coach_picture: string | null; students: { name: string; created_at: string }[] }[];
    },
    enabled: !!user?.is_admin && selectedFeature === 'students',
  });
  const studentsData = useMemo(() => {
    if (!allStudentsData) return undefined;
    if (selectedUserIds.size === 0) return [];
    return allStudentsData.filter(c => selectedUserIds.has(c.coach_user_id));
  }, [allStudentsData, selectedUserIds]);

  // Filter API usage by selected features (map page ids to API feature names)
  const filteredApiUsage = useMemo(() => {
    if (!apiUsage) return undefined;
    if (!selectedFeature) return apiUsage; // no filter = show all
    // Derive which API features match the selected page
    const selectedApiFeatures = new Set<string>();
    const apiFeatures = PAGE_TO_API_FEATURES[selectedFeature];
    if (apiFeatures) apiFeatures.forEach(f => selectedApiFeatures.add(f));
    if (selectedApiFeatures.size === 0) {
      return { ...apiUsage, by_feature: [], by_model: [], invocations: [], daily_invocations: [], total_cost_usd: 0 };
    }
    return {
      ...apiUsage,
      by_feature: apiUsage.by_feature.filter(f => selectedApiFeatures.has(f.feature)),
      by_model: apiUsage.by_model,
      invocations: apiUsage.invocations.filter(i => selectedApiFeatures.has(i.feature)),
      daily_invocations: apiUsage.daily_invocations.filter(d => selectedApiFeatures.has(d.feature)),
      total_cost_usd: apiUsage.by_feature
        .filter(f => selectedApiFeatures.has(f.feature))
        .reduce((sum, f) => sum + f.cost_usd, 0),
    };
  }, [apiUsage, selectedFeature]);

  // Cumulative daily invocation chart data
  const invocationChartData = useMemo(() => {
    const daily = filteredApiUsage?.daily_invocations;
    if (!daily || daily.length === 0) return [];
    const LAUNCH = '2026-03-23';
    const today = new Date().toISOString().split('T')[0];
    const byDate: Record<string, number> = {};
    daily.forEach(d => { byDate[d.date] = (byDate[d.date] || 0) + d.count; });
    const result: { date: string; label: string; count: number; cumulative: number }[] = [];
    const cur = new Date(LAUNCH);
    const end = new Date(today);
    let cumulative = 0;
    while (cur <= end) {
      const key = cur.toISOString().split('T')[0];
      const count = byDate[key] || 0;
      cumulative += count;
      result.push({
        date: key,
        label: cur.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long' }),
        count,
        cumulative,
      });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [filteredApiUsage?.daily_invocations, language]);

  // Fetch uploads for all users who have invocations
  const invocationUserIds = useMemo(() => {
    if (!filteredApiUsage?.invocations) return [] as number[];
    return [...new Set(filteredApiUsage.invocations.map(i => i.user_id).filter((id): id is number => id !== null))];
  }, [filteredApiUsage]);

  const { data: allUploadsData } = useQuery({
    queryKey: ['admin-all-user-uploads', invocationUserIds],
    queryFn: async (): Promise<Map<number, UserUpload[]>> => {
      const results = new Map<number, UserUpload[]>();
      await Promise.all(invocationUserIds.map(async uid => {
        const response = await axios.get(`/api/admin/user-uploads/${uid}`);
        results.set(uid, response.data.uploads || []);
      }));
      return results;
    },
    enabled: invocationUserIds.length > 0,
  });

  // Map each invocation to its upload by matching the Nth invocation (per user+feature) to file {feature}_{surname}_{N}
  const invUploadMap = useMemo(() => {
    if (!filteredApiUsage?.invocations || !allUploadsData) return new Map<string, UserUpload>();
    const result = new Map<string, UserUpload>();
    // Group invocations by user+feature, sorted oldest first
    const groups = new Map<string, ApiInvocation[]>();
    for (const inv of [...filteredApiUsage.invocations].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())) {
      const key = `${inv.user_id}_${inv.feature}`;
      const list = groups.get(key) || [];
      list.push(inv);
      groups.set(key, list);
    }
    // For each group, match invocation N to file ending in _N.ext
    for (const [, invs] of groups) {
      const uploads = invs[0].user_id != null ? allUploadsData.get(invs[0].user_id) : undefined;
      if (!uploads) continue;
      const feature = invs[0].feature;
      invs.forEach((inv, idx) => {
        const n = idx + 1;
        const pattern = new RegExp(`^${feature}_.*_${n}\\.[a-z]+$`, 'i');
        const match = uploads.find(f => pattern.test(f.filename));
        if (match) result.set(inv.request_id, match);
      });
    }
    return result;
  }, [filteredApiUsage, allUploadsData]);

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
        {/* Codelines indicator */}
        <CodelinesBadge />

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
                  <th className="w-8 px-2 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {usersCollapsed ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronUp className="w-5 h-5 text-slate-400" />}
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left text-sm normal-case tracking-normal text-slate-300" colSpan={usersCollapsed ? 6 : 1}>
                    <div className="flex items-center gap-2">
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
                        onClick={e => e.stopPropagation()}
                        className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer w-3.5 h-3.5"
                      />
                      <span>{data?.total ?? 0} {(data?.total ?? 0) === 1 ? t('coaches.admin.user1') : t('coaches.admin.users')}</span>
                      {selectedUserIds.size > 0 && <span className="text-blue-400">({selectedUserIds.size} selected)</span>}
                    </div>
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
                    <th className="px-3 py-2 text-center cursor-pointer hover:text-slate-200" onClick={e => { e.stopPropagation(); handleSort('total_seconds'); }}>
                      {t('coaches.admin.time')} <SortIcon column="total_seconds" />
                    </th>
                    <th className="px-3 py-2 text-right cursor-pointer hover:text-slate-200" onClick={e => { e.stopPropagation(); handleSort('cost_usd'); }}>
                      Cost <SortIcon column="cost_usd" />
                    </th>
                  </>}
                </tr>
              </thead>
              {!usersCollapsed && <tbody className="divide-y divide-slate-700/50">
                {sortedUsers.map(u => (
                  <React.Fragment key={u.id}>
                    <tr
                      className={`hover:bg-slate-700/30 transition-colors cursor-pointer ${selectedUserIds.has(u.id) ? 'bg-slate-700/20' : ''}`}
                      onClick={() => setExpandedUserId(prev => prev === u.id ? null : u.id)}
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
                      <td className="px-3 py-2 text-green-400 text-right whitespace-nowrap font-medium">{formatCost(u.cost_usd || 0)}</td>
                    </tr>
                    {expandedUserId === u.id && (
                      <tr className="bg-slate-800/50">
                        <td colSpan={8} className="px-6 py-3">
                          <div className="flex gap-6 text-xs">
                            <div>
                              <span className="text-slate-500">Chess.com: </span>
                              <span className="text-slate-300">{u.coaches_chess_username || '—'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Lichess: </span>
                              <span className="text-slate-300">{u.lichess_username || '—'}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>}
            </table>
          </div>
        )}

        {/* Global Time Spent Chart */}
        {chartData.length > 0 && (
          <div className="rounded-lg border border-slate-700 overflow-hidden">
            <div
              className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
              onClick={() => setChartCollapsed(c => !c)}
            >
              {chartCollapsed ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronUp className="w-5 h-5 text-slate-400" />}
              <Clock className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-medium text-slate-300">{t('coaches.admin.dailyTimeSpent')}</h3>
            </div>
            {!chartCollapsed && (
              <div className="p-4">
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
          </div>
        )}

        {/* Feature Dropdown */}
        <div className="flex items-center gap-3">
          <select
            value={selectedFeature || ''}
            onChange={e => setSelectedFeature(e.target.value || null)}
            className="bg-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-blue-500"
          >
            <option value="">All features</option>
            {COACH_FEATURES.map(f => (
              <option key={f.id} value={f.id}>{t(f.labelKey)}</option>
            ))}
          </select>
          {selectedFeature && (
            <span className="text-xs text-slate-500">Showing data for {t(COACH_FEATURES.find(f => f.id === selectedFeature)?.labelKey || '')}</span>
          )}
        </div>

        {/* Per-feature time spent sub-chart */}
        {selectedFeature && featureChartData.length > 0 && (
          <div className="rounded-lg border border-slate-700 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50">
              <Clock className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-medium text-slate-300">
                {t(COACH_FEATURES.find(f => f.id === selectedFeature)?.labelKey || '')} — {t('coaches.admin.dailyTimeSpent')}
              </h3>
            </div>
            <div className="p-4">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={featureChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="label" tick={{ fill: '#e2e8f0', fontSize: 13 }} />
                  <YAxis tick={{ fill: '#e2e8f0', fontSize: 13 }} allowDecimals={false} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    formatter={(value) => [`${value} min`, t('coaches.admin.time')]}
                  />
                  <Bar dataKey="minutes" fill="#8b5cf6" radius={[2, 2, 0, 0]} activeBar={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Students view — when "students" feature is selected */}
        {selectedFeature === 'students' && studentsData && (
          <div className="space-y-4">
            {/* Cumulative students over time */}
            {(() => {
              const allDates = studentsData.flatMap(c => c.students.map(s => {
                if (!s.created_at) return '';
                return new Date(s.created_at).toISOString().split('T')[0];
              })).filter(Boolean).sort();
              if (allDates.length === 0) return null;
              const start = new Date(allDates[0]);
              const end = new Date();
              const dailyCounts: Record<string, number> = {};
              allDates.forEach(d => { dailyCounts[d] = (dailyCounts[d] || 0) + 1; });
              const data: { date: string; label: string; total: number }[] = [];
              const cur = new Date(start);
              let cumulative = 0;
              while (cur <= end) {
                const key = cur.toISOString().split('T')[0];
                cumulative += dailyCounts[key] || 0;
                data.push({
                  date: key,
                  label: cur.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short' }),
                  total: cumulative,
                });
                cur.setDate(cur.getDate() + 1);
              }
              return (
                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50">
                    <h3 className="text-sm font-medium text-slate-300">Total students over time</h3>
                  </div>
                  <div className="p-4">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="label" tick={{ fill: '#e2e8f0', fontSize: 13 }} />
                        <YAxis tick={{ fill: '#e2e8f0', fontSize: 13 }} allowDecimals={false} />
                        <Tooltip
                          cursor={false}
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                          labelStyle={{ color: '#e2e8f0' }}
                          formatter={(value) => [`${value}`, 'Students']}
                        />
                        <Bar dataKey="total" fill="#8b5cf6" radius={[2, 2, 0, 0]} activeBar={false} name="Total students" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}

            {/* Student lists per coach */}
            {studentsData.map(coach => (
              <div key={coach.coach_user_id} className="rounded-lg border border-slate-700 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50">
                  {coach.coach_picture ? (
                    <img src={coach.coach_picture} alt="" className="w-5 h-5 rounded-full" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-xs text-slate-300">
                      {(coach.coach_name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <h4 className="text-sm font-medium text-slate-300">{coach.coach_name}</h4>
                  <span className="text-xs text-slate-500">({coach.students.length} students)</span>
                </div>
                <div className="divide-y divide-slate-700/50">
                  {coach.students.map((s, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <span className="text-slate-200">{s.name}</span>
                      <span className="text-xs text-slate-500">{formatDate(s.created_at, language)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Gemini API Usage */}
        {filteredApiUsage && (
          <div className="bg-slate-700/30 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-slate-300">Gemini API Usage</h3>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1">
                  <span className="text-green-400 font-medium">{formatCost(filteredApiUsage.total_cost_usd)}</span>
                  <span className="text-slate-500">total</span>
                </div>
                <a href="https://aistudio.google.com/spend" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Google Billing</a>
              </div>
            </div>

            {/* Per-feature summary */}
            {filteredApiUsage.by_feature.length > 0 && (
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
                    {filteredApiUsage.by_feature.map(f => {
                      const featureInvocations = filteredApiUsage.invocations.filter(i => i.feature === f.feature);
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

            {/* Cumulative invocations chart */}
            {invocationChartData.length > 0 && (
              <div>
                <h4 className="text-xs text-slate-500 mb-2">Images processed</h4>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={invocationChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="label" tick={{ fill: '#e2e8f0', fontSize: 13 }} />
                    <YAxis tick={{ fill: '#e2e8f0', fontSize: 13 }} allowDecimals={false} />
                    <Tooltip
                      cursor={false}
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                      labelStyle={{ color: '#e2e8f0' }}
                      formatter={(value) => [`${value}`, 'Images']}
                    />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[2, 2, 0, 0]} activeBar={false} name="Day" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Cost per model */}
            {filteredApiUsage.by_model.length > 0 && (
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
                    {filteredApiUsage.by_model.map(m => (
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
            {filteredApiUsage.invocations.length > 0 && (
              <div>
                <h4 className="text-xs text-slate-500 mb-2">History ({filteredApiUsage.invocations.length} invocations)</h4>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-600/50">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0">
                      <tr className="bg-slate-700/80 text-slate-400 uppercase tracking-wider">
                        <th className="px-2 py-1.5 text-left">Time</th>
                        <th className="px-2 py-1.5 text-left">User</th>
                        <th className="px-2 py-1.5 text-left">Feature</th>
                        <th className="px-2 py-1.5 text-center">Models</th>
                        <th className="px-2 py-1.5 text-center">Tokens</th>
                        <th className="px-2 py-1.5 text-center">Time</th>
                        <th className="px-2 py-1.5 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {filteredApiUsage.invocations.map(inv => {
                        const expanded = expandedInvocation === inv.request_id;
                        const matchedUpload = invUploadMap?.get(inv.request_id);
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
                              <td className="px-2 py-1 text-slate-400">
                                <div className="flex items-center gap-1">
                                  {inv.user_picture ? (
                                    <img src={inv.user_picture} alt="" className="w-4 h-4 rounded-full" />
                                  ) : (
                                    <div className="w-4 h-4 rounded-full bg-slate-600 flex items-center justify-center text-[8px] text-slate-300">
                                      {(inv.user_name || '?').charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <span className="truncate max-w-[80px]">{inv.user_name?.split(' ')[0] || '—'}</span>
                                </div>
                              </td>
                              <td className="px-2 py-1 text-slate-300">
                                <div className="flex items-center gap-1.5">
                                  <span>{FEATURE_LABELS[inv.feature] || inv.feature}</span>
                                  {inv.free_count > 0 && <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1 rounded">{inv.free_count} free</span>}
                                  {matchedUpload && (
                                    <span
                                      className="text-[10px] text-blue-400 hover:text-blue-300 cursor-zoom-in"
                                      onClick={(e) => { e.stopPropagation(); setZoomedImageSrc(`/api/admin/user-uploads/${inv.user_id}/${matchedUpload.filename}`); }}
                                    >
                                      {matchedUpload.filename}
                                    </span>
                                  )}
                                </div>
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
                                <td colSpan={7} className="px-2 py-2 bg-slate-800/50">
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

            {/* All uploads by user */}
            {allUploadsData && [...allUploadsData.entries()].map(([uid, uploads]) => {
              if (uploads.length === 0) return null;
              const userName = data?.users.find(u => u.id === uid)?.name || `User ${uid}`;
              return (
                <div key={uid}>
                  <h4 className="text-xs text-slate-500 mb-2">{userName} ({uploads.length})</h4>
                  <div className="flex gap-2 flex-wrap">
                    {uploads.map(file => {
                      const imgUrl = `/api/admin/user-uploads/${uid}/${file.filename}`;
                      return (
                        <div key={file.filename} className="flex flex-col items-center gap-1 rounded border border-slate-600 hover:border-blue-500 overflow-hidden transition-colors p-1 group relative">
                          <img
                            src={imgUrl}
                            alt={file.filename}
                            className="w-16 h-16 object-cover flex-shrink-0 rounded cursor-zoom-in"
                            onClick={() => setZoomedImageSrc(imgUrl)}
                          />
                          <span className="text-[10px] text-slate-400">{file.filename}</span>
                          <a
                            href={`/scoresheets?image=${encodeURIComponent(imgUrl)}`}
                            className="text-[9px] text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            Process
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {filteredApiUsage.by_model.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-4">No API calls recorded yet</p>
            )}
          </div>
        )}

        {/* Debug Tools */}
        <div className="rounded-lg border border-slate-700 p-4">
          <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-3">Debug Tools</h3>
          <ResetFirstTimeUser />
        </div>

      </div>
      {zoomedImageSrc && (
        <ImageZoomModal
          src={zoomedImageSrc}
          alt="Scoresheet upload"
          onClose={() => setZoomedImageSrc(null)}
        />
      )}
    </PanelShell>
  );
}

function CodelinesBadge() {
  const { data } = useQuery({
    queryKey: ['admin-codelines'],
    queryFn: async () => {
      const res = await axios.get('/api/admin/codelines');
      return res.data.lines as number;
    },
  });
  if (!data) return null;
  return (
    <div className="rounded-lg border border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300">Codebase</h3>
      </div>
      <div className="px-4 py-3 flex items-baseline gap-2">
        <span className="font-mono text-2xl font-bold text-slate-100">{data.toLocaleString()}</span>
        <span className="text-sm text-slate-400">lines of code</span>
        <span className="text-xs text-slate-500 ml-auto">py + ts + tsx + css + html</span>
      </div>
    </div>
  );
}

function ResetFirstTimeUser() {
  const { logout } = useAuth();
  return (
    <label className="flex items-center justify-between">
      <div>
        <span className="text-sm text-slate-200">Reset to first-time user</span>
        <p className="text-xs text-slate-500">Resets scoresheet + role, then logs out</p>
      </div>
      <button
        onClick={async () => {
          saveCoachesPrefs({ scoresheet_success: false });
          await fetch('/api/auth/reset-role', { method: 'POST', credentials: 'include' });
          await logout();
        }}
        className="px-3 py-1 text-xs rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-300 transition-colors"
      >
        Reset & log out
      </button>
    </label>
  );
}
