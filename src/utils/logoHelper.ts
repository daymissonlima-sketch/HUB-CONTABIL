/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_LOGO_PATH = './assets/logo.png';
export const LOGO_STORAGE_KEY = 'app_custom_logo';
export const LOGO_BASE64_CACHE_KEY = 'app_custom_logo_base64_cache';
export const LOGO_SCALE_KEY = 'ML_logo_scale';

// In-memory cache for synchronous access (e.g., React rendering and jsPDF generator)
let memoryLogoBase64: string | null = null;
let memoryLogoPath: string | null = null;

const IDB_NAME = 'ML_LogoStorage';
const IDB_STORE = 'logoStore';

async function saveToIndexedDB(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      request.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

async function getFromIndexedDB(key: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return null;
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const getReq = store.get(key);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

async function removeFromIndexedDB(key: string): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(IDB_NAME, 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      request.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

/**
 * Returns the configured image path or base64 for the logo.
 * Strictly adheres to referencing external image asset path or user uploaded file.
 */
export function getAppLogoPath(): string {
  if (typeof window === 'undefined') return DEFAULT_LOGO_PATH;
  if (memoryLogoBase64) return memoryLogoBase64;
  if (memoryLogoPath) return memoryLogoPath;
  try {
    const stored = localStorage.getItem(LOGO_STORAGE_KEY);
    if (stored) {
      if (stored === 'idb://custom_logo') {
        return memoryLogoBase64 || DEFAULT_LOGO_PATH;
      }
      return stored;
    }
  } catch (e) {}
  return DEFAULT_LOGO_PATH;
}

/**
 * Updates the stored logo path (either file path like ./assets/logo.png or Base64 string from upload up to 5MB)
 */
export function setAppLogoPath(pathOrDataUrl: string): void {
  if (typeof window === 'undefined') return;
  
  if (pathOrDataUrl.startsWith('data:image')) {
    memoryLogoBase64 = pathOrDataUrl;
    memoryLogoPath = null;
    // Save large base64 into IndexedDB asynchronously to avoid localStorage 5MB quota errors
    saveToIndexedDB('custom_logo', pathOrDataUrl);
    
    try {
      localStorage.setItem(LOGO_STORAGE_KEY, pathOrDataUrl);
    } catch (e) {
      // If QuotaExceededError occurs in localStorage, store pointer to IDB instead
      try {
        localStorage.setItem(LOGO_STORAGE_KEY, 'idb://custom_logo');
      } catch (e2) {}
    }
  } else {
    memoryLogoBase64 = null;
    memoryLogoPath = pathOrDataUrl;
    removeFromIndexedDB('custom_logo');
    try {
      localStorage.setItem(LOGO_STORAGE_KEY, pathOrDataUrl);
      localStorage.removeItem(LOGO_BASE64_CACHE_KEY);
    } catch (e) {}
    
    // Fetch external asset path to populate memoryLogoBase64 for synchronous jsPDF export
    fetch(pathOrDataUrl).then(res => res.blob()).then(blob => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string' && reader.result.startsWith('data:image')) {
          memoryLogoBase64 = reader.result;
        }
      };
      reader.readAsDataURL(blob);
    }).catch(() => {});
  }
  
  window.dispatchEvent(new Event('logoUpdated'));
}

/**
 * Restores logo to default physical asset ./assets/logo.png
 */
export function resetAppLogoPath(): void {
  if (typeof window === 'undefined') return;
  memoryLogoBase64 = null;
  memoryLogoPath = DEFAULT_LOGO_PATH;
  removeFromIndexedDB('custom_logo');
  try {
    localStorage.removeItem(LOGO_STORAGE_KEY);
    localStorage.removeItem(LOGO_BASE64_CACHE_KEY);
    localStorage.removeItem(LOGO_SCALE_KEY);
  } catch (e) {}
  
  initLogoCache();
  window.dispatchEvent(new Event('logoUpdated'));
}

/**
 * Returns the configured scale factor for the logo (default 1.0)
 */
export function getAppLogoScale(): number {
  if (typeof window === 'undefined') return 1.0;
  try {
    const stored = localStorage.getItem(LOGO_SCALE_KEY);
    if (stored) {
      const val = parseFloat(stored);
      if (!isNaN(val) && val >= 0.2 && val <= 4.0) {
        return val;
      }
    }
  } catch (e) {}
  return 1.0;
}

/**
 * Saves the scale factor for the logo
 */
export function setAppLogoScale(scale: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOGO_SCALE_KEY, scale.toString());
  } catch (e) {}
  window.dispatchEvent(new Event('logoUpdated'));
}

/**
 * Helper to get cached base64 or HTMLImageElement for synchronous jsPDF export
 */
export function getPdfLogoData(): { dataUrl?: string; format?: string } | null {
  if (typeof window === 'undefined') return null;
  
  let target = memoryLogoBase64;
  if (!target) {
    try {
      const stored = localStorage.getItem(LOGO_STORAGE_KEY);
      if (stored && stored.startsWith('data:image')) {
        target = stored;
      } else {
        const cached = localStorage.getItem(LOGO_BASE64_CACHE_KEY);
        if (cached && cached.startsWith('data:image')) target = cached;
      }
    } catch (e) {}
  }
  
  if (target && target.startsWith('data:image')) {
    const formatMatch = target.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
    const format = formatMatch ? (formatMatch[1].toUpperCase() === 'JPEG' || formatMatch[1].toUpperCase() === 'JPG' ? 'JPEG' : 'PNG') : 'PNG';
    return { dataUrl: target, format };
  }
  return null;
}

/**
 * Preloads the default physical asset or IDB custom logo into memory cache for jsPDF generator
 */
export async function initLogoCache(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  // 1. Check IndexedDB first for large custom logos
  const idbLogo = await getFromIndexedDB('custom_logo');
  if (idbLogo && idbLogo.startsWith('data:image')) {
    memoryLogoBase64 = idbLogo;
    window.dispatchEvent(new Event('logoUpdated'));
    return;
  }
  
  // 2. Check localStorage or fetch asset path into memory cache without throwing QuotaExceededError
  try {
    const stored = localStorage.getItem(LOGO_STORAGE_KEY);
    if (stored && stored.startsWith('data:image')) {
      memoryLogoBase64 = stored;
      return;
    }
    const path = (stored && stored !== 'idb://custom_logo') ? stored : DEFAULT_LOGO_PATH;
    memoryLogoPath = path;
    const response = await fetch(path);
    if (!response.ok) return;
    const blob = await response.blob();
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image')) {
        memoryLogoBase64 = reader.result;
        // Try storing in legacy cache key safely if quota permits
        try {
          localStorage.setItem(LOGO_BASE64_CACHE_KEY, reader.result);
        } catch (e) {
          // Quota exceeded: ignore silently since memoryLogoBase64 is available
        }
      }
    };
    reader.readAsDataURL(blob);
  } catch (e) {
    // Ignore fetch or storage errors
  }
}

