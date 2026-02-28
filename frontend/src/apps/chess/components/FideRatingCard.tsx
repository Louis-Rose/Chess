import { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useChessData } from '../contexts/ChessDataContext';
import { fetchFideId, fetchFideRating, saveFideId } from '../hooks/api';

interface FideData {
  name: string | null;
  federation: string | null;
  fide_title: string | null;
  classical_rating: number | null;
  rapid_rating: number | null;
  blitz_rating: number | null;
}

// Convert FIDE federation code (e.g. "FRA") to flag emoji
function federationToFlag(federation: string | null): string {
  if (!federation) return '';
  // FIDE uses 3-letter codes; map to 2-letter ISO for flag emoji
  const map: Record<string, string> = {
    FRA: 'FR', USA: 'US', GER: 'DE', ENG: 'GB', RUS: 'RU', ESP: 'ES',
    ITA: 'IT', NED: 'NL', NOR: 'NO', SWE: 'SE', POL: 'PL', CZE: 'CZ',
    HUN: 'HU', ROU: 'RO', UKR: 'UA', GEO: 'GE', ARM: 'AM', AZE: 'AZ',
    IND: 'IN', CHN: 'CN', JPN: 'JP', KOR: 'KR', AUS: 'AU', CAN: 'CA',
    BRA: 'BR', ARG: 'AR', ISR: 'IL', TUR: 'TR', GRE: 'GR', POR: 'PT',
    BEL: 'BE', SUI: 'CH', AUT: 'AT', DEN: 'DK', FIN: 'FI', IRL: 'IE',
    SCO: 'GB', WLS: 'GB', CRO: 'HR', SRB: 'RS', BUL: 'BG', SVK: 'SK',
    SLO: 'SI', BIH: 'BA', MNE: 'ME', MKD: 'MK', ALB: 'AL', LTU: 'LT',
    LAT: 'LV', EST: 'EE', ISL: 'IS', LUX: 'LU', MLT: 'MT', CYP: 'CY',
    MEX: 'MX', COL: 'CO', PER: 'PE', CHI: 'CL', VEN: 'VE', ECU: 'EC',
    URU: 'UY', PAR: 'PY', BOL: 'BO', CUB: 'CU', PHI: 'PH', INA: 'ID',
    MAS: 'MY', SGP: 'SG', VIE: 'VN', THA: 'TH', MYA: 'MM', IRI: 'IR',
    IRQ: 'IQ', UAE: 'AE', QAT: 'QA', KSA: 'SA', EGY: 'EG', RSA: 'ZA',
    NGA: 'NG', KEN: 'KE', TUN: 'TN', MAR: 'MA', ALG: 'DZ', NZL: 'NZ',
    MGL: 'MN', UZB: 'UZ', KAZ: 'KZ', TKM: 'TM', KGZ: 'KG', TJK: 'TJ',
    BAN: 'BD', SRI: 'LK', NEP: 'NP', PAK: 'PK', AFG: 'AF',
  };
  const iso = map[federation.toUpperCase()] || federation.slice(0, 2);
  return String.fromCodePoint(...[...iso.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

export function FideRatingCard() {
  const { t } = useLanguage();
  const { searchedUsername } = useChessData();

  const [fideId, setFideId] = useState<string | null>(null);
  const [fideData, setFideData] = useState<FideData | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(false);

  // Load saved FIDE ID on mount
  useEffect(() => {
    if (!searchedUsername) return;
    fetchFideId(searchedUsername).then(id => {
      setFideId(id);
      if (id) fetchRating(id);
    });
  }, [searchedUsername]);

  const fetchRating = async (id: string) => {
    setLoading(true);
    setError(false);
    try {
      const data = await fetchFideRating(id);
      if (!data.name) {
        setError(true);
        setFideData(null);
      } else {
        setFideData(data);
      }
    } catch {
      setError(true);
      setFideData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !searchedUsername) return;
    await saveFideId(searchedUsername, trimmed);
    setFideId(trimmed);
    setEditing(false);
    fetchRating(trimmed);
  };

  const nr = t('chess.fide.notRated');

  // Editing / input mode
  if (editing || (!fideId && !loading)) {
    return (
      <div
        onClick={() => !editing && setEditing(true)}
        className={`relative bg-slate-800 border border-slate-700 rounded-xl p-5 h-[120px] flex flex-col items-center justify-center hover:border-cyan-500 transition-colors ${editing ? '' : 'cursor-pointer'}`}
      >
        {editing ? (
          <div className="flex flex-col items-center gap-2 w-full">
            <p className="text-sm text-slate-400">{t('chess.fide.enterFideId')}</p>
            <div className="flex gap-2 w-full max-w-[240px]">
              <input
                autoFocus
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="e.g. 560015160"
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={handleSave}
                disabled={!inputValue.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                {t('chess.fide.save')}
              </button>
            </div>
            {error && <p className="text-xs text-red-400">Invalid FIDE ID</p>}
          </div>
        ) : (
          <>
            <div className="w-10 h-10 bg-cyan-700 rounded-lg flex items-center justify-center mb-2">
              <span className="text-lg font-bold text-white">F</span>
            </div>
            <h3 className="text-lg font-bold text-slate-100">{t('chess.fide.title')}</h3>
            <p className="text-sm text-slate-400">{t('chess.fide.link')}</p>
          </>
        )}
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-5 h-[120px] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Display ratings
  return (
    <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-4 h-[120px] flex flex-col justify-center hover:border-cyan-500 transition-colors">
      <button
        onClick={() => { setEditing(true); setInputValue(fideId || ''); }}
        className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition-colors"
      >
        <Pencil className="w-4 h-4" />
      </button>
      {/* Name + federation */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{federationToFlag(fideData?.federation ?? null)}</span>
        <span className="text-sm font-medium text-slate-300 truncate">
          {fideData?.fide_title ? `${fideData.fide_title} ` : ''}{fideData?.name}
        </span>
      </div>
      {/* Ratings row */}
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase">Rapid</p>
          <p className="text-lg font-bold text-cyan-400">{fideData?.rapid_rating ?? nr}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase">Classical</p>
          <p className="text-lg font-bold text-slate-100">{fideData?.classical_rating ?? nr}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase">Blitz</p>
          <p className="text-lg font-bold text-slate-100">{fideData?.blitz_rating ?? nr}</p>
        </div>
      </div>
      {error && <p className="text-xs text-red-400 mt-1">Failed to load ratings</p>}
    </div>
  );
}
