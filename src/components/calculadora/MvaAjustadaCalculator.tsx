/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Calculator, 
  RotateCcw, 
  Check, 
  Percent, 
  Copy, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2
} from 'lucide-react';
import { 
  calcularMvaAjustadaDetalhada,
  apurarTodosCenariosMva,
  formatarNumeroPtBr,
  normalizarEntradaTributaria
} from '../../utils/mvaAjustadaCalculator';
import { parseNumeroBr } from './calculadoraHelpers';

export function MvaAjustadaCalculator() {
  // 1. Estados dos campos essenciais da fórmula
  const [mvaOriginalStr, setMvaOriginalStr] = useState<string>('40,00');
  const [mvaOriginalNum, setMvaOriginalNum] = useState<number>(40);

  const [aliquotaIntraStr, setAliquotaIntraStr] = useState<string>('20,00');
  const [aliquotaIntraNum, setAliquotaIntraNum] = useState<number>(20);

  const [aliquotaInterStr, setAliquotaInterStr] = useState<string>('7,00');
  const [aliquotaInterNum, setAliquotaInterNum] = useState<number>(7);

  // Feedbacks visuais
  const [feedbackCalculado, setFeedbackCalculado] = useState<boolean>(false);
  const [feedbackLimpo, setFeedbackLimpo] = useState<boolean>(false);
  const [feedbackCopiado, setFeedbackCopiado] = useState<boolean>(false);
  const [expandirMemoria, setExpandirMemoria] = useState<boolean>(false);

  // 2. Handlers de digitação e formatação
  const handleMvaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMvaOriginalStr(val);
    const num = parseNumeroBr(val);
    setMvaOriginalNum(num);
  };

  const handleMvaBlur = () => {
    if (!mvaOriginalStr.trim()) {
      setMvaOriginalNum(0);
      setMvaOriginalStr('');
      return;
    }
    const num = parseNumeroBr(mvaOriginalStr);
    const norm = normalizarEntradaTributaria(num);
    setMvaOriginalNum(norm.percentual);
    setMvaOriginalStr(formatarNumeroPtBr(norm.percentual, 2));
  };

  const handleAliquotaIntraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAliquotaIntraStr(val);
    const num = parseNumeroBr(val);
    setAliquotaIntraNum(num);
  };

  const handleAliquotaIntraBlur = () => {
    if (!aliquotaIntraStr.trim()) {
      setAliquotaIntraNum(0);
      setAliquotaIntraStr('');
      return;
    }
    const num = parseNumeroBr(aliquotaIntraStr);
    const norm = normalizarEntradaTributaria(num);
    setAliquotaIntraNum(norm.percentual);
    setAliquotaIntraStr(formatarNumeroPtBr(norm.percentual, 2));
  };

  const handleAliquotaInterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAliquotaInterStr(val);
    const num = parseNumeroBr(val);
    setAliquotaInterNum(num);
  };

  const handleAliquotaInterBlur = () => {
    if (!aliquotaInterStr.trim()) {
      setAliquotaInterNum(0);
      setAliquotaInterStr('');
      return;
    }
    const num = parseNumeroBr(aliquotaInterStr);
    const norm = normalizarEntradaTributaria(num);
    setAliquotaInterNum(norm.percentual);
    setAliquotaInterStr(formatarNumeroPtBr(norm.percentual, 2));
  };

  const selecionarAliquotaInterRapida = (aliq: number) => {
    setAliquotaInterNum(aliq);
    setAliquotaInterStr(formatarNumeroPtBr(aliq, 2));
  };

  // 3. Limpar formulário
  const handleLimpar = () => {
    setMvaOriginalNum(0);
    setMvaOriginalStr('');
    setAliquotaInterNum(0);
    setAliquotaInterStr('');
    setFeedbackLimpo(true);
    setTimeout(() => setFeedbackLimpo(false), 1500);
  };

  const handleExecutarCalculo = () => {
    setFeedbackCalculado(true);
    setTimeout(() => setFeedbackCalculado(false), 2000);
  };

  // 4. Execução do Cálculo da Operação e dos 3 Cenários (4%, 7%, 12%)
  const resultadoDetalhado = useMemo(() => {
    return calcularMvaAjustadaDetalhada(mvaOriginalNum, aliquotaInterNum, aliquotaIntraNum);
  }, [mvaOriginalNum, aliquotaInterNum, aliquotaIntraNum]);

  const cenarios = useMemo(() => {
    return apurarTodosCenariosMva(mvaOriginalNum, aliquotaIntraNum);
  }, [mvaOriginalNum, aliquotaIntraNum]);

  // Copiar memória de cálculo
  const handleCopiarMemoria = () => {
    if (!resultadoDetalhado.dadosCompletos) return;

    const texto = `
======================================================
MEMÓRIA DE CÁLCULO DA MVA AJUSTADA (CONFAZ)
Fórmula: MVA ajustada = [ ( (1 + MVA-ST original) × (1 - ALQ inter) ) / (1 - ALQ intra) ] - 1
======================================================
PARÂMETROS DA OPERAÇÃO:
I   - MVA-ST Original: ${formatarNumeroPtBr(resultadoDetalhado.mvaOriginalPerc, 2)}% (Coeficiente: ${formatarNumeroPtBr(resultadoDetalhado.mvaOriginalCoef, 4)})
II  - ALQ Inter (Interestadual): ${formatarNumeroPtBr(resultadoDetalhado.alqInterPerc, 2)}% (Coeficiente: ${formatarNumeroPtBr(resultadoDetalhado.alqInterCoef, 4)})
III - ALQ Intra (Interna / Carga Efetiva): ${formatarNumeroPtBr(resultadoDetalhado.alqIntraPerc, 2)}% (Coeficiente: ${formatarNumeroPtBr(resultadoDetalhado.alqIntraCoef, 4)})

PASSOS DA APURAÇÃO:
${resultadoDetalhado.passos.map(p => `[Passo ${p.passo}] ${p.titulo}: ${p.formula} = ${p.substituicao} = ${p.resultado}`).join('\n')}

RESULTADO CONSOLIDADO:
>>> MVA AJUSTADA: ${formatarNumeroPtBr(resultadoDetalhado.mvaAjustadaPerc2Casas, 2)}% (${formatarNumeroPtBr(resultadoDetalhado.mvaAjustadaPerc4Casas, 4)}%) <<<
Coeficiente Ajustado: ${formatarNumeroPtBr(resultadoDetalhado.mvaAjustadaCoef, 6)}

CENÁRIOS DE ALÍQUOTAS INTERESTADUAIS:
- 4% (Importada): ${formatarNumeroPtBr(cenarios[0]?.mvaAjustada || 0, 2)}%
- 7% (Sul/Sudeste): ${formatarNumeroPtBr(cenarios[1]?.mvaAjustada || 0, 2)}%
- 12% (Norte/NE/CO/ES): ${formatarNumeroPtBr(cenarios[2]?.mvaAjustada || 0, 2)}%
======================================================
Sistema My Hub Moreira & Lima
    `.trim();

    navigator.clipboard.writeText(texto);
    setFeedbackCopiado(true);
    setTimeout(() => setFeedbackCopiado(false), 2500);
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      
      {/* BARRA SUPERIOR DISCRETA DE AÇÕES */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#04243b] text-[#e4b35e] flex items-center justify-center shrink-0">
            <Percent className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#04243b] tracking-tight">
              Calculadora de MVA Ajustada (Convênios e Protocolos ICMS)
            </h2>
            <p className="text-[11px] text-slate-500">
              Fórmula Oficial CONFAZ: <span className="font-mono text-slate-700 font-semibold">[ (1+ MVA-ST) × (1 - ALQ inter) / (1- ALQ intra) ] - 1</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLimpar}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 border border-slate-200 transition-all cursor-pointer shadow-xs"
            title="Limpar campos"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${feedbackLimpo ? 'animate-spin text-rose-600' : ''}`} />
            <span>{feedbackLimpo ? 'Limpo!' : 'Limpar'}</span>
          </button>
        </div>
      </div>

      {/* CARD PRINCIPAL UNIFICADO */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        
        {/* FORMULÁRIO DE ENTRADA */}
        <div className="p-6 space-y-5">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* 1. MVA-ST ORIGINAL */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                MVA-ST Original (%) *
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={mvaOriginalStr}
                  onChange={handleMvaChange}
                  onBlur={handleMvaBlur}
                  placeholder="0,00"
                  className="w-full px-3.5 py-2.5 text-sm font-black text-[#04243b] bg-slate-50/50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#e4b35e] focus:border-[#04243b] focus:bg-white outline-none transition-all font-mono"
                />
                <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">
                  %
                </span>
              </div>
            </div>

            {/* 2. ALQ INTRA (Alíquota interna ou Carga Tributária Efetiva) */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Alíquota Interna / Carga Efetiva Destino (ALQ intra) (%) *
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={aliquotaIntraStr}
                  onChange={handleAliquotaIntraChange}
                  onBlur={handleAliquotaIntraBlur}
                  placeholder="20,00"
                  className="w-full px-3.5 py-2.5 text-sm font-bold text-slate-800 bg-slate-50/50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#e4b35e] focus:border-[#04243b] focus:bg-white outline-none transition-all font-mono"
                />
                <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">
                  %
                </span>
              </div>
            </div>

            {/* 3. ALQ INTER (Alíquota interestadual aplicável à operação) */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Alíquota Interestadual da Operação (ALQ inter) (%) *
              </label>

              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative w-full sm:w-1/2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={aliquotaInterStr}
                    onChange={handleAliquotaInterChange}
                    onBlur={handleAliquotaInterBlur}
                    placeholder="0,00"
                    className="w-full px-3.5 py-2.5 text-sm font-bold text-slate-800 bg-slate-50/50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#e4b35e] focus:border-[#04243b] focus:bg-white outline-none transition-all font-mono"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">
                    %
                  </span>
                </div>

                <div className="flex items-center gap-1.5 w-full sm:w-1/2">
                  <button
                    type="button"
                    onClick={() => selecionarAliquotaInterRapida(4)}
                    className={`flex-1 text-[11px] font-bold py-2 rounded-xl border transition-all cursor-pointer ${
                      resultadoDetalhado.alqInterPerc === 4 
                        ? 'bg-[#04243b] text-[#e4b35e] border-[#04243b] shadow-xs' 
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    4% Importada
                  </button>
                  <button
                    type="button"
                    onClick={() => selecionarAliquotaInterRapida(7)}
                    className={`flex-1 text-[11px] font-bold py-2 rounded-xl border transition-all cursor-pointer ${
                      resultadoDetalhado.alqInterPerc === 7 
                        ? 'bg-[#04243b] text-[#e4b35e] border-[#04243b] shadow-xs' 
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    7% Sul/Sudeste
                  </button>
                  <button
                    type="button"
                    onClick={() => selecionarAliquotaInterRapida(12)}
                    className={`flex-1 text-[11px] font-bold py-2 rounded-xl border transition-all cursor-pointer ${
                      resultadoDetalhado.alqInterPerc === 12 
                        ? 'bg-[#04243b] text-[#e4b35e] border-[#04243b] shadow-xs' 
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    12% Norte/NE/CO
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* BOTÃO PRINCIPAL DE CÁLCULO */}
          <button
            type="button"
            onClick={handleExecutarCalculo}
            className="w-full py-3 px-6 rounded-xl font-black text-sm tracking-wide bg-[#e4b35e] text-[#04243b] hover:bg-[#d9a54e] active:scale-[0.99] shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {feedbackCalculado ? (
              <>
                <Check className="h-4.5 w-4.5 text-[#04243b]" />
                <span>MVA Calculada com Sucesso!</span>
              </>
            ) : (
              <>
                <Calculator className="h-4.5 w-4.5 text-[#04243b]" />
                <span>Calcular MVA Ajustada</span>
              </>
            )}
          </button>
        </div>

        {/* RESULTADO DA MVA AJUSTADA */}
        <div className="bg-[#04243b] text-white p-6 border-t border-[#e4b35e]/30 space-y-4">
          
          {/* DESTAQUE PRINCIPAL: MVA DA OPERAÇÃO */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#e4b35e] block">
                MVA Ajustada da Operação
              </span>
              <span className="text-xs text-slate-300 font-mono">
                ALQ Inter: <strong className="text-white">{formatarNumeroPtBr(resultadoDetalhado.alqInterPerc, 2)}%</strong> | ALQ Intra: <strong className="text-white">{formatarNumeroPtBr(resultadoDetalhado.alqIntraPerc, 2)}%</strong>
              </span>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-3xl sm:text-4xl font-black text-[#e4b35e] font-mono tracking-tight block">
                {formatarNumeroPtBr(resultadoDetalhado.mvaAjustadaPerc2Casas, 2)}%
              </span>
              <span className="text-[11px] font-mono text-slate-300 block">
                Precisão 4 casas: <strong className="text-white">{formatarNumeroPtBr(resultadoDetalhado.mvaAjustadaPerc4Casas, 4)}%</strong>
              </span>
            </div>
          </div>

          {/* QUADRO COMPARATIVO DOS 3 CENÁRIOS (4%, 7%, 12%) */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block">
                Cenários Interestaduais (MVA Original: {formatarNumeroPtBr(resultadoDetalhado.mvaOriginalPerc, 2)}% | ALQ Intra: {formatarNumeroPtBr(resultadoDetalhado.alqIntraPerc, 2)}%)
              </span>
              <span className="text-[10px] text-slate-400">
                Clique no card para selecionar
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {cenarios.map((c) => (
                <div 
                  key={c.aliquota}
                  onClick={() => selecionarAliquotaInterRapida(c.aliquota)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    resultadoDetalhado.alqInterPerc === c.aliquota 
                      ? 'bg-[#031d30] border-[#e4b35e] shadow-md ring-1 ring-[#e4b35e]' 
                      : 'bg-[#031d30]/70 border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-[#e4b35e]">
                      {c.rotulo}
                    </span>
                    {resultadoDetalhado.alqInterPerc === c.aliquota && (
                      <span className="text-[9px] font-bold bg-[#e4b35e] text-[#04243b] px-1.5 py-0.2 rounded-full uppercase">
                        Selecionada
                      </span>
                    )}
                  </div>
                  
                  <span className="text-xl sm:text-2xl font-black text-white font-mono block mt-1">
                    {formatarNumeroPtBr(c.mvaAjustada, 2)}%
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 block">
                    {formatarNumeroPtBr(c.mvaAjustada4Casas, 4)}%
                  </span>

                  <span className="text-[10px] text-slate-300/80 mt-1.5 block leading-tight">
                    {c.descricao}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* BOTÃO E SEÇÃO DA MEMÓRIA DE CÁLCULO PASSO A PASSO AUDITÁVEL */}
          <div className="pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setExpandirMemoria(!expandirMemoria)}
              className="flex items-center justify-between w-full p-2.5 rounded-xl bg-[#031d30] hover:bg-[#031d30]/90 border border-white/10 text-xs font-bold text-slate-200 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Percent className="h-3.5 w-3.5 text-[#e4b35e]" />
                <span>Memória de Cálculo Auditável (Detalhamento Passo a Passo)</span>
              </div>
              {expandirMemoria ? (
                <ChevronUp className="h-4 w-4 text-[#e4b35e]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#e4b35e]" />
              )}
            </button>

            {expandirMemoria && (
              <div className="mt-3 p-4 bg-[#031d30] rounded-xl border border-white/10 space-y-3 animate-fadeIn">
                {resultadoDetalhado.dadosCompletos ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {resultadoDetalhado.passos.map((p) => (
                        <div 
                          key={p.passo}
                          className="p-3 rounded-lg bg-[#04243b] border border-white/5 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-[#e4b35e]">
                              Passo {p.passo}: {p.titulo}
                            </span>
                          </div>
                          <p className="text-[10px] font-mono text-slate-400">
                            Fórmula: {p.formula}
                          </p>
                          <p className="text-xs font-mono text-slate-200">
                            {p.substituicao} = <strong className="text-white">{p.resultado}</strong>
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={handleCopiarMemoria}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#e4b35e] text-[#04243b] hover:bg-[#d9a54e] transition-all cursor-pointer shadow-xs"
                      >
                        {feedbackCopiado ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-[#04243b]" />
                            <span>Copiado com Sucesso!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copiar Memória de Cálculo Auditável</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-300 text-center py-3 font-medium">
                    Preencha os campos obrigatórios (MVA-ST Original, Alíquota Interna e Alíquota Interestadual) para gerar a memória de cálculo.
                  </p>
                )}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
