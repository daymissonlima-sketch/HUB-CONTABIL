/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ErpIcmsColumnMapping {
  notaFiscalIdx?: number;
  serieIdx?: number;
  modeloIdx?: number;
  dataEmissaoIdx?: number;
  chaveDeAcessoIdx?: number;
  cnpjIdx?: number;
  razaoSocialIdx?: number;
  ufIdx?: number;
  cfopIdx?: number;
  cstIcmsIdx?: number;
  valorContabilIdx?: number;
  baseIcmsIdx?: number;
  aliquotaIcmsIdx?: number;
  valorIcmsIdx?: number;
  valorIsentoIdx?: number;
  valorOutrosIdx?: number;
}

export interface ErpIcmsConfig {
  toleranceAmount: number;
  defaultUf: string;
  defaultAliquotaIcms: number;
  checkChaveChecksum: boolean;
  checkIcmsRecalculation: boolean;
  checkCstConsistency: boolean;
  checkGapAnalysis: boolean;
  columnMapping?: ErpIcmsColumnMapping;
}

export const DEFAULT_ERP_ICMS_CONFIG: ErpIcmsConfig = {
  toleranceAmount: 0.01,
  defaultUf: 'CE',
  defaultAliquotaIcms: 18.0,
  checkChaveChecksum: true,
  checkIcmsRecalculation: true,
  checkCstConsistency: true,
  checkGapAnalysis: true,
};
