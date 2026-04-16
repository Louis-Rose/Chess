import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, ChevronUp, ChevronDown } from 'lucide-react';

interface WaitlistAnswer {
  question: string;
  type: string | null;
  value: unknown;
}

interface WaitlistResponse {
  response_id: string;
  submitted_at: string;
  answers: WaitlistAnswer[];
}

function formatAnswerValue(value: unknown): string {
  if (value == null) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function WaitlistSection() {
  const [collapsed, setCollapsed] = useState(true);
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-waitlist'],
    queryFn: async () => {
      const res = await axios.get('/api/admin/waitlist');
      return res.data as { responses: WaitlistResponse[]; total: number };
    },
  });

  const total = data?.total ?? 0;
  const responses = data?.responses ?? [];

  return (
    <div className="rounded-lg border border-slate-700 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
        onClick={() => setCollapsed(c => !c)}
      >
        {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
        <h3 className="text-sm font-medium text-slate-300">Waitlist</h3>
        <span className="text-xs text-slate-400">({total})</span>
      </div>
      {!collapsed && (
        <div className="px-4 py-3">
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
            </div>
          )}
          {error && (
            <p className="text-red-400 text-sm text-center py-4">
              Failed to load waitlist. Make sure TYPEFORM_TOKEN is set on the backend.
            </p>
          )}
          {!isLoading && !error && responses.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-4">No responses yet</p>
          )}
          {!isLoading && !error && responses.length > 0 && (
            <div className="space-y-3">
              {responses.map(r => (
                <div key={r.response_id} className="rounded border border-slate-700 bg-slate-800/40">
                  <div className="px-3 py-1.5 bg-slate-700/30 text-xs text-slate-400">
                    {new Date(r.submitted_at).toLocaleString()}
                  </div>
                  <div className="divide-y divide-slate-700/50">
                    {r.answers.map((a, i) => (
                      <div key={i} className="px-3 py-2 text-sm">
                        <div className="text-xs text-slate-500 mb-0.5">{a.question}</div>
                        <div className="text-slate-200 whitespace-pre-wrap break-words">{formatAnswerValue(a.value)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
