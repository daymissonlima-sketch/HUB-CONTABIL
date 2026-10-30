/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Helpers unificados para formatação e conversão de valores no padrão brasileiro (R$ e %)
 * Re-exporta utilitários compartilhados transversais
 */

import { formatNumberPtBr, parseNumberPtBr } from '../../shared/utils/formatters';

export const formatarNumeroBr = (valor: number, casas: number = 2): string => formatNumberPtBr(valor, casas);
export const parseNumeroBr = (str: string): number => parseNumberPtBr(str);
