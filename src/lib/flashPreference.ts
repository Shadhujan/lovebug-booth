// A flash is always a local, opt-in screen effect. Never control the other phone.
export type FlashContext = 'solo' | 'together';
export function readFlashPreference(context: FlashContext): boolean {
  try { return window.localStorage.getItem(`lovebug-flash-${context}`) === 'yes'; } catch { return false; }
}
export function saveFlashPreference(context: FlashContext, enabled: boolean): void {
  try { window.localStorage.setItem(`lovebug-flash-${context}`, enabled ? 'yes' : 'no'); } catch { /* Private browsing may block persistence. */ }
}
