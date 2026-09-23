/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * InstallmentService.ts
 * Serviço e persistência 100% Client-Side das simulações de parcelamento.
 * Mantém a matemática e as informações exatamente como eram anteriormente no simulador original:
 * - Tributo / Modalidade do Parcelamento
 * - Valor Total Atualizado
 * - Forma de Pagamento da Entrada (À Vista ou Parcelada com Qtd e Valor)
 * - Parcelamento do Saldo / Básica (Qtd de Parcelas e Valor da Parcela)
 * - Projeção Total (Entrada Total + Parcelas Básicas)
 * Sem Selic, sem cronograma mensal e sem prazos fixos restritivos.
 */

import { DebtSimulationLink } from '../types_debits';
import { saveToIDB, getFromIDB } from '../utils/idbStorage';

export const DEBT_SIMULATION_UPDATED_EVENT = 'moreira_lima_debt_simulations_updated';

export interface SimulationCalculationInput {
  totalDebt: number;
  downPayment?: number;
  isDownPaymentInstallment?: boolean;
  downPaymentInstallmentsCount?: number;
  downPaymentInstallmentValue?: number;
  installmentsCount: number;
  installmentValue?: number;
  parcelamentoType?: string;
}

export interface SimulationCalculationResult {
  totalDebt: number;
  totalDown: number;
  financedAmount: number;
  installmentsCount: number;
  avgInstallment: number;
  totalPaid: number;
  entradaQtd: number;
  entradaVal: number;
  isParcelada: boolean;
  parcelamentoType?: string;
}

/**
 * Executa o cálculo idêntico ao que existia anteriormente na função de simulação de parcelamento
 */
export function getSimulationResults(sim: SimulationCalculationInput): SimulationCalculationResult {
  const totalDebt = Math.max(0, sim.totalDebt || 0);
  const isParcelada = !!sim.isDownPaymentInstallment;
  const entradaQtd = isParcelada ? Math.max(1, sim.downPaymentInstallmentsCount || 12) : 1;
  
  const entradaVal = isParcelada
    ? (sim.downPaymentInstallmentValue || (sim.downPayment ? sim.downPayment / entradaQtd : 0))
    : (sim.downPayment || 0);
    
  const totalDown = isParcelada ? (entradaVal * entradaQtd) : (sim.downPayment || 0);

  const principalToFinance = Math.max(0, totalDebt - totalDown);
  const pmt = sim.installmentValue && sim.installmentValue > 0
    ? sim.installmentValue
    : (sim.installmentsCount > 0 ? principalToFinance / sim.installmentsCount : 0);

  const totalPaid = totalDown + ((sim.installmentsCount || 0) * pmt);

  return {
    totalDebt,
    totalDown,
    financedAmount: principalToFinance,
    installmentsCount: sim.installmentsCount || 0,
    avgInstallment: pmt,
    totalPaid,
    entradaQtd,
    entradaVal,
    isParcelada,
    parcelamentoType: sim.parcelamentoType
  };
}

/**
 * Formata moeda BRL
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

// --------------------------------------------------------------------------
// PERSISTÊNCIA 100% CLIENT-SIDE (LocalStorage síncrono + IndexedDB durável)
// --------------------------------------------------------------------------

function getStorageKey(companyIdOrCnpj?: string): string {
  const clean = (companyIdOrCnpj || 'global').replace(/\D/g, '') || 'global';
  return `ml_debt_simulations_${clean}`;
}

/**
 * Lê todas as simulações vinculadas a débitos/categorias de forma síncrona
 */
export function getAllLinkedSimulationsSync(
  companyIdOrCnpj?: string
): Record<string, DebtSimulationLink> {
  if (typeof window === 'undefined') return {};
  const key = getStorageKey(companyIdOrCnpj);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error('Erro ao ler simulações vinculadas do localStorage:', e);
    return {};
  }
}

/**
 * Retorna uma simulação vinculada a um débito ou categoria específica
 */
export function getLinkedSimulationSync(
  targetId: string,
  companyIdOrCnpj?: string
): DebtSimulationLink | null {
  const all = getAllLinkedSimulationsSync(companyIdOrCnpj);
  return all[targetId] || null;
}

/**
 * Salva uma simulação vinculada ao ID do débito ou ao grupo de competências
 */
export async function saveLinkedSimulation(
  sim: DebtSimulationLink,
  companyIdOrCnpj?: string
): Promise<void> {
  const key = getStorageKey(companyIdOrCnpj);
  const all = getAllLinkedSimulationsSync(companyIdOrCnpj);
  
  all[sim.targetId] = {
    ...sim,
    savedAt: new Date().toISOString()
  };

  const serialized = JSON.stringify(all);

  // 1. Atualização síncrona no LocalStorage (feedback instantâneo)
  try {
    localStorage.setItem(key, serialized);
  } catch (e) {
    console.warn('Aviso: falha ao gravar simulação no localStorage:', e);
  }

  // 2. Backup assíncrono garantido no IndexedDB
  try {
    await saveToIDB(key, serialized);
  } catch (e) {
    console.warn('Aviso: falha ao gravar simulação no IndexedDB:', e);
  }

  // 3. Notifica listeners de UI
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DEBT_SIMULATION_UPDATED_EVENT, { detail: { targetId: sim.targetId } }));
  }
}

/**
 * Remove o vínculo de simulação de um débito
 */
export async function removeLinkedSimulation(
  targetId: string,
  companyIdOrCnpj?: string
): Promise<void> {
  const key = getStorageKey(companyIdOrCnpj);
  const all = getAllLinkedSimulationsSync(companyIdOrCnpj);

  if (all[targetId]) {
    delete all[targetId];
    const serialized = JSON.stringify(all);

    try {
      localStorage.setItem(key, serialized);
    } catch (e) {}

    try {
      await saveToIDB(key, serialized);
    } catch (e) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(DEBT_SIMULATION_UPDATED_EVENT, { detail: { targetId } }));
    }
  }
}

/**
 * Sincroniza do IndexedDB para o LocalStorage na inicialização
 */
export async function syncSimulationsFromIDB(companyIdOrCnpj?: string): Promise<Record<string, DebtSimulationLink>> {
  const key = getStorageKey(companyIdOrCnpj);
  try {
    const idbData = await getFromIDB(key);
    if (idbData) {
      localStorage.setItem(key, idbData);
      return JSON.parse(idbData);
    }
  } catch (e) {
    console.error('Erro ao sincronizar simulações do IndexedDB:', e);
  }
  return getAllLinkedSimulationsSync(companyIdOrCnpj);
}
