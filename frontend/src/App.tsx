import { useState } from 'react';
import axios from 'axios';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { Search, Loader2 } from 'lucide-react';

// --- Types ---
interface HistoryData {
  year: number;
  week: number;
  games_played: number;
}

interface OpeningData {
  opening: string;
  games: number;
  win_rate: number;
  ci_lower: number;
  ci_upper: number;
}

interface ApiResponse {
  history: HistoryData[];
  openings: {
    white: OpeningData[];
    black: OpeningData[];
  };
}

// --- Shared Helpers ---
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

  // Get month name
  const monthName = weekMonday.toLocaleString('default', { month: 'short' });

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
  return `W${weekOfMonth} ${monthName}. ${yearShort}`;
};

function App() {
  const [username, setUsername] = useState('');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;

    setLoading(true);
    setError('');
    setData(null);

    try {
      const response = await axios.get(`/api/stats?username=${username}`);
      setData(response.data);
    } catch (err) {
      setError('Failed to fetch data. Username might not exist or API is down.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 1. Pre-process the history data to include the label directly
  // This fixes the "Index vs Data" mismatch ensuring 100% sync
  const processedHistory = data?.history.map(item => ({
    ...item,
    // Create a specific key for the X-Axis to use
    periodLabel: formatWeekYear(item.year, item.week)
  }));

  return (
    // HYBRID THEME: Dark Page Background (slate-800), but Dark Text (slate-800) for inside cards
    <div className="min-h-screen bg-slate-800 p-8 font-sans text-slate-800">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
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

        {/* Results Container */}
        {data && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            
            {/* 1. SEPARATOR BAR (Full Width) */}
            <div className="flex justify-center mb-8 mt-20">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            {/* 2. TITLE SECTION (Full Width) */}
            <div className="flex flex-col items-center gap-4 mb-6">
             
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                All Games Played
              </h2>
            </div>

            {/* 3. CHARTS GRID (This is where the grid belongs) */}


            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* History Chart */}
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm lg:col-span-2">
                <h2 className="text-xl font-bold mb-6 text-slate-800">Games Played Per Week</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {/* 2. Use the processed data here */}
                    <BarChart data={processedHistory}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ccc" />
                      
                      {/* 3. Simplifies the XAxis: Just read the label we made! */}
                      <XAxis 
                        dataKey="periodLabel" 
                        stroke="#475569"
                        tick={{fill: '#475569'}}
                        minTickGap={30} // Optional: prevents labels from overlapping
                      />
                      
                      <YAxis stroke="#475569" tick={{fill: '#475569'}} />
                      
                      <Tooltip 
                        cursor={{fill: '#f1f5f9'}}
                        contentStyle={{ backgroundColor: '#fff', borderColor: '#cbd5e1', color: '#1e293b' }}
                        // 4. Tooltip now gets the label automatically from the payload
                        labelFormatter={(label) => label}
                        formatter={(value) => [value, "Games Played"]}
                      />
                      <Bar dataKey="games_played" fill="#769656" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            {/* 1. SEPARATOR BAR */}
            {/* CHANGED: Removed mb-8, changed mt-20 to mt-12 (less space above) */}
            <div className="lg:col-span-2 flex justify-center mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            {/* NEW: Openings Section Header */}
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

            {/* 1. SEPARATOR BAR */}
            {/* CHANGED: Removed mb-8, changed mt-20 to mt-12 (less space above) */}
            <div className="lg:col-span-2 flex justify-center mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>
            
          </div>
        )}
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
                    <p>Games Played: <span className="font-mono">{d.games}</span></p>
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