/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Módulo Orquestrador de Calculadoras Fiscais
 * Gerencia a navegação entre a Calculadora de DIFAL Ceará e a Calculadora de MVA Ajustada.
 */

import React, { useState } from 'react';
import { Calculator, Scale, Percent } from 'lucide-react';
import { DifalCearaCalculator } from './calculadora/DifalCearaCalculator';
import { MvaAjustadaCalculator } from './calculadora/MvaAjustadaCalculator';

export function CalculadoraWorkspace() {
  const [calculadoraAtiva, setCalculadoraAtiva] = useState<'difal' | 'mva'>('difal');

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-fadeIn pb-12">
      
      {/* SELETOR DE CALCULADORAS FISCAIS (DIFAL CEARÁ VS MVA AJUSTADA) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#04243b] text-white p-3.5 sm:p-4 rounded-2xl shadow-md border border-[#e4b35e]/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#031d30] border border-[#e4b35e]/40 flex items-center justify-center text-[#e4b35e] shadow-inner shrink-0">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-black text-white tracking-tight">
              Módulo de Calculadoras Fiscais
            </h1>
            <p className="text-[11px] text-slate-300">
              {calculadoraAtiva === 'difal' 
                ? 'Diferencial de Alíquota – Legislação SEFAZ-CE (Base Dupla "Por Dentro")'
                : 'Margem de Valor Agregado Ajustada – Convênios e Protocolos ICMS'}
            </p>
          </div>
        </div>

        {/* Botões para Escolher a Calculadora */}
        <div className="flex items-center gap-1.5 bg-[#031d30] p-1.5 rounded-xl border border-[#e4b35e]/30 self-stretch sm:self-auto justify-center">
          <button
            type="button"
            onClick={() => setCalculadoraAtiva('difal')}
            className={`flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              calculadoraAtiva === 'difal'
                ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            <span>DIFAL Ceará</span>
          </button>

          <button
            type="button"
            onClick={() => setCalculadoraAtiva('mva')}
            className={`flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              calculadoraAtiva === 'mva'
                ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Percent className="h-3.5 w-3.5" />
            <span>MVA Ajustada</span>
          </button>
        </div>
      </div>

      {/* Renderização do Módulo Selecionado */}
      {calculadoraAtiva === 'mva' ? (
        <MvaAjustadaCalculator />
      ) : (
        <DifalCearaCalculator />
      )}

    </div>
  );
}
