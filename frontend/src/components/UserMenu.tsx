import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ChevronDown, LogOut, Settings } from 'lucide-react';

interface UserMenuProps {
  collapsed?: boolean;
}

export function UserMenu({ collapsed = false }: UserMenuProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center ${collapsed ? 'justify-center p-1' : 'gap-2 px-3 py-2'} rounded-lg hover:bg-slate-700 transition-colors`}
        title={collapsed ? user.name || user.email : undefined}
      >
        {user.picture ? (
          <img src={user.picture} alt="" className="w-8 h-8 min-w-[2rem] min-h-[2rem] rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-8 h-8 min-w-[2rem] min-h-[2rem] rounded-full bg-blue-500 flex items-center justify-center text-white font-bold flex-shrink-0">
            {user.name?.charAt(0) || user.email.charAt(0)}
          </div>
        )}
        {!collapsed && (
          <>
            <span className="text-slate-200 text-sm hidden md:block max-w-32 truncate">{user.name || user.email}</span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {isOpen && (
        <div className={`absolute ${collapsed ? 'left-full ml-2' : 'right-0'} top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50`}>
          <div className="px-4 py-3 border-b border-slate-700">
            <p className="text-sm text-slate-200 font-medium truncate">{user.name}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
          <div className="py-1">
            <button
              onClick={() => {
                logout();
                setIsOpen(false);
                navigate('/investing');
              }}
              className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
          <div className="border-t border-slate-700 py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/investing/settings');
              }}
              className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
