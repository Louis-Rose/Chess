import { useState, useEffect, useCallback } from 'react';
import { Pencil, X, Plus, UserMinus } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ChessCard } from '../components/ChessCard';
import { CardPageLayout } from '../components/CardPageLayout';
import { fetchFideId, fetchFideRating, saveFideId, fetchFideFriends, addFideFriend, removeFideFriend } from '../hooks/api';

interface FideData {
  name: string | null;
  federation: string | null;
  fide_title: string | null;
  classical_rating: number | null;
  rapid_rating: number | null;
  blitz_rating: number | null;
}

interface FideFriend extends FideData {
  fide_id: string;
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


export function FidePage() {
  const { t } = useLanguage();
  const { searchedUsername, selectedTimeClass } = useChessData();

  const [fideId, setFideId] = useState<string | null>(null);
  const [fideData, setFideData] = useState<FideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(false);

  // Leaderboard state
  const [friends, setFriends] = useState<FideFriend[]>([]);
  const [addingFriend, setAddingFriend] = useState(false);
  const [friendInput, setFriendInput] = useState('');
  const [friendError, setFriendError] = useState(false);
  const [friendLoading, setFriendLoading] = useState(false);

  const loadFriends = useCallback(async () => {
    if (!searchedUsername) return;
    try {
      const data = await fetchFideFriends(searchedUsername);
      setFriends(data);
    } catch {
      // silently fail
    }
  }, [searchedUsername]);

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
    loadFriends();
  }, [searchedUsername, loadFriends]);

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

  const handleAddFriend = async () => {
    const trimmed = friendInput.trim();
    if (!trimmed || !searchedUsername) return;
    setFriendLoading(true);
    setFriendError(false);
    try {
      await addFideFriend(searchedUsername, trimmed);
      setFriendInput('');
      setAddingFriend(false);
      await loadFriends();
    } catch {
      setFriendError(true);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleRemoveFriend = async (friendFideId: string) => {
    if (!searchedUsername) return;
    await removeFideFriend(searchedUsername, friendFideId);
    setFriends(prev => prev.filter(f => f.fide_id !== friendFideId));
  };

  const nr = t('chess.fide.unrated');
  const currentRating = fideData ? getRatingForTimeClass(fideData, selectedTimeClass || 'rapid') : null;

  // Build sorted leaderboard: user + friends
  const timeClass = selectedTimeClass || 'rapid';
  const leaderboardRows: { fide_id: string | null; name: string; federation: string | null; rating: number | null; isUser: boolean }[] = [];

  if (fideData && fideId) {
    leaderboardRows.push({
      fide_id: fideId,
      name: `${fideData.fide_title && fideData.fide_title !== 'None' ? fideData.fide_title + ' ' : ''}${fideData.name || ''}`,
      federation: fideData.federation,
      rating: getRatingForTimeClass(fideData, timeClass),
      isUser: true,
    });
  }

  for (const f of friends) {
    if (f.name) {
      leaderboardRows.push({
        fide_id: f.fide_id,
        name: `${f.fide_title && f.fide_title !== 'None' ? f.fide_title + ' ' : ''}${f.name}`,
        federation: f.federation,
        rating: getRatingForTimeClass(f, timeClass),
        isUser: false,
      });
    }
  }

  // Sort: rated players descending, unrated at bottom
  leaderboardRows.sort((a, b) => {
    if (a.rating != null && b.rating != null) return b.rating - a.rating;
    if (a.rating != null) return -1;
    if (b.rating != null) return 1;
    return 0;
  });

  return (
    <CardPageLayout>
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
        <>
          <ChessCard
            title={t('chess.fide.title')}
            leftAction={
              <button
                onClick={() => { setEditing(!editing); setInputValue(fideId || ''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white border border-white/60 hover:border-white rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                {t('chess.fide.updateId')}
              </button>
            }
          >
            <div className="py-4">
              <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                <div className="bg-slate-600 rounded-xl p-3 flex items-center justify-center gap-3">
                  <span className="text-2xl">{federationToFlag(fideData.federation)}</span>
                  <div>
                    <p className="text-lg font-bold text-slate-100">
                      {fideData.fide_title && fideData.fide_title !== 'None' ? `${fideData.fide_title} ` : ''}{fideData.name}
                    </p>
                    <p className="text-sm text-slate-400">{fideData.federation}</p>
                  </div>
                </div>
                <div className="bg-slate-600 rounded-xl p-3 flex items-center justify-center">
                  <p className="text-3xl font-bold text-cyan-400">{currentRating ?? nr}</p>
                </div>
              </div>
            </div>
          </ChessCard>

          {/* Leaderboard */}
          <ChessCard
            title={t('chess.fide.leaderboard')}
            action={
              <button
                onClick={() => { setAddingFriend(true); setFriendInput(''); setFriendError(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white border border-white/60 hover:border-white rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('chess.fide.addFriend')}
              </button>
            }
          >
            <div className="py-2">
              {leaderboardRows.length === 0 ? (
                <p className="text-slate-400 text-center py-4">{t('chess.fide.link')}</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-slate-400 text-sm border-b border-slate-600">
                      <th className="text-left py-2 px-3 font-medium">{t('chess.fide.name')}</th>
                      <th className="text-right py-2 px-3 font-medium">{t('chess.fide.elo')}</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardRows.map((row, i) => (
                      <tr
                        key={row.fide_id ?? `user-${i}`}
                        className={`border-b border-slate-600/50 last:border-0 group ${row.isUser ? 'bg-slate-600/30' : ''}`}
                      >
                        <td className="py-2.5 px-3">
                          <span className={`text-sm ${row.isUser ? 'font-bold text-cyan-400' : 'text-slate-200'}`}>
                            {federationToFlag(row.federation)} {row.name}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`text-sm font-mono ${row.rating != null ? (row.isUser ? 'text-cyan-400 font-bold' : 'text-slate-200') : 'text-slate-500'}`}>
                            {row.rating ?? nr}
                          </span>
                        </td>
                        <td className="py-2.5 px-1">
                          {!row.isUser && (
                            <button
                              onClick={() => handleRemoveFriend(row.fide_id!)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all"
                              title={t('chess.fide.removeFriend')}
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </ChessCard>
        </>
      )}

      {/* Edit FIDE ID modal */}
      {editing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditing(false)}>
          <div className="bg-slate-800 rounded-xl p-5 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="relative flex items-center justify-center">
              <h2 className="text-lg font-bold text-slate-100">{t('chess.fide.updateId')}</h2>
              <button onClick={() => setEditing(false)} className="absolute right-0 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-2 justify-center">
              <input
                autoFocus
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder={t('chess.fide.enterFideId')}
                className="bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 w-48"
              />
            </div>
            <div className="flex justify-center pt-2">
              <button
                onClick={handleSave}
                disabled={!inputValue.trim()}
                className="px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('chess.fide.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add friend modal */}
      {addingFriend && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setAddingFriend(false)}>
          <div className="bg-slate-800 rounded-xl p-5 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="relative flex items-center justify-center">
              <h2 className="text-lg font-bold text-slate-100">{t('chess.fide.addFriend')}</h2>
              <button onClick={() => setAddingFriend(false)} className="absolute right-0 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-2 justify-center">
              <input
                autoFocus
                type="text"
                value={friendInput}
                onChange={e => { setFriendInput(e.target.value); setFriendError(false); }}
                onKeyDown={e => e.key === 'Enter' && handleAddFriend()}
                placeholder={t('chess.fide.enterFriendId')}
                className="bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 w-48"
              />
            </div>
            {friendError && (
              <p className="text-sm text-red-400 text-center">{t('chess.fide.invalidFideId')}</p>
            )}
            <div className="flex justify-center pt-2">
              <button
                onClick={handleAddFriend}
                disabled={!friendInput.trim() || friendLoading}
                className="px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {friendLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  t('chess.fide.add')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </CardPageLayout>
  );
}
