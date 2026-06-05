import { Dumbbell } from 'lucide-react';
import { LoginButton } from '../../components/LoginButton';

// Auth gate for the fit app: shown when no user is logged in.
export function FitLogin() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-900 px-8 text-center text-slate-100">
      <Dumbbell className="h-12 w-12 text-emerald-400" strokeWidth={1.6} />
      <div>
        <h1 className="text-2xl font-semibold">Mon Programme</h1>
        <p className="mt-2 text-sm text-slate-400">Connecte-toi pour accéder à ton programme.</p>
      </div>
      <LoginButton size="large" redirectTo="/fit" />
    </div>
  );
}
