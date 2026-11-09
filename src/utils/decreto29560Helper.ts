/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Fornecedores beneficiários do Decreto 29.560 informados pelo usuário:
// 1. RICLAN S.A.
// 2. INDUSTRIA E COMERCIO DE PRODUTOS ALIMENTICIOS CEPERA LTDA
// 3. SANCHEZ CANO LTDA
// 4. Neugebauer Alimentos S/A - APB
// 5. ITAMARATY INDUSTRIA E COMERCIO S/A
// 6. AB - INDUSTRIA E COMERCIO DE ALIMENTOS LTDA - EPP EPP
// 7. DIVAMED DIST. IRMAOS VALOTTO MED. LTDA
export const DEFAULT_DECRETO_29560_SUPPLIERS = [
  'RICLAN S.A.',
  'INDUSTRIA E COMERCIO DE PRODUTOS ALIMENTICIOS CEPERA LTDA',
  'SANCHEZ CANO LTDA',
  'Neugebauer Alimentos S/A - APB',
  'ITAMARATY INDUSTRIA E COMERCIO S/A',
  'AB - INDUSTRIA E COMERCIO DE ALIMENTOS LTDA - EPP EPP',
  'DIVAMED DIST. IRMAOS VALOTTO MED. LTDA'
];

export interface Decreto29560Config {
  enabled: boolean;
  suppliers: string[];
}

export const UF_REGIONS: Record<string, 'PROPRIO_OU_EXTERIOR' | 'NORTE_NORDESTE_CO_ES' | 'SUL_SUDESTE_EXCETO_ES'> = {
  // Próprio estado (ex: CE - Ceará onde rege o Decreto 29.560 / Termo de Acordo Atacadista) ou Exterior (EX)
  'CE': 'PROPRIO_OU_EXTERIOR',
  'EX': 'PROPRIO_OU_EXTERIOR',

  // Regiões Norte, Nordeste, Centro-Oeste e Estado do Espírito Santo
  'AC': 'NORTE_NORDESTE_CO_ES',
  'AL': 'NORTE_NORDESTE_CO_ES',
  'AP': 'NORTE_NORDESTE_CO_ES',
  'AM': 'NORTE_NORDESTE_CO_ES',
  'BA': 'NORTE_NORDESTE_CO_ES',
  'DF': 'NORTE_NORDESTE_CO_ES',
  'ES': 'NORTE_NORDESTE_CO_ES',
  'GO': 'NORTE_NORDESTE_CO_ES',
  'MA': 'NORTE_NORDESTE_CO_ES',
  'MT': 'NORTE_NORDESTE_CO_ES',
  'MS': 'NORTE_NORDESTE_CO_ES',
  'PA': 'NORTE_NORDESTE_CO_ES',
  'PB': 'NORTE_NORDESTE_CO_ES',
  'PE': 'NORTE_NORDESTE_CO_ES',
  'PI': 'NORTE_NORDESTE_CO_ES',
  'RN': 'NORTE_NORDESTE_CO_ES',
  'RO': 'NORTE_NORDESTE_CO_ES',
  'RR': 'NORTE_NORDESTE_CO_ES',
  'SE': 'NORTE_NORDESTE_CO_ES',
  'TO': 'NORTE_NORDESTE_CO_ES',

  // Regiões Sul e Sudeste, exceto o Estado do Espírito Santo
  'MG': 'SUL_SUDESTE_EXCETO_ES',
  'PR': 'SUL_SUDESTE_EXCETO_ES',
  'RJ': 'SUL_SUDESTE_EXCETO_ES',
  'RS': 'SUL_SUDESTE_EXCETO_ES',
  'SC': 'SUL_SUDESTE_EXCETO_ES',
  'SP': 'SUL_SUDESTE_EXCETO_ES'
};

/**
 * Tabela Contribuinte Destinatário ATACADISTA com RET 2024 (Decreto 29.560)
 * Alíquotas Padrão conforme alíquota interna e região de origem
 */
export const RET_2024_TAX_RATES = {
  // 7% (Cesta Básica)
  '7': {
    PROPRIO_OU_EXTERIOR: 2.19,
    NORTE_NORDESTE_CO_ES: 4.16,
    SUL_SUDESTE_EXCETO_ES: 5.12
  },
  // 9.72% (Álcool não combustível, gel antisséptico até 1L)
  '9.72': {
    PROPRIO_OU_EXTERIOR: 2.08,
    NORTE_NORDESTE_CO_ES: 7.47,
    SUL_SUDESTE_EXCETO_ES: 9.49
  },
  // 12% (Cesta Básica)
  '12': {
    PROPRIO_OU_EXTERIOR: 2.99,
    NORTE_NORDESTE_CO_ES: 5.12,
    SUL_SUDESTE_EXCETO_ES: 6.58
  },
  // 20% (Demais mercadorias - Regra Geral)
  '20': {
    PROPRIO_OU_EXTERIOR: 4.08,
    NORTE_NORDESTE_CO_ES: 8.31,
    SUL_SUDESTE_EXCETO_ES: 10.96
  },
  // 25% (Álcool não combustível a granel)
  '25': {
    PROPRIO_OU_EXTERIOR: 4.27,
    NORTE_NORDESTE_CO_ES: 16.88,
    SUL_SUDESTE_EXCETO_ES: 21.54
  },
  // 28% (Vinhos, sidras e bebidas quentes)
  '28': {
    PROPRIO_OU_EXTERIOR: 4.78,
    NORTE_NORDESTE_CO_ES: 19.84,
    SUL_SUDESTE_EXCETO_ES: 24.68
  }
};

/**
 * Verifica se a razão social do emitente corresponde à lista de fornecedores do Decreto 29.560
 */
export function isSupplierEligibleForDecreto29560(emitNome: string, suppliers: string[]): boolean {
  if (!emitNome) return false;
  const normalizedEmit = emitNome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return suppliers.some(supp => {
    const normSupp = supp.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!normSupp) return false;
    if (normalizedEmit.includes(normSupp) || normSupp.includes(normalizedEmit)) return true;

    // Specific match for AB Alimentos (2-letter brand)
    if (normSupp.includes('AB') && (normSupp.includes('ALIMENTO') || normSupp.includes('ALIMENTOS'))) {
      if (
        (normalizedEmit.startsWith('AB ') || normalizedEmit.startsWith('AB-') || normalizedEmit.startsWith('AB -') || normalizedEmit.includes(' AB ')) &&
        (normalizedEmit.includes('ALIMENT') || normalizedEmit.includes('IND'))
      ) {
        return true;
      }
    }

    // Specific match for DIVAMED / VALOTTO
    if (normSupp.includes('DIVAMED') || normSupp.includes('VALOTTO')) {
      if (normalizedEmit.includes('DIVAMED') || normalizedEmit.includes('VALOTTO')) {
        return true;
      }
    }

    // Check key distinctive corporate terms (e.g. RICLAN, CEPERA, SANCHEZ, NEUGEBAUER, ITAMARATY, DIVAMED, VALOTTO)
    const keywords = normSupp
      .split(/[^A-Z0-9]+/)
      .filter(w => w.length >= 4 && !['INDUSTRIA', 'COMERCIO', 'PRODUTOS', 'ALIMENTICIOS', 'LTDA', 'ALIMENTOS', 'BRASIL', 'DIST', 'DISTRIBUIDORA'].includes(w));
    
    return keywords.some(k => normalizedEmit.includes(k));
  });
}

export type OriginRegionType = 'PROPRIO_ESTADO' | 'NORTE_NORDESTE_CO_ES' | 'SUL_SUDESTE_EXCETO_ES' | 'EXTERIOR_DIRETO';

/**
 * Resolve a região geográfica de origem da mercadoria com base na UF do Emitente e Destinatário
 */
export function resolveOriginRegion(
  emitUF: string,
  destUF: string = 'CE'
): OriginRegionType {
  const ufUpper = (emitUF || '').trim().toUpperCase();
  const destUpper = (destUF || 'CE').trim().toUpperCase();

  if (ufUpper === 'EX') {
    return 'EXTERIOR_DIRETO';
  }

  // Operação interna (mesmo estado, Ceará)
  if (!ufUpper || ufUpper === destUpper || ufUpper === 'CE') {
    return 'PROPRIO_ESTADO';
  }

  // Sul e Sudeste, exceto o Estado do Espírito Santo
  if (['MG', 'PR', 'RJ', 'RS', 'SC', 'SP'].includes(ufUpper)) {
    return 'SUL_SUDESTE_EXCETO_ES';
  }

  // Regiões Norte, Nordeste, Centro-Oeste e Estado do Espírito Santo
  return 'NORTE_NORDESTE_CO_ES';
}

/**
 * Identifica se o emitente é optante pelo Simples Nacional
 * com base na tag CRT (1 ou 2), CSOSN no ICMS ou termos corporativos (EPP, ME)
 */
export function isSimplesNacionalSupplier(
  emitNome: string,
  crt?: string,
  cstICMS?: string
): boolean {
  // 1. Tag CRT do XML (1 = Simples Nacional, 2 = Simples Nacional com excesso de sublimite)
  if (crt === '1' || crt === '2') {
    return true;
  }

  // 2. CSOSN do Simples Nacional (3 dígitos iniciados em 1, 2, 5 ou 9)
  if (cstICMS && cstICMS.length === 3 && (cstICMS.startsWith('1') || cstICMS.startsWith('2') || cstICMS.startsWith('5') || cstICMS.startsWith('9'))) {
    return true;
  }

  // 3. Identificação nominal na Razão Social (ex: EPP, ME, SIMPLES NACIONAL)
  if (emitNome) {
    const norm = emitNome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/\b(EPP|ME|SIMPLES|MICROEMPRESA|PEQUENO PORTE)\b/.test(norm)) {
      return true;
    }
  }

  return false;
}

/**
 * Identifica se a mercadoria é de Origem Estrangeira procedente de outra UF e sujeita à alíquota de 4%
 * conforme Resolução nº 13/2012 do Senado Federal
 */
export function isImportedGoods4Pct(
  orig?: string,
  pICMS?: number,
  isInterstate: boolean = true
): boolean {
  if (!isInterstate) return false;

  // Origens estrangeiras da tabela SPED / NF-e:
  // 1: Estrangeira - Importação direta
  // 2: Estrangeira - Adquirida no mercado interno
  // 3: Nacional com Conteúdo de Importação superior a 40%
  // 8: Nacional com Conteúdo de Importação superior a 70%
  const isForeignOrigin = orig === '1' || orig === '2' || orig === '3' || orig === '8';

  if (pICMS === 4) {
    return true;
  }

  if (isForeignOrigin && (pICMS === 4 || pICMS === 0 || pICMS === undefined)) {
    return true;
  }

  return false;
}

export interface Decreto29560RateCalculation {
  baseRate: number;       // Alíquota base Anexo III (ex: 4.08, 8.31, 10.96)
  acrescimo: number;      // Acréscimo legal aplicado (+3%, +4%, +6%, +8%)
  finalRate: number;      // Alíquota final do Decreto 29.560 (%)
  tipoRegra: 'PADRAO' | 'SIMPLES_NACIONAL' | 'IMPORTADO_4PCT';
  descricaoRegra: string; // Detalhamento da regra aplicada
}

/**
 * Calcula a alíquota líquida do Decreto 29.560/08 aplicando a tabela base e os acréscimos legais:
 * 
 * 1. Aquisições de optantes pelo Simples Nacional (Anexo III / Art. 4º):
 *    - Operações internas: + 3%
 *    - Sul e Sudeste (exceto ES): + 4%
 *    - Norte, Nordeste, Centro-Oeste e ES: + 6%
 * 
 * 2. Entradas de produtos de origem estrangeira de outras UFs a 4% (Res. 13/2012):
 *    - Sul e Sudeste (exceto ES): + 3%
 *    - Norte, Nordeste, Centro-Oeste e ES: + 8%
 */
export function calculateDecreto29560TaxRate(params: {
  region: OriginRegionType;
  internalRate?: number;
  isSimplesNacional?: boolean;
  isImportado4Pct?: boolean;
}): Decreto29560RateCalculation {
  const { region, internalRate = 20, isSimplesNacional = false, isImportado4Pct = false } = params;

  const rateKey = internalRate === 7 || internalRate === 12 || internalRate === 25 || internalRate === 28
    ? String(internalRate)
    : '20'; // Demais mercadorias é a regra padrão (20%)

  const tableRow = (RET_2024_TAX_RATES as any)[rateKey] || RET_2024_TAX_RATES['20'];

  let baseRegionKey: 'PROPRIO_OU_EXTERIOR' | 'NORTE_NORDESTE_CO_ES' | 'SUL_SUDESTE_EXCETO_ES' = 'NORTE_NORDESTE_CO_ES';
  if (region === 'PROPRIO_ESTADO' || region === 'EXTERIOR_DIRETO') {
    baseRegionKey = 'PROPRIO_OU_EXTERIOR';
  } else if (region === 'SUL_SUDESTE_EXCETO_ES') {
    baseRegionKey = 'SUL_SUDESTE_EXCETO_ES';
  } else {
    baseRegionKey = 'NORTE_NORDESTE_CO_ES';
  }

  const baseRate = tableRow[baseRegionKey] || 8.31;
  let acrescimo = 0;
  let tipoRegra: 'PADRAO' | 'SIMPLES_NACIONAL' | 'IMPORTADO_4PCT' = 'PADRAO';
  let descricaoRegra = 'Regime Normal Padrão';

  // 1. Regra do Simples Nacional (Decreto 29.560/08)
  if (isSimplesNacional) {
    tipoRegra = 'SIMPLES_NACIONAL';
    if (region === 'PROPRIO_ESTADO' || region === 'EXTERIOR_DIRETO') {
      acrescimo = 3.00;
      descricaoRegra = 'Simples Nacional — Operação Interna (+3,00%)';
    } else if (region === 'SUL_SUDESTE_EXCETO_ES') {
      acrescimo = 4.00;
      descricaoRegra = 'Simples Nacional — Sul/Sudeste (+4,00%)';
    } else {
      acrescimo = 6.00;
      descricaoRegra = 'Simples Nacional — Norte/Nordeste/CO/ES (+6,00%)';
    }
  }
  // 2. Regra de Produto de Origem Estrangeira procedente de outra UF a 4% (Resolução Senado 13/2012)
  else if (isImportado4Pct && region !== 'PROPRIO_ESTADO' && region !== 'EXTERIOR_DIRETO') {
    tipoRegra = 'IMPORTADO_4PCT';
    if (region === 'SUL_SUDESTE_EXCETO_ES') {
      acrescimo = 3.00;
      descricaoRegra = 'Origem Estrangeira 4% — Sul/Sudeste (+3,00%)';
    } else {
      acrescimo = 8.00;
      descricaoRegra = 'Origem Estrangeira 4% — Norte/Nordeste/CO/ES (+8,00%)';
    }
  }

  const finalRate = parseFloat((baseRate + acrescimo).toFixed(2));

  return {
    baseRate,
    acrescimo,
    finalRate,
    tipoRegra,
    descricaoRegra
  };
}

/**
 * Função compatível com versões anteriores para consulta simples da alíquota base
 */
export function getDecreto29560TaxRate(
  region: 'PROPRIO_OU_EXTERIOR' | 'NORTE_NORDESTE_CO_ES' | 'SUL_SUDESTE_EXCETO_ES' | OriginRegionType,
  internalRate: number = 20
): number {
  const rateKey = internalRate === 7 || internalRate === 12 || internalRate === 25 || internalRate === 28
    ? String(internalRate)
    : '20';

  const tableRow = (RET_2024_TAX_RATES as any)[rateKey] || RET_2024_TAX_RATES['20'];
  const key = region === 'PROPRIO_ESTADO' || region === 'EXTERIOR_DIRETO' ? 'PROPRIO_OU_EXTERIOR' : region;
  return (tableRow as any)[key] || 8.31;
}

/**
 * Calcula o ICMS ST do Decreto 29.560 para um item de NF-e:
 * Base de cálculo = Valor dos produtos + IPI + frete + seguro + outros encargos - descontos
 */
export function calculateDecreto29560ST(
  vProd: number,
  vIPI: number = 0,
  vFrete: number = 0,
  vSeg: number = 0,
  vOutro: number = 0,
  vDesc: number = 0,
  pICMSST_29560: number = 8.31
): { vBC_ST_29560: number; vICMSST_29560: number } {
  const vBC_ST_29560 = Math.max(0, parseFloat((vProd + vIPI + vFrete + vSeg + vOutro - vDesc).toFixed(2)));
  const vICMSST_29560 = parseFloat(((vBC_ST_29560 * pICMSST_29560) / 100).toFixed(2));
  return { vBC_ST_29560, vICMSST_29560 };
}
