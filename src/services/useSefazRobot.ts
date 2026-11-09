/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Motor Global em Segundo Plano e Hook de Varredura Automática da SEFAZ Nacional (Robô SEFAZ)
 * - Opera apenas sobre empresas com Certificado Digital A1 instalado E opção Consulta NF-e Habilitada.
 * - Inicia automaticamente ao adicionar/validar um novo certificado no Cadastro de Clientes.
 * - Realiza a varredura completa dos últimos 90 dias (lotes NSU até maxNSU) e depois faz apenas 3 varreduras ao dia (a cada 8h).
 * - Respeita rigorosamente o tempo médio de desbloqueio da SEFAZ (75 minutos / 1h15min) quando ocorre cStat 656 (Consumo Indevido),
 *   sem jamais consultar a empresa repetidamente durante o bloqueio.
 */

import { useState, useEffect, useCallback } from 'react';
import { Company } from '../types_debits';
import {
  loadStoredCompanies,
  saveStoredCompanies,
  updateSingleCompanyFromRobot,
  COMPANIES_UPDATED_EVENT
} from '../utils/companyStorage';
import {
  loadRoboConfig,
  saveRoboConfig,
  addRoboLog,
  loadRoboLogs,
  clearRoboLogs,
  loadAllStoredDocuments,
  converterDfeParaDocumentoArmazenado,
  upsertSefazDocuments,
  obterChavesPendentesEmpresa,
  salvarChavesPendentesEmpresa,
  SEFAZ_ROBO_LOGS_UPDATED_EVENT
} from './sefazStorage';
import { RoboLogItem, RoboVarreduraConfig, normalizarCodigoUfIbge } from '../types/sefazTypes';
import type { RespostaConsultaDFe, RespostaDownloadXmlOficial } from './sefazDfeService';
import { salvarXmlNoIndexedDb } from './sefazIndexedDb';
import { salvarDocumentosNoRepositorioAutomatico } from './sefazLocalFolderService';

const ROBO_COMPANY_V9_FIXED_PREFIX = 'sefaz_v9_comp_fixed_';
const SWEEP_90D_INITIALIZED_PREFIX = 'sefaz_v9_init_';
const SEFAZ_656_LOCK_PREFIX = 'sefaz_656_until_';
const ROBO_STATE_CHANGED_EVENT = 'moreira_lima_sefaz_robo_state_changed';

/**
 * Tempo médio de espera (em minutos) até a SEFAZ Nacional desbloquear o CNPJ após cStat 656 (Consumo Indevido).
 * A SEFAZ exige 60 minutos sem novas requisições; 75 minutos (1h15min) garante o desbloqueio seguro sem reiniciar a penalidade.
 */
export const SEFAZ_656_UNLOCK_AVG_MINUTES = 75;

/**
 * Intervalo padrão entre as varreduras diárias após concluir os 90 dias (480 min = 8h = 3 varreduras por dia).
 */
export const SEFAZ_DAILY_SWEEP_INTERVAL_MINUTES = 480;

interface GlobalRoboRuntimeState {
  config: RoboVarreduraConfig;
  isPollingNow: boolean;
  currentlyPollingCompany: string | null;
  secondsUntilNextSweep: number;
  newDocsCountSession: number;
  selectedCompanyId: string;
}

const globalState: GlobalRoboRuntimeState = {
  config: loadRoboConfig(),
  isPollingNow: false,
  currentlyPollingCompany: null,
  secondsUntilNextSweep: 0,
  newDocsCountSession: 0,
  selectedCompanyId: ''
};

let isEngineInitialized = false;
let isPollingInternal = false;
const pendingForcedCompanyIds = new Set<string>();

function emitGlobalStateChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ROBO_STATE_CHANGED_EVENT));
  }
}

function playNotificationChime() {
  if (typeof window === 'undefined') return;
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch {}
}

/**
 * Verifica se a empresa está com certificado digital A1 instalado e com a função Consulta NF-e habilitada
 */
export function isEmpresaHabilitadaParaConsultaNfe(comp?: Company | null): boolean {
  if (!comp) return false;
  const temCert = Boolean(
    comp.certificateFile &&
    comp.certificateFile.trim().length > 0 &&
    comp.certificatePassword &&
    comp.certificatePassword.trim().length > 0
  );
  const habilitada = comp.consultaNfeHabilitada !== false && comp.autoPollEnabled !== false;
  return temCert && habilitada;
}

/**
 * Verifica se a empresa retornou explicitamente cStat 137 com NSU 000000000000000 / 000000000000000 na SEFAZ
 * (1ª ativação da caixa postal sem NSU retroativo pela NT 2014.002), sem confundir com empresas ainda na fila ou em 656.
 */
export function isEmpresaComNsuZeradoNaSefaz(comp: Company, docsCountDaEmpresa: number): boolean {
  if (docsCountDaEmpresa > 0) return false;
  const status = comp.lastPollStatus || '';
  if (status.includes('656')) return false;
  const maxNum = parseInt(String(comp.maxNSU || '0').replace(/\D/g, ''), 10) || 0;
  const ultNum = parseInt(String(comp.ultimoNSU || '0').replace(/\D/g, ''), 10) || 0;
  return Boolean(comp.lastPolledAt && status.includes('1ª Ativação SEFAZ') && maxNum === 0 && ultNum === 0);
}

/**
 * Retorna o timestamp (ms) de desbloqueio do SEFAZ 656 para o CNPJ, ou 0 se não estiver bloqueado.
 */
export function obterTimestampDesbloqueio656(cleanCnpj: string, comp?: Company): number {
  if (typeof window === 'undefined' || !cleanCnpj) return 0;
  const now = Date.now();
  let lockUntilMs = 0;

  const storedLock = localStorage.getItem(`${SEFAZ_656_LOCK_PREFIX}${cleanCnpj}`);
  if (storedLock) {
    const t = new Date(storedLock).getTime();
    if (!isNaN(t) && t > now) {
      lockUntilMs = t;
    } else if (!isNaN(t) && t <= now) {
      localStorage.removeItem(`${SEFAZ_656_LOCK_PREFIX}${cleanCnpj}`);
    }
  }

  if (comp?.lastPollStatus?.includes('656') && comp.nextAllowedPollAt) {
    const compNext = new Date(comp.nextAllowedPollAt).getTime();
    if (!isNaN(compNext) && compNext > lockUntilMs) {
      lockUntilMs = compNext;
    }
  }

  return lockUntilMs > now ? lockUntilMs : 0;
}

/**
 * Analisa os documentos fiscais realmente armazenados para uma empresa e retorna:
 * - quantidade de documentos
 * - maior data de emissão (YYYY-MM-DD)
 * - maior NSU realmente gravado nos documentos (15 dígitos)
 */
export function analisarDocumentosArmazenadosEmpresa(cleanCnpj: string, allDocs = loadAllStoredDocuments()): {
  docsCount: number;
  maxDataEmissao: string;
  maxStoredNsuFormatted: string;
  maxStoredNsuNum: number;
} {
  let docsCount = 0;
  let maxDataEmissao = '';
  let maxStoredNsuNum = 0;

  for (const d of allDocs) {
    const docCnpj = (d.empresaCnpj || '').replace(/\D/g, '');
    if (docCnpj !== cleanCnpj) continue;
    docsCount++;
    if (d.dataEmissao && d.dataEmissao > maxDataEmissao) {
      maxDataEmissao = d.dataEmissao;
    }
    const nsuNum = parseInt(String(d.nsu || '0').replace(/\D/g, ''), 10) || 0;
    if (nsuNum > maxStoredNsuNum) {
      maxStoredNsuNum = nsuNum;
    }
  }

  return {
    docsCount,
    maxDataEmissao,
    maxStoredNsuNum,
    maxStoredNsuFormatted: maxStoredNsuNum > 0 ? String(maxStoredNsuNum).padStart(15, '0') : '0'
  };
}

/**
 * Resgata diretamente na SEFAZ Nacional (via <consChNFe> + Ciência da Operação 210210)
 * uma ou mais Chaves de Acesso (44 dígitos) emitidas nos últimos 90 dias (ex: Setembro/2026)
 */
export async function capturarNotasNaSefazPorChaves(
  comp: Company,
  chavesInput: string
): Promise<{
  sucesso: boolean;
  capturadas: number;
  mensagens: string[];
}> {
  const cleanCnpj = (comp.cnpj || '').replace(/\D/g, '');
  if (!comp.certificateFile || !comp.certificatePassword || cleanCnpj.length !== 14) {
    return {
      sucesso: false,
      capturadas: 0,
      mensagens: ['A empresa selecionada não possui Certificado Digital A1 configurado.']
    };
  }

  const matches = chavesInput.replace(/\D/g, ' ').match(/\d{44}/g) || [];
  const digitsOnly = chavesInput.replace(/\D/g, '');
  const chavesUnicas = new Set<string>(matches);
  if (chavesUnicas.size === 0 && digitsOnly.length === 44) {
    chavesUnicas.add(digitsOnly);
  }

  if (chavesUnicas.size === 0) {
    return {
      sucesso: false,
      capturadas: 0,
      mensagens: ['Informe ao menos uma Chave de Acesso válida com 44 dígitos numéricos.']
    };
  }

  let capturadas = 0;
  const mensagens: string[] = [];

  for (const chave of Array.from(chavesUnicas)) {
    try {
      const resp = await fetch('/api/sefaz/baixar-xml-oficial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnpj: cleanCnpj,
          pfxBase64: comp.certificateFile,
          passphrase: comp.certificatePassword,
          chNFe: chave,
          ambiente: 1,
          ufAutor: normalizarCodigoUfIbge(comp.uf),
          manifestarAutomaticamente: true
        })
      });

      const data: RespostaDownloadXmlOficial = await resp.json();

      if (data.todosDocumentosRetornados && data.todosDocumentosRetornados.length > 0) {
        const convertidos = data.todosDocumentosRetornados.map(raw => converterDfeParaDocumentoArmazenado(raw, comp));
        for (const raw of data.todosDocumentosRetornados) {
          if (raw.xml && raw.chave) {
            await salvarXmlNoIndexedDb(raw.chave, raw.xml);
          }
        }
        upsertSefazDocuments(convertidos);
        salvarDocumentosNoRepositorioAutomatico(convertidos.filter(d => d.tipo === 'NFE_COMPLETA')).catch(() => {});
        capturadas += convertidos.length;
        mensagens.push(`Chave ${chave.slice(0, 10)}...${chave.slice(-6)}: ${data.xMotivo}`);

        addRoboLog({
          empresaNome: comp.razaoSocial,
          empresaCnpj: comp.cnpj,
          nsuInicial: comp.ultimoNSU || '0',
          nsuFinal: data.documento?.nsu || comp.ultimoNSU || '000000000000001',
          maxNsu: comp.maxNSU || '000000000000001',
          documentosBaixados: convertidos.length,
          status: 'SUCESSO',
          cStat: data.cStat || '138',
          mensagem: `Captura por Chave (${chave}): ${data.xMotivo}`
        });
      } else {
        mensagens.push(`Chave ${chave.slice(0, 10)}...${chave.slice(-6)}: [${data.cStat || resp.status}] ${data.xMotivo || 'Não localizada na SEFAZ.'}`);
      }
    } catch (err: any) {
      mensagens.push(`Chave ${chave.slice(0, 10)}...${chave.slice(-6)}: Erro (${err.message || 'Falha de comunicação'})`);
    }
  }

  if (capturadas > 0) {
    const docStats = analisarDocumentosArmazenadosEmpresa(cleanCnpj);
    updateSingleCompanyFromRobot(
      comp.id,
      {
        ultimoNSU: docStats.maxStoredNsuNum > 0 ? docStats.maxStoredNsuFormatted : (comp.ultimoNSU || '0'),
        maxNSU: docStats.maxStoredNsuNum > 0 ? docStats.maxStoredNsuFormatted : (comp.maxNSU || '0'),
        lastPolledAt: new Date().toISOString(),
        lastPollStatus: `${capturadas} nota(s) capturada(s) via Chave na SEFAZ`
      },
      true
    );
  }

  return {
    sucesso: capturadas > 0,
    capturadas,
    mensagens
  };
}

/**
 * Reinicia manualmente a varredura completa de 90 dias (desde o NSU 000000000000000) para uma empresa específica
 * e coloca a empresa no topo da fila imediata do robô.
 */
export function reiniciarVarreduraCompleta90DiasEmpresa(companyId: string): void {
  if (typeof window === 'undefined' || !companyId) return;
  const companies = loadStoredCompanies();
  const target = companies.find(c => c.id === companyId);
  if (!target) return;

  const cleanCnpj = (target.cnpj || '').replace(/\D/g, '');
  if (cleanCnpj) {
    localStorage.setItem(`sefaz_ult_nsu_${cleanCnpj}`, '0');
    localStorage.setItem(`${SWEEP_90D_INITIALIZED_PREFIX}${cleanCnpj}`, 'done');
    localStorage.setItem(`${ROBO_COMPANY_V9_FIXED_PREFIX}${cleanCnpj}`, 'done');
  }

  const lock656Ms = obterTimestampDesbloqueio656(cleanCnpj, target);
  const isBlocked = lock656Ms > Date.now();

  updateSingleCompanyFromRobot(
    companyId,
    {
      ultimoNSU: '0',
      maxNSU: '0',
      varredura90DiasConcluida: false,
      nextAllowedPollAt: isBlocked ? new Date(lock656Ms).toISOString() : undefined,
      lastPollStatus: isBlocked
        ? target.lastPollStatus || 'SEFAZ [656] - Aguardando desbloqueio para varrer do NSU 0'
        : 'Reiniciando varredura completa de 90 dias (NSU 0)...'
    },
    true
  );

  globalState.config = saveRoboConfig({ ativo: true, apenasEmpresaSelecionada: false });
  emitGlobalStateChange();
  rodarCicloGlobalRobo(companyId);
}

/**
 * Migração corretiva por empresa (v9):
 * - Roda tanto na inicialização quanto após o carregamento em tempo real do Firestore (onSnapshot).
 * - Corrige empresas que pularam lotes por causa de cStat 656 ou do filtro SVRS2026 (como MANUR COMERCIO DE ALIMENTOS LTDA,
 *   que ficou em NSU 659/659 com apenas 1 NF-e) e empresas que ficaram com 0 documentos (como W. F. DE LUCENA LTDA e NEWBUS),
 *   reiniciando o cursor `ultimoNSU = '0'` para que varram todos os lotes dos últimos 90 dias do início ao fim.
 */
function executarMigracaoUnicaRoboV9(): void {
  if (typeof window === 'undefined') return;

  try {
    if (globalState.config.apenasEmpresaSelecionada) {
      globalState.config = saveRoboConfig({
        ativo: true,
        apenasEmpresaSelecionada: false,
        intervaloMinutos: SEFAZ_DAILY_SWEEP_INTERVAL_MINUTES
      });
    }

    const companies = loadStoredCompanies();
    if (companies.length === 0) return;

    const allDocs = loadAllStoredDocuments();
    let changedAny = false;
    const changedCompaniesForCloud: Company[] = [];

    const updatedCompanies = companies.map(comp => {
      const razaoUpper = (comp.razaoSocial || '').toUpperCase();
      const cleanCnpj = (comp.cnpj || '').replace(/\D/g, '');
      if (!cleanCnpj) return comp;

      const v9Key = `${ROBO_COMPANY_V9_FIXED_PREFIX}${cleanCnpj}`;
      if (localStorage.getItem(v9Key) === 'done') {
        return comp;
      }

      // 1. Caso explícito: F E K BARES E RESTAURANTES DE QUIXADA LTDA teve certificado excluído e consulta desabilitada
      if (razaoUpper.includes('F E K BARES') || razaoUpper.includes('FEK BARES')) {
        localStorage.setItem(v9Key, 'done');
        changedAny = true;
        const fekDisabled: Company = {
          ...comp,
          certificateFile: '',
          certificateName: '',
          certificatePassword: '',
          certificateValidTo: '',
          certificateIssuer: '',
          consultaNfeHabilitada: false,
          autoPollEnabled: false,
          nextAllowedPollAt: undefined,
          lastPollStatus: 'Desabilitado pelo usuário'
        };
        changedCompaniesForCloud.push(fekDisabled);
        return fekDisabled;
      }

      if (!isEmpresaHabilitadaParaConsultaNfe(comp)) {
        return comp;
      }

      const docStats = analisarDocumentosArmazenadosEmpresa(cleanCnpj, allDocs);
      const ultNum = parseInt(String(comp.ultimoNSU || '0').replace(/\D/g, ''), 10) || 0;
      const maxNum = parseInt(String(comp.maxNSU || '0').replace(/\D/g, ''), 10) || 0;

      const isManurOuLucenaOuNewbus =
        razaoUpper.includes('MANUR') ||
        cleanCnpj === '56018701000102' ||
        razaoUpper.includes('LUCENA') ||
        cleanCnpj === '54885439000110' ||
        razaoUpper.includes('NEWBUS') ||
        cleanCnpj === '62726324000169';

      // Detecta se a empresa teve NSUs pulados (ex: maxNSU >= 5 mas baixou <= 5 notas, como MANUR com 659 NSUs e 1 NF-e),
      // ou está com 0 notas, ou parou antes de 15/08/2026, ou ficou marcada erroneamente como 1ª Ativação SEFAZ
      const pulouLotesOuSemNotas =
        isManurOuLucenaOuNewbus ||
        docStats.docsCount === 0 ||
        (docStats.docsCount <= 5 && (maxNum >= 5 || ultNum >= 5)) ||
        docStats.maxDataEmissao <= '2026-08-15' ||
        Boolean(comp.lastPollStatus && comp.lastPollStatus.includes('1ª Ativação SEFAZ'));

      localStorage.setItem(`${SWEEP_90D_INITIALIZED_PREFIX}${cleanCnpj}`, 'done');
      localStorage.setItem(v9Key, 'done');

      if (pulouLotesOuSemNotas) {
        // Se a empresa tem <= 5 notas (como MANUR com 1 nota no NSU 659 ou LUCENA/NEWBUS com 0 notas),
        // reinicia do NSU '0' para varrer TODOS os lotes dos últimos 90 dias desde o início!
        // Se já tem > 5 notas (ex: 40 notas até 31/07), retoma do maior NSU salvo.
        const cursorCorreto = docStats.docsCount > 5 ? docStats.maxStoredNsuFormatted : '0';
        localStorage.setItem(`sefaz_ult_nsu_${cleanCnpj}`, cursorCorreto);

        const isAtualmente656 = Boolean(comp.lastPollStatus && comp.lastPollStatus.includes('656'));
        let nextPollIso: string | undefined = undefined;

        if (isAtualmente656) {
          const baseMs = comp.lastPolledAt ? new Date(comp.lastPolledAt).getTime() : Date.now();
          const safeBaseMs = isNaN(baseMs) ? Date.now() : baseMs;
          const unlockMs = Math.max(Date.now() + 10 * 60 * 1000, safeBaseMs + SEFAZ_656_UNLOCK_AVG_MINUTES * 60 * 1000);
          nextPollIso = new Date(unlockMs).toISOString();
          localStorage.setItem(`${SEFAZ_656_LOCK_PREFIX}${cleanCnpj}`, nextPollIso);
        } else {
          localStorage.removeItem(`${SEFAZ_656_LOCK_PREFIX}${cleanCnpj}`);
        }

        changedAny = true;
        const fixedComp: Company = {
          ...comp,
          ultimoNSU: cursorCorreto,
          maxNSU: cursorCorreto === '0' ? '0' : comp.maxNSU,
          varredura90DiasConcluida: false,
          nextAllowedPollAt: nextPollIso,
          lastPollStatus: isAtualmente656
            ? `SEFAZ [656] - Aguardando desbloqueio (~75 min) para varrer do NSU ${cursorCorreto}`
            : `Na fila para varredura completa de 90 dias (NSU ${cursorCorreto})`
        };
        changedCompaniesForCloud.push(fixedComp);
        return fixedComp;
      }

      return comp;
    });

    if (changedAny) {
      saveStoredCompanies(updatedCompanies, {
        skipCloudSync: changedCompaniesForCloud.length === 0,
        changedCompanies: changedCompaniesForCloud
      });
    }
  } catch (e) {
    console.error('Erro na migração v9 do Robô SEFAZ:', e);
  }
}

/**
 * Inicializa apenas empresas recém-adicionadas que ainda não foram inicializadas pelo robô,
 * SEM jamais apagar o `nextAllowedPollAt` de empresas que estão em cooldown do SEFAZ 656!
 */
function inicializarEmpresasNovasParaVarredura(companies: Company[], forcarResetCompanyId?: string): Company[] {
  if (typeof window === 'undefined') return companies;

  const allDocs = loadAllStoredDocuments();
  let houveAlteracao = false;

  const atualizadas = companies.map(comp => {
    if (!isEmpresaHabilitadaParaConsultaNfe(comp)) return comp;

    const cleanCnpj = (comp.cnpj || '').replace(/\D/g, '');
    if (!cleanCnpj) return comp;

    const initKey = `${SWEEP_90D_INITIALIZED_PREFIX}${cleanCnpj}`;
    const jaInicializada = localStorage.getItem(initKey) === 'done';
    const isForcada = Boolean(forcarResetCompanyId && comp.id === forcarResetCompanyId);

    if (!jaInicializada || isForcada) {
      localStorage.setItem(initKey, 'done');
      const docStats = analisarDocumentosArmazenadosEmpresa(cleanCnpj, allDocs);
      const localNsuStr = localStorage.getItem(`sefaz_ult_nsu_${cleanCnpj}`) || '0';
      const compNsuNum = parseInt(String(comp.ultimoNSU || '0').replace(/\D/g, ''), 10) || 0;
      const localNsuNum = parseInt(String(localNsuStr).replace(/\D/g, ''), 10) || 0;

      // Se a empresa tem <= 5 documentos, começa do NSU 0 para garantir a captura integral dos últimos 90 dias
      const precisaComecarDoZero = docStats.docsCount <= 5;
      const parouAntesDeAgosto = docStats.docsCount === 0 || docStats.maxDataEmissao <= '2026-08-15';
      const bestNsuNum = precisaComecarDoZero
        ? 0
        : parouAntesDeAgosto
          ? docStats.maxStoredNsuNum
          : Math.max(compNsuNum, localNsuNum, docStats.maxStoredNsuNum);
      const cursor = bestNsuNum > 0 ? String(bestNsuNum).padStart(15, '0') : '0';

      localStorage.setItem(`sefaz_ult_nsu_${cleanCnpj}`, cursor);

      const lock656Ms = obterTimestampDesbloqueio656(cleanCnpj, comp);
      const nextAllowed = lock656Ms > Date.now() ? new Date(lock656Ms).toISOString() : undefined;

      houveAlteracao = true;
      return {
        ...comp,
        ultimoNSU: cursor,
        varredura90DiasConcluida: false,
        nextAllowedPollAt: nextAllowed,
        lastPollStatus: nextAllowed
          ? comp.lastPollStatus || 'SEFAZ [656] - Aguardando desbloqueio (~75 min)'
          : `Na fila para varredura de 90 dias (NSU ${cursor})`
      };
    }

    return comp;
  });

  if (houveAlteracao) {
    return saveStoredCompanies(atualizadas, { skipCloudSync: true });
  }
  return companies;
}

/**
 * Executa uma etapa de varredura para uma empresa (consulta de lote NSU ou drenagem de chaves pendentes)
 */
async function executarEtapaVarreduraEmpresa(
  comp: Company,
  opcoes: { apenasProcessarPendentes?: boolean } = {}
): Promise<{
  docsCount: number;
  hasMoreNsu: boolean;
  pendingKeysCount: number;
  manifestedCount: number;
  blockedOrError: boolean;
}> {
  const cleanCnpj = (comp.cnpj || '').replace(/\D/g, '');
  if (!isEmpresaHabilitadaParaConsultaNfe(comp) || cleanCnpj.length !== 14) {
    return { docsCount: 0, hasMoreNsu: false, pendingKeysCount: 0, manifestedCount: 0, blockedOrError: true };
  }

  const docStats = analisarDocumentosArmazenadosEmpresa(cleanCnpj);
  const localNsu = localStorage.getItem(`sefaz_ult_nsu_${cleanCnpj}`) || '0';
  const compNsuNum = parseInt(String(comp.ultimoNSU || '0').replace(/\D/g, ''), 10) || 0;
  const localNsuNum = parseInt(String(localNsu).replace(/\D/g, ''), 10) || 0;
  const maxNumConhecido = parseInt(String(comp.maxNSU || '0').replace(/\D/g, ''), 10) || 0;

  let chosenNsuNum = Math.max(compNsuNum, localNsuNum);

  // Se a empresa está marcada para varredura de 90 dias e possui <= 5 documentos mas o NSU já estava no final (ex: MANUR em 659/659 com 1 NF-e),
  // força o início no NSU 0 para baixar todos os lotes desde o começo dos 90 dias!
  if (docStats.docsCount <= 5 && maxNumConhecido >= 5 && chosenNsuNum >= maxNumConhecido) {
    chosenNsuNum = 0;
  } else if (
    (docStats.docsCount === 0 || docStats.maxDataEmissao <= '2026-08-15') &&
    maxNumConhecido > 0 &&
    chosenNsuNum >= maxNumConhecido
  ) {
    chosenNsuNum = docStats.docsCount > 5 ? docStats.maxStoredNsuNum : 0;
  }

  const ultNSU = chosenNsuNum > 0 ? String(chosenNsuNum).padStart(15, '0') : '0';

  const chavesPendentes = obterChavesPendentesEmpresa(cleanCnpj);
  const modoApenasPendentes = Boolean(opcoes.apenasProcessarPendentes && chavesPendentes.length > 0);

  try {
    globalState.currentlyPollingCompany = comp.razaoSocial;
    emitGlobalStateChange();

    const resp = await fetch('/api/sefaz/distribuicao-dfe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cnpj: cleanCnpj,
        pfxBase64: comp.certificateFile,
        passphrase: comp.certificatePassword,
        ultNSU,
        ambiente: 1,
        ufAutor: normalizarCodigoUfIbge(comp.uf),
        autoManifestar: true,
        chavesPendentes,
        apenasProcessarPendentes: modoApenasPendentes
      })
    });

    const data: RespostaConsultaDFe = await resp.json();

    if (!resp.ok || !data.sucesso) {
      const cStat = data.cStat || String(resp.status);
      const isConsumoIndevido = cStat === '656';

      const retMaxNum = parseInt(String(data.maxNSU || comp.maxNSU || '0').replace(/\D/g, ''), 10) || 0;
      if (retMaxNum > 0) {
        comp.maxNSU = String(retMaxNum).padStart(15, '0');
      }

      // CRÍTICO: Quando ocorre erro ou SEFAZ 656 (Consumo Indevido), NUNCA avança o `ultimoNSU` para o `data.ultNSU`
      // retornado na rejeição se a empresa ainda não concluiu a varredura de 90 dias (ou tem <= 5 notas)!
      // Caso contrário, o robô pularia do NSU 0 direto para o último NSU (ex: 658/659) perdendo todas as notas anteriores!
      const cursorPreservado = chosenNsuNum > 0 ? String(chosenNsuNum).padStart(15, '0') : '0';
      comp.ultimoNSU = cursorPreservado;
      localStorage.setItem(`sefaz_ult_nsu_${cleanCnpj}`, cursorPreservado);

      // Quando der SEFAZ 656, aguarda o tempo médio de desbloqueio de 75 minutos (1h15min) sem tentar consultar novamente antes!
      const pendentesAtuais = obterChavesPendentesEmpresa(cleanCnpj);
      const cooldownMs = isConsumoIndevido
        ? SEFAZ_656_UNLOCK_AVG_MINUTES * 60 * 1000
        : 30 * 60 * 1000;
      const nextTime = new Date(Date.now() + cooldownMs).toISOString();
      const unlockHora = new Date(Date.now() + cooldownMs).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });

      if (isConsumoIndevido) {
        localStorage.setItem(`${SEFAZ_656_LOCK_PREFIX}${cleanCnpj}`, nextTime);
      }

      addRoboLog({
        empresaNome: comp.razaoSocial,
        empresaCnpj: comp.cnpj,
        nsuInicial: ultNSU,
        nsuFinal: comp.ultimoNSU || ultNSU,
        maxNsu: comp.maxNSU || ultNSU,
        documentosBaixados: 0,
        status: isConsumoIndevido ? 'BLOQUEIO_SEFAZ' : 'ERRO',
        cStat,
        mensagem: isConsumoIndevido
          ? `SEFAZ [656]: Consumo Indevido temporário na SEFAZ. Aguardando média de ${SEFAZ_656_UNLOCK_AVG_MINUTES} min (até ${unlockHora}) para desbloquear e retomar do NSU ${comp.ultimoNSU || ultNSU}.`
          : `Aviso SEFAZ [${cStat}]: ${data.xMotivo || 'Retentativa agendada automaticamente.'}`
      });

      comp.lastPolledAt = new Date().toISOString();
      comp.nextAllowedPollAt = nextTime;
      comp.lastPollStatus = isConsumoIndevido
        ? `SEFAZ [656] (Desbloqueia ~${unlockHora})`
        : `SEFAZ [${cStat}]`;

      updateSingleCompanyFromRobot(
        comp.id,
        {
          ultimoNSU: comp.ultimoNSU,
          maxNSU: comp.maxNSU,
          lastPolledAt: comp.lastPolledAt,
          nextAllowedPollAt: comp.nextAllowedPollAt,
          lastPollStatus: comp.lastPollStatus,
          varredura90DiasConcluida: comp.varredura90DiasConcluida
        },
        false
      );

      return {
        docsCount: 0,
        hasMoreNsu: false,
        pendingKeysCount: pendentesAtuais.length,
        manifestedCount: 0,
        blockedOrError: true
      };
    }

    // Sucesso! Remove qualquer trava de 656 anterior
    localStorage.removeItem(`${SEFAZ_656_LOCK_PREFIX}${cleanCnpj}`);

    if (Array.isArray(data.chavesPendentesLiberacao)) {
      salvarChavesPendentesEmpresa(cleanCnpj, data.chavesPendentesLiberacao);
    }

    let docsAdicionadosOuAtualizados = 0;
    if (data.documentos && data.documentos.length > 0) {
      const convertidos = data.documentos.map(rawDoc => converterDfeParaDocumentoArmazenado(rawDoc, comp));
      const upsertRes = upsertSefazDocuments(convertidos);
      docsAdicionadosOuAtualizados = upsertRes.adicionados + upsertRes.atualizados;
      if (upsertRes.adicionados > 0) {
        globalState.newDocsCountSession += upsertRes.adicionados;
      }

      const apenasCompletas = convertidos.filter(d => d.tipo === 'NFE_COMPLETA');
      if (apenasCompletas.length > 0) {
        salvarDocumentosNoRepositorioAutomatico(apenasCompletas).catch(() => {});
      }

      if (upsertRes.adicionados > 0 && globalState.config.somNotificacao) {
        playNotificationChime();
      }
    }

    const novoUltNSU = modoApenasPendentes ? ultNSU : (data.ultNSU || ultNSU);
    const novoMaxNSU = modoApenasPendentes ? (comp.maxNSU || ultNSU) : (data.maxNSU || novoUltNSU);
    if (!modoApenasPendentes) {
      localStorage.setItem(`sefaz_ult_nsu_${cleanCnpj}`, novoUltNSU);
    }

    const ultNum = parseInt(String(novoUltNSU || '0').replace(/\D/g, ''), 10) || 0;
    const maxNum = parseInt(String(novoMaxNSU || '0').replace(/\D/g, ''), 10) || 0;
    const totalDocsDaEmpresa = docStats.docsCount + docsAdicionadosOuAtualizados;
    const isSemNsuGeradoNaSefaz = !modoApenasPendentes && data.cStat === '137' && maxNum === 0 && ultNum === 0 && totalDocsDaEmpresa === 0;
    const hasMoreNsu = !modoApenasPendentes && maxNum > 0 && ultNum < maxNum;
    const qtdPendentes = data.chavesPendentesLiberacao?.length || 0;
    const manifestedCount = data.resumosManifestadosInternamente || 0;

    let nextAllowedIso: string;
    if (hasMoreNsu) {
      nextAllowedIso = new Date(Date.now() + 2000).toISOString();
      comp.varredura90DiasConcluida = false;
    } else if (qtdPendentes > 0) {
      // Ainda existem chaves pendentes aguardando o download do XML completo (procNFe) pós-Ciência:
      // agenda próxima passagem para daqui a 2 minutos até zerar as pendências!
      comp.varredura90DiasConcluida = false;
      nextAllowedIso = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    } else if (isSemNsuGeradoNaSefaz) {
      comp.varredura90DiasConcluida = false;
      nextAllowedIso = new Date(Date.now() + 65 * 60 * 1000).toISOString();
    } else {
      comp.varredura90DiasConcluida = true;
      const intervaloMin = Math.max(360, globalState.config.intervaloMinutos || SEFAZ_DAILY_SWEEP_INTERVAL_MINUTES);
      nextAllowedIso = new Date(Date.now() + intervaloMin * 60 * 1000).toISOString();
    }

    if (!modoApenasPendentes || (data.totalDocumentos || 0) > 0 || manifestedCount > 0) {
      addRoboLog({
        empresaNome: comp.razaoSocial,
        empresaCnpj: comp.cnpj,
        nsuInicial: ultNSU,
        nsuFinal: novoUltNSU,
        maxNsu: novoMaxNSU,
        documentosBaixados: data.totalDocumentos || 0,
        status: (data.totalDocumentos || 0) > 0 ? 'SUCESSO' : 'SEM_NOVOS',
        cStat: data.cStat,
        mensagem: modoApenasPendentes
          ? `Complemento pós-Ciência: ${data.totalDocumentos || 0} XML(s) completo(s) baixado(s) (${qtdPendentes} pendente(s)).`
          : isSemNsuGeradoNaSefaz
            ? `SEFAZ [137]: 1ª ativação do CNPJ no NFeDistribuicaoDFe (NSU 000000000000000 / 000000000000000). Pela NT 2014.002, a SEFAZ Nacional não gera NSU retroativo antes da 1ª consulta. Para baixar notas do último mês (Setembro/Outubro), clique em "Capturar por Chave".`
            : data.cStat === '137'
              ? `SEFAZ [137]: Varredura de 90 dias concluída no NSU ${novoUltNSU}. Próxima varredura em 8h (3x ao dia).`
              : `SEFAZ [138]: ${data.totalDocumentos || 0} documento(s) fiscal(is) localizado(s) (NSU ${ultNSU} → ${novoUltNSU} de ${novoMaxNSU}).`
      });
    }

    comp.ultimoNSU = isSemNsuGeradoNaSefaz ? '0' : novoUltNSU;
    comp.maxNSU = isSemNsuGeradoNaSefaz ? '0' : novoMaxNSU;
    comp.lastPolledAt = new Date().toISOString();
    comp.nextAllowedPollAt = nextAllowedIso;
    comp.lastPollStatus = hasMoreNsu
      ? `Varrendo 90 dias (NSU ${novoUltNSU}/${novoMaxNSU})`
      : qtdPendentes > 0
        ? `Baixando XMLs completos (${qtdPendentes} chave(s) pós-Ciência)`
        : isSemNsuGeradoNaSefaz
          ? `1ª Ativação SEFAZ (NSU 0/0) • Sem NSU retroativo na SEFAZ`
          : `Sincronizado (NSU ${novoUltNSU})`;

    updateSingleCompanyFromRobot(
      comp.id,
      {
        ultimoNSU: comp.ultimoNSU,
        maxNSU: comp.maxNSU,
        lastPolledAt: comp.lastPolledAt,
        nextAllowedPollAt: comp.nextAllowedPollAt,
        lastPollStatus: comp.lastPollStatus,
        varredura90DiasConcluida: comp.varredura90DiasConcluida
      },
      !hasMoreNsu
    );

    return {
      docsCount: docsAdicionadosOuAtualizados,
      hasMoreNsu,
      pendingKeysCount: qtdPendentes,
      manifestedCount,
      blockedOrError: false
    };
  } catch (err: any) {
    comp.lastPolledAt = new Date().toISOString();
    comp.nextAllowedPollAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    comp.lastPollStatus = 'Falha de rede (Retentativa em 30 min)';

    updateSingleCompanyFromRobot(
      comp.id,
      {
        lastPolledAt: comp.lastPolledAt,
        nextAllowedPollAt: comp.nextAllowedPollAt,
        lastPollStatus: comp.lastPollStatus
      },
      false
    );

    addRoboLog({
      empresaNome: comp.razaoSocial,
      empresaCnpj: comp.cnpj,
      nsuInicial: ultNSU,
      nsuFinal: ultNSU,
      maxNsu: comp.maxNSU || ultNSU,
      documentosBaixados: 0,
      status: 'ERRO',
      mensagem: `Falha de comunicação (${err.message || 'Retentando no próximo ciclo'})`
    });
    return { docsCount: 0, hasMoreNsu: false, pendingKeysCount: chavesPendentes.length, manifestedCount: 0, blockedOrError: true };
  }
}

/**
 * Executa o ciclo global do Robô SEFAZ passando por TODAS as empresas habilitadas.
 * - Prioriza no topo da fila:
 *   1º Empresas recém-adicionadas/forçadas pelo usuário (`forcedIds`)
 *   2º Empresas com 0 ou poucas notas (como MANUR, W. F. DE LUCENA, NEWBUS) que ainda não concluíram os 90 dias
 *   3º Demais empresas habilitadas
 */
async function rodarCicloGlobalRobo(forcarEmpresaId?: string): Promise<void> {
  if (forcarEmpresaId) {
    pendingForcedCompanyIds.add(forcarEmpresaId);
  }
  if (isPollingInternal) return;

  isPollingInternal = true;
  globalState.isPollingNow = true;
  emitGlobalStateChange();

  try {
    executarMigracaoUnicaRoboV9();

    let companies = loadStoredCompanies();
    companies = inicializarEmpresasNovasParaVarredura(companies, forcarEmpresaId);

    const forcedIds = Array.from(pendingForcedCompanyIds);
    pendingForcedCompanyIds.clear();

    const allDocs = loadAllStoredDocuments();
    const todasHabilitadas = companies.filter(isEmpresaHabilitadaParaConsultaNfe);

    // Ordena a fila priorizando:
    // 1. forçadas manualmente
    // 2. empresas que ainda não concluíram os 90 dias e têm MENOS documentos (0 notas, 1 nota como MANUR, etc.)
    // 3. demais empresas
    const empresasElegiveis = [...todasHabilitadas].sort((a, b) => {
      const aForced = forcedIds.includes(a.id) ? 0 : 1;
      const bForced = forcedIds.includes(b.id) ? 0 : 1;
      if (aForced !== bForced) return aForced - bForced;

      const aConcluida = a.varredura90DiasConcluida ? 1 : 0;
      const bConcluida = b.varredura90DiasConcluida ? 1 : 0;
      if (aConcluida !== bConcluida) return aConcluida - bConcluida;

      const aCnpj = (a.cnpj || '').replace(/\D/g, '');
      const bCnpj = (b.cnpj || '').replace(/\D/g, '');
      const aDocs = analisarDocumentosArmazenadosEmpresa(aCnpj, allDocs).docsCount;
      const bDocs = analisarDocumentosArmazenadosEmpresa(bCnpj, allDocs).docsCount;
      if (aDocs !== bDocs) return aDocs - bDocs;

      return (a.razaoSocial || '').localeCompare(b.razaoSocial || '', 'pt-BR');
    });

    for (const candidate of empresasElegiveis) {
      if (!globalState.config.ativo && forcedIds.length === 0) break;

      // Relê a lista mais recente do localStorage antes de consultar cada empresa para respeitar exclusões imediatas!
      const freshList = loadStoredCompanies();
      const target = freshList.find(c => c.id === candidate.id);
      if (!target || !isEmpresaHabilitadaParaConsultaNfe(target)) {
        continue;
      }

      const cleanCnpj = (target.cnpj || '').replace(/\D/g, '');
      const isForced = forcedIds.includes(target.id);
      const nowTime = Date.now();

      // 1. Verifica se está em bloqueio SEFAZ 656 — NUNCA consulta durante o bloqueio 656!
      const lock656Until = obterTimestampDesbloqueio656(cleanCnpj, target);
      if (lock656Until > nowTime) {
        continue;
      }

      // 2. Verifica agendamento normal (a menos que seja empresa recém-cadastrada/forçada sem bloqueio 656)
      if (!isForced && target.nextAllowedPollAt) {
        const nextPollTime = new Date(target.nextAllowedPollAt).getTime();
        if (!isNaN(nextPollTime) && nowTime < nextPollTime) {
          continue;
        }
      }

      // 3. Executa a varredura de lotes NSU dos últimos 90 dias até alcançar maxNSU
      let stepRes = await executarEtapaVarreduraEmpresa(target, { apenasProcessarPendentes: false });

      let lotesConsumidos = 1;
      const maxLotesSeguranca = 100; // Permite varrer até 5.000 documentos contínuos de 90 dias
      while (stepRes.hasMoreNsu && !stepRes.blockedOrError && lotesConsumidos < maxLotesSeguranca && globalState.config.ativo) {
        const checkComp = loadStoredCompanies().find(c => c.id === target.id);
        if (!checkComp || !isEmpresaHabilitadaParaConsultaNfe(checkComp)) {
          break;
        }
        lotesConsumidos++;
        await new Promise(r => setTimeout(r, 1400));
        stepRes = await executarEtapaVarreduraEmpresa(checkComp, { apenasProcessarPendentes: false });
      }

      // 4. Sempre que houver chaves pendentes de liberação do XML completo (procNFe) após varrer os lotes,
      // executa até 5 passagens complementares para baixar os XMLs completos imediatamente!
      let passagensPendentes = 0;
      while (
        !stepRes.blockedOrError &&
        obterChavesPendentesEmpresa(cleanCnpj).length > 0 &&
        passagensPendentes < 5 &&
        globalState.config.ativo
      ) {
        const checkComp = loadStoredCompanies().find(c => c.id === target.id);
        if (!checkComp || !isEmpresaHabilitadaParaConsultaNfe(checkComp)) {
          break;
        }
        passagensPendentes++;
        await new Promise(r => setTimeout(r, 1800));
        stepRes = await executarEtapaVarreduraEmpresa(checkComp, { apenasProcessarPendentes: true });
      }
    }
  } finally {
    isPollingInternal = false;
    globalState.isPollingNow = false;
    globalState.currentlyPollingCompany = null;
    emitGlobalStateChange();

    if (pendingForcedCompanyIds.size > 0) {
      setTimeout(() => {
        rodarCicloGlobalRobo();
      }, 500);
    }
  }
}

/**
 * Inicializa o motor singleton que roda em segundo plano com verificação periódica
 * para disparar a busca de 90 dias iniciais e as 3 varreduras diárias (a cada 8h).
 */
function ensureGlobalRobotEngineStarted() {
  if (isEngineInitialized || typeof window === 'undefined') return;
  isEngineInitialized = true;

  executarMigracaoUnicaRoboV9();

  // Sempre que o Firestore (onSnapshot) atualizar a lista de empresas, aplica a verificação corretiva v9
  // para garantir que empresas carregadas da nuvem (como MANUR, W. F. DE LUCENA, NEWBUS) tenham seu cursor corrigido!
  window.addEventListener(COMPANIES_UPDATED_EVENT, () => {
    executarMigracaoUnicaRoboV9();
  });

  // Listener global para quando o usuário salva ou valida um certificado digital no Cadastro Geral de Clientes
  window.addEventListener('sefaz_certificate_connected', (e: any) => {
    const companyId = e?.detail?.companyId;

    globalState.config = saveRoboConfig({ ativo: true, apenasEmpresaSelecionada: false });
    emitGlobalStateChange();

    if (companyId) {
      const currentList = loadStoredCompanies();
      const target = currentList.find(c => c.id === companyId);
      if (target && isEmpresaHabilitadaParaConsultaNfe(target)) {
        const clean = (target.cnpj || '').replace(/\D/g, '');
        const docStats = analisarDocumentosArmazenadosEmpresa(clean);
        const cursor = docStats.docsCount > 5 ? docStats.maxStoredNsuFormatted : '0';

        if (clean) {
          localStorage.setItem(`sefaz_ult_nsu_${clean}`, cursor);
          localStorage.setItem(`${SWEEP_90D_INITIALIZED_PREFIX}${clean}`, 'done');
        }

        const lock656Ms = obterTimestampDesbloqueio656(clean, target);
        updateSingleCompanyFromRobot(
          companyId,
          {
            ultimoNSU: cursor,
            varredura90DiasConcluida: false,
            nextAllowedPollAt: lock656Ms > Date.now() ? new Date(lock656Ms).toISOString() : undefined,
            lastPollStatus:
              lock656Ms > Date.now()
                ? target.lastPollStatus
                : `Iniciando varredura automática de 90 dias...`
          },
          true
        );
      }
    }

    rodarCicloGlobalRobo(companyId);
  });

  const verificarAgendamento = () => {
    if (!globalState.config.ativo) {
      if (globalState.secondsUntilNextSweep !== 0) {
        globalState.secondsUntilNextSweep = 0;
        emitGlobalStateChange();
      }
      return;
    }

    executarMigracaoUnicaRoboV9();
    const companies = inicializarEmpresasNovasParaVarredura(loadStoredCompanies());
    const targetCompanies = companies.filter(isEmpresaHabilitadaParaConsultaNfe);

    if (targetCompanies.length === 0) {
      if (globalState.secondsUntilNextSweep !== 0) {
        globalState.secondsUntilNextSweep = 0;
        emitGlobalStateChange();
      }
      return;
    }

    const now = Date.now();
    let menorTempo = Infinity;
    let algumaPronta = false;

    targetCompanies.forEach(c => {
      const cleanCnpj = (c.cnpj || '').replace(/\D/g, '');
      const lock656Until = obterTimestampDesbloqueio656(cleanCnpj, c);

      // Se estiver em cooldown do 656, respeita rigorosamente o horário de desbloqueio (~75 min)
      if (lock656Until > now) {
        const diff656 = Math.max(1, Math.floor((lock656Until - now) / 1000));
        if (diff656 < menorTempo) {
          menorTempo = diff656;
        }
        return;
      }

      const ultNum = parseInt(String(c.ultimoNSU || '0').replace(/\D/g, ''), 10) || 0;
      const maxNum = parseInt(String(c.maxNSU || '0').replace(/\D/g, ''), 10) || 0;
      const isZeroNsuConfirmado = isEmpresaComNsuZeradoNaSefaz(c, analisarDocumentosArmazenadosEmpresa(cleanCnpj).docsCount);
      const faltamLotesNsu = (!c.varredura90DiasConcluida && !isZeroNsuConfirmado) || (maxNum > 0 && ultNum < maxNum);

      if (!c.nextAllowedPollAt || faltamLotesNsu) {
        algumaPronta = true;
        menorTempo = 0;
      } else {
        const t = new Date(c.nextAllowedPollAt).getTime();
        const diff = isNaN(t) ? 0 : Math.max(0, Math.floor((t - now) / 1000));
        if (diff === 0) {
          algumaPronta = true;
        }
        if (diff < menorTempo) {
          menorTempo = diff;
        }
      }
    });

    const nextSeconds = menorTempo === Infinity ? 0 : menorTempo;
    if (globalState.secondsUntilNextSweep !== nextSeconds) {
      globalState.secondsUntilNextSweep = nextSeconds;
      emitGlobalStateChange();
    }

    if (algumaPronta && !isPollingInternal) {
      rodarCicloGlobalRobo();
    }
  };

  // Dispara verificação inicial após 1.5s e depois avalia a cada 25 segundos
  setTimeout(verificarAgendamento, 1500);
  setInterval(verificarAgendamento, 25 * 1000);
}

export function useSefazRobot(
  _companies: Company[],
  selectedCompanyId: string,
  onCompaniesUpdated?: (comps: Company[]) => void
) {
  ensureGlobalRobotEngineStarted();

  const [snapshot, setSnapshot] = useState<GlobalRoboRuntimeState>({ ...globalState });
  const [logs, setLogs] = useState<RoboLogItem[]>(loadRoboLogs());

  useEffect(() => {
    globalState.selectedCompanyId = selectedCompanyId || '';
  }, [selectedCompanyId]);

  useEffect(() => {
    const handleStateChange = () => {
      setSnapshot({ ...globalState });
    };
    const handleLogsUpdate = () => {
      setLogs(loadRoboLogs());
    };
    const handleCompaniesUpdate = () => {
      if (onCompaniesUpdated) {
        onCompaniesUpdated(loadStoredCompanies());
      }
    };

    window.addEventListener(ROBO_STATE_CHANGED_EVENT, handleStateChange);
    window.addEventListener(SEFAZ_ROBO_LOGS_UPDATED_EVENT, handleLogsUpdate);
    window.addEventListener(COMPANIES_UPDATED_EVENT, handleCompaniesUpdate);

    return () => {
      window.removeEventListener(ROBO_STATE_CHANGED_EVENT, handleStateChange);
      window.removeEventListener(SEFAZ_ROBO_LOGS_UPDATED_EVENT, handleLogsUpdate);
      window.removeEventListener(COMPANIES_UPDATED_EVENT, handleCompaniesUpdate);
    };
  }, [onCompaniesUpdated]);

  const toggleAtivo = useCallback(() => {
    const novoAtivo = !globalState.config.ativo;
    globalState.config = saveRoboConfig({ ativo: novoAtivo, apenasEmpresaSelecionada: false });
    emitGlobalStateChange();
    if (novoAtivo) {
      rodarCicloGlobalRobo();
    }
  }, []);

  const updateConfig = useCallback((newCfg: Partial<RoboVarreduraConfig>) => {
    globalState.config = saveRoboConfig({ ...newCfg, apenasEmpresaSelecionada: false });
    emitGlobalStateChange();
  }, []);

  const handleLimparLogs = useCallback(() => {
    clearRoboLogs();
    setLogs([]);
  }, []);

  const forcarVarreduraAgora = useCallback((companyId?: string) => {
    if (companyId) {
      reiniciarVarreduraCompleta90DiasEmpresa(companyId);
      return;
    }
    rodarCicloGlobalRobo();
  }, []);

  return {
    config: snapshot.config,
    updateConfig,
    toggleAtivo,
    logs,
    clearLogs: handleLimparLogs,
    isPollingNow: snapshot.isPollingNow,
    currentlyPollingCompany: snapshot.currentlyPollingCompany,
    secondsUntilNextSweep: snapshot.secondsUntilNextSweep,
    newDocsCountSession: snapshot.newDocsCountSession,
    forcarVarreduraAgora
  };
}
