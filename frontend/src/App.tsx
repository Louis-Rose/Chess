import { useState } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { Search, Loader2, BarChart3, TrendingUp } from 'lucide-react';

type PanelType = 'my-data' | 'improve';

// --- Types ---
interface PlayerData {
  name: string;
  username: string;
  avatar: string | null;
  followers: number;
  joined: number; // Unix timestamp
}

interface HistoryData {
  year: number;
  week: number;
  games_played: number;
}

interface EloData {
  year: number;
  week: number;
  elo: number;
}

interface OpeningData {
  opening: string;
  games: number;
  win_rate: number;
  ci_lower: number;
  ci_upper: number;
}

interface ApiResponse {
  player: PlayerData;
  time_class: string;
  history: HistoryData[];
  elo_history: EloData[];
  total_games: number;
  openings: {
    white: OpeningData[];
    black: OpeningData[];
  };
}

type TimeClass = 'rapid' | 'blitz';

interface VideoData {
  video_id: string;
  title: string;
  channel_title: string;
  thumbnail: string;
  channel_thumbnail: string;
  published_at: string;
  view_count: number;
  subscriber_count: number;
  url: string;
}

// --- Shared Helpers ---
const formatMonth = (date: Date) => {
  const fullMonth = date.toLocaleString('en-US', { month: 'long' });
  // 3-letter months (May): no period
  // 4-letter months (June, July): show all 4 letters, no period
  // Others: 3-letter abbreviation with period
  if (fullMonth.length <= 3) return fullMonth;
  if (fullMonth.length === 4) return fullMonth;
  return fullMonth.slice(0, 3) + '.';
};

const formatNumber = (num: number) => {
  // European formatting with space as thousand separator
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const formatJoinedDate = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  const month = formatMonth(date);
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
};

const getBarColor = (winRate: number) => {
  if (winRate >= 55) return "#4ade80"; // Green
  if (winRate >= 45) return "#facc15"; // Yellow
  return "#f87171"; // Red
};

// Helper to format ISO week to "Aug. W2" (week of month based on first Monday)
const formatWeekYear = (year: number, isoWeek: number) => {
  // Get the Monday of this ISO week
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setDate(jan4.getDate() - dayOfWeek + 1);

  const weekMonday = new Date(firstMonday);
  weekMonday.setDate(firstMonday.getDate() + (isoWeek - 1) * 7);

  // Get month name using our formatter
  const monthName = formatMonth(weekMonday);

  // Find the first Monday of this month
  const firstOfMonth = new Date(weekMonday.getFullYear(), weekMonday.getMonth(), 1);
  const firstMondayOfMonth = new Date(firstOfMonth);
  const dow = firstOfMonth.getDay();
  const daysUntilMonday = dow === 0 ? 1 : (dow === 1 ? 0 : 8 - dow);
  firstMondayOfMonth.setDate(1 + daysUntilMonday);

  // Calculate week of month
  const diffDays = Math.floor((weekMonday.getTime() - firstMondayOfMonth.getTime()) / (1000 * 60 * 60 * 24));
  const weekOfMonth = Math.floor(diffDays / 7) + 1;

  const yearShort = weekMonday.getFullYear().toString().slice(-2);
  return `W${weekOfMonth} ${monthName} ${yearShort}`;
};

function App() {
  const [username, setUsername] = useState('');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activePanel, setActivePanel] = useState<PanelType>('my-data');
  const [selectedOpening, setSelectedOpening] = useState<string>('');
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState('');
  const [selectedTimeClass, setSelectedTimeClass] = useState<TimeClass>('rapid');

  const fetchVideos = async (opening: string, side: string) => {
    setVideosLoading(true);
    setVideosError('');
    setVideos([]);

    try {
      const response = await axios.get(`/api/youtube-videos?opening=${encodeURIComponent(opening)}&side=${encodeURIComponent(side)}`);
      setVideos(response.data.videos);
    } catch (err) {
      setVideosError('Failed to fetch videos. YouTube API may not be configured.');
      console.error(err);
    } finally {
      setVideosLoading(false);
    }
  };

  const handleOpeningSelect = (value: string) => {
    setSelectedOpening(value);
    if (value) {
      const [opening, side] = value.split('-');
      fetchVideos(opening, side);
    } else {
      setVideos([]);
    }
  };

  const fetchData = async (e?: React.FormEvent, timeClass?: TimeClass) => {
    if (e) e.preventDefault();
    const usernameToFetch = username;
    const timeClassToFetch = timeClass || selectedTimeClass;

    if (!usernameToFetch) return;

    setLoading(true);
    setError('');
    setData(null);

    try {
      const response = await axios.get(`/api/stats?username=${usernameToFetch}&time_class=${timeClassToFetch}`);
      setData(response.data);
    } catch (err) {
      setError('Failed to fetch data. Username might not exist or API is down.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeClassChange = (newTimeClass: TimeClass) => {
    setSelectedTimeClass(newTimeClass);
    if (data) {
      fetchData(undefined, newTimeClass);
    }
  };

  // 1. Pre-process the history data to include the label directly
  // This fixes the "Index vs Data" mismatch ensuring 100% sync
  const processedHistory = data?.history.map(item => ({
    ...item,
    // Create a specific key for the X-Axis to use
    periodLabel: formatWeekYear(item.year, item.week)
  }));

  // 2. Pre-process the Elo history data
  const processedEloHistory = data?.elo_history.map(item => ({
    ...item,
    periodLabel: formatWeekYear(item.year, item.week)
  }));

  // 3. Get all openings for dropdown
  const allOpenings = data ? [
    ...data.openings.white.map(o => ({ ...o, side: 'White' as const })),
    ...data.openings.black.map(o => ({ ...o, side: 'Black' as const }))
  ] : [];

  return (
    <div className="min-h-screen bg-slate-800 font-sans text-slate-800 flex">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 min-h-screen p-4 flex flex-col gap-2">
        <h1 className="text-xl font-bold text-slate-100 mb-6 px-2">Chess Stats</h1>

        <button
          onClick={() => setActivePanel('my-data')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
            activePanel === 'my-data'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          My Data
        </button>

        <button
          onClick={() => setActivePanel('improve')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
            activePanel === 'improve'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <TrendingUp className="w-5 h-5" />
          Improve
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-8">

          {/* Header with search - always visible */}
          <div className="text-center space-y-6">
            <h1 className="text-4xl font-bold text-slate-100">Analyze Your Chess Data</h1>

            <form onSubmit={fetchData} className="flex justify-center gap-2">
              <input
                type="text"
                placeholder="Enter chess.com username"
                className="bg-white text-slate-900 placeholder:text-slate-400 px-4 py-2 border border-slate-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />}
                Fetch data
              </button>
            </form>
            {error && <p className="text-red-500 bg-red-100 py-2 px-4 rounded inline-block">{error}</p>}
          </div>

          {/* ========== IMPROVE PANEL ========== */}
          {activePanel === 'improve' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">

              {/* Player Data Section */}
              {data && (
                <>
                  <div className="flex justify-center mb-8 mt-12">
                    <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
                  </div>

                  <div className="flex flex-col items-center gap-4 mb-6">
                    <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                      Player Data
                    </h2>
                  </div>

                  <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm max-w-md mx-auto mb-8">
                    <div className="flex items-center gap-6">
                      {data.player.avatar ? (
                        <img
                          src={data.player.avatar}
                          alt={`${data.player.username}'s avatar`}
                          className="w-24 h-24 rounded-full border-2 border-slate-300"
                        />
                      ) : (
                        <div className="w-24 h-24 rounded-full bg-slate-300 flex items-center justify-center text-slate-500 text-2xl font-bold">
                          {data.player.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="space-y-1">
                        <h3 className="text-xl font-bold text-slate-800">{data.player.name}</h3>
                        <p className="text-slate-600">@{data.player.username}</p>
                        <p className="text-slate-600">{formatNumber(data.player.followers)} followers</p>
                        <p className="text-slate-500 text-sm">Joined {formatJoinedDate(data.player.joined)}</p>
                        <p className="text-slate-600 mt-2">Total games played ({data.time_class}): <span className="font-bold">{formatNumber(data.total_games)}</span></p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-center mb-8 mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              <div className="flex flex-col items-center gap-4 mb-6">
                <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                  Improve Your Game
                </h2>
              </div>

              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm max-w-2xl mx-auto">
                <label className="block text-slate-800 font-bold mb-3">Select an Opening</label>
                <select
                  value={selectedOpening}
                  onChange={(e) => handleOpeningSelect(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Choose an opening --</option>
                  {allOpenings.map((opening, idx) => (
                    <option key={idx} value={`${opening.opening}-${opening.side}`}>
                      {opening.opening} ({opening.side})
                    </option>
                  ))}
                </select>

                {!data && (
                  <p className="text-slate-500 italic mt-4">
                    Fetch your data first to see available openings.
                  </p>
                )}
              </div>

              {/* Videos Section */}
              {selectedOpening && (
                <div className="mt-8">
                  <h3 className="text-2xl font-bold text-slate-100 text-center mb-6">
                    Recommended Videos
                  </h3>

                  {videosLoading && (
                    <div className="flex justify-center items-center py-12">
                      <Loader2 className="animate-spin w-8 h-8 text-slate-300" />
                      <span className="ml-3 text-slate-300">Loading videos...</span>
                    </div>
                  )}

                  {videosError && (
                    <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg max-w-2xl mx-auto">
                      {videosError}
                    </div>
                  )}

                  {!videosLoading && !videosError && videos.length === 0 && (
                    <p className="text-slate-400 text-center italic">
                      No videos found for this opening.
                    </p>
                  )}

                  {!videosLoading && videos.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                      {videos.map((video) => (
                        <a
                          key={video.video_id}
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-slate-100 border border-slate-300 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
                        >
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="w-full h-40 object-cover"
                          />
                          <div className="p-4">
                            <h4 className="font-bold text-slate-800 text-sm line-clamp-2 mb-3">
                              {video.title}
                            </h4>
                            <div className="flex items-center gap-3">
                              {video.channel_thumbnail && (
                                <img
                                  src={video.channel_thumbnail}
                                  alt={video.channel_title}
                                  className="w-8 h-8 rounded-full"
                                />
                              )}
                              <div>
                                <p className="text-slate-700 text-sm font-medium">{video.channel_title}</p>
                                <div className="flex gap-3 text-xs text-slate-500">
                                  <span>{formatNumber(video.view_count)} views</span>
                                  <span>{formatNumber(video.subscriber_count)} subs</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========== MY DATA PANEL ========== */}
          {activePanel === 'my-data' && data && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">

            {/* ========== PLAYER DATA SECTION ========== */}
            <div className="flex justify-center mb-8 mt-20">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            <div className="flex flex-col items-center gap-4 mb-6">
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                Player Data
              </h2>
            </div>

            <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm max-w-md mx-auto">
              <div className="flex items-center gap-6">
                {data.player.avatar ? (
                  <img
                    src={data.player.avatar}
                    alt={`${data.player.username}'s avatar`}
                    className="w-24 h-24 rounded-full border-2 border-slate-300"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-slate-300 flex items-center justify-center text-slate-500 text-2xl font-bold">
                    {data.player.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-slate-800">{data.player.name}</h3>
                  <p className="text-slate-600">@{data.player.username}</p>
                  <p className="text-slate-600">{formatNumber(data.player.followers)} followers</p>
                  <p className="text-slate-500 text-sm">Joined {formatJoinedDate(data.player.joined)}</p>
                  <p className="text-slate-600 mt-2">Total games played ({data.time_class}): <span className="font-bold">{formatNumber(data.total_games)}</span></p>
                </div>
              </div>
            </div>

            {/* ========== GAME TYPE SELECTOR ========== */}
            <div className="flex justify-center mb-8 mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            <div className="flex flex-col items-center gap-4 mb-6">
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                Game Type
              </h2>
              <div className="bg-slate-100 border border-slate-300 p-4 rounded-xl shadow-sm">
                <select
                  value={selectedTimeClass}
                  onChange={(e) => handleTimeClassChange(e.target.value as TimeClass)}
                  className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="rapid">Rapid</option>
                  <option value="blitz">Blitz</option>
                </select>
              </div>
            </div>

            {/* ========== ELO RATING SECTION ========== */}
            <div className="flex justify-center mb-8 mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            <div className="flex flex-col items-center gap-4 mb-6">
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                Elo Rating
              </h2>
            </div>

            {processedEloHistory && processedEloHistory.length > 0 ? (
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-6 text-slate-800 capitalize">{data.time_class} Rating Over Time</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={processedEloHistory}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ccc" />
                      <XAxis
                        dataKey="periodLabel"
                        stroke="#475569"
                        tick={{fill: '#475569'}}
                        minTickGap={30}
                      />
                      <YAxis
                        stroke="#475569"
                        tick={{fill: '#475569'}}
                        domain={['dataMin - 50', 'dataMax + 50']}
                      />
                      <Tooltip
                        cursor={{stroke: '#94a3b8', strokeWidth: 1}}
                        contentStyle={{ backgroundColor: '#fff', borderColor: '#cbd5e1', color: '#1e293b' }}
                        labelFormatter={(label) => label}
                        formatter={(value) => [formatNumber(value as number), "Elo"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="elo"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: '#3b82f6' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-6 text-slate-800 capitalize">{data.time_class} Rating Over Time</h2>
                <p className="text-slate-500 italic">No {data.time_class} games found.</p>
              </div>
            )}

            {/* ========== ALL GAMES PLAYED SECTION ========== */}
            <div className="flex justify-center mb-8 mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            <div className="flex flex-col items-center gap-4 mb-6">
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                All Games Played
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* History Chart */}
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm lg:col-span-2">
                <h2 className="text-xl font-bold mb-6 text-slate-800">Games Played Per Week</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={processedHistory}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ccc" />
                      <XAxis
                        dataKey="periodLabel"
                        stroke="#475569"
                        tick={{fill: '#475569'}}
                        minTickGap={30}
                      />
                      <YAxis stroke="#475569" tick={{fill: '#475569'}} />
                      <Tooltip
                        cursor={{fill: '#f1f5f9'}}
                        contentStyle={{ backgroundColor: '#fff', borderColor: '#cbd5e1', color: '#1e293b' }}
                        labelFormatter={(label) => label}
                        formatter={(value) => [formatNumber(value as number), "Games Played"]}
                      />
                      <Bar dataKey="games_played" fill="#769656" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Stats below the chart */}
                {(() => {
                  const totalGames = data.history.reduce((sum, week) => sum + week.games_played, 0);
                  const totalDays = data.history.length * 7;
                  const avgPerDay = totalDays > 0 ? (totalGames / totalDays).toFixed(2) : '0';
                  return (
                    <div className="mt-6 flex gap-8 justify-center text-slate-700">
                      <p>Total games played ({data.time_class}): <span className="font-bold">{formatNumber(data.total_games)}</span></p>
                      <p>Avg. games per day: <span className="font-bold">{avgPerDay}</span></p>
                    </div>
                  );
                })()}
              </div>

            {/* SEPARATOR BAR */}
            <div className="lg:col-span-2 flex justify-center mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            {/* Openings Section Header */}
            {/* CHANGED: Removed mt-8, changed mb-2 to mb-6 (spacing below title) */}
            <div className="lg:col-span-2 flex flex-col items-center gap-4 mb-6">
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                Opening Statistics
              </h2>
            </div>

              {/* White Openings */}
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-6 text-slate-800">Openings as White</h2>
                <OpeningsChart data={data.openings.white} />
              </div>

              {/* Black Openings */}
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-6 text-slate-800">Openings as Black</h2>
                <OpeningsChart data={data.openings.black} />
              </div>

            </div>

            {/* SEPARATOR BAR */}
            <div className="lg:col-span-2 flex justify-center mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Sub-component
const OpeningsChart = ({ data }: { data: OpeningData[] }) => {
  if (!data || data.length === 0) return <p className="text-slate-500 italic">No data available.</p>;

  return (
    <div className="h-[500px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ left: 10, right: 30 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#ccc" />
          <XAxis type="number" hide />
          <YAxis 
            type="category" 
            dataKey="opening" 
            width={110} 
            style={{ fontSize: '12px', fontWeight: 600, fill: '#334155' }} 
            interval={0}
          />
          <Tooltip
            cursor={{fill: '#f1f5f9'}}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload;
                return (
                  <div className="bg-white p-3 border border-slate-200 shadow-xl rounded text-sm text-slate-800 z-50">
                    <p className="font-bold text-base mb-1">{d.opening}</p>
                    <p>Games Played: <span className="font-mono">{formatNumber(d.games)}</span></p>
                    <p>Win Rate: <span className="font-mono font-bold" style={{color: getBarColor(d.win_rate)}}>{d.win_rate}%</span></p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="games" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.win_rate)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default App;