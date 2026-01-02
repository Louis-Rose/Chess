// Admin panel - view registered users (admin only)

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Shield, Users, Loader2, AlertCircle } from 'lucide-react';
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
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
