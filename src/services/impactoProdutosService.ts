import {
  ParametrosImpactoReforma,
  NotaFiscalImpactoInfo,
  ProdutoImpactoItem,
  RegraFiscalNcm,
  CategoriaIsConfig,
  ModalidadeIs
} from '../types_reforma';

export const CATEGORIAS_IS_CATALOG: Record<string, CategoriaIsConfig> = {
  nao_incidente: {
    id: 'nao_incidente',
    nome: 'Não Incidente (Geral)',
    descricaoCurta: 'Sem incidência de Imposto Seletivo (0%)',
    modalidade: 'nao_incidente',
    aliqIsPadrao: 0,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    badgeBorder: 'border-slate-300'
  },
  bebidas_acucaradas: {
    id: 'bebidas_acucaradas',
    nome: 'Bebidas Açucaradas (NCM 2202.10.00)',
    descricaoCurta: 'Refrigerantes e bebidas com adição de açúcar',
    modalidade: 'ad_valorem',
    aliqIsPadrao: 2.6,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-cyan-50',
    badgeText: 'text-cyan-800',
    badgeBorder: 'border-cyan-200'
  },
  cervejas_malte: {
    id: 'cervejas_malte',
    nome: 'Cervejas de Malte (NCM 2203)',
    descricaoCurta: 'Cervejas e chopes de malte',
    modalidade: 'ad_valorem',
    aliqIsPadrao: 4.2,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200'
  },
  vinhos_fermentados: {
    id: 'vinhos_fermentados',
    nome: 'Vinhos e Fermentados (NCM 2204 e 2206)',
    descricaoCurta: 'Vinhos de uvas frescas, sidras e fermentados',
    modalidade: 'ad_valorem',
    aliqIsPadrao: 8.0,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-800',
    badgeBorder: 'border-purple-200'
  },
  vermutes: {
    id: 'vermutes',
    nome: 'Vermutes e Similares (NCM 2205)',
    descricaoCurta: 'Vermutes e outros vinhos aromatizados',
    modalidade: 'ad_valorem',
    aliqIsPadrao: 12.0,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-800',
    badgeBorder: 'border-indigo-200'
  },
  vinhos_fortificados: {
    id: 'vinhos_fortificados',
    nome: 'Vinhos Fortificados / Refrescantes (NCM 2206.00.90 / 2208.90.00)',
    descricaoCurta: 'Bebidas mistas refrescantes e vinhos fortificados',
    modalidade: 'ad_valorem',
    aliqIsPadrao: 16.0,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-800',
    badgeBorder: 'border-rose-200'
  },
  aguardentes_cana: {
    id: 'aguardentes_cana',
    nome: 'Aguardentes de Cana (NCM 2208.40.00)',
    descricaoCurta: 'Cachaças e aguardentes de cana de açúcar',
    modalidade: 'ad_valorem',
    aliqIsPadrao: 20.0,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-800',
    badgeBorder: 'border-orange-200'
  },
  destilados: {
    id: 'destilados',
    nome: 'Demais Destilados (NCM 2208)',
    descricaoCurta: 'Uísque, rum, gim, vodca e outros destilados',
    modalidade: 'ad_valorem',
    aliqIsPadrao: 24.0,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-900',
    badgeBorder: 'border-amber-300'
  },
  cigarros: {
    id: 'cigarros',
    nome: 'Cigarros e Cigarrilhas (NCM 2402.20.00 / 2402.10.00 Ex 01)',
    descricaoCurta: 'Misto: 15% Base Varejo × 66,7% + R$ 3,50 por maço',
    modalidade: 'misto',
    aliqIsPadrao: 66.7,
    isValorFixoPadrao: 3.50,
    fracaoVarejoPadrao: 15.0,
    fatorConversaoPadrao: 50,
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-950',
    badgeBorder: 'border-[#e4b35e]'
  },
  demais_fumigenos: {
    id: 'demais_fumigenos',
    nome: 'Demais Fumígenos (NCM 2401 a 2404 exceto cigarros)',
    descricaoCurta: 'Fumo para cachimbo, rapé, fumo desfiado e folhas',
    modalidade: 'ad_valorem',
    aliqIsPadrao: 37.5,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-stone-100',
    badgeText: 'text-stone-800',
    badgeBorder: 'border-stone-300'
  },
  veiculos_passeio: {
    id: 'veiculos_passeio',
    nome: 'Veículos de Passeio (NCM 8703)',
    descricaoCurta: 'Automóveis e veículos de passageiros',
    modalidade: 'ad_valorem',
    aliqIsPadrao: 6.3,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-800',
    badgeBorder: 'border-blue-200'
  },
  veiculos_carga: {
    id: 'veiculos_carga',
    nome: 'Veículos Comerciais / Carga (NCM 8704)',
    descricaoCurta: 'Veículos para transporte de mercadorias',
    modalidade: 'ad_valorem',
    aliqIsPadrao: 3.9,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-800',
    badgeBorder: 'border-sky-200'
  },
  aeronaves: {
    id: 'aeronaves',
    nome: 'Aeronaves (NCM 8802)',
    descricaoCurta: 'Aviões, helicópteros e veículos aéreos (exceto 8802.60)',
    modalidade: 'ad_valorem',
    aliqIsPadrao: 6.8,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-800',
    badgeBorder: 'border-violet-200'
  },
  embarcacoes: {
    id: 'embarcacoes',
    nome: 'Embarcações a Motor (NCM 8903)',
    descricaoCurta: 'Iates, barcos a motor e motos aquáticas',
    modalidade: 'ad_valorem',
    aliqIsPadrao: 7.8,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-teal-50',
    badgeText: 'text-teal-800',
    badgeBorder: 'border-teal-200'
  },
  embarcacoes_3: {
    id: 'embarcacoes_3',
    nome: 'Embarcações a Motor (NCM 8903.3)',
    descricaoCurta: 'Embarcações a motor subposição 8903.3',
    modalidade: 'ad_valorem',
    aliqIsPadrao: 12.0,
    isValorFixoPadrao: 0,
    fracaoVarejoPadrao: 0,
    fatorConversaoPadrao: 1,
    badgeBg: 'bg-teal-100',
    badgeText: 'text-teal-900',
    badgeBorder: 'border-teal-300'
  }
};

/**
 * Catálogo padrão de regras de prefixo NCM (ordenado da maior especificidade para menor)
 */
export const DEFAULT_CATALOGO_FISCAL_NCM: RegraFiscalNcm[] = [
  {
    id: 'regra_vinhos_fort_22060090',
    prefixoNcm: '22060090',
    descricao: 'Outras bebidas fermentadas fortificadas',
    categoriaId: 'vinhos_fortificados',
    modalidade: 'ad_valorem',
    aliqIs: 16.0,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_vinhos_fort_22089000',
    prefixoNcm: '22089000',
    descricao: 'Bebidas espirituosas refrescantes mistas',
    categoriaId: 'vinhos_fortificados',
    modalidade: 'ad_valorem',
    aliqIs: 16.0,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_aguardente_22084000',
    prefixoNcm: '22084000',
    descricao: 'Aguardentes de cana e cachaças',
    categoriaId: 'aguardentes_cana',
    modalidade: 'ad_valorem',
    aliqIs: 20.0,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_bebidas_acucaradas_22021000',
    prefixoNcm: '22021000',
    descricao: 'Águas minerais adicionadas de açúcar / Refrigerantes',
    categoriaId: 'bebidas_acucaradas',
    modalidade: 'ad_valorem',
    aliqIs: 2.6,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_cigarros_24022000',
    prefixoNcm: '24022000',
    descricao: 'Cigarros contendo tabaco',
    categoriaId: 'cigarros',
    modalidade: 'misto',
    aliqIs: 66.7,
    isValorFixo: 3.50,
    fracaoVarejo: 15.0,
    fatorConversaoMaco: 50,
    aliqIpiAdVal: 66.7,
    ipiValorFixo: 3.50
  },
  {
    id: 'regra_cigarros_24021000',
    prefixoNcm: '24021000',
    descricao: 'Cigarros e cigarrilhas Ex 01',
    categoriaId: 'cigarros',
    modalidade: 'misto',
    aliqIs: 66.7,
    isValorFixo: 3.50,
    fracaoVarejo: 15.0,
    fatorConversaoMaco: 50,
    aliqIpiAdVal: 66.7,
    ipiValorFixo: 3.50
  },
  {
    id: 'regra_cervejas_2203',
    prefixoNcm: '2203',
    descricao: 'Cervejas de malte',
    categoriaId: 'cervejas_malte',
    modalidade: 'ad_valorem',
    aliqIs: 4.2,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_vermutes_2205',
    prefixoNcm: '2205',
    descricao: 'Vermutes e outros vinhos aromatizados',
    categoriaId: 'vermutes',
    modalidade: 'ad_valorem',
    aliqIs: 12.0,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_vinhos_2204',
    prefixoNcm: '2204',
    descricao: 'Vinhos de uvas frescas',
    categoriaId: 'vinhos_fermentados',
    modalidade: 'ad_valorem',
    aliqIs: 8.0,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_fermentados_2206',
    prefixoNcm: '2206',
    descricao: 'Outras bebidas fermentadas',
    categoriaId: 'vinhos_fermentados',
    modalidade: 'ad_valorem',
    aliqIs: 8.0,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_destilados_2208',
    prefixoNcm: '2208',
    descricao: 'Demais bebidas espirituosas / Destilados',
    categoriaId: 'destilados',
    modalidade: 'ad_valorem',
    aliqIs: 24.0,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_fumigenos_2401',
    prefixoNcm: '2401',
    descricao: 'Tabaco não manufaturado',
    categoriaId: 'demais_fumigenos',
    modalidade: 'ad_valorem',
    aliqIs: 37.5,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_fumigenos_2403',
    prefixoNcm: '2403',
    descricao: 'Outros produtos de tabaco e sucedâneos',
    categoriaId: 'demais_fumigenos',
    modalidade: 'ad_valorem',
    aliqIs: 37.5,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_fumigenos_2404',
    prefixoNcm: '2404',
    descricao: 'Produtos de tabaco para inalação sem combustão',
    categoriaId: 'demais_fumigenos',
    modalidade: 'ad_valorem',
    aliqIs: 37.5,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_veiculos_8703',
    prefixoNcm: '8703',
    descricao: 'Automóveis de passageiros',
    categoriaId: 'veiculos_passeio',
    modalidade: 'ad_valorem',
    aliqIs: 6.3,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_veiculos_8704',
    prefixoNcm: '8704',
    descricao: 'Veículos automóveis para transporte de mercadorias',
    categoriaId: 'veiculos_carga',
    modalidade: 'ad_valorem',
    aliqIs: 3.9,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_aeronaves_8802',
    prefixoNcm: '8802',
    descricao: 'Aeronaves civis e helicópteros',
    categoriaId: 'aeronaves',
    modalidade: 'ad_valorem',
    aliqIs: 6.8,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_embarcacoes_89033',
    prefixoNcm: '89033',
    descricao: 'Embarcações a motor subposição 8903.3',
    categoriaId: 'embarcacoes_3',
    modalidade: 'ad_valorem',
    aliqIs: 12.0,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  },
  {
    id: 'regra_embarcacoes_8903',
    prefixoNcm: '8903',
    descricao: 'Iates e outras embarcações de recreio',
    categoriaId: 'embarcacoes',
    modalidade: 'ad_valorem',
    aliqIs: 7.8,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  }
];

const CATALOGO_NCM_STORAGE_KEY = 'ml_reforma_catalogo_fiscal_ncm_v4';

export function loadCatalogoFiscalNcm(): RegraFiscalNcm[] {
  try {
    const raw = localStorage.getItem(CATALOGO_NCM_STORAGE_KEY);
    if (!raw) return DEFAULT_CATALOGO_FISCAL_NCM;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_CATALOGO_FISCAL_NCM;
  } catch {
    return DEFAULT_CATALOGO_FISCAL_NCM;
  }
}

export function saveCatalogoFiscalNcm(catalogo: RegraFiscalNcm[]): void {
  try {
    localStorage.setItem(CATALOGO_NCM_STORAGE_KEY, JSON.stringify(catalogo));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Busca por prefixo na Lista Positiva de NCM do Imposto Seletivo.
 * Se NÃO casar com nenhum prefixo da lista positiva, retorna estritamente a categoria "nao_incidente" (IS = 0%).
 */
export function identificarCategoriaPorNcm(
  ncm: string,
  catalogo: RegraFiscalNcm[] = DEFAULT_CATALOGO_FISCAL_NCM
): { regra: RegraFiscalNcm | null; config: CategoriaIsConfig } {
  const cleanNcm = (ncm || '').replace(/\D/g, '');
  if (!cleanNcm) {
    return { regra: null, config: CATEGORIAS_IS_CATALOG.nao_incidente };
  }

  // Exceção expressa da LC 214/24: 8802.60 (Veículos espaciais / satélites) não são incidentes
  if (cleanNcm.startsWith('880260')) {
    return { regra: null, config: CATEGORIAS_IS_CATALOG.nao_incidente };
  }

  // Ordena por comprimento decrescente do prefixo para garantir match mais específico primeiro
  const sorted = [...catalogo].sort((a, b) => b.prefixoNcm.length - a.prefixoNcm.length);

  for (const r of sorted) {
    const prefix = r.prefixoNcm.replace(/\D/g, '');
    if (cleanNcm.startsWith(prefix)) {
      const config = CATEGORIAS_IS_CATALOG[r.categoriaId] || CATEGORIAS_IS_CATALOG.nao_incidente;
      return { regra: r, config };
    }
  }

  // SE NÃO MATCH, É "NÃO INCIDENTE"
  return { regra: null, config: CATEGORIAS_IS_CATALOG.nao_incidente };
}

export const DEFAULT_PARAMETROS_IMPACTO: ParametrosImpactoReforma = {
  regimePisCofins: 'nao_cumulativo',
  aliqCbs: 11.30,
  aliqIbs: 0.10,
  aliqIcmsOrigem: 7.0
};

export interface ResultadoItemImpacto {
  item: ProdutoImpactoItem;
  categoriaConfig: CategoriaIsConfig;
  // Bloco 1: Regime Vigente (Hoje)
  valorLiquidoProdutos: number; // vrProd - vDesc
  desembolsoAtual: number;      // vrProd - vDesc + vIpi + icmsSt + fecop
  creditoPisCofins: number;
  creditoIcms: number;
  creditoIpi: number;
  creditoTotalAtual: number;
  custoLiquidoAtual: number;    // desembolsoAtual - creditoTotalAtual
  // Bloco 2: Imposto Seletivo (2027)
  qtdConvertida: number;        // para cigarros: quantidade * fator
  baseIs: number;
  isAdValorem: number;
  isFixo: number;
  isTotal: number;
  // Bloco 3: Dual VAT (CBS + IBS) e Transição 2027 com ICMS
  precoLiquido: number;         // Base líquida sem PIS, COFINS, IPI e ICMS
  baseCbsIbs: number;           // precoLiquido + isTotal (se IS for zero, base = precoLiquido)
  cbsEntrada: number;
  ibsEntrada: number;
  cbsIbsTotal: number;
  // Na transição de 2027, o ICMS e ICMS-ST continuam vigentes!
  desembolso2027: number;       // precoLiquido + item.icmsProprio + icmsSt + fecop + isTotal + cbsIbsTotal
  creditoIcmsRef: number;       // Crédito de ICMS mantido na entrada (regime não cumulativo)
  custoLiquidoRef: number;      // desembolso2027 - cbsIbsTotal - creditoIcmsRef
  variacaoDesembolso: number;
  variacaoDesembolsoPercent: number;
}

export interface ResumoConsolidadoImpacto {
  itens: ResultadoItemImpacto[];
  isCumulativo: boolean;
  pisRatePercent: number;
  cofinsRatePercent: number;
  // Totais Regime Vigente
  vrProd: number;
  vDesc: number;
  valorLiquidoProdutos: number;
  icmsProprio: number;
  icmsSt: number;
  fecop: number;
  vIpi: number;
  pis: number;
  cofins: number;
  creditoAtual: number;
  desembolsoAtual: number;
  custoLiquidoAtual: number;
  // Totais Reforma 2027 (com ICMS vigente)
  precoLiquido: number;
  isTotal: number;
  baseCbsIbs: number;
  cbsEntrada: number;
  ibsEntrada: number;
  cbsIbsTotal: number;
  creditoIcmsRefTotal: number;
  desembolso2027: number;
  custoLiquidoRef: number;
  // Deltas
  deltaDesembolso: number;
  deltaDesembolsoPercent: number;
  deltaCustoLiquido: number;
  deltaCustoLiquidoPercent: number;
}

export function safeNum(val: unknown, fallback = 0): number {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Calcula os tributos atuais e os tributos da Reforma Tributária (2027),
 * mantendo o ICMS Próprio, ICMS-ST e FECOP na transição conforme a EC 132/23.
 */
export function calcularImpactoProdutos(
  produtos: ProdutoImpactoItem[],
  params: ParametrosImpactoReforma
): ResumoConsolidadoImpacto {
  const isCumulativo = params.regimePisCofins === 'cumulativo';
  const pisRate = isCumulativo ? 0.0065 : 0.0165;
  const cofinsRate = isCumulativo ? 0.0300 : 0.0760;

  const cbsRate = Math.max(0, safeNum(params.aliqCbs, 11.30)) / 100;
  const ibsRate = Math.max(0, safeNum(params.aliqIbs, 0.10)) / 100;

  const totais = {
    vrProd: 0,
    vDesc: 0,
    valorLiquidoProdutos: 0,
    icmsProprio: 0,
    icmsSt: 0,
    fecop: 0,
    vIpi: 0,
    pis: 0,
    cofins: 0,
    creditoAtual: 0,
    desembolsoAtual: 0,
    custoLiquidoAtual: 0,
    precoLiquido: 0,
    isTotal: 0,
    baseCbsIbs: 0,
    cbsEntrada: 0,
    ibsEntrada: 0,
    cbsIbsTotal: 0,
    creditoIcmsRefTotal: 0,
    desembolso2027: 0,
    custoLiquidoRef: 0
  };

  const itens: ResultadoItemImpacto[] = produtos.map((item) => {
    const config =
      CATEGORIAS_IS_CATALOG[item.categoriaId] || CATEGORIAS_IS_CATALOG.nao_incidente;

    const vrProd = Math.max(0, safeNum(item.valorProdutos));
    const vDesc = Math.max(0, safeNum(item.valorDesconto));
    const valorLiquidoProdutos = vrProd - vDesc;
    const ipiItem = Math.max(0, safeNum(item.vIpi));
    const stItem = Math.max(0, safeNum(item.icmsSt));
    const fecopItem = Math.max(0, safeNum(item.fecop));
    const icmsProprio = Math.max(0, safeNum(item.icmsProprio));
    const pis = Math.max(0, safeNum(item.pis));
    const cofins = Math.max(0, safeNum(item.cofins));

    // 1. Regime Vigente (Hoje)
    const desembolsoAtual = valorLiquidoProdutos + ipiItem + stItem + fecopItem;

    const baseCreditoPisCofins = Math.max(0, valorLiquidoProdutos);
    const creditoPisCofins = isCumulativo ? 0 : baseCreditoPisCofins * (pisRate + cofinsRate);
    const creditoIcms = isCumulativo ? 0 : icmsProprio;
    const creditoIpi = isCumulativo ? 0 : ipiItem;
    const creditoTotalAtual = creditoPisCofins + creditoIcms + creditoIpi;
    const custoLiquidoAtual = desembolsoAtual - creditoTotalAtual;

    // 2. Imposto Seletivo Polimórfico (IS)
    let qtdConvertida = safeNum(item.quantidade);
    let baseIs = 0;
    let isAdValorem = 0;
    let isFixo = 0;
    let isTotal = 0;

    if (item.categoriaId === 'nao_incidente' || item.modalidadeIs === 'nao_incidente') {
      baseIs = 0;
      isAdValorem = 0;
      isFixo = 0;
      isTotal = 0;
    } else if (item.modalidadeIs === 'misto') {
      const fator = Math.max(1, safeNum(item.fatorConversao, 50));
      qtdConvertida = safeNum(item.quantidade) * fator;
      const precoVarejo = Math.max(0, safeNum(item.precoVarejoUnitario));
      const fracVarejo = Math.max(0, safeNum(item.fracaoVarejo, 15)) / 100;
      const aliqIsAdVal = Math.max(0, safeNum(item.aliqIs, 66.7)) / 100;
      const isFixoUnit = Math.max(0, safeNum(item.isValorFixo, 3.5));

      baseIs = qtdConvertida * precoVarejo * fracVarejo;
      isAdValorem = baseIs * aliqIsAdVal;
      isFixo = qtdConvertida * isFixoUnit;
      isTotal = isAdValorem + isFixo;
    } else {
      const aliqIsAdVal = Math.max(0, safeNum(item.aliqIs)) / 100;
      baseIs = Math.max(0, valorLiquidoProdutos);
      isAdValorem = baseIs * aliqIsAdVal;
      isFixo = 0;
      isTotal = isAdValorem;
    }

    // 3. Reforma Tributária 2027:
    // PIS, COFINS e IPI são extintos/substituídos na entrada.
    // O ICMS Próprio, ICMS-ST e FECOP CONTINUAM VIGENTES em 2027 na fase de transição!
    const precoLiquido = valorLiquidoProdutos - icmsProprio - ipiItem - pis - cofins;
    const baseCbsIbs = precoLiquido + isTotal;
    const cbsEntrada = baseCbsIbs * cbsRate;
    const ibsEntrada = baseCbsIbs * ibsRate;
    const cbsIbsTotal = cbsEntrada + ibsEntrada;

    // Desembolso de Compra 2027:
    // Preço Líquido + ICMS Próprio (mantido) + ST + FECOP + IS + CBS + IBS
    const desembolso2027 = precoLiquido + icmsProprio + stItem + fecopItem + isTotal + cbsIbsTotal;

    // Crédito apropriável na Reforma (2027):
    // CBS + IBS integralmente creditáveis + Crédito de ICMS Próprio mantido na transição
    const creditoIcmsRef = isCumulativo ? 0 : icmsProprio;
    const custoLiquidoRef = desembolso2027 - cbsIbsTotal - creditoIcmsRef;

    const variacaoDesembolso = desembolso2027 - desembolsoAtual;
    const variacaoDesembolsoPercent =
      desembolsoAtual > 0 ? (variacaoDesembolso / desembolsoAtual) * 100 : 0;

    // Acumulação nos totais
    totais.vrProd += vrProd;
    totais.vDesc += vDesc;
    totais.valorLiquidoProdutos += valorLiquidoProdutos;
    totais.icmsProprio += icmsProprio;
    totais.icmsSt += stItem;
    totais.fecop += fecopItem;
    totais.vIpi += ipiItem;
    totais.pis += pis;
    totais.cofins += cofins;
    totais.creditoAtual += creditoTotalAtual;
    totais.desembolsoAtual += desembolsoAtual;
    totais.custoLiquidoAtual += custoLiquidoAtual;
    totais.precoLiquido += precoLiquido;
    totais.isTotal += isTotal;
    totais.baseCbsIbs += baseCbsIbs;
    totais.cbsEntrada += cbsEntrada;
    totais.ibsEntrada += ibsEntrada;
    totais.cbsIbsTotal += cbsIbsTotal;
    totais.creditoIcmsRefTotal += creditoIcmsRef;
    totais.desembolso2027 += desembolso2027;
    totais.custoLiquidoRef += custoLiquidoRef;

    return {
      item,
      categoriaConfig: config,
      valorLiquidoProdutos,
      desembolsoAtual,
      creditoPisCofins,
      creditoIcms,
      creditoIpi,
      creditoTotalAtual,
      custoLiquidoAtual,
      qtdConvertida,
      baseIs,
      isAdValorem,
      isFixo,
      isTotal,
      precoLiquido,
      baseCbsIbs,
      cbsEntrada,
      ibsEntrada,
      cbsIbsTotal,
      desembolso2027,
      creditoIcmsRef,
      custoLiquidoRef,
      variacaoDesembolso,
      variacaoDesembolsoPercent
    };
  });

  const deltaDesembolso = totais.desembolso2027 - totais.desembolsoAtual;
  const deltaDesembolsoPercent =
    totais.desembolsoAtual > 0 ? (deltaDesembolso / totais.desembolsoAtual) * 100 : 0;

  const deltaCustoLiquido = totais.custoLiquidoRef - totais.custoLiquidoAtual;
  const deltaCustoLiquidoPercent =
    totais.custoLiquidoAtual > 0 ? (deltaCustoLiquido / totais.custoLiquidoAtual) * 100 : 0;

  return {
    itens,
    isCumulativo,
    pisRatePercent: pisRate * 100,
    cofinsRatePercent: cofinsRate * 100,
    ...totais,
    deltaDesembolso,
    deltaDesembolsoPercent,
    deltaCustoLiquido,
    deltaCustoLiquidoPercent
  };
}

/**
 * Faz o parse seguro do XML da NF-e (Modelo 55) diretamente no navegador,
 * identificando a categoria tributária pela lista positiva de NCMs.
 * Se o NCM não constar na lista positiva, define IS como 0% e Não Incidente.
 */
export function parseNfeXmlParaImpacto(
  xmlText: string,
  paramsAtuais: ParametrosImpactoReforma,
  catalogo: RegraFiscalNcm[] = DEFAULT_CATALOGO_FISCAL_NCM
): { nota: NotaFiscalImpactoInfo; produtos: ProdutoImpactoItem[] } {
  if (!xmlText || xmlText.length > 10 * 1024 * 1024) {
    throw new Error('Arquivo XML inválido ou excede o limite de segurança (10 MB).');
  }

  const sanitizedXml = xmlText
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!ENTITY[^>]*>/gi, '');

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(sanitizedXml, 'text/xml');

  const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error('Estrutura XML malformada. Verifique o arquivo selecionado.');
  }

  const infNFe = xmlDoc.getElementsByTagName('infNFe')[0];
  if (!infNFe) {
    throw new Error('Tag <infNFe> não encontrada no XML.');
  }

  const getTagText = (parent: Element | Document | undefined, tag: string): string => {
    if (!parent) return '';
    return parent.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  };

  const emit = xmlDoc.getElementsByTagName('emit')[0];
  const ide = xmlDoc.getElementsByTagName('ide')[0];
  const total = xmlDoc.getElementsByTagName('total')[0];

  const emitenteNome = getTagText(emit, 'xNome') || 'Emitente';
  const emitenteCnpj = getTagText(emit, 'CNPJ') || '-';
  const numeroNf = getTagText(ide, 'nNF') || '-';
  const dhEmi = getTagText(ide, 'dhEmi') || getTagText(ide, 'dEmi');
  const dataEmissao = dhEmi ? dhEmi.substring(0, 10) : '-';

  const vNF = safeNum(getTagText(total, 'vNF'));
  const vPISTotal = safeNum(getTagText(total, 'vPIS'));
  const vCOFINSTotal = safeNum(getTagText(total, 'vCOFINS'));
  const vIPITotal = safeNum(getTagText(total, 'vIPI'));
  const vProdTotal = safeNum(getTagText(total, 'vProd'));

  const detList = xmlDoc.getElementsByTagName('det');
  const produtos: ProdutoImpactoItem[] = [];

  for (let i = 0; i < detList.length; i++) {
    const det = detList[i];
    const prod = det.getElementsByTagName('prod')[0];
    const imposto = det.getElementsByTagName('imposto')[0];
    if (!prod) continue;

    const descricao = getTagText(prod, 'xProd') || `Item ${i + 1}`;
    const ncm = getTagText(prod, 'NCM') || '';
    const uCom = (getTagText(prod, 'uCom') || 'UN').toUpperCase();
    const qCom = safeNum(getTagText(prod, 'qCom'));
    const vUnCom = safeNum(getTagText(prod, 'vUnCom'));
    const vProd = safeNum(getTagText(prod, 'vProd'));
    const vDesc = safeNum(getTagText(prod, 'vDesc'));

    let icmsProprio = 0;
    let vICMSST = 0;
    let vFCPST = 0;
    let vIpiItem = 0;
    let vPisItem = 0;
    let vCofinsItem = 0;

    if (imposto) {
      const icmsTag = imposto.getElementsByTagName('ICMS')[0];
      if (icmsTag) {
        icmsProprio = safeNum(getTagText(icmsTag, 'vICMS'));
        vICMSST = safeNum(getTagText(icmsTag, 'vICMSST'));
        vFCPST = safeNum(getTagText(icmsTag, 'vFCPST')) || safeNum(getTagText(icmsTag, 'vFCP'));
      }
      const ipiTag = imposto.getElementsByTagName('IPI')[0];
      if (ipiTag) {
        vIpiItem = safeNum(getTagText(ipiTag, 'vIPI'));
      }
      const pisTag = imposto.getElementsByTagName('PIS')[0];
      if (pisTag) {
        vPisItem = safeNum(getTagText(pisTag, 'vPIS'));
      }
      const cofinsTag = imposto.getElementsByTagName('COFINS')[0];
      if (cofinsTag) {
        vCofinsItem = safeNum(getTagText(cofinsTag, 'vCOFINS'));
      }
    }

    if (vIpiItem === 0 && vIPITotal > 0 && vProdTotal > 0) {
      vIpiItem = Number((vIPITotal * (vProd / vProdTotal)).toFixed(2));
    }
    if (vPisItem === 0 && vPISTotal > 0 && vProdTotal > 0) {
      vPisItem = Number((vPISTotal * (vProd / vProdTotal)).toFixed(2));
    }
    if (vCofinsItem === 0 && vCOFINSTotal > 0 && vProdTotal > 0) {
      vCofinsItem = Number((vCOFINSTotal * (vProd / vProdTotal)).toFixed(2));
    }

    const aliqOrigemFallback = Math.max(0, safeNum(paramsAtuais.aliqIcmsOrigem, 7)) / 100;
    const icmsFinal =
      icmsProprio > 0 ? icmsProprio : Number((vProd * aliqOrigemFallback).toFixed(2));

    // Identificação por lista positiva de NCM
    const { regra, config } = identificarCategoriaPorNcm(ncm, catalogo);

    // Valores padrão da categoria
    const aliqIs = regra ? regra.aliqIs : config.aliqIsPadrao;
    const isValorFixo = regra ? regra.isValorFixo : config.isValorFixoPadrao;
    const fracaoVarejo = regra ? regra.fracaoVarejo : config.fracaoVarejoPadrao;
    const fatorConversao =
      regra?.fatorConversaoMaco && regra.fatorConversaoMaco > 1
        ? regra.fatorConversaoMaco
        : uCom === 'MH' || uCom === 'MIL'
        ? 50
        : config.fatorConversaoPadrao;

    const precoVarejoInicial =
      config.id === 'cigarros'
        ? 9.00
        : 0;

    produtos.push({
      id: `nfe_item_${i + 1}_${Date.now()}`,
      descricao,
      ncm,
      unidade: uCom,
      quantidade: qCom,
      valorUnitario: vUnCom,
      valorProdutos: vProd,
      valorDesconto: vDesc,
      vIpi: vIpiItem,
      icmsProprio: icmsFinal,
      icmsSt: vICMSST,
      fecop: vFCPST,
      pis: vPisItem,
      cofins: vCofinsItem,
      categoriaId: config.id,
      modalidadeIs: config.modalidade,
      aliqIs,
      isValorFixo,
      fatorConversao,
      fracaoVarejo,
      precoVarejoUnitario: precoVarejoInicial
    });
  }

  if (produtos.length === 0) {
    throw new Error('Nenhum item de produto encontrado no XML.');
  }

  return {
    nota: {
      emitenteNome,
      emitenteCnpj,
      numeroNf,
      dataEmissao,
      valorTotalNf: vNF
    },
    produtos
  };
}
