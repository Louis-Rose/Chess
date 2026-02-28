import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ChessCard } from '../components/ChessCard';
import { TimeClassToggle } from '../components/TimeClassToggle';
import { AnalyzedGamesBanner } from '../components/AnalyzedGamesBanner';
import { fetchFideId, fetchFideRating, saveFideId } from '../hooks/api';

interface FideData {
  name: string | null;
  federation: string | null;
  fide_title: string | null;
  classical_rating: number | null;
  rapid_rating: number | null;
  blitz_rating: number | null;
}

function federationToFlag(federation: string | null): string {
  if (!federation) return '';
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

function getRatingForTimeClass(fideData: FideData, timeClass: string): number | null {
  switch (timeClass) {
    case 'rapid': return fideData.rapid_rating;
    case 'blitz': return fideData.blitz_rating;
    case 'bullet': return fideData.blitz_rating; // FIDE has no bullet, show blitz
    default: return fideData.classical_rating;
  }
}

function getTimeClassLabel(timeClass: string): string {
  switch (timeClass) {
    case 'rapid': return 'Rapid';
    case 'blitz': return 'Blitz';
    case 'bullet': return 'Blitz'; // FIDE has no bullet
    default: return 'Classical';
  }
}

export function FidePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { searchedUsername, selectedTimeClass, handleTimeClassChange, loading: dataLoading } = useChessData();

  const [fideId, setFideId] = useState<string | null>(null);
  const [fideData, setFideData] = useState<FideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!searchedUsername) return;
    fetchFideId(searchedUsername).then(id => {
      setFideId(id);
      if (id) {
        fetchRating(id);
      } else {
        setLoading(false);
      }
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
    setInputValue('');
    fetchRating(trimmed);
  };

  const nr = t('chess.fide.notRated');
  const currentRating = fideData ? getRatingForTimeClass(fideData, selectedTimeClass || 'rapid') : null;
  const currentLabel = getTimeClassLabel(selectedTimeClass || 'rapid');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-4xl mx-auto mt-2 space-y-2">
        <h1 className="text-lg font-bold text-slate-100 text-center">{t('chess.welcomeTitle')}</h1>
        <AnalyzedGamesBanner />
        {/* Header with back button + time class toggle */}
        <div className="relative flex items-center justify-center">
          <button
            onClick={() => navigate('/chess')}
            className="absolute left-2 md:left-4 flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-base"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Previous</span>
          </button>
          <TimeClassToggle selected={selectedTimeClass} onChange={handleTimeClassChange} disabled={dataLoading} />
        </div>
        <div className="border-t border-slate-700" />

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !fideId || error || !fideData ? (
          <ChessCard title={t('chess.fide.title')}>
            <div className="flex flex-col items-center gap-4 py-8">
              <img src="/fide-logo.png" alt="FIDE" className="w-16 h-16 rounded-xl object-cover" />
              <p className="text-slate-400 text-center">{t('chess.fide.link')}</p>
              <div className="flex gap-2 w-full max-w-[280px]">
                <input
                  autoFocus
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder={t('chess.fide.enterFideId')}
                  className="flex-1 bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleSave}
                  disabled={!inputValue.trim()}
                  className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {t('chess.fide.save')}
                </button>
              </div>
              {error && <p className="text-sm text-red-400">Invalid FIDE ID — please try again</p>}
            </div>
          </ChessCard>
        ) : (
          <ChessCard
            title={t('chess.fide.title')}
            action={
              <button
                onClick={() => { setEditing(!editing); setInputValue(fideId || ''); }}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
            }
          >
            <div className="py-4">
              {/* Edit inline */}
              {editing && (
                <div className="flex gap-2 justify-center mb-6">
                  <input
                    autoFocus
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    placeholder={t('chess.fide.enterFideId')}
                    className="bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 w-48"
                  />
                  <button
                    onClick={handleSave}
                    disabled={!inputValue.trim()}
                    className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {t('chess.fide.save')}
                  </button>
                </div>
              )}

              {/* Player info */}
              <div className="flex items-center justify-center gap-3 mb-6">
                <span className="text-2xl">{federationToFlag(fideData.federation)}</span>
                <div>
                  <p className="text-lg font-bold text-slate-100">
                    {fideData.fide_title && fideData.fide_title !== 'None' ? `${fideData.fide_title} ` : ''}{fideData.name}
                  </p>
                  <p className="text-sm text-slate-400">{fideData.federation}</p>
                </div>
              </div>

              {/* Single rating for selected time class */}
              <div className="max-w-xs mx-auto">
                <div className="bg-slate-600 rounded-xl p-6 text-center">
                  <p className="text-sm text-slate-400 uppercase tracking-wider mb-2">{currentLabel}</p>
                  <p className="text-4xl font-bold text-cyan-400">{currentRating ?? nr}</p>
                </div>
              </div>
            </div>
          </ChessCard>
        )}
      </div>
    </div>
  );
}
