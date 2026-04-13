import { useState, useEffect } from 'react';
import { Flame, Trophy, Target } from 'lucide-react';
import { getUserStreak } from '../../lib/streaks';

interface StreakDisplayProps {
  userId: string;
  className?: string;
}

export function StreakDisplay({ userId, className = '' }: StreakDisplayProps) {
  const [streak, setStreak] = useState({
    currentStreak: 0,
    longestStreak: 0,
    weekTaskCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showMilestone, setShowMilestone] = useState(false);

  useEffect(() => {
    loadStreak();
  }, [userId]);

  const loadStreak = async () => {
    setLoading(true);
    const data = await getUserStreak(userId);
    setStreak({
      currentStreak: data.currentStreak,
      longestStreak: data.longestStreak,
      weekTaskCount: data.weekTaskCount,
    });
    
    // Show milestone if streak is 7 or more
    if (data.currentStreak >= 7) {
      setShowMilestone(true);
      setTimeout(() => setShowMilestone(false), 5000);
    }
    
    setLoading(false);
  };

  const getStreakColor = () => {
    if (streak.currentStreak >= 7) return 'text-yellow-500';
    if (streak.currentStreak >= 3) return 'text-orange-500';
    return 'text-red-500';
  };

  const getStreakMessage = () => {
    if (streak.currentStreak === 0) return 'Start your streak today!';
    if (streak.currentStreak === 1) return 'First day down!';
    if (streak.currentStreak < 3) return 'Keep the momentum going!';
    if (streak.currentStreak < 7) return 'You\'re on fire!';
    return 'Incredible dedication!';
  };

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-16 bg-vintage-cream rounded-lg"></div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Milestone Celebration Overlay */}
      {showMilestone && streak.currentStreak >= 7 && (
        <div className="absolute -top-20 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-6 py-3 rounded-lg shadow-lg whitespace-nowrap">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              <span className="font-bold">7-Day Streak! Amazing!</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-vintage-cream to-white rounded-lg p-4 border border-vintage-brown/20 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Current Streak */}
          <div className="flex items-center gap-3">
            <div className={`${getStreakColor()}`}>
              <Flame className="w-8 h-8" />
            </div>
            <div>
              <p className="text-2xl font-bold text-vintage-brown">
                {streak.currentStreak}
                <span className="text-sm font-normal text-vintage-brown/60 ml-1">day streak</span>
              </p>
              <p className="text-xs text-vintage-brown/70">{getStreakMessage()}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4">
            {/* Week Progress */}
            <div className="text-center">
              <div className="flex items-center gap-1 text-vintage-brown/80">
                <Target className="w-4 h-4" />
                <span className="text-lg font-bold">{streak.weekTaskCount}</span>
              </div>
              <p className="text-xs text-vintage-brown/60">this week</p>
            </div>

            {/* Longest Streak */}
            <div className="text-center border-l border-vintage-brown/20 pl-4">
              <div className="flex items-center gap-1 text-yellow-600">
                <Trophy className="w-4 h-4" />
                <span className="text-lg font-bold">{streak.longestStreak}</span>
              </div>
              <p className="text-xs text-vintage-brown/60">best streak</p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-vintage-brown/60 mb-1">
            <span>Progress to 7-day milestone</span>
            <span>{Math.min(streak.currentStreak, 7)}/7</span>
          </div>
          <div className="h-2 bg-vintage-brown/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 transition-all duration-500"
              style={{ width: `${Math.min((streak.currentStreak / 7) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
