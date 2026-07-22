/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Tax calculation formula based on Regime de Tributação
export const calculateEstimatedTaxes = (
  faturamentoTotal: number, 
  regime: 'LUCRO_REAL' | 'LUCRO_PRESUMIDO' | 'SIMPLES_NACIONAL' | 'LUCRO_ARBITRADO' | 'ISENTO_IMUNE'
) => {
  if (regime === 'SIMPLES_NACIONAL') {
    const sn = faturamentoTotal * 0.06;
    return { pis: 0, cofins: 0, irpj: 0, csll: 0, simplesNacional: sn, totalTaxes: sn };
  } else if (regime === 'LUCRO_PRESUMIDO') {
    const pis = faturamentoTotal * 0.0065;
    const cofins = faturamentoTotal * 0.03;
    const irpj = faturamentoTotal * 0.048;
    const csll = faturamentoTotal * 0.0288;
    return { pis, cofins, irpj, csll, totalTaxes: pis + cofins + irpj + csll };
  } else if (regime === 'LUCRO_ARBITRADO') {
    const pis = faturamentoTotal * 0.0065;
    const cofins = faturamentoTotal * 0.03;
    const irpj = faturamentoTotal * 0.0576; // Higher presumption margin
    const csll = faturamentoTotal * 0.0288;
    return { pis, cofins, irpj, csll, totalTaxes: pis + cofins + irpj + csll };
  } else if (regime === 'ISENTO_IMUNE') {
    return { pis: 0, cofins: 0, irpj: 0, csll: 0, totalTaxes: 0 };
  } else {
    // Lucro Real
    const pis = faturamentoTotal * 0.0165;
    const cofins = faturamentoTotal * 0.076;
    const irpj = faturamentoTotal * 0.018;
    const csll = faturamentoTotal * 0.0108;
    return { pis, cofins, irpj, csll, totalTaxes: pis + cofins + irpj + csll };
  }
};
