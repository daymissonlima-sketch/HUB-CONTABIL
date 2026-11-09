import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Upload,
  Scale,
  CheckCircle2,
  AlertCircle,
  X,
  RotateCcw,
  SlidersHorizontal,
  Database,
  Plus,
  Trash2,
  Pencil,
  Layers,
  Info,
  FileSpreadsheet
} from 'lucide-react';
import {
  ParametrosImpactoReforma,
  NotaFiscalImpactoInfo,
  ProdutoImpactoItem,
  RegraFiscalNcm,
  RegimePisCofins
} from '../types_reforma';
import {
  DEFAULT_PARAMETROS_IMPACTO,
  CATEGORIAS_IS_CATALOG,
  DEFAULT_CATALOGO_FISCAL_NCM,
  loadCatalogoFiscalNcm,
  saveCatalogoFiscalNcm,
  calcularImpactoProdutos,
  parseNfeXmlParaImpacto,
  safeNum
} from '../services/impactoProdutosService';

const fmtBRL = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

const fmtNum = (val: number, decimals = 0) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(val || 0);

/**
 * Converte entradas de texto em formato monetário brasileiro para número (ex: "R$ 65.650,50" -> 65650.50)
 */
function parseCurrencyInput(raw: string): number {
  if (!raw) return 0;
  const clean = raw.replace(/[^\d,.-]/g, '');
  if (!clean) return 0;
  if (clean.includes(',')) {
    const withoutDots = clean.replace(/\./g, '');
    const standardized = withoutDots.replace(',', '.');
    const n = parseFloat(standardized);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  const n = parseFloat(clean);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * Componente reutilizável para inputs que exibem valores no formato padrão R$ 0.000,00
 */
interface CurrencyInputProps {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
}

const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  className = '',
  placeholder = 'R$ 0,00',
  disabled = false,
  title
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [rawText, setRawText] = useState('');

  useEffect(() => {
    if (!isFocused) {
      setRawText(fmtBRL(value));
    }
  }, [value, isFocused]);

  return (
    <input
      type="text"
      disabled={disabled}
      title={title}
      placeholder={placeholder}
      value={isFocused ? rawText : fmtBRL(value)}
      onFocus={() => {
        setIsFocused(true);
        setRawText(value > 0 ? value.toFixed(2).replace('.', ',') : '');
      }}
      onChange={(e) => {
        setRawText(e.target.value);
        const parsed = parseCurrencyInput(e.target.value);
        onChange(parsed);
      }}
      onBlur={() => {
        setIsFocused(false);
        const parsed = parseCurrencyInput(rawText);
        onChange(parsed);
      }}
      className={className}
    />
  );
};

export const SimuladorImpactoProdutos: React.FC = () => {
  const [params, setParams] = useState<ParametrosImpactoReforma>(DEFAULT_PARAMETROS_IMPACTO);
  const [catalogoNcm, setCatalogoNcm] = useState<RegraFiscalNcm[]>(() => loadCatalogoFiscalNcm());
  // Tabela inicial vazia (sem dados de exemplo)
  const [produtos, setProdutos] = useState<ProdutoImpactoItem[]>([]);
  const [notaInfo, setNotaInfo] = useState<NotaFiscalImpactoInfo | null>(null);
  const [erroMensagem, setErroMensagem] = useState<string | null>(null);
  const [sucessoMensagem, setSucessoMensagem] = useState<string | null>(null);

  // Modais: Inspeção/Ajuste do Item e Cadastro Fiscal NCM
  const [itemSelecionado, setItemSelecionado] = useState<ProdutoImpactoItem | null>(null);
  const [modalNcmOpen, setModalNcmOpen] = useState(false);

  // Estado para Edição / Criação de Regra no Cadastro Fiscal NCM
  const [regraNcmEmEdicao, setRegraNcmEmEdicao] = useState<RegraFiscalNcm | null>(null);
  const [novaRegra, setNovaRegra] = useState<Partial<RegraFiscalNcm>>({
    prefixoNcm: '',
    descricao: '',
    categoriaId: 'nao_incidente',
    modalidade: 'nao_incidente',
    aliqIs: 0,
    isValorFixo: 0,
    fracaoVarejo: 0,
    fatorConversaoMaco: 1,
    aliqIpiAdVal: 0,
    ipiValorFixo: 0
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resultado = useMemo(
    () => calcularImpactoProdutos(produtos, params),
    [produtos, params]
  );

  // Encontra resultado em tempo real do item selecionado para o modal de ajuste/memória
  const resultadoItemSelecionado = useMemo(() => {
    if (!itemSelecionado) return null;
    return resultado.itens.find((r) => r.item.id === itemSelecionado.id) || null;
  }, [resultado, itemSelecionado]);

  // Atualiza parâmetros globais
  const handleParamChange = (field: keyof ParametrosImpactoReforma, rawValue: string) => {
    if (field === 'regimePisCofins') {
      setParams((prev) => ({
        ...prev,
        regimePisCofins: rawValue as RegimePisCofins
      }));
      return;
    }
    const numValue = parseFloat(rawValue);
    const val = Number.isFinite(numValue) ? Math.max(0, numValue) : 0;
    setParams((prev) => ({
      ...prev,
      [field]: val
    }));
  };

  // Edição rápida de IPI inline na tabela
  const handleQuickIpiChange = (id: string, numVal: number) => {
    const val = Math.max(0, numVal);
    setProdutos((prev) =>
      prev.map((item) => (item.id === id ? { ...item, vIpi: val } : item))
    );
  };

  // Edição rápida da Quantidade Convertida na tabela
  const handleQuickQtdConvertidaChange = (id: string, rawValue: string) => {
    const novaQtdConv = Math.max(0, safeNum(rawValue));
    setProdutos((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const fator = item.quantidade > 0 ? novaQtdConv / item.quantidade : 1;
          return { ...item, fatorConversao: fator };
        }
        return item;
      })
    );
  };

  // Limpa completamente os dados da tela e reinicia o estado
  const handleLimparDados = () => {
    setProdutos([]);
    setNotaInfo(null);
    setParams(DEFAULT_PARAMETROS_IMPACTO);
    setItemSelecionado(null);
    setErroMensagem(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setSucessoMensagem('Todos os dados foram limpos com sucesso. O simulador está pronto para uma nova importação.');
  };

  // Salva alterações feitas no Modal "Ajustar / Ver Cálculo"
  const handleSaveItemAjustes = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemSelecionado) return;
    setProdutos((prev) =>
      prev.map((p) => (p.id === itemSelecionado.id ? { ...itemSelecionado } : p))
    );
    setItemSelecionado(null);
    setSucessoMensagem(`Parâmetros e tributos do item "${itemSelecionado.descricao}" atualizados.`);
  };

  // Trata troca de categoria no modal de ajuste (aplica parâmetros polimórficos instantaneamente)
  const handleItemCategoriaChange = (novaCategoriaId: string) => {
    if (!itemSelecionado) return;
    const config = CATEGORIAS_IS_CATALOG[novaCategoriaId] || CATEGORIAS_IS_CATALOG.nao_incidente;

    setItemSelecionado({
      ...itemSelecionado,
      categoriaId: config.id,
      modalidadeIs: config.modalidade,
      aliqIs: config.aliqIsPadrao,
      isValorFixo: config.isValorFixoPadrao,
      fracaoVarejo: config.fracaoVarejoPadrao,
      fatorConversao: config.fatorConversaoPadrao,
      precoVarejoUnitario: config.id === 'cigarros' ? (itemSelecionado.precoVarejoUnitario || 9.00) : 0
    });
  };

  // Prepara edição de uma regra existente no Cadastro Fiscal NCM
  const handleStartEditRegraNcm = (regra: RegraFiscalNcm) => {
    setRegraNcmEmEdicao({ ...regra });
  };

  // Salva alteração de uma regra existente no Cadastro Fiscal NCM
  const handleSaveEditRegraNcm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regraNcmEmEdicao) return;
    const cleanPrefix = (regraNcmEmEdicao.prefixoNcm || '').replace(/\D/g, '');
    if (!cleanPrefix) {
      setErroMensagem('Informe um prefixo NCM numérico válido.');
      return;
    }

    const config = CATEGORIAS_IS_CATALOG[regraNcmEmEdicao.categoriaId || 'nao_incidente'];
    const regraAtualizada: RegraFiscalNcm = {
      ...regraNcmEmEdicao,
      prefixoNcm: cleanPrefix,
      modalidade: config.modalidade
    };

    const novoCatalogo = catalogoNcm.map((r) =>
      r.id === regraAtualizada.id ? regraAtualizada : r
    );

    setCatalogoNcm(novoCatalogo);
    saveCatalogoFiscalNcm(novoCatalogo);

    // Sincroniza os produtos carregados que utilizam esse prefixo
    setProdutos((prev) =>
      prev.map((item) => {
        const itemCleanNcm = item.ncm.replace(/\D/g, '');
        if (itemCleanNcm.startsWith(cleanPrefix)) {
          return {
            ...item,
            categoriaId: regraAtualizada.categoriaId,
            modalidadeIs: regraAtualizada.modalidade,
            aliqIs: regraAtualizada.aliqIs,
            isValorFixo: regraAtualizada.isValorFixo,
            fracaoVarejo: regraAtualizada.fracaoVarejo,
            fatorConversao: regraAtualizada.fatorConversaoMaco
          };
        }
        return item;
      })
    );

    setRegraNcmEmEdicao(null);
    setSucessoMensagem(`Regra NCM ${cleanPrefix} alterada com sucesso.`);
  };

  // Salva nova regra no Cadastro Fiscal NCM
  const handleAddRegraNcm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPrefix = (novaRegra.prefixoNcm || '').replace(/\D/g, '');
    if (!cleanPrefix) {
      setErroMensagem('Informe um prefixo NCM numérico válido.');
      return;
    }

    const config = CATEGORIAS_IS_CATALOG[novaRegra.categoriaId || 'nao_incidente'];
    const regraCompleta: RegraFiscalNcm = {
      id: `regra_${cleanPrefix}_${Date.now()}`,
      prefixoNcm: cleanPrefix,
      descricao: novaRegra.descricao || config.nome,
      categoriaId: config.id,
      modalidade: config.modalidade,
      aliqIs: safeNum(novaRegra.aliqIs, config.aliqIsPadrao),
      isValorFixo: safeNum(novaRegra.isValorFixo, config.isValorFixoPadrao),
      fracaoVarejo: safeNum(novaRegra.fracaoVarejo, config.fracaoVarejoPadrao),
      fatorConversaoMaco: safeNum(novaRegra.fatorConversaoMaco, config.fatorConversaoPadrao),
      aliqIpiAdVal: safeNum(novaRegra.aliqIpiAdVal, 0),
      ipiValorFixo: safeNum(novaRegra.ipiValorFixo, 0)
    };

    const novoCatalogo = [regraCompleta, ...catalogoNcm.filter((r) => r.prefixoNcm !== cleanPrefix)];
    setCatalogoNcm(novoCatalogo);
    saveCatalogoFiscalNcm(novoCatalogo);

    setNovaRegra({
      prefixoNcm: '',
      descricao: '',
      categoriaId: 'nao_incidente',
      modalidade: 'nao_incidente',
      aliqIs: 0,
      isValorFixo: 0,
      fracaoVarejo: 0,
      fatorConversaoMaco: 1,
      aliqIpiAdVal: 0,
      ipiValorFixo: 0
    });

    setSucessoMensagem(`Regra NCM ${cleanPrefix} cadastrada com sucesso.`);
  };

  const handleDeleteRegraNcm = (id: string) => {
    const novoCatalogo = catalogoNcm.filter((r) => r.id !== id);
    setCatalogoNcm(novoCatalogo);
    saveCatalogoFiscalNcm(novoCatalogo);
  };

  // Leitura do XML da NF-e
  const processXmlFile = (file: File) => {
    setErroMensagem(null);
    setSucessoMensagem(null);

    if (!file.name.toLowerCase().endsWith('.xml')) {
      setErroMensagem('Selecione um arquivo XML de NF-e (.xml) válido.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = String(e.target?.result || '');
        const { nota, produtos: itensExtraidos } = parseNfeXmlParaImpacto(
          content,
          params,
          catalogoNcm
        );
        setNotaInfo(nota);
        setProdutos(itensExtraidos);
        setSucessoMensagem(
          `NF-e nº ${nota.numeroNf} importada com sucesso (${itensExtraidos.length} produtos classificados).`
        );
      } catch (err: any) {
        setErroMensagem(err?.message || 'Erro ao processar o XML da NF-e.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processXmlFile(file);
    }
  };

  const aliqDualTotal = params.aliqCbs + params.aliqIbs;

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* =====================================================================
          NÍVEL 1: HEADER PRINCIPAL ELEGANTE E DESAFOGADO (NAVY CARD)
      ===================================================================== */}
      <header className="bg-[#04243b] text-white px-6 py-4 rounded-2xl shadow-md border border-[#e4b35e]/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#e4b35e]/15 border border-[#e4b35e]/40 flex items-center justify-center shrink-0 shadow-inner">
            <Scale className="h-5 w-5 text-[#e4b35e]" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <span>Simulador de Transição Tributária</span>
              <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#e4b35e]/20 text-[#e4b35e] border border-[#e4b35e]/30">
                EC 132/23 & LC 214/24
              </span>
            </h1>
            <p className="text-xs text-slate-300 font-medium mt-0.5">
              Confronto do Regime Vigente (Hoje) com o IVA Dual (CBS/IBS) e Imposto Seletivo (2027)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setRegraNcmEmEdicao(null);
              setModalNcmOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-[#e4b35e] border border-slate-700 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Database className="h-4 w-4" />
            <span>Cadastro Fiscal NCM</span>
          </button>

          <button
            type="button"
            onClick={handleLimparDados}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            title="Limpar todos os dados e reiniciar o simulador"
          >
            <RotateCcw className="h-4 w-4 text-slate-400" />
            <span>Limpar / Restaurar</span>
          </button>
        </div>
      </header>

      {/* =====================================================================
          NÍVEL 2: BARRA DE CONTROLE DEDICADA, ESPAÇOSA E DESPOLUÍDA
      ===================================================================== */}
      <div className="bg-white border border-slate-200 shadow-sm p-4 sm:p-5 rounded-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          {/* Seção A: Importação XML & Status da NF-e */}
          <div className="lg:col-span-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#04243b] hover:bg-[#063354] text-white font-bold rounded-xl text-xs shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <Upload className="h-4 w-4 text-[#e4b35e]" />
              <span>Importar NF-e (XML)</span>
            </button>

            {/* Badge de status da NF-e */}
            <div className="flex-1 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs min-h-[42px] flex items-center">
              {notaInfo ? (
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-bold text-[#04243b]">NF-e {notaInfo.numeroNf}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-600 truncate max-w-[170px]" title={notaInfo.emitenteNome}>
                    {notaInfo.emitenteNome}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="font-mono text-emerald-700 font-bold">
                    {fmtBRL(notaInfo.valorTotalNf)}
                  </span>
                </div>
              ) : (
                <span className="text-slate-400 text-[11px] font-medium">
                  Aguardando importação de arquivo XML (.xml) para iniciar a análise.
                </span>
              )}
            </div>
          </div>

          {/* Seção B: Regime PIS/COFINS (Créditos na Entrada) */}
          <div className="lg:col-span-4">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Regime PIS/COFINS (Créditos na Entrada)
            </label>
            <div className="relative">
              <select
                value={params.regimePisCofins}
                onChange={(e) => handleParamChange('regimePisCofins', e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#04243b] cursor-pointer"
              >
                <option value="nao_cumulativo">
                  Não Cumulativo (PIS 1,65% / COFINS 7,60% — Com Crédito)
                </option>
                <option value="cumulativo">
                  Cumulativo (PIS 0,65% / COFINS 3,00% — Sem Crédito)
                </option>
              </select>
            </div>
          </div>

          {/* Seção C: Parâmetros Globais 2027 (CBS & IBS) */}
          <div className="lg:col-span-3">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Parâmetros IVA Dual 2027
            </label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5">
              <div className="flex items-center gap-1.5 flex-1">
                <span className="text-[11px] font-semibold text-slate-500">CBS:</span>
                <input
                  type="number"
                  step="0.01"
                  value={params.aliqCbs}
                  onChange={(e) => handleParamChange('aliqCbs', e.target.value)}
                  className="w-14 bg-white border border-slate-200 rounded px-1.5 py-1 text-right font-mono font-bold text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-[#04243b]"
                />
                <span className="text-slate-400 text-xs">%</span>
              </div>

              <div className="h-4 w-px bg-slate-300" />

              <div className="flex items-center gap-1.5 flex-1">
                <span className="text-[11px] font-semibold text-slate-500">IBS:</span>
                <input
                  type="number"
                  step="0.01"
                  value={params.aliqIbs}
                  onChange={(e) => handleParamChange('aliqIbs', e.target.value)}
                  className="w-14 bg-white border border-slate-200 rounded px-1.5 py-1 text-right font-mono font-bold text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-[#04243b]"
                />
                <span className="text-slate-400 text-xs">%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alertas de Feedback */}
      {erroMensagem && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{erroMensagem}</span>
          </div>
          <button
            onClick={() => setErroMensagem(null)}
            className="text-rose-400 hover:text-rose-700 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {sucessoMensagem && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{sucessoMensagem}</span>
          </div>
          <button
            onClick={() => setSucessoMensagem(null)}
            className="text-emerald-400 hover:text-emerald-700 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          NÍVEL 3: CONFRONTO CONSOLIDADO DE TOTAIS DA OPERAÇÃO (VIGENTE × 2027)
          (COM ICMS MANTIDO NA TRANSIÇÃO DE 2027 E SEM O CAMPO DE CRÉDITO ESTIMADO NO VIGENTE)
      ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#04243b]" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Confronto Consolidado de Totais da Operação
            </span>
          </div>
          <span className="text-[11px] font-medium text-slate-500">
            {resultado.itens.length} {resultado.itens.length === 1 ? 'item analisado' : 'itens analisados'}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Coluna Esquerda: Regime Vigente (Hoje) - Dados Objetivos do DANFE sem Crédito Estimado */}
          <div className="p-5">
            <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-slate-200">
              <h3 className="text-sm font-bold text-slate-800">Regime Vigente (Hoje)</h3>
              <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                PIS/COFINS {resultado.isCumulativo ? 'Cumulativo' : 'Não Cumulativo'}
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100">
                <span className="text-slate-500">Valor Bruto dos Produtos</span>
                <span className="font-mono font-semibold text-slate-800">{fmtBRL(resultado.vrProd)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100">
                <span className="text-slate-500">(-) Descontos Incondicionais</span>
                <span className="font-mono font-semibold text-slate-600">- {fmtBRL(resultado.vDesc)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100">
                <span className="text-slate-500">(+) IPI Destacado no DANFE</span>
                <span className="font-mono font-semibold text-slate-800">{fmtBRL(resultado.vIpi)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100">
                <span className="text-slate-500">(+) ICMS-ST (Substituição Tributária)</span>
                <span className="font-mono font-semibold text-slate-800">{fmtBRL(resultado.icmsSt)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100">
                <span className="text-slate-500">(+) FECOP Estadual</span>
                <span className="font-mono font-semibold text-slate-800">{fmtBRL(resultado.fecop)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100">
                <span className="text-slate-500">PIS e COFINS Informados no DANFE</span>
                <span className="font-mono font-semibold text-slate-700">
                  {fmtBRL(resultado.pis + resultado.cofins)}
                </span>
              </div>

              {/* Bloco de Desembolso Financeiro DANFE limpo e direto */}
              <div className="mt-4 pt-3.5 border-t-2 border-slate-200 bg-slate-50 px-3.5 py-3 rounded-xl">
                <div className="flex justify-between items-center text-sm font-bold text-slate-900">
                  <span>Desembolso Financeiro DANFE</span>
                  <span className="font-mono text-base">{fmtBRL(resultado.desembolsoAtual)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Reforma Tributária (2027) — Mantendo ICMS Vigente */}
          <div className="p-5 bg-slate-50/30">
            <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-[#04243b]">
              <h3 className="text-sm font-bold text-[#04243b]">Reforma Tributária (2027)</h3>
              <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-[#e4b35e]/50 font-mono">
                CBS + IBS ({aliqDualTotal.toFixed(2).replace('.', ',')}%) + ICMS Vigente
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                <span className="text-slate-500">
                  Preço Base Líquido (s/ PIS, COFINS e IPI extintos)
                </span>
                <span className="font-mono font-semibold text-slate-800">
                  {fmtBRL(resultado.precoLiquido)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                <span className="text-slate-700 font-bold">
                  (+) ICMS Próprio (Vigente na Transição 2027)
                </span>
                <span className="font-mono font-bold text-[#04243b]">
                  {fmtBRL(resultado.icmsProprio)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                <span className="text-slate-700 font-medium">(+) Imposto Seletivo Projetado (IS)</span>
                <span className="font-mono font-bold text-amber-800">{fmtBRL(resultado.isTotal)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                <span className="text-slate-500">(+) ICMS-ST (Transição)</span>
                <span className="font-mono font-semibold text-slate-800">{fmtBRL(resultado.icmsSt)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                <span className="text-slate-500">(+) FECOP (Transição)</span>
                <span className="font-mono font-semibold text-slate-800">{fmtBRL(resultado.fecop)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                <span className="text-slate-500">(+) CBS + IBS na Entrada</span>
                <span className="font-mono font-semibold text-[#04243b]">
                  {fmtBRL(resultado.cbsIbsTotal)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                <span className="text-slate-500">(-) Crédito CBS / IBS Apropriável</span>
                <span className="font-mono font-semibold text-emerald-700">
                  - {fmtBRL(resultado.cbsIbsTotal)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                <span className="text-slate-500">(-) Crédito ICMS Próprio (Transição)</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {resultado.isCumulativo ? 'R$ 0,00 (Cumulativo)' : `- ${fmtBRL(resultado.creditoIcmsRefTotal)}`}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Base de Cálculo CBS + IBS (Líquido + IS)</span>
                <span className="font-mono font-semibold text-slate-700">
                  {fmtBRL(resultado.baseCbsIbs)}
                </span>
              </div>

              <div className="mt-3 pt-3 border-t-2 border-[#04243b]/20 bg-[#04243b]/5 px-3.5 py-2.5 rounded-xl space-y-1.5">
                <div className="flex justify-between items-center text-sm font-bold text-rose-700">
                  <span>Desembolso de Compra Projetado 2027</span>
                  <span className="font-mono text-base">{fmtBRL(resultado.desembolso2027)}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-semibold text-[#04243b]">
                  <span>Custo Efetivo Líquido (Após Créditos CBS/IBS e ICMS)</span>
                  <span className="font-mono font-bold">{fmtBRL(resultado.custoLiquidoRef)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Barra de Variação Financeira */}
        <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-bold">
          <span className="text-slate-700">
            Variação no Desembolso Financeiro (2027 vs Vigente):
          </span>
          <div className="flex items-center gap-4">
            <span
              className={`font-mono text-sm ${
                resultado.deltaDesembolso >= 0 ? 'text-rose-700' : 'text-emerald-700'
              }`}
            >
              {resultado.deltaDesembolso >= 0 ? '+' : ''}
              {fmtBRL(resultado.deltaDesembolso)} ({resultado.deltaDesembolso >= 0 ? '+' : ''}
              {resultado.deltaDesembolsoPercent.toFixed(2)}%)
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          NÍVEL 4: TABELA DETALHADA E ESPAÇOSA DE PRODUTOS
          (SEM COLUNA GÊNERO, COM COLUNA QUANTIDADE CONVERTIDA E VALORES EM R$ 0.000,00)
      ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Detalhamento por Item da Nota Fiscal
          </span>
          <span className="text-[11px] text-slate-500">
            {produtos.length > 0
              ? 'Todos os valores em padrão monetário R$ 0.000,00'
              : 'Nenhum produto cadastrado'}
          </span>
        </div>

        {produtos.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3 border border-slate-200">
              <FileSpreadsheet className="h-7 w-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">Tabela Vazia — Nenhum Produto Importado</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              Clique no botão <strong>Importar NF-e (XML)</strong> acima para carregar sua nota fiscal eletrônica e realizar a simulação automática.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#04243b] hover:bg-[#063354] text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
            >
              <Upload className="h-4 w-4 text-[#e4b35e]" />
              <span>Importar Arquivo XML da NF-e</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#04243b] text-white select-none text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3.5 font-bold">Item / Descrição</th>
                  <th className="py-3 px-2 font-bold">NCM</th>
                  <th className="py-3 px-2 text-right font-bold">Qtd / Un</th>
                  <th className="py-3 px-2.5 text-right font-bold text-[#e4b35e]">Qtd Convertida</th>
                  <th className="py-3 px-2.5 text-right font-bold">Valor Líquido</th>
                  <th className="py-3 px-2.5 text-right font-bold text-[#e4b35e]">IPI Dest.</th>
                  <th className="py-3 px-2 text-right font-bold">ICMS-ST</th>
                  <th className="py-3 px-2 text-right font-bold">FECOP</th>
                  <th className="py-3 px-2.5 text-right font-bold text-[#e4b35e]">IS Projetado</th>
                  <th className="py-3 px-2.5 text-right font-bold text-[#e4b35e]">CBS + IBS</th>
                  <th className="py-3 px-2.5 text-right font-bold">Desemb. Atual</th>
                  <th className="py-3 px-2.5 text-right font-bold">Desemb. 2027</th>
                  <th className="py-3 px-3.5 text-center font-bold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {resultado.itens.map((row, idx) => {
                  const { item } = row;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/90 transition-colors">
                      {/* Item / Descrição */}
                      <td className="py-3 px-3.5 max-w-[220px]">
                        <div className="font-bold text-slate-900 truncate" title={item.descricao}>
                          {idx + 1}. {item.descricao}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {item.quantidade} {item.unidade} • Unit: {fmtBRL(item.valorUnitario)}
                        </span>
                      </td>

                      {/* NCM */}
                      <td className="py-3 px-2 font-mono text-[11px] text-slate-600">
                        {item.ncm || '-'}
                      </td>

                      {/* Qtd / Unidade */}
                      <td className="py-3 px-2 text-right font-mono whitespace-nowrap">
                        {fmtNum(item.quantidade)} {item.unidade}
                      </td>

                      {/* Quantidade Convertida (Nova coluna substituindo gênero) */}
                      <td className="py-2 px-2.5 text-right whitespace-nowrap">
                        <input
                          type="number"
                          step="1"
                          value={Math.round(row.qtdConvertida)}
                          onChange={(e) => handleQuickQtdConvertidaChange(item.id, e.target.value)}
                          className="w-24 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-right font-mono font-bold text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-[#04243b]"
                          title="Quantidade convertida para unidades tributáveis (ex: carteiras/maços)"
                        />
                      </td>

                      {/* Valor Líquido (R$ 0.000,00) */}
                      <td className="py-3 px-2.5 text-right font-mono whitespace-nowrap">
                        {fmtBRL(row.valorLiquidoProdutos)}
                      </td>

                      {/* IPI Destacado (Editável com máscara R$ 0.000,00) */}
                      <td className="py-2 px-2.5 text-right whitespace-nowrap">
                        <CurrencyInput
                          value={item.vIpi}
                          onChange={(val) => handleQuickIpiChange(item.id, val)}
                          className="w-28 bg-amber-50/60 border border-[#e4b35e]/60 rounded-lg px-2 py-1 text-right font-mono font-bold text-[#04243b] text-xs focus:outline-none focus:ring-1 focus:ring-[#04243b]"
                          title="Ajuste manual de IPI deste item caso o DANFE tenha omitido"
                        />
                      </td>

                      {/* ICMS-ST */}
                      <td className="py-3 px-2 text-right font-mono whitespace-nowrap text-slate-600">
                        {fmtBRL(item.icmsSt)}
                      </td>

                      {/* FECOP */}
                      <td className="py-3 px-2 text-right font-mono whitespace-nowrap text-slate-600">
                        {fmtBRL(item.fecop)}
                      </td>

                      {/* IS Projetado */}
                      <td
                        className={`py-3 px-2.5 text-right font-mono font-bold whitespace-nowrap ${
                          row.isTotal > 0
                            ? 'text-amber-800 bg-amber-50/40'
                            : 'text-slate-400 bg-slate-50/50'
                        }`}
                      >
                        {fmtBRL(row.isTotal)}
                      </td>

                      {/* CBS + IBS */}
                      <td className="py-3 px-2.5 text-right font-mono font-semibold text-[#04243b] whitespace-nowrap">
                        {fmtBRL(row.cbsIbsTotal)}
                      </td>

                      {/* Desembolso Atual */}
                      <td className="py-3 px-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {fmtBRL(row.desembolsoAtual)}
                      </td>

                      {/* Desembolso 2027 (Com ICMS mantido) */}
                      <td className="py-3 px-2.5 text-right font-mono font-bold text-rose-700 bg-rose-50/30 whitespace-nowrap">
                        {fmtBRL(row.desembolso2027)}
                      </td>

                      {/* Ações: Ajustar / Ver Cálculo */}
                      <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setItemSelecionado({ ...item })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#04243b] hover:bg-[#063354] text-white font-bold text-xs transition-colors shadow-2xs cursor-pointer"
                          title="Inspecionar e ajustar regras, alíquotas e memória de cálculo"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5 text-[#e4b35e]" />
                          <span>Ajustar / Ver Cálculo</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                <tr>
                  <td colSpan={3} className="py-3.5 px-3.5 uppercase text-[11px]">
                    Totais Consolidados ({resultado.itens.length} itens)
                  </td>
                  <td className="py-3.5 px-2.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                    {fmtNum(resultado.itens.reduce((acc, r) => acc + r.qtdConvertida, 0))}
                  </td>
                  <td className="py-3.5 px-2.5 text-right font-mono whitespace-nowrap">
                    {fmtBRL(resultado.valorLiquidoProdutos)}
                  </td>
                  <td className="py-3.5 px-2.5 text-right font-mono text-[#04243b] whitespace-nowrap">
                    {fmtBRL(resultado.vIpi)}
                  </td>
                  <td className="py-3.5 px-2 text-right font-mono whitespace-nowrap">
                    {fmtBRL(resultado.icmsSt)}
                  </td>
                  <td className="py-3 px-2 text-right font-mono whitespace-nowrap">
                    {fmtBRL(resultado.fecop)}
                  </td>
                  <td className="py-3.5 px-2.5 text-right font-mono text-amber-800 bg-amber-100/40 whitespace-nowrap">
                    {fmtBRL(resultado.isTotal)}
                  </td>
                  <td className="py-3.5 px-2.5 text-right font-mono text-[#04243b] whitespace-nowrap">
                    {fmtBRL(resultado.cbsIbsTotal)}
                  </td>
                  <td className="py-3.5 px-2.5 text-right font-mono whitespace-nowrap">
                    {fmtBRL(resultado.desembolsoAtual)}
                  </td>
                  <td className="py-3.5 px-2.5 text-right font-mono text-rose-700 bg-rose-100/40 whitespace-nowrap">
                    {fmtBRL(resultado.desembolso2027)}
                  </td>
                  <td className="py-3.5 px-3.5 text-center">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* =====================================================================
          MODAL: INSPECIONAR E AJUSTAR REGRAS DO ITEM & MEMÓRIA AUDITÁVEL
          (TODOS OS CAMPOS DE VALOR PREENCHIDOS COM MÁSCARA R$ 0.000,00)
      ===================================================================== */}
      {itemSelecionado && resultadoItemSelecionado && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setItemSelecionado(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho do Modal */}
            <div className="px-6 py-4 bg-[#04243b] text-white flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#e4b35e]/15 border border-[#e4b35e]/40 flex items-center justify-center">
                  <SlidersHorizontal className="h-4 w-4 text-[#e4b35e]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Inspecionar e Ajustar Regras — {itemSelecionado.descricao}
                  </h3>
                  <span className="text-[11px] text-slate-300 font-mono">
                    NCM: {itemSelecionado.ncm || 'Não informado'} • Qtd: {itemSelecionado.quantidade} {itemSelecionado.unidade}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setItemSelecionado(null)}
                className="text-slate-300 hover:text-white cursor-pointer p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItemAjustes} className="p-6 space-y-5 text-xs">
              {/* 1. Classificação Polimórfica de Imposto Seletivo */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold uppercase tracking-wider text-[#04243b] text-[11px]">
                    1. Gênero / Categoria de Imposto Seletivo & Quantidade Convertida
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Modalidade Atual:{' '}
                    <strong className="text-slate-800 uppercase">
                      {itemSelecionado.modalidadeIs}
                    </strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Categoria do Produto:
                    </label>
                    <select
                      value={itemSelecionado.categoriaId}
                      onChange={(e) => handleItemCategoriaChange(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#04243b] cursor-pointer"
                    >
                      {Object.values(CATEGORIAS_IS_CATALOG).map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Fator de Transformação
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={itemSelecionado.fatorConversao}
                      onChange={(e) =>
                        setItemSelecionado({
                          ...itemSelecionado,
                          fatorConversao: Math.max(1, safeNum(e.target.value, 1))
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-800 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Quantidade Convertida Total
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={Math.round(itemSelecionado.quantidade * (itemSelecionado.fatorConversao || 1))}
                      onChange={(e) => {
                        const novaQtd = Math.max(0, safeNum(e.target.value));
                        const novoFator = itemSelecionado.quantidade > 0 ? novaQtd / itemSelecionado.quantidade : 1;
                        setItemSelecionado({ ...itemSelecionado, fatorConversao: novoFator });
                      }}
                      className="w-full bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-800 text-xs"
                    />
                  </div>

                  {/* Campos dinâmicos conforme modalidade */}
                  {itemSelecionado.modalidadeIs === 'ad_valorem' && (
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">
                        Alíquota IS Ad Valorem (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={itemSelecionado.aliqIs}
                        onChange={(e) =>
                          setItemSelecionado({
                            ...itemSelecionado,
                            aliqIs: safeNum(e.target.value)
                          })
                        }
                        className="w-full sm:w-48 bg-white border border-amber-300 rounded-xl px-3 py-2 font-mono font-bold text-amber-900 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  )}

                  {itemSelecionado.modalidadeIs === 'misto' && (
                    <>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">
                          Preço de Varejo por Maço
                        </label>
                        <CurrencyInput
                          value={itemSelecionado.precoVarejoUnitario}
                          onChange={(val) =>
                            setItemSelecionado({
                              ...itemSelecionado,
                              precoVarejoUnitario: val
                            })
                          }
                          className="w-full bg-white border border-[#e4b35e] rounded-xl px-3 py-2 font-mono font-bold text-[#04243b] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">
                          Alíquota Ad Val. IS ({itemSelecionado.fracaoVarejo}% Base Varejo)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={itemSelecionado.aliqIs}
                          onChange={(e) =>
                            setItemSelecionado({
                              ...itemSelecionado,
                              aliqIs: safeNum(e.target.value)
                            })
                          }
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-800 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">
                          Valor Fixo IS por Maço
                        </label>
                        <CurrencyInput
                          value={itemSelecionado.isValorFixo}
                          onChange={(val) =>
                            setItemSelecionado({
                              ...itemSelecionado,
                              isValorFixo: val
                            })
                          }
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-800 text-xs"
                        />
                      </div>
                    </>
                  )}

                  {itemSelecionado.modalidadeIs === 'nao_incidente' && (
                    <div className="sm:col-span-3 bg-slate-100 border border-slate-200 rounded-xl p-3 flex items-center gap-2 text-slate-600 text-[11px]">
                      <Info className="h-4 w-4 text-slate-400 shrink-0" />
                      <span>
                        Este produto é classificado como <strong>Não Incidente</strong>. Alíquota de IS = 0,00% e valor = R$ 0,00.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Ajuste Manual de Tributos do DANFE (Todos com formatação R$ 0.000,00) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold uppercase tracking-wider text-slate-700 text-[11px]">
                    2. VALORES E TRIBUTOS DA NOTA FISCAL (DANFE)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Ajuste manualmente o IPI se o DANFE estiver errado ou omitido
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      VALOR PRODUTOS (R$)
                    </label>
                    <CurrencyInput
                      value={itemSelecionado.valorProdutos}
                      onChange={(val) =>
                        setItemSelecionado({
                          ...itemSelecionado,
                          valorProdutos: val
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      DESCONTO (R$)
                    </label>
                    <CurrencyInput
                      value={itemSelecionado.valorDesconto}
                      onChange={(val) =>
                        setItemSelecionado({
                          ...itemSelecionado,
                          valorDesconto: val
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-amber-800 mb-1">
                      IPI DESTACADO / CORRIGIDO (R$)
                    </label>
                    <CurrencyInput
                      value={itemSelecionado.vIpi}
                      onChange={(val) =>
                        setItemSelecionado({
                          ...itemSelecionado,
                          vIpi: val
                        })
                      }
                      className="w-full bg-amber-50 border-2 border-[#e4b35e] rounded-lg px-2.5 py-1.5 font-mono font-bold text-[#04243b]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      ICMS-ST (R$)
                    </label>
                    <CurrencyInput
                      value={itemSelecionado.icmsSt}
                      onChange={(val) =>
                        setItemSelecionado({
                          ...itemSelecionado,
                          icmsSt: val
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      FECOP ESTADUAL (R$)
                    </label>
                    <CurrencyInput
                      value={itemSelecionado.fecop}
                      onChange={(val) =>
                        setItemSelecionado({
                          ...itemSelecionado,
                          fecop: val
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      ICMS PRÓPRIO (R$)
                    </label>
                    <CurrencyInput
                      value={itemSelecionado.icmsProprio}
                      onChange={(val) =>
                        setItemSelecionado({
                          ...itemSelecionado,
                          icmsProprio: val
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      PIS (R$)
                    </label>
                    <CurrencyInput
                      value={itemSelecionado.pis}
                      onChange={(val) =>
                        setItemSelecionado({
                          ...itemSelecionado,
                          pis: val
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      COFINS (R$)
                    </label>
                    <CurrencyInput
                      value={itemSelecionado.cofins}
                      onChange={(val) =>
                        setItemSelecionado({
                          ...itemSelecionado,
                          cofins: val
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Traço Matemático Completo para Auditoria */}
              <div className="bg-slate-100 p-4 rounded-xl border border-slate-300 space-y-2.5">
                <span className="font-bold uppercase tracking-wider text-[#04243b] text-[11px] block">
                  3. Traço Matemático Auditável (Cálculo em Tempo Real)
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-700">
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Regime Vigente
                    </span>
                    <div className="flex justify-between">
                      <span>Valor Líquido Prod.:</span>
                      <strong className="font-mono">{fmtBRL(resultadoItemSelecionado.valorLiquidoProdutos)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Desembolso Atual:</span>
                      <strong className="font-mono text-slate-900">{fmtBRL(resultadoItemSelecionado.desembolsoAtual)}</strong>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-[#04243b] block">
                      Reforma Tributária (2027 com ICMS)
                    </span>
                    <div className="flex justify-between">
                      <span>Preço Líquido (s/ tributos extintos):</span>
                      <strong className="font-mono">{fmtBRL(resultadoItemSelecionado.precoLiquido)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-800 font-bold">ICMS Próprio (Transição 2027):</span>
                      <strong className="font-mono text-[#04243b]">{fmtBRL(resultadoItemSelecionado.item.icmsProprio)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Imposto Seletivo (IS):</span>
                      <strong className="font-mono text-amber-800">{fmtBRL(resultadoItemSelecionado.isTotal)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Base CBS/IBS (Líquido + IS):</span>
                      <strong className="font-mono">{fmtBRL(resultadoItemSelecionado.baseCbsIbs)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>CBS + IBS ({aliqDualTotal.toFixed(2)}%):</span>
                      <strong className="font-mono text-[#04243b]">{fmtBRL(resultadoItemSelecionado.cbsIbsTotal)}</strong>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-100 font-bold">
                      <span className="text-rose-700">Desembolso Projetado 2027:</span>
                      <strong className="font-mono text-rose-700">{fmtBRL(resultadoItemSelecionado.desembolso2027)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setItemSelecionado(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#04243b] hover:bg-[#063354] text-white font-bold shadow-xs cursor-pointer"
                >
                  Salvar Ajustes no Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: CADASTRO FISCAL DE PRODUTOS / NCM (COM EDIÇÃO COMPLETA)
      ===================================================================== */}
      {modalNcmOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => {
            setModalNcmOpen(false);
            setRegraNcmEmEdicao(null);
          }}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-[#04243b] text-white flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <Database className="h-4 w-4 text-[#e4b35e]" />
                <div>
                  <h3 className="text-sm font-bold">Cadastro Fiscal NCM (Lista Positiva de Imposto Seletivo)</h3>
                  <span className="text-[11px] text-slate-300">
                    Cadastre ou edite as alíquotas de IS, IPI e fatores de transformação de cada NCM
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalNcmOpen(false);
                  setRegraNcmEmEdicao(null);
                }}
                className="text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              {/* Formulário de Edição da Regra Selecionada */}
              {regraNcmEmEdicao ? (
                <form
                  onSubmit={handleSaveEditRegraNcm}
                  className="bg-amber-50/80 border-2 border-[#e4b35e] rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                    <div className="flex items-center gap-2">
                      <Pencil className="h-4 w-4 text-[#04243b]" />
                      <span className="font-bold uppercase text-[#04243b] text-[11px]">
                        Editando Regra Fiscal NCM: {regraNcmEmEdicao.prefixoNcm}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRegraNcmEmEdicao(null)}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer text-xs font-semibold"
                    >
                      Cancelar Edição
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                        Prefixo NCM
                      </label>
                      <input
                        type="text"
                        required
                        value={regraNcmEmEdicao.prefixoNcm}
                        onChange={(e) =>
                          setRegraNcmEmEdicao({ ...regraNcmEmEdicao, prefixoNcm: e.target.value })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-[#04243b]"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                        Descrição / Nome do Produto
                      </label>
                      <input
                        type="text"
                        required
                        value={regraNcmEmEdicao.descricao}
                        onChange={(e) =>
                          setRegraNcmEmEdicao({ ...regraNcmEmEdicao, descricao: e.target.value })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                        Categoria de Incidência IS
                      </label>
                      <select
                        value={regraNcmEmEdicao.categoriaId}
                        onChange={(e) => {
                          const catId = e.target.value;
                          const config = CATEGORIAS_IS_CATALOG[catId];
                          setRegraNcmEmEdicao({
                            ...regraNcmEmEdicao,
                            categoriaId: catId,
                            modalidade: config.modalidade,
                            aliqIs: config.aliqIsPadrao,
                            isValorFixo: config.isValorFixoPadrao,
                            fracaoVarejo: config.fracaoVarejoPadrao,
                            fatorConversaoMaco: config.fatorConversaoPadrao
                          });
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800"
                      >
                        {Object.values(CATEGORIAS_IS_CATALOG).map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.nome}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">
                        Alíquota IS Ad Val. (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={regraNcmEmEdicao.aliqIs}
                        onChange={(e) =>
                          setRegraNcmEmEdicao({
                            ...regraNcmEmEdicao,
                            aliqIs: safeNum(e.target.value)
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-amber-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">
                        Valor Fixo IS / Unid. (R$)
                      </label>
                      <CurrencyInput
                        value={regraNcmEmEdicao.isValorFixo}
                        onChange={(val) =>
                          setRegraNcmEmEdicao({
                            ...regraNcmEmEdicao,
                            isValorFixo: val
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-amber-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                        Fator de Transformação
                      </label>
                      <input
                        type="number"
                        step="1"
                        value={regraNcmEmEdicao.fatorConversaoMaco}
                        onChange={(e) =>
                          setRegraNcmEmEdicao({
                            ...regraNcmEmEdicao,
                            fatorConversaoMaco: Math.max(1, safeNum(e.target.value, 1))
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                        Fração Varejo (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={regraNcmEmEdicao.fracaoVarejo}
                        onChange={(e) =>
                          setRegraNcmEmEdicao({
                            ...regraNcmEmEdicao,
                            fracaoVarejo: safeNum(e.target.value)
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setRegraNcmEmEdicao(null)}
                      className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-[#04243b] text-white font-bold cursor-pointer"
                    >
                      Salvar Alterações no NCM
                    </button>
                  </div>
                </form>
              ) : (
                /* Formulário para Cadastrar Novo Prefixo NCM */
                <form onSubmit={handleAddRegraNcm} className="bg-slate-50 border border-slate-300 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Plus className="h-4 w-4 text-[#04243b]" />
                    <span className="font-bold uppercase text-[#04243b] text-[11px]">
                      Cadastrar Novo Prefixo NCM na Lista Positiva
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                        Prefixo NCM (apenas números)
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: 2202, 2203, 8703..."
                        value={novaRegra.prefixoNcm}
                        onChange={(e) => setNovaRegra({ ...novaRegra, prefixoNcm: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-[#04243b]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                        Descrição / Nome do Produto
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Bebidas isotônicas"
                        value={novaRegra.descricao}
                        onChange={(e) => setNovaRegra({ ...novaRegra, descricao: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                        Categoria de Incidência IS
                      </label>
                      <select
                        value={novaRegra.categoriaId}
                        onChange={(e) => {
                          const catId = e.target.value;
                          const config = CATEGORIAS_IS_CATALOG[catId];
                          setNovaRegra({
                            ...novaRegra,
                            categoriaId: catId,
                            modalidade: config.modalidade,
                            aliqIs: config.aliqIsPadrao,
                            isValorFixo: config.isValorFixoPadrao,
                            fracaoVarejo: config.fracaoVarejoPadrao,
                            fatorConversaoMaco: config.fatorConversaoPadrao
                          });
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800"
                      >
                        {Object.values(CATEGORIAS_IS_CATALOG).map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#04243b] hover:bg-[#063354] text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
                    >
                      Adicionar ao Catálogo
                    </button>
                  </div>
                </form>
              )}

              {/* Tabela de Prefixos NCM Configurados com Botão de Edição */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
                    <tr>
                      <th className="py-2.5 px-3">Prefixo NCM</th>
                      <th className="py-2.5 px-3">Descrição da Regra</th>
                      <th className="py-2.5 px-3">Categoria</th>
                      <th className="py-2.5 px-3 text-right">Alíquota IS</th>
                      <th className="py-2.5 px-3 text-right">Fator Transf.</th>
                      <th className="py-2.5 px-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {catalogoNcm.map((regra) => {
                      const cat = CATEGORIAS_IS_CATALOG[regra.categoriaId] || CATEGORIAS_IS_CATALOG.nao_incidente;
                      return (
                        <tr key={regra.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-bold text-[#04243b]">
                            {regra.prefixoNcm}*
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">
                            {regra.descricao}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 font-medium">
                            {cat.nome.split('(')[0].trim()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-900">
                            {regra.modalidade === 'misto'
                              ? `Misto (${regra.aliqIs}% + ${fmtBRL(regra.isValorFixo)})`
                              : `${regra.aliqIs.toFixed(1)}%`}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                            {regra.fatorConversaoMaco}x
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartEditRegraNcm(regra)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-[#e4b35e]/25 text-slate-700 hover:text-[#04243b] border border-slate-200 cursor-pointer"
                                title="Editar campos desta regra NCM"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {catalogoNcm.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRegraNcm(regra.id)}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer"
                                  title="Excluir regra"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
