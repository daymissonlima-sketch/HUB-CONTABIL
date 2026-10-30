import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2,
  RefreshCw,
  Search,
  CheckCircle,
  AlertCircle,
  Clock,
  Play,
  X,
  Filter,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  Download,
  Info,
  Edit3,
  Clipboard,
  ExternalLink,
  Plus,
  Trash2,
  Check,
  Sparkles,
  HelpCircle,
  FileText
} from 'lucide-react';
import { Company, IbsCbsEventoFuturo } from '../types_debits';
import {
  fetchCnpjSafe,
  parseCnpjResponseData,
  isCaepf,
  isValidCNPJ,
  parsePortalSimplesText,
  API_AVAILABLE_FIELDS_CATALOG,
  API_UNAVAILABLE_FIELDS
} from '../utils/cnpjHelper';
import { loadStoredCompanies, saveStoredCompanies, COMPANIES_UPDATED_EVENT } from '../utils/companyStorage';
import * as XLSX from 'xlsx-js-style';

interface BatchProgress {
  current: number;
  total: number;
  success: number;
  errors: number;
  currentName?: string;
}

interface BatchItemStatus {
  id: string;
  cnpj: string;
  razaoSocial: string;
  status: 'waiting' | 'updating' | 'success' | 'error';
  message?: string;
}

export const OpcaoSimplesNacional: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'simples' | 'nao_simples' | 'excluidos' | 'mei' | 'ibs_cbs_regular'>('all');

  // Batch update state
  const [isUpdatingBatch, setIsUpdatingBatch] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchItemsStatus, setBatchItemsStatus] = useState<BatchItemStatus[]>([]);
  const [batchFinished, setBatchFinished] = useState(false);

  // Single update
  const [updatingSingleId, setUpdatingSingleId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ msg: string; isError?: boolean } | null>(null);

  // IBS/CBS 2027 future events state
  const [selectedCompanyForIbs, setSelectedCompanyForIbs] = useState<Company | null>(null);
  const [showIbsModal, setShowIbsModal] = useState(false);
  const [ibsEventsDraft, setIbsEventsDraft] = useState<IbsCbsEventoFuturo[]>([]);

  // API fields modal
  const [showApiFieldsModal, setShowApiFieldsModal] = useState(false);

  // Paste portal modal
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteTargetCompanyId, setPasteTargetCompanyId] = useState<string>('');
  const [pastePortalText, setPastePortalText] = useState('');

  // Batch IBS configuration modal
  const [showBatchIbsModal, setShowBatchIbsModal] = useState(false);

  // Corporate data
  const officeName = localStorage.getItem('cfg_office_name') || 'Moreira & Lima Contadores Associados';
  const officeCnpj = localStorage.getItem('cfg_office_cnpj') || '12.345.678/0001-90';

  const showFeedback = (msg: string, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 6000);
  };

  const loadCompanies = () => {
    const list = loadStoredCompanies();
    setCompanies(list);
  };

  useEffect(() => {
    loadCompanies();

    const handleStorageUpdate = () => {
      loadCompanies();
    };
    window.addEventListener(COMPANIES_UPDATED_EVENT, handleStorageUpdate);
    return () => window.removeEventListener(COMPANIES_UPDATED_EVENT, handleStorageUpdate);
  }, []);

  const saveToStorage = (list: Company[]) => {
    const saved = saveStoredCompanies(list);
    setCompanies(saved);
  };

  const formatCNPJ = (val: string) => {
    const clean = val.replace(/\D/g, '');
    if (clean.length <= 2) return clean;
    if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`;
    if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
    if (clean.length <= 12) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`;
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
  };

  // Atualizar única empresa via API
  const handleUpdateSingle = async (company: Company) => {
    const cleanCnpj = company.cnpj.replace(/\D/g, '');

    if (isCaepf(company.cnpj)) {
      showFeedback(`O documento ${company.cnpj} é um CAEPF / Pessoa Física (Produtor Rural). Não possui cadastro no webservice de CNPJ da Receita Federal (permanece tributação Pessoa Física / Presumido).`);
      return;
    }

    if (cleanCnpj.length !== 14 || !isValidCNPJ(cleanCnpj)) {
      showFeedback('CNPJ inválido para consulta na API.', true);
      return;
    }

    setUpdatingSingleId(company.id);
    try {
      const raw = await fetchCnpjSafe(cleanCnpj);
      const parsed = parseCnpjResponseData(raw);

      const hasApiIbsEvents = parsed.eventosFuturosIbsCbs && parsed.eventosFuturosIbsCbs.length > 0;

      const updated = companies.map(c => {
        if (c.id === company.id) {
          return {
            ...c,
            razaoSocial: parsed.razaoSocial || c.razaoSocial,
            regimeTributario: parsed.opcaoSimples ? 'SIMPLES_NACIONAL' as const : (c.regimeTributario === 'SIMPLES_NACIONAL' ? 'LUCRO_PRESUMIDO' as const : c.regimeTributario),
            opcaoSimples: parsed.opcaoSimples,
            dataOpcaoSimples: parsed.dataOpcaoSimples,
            dataExclusaoSimples: parsed.dataExclusaoSimples,
            motivoExclusaoSimples: parsed.motivoExclusaoSimples || (parsed.dataExclusaoSimples ? 'Ato Administrativo / Desenquadramento RFB' : ''),
            opcaoMei: parsed.opcaoMei,
            situacaoCadastral: parsed.situacaoCadastral || c.situacaoCadastral,
            // Regra de faturamento: mantida estritamente
            vendaVistaPercent: c.vendaVistaPercent,
            vendaPrazoPercent: c.vendaPrazoPercent,
            // Preserva ou atualiza Eventos Futuros IBS/CBS
            eventosFuturosIbsCbs: hasApiIbsEvents ? parsed.eventosFuturosIbsCbs : (c.eventosFuturosIbsCbs || [])
          };
        }
        return c;
      });

      saveToStorage(updated);

      if (hasApiIbsEvents) {
        showFeedback(`Opção pelo Simples Nacional e Eventos Futuros IBS/CBS de ${parsed.razaoSocial || company.razaoSocial} atualizados via API!`);
      } else {
        showFeedback(`Opção Simples Nacional atualizada via API da Receita Federal. Nota: A API pública não fornece a tabela de Eventos Futuros IBS/CBS para 2027 (recurso exclusivo do Portal web).`);
      }
    } catch (err: any) {
      console.error(err);
      showFeedback(err.message || 'Erro ao consultar CNPJ na API pública.', true);
    } finally {
      setUpdatingSingleId(null);
    }
  };

  // Consulta em lote via Modal
  const handleOpenBatchModal = () => {
    if (companies.length === 0) {
      showFeedback('Nenhuma empresa na carteira para consultar.', true);
      return;
    }
    const initialList: BatchItemStatus[] = companies.map(c => ({
      id: c.id,
      cnpj: c.cnpj,
      razaoSocial: c.razaoSocial || c.cnpj,
      status: 'waiting',
      message: 'Aguardando consulta na RFB'
    }));
    setBatchItemsStatus(initialList);
    setBatchProgress(null);
    setBatchFinished(false);
    setShowBatchModal(true);
  };

  const startBatchUpdate = async () => {
    setIsUpdatingBatch(true);
    setBatchFinished(false);
    let successCount = 0;
    let errorCount = 0;
    const updatedCompanies = [...companies];

    for (let i = 0; i < updatedCompanies.length; i++) {
      const company = updatedCompanies[i];
      setBatchItemsStatus(prev => prev.map(item =>
        item.id === company.id ? { ...item, status: 'updating', message: 'Consultando API Simples Nacional / RFB...' } : item
      ));

      setBatchProgress({
        current: i + 1,
        total: updatedCompanies.length,
        success: successCount,
        errors: errorCount,
        currentName: company.razaoSocial || company.cnpj
      });

      const cleanCnpj = company.cnpj.replace(/\D/g, '');
      if (isCaepf(company.cnpj)) {
        successCount++;
        const msg = 'Pessoa Física / CAEPF (Produtor Rural) — Cadastro mantido';
        setBatchItemsStatus(prev => prev.map(item =>
          item.id === company.id ? { ...item, status: 'success', razaoSocial: company.razaoSocial, message: msg } : item
        ));
      } else if (cleanCnpj.length === 14 && isValidCNPJ(cleanCnpj)) {
        try {
          const raw = await fetchCnpjSafe(cleanCnpj);
          const parsed = parseCnpjResponseData(raw);

          const hasApiIbsEvents = parsed.eventosFuturosIbsCbs && parsed.eventosFuturosIbsCbs.length > 0;

          updatedCompanies[i] = {
            ...company,
            razaoSocial: parsed.razaoSocial || company.razaoSocial,
            regimeTributario: parsed.opcaoSimples ? 'SIMPLES_NACIONAL' : (company.regimeTributario === 'SIMPLES_NACIONAL' ? 'LUCRO_PRESUMIDO' : company.regimeTributario),
            opcaoSimples: parsed.opcaoSimples,
            dataOpcaoSimples: parsed.dataOpcaoSimples || company.dataOpcaoSimples,
            dataExclusaoSimples: parsed.dataExclusaoSimples || company.dataExclusaoSimples,
            motivoExclusaoSimples: parsed.motivoExclusaoSimples || company.motivoExclusaoSimples || (parsed.dataExclusaoSimples ? 'Ato Administrativo / Desenquadramento RFB' : ''),
            opcaoMei: parsed.opcaoMei ?? company.opcaoMei,
            situacaoCadastral: parsed.situacaoCadastral || company.situacaoCadastral,
            // Regra de faturamento: mantida estritamente
            vendaVistaPercent: company.vendaVistaPercent,
            vendaPrazoPercent: company.vendaPrazoPercent,
            // Preserva ou atualiza Eventos Futuros IBS/CBS
            eventosFuturosIbsCbs: hasApiIbsEvents ? parsed.eventosFuturosIbsCbs : (company.eventosFuturosIbsCbs || [])
          };
          successCount++;
          const msg = parsed.opcaoSimples
            ? `OPTANTE (Desde ${parsed.dataOpcaoSimples || 'N/D'})`
            : `NÃO OPTANTE${parsed.dataExclusaoSimples ? ` (Excluída em ${parsed.dataExclusaoSimples})` : ''}`;

          setBatchItemsStatus(prev => prev.map(item =>
            item.id === company.id ? { ...item, status: 'success', razaoSocial: parsed.razaoSocial || company.razaoSocial, message: msg } : item
          ));
        } catch (err: any) {
          console.error(`Erro ao atualizar ${company.cnpj}:`, err);
          errorCount++;
          setBatchItemsStatus(prev => prev.map(item =>
            item.id === company.id ? { ...item, status: 'error', message: err.message || 'Erro na consulta do CNPJ' } : item
          ));
        }
        await new Promise(resolve => setTimeout(resolve, 350));
      } else {
        errorCount++;
        setBatchItemsStatus(prev => prev.map(item =>
          item.id === company.id ? { ...item, status: 'error', message: 'CNPJ com formato inválido' } : item
        ));
      }

      setBatchProgress({
        current: i + 1,
        total: updatedCompanies.length,
        success: successCount,
        errors: errorCount,
        currentName: company.razaoSocial || company.cnpj
      });
    }

    saveToStorage(updatedCompanies);
    setIsUpdatingBatch(false);
    setBatchFinished(true);
    showFeedback(`Consulta em lote do Simples Nacional concluída! ${successCount} empresas atualizadas. (Aviso: APIs públicas não fornecem IBS/CBS 2027 automaticamente).`);
  };

  // Gerenciamento de IBS / CBS 2027
  const handleOpenIbsModal = (company: Company) => {
    setSelectedCompanyForIbs(company);
    setIbsEventsDraft(company.eventosFuturosIbsCbs ? [...company.eventosFuturosIbsCbs] : []);
    setShowIbsModal(true);
  };

  const handleApplyPresetIbsRegular = () => {
    setIbsEventsDraft([
      { regime: 'IBS', descricao: 'Opção pelo regime regular', dataEfeito: '01/01/2027' },
      { regime: 'CBS', descricao: 'Opção pelo regime regular', dataEfeito: '01/01/2027' }
    ]);
  };

  const handleApplyPresetNaoOptanteIbs = () => {
    setIbsEventsDraft([
      { regime: 'IBS', descricao: 'Não optante pelo regime regular (Tributação cumulativa no PGDAS-D)', dataEfeito: '01/01/2027' },
      { regime: 'CBS', descricao: 'Não optante pelo regime regular (Tributação cumulativa no PGDAS-D)', dataEfeito: '01/01/2027' }
    ]);
  };

  const handleClearIbsEvents = () => {
    setIbsEventsDraft([]);
  };

  const handleAddCustomIbsRow = () => {
    setIbsEventsDraft(prev => [
      ...prev,
      { regime: 'IBS', descricao: 'Opção pelo regime regular', dataEfeito: '01/01/2027' }
    ]);
  };

  const handleSaveIbsEvents = () => {
    if (!selectedCompanyForIbs) return;

    const updated = companies.map(c => {
      if (c.id === selectedCompanyForIbs.id) {
        return {
          ...c,
          eventosFuturosIbsCbs: ibsEventsDraft
        };
      }
      return c;
    });

    saveToStorage(updated);
    setShowIbsModal(false);
    showFeedback(`Eventos futuros de IBS/CBS 2027 atualizados para ${selectedCompanyForIbs.razaoSocial}!`);
  };

  // Aplicação em lote de IBS / CBS 2027 para todas as optantes
  const handleBatchApplyIbsRegular = (onlySimples: boolean) => {
    const updated = companies.map(c => {
      const isSimples = c.opcaoSimples === true || c.opcaoSimples === 'Sim' || c.regimeTributario === 'SIMPLES_NACIONAL';
      if (!onlySimples || isSimples) {
        return {
          ...c,
          eventosFuturosIbsCbs: [
            { regime: 'IBS', descricao: 'Opção pelo regime regular', dataEfeito: '01/01/2027' },
            { regime: 'CBS', descricao: 'Opção pelo regime regular', dataEfeito: '01/01/2027' }
          ]
        };
      }
      return c;
    });

    saveToStorage(updated);
    setShowBatchIbsModal(false);
    showFeedback(`Configuração de 'Opção pelo regime regular em 01/01/2027' aplicada em lote!`);
  };

  // Importar / Colar Comprovante do Portal
  const handleOpenPasteModal = (companyId?: string) => {
    setPasteTargetCompanyId(companyId || (companies[0]?.id || ''));
    setPastePortalText('');
    setShowPasteModal(true);
  };

  const handleProcessPastedText = () => {
    if (!pasteTargetCompanyId) {
      showFeedback('Selecione a empresa de destino.', true);
      return;
    }

    const parsed = parsePortalSimplesText(pastePortalText);
    const targetComp = companies.find(c => c.id === pasteTargetCompanyId);

    if (!targetComp) return;

    const updated = companies.map(c => {
      if (c.id === pasteTargetCompanyId) {
        return {
          ...c,
          eventosFuturosIbsCbs: parsed.eventosFuturosIbsCbs.length > 0
            ? parsed.eventosFuturosIbsCbs
            : (c.eventosFuturosIbsCbs || []),
          opcaoSimples: parsed.isSimples !== undefined ? parsed.isSimples : c.opcaoSimples,
          dataOpcaoSimples: parsed.dataOpcao || c.dataOpcaoSimples,
          dataExclusaoSimples: parsed.dataExclusao || c.dataExclusaoSimples,
          opcaoMei: parsed.isMei !== undefined ? parsed.isMei : c.opcaoMei
        };
      }
      return c;
    });

    saveToStorage(updated);
    setShowPasteModal(false);

    const countEvents = parsed.eventosFuturosIbsCbs.length;
    showFeedback(`Comprovante do Portal processado com sucesso para ${targetComp.razaoSocial}! (${countEvents} eventos IBS/CBS detectados).`);
  };

  // Filtragem
  const filteredCompanies = companies.filter(c => {
    const matchSearch = (c.razaoSocial || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (c.cnpj || '').replace(/\D/g, '').includes(searchTerm.replace(/\D/g, ''));
    if (!matchSearch) return false;

    const isSimplesOpt = c.opcaoSimples === true || c.opcaoSimples === 'Sim' || c.regimeTributario === 'SIMPLES_NACIONAL';
    const hasIbsRegular = Array.isArray(c.eventosFuturosIbsCbs) && c.eventosFuturosIbsCbs.some(ev => /regular/i.test(ev.descricao));

    if (filterMode === 'simples') return isSimplesOpt;
    if (filterMode === 'nao_simples') return !isSimplesOpt && !c.dataExclusaoSimples;
    if (filterMode === 'excluidos') return Boolean(c.dataExclusaoSimples);
    if (filterMode === 'mei') return Boolean(c.opcaoMei === true || c.opcaoMei === 'Sim');
    if (filterMode === 'ibs_cbs_regular') return hasIbsRegular;
    return true;
  });

  // Estatísticas
  const totalCount = companies.length;
  const optantesCount = companies.filter(c => c.opcaoSimples === true || c.opcaoSimples === 'Sim' || c.regimeTributario === 'SIMPLES_NACIONAL').length;
  const meiCount = companies.filter(c => c.opcaoMei === true || c.opcaoMei === 'Sim').length;
  const excluidosCount = companies.filter(c => Boolean(c.dataExclusaoSimples)).length;
  const ibsRegularCount = companies.filter(c => Array.isArray(c.eventosFuturosIbsCbs) && c.eventosFuturosIbsCbs.some(ev => /regular/i.test(ev.descricao))).length;

  // Exportação Excel formatada com estilo corporativo Moreira & Lima (XLSX-JS-STYLE)
  const handleExportExcel = () => {
    if (filteredCompanies.length === 0) {
      showFeedback('Nenhuma empresa disponível para exportar.', true);
      return;
    }

    const exportDate = `${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    const ws: any = {};
    let currentRow = 0;
    const merges: any[] = [];
    const rowHeights: any[] = [];
    const maxColIndex = 7; // Agora com coluna de Eventos Futuros IBS/CBS

    const getCellRef = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

    const writeCell = (r: number, c: number, val: any, type: 's' | 'n', style: any = {}, format: string = '') => {
      const ref = getCellRef(r, c);
      ws[ref] = { v: val, t: type, s: style };
      if (format) ws[ref].z = format;
    };

    // Estilos corporativos Moreira & Lima (#04243B azul marinho & #E4B35E dourado)
    const styleHeaderTitle = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 15, bold: true, color: { rgb: "E4B35E" } },
      alignment: { horizontal: "center", vertical: "center" }
    };
    const styleHeaderSub = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" }
    };
    const styleHeaderBannerBase = {
      fill: { fgColor: { rgb: "04243B" } }
    };

    const styleBarLeft = {
      fill: { fgColor: { rgb: "F8FAFC" } },
      font: { name: "Arial", sz: 10, color: { rgb: "334155" } },
      alignment: { horizontal: "left", vertical: "center", indent: 1 },
      border: {
        top: { style: "thin", color: { rgb: "E2E8F0" } },
        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
        left: { style: "thin", color: { rgb: "E2E8F0" } },
        right: { style: "thin", color: { rgb: "E2E8F0" } }
      }
    };
    const styleBarCenter = {
      fill: { fgColor: { rgb: "F8FAFC" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "04243B" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "E2E8F0" } },
        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
        left: { style: "thin", color: { rgb: "E2E8F0" } },
        right: { style: "thin", color: { rgb: "E2E8F0" } }
      }
    };
    const styleBarRight = {
      fill: { fgColor: { rgb: "F8FAFC" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "059669" } },
      alignment: { horizontal: "right", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "E2E8F0" } },
        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
        left: { style: "thin", color: { rgb: "E2E8F0" } },
        right: { style: "thin", color: { rgb: "E2E8F0" } }
      }
    };

    const styleTableHeaderCenter = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10.5, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "medium", color: { rgb: "04243B" } },
        bottom: { style: "medium", color: { rgb: "E4B35E" } }
      }
    };
    const styleTableHeaderLeft = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10.5, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "left", vertical: "center" },
      border: {
        top: { style: "medium", color: { rgb: "04243B" } },
        bottom: { style: "medium", color: { rgb: "E4B35E" } }
      }
    };

    const getRowStyle = (isEven: boolean, align: 'left' | 'center' | 'right', bold = false, color = "1E293B") => ({
      fill: { fgColor: { rgb: isEven ? "FFFFFF" : "F8FAFC" } },
      font: { name: "Arial", sz: 9.5, bold, color: { rgb: color } },
      alignment: { horizontal: align, vertical: "center" },
      border: {
        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
        left: { style: "thin", color: { rgb: "F1F5F9" } },
        right: { style: "thin", color: { rgb: "F1F5F9" } }
      }
    });

    // Row 0: Company Name Banner
    for (let c = 0; c <= maxColIndex; c++) {
      writeCell(currentRow, c, c === 0 ? `${officeName.toUpperCase()}` : '', 's', c === 0 ? styleHeaderTitle : styleHeaderBannerBase);
    }
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: maxColIndex } });
    rowHeights.push({ hpt: 28 });
    currentRow++;

    // Row 1: Subtitle Banner
    for (let c = 0; c <= maxColIndex; c++) {
      writeCell(currentRow, c, c === 0 ? 'AUDITORIA DE OPÇÃO PELO SIMPLES NACIONAL, MEI E EVENTOS FUTUROS IBS/CBS 2027' : '', 's', c === 0 ? styleHeaderSub : styleHeaderBannerBase);
    }
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: maxColIndex } });
    rowHeights.push({ hpt: 20 });
    currentRow++;

    // Row 2: Spacer
    rowHeights.push({ hpt: 10 });
    currentRow++;

    // Row 3: Summary Bar 1 (CNPJ & Date & Filter)
    writeCell(currentRow, 0, `CNPJ Escritório: ${officeCnpj}`, 's', styleBarLeft);
    writeCell(currentRow, 1, '', 's', styleBarLeft);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });

    writeCell(currentRow, 2, `Emitido em: ${exportDate}`, 's', styleBarCenter);
    writeCell(currentRow, 3, '', 's', styleBarCenter);
    merges.push({ s: { r: currentRow, c: 2 }, e: { r: currentRow, c: 3 } });

    writeCell(currentRow, 4, `Filtro: ${filterMode.toUpperCase()}`, 's', styleBarRight);
    writeCell(currentRow, 5, '', 's', styleBarRight);
    writeCell(currentRow, 6, '', 's', styleBarRight);
    writeCell(currentRow, 7, '', 's', styleBarRight);
    merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 7 } });
    rowHeights.push({ hpt: 22 });
    currentRow++;

    // Row 4: Summary Bar 2 (Counts)
    writeCell(currentRow, 0, `Total Listado: ${filteredCompanies.length}`, 's', styleBarLeft);
    writeCell(currentRow, 1, '', 's', styleBarLeft);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });

    writeCell(currentRow, 2, `Optantes Simples: ${optantesCount}`, 's', styleBarCenter);
    writeCell(currentRow, 3, '', 's', styleBarCenter);
    merges.push({ s: { r: currentRow, c: 2 }, e: { r: currentRow, c: 3 } });

    writeCell(currentRow, 4, `MEI: ${meiCount} | IBS/CBS Regular 2027: ${ibsRegularCount}`, 's', styleBarRight);
    writeCell(currentRow, 5, '', 's', styleBarRight);
    writeCell(currentRow, 6, '', 's', styleBarRight);
    writeCell(currentRow, 7, '', 's', styleBarRight);
    merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 7 } });
    rowHeights.push({ hpt: 22 });
    currentRow++;

    // Row 5: Spacer
    rowHeights.push({ hpt: 14 });
    currentRow++;

    // Row 6: Table Headers
    const headers = [
      'CNPJ',
      'Razão Social / Nome Empresarial',
      'Opção Simples Nacional',
      'Data Adesão / Opção',
      'Data Exclusão',
      'Optante MEI',
      'Eventos Futuros (Regime Regular IBS/CBS 2027)',
      'Situação Cadastral'
    ];

    headers.forEach((h, c) => {
      const alignStyle = (c === 1 || c === 6) ? styleTableHeaderLeft : styleTableHeaderCenter;
      writeCell(currentRow, c, h, 's', alignStyle);
    });
    rowHeights.push({ hpt: 26 });
    currentRow++;

    // Table Data Rows
    filteredCompanies.forEach((comp, idx) => {
      const isEven = idx % 2 === 0;
      const isSimples = comp.opcaoSimples === true || comp.opcaoSimples === 'Sim' || comp.regimeTributario === 'SIMPLES_NACIONAL';
      const statusSimples = isSimples ? 'SIM (OPTANTE)' : (comp.dataExclusaoSimples ? 'EXCLUÍDA' : 'NÃO OPTANTE');
      const dataAdesao = comp.dataOpcaoSimples || '-';
      const dataExclusao = comp.dataExclusaoSimples || '-';
      const statusMei = (comp.opcaoMei === true || comp.opcaoMei === 'Sim') ? 'SIM (MEI)' : 'NÃO';

      const ibsEventsText = (comp.eventosFuturosIbsCbs && comp.eventosFuturosIbsCbs.length > 0)
        ? comp.eventosFuturosIbsCbs.map(ev => `${ev.regime}: ${ev.descricao} (${ev.dataEfeito})`).join(' | ')
        : 'Não informado no Portal';

      const statusColor = isSimples ? "059669" : (comp.dataExclusaoSimples ? "E11D48" : "475569");

      writeCell(currentRow, 0, comp.cnpj, 's', getRowStyle(isEven, 'center', false, "475569"));
      writeCell(currentRow, 1, comp.razaoSocial || '', 's', getRowStyle(isEven, 'left', true, "0F172A"));
      writeCell(currentRow, 2, statusSimples, 's', getRowStyle(isEven, 'center', true, statusColor));
      writeCell(currentRow, 3, dataAdesao, 's', getRowStyle(isEven, 'center', false, "334155"));
      writeCell(currentRow, 4, dataExclusao, 's', getRowStyle(isEven, 'center', false, "334155"));
      writeCell(currentRow, 5, statusMei, 's', getRowStyle(isEven, 'center', statusMei.startsWith('SIM') ? true : false, statusMei.startsWith('SIM') ? "0284C7" : "475569"));
      writeCell(currentRow, 6, ibsEventsText, 's', getRowStyle(isEven, 'left', false, ibsEventsText.includes('regime regular') ? "4338CA" : "475569"));
      writeCell(currentRow, 7, comp.situacaoCadastral || 'ATIVA', 's', getRowStyle(isEven, 'center', false, "334155"));

      rowHeights.push({ hpt: 20 });
      currentRow++;
    });

    // Metadata setup
    ws['!merges'] = merges;
    ws['!rows'] = rowHeights;

    ws['!cols'] = [
      { wch: 20 }, // CNPJ
      { wch: 45 }, // Razão Social
      { wch: 22 }, // Opção Simples
      { wch: 18 }, // Data Adesão
      { wch: 18 }, // Data Exclusão
      { wch: 16 }, // Optante MEI
      { wch: 48 }, // Eventos Futuros IBS/CBS
      { wch: 18 }  // Situação Cadastral
    ];
    ws['!views'] = [{ showGridLines: false }];

    const lastRef = getCellRef(currentRow - 1, maxColIndex);
    ws['!ref'] = `A1:${lastRef}`;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, ws, 'Opção Simples e IBS-CBS');
    const fileName = `Relatorio_Simples_IBS_CBS_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    showFeedback(`Planilha Excel com Simples Nacional e Eventos Futuros IBS/CBS (${fileName}) exportada com sucesso!`);
  };

  return (
    <div className="space-y-6">
      {/* NOTIFICAÇÃO TOAST */}
      {notification && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-bold shadow-sm ${
          notification.isError
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          <div className="flex items-center gap-2">
            {notification.isError ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle className="h-4 w-4 shrink-0" />}
            <span>{notification.msg}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-500 hover:text-slate-800 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* CABEÇALHO DO MÓDULO (OCULTO NA IMPRESSÃO) */}
      <div className="print:hidden bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-[#04243b] text-[#e4b35e] rounded-xl shadow-sm">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Consulta Optantes Simples Nacional & IBS/CBS 2027</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Acompanhamento cadastral da Receita Federal, eventos futuros da Reforma Tributária (IBS/CBS) e conformidade fiscal.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowApiFieldsModal(true)}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-300"
            title="Ver quais campos a API pública da Receita Federal fornece"
          >
            <Info className="h-4 w-4 text-blue-600" />
            Campos da API RFB
          </button>
          <button
            onClick={() => handleOpenPasteModal()}
            className="px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Importar comprovante copiado diretamente do Portal do Simples Nacional"
          >
            <Clipboard className="h-4 w-4 text-indigo-600" />
            Importar Comprovante Portal
          </button>
          <button
            onClick={handleOpenBatchModal}
            disabled={isUpdatingBatch}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs uppercase flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
            title="Atualizar situação no Simples Nacional de todas as empresas via API"
          >
            <RefreshCw className={`h-4 w-4 ${isUpdatingBatch ? 'animate-spin' : ''}`} />
            Atualizar Consulta
          </button>
          <button
            onClick={() => setShowBatchIbsModal(true)}
            className="px-3.5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs uppercase flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            title="Configurar Reforma Tributária 2027 (IBS/CBS) em Lote"
          >
            <Sparkles className="h-4 w-4" />
            IBS/CBS em Lote
          </button>
          <button
            onClick={handleExportExcel}
            className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs uppercase flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
            title="Exportar dados formatados para Planilha do Excel (.xlsx)"
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* CARDS RESUMO ESTATÍSTICO (OCULTO NA IMPRESSÃO) */}
      <div className="print:hidden grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase mb-1">
            <span>Monitoradas</span>
            <Building2 className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-900">{totalCount}</p>
          <span className="text-[10px] text-slate-400">Carteira contábil ativa</span>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-bold uppercase mb-1">
            <span>Optantes Simples</span>
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-black text-emerald-900">{optantesCount}</p>
            <span className="text-xs font-bold text-emerald-700">
              ({totalCount > 0 ? Math.round((optantesCount / totalCount) * 100) : 0}%)
            </span>
          </div>
          <span className="text-[10px] text-emerald-700">Com adesão homologada</span>
        </div>

        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-indigo-800 text-xs font-bold uppercase mb-1">
            <span>IBS/CBS 2027 (Regular)</span>
            <Sparkles className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-black text-indigo-900">{ibsRegularCount}</p>
            <span className="text-xs font-bold text-indigo-700">
              ({totalCount > 0 ? Math.round((ibsRegularCount / totalCount) * 100) : 0}%)
            </span>
          </div>
          <span className="text-[10px] text-indigo-700">Opção regime regular 2027</span>
        </div>

        <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-blue-800 text-xs font-bold uppercase mb-1">
            <span>Optantes MEI</span>
            <ShieldCheck className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-blue-900">{meiCount}</p>
          <span className="text-[10px] text-blue-700">Microempreendedor Individual</span>
        </div>

        <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-rose-800 text-xs font-bold uppercase mb-1">
            <span>Com Exclusão</span>
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-rose-900">{excluidosCount}</p>
          <span className="text-[10px] text-rose-700">Histórico de exclusão</span>
        </div>
      </div>

      {/* BARRA DE FILTROS E PESQUISA (OCULTO NA IMPRESSÃO) */}
      <div className="print:hidden bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto">
          <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" /> Filtrar:
          </span>
          {[
            { id: 'all', label: 'Todas as Empresas', count: totalCount },
            { id: 'simples', label: 'Optantes Simples', count: optantesCount },
            { id: 'ibs_cbs_regular', label: 'IBS/CBS Regular 2027', count: ibsRegularCount },
            { id: 'nao_simples', label: 'Não Optantes / Demais', count: totalCount - optantesCount },
            { id: 'excluidos', label: 'Com Exclusão', count: excluidosCount },
            { id: 'mei', label: 'Optantes MEI', count: meiCount }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterMode(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterMode === tab.id
                  ? 'bg-[#04243b] text-[#e4b35e] shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                filterMode === tab.id ? 'bg-white/10 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar por Razão ou CNPJ..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#04243b]/40"
          />
        </div>
      </div>

      {/* ÁREA DO RELATÓRIO / TABELA (VISÍVEL E FORMATADA NA IMPRESSÃO) */}
      <div id="relatorio-simples-nacional-target" className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden print:border-none print:shadow-none">
        
        {/* CABEÇALHO DE IMPRESSÃO A4 TIMBRADO (APENAS VISÍVEL NA IMPRESSÃO) */}
        <div className="hidden print:block p-8 border-b-2 border-[#04243b] mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="px-3.5 py-2 bg-[#04243b] text-[#e4b35e] rounded-xl font-black text-sm tracking-widest border border-[#e4b35e]/30">
                M&amp;L
              </div>
              <div>
                <h2 className="text-lg font-black text-[#04243b] uppercase tracking-tight">{officeName}</h2>
                <p className="text-xs text-slate-600 font-mono">CNPJ: {officeCnpj}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 bg-slate-100 text-slate-800 rounded-lg border border-slate-300">
                Relatório Oficial de Conformidade
              </span>
              <p className="text-xs text-slate-500 mt-2 font-mono">
                Emissão: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}
              </p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-200">
            <h1 className="text-base font-bold text-slate-900 uppercase">
              Auditoria de Opção pelo Simples Nacional, MEI e Eventos Futuros IBS/CBS 2027
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Filtro Aplicado: <strong className="font-bold uppercase">{filterMode === 'all' ? 'Todas as Empresas' : filterMode}</strong> • Total Listado: <strong className="font-bold">{filteredCompanies.length} empresas</strong>
            </p>
          </div>
        </div>

        {/* Tabela de Empresas */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3.5 px-4">CNPJ</th>
                <th className="py-3.5 px-4">Razão Social / Nome Empresarial</th>
                <th className="py-3.5 px-4 text-center">Opção Simples Nacional</th>
                <th className="py-3.5 px-4">Data Adesão</th>
                <th className="py-3.5 px-4">Data Exclusão</th>
                <th className="py-3.5 px-4 text-center">Optante MEI</th>
                <th className="py-3.5 px-4">Eventos Futuros (IBS/CBS 2027)</th>
                <th className="py-3.5 px-4 text-right print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                    Nenhuma empresa encontrada com os critérios de filtro selecionados.
                  </td>
                </tr>
              ) : (
                filteredCompanies.map((comp) => {
                  const isSimples = comp.opcaoSimples === true || comp.opcaoSimples === 'Sim' || comp.regimeTributario === 'SIMPLES_NACIONAL';
                  const isMei = comp.opcaoMei === true || comp.opcaoMei === 'Sim';
                  const hasExclusao = Boolean(comp.dataExclusaoSimples);
                  const isUpdatingThis = updatingSingleId === comp.id;

                  const hasIbsEvents = Array.isArray(comp.eventosFuturosIbsCbs) && comp.eventosFuturosIbsCbs.length > 0;

                  return (
                    <tr key={comp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {comp.cnpj}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 max-w-[220px] truncate" title={comp.razaoSocial}>
                        {comp.razaoSocial}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isSimples ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            <CheckCircle className="h-3 w-3 text-emerald-600" />
                            SIM (OPTANTE)
                          </span>
                        ) : hasExclusao ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px]">
                            <AlertTriangle className="h-3 w-3 text-amber-600" />
                            EXCLUÍDA
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 font-medium text-[10px]">
                            NÃO OPTANTE
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-mono whitespace-nowrap">
                        {comp.dataOpcaoSimples ? (
                          <span className="flex items-center gap-1 font-bold text-emerald-700">
                            <Calendar className="h-3 w-3 text-emerald-500" />
                            {comp.dataOpcaoSimples}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-mono whitespace-nowrap">
                        {comp.dataExclusaoSimples ? (
                          <span className="flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            <AlertCircle className="h-3 w-3 text-rose-500" />
                            {comp.dataExclusaoSimples}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isMei ? (
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                            SIM (MEI)
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Não</span>
                        )}
                      </td>
                      
                      {/* COLUNA DE EVENTOS FUTUROS IBS/CBS 2027 */}
                      <td className="py-3 px-4">
                        {hasIbsEvents ? (
                          <div className="flex flex-col gap-1 items-start">
                            {comp.eventosFuturosIbsCbs!.map((ev, i) => (
                              <div
                                key={i}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-900 text-[10px] font-semibold"
                              >
                                <span className="px-1 py-0.2 bg-indigo-600 text-white font-bold rounded text-[9px] font-mono">
                                  {ev.regime}
                                </span>
                                <span className="truncate max-w-[150px]" title={ev.descricao}>
                                  {ev.descricao}
                                </span>
                                <span className="font-mono text-indigo-600 font-bold shrink-0">
                                  {ev.dataEfeito}
                                </span>
                              </div>
                            ))}
                            <button
                              onClick={() => handleOpenIbsModal(comp)}
                              className="print:hidden text-[10px] font-bold text-indigo-600 hover:text-indigo-900 underline mt-0.5 flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="h-2.5 w-2.5" />
                              Editar tabela
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 italic bg-slate-50 px-2 py-1 rounded border border-slate-200" title="A API pública da Receita Federal não expõe este campo">
                              Não fornecido pela API
                            </span>
                            <button
                              onClick={() => handleOpenIbsModal(comp)}
                              className="print:hidden px-2 py-1 bg-white hover:bg-indigo-50 border border-indigo-300 text-indigo-700 font-bold text-[10px] rounded-lg transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
                              title="Registrar opção IBS/CBS para 2027"
                            >
                              <Plus className="h-3 w-3" />
                              Informar
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right print:hidden whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenPasteModal(comp.id)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
                            title="Colar comprovante do Portal para esta empresa"
                          >
                            <Clipboard className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleUpdateSingle(comp)}
                            disabled={isUpdatingThis || isUpdatingBatch}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-[#04243b] hover:text-[#e4b35e] text-slate-700 font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                            title="Atualizar dados do Simples Nacional via API pública"
                          >
                            <RefreshCw className={`h-3 w-3 ${isUpdatingThis ? 'animate-spin text-[#e4b35e]' : ''}`} />
                            {isUpdatingThis ? 'Consultando...' : 'Atualizar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* RODAPÉ DO RELATÓRIO A4 NA IMPRESSÃO */}
        <div className="hidden print:block p-8 pt-12 mt-6 border-t border-slate-300 text-center">
          <div className="inline-block w-72 border-t border-slate-700 pt-2">
            <p className="text-xs font-bold text-slate-800 uppercase">{officeName}</p>
            <p className="text-[10px] text-slate-500">Responsável Técnico / Auditoria Fiscal</p>
          </div>
        </div>
      </div>

      {/* MODAL 1: EVENTOS FUTUROS (REGIME REGULAR IBS/CBS) IDENTICO AO PORTAL */}
      <AnimatePresence>
        {showIbsModal && selectedCompanyForIbs && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs print:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="bg-[#04243b] px-6 py-4 flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#e4b35e]/20 text-[#e4b35e] rounded-xl">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base">Eventos Futuros (Regime Regular IBS/CBS)</h3>
                    <p className="text-[11px] text-slate-300 font-mono">
                      {selectedCompanyForIbs.razaoSocial} • CNPJ: {selectedCompanyForIbs.cnpj}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIbsModal(false)}
                  className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                {/* AVISO EXPLICATIVO */}
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 space-y-1">
                  <p className="font-bold text-xs flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-blue-600 shrink-0" />
                    Sobre a tabela de Eventos Futuros (EC 132/2023 - Reforma Tributária)
                  </p>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Esta tabela reproduz exatamente a seção oficial <strong>"Eventos Futuros (Regime Regular IBS/CBS)"</strong> 
                    do Portal do Simples Nacional da Receita Federal. As empresas optantes pelo Simples que optarem pelo regime regular de apuração 
                    de IBS e CBS a partir de <strong>01/01/2027</strong> podem transferir créditos não-cumulativos para clientes pessoa jurídica.
                  </p>
                </div>

                {/* BOTÕES DE PRESET RÁPIDO */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Ações Rápidas de Configuração
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleApplyPresetIbsRegular}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Opção pelo Regime Regular (IBS + CBS - 01/01/2027)
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyPresetNaoOptanteIbs}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-300"
                    >
                      Permanecer no Simples (Sem regime regular)
                    </button>
                    <button
                      type="button"
                      onClick={handleClearIbsEvents}
                      className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 font-bold rounded-lg text-xs transition-colors cursor-pointer border border-rose-200"
                    >
                      Limpar Registros
                    </button>
                  </div>
                </div>

                {/* TABELA VISUAL IDÊNTICA AO PORTAL SIMPLES NACIONAL (SCREENSHOT DO USUÁRIO) */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="bg-[#04243b] text-[#e4b35e] font-bold text-xs px-4 py-2.5 flex items-center justify-between">
                    <span>Eventos Futuros (Regime Regular IBS/CBS)</span>
                    <button
                      type="button"
                      onClick={handleAddCustomIbsRow}
                      className="text-[11px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      Adicionar Linha
                    </button>
                  </div>

                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-700">
                        <th className="py-2.5 px-4 w-28">Regime</th>
                        <th className="py-2.5 px-4">Descrição do evento</th>
                        <th className="py-2.5 px-4 w-32">Data efeito</th>
                        <th className="py-2.5 px-4 w-12 text-center">Remover</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {ibsEventsDraft.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-slate-400 italic">
                            Nenhum evento futuro registrado para esta empresa. Use os botões acima ou adicione manualmente.
                          </td>
                        </tr>
                      ) : (
                        ibsEventsDraft.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-4">
                              <select
                                value={row.regime}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setIbsEventsDraft(prev => prev.map((item, i) => i === idx ? { ...item, regime: val } : item));
                                }}
                                className="w-full border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-800 bg-white"
                              >
                                <option value="IBS">IBS</option>
                                <option value="CBS">CBS</option>
                              </select>
                            </td>
                            <td className="py-2 px-4">
                              <input
                                type="text"
                                value={row.descricao}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setIbsEventsDraft(prev => prev.map((item, i) => i === idx ? { ...item, descricao: val } : item));
                                }}
                                placeholder="Opção pelo regime regular"
                                className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-slate-800"
                              />
                            </td>
                            <td className="py-2 px-4">
                              <input
                                type="text"
                                value={row.dataEfeito}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setIbsEventsDraft(prev => prev.map((item, i) => i === idx ? { ...item, dataEfeito: val } : item));
                                }}
                                placeholder="01/01/2027"
                                className="w-full border border-slate-300 rounded px-2 py-1 text-xs font-mono text-slate-800"
                              />
                            </td>
                            <td className="py-2 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => setIbsEventsDraft(prev => prev.filter((_, i) => i !== idx))}
                                className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowIbsModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveIbsEvents}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  Salvar Eventos Futuros
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: LISTA DE CAMPOS QUE A API DA RECEITA FEDERAL DISPONIBILIZA */}
      <AnimatePresence>
        {showApiFieldsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs print:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="bg-[#04243b] px-6 py-4 flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl">
                    <FileText className="h-5 w-5 text-[#e4b35e]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base">Mapeamento da API de CNPJ da Receita Federal</h3>
                    <p className="text-[11px] text-slate-300">Campos disponibilizados via BrasilAPI / Dados Abertos RFB</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowApiFieldsModal(false)}
                  className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                {/* ALERTA SOBRE A AUSÊNCIA DO IBS/CBS NA API PÚBLICA */}
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2 text-amber-950">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                    <span className="font-bold text-sm">Por que a API pública não baixa IBS e CBS 2027?</span>
                  </div>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    A Receita Federal publica mensalmente os <em>Dados Abertos do CNPJ</em>. Esse banco de dados aberto contém informações cadastrais, 
                    situação, QSA e dados básicos de opção pelo Simples Nacional (se é optante e data de opção). 
                    Porém, a tabela <strong>"Eventos Futuros (Regime Regular IBS/CBS)"</strong> foi introduzida recentemente no sistema web interativo 
                    do <strong>Portal do Simples Nacional</strong> (com proteção por hCaptcha) em virtude da Reforma Tributária (EC 132/2023), 
                    e <strong>ainda não foi incluída nos arquivos públicos abertos da Receita Federal</strong> que alimentam APIs como BrasilAPI, 
                    ReceitaWS ou publica.cnpj.ws.
                  </p>
                </div>

                {/* CATEGORIAS E CAMPOS DISPONIBILIZADOS PELA API */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                    Relação de Campos que a API Pública Baixa Atualmente:
                  </h4>

                  {API_AVAILABLE_FIELDS_CATALOG.map((cat, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                      <div className="bg-slate-100 px-4 py-2 font-bold text-slate-800 text-xs border-b border-slate-200 flex items-center justify-between">
                        <span>{cat.categoria}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{cat.campos.length} campos</span>
                      </div>
                      <div className="divide-y divide-slate-100 bg-white">
                        {cat.campos.map((item, cIdx) => (
                          <div key={cIdx} className="p-2.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                            <span className="font-mono font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 w-fit">
                              {item.campo}
                            </span>
                            <span className="text-slate-600 text-[11px] sm:text-right">
                              {item.descricao}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setShowApiFieldsModal(false)}
                  className="px-5 py-2 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Entendi e Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: IMPORTAR / COLAR COMPROVANTE DO PORTAL SIMPLES NACIONAL */}
      <AnimatePresence>
        {showPasteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs print:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="bg-[#04243b] px-6 py-4 flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 text-[#e4b35e] rounded-xl">
                    <Clipboard className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base">Importar Comprovante do Portal Simples Nacional</h3>
                    <p className="text-[11px] text-slate-300">Cole o texto copiado da consulta do Portal da Receita Federal</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPasteModal(false)}
                  className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Selecione a Empresa de Destino:
                  </label>
                  <select
                    value={pasteTargetCompanyId}
                    onChange={(e) => setPasteTargetCompanyId(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#04243b]/40"
                  >
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.cnpj} — {c.razaoSocial}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Cole o texto da consulta do Portal do Simples Nacional:
                  </label>
                  <textarea
                    rows={8}
                    value={pastePortalText}
                    onChange={(e) => setPastePortalText(e.target.value)}
                    placeholder={`Exemplo de conteúdo copiado do Portal:
Situação Atual: Optante pelo Simples Nacional desde 01/01/2018
Enquadrado no SIMEI: Não

Eventos Futuros (Regime Regular IBS/CBS)
Regime    Descrição do evento          Data efeito
IBS       Opção pelo regime regular    01/01/2027
CBS       Opção pelo regime regular    01/01/2027`}
                    className="w-full border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#04243b]/40 resize-none"
                  />
                </div>

                {/* PRÉVIA DO QUE SERÁ PROCESSADO */}
                {pastePortalText.trim() && (
                  <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                    <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider">
                      Prévia dos Dados Detectados pelo Sistema:
                    </span>
                    {(() => {
                      const detected = parsePortalSimplesText(pastePortalText);
                      return (
                        <div className="space-y-1 text-xs text-indigo-950 font-sans">
                          <p>
                            • <strong>Eventos IBS/CBS 2027:</strong>{' '}
                            {detected.eventosFuturosIbsCbs.length > 0 ? (
                              <span className="font-bold text-indigo-700">
                                {detected.eventosFuturosIbsCbs.map(e => `${e.regime}: ${e.descricao} (${e.dataEfeito})`).join(' | ')}
                              </span>
                            ) : (
                              <span className="text-slate-500 italic">Nenhum evento detectado no texto</span>
                            )}
                          </p>
                          {detected.isSimples !== undefined && (
                            <p>• <strong>Situação Simples:</strong> {detected.isSimples ? 'Optante' : 'Não Optante'}</p>
                          )}
                          {detected.dataOpcao && (
                            <p>• <strong>Data Opção:</strong> {detected.dataOpcao}</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPasteModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleProcessPastedText}
                  disabled={!pastePortalText.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  Processar e Salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: CONFIGURAÇÃO EM LOTE DE IBS/CBS 2027 */}
      <AnimatePresence>
        {showBatchIbsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs print:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full flex flex-col overflow-hidden"
            >
              <div className="bg-[#04243b] px-6 py-4 flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#e4b35e]/20 text-[#e4b35e] rounded-xl">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base">Configurar IBS/CBS 2027 em Lote</h3>
                    <p className="text-[11px] text-slate-300">Definição rápida de eventos futuros para a carteira</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBatchIbsModal(false)}
                  className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs">
                <p className="text-slate-600 leading-relaxed">
                  Como as APIs públicas não entregam os eventos futuros de IBS/CBS 2027, você pode registrar em lote 
                  a <strong>"Opção pelo regime regular" (IBS e CBS a partir de 01/01/2027)</strong> para as empresas da sua carteira:
                </p>

                <div className="space-y-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleBatchApplyIbsRegular(true)}
                    className="w-full p-4 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/90 text-left transition-all cursor-pointer space-y-1 shadow-2xs"
                  >
                    <p className="font-bold text-indigo-950 flex items-center gap-2">
                      <Check className="h-4 w-4 text-indigo-600" />
                      Aplicar apenas para todas as Optantes pelo Simples Nacional ({optantesCount} empresas)
                    </p>
                    <p className="text-[11px] text-indigo-800">
                      Adiciona os eventos: <code>IBS - Opção pelo regime regular (01/01/2027)</code> e <code>CBS - Opção pelo regime regular (01/01/2027)</code>.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleBatchApplyIbsRegular(false)}
                    className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left transition-all cursor-pointer space-y-1"
                  >
                    <p className="font-bold text-slate-900 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-slate-600" />
                      Aplicar para todas as empresas da carteira ({totalCount} empresas)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Inclui optantes e demais empresas ativas no sistema.
                    </p>
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setShowBatchIbsModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 5: CONSULTA EM LOTE VIA API DA RECEITA FEDERAL */}
      <AnimatePresence>
        {showBatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs print:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="bg-[#04243b] px-6 py-4 flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl">
                    <RefreshCw className={`h-5 w-5 text-[#e4b35e] ${isUpdatingBatch ? 'animate-spin' : ''}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base">Consulta em Lote: Opção Simples Nacional (API RFB)</h3>
                    <p className="text-[11px] text-slate-300">Verificação automática em todas as {companies.length} empresas</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  disabled={isUpdatingBatch && !batchFinished}
                  className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 cursor-pointer transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                {!isUpdatingBatch && !batchFinished ? (
                  <div className="space-y-5">
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 space-y-2">
                      <p className="font-bold text-sm">Pronto para iniciar a auditoria em lote:</p>
                      <p className="text-xs leading-relaxed">
                        O sistema irá consultar a base pública da Receita Federal em tempo real para capturar a <strong>situação de optante pelo Simples Nacional</strong>, <strong>Data de Opção</strong>, <strong>Data de Exclusão</strong> e situação de <strong>MEI</strong> de todas as {companies.length} empresas.
                      </p>
                      <p className="text-[11px] text-blue-700 bg-blue-100/60 p-2 rounded-lg">
                        <strong>Nota Técnica:</strong> Os dados de IBS/CBS 2027 já registrados manualmente ou importados serão 100% preservados durante a consulta da API.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Total a Consultar</span>
                        <p className="text-lg font-bold text-slate-800 mt-0.5">{companies.length} CNPJs</p>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Tempo Estimado</span>
                        <p className="text-lg font-bold text-slate-800 mt-0.5">~{(companies.length * 0.45).toFixed(0)} s</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                        <span>{batchFinished ? 'Consulta em Lote Concluída!' : 'Verificando situação na API...'}</span>
                        <span className="font-mono text-sm text-[#04243b]">
                          {batchProgress ? Math.round((batchProgress.current / batchProgress.total) * 100) : 100}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${batchFinished ? 'bg-emerald-600' : 'bg-[#04243b]'}`}
                          style={{ width: `${batchProgress ? Math.round((batchProgress.current / batchProgress.total) * 100) : 100}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {batchProgress && !batchFinished
                          ? `Consultando empresa ${batchProgress.current} de ${batchProgress.total}: ${batchProgress.currentName}`
                          : `Todas as ${companies.length} empresas verificadas!`}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">Histórico de Verificação</label>
                      <div className="border border-slate-200 rounded-xl max-h-60 overflow-y-auto divide-y divide-slate-100 bg-slate-50/50 p-1.5 space-y-1">
                        {batchItemsStatus.map((item) => (
                          <div key={item.id} className="p-2.5 rounded-lg flex items-center justify-between gap-3 text-xs bg-white">
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              {item.status === 'updating' && <RefreshCw className="h-4 w-4 text-blue-600 animate-spin shrink-0" />}
                              {item.status === 'success' && <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />}
                              {item.status === 'error' && <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />}
                              {item.status === 'waiting' && <Clock className="h-4 w-4 text-slate-400 shrink-0" />}
                              <div className="truncate">
                                <p className="font-bold text-slate-800 truncate">{item.razaoSocial}</p>
                                <p className="text-[10px] text-slate-500 font-mono">{item.cnpj}</p>
                              </div>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                              item.status === 'success' ? 'bg-emerald-100 text-emerald-800' : item.status === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {item.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
                {!isUpdatingBatch && !batchFinished ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowBatchModal(false)}
                      className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={startBatchUpdate}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
                    >
                      <Play className="h-4 w-4" />
                      Iniciar Consulta Simples Nacional
                    </button>
                  </>
                ) : isUpdatingBatch ? (
                  <button
                    type="button"
                    onClick={() => setShowBatchModal(false)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Minimizar Janela
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowBatchModal(false)}
                    className="px-6 py-2.5 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-bold rounded-xl transition-colors shadow-sm cursor-pointer"
                  >
                    Concluir e Ver Relatório
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
