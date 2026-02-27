// Onboarding overlay — 5-slide intro with word-by-word text reveal
// Shown after the user clicks "Continue" while data loads via SSE

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
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

  const skipToEnd = () => setVisibleCount(words.length);

  return { words, visibleCount, allVisible, skipToEnd };
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

function OverlayLanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="relative flex bg-slate-700 rounded-md p-0.5">
      <div
        className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-slate-500 rounded transition-transform duration-200"
        style={{ transform: language === 'en' ? 'translateX(0)' : 'translateX(100%)' }}
      />
      <button
        onClick={() => setLanguage('en')}
        className={`relative z-10 px-2 py-1 text-xs font-medium rounded transition-colors ${language === 'en' ? 'text-white' : 'text-slate-400'}`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage('fr')}
        className={`relative z-10 px-2 py-1 text-xs font-medium rounded transition-colors ${language === 'fr' ? 'text-white' : 'text-slate-400'}`}
      >
        FR
      </button>
    </div>
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

function EloCard({ value, selected, onClick, current }: {
  value: number;
  selected?: boolean;
  onClick?: () => void;
  current?: boolean;
}) {
  if (current) {
    return (
      <div className="px-5 py-3 rounded-xl border-2 border-green-500 bg-green-500/10 text-white font-semibold text-lg">
        {value}
      </div>
    );
  }
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

function EloTimeline({ currentElo, goalElo }: { currentElo: number; goalElo: number }) {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonth = `${months[now.getMonth()]} ${now.getFullYear()}`;
  const target = new Date(now.getFullYear(), now.getMonth() + 3, 1);
  const targetMonth = `${months[target.getMonth()]} ${target.getFullYear()}`;

  return (
    <div className="flex items-center gap-3 w-full max-w-sm mx-auto">
      <div className="text-center flex-shrink-0">
        <p className="text-green-400 font-bold text-lg">{currentElo}</p>
        <p className="text-slate-500 text-xs">{currentMonth}</p>
      </div>
      <div className="flex-1 relative h-px bg-slate-600">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-blue-400" />
      </div>
      <div className="text-center flex-shrink-0">
        <p className="text-blue-400 font-bold text-lg">{goalElo}</p>
        <p className="text-slate-500 text-xs">{targetMonth}</p>
      </div>
    </div>
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
  const { t } = useLanguage();
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

  const timeClassLabel = selectedTimeClass === 'blitz' ? 'Blitz' : t('chess.rapid');

  const slide3Text = currentElo
    ? t('chess.ob.currentElo').replace('{timeClass}', timeClassLabel)
    : t('chess.ob.unrated').replace('{timeClass}', timeClassLabel);

  const slide0 = useWordReveal(t('chess.ob.slide0'), currentSlide === 0);
  const slide1 = useWordReveal(t('chess.ob.slide1'), currentSlide === 1);
  const slide2 = useWordReveal(t('chess.ob.slide2'), currentSlide === 2);
  const slide3 = useWordReveal(slide3Text, currentSlide === 3);
  const slide4 = useWordReveal(t('chess.ob.conclusion'), currentSlide === 4 && !slidesComplete);

  const handleNext = () => setCurrentSlide(prev => prev + 1);

  const handleFinish = useCallback(() => {
    setSlidesComplete(true);
  }, []);

  const handleGoalSelect = (value: number) => {
    setSelectedGoal(value);
    saveChessPrefs({
      elo_goal: value,
      elo_goal_start_elo: currentElo ?? null,
      elo_goal_start_date: new Date().toISOString().slice(0, 10),
      elo_goal_months: 3,
    });
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
      {/* Language toggle — top right */}
      <div className="absolute top-4 right-4">
        <OverlayLanguageToggle />
      </div>

      <div className="max-w-lg mx-auto px-6 text-center">
        {/* Slide 0 — Welcome */}
        {currentSlide === 0 && (() => {
          const splitIdx = slide0.words.findIndex((w, i) => i > 0 && w.endsWith('.'));
          const firstPart = splitIdx >= 0 ? slide0.words.slice(0, splitIdx + 1) : slide0.words;
          const secondPart = splitIdx >= 0 ? slide0.words.slice(splitIdx + 1) : [];
          return (
          <div className="space-y-8">
            <div className="space-y-4 cursor-pointer" onClick={() => !slide0.allVisible && slide0.skipToEnd()}>
              <p className="text-2xl font-semibold text-slate-100 leading-relaxed">
                <WordByWord words={firstPart} visibleCount={slide0.visibleCount} />
              </p>
              {secondPart.length > 0 && (
                <p className="text-xl text-slate-300 leading-relaxed">
                  <WordByWord words={secondPart} visibleCount={Math.max(0, slide0.visibleCount - firstPart.length)} />
                </p>
              )}
            </div>
            <button
              onClick={handleNext}
              className={`px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all duration-300 ${
                slide0.allVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
            >
              {t('chess.ob.next')}
            </button>
          </div>
          );
        })()}

        {/* Slide 1 — What we look at */}
        {currentSlide === 1 && (
          <div className="space-y-8">
            <p className="text-xl text-slate-200 leading-relaxed cursor-pointer" onClick={() => !slide1.allVisible && slide1.skipToEnd()}>
              <WordByWord words={slide1.words} visibleCount={slide1.visibleCount} />
            </p>
            <button
              onClick={handleNext}
              className={`px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all duration-300 ${
                slide1.allVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
            >
              {t('chess.ob.next')}
            </button>
          </div>
        )}

        {/* Slide 2 — Time class preference */}
        {currentSlide === 2 && (
          <div className="space-y-8">
            <p className="text-xl text-slate-200 leading-relaxed cursor-pointer" onClick={() => !slide2.allVisible && slide2.skipToEnd()}>
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
              {t('chess.ob.next')}
            </button>
          </div>
        )}

        {/* Slide 3 — Current elo + goal selection */}
        {currentSlide === 3 && (
          <div className="space-y-6">
            <p className="text-xl text-slate-200 leading-relaxed cursor-pointer" onClick={() => !slide3.allVisible && slide3.skipToEnd()}>
              <WordByWord words={slide3.words} visibleCount={slide3.visibleCount} />
            </p>

            {currentElo && (
              <div
                className={`transition-all duration-500 ${
                  slide3.allVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                }`}
              >
                {/* Current elo card */}
                <div className="flex justify-center mb-6">
                  <EloCard value={currentElo} current />
                </div>

                {/* Goal label */}
                <p className="text-slate-400 text-sm mb-3">{t('chess.ob.goalPrompt')}</p>

                {/* Goal cards */}
                <div className="flex gap-3 justify-center flex-wrap mb-6">
                  {eloGoals.map(goal => (
                    <EloCard
                      key={goal}
                      value={goal}
                      selected={selectedGoal === goal}
                      onClick={() => handleGoalSelect(goal)}
                    />
                  ))}
                </div>

                {/* Timeline — appears when a goal is selected */}
                {selectedGoal && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <EloTimeline currentElo={currentElo} goalElo={selectedGoal} />
                  </div>
                )}
              </div>
            )}

            {/* Unrated fallback */}
            {!currentElo && (
              <p
                className={`text-slate-400 text-sm transition-all duration-500 ${
                  slide3.allVisible ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {t('chess.ob.noRating').replace('{timeClass}', timeClassLabel.toLowerCase())}
              </p>
            )}

            <button
              onClick={handleNext}
              disabled={!!currentElo && !selectedGoal}
              className={`px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all duration-300 ${
                slide3.allVisible && (selectedGoal || !currentElo)
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
            >
              {t('chess.ob.next')}
            </button>
          </div>
        )}

        {/* Slide 4 — Conclusion */}
        {currentSlide === 4 && !slidesComplete && (
          <div className="space-y-8">
            <p className="text-xl text-slate-200 leading-relaxed cursor-pointer" onClick={() => !slide4.allVisible && slide4.skipToEnd()}>
              <WordByWord words={slide4.words} visibleCount={slide4.visibleCount} />
            </p>
            <button
              onClick={handleFinish}
              className={`px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all duration-300 text-lg ${
                slide4.allVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
            >
              {t('chess.ob.letsGo')}
            </button>
          </div>
        )}

        {/* Waiting for data after slides are done */}
        {slidesComplete && loading && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
            <p className="text-lg text-slate-300">{t('chess.ob.almostReady')}</p>
            {progress && !progress.cached && progress.month && (
              <p className="text-sm text-slate-500">
                {t('chess.ob.processing').replace('{month}', progress.month)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
