import { useState, useMemo } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { btnPrimary, BTN_GHOST } from './PanelShell';
import { CITY_TIMEZONES, getTimezoneForCity, getTimezoneAbbr, getPhonePrefixForCity } from '../utils/cities';

export const STUDENT_SOURCES = ['chess.com', 'lichess', 'superprof', 'my website'] as const;

export interface StudentFormData {
  student_name: string;
  email: string;
  phone_number: string;
  city: string;
  timezone: string;
  source: string;
  chesscom_username: string;
  lichess_username: string;
}

export const EMPTY_STUDENT_FORM: StudentFormData = {
  student_name: '',
  email: '',
  phone_number: '',
  city: '',
  timezone: 'UTC',
  source: '',
  chesscom_username: '',
  lichess_username: '',
};

const input = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors';
const labelCls = 'text-xs font-medium text-slate-400 mb-1';

export function StudentForm({ initial, onSave, onCancel, saving }: {
  initial: StudentFormData;
  onSave: (data: StudentFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState(initial);
  const [citySearch, setCitySearch] = useState(initial.city || '');
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  const cityMatches = useMemo(() => {
    if (!showCityDropdown || !citySearch) return [];
    const q = citySearch.toLowerCase();
    return CITY_TIMEZONES.filter(([c]) => c.toLowerCase().includes(q)).slice(0, 6);
  }, [citySearch, showCityDropdown]);

  const selectCity = (name: string) => {
    setCitySearch(name);
    setShowCityDropdown(false);
    const tz = getTimezoneForCity(name);
    const prefix = getPhonePrefixForCity(name);
    setForm(f => ({
      ...f,
      city: name,
      timezone: tz || 'UTC',
      phone_number: !f.phone_number ? prefix + ' ' : f.phone_number,
    }));
  };

  const cityTimezone = form.city ? getTimezoneForCity(form.city) : '';
  const tzAbbr = cityTimezone ? getTimezoneAbbr(cityTimezone) : '';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3 max-w-sm mx-auto">
      <div>
        <div className={labelCls}>{t('coaches.students.name')} *</div>
        <input className={input} value={form.student_name} onChange={e => setForm({ ...form, student_name: e.target.value })} placeholder={t('coaches.students.name')} />
      </div>
      <div>
        <div className={labelCls}>{t('coaches.students.city')}</div>
        <div className="relative">
          <input
            value={form.city && !showCityDropdown ? `${form.city}${tzAbbr ? ` (${tzAbbr})` : ''}` : citySearch}
            onChange={e => { setCitySearch(e.target.value); setForm({ ...form, city: '', timezone: 'UTC' }); setShowCityDropdown(true); }}
            onFocus={() => { setCitySearch(form.city || citySearch); setShowCityDropdown(true); }}
            onBlur={() => setTimeout(() => setShowCityDropdown(false), 200)}
            className={input}
            placeholder="Paris, London, New York..."
          />
          {cityMatches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {cityMatches.map(([name, tz, flag]) => (
                <button key={name} onMouseDown={() => selectCity(name)} className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-2">
                  <span>{flag}</span>
                  <span className="flex-1">{name}</span>
                  <span className="text-slate-400 text-xs">({getTimezoneAbbr(tz)})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div>
        <div className={labelCls}>{t('coaches.students.email')}</div>
        <input type="email" className={input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="student@email.com" />
      </div>
      <div>
        <div className={labelCls}>{t('coaches.students.phone')}</div>
        <input type="tel" className={input} value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value })} placeholder="+33 6 12 34 56 78" />
      </div>
      <div>
        <div className={labelCls}>{t('coaches.packs.source')}</div>
        <select className={input} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
          <option value=""></option>
          {STUDENT_SOURCES.map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>
      {form.source === 'chess.com' && (
        <div>
          <div className={labelCls}>Chess.com username</div>
          <input className={input} value={form.chesscom_username} onChange={e => setForm({ ...form, chesscom_username: e.target.value })} placeholder="e.g. MagnusCarlsen" />
        </div>
      )}
      {form.source === 'lichess' && (
        <div>
          <div className={labelCls}>Lichess username</div>
          <input className={input} value={form.lichess_username} onChange={e => setForm({ ...form, lichess_username: e.target.value })} placeholder="e.g. DrNykterstein" />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-center gap-3 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={!form.student_name.trim() || saving}
          className={btnPrimary('purple')}
        >
          {saving ? '...' : t('coaches.students.save')}
        </button>
        <button onClick={onCancel} className={BTN_GHOST}>
          {t('coaches.students.cancel')}
        </button>
      </div>
    </div>
  );
}
