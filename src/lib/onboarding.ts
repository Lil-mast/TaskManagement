const ONBOARDING_KEY = 'mrt.onboarding.complete.v1';

function storageKey(userId: string): string {
  return `${ONBOARDING_KEY}:${userId || 'local'}`;
}

export function isOnboardingComplete(userId: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingComplete(userId: string): void {
  try {
    localStorage.setItem(storageKey(userId), '1');
  } catch {
    // The route still works for this render; persistence is best-effort.
  }
}

export function clearOnboardingComplete(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // Nothing to clear.
  }
}
