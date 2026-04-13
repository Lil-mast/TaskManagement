import { useEffect, useState } from 'react';
import { Trophy, X, Sparkles } from 'lucide-react';

interface MilestoneToastProps {
  streak: number;
  onClose: () => void;
  duration?: number;
}

export function MilestoneToast({ streak, onClose, duration = 6000 }: MilestoneToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    // Animate in
    setTimeout(() => setIsVisible(true), 100);

    // Progress bar animation
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          clearInterval(progressInterval);
          return 0;
        }
        return prev - (100 / (duration / 100));
      });
    }, 100);

    // Auto close
    const closeTimeout = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(closeTimeout);
    };
  }, [duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const getMilestoneMessage = () => {
    if (streak === 7) return '7-Day Streak! You\'re unstoppable!';
    if (streak === 14) return '2-Week Champion! Incredible dedication!';
    if (streak === 30) return '30-Day Legend! You\'re a productivity master!';
    return `${streak}-Day Streak! Keep it up!`;
  };

  const getGradient = () => {
    if (streak >= 30) return 'from-purple-600 to-pink-600';
    if (streak >= 14) return 'from-blue-500 to-purple-600';
    if (streak >= 7) return 'from-orange-500 to-yellow-500';
    return 'from-red-500 to-orange-500';
  };

  return (
    <div
      className={`fixed top-24 right-4 z-50 transition-all duration-300 transform ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div className={`relative bg-gradient-to-r ${getGradient()} text-white p-1 rounded-lg shadow-2xl max-w-sm`}>
        <div className="bg-white/10 backdrop-blur-sm rounded-md p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="bg-white/20 p-2 rounded-full">
                {streak >= 7 ? (
                  <Trophy className="w-6 h-6 text-white" />
                ) : (
                  <Sparkles className="w-6 h-6 text-white" />
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg leading-tight">
                {getMilestoneMessage()}
              </h3>
              <p className="text-white/80 text-sm mt-1">
                You've been consistently completing tasks. Great job!
              </p>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close notification"
              className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-100 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Decorative sparkles */}
        <div className="absolute -top-1 -left-1 w-2 h-2 bg-yellow-300 rounded-full animate-pulse" />
        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-white rounded-full animate-pulse delay-150" />
      </div>
    </div>
  );
}
