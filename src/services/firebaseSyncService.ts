import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  db,
  auth,
  OperationType,
  handleFirestoreError,
  createSecondaryUserAndSendReset,
  sendPasswordReset,
  isFirestoreQuotaExceeded,
  markFirestoreQuotaExceeded,
} from '../firebase';
import { Company } from '../types_debits';
import { DocumentoFiscalArmazenado } from '../types/sefazTypes';
import {
  definirXmlCacheMemoria,
  obterXmlCacheMemoria,
  isXmlSinteticoInvalido,
  registerCloudXmlFetcher,
  limparTodosXmlsIndexedDb,
} from './sefazIndexedDb';

export const FIREBASE_SYNC_STATUS_EVENT = 'moreira_lima_firebase_sync_status';
export const OFFICE_USERS_UPDATED_EVENT = 'moreira_lima_office_users_updated';

const ORG_ID = 'moreira_lima';
export const MASTER_ADMIN_EMAIL = 'daymisson@moreiraelima.com.br';
export const MASTER_ADMIN_FALLBACK_EMAIL = 'daymisson.lima@hotmail.com';
export const MASTER_ADMIN_EMAILS = [
  'daymisson@moreiraelima.com.br',
  'daymisson.lima@hotmail.com',
  'daymisson.lima@gmail.com',
];

export function isMasterAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return (
    MASTER_ADMIN_EMAILS.includes(clean) ||
    clean.startsWith('daymisson') ||
    clean.endsWith('@moreiraelima.com.br')
  );
}

const COMPANIES_STORAGE_KEY = 'moreira_lima_companies';
const COMPANIES_UPDATED_EVENT = 'moreira_lima_companies_updated';
const SEFAZ_DOCUMENTS_KEY = 'moreira_lima_sefaz_docs_v3';
const SEFAZ_DOCS_UPDATED_EVENT = 'moreira_lima_sefaz_docs_updated';
const SEFAZ_PENDING_KEYS_STORAGE = 'moreira_lima_sefaz_pending_keys_v1';

export interface OfficeUser {
  orgId: string;
  emailKey: string;
  email: string;
  nome: string;
  cargo: 'ADMIN' | 'FUNCIONARIO';
  status: 'ATIVO' | 'BLOQUEADO';
  passwordHash: string;
  deveAlterarSenha: boolean;
  updatedByUid: string;
  updatedAtIso: string;
}

export interface FirebaseSyncStatus {
  user: User | null;
  officeProfile: OfficeUser | null;
  authReady: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  cloudCompaniesCount: number;
  cloudDocsCount: number;
  errorMessage: string | null;
}

let currentStatus: FirebaseSyncStatus = {
  user: null,
  officeProfile: null,
  authReady: false,
  isSyncing: false,
  lastSyncedAt: null,
  cloudCompaniesCount: 0,
  cloudDocsCount: 0,
  errorMessage: null,
};

// Armazenamento em memória da sessão alimentado 100% pelo Firestore (sem salvar XMLs no navegador)
let runtimeCloudDocs: DocumentoFiscalArmazenado[] = [];
let runtimePendingKeys: Record<string, string[]> = {};
let runtimeOfficeUsers: OfficeUser[] = [];

let unsubCompanies: Unsubscribe | null = null;
let unsubDocs: Unsubscribe | null = null;
let unsubPending: Unsubscribe | null = null;
let unsubOfficeUsers: Unsubscribe | null = null;
let isApplyingRemoteUpdate = false;

function emitStatus(partial: Partial<FirebaseSyncStatus>) {
  currentStatus = { ...currentStatus, ...partial };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FIREBASE_SYNC_STATUS_EVENT, { detail: currentStatus }));
  }
}

export function getFirebaseSyncStatus(): FirebaseSyncStatus {
  return currentStatus;
}

export function getRuntimeCloudDocs(): DocumentoFiscalArmazenado[] {
  return runtimeCloudDocs;
}

export function setRuntimeCloudDocs(docs: DocumentoFiscalArmazenado[]): void {
  runtimeCloudDocs = docs;
}

export function getRuntimePendingKeys(cleanCnpj: string): string[] {
  return runtimePendingKeys[cleanCnpj] || [];
}

export function setRuntimePendingKeys(cleanCnpj: string, keys: string[]): void {
  runtimePendingKeys[cleanCnpj] = keys;
}

export function getRuntimeOfficeUsers(): OfficeUser[] {
  return runtimeOfficeUsers;
}

export function isApplyingCloudSnapshot(): boolean {
  return isApplyingRemoteUpdate;
}

export function sanitizeEmailToKey(email: string): string {
  const clean = (email || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 120);
  return clean.length >= 3 ? clean : `user_${clean}_key`;
}

function sanitizeId(raw: string): string {
  const cleaned = (raw || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || 'record_default';
}

export async function hashPasswordSha256(password: string): Promise<string> {
  const normalized = (password || '').trim();
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`moreira_lima_salt_v1:${normalized}`);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return `hash_${normalized.length}_${normalized.slice(0, 4)}`;
}

function stripUndefinedFields(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  const keys = Object.keys(obj).slice(0, 95);
  for (const key of keys) {
    const val = obj[key];
    if (val === undefined || typeof val === 'function') continue;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = stripUndefinedFields(val);
    } else if (Array.isArray(val)) {
      result[key] = val.slice(0, 50).map(item =>
        item !== null && typeof item === 'object' ? stripUndefinedFields(item) : item ?? null
      );
    } else {
      result[key] = val;
    }
  }
  return result;
}

// Registra o buscador de XML sob demanda diretamente do Firestore para quando o usuário abrir DANFE ou baixar XML
registerCloudXmlFetcher(async (chaveOuId: string) => {
  const user = auth.currentUser;
  if (!user) return null;

  const cleanDigits = chaveOuId.replace(/\D/g, '');
  // Se já veio no formato cnpj_chave
  if (chaveOuId.includes('_')) {
    const docId = sanitizeId(chaveOuId);
    try {
      const snap = await getDoc(doc(db, 'sefaz_documents', docId));
      if (snap.exists()) {
        const xml = snap.data()?.xmlContent;
        if (typeof xml === 'string' && xml.length > 0) return xml;
      }
    } catch {}
  }

  // Procura pelo documento correspondente na lista em memória para saber o docId exato
  const match = runtimeCloudDocs.find(
    d => d.id === chaveOuId || (cleanDigits.length === 44 && (d.chave || '').replace(/\D/g, '') === cleanDigits)
  );
  if (match) {
    const cleanEmp = (match.empresaCnpj || '').replace(/\D/g, '');
    const cleanKey = (match.chave || '').replace(/\D/g, '');
    const docId = sanitizeId(`${cleanEmp}_${cleanKey}`);
    try {
      const snap = await getDoc(doc(db, 'sefaz_documents', docId));
      if (snap.exists()) {
        const xml = snap.data()?.xmlContent;
        if (typeof xml === 'string' && xml.length > 0) return xml;
      }
    } catch {}
  }
  return null;
});

const lastSyncedCompanySig = new Map<string, string>();
const lastSyncedDocSig = new Map<string, string>();

function getCompanySyncSignature(c: Company): string {
  return JSON.stringify({
    cnpj: c.cnpj,
    razaoSocial: c.razaoSocial,
    cert: Boolean(c.certificateFile),
    certName: c.certificateName,
    hab: c.consultaNfeHabilitada,
    ultNSU: c.ultimoNSU,
    maxNSU: c.maxNSU,
    concluida: c.varredura90DiasConcluida,
    vista: c.vendaVistaPercent,
  });
}

function getDocSyncSignature(d: DocumentoFiscalArmazenado, hasFullXml: boolean): string {
  return `${d.tipo}|${d.situacao}|${d.manifestacao || ''}|${hasFullXml ? 'XML1' : 'XML0'}|${d.valorTotal || 0}`;
}

/**
 * Envia empresas que possuem certificado digital A1, NSU consultado ou edições customizadas para o Firestore
 * ignorando empresas que não sofreram alteração real para economizar cota de escrita.
 */
export async function syncCompaniesToCloud(companies: Company[], forceAllWithCert = false): Promise<number> {
  const user = auth.currentUser;
  if (!user || isApplyingRemoteUpdate || isFirestoreQuotaExceeded()) return 0;

  const candidates = companies.filter(c => {
    const cleanCnpj = (c.cnpj || '').replace(/\D/g, '');
    if (cleanCnpj.length < 11) return false;
    const hasRelevantData = forceAllWithCert
      ? Boolean(
          c.certificateFile ||
            (c.ultimoNSU && c.ultimoNSU !== '0') ||
            c.lastPolledAt ||
            c.inscEst ||
            c.id?.startsWith('custom-')
        )
      : Boolean(c.certificateFile || (c.ultimoNSU && c.ultimoNSU !== '0') || c.lastPolledAt);

    if (!hasRelevantData) return false;
    const sig = getCompanySyncSignature(c);
    return lastSyncedCompanySig.get(cleanCnpj) !== sig;
  });

  if (candidates.length === 0) return 0;

  emitStatus({ isSyncing: true, errorMessage: null });
  let syncedCount = 0;
  const nowIso = new Date().toISOString();

  try {
    const chunkSize = 25;
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const slice = candidates.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      for (const comp of slice) {
        const cleanCnpj = (comp.cnpj || '').replace(/\D/g, '').slice(0, 20);
        const docId = sanitizeId(cleanCnpj || comp.id);
        const razao = (comp.razaoSocial || 'Empresa Sem Razão Social').slice(0, 300);
        const details = stripUndefinedFields(comp as Record<string, any>);

        const ref = doc(db, 'companies', docId);
        batch.set(ref, {
          orgId: ORG_ID,
          cnpj: cleanCnpj,
          razaoSocial: razao,
          details,
          updatedByUid: user.uid,
          updatedByEmail: (user.email || 'usuario@moreiralima.com.br').slice(0, 254),
          updatedAtIso: nowIso,
        });
        lastSyncedCompanySig.set(cleanCnpj, getCompanySyncSignature(comp));
        syncedCount++;
      }

      await batch.commit();
    }

    emitStatus({
      isSyncing: false,
      lastSyncedAt: new Date().toLocaleTimeString('pt-BR'),
    });
    return syncedCount;
  } catch (error) {
    const errStr = error instanceof Error ? error.message : String(error);
    if (errStr.includes("resource-exhausted") || errStr.includes("Quota exceeded")) {
      markFirestoreQuotaExceeded();
      emitStatus({ isSyncing: false, errorMessage: null });
      return 0;
    }
    emitStatus({
      isSyncing: false,
      errorMessage: errStr,
    });
    handleFirestoreError(error, OperationType.WRITE, 'companies');
    return 0;
  }
}

/**
 * Sincroniza documentos fiscais (NF-e procNFe + XML Oficial) diretamente no Firestore
 * ignorando documentos idênticos já sincronizados.
 */
export async function syncSefazDocumentsToCloud(docs: DocumentoFiscalArmazenado[]): Promise<number> {
  const user = auth.currentUser;
  if (!user || isApplyingRemoteUpdate || isFirestoreQuotaExceeded()) return 0;

  const validDocs = docs.filter(d => {
    const cleanKey = (d.chave || '').replace(/\D/g, '');
    const cleanEmp = (d.empresaCnpj || '').replace(/\D/g, '').slice(0, 20);
    if (cleanKey.length !== 44 || cleanEmp.length < 11) return false;
    if (d.tipo !== 'NFE_COMPLETA' && d.tipo !== 'RESUMO') return false;
    const docId = sanitizeId(`${cleanEmp}_${cleanKey}`);
    const xmlContent = d.xml || obterXmlCacheMemoria(cleanKey) || obterXmlCacheMemoria(docId) || '';
    const sig = getDocSyncSignature(d, Boolean(xmlContent && xmlContent.includes('<infNFe')));
    return lastSyncedDocSig.get(docId) !== sig;
  });

  if (validDocs.length === 0) return 0;

  emitStatus({ isSyncing: true, errorMessage: null });
  let saved = 0;
  const nowIso = new Date().toISOString();

  try {
    const chunkSize = 15;
    for (let i = 0; i < validDocs.length; i += chunkSize) {
      const slice = validDocs.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      for (const d of slice) {
        const cleanKey = (d.chave || '').replace(/\D/g, '');
        const cleanEmp = (d.empresaCnpj || '').replace(/\D/g, '').slice(0, 20);
        const docId = sanitizeId(`${cleanEmp}_${cleanKey}`);
        let xmlContent = d.xml || obterXmlCacheMemoria(cleanKey) || obterXmlCacheMemoria(docId) || '';
        if (isXmlSinteticoInvalido(xmlContent)) {
          xmlContent = '';
        }
        if (xmlContent.length > 850000) {
          xmlContent = xmlContent.slice(0, 850000);
        }

        const { xml: _omitXml, ...metaWithoutXml } = d;
        const docMetadata = stripUndefinedFields(metaWithoutXml as Record<string, any>);
        const validSituacoes = ['AUTORIZADA', 'CANCELADA', 'DENEGADA', 'CARTA_CORRECAO', 'RESUMO'];
        const situacao = validSituacoes.includes(d.situacao) ? d.situacao : 'AUTORIZADA';

        batch.set(doc(db, 'sefaz_documents', docId), {
          orgId: ORG_ID,
          chave: cleanKey,
          empresaCnpj: cleanEmp,
          situacao,
          dataEmissao: String(d.dataEmissao || nowIso).slice(0, 40),
          docMetadata,
          xmlContent,
          updatedByUid: user.uid,
          updatedAtIso: nowIso,
        });
        const sig = getDocSyncSignature(d, Boolean(xmlContent && xmlContent.includes('<infNFe')));
        lastSyncedDocSig.set(docId, sig);
        saved++;
      }

      await batch.commit();
    }

    emitStatus({
      isSyncing: false,
      lastSyncedAt: new Date().toLocaleTimeString('pt-BR'),
    });
    return saved;
  } catch (error) {
    const errStr = error instanceof Error ? error.message : String(error);
    if (errStr.includes("resource-exhausted") || errStr.includes("Quota exceeded")) {
      markFirestoreQuotaExceeded();
      emitStatus({ isSyncing: false, errorMessage: null });
      return 0;
    }
    emitStatus({
      isSyncing: false,
      errorMessage: errStr,
    });
    handleFirestoreError(error, OperationType.WRITE, 'sefaz_documents');
    return 0;
  }
}

export async function deleteSefazDocumentFromCloud(docId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || isFirestoreQuotaExceeded()) return;
  const safeId = sanitizeId(docId);
  try {
    await deleteDoc(doc(db, 'sefaz_documents', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `sefaz_documents/${safeId}`);
  }
}

export async function clearSefazDocumentsInCloud(empresaCnpj?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || isFirestoreQuotaExceeded()) return;
  const cleanEmp = empresaCnpj ? empresaCnpj.replace(/\D/g, '') : '';
  const targets = cleanEmp
    ? runtimeCloudDocs.filter(d => (d.empresaCnpj || '').replace(/\D/g, '') === cleanEmp)
    : [...runtimeCloudDocs];

  try {
    for (const d of targets) {
      const cleanKey = (d.chave || '').replace(/\D/g, '');
      const emp = (d.empresaCnpj || '').replace(/\D/g, '');
      const docId = sanitizeId(cleanKey.length === 44 ? `${emp}_${cleanKey}` : d.id);
      await deleteDoc(doc(db, 'sefaz_documents', docId));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'sefaz_documents');
  }
}

/**
 * Sincroniza fila de chaves de acesso pendentes de uma empresa no Firestore
 */
export async function syncPendingKeysToCloud(cnpj: string, keys: string[]): Promise<void> {
  const user = auth.currentUser;
  if (!user || isApplyingRemoteUpdate || isFirestoreQuotaExceeded()) return;

  const cleanCnpj = (cnpj || '').replace(/\D/g, '').slice(0, 20);
  if (cleanCnpj.length < 11) return;

  const validKeys = Array.from(
    new Set(keys.map(k => String(k || '').replace(/\D/g, '')).filter(k => k.length === 44))
  ).slice(0, 500);

  const docId = sanitizeId(cleanCnpj);
  try {
    await setDoc(doc(db, 'sefaz_pending_keys', docId), {
      orgId: ORG_ID,
      empresaCnpj: cleanCnpj,
      pendingKeys: validKeys,
      updatedByUid: user.uid,
      updatedAtIso: new Date().toISOString(),
    });
  } catch (error) {
    const errStr = error instanceof Error ? error.message : String(error);
    if (errStr.includes("resource-exhausted") || errStr.includes("Quota exceeded")) {
      markFirestoreQuotaExceeded();
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, `sefaz_pending_keys/${docId}`);
  }
}

/**
 * Sincroniza dados locais com o Firestore mantendo cópia resiliente no navegador (IndexedDB/localStorage)
 */
export async function migrateLegacyBrowserDataAndPurgeLocal(): Promise<void> {
  if (typeof window === 'undefined') return;
  const user = auth.currentUser;
  if (!user || isFirestoreQuotaExceeded()) return;

  const rawCompanies = localStorage.getItem(COMPANIES_STORAGE_KEY);
  if (rawCompanies) {
    try {
      const companies: Company[] = JSON.parse(rawCompanies);
      await syncCompaniesToCloud(companies, true);
    } catch {}
  }

  const rawDocs = localStorage.getItem(SEFAZ_DOCUMENTS_KEY);
  if (rawDocs && !isFirestoreQuotaExceeded()) {
    try {
      const legacyDocs: DocumentoFiscalArmazenado[] = JSON.parse(rawDocs);
      if (legacyDocs.length > 0) {
        await syncSefazDocumentsToCloud(legacyDocs);
      }
    } catch {}
  }

  const rawPending = localStorage.getItem(SEFAZ_PENDING_KEYS_STORAGE);
  if (rawPending && !isFirestoreQuotaExceeded()) {
    try {
      const map: Record<string, string[]> = JSON.parse(rawPending);
      for (const [cnpj, keys] of Object.entries(map)) {
        if (Array.isArray(keys) && keys.length > 0) {
          await syncPendingKeysToCloud(cnpj, keys);
        }
      }
    } catch {}
  }
}

/**
 * Gestão de Funcionários e Usuários (/office_users/{emailKey})
 */
export async function carregarPerfilFuncionarioAtual(user: User): Promise<OfficeUser | null> {
  if (!user.email) return null;
  const emailLower = user.email.trim().toLowerCase();
  const emailKey = sanitizeEmailToKey(emailLower);
  const isMaster = isMasterAdminEmail(emailLower) || user.uid === 'cQNrcS8yObVRBT2OhtVXkVz7yc72';

  try {
    const ref = doc(db, 'office_users', emailKey);
    const snap = await getDoc(ref).catch(() => null);
    if (snap && snap.exists()) {
      const data = snap.data() as OfficeUser;
      const normalized: OfficeUser = {
        ...data,
        deveAlterarSenha: data.deveAlterarSenha ?? false,
      };
      emitStatus({ officeProfile: normalized });
      return normalized;
    }

    // Se for o Administrador Master no primeiro login, cria seu registro mestre com a senha padrão Moreira@2026
    if (isMaster) {
      const defaultHash = await hashPasswordSha256('Moreira@2026');
      const masterRecord: OfficeUser = {
        orgId: ORG_ID,
        emailKey,
        email: emailLower,
        nome: user.displayName || 'Daymisson Moreira de Lima (Gerente Master)',
        cargo: 'ADMIN',
        status: 'ATIVO',
        passwordHash: defaultHash,
        deveAlterarSenha: true,
        updatedByUid: user.uid,
        updatedAtIso: new Date().toISOString(),
      };

      try {
        await setDoc(ref, masterRecord);
      } catch (writeErr) {
        console.warn('Registro mestre criado em memória, falha ao persistir:', writeErr);
      }

      // Também registra os outros aliases mestres caso precise
      for (const alias of MASTER_ADMIN_EMAILS) {
        if (alias !== emailLower) {
          const aKey = sanitizeEmailToKey(alias);
          try {
            await setDoc(doc(db, 'office_users', aKey), {
              ...masterRecord,
              emailKey: aKey,
              email: alias,
            });
          } catch {}
        }
      }

      emitStatus({ officeProfile: masterRecord });
      return masterRecord;
    }

    return null;
  } catch (error) {
    if (isMaster) {
      const defaultHash = await hashPasswordSha256('Moreira@2026');
      const fallbackRecord: OfficeUser = {
        orgId: ORG_ID,
        emailKey,
        email: emailLower,
        nome: user.displayName || 'Daymisson Moreira de Lima (Gerente Master)',
        cargo: 'ADMIN',
        status: 'ATIVO',
        passwordHash: defaultHash,
        deveAlterarSenha: true,
        updatedByUid: user.uid,
        updatedAtIso: new Date().toISOString(),
      };
      emitStatus({ officeProfile: fallbackRecord });
      return fallbackRecord;
    }
    handleFirestoreError(error, OperationType.GET, `office_users/${emailKey}`);
  }
}

export async function alterarSenhaUsuario(params: {
  emailKey: string;
  novaSenha: string;
}): Promise<OfficeUser> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Usuário precisa estar autenticado no sistema.');
  }

  const novaSenhaLimpa = params.novaSenha.trim();
  if (novaSenhaLimpa.length < 6) {
    throw new Error('A nova senha deve ter no mínimo 6 caracteres.');
  }

  const ref = doc(db, 'office_users', params.emailKey);
  const snap = await getDoc(ref).catch(() => null);
  const newHash = await hashPasswordSha256(novaSenhaLimpa);
  const nowIso = new Date().toISOString();

  let atualizado: OfficeUser;
  if (snap && snap.exists()) {
    const atual = snap.data() as OfficeUser;
    atualizado = {
      ...atual,
      passwordHash: newHash,
      deveAlterarSenha: false,
      updatedByUid: user.uid,
      updatedAtIso: nowIso,
    };
  } else {
    const emailLower = (user.email || '').trim().toLowerCase();
    const isMaster = isMasterAdminEmail(emailLower) || user.uid === 'cQNrcS8yObVRBT2OhtVXkVz7yc72';
    atualizado = {
      orgId: ORG_ID,
      emailKey: params.emailKey,
      email: emailLower,
      nome: user.displayName || (isMaster ? 'Daymisson Moreira de Lima (Gerente Master)' : 'Funcionário'),
      cargo: isMaster ? 'ADMIN' : 'FUNCIONARIO',
      status: 'ATIVO',
      passwordHash: newHash,
      deveAlterarSenha: false,
      updatedByUid: user.uid,
      updatedAtIso: nowIso,
    };
  }

  await setDoc(ref, atualizado);
  emitStatus({ officeProfile: atualizado });
  return atualizado;
}

export async function adminCadastrarFuncionarioComLink(params: {
  nome: string;
  email: string;
  cargo: 'ADMIN' | 'FUNCIONARIO';
}): Promise<{ record: OfficeUser; emailEnviado: boolean; mensagem: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Você precisa estar autenticado como Administrador.');
  }

  const emailLower = params.email.trim().toLowerCase().slice(0, 254);
  const emailKey = sanitizeEmailToKey(emailLower);
  const nomeLimpo = params.nome.trim().slice(0, 150);

  if (!emailLower.includes('@') || nomeLimpo.length < 2) {
    throw new Error('Preencha um nome válido e um e-mail válido para o funcionário.');
  }

  const tempPassword =
    'ML@' + Math.random().toString(36).substring(2, 8) + '!' + Date.now().toString().slice(-4);
  let emailEnviado = false;
  let detalheEnvio = '';

  try {
    await createSecondaryUserAndSendReset(emailLower, tempPassword);
    emailEnviado = true;
    detalheEnvio = 'E-mail com link para criação de senha enviado com sucesso.';
  } catch (err: any) {
    console.warn('Falha no envio de e-mail de criação de senha:', err);
    detalheEnvio = err?.message || 'Falha no disparo do e-mail';
  }

  const passwordHash = await hashPasswordSha256(tempPassword);

  const record: OfficeUser = {
    orgId: ORG_ID,
    emailKey,
    email: emailLower,
    nome: nomeLimpo,
    cargo: params.cargo,
    status: 'ATIVO',
    passwordHash,
    deveAlterarSenha: true,
    updatedByUid: user.uid,
    updatedAtIso: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'office_users', emailKey), record);
    return {
      record,
      emailEnviado,
      mensagem: emailEnviado
        ? `Funcionário ${nomeLimpo} criado com sucesso! Um e-mail com o link de criação de senha foi enviado para ${emailLower}.`
        : `Funcionário ${nomeLimpo} cadastrado no banco de dados. Atenção: ${detalheEnvio}.`,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `office_users/${emailKey}`);
  }
}

export async function adminEditarFuncionario(params: {
  emailKey: string;
  nome: string;
  cargo: 'ADMIN' | 'FUNCIONARIO';
  status: 'ATIVO' | 'BLOQUEADO';
}): Promise<OfficeUser> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Você precisa estar autenticado como Administrador.');
  }

  const ref = doc(db, 'office_users', params.emailKey);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('Usuário não encontrado para edição.');
  }

  const atual = snap.data() as OfficeUser;
  const atualizado: OfficeUser = {
    ...atual,
    nome: params.nome.trim().slice(0, 150),
    cargo: params.cargo,
    status: params.status,
    updatedByUid: user.uid,
    updatedAtIso: new Date().toISOString(),
  };

  try {
    await setDoc(ref, atualizado);
    return atualizado;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `office_users/${params.emailKey}`);
  }
}

export async function adminReenviarLinkSenha(email: string): Promise<void> {
  await sendPasswordReset(email.trim().toLowerCase());
}

export async function adminSalvarFuncionario(params: {
  nome: string;
  email: string;
  cargo: 'ADMIN' | 'FUNCIONARIO';
  status: 'ATIVO' | 'BLOQUEADO';
  senhaInicial?: string;
  passwordHashExistente?: string;
  deveAlterarSenha?: boolean;
}): Promise<OfficeUser> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Você precisa estar autenticado como Administrador.');
  }

  const emailLower = params.email.trim().toLowerCase().slice(0, 254);
  const emailKey = sanitizeEmailToKey(emailLower);
  const nomeLimpo = params.nome.trim().slice(0, 150);

  if (!emailLower.includes('@') || nomeLimpo.length < 2) {
    throw new Error('Preencha um nome válido e um e-mail válido para o funcionário.');
  }

  const passwordHash = params.senhaInicial
    ? await hashPasswordSha256(params.senhaInicial)
    : params.passwordHashExistente || (await hashPasswordSha256('123456'));

  const record: OfficeUser = {
    orgId: ORG_ID,
    emailKey,
    email: emailLower,
    nome: nomeLimpo,
    cargo: params.cargo,
    status: params.status,
    passwordHash,
    deveAlterarSenha: params.deveAlterarSenha ?? true,
    updatedByUid: user.uid,
    updatedAtIso: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'office_users', emailKey), record);
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `office_users/${emailKey}`);
  }
}

export async function adminExcluirFuncionario(emailKey: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const safeKey = sanitizeId(emailKey);
  try {
    await deleteDoc(doc(db, 'office_users', safeKey));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `office_users/${safeKey}`);
  }
}

/**
 * Inicia os listeners em tempo real do Firestore assim que o usuário autentica
 */
function startRealtimeListeners() {
  stopRealtimeListeners();

  const user = auth.currentUser;
  if (!user) return;

  // 1. Listener em tempo real de Empresas (/companies)
  const qCompanies = query(collection(db, 'companies'), where('orgId', '==', ORG_ID));
  unsubCompanies = onSnapshot(
    qCompanies,
    snapshot => {
      emitStatus({ cloudCompaniesCount: snapshot.size, lastSyncedAt: new Date().toLocaleTimeString('pt-BR') });
      if (snapshot.empty) return;

      isApplyingRemoteUpdate = true;
      try {
        const rawLocal = localStorage.getItem(COMPANIES_STORAGE_KEY);
        const localList: Company[] = rawLocal ? JSON.parse(rawLocal) : [];
        const mapByCnpj = new Map<string, Company>();

        localList.forEach(c => {
          const clean = (c.cnpj || '').replace(/\D/g, '');
          if (clean) mapByCnpj.set(clean, c);
        });

        let changed = false;
        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          const clean = (data.cnpj || '').replace(/\D/g, '');
          if (clean && data.details && typeof data.details === 'object') {
            const existing = mapByCnpj.get(clean);
            const cloudDetails = data.details as Company;

            const merged: Company = {
              ...cloudDetails,
              ...(existing || {}),
              cnpj: existing?.cnpj || cloudDetails.cnpj || clean,
              razaoSocial: existing?.razaoSocial || data.razaoSocial || cloudDetails.razaoSocial || '',
              certificateFile: existing && existing.certificateFile !== undefined ? existing.certificateFile : cloudDetails.certificateFile,
              certificatePassword: existing && existing.certificatePassword !== undefined ? existing.certificatePassword : cloudDetails.certificatePassword,
              certificateName: existing && existing.certificateName !== undefined ? existing.certificateName : cloudDetails.certificateName,
              certificateValidTo: existing && existing.certificateValidTo !== undefined ? existing.certificateValidTo : cloudDetails.certificateValidTo,
              certificateIssuer: existing && existing.certificateIssuer !== undefined ? existing.certificateIssuer : cloudDetails.certificateIssuer,
              certificateSerialNumber: existing && existing.certificateSerialNumber !== undefined ? existing.certificateSerialNumber : cloudDetails.certificateSerialNumber,
              consultaNfeHabilitada: existing && existing.consultaNfeHabilitada !== undefined ? existing.consultaNfeHabilitada : cloudDetails.consultaNfeHabilitada,
              autoPollEnabled: existing && existing.autoPollEnabled !== undefined ? existing.autoPollEnabled : cloudDetails.autoPollEnabled,
              varredura90DiasConcluida: existing && existing.varredura90DiasConcluida !== undefined ? existing.varredura90DiasConcluida : cloudDetails.varredura90DiasConcluida,
              ultimoNSU: existing && existing.ultimoNSU !== undefined ? existing.ultimoNSU : (cloudDetails.ultimoNSU || '0'),
              maxNSU: existing && existing.maxNSU !== undefined ? existing.maxNSU : (cloudDetails.maxNSU || '0'),
              lastPolledAt: existing?.lastPolledAt || cloudDetails.lastPolledAt,
              lastPollStatus: existing?.lastPollStatus || cloudDetails.lastPollStatus,
              nextAllowedPollAt: existing?.nextAllowedPollAt ?? cloudDetails.nextAllowedPollAt,
            };
            mapByCnpj.set(clean, merged);
            lastSyncedCompanySig.set(clean, getCompanySyncSignature(merged));
            changed = true;
          }
        });

        if (changed) {
          const updatedList = Array.from(mapByCnpj.values()).sort((a, b) =>
            (a.razaoSocial || '').localeCompare(b.razaoSocial || '', 'pt-BR', { sensitivity: 'base' })
          );
          localStorage.setItem(COMPANIES_STORAGE_KEY, JSON.stringify(updatedList));
          window.dispatchEvent(new Event(COMPANIES_UPDATED_EVENT));
        }
      } catch (err) {
        console.error('Erro ao mesclar empresas da nuvem:', err);
      } finally {
        isApplyingRemoteUpdate = false;
      }
    },
    error => {
      emitStatus({ errorMessage: error.message });
      handleFirestoreError(error, OperationType.LIST, 'companies');
    }
  );

  // 2. Listener em tempo real de Documentos Fiscais (/sefaz_documents) — Mesclado com os documentos locais!
  const qDocs = query(collection(db, 'sefaz_documents'), where('orgId', '==', ORG_ID));
  unsubDocs = onSnapshot(
    qDocs,
    snapshot => {
      emitStatus({ cloudDocsCount: snapshot.size, lastSyncedAt: new Date().toLocaleTimeString('pt-BR') });

      isApplyingRemoteUpdate = true;
      try {
        const docMap = new Map<string, DocumentoFiscalArmazenado>();

        // Primeiro preserva todos os documentos já existentes localmente (memória + localStorage)
        let localSavedDocs: DocumentoFiscalArmazenado[] = [];
        try {
          const rawLocalDocs = localStorage.getItem(SEFAZ_DOCUMENTS_KEY);
          if (rawLocalDocs) {
            const parsed = JSON.parse(rawLocalDocs);
            if (Array.isArray(parsed)) localSavedDocs = parsed;
          }
        } catch {}

        [...localSavedDocs, ...runtimeCloudDocs].forEach(d => {
          const cleanKey = (d.chave || '').replace(/\D/g, '');
          const cleanEmp = (d.empresaCnpj || '').replace(/\D/g, '');
          if (cleanKey.length === 44 && cleanEmp) {
            const mapKey = `${cleanEmp}_${cleanKey}`;
            const existing = docMap.get(mapKey);
            if (!existing || d.tipo === 'NFE_COMPLETA') {
              docMap.set(mapKey, d);
            }
          }
        });

        // Agora mescla os documentos vindos do Firestore sem apagar os documentos locais de meses mais recentes
        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          const cleanKey = (data.chave || '').replace(/\D/g, '');
          const cleanEmp = (data.empresaCnpj || '').replace(/\D/g, '');
          if (cleanKey.length !== 44) return;

          const mapKey = `${cleanEmp}_${cleanKey}`;
          const xmlContent = typeof data.xmlContent === 'string' ? data.xmlContent : '';
          if (xmlContent && !isXmlSinteticoInvalido(xmlContent)) {
            definirXmlCacheMemoria(cleanKey, xmlContent);
            definirXmlCacheMemoria(mapKey, xmlContent);
          }

          const meta = (data.docMetadata || {}) as Partial<DocumentoFiscalArmazenado>;
          const isCompleta = Boolean(xmlContent && xmlContent.includes('<infNFe'));
          const existingLocal = docMap.get(mapKey);
          const mergedDoc: DocumentoFiscalArmazenado = {
            ...(existingLocal || {}),
            ...(meta as DocumentoFiscalArmazenado),
            id: mapKey,
            chave: cleanKey,
            empresaCnpj: cleanEmp,
            situacao: data.situacao || meta.situacao || existingLocal?.situacao || 'AUTORIZADA',
            dataEmissao: data.dataEmissao || meta.dataEmissao || existingLocal?.dataEmissao || new Date().toISOString(),
            tipo: isCompleta || existingLocal?.tipo === 'NFE_COMPLETA'
              ? 'NFE_COMPLETA'
              : (meta.tipo === 'RESUMO' ? 'RESUMO' : 'NFE_COMPLETA'),
            xml: xmlContent || existingLocal?.xml || '',
          };

          lastSyncedDocSig.set(sanitizeId(mapKey), getDocSyncSignature(mergedDoc, isCompleta));
          docMap.set(mapKey, mergedDoc);
        });

        const allMerged = Array.from(docMap.values()).sort((a, b) => {
          const tA = new Date(a.dataEmissao).getTime() || 0;
          const tB = new Date(b.dataEmissao).getTime() || 0;
          return tB - tA;
        });

        runtimeCloudDocs = allMerged;
        try {
          const lightDocs = allMerged.map(d => ({ ...d, xml: '' }));
          localStorage.setItem(SEFAZ_DOCUMENTS_KEY, JSON.stringify(lightDocs));
        } catch {}
        window.dispatchEvent(new CustomEvent(SEFAZ_DOCS_UPDATED_EVENT, { detail: { count: allMerged.length } }));
      } catch (err) {
        console.error('Erro ao atualizar NF-es da nuvem:', err);
      } finally {
        isApplyingRemoteUpdate = false;
      }
    },
    error => {
      emitStatus({ errorMessage: error.message });
      handleFirestoreError(error, OperationType.LIST, 'sefaz_documents');
    }
  );

  // 3. Listener em tempo real de Chaves Pendentes (/sefaz_pending_keys)
  const qPending = query(collection(db, 'sefaz_pending_keys'), where('orgId', '==', ORG_ID));
  unsubPending = onSnapshot(
    qPending,
    snapshot => {
      isApplyingRemoteUpdate = true;
      try {
        const nextMap: Record<string, string[]> = {};
        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          const cleanEmp = (data.empresaCnpj || '').replace(/\D/g, '');
          if (cleanEmp && Array.isArray(data.pendingKeys)) {
            nextMap[cleanEmp] = data.pendingKeys;
          }
        });
        runtimePendingKeys = nextMap;
      } catch {} finally {
        isApplyingRemoteUpdate = false;
      }
    },
    error => {
      handleFirestoreError(error, OperationType.LIST, 'sefaz_pending_keys');
    }
  );

  // 4. Se for Administrador, escuta todos os funcionários (/office_users)
  if (isMasterAdminEmail(user.email) || currentStatus.officeProfile?.cargo === 'ADMIN') {
    const qUsers = query(collection(db, 'office_users'), where('orgId', '==', ORG_ID));
    unsubOfficeUsers = onSnapshot(
      qUsers,
      snapshot => {
        const list: OfficeUser[] = snapshot.docs.map(d => d.data() as OfficeUser);
        list.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
        runtimeOfficeUsers = list;
        window.dispatchEvent(new CustomEvent(OFFICE_USERS_UPDATED_EVENT, { detail: list }));
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, 'office_users');
      }
    );
  }
}

function stopRealtimeListeners() {
  if (unsubCompanies) {
    unsubCompanies();
    unsubCompanies = null;
  }
  if (unsubDocs) {
    unsubDocs();
    unsubDocs = null;
  }
  if (unsubPending) {
    unsubPending();
    unsubPending = null;
  }
  if (unsubOfficeUsers) {
    unsubOfficeUsers();
    unsubOfficeUsers = null;
  }
}

// Inicializa o observador de autenticação do Firebase
if (typeof window !== 'undefined') {
  onAuthStateChanged(auth, async user => {
    if (user) {
      const profile = await carregarPerfilFuncionarioAtual(user).catch(() => null);
      emitStatus({
        user,
        officeProfile: profile,
        authReady: true,
        errorMessage: null,
      });
      startRealtimeListeners();
      migrateLegacyBrowserDataAndPurgeLocal().catch(() => {});
    } else {
      stopRealtimeListeners();
      runtimeCloudDocs = [];
      runtimePendingKeys = {};
      runtimeOfficeUsers = [];
      emitStatus({
        user,
        officeProfile: null,
        authReady: true,
        cloudCompaniesCount: 0,
        cloudDocsCount: 0,
      });
    }
  });
}
