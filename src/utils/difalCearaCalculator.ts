/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Motor de Cálculo do ICMS Diferencial de Alíquota (DIFAL) do Ceará
 * Em conformidade com:
 * - Norma de Execução SEFAZ-CE nº 01/2024 e nº 04/2024 (Art. 3º e Art. 4º-A)
 * - Decreto Estadual nº 33.327/2019 (Regulamento do ICMS - Ceará)
 * - Lei Estadual nº 18.665/2023 (Alíquota modal de 20% a partir de 2024)
 */

export interface UfInfo {
  sigla: string;
  nome: string;
  aliquotaInterPadrao: number; // 4%, 7% ou 12%
}

export const LISTA_UFS: UfInfo[] = [
  { sigla: 'SP', nome: 'São Paulo', aliquotaInterPadrao: 7 },
  { sigla: 'RJ', nome: 'Rio de Janeiro', aliquotaInterPadrao: 7 },
  { sigla: 'MG', nome: 'Minas Gerais', aliquotaInterPadrao: 7 },
  { sigla: 'RS', nome: 'Rio Grande do Sul', aliquotaInterPadrao: 7 },
  { sigla: 'SC', nome: 'Santa Catarina', aliquotaInterPadrao: 7 },
  { sigla: 'PR', nome: 'Paraná', aliquotaInterPadrao: 7 },
  { sigla: 'AC', nome: 'Acre', aliquotaInterPadrao: 12 },
  { sigla: 'AL', nome: 'Alagoas', aliquotaInterPadrao: 12 },
  { sigla: 'AP', nome: 'Amapá', aliquotaInterPadrao: 12 },
  { sigla: 'AM', nome: 'Amazonas', aliquotaInterPadrao: 12 },
  { sigla: 'BA', nome: 'Bahia', aliquotaInterPadrao: 12 },
  { sigla: 'DF', nome: 'Distrito Federal', aliquotaInterPadrao: 12 },
  { sigla: 'ES', nome: 'Espírito Santo', aliquotaInterPadrao: 12 },
  { sigla: 'GO', nome: 'Goiás', aliquotaInterPadrao: 12 },
  { sigla: 'MA', nome: 'Maranhão', aliquotaInterPadrao: 12 },
  { sigla: 'MT', nome: 'Mato Grosso', aliquotaInterPadrao: 12 },
  { sigla: 'MS', nome: 'Mato Grosso do Sul', aliquotaInterPadrao: 12 },
  { sigla: 'PA', nome: 'Pará', aliquotaInterPadrao: 12 },
  { sigla: 'PB', nome: 'Paraíba', aliquotaInterPadrao: 12 },
  { sigla: 'PE', nome: 'Pernambuco', aliquotaInterPadrao: 12 },
  { sigla: 'PI', nome: 'Piauí', aliquotaInterPadrao: 12 },
  { sigla: 'RN', nome: 'Rio Grande do Norte', aliquotaInterPadrao: 12 },
  { sigla: 'RO', nome: 'Rondônia', aliquotaInterPadrao: 12 },
  { sigla: 'RR', nome: 'Roraima', aliquotaInterPadrao: 12 },
  { sigla: 'SE', nome: 'Sergipe', aliquotaInterPadrao: 12 },
  { sigla: 'TO', nome: 'Tocantins', aliquotaInterPadrao: 12 },
  { sigla: 'EXT', nome: 'Importado (Res. SF 13/2012 - 4%)', aliquotaInterPadrao: 4 },
];

export interface ParametrosDifalItem {
  id: string;
  descricao?: string;
  ncm?: string;
  valorOperacao: number; // Vr_ope
  valorProdutos?: number; // compatibilidade
  icmsOrigemManual?: number | null; // valor explícito de ICMS Origem (R$)
  ufOrigem: string;
  aliquotaInter: number; // 4, 7, 12, etc.
  aliquotaIntra: number; // padrão 20 no CE
  valorFrete?: number;
  valorSeguro?: number;
  valorOutrasDespesas?: number;
  valorDesconto?: number;
  valorIpi?: number;
  incluirIpiBase?: boolean;
}

export interface PassoMemoriaCalculo {
  titulo: string;
  descricao: string;
  formula: string;
  substituicao: string;
  resultadoFormatado: string;
}

export interface ResultadoDifalItem {
  item: ParametrosDifalItem;
  valorOperacao: number;          // Vr_ope
  baseCalculoOrigem: number;      // BC Origem
  icmsOrigem: number;             // ICMS Origem (crédito)
  valorSemIcmsOrigem: number;     // Vr_ope - ICMS Origem
  baseCalculoDestino: number;     // BC Ceará ("por dentro")
  icmsDestinoTotal: number;       // ICMS apurado no Ceará
  totalDifalGeral: number;        // Total do DIFAL a pagar
  difalSemFecop?: number;         // Compatibilidade (igual a totalDifalGeral)
  valorFecop?: number;            // 0
  aliquotaEfetivaCeara: number;   // % Efetivo da carga tributária
  memoriaPassos: PassoMemoriaCalculo[];
  fundamentacaoLegal: string;
}

export interface ResultadoDifalLote {
  itens: ResultadoDifalItem[];
  totalProdutos: number;
  totalOperacao: number;
  totalBaseCalculoDestino: number;
  totalIcmsOrigem: number;
  totalIcmsDestino: number;
  totalGeralPagar: number;
  totalDifalSemFecop?: number;
  totalFecop?: number;
  totalFrete?: number;
  totalSeguro?: number;
  totalOutrasDespesas?: number;
  totalDesconto?: number;
  totalIpi?: number;
}

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

export function formatarPercentual(valor: number, casas: number = 2): string {
  return `${(valor || 0).toFixed(casas).replace('.', ',')}%`;
}

/**
 * Motor de Cálculo do ICMS DIFAL do Ceará (Base Dupla "Por Dentro" - SEFAZ-CE)
 * Modelo simplificado, limpo e direto baseado nas regras oficiais da SEFAZ-CE
 */
export function calcularDifalCeara(item: ParametrosDifalItem): ResultadoDifalItem {
  // 1. Valor da Operação (Vr_ope)
  const vOpe = Math.max(0, item.valorOperacao ?? item.valorProdutos ?? 0);

  const alqInter = Math.max(0, item.aliquotaInter || 0);
  const alqIntra = Math.max(0, item.aliquotaIntra || 20);

  // 2. Base de Origem e ICMS Origem (Crédito)
  const bcOrigem = vOpe;
  const icmsOrigem = (item.icmsOrigemManual !== undefined && item.icmsOrigemManual !== null)
    ? Math.max(0, item.icmsOrigemManual)
    : bcOrigem * (alqInter / 100);

  // 3. Exclusão do ICMS Origem (Valor Líquido da Operação)
  const vSemIcmsOrigem = Math.max(0, vOpe - icmsOrigem);

  // 4. Base de Cálculo Destino no Ceará ("Por Dentro" - Art. 4º-A da NE SEFAZ-CE nº 01/2024)
  // BC_CE = (Vr_ope - ICMS_origem) / (1 - ALQ_intra)
  const divisor = Math.max(0.0001, 1 - (alqIntra / 100));
  const bcDestino = vSemIcmsOrigem / divisor;

  // 5. ICMS Destino Total
  // ICMS_destino = BC_CE * ALQ_intra
  const icmsDestinoTotal = bcDestino * (alqIntra / 100);

  // 6. DIFAL a Recolher (Ceará)
  // DIFAL = ICMS_destino - ICMS_origem
  const totalDifalGeral = Math.max(0, icmsDestinoTotal - icmsOrigem);

  const aliquotaEfetivaCeara = vOpe > 0 ? (totalDifalGeral / vOpe) * 100 : 0;

  const fundamentacao = 'Norma de Execução SEFAZ-CE nº 01/2024 e nº 04/2024 (Art. 3º e Art. 4º-A); Decreto Estadual nº 33.327/2019 (RICMS-CE); Lei Estadual nº 18.665/2023.';

  const passos: PassoMemoriaCalculo[] = [
    {
      titulo: 'Passo 1: Valor da Operação (Vr_ope)',
      descricao: 'Valor total da operação interestadual de entrada no Ceará.',
      formula: 'Vr_ope = Valor da Operação',
      substituicao: `${formatarMoeda(vOpe)}`,
      resultadoFormatado: formatarMoeda(vOpe)
    },
    {
      titulo: 'Passo 2: ICMS de Origem (Crédito Dedutível)',
      descricao: `Crédito fiscal destacado na origem (${formatarPercentual(alqInter)}).`,
      formula: 'ICMS_origem = Vr_ope × Alíquota_Inter',
      substituicao: (item.icmsOrigemManual !== undefined && item.icmsOrigemManual !== null)
        ? `Informado/destacado: ${formatarMoeda(icmsOrigem)} (${formatarPercentual(alqInter)} de ${formatarMoeda(vOpe)})`
        : `${formatarMoeda(vOpe)} × ${formatarPercentual(alqInter)} = ${formatarMoeda(icmsOrigem)}`,
      resultadoFormatado: formatarMoeda(icmsOrigem)
    },
    {
      titulo: 'Passo 3: Exclusão do ICMS Origem (Valor Líquido)',
      descricao: 'Dedução do ICMS da origem do valor da operação para formação da base interna do Ceará.',
      formula: 'Vr_sem_ICMS_origem = Vr_ope - ICMS_origem',
      substituicao: `${formatarMoeda(vOpe)} - ${formatarMoeda(icmsOrigem)}`,
      resultadoFormatado: formatarMoeda(vSemIcmsOrigem)
    },
    {
      titulo: 'Passo 4: Base de Cálculo Destino no Ceará ("Por Dentro")',
      descricao: 'Inclusão do imposto na sua própria base conforme Art. 4º-A da NE SEFAZ-CE nº 01/2024.',
      formula: 'BC_CE = (Vr_ope - ICMS_origem) / (1 - ALQ_interna)',
      substituicao: `${formatarMoeda(vSemIcmsOrigem)} / (1 - ${formatarPercentual(alqIntra)}) = ${formatarMoeda(vSemIcmsOrigem)} / ${divisor.toFixed(4).replace('.', ',')}`,
      resultadoFormatado: formatarMoeda(bcDestino)
    },
    {
      titulo: 'Passo 5: Apuração do ICMS DIFAL a Recolher',
      descricao: 'Aplicação da alíquota interna sobre a Base Ceará deduzindo o crédito do ICMS de origem.',
      formula: 'DIFAL = (BC_CE × ALQ_interna) - ICMS_origem',
      substituicao: `(${formatarMoeda(bcDestino)} × ${formatarPercentual(alqIntra)}) - ${formatarMoeda(icmsOrigem)} = ${formatarMoeda(icmsDestinoTotal)} - ${formatarMoeda(icmsOrigem)}`,
      resultadoFormatado: formatarMoeda(totalDifalGeral)
    }
  ];

  return {
    item,
    valorOperacao: vOpe,
    baseCalculoOrigem: bcOrigem,
    icmsOrigem,
    valorSemIcmsOrigem: vSemIcmsOrigem,
    baseCalculoDestino: bcDestino,
    icmsDestinoTotal,
    totalDifalGeral,
    difalSemFecop: totalDifalGeral,
    valorFecop: 0,
    aliquotaEfetivaCeara,
    memoriaPassos: passos,
    fundamentacaoLegal: fundamentacao,
  };
}

/**
 * Consolida uma lista de cálculos em um resumo de lote
 */
export function calcularDifalCearaLote(itens: ParametrosDifalItem[]): ResultadoDifalLote {
  const resultados = itens.map(calcularDifalCeara);

  const totalOperacao = resultados.reduce((acc, r) => acc + r.valorOperacao, 0);
  const totalBaseCalculoDestino = resultados.reduce((acc, r) => acc + r.baseCalculoDestino, 0);
  const totalIcmsOrigem = resultados.reduce((acc, r) => acc + r.icmsOrigem, 0);
  const totalIcmsDestino = resultados.reduce((acc, r) => acc + r.icmsDestinoTotal, 0);
  const totalGeralPagar = resultados.reduce((acc, r) => acc + r.totalDifalGeral, 0);

  return {
    itens: resultados,
    totalProdutos: totalOperacao,
    totalOperacao,
    totalBaseCalculoDestino,
    totalIcmsOrigem,
    totalIcmsDestino,
    totalGeralPagar,
    totalDifalSemFecop: totalGeralPagar,
    totalFecop: 0,
  };
}

/**
 * Cria um item padrão pronto para uso
 */
export function criarItemDifalPadrao(ufOrigemPadrao: string = 'SP'): ParametrosDifalItem {
  const uf = LISTA_UFS.find(u => u.sigla === ufOrigemPadrao) || LISTA_UFS[0];
  const valorOperacaoPadrao = 10000.00;
  const icmsOrigemPadrao = valorOperacaoPadrao * (uf.aliquotaInterPadrao / 100);

  return {
    id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    descricao: 'Operação Interestadual',
    valorOperacao: valorOperacaoPadrao,
    valorProdutos: valorOperacaoPadrao,
    icmsOrigemManual: icmsOrigemPadrao,
    ufOrigem: uf.sigla,
    aliquotaInter: uf.aliquotaInterPadrao,
    aliquotaIntra: 20, // 20% vigência CE Lei 18.665/2023
  };
}
