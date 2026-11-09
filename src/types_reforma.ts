export type RegimeTributarioFornecedor = 
  | 'REGIME_NORMAL' 
  | 'SIMPLES_NACIONAL' 
  | 'MEI' 
  | 'DESCONHECIDO';

export type PotencialCreditoReforma = 
  | 'INTEGRAL'   // Lucro Real / Presumido: crédito pleno de IBS + CBS (~26.5%)
  | 'RESTRITO'   // Simples Nacional: gera menor crédito (limitado ao recolhimento no DAS)
  | 'NENHUM'     // MEI: sem transferência de crédito na Reforma
  | 'PENDENTE';

export type StatusConsultaFornecedor = 
  | 'pendente' 
  | 'consultando' 
  | 'concluido' 
  | 'rate_limited' 
  | 'erro';

export interface FornecedorReforma {
  id: string;
  cnpj: string; // 14 dígitos limpos
  cnpjFormatted: string; // 00.000.000/0001-00
  razaoSocial: string;
  nomeFantasia?: string;
  situacaoCadastral?: string;
  optanteSimples: boolean | null;
  dataOpcaoSimples?: string;
  dataExclusaoSimples?: string;
  optanteMei: boolean | null;
  regimeTributario: RegimeTributarioFornecedor;
  potencialCreditoIbsCbs: PotencialCreditoReforma;
  impactoDescricao?: string;
  uf?: string;
  municipio?: string;
  cnae?: string;
  cnaeDescricao?: string;
  dataConsulta?: string;
  statusConsulta: StatusConsultaFornecedor;
  mensagemErro?: string;
  origemImportacao?: string;
}

export interface BatchProcessingState {
  isRunning: boolean;
  isPaused: boolean;
  rateLimitedUntil: number | null;
  rateLimitCountdown: number;
  currentIndex: number;
  totalCount: number;
  processedCount: number;
  successCount: number;
  errorCount: number;
  currentSupplierName?: string;
  currentCnpj?: string;
}

export interface CsvImportPreviewItem {
  id: string;
  cnpj: string;
  cnpjFormatted: string;
  razaoSocial: string;
  valido: boolean;
  erro?: string;
}

export type RegimePisCofins = 'nao_cumulativo' | 'cumulativo';

export type ModalidadeIs = 'nao_incidente' | 'ad_valorem' | 'misto';

export interface CategoriaIsConfig {
  id: string;
  nome: string;
  descricaoCurta: string;
  modalidade: ModalidadeIs;
  aliqIsPadrao: number;        // % Ad Valorem padrão
  isValorFixoPadrao: number;   // R$ fixo por unidade
  fracaoVarejoPadrao: number;  // % Fração de Varejo (para cigarros: 15%)
  fatorConversaoPadrao: number;// Fator maços/unidade (para cigarros: 50)
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

export interface RegraFiscalNcm {
  id: string;
  prefixoNcm: string;          // Ex: "22021000", "2203", "24022000", etc.
  descricao: string;
  categoriaId: string;
  modalidade: ModalidadeIs;
  aliqIs: number;              // % Ad Valorem
  isValorFixo: number;         // R$ fixo por carteira/unidade
  fracaoVarejo: number;        // % Fração base varejo (cigarros)
  fatorConversaoMaco: number;  // Fator maços/carteiras
  aliqIpiAdVal?: number;
  ipiValorFixo?: number;
}

export interface ParametrosImpactoReforma {
  regimePisCofins: RegimePisCofins;
  aliqCbs: number;            // Alíquota CBS (%) - Ex: 11.30
  aliqIbs: number;            // Alíquota IBS (%) - Ex: 0.10
  aliqIcmsOrigem: number;     // ICMS Origem Padrão (%) - Ex: 7.0
}

export interface NotaFiscalImpactoInfo {
  emitenteNome: string;
  emitenteCnpj: string;
  numeroNf: string;
  dataEmissao: string;
  valorTotalNf: number;
}

export interface ProdutoImpactoItem {
  id: string;
  descricao: string;
  ncm: string;
  unidade: string;
  quantidade: number;          // qCom
  valorUnitario: number;       // vUnCom
  valorProdutos: number;       // vrProd
  valorDesconto: number;       // vDesc
  vIpi: number;                // IPI destacado no DANFE ou ajustado (R$)
  icmsProprio: number;         // ICMS próprio (R$)
  icmsSt: number;              // ICMS-ST (R$)
  fecop: number;               // FECOP Estadual (R$)
  pis: number;                 // PIS destacado no DANFE (R$)
  cofins: number;              // COFINS destacado no DANFE (R$)
  
  // Classificação Polimórfica de Imposto Seletivo (IS)
  categoriaId: string;         // 'nao_incidente', 'cervejas_malte', 'cigarros', etc.
  modalidadeIs: ModalidadeIs;  // 'nao_incidente' | 'ad_valorem' | 'misto'
  aliqIs: number;              // % Ad Valorem do item
  isValorFixo: number;         // R$ Fixo por unidade/carteira
  
  // Parâmetros específicos para Cigarros e Cigarrilhas (Misto)
  fatorConversao: number;      // Fator de transformação (ex: 50 carteiras/MH)
  fracaoVarejo: number;        // % Fração Base Varejo (ex: 15.0)
  precoVarejoUnitario: number; // Preço de Varejo por Carteira (R$)
}
