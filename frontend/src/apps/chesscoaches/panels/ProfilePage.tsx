import { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, Trash2, Check } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell } from '../components/PanelShell';
import { authFetch } from '../utils/authFetch';
import { CITY_TIMEZONES, getCurrencyForCity, getTimezoneForCity, getTimezoneAbbr, CURRENCY_LIST, CURRENCY_NAMES } from '../utils/cities';

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

  const cityTimezone = useMemo(() => {
    if (!city) return '';
    const tz = getTimezoneForCity(city);
    return tz ? getTimezoneAbbr(tz) : '';
  }, [city]);

  const selectCity = (name: string) => {
    setCity(name);
    setCitySearch(name);
    if (!currency) {
      const curr = getCurrencyForCity(name);
      if (curr) setCurrency(curr);
    }
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false);
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
    setSaving(false); setSaved(true);
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
      <div className="max-w-lg mx-auto">
        <div className="rounded-xl border border-slate-700 p-5 space-y-5">

          {/* Name */}
          <Field label={t('coaches.profile.name')} required>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} className={INPUT} placeholder={user?.name || ''} />
          </Field>

          {/* City */}
          <Field label={t('coaches.profile.city')} required>
            <div className="relative">
              <input
                value={cityTimezone ? `${citySearch} (${cityTimezone})` : citySearch}
                onChange={e => {
                  // Strip the timezone suffix when editing
                  const raw = e.target.value.replace(/\s*\([^)]*\)\s*$/, '');
                  setCitySearch(raw);
                  setCity('');
                }}
                onFocus={() => { if (city) setCitySearch(city); }}
                className={INPUT}
                placeholder="Paris, London, New York..."
              />
              {cityMatches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {cityMatches.map(([name, tz, flag]) => (
                    <button key={name} onClick={() => selectCity(name)} className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-2">
                      <span>{flag}</span>
                      <span className="flex-1">{name}</span>
                      <span className="text-slate-100 text-xs">({getTimezoneAbbr(tz)})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          {/* Currency */}
          <Field label={t('coaches.profile.currency')} required>
            <select value={currency} onChange={e => setCurrency(e.target.value)} className={INPUT}>
              <option value="">—</option>
              {CURRENCY_LIST.map(c => <option key={c} value={c}>{CURRENCY_NAMES[c] || c} ({c})</option>)}
            </select>
          </Field>

          {/* Chess usernames */}
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('coaches.profile.chesscomUsername')}>
              <input value={chesscom} onChange={e => setChesscom(e.target.value)} className={INPUT} />
            </Field>
            <Field label={t('coaches.profile.lichessUsername')}>
              <input value={lichess} onChange={e => setLichess(e.target.value)} className={INPUT} />
            </Field>
          </div>

          {/* Save profile */}
          <button onClick={handleSave} disabled={saving} className={SAVE_BTN}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
            {saved ? t('coaches.profile.saved') : t('coaches.profile.saveInfo')}
          </button>

          {/* Divider + Pricing title */}
          <div className="border-t border-slate-700 pt-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider text-center">{t('coaches.profile.pricingTitle')}</h3>
          </div>

          {/* Lesson duration + rate */}
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('coaches.profile.duration')}>
              <select value={lessonDuration} onChange={e => setLessonDuration(Number(e.target.value))} className={INPUT}>
                <option value={60}>1 hour</option>
                <option value={90}>1 hour 30</option>
                <option value={120}>2 hours</option>
              </select>
            </Field>
            <Field label={t('coaches.profile.rate')}>
              <div className="flex items-center gap-2">
                <input type="text" inputMode="numeric" value={lessonRate} onChange={e => setLessonRate(e.target.value === '' ? '' : Number(e.target.value.replace(/[^0-9.]/g, '')))} className={INPUT} placeholder="40" />
                {currency && <span className="text-slate-400 text-sm">{currency}</span>}
              </div>
            </Field>
          </div>

          {/* Bundle offers */}
          <div>
            <label className="block text-sm text-slate-300 font-medium mb-3">{t('coaches.profile.bundles')}</label>
            <div className="space-y-2 mb-3">
              {bundles.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="text" inputMode="numeric" value={b.lessons} onChange={e => updateBundle(i, 'lessons', e.target.value.replace(/[^0-9]/g, ''))} className={INPUT + ' w-20'} placeholder="10" />
                  <span className="text-slate-400 text-sm whitespace-nowrap text-center w-16">{t('coaches.profile.lessonsFor')}</span>
                  <input type="text" inputMode="numeric" value={b.price} onChange={e => updateBundle(i, 'price', e.target.value.replace(/[^0-9.]/g, ''))} className={INPUT + ' w-24'} placeholder="300" />
                  {currency && <span className="text-slate-400 text-sm">{currency}</span>}
                  <button onClick={() => removeBundle(i)} className="text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addBundle} className="mx-auto flex items-center justify-center gap-1.5 px-6 py-1.5 border border-dashed border-slate-600 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 text-xs font-medium rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> {t('coaches.profile.addBundle')}
            </button>
          </div>

          {/* Save pricing */}
          <button onClick={handleSave} disabled={saving} className={SAVE_BTN}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
            {saved ? t('coaches.profile.saved') : t('coaches.profile.saveRates')}
          </button>

        </div>
      </div>
    </PanelShell>
  );
}

const INPUT = 'w-full bg-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-blue-500';
const SAVE_BTN = 'w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-slate-300 font-medium mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
