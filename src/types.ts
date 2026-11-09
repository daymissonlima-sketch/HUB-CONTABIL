/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface NFeItemRow {
  // Unique identification
  id: string; // chNFe + "_" + nItem
  
  // General NFe Header Info
  chNFe: string;       // Chave de acesso (44 digits)
  nNF: string;         // Número da Nota Fiscal
  serie: string;       // Série
  modelo: string;      // Modelo da Nota (55 ou 65)
  dhEmi: string;       // Data de Emissão (DD/MM/YYYY)
  emitCNPJ: string;    // CNPJ ou CPF do Emitente
  emitNome: string;    // Nome / Razão Social do Emitente
  destCNPJ: string;    // CNPJ ou CPF do Destinatário (Excluded in IBS/CBS)
  destNome: string;    // Nome / Razão Social do Destinatário (Excluded in IBS/CBS)
  
  // Item Specific Info
  nItem: string;       // Número do Item
  cProd: string;       // Código do Produto
  xProd: string;       // Descrição do Produto
  NCM: string;         // Código NCM
  CFOP: string;        // CFOP
  uCom: string;        // Unidade Comercial
  qCom: number;        // Quantidade Comercial
  vUnCom: number;      // Valor Unitário Comercial
  vProd: number;       // Valor Total do Item (vProd)
  orig?: string;       // Origem da mercadoria (0=Nacional, 1,2=Estrangeira, etc.)
  emitUF?: string;     // UF do Emitente
  vFrete?: number;     // Valor do Frete rateado
  vSeg?: number;       // Valor do Seguro rateado
  vOutro?: number;     // Outras despesas acessórias
  vDesc?: number;      // Desconto do item
  
  // Standard Taxes (ICMS Normal & ICMS ST)
  cstICMS: string;     // CST ou CSOSN do ICMS
  vBC_ICMS: number;    // Valor da BC do ICMS
  pICMS: number;       // Alíquota do ICMS (%)
  vICMS: number;       // Valor do ICMS
  vBCST?: number;      // BC do ICMS ST
  pICMSST?: number;    // Alíquota do ICMS ST (%)
  vICMSST?: number;    // Valor do ICMS ST

  // Decreto 29.560 (Termo de Acordo Atacadista / RET 2024)
  vBC_ST_29560?: number;    // BC ICMS ST Decreto 29.560
  pICMSST_29560?: number;   // Alíquota ST Decreto 29.560 (%)
  vICMSST_29560?: number;   // Valor ICMS ST Decreto 29.560
  regraDecreto29560?: string; // Descrição da regra (ex: Simples Nacional Interno +3%, Importado 4% +3%)
  isSimplesNacional?: boolean; // Fornecedor optante pelo Simples Nacional
  isImportado4Pct?: boolean;   // Produto importado interestadual a 4% (Res. 13/2012)
  destUF?: string;             // UF do Destinatário
  crt?: string;                // Código de Regime Tributário (1=Simples, 3=Normal)

  // FECOP / FCP (Fundo de Combate à Pobreza)
  vBCFCP?: number;     // BC do FECOP Normal
  pFCP?: number;       // Alíquota do FECOP Normal (%)
  vFCP?: number;       // Valor do FECOP Normal
  vBCFCPST?: number;   // BC do FECOP ST
  pFCPST?: number;     // Alíquota do FECOP ST (%)
  vFCPST?: number;     // Valor do FECOP ST

  // IPI
  cstIPI?: string;     // CST do IPI
  vBC_IPI?: number;    // BC do IPI
  pIPI?: number;       // Alíquota do IPI (%)
  vIPI?: number;       // Valor do IPI
  
  // PIS / COFINS (Standard)
  cstPIS: string;      // CST do PIS
  vBC_PIS: number;     // BC do PIS
  pPIS: number;        // Alíquota PIS (%)
  vPIS: number;        // Valor PIS
  cstCOFINS: string;   // CST do COFINS
  vBC_COFINS: number;  // BC do COFINS
  pCOFINS: number;     // Alíquota COFINS (%)
  vCOFINS: number;     // Valor COFINS

  // New Tax Reform Fields (IBS / CBS)
  cClassTrib: string;  // Classificação Tributária do IBS/CBS
  cstIBS: string;      // CST do IBS
  cstCBS: string;      // CST do CBS
  vBC_IBS: number;     // Valor da BC do IBS
  pIBS: number;        // Alíquota do IBS (%)
  vIBS: number;        // Valor do IBS
  vBC_CBS: number;     // Valor da BC do CBS
  pCBS: number;        // Alíquota do CBS (%)
  vCBS: number;        // Valor do CBS
  
  // Specific IBS UF and Mun fields
  pIBSUF?: number;     // Alíquota do IBS Estadual (%)
  vIBSUF?: number;     // Valor do IBS Estadual
  pIBSMun?: number;    // Alíquota do IBS Municipal (%)
  vIBSMun?: number;    // Valor do IBS Municipal
  
  // Additional / Fiscal Info - (Excluded in IBS/CBS)
  infAdic: string;     // Informações Complementares
  infAdFisco: string;  // Informações de Interesse do Fisco
}

export type ViewMode = 'padrao' | 'ibscbs';

export interface SortConfig {
  column: keyof NFeItemRow | null;
  direction: 'asc' | 'desc';
}

export interface GridFilters {
  search: string;
  nNF: string;
  emitNome: string;
  NCM: string;
  CFOP: string;
}
