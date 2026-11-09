/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Gerenciador em Memória + Nuvem (Firestore) para XMLs Oficiais da SEFAZ
 * - Os XMLs oficiais da SEFAZ são persistidos EXCLUSIVAMENTE no banco de dados Firebase Firestore (/sefaz_documents)
 * - Mantém cache em memória (RAM) durante a sessão autenticada para leitura instantânea na UI
 * - Expurga automaticamente qualquer banco IndexedDB legado do navegador
 */

const memoryXmlCache = new Map<string, string>();

let cloudXmlFetcher: ((chaveOuId: string) => Promise<string | null>) | null = null;

export function registerCloudXmlFetcher(fn: (chaveOuId: string) => Promise<string | null>): void {
  cloudXmlFetcher = fn;
}

export function obterXmlCacheMemoria(chaveOuId: string): string {
  if (!chaveOuId) return '';
  return memoryXmlCache.get(chaveOuId) || '';
}

export function definirXmlCacheMemoria(chaveOuId: string, xml: string): void {
  if (!chaveOuId || !xml || isXmlSinteticoInvalido(xml)) return;
  memoryXmlCache.set(chaveOuId, xml);
}

export function removerXmlCacheMemoria(chaveOuId: string): void {
  if (!chaveOuId) return;
  memoryXmlCache.delete(chaveOuId);
}

export function limparCacheMemoriaXmls(): void {
  memoryXmlCache.clear();
}

/**
 * Detecta se um XML foi sintetizado por versões anteriores de fallback e portanto NÃO é o XML original da SEFAZ
 */
export function isXmlSinteticoInvalido(xml?: string | null): boolean {
  if (!xml) return false;
  return (
    xml.includes('<verProc>SEFAZ-DFE-4.00</verProc>') ||
    xml.includes('MERCADORIAS / SERVICOS CONFORME NF-E') ||
    xml.includes('PRODUTOS / SERVICOS CONFORME NF-E') ||
    xml.includes('<verAplic>SEFAZ_DFE_1.0</verAplic>') ||
    xml.includes('c2VmYXpfZGZlX2F1dGVudGljbw==') ||
    xml.includes('<digVal>444444444444444444444444444=</digVal>') ||
    xml.includes('ENDERECO CADASTRADO NA RECEITA FEDERAL') ||
    xml.includes('<xLgr>ENDERECO DO EMITENTE</xLgr>')
  );
}

/**
 * Verifica se o XML é um procNFe / NFe oficial completo da SEFAZ
 */
export function isXmlNfeCompletaOficial(xml?: string | null): boolean {
  if (!xml || isXmlSinteticoInvalido(xml)) return false;
  return (
    (xml.includes('<nfeProc') || xml.includes('<NFe') || xml.includes(':nfeProc') || xml.includes(':NFe')) &&
    xml.includes('infNFe')
  );
}

/**
 * Registra o XML em memória de sessão (a persistência permanente ocorre no Firestore via firebaseSyncService)
 */
export async function salvarXmlNoIndexedDb(chaveOuId: string, xml: string): Promise<void> {
  if (!chaveOuId || !xml || isXmlSinteticoInvalido(xml)) return;
  memoryXmlCache.set(chaveOuId, xml);
}

/**
 * Recupera o XML original da memória de sessão ou busca diretamente no Firestore (/sefaz_documents)
 */
export async function obterXmlDoIndexedDb(chaveOuId: string): Promise<string | null> {
  if (!chaveOuId) return null;
  const cached = memoryXmlCache.get(chaveOuId);
  if (cached && !isXmlSinteticoInvalido(cached)) {
    return cached;
  }
  if (cloudXmlFetcher) {
    try {
      const fromCloud = await cloudXmlFetcher(chaveOuId);
      if (fromCloud && !isXmlSinteticoInvalido(fromCloud)) {
        memoryXmlCache.set(chaveOuId, fromCloud);
        return fromCloud;
      }
    } catch {}
  }
  return null;
}

export async function removerXmlDoIndexedDb(chaveOuId: string): Promise<void> {
  if (!chaveOuId) return;
  memoryXmlCache.delete(chaveOuId);
}

/**
 * Limpa a memória de sessão e remove bancos IndexedDB legados do navegador
 */
export async function limparTodosXmlsIndexedDb(): Promise<void> {
  memoryXmlCache.clear();
  if (typeof window === 'undefined' || !window.indexedDB) return;
  try {
    window.indexedDB.deleteDatabase('moreira_lima_sefaz_db_v1');
    window.indexedDB.deleteDatabase('moreira_lima_sefaz_db_v2');
  } catch {}
}

export async function hidratarCacheXmlsDoIndexedDb(): Promise<Map<string, string>> {
  if (typeof window !== 'undefined' && window.indexedDB) {
    try {
      window.indexedDB.deleteDatabase('moreira_lima_sefaz_db_v1');
      window.indexedDB.deleteDatabase('moreira_lima_sefaz_db_v2');
    } catch {}
  }
  return memoryXmlCache;
}

let sessionDirHandle: any | null = null;

export async function salvarDirectoryHandleNoIndexedDb(handle: any): Promise<void> {
  sessionDirHandle = handle || null;
}

export async function obterDirectoryHandleDoIndexedDb(): Promise<any | null> {
  return sessionDirHandle;
}
