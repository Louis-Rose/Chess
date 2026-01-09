// Admin panel - view registered users (admin only)

import { useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Shield, Users, Loader2, AlertCircle, ChevronUp, ChevronDown, Clock, Search, RefreshCw, ChevronRight, Sun, Moon, Settings, Globe } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getCompanyLogoUrl } from '../utils/companyLogos';

interface AdminUser {
  id: number;
  email: string;
  name: string;
  picture: string;
  is_admin: number;
  created_at: string;
  updated_at: string;
  total_minutes: number;
  last_active: string | null;
  has_portfolio: boolean;
  graph_downloads: number;
}

interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
}

type SortColumn = 'id' | 'name' | 'created_at' | 'last_active' | 'total_minutes' | 'has_portfolio' | 'graph_downloads';
type SortDirection = 'asc' | 'desc';

const fetchUsers = async (): Promise<AdminUsersResponse> => {
  const response = await axios.get('/api/admin/users');
  return response.data;
};

interface TimeSpentData {
  activity_date: string;
  total_minutes: number;
}

interface StockViewStats {
  by_stock: {
    stock_ticker: string;
    unique_users: number;
    total_views: number;
    total_time_seconds: number;
  }[];
  by_user: {
    id: number;
    name: string;
    stocks_viewed: number;
    total_views: number;
    total_time_seconds: number;
  }[];
}

const fetchTimeSpent = async (): Promise<TimeSpentData[]> => {
  const response = await axios.get('/api/admin/time-spent');
  return response.data.daily_stats;
};

const fetchStockViews = async (): Promise<StockViewStats> => {
  const response = await axios.get('/api/admin/stock-views');
  return response.data;
};

interface ThemeStats {
  total: number;
  by_resolved: Record<string, number>;
  by_setting: Record<string, number>;
}

interface LanguageStats {
  total: number;
  by_language: Record<string, number>;
}

const fetchThemeStats = async (): Promise<ThemeStats> => {
  const response = await axios.get('/api/admin/theme-stats');
  return response.data;
};

const fetchLanguageStats = async (): Promise<LanguageStats> => {
  const response = await axios.get('/api/admin/language-stats');
  return response.data;
};

export function AdminPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-time-spent'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-stock-views'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-theme-stats'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-language-stats'] });
    setIsRefreshing(false);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchUsers,
    enabled: !!user?.is_admin,
  });

  const { data: timeSpentData } = useQuery({
    queryKey: ['admin-time-spent'],
    queryFn: fetchTimeSpent,
    enabled: !!user?.is_admin,
  });

  const { data: stockViewsData } = useQuery({
    queryKey: ['admin-stock-views'],
    queryFn: fetchStockViews,
    enabled: !!user?.is_admin,
  });

  const { data: themeStats } = useQuery({
    queryKey: ['admin-theme-stats'],
    queryFn: fetchThemeStats,
    enabled: !!user?.is_admin,
  });

  const { data: languageStats } = useQuery({
    queryKey: ['admin-language-stats'],
    queryFn: fetchLanguageStats,
    enabled: !!user?.is_admin,
  });

  // Sort state (default: most time spent first)
  const [sortColumn, setSortColumn] = useState<SortColumn>('total_minutes');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Collapsible panel states
  const [isTimeSpentExpanded, setIsTimeSpentExpanded] = useState(true);
  const [isUsersExpanded, setIsUsersExpanded] = useState(true);
  const [isStockSearchesExpanded, setIsStockSearchesExpanded] = useState(true);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(true);

  // Time unit for charts
  type TimeUnit = 'days' | 'weeks' | 'months';
  const [timeSpentUnit, setTimeSpentUnit] = useState<TimeUnit>('days');
  const [usersUnit, setUsersUnit] = useState<TimeUnit>('days');

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

  // Handle column header click
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sorted users
  const sortedUsers = useMemo(() => {
    if (!data?.users) return [];

    return [...data.users].sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'id':
          comparison = a.id - b.id;
          break;
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'last_active':
          const aTime = a.last_active ? new Date(a.last_active).getTime() : 0;
          const bTime = b.last_active ? new Date(b.last_active).getTime() : 0;
          comparison = aTime - bTime;
          break;
        case 'total_minutes':
          comparison = a.total_minutes - b.total_minutes;
          break;
        case 'has_portfolio':
          comparison = (a.has_portfolio ? 1 : 0) - (b.has_portfolio ? 1 : 0);
          break;
        case 'graph_downloads':
          comparison = a.graph_downloads - b.graph_downloads;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data?.users, sortColumn, sortDirection]);

  // Compute cumulative users data (supports days/weeks/months)
  const chartData = useMemo(() => {
    if (!data?.users || data.users.length === 0) return [];

    // Group users by date
    const usersByDate: Record<string, number> = {};
    data.users.forEach((u) => {
      const date = u.created_at.split('T')[0].split(' ')[0];
      usersByDate[date] = (usersByDate[date] || 0) + 1;
    });

    // Get date range
    const sortedRegistrationDates = Object.keys(usersByDate).sort();
    const firstRegistration = new Date(sortedRegistrationDates[0]);
    const startDate = new Date(firstRegistration);
    startDate.setDate(startDate.getDate() - 1);
    const endDate = new Date();

    // Generate all dates
    const allDates: string[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      allDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Compute cumulative for all dates
    let cumulative = 0;
    const dailyData = allDates.map((date) => {
      const newUsers = usersByDate[date] || 0;
      cumulative += newUsers;
      return { date, users: cumulative, newUsers };
    });

    if (usersUnit === 'days') return dailyData;

    // Aggregate by week or month (take average of cumulative users in period)
    const grouped: Record<string, { sum: number; count: number }> = {};
    dailyData.forEach(({ date, users }) => {
      const key = usersUnit === 'weeks' ? getWeekKey(date) : getMonthKey(date);
      if (!grouped[key]) grouped[key] = { sum: 0, count: 0 };
      grouped[key].sum += users;
      grouped[key].count += 1;
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { sum, count }]) => ({
        date: key,
        users: Math.round(sum / count), // Average
        newUsers: 0,
      }));
  }, [data?.users, usersUnit, getWeekKey, getMonthKey]);

  // Calculate Y-axis max (first multiple of 50 strictly greater than current users)
  const yAxisMax = useMemo(() => {
    const totalUsers = chartData.length > 0 ? chartData[chartData.length - 1].users : 0;
    return Math.floor(totalUsers / 50) * 50 + 50;
  }, [chartData]);

  // Calculate Y-axis ticks (6 values: 0 + 5 equally spaced)
  const yAxisTicks = useMemo(() => {
    const step = yAxisMax / 5;
    return [0, step, step * 2, step * 3, step * 4, yAxisMax];
  }, [yAxisMax]);

  // Calculate geometric growth rates for Users chart
  const usersGrowthRates = useMemo(() => {
    if (chartData.length < 2) return null;

    const periods = [1, 2, 3, 5];
    const rates: { period: number; rate: number | null }[] = [];

    const currentValue = chartData[chartData.length - 1].users;

    periods.forEach(n => {
      if (chartData.length > n) {
        const pastValue = chartData[chartData.length - 1 - n].users;
        if (pastValue > 0) {
          // Geometric growth rate: (current/past)^(1/n) - 1
          const rate = (Math.pow(currentValue / pastValue, 1 / n) - 1) * 100;
          rates.push({ period: n, rate });
        } else {
          rates.push({ period: n, rate: null });
        }
      } else {
        rates.push({ period: n, rate: null });
      }
    });

    return rates;
  }, [chartData]);

  // Compute time spent chart data (supports days/weeks/months with sum)
  const timeSpentChartData = useMemo(() => {
    if (!timeSpentData || timeSpentData.length === 0) return [];

    // Get date range
    const sortedDates = timeSpentData.map(d => d.activity_date).sort();
    const firstDate = new Date(sortedDates[0]);
    const endDate = new Date();

    // Create a map for quick lookup
    const minutesByDate: Record<string, number> = {};
    timeSpentData.forEach(d => {
      minutesByDate[d.activity_date] = d.total_minutes;
    });

    // Generate all dates
    const allDates: string[] = [];
    const currentDate = new Date(firstDate);
    while (currentDate <= endDate) {
      allDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const dailyData = allDates.map(date => ({
      date,
      minutes: minutesByDate[date] || 0,
    }));

    if (timeSpentUnit === 'days') return dailyData;

    // Aggregate by week or month (sum minutes)
    const grouped: Record<string, number> = {};
    dailyData.forEach(({ date, minutes }) => {
      const key = timeSpentUnit === 'weeks' ? getWeekKey(date) : getMonthKey(date);
      grouped[key] = (grouped[key] || 0) + minutes;
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, minutes]) => ({
        date: key,
        minutes,
      }));
  }, [timeSpentData, timeSpentUnit, getWeekKey, getMonthKey]);

  // Calculate Y-axis max for time spent chart
  const timeYAxisMax = useMemo(() => {
    const maxMinutes = Math.max(...timeSpentChartData.map(d => d.minutes), 0);
    return Math.ceil(maxMinutes / 30) * 30 + 30; // Round up to nearest 30
  }, [timeSpentChartData]);

  // Redirect non-admins
  if (!authLoading && (!user || !user.is_admin)) {
    return <Navigate to="/investing" replace />;
  }

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">{language === 'fr' ? 'Chargement...' : 'Loading...'}</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-amber-500" />
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            {language === 'fr' ? 'Admin' : 'Admin Panel'}
          </h2>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="p-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 disabled:opacity-50 transition-colors"
            title={language === 'fr' ? 'Actualiser' : 'Refresh'}
          >
            <RefreshCw className={`w-5 h-5 text-slate-600 dark:text-slate-300 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-lg italic">
          {language === 'fr' ? 'Gestion des utilisateurs' : 'User management'}
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* 1. Time Spent Chart */}
        {!isLoading && !error && timeSpentChartData.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={(e) => {
                  setIsTimeSpentExpanded(!isTimeSpentExpanded);
                  setTimeout(() => e.currentTarget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10);
                }}
                className="flex items-center gap-3"
              >
                <ChevronRight className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform ${isTimeSpentExpanded ? 'rotate-90' : ''}`} />
                <Clock className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {language === 'fr' ? 'Temps passé' : 'Time Spent'}
                </h3>
              </button>
              {isTimeSpentExpanded && (
                <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-600 rounded-lg p-1">
                  {(['days', 'weeks', 'months'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => setTimeSpentUnit(unit)}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                        timeSpentUnit === unit
                          ? 'bg-green-600 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'
                      }`}
                    >
                      {unit === 'days' ? (language === 'fr' ? 'J' : 'D') : unit === 'weeks' ? (language === 'fr' ? 'S' : 'W') : 'M'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isTimeSpentExpanded && <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeSpentChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: '#e2e8f0' }}
                    tickFormatter={(date) => {
                      if (timeSpentUnit === 'weeks') return date; // 2024-W01
                      if (timeSpentUnit === 'months') {
                        const [year, month] = date.split('-');
                        return new Date(Number(year), Number(month) - 1).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' });
                      }
                      const d = new Date(date);
                      return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#e2e8f0' }}
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
                    labelFormatter={(date) =>
                      new Date(String(date)).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    }
                    formatter={(value) => [`${value} min`, '']}
                  />
                  <Bar
                    dataKey="minutes"
                    fill="#22c55e"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>}
          </div>
        )}

        {/* 2. Users (Chart + Table combined) */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <button
              onClick={(e) => {
                setIsUsersExpanded(!isUsersExpanded);
                setTimeout(() => e.currentTarget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10);
              }}
              className="flex items-center gap-3"
            >
              <ChevronRight className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform ${isUsersExpanded ? 'rotate-90' : ''}`} />
              <Users className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {language === 'fr' ? 'Utilisateurs' : 'Users'}
                {data && (
                  <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">
                    ({data.total})
                  </span>
                )}
              </h3>
            </button>
            {isUsersExpanded && (
              <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-600 rounded-lg p-1">
                {(['days', 'weeks', 'months'] as const).map((unit) => (
                  <button
                    key={unit}
                    onClick={() => setUsersUnit(unit)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      usersUnit === unit
                        ? 'bg-green-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'
                    }`}
                  >
                    {unit === 'days' ? (language === 'fr' ? 'J' : 'D') : unit === 'weeks' ? (language === 'fr' ? 'S' : 'W') : 'M'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isUsersExpanded && (
            <>
              {/* User Growth Chart */}
              {chartData.length > 0 && (
                <div className="h-[200px] mb-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: '#e2e8f0' }}
                        tickFormatter={(date) => {
                          if (usersUnit === 'weeks') return date; // 2024-W01
                          if (usersUnit === 'months') {
                            const [year, month] = date.split('-');
                            return new Date(Number(year), Number(month) - 1).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' });
                          }
                          const d = new Date(date);
                          return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#e2e8f0' }}
                        allowDecimals={false}
                        domain={[0, yAxisMax]}
                        ticks={yAxisTicks}
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
                        labelFormatter={(date) =>
                          new Date(String(date)).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        }
                        formatter={(value) => [value, '']}
                      />
                      <Bar
                        dataKey="users"
                        fill="#f59e0b"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Growth Rates */}
              {usersGrowthRates && (
                <div className="flex items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-4">
                  <span className="font-medium">{language === 'fr' ? 'Croissance' : 'Growth'}:</span>
                  {usersGrowthRates.map(({ period, rate }) => (
                    <span key={period}>
                      {period}{usersUnit === 'days' ? 'd' : usersUnit === 'weeks' ? 'w' : 'm'}:{' '}
                      {rate !== null ? (
                        <span className={rate >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {rate >= 0 ? '+' : ''}{rate.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Users Table */}
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
                </div>
              ) : error ? (
                <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg text-red-700">
                  <AlertCircle className="w-5 h-5" />
                  <span>{language === 'fr' ? 'Erreur lors du chargement' : 'Error loading users'}</span>
                </div>
              ) : data?.users && data.users.length > 0 ? (
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700">
                  <tr className="text-left text-slate-600 dark:text-slate-300 border-b-2 border-slate-300 dark:border-slate-500">
                    <th className="pb-2 pl-2 w-8">
                      <button onClick={() => handleSort('id')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white">
                        #
                        {sortColumn === 'id' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-2">
                      <button onClick={() => handleSort('name')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white">
                        {language === 'fr' ? 'Utilisateur' : 'User'}
                        {sortColumn === 'name' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-2 whitespace-nowrap">
                      <button onClick={() => handleSort('created_at')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white">
                        <span className="hidden sm:inline">{language === 'fr' ? 'Inscrit' : 'Registered'}</span>
                        <span className="sm:hidden">{language === 'fr' ? 'Inscr.' : 'Reg.'}</span>
                        {sortColumn === 'created_at' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-2 text-center whitespace-nowrap">
                      <button onClick={() => handleSort('last_active')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                        <span className="hidden sm:inline">{language === 'fr' ? 'Actif' : 'Active'}</span>
                        <span className="sm:hidden">{language === 'fr' ? 'Act.' : 'Act.'}</span>
                        {sortColumn === 'last_active' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-2 text-center whitespace-nowrap">
                      <button onClick={() => handleSort('total_minutes')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                        <span className="hidden sm:inline">{language === 'fr' ? 'Temps' : 'Time'}</span>
                        <span className="sm:hidden"><Clock className="w-3 h-3" /></span>
                        {sortColumn === 'total_minutes' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-2 text-center whitespace-nowrap">
                      <button onClick={() => handleSort('has_portfolio')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                        <span className="hidden sm:inline">Portf.</span>
                        <span className="sm:hidden">P</span>
                        {sortColumn === 'has_portfolio' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-2 text-center whitespace-nowrap">
                      <button onClick={() => handleSort('graph_downloads')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                        <span className="hidden sm:inline">{language === 'fr' ? 'Téléch.' : 'DL'}</span>
                        <span className="sm:hidden">DL</span>
                        {sortColumn === 'graph_downloads' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer"
                      onClick={() => navigate(`/investing/admin/user/${u.id}`)}
                    >
                      <td className="py-2 pl-2 text-slate-500 dark:text-slate-300">{u.id}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          {u.picture ? (
                            <img
                              src={u.picture}
                              alt={u.name}
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white flex-shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-green-600 flex-shrink-0 flex items-center justify-center text-white font-bold text-xs">
                              {u.name?.charAt(0) || '?'}
                            </div>
                          )}
                          <div className="flex flex-col sm:flex-row sm:gap-1">
                            {u.name ? (
                              <>
                                <span className="font-medium text-slate-800 dark:text-slate-100">{u.name.split(' ')[0]}</span>
                                {u.name.split(' ').slice(1).length > 0 && (
                                  <span className="font-medium text-slate-800 dark:text-slate-100">{u.name.split(' ').slice(1).join(' ')}</span>
                                )}
                              </>
                            ) : (
                              <span className="font-medium text-slate-800 dark:text-slate-100">-</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 text-slate-500 dark:text-slate-300 whitespace-nowrap">
                        {new Date(u.created_at).toLocaleDateString(
                          language === 'fr' ? 'fr-FR' : 'en-US',
                          { day: 'numeric', month: 'short' }
                        )}
                      </td>
                      <td className="py-2 text-center text-slate-500 dark:text-slate-300">
                        {u.last_active ? (
                          (() => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const lastActive = new Date(u.last_active);
                            lastActive.setHours(0, 0, 0, 0);
                            const days = Math.round((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
                            if (days === 0) return language === 'fr' ? "Auj." : 'Today';
                            if (days === 1) return language === 'fr' ? 'Hier' : '1d';
                            return `${days}d`;
                          })()
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-2 text-center text-slate-500 dark:text-slate-300">
                        {u.total_minutes > 0 ? (
                          u.total_minutes >= 60
                            ? `${Math.floor(u.total_minutes / 60)}h${String(u.total_minutes % 60).padStart(2, '0')}`
                            : `${u.total_minutes}m`
                        ) : '-'}
                      </td>
                      <td className="py-2 text-center">
                        {u.has_portfolio ? (
                          <span className="text-green-600">✓</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-2 text-center text-slate-500 dark:text-slate-300">
                        {u.graph_downloads > 0 ? u.graph_downloads : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8">
                  {language === 'fr' ? 'Aucun utilisateur' : 'No users found'}
                </p>
              )}
            </>
          )}
        </div>

        {/* 3. Stock Searches */}
        {stockViewsData && stockViewsData.by_stock.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <button
              onClick={(e) => {
                setIsStockSearchesExpanded(!isStockSearchesExpanded);
                setTimeout(() => e.currentTarget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10);
              }}
              className="flex items-center gap-3 w-full text-left"
            >
              <ChevronRight className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform ${isStockSearchesExpanded ? 'rotate-90' : ''}`} />
              <Search className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {language === 'fr' ? 'Recherches de stocks' : 'Stock Searches'}
                <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">
                  ({stockViewsData.by_stock.length})
                </span>
              </h3>
            </button>
            {isStockSearchesExpanded && (
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto mt-4">
                <table className="w-full">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700">
                    <tr className="text-left text-slate-600 dark:text-slate-300 text-sm border-b-2 border-slate-300 dark:border-slate-500">
                      <th className="pb-3 pl-2">{language === 'fr' ? 'Action' : 'Stock'}</th>
                      <th className="pb-3 text-center">{language === 'fr' ? 'Utilisateurs' : 'Users'}</th>
                      <th className="pb-3 text-center">{language === 'fr' ? 'Vues' : 'Views'}</th>
                      <th className="pb-3 text-center">{language === 'fr' ? 'Temps total' : 'Total Time'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockViewsData.by_stock.map((stock) => (
                      <tr
                        key={stock.stock_ticker}
                        className="border-b border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer"
                        onClick={() => navigate(`/investing/admin/stock/${stock.stock_ticker}`)}
                      >
                        <td className="py-2 pl-2">
                          <div className="flex items-center gap-3">
                            <img
                              src={getCompanyLogoUrl(stock.stock_ticker) || ''}
                              alt={stock.stock_ticker}
                              className="w-6 h-6 rounded bg-white"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <span className="font-medium text-slate-800 dark:text-slate-100">{stock.stock_ticker}</span>
                          </div>
                        </td>
                        <td className="py-2 text-center text-slate-500 dark:text-slate-300">{stock.unique_users}</td>
                        <td className="py-2 text-center text-slate-500 dark:text-slate-300">{stock.total_views}</td>
                        <td className="py-2 text-center text-slate-500 dark:text-slate-300">
                          {stock.total_time_seconds >= 60
                            ? `${Math.floor(stock.total_time_seconds / 60)} min`
                            : `${stock.total_time_seconds}s`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 4. Settings (Theme + Language) */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <button
            onClick={(e) => {
              setIsSettingsExpanded(!isSettingsExpanded);
              setTimeout(() => e.currentTarget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10);
            }}
            className="flex items-center gap-3 w-full text-left"
          >
            <ChevronRight className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform ${isSettingsExpanded ? 'rotate-90' : ''}`} />
            <Settings className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {language === 'fr' ? 'Paramètres' : 'Settings'}
            </h3>
          </button>
          {isSettingsExpanded && (
            <div className="mt-4 space-y-4">
              {/* Theme Stats */}
              {themeStats && themeStats.total > 0 && (
                <div className="flex items-center gap-6 p-3 bg-slate-100 dark:bg-slate-600 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Moon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    <span className="text-sm text-slate-600 dark:text-slate-300">{language === 'fr' ? 'Sombre' : 'Dark'}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {themeStats.by_resolved.dark || 0}
                    </span>
                    <span className="text-sm text-slate-500">
                      ({Math.round(((themeStats.by_resolved.dark || 0) / themeStats.total) * 100)}%)
                    </span>
                  </div>
                  <div className="w-px h-5 bg-slate-300 dark:bg-slate-500"></div>
                  <div className="flex items-center gap-2">
                    <Sun className="w-5 h-5 text-amber-500" />
                    <span className="text-sm text-slate-600 dark:text-slate-300">{language === 'fr' ? 'Clair' : 'Light'}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {themeStats.by_resolved.light || 0}
                    </span>
                    <span className="text-sm text-slate-500">
                      ({Math.round(((themeStats.by_resolved.light || 0) / themeStats.total) * 100)}%)
                    </span>
                  </div>
                  {themeStats.by_setting.system && themeStats.by_setting.system > 0 && (
                    <>
                      <div className="w-px h-5 bg-slate-300 dark:bg-slate-500"></div>
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        ({themeStats.by_setting.system} auto)
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Language Stats */}
              {languageStats && languageStats.total > 0 && (
                <div className="flex items-center gap-6 p-3 bg-slate-100 dark:bg-slate-600 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-500" />
                    <span className="text-sm text-slate-600 dark:text-slate-300">English</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {languageStats.by_language.en || 0}
                    </span>
                    <span className="text-sm text-slate-500">
                      ({Math.round(((languageStats.by_language.en || 0) / languageStats.total) * 100)}%)
                    </span>
                  </div>
                  <div className="w-px h-5 bg-slate-300 dark:bg-slate-500"></div>
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-500" />
                    <span className="text-sm text-slate-600 dark:text-slate-300">Français</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {languageStats.by_language.fr || 0}
                    </span>
                    <span className="text-sm text-slate-500">
                      ({Math.round(((languageStats.by_language.fr || 0) / languageStats.total) * 100)}%)
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
