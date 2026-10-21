/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { 
  Calculator, 
  RotateCcw, 
  FileSpreadsheet, 
  Check, 
  Info, 
  FileText, 
  Scale, 
  Upload 
} from 'lucide-react';
import { 
  calcularDifalCeara, 
  calcularDifalCearaLote, 
  ParametrosDifalItem, 
  ResultadoDifalItem, 
  ResultadoDifalLote, 
  LISTA_UFS, 
  formatarMoeda, 
  formatarPercentual 
} from '../../utils/difalCearaCalculator';
import { exportarDifalParaExcel } from '../../utils/difalExcelExporter';
import { formatarNumeroBr, parseNumeroBr } from './calculadoraHelpers';
import { DifalMemoriaModal, SimulacaoHistorico } from './DifalMemoriaModal';

export function DifalCearaCalculator() {
  // 1. Estados dos 4 campos essenciais
  const [valorOperacao, setValorOperacao] = useState<number>(10000);
  const [valorOperacaoStr, setValorOperacaoStr] = useState<string>('10.000,00');

  const [ufOrigem, setUfOrigem] = useState<string>('SP');
  const [aliquotaInter, setAliquotaInter] = useState<number>(7);
  const [aliquotaInterStr, setAliquotaInterStr] = useState<string>('7,00');

  const [icmsOrigem, setIcmsOrigem] = useState<number>(700);
  const [icmsOrigemStr, setIcmsOrigemStr] = useState<string>('700,00');
  const [editouIcmsOrigemManualmente, setEditouIcmsOrigemManualmente] = useState<boolean>(false);

  const [aliquotaIntra, setAliquotaIntra] = useState<number>(20);
  const [aliquotaIntraStr, setAliquotaIntraStr] = useState<string>('20,00');

  // 2. Controles, feedback e modais
  const [historicoSimulacoes, setHistoricoSimulacoes] = useState<SimulacaoHistorico[]>([]);
  const [janelaMemoriaAberta, setJanelaMemoriaAberta] = useState<boolean>(false);
  const [simulacaoVisualizadaId, setSimulacaoVisualizadaId] = useState<string>('atual');
  const [feedbackCalculado, setFeedbackCalculado] = useState<boolean>(false);
  const [feedbackLimpo, setFeedbackLimpo] = useState<boolean>(false);
  const [statusXml, setStatusXml] = useState<string | null>(null);
  const [itensXmlLote, setItensXmlLote] = useState<ParametrosDifalItem[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 3. Handlers dos campos
  const handleValorOperacaoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    setValorOperacaoStr(valStr);
    const num = parseNumeroBr(valStr);
    setValorOperacao(num);

    if (!editouIcmsOrigemManualmente) {
      const novoIcms = Number(((num * aliquotaInter) / 100).toFixed(2));
      setIcmsOrigem(novoIcms);
      setIcmsOrigemStr(formatarNumeroBr(novoIcms));
    }
  };

  const handleValorOperacaoBlur = () => {
    if (!valorOperacaoStr.trim()) {
      setValorOperacao(0);
      setValorOperacaoStr('');
      return;
    }
    const num = parseNumeroBr(valorOperacaoStr);
    setValorOperacao(num);
    setValorOperacaoStr(formatarNumeroBr(num));
  };

  const handleAliquotaInterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    setAliquotaInterStr(valStr);
    const num = parseNumeroBr(valStr);
    setAliquotaInter(num);

    if (!editouIcmsOrigemManualmente) {
      const novoIcms = Number(((valorOperacao * num) / 100).toFixed(2));
      setIcmsOrigem(novoIcms);
      setIcmsOrigemStr(formatarNumeroBr(novoIcms));
    }
  };

  const handleAliquotaInterBlur = () => {
    if (!aliquotaInterStr.trim()) {
      setAliquotaInter(0);
      setAliquotaInterStr('');
      return;
    }
    const num = parseNumeroBr(aliquotaInterStr);
    setAliquotaInter(num);
    setAliquotaInterStr(formatarNumeroBr(num, 2));
  };

  const selecionarAliquotaRapida = (novaAliq: number) => {
    setAliquotaInter(novaAliq);
    setAliquotaInterStr(formatarNumeroBr(novaAliq, 2));
    if (!editouIcmsOrigemManualmente) {
      const novoIcms = Number(((valorOperacao * novaAliq) / 100).toFixed(2));
      setIcmsOrigem(novoIcms);
      setIcmsOrigemStr(formatarNumeroBr(novoIcms));
    }
  };

  const handleIcmsOrigemChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    setIcmsOrigemStr(valStr);
    const num = parseNumeroBr(valStr);
    setIcmsOrigem(num);
    setEditouIcmsOrigemManualmente(true);
  };

  const handleIcmsOrigemBlur = () => {
    if (!icmsOrigemStr.trim()) {
      setIcmsOrigem(0);
      setIcmsOrigemStr('');
      return;
    }
    const num = parseNumeroBr(icmsOrigemStr);
    setIcmsOrigem(num);
    setIcmsOrigemStr(formatarNumeroBr(num));
  };

  const redefinirIcmsOrigemAutomatico = () => {
    setEditouIcmsOrigemManualmente(false);
    const calculado = Number(((valorOperacao * aliquotaInter) / 100).toFixed(2));
    setIcmsOrigem(calculado);
    setIcmsOrigemStr(formatarNumeroBr(calculado));
  };

  const handleAliquotaIntraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    setAliquotaIntraStr(valStr);
    const num = parseNumeroBr(valStr);
    setAliquotaIntra(num);
  };

  const handleAliquotaIntraBlur = () => {
    const num = parseNumeroBr(aliquotaIntraStr);
    setAliquotaIntra(num || 20);
    setAliquotaIntraStr(formatarNumeroBr(num || 20, 2));
  };

  // 4. Motor de Cálculo SEFAZ-CE
  const parametroAtual: ParametrosDifalItem = useMemo(() => ({
    id: 'item_atual',
    descricao: 'Operação Interestadual',
    valorOperacao: valorOperacao,
    valorProdutos: valorOperacao,
    icmsOrigemManual: icmsOrigem,
    ufOrigem: ufOrigem,
    aliquotaInter: aliquotaInter,
    aliquotaIntra: aliquotaIntra
  }), [valorOperacao, icmsOrigem, ufOrigem, aliquotaInter, aliquotaIntra]);

  const resultadoAtual: ResultadoDifalItem = useMemo(() => {
    return calcularDifalCeara(parametroAtual);
  }, [parametroAtual]);

  const resultadoLote: ResultadoDifalLote = useMemo(() => {
    if (itensXmlLote && itensXmlLote.length > 0) {
      return calcularDifalCearaLote(itensXmlLote);
    }
    return calcularDifalCearaLote([parametroAtual]);
  }, [itensXmlLote, parametroAtual]);

  const handleExecutarCalculo = () => {
    const novoResultado = calcularDifalCeara(parametroAtual);
    const agora = new Date();
    const novaSimulacao: SimulacaoHistorico = {
      id: `sim_${Date.now()}`,
      dataHora: `${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
      descricao: `Operação ${ufOrigem} ➔ CE (${formatarMoeda(valorOperacao)})`,
      ufOrigem: ufOrigem,
      resultado: novoResultado
    };

    setHistoricoSimulacoes(prev => [novaSimulacao, ...prev.slice(0, 19)]);
    setFeedbackCalculado(true);
    setTimeout(() => setFeedbackCalculado(false), 2000);
  };

  const handleLimpar = () => {
    setValorOperacao(0);
    setValorOperacaoStr('');
    setUfOrigem('SP');
    setAliquotaInter(0);
    setAliquotaInterStr('');
    setIcmsOrigem(0);
    setIcmsOrigemStr('');
    setEditouIcmsOrigemManualmente(false);
    setAliquotaIntra(20);
    setAliquotaIntraStr('20,00');
    setStatusXml(null);
    setItensXmlLote(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setFeedbackLimpo(true);
    setTimeout(() => setFeedbackLimpo(false), 1500);
  };

  // 5. Importação de XML NF-e
  const handleImportarXml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const xmlText = event.target?.result as string;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
          setStatusXml('Erro: Arquivo XML inválido ou corrompido.');
          return;
        }

        const enderEmit = xmlDoc.getElementsByTagName('enderEmit')[0];
        const ufEmit = enderEmit?.getElementsByTagName('UF')[0]?.textContent?.trim() || 'SP';

        const detElements = xmlDoc.getElementsByTagName('det');
        if (detElements.length === 0) {
          setStatusXml('Aviso: Nenhuma tag <det> encontrada no XML.');
          return;
        }

        let somaTotalProdutos = 0;
        let somaTotalIcmsOrigem = 0;
        let aliqInterDetectada = 0;
        const loteExtraido: ParametrosDifalItem[] = [];

        for (let i = 0; i < detElements.length; i++) {
          const det = detElements[i];
          const prod = det.getElementsByTagName('prod')[0];
          const imposto = det.getElementsByTagName('imposto')[0];

          const vProd = parseFloat(prod?.getElementsByTagName('vProd')[0]?.textContent || '0');
          const pICMSTag = imposto?.getElementsByTagName('pICMS')[0];
          const vICMSTag = imposto?.getElementsByTagName('vICMS')[0];

          let pICMS = parseFloat(pICMSTag?.textContent || '0');
          let vICMS = parseFloat(vICMSTag?.textContent || '0');

          if (pICMS <= 0) {
            const ufEncontrada = LISTA_UFS.find(u => u.sigla === ufEmit);
            pICMS = ufEncontrada?.aliquotaInterPadrao || 12;
          }
          if (vICMS <= 0 && pICMS > 0 && vProd > 0) {
            vICMS = (vProd * pICMS) / 100;
          }

          if (aliqInterDetectada === 0) {
            aliqInterDetectada = pICMS;
          }

          somaTotalProdutos += vProd;
          somaTotalIcmsOrigem += vICMS;

          loteExtraido.push({
            id: `xml_item_${i}`,
            descricao: `Item ${i + 1}`,
            valorOperacao: vProd,
            valorProdutos: vProd,
            icmsOrigemManual: vICMS,
            ufOrigem: ufEmit,
            aliquotaInter: pICMS,
            aliquotaIntra: 20
          });
        }

        if (somaTotalProdutos > 0) {
          const valOp = Number(somaTotalProdutos.toFixed(2));
          const valIcms = Number(somaTotalIcmsOrigem.toFixed(2));
          const aliq = aliqInterDetectada || 7;

          setValorOperacao(valOp);
          setValorOperacaoStr(formatarNumeroBr(valOp));
          setUfOrigem(ufEmit);
          setAliquotaInter(aliq);
          setAliquotaInterStr(formatarNumeroBr(aliq, 2));
          setIcmsOrigem(valIcms);
          setIcmsOrigemStr(formatarNumeroBr(valIcms));
          setEditouIcmsOrigemManualmente(true);
          setItensXmlLote(loteExtraido);

          setStatusXml(`Sucesso: XML importado! ${loteExtraido.length} itens consolidados.`);
        } else {
          setStatusXml('Aviso: Nenhum produto com valor válido foi encontrado no XML.');
        }
      } catch (err: any) {
        setStatusXml(`Erro ao processar XML: ${err.message || 'Arquivo incompatível.'}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* 1. Barra superior: Título discreto + Ações */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#04243b] text-[#e4b35e] flex items-center justify-center shrink-0">
            <Scale className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#04243b] tracking-tight">
              Calculadora de ICMS DIFAL – Ceará
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml"
            onChange={handleImportarXml}
            className="hidden"
            id="xml-upload-input"
          />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#04243b] text-[#e4b35e] hover:bg-[#031d30] border border-[#e4b35e]/30 shadow-xs transition-all cursor-pointer"
            title="Importar XML NF-e"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Importar XML</span>
          </button>

          <button
            onClick={() => exportarDifalParaExcel(resultadoLote)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 shadow-xs transition-all cursor-pointer"
            title="Exportar planilha Excel"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={handleLimpar}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 border border-slate-200 transition-all cursor-pointer shadow-xs"
            title="Limpar formulário"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${feedbackLimpo ? 'animate-spin text-rose-600' : ''}`} />
            <span>{feedbackLimpo ? 'Limpo!' : 'Limpar'}</span>
          </button>
        </div>
      </div>

      {/* Alerta de Feedback XML */}
      {statusXml && (
        <div className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 animate-fadeIn ${
          statusXml.startsWith('Erro') 
            ? 'bg-rose-50 text-rose-800 border border-rose-200' 
            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
        }`}>
          <Info className="h-4 w-4 shrink-0" />
          <span>{statusXml}</span>
        </div>
      )}

      {/* 2. Card Principal Unificado */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        
        {/* Parâmetros de Entrada */}
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* 1. Valor da Operação */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Valor da Operação (R$) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">
                  R$
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valorOperacaoStr}
                  onChange={handleValorOperacaoChange}
                  onBlur={handleValorOperacaoBlur}
                  placeholder="0,00"
                  className="w-full pl-10 pr-4 py-2.5 text-sm font-black text-[#04243b] bg-slate-50/50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#e4b35e] focus:border-[#04243b] focus:bg-white outline-none transition-all font-mono"
                />
              </div>
            </div>

            {/* 2. Alíquota Interestadual */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Alíquota Interestadual (%)
              </label>

              <div className="space-y-1.5">
                <div className="relative">
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

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => selecionarAliquotaRapida(4)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                      aliquotaInter === 4 
                        ? 'bg-[#04243b] text-[#e4b35e] border-[#04243b]' 
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    4%
                  </button>
                  <button
                    type="button"
                    onClick={() => selecionarAliquotaRapida(7)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                      aliquotaInter === 7 
                        ? 'bg-[#04243b] text-[#e4b35e] border-[#04243b]' 
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    7%
                  </button>
                  <button
                    type="button"
                    onClick={() => selecionarAliquotaRapida(12)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                      aliquotaInter === 12 
                        ? 'bg-[#04243b] text-[#e4b35e] border-[#04243b]' 
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    12%
                  </button>
                </div>
              </div>
            </div>

            {/* 3. ICMS de Origem */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800">
                  ICMS de Origem (R$)
                </label>
                {editouIcmsOrigemManualmente && (
                  <button
                    type="button"
                    onClick={redefinirIcmsOrigemAutomatico}
                    className="text-[10px] font-semibold text-amber-700 hover:underline flex items-center gap-1 cursor-pointer"
                    title="Voltar ao cálculo automático"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    <span>Redefinir</span>
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">
                  R$
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={icmsOrigemStr}
                  onChange={handleIcmsOrigemChange}
                  onBlur={handleIcmsOrigemBlur}
                  placeholder="0,00"
                  className="w-full pl-10 pr-4 py-2.5 text-sm font-bold text-slate-800 bg-slate-50/50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#e4b35e] focus:border-[#04243b] focus:bg-white outline-none transition-all font-mono"
                />
              </div>
            </div>

            {/* 4. Alíquota Interna */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Alíquota Interna (%)
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

          </div>

          {/* Botão Principal de Cálculo */}
          <button
            type="button"
            onClick={handleExecutarCalculo}
            className="w-full py-3 px-6 rounded-xl font-black text-sm tracking-wide bg-[#e4b35e] text-[#04243b] hover:bg-[#d9a54e] active:scale-[0.99] shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {feedbackCalculado ? (
              <>
                <Check className="h-4.5 w-4.5 text-[#04243b]" />
                <span>Cálculo Realizado!</span>
              </>
            ) : (
              <>
                <Calculator className="h-4.5 w-4.5 text-[#04243b]" />
                <span>Calcular ICMS DIFAL</span>
              </>
            )}
          </button>
        </div>

        {/* Resultado Objetivo */}
        <div className="bg-[#04243b] text-white p-6 border-t border-[#e4b35e]/30 space-y-4">
          
          {/* Destaque Principal: Valor do DIFAL */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#e4b35e] block">
                Total do DIFAL a Recolher (Ceará)
              </span>
              <span className="text-xs text-slate-300 font-medium">
                Carga Efetiva: <strong className="text-white">{formatarPercentual(resultadoAtual.aliquotaEfetivaCeara)}</strong>
              </span>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-3xl sm:text-4xl font-black text-[#e4b35e] font-mono tracking-tight block">
                {formatarMoeda(resultadoAtual.totalDifalGeral)}
              </span>
            </div>
          </div>

          {/* Síntese Técnica */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-[#031d30] p-3 rounded-xl border border-white/10">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                Base Ceará ("Por Dentro")
              </span>
              <span className="text-sm font-black text-white mt-0.5 block font-mono">
                {formatarMoeda(resultadoAtual.baseCalculoDestino)}
              </span>
            </div>

            <div className="bg-[#031d30] p-3 rounded-xl border border-white/10">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                ICMS Destino ({resultadoAtual.item.aliquotaIntra}%)
              </span>
              <span className="text-sm font-black text-white mt-0.5 block font-mono">
                {formatarMoeda(resultadoAtual.icmsDestinoTotal)}
              </span>
            </div>
          </div>

          {/* Botão para ver Memória Auditável */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setSimulacaoVisualizadaId('atual');
                setJanelaMemoriaAberta(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs bg-white/10 text-slate-200 hover:bg-white/15 hover:text-white transition-all cursor-pointer"
            >
              <FileText className="h-3.5 w-3.5 text-[#e4b35e]" />
              <span>Visualizar Memória de Cálculo Auditável (Legislação SEFAZ-CE)</span>
            </button>
          </div>

        </div>

      </div>

      {/* Modal de Memória Auditável */}
      <DifalMemoriaModal
        isOpen={janelaMemoriaAberta}
        onClose={() => setJanelaMemoriaAberta(false)}
        resultadoAtual={resultadoAtual}
        historicoSimulacoes={historicoSimulacoes}
        simulacaoVisualizadaId={simulacaoVisualizadaId}
        setSimulacaoVisualizadaId={setSimulacaoVisualizadaId}
        ufOrigem={ufOrigem}
      />
    </div>
  );
}
