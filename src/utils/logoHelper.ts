export const DEFAULT_LOGO_PATH = './assets/logo.png';
export const LOGO_STORAGE_KEY = 'app_custom_logo';
export const LOGO_SCALE_KEY = 'ML_logo_scale';

let memoryLogoBase64: string | null = null;
let memoryLogoPath: string | null = DEFAULT_LOGO_PATH;

export function getAppLogoPath(): string {
  if (typeof window === 'undefined') return DEFAULT_LOGO_PATH;
  if (memoryLogoBase64) return memoryLogoBase64;
  if (memoryLogoPath) return memoryLogoPath;
  return DEFAULT_LOGO_PATH;
}

export function getAppLogoScale(): number {
  if (typeof window === 'undefined') return 1.0;
  const stored = localStorage.getItem(LOGO_SCALE_KEY);
  if (stored) {
    const parsed = parseFloat(stored);
    if (!isNaN(parsed)) return parsed;
  }
  return 1.0;
}
