// Admin panel - view registered users (admin only)

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Shield, Users, Loader2, AlertCircle, TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { Navigate } from 'react-router-dom';

interface AdminUser {
  id: number;
  email: string;
  name: string;
  picture: string;
  is_admin: number;
  created_at: string;
  updated_at: string;
}

interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
}

const fetchUsers = async (): Promise<AdminUsersResponse> => {
  const response = await axios.get('/api/admin/users');
  return response.data;
};

export function AdminPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchUsers,
    enabled: !!user?.is_admin,
  });

  // Compute cumulative users per day (including all days)
  const chartData = useMemo(() => {
    if (!data?.users || data.users.length === 0) return [];

    // Group users by date
    const usersByDate: Record<string, number> = {};
    data.users.forEach((u) => {
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
          <h2 className="text-3xl font-bold text-slate-100">
            {language === 'fr' ? 'Administration' : 'Admin Panel'}
          </h2>
        </div>
        <p className="text-slate-400 text-lg italic">
          {language === 'fr' ? 'Gestion des utilisateurs' : 'User management'}
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* User Growth Chart */}
        {!isLoading && !error && chartData.length > 0 && (
          <div className="bg-slate-100 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-slate-600" />
              <h3 className="text-xl font-bold text-slate-800">
                {language === 'fr' ? 'Croissance des utilisateurs' : 'User Growth'}
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
        <div className="bg-slate-100 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Users className="w-5 h-5 text-slate-600" />
            <h3 className="text-xl font-bold text-slate-800">
              {language === 'fr' ? 'Utilisateurs inscrits' : 'Registered Users'}
              {data && <span className="text-slate-500 font-normal ml-2">({data.total})</span>}
            </h3>
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
                <thead className="sticky top-0 bg-slate-100">
                  <tr className="text-left text-slate-600 text-sm border-b-2 border-slate-300">
                    <th className="pb-3 pl-2">ID</th>
                    <th className="pb-3">{language === 'fr' ? 'Utilisateur' : 'User'}</th>
                    <th className="pb-3">Email</th>
                    <th className="pb-3 text-center">Admin</th>
                    <th className="pb-3">{language === 'fr' ? 'Inscrit le' : 'Registered'}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className="py-3 pl-2 text-slate-500">#{u.id}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          {u.picture ? (
                            <img
                              src={u.picture}
                              alt={u.name}
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-300" />
                          )}
                          <span className="font-medium text-slate-800">{u.name || '-'}</span>
                        </div>
                      </td>
                      <td className="py-3 text-slate-600">{u.email}</td>
                      <td className="py-3 text-center">
                        {u.is_admin ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            <Shield className="w-3 h-3 mr-1" />
                            Admin
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 text-slate-500 text-sm">
                        {new Date(u.created_at).toLocaleDateString(
                          language === 'fr' ? 'fr-FR' : 'en-US',
                          { day: 'numeric', month: 'short', year: 'numeric' }
                        )}
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
