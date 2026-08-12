/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ErpPisCofinsColumnMapping {
  notaFiscalIdx?: number;
  dataEmissaoIdx?: number;
  modeloIdx?: number;
  cfopIdx?: number;
  codigoProdutoIdx?: number;
  descricaoProdutoIdx?: number;
  cstPisIdx?: number;
  cstCofinsIdx?: number;
  valorItemIdx?: number;
  basePisIdx?: number;
  aliquotaPisIdx?: number;
  valorPisIdx?: number;
  baseCofinsIdx?: number;
  aliquotaCofinsIdx?: number;
  valorCofinsIdx?: number;
}

export interface ErpPisCofinsConfig {
  toleranceAmount: number;
  defaultRegime: 'CUMULATIVO' | 'NAO_CUMULATIVO' | 'MISTO';
  defaultAliqPisCumulative: number;
  defaultAliqCofinsCumulative: number;
  defaultAliqPisNonCumulative: number;
  defaultAliqCofinsNonCumulative: number;
  checkPisRecalculation: boolean;
  checkCofinsRecalculation: boolean;
  checkCstPisCofinsMatch: boolean;
  checkCreditEligibility: boolean;
  columnMapping?: ErpPisCofinsColumnMapping;
}

export const DEFAULT_ERP_PIS_COFINS_CONFIG: ErpPisCofinsConfig = {
  toleranceAmount: 0.01,
  defaultRegime: 'NAO_CUMULATIVO',
  defaultAliqPisCumulative: 0.65,
  defaultAliqCofinsCumulative: 3.0,
  defaultAliqPisNonCumulative: 1.65,
  defaultAliqCofinsNonCumulative: 7.6,
  checkPisRecalculation: true,
  checkCofinsRecalculation: true,
  checkCstPisCofinsMatch: true,
  checkCreditEligibility: true,
};
