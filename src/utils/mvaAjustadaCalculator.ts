/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Motor de Cálculo da Margem de Valor Agregado Ajustada (MVA Ajustada)
 * Em estrita conformidade com a fórmula estabelecida pelo CONFAZ (Convênio ICMS 142/2018 e protocolos):
 * 
 * “MVA ajustada = [(1 + MVA-ST original) x (1 - ALQ inter) / (1 - ALQ intra)] - 1”
 * 
 * Regra de Negócio:
 * Quando não houver todas as informações necessárias (MVA Original, ALQ Intra e ALQ Inter),
 * o cálculo DEVE permanecer estritamente ZERADO (0,00%).
 */

export interface NormalizacaoValor {
  percentual: number;
  coeficiente: number;
}

/**
 * Normaliza qualquer entrada numérica aceitando tanto percentual (ex: 40, 12, 20)
 * quanto coeficientes decimais diretos (ex: 0.40, 0.12, 0.20).
 */
export function normalizarEntradaTributaria(valor: number): NormalizacaoValor {
  if (isNaN(valor) || valor <= 0) {
    return { percentual: 0, coeficiente: 0 };
  }

  // Se o valor informado for menor ou igual a 1 (ex: 0.40, 0.12, 0.07, 0.20),
  // o usuário digitou o coeficiente decimal.
  if (valor <= 1) {
    const coeficiente = Number(valor.toFixed(6));
    const percentual = Number((valor * 100).toFixed(4));
    return { percentual, coeficiente };
  }

  // Se for maior que 1 (ex: 40, 12, 7, 20), foi digitado o percentual.
  const percentual = Number(valor.toFixed(4));
  const coeficiente = Number((valor / 100).toFixed(6));
  return { percentual, coeficiente };
}

export interface PassoMemoriaMva {
  passo: number;
  titulo: string;
  formula: string;
  substituicao: string;
  resultado: string;
}

export interface ResultadoMvaDetalhado {
  mvaOriginalPerc: number;
  mvaOriginalCoef: number;
  alqInterPerc: number;
  alqInterCoef: number;
  alqIntraPerc: number;
  alqIntraCoef: number;
  
  passo1_umMaisMva: number;
  passo2_umMenosInter: number;
  passo3_numerador: number;
  passo4_denominador: number;
  passo5_fator: number;
  
  mvaAjustadaCoef: number;
  mvaAjustadaPerc: number;
  mvaAjustadaPerc2Casas: number;
  mvaAjustadaPerc4Casas: number;
  
  formulaTexto: string;
  substituicaoTexto: string;
  passos: PassoMemoriaMva[];
  observacaoLegal?: string;
  dadosCompletos: boolean;
}

export function formatarNumeroPtBr(valor: number, casas: number = 2): string {
  if (isNaN(valor)) return '0,00';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(valor);
}

/**
 * Executa o cálculo rigoroso e auditável da MVA Ajustada conforme a fórmula CONFAZ:
 * MVA ajustada = [ ( (1 + MVA-ST original) x (1 - ALQ inter) ) / (1 - ALQ intra) ] - 1
 * 
 * Se qualquer um dos dados obrigatórios não estiver preenchido (mvaOriginal <= 0, alqInter <= 0, alqIntra <= 0),
 * o cálculo permanece ZERADO (0,00%).
 */
export function calcularMvaAjustadaDetalhada(
  mvaOriginalInput: number,
  alqInterInput: number,
  alqIntraInput: number
): ResultadoMvaDetalhado {
  const normMva = normalizarEntradaTributaria(mvaOriginalInput);
  const normInter = normalizarEntradaTributaria(alqInterInput);
  const normIntra = normalizarEntradaTributaria(alqIntraInput);

  const mvaCoef = normMva.coeficiente;
  const interCoef = normInter.coeficiente;
  const intraCoef = normIntra.coeficiente;

  // Verificação estrita de informações obrigatórias
  const dadosCompletos = normMva.percentual > 0 && normInter.percentual > 0 && normIntra.percentual > 0;

  if (!dadosCompletos) {
    return {
      mvaOriginalPerc: normMva.percentual,
      mvaOriginalCoef: mvaCoef,
      alqInterPerc: normInter.percentual,
      alqInterCoef: interCoef,
      alqIntraPerc: normIntra.percentual,
      alqIntraCoef: intraCoef,
      passo1_umMaisMva: 0,
      passo2_umMenosInter: 0,
      passo3_numerador: 0,
      passo4_denominador: 0,
      passo5_fator: 0,
      mvaAjustadaCoef: 0,
      mvaAjustadaPerc: 0,
      mvaAjustadaPerc2Casas: 0,
      mvaAjustadaPerc4Casas: 0,
      formulaTexto: 'MVA ajustada = [ ( (1 + MVA-ST original) × (1 - ALQ inter) ) / (1 - ALQ intra) ] - 1',
      substituicaoTexto: 'Aguardando preenchimento de todos os dados da operação (MVA Original, ALQ Intra e ALQ Inter).',
      passos: [],
      observacaoLegal: undefined,
      dadosCompletos: false
    };
  }

  // Passo 1: (1 + MVA-ST original)
  const passo1_umMaisMva = 1 + mvaCoef;

  // Passo 2: (1 - ALQ inter)
  const passo2_umMenosInter = 1 - interCoef;

  // Passo 3: Numerador = (1 + MVA) * (1 - ALQ inter)
  const passo3_numerador = passo1_umMaisMva * passo2_umMenosInter;

  // Passo 4: Denominador = (1 - ALQ intra)
  const denominadorBruto = 1 - intraCoef;
  const passo4_denominador = denominadorBruto <= 0 ? 0.0001 : denominadorBruto;

  // Passo 5: Fator = Numerador / Denominador
  const passo5_fator = passo3_numerador / passo4_denominador;

  // Passo 6: MVA ajustada = Fator - 1
  const mvaAjustadaCoef = passo5_fator - 1;
  const mvaAjustadaPerc = mvaAjustadaCoef * 100;
  const mvaAjustadaPerc2Casas = Number(mvaAjustadaPerc.toFixed(2));
  const mvaAjustadaPerc4Casas = Number(mvaAjustadaPerc.toFixed(4));

  const formulaTexto = 'MVA ajustada = [ ( (1 + MVA-ST original) × (1 - ALQ inter) ) / (1 - ALQ intra) ] - 1';
  
  const substituicaoTexto = `[ ( (1 + ${formatarNumeroPtBr(mvaCoef, 4)}) × (1 - ${formatarNumeroPtBr(interCoef, 4)}) ) / (1 - ${formatarNumeroPtBr(intraCoef, 4)}) ] - 1 = [ (${formatarNumeroPtBr(passo1_umMaisMva, 4)} × ${formatarNumeroPtBr(passo2_umMenosInter, 4)}) / ${formatarNumeroPtBr(passo4_denominador, 4)} ] - 1 = ${formatarNumeroPtBr(passo5_fator, 6)} - 1 = ${formatarNumeroPtBr(mvaAjustadaPerc2Casas, 2)}%`;

  let observacaoLegal: string | undefined;
  if (intraCoef <= interCoef && intraCoef > 0 && interCoef > 0) {
    observacaoLegal = 'Nota: Quando a ALQ intra (ou carga efetiva) for igual ou inferior à ALQ inter, não há acréscimo de MVA na operação interestadual.';
  }

  const passos: PassoMemoriaMva[] = [
    {
      passo: 1,
      titulo: 'Fator da MVA Original (1 + MVA-ST)',
      formula: '1 + MVA-ST original',
      substituicao: `1 + ${formatarNumeroPtBr(mvaCoef, 4)} (${formatarNumeroPtBr(normMva.percentual, 2)}%)`,
      resultado: formatarNumeroPtBr(passo1_umMaisMva, 4)
    },
    {
      passo: 2,
      titulo: 'Complemento da Alíquota Interestadual (1 - ALQ inter)',
      formula: '1 - ALQ inter',
      substituicao: `1 - ${formatarNumeroPtBr(interCoef, 4)} (${formatarNumeroPtBr(normInter.percentual, 2)}%)`,
      resultado: formatarNumeroPtBr(passo2_umMenosInter, 4)
    },
    {
      passo: 3,
      titulo: 'Numerador da Fórmula [ (1 + MVA-ST) × (1 - ALQ inter) ]',
      formula: '(1 + MVA-ST) × (1 - ALQ inter)',
      substituicao: `${formatarNumeroPtBr(passo1_umMaisMva, 4)} × ${formatarNumeroPtBr(passo2_umMenosInter, 4)}`,
      resultado: formatarNumeroPtBr(passo3_numerador, 6)
    },
    {
      passo: 4,
      titulo: 'Denominador / Carga Interna Destino (1 - ALQ intra)',
      formula: '1 - ALQ intra',
      substituicao: `1 - ${formatarNumeroPtBr(intraCoef, 4)} (${formatarNumeroPtBr(normIntra.percentual, 2)}%)`,
      resultado: formatarNumeroPtBr(passo4_denominador, 4)
    },
    {
      passo: 5,
      titulo: 'Aplicação da Divisão e Fator Total',
      formula: 'Numerador / Denominador',
      substituicao: `${formatarNumeroPtBr(passo3_numerador, 6)} / ${formatarNumeroPtBr(passo4_denominador, 4)}`,
      resultado: formatarNumeroPtBr(passo5_fator, 6)
    },
    {
      passo: 6,
      titulo: 'MVA Ajustada Final (Fator - 1)',
      formula: '(Fator - 1) × 100',
      substituicao: `(${formatarNumeroPtBr(passo5_fator, 6)} - 1) × 100`,
      resultado: `${formatarNumeroPtBr(mvaAjustadaPerc2Casas, 2)}% (${formatarNumeroPtBr(mvaAjustadaPerc4Casas, 4)}%)`
    }
  ];

  return {
    mvaOriginalPerc: normMva.percentual,
    mvaOriginalCoef: mvaCoef,
    alqInterPerc: normInter.percentual,
    alqInterCoef: interCoef,
    alqIntraPerc: normIntra.percentual,
    alqIntraCoef: intraCoef,
    passo1_umMaisMva,
    passo2_umMenosInter,
    passo3_numerador,
    passo4_denominador,
    passo5_fator,
    mvaAjustadaCoef,
    mvaAjustadaPerc,
    mvaAjustadaPerc2Casas,
    mvaAjustadaPerc4Casas,
    formulaTexto,
    substituicaoTexto,
    passos,
    observacaoLegal,
    dadosCompletos: true
  };
}

/**
 * Função rápida que retorna o percentual arredondado em 2 casas decimais.
 */
export function calcularMvaAjustada(
  mvaOriginal: number, 
  alqInter: number, 
  alqIntra: number
): number {
  const res = calcularMvaAjustadaDetalhada(mvaOriginal, alqInter, alqIntra);
  return res.mvaAjustadaPerc2Casas;
}

export interface CenarioMvaAjustada {
  aliquota: number;
  rotulo: string;
  descricao: string;
  mvaAjustada: number;
  mvaAjustada4Casas: number;
  substituicao: string;
}

/**
 * Apura os 3 cenários interestaduais solicitados pelo usuário:
 * 1. 4% - Mercadorias importadas (Res. SF 13/2012)
 * 2. 7% - Região Sul e Sudeste (exceto ES) para Norte, Nordeste, Centro-Oeste e ES
 * 3. 12% - Região Norte, Nordeste, Centro-Oeste e ES
 * 
 * Se não houver MVA Original informada (mvaOriginal <= 0) ou alíquota interna,
 * todos os cenários permanecem ZERADOS (0,00%).
 */
export function apurarTodosCenariosMva(
  mvaOriginal: number, 
  alqIntra: number
): CenarioMvaAjustada[] {
  const cenariosConfig = [
    {
      aliquota: 4,
      rotulo: '4% - Importada',
      descricao: 'Mercadoria com conteúdo de importação > 40% (Res. SF 13/2012)'
    },
    {
      aliquota: 7,
      rotulo: '7% - Sul e Sudeste',
      descricao: 'Origem Sul / Sudeste (exceto ES) com destino a Norte, NE, CO ou ES'
    },
    {
      aliquota: 12,
      rotulo: '12% - Norte, NE, CO e ES',
      descricao: 'Origem Norte, Nordeste, Centro-Oeste ou ES, ou entre estados do Sul/Sudeste'
    }
  ];

  const normMva = normalizarEntradaTributaria(mvaOriginal);
  const normIntra = normalizarEntradaTributaria(alqIntra);

  // Se faltar a MVA original ou a alíquota interna, os cenários permanecem zerados (0,00%)
  if (normMva.percentual <= 0 || normIntra.percentual <= 0) {
    return cenariosConfig.map(c => ({
      aliquota: c.aliquota,
      rotulo: c.rotulo,
      descricao: c.descricao,
      mvaAjustada: 0,
      mvaAjustada4Casas: 0,
      substituicao: 'Aguardando preenchimento da MVA Original e Alíquota Interna.'
    }));
  }

  return cenariosConfig.map(c => {
    const detalhe = calcularMvaAjustadaDetalhada(mvaOriginal, c.aliquota, alqIntra);
    return {
      aliquota: c.aliquota,
      rotulo: c.rotulo,
      descricao: c.descricao,
      mvaAjustada: detalhe.mvaAjustadaPerc2Casas,
      mvaAjustada4Casas: detalhe.mvaAjustadaPerc4Casas,
      substituicao: detalhe.substituicaoTexto
    };
  });
}
