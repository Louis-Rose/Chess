import { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell } from '../components/PanelShell';
import { authFetch } from '../utils/authFetch';
import { CITY_TIMEZONES, getCurrencyForCity, getTimezoneForCity, getTimezoneAbbr, CURRENCY_LIST, CURRENCY_NAMES, CURRENCY_SYMBOLS } from '../utils/cities';

interface BundleOffer {
  lessons: number | '';
  price: number | '';
}

const DURATION_LABELS: Record<number, string> = { 60: '1 hour', 90: '1 hour 30', 120: '2 hours' };

export function ProfilePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [city, setCity] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [currency, setCurrency] = useState('');
  const [lessonRate, setLessonRate] = useState<number | ''>('');
  const [lessonDuration, setLessonDuration] = useState(0);
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
        setLessonDuration(data.lesson_duration || 0);
        setChesscom(data.chesscom_username || '');
        setLichess(data.lichess_username || '');
        setBundles(data.bundles?.length ? data.bundles.map((b: { lessons: number; price: number }) => ({ lessons: b.lessons, price: b.price })) : []);
        const hasSaved = !!(data.display_name || data.city || data.currency);
        setHasProfile(hasSaved);
        setEditing(!hasSaved);
        setLoading(false);
      })
      .catch(() => { setEditing(true); setLoading(false); });
  }, []);

  const cityMatches = useMemo(() => {
    if (!showCityDropdown || !citySearch) return [];
    const q = citySearch.toLowerCase();
    return CITY_TIMEZONES.filter(([c]) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [citySearch, showCityDropdown]);

  const cityTimezone = useMemo(() => {
    if (!city) return '';
    const tz = getTimezoneForCity(city);
    return tz ? getTimezoneAbbr(tz) : '';
  }, [city]);

  const selectCity = (name: string) => {
    setCity(name);
    setCitySearch(name);
    setShowCityDropdown(false);
    if (!currency) {
      const curr = getCurrencyForCity(name);
      if (curr) setCurrency(curr);
    }
  };

  const currSymbol = CURRENCY_SYMBOLS[currency] || '';

  const canSave = !!(displayName.trim() && city && currency && lessonDuration && lessonRate &&
    bundles.every(b => b.lessons && b.price));

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const tz = getTimezoneForCity(city);
    await authFetch('/api/coaches/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: displayName, city, timezone: tz, currency,
        lesson_rate: lessonRate || null,
        lesson_duration: lessonDuration,
        chesscom_username: chesscom, lichess_username: lichess,
        bundles: bundles.filter(b => b.lessons && b.price !== ''),
      }),
    });
    setSaving(false);
    setHasProfile(true);
    setEditing(false);
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

  // ── Read-only view ──
  if (!editing && hasProfile) {
    const currName = CURRENCY_NAMES[currency] || currency;
    return (
      <PanelShell title={t('coaches.navProfile')}>
        <div className="max-w-lg mx-auto">
          <div className="rounded-xl border border-slate-700 p-5 pb-6 space-y-4 relative">
            <button onClick={() => setEditing(true)} className="absolute top-5 right-5 flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors">
              <Pencil className="w-4 h-4" /> {t('coaches.profile.edit')}
            </button>

            <InfoRow label={t('coaches.profile.name')} value={displayName} />
            <InfoRow label={t('coaches.profile.city')} value={city ? `${city} (${cityTimezone})` : '—'} />
            <InfoRow label={t('coaches.profile.currency')} value={currency ? `${currName} (${currSymbol})` : '—'} />

            {(chesscom || lichess) && (
              <div className="grid grid-cols-2 gap-4">
                {chesscom && <InfoRow label={t('coaches.profile.chesscomUsername')} value={chesscom} />}
                {lichess && <InfoRow label={t('coaches.profile.lichessUsername')} value={lichess} />}
              </div>
            )}

            <div className="border-t border-slate-700 pt-4">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider text-center">{t('coaches.profile.pricingTitle')}</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <InfoRow label={t('coaches.profile.duration')} value={DURATION_LABELS[lessonDuration] || '—'} />
              <InfoRow label={t('coaches.profile.rate')} value={lessonRate !== '' ? `${currSymbol}${lessonRate}` : '—'} />
            </div>

            {bundles.length > 0 && (
              <div className="rounded-lg border border-slate-600/50 overflow-hidden">
                <div className="px-4 py-2 bg-slate-700/30 border-b border-slate-600/50">
                  <label className="block text-sm text-slate-300 font-medium text-center">{t('coaches.profile.bundles')}</label>
                </div>
                <div className="p-4 space-y-2">
                  {bundles.filter(b => b.lessons && b.price !== '').map((b, i) => (
                    <div key={i} className="flex items-center gap-2 justify-center">
                      <div className="w-24 bg-slate-700/50 text-slate-100 text-sm rounded-lg px-3 py-2 border border-slate-600/50 text-center">{b.lessons}</div>
                      <span className="text-slate-400 text-sm">{t('coaches.profile.forWord')}</span>
                      <div className="w-24 bg-slate-700/50 text-slate-100 text-sm rounded-lg px-3 py-2 border border-slate-600/50 text-center">{currSymbol}{b.price}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </PanelShell>
    );
  }

  // ── Edit view ──
  return (
    <PanelShell title={t('coaches.navProfile')}>
      <div className="max-w-lg mx-auto">
        <div className="rounded-xl border border-slate-700 p-5 space-y-5">

          <Field label={t('coaches.profile.name')} required>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} className={INPUT} placeholder={user?.name || ''} />
          </Field>

          <Field label={t('coaches.profile.city')} required>
            <div className="relative">
              <input
                value={city && !showCityDropdown ? `${city} (${cityTimezone})` : citySearch}
                onChange={e => { setCitySearch(e.target.value); setCity(''); setShowCityDropdown(true); }}
                onFocus={() => { setCitySearch(city || citySearch); setShowCityDropdown(true); }}
                onBlur={() => setTimeout(() => setShowCityDropdown(false), 200)}
                className={INPUT}
                placeholder="Paris, London, New York..."
              />
              {cityMatches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {cityMatches.map(([name, tz, flag]) => (
                    <button key={name} onMouseDown={() => selectCity(name)} className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-2">
                      <span>{flag}</span>
                      <span className="flex-1">{name}</span>
                      <span className="text-slate-100 text-xs">({getTimezoneAbbr(tz)})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          <Field label={t('coaches.profile.currency')} required>
            <select value={currency} onChange={e => setCurrency(e.target.value)} className={INPUT}>
              <option value="">—</option>
              {CURRENCY_LIST.map(c => (
                <option key={c} value={c}>{CURRENCY_NAMES[c] || c} ({CURRENCY_SYMBOLS[c] || c})</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('coaches.profile.chesscomUsername')}>
              <input value={chesscom} onChange={e => setChesscom(e.target.value)} className={INPUT} />
            </Field>
            <Field label={t('coaches.profile.lichessUsername')}>
              <input value={lichess} onChange={e => setLichess(e.target.value)} className={INPUT} />
            </Field>
          </div>

          <div className="border-t border-slate-700 pt-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider text-center">{t('coaches.profile.pricingTitle')}</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('coaches.profile.duration')} required>
              <select value={lessonDuration || ''} onChange={e => setLessonDuration(Number(e.target.value))} className={INPUT}>
                <option value="">—</option>
                <option value={60}>1 hour</option>
                <option value={90}>1 hour 30</option>
                <option value={120}>2 hours</option>
              </select>
            </Field>
            <Field label={currSymbol ? `${t('coaches.profile.rate')} (${currSymbol})` : t('coaches.profile.rate')} required>
              <input type="text" inputMode="numeric" value={lessonRate} onChange={e => setLessonRate(e.target.value === '' ? '' : Number(e.target.value.replace(/[^0-9.]/g, '')))} className={INPUT} placeholder="40" />
            </Field>
          </div>

          <div className="rounded-lg border border-slate-600/50 overflow-hidden">
            <div className="px-4 py-2 bg-slate-700/30 border-b border-slate-600/50">
              <label className="block text-sm text-slate-300 font-medium text-center">{t('coaches.profile.bundles')}</label>
            </div>
            <div className="p-4">
              <div className="space-y-3 mb-3">
                {bundles.map((b, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Field label={i === 0 ? t('coaches.profile.bundleLessons') : ''} required={i === 0}>
                      <input type="text" inputMode="numeric" value={b.lessons} onChange={e => updateBundle(i, 'lessons', e.target.value.replace(/[^0-9]/g, ''))} className={INPUT + ' text-center'} placeholder="10" />
                    </Field>
                    <span className={`text-slate-400 text-sm pt-2 ${i === 0 ? 'mt-6' : ''}`}>{t('coaches.profile.forWord')}</span>
                    <Field label={i === 0 ? t('coaches.profile.bundlePrice') : ''} required={i === 0}>
                      <input type="text" inputMode="numeric" value={b.price} onChange={e => updateBundle(i, 'price', e.target.value.replace(/[^0-9.]/g, ''))} className={INPUT + ' text-center'} placeholder="300" />
                    </Field>
                    <button onClick={() => removeBundle(i)} className={`text-slate-500 hover:text-red-400 transition-colors pt-2 ${i === 0 ? 'mt-6' : ''}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={addBundle} className="mx-auto flex items-center justify-center gap-1.5 px-6 py-1.5 border border-dashed border-slate-600 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 text-xs font-medium rounded-lg transition-colors">
                <Plus className="w-3.5 h-3.5" /> {t('coaches.profile.addBundle')}
              </button>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving || !canSave} className={SAVE_BTN}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('coaches.profile.saveInfo')}
          </button>

        </div>
      </div>
    </PanelShell>
  );
}

const INPUT = 'w-full bg-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-blue-500';
const SAVE_BTN = 'w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  if (!label) return <div>{children}</div>;
  return (
    <div>
      <label className="block text-sm text-slate-300 font-medium mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-sm text-slate-300 font-medium mb-1">{label}</span>
      <div className="w-full bg-slate-700/50 text-slate-100 text-sm rounded-lg px-3 py-2 border border-slate-600/50">{value}</div>
    </div>
  );
}
