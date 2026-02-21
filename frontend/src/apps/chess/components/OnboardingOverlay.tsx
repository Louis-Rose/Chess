// Onboarding overlay — 6-slide intro with word-by-word text reveal
// Shown after the user clicks "Continue" while data loads via SSE

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useChessData } from '../contexts/ChessDataContext';
import { saveChessPrefs } from '../utils/constants';
import { Loader2, Clock, Zap } from 'lucide-react';

const WORD_INTERVAL_MS = 60;

function useWordReveal(text: string, active: boolean) {
  const words = text.split(' ');
  const [visibleCount, setVisibleCount] = useState(0);
  const allVisible = visibleCount >= words.length;

  useEffect(() => {
    if (!active) {
      setVisibleCount(0);
      return;
    }
    setVisibleCount(0);
    const interval = setInterval(() => {
      setVisibleCount(prev => {
        if (prev >= words.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, WORD_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [active, text]); // eslint-disable-line react-hooks/exhaustive-deps

  return { words, visibleCount, allVisible };
}

function WordByWord({ words, visibleCount }: { words: string[]; visibleCount: number }) {
  return (
    <span>
      {words.map((word, i) => (
        <span
          key={i}
          className={`transition-opacity duration-200 ${
            i < visibleCount ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {word}{' '}
        </span>
      ))}
    </span>
  );
}

function TimeClassCard({ label, sublabel, icon: Icon, selected, onClick }: {
  label: string;
  sublabel: string;
  icon: typeof Clock;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-36 py-6 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-2 ${
        selected
          ? 'border-blue-500 bg-blue-500/10 text-white'
          : 'border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500'
      }`}
    >
      <Icon className="w-8 h-8" />
      <span className="font-semibold text-lg">{label}</span>
      <span className="text-sm opacity-70">{sublabel}</span>
    </button>
  );
}

function EloGoalCard({ value, selected, onClick }: {
  value: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-3 rounded-xl border-2 transition-all duration-200 font-semibold text-lg ${
        selected
          ? 'border-blue-500 bg-blue-500/10 text-white'
          : 'border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500'
      }`}
    >
      {value}
    </button>
  );
}

function generateEloGoals(currentElo: number): number[] {
  const base = Math.ceil(currentElo / 50) * 50;
  const start = base <= currentElo ? base + 50 : base;
  return Array.from({ length: 5 }, (_, i) => start + i * 50);
}

interface OnboardingOverlayProps {
  onDone: () => void;
}

export function OnboardingOverlay({ onDone }: OnboardingOverlayProps) {
  const { loading, progress, selectedTimeClass, handleTimeClassChange, playerInfo } = useChessData();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slidesComplete, setSlidesComplete] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<number | null>(null);

  // Derive current elo from playerInfo based on selected time class
  const currentElo = selectedTimeClass === 'blitz'
    ? playerInfo?.blitz_rating
    : playerInfo?.rapid_rating;

  const eloGoals = useMemo(
    () => currentElo ? generateEloGoals(currentElo) : [],
    [currentElo]
  );

  const timeClassLabel = selectedTimeClass === 'blitz' ? 'Blitz' : 'Rapid';

  // Build slide 3 text dynamically
  const slide3Text = currentElo
    ? `Your current ${timeClassLabel} elo is: ${currentElo}`
    : `Your current ${timeClassLabel} elo is: unrated`;

  const slide0 = useWordReveal(
    "Welcome to LUMNA. We analyze your games to find patterns in how you play, what helps you win, and what doesn't.",
    currentSlide === 0
  );
  const slide1 = useWordReveal(
    "We analyze your game volume, frequency, and daily playing patterns, including whether you take breaks or play back-to-back. By evaluating your full Chess.com history, we provide a comprehensive look at your playing habits.",
    currentSlide === 1
  );
  const slide2 = useWordReveal(
    "One last thing, which time control do you prefer?",
    currentSlide === 2
  );
  const slide3 = useWordReveal(slide3Text, currentSlide === 3);
  const slide4 = useWordReveal(
    "What's your elo goal for the next 3 months?",
    currentSlide === 4
  );
  const slide5 = useWordReveal(
    "You're all set. Let's see what your games reveal.",
    currentSlide === 5 && !slidesComplete
  );

  const handleNext = () => setCurrentSlide(prev => prev + 1);

  const handleFinish = useCallback(() => {
    setSlidesComplete(true);
  }, []);

  const handleGoalSelect = (value: number) => {
    setSelectedGoal(value);
    saveChessPrefs({ elo_goal: value });
  };

  // When slides are done and loading is done, fade out
  useEffect(() => {
    if (slidesComplete && !loading) {
      setFadeOut(true);
      const timer = setTimeout(onDone, 500);
      return () => clearTimeout(timer);
    }
  }, [slidesComplete, loading, onDone]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm transition-opacity duration-500 ${
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="max-w-lg mx-auto px-6 text-center">
        {/* Slide 0 — Welcome */}
        {currentSlide === 0 && (
          <div className="space-y-8">
            <p className="text-xl text-slate-200 leading-relaxed">
              <WordByWord words={slide0.words} visibleCount={slide0.visibleCount} />
            </p>
            <button
              onClick={handleNext}
              className={`px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all duration-300 ${
                slide0.allVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
            >
              Next
            </button>
          </div>
        )}

        {/* Slide 1 — What we look at */}
        {currentSlide === 1 && (
          <div className="space-y-8">
            <p className="text-xl text-slate-200 leading-relaxed">
              <WordByWord words={slide1.words} visibleCount={slide1.visibleCount} />
            </p>
            <button
              onClick={handleNext}
              className={`px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all duration-300 ${
                slide1.allVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
            >
              Next
            </button>
          </div>
        )}

        {/* Slide 2 — Time class preference */}
        {currentSlide === 2 && (
          <div className="space-y-8">
            <p className="text-xl text-slate-200 leading-relaxed">
              <WordByWord words={slide2.words} visibleCount={slide2.visibleCount} />
            </p>
            <div
              className={`flex gap-4 justify-center transition-all duration-500 ${
                slide2.allVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
              }`}
            >
              <TimeClassCard
                label="Rapid"
                sublabel="10+ min"
                icon={Clock}
                selected={selectedTimeClass === 'rapid'}
                onClick={() => handleTimeClassChange('rapid')}
              />
              <TimeClassCard
                label="Blitz"
                sublabel="3-5 min"
                icon={Zap}
                selected={selectedTimeClass === 'blitz'}
                onClick={() => handleTimeClassChange('blitz')}
              />
            </div>
            <button
              onClick={handleNext}
              className={`px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all duration-300 ${
                slide2.allVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
            >
              Next
            </button>
          </div>
        )}

        {/* Slide 3 — Current elo */}
        {currentSlide === 3 && (
          <div className="space-y-8">
            <p className="text-xl text-slate-200 leading-relaxed">
              <WordByWord words={slide3.words} visibleCount={slide3.visibleCount} />
            </p>
            <button
              onClick={handleNext}
              className={`px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all duration-300 ${
                slide3.allVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
            >
              Next
            </button>
          </div>
        )}

        {/* Slide 4 — Elo goal */}
        {currentSlide === 4 && (
          <div className="space-y-8">
            <p className="text-xl text-slate-200 leading-relaxed">
              <WordByWord words={slide4.words} visibleCount={slide4.visibleCount} />
            </p>
            {eloGoals.length > 0 ? (
              <div
                className={`flex gap-3 justify-center flex-wrap transition-all duration-500 ${
                  slide4.allVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                }`}
              >
                {eloGoals.map(goal => (
                  <EloGoalCard
                    key={goal}
                    value={goal}
                    selected={selectedGoal === goal}
                    onClick={() => handleGoalSelect(goal)}
                  />
                ))}
              </div>
            ) : (
              <p
                className={`text-slate-400 transition-all duration-500 ${
                  slide4.allVisible ? 'opacity-100' : 'opacity-0'
                }`}
              >
                No rating data available to set a goal.
              </p>
            )}
            <button
              onClick={handleNext}
              disabled={!selectedGoal && eloGoals.length > 0}
              className={`px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all duration-300 ${
                slide4.allVisible && (selectedGoal || eloGoals.length === 0)
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
            >
              Next
            </button>
          </div>
        )}

        {/* Slide 5 — Conclusion */}
        {currentSlide === 5 && !slidesComplete && (
          <div className="space-y-8">
            <p className="text-xl text-slate-200 leading-relaxed">
              <WordByWord words={slide5.words} visibleCount={slide5.visibleCount} />
            </p>
            <button
              onClick={handleFinish}
              className={`px-8 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all duration-300 text-lg ${
                slide5.allVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
            >
              Let's go
            </button>
          </div>
        )}

        {/* Waiting for data after slides are done */}
        {slidesComplete && loading && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
            <p className="text-lg text-slate-300">Almost ready...</p>
            {progress && !progress.cached && progress.month && (
              <p className="text-sm text-slate-500">
                Processing {progress.month}...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
