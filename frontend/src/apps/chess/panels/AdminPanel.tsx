// Chess admin panel — users & time spent (akyrosu only)

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Shield, Users, Loader2, AlertCircle, ChevronUp, ChevronDown, Clock, ChevronRight, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useChessData } from '../contexts/ChessDataContext';
import { getChessPrefs } from '../utils/constants';

// Auth header for chess-only admin (no Google OAuth required)
const adminHeaders = () => {
  const username = getChessPrefs().chess_username || '';
  return { 'X-Chess-Admin': username };
};

interface ChessUser {
  chess_username: string;
  total_seconds: number;
  last_active: string | null;
  session_count: number | null;
  created_at: string | null;
}

interface TimeSpentDay {
  activity_date: string;
  total_seconds: number;
}

interface TimeSpentUser {
  name: string;
  seconds: number;
}

const fetchChessUsers = async (): Promise<ChessUser[]> => {
  const response = await axios.get('/api/admin/chess-users', { headers: adminHeaders() });
  return response.data.users;
};

const fetchChessTimeSpent = async (): Promise<TimeSpentDay[]> => {
  const response = await axios.get('/api/admin/chess-time-spent', { headers: adminHeaders() });
  return response.data.daily_stats;
};

const fetchChessTimeSpentDetail = async (period: string): Promise<TimeSpentUser[]> => {
  const response = await axios.get(`/api/admin/chess-time-spent/${period}`, { headers: adminHeaders() });
  return response.data.users;
};

// Format seconds to human-readable string
const formatTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  if (m > 0) return sec > 0 ? `${m}m${String(sec).padStart(2, '0')}s` : `${m}m`;
  return `${sec}s`;
};

// Format relative date (e.g., "Today", "2d", "14d")
const formatRelativeDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1d';
  return `${diffDays}d`;
};

// Format short date (e.g., "Jan 5, 26")
const formatShortDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
};

type SortColumn = 'chess_username' | 'created_at' | 'total_seconds' | 'last_active' | 'session_count';
type SortDirection = 'asc' | 'desc';
type TimeUnit = 'days' | 'weeks' | 'months';

export function ChessAdminPanel() {
  const { data: playerData, myPlayerData } = useChessData();
  const displayData = playerData || myPlayerData;
  const isAdmin = displayData?.player?.username.toLowerCase() === 'akyrosu';

  const [sortColumn, setSortColumn] = useState<SortColumn>('total_seconds');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [chartUnit, setChartUnit] = useState<TimeUnit>('days');
  const [isTimeSpentExpanded, setIsTimeSpentExpanded] = useState(true);
  const [isUsersExpanded, setIsUsersExpanded] = useState(true);
  const [isUsersTableExpanded, setIsUsersTableExpanded] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [periodUsers, setPeriodUsers] = useState<TimeSpentUser[]>([]);
  const [isLoadingPeriodUsers, setIsLoadingPeriodUsers] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: users, isLoading, error, refetch: refetchUsers } = useQuery({
    queryKey: ['chess-admin-users'],
    queryFn: fetchChessUsers,
    enabled: isAdmin,
  });

  const { data: timeSpentData, refetch: refetchTimeSpent } = useQuery({
    queryKey: ['chess-admin-time-spent'],
    queryFn: fetchChessTimeSpent,
    enabled: isAdmin,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchUsers(), refetchTimeSpent()]);
    setIsRefreshing(false);
  };

  // Sort helpers
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'chess_username' ? 'asc' : 'desc');
    }
  };

  const sortedUsers = useMemo(() => {
    if (!users) return [];
    return [...users].sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'chess_username':
          cmp = a.chess_username.localeCompare(b.chess_username);
          break;
        case 'created_at':
          cmp = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
          break;
        case 'total_seconds':
          cmp = a.total_seconds - b.total_seconds;
          break;
        case 'last_active':
          cmp = new Date(a.last_active || 0).getTime() - new Date(b.last_active || 0).getTime();
          break;
        case 'session_count':
          cmp = (a.session_count || 0) - (b.session_count || 0);
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [users, sortColumn, sortDirection]);

  // Week/month helpers
  const getWeekKey = (dateStr: string) => {
    const date = new Date(dateStr);
    const jan1 = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date.getTime() - jan1.getTime()) / 86400000);
    const week = Math.ceil((days + jan1.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
  };

  const getMonthKey = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  // Time spent chart data
  const timeSpentChartData = useMemo(() => {
    const CHART_START_DATE = '2026-02-16';
    const startDate = new Date(CHART_START_DATE);
    const endDate = new Date();

    const secondsByDate: Record<string, number> = {};
    if (timeSpentData) {
      timeSpentData.forEach(d => {
        secondsByDate[d.activity_date] = d.total_seconds;
      });
    }

    const allDates: string[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      allDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const dailyData = allDates.map(date => ({ date, seconds: secondsByDate[date] || 0 }));

    if (chartUnit === 'days') return dailyData;

    const grouped: Record<string, number> = {};
    dailyData.forEach(({ date, seconds }) => {
      const key = chartUnit === 'weeks' ? getWeekKey(date) : getMonthKey(date);
      grouped[key] = (grouped[key] || 0) + seconds;
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, seconds]) => ({ date: key, seconds }));
  }, [timeSpentData, chartUnit]);

  // Y-axis max for time chart
  const timeYAxisMax = useMemo(() => {
    const maxSeconds = Math.max(...timeSpentChartData.map(d => d.seconds), 0);
    const maxMinutes = maxSeconds / 60;
    return (Math.ceil(maxMinutes / 30) * 30 + 30) * 60;
  }, [timeSpentChartData]);

  // Users chart data (cumulative user count over time)
  const usersChartData = useMemo(() => {
    if (!users || users.length === 0) return [];
    const CHART_START_DATE = '2026-02-16';

    // Group users by created_at date
    const usersByDate: Record<string, number> = {};
    users.forEach(u => {
      if (!u.created_at) return;
      const date = u.created_at.split('T')[0].split(' ')[0];
      usersByDate[date] = (usersByDate[date] || 0) + 1;
    });

    // Count users registered before chart start
    let usersBeforeStart = 0;
    Object.entries(usersByDate).forEach(([date, count]) => {
      if (date < CHART_START_DATE) usersBeforeStart += count;
    });

    const startDate = new Date(CHART_START_DATE);
    const endDate = new Date();
    const allDates: string[] = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      allDates.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }

    let cumulative = usersBeforeStart;
    const dailyData = allDates.map(date => {
      cumulative += usersByDate[date] || 0;
      return { date, users: cumulative };
    });

    if (chartUnit === 'days') return dailyData;

    const grouped: Record<string, { sum: number; count: number }> = {};
    dailyData.forEach(({ date, users: u }) => {
      const key = chartUnit === 'weeks' ? getWeekKey(date) : getMonthKey(date);
      if (!grouped[key]) grouped[key] = { sum: 0, count: 0 };
      grouped[key].sum += u;
      grouped[key].count += 1;
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { sum, count }]) => ({ date: key, users: Math.round(sum / count) }));
  }, [users, chartUnit]);

  // Y-axis max for users chart
  const usersYAxisMax = useMemo(() => {
    const total = usersChartData.length > 0 ? usersChartData[usersChartData.length - 1].users : 0;
    return Math.floor(total / 10) * 10 + 10;
  }, [usersChartData]);

  const usersYAxisTicks = useMemo(() => {
    const step = Math.max(1, Math.ceil(usersYAxisMax / 5));
    const ticks: number[] = [];
    for (let v = 0; v <= usersYAxisMax; v += step) ticks.push(v);
    return ticks;
  }, [usersYAxisMax]);

  // Bar click handler
  const handleBarClick = async (data: { date: string }) => {
    const period = data.date;
    if (selectedPeriod === period) {
      setSelectedPeriod(null);
      setPeriodUsers([]);
      return;
    }
    setSelectedPeriod(period);
    setIsLoadingPeriodUsers(true);
    try {
      const result = await fetchChessTimeSpentDetail(period);
      setPeriodUsers(result);
    } catch {
      setPeriodUsers([]);
    } finally {
      setIsLoadingPeriodUsers(false);
    }
  };

  // Tooltip label formatter
  const formatLabel = (date: string) => {
    const dateStr = String(date);
    if (dateStr.includes('-W')) {
      const [year, week] = dateStr.split('-W');
      return `Week ${parseInt(week)}, ${year}`;
    }
    if (dateStr.match(/^\d{4}-\d{2}$/)) {
      const [year, month] = dateStr.split('-');
      return new Date(Number(year), Number(month) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return new Date(dateStr).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // X-axis tick formatter
  const formatXTick = (date: string) => {
    if (chartUnit === 'weeks') {
      return `W${parseInt(date.split('-W')[1])}`;
    }
    if (chartUnit === 'months') {
      const [year, month] = date.split('-');
      return new Date(Number(year), Number(month) - 1).toLocaleDateString('en-US', { month: 'short' });
    }
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Shield className="w-10 h-10 text-red-500 mb-4" />
        <p className="text-slate-400">Access denied</p>
      </div>
    );
  }

  const SortIcon = ({ column }: { column: SortColumn }) =>
    sortColumn === column
      ? sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      : null;

  const TimeUnitToggle = () => (
    <div className="flex items-center gap-1 bg-slate-600 rounded-lg p-1">
      {(['days', 'weeks', 'months'] as const).map((unit) => (
        <button
          key={unit}
          onClick={() => { setChartUnit(unit); setSelectedPeriod(null); setPeriodUsers([]); }}
          className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
            chartUnit === unit ? 'bg-green-600 text-white' : 'text-slate-300 hover:bg-slate-500'
          }`}
        >
          {unit === 'days' ? 'D' : unit === 'weeks' ? 'W' : 'M'}
        </button>
      ))}
    </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-amber-500" />
          <h2 className="text-3xl font-bold text-slate-100">Admin Panel</h2>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="p-2 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 text-slate-300 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* 1. Time Spent Chart */}
        {timeSpentChartData.length > 0 && (
          <div className="bg-slate-700 rounded-xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setIsTimeSpentExpanded(!isTimeSpentExpanded)}
                className="flex items-center gap-3"
              >
                <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${isTimeSpentExpanded ? 'rotate-90' : ''}`} />
                <Clock className="w-5 h-5 text-slate-300" />
                <h3 className="text-xl font-bold text-slate-100">Time Spent</h3>
              </button>
              {isTimeSpentExpanded && <TimeUnitToggle />}
            </div>
            {isTimeSpentExpanded && (
              <>
                <div className="h-[250px] select-none [&_svg]:outline-none [&_*]:outline-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timeSpentChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} accessibilityLayer={false}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                      <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={formatXTick} />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#94a3b8' }}
                        allowDecimals={false}
                        domain={[0, timeYAxisMax]}
                        tickFormatter={(v) => `${Math.round(v / 60)} min`}
                      />
                      <Tooltip
                        cursor={false}
                        contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '8px 12px' }}
                        labelStyle={{ color: '#f1f5f9', fontWeight: 'bold' }}
                        labelFormatter={formatLabel}
                        formatter={(value) => {
                          const v = Number(value);
                          return [formatTime(v)];
                        }}
                      />
                      <Bar
                        dataKey="seconds"
                        fill="#22c55e"
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        activeBar={false}
                        onClick={(data) => handleBarClick(data as unknown as { date: string })}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Period detail */}
                {selectedPeriod && (
                  <div className="mt-4 p-3 bg-slate-600 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-slate-200">{formatLabel(selectedPeriod)}</h4>
                      <button onClick={() => { setSelectedPeriod(null); setPeriodUsers([]); }} className="text-slate-400 hover:text-slate-200 text-sm">
                        ✕
                      </button>
                    </div>
                    {isLoadingPeriodUsers ? (
                      <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-green-500 animate-spin" /></div>
                    ) : periodUsers.length > 0 ? (
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {(() => {
                          const total = periodUsers.reduce((s, u) => s + u.seconds, 0);
                          return periodUsers.map((u) => (
                            <div key={u.name} className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-500">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
                                  {u.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm text-slate-200">{u.name}</span>
                              </div>
                              <span className="text-sm font-medium text-slate-300">
                                {formatTime(u.seconds)}{' '}
                                <span className="text-slate-400">({total > 0 ? Math.round((u.seconds / total) * 100) : 0}%)</span>
                              </span>
                            </div>
                          ));
                        })()}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 text-center py-2">No activity</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 2. Users */}
        <div className="bg-slate-700 rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setIsUsersExpanded(!isUsersExpanded)}
              className="flex items-center gap-3"
            >
              <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${isUsersExpanded ? 'rotate-90' : ''}`} />
              <Users className="w-5 h-5 text-slate-300" />
              <h3 className="text-xl font-bold text-slate-100">
                Users
                {users && <span className="text-slate-400 font-normal ml-2">({users.length})</span>}
              </h3>
            </button>
            {isUsersExpanded && <TimeUnitToggle />}
          </div>

          {isUsersExpanded && (
            <>
              {/* Users growth chart */}
              {usersChartData.length > 0 && (
                <div className="h-[200px] mb-6 select-none [&_svg]:outline-none [&_*]:outline-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={usersChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} accessibilityLayer={false}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                      <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={formatXTick} />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#94a3b8' }}
                        allowDecimals={false}
                        domain={[0, usersYAxisMax]}
                        ticks={usersYAxisTicks}
                      />
                      <Tooltip
                        cursor={false}
                        contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '8px 12px' }}
                        labelStyle={{ color: '#f1f5f9', fontWeight: 'bold' }}
                        labelFormatter={formatLabel}
                        formatter={(value) => [value]}
                      />
                      <Bar dataKey="users" fill="#f59e0b" radius={[4, 4, 0, 0]} activeBar={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Table toggle */}
              <button
                onClick={() => setIsUsersTableExpanded(!isUsersTableExpanded)}
                className="w-full py-2 text-sm font-medium text-slate-400 hover:text-slate-200 flex items-center justify-center gap-2 transition-colors"
              >
                <ChevronRight className={`w-4 h-4 transition-transform ${isUsersTableExpanded ? 'rotate-90' : ''}`} />
                See Users
              </button>

              {/* Table */}
              {isUsersTableExpanded && (isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
                </div>
              ) : error ? (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 rounded-lg text-red-400">
                  <AlertCircle className="w-5 h-5" />
                  <span>Error loading users</span>
                </div>
              ) : sortedUsers.length > 0 ? (
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="sticky top-0 bg-slate-700">
                      <tr className="text-left text-slate-300 border-b-2 border-slate-500">
                        <th className="pb-2 pl-2">
                          <button onClick={() => handleSort('chess_username')} className="flex items-center gap-0.5 hover:text-white">
                            User <SortIcon column="chess_username" />
                          </button>
                        </th>
                        <th className="pb-2 whitespace-nowrap">
                          <button onClick={() => handleSort('created_at')} className="flex items-center gap-0.5 hover:text-white">
                            <span className="hidden sm:inline">Registered</span>
                            <span className="sm:hidden">Reg.</span>
                            <SortIcon column="created_at" />
                          </button>
                        </th>
                        <th className="pb-2 text-center whitespace-nowrap">
                          <button onClick={() => handleSort('total_seconds')} className="flex items-center gap-0.5 hover:text-white mx-auto">
                            <span className="hidden sm:inline">Time</span>
                            <span className="sm:hidden"><Clock className="w-3 h-3" /></span>
                            <SortIcon column="total_seconds" />
                          </button>
                        </th>
                        <th className="pb-2 text-center whitespace-nowrap">
                          <button onClick={() => handleSort('last_active')} className="flex items-center gap-0.5 hover:text-white mx-auto">
                            <span className="hidden sm:inline">Last Active</span>
                            <span className="sm:hidden">Act.</span>
                            <SortIcon column="last_active" />
                          </button>
                        </th>
                        <th className="pb-2 text-center whitespace-nowrap">
                          <button onClick={() => handleSort('session_count')} className="flex items-center gap-0.5 hover:text-white mx-auto">
                            <span className="hidden sm:inline">Sessions</span>
                            <span className="sm:hidden">S</span>
                            <SortIcon column="session_count" />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedUsers.map((user, idx) => (
                        <tr
                          key={user.chess_username}
                          className={`border-b border-slate-600 ${idx % 2 === 0 ? 'bg-slate-700' : 'bg-slate-750'} hover:bg-slate-600 transition-colors`}
                        >
                          <td className="py-2 pl-2">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {user.chess_username.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-slate-200 font-medium truncate max-w-[120px] sm:max-w-none">{user.chess_username}</span>
                            </div>
                          </td>
                          <td className="py-2 text-slate-400 whitespace-nowrap">{formatShortDate(user.created_at)}</td>
                          <td className="py-2 text-center text-slate-300 font-medium whitespace-nowrap">{user.total_seconds > 0 ? formatTime(user.total_seconds) : '-'}</td>
                          <td className="py-2 text-center text-slate-400 whitespace-nowrap">{formatRelativeDate(user.last_active)}</td>
                          <td className="py-2 text-center text-slate-400">{user.session_count || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">No users found</p>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
