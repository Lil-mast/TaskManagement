export interface CompletedTask {
  id: string;
  title: string;
  description?: string;
  quadrant: string;
  user_id: string;
  created_at: string;
  completed_at: string;
  motivation_quote: string;
}

const TRASH_STORAGE_KEY = 'eisenhower-trash';

const MOTIVATION_QUOTES = [
  "Great job! You completed a task! 🎉",
  "Excellent work! Keep it going! ⭐",
  "Well done! You're making progress! 🚀",
  "Fantastic! Every task completed is a win! 🏆",
  "Amazing! You're crushing your goals! 💪",
  "Superb! Your productivity is impressive! ✨"
];

export class TrashManager {
  static getRandomQuote(): string {
    return MOTIVATION_QUOTES[Math.floor(Math.random() * MOTIVATION_QUOTES.length)];
  }

  static addToTrash(task: any): string {
    const completedTask: CompletedTask = {
      ...task,
      completed_at: new Date().toISOString(),
      motivation_quote: this.getRandomQuote()
    };

    const existingTrash = this.getTrash();
    existingTrash.push(completedTask);
    localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(existingTrash));
    
    return completedTask.motivation_quote;
  }

  static getTrash(): CompletedTask[] {
    const trashData = localStorage.getItem(TRASH_STORAGE_KEY);
    return trashData ? JSON.parse(trashData) : [];
  }

  static clearTrash(): void {
    localStorage.removeItem(TRASH_STORAGE_KEY);
  }

  static getTrashCount(): number {
    return this.getTrash().length;
  }
}
