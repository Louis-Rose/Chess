import { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, Trash2, Check } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell, btnPrimary } from '../components/PanelShell';
import { authFetch } from '../utils/authFetch';
import { CITY_TIMEZONES, getCurrencyForCity, getTimezoneForCity, CURRENCY_LIST, CURRENCY_NAMES } from '../utils/cities';

interface BundleOffer {
  lessons: number | '';
  price: number | '';
}

export function ProfilePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [city, setCity] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [currency, setCurrency] = useState('');
  const [lessonRate, setLessonRate] = useState<number | ''>('');
  const [lessonDuration, setLessonDuration] = useState(60);
  const [chesscom, setChesscom] = useState('');
  const [lichess, setLichess] = useState('');
  const [bundles, setBundles] = useState<BundleOffer[]>([]);

  useEffect(() => {
    authFetch('/api/coaches/profile')
      .then(res => res.json())
      .then(data => {
        setDisplayName(data.display_name || data.google_name || '');
        setCity(data.city || '');
        setCitySearch(data.city || '');
        setCurrency(data.currency || '');
        setLessonRate(data.lesson_rate ?? '');
        setLessonDuration(data.lesson_duration || 60);
        setChesscom(data.chesscom_username || '');
        setLichess(data.lichess_username || '');
        setBundles(data.bundles?.length ? data.bundles.map((b: { lessons: number; price: number }) => ({ lessons: b.lessons, price: b.price })) : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const cityMatches = useMemo(() => {
    if (!citySearch || citySearch === city) return [];
    const q = citySearch.toLowerCase();
    return CITY_TIMEZONES.filter(([c]) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [citySearch, city]);

  const selectCity = (name: string) => {
    setCity(name);
    setCitySearch(name);
    if (!currency) {
      const curr = getCurrencyForCity(name);
      if (curr) setCurrency(curr);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const tz = getTimezoneForCity(city);
    await authFetch('/api/coaches/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: displayName, city, timezone: tz, currency,
        lesson_rate: lessonRate === '' ? null : lessonRate,
        lesson_duration: lessonDuration,
        chesscom_username: chesscom, lichess_username: lichess,
        bundles: bundles.filter(b => b.lessons && b.price !== ''),
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addBundle = () => setBundles(prev => [...prev, { lessons: '', price: '' }]);
  const removeBundle = (i: number) => setBundles(prev => prev.filter((_, idx) => idx !== i));
  const updateBundle = (i: number, field: 'lessons' | 'price', value: string) => {
    setBundles(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: value === '' ? '' : Number(value) } : b));
  };

  if (loading) {
    return (
      <PanelShell title={t('coaches.navProfile')}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell title={t('coaches.navProfile')}>
      <div className="max-w-lg mx-auto space-y-6">

        {/* Personal info container */}
        <div className="rounded-xl border border-slate-700 p-5 space-y-4">
          <Field label={t('coaches.profile.name')}>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} className={INPUT} placeholder={user?.name || ''} />
          </Field>

          <Field label={t('coaches.profile.city')}>
            <div className="relative">
              <input value={citySearch} onChange={e => { setCitySearch(e.target.value); setCity(''); }} className={INPUT} placeholder="Paris, London, New York..." />
              {cityMatches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {cityMatches.map(([name, , flag]) => (
                    <button key={name} onClick={() => selectCity(name)} className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-2">
                      <span>{flag}</span><span>{name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          <Field label={t('coaches.profile.currency')}>
            <select value={currency} onChange={e => setCurrency(e.target.value)} className={INPUT}>
              <option value="">—</option>
              {CURRENCY_LIST.map(c => <option key={c} value={c}>{CURRENCY_NAMES[c] || c} ({c})</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Chess.com">
              <input value={chesscom} onChange={e => setChesscom(e.target.value)} className={INPUT} placeholder={t('coaches.profile.optional')} />
            </Field>
            <Field label="Lichess">
              <input value={lichess} onChange={e => setLichess(e.target.value)} className={INPUT} placeholder={t('coaches.profile.optional')} />
            </Field>
          </div>
        </div>

        {/* Lesson Rates container */}
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-3 bg-slate-700/50">
            <h3 className="text-sm font-medium text-slate-300">{t('coaches.profile.rates')}</h3>
          </div>
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('coaches.profile.rate')}>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={lessonRate} onChange={e => setLessonRate(e.target.value === '' ? '' : Number(e.target.value))} className={INPUT} placeholder="40" />
                  {currency && <span className="text-slate-400 text-sm">{currency}</span>}
                </div>
              </Field>
              <Field label={t('coaches.profile.duration')}>
                <div className="flex items-center gap-2">
                  <input type="number" min={15} step={15} value={lessonDuration} onChange={e => setLessonDuration(Number(e.target.value) || 60)} className={INPUT} />
                  <span className="text-slate-400 text-sm">min</span>
                </div>
              </Field>
            </div>

            {/* Bundle offers */}
            <div>
              <label className="block text-sm text-slate-300 font-medium mb-3">{t('coaches.profile.bundles')}</label>
              {bundles.length === 0 && (
                <p className="text-sm text-slate-500 mb-3">{t('coaches.profile.noBundles')}</p>
              )}
              <div className="space-y-2 mb-4">
                {bundles.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="number" min={1} value={b.lessons} onChange={e => updateBundle(i, 'lessons', e.target.value)} className={INPUT + ' w-20'} placeholder="10" />
                    <span className="text-slate-400 text-sm">{t('coaches.profile.lessonsFor')}</span>
                    <input type="number" min={0} value={b.price} onChange={e => updateBundle(i, 'price', e.target.value)} className={INPUT + ' w-24'} placeholder="300" />
                    {currency && <span className="text-slate-400 text-sm">{currency}</span>}
                    <button onClick={() => removeBundle(i)} className="text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={addBundle} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> {t('coaches.profile.addBundle')}
              </button>
            </div>
          </div>
        </div>

        {/* Save */}
        <button onClick={handleSave} disabled={saving} className={btnPrimary('blue') + ' w-full flex items-center justify-center gap-2'}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
          {saved ? t('coaches.profile.saved') : t('coaches.profile.save')}
        </button>
      </div>
    </PanelShell>
  );
}

const INPUT = 'w-full bg-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-blue-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-slate-300 font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}
