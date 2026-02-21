// Onboarding overlay — 3-slide intro with word-by-word text reveal
// Shown after the user clicks "Continue" while data loads via SSE

import { useState, useEffect, useCallback } from 'react';
import { useChessData } from '../contexts/ChessDataContext';
import { Loader2, Clock, Zap } from 'lucide-react';

const SLIDES_TEXT = [
  "Welcome to LUMNA. We analyze your games to find patterns in how you play, what helps you win, and what doesn't.",
  "We look at your games volume and frequency, when you play during the day, whether you take breaks during games or play back-to-back, and much more. Everything is computed from your Chess.com game history.",
  "One last thing, which time control do you prefer?",
];

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

interface OnboardingOverlayProps {
  onDone: () => void;
}

export function OnboardingOverlay({ onDone }: OnboardingOverlayProps) {
  const { loading, progress, selectedTimeClass, handleTimeClassChange } = useChessData();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slidesComplete, setSlidesComplete] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const slide0 = useWordReveal(SLIDES_TEXT[0], currentSlide === 0);
  const slide1 = useWordReveal(SLIDES_TEXT[1], currentSlide === 1);
  const slide2 = useWordReveal(SLIDES_TEXT[2], currentSlide === 2 && !slidesComplete);

  const handleNext = () => setCurrentSlide(prev => prev + 1);

  const handleFinish = useCallback(() => {
    setSlidesComplete(true);
  }, []);

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
        {currentSlide === 2 && !slidesComplete && (
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
              onClick={handleFinish}
              className={`px-8 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all duration-300 text-lg ${
                slide2.allVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
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
