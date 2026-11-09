/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Gerenciador de Armazenamento Local de Documentos Fiscais e Logs do Robô SEFAZ
 * - Preserva 100% da integridade dos XMLs oficiais da SEFAZ (procNFe, resNFe, procEventoNFe)
 * - NUNCA sintetiza ou adultera tags de XML fiscal
 * - Reconcilia eventos (Cancelamento, Ciência, Confirmação, CC-e) sem sobrescrever os dados da NF-e
 */

import { DocumentoFiscalArmazenado, RoboLogItem, RoboVarreduraConfig, SituacaoFiscal } from '../types/sefazTypes';
import { Company } from '../types_debits';
import { DocumentoDFeDescompactado } from './sefazDfeService';
import { loadStoredCompanies, saveStoredCompanies } from '../utils/companyStorage';
import {
  salvarXmlNoIndexedDb,
  obterXmlDoIndexedDb,
  obterXmlCacheMemoria,
  definirXmlCacheMemoria,
  hidratarCacheXmlsDoIndexedDb,
  limparTodosXmlsIndexedDb,
  isXmlSinteticoInvalido,
  isXmlNfeCompletaOficial
} from './sefazIndexedDb';
import {
  syncSefazDocumentsToCloud,
  syncPendingKeysToCloud,
  isApplyingCloudSnapshot,
  getRuntimeCloudDocs,
  setRuntimeCloudDocs,
  getRuntimePendingKeys,
  setRuntimePendingKeys,
  deleteSefazDocumentFromCloud,
  clearSefazDocumentsInCloud
} from './firebaseSyncService';

const SEFAZ_DOCUMENTS_KEY = 'moreira_lima_sefaz_docs_v3';
const SEFAZ_ROBO_CONFIG_KEY = 'moreira_lima_sefaz_robo_config_v2';
const SEFAZ_ROBO_LOGS_KEY = 'moreira_lima_sefaz_robo_logs_v2';
const SEFAZ_PENDING_KEYS_STORAGE = 'moreira_lima_sefaz_pending_keys_v1';
const SEFAZ_CLEAN_SLATE_KEY = 'moreira_lima_sefaz_clean_slate_v3_20261025';

export const SEFAZ_DOCS_UPDATED_EVENT = 'moreira_lima_sefaz_docs_updated';
export const SEFAZ_ROBO_LOGS_UPDATED_EVENT = 'moreira_lima_sefaz_robo_logs_updated';

/**
 * Gerencia a fila de chaves (44 dígitos) que receberam Resumo/Ciência
 * diretamente na memória sincronizada com o Firestore (/sefaz_pending_keys).
 */
export function obterChavesPendentesEmpresa(cnpj: string): string[] {
  const cleanCnpj = (cnpj || '').replace(/\D/g, '');
  if (!cleanCnpj) return [];
  const runtimeKeys = getRuntimePendingKeys(cleanCnpj);
  if (typeof window === 'undefined') return runtimeKeys;
  try {
    const raw = localStorage.getItem(SEFAZ_PENDING_KEYS_STORAGE);
    const map = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    const localKeys = Array.isArray(map[cleanCnpj]) ? map[cleanCnpj] : [];
    return Array.from(new Set([...runtimeKeys, ...localKeys]));
  } catch {
    return runtimeKeys;
  }
}

export function salvarChavesPendentesEmpresa(cnpj: string, chaves: string[]): void {
  const cleanCnpj = (cnpj || '').replace(/\D/g, '');
  if (!cleanCnpj) return;
  const limpas = Array.from(
    new Set(chaves.map(c => String(c || '').replace(/\D/g, '')).filter(c => c.length === 44))
  );
  const anteriores = getRuntimePendingKeys(cleanCnpj);
  const mudou =
    anteriores.length !== limpas.length ||
    limpas.some((k, idx) => anteriores[idx] !== k);

  setRuntimePendingKeys(cleanCnpj, limpas);
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(SEFAZ_PENDING_KEYS_STORAGE);
      const map = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
      map[cleanCnpj] = limpas;
      localStorage.setItem(SEFAZ_PENDING_KEYS_STORAGE, JSON.stringify(map));
    } catch {}
  }
  if (mudou && !isApplyingCloudSnapshot()) {
    syncPendingKeysToCloud(cleanCnpj, limpas).catch(() => {});
  }
}

export function adicionarChavePendenteInterna(cnpj: string, chave: string): void {
  const cleanChave = (chave || '').replace(/\D/g, '');
  if (cleanChave.length !== 44) return;
  const atuais = obterChavesPendentesEmpresa(cnpj);
  if (!atuais.includes(cleanChave)) {
    salvarChavesPendentesEmpresa(cnpj, [...atuais, cleanChave]);
  }
}

export function removerChavePendenteInterna(cnpj: string, chave: string): void {
  const cleanChave = (chave || '').replace(/\D/g, '');
  if (!cleanChave) return;
  const atuais = obterChavesPendentesEmpresa(cnpj);
  if (atuais.includes(cleanChave)) {
    salvarChavesPendentesEmpresa(
      cnpj,
      atuais.filter(c => c !== cleanChave)
    );
  }
}

/**
 * Expurga todos os XMLs capturados anteriormente (localStorage, IndexedDB, Cache em memória,
 * NSUs salvos por empresa e Repositório no Servidor) para garantir que apenas XMLs 100% originais
 * da SEFAZ sejam armazenados daqui em diante.
 */
export async function expurgarTodosDocumentosECacheSefaz(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // 1. Remove chaves de documentos atuais e legadas
    localStorage.removeItem('moreira_lima_sefaz_docs_v1');
    localStorage.removeItem('moreira_lima_sefaz_docs_v2');
    localStorage.removeItem(SEFAZ_DOCUMENTS_KEY);
    localStorage.removeItem(SEFAZ_ROBO_LOGS_KEY);
    localStorage.removeItem(SEFAZ_PENDING_KEYS_STORAGE);

    // 2. Remove todos os cursores de NSU do localStorage
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('sefaz_ult_nsu_') || k.startsWith('sefaz_nfe_'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // 3. Reseta NSUs e cooldown nas empresas cadastradas (preservando os certificados A1)
    try {
      const companies = loadStoredCompanies();
      const updated = companies.map(c => ({
        ...c,
        ultimoNSU: '0',
        maxNSU: '0',
        nextAllowedPollAt: undefined,
        lastPollStatus: undefined
      }));
      saveStoredCompanies(updated);
    } catch {}

    // 4. Limpa IndexedDB e memória
    await limparTodosXmlsIndexedDb();

    // 5. Limpa repositório no servidor
    fetch('/api/sefaz/repositorio/limpar-tudo', { method: 'POST' }).catch(() => {});

    window.dispatchEvent(new CustomEvent(SEFAZ_DOCS_UPDATED_EVENT, { detail: { count: 0 } }));
    window.dispatchEvent(new CustomEvent(SEFAZ_ROBO_LOGS_UPDATED_EVENT));
  } catch (e) {
    console.warn('Erro ao expurgar cache SEFAZ:', e);
  }
}

// Na inicialização no navegador: executa o expurgo automático único (v3) caso ainda não tenha sido aplicado,
// garantindo que qualquer resquício de XML sintético antigo seja 100% eliminado!
if (typeof window !== 'undefined') {
  const alreadyPurged = localStorage.getItem(SEFAZ_CLEAN_SLATE_KEY) === 'done';
  if (!alreadyPurged) {
    localStorage.setItem(SEFAZ_CLEAN_SLATE_KEY, 'done');
    expurgarTodosDocumentosECacheSefaz().catch(() => {});
  } else {
    hidratarCacheXmlsDoIndexedDb()
      .then(() => {
        window.dispatchEvent(new CustomEvent(SEFAZ_DOCS_UPDATED_EVENT));
      })
      .catch(() => {});
  }
}

// Helper para extrair texto de tags XML simples
function extrairTag(xml: string, tag: string): string {
  const regex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
}

// Extrai tag aninhada dentro de um bloco (ex: <emit><xNome> ou <dest><CNPJ>)
function extrairTagEmBloco(xml: string, blocoTag: string, tagInterna: string): string {
  const blocoRegex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${blocoTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${blocoTag}>`, 'i');
  const blocoMatch = xml.match(blocoRegex);
  if (!blocoMatch) return '';
  return extrairTag(blocoMatch[1], tagInterna);
}

function formatarData(dataIsoOuStr?: string): { formatada: string; competencia: string } {
  if (!dataIsoOuStr) {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return {
      formatada: `${d}/${m}/${y} ${h}:${min}:${s}`,
      competencia: `${m}/${y}`
    };
  }

  try {
    const date = new Date(dataIsoOuStr);
    if (!isNaN(date.getTime())) {
      const d = String(date.getDate()).padStart(2, '0');
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const y = date.getFullYear();
      const h = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      const s = String(date.getSeconds()).padStart(2, '0');
      return {
        formatada: `${d}/${m}/${y} ${h}:${min}:${s}`,
        competencia: `${m}/${y}`
      };
    }
  } catch {}

  return {
    formatada: dataIsoOuStr,
    competencia: dataIsoOuStr.slice(0, 7)
  };
}

export function formatarCnpj(cnpj: string): string {
  const c = (cnpj || '').replace(/\D/g, '');
  if (c.length === 14) {
    return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (c.length === 11) {
    return c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return cnpj;
}

/**
 * Classifica o tipo real de um XML bruto da SEFAZ
 */
export function classificarTipoXmlSefaz(
  xml: string,
  schema?: string
): 'NFE_COMPLETA' | 'RESUMO' | 'EVENTO' | 'OUTRO' {
  const s = (schema || '').toLowerCase();
  if (isXmlSinteticoInvalido(xml)) {
    if (s.includes('resnfe')) return 'RESUMO';
    if (s.includes('evento')) return 'EVENTO';
    return 'RESUMO';
  }
  if (isXmlNfeCompletaOficial(xml) || (xml && xml.includes('infNFe')) || (!xml && s.includes('procnfe'))) {
    return 'NFE_COMPLETA';
  }
  if (xml.includes('<resNFe') || xml.includes(':resNFe') || s.includes('resnfe')) {
    return 'RESUMO';
  }
  if (xml.includes('<procEventoNFe') || xml.includes('<resEvento') || xml.includes(':procEventoNFe') || xml.includes(':resEvento') || s.includes('evento')) {
    return 'EVENTO';
  }
  if (s.includes('procnfe')) {
    return 'NFE_COMPLETA';
  }
  return 'OUTRO';
}

/**
 * Retorna a prioridade hierárquica do tipo de documento para evitar que um Evento ou Resumo
 * sobrescreva os dados completos de um procNFe.
 */
function obterPrioridadeTipo(tipo: DocumentoFiscalArmazenado['tipo']): number {
  switch (tipo) {
    case 'NFE_COMPLETA':
      return 3;
    case 'RESUMO':
      return 2;
    case 'EVENTO':
      return 1;
    default:
      return 0;
  }
}

/**
 * Obtém o XML original autêntico armazenado (da memória ou do objeto)
 */
export function obterXmlAutencticoDocumento(doc: Partial<DocumentoFiscalArmazenado>): string {
  if (doc.xml && !isXmlSinteticoInvalido(doc.xml)) {
    return doc.xml;
  }
  const cleanKey = (doc.chave || '').replace(/\D/g, '');
  const cachedByKey = obterXmlCacheMemoria(cleanKey);
  if (cachedByKey && !isXmlSinteticoInvalido(cachedByKey)) {
    return cachedByKey;
  }
  const cachedById = obterXmlCacheMemoria(doc.id || '');
  if (cachedById && !isXmlSinteticoInvalido(cachedById)) {
    return cachedById;
  }
  return '';
}

/**
 * Busca assincronamente o XML original no IndexedDB caso ainda não esteja em memória
 */
export async function carregarXmlAutenticoAsync(doc: DocumentoFiscalArmazenado): Promise<string> {
  const syncXml = obterXmlAutencticoDocumento(doc);
  if (syncXml) return syncXml;

  const cleanKey = (doc.chave || '').replace(/\D/g, '');
  if (cleanKey) {
    const fromDbKey = await obterXmlDoIndexedDb(cleanKey);
    if (fromDbKey && !isXmlSinteticoInvalido(fromDbKey)) return fromDbKey;
  }
  if (doc.id) {
    const fromDbId = await obterXmlDoIndexedDb(doc.id);
    if (fromDbId && !isXmlSinteticoInvalido(fromDbId)) return fromDbId;
  }
  return '';
}

/**
 * Converte um DocumentoDFeDescompactado da SEFAZ em DocumentoFiscalArmazenado estruturado
 */
export function converterDfeParaDocumentoArmazenado(
  raw: DocumentoDFeDescompactado,
  empresa: Company
): DocumentoFiscalArmazenado {
  const xml = isXmlSinteticoInvalido(raw.xml) ? '' : (raw.xml || '');
  const cleanEmpresaCnpj = (empresa.cnpj || '').replace(/\D/g, '');

  // Extrai chave de acesso
  let chave = raw.chave || extrairTag(xml, 'chNFe') || extrairTag(xml, 'chDFe') || `SEM_CHAVE_${raw.nsu}`;
  const cleanChave = chave.replace(/\D/g, '');
  const temChave44 = cleanChave.length === 44;
  if (temChave44) {
    chave = cleanChave;
  }

  const tipoReal = classificarTipoXmlSefaz(xml, raw.schema);

  // Extração de Número da Nota e Série
  let nNF = raw.nNF || (tipoReal === 'NFE_COMPLETA' ? extrairTagEmBloco(xml, 'ide', 'nNF') : '');
  let serie = raw.serie || (tipoReal === 'NFE_COMPLETA' ? extrairTagEmBloco(xml, 'ide', 'serie') : '');

  if (temChave44) {
    if (!nNF || nNF === 'S/N') {
      nNF = parseInt(cleanChave.slice(25, 34), 10).toString();
    }
    if (!serie) {
      serie = parseInt(cleanChave.slice(22, 25), 10).toString();
    }
  }
  if (!nNF) nNF = 'S/N';
  if (!serie) serie = '1';

  // Extração estrita do CNPJ do Emitente:
  // Na chave de 44 dígitos da NF-e, as posições 6 a 20 SÃO SEMPRE o CNPJ do Emitente da Nota!
  let emitCnpj = '';
  if (temChave44) {
    emitCnpj = cleanChave.slice(6, 20);
  } else if (tipoReal === 'NFE_COMPLETA') {
    emitCnpj = extrairTagEmBloco(xml, 'emit', 'CNPJ') || extrairTagEmBloco(xml, 'emit', 'CPF') || raw.emitCNPJ || '';
  } else if (tipoReal === 'RESUMO') {
    emitCnpj = extrairTag(xml, 'CNPJ') || extrairTag(xml, 'CPF') || raw.emitCNPJ || '';
  } else {
    emitCnpj = raw.emitCNPJ || '';
  }
  const cleanEmit = emitCnpj.replace(/\D/g, '');

  // Extração do Nome do Emitente (apenas de procNFe ou resNFe, NUNCA de evento)
  let emitNome = '';
  if (tipoReal === 'NFE_COMPLETA') {
    emitNome = extrairTagEmBloco(xml, 'emit', 'xNome') || raw.emitNome || '';
  } else if (tipoReal === 'RESUMO') {
    emitNome = extrairTag(xml, 'xNome') || raw.emitNome || '';
  } else {
    emitNome = raw.emitNome || '';
  }

  // Extração do Destinatário
  let destCnpj = raw.destCNPJ || (tipoReal === 'NFE_COMPLETA' ? (extrairTagEmBloco(xml, 'dest', 'CNPJ') || extrairTagEmBloco(xml, 'dest', 'CPF')) : '');
  let destNome = raw.destNome || (tipoReal === 'NFE_COMPLETA' ? extrairTagEmBloco(xml, 'dest', 'xNome') : '');
  const cleanDest = (destCnpj || '').replace(/\D/g, '');

  // Se o emitente for a própria empresa monitorada, garante razão social correta
  if (cleanEmit && cleanEmpresaCnpj && cleanEmit === cleanEmpresaCnpj) {
    if (!emitNome) {
      emitNome = empresa.razaoSocial;
    }
  }

  // Se ainda não tiver emitNome, verifica empresas cadastradas
  if (!emitNome) {
    const todasEmpresas = (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('moreira_lima_companies') || '[]') : []) as Company[];
    const cadastrada = todasEmpresas.find(c => (c.cnpj || '').replace(/\D/g, '') === cleanEmit);
    if (cadastrada) {
      emitNome = cadastrada.razaoSocial;
    } else if (cleanEmit) {
      emitNome = `CNPJ ${formatarCnpj(cleanEmit)} (Aguardando XML da NF-e)`;
    } else {
      emitNome = 'Emitente não identificado';
    }
  }

  // Identificação P (Própria) ou T (Terceiro)
  const emitenteTipo: 'PROPRIA' | 'TERCEIRO' = cleanEmit === cleanEmpresaCnpj ? 'PROPRIA' : 'TERCEIRO';

  // Se o destinatário estiver vazio e a nota foi emitida por terceiro, o destinatário é a empresa consultada
  if (!cleanDest && emitenteTipo === 'TERCEIRO') {
    destCnpj = cleanEmpresaCnpj;
    destNome = empresa.razaoSocial;
  }
  const destinatarioTipo: 'PROPRIA' | 'TERCEIRO' = (destCnpj || '').replace(/\D/g, '') === cleanEmpresaCnpj ? 'PROPRIA' : 'TERCEIRO';

  // Classificação exata de Operação:
  // - Se emitida pela própria empresa (cleanEmit === cleanEmpresaCnpj) => SAIDA (Emitida)
  // - Se emitida por terceiro contra a empresa (cleanEmit !== cleanEmpresaCnpj) => ENTRADA (Recebida)
  const tipoOperacao: 'ENTRADA' | 'SAIDA' = cleanEmit === cleanEmpresaCnpj ? 'SAIDA' : 'ENTRADA';

  // Datas
  let dataEmissao = raw.dataEmissao;
  if (!dataEmissao) {
    if (tipoReal === 'NFE_COMPLETA') {
      dataEmissao = extrairTagEmBloco(xml, 'ide', 'dhEmi') || extrairTagEmBloco(xml, 'ide', 'dEmi');
    } else if (tipoReal === 'RESUMO') {
      dataEmissao = extrairTag(xml, 'dhEmi') || extrairTag(xml, 'dEmi');
    } else {
      dataEmissao = extrairTag(xml, 'dhEvento') || extrairTag(xml, 'dhRecbto');
    }
  }
  if (!dataEmissao) dataEmissao = new Date().toISOString();
  const { formatada, competencia } = formatarData(dataEmissao);

  // Valores (extraídos apenas de NFE_COMPLETA ou RESUMO)
  let valorTotal = raw.valorTotal || 0;
  if ((!valorTotal || isNaN(valorTotal)) && (tipoReal === 'NFE_COMPLETA' || tipoReal === 'RESUMO')) {
    const vNFStr = tipoReal === 'NFE_COMPLETA'
      ? (extrairTagEmBloco(xml, 'ICMSTot', 'vNF') || extrairTag(xml, 'vNF'))
      : extrairTag(xml, 'vNF');
    if (vNFStr) {
      valorTotal = parseFloat(vNFStr) || 0;
    }
  }

  // Situação Fiscal e Eventos
  const cSitNFe = raw.cSitNFe || extrairTag(xml, 'cSitNFe');
  const tpEvento = raw.tpEvento || extrairTag(xml, 'tpEvento');
  const descEvento = raw.descEvento || extrairTag(xml, 'descEvento') || extrairTag(xml, 'xEvento');

  let situacao: SituacaoFiscal = 'AUTORIZADA';
  let manifestacao: DocumentoFiscalArmazenado['manifestacao'] = 'PENDENTE';

  if (
    cSitNFe === '3' ||
    tpEvento === '110111' ||
    tpEvento === '110112' ||
    descEvento.toLowerCase().includes('cancelamento')
  ) {
    situacao = 'CANCELADA';
  } else if (
    tpEvento === '110110' ||
    descEvento.toLowerCase().includes('carta de correcao') ||
    descEvento.toLowerCase().includes('carta de correção')
  ) {
    situacao = 'CARTA_CORRECAO';
  } else if (
    cSitNFe === '2' ||
    xml.includes('<cStat>110</cStat>') ||
    xml.includes('<cStat>301</cStat>') ||
    xml.includes('<cStat>302</cStat>')
  ) {
    situacao = 'DENEGADA';
  } else {
    situacao = 'AUTORIZADA';
  }

  if (tpEvento === '210210') manifestacao = 'CIENCIA';
  else if (tpEvento === '210200') manifestacao = 'CONFIRMADA';
  else if (tpEvento === '210220') manifestacao = 'DESCONHECIDA';
  else if (tpEvento === '210240') manifestacao = 'NAO_REALIZADA';

  const docId = `${cleanEmpresaCnpj}_${chave}`;

  // Salva o XML oficial no IndexedDB e no cache em memória
  if (xml) {
    definirXmlCacheMemoria(chave, xml);
    definirXmlCacheMemoria(docId, xml);
    salvarXmlNoIndexedDb(chave, xml).catch(() => {});
  }

  return {
    id: docId,
    empresaId: empresa.id,
    empresaCnpj: cleanEmpresaCnpj,
    empresaRazaoSocial: empresa.razaoSocial,
    nsu: raw.nsu,
    schema: raw.schema,
    tipo: tipoReal,
    situacao,
    chave,
    nNF,
    serie,
    tipoOperacao,
    dataEmissao,
    dataGeracaoFormatada: formatada,
    competencia,
    emitenteCnpj: cleanEmit,
    emitenteNome: emitNome,
    emitenteTipo,
    destinatarioCnpj: destCnpj || (emitenteTipo === 'TERCEIRO' ? cleanEmpresaCnpj : ''),
    destinatarioNome: destNome || (emitenteTipo === 'TERCEIRO' ? empresa.razaoSocial : 'Destinatário conforme NF-e'),
    destinatarioTipo,
    valorTotal: valorTotal || 0,
    valorLiquido: valorTotal || 0,
    descricaoEvento: descEvento || undefined,
    tipoEvento: tpEvento || undefined,
    manifestacao,
    xml,
    baixadoEm: new Date().toISOString()
  };
}

/**
 * Reconcilia dois registros da mesma Chave de Acesso (ex: procNFe + procEventoNFe ou resNFe + procEventoNFe).
 * Garante que um EVENTO ou RESUMO jamais apague o XML oficial, Razão Social ou Valor de uma NFE_COMPLETA/RESUMO.
 */
export function reconciliarDocumentosMesmaChave(
  existente: DocumentoFiscalArmazenado,
  novo: DocumentoFiscalArmazenado
): DocumentoFiscalArmazenado {
  const prioExist = obterPrioridadeTipo(existente.tipo);
  const prioNovo = obterPrioridadeTipo(novo.tipo);

  // O documento principal é sempre o de maior hierarquia (NFE_COMPLETA > RESUMO > EVENTO)
  const principal = prioNovo >= prioExist ? novo : existente;
  const secundario = prioNovo >= prioExist ? existente : novo;

  // Situação: se qualquer um indicar CANCELADA, a NF está CANCELADA
  let situacaoFinal: SituacaoFiscal = 'AUTORIZADA';
  if (existente.situacao === 'CANCELADA' || novo.situacao === 'CANCELADA') {
    situacaoFinal = 'CANCELADA';
  } else if (existente.situacao === 'DENEGADA' || novo.situacao === 'DENEGADA') {
    situacaoFinal = 'DENEGADA';
  } else if (existente.situacao === 'CARTA_CORRECAO' || novo.situacao === 'CARTA_CORRECAO') {
    situacaoFinal = 'CARTA_CORRECAO';
  }

  // Manifestação: preserva confirmação/ciência registrada em qualquer um dos dois
  let manifestacaoFinal = principal.manifestacao || 'PENDENTE';
  if (secundario.manifestacao && secundario.manifestacao !== 'PENDENTE') {
    manifestacaoFinal = secundario.manifestacao;
  }

  // Nome do emitente: prefere o nome real (que não seja placeholder "CNPJ ..." ou "não identificado")
  const isNomeReal = (nome?: string) =>
    Boolean(nome && !nome.toLowerCase().includes('não identificado') && !nome.startsWith('CNPJ ') && !nome.startsWith('Emitente CNPJ'));

  const emitenteNomeFinal = isNomeReal(principal.emitenteNome)
    ? principal.emitenteNome
    : isNomeReal(secundario.emitenteNome)
      ? secundario.emitenteNome
      : principal.emitenteNome || secundario.emitenteNome;

  const valorTotalFinal = principal.valorTotal > 0 ? principal.valorTotal : secundario.valorTotal;
  const xmlPrincipal = obterXmlAutencticoDocumento(principal);
  const xmlSecundario = obterXmlAutencticoDocumento(secundario);

  // Prefere sempre o XML de NFE_COMPLETA sobre RESUMO/EVENTO
  let xmlFinal = xmlPrincipal || xmlSecundario;
  if (isXmlNfeCompletaOficial(xmlSecundario) && !isXmlNfeCompletaOficial(xmlPrincipal)) {
    xmlFinal = xmlSecundario;
  }

  const tipoFinal = isXmlNfeCompletaOficial(xmlFinal) ? 'NFE_COMPLETA' : principal.tipo;

  if (xmlFinal && principal.chave) {
    definirXmlCacheMemoria(principal.chave, xmlFinal);
    salvarXmlNoIndexedDb(principal.chave, xmlFinal).catch(() => {});
  }

  return {
    ...secundario,
    ...principal,
    id: principal.id,
    tipo: tipoFinal,
    schema: tipoFinal === 'NFE_COMPLETA' ? 'procNFe_v4.00.xsd' : principal.schema,
    situacao: situacaoFinal,
    manifestacao: manifestacaoFinal,
    emitenteNome: emitenteNomeFinal,
    valorTotal: valorTotalFinal,
    valorLiquido: valorTotalFinal,
    nNF: principal.nNF && principal.nNF !== 'S/N' ? principal.nNF : secundario.nNF,
    serie: principal.serie || secundario.serie,
    descricaoEvento: novo.descricaoEvento || existente.descricaoEvento,
    tipoEvento: novo.tipoEvento || existente.tipoEvento,
    xml: xmlFinal
  };
}

/**
 * Salva documentos em memória de sessão, IndexedDB e localStorage (garantindo resiliência mesmo quando a cota do Firestore esgota)
 */
function salvarDocsSeguro(docs: DocumentoFiscalArmazenado[]): void {
  docs.forEach(d => {
    if (d.xml && !isXmlSinteticoInvalido(d.xml)) {
      const cleanKey = (d.chave || '').replace(/\D/g, '');
      if (cleanKey) {
        definirXmlCacheMemoria(cleanKey, d.xml);
        salvarXmlNoIndexedDb(cleanKey, d.xml).catch(() => {});
      }
      definirXmlCacheMemoria(d.id, d.xml);
    }
  });

  setRuntimeCloudDocs(docs);

  if (typeof window !== 'undefined') {
    try {
      // Salva metadados sem o XML bruto gigante no localStorage (o XML fica no IndexedDB)
      const lightDocs = docs.map(d => ({
        ...d,
        xml: ''
      }));
      localStorage.setItem(SEFAZ_DOCUMENTS_KEY, JSON.stringify(lightDocs));
    } catch {
      try {
        const compactDocs = docs.slice(0, 1500).map(d => ({ ...d, xml: '' }));
        localStorage.setItem(SEFAZ_DOCUMENTS_KEY, JSON.stringify(compactDocs));
      } catch {}
    }
  }
}

/**
 * Carrega todos os documentos unificando a memória sincronizada (Firestore) e o localStorage local
 */
export function loadAllStoredDocuments(): DocumentoFiscalArmazenado[] {
  if (typeof window === 'undefined') return [];
  try {
    const cloudDocs: DocumentoFiscalArmazenado[] = getRuntimeCloudDocs() || [];
    let localDocs: DocumentoFiscalArmazenado[] = [];
    const raw = localStorage.getItem(SEFAZ_DOCUMENTS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localDocs = parsed;
        }
      } catch {}
    }

    const docs: DocumentoFiscalArmazenado[] = [...localDocs, ...cloudDocs];
    if (docs.length === 0) return [];
    const empresas: Company[] = loadStoredCompanies();

    let needsResave = false;
    const map = new Map<string, DocumentoFiscalArmazenado>();

    docs.forEach(doc => {
      const cleanEmp = (doc.empresaCnpj || '').replace(/\D/g, '');
      const cleanKey = (doc.chave || '').replace(/\D/g, '');
      const tem44 = cleanKey.length === 44;
      const mapKey = tem44 ? `${cleanEmp}_${cleanKey}` : doc.id;

      // Recupera o XML autêntico (ignorando XMLs sintéticos antigos)
      let xmlAutentico = '';
      if (doc.xml && !isXmlSinteticoInvalido(doc.xml)) {
        xmlAutentico = doc.xml;
      } else {
        xmlAutentico = obterXmlCacheMemoria(cleanKey) || obterXmlCacheMemoria(mapKey) || '';
      }
      if (doc.xml && isXmlSinteticoInvalido(doc.xml)) {
        needsResave = true;
      }

      // Na chave de 44 dígitos, as posições 6..20 são SEMPRE o CNPJ do emitente da NF-e
      let emitCnpj = (doc.emitenteCnpj || '').replace(/\D/g, '');
      if (tem44) {
        const emitDaChave = cleanKey.slice(6, 20);
        if (emitCnpj !== emitDaChave) {
          emitCnpj = emitDaChave;
          needsResave = true;
        }
      }

      const nNF = tem44 && (!doc.nNF || doc.nNF === 'S/N')
        ? parseInt(cleanKey.slice(25, 34), 10).toString()
        : (doc.nNF || 'S/N');

      const serie = tem44 && !doc.serie
        ? parseInt(cleanKey.slice(22, 25), 10).toString()
        : (doc.serie || '1');

      let emitNome = doc.emitenteNome || '';
      if (emitCnpj && cleanEmp && emitCnpj !== cleanEmp && emitNome === doc.empresaRazaoSocial) {
        emitNome = '';
        needsResave = true;
      }

      if (!emitNome || emitNome.toLowerCase().includes('não identificado') || emitNome.startsWith('Emitente CNPJ')) {
        const empCad = empresas.find(c => (c.cnpj || '').replace(/\D/g, '') === emitCnpj);
        if (empCad) {
          emitNome = empCad.razaoSocial;
          needsResave = true;
        } else if (emitCnpj === cleanEmp && doc.empresaRazaoSocial) {
          emitNome = doc.empresaRazaoSocial;
          needsResave = true;
        } else if (xmlAutentico) {
          const xNomeXml = extrairTagEmBloco(xmlAutentico, 'emit', 'xNome') || extrairTag(xmlAutentico, 'xNome');
          if (xNomeXml) {
            emitNome = xNomeXml;
            needsResave = true;
          }
        }
        if (!emitNome || emitNome.toLowerCase().includes('não identificado')) {
          emitNome = emitCnpj ? `CNPJ ${formatarCnpj(emitCnpj)} (Aguardando XML da NF-e)` : 'Emitente não identificado';
        }
      }

      const emitenteTipo: 'PROPRIA' | 'TERCEIRO' = emitCnpj === cleanEmp ? 'PROPRIA' : 'TERCEIRO';
      const tipoOperacao: 'ENTRADA' | 'SAIDA' = emitCnpj === cleanEmp ? 'SAIDA' : 'ENTRADA';
      if (doc.tipoOperacao !== tipoOperacao || doc.emitenteTipo !== emitenteTipo) {
        needsResave = true;
      }

      // Determina o tipo real do documento
      let tipoDoc = doc.tipo;
      if (xmlAutentico) {
        tipoDoc = classificarTipoXmlSefaz(xmlAutentico, doc.schema);
      } else if ((doc.schema || '').toLowerCase().includes('evento')) {
        tipoDoc = 'EVENTO';
      } else if ((doc.schema || '').toLowerCase().includes('resnfe')) {
        tipoDoc = 'RESUMO';
      }

      const situacao: SituacaoFiscal = doc.situacao === 'RESUMO' ? 'AUTORIZADA' : doc.situacao;

      const repaired: DocumentoFiscalArmazenado = {
        ...doc,
        id: mapKey,
        chave: tem44 ? cleanKey : doc.chave,
        nNF,
        serie,
        tipo: tipoDoc,
        situacao,
        emitenteCnpj: emitCnpj,
        emitenteNome: emitNome,
        emitenteTipo,
        destinatarioCnpj: emitenteTipo === 'TERCEIRO' ? cleanEmp : (doc.destinatarioCnpj || ''),
        destinatarioNome: emitenteTipo === 'TERCEIRO' ? doc.empresaRazaoSocial : (doc.destinatarioNome || 'Destinatário conforme NF-e'),
        destinatarioTipo: emitenteTipo === 'TERCEIRO' ? 'PROPRIA' : 'TERCEIRO',
        tipoOperacao,
        xml: xmlAutentico
      };

      if (map.has(mapKey)) {
        const merged = reconciliarDocumentosMesmaChave(map.get(mapKey)!, repaired);
        map.set(mapKey, merged);
      } else {
        map.set(mapKey, repaired);
      }
    });

    const allMerged = Array.from(map.values());
    const finalDocs: DocumentoFiscalArmazenado[] = [];

    for (const d of allMerged) {
      if (d.tipo === 'NFE_COMPLETA' || d.tipo === 'RESUMO') {
        finalDocs.push(d);
      }
    }

    return finalDocs;
  } catch (err) {
    console.error('Erro ao ler documentos fiscais do localStorage:', err);
    return [];
  }
}

/**
 * Salva a lista completa de documentos e emite evento
 */
export function saveAllStoredDocuments(docs: DocumentoFiscalArmazenado[]): void {
  if (typeof window === 'undefined') return;
  salvarDocsSeguro(docs);
  window.dispatchEvent(new CustomEvent(SEFAZ_DOCS_UPDATED_EVENT, { detail: { count: docs.length } }));
}

/**
 * Insere ou atualiza documentos no repositório local:
 * - Armazena notas com XML completo (NFE_COMPLETA / procNFe) e notas em RESUMO (resNFe), mantendo os resumos na fila de download do procNFe.
 * - Eventos (Cancelamento / CC-e) atualizam a situação da NF-e existente.
 */
export function upsertSefazDocuments(novosDocs: DocumentoFiscalArmazenado[]): {
  adicionados: number;
  atualizados: number;
  total: number;
} {
  const existing = loadAllStoredDocuments();
  const map = new Map<string, DocumentoFiscalArmazenado>();

  existing.forEach(d => {
    const cleanKey = (d.chave || '').replace(/\D/g, '');
    const cleanEmp = (d.empresaCnpj || '').replace(/\D/g, '');
    const mapKey = cleanKey.length === 44 ? `${cleanEmp}_${cleanKey}` : d.id;
    map.set(mapKey, d);
  });

  let adicionados = 0;
  let atualizados = 0;
  const touchedKeys = new Set<string>();

  novosDocs.forEach(novo => {
    const cleanKey = (novo.chave || '').replace(/\D/g, '');
    const cleanEmp = (novo.empresaCnpj || '').replace(/\D/g, '');
    const mapKey = cleanKey.length === 44 ? `${cleanEmp}_${cleanKey}` : novo.id;

    if (novo.tipo === 'NFE_COMPLETA') {
      if (cleanKey.length === 44) {
        removerChavePendenteInterna(cleanEmp, cleanKey);
      }
      if (map.has(mapKey)) {
        const merged = reconciliarDocumentosMesmaChave(map.get(mapKey)!, { ...novo, id: mapKey });
        map.set(mapKey, merged);
        touchedKeys.add(mapKey);
        atualizados++;
      } else {
        map.set(mapKey, { ...novo, id: mapKey });
        touchedKeys.add(mapKey);
        adicionados++;
      }
    } else if (novo.tipo === 'RESUMO' && cleanKey.length === 44) {
      if (cleanKey.slice(6, 20) !== cleanEmp) {
        adicionarChavePendenteInterna(cleanEmp, cleanKey);
      }
      if (map.has(mapKey)) {
        const merged = reconciliarDocumentosMesmaChave(map.get(mapKey)!, { ...novo, id: mapKey });
        if (merged.tipo === 'NFE_COMPLETA') {
          removerChavePendenteInterna(cleanEmp, cleanKey);
        }
        map.set(mapKey, merged);
        touchedKeys.add(mapKey);
        atualizados++;
      } else {
        map.set(mapKey, { ...novo, id: mapKey });
        touchedKeys.add(mapKey);
        adicionados++;
      }
    } else if (map.has(mapKey)) {
      // Se já existe a NF-e na tabela e chegou um Evento (ex: Cancelamento ou CC-e), reconcilia a situação
      const merged = reconciliarDocumentosMesmaChave(map.get(mapKey)!, { ...novo, id: mapKey });
      map.set(mapKey, merged);
      touchedKeys.add(mapKey);
      atualizados++;
    } else if (cleanKey.length === 44 && cleanKey.slice(20, 22) === '55') {
      // Se chegou um evento de uma NF-e (modelo 55) cujo resumo/procNFe estava em lote anterior,
      // registra a nota como RESUMO e coloca na fila para baixar o procNFe completo via consChNFe
      adicionarChavePendenteInterna(cleanEmp, cleanKey);
      map.set(mapKey, { ...novo, id: mapKey, tipo: 'RESUMO' });
      touchedKeys.add(mapKey);
      adicionados++;
    }
  });

  const allDocs = Array.from(map.values()).filter(d => d.tipo === 'NFE_COMPLETA' || d.tipo === 'RESUMO');

  allDocs.sort((a, b) => {
    const timeA = new Date(a.dataEmissao).getTime() || 0;
    const timeB = new Date(b.dataEmissao).getTime() || 0;
    return timeB - timeA;
  });

  saveAllStoredDocuments(allDocs);

  if (!isApplyingCloudSnapshot() && touchedKeys.size > 0) {
    const docsToSync = Array.from(touchedKeys)
      .map(k => map.get(k))
      .filter((d): d is DocumentoFiscalArmazenado => Boolean(d && (d.tipo === 'NFE_COMPLETA' || d.tipo === 'RESUMO')));
    if (docsToSync.length > 0) {
      syncSefazDocumentsToCloud(docsToSync).catch(() => {});
    }
  }

  return {
    adicionados,
    atualizados,
    total: allDocs.length
  };
}

/**
 * Remove um documento armazenado na memória e no Firestore
 */
export function deleteStoredDocument(docId: string): void {
  const existing = loadAllStoredDocuments();
  const filtered = existing.filter(d => d.id !== docId);
  saveAllStoredDocuments(filtered);
  deleteSefazDocumentFromCloud(docId).catch(() => {});
}

/**
 * Limpa todos os documentos de uma empresa ou de todas na memória e no Firestore
 */
export function clearStoredDocuments(empresaCnpj?: string): void {
  clearSefazDocumentsInCloud(empresaCnpj).catch(() => {});
  if (!empresaCnpj) {
    saveAllStoredDocuments([]);
    return;
  }
  const clean = empresaCnpj.replace(/\D/g, '');
  const existing = loadAllStoredDocuments();
  const filtered = existing.filter(d => d.empresaCnpj !== clean);
  saveAllStoredDocuments(filtered);
}

// Configurações do Robô de Varredura (Ativo por padrão, realizando 3 varreduras por dia = a cada 480 min / 8h após concluir os 90 dias)
export const DEFAULT_ROBO_CONFIG: RoboVarreduraConfig = {
  ativo: true,
  intervaloMinutos: 480,
  apenasEmpresaSelecionada: false,
  somNotificacao: true
};

export function loadRoboConfig(): RoboVarreduraConfig {
  if (typeof window === 'undefined') return DEFAULT_ROBO_CONFIG;
  try {
    const raw = localStorage.getItem(SEFAZ_ROBO_CONFIG_KEY);
    if (!raw) return DEFAULT_ROBO_CONFIG;
    const parsed = JSON.parse(raw);
    const intervalo = Number(parsed?.intervaloMinutos) >= 360 ? Number(parsed.intervaloMinutos) : 480;
    return { ...DEFAULT_ROBO_CONFIG, ...parsed, intervaloMinutos: intervalo };
  } catch {
    return DEFAULT_ROBO_CONFIG;
  }
}

export function saveRoboConfig(config: Partial<RoboVarreduraConfig>): RoboVarreduraConfig {
  const current = loadRoboConfig();
  const updated = { ...current, ...config };
  if (typeof window !== 'undefined') {
    localStorage.setItem(SEFAZ_ROBO_CONFIG_KEY, JSON.stringify(updated));
  }
  return updated;
}

// Logs do Robô de Varredura
export function loadRoboLogs(): RoboLogItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SEFAZ_ROBO_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRoboLog(log: Omit<RoboLogItem, 'id' | 'timestamp'>): RoboLogItem {
  const logs = loadRoboLogs();
  const newLog: RoboLogItem = {
    ...log,
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString()
  };
  const updated = [newLog, ...logs].slice(0, 100);
  if (typeof window !== 'undefined') {
    localStorage.setItem(SEFAZ_ROBO_LOGS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(SEFAZ_ROBO_LOGS_UPDATED_EVENT));
  }
  return newLog;
}

export function clearRoboLogs(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SEFAZ_ROBO_LOGS_KEY);
    window.dispatchEvent(new CustomEvent(SEFAZ_ROBO_LOGS_UPDATED_EVENT));
  }
}
