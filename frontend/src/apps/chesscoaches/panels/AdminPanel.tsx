// Admin panel for coaches app (admin only)

import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Shield, Loader2, RefreshCw, ChevronUp, ChevronDown, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../../contexts/AuthContext';
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AdminPanel() {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>('total_seconds');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-coach-users'],
    queryFn: async (): Promise<AdminUsersResponse> => {
      const response = await axios.get('/api/admin/coach-users');
      return response.data;
    },
    enabled: !!user?.is_admin,
  });

  const { data: timeSpentData } = useQuery({
    queryKey: ['admin-coach-time-spent'],
    queryFn: async (): Promise<TimeSpentDay[]> => {
      const response = await axios.get('/api/admin/coach-time-spent');
      return response.data.daily_stats;
    },
    enabled: !!user?.is_admin,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-coach-users'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-coach-time-spent'] }),
    ]);
    setIsRefreshing(false);
  };

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
        label: cur.toLocaleDateString('en-GB', { day: '2-digit', month: 'long' }),
        minutes: Math.round(seconds / 60),
      });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [timeSpentData]);

  if (!authLoading && (!user || !user.is_admin)) {
    return <Navigate to="/" replace />;
  }

  if (authLoading || isLoading) {
    return (
      <PanelShell title="Admin">
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
    <PanelShell title="Admin">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-500" />
            <span className="text-slate-400 text-sm">{data?.total ?? 0} user{(data?.total ?? 0) !== 1 ? 's' : ''}</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-slate-300 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Time Spent Chart */}
        {chartData.length > 0 && (
          <div className="bg-slate-700/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-medium text-slate-300">Daily Time Spent (minutes)</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: '#e2e8f0', fontSize: 13 }} />
                <YAxis tick={{ fill: '#e2e8f0', fontSize: 13 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }}
                  formatter={(value) => [`${value} min`, 'Time']}
                />
                <Bar dataKey="minutes" fill="#16a34a" radius={[2, 2, 0, 0]} activeBar={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Users Table */}
        {error ? (
          <p className="text-red-400 text-center py-8">Failed to load users</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-700/50 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-3 py-2 text-left cursor-pointer hover:text-slate-200" onClick={() => handleSort('name')}>
                    User <SortIcon column="name" />
                  </th>
                  <th className="px-3 py-2 text-left cursor-pointer hover:text-slate-200" onClick={() => handleSort('created_at')}>
                    Joined <SortIcon column="created_at" />
                  </th>
                  <th className="px-3 py-2 text-left cursor-pointer hover:text-slate-200" onClick={() => handleSort('last_active')}>
                    Last Active <SortIcon column="last_active" />
                  </th>
                  <th className="px-3 py-2 text-right cursor-pointer hover:text-slate-200" onClick={() => handleSort('session_count')}>
                    Sessions <SortIcon column="session_count" />
                  </th>
                  <th className="px-3 py-2 text-right cursor-pointer hover:text-slate-200" onClick={() => handleSort('total_seconds')}>
                    Time <SortIcon column="total_seconds" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {sortedUsers.map(u => (
                  <tr key={u.id} className="hover:bg-slate-700/30 transition-colors">
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
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{formatDate(u.created_at)}</td>
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{timeAgo(u.last_active)}</td>
                    <td className="px-3 py-2 text-slate-400 text-right">{u.session_count || 0}</td>
                    <td className="px-3 py-2 text-slate-400 text-right whitespace-nowrap">{formatDuration(u.total_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PanelShell>
  );
}
