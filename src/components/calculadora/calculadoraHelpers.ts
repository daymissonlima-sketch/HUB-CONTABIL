/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Helpers unificados para formatação e conversão de valores no padrão brasileiro (R$ e %)
 */

export function formatarNumeroBr(valor: number, casas: number = 2): string {
  if (isNaN(valor)) return '0,00';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(valor);
}

export function parseNumeroBr(str: string): number {
  if (!str) return 0;
  const limpo = str.replace(/[^\d,\.-]/g, '').trim();
  if (!limpo) return 0;
  
  if (limpo.includes('.') && limpo.includes(',')) {
    return parseFloat(limpo.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (limpo.includes(',')) {
    return parseFloat(limpo.replace(',', '.')) || 0;
  }
  return parseFloat(limpo) || 0;
}
