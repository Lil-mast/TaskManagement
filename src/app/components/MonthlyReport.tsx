import { useState, useEffect } from 'react';
import { TrashManager } from '../../lib/trashManager';

interface MonthlyReportProps {
  userId: string;
  boardId: string;
}

interface ReportData {
  totalTasksCompleted: number;
  tasksByQuadrant: Record<string, number>;
  averageTasksPerDay: number;
  mostProductiveDay: string;
  currentStreak: number;
}

interface EndOfMonthContent {
  quote: string;
  author: string;
  videoTitle: string;
  videoUrl: string;
  videoDescription: string;
}

export function MonthlyReport({ userId, boardId }: MonthlyReportProps) {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEndOfMonth, setIsEndOfMonth] = useState(false);
  const [endOfMonthContent, setEndOfMonthContent] = useState<EndOfMonthContent | null>(null);

  // End of month motivation content library
  const endOfMonthContentLibrary: EndOfMonthContent[] = [
    {
      quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.",
      author: "Winston Churchill",
      videoTitle: "The Power of Habit",
      videoUrl: "https://www.youtube.com/embed/AD5W3JvA7-0",
      videoDescription: "Charles Duhigg explains how habits work and how you can change them to achieve your goals."
    },
    {
      quote: "The only way to do great work is to love what you do. If you haven't found it yet, keep looking.",
      author: "Steve Jobs",
      videoTitle: "How Great Leaders Inspire Action",
      videoUrl: "https://www.youtube.com/embed/qp0HIF3SfI4",
      videoDescription: "Simon Sinek presents his famous Golden Circle theory on how great leaders inspire action."
    },
    {
      quote: "Your time is limited, don't waste it living someone else's life.",
      author: "Steve Jobs",
      videoTitle: "Grit: The Power of Passion and Perseverance",
      videoUrl: "https://www.youtube.com/embed/H14bBxwbbB4",
      videoDescription: "Angela Lee Duckworth explains why grit is the key to success."
    },
    {
      quote: "The future belongs to those who believe in the beauty of their dreams.",
      author: "Eleanor Roosevelt",
      videoTitle: "The Happy Secret to Better Work",
      videoUrl: "https://www.youtube.com/embed/gXwCXmJ0pF4",
      videoDescription: "Shawn Achor shares how happiness can actually improve your work and productivity."
    },
    {
      quote: "It is during our darkest moments that we must focus to see the light.",
      author: "Aristotle",
      videoTitle: "The Puzzle of Motivation",
      videoUrl: "https://www.youtube.com/embed/rrkrvAU4Uqs",
      videoDescription: "Dan Pink reveals what truly motivates us in the modern workplace."
    },
    {
      quote: "The best time to plant a tree was 20 years ago. The second best time is now.",
      author: "Chinese Proverb",
      videoTitle: "Inside the Mind of a Master Procrastinator",
      videoUrl: "https://www.youtube.com/embed/arj7oStGLkU",
      videoDescription: "Tim Urban humorously explores the mind of a procrastinator and how to overcome it."
    }
  ];

  useEffect(() => {
    generateReport();
    checkEndOfMonth();
  }, []);

  const checkEndOfMonth = () => {
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const isLastDay = now.getDate() === lastDayOfMonth;
    
    setIsEndOfMonth(isLastDay);
    
    if (isLastDay) {
      // Select random content for end of month
      const randomContent = endOfMonthContentLibrary[Math.floor(Math.random() * endOfMonthContentLibrary.length)];
      setEndOfMonthContent(randomContent);
    }
  };

  const generateReport = () => {
    setLoading(true);
    
    // Get all completed tasks from trash
    const completedTasks = TrashManager.getTrash();
    
    // Filter tasks for current month
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const thisMonthTasks = completedTasks.filter(task => {
      const taskDate = new Date(task.completed_at);
      return taskDate.getMonth() === currentMonth && taskDate.getFullYear() === currentYear;
    });

    // Calculate statistics
    const tasksByQuadrant = thisMonthTasks.reduce((acc, task) => {
      acc[task.quadrant] = (acc[task.quadrant] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysPassed = now.getDate();
    const averageTasksPerDay = thisMonthTasks.length / Math.max(daysPassed, 1);

    // Find most productive day
    const tasksByDay = thisMonthTasks.reduce((acc, task) => {
      const day = new Date(task.completed_at).getDate();
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const mostProductiveDay = Object.entries(tasksByDay).reduce((max, [day, count]) => 
      count > max.count ? { day, count } : max, { day: '1', count: 0 }
    ).day;

    // Calculate current streak (consecutive days with completed tasks)
    const currentStreak = calculateCurrentStreak(thisMonthTasks);

    setReportData({
      totalTasksCompleted: thisMonthTasks.length,
      tasksByQuadrant,
      averageTasksPerDay: Math.round(averageTasksPerDay * 10) / 10,
      mostProductiveDay: new Date(currentYear, currentMonth, parseInt(mostProductiveDay)).toLocaleDateString(),
      currentStreak
    });

    setLoading(false);
  };

  const calculateCurrentStreak = (tasks: any[]): number => {
    if (tasks.length === 0) return 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const taskDates = tasks
      .map(task => new Date(task.completed_at))
      .map(date => {
        date.setHours(0, 0, 0, 0);
        return date;
      })
      .sort((a, b) => b.getTime() - a.getTime());

    let streak = 0;
    let currentDate = new Date(today);

    for (const taskDate of taskDates) {
      if (taskDate.getTime() === currentDate.getTime()) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else if (taskDate.getTime() < currentDate.getTime()) {
        break;
      }
    }

    return streak;
  };

  const getQuadrantName = (quadrant: string): string => {
    const names: Record<string, string> = {
      'urgent_important': 'Do (Urgent & Important)',
      'urgent_not_important': 'Delegate (Urgent & Not Important)',
      'not_urgent_important': 'Decide (Not Urgent & Important)',
      'not_urgent_not_important': 'Delete (Not Urgent & Not Important)'
    };
    return names[quadrant] || quadrant;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-vintage-brown"></div>
        <p className="text-vintage-brown font-serif text-lg mt-4">Generating report...</p>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-vintage-brown mb-4">Monthly Report</h2>
        <p className="text-vintage-brown/70">Unable to generate report.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-vintage-brown flex items-center gap-2">
              {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Report
              {isEndOfMonth && <span className="text-2xl">🎉</span>}
            </h2>
            {isEndOfMonth && (
              <p className="text-sm text-purple-600 font-medium mt-1">End of Month Special Edition</p>
            )}
          </div>
          <button
            onClick={generateReport}
            className="px-4 py-2 bg-vintage-brown text-white rounded hover:bg-vintage-brown/80 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-vintage-cream p-4 rounded border border-vintage-beige">
            <h3 className="text-lg font-semibold text-vintage-brown mb-2">Tasks Completed</h3>
            <p className="text-3xl font-bold text-vintage-red">{reportData.totalTasksCompleted}</p>
          </div>
          <div className="bg-vintage-cream p-4 rounded border border-vintage-beige">
            <h3 className="text-lg font-semibold text-vintage-brown mb-2">Daily Average</h3>
            <p className="text-3xl font-bold text-vintage-blue-grey">{reportData.averageTasksPerDay}</p>
          </div>
          <div className="bg-vintage-cream p-4 rounded border border-vintage-beige">
            <h3 className="text-lg font-semibold text-vintage-brown mb-2">Current Streak</h3>
            <p className="text-3xl font-bold text-green-600">{reportData.currentStreak} days</p>
          </div>
        </div>

        {/* Tasks by Quadrant */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-vintage-brown mb-3">Tasks by Quadrant</h3>
          <div className="space-y-2">
            {Object.entries(reportData.tasksByQuadrant).map(([quadrant, count]) => (
              <div key={quadrant} className="flex justify-between items-center bg-vintage-cream p-3 rounded">
                <span className="text-vintage-brown">{getQuadrantName(quadrant)}</span>
                <span className="font-bold text-vintage-brown">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Most Productive Day */}
        <div className="bg-vintage-cream p-4 rounded border border-vintage-beige">
          <h3 className="text-lg font-semibold text-vintage-brown mb-2">Most Productive Day</h3>
          <p className="text-vintage-brown">{reportData.mostProductiveDay}</p>
        </div>

        {/* Enhanced Motivational Section */}
        {isEndOfMonth && endOfMonthContent ? (
          <div className="mt-6 space-y-4">
            {/* End of Month Special Banner */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-lg shadow-lg">
              <div className="text-center">
                <h3 className="text-2xl font-bold mb-2">🎊 End of Month Celebration! 🎊</h3>
                <p className="text-lg opacity-90">Congratulations on completing another month of productivity!</p>
              </div>
            </div>

            {/* Featured Quote */}
            <div className="bg-vintage-cream p-6 rounded-lg border-2 border-vintage-brown shadow-md">
              <h4 className="text-lg font-semibold text-vintage-brown mb-3">Monthly Wisdom</h4>
              <blockquote className="text-xl text-vintage-brown italic font-serif mb-3">
                "{endOfMonthContent.quote}"
              </blockquote>
              <p className="text-right text-vintage-brown font-medium">— {endOfMonthContent.author}</p>
            </div>

            {/* Featured TED Talk */}
            <div className="bg-white p-6 rounded-lg border-2 border-vintage-red shadow-md">
              <h4 className="text-lg font-semibold text-vintage-brown mb-3">🎥 Featured Inspiration: TED Talk</h4>
              <div className="aspect-w-16 aspect-h-9 mb-4">
                <iframe
                  src={endOfMonthContent.videoUrl}
                  title={endOfMonthContent.videoTitle}
                  className="w-full h-64 rounded-lg"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
              <h5 className="font-semibold text-vintage-brown mb-2">{endOfMonthContent.videoTitle}</h5>
              <p className="text-vintage-brown/70 text-sm">{endOfMonthContent.videoDescription}</p>
            </div>

            {/* Monthly Achievement Summary */}
            <div className="bg-gradient-to-r from-green-100 to-blue-100 p-4 rounded-lg border border-green-200">
              <p className="text-green-800 text-center font-medium">
                {reportData.totalTasksCompleted > 0 
                  ? `🏆 Amazing! You completed ${reportData.totalTasksCompleted} tasks this month with a ${reportData.currentStreak}-day streak! Your dedication is inspiring!`
                  : "🌱 Every month is a fresh start. You've got this! Begin your productivity journey today."
                }
              </p>
            </div>
          </div>
        ) : (
          /* Regular Motivational Message */
          <div className="mt-6 p-4 bg-gradient-to-r from-purple-100 to-pink-100 rounded border border-purple-200">
            <p className="text-purple-800 text-center font-medium">
              {reportData.totalTasksCompleted > 0 
                ? `Great job! You've completed ${reportData.totalTasksCompleted} tasks this month. Keep up the excellent work! 🎉`
                : "Start completing tasks to see your progress here. Every task completed is a step toward your goals! 🚀"
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
