export interface ClientInfo {
  cnpj: string;
  name: string;
}

export interface DebtItem {
  id: string;
  category: string; // e.g. "DAS SIMPLES NACIONAL", "PIS", etc.
  period: string; // e.g. "01/2026" or "02/2026"
  principal: number;
  penalty: number; // multa
  interest: number; // juros
  total: number; // principal + penalty + juros
  status?: string; // e.g. "DEVEDOR", "EM ATRASO", "SUSPENSO"
}

export interface DebtCategory {
  id: string;
  categoryType: 'TRIBUTO' | 'PARCELAMENTO' | 'MULTAS';
  origin: 'FEDERAL' | 'ESTADUAL' | 'MUNICIPAL';
  documentType: 'DARF' | 'DAS' | 'DAE' | 'DAM';
  title: string;
  scope: 'ADMINISTRATIVO' | 'DIVIDA_ATIVA';
  code?: string;
}

export interface Company {
  id: string;
  razaoSocial: string;
  cnpj: string;
  regimeTributario: 'LUCRO_REAL' | 'LUCRO_PRESUMIDO' | 'SIMPLES_NACIONAL' | 'LUCRO_ARBITRADO' | 'ISENTO_IMUNE';
  vendaVistaPercent: number; // e.g. 60
  vendaPrazoPercent: number; // e.g. 40
  endereco?: string;
  cidade?: string;
  cep?: string;
  inscEst?: string;
  pmr?: number; // Prazo Médio de Recebimento
  pr?: 'P' | 'R'; // Previsto / Realizado
  cartoesPercent?: number;
  chequesPercent?: number;
  duplicatasPercent?: number;
  contadorNome?: string;
  contadorCrc?: string;
  quadroSocietario?: string[];
  municipio?: string;
  estado?: string;
  uf?: string;
  createdAt: string;
  // Digital Certificate integration fields
  certificateFile?: string; // Base64 content of .pfx or .p12
  certificatePassword?: string;
  certificateName?: string;
  certificateValidTo?: string;
  certificateIssuer?: string;
  certificateSerialNumber?: string;
}

export interface FaturamentoItem {
  id: string;
  competencia: string; // MM/YYYY
  faturamentoTotal: number;
  vendaVista: number;
  vendaPrazo: number;
  // Estimated taxes
  estimatedTaxes: {
    pis: number;
    cofins: number;
    irpj: number;
    csll: number;
    simplesNacional?: number;
    totalTaxes: number;
  };
}

export interface ParcelamentoInput {
  totalDebt: number;
  downPayment: number;
  installmentsCount: number;
  installmentValue?: number;
  interestRate: number; // monthly %
  penaltyRate: number; // penalty %
  firstDueDate: string; // YYYY-MM-DD
  parcelamentoType: string;
}

export interface InstallmentRow {
  number: number;
  dueDate: string;
  previousBalance: number;
  amortization: number;
  interest: number;
  penalty: number;
  total: number;
  currentBalance: number;
}

