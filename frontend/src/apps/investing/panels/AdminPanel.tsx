// Admin panel - view registered users (admin only)

import { useMemo, useState, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Shield, Users, Loader2, AlertCircle, TrendingUp, ChevronUp, ChevronDown, Calendar, X } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';

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
}

interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
}

type SortColumn = 'id' | 'name' | 'created_at' | 'last_active' | 'total_minutes';
type SortDirection = 'asc' | 'desc';

const fetchUsers = async (): Promise<AdminUsersResponse> => {
  const response = await axios.get('/api/admin/users');
  return response.data;
};

export function AdminPanel() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchUsers,
    enabled: !!user?.is_admin,
  });

  // Sort state (default: most time spent first)
  const [sortColumn, setSortColumn] = useState<SortColumn>('total_minutes');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Date filter state
  const [filterDate, setFilterDate] = useState<string>('');
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Handle column header click
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Filtered and sorted users
  const sortedUsers = useMemo(() => {
    if (!data?.users) return [];

    // Apply date filter (filter by last_active)
    let filtered = data.users;
    if (filterDate) {
      filtered = data.users.filter((u) => {
        if (!u.last_active) return false;
        const userDate = u.last_active.split('T')[0].split(' ')[0]; // Handle both ISO and space-separated formats
        return userDate === filterDate;
      });
    }

    // Sort
    return [...filtered].sort((a, b) => {
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
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data?.users, sortColumn, sortDirection, filterDate]);

  // Compute cumulative users per day (including all days)
  const chartData = useMemo(() => {
    if (!data?.users || data.users.length === 0) return [];

    // Exclude fake/test users from chart
    const excludeFromChart = ['fake.test@example.com'];
    const realUsers = data.users.filter(u => !excludeFromChart.includes(u.email));

    // Group users by date
    const usersByDate: Record<string, number> = {};
    realUsers.forEach((u) => {
      const date = u.created_at.split('T')[0].split(' ')[0]; // Handle both ISO and space-separated formats
      usersByDate[date] = (usersByDate[date] || 0) + 1;
    });

    // Get date range (from one day before first registration to today)
    const sortedRegistrationDates = Object.keys(usersByDate).sort();
    const firstRegistration = new Date(sortedRegistrationDates[0]);
    const startDate = new Date(firstRegistration);
    startDate.setDate(startDate.getDate() - 1); // Day before first registration (starts at 0)
    const endDate = new Date(); // Today

    // Generate all dates between start and end
    const allDates: string[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      allDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Compute cumulative for all dates
    let cumulative = 0;
    return allDates.map((date) => {
      const newUsers = usersByDate[date] || 0;
      cumulative += newUsers;
      return {
        date,
        users: cumulative,
        newUsers,
      };
    });
  }, [data?.users]);

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
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-lg italic">
          {language === 'fr' ? 'Gestion des utilisateurs' : 'User management'}
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* User Growth Chart */}
        {!isLoading && !error && chartData.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {language === 'fr' ? 'Nombre d\'utilisateurs' : 'User Growth'}
              </h3>
            </div>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="userGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    tickFormatter={(date) => {
                      const d = new Date(date);
                      return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                        day: 'numeric',
                        month: 'short',
                      });
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    allowDecimals={false}
                    domain={[0, yAxisMax]}
                    ticks={yAxisTicks}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      padding: '8px 12px',
                    }}
                    labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                    labelFormatter={(date) =>
                      new Date(String(date)).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    }
                    formatter={(value, name) => {
                      if (name === 'users') {
                        return [value, language === 'fr' ? 'Total utilisateurs' : 'Total users'];
                      }
                      return [value, String(name)];
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="users"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="url(#userGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Users List */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {language === 'fr' ? 'Utilisateurs' : 'Registered Users'}
                {data && (
                  <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">
                    ({filterDate ? sortedUsers.length : data.total})
                  </span>
                )}
              </h3>
            </div>

            {/* Date Filter */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => dateInputRef.current?.showPicker()}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-600 rounded-lg cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-500 transition-colors"
              >
                <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  {language === 'fr' ? 'Actif le' : 'Active on'}
                </span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {filterDate
                    ? new Date(filterDate).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '_'}
                </span>
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="absolute opacity-0 pointer-events-none"
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate('')}
                  className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-500 rounded-lg"
                  title={language === 'fr' ? 'Effacer le filtre' : 'Clear filter'}
                >
                  <X className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                </button>
              )}
            </div>
          </div>

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
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700">
                  <tr className="text-left text-slate-600 dark:text-slate-300 text-sm border-b-2 border-slate-300 dark:border-slate-500">
                    <th className="pb-3 pl-2">
                      <button onClick={() => handleSort('id')} className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                        ID
                        {sortColumn === 'id' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-3">
                      <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                        {language === 'fr' ? 'Utilisateur' : 'User'}
                        {sortColumn === 'name' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-3">
                      <button onClick={() => handleSort('created_at')} className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                        {language === 'fr' ? 'Inscrit le' : 'Registered'}
                        {sortColumn === 'created_at' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-3 text-center">
                      <button onClick={() => handleSort('last_active')} className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white mx-auto">
                        {language === 'fr' ? 'Dernière activité' : 'Last Active'}
                        {sortColumn === 'last_active' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </th>
                    <th className="pb-3 text-center">
                      <button onClick={() => handleSort('total_minutes')} className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white mx-auto">
                        {language === 'fr' ? 'Temps passé' : 'Time Spent'}
                        {sortColumn === 'total_minutes' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
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
                      <td className="py-3 pl-2 text-slate-500 dark:text-slate-300">#{u.id}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          {u.picture ? (
                            <img
                              src={u.picture}
                              alt={u.name}
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-500" />
                          )}
                          <span className="font-medium text-slate-800 dark:text-slate-100">{u.name || '-'}</span>
                        </div>
                      </td>
                      <td className="py-3 text-slate-500 dark:text-slate-300 text-sm">
                        {new Date(u.created_at).toLocaleDateString(
                          language === 'fr' ? 'fr-FR' : 'en-US',
                          { day: 'numeric', month: 'short', year: 'numeric' }
                        )}
                      </td>
                      <td className="py-3 text-center text-sm text-slate-500 dark:text-slate-300">
                        {u.last_active ? (
                          (() => {
                            const days = Math.floor((Date.now() - new Date(u.last_active).getTime()) / (1000 * 60 * 60 * 24));
                            if (days === 0) return language === 'fr' ? "Aujourd'hui" : 'Today';
                            if (days === 1) return language === 'fr' ? 'Hier' : 'Yesterday';
                            return language === 'fr' ? `${days}j` : `${days}d`;
                          })()
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 text-center text-sm text-slate-500 dark:text-slate-300">
                        {u.total_minutes > 0 ? (
                          u.total_minutes >= 60
                            ? `${Math.floor(u.total_minutes / 60)}h${String(u.total_minutes % 60).padStart(2, '0')}`
                            : `${u.total_minutes}m`
                        ) : '-'}
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
        </div>
      </div>
    </div>
  );
}
