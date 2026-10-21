/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Scale, Clock, Copy, Check } from 'lucide-react';
import { 
  ResultadoDifalItem, 
  formatarMoeda, 
  formatarPercentual 
} from '../../utils/difalCearaCalculator';

export interface SimulacaoHistorico {
  id: string;
  dataHora: string;
  descricao: string;
  ufOrigem: string;
  resultado: ResultadoDifalItem;
}

interface DifalMemoriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  resultadoAtual: ResultadoDifalItem;
  historicoSimulacoes: SimulacaoHistorico[];
  simulacaoVisualizadaId: string;
  setSimulacaoVisualizadaId: (id: string) => void;
  ufOrigem: string;
}

export function DifalMemoriaModal({
  isOpen,
  onClose,
  resultadoAtual,
  historicoSimulacoes,
  simulacaoVisualizadaId,
  setSimulacaoVisualizadaId,
  ufOrigem,
}: DifalMemoriaModalProps) {
  const [feedbackCopiado, setFeedbackCopiado] = useState(false);

  const dadosModal = useMemo(() => {
    if (simulacaoVisualizadaId !== 'atual') {
      const encontrada = historicoSimulacoes.find(s => s.id === simulacaoVisualizadaId);
      if (encontrada) {
        return {
          titulo: `Simulação Histórica (${encontrada.ufOrigem} - ${encontrada.dataHora})`,
          resultado: encontrada.resultado
        };
      }
    }
    return {
      titulo: 'Simulação Atual',
      resultado: resultadoAtual
    };
  }, [simulacaoVisualizadaId, resultadoAtual, historicoSimulacoes]);

  const handleCopiarMemoria = () => {
    const res = dadosModal.resultado;
    const texto = `
======================================================
MEMÓRIA DE CÁLCULO AUDITÁVEL DO ICMS DIFAL - CEARÁ
Legislação: ${res.fundamentacaoLegal}
======================================================
DADOS DA OPERAÇÃO:
- Valor da Operação: ${formatarMoeda(res.valorOperacao)}
- Alíquota Interestadual (Origem): ${formatarPercentual(res.item.aliquotaInter)}
- ICMS de Origem (Crédito): ${formatarMoeda(res.icmsOrigem)}
- Alíquota Interna Ceará: ${formatarPercentual(res.item.aliquotaIntra)}

PASSOS DA APURAÇÃO:
${res.memoriaPassos.map((p, idx) => `
[Passo ${idx + 1}] ${p.titulo}
Descrição: ${p.descricao}
Fórmula: ${p.formula}
Cálculo: ${p.substituicao}
Resultado: ${p.resultadoFormatado}
`).join('\n')}

RESULTADO CONSOLIDADO:
>>> TOTAL DO DIFAL A RECOLHER NO CEARÁ: ${formatarMoeda(res.totalDifalGeral)} <<<
Base de Cálculo no Ceará ("Por Dentro"): ${formatarMoeda(res.baseCalculoDestino)}
ICMS Destino Apurado: ${formatarMoeda(res.icmsDestinoTotal)}
Carga Tributária Efetiva: ${formatarPercentual(res.aliquotaEfetivaCeara)}
======================================================
Gerado pelo Sistema My Hub Moreira & Lima
    `.trim();

    navigator.clipboard.writeText(texto);
    setFeedbackCopiado(true);
    setTimeout(() => setFeedbackCopiado(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-scaleIn">
        
        {/* Cabeçalho do Modal */}
        <div className="bg-[#04243b] text-white p-5 flex items-center justify-between border-b border-[#e4b35e]/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#031d30] border border-[#e4b35e]/40 flex items-center justify-center text-[#e4b35e] shrink-0">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Memória de Cálculo Auditável</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e4b35e] text-[#04243b]">
                  SEFAZ-CE
                </span>
              </h2>
              <p className="text-xs text-slate-300 font-medium">
                Fundamentação jurídica, fórmulas passo a passo e histórico de simulações
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopiarMemoria}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#031d30] text-[#e4b35e] hover:bg-[#021523] border border-[#e4b35e]/30 transition-all cursor-pointer"
              title="Copiar texto da memória"
            >
              {feedbackCopiado ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Corpo do Modal */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-grow">
          
          {/* Histórico de simulações */}
          {historicoSimulacoes.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#e4b35e]" />
                <span className="text-xs font-bold text-[#04243b]">Simulação Visualizada:</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setSimulacaoVisualizadaId('atual')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    simulacaoVisualizadaId === 'atual'
                      ? 'bg-[#04243b] text-[#e4b35e] shadow-sm'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Simulação Atual ({ufOrigem})
                </button>

                {historicoSimulacoes.map((sim, i) => (
                  <button
                    key={sim.id}
                    onClick={() => setSimulacaoVisualizadaId(sim.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      simulacaoVisualizadaId === sim.id
                        ? 'bg-[#04243b] text-[#e4b35e] shadow-sm'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    #{historicoSimulacoes.length - i} ({sim.ufOrigem})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Base Normativa */}
          <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-xl text-xs text-amber-900 space-y-1">
            <span className="font-bold flex items-center gap-1.5 text-amber-950">
              <Scale className="h-4 w-4 text-amber-700" />
              Base Normativa Estadual Vigente:
            </span>
            <p className="text-[11px] leading-relaxed">
              {dadosModal.resultado.fundamentacaoLegal}
            </p>
          </div>

          {/* Passos da Apuração */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Demonstração Analítica da Memória de Cálculo (Art. 4º-A NE 01/24)
            </h3>

            <div className="space-y-3">
              {dadosModal.resultado.memoriaPassos.map((passo, idx) => (
                <div 
                  key={idx}
                  className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 hover:border-[#e4b35e]/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#04243b] flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#04243b] text-[#e4b35e] text-[10px] flex items-center justify-center font-mono">
                        {idx + 1}
                      </span>
                      <span>{passo.titulo}</span>
                    </span>
                    <span className="text-xs font-mono font-black text-[#04243b] bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs">
                      {passo.resultadoFormatado}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 pl-7">
                    {passo.descricao}
                  </p>

                  <div className="pl-7 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                    <div className="bg-white p-2 rounded-lg border border-slate-200 text-slate-500">
                      <span className="font-bold text-slate-400 block text-[9px] uppercase tracking-wider mb-0.5">Fórmula:</span>
                      {passo.formula}
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200 text-slate-800">
                      <span className="font-bold text-slate-400 block text-[9px] uppercase tracking-wider mb-0.5">Aplicação:</span>
                      {passo.substituicao}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="bg-[#04243b] text-white p-5 rounded-xl border border-[#e4b35e]/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-wider text-[#e4b35e] font-bold block">
                Total Apurado a Recolher no Ceará
              </span>
              <p className="text-xs text-slate-300">
                Carga tributária final após dedução do crédito da origem
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl sm:text-3xl font-black text-[#e4b35e] font-mono">
                {formatarMoeda(dadosModal.resultado.totalDifalGeral)}
              </span>
            </div>
          </div>

        </div>

        {/* Rodapé do Modal */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Auditoria SEFAZ-CE | My Hub Moreira &amp; Lima
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#04243b] text-[#e4b35e] hover:bg-[#031d30] transition-colors cursor-pointer"
          >
            Concluir Visualização
          </button>
        </div>

      </div>
    </div>
  );
}
