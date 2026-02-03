// Admin panel - view registered users (admin only)

import { Fragment, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Shield, Users, Loader2, AlertCircle, ChevronUp, ChevronDown, Clock, Search, RefreshCw, ChevronRight, Sun, Moon, Settings, Globe, Smartphone, Monitor, Mail, Download, CheckSquare, Square, Building2, Video, CheckCircle, XCircle, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getCompanyLogoUrl } from '../utils/companyLogos';
import { findStockByTicker } from '../utils/allStocks';

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
  account_count: number;
  graph_downloads: number;
  sign_in_count: number;
  session_count: number;
  portfolio_companies: number;
  watchlist_companies: number;
}

interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
}

type SortColumn = 'id' | 'name' | 'created_at' | 'last_active' | 'total_minutes' | 'account_count' | 'graph_downloads' | 'session_count' | 'portfolio_companies' | 'watchlist_companies';
type SortDirection = 'asc' | 'desc';

const fetchUsers = async (): Promise<AdminUsersResponse> => {
  const response = await axios.get('/api/admin/users');
  return response.data;
};

interface TimeSpentData {
  activity_date: string;
  total_minutes: number;
}

interface TimeSpentUser {
  id: number;
  name: string;
  picture: string;
  minutes: number;
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

interface CompanyStats {
  companies: {
    ticker: string;
    portfolio_count: number;
    watchlist_count: number;
    total: number;
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

const fetchCompanyStats = async (): Promise<CompanyStats> => {
  const response = await axios.get('/api/admin/company-stats');
  return response.data;
};

interface SyncRun {
  id: number;
  started_at: string;
  ended_at: string | null;
  status: 'running' | 'completed' | 'failed' | 'interrupted' | 'stale';
  tickers_count: number;
  videos_total: number;
  videos_processed: number;
  transcripts_fetched: number;
  summaries_generated: number;
  errors: number;
  current_video: string | null;
  current_step: 'refreshing' | 'fetching' | 'downloading' | 'transcribing' | 'summarizing' | 'uploading' | null;
  videos_list: string | null;  // JSON array of {title, status}
  error_message: string | null;
  updated_at: string | null;
}

const fetchSyncStatus = async (): Promise<{ runs: SyncRun[] }> => {
  const response = await axios.get('/api/admin/sync-status');
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

interface DeviceStats {
  total: number;
  total_minutes: number;
  by_device: Record<string, number>;  // Now contains minutes per device type
}

const fetchThemeStats = async (): Promise<ThemeStats> => {
  const response = await axios.get('/api/admin/theme-stats');
  return response.data;
};

const fetchLanguageStats = async (): Promise<LanguageStats> => {
  const response = await axios.get('/api/admin/language-stats');
  return response.data;
};

const fetchDeviceStats = async (): Promise<DeviceStats> => {
  const response = await axios.get('/api/admin/device-stats');
  return response.data;
};

interface PageBreakdown {
  breakdown: { page: string; total_minutes: number }[];
  total_minutes: number;
}

const fetchPageBreakdown = async (): Promise<PageBreakdown> => {
  const response = await axios.get('/api/admin/page-breakdown');
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
    await queryClient.invalidateQueries({ queryKey: ['admin-company-stats'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-page-breakdown'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-theme-stats'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-language-stats'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-device-stats'] });
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

  const { data: companyStatsData } = useQuery({
    queryKey: ['admin-company-stats'],
    queryFn: fetchCompanyStats,
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

  const { data: deviceStats } = useQuery({
    queryKey: ['admin-device-stats'],
    queryFn: fetchDeviceStats,
    enabled: !!user?.is_admin,
  });

  const { data: pageBreakdown } = useQuery({
    queryKey: ['admin-page-breakdown'],
    queryFn: fetchPageBreakdown,
    enabled: !!user?.is_admin,
  });

  const { data: syncStatusData, refetch: refetchSyncStatus } = useQuery({
    queryKey: ['admin-sync-status'],
    queryFn: fetchSyncStatus,
    enabled: !!user?.is_admin,
    refetchInterval: 5000,  // Refresh every 5 seconds to show progress
  });

  // Sort state for Users table (default: most time spent first)
  const [sortColumn, setSortColumn] = useState<SortColumn>('total_minutes');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Email export - selected user IDs
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());

  // Sort state for Stock Searches table
  type StockSortColumn = 'stock_ticker' | 'unique_users' | 'total_views' | 'total_time_seconds';
  const [stockSortColumn, setStockSortColumn] = useState<StockSortColumn>('total_views');
  const [stockSortDirection, setStockSortDirection] = useState<SortDirection>('desc');

  // Collapsible panel states
  const [isTimeSpentExpanded, setIsTimeSpentExpanded] = useState(true);
  const [isUsersExpanded, setIsUsersExpanded] = useState(true);
  const [isUsersTableExpanded, setIsUsersTableExpanded] = useState(true);
  const [isCompaniesExpanded, setIsCompaniesExpanded] = useState(true);
  const [isStockSearchesExpanded, setIsStockSearchesExpanded] = useState(true);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(true);
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(true);

  // Sort state for Companies table
  type CompanySortColumn = 'ticker' | 'portfolio_count' | 'watchlist_count' | 'total';
  const [companySortColumn, setCompanySortColumn] = useState<CompanySortColumn>('total');
  const [companySortDirection, setCompanySortDirection] = useState<SortDirection>('desc');

  // Company users detail
  const [selectedCompanyTicker, setSelectedCompanyTicker] = useState<string | null>(null);
  const [companyUsers, setCompanyUsers] = useState<{
    portfolio_users: { id: number; name: string; picture: string }[];
    watchlist_users: { id: number; name: string; picture: string }[];
  } | null>(null);
  const [isLoadingCompanyUsers, setIsLoadingCompanyUsers] = useState(false);

  // Time unit for charts (shared between Time Spent and Users)
  type TimeUnit = 'days' | 'weeks' | 'months';
  const [chartUnit, setChartUnit] = useState<TimeUnit>('days');

  // Time spent details (users for selected period)
  const [selectedTimeSpentPeriod, setSelectedTimeSpentPeriod] = useState<string | null>(null);
  const [timeSpentUsers, setTimeSpentUsers] = useState<TimeSpentUser[]>([]);
  const [isLoadingTimeSpentUsers, setIsLoadingTimeSpentUsers] = useState(false);

  // Settings user lists - separate state for each section so list appears under clicked section
  type ThemeSelection = 'dark' | 'light' | null;
  type LanguageSelection = 'en' | 'fr' | null;
  type DeviceSelection = 'mobile' | 'desktop' | null;
  const [selectedTheme, setSelectedTheme] = useState<ThemeSelection>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageSelection>(null);
  const [selectedDevice, setSelectedDevice] = useState<DeviceSelection>(null);
  const [settingsUsers, setSettingsUsers] = useState<{ id: number; name: string; picture: string; minutes?: number }[]>([]);
  const [isLoadingSettingsUsers, setIsLoadingSettingsUsers] = useState(false);

  const handleSettingClick = async (type: 'theme' | 'language' | 'device', value: string) => {
    // Clear other selections when clicking a new type
    if (type === 'theme') {
      setSelectedLanguage(null);
      setSelectedDevice(null);
      if (selectedTheme === value) {
        setSelectedTheme(null);
        setSettingsUsers([]);
        return;
      }
      setSelectedTheme(value as ThemeSelection);
    } else if (type === 'language') {
      setSelectedTheme(null);
      setSelectedDevice(null);
      if (selectedLanguage === value) {
        setSelectedLanguage(null);
        setSettingsUsers([]);
        return;
      }
      setSelectedLanguage(value as LanguageSelection);
    } else {
      setSelectedTheme(null);
      setSelectedLanguage(null);
      if (selectedDevice === value) {
        setSelectedDevice(null);
        setSettingsUsers([]);
        return;
      }
      setSelectedDevice(value as DeviceSelection);
    }

    setIsLoadingSettingsUsers(true);
    try {
      const endpoint = type === 'theme' ? `/api/admin/users-by-theme/${value}` :
                       type === 'language' ? `/api/admin/users-by-language/${value}` :
                       `/api/admin/users-by-device/${value}`;
      const response = await axios.get(endpoint);
      setSettingsUsers(response.data.users);
    } catch (err) {
      console.error('Failed to fetch settings users:', err);
      setSettingsUsers([]);
    } finally {
      setIsLoadingSettingsUsers(false);
    }
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
      // Toggle off if clicking same bar
      setSelectedTimeSpentPeriod(null);
      setTimeSpentUsers([]);
      return;
    }
    setSelectedTimeSpentPeriod(period);
    setIsLoadingTimeSpentUsers(true);
    try {
      const response = await axios.get(`/api/admin/time-spent/${period}`);
      setTimeSpentUsers(response.data.users);
    } catch (err) {
      console.error('Failed to fetch time spent details:', err);
      setTimeSpentUsers([]);
    } finally {
      setIsLoadingTimeSpentUsers(false);
    }
  };

  // Handle column header click for Users table
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Handle column header click for Stock Searches table
  const handleStockSort = (column: StockSortColumn) => {
    if (stockSortColumn === column) {
      setStockSortDirection(stockSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setStockSortColumn(column);
      setStockSortDirection('desc');
    }
  };

  // Handle column header click for Companies table
  const handleCompanySort = (column: CompanySortColumn) => {
    if (companySortColumn === column) {
      setCompanySortDirection(companySortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setCompanySortColumn(column);
      // Ticker defaults to A-Z (asc), others default to highest first (desc)
      setCompanySortDirection(column === 'ticker' ? 'asc' : 'desc');
    }
  };

  // Handle company row click to show users
  const handleCompanyRowClick = async (ticker: string) => {
    if (selectedCompanyTicker === ticker) {
      // Toggle off if clicking same row
      setSelectedCompanyTicker(null);
      setCompanyUsers(null);
      return;
    }
    setSelectedCompanyTicker(ticker);
    setIsLoadingCompanyUsers(true);
    try {
      const response = await axios.get(`/api/admin/company-stats/${ticker}`);
      setCompanyUsers(response.data);
    } catch (err) {
      console.error('Failed to fetch company users:', err);
      setCompanyUsers(null);
    } finally {
      setIsLoadingCompanyUsers(false);
    }
  };

  // Email export helpers
  const toggleUserSelection = (userId: number, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent row click navigation
    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const selectAllUsers = () => {
    if (data?.users) {
      setSelectedUserIds(new Set(data.users.map(u => u.id)));
    }
  };

  const deselectAllUsers = () => {
    setSelectedUserIds(new Set());
  };

  const exportSelectedEmails = () => {
    if (!data?.users || selectedUserIds.size === 0) return;
    const selectedEmails = data.users
      .filter(u => selectedUserIds.has(u.id))
      .map(u => u.email)
      .join('\n');

    // Create and download a text file
    const blob = new Blob([selectedEmails], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emails_${selectedUserIds.size}_users.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copySelectedEmails = () => {
    if (!data?.users || selectedUserIds.size === 0) return;
    const selectedEmails = data.users
      .filter(u => selectedUserIds.has(u.id))
      .map(u => u.email)
      .join(', ');

    navigator.clipboard.writeText(selectedEmails);
  };

  // Sorted companies
  const sortedCompanies = useMemo(() => {
    if (!companyStatsData?.companies) return [];

    return [...companyStatsData.companies].sort((a, b) => {
      let comparison = 0;
      switch (companySortColumn) {
        case 'ticker':
          comparison = a.ticker.localeCompare(b.ticker);
          break;
        case 'portfolio_count':
          comparison = a.portfolio_count - b.portfolio_count;
          break;
        case 'watchlist_count':
          comparison = a.watchlist_count - b.watchlist_count;
          break;
        case 'total':
          comparison = a.total - b.total;
          break;
      }
      return companySortDirection === 'asc' ? comparison : -comparison;
    });
  }, [companyStatsData?.companies, companySortColumn, companySortDirection]);

  // Sorted stock views
  const sortedStockViews = useMemo(() => {
    if (!stockViewsData?.by_stock) return [];

    return [...stockViewsData.by_stock].sort((a, b) => {
      let comparison = 0;
      switch (stockSortColumn) {
        case 'stock_ticker':
          comparison = a.stock_ticker.localeCompare(b.stock_ticker);
          break;
        case 'unique_users':
          comparison = a.unique_users - b.unique_users;
          break;
        case 'total_views':
          comparison = a.total_views - b.total_views;
          break;
        case 'total_time_seconds':
          comparison = a.total_time_seconds - b.total_time_seconds;
          break;
      }
      return stockSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [stockViewsData?.by_stock, stockSortColumn, stockSortDirection]);

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
        case 'account_count':
          comparison = a.account_count - b.account_count;
          break;
        case 'graph_downloads':
          comparison = a.graph_downloads - b.graph_downloads;
          break;
        case 'session_count':
          comparison = (a.session_count || 0) - (b.session_count || 0);
          break;
        case 'portfolio_companies':
          comparison = (a.portfolio_companies || 0) - (b.portfolio_companies || 0);
          break;
        case 'watchlist_companies':
          comparison = (a.watchlist_companies || 0) - (b.watchlist_companies || 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data?.users, sortColumn, sortDirection]);

  // Compute cumulative users data (supports days/weeks/months)
  // Only shows data from 2026 onwards
  const chartData = useMemo(() => {
    if (!data?.users || data.users.length === 0) return [];

    const CHART_START_DATE = '2026-01-01';

    // Group users by date
    const usersByDate: Record<string, number> = {};
    data.users.forEach((u) => {
      const date = u.created_at.split('T')[0].split(' ')[0];
      usersByDate[date] = (usersByDate[date] || 0) + 1;
    });

    // Count users registered before 2026 (for initial cumulative value)
    let usersBeforeStart = 0;
    Object.entries(usersByDate).forEach(([date, count]) => {
      if (date < CHART_START_DATE) {
        usersBeforeStart += count;
      }
    });

    // Start from 2026-01-01
    const startDate = new Date(CHART_START_DATE);
    const endDate = new Date();

    // Generate all dates from 2026 onwards
    const allDates: string[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      allDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Compute cumulative for all dates (starting with users before 2026)
    let cumulative = usersBeforeStart;
    const dailyData = allDates.map((date) => {
      const newUsers = usersByDate[date] || 0;
      cumulative += newUsers;
      return { date, users: cumulative, newUsers };
    });

    if (chartUnit === 'days') return dailyData;

    // Aggregate by week or month (take average of cumulative users in period)
    const grouped: Record<string, { sum: number; count: number }> = {};
    dailyData.forEach(({ date, users }) => {
      const key = chartUnit === 'weeks' ? getWeekKey(date) : getMonthKey(date);
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
  }, [data?.users, chartUnit, getWeekKey, getMonthKey]);

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
  // Only shows data from 2026 onwards (same as users chart)
  const timeSpentChartData = useMemo(() => {
    const CHART_START_DATE = '2026-01-01';

    // Start from 2026-01-01
    const startDate = new Date(CHART_START_DATE);
    const endDate = new Date();

    // Create a map for quick lookup of time spent data
    const minutesByDate: Record<string, number> = {};
    if (timeSpentData) {
      timeSpentData.forEach(d => {
        minutesByDate[d.activity_date] = d.total_minutes;
      });
    }

    // Generate all dates from 2026 onwards
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

    // Aggregate by week or month (sum minutes)
    const grouped: Record<string, number> = {};
    dailyData.forEach(({ date, minutes }) => {
      const key = chartUnit === 'weeks' ? getWeekKey(date) : getMonthKey(date);
      grouped[key] = (grouped[key] || 0) + minutes;
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, minutes]) => ({
        date: key,
        minutes,
      }));
  }, [timeSpentData, chartUnit, getWeekKey, getMonthKey]);

  // Calculate Y-axis max for time spent chart
  const timeYAxisMax = useMemo(() => {
    const maxMinutes = Math.max(...timeSpentChartData.map(d => d.minutes), 0);
    return Math.ceil(maxMinutes / 30) * 30 + 30; // Round up to nearest 30
  }, [timeSpentChartData]);

  // Calculate geometric growth rates for Time Spent chart
  const timeSpentGrowthRates = useMemo(() => {
    if (timeSpentChartData.length < 2) return null;

    const periods = [1, 2, 3, 5];
    const rates: { period: number; rate: number | null }[] = [];

    const currentValue = timeSpentChartData[timeSpentChartData.length - 1].minutes;

    periods.forEach(n => {
      if (timeSpentChartData.length > n) {
        const pastValue = timeSpentChartData[timeSpentChartData.length - 1 - n].minutes;
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
                      onClick={() => {
                        setChartUnit(unit);
                        setSelectedTimeSpentPeriod(null);
                        setTimeSpentUsers([]);
                      }}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                        chartUnit === unit
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
            {isTimeSpentExpanded && <div className="h-[250px] select-none [&_svg]:outline-none [&_*]:outline-none [&_.recharts-surface]:focus:outline-none [&_.recharts-wrapper]:focus:outline-none">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeSpentChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }} accessibilityLayer={false}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: '#e2e8f0' }}
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
            </div>}
            {/* Growth Rates */}
            {isTimeSpentExpanded && timeSpentGrowthRates && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mt-4">
                {timeSpentGrowthRates.map(({ period, rate }) => (
                  <div key={period} className="px-2 sm:px-3 py-1 sm:py-1.5 bg-slate-200 dark:bg-slate-600 rounded-lg text-xs sm:text-sm">
                    <span className="text-slate-100 font-medium">
                      {period}{chartUnit === 'days' ? 'D' : chartUnit === 'weeks' ? 'W' : 'M'}
                    </span>
                    <span className="mx-1 text-slate-400">·</span>
                    {rate !== null ? (
                      <span className={`font-bold ${rate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {rate >= 0 ? '+' : ''}{rate.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Users for selected period */}
            {isTimeSpentExpanded && selectedTimeSpentPeriod && (
              <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-600 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">
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
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
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
                            key={u.id}
                            className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-200 dark:hover:bg-slate-500 cursor-pointer"
                            onClick={() => navigate(`/investing/admin/user/${u.id}`)}
                          >
                            <div className="flex items-center gap-2">
                              {u.picture ? (
                                <img src={u.picture} alt={u.name} className="w-6 h-6 rounded-full" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
                                  {u.name?.charAt(0) || '?'}
                                </div>
                              )}
                              <span className="text-sm text-slate-700 dark:text-slate-200">{u.name}</span>
                            </div>
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                              {u.minutes >= 60
                                ? `${Math.floor(u.minutes / 60)}h${String(u.minutes % 60).padStart(2, '0')}`
                                : `${u.minutes}m`}
                              {' '}
                              <span className="text-slate-400">({percentage}%)</span>
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
                  className="w-full py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center gap-2 transition-colors"
                >
                  <ChevronRight className={`w-4 h-4 transition-transform ${isBreakdownExpanded ? 'rotate-90' : ''}`} />
                  {language === 'fr' ? 'Voir la répartition' : 'See Breakdown'}
                </button>
                {isBreakdownExpanded && (
                  <div className="mt-3 p-3 bg-slate-100 dark:bg-slate-600 rounded-lg">
                    <div className="space-y-2">
                      {(() => {
                        const pageLabels: Record<string, { en: string; fr: string }> = {
                          portfolio: { en: 'Portfolio', fr: 'Portfolio' },
                          watchlist: { en: 'Watchlist', fr: 'Watchlist' },
                          earnings: { en: 'Earnings Calendar', fr: 'Calendrier des résultats' },
                          financials: { en: 'Financials', fr: 'Données financières' },
                          stock: { en: 'Company Pages', fr: 'Pages entreprises' },
                        };
                        const allPages = ['portfolio', 'watchlist', 'earnings', 'financials', 'stock'];
                        const breakdownMap = new Map(pageBreakdown?.breakdown.map(b => [b.page, b.total_minutes]) || []);
                        const total = pageBreakdown?.total_minutes || 0;

                        // Sort pages by minutes (highest to lowest)
                        const sortedPages = [...allPages].sort((a, b) => {
                          const minutesA = breakdownMap.get(a) || 0;
                          const minutesB = breakdownMap.get(b) || 0;
                          return minutesB - minutesA;
                        });

                        return sortedPages.map((page) => {
                          const minutes = breakdownMap.get(page) || 0;
                          const percentage = total > 0 ? Math.round((minutes / total) * 100) : 0;
                          const label = pageLabels[page]?.[language === 'fr' ? 'fr' : 'en'] || page;
                          return (
                            <div key={page} className="flex items-center gap-3">
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
                                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{percentage}%</span>
                                </div>
                                <div className="h-2 bg-slate-200 dark:bg-slate-500 rounded-full overflow-hidden">
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
                    onClick={() => setChartUnit(unit)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      chartUnit === unit
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
                <div className="h-[200px] mb-6 select-none [&_svg]:outline-none [&_*]:outline-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }} accessibilityLayer={false}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: '#e2e8f0' }}
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
                        formatter={(value) => [value]}
                      />
                      <Bar
                        dataKey="users"
                        fill="#f59e0b"
                        radius={[4, 4, 0, 0]}
                        activeBar={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Growth Rates */}
              {usersGrowthRates && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mb-4">
                  {usersGrowthRates.map(({ period, rate }) => (
                    <div key={period} className="px-2 sm:px-3 py-1 sm:py-1.5 bg-slate-200 dark:bg-slate-600 rounded-lg text-xs sm:text-sm">
                      <span className="text-slate-100 font-medium">
                        {period}{chartUnit === 'days' ? 'D' : chartUnit === 'weeks' ? 'W' : 'M'}
                      </span>
                      <span className="mx-1 text-slate-400">·</span>
                      {rate !== null ? (
                        <span className={`font-bold ${rate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {rate >= 0 ? '+' : ''}{rate.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Users Table Toggle */}
              <button
                onClick={() => setIsUsersTableExpanded(!isUsersTableExpanded)}
                className="w-full py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center gap-2 transition-colors"
              >
                <ChevronRight className={`w-4 h-4 transition-transform ${isUsersTableExpanded ? 'rotate-90' : ''}`} />
                {language === 'fr' ? 'Voir les utilisateurs' : 'See Users'}
              </button>

              {/* Email Export Controls */}
              {isUsersTableExpanded && data?.users && data.users.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 py-3 px-2 bg-slate-100 dark:bg-slate-600 rounded-lg mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={selectedUserIds.size === data.users.length ? deselectAllUsers : selectAllUsers}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500 rounded transition-colors"
                    >
                      {selectedUserIds.size === data.users.length ? (
                        <>
                          <CheckSquare className="w-4 h-4" />
                          {language === 'fr' ? 'Tout désélectionner' : 'Deselect All'}
                        </>
                      ) : (
                        <>
                          <Square className="w-4 h-4" />
                          {language === 'fr' ? 'Tout sélectionner' : 'Select All'}
                        </>
                      )}
                    </button>
                    {selectedUserIds.size > 0 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {selectedUserIds.size} {language === 'fr' ? 'sélectionné(s)' : 'selected'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copySelectedEmails}
                      disabled={selectedUserIds.size === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-200 dark:bg-slate-500 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Mail className="w-4 h-4" />
                      {language === 'fr' ? 'Copier' : 'Copy'}
                    </button>
                    <button
                      onClick={exportSelectedEmails}
                      disabled={selectedUserIds.size === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white hover:bg-green-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download className="w-4 h-4" />
                      {language === 'fr' ? 'Exporter emails' : 'Export Emails'}
                    </button>
                  </div>
                </div>
              )}

              {/* Users Table */}
              {isUsersTableExpanded && (isLoading ? (
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (data?.users) {
                            if (selectedUserIds.size === data.users.length) {
                              deselectAllUsers();
                            } else {
                              selectAllUsers();
                            }
                          }
                        }}
                        className="flex items-center justify-center hover:text-slate-900 dark:hover:text-white"
                      >
                        {data?.users && selectedUserIds.size === data.users.length ? (
                          <CheckSquare className="w-4 h-4 text-green-600" />
                        ) : selectedUserIds.size > 0 ? (
                          <div className="w-4 h-4 border-2 border-green-600 rounded flex items-center justify-center">
                            <div className="w-2 h-0.5 bg-green-600" />
                          </div>
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
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
                      <button onClick={() => handleSort('account_count')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                        <span className="hidden sm:inline">{language === 'fr' ? 'Comptes' : 'Accounts'}</span>
                        <span className="sm:hidden">A</span>
                        {sortColumn === 'account_count' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-2 text-center whitespace-nowrap">
                      <button onClick={() => handleSort('graph_downloads')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                        <span className="hidden sm:inline">{language === 'fr' ? 'Téléch.' : 'DL'}</span>
                        <span className="sm:hidden">DL</span>
                        {sortColumn === 'graph_downloads' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-2 text-center whitespace-nowrap">
                      <button onClick={() => handleSort('session_count')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                        <span className="hidden sm:inline">Sessions</span>
                        <span className="sm:hidden">S</span>
                        {sortColumn === 'session_count' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-2 text-center whitespace-nowrap">
                      <button onClick={() => handleSort('portfolio_companies')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                        <span className="hidden sm:inline">{language === 'fr' ? 'Portfolio' : 'Portfolio'}</span>
                        <span className="sm:hidden">P</span>
                        {sortColumn === 'portfolio_companies' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-2 text-center whitespace-nowrap">
                      <button onClick={() => handleSort('watchlist_companies')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                        <span className="hidden sm:inline">{language === 'fr' ? 'Watchlist' : 'Watchlist'}</span>
                        <span className="sm:hidden">W</span>
                        {sortColumn === 'watchlist_companies' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((u) => (
                    <tr
                      key={u.id}
                      className={`border-b border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer ${selectedUserIds.has(u.id) ? 'bg-green-50 dark:bg-green-900/20' : ''}`}
                      onClick={() => navigate(`/investing/admin/user/${u.id}`)}
                    >
                      <td className="py-2 pl-2">
                        <button
                          onClick={(e) => toggleUserSelection(u.id, e)}
                          className="flex items-center justify-center hover:text-green-600"
                        >
                          {selectedUserIds.has(u.id) ? (
                            <CheckSquare className="w-4 h-4 text-green-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </td>
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
                          { day: 'numeric', month: 'short', year: '2-digit' }
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
                      <td className="py-2 text-center text-slate-500 dark:text-slate-300">
                        {u.account_count > 0 ? u.account_count : '-'}
                      </td>
                      <td className="py-2 text-center text-slate-500 dark:text-slate-300">
                        {u.graph_downloads > 0 ? u.graph_downloads : '-'}
                      </td>
                      <td className="py-2 text-center text-slate-500 dark:text-slate-300">
                        {u.session_count > 0 ? u.session_count : '-'}
                      </td>
                      <td className="py-2 text-center text-slate-500 dark:text-slate-300">
                        {u.portfolio_companies > 0 ? u.portfolio_companies : '-'}
                      </td>
                      <td className="py-2 text-center text-slate-500 dark:text-slate-300">
                        {u.watchlist_companies > 0 ? u.watchlist_companies : '-'}
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
              ))}
            </>
          )}
        </div>

        {/* 3. Companies */}
        {companyStatsData && companyStatsData.companies.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <button
              onClick={(e) => {
                setIsCompaniesExpanded(!isCompaniesExpanded);
                setTimeout(() => e.currentTarget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10);
              }}
              className="flex items-center gap-3 w-full text-left"
            >
              <ChevronRight className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform ${isCompaniesExpanded ? 'rotate-90' : ''}`} />
              <Building2 className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {language === 'fr' ? 'Entreprises' : 'Companies'}
                <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">
                  ({companyStatsData.companies.length})
                </span>
              </h3>
            </button>
            {isCompaniesExpanded && (
              <div className="mt-4">
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700">
                      <tr className="text-left text-slate-600 dark:text-slate-300 text-sm border-b-2 border-slate-300 dark:border-slate-500">
                        <th className="pb-3 pl-2">
                          <button onClick={() => handleCompanySort('ticker')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white">
                            {language === 'fr' ? 'Entreprise' : 'Company'}
                            {companySortColumn === 'ticker' && (companySortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </button>
                        </th>
                        <th className="pb-3 text-center">
                          <button onClick={() => handleCompanySort('total')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                            Total
                            {companySortColumn === 'total' && (companySortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </button>
                        </th>
                        <th className="pb-3 text-center">
                          <button onClick={() => handleCompanySort('portfolio_count')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                            {language === 'fr' ? 'Portfolios' : 'Portfolios'}
                            {companySortColumn === 'portfolio_count' && (companySortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </button>
                        </th>
                        <th className="pb-3 text-center">
                          <button onClick={() => handleCompanySort('watchlist_count')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                            {language === 'fr' ? 'Watchlists' : 'Watchlists'}
                            {companySortColumn === 'watchlist_count' && (companySortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCompanies.map((company) => {
                        const stock = findStockByTicker(company.ticker);
                        const companyName = stock?.name || company.ticker;
                        const isSelected = selectedCompanyTicker === company.ticker;
                        return (
                        <Fragment key={company.ticker}>
                          <tr
                            className={`border-b border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer ${isSelected ? 'bg-slate-100 dark:bg-slate-600' : ''}`}
                            onClick={() => handleCompanyRowClick(company.ticker)}
                          >
                            <td className="py-2 pl-2">
                              <div className="flex items-center gap-3">
                                <img
                                  src={getCompanyLogoUrl(company.ticker) || ''}
                                  alt={company.ticker}
                                  className="w-6 h-6 rounded bg-white"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                                <span className="font-medium text-slate-800 dark:text-slate-100">{companyName} <span className="text-slate-400 font-normal">({company.ticker})</span></span>
                              </div>
                            </td>
                            <td className="py-2 text-center font-medium text-slate-700 dark:text-slate-200">{company.total}</td>
                            <td className="py-2 text-center text-slate-500 dark:text-slate-300">{company.portfolio_count}</td>
                            <td className="py-2 text-center text-slate-500 dark:text-slate-300">{company.watchlist_count}</td>
                          </tr>
                          {/* Expanded details row */}
                          {isSelected && (
                            <tr className="bg-slate-100 dark:bg-slate-600">
                              <td colSpan={4} className="p-3">
                                {isLoadingCompanyUsers ? (
                                  <div className="flex justify-center py-2">
                                    <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
                                  </div>
                                ) : companyUsers ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Portfolio users */}
                                    <div>
                                      <h5 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                                        {language === 'fr' ? 'Portfolios' : 'Portfolios'} ({companyUsers.portfolio_users.length})
                                      </h5>
                                      {companyUsers.portfolio_users.length > 0 ? (
                                        <div className="space-y-1 max-h-[150px] overflow-y-auto">
                                          {companyUsers.portfolio_users.map((u) => (
                                            <div
                                              key={u.id}
                                              className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-200 dark:hover:bg-slate-500 cursor-pointer"
                                              onClick={(e) => { e.stopPropagation(); navigate(`/investing/admin/user/${u.id}`); }}
                                            >
                                              {u.picture ? (
                                                <img src={u.picture} alt={u.name} className="w-5 h-5 rounded-full" />
                                              ) : (
                                                <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
                                                  {u.name?.charAt(0) || '?'}
                                                </div>
                                              )}
                                              <span className="text-xs text-slate-700 dark:text-slate-200">{u.name}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-slate-400 italic">
                                          {language === 'fr' ? 'Aucun' : 'None'}
                                        </p>
                                      )}
                                    </div>
                                    {/* Watchlist users */}
                                    <div>
                                      <h5 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                                        {language === 'fr' ? 'Watchlists' : 'Watchlists'} ({companyUsers.watchlist_users.length})
                                      </h5>
                                      {companyUsers.watchlist_users.length > 0 ? (
                                        <div className="space-y-1 max-h-[150px] overflow-y-auto">
                                          {companyUsers.watchlist_users.map((u) => (
                                            <div
                                              key={u.id}
                                              className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-200 dark:hover:bg-slate-500 cursor-pointer"
                                              onClick={(e) => { e.stopPropagation(); navigate(`/investing/admin/user/${u.id}`); }}
                                            >
                                              {u.picture ? (
                                                <img src={u.picture} alt={u.name} className="w-5 h-5 rounded-full" />
                                              ) : (
                                                <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
                                                  {u.name?.charAt(0) || '?'}
                                                </div>
                                              )}
                                              <span className="text-xs text-slate-700 dark:text-slate-200">{u.name}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-slate-400 italic">
                                          {language === 'fr' ? 'Aucun' : 'None'}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );})}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. Video Sync Status */}
        {syncStatusData && (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <div className="flex items-center gap-3 mb-4">
              <Video className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {language === 'fr' ? 'Sync Vidéos' : 'Video Sync'}
              </h3>
              <button
                onClick={() => refetchSyncStatus()}
                className="ml-auto p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {syncStatusData.runs.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {language === 'fr' ? 'Aucune synchronisation en cours ou récente.' : 'No ongoing or recent sync runs.'}
                </p>
              ) : syncStatusData.runs.map((run) => (
                <div
                  key={run.id}
                  className={`p-3 rounded-lg border ${
                    run.status === 'running'
                      ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/30'
                      : run.status === 'completed'
                      ? 'border-green-300 bg-green-50 dark:border-green-600 dark:bg-green-900/30'
                      : run.status === 'interrupted'
                      ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-900/30'
                      : run.status === 'stale'
                      ? 'border-orange-300 bg-orange-50 dark:border-orange-600 dark:bg-orange-900/30'
                      : 'border-red-300 bg-red-50 dark:border-red-600 dark:bg-red-900/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {run.status === 'running' ? (
                      <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    ) : run.status === 'completed' ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : run.status === 'interrupted' ? (
                      <AlertCircle className="w-4 h-4 text-yellow-500" />
                    ) : run.status === 'stale' ? (
                      <AlertCircle className="w-4 h-4 text-orange-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {run.status === 'running' ? 'Running' : run.status === 'completed' ? 'Completed' : run.status === 'interrupted' ? 'Interrupted' : run.status === 'stale' ? 'Stale' : 'Failed'}
                    </span>
                    {run.status === 'running' && run.current_step && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200">
                        {run.current_step === 'refreshing' && 'Step 2: Refreshing videos'}
                        {run.current_step === 'fetching' && 'Step 3: Fetching pending'}
                        {run.current_step === 'downloading' && 'Step 4: Downloading'}
                        {run.current_step === 'transcribing' && 'Step 4: Transcribing'}
                        {run.current_step === 'summarizing' && 'Step 4: Summarizing'}
                        {run.current_step === 'uploading' && 'Step 4: Uploading'}
                      </span>
                    )}
                    <div className="text-xs text-slate-500 dark:text-slate-400 ml-auto text-right">
                      <div>{new Date(run.started_at).toLocaleString()}</div>
                      {run.status === 'running' && run.updated_at && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">
                          Last ping: {new Date(run.updated_at).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (run.status === 'running') {
                          if (!confirm('Stop this sync run?')) return;
                        }
                        try {
                          await axios.delete(`/api/admin/sync-run/${run.id}`);
                          refetchSyncStatus();
                        } catch (err) {
                          console.error('Failed to delete sync run:', err);
                        }
                      }}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                      title={run.status === 'running' ? 'Stop sync' : 'Delete'}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="text-slate-600 dark:text-slate-400">
                      <span className="font-medium">{run.tickers_count}</span> tickers
                    </div>
                    <div className="text-slate-600 dark:text-slate-400">
                      <span className="font-medium">{run.videos_processed}/{run.videos_total}</span> videos
                    </div>
                    <div className="text-slate-600 dark:text-slate-400">
                      <span className="font-medium">{run.transcripts_fetched}</span> transcripts
                    </div>
                    <div className="text-slate-600 dark:text-slate-400">
                      <span className="font-medium">{run.summaries_generated}</span> summaries
                    </div>
                  </div>

                  {run.status === 'running' && run.videos_total > 0 && (
                    <div className="mt-2 w-full bg-slate-200 dark:bg-slate-600 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${(run.videos_processed / run.videos_total) * 100}%` }}
                      />
                    </div>
                  )}

                  {/* Videos list */}
                  {run.videos_list && (
                    <div className="mt-3 max-h-48 overflow-y-auto">
                      <div className="space-y-1">
                        {(() => {
                          try {
                            const videos = JSON.parse(run.videos_list) as { title: string; published_at?: string }[];
                            return videos.map((v, idx) => {
                              const isDone = idx < run.videos_processed;
                              const isCurrent = idx === run.videos_processed && run.status === 'running';
                              const publishedDate = v.published_at ? new Date(v.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
                              return (
                                <div
                                  key={idx}
                                  className={`text-xs px-2 py-1 rounded flex items-center gap-2 ${
                                    isCurrent
                                      ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                                      : isDone
                                      ? 'text-slate-400 dark:text-slate-500'
                                      : 'text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  {isDone ? (
                                    <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                                  ) : isCurrent ? (
                                    <Loader2 className="w-3 h-3 text-blue-500 animate-spin flex-shrink-0" />
                                  ) : (
                                    <div className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-500 flex-shrink-0" />
                                  )}
                                  <span className={isDone ? 'line-through' : ''}>{v.title}</span>
                                  {publishedDate && (
                                    <span className="text-slate-400 dark:text-slate-500 flex-shrink-0">({publishedDate})</span>
                                  )}
                                  {isCurrent && run.current_step && (
                                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-blue-200 dark:bg-blue-700 text-blue-800 dark:text-blue-100 flex-shrink-0">
                                      {run.current_step === 'downloading' && '⬇️ Downloading'}
                                      {run.current_step === 'transcribing' && '🎤 Transcribing'}
                                      {run.current_step === 'summarizing' && '✨ Summarizing'}
                                      {run.current_step === 'uploading' && '⬆️ Uploading'}
                                    </span>
                                  )}
                                </div>
                              );
                            });
                          } catch {
                            return null;
                          }
                        })()}
                      </div>
                    </div>
                  )}

                  {run.error_message && (
                    <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                      {run.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Stock Searches */}
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
                      <th className="pb-3 pl-2">
                        <button onClick={() => handleStockSort('stock_ticker')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white">
                          {language === 'fr' ? 'Action' : 'Stock'}
                          {stockSortColumn === 'stock_ticker' && (stockSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </button>
                      </th>
                      <th className="pb-3 text-center">
                        <button onClick={() => handleStockSort('unique_users')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                          {language === 'fr' ? 'Utilisateurs' : 'Users'}
                          {stockSortColumn === 'unique_users' && (stockSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </button>
                      </th>
                      <th className="pb-3 text-center">
                        <button onClick={() => handleStockSort('total_views')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                          {language === 'fr' ? 'Vues' : 'Views'}
                          {stockSortColumn === 'total_views' && (stockSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </button>
                      </th>
                      <th className="pb-3 text-center">
                        <button onClick={() => handleStockSort('total_time_seconds')} className="flex items-center gap-0.5 hover:text-slate-900 dark:hover:text-white mx-auto">
                          {language === 'fr' ? 'Temps total' : 'Total Time'}
                          {stockSortColumn === 'total_time_seconds' && (stockSortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStockViews.map((stock) => {
                      const stockInfo = findStockByTicker(stock.stock_ticker);
                      const companyName = stockInfo?.name || stock.stock_ticker;
                      return (
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
                            <span className="font-medium text-slate-800 dark:text-slate-100">{companyName} <span className="text-slate-400 font-normal">({stock.stock_ticker})</span></span>
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
                    );})}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 5. Settings (Theme + Language) */}
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
              {/* Theme Stats - using resolved theme (actual dark/light) */}
              {themeStats && themeStats.total > 0 && (
                <div className="bg-slate-100 dark:bg-slate-600 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                    <Moon className="w-4 h-4" />
                    {language === 'fr' ? 'Thème' : 'Theme'}
                  </h4>
                  <div className="space-y-1">
                    {(() => {
                      const dark = themeStats.by_resolved['dark'] || 0;
                      const light = themeStats.by_resolved['light'] || 0;
                      const total = dark + light;
                      return (
                        <>
                          <button
                            onClick={() => handleSettingClick('theme', 'dark')}
                            className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                              selectedTheme === 'dark'
                                ? 'bg-slate-200 dark:bg-slate-500'
                                : 'hover:bg-slate-200 dark:hover:bg-slate-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Moon className="w-4 h-4 text-slate-400" />
                              <span className="text-sm text-slate-600 dark:text-slate-300">{language === 'fr' ? 'Sombre' : 'Dark'}</span>
                            </div>
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                              {total > 0 ? Math.round((dark / total) * 100) : 0}% ({dark})
                            </span>
                          </button>
                          <button
                            onClick={() => handleSettingClick('theme', 'light')}
                            className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                              selectedTheme === 'light'
                                ? 'bg-slate-200 dark:bg-slate-500'
                                : 'hover:bg-slate-200 dark:hover:bg-slate-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Sun className="w-4 h-4 text-amber-500" />
                              <span className="text-sm text-slate-600 dark:text-slate-300">{language === 'fr' ? 'Clair' : 'Light'}</span>
                            </div>
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                              {total > 0 ? Math.round((light / total) * 100) : 0}% ({light})
                            </span>
                          </button>
                        </>
                      );
                    })()}
                  </div>
                  {/* User list for theme - appears right under Theme section */}
                  {selectedTheme && (
                    <div className="mt-3 bg-slate-200 dark:bg-slate-500 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {selectedTheme === 'dark' ? (language === 'fr' ? 'Sombre' : 'Dark') : (language === 'fr' ? 'Clair' : 'Light')}
                        </h4>
                        <button
                          onClick={() => { setSelectedTheme(null); setSettingsUsers([]); }}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          ✕
                        </button>
                      </div>
                      {isLoadingSettingsUsers ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
                        </div>
                      ) : settingsUsers.length > 0 ? (
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                          {settingsUsers.map((u) => (
                            <div
                              key={u.id}
                              className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-300 dark:hover:bg-slate-400 cursor-pointer"
                              onClick={() => navigate(`/investing/admin/user/${u.id}`)}
                            >
                              {u.picture ? (
                                <img src={u.picture} alt={u.name} className="w-6 h-6 rounded-full" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
                                  {u.name?.charAt(0) || '?'}
                                </div>
                              )}
                              <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">{u.name}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 text-center py-2">
                          {language === 'fr' ? 'Aucun utilisateur' : 'No users'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Language Stats */}
              {languageStats && languageStats.total > 0 && (
                <div className="bg-slate-100 dark:bg-slate-600 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" />
                    {language === 'fr' ? 'Langue' : 'Language'}
                  </h4>
                  <div className="space-y-1">
                    {(() => {
                      const en = languageStats.by_language['en'] || 0;
                      const fr = languageStats.by_language['fr'] || 0;
                      const total = en + fr;
                      return (
                        <>
                          <button
                            onClick={() => handleSettingClick('language', 'en')}
                            className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                              selectedLanguage === 'en'
                                ? 'bg-slate-200 dark:bg-slate-500'
                                : 'hover:bg-slate-200 dark:hover:bg-slate-500'
                            }`}
                          >
                            <span className="text-sm text-slate-600 dark:text-slate-300">English</span>
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                              {total > 0 ? Math.round((en / total) * 100) : 0}% ({en})
                            </span>
                          </button>
                          <button
                            onClick={() => handleSettingClick('language', 'fr')}
                            className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                              selectedLanguage === 'fr'
                                ? 'bg-slate-200 dark:bg-slate-500'
                                : 'hover:bg-slate-200 dark:hover:bg-slate-500'
                            }`}
                          >
                            <span className="text-sm text-slate-600 dark:text-slate-300">Français</span>
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                              {total > 0 ? Math.round((fr / total) * 100) : 0}% ({fr})
                            </span>
                          </button>
                        </>
                      );
                    })()}
                  </div>
                  {/* User list for language - appears right under Language section */}
                  {selectedLanguage && (
                    <div className="mt-3 bg-slate-200 dark:bg-slate-500 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {selectedLanguage === 'en' ? 'English' : 'Français'}
                        </h4>
                        <button
                          onClick={() => { setSelectedLanguage(null); setSettingsUsers([]); }}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          ✕
                        </button>
                      </div>
                      {isLoadingSettingsUsers ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
                        </div>
                      ) : settingsUsers.length > 0 ? (
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                          {settingsUsers.map((u) => (
                            <div
                              key={u.id}
                              className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-300 dark:hover:bg-slate-400 cursor-pointer"
                              onClick={() => navigate(`/investing/admin/user/${u.id}`)}
                            >
                              {u.picture ? (
                                <img src={u.picture} alt={u.name} className="w-6 h-6 rounded-full" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
                                  {u.name?.charAt(0) || '?'}
                                </div>
                              )}
                              <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">{u.name}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 text-center py-2">
                          {language === 'fr' ? 'Aucun utilisateur' : 'No users'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Device Stats */}
              {deviceStats && deviceStats.total > 0 && (
                <div className="bg-slate-100 dark:bg-slate-600 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-green-500" />
                    {language === 'fr' ? 'Appareil' : 'Device'}
                    <span className="text-xs text-slate-400 font-normal">({deviceStats.total} users)</span>
                  </h4>
                  <div className="space-y-1">
                    {(() => {
                      const mobileMinutes = deviceStats.by_device['mobile'] || 0;
                      const desktopMinutes = deviceStats.by_device['desktop'] || 0;
                      const totalMinutes = mobileMinutes + desktopMinutes;
                      const formatMinutes = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}m`;
                      return (
                        <>
                          <button
                            onClick={() => handleSettingClick('device', 'desktop')}
                            className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                              selectedDevice === 'desktop'
                                ? 'bg-slate-200 dark:bg-slate-500'
                                : 'hover:bg-slate-200 dark:hover:bg-slate-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Monitor className="w-4 h-4 text-slate-400" />
                              <span className="text-sm text-slate-600 dark:text-slate-300">Desktop</span>
                            </div>
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                              {totalMinutes > 0 ? Math.round((desktopMinutes / totalMinutes) * 100) : 0}% ({formatMinutes(desktopMinutes)})
                            </span>
                          </button>
                          <button
                            onClick={() => handleSettingClick('device', 'mobile')}
                            className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                              selectedDevice === 'mobile'
                                ? 'bg-slate-200 dark:bg-slate-500'
                                : 'hover:bg-slate-200 dark:hover:bg-slate-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Smartphone className="w-4 h-4 text-slate-400" />
                              <span className="text-sm text-slate-600 dark:text-slate-300">Mobile</span>
                            </div>
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                              {totalMinutes > 0 ? Math.round((mobileMinutes / totalMinutes) * 100) : 0}% ({formatMinutes(mobileMinutes)})
                            </span>
                          </button>
                        </>
                      );
                    })()}
                  </div>
                  {/* User list for device - appears right under Device section */}
                  {selectedDevice && (
                    <div className="mt-3 bg-slate-200 dark:bg-slate-500 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {selectedDevice === 'desktop' ? 'Desktop' : 'Mobile'}
                        </h4>
                        <button
                          onClick={() => { setSelectedDevice(null); setSettingsUsers([]); }}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          ✕
                        </button>
                      </div>
                      {isLoadingSettingsUsers ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
                        </div>
                      ) : settingsUsers.length > 0 ? (
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                          {settingsUsers.map((u) => {
                            const formatMins = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}m`;
                            return (
                              <div
                                key={u.id}
                                className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-300 dark:hover:bg-slate-400 cursor-pointer"
                                onClick={() => navigate(`/investing/admin/user/${u.id}`)}
                              >
                                {u.picture ? (
                                  <img src={u.picture} alt={u.name} className="w-6 h-6 rounded-full" />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
                                    {u.name?.charAt(0) || '?'}
                                  </div>
                                )}
                                <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">{u.name}</span>
                                {u.minutes !== undefined && (
                                  <span className="text-xs text-slate-400 dark:text-slate-300">{formatMins(u.minutes)}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 text-center py-2">
                          {language === 'fr' ? 'Aucun utilisateur' : 'No users'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Show message if no data */}
              {(!themeStats || themeStats.total === 0) &&
               (!languageStats || languageStats.total === 0) &&
               (!deviceStats || deviceStats.total === 0) && (
                <p className="text-sm text-slate-500 text-center py-4">
                  {language === 'fr' ? 'Aucune donnée disponible' : 'No data available'}
                </p>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
