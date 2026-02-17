// Rapid / Blitz pill toggle for chess pages

import { useChessData } from '../contexts/ChessDataContext';
import type { TimeClass } from '../utils/types';

const OPTIONS: { value: TimeClass; label: string }[] = [
  { value: 'rapid', label: 'Rapid' },
  { value: 'blitz', label: 'Blitz' },
];

export function TimeClassToggle() {
  const { selectedTimeClass, handleTimeClassChange } = useChessData();

  return (
    <div className="flex justify-center py-3">
      <div className="relative flex bg-slate-700 rounded-lg p-1">
        {/* Sliding background */}
        <div
          className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-slate-500 rounded-md transition-transform duration-200 ease-in-out"
          style={{ transform: selectedTimeClass === 'rapid' ? 'translateX(0)' : 'translateX(100%)' }}
        />
        {OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleTimeClassChange(value)}
            className={`relative z-10 px-5 py-1.5 text-sm font-medium rounded-md transition-colors ${
              selectedTimeClass === value ? 'text-white' : 'text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
