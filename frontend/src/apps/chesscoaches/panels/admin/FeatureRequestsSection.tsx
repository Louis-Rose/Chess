import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface FeatureRequestItem { tag: string; count: number; people: string[]; }

export function FeatureRequestsSection() {
  const [collapsed, setCollapsed] = useState(true);
  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-feature-requests'],
    queryFn: async () => {
      const res = await axios.get('/api/admin/feature-requests');
      return res.data as { items: FeatureRequestItem[]; interviewed_count: number };
    },
  });

  const items = data?.items ?? [];
  const interviewed = data?.interviewed_count ?? 0;
  const expanded = expandedTag ? items.find(i => i.tag === expandedTag) : null;

  const handleBarClick = (payload: unknown) => {
    const p = payload as { tag?: string; payload?: { tag?: string } } | undefined;
    const tag = p?.tag ?? p?.payload?.tag;
    if (!tag) return;
    setExpandedTag(t => (t === tag ? null : tag));
  };

  return (
    <div className="rounded-lg border border-slate-700 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
        onClick={() => setCollapsed(c => !c)}
      >
        {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
        <h3 className="text-sm font-medium text-slate-300">Features wanted (Notion CRM)</h3>
        <span className="text-xs text-slate-400">({interviewed} interviewed)</span>
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
              Failed to load. Check NOTION_TOKEN / NOTION_DATABASE_ID and that the integration is connected to the database.
            </p>
          )}
          {!isLoading && !error && items.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-4">No tags yet</p>
          )}
          {!isLoading && !error && items.length > 0 && (
            <>
              <div className="[&_*:focus]:outline-none">
                <ResponsiveContainer width="100%" height={Math.max(items.length * 32, 160)}>
                  <BarChart data={items} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: '#e2e8f0', fontSize: 11 }} />
                    <YAxis type="category" dataKey="tag" tick={{ fill: '#e2e8f0', fontSize: 12 }} width={160} />
                    <Tooltip
                      cursor={false}
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                      labelStyle={{ color: '#e2e8f0' }}
                      formatter={(value) => [`${value}`, 'Requests']}
                    />
                    <Bar
                      dataKey="count"
                      fill="#a855f7"
                      radius={[0, 2, 2, 0]}
                      activeBar={false}
                      onClick={handleBarClick}
                      style={{ cursor: 'pointer' }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {expanded && (
                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-700/40 flex items-center justify-between">
                    <h4 className="text-xs font-medium text-slate-300">{expanded.tag} — {expanded.count}</h4>
                    <button onClick={() => setExpandedTag(null)} className="text-xs text-slate-500 hover:text-slate-300">✕</button>
                  </div>
                  {(expanded.people ?? []).length === 0 ? (
                    <div className="px-3 py-3 text-xs text-slate-500">No names</div>
                  ) : (
                    <ul className="divide-y divide-slate-700/50">
                      {(expanded.people ?? []).map((name, i) => (
                        <li key={i} className="px-3 py-1.5 text-sm text-slate-200">{name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
