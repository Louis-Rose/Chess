// Chess Admin Panel - chess user stats (admin only)

import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Shield, Users, Loader2, ChevronUp, ChevronDown, Clock, RefreshCw, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useChessData } from '../contexts/ChessDataContext';

interface ChessUser {
  chess_username: string;
  total_minutes: number;
  last_active: string | null;
  session_count: number;
  created_at: string | null;
}

interface TimeSpentData {
  activity_date: string;
  total_minutes: number;
}

interface TimeSpentUser {
  name: string;
  minutes: number;
}

type SortColumn = 'chess_username' | 'created_at' | 'last_active' | 'total_minutes' | 'session_count';
type SortDirection = 'asc' | 'desc';
type TimeUnit = 'days' | 'weeks' | 'months';

const getAdminHeaders = (username: string) =>
  username ? { 'X-Chess-Admin': username } : {};

const fetchChessUsers = async (username: string): Promise<ChessUser[]> => {
  const response = await axios.get('/api/admin/chess-users', { headers: getAdminHeaders(username) });
  return response.data.users;
};

const fetchTimeSpent = async (username: string): Promise<TimeSpentData[]> => {
  const response = await axios.get('/api/admin/chess-time-spent', { headers: getAdminHeaders(username) });
  return response.data.daily_stats;
};

interface PageBreakdown {
  breakdown: { page: string; total_minutes: number }[];
  total_minutes: number;
}

const fetchPageBreakdown = async (username: string): Promise<PageBreakdown> => {
  const response = await axios.get('/api/admin/chess-page-breakdown', { headers: getAdminHeaders(username) });
  return response.data;
};

export function ChessAdminPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();
  const { data: chessData, myPlayerData } = useChessData();
  const chessUsername = (chessData?.player?.username || myPlayerData?.player?.username || '').toLowerCase();
  const isAdmin = !!user?.is_admin || chessUsername === 'akyrosu';
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn>('total_minutes');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Collapsible sections
  const [isTimeSpentExpanded, setIsTimeSpentExpanded] = useState(true);
  const [isUsersExpanded, setIsUsersExpanded] = useState(true);
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(false);

  // Time unit for chart
  const [chartUnit, setChartUnit] = useState<TimeUnit>('days');

  // Time spent detail (users for selected period)
  const [selectedTimeSpentPeriod, setSelectedTimeSpentPeriod] = useState<string | null>(null);
  const [timeSpentUsers, setTimeSpentUsers] = useState<TimeSpentUser[]>([]);
  const [isLoadingTimeSpentUsers, setIsLoadingTimeSpentUsers] = useState(false);

  const { data: chessUsers, isLoading, refetch: refetchChessUsers } = useQuery({
    queryKey: ['admin-chess-users'],
    queryFn: () => fetchChessUsers(chessUsername),
    enabled: isAdmin,
  });

  const { data: timeSpentData, refetch: refetchTimeSpent } = useQuery({
    queryKey: ['admin-time-spent'],
    queryFn: () => fetchTimeSpent(chessUsername),
    enabled: isAdmin,
  });

  const { data: pageBreakdown } = useQuery({
    queryKey: ['admin-chess-page-breakdown'],
    queryFn: () => fetchPageBreakdown(chessUsername),
    enabled: isAdmin,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchChessUsers();
    await refetchTimeSpent();
    setIsRefreshing(false);
  };

  // Helper to get week key (ISO week)
  const getWeekKey = (dateStr: string) => {
    const date = new Date(dateStr);
    const jan1 = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date.getTime() - jan1.getTime()) / 86400000);
    const week = Math.ceil((days + jan1.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
  };

  // Helper to get month key
  const getMonthKey = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  // Handle time spent bar click
  const handleTimeSpentBarClick = async (data: { date: string }) => {
    const period = data.date;
    if (selectedTimeSpentPeriod === period) {
      setSelectedTimeSpentPeriod(null);
      setTimeSpentUsers([]);
      return;
    }
    setSelectedTimeSpentPeriod(period);
    setIsLoadingTimeSpentUsers(true);
    try {
      const response = await axios.get(`/api/admin/chess-time-spent/${period}`, { headers: getAdminHeaders(chessUsername) });
      setTimeSpentUsers(response.data.users);
    } catch (err) {
      console.error('Failed to fetch time spent details:', err);
      setTimeSpentUsers([]);
    } finally {
      setIsLoadingTimeSpentUsers(false);
    }
  };

  // Handle sort
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'chess_username' ? 'asc' : 'desc');
    }
  };

  // Sorted users
  const sortedUsers = useMemo(() => {
    if (!chessUsers) return [];
    return [...chessUsers].sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'chess_username':
          comparison = a.chess_username.localeCompare(b.chess_username);
          break;
        case 'created_at': {
          const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
          comparison = aCreated - bCreated;
          break;
        }
        case 'last_active': {
          const aTime = a.last_active ? new Date(a.last_active).getTime() : 0;
          const bTime = b.last_active ? new Date(b.last_active).getTime() : 0;
          comparison = aTime - bTime;
          break;
        }
        case 'total_minutes':
          comparison = a.total_minutes - b.total_minutes;
          break;
        case 'session_count':
          comparison = (a.session_count || 0) - (b.session_count || 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [chessUsers, sortColumn, sortDirection]);

  // Compute time spent chart data (from 2026 onwards)
  const timeSpentChartData = useMemo(() => {
    const CHART_START_DATE = '2026-02-14';
    const startDate = new Date(CHART_START_DATE);
    const endDate = new Date();

    const minutesByDate: Record<string, number> = {};
    if (timeSpentData) {
      timeSpentData.forEach(d => {
        minutesByDate[d.activity_date] = d.total_minutes;
      });
    }

    const allDates: string[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      allDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const dailyData = allDates.map(date => ({
      date,
      minutes: minutesByDate[date] || 0,
    }));

    if (chartUnit === 'days') return dailyData;

    const grouped: Record<string, number> = {};
    dailyData.forEach(({ date, minutes }) => {
      const key = chartUnit === 'weeks' ? getWeekKey(date) : getMonthKey(date);
      grouped[key] = (grouped[key] || 0) + minutes;
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, minutes]) => ({ date: key, minutes }));
  }, [timeSpentData, chartUnit]);

  // Y-axis max for time spent
  const timeYAxisMax = useMemo(() => {
    const maxMinutes = Math.max(...timeSpentChartData.map(d => d.minutes), 0);
    return Math.ceil(maxMinutes / 30) * 30 + 30;
  }, [timeSpentChartData]);

  // Format "days ago" for last_active
  const formatDaysAgo = (lastActive: string | null) => {
    if (!lastActive) return '—';
    const now = new Date();
    const last = new Date(lastActive);
    const diffMs = now.getTime() - last.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return language === 'fr' ? "Aujourd'hui" : 'Today';
    if (diffDays === 1) return language === 'fr' ? 'Hier' : 'Yesterday';
    return language === 'fr' ? `${diffDays}j` : `${diffDays}d`;
  };

  // Format minutes as Xm or XhYY
  const formatTime = (minutes: number) => {
    if (minutes === 0) return '—';
    if (minutes >= 60) return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
    return `${minutes}m`;
  };

  // Sort indicator
  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc'
      ? <ChevronUp className="w-3 h-3 inline ml-0.5" />
      : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  };

  // Redirect non-admins
  if (!authLoading && !isAdmin) {
    return <Navigate to="/chess" replace />;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-amber-500" />
          <h2 className="text-3xl font-bold text-slate-100">
            {language === 'fr' ? 'Admin Chess' : 'Chess Admin'}
          </h2>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="p-2 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 transition-colors"
            title={language === 'fr' ? 'Actualiser' : 'Refresh'}
          >
            <RefreshCw className={`w-5 h-5 text-slate-300 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-slate-400 text-lg italic">
          {language === 'fr' ? 'Utilisateurs Chess.com' : 'Chess.com users'}
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* 1. Time Spent Chart */}
        {timeSpentChartData.length > 0 && (
          <div className="bg-slate-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={(e) => {
                  setIsTimeSpentExpanded(!isTimeSpentExpanded);
                  setTimeout(() => e.currentTarget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10);
                }}
                className="flex items-center gap-3"
              >
                <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${isTimeSpentExpanded ? 'rotate-90' : ''}`} />
                <Clock className="w-5 h-5 text-slate-300" />
                <h3 className="text-xl font-bold text-slate-100">
                  {language === 'fr' ? 'Temps passé' : 'Time Spent'}
                </h3>
              </button>
              {isTimeSpentExpanded && (
                <div className="flex items-center gap-1 bg-slate-600 rounded-lg p-1">
                  {(['days', 'weeks', 'months'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => {
                        setChartUnit(unit);
                        setSelectedTimeSpentPeriod(null);
                        setTimeSpentUsers([]);
                      }}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                        chartUnit === unit
                          ? 'bg-green-600 text-white'
                          : 'text-slate-300 hover:bg-slate-500'
                      }`}
                    >
                      {unit === 'days' ? (language === 'fr' ? 'J' : 'D') : unit === 'weeks' ? (language === 'fr' ? 'S' : 'W') : 'M'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isTimeSpentExpanded && (
              <div className="h-[250px] select-none [&_svg]:outline-none [&_*]:outline-none [&_.recharts-surface]:focus:outline-none [&_.recharts-wrapper]:focus:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeSpentChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }} accessibilityLayer={false}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                      tickFormatter={(date) => {
                        if (chartUnit === 'weeks') {
                          const weekNum = date.split('-W')[1];
                          return `${language === 'fr' ? 'SEM' : 'WEEK'} ${parseInt(weekNum)}`;
                        }
                        if (chartUnit === 'months') {
                          const [year, month] = date.split('-');
                          return new Date(Number(year), Number(month) - 1).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' });
                        }
                        const d = new Date(date);
                        return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                      allowDecimals={false}
                      domain={[0, timeYAxisMax]}
                      tickFormatter={(value) => `${value} min`}
                    />
                    <Tooltip
                      cursor={false}
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        borderRadius: '8px',
                        border: '1px solid #334155',
                        padding: '8px 12px',
                      }}
                      labelStyle={{ color: '#f1f5f9', fontWeight: 'bold' }}
                      labelFormatter={(date) => {
                        const dateStr = String(date);
                        if (dateStr.includes('-W')) {
                          const [year, week] = dateStr.split('-W');
                          return `${language === 'fr' ? 'Semaine' : 'Week'} ${parseInt(week)}, ${year}`;
                        }
                        if (dateStr.match(/^\d{4}-\d{2}$/)) {
                          const [year, month] = dateStr.split('-');
                          return new Date(Number(year), Number(month) - 1).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });
                        }
                        return new Date(dateStr).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
                      }}
                      formatter={(value) => [`${value} min`]}
                    />
                    <Bar
                      dataKey="minutes"
                      fill="#22c55e"
                      radius={[4, 4, 0, 0]}
                      cursor="pointer"
                      activeBar={false}
                      onClick={(data) => handleTimeSpentBarClick(data as unknown as { date: string })}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {/* Users for selected period */}
            {isTimeSpentExpanded && selectedTimeSpentPeriod && (
              <div className="mt-4 p-3 bg-slate-600 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-slate-200">
                    {(() => {
                      if (selectedTimeSpentPeriod.includes('-W')) {
                        const [year, week] = selectedTimeSpentPeriod.split('-W');
                        return `${language === 'fr' ? 'Semaine' : 'Week'} ${parseInt(week)}, ${year}`;
                      }
                      if (selectedTimeSpentPeriod.match(/^\d{4}-\d{2}$/)) {
                        const [year, month] = selectedTimeSpentPeriod.split('-');
                        return new Date(Number(year), Number(month) - 1).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });
                      }
                      return new Date(selectedTimeSpentPeriod).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
                    })()}
                  </h4>
                  <button
                    onClick={() => {
                      setSelectedTimeSpentPeriod(null);
                      setTimeSpentUsers([]);
                    }}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    ✕
                  </button>
                </div>
                {isLoadingTimeSpentUsers ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
                  </div>
                ) : timeSpentUsers.length > 0 ? (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {(() => {
                      const totalMinutes = timeSpentUsers.reduce((sum, u) => sum + u.minutes, 0);
                      return timeSpentUsers.map((u) => {
                        const percentage = totalMinutes > 0 ? Math.round((u.minutes / totalMinutes) * 100) : 0;
                        return (
                          <div
                            key={u.name}
                            className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-500"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
                                {u.name?.charAt(0) || '?'}
                              </div>
                              <span className="text-sm text-slate-200">{u.name}</span>
                            </div>
                            <span className="text-sm font-medium text-slate-300">
                              {u.minutes >= 60
                                ? `${Math.floor(u.minutes / 60)}h${String(u.minutes % 60).padStart(2, '0')}`
                                : `${u.minutes}m`}
                              {' '}
                              <span className="text-slate-500">({percentage}%)</span>
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-2">
                    {language === 'fr' ? 'Aucune activité' : 'No activity'}
                  </p>
                )}
              </div>
            )}
            {/* Page Breakdown */}
            {isTimeSpentExpanded && (
              <div className="mt-4">
                <button
                  onClick={() => setIsBreakdownExpanded(!isBreakdownExpanded)}
                  className="w-full py-2 text-sm font-medium text-slate-400 hover:text-slate-200 flex items-center justify-center gap-2 transition-colors"
                >
                  <ChevronRight className={`w-4 h-4 transition-transform ${isBreakdownExpanded ? 'rotate-90' : ''}`} />
                  {language === 'fr' ? 'Voir la répartition' : 'See Breakdown'}
                </button>
                {isBreakdownExpanded && (
                  <div className="mt-3 p-3 bg-slate-600 rounded-lg">
                    <div className="space-y-2">
                      {(() => {
                        const pageLabels: Record<string, { en: string; fr: string }> = {
                          chess_home: { en: 'Home', fr: 'Accueil' },
                          chess_elo: { en: 'Elo', fr: 'Elo' },
                          chess_today: { en: 'Today', fr: "Aujourd'hui" },
                          chess_daily_volume: { en: 'Daily Volume', fr: 'Volume quotidien' },
                          chess_game_number: { en: 'Game Number', fr: 'Numéro de partie' },
                          chess_streak: { en: 'Streaks', fr: 'Séries' },
                          chess_admin: { en: 'Admin', fr: 'Admin' },
                          chess_other: { en: 'Other', fr: 'Autre' },
                        };
                        const breakdownMap = new Map(pageBreakdown?.breakdown.map(b => [b.page, b.total_minutes]) || []);
                        const total = pageBreakdown?.total_minutes || 0;

                        const allPages = [...breakdownMap.keys()].sort((a, b) => {
                          return (breakdownMap.get(b) || 0) - (breakdownMap.get(a) || 0);
                        });

                        return allPages.map((page) => {
                          const minutes = breakdownMap.get(page) || 0;
                          const percentage = total > 0 ? Math.round((minutes / total) * 100) : 0;
                          const label = pageLabels[page]?.[language === 'fr' ? 'fr' : 'en'] || page;
                          return (
                            <div key={page} className="flex items-center gap-3">
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm text-slate-200">{label}</span>
                                  <span className="text-sm font-medium text-slate-300">{percentage}%</span>
                                </div>
                                <div className="h-2 bg-slate-500 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-green-500 rounded-full transition-all"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. Chess Users Table */}
        <div className="bg-slate-700 rounded-xl p-6">
          <button
            onClick={(e) => {
              setIsUsersExpanded(!isUsersExpanded);
              setTimeout(() => e.currentTarget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10);
            }}
            className="flex items-center gap-3 mb-4"
          >
            <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${isUsersExpanded ? 'rotate-90' : ''}`} />
            <Users className="w-5 h-5 text-slate-300" />
            <h3 className="text-xl font-bold text-slate-100">
              {language === 'fr' ? 'Utilisateurs' : 'Users'}
              {chessUsers && (
                <span className="text-slate-400 font-normal ml-2">
                  ({chessUsers.length})
                </span>
              )}
            </h3>
          </button>

          {isUsersExpanded && (
            <>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
                </div>
              ) : sortedUsers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-600">
                        <th
                          className="text-left py-2 px-3 text-slate-400 font-medium cursor-pointer hover:text-slate-200 transition-colors"
                          onClick={() => handleSort('chess_username')}
                        >
                          {language === 'fr' ? 'Utilisateur' : 'User'}
                          <SortIcon column="chess_username" />
                        </th>
                        <th
                          className="text-left py-2 px-3 text-slate-400 font-medium cursor-pointer hover:text-slate-200 transition-colors"
                          onClick={() => handleSort('created_at')}
                        >
                          {language === 'fr' ? 'Inscrit' : 'Joined'}
                          <SortIcon column="created_at" />
                        </th>
                        <th
                          className="text-left py-2 px-3 text-slate-400 font-medium cursor-pointer hover:text-slate-200 transition-colors"
                          onClick={() => handleSort('last_active')}
                        >
                          {language === 'fr' ? 'Actif' : 'Active'}
                          <SortIcon column="last_active" />
                        </th>
                        <th
                          className="text-left py-2 px-3 text-slate-400 font-medium cursor-pointer hover:text-slate-200 transition-colors"
                          onClick={() => handleSort('total_minutes')}
                        >
                          {language === 'fr' ? 'Temps' : 'Time'}
                          <SortIcon column="total_minutes" />
                        </th>
                        <th
                          className="text-left py-2 px-3 text-slate-400 font-medium cursor-pointer hover:text-slate-200 transition-colors"
                          onClick={() => handleSort('session_count')}
                        >
                          Sessions
                          <SortIcon column="session_count" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedUsers.map((u) => (
                        <tr
                          key={u.chess_username}
                          className="border-b border-slate-600/50 hover:bg-slate-600/50 transition-colors"
                        >
                          <td className="py-2 px-3">
                            <a
                              href={`https://www.chess.com/member/${u.chess_username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300 hover:underline"
                            >
                              {u.chess_username}
                            </a>
                          </td>
                          <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString(
                              language === 'fr' ? 'fr-FR' : 'en-US',
                              { day: 'numeric', month: 'short', year: '2-digit' }
                            ) : '—'}
                          </td>
                          <td className="py-2 px-3 text-slate-300">
                            {formatDaysAgo(u.last_active)}
                          </td>
                          <td className="py-2 px-3 text-slate-300">
                            {formatTime(u.total_minutes)}
                          </td>
                          <td className="py-2 px-3 text-slate-300">
                            {u.session_count || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">
                  {language === 'fr' ? 'Aucun utilisateur chess' : 'No chess users'}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
