/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Shared Formatting and Sanitization Utilities
 */

/**
 * Remove qualquer caractere não numérico de uma string (CNPJ, CPF, Telefone, etc.)
 */
export const cleanDocument = (val?: string | null): string => {
  if (!val) return '';
  return val.replace(/\D/g, '');
};

/**
 * Formata um CNPJ (14 dígitos) no padrão XX.XXX.XXX/XXXX-XX
 */
export const formatCnpj = (val?: string | null): string => {
  if (!val) return '';
  const clean = cleanDocument(val);
  if (clean.length !== 14) return val;
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
};

/**
 * Formata um CPF (11 dígitos) no padrão XXX.XXX.XXX-XX
 */
export const formatCpf = (val?: string | null): string => {
  if (!val) return '';
  const clean = cleanDocument(val);
  if (clean.length !== 11) return val;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
};

/**
 * Formata um documento automaticamente para CNPJ ou CPF
 */
export const formatCnpjCpf = (val?: string | null): string => {
  if (!val) return '';
  const clean = cleanDocument(val);
  return clean.length === 14 ? formatCnpj(clean) : clean.length === 11 ? formatCpf(clean) : val;
};

/**
 * Formata um número para moeda BRL (R$ 1.234,56)
 */
export const formatCurrency = (val: number | undefined | null): string => {
  const num = typeof val === 'number' && !isNaN(val) ? val : 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

/**
 * Formata um valor percentual (ex: 18 -> "18,00%")
 */
export const formatPercent = (val: number | undefined | null, decimals = 2): string => {
  const num = typeof val === 'number' && !isNaN(val) ? val : 0;
  return `${num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
};

/**
 * Formata número no padrão brasileiro decimal (1.234,56)
 */
export const formatNumberPtBr = (val: number | undefined | null, decimals = 2): string => {
  const num = typeof val === 'number' && !isNaN(val) ? val : 0;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

/**
 * Converte string no padrão brasileiro ("1.234,56" ou "50,5%") para número JavaScript
 */
export const parseNumberPtBr = (str?: string | null): number => {
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
};
