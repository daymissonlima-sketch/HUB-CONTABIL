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
  Download
} from 'lucide-react';
import { Company } from '../types_debits';
import { fetchCnpjSafe, parseCnpjResponseData } from '../utils/cnpjHelper';
import { getAppLogoPath } from '../utils/logoHelper';
import importedCompaniesJson from '../data/imported_companies.json';
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
  const [filterMode, setFilterMode] = useState<'all' | 'simples' | 'nao_simples' | 'excluidos' | 'mei'>('all');
  
  // Batch update state
  const [isUpdatingBatch, setIsUpdatingBatch] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchItemsStatus, setBatchItemsStatus] = useState<BatchItemStatus[]>([]);
  const [batchFinished, setBatchFinished] = useState(false);

  // Single update
  const [updatingSingleId, setUpdatingSingleId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ msg: string; isError?: boolean } | null>(null);

  // Corporate data
  const officeName = localStorage.getItem('cfg_office_name') || 'Moreira & Lima Contadores Associados';
  const officeCnpj = localStorage.getItem('cfg_office_cnpj') || '12.345.678/0001-90';
  const logoPath = getAppLogoPath();

  const showFeedback = (msg: string, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 5000);
  };

  const loadCompanies = () => {
    try {
      const saved = localStorage.getItem('moreira_lima_companies');
      if (saved) {
        const parsed: Company[] = JSON.parse(saved);
        setCompanies(parsed);
      } else {
        const fallback: Company[] = (importedCompaniesJson as any[]).map((item, idx) => ({
          id: item.id || `imp_${idx}`,
          razaoSocial: item.razaoSocial || item.razao_social || 'Empresa Importada',
          cnpj: item.cnpj || '',
          regimeTributario: (item.regimeTributario || 'SIMPLES_NACIONAL') as any,
          vendaVistaPercent: item.vendaVistaPercent ?? 60,
          vendaPrazoPercent: item.vendaPrazoPercent ?? 40,
          createdAt: new Date().toISOString(),
          opcaoSimples: item.opcaoSimples ?? (item.regimeTributario === 'SIMPLES_NACIONAL'),
          dataOpcaoSimples: item.dataOpcaoSimples || '',
          dataExclusaoSimples: item.dataExclusaoSimples || '',
          motivoExclusaoSimples: item.motivoExclusaoSimples || (item.dataExclusaoSimples ? 'Ato Administrativo / Desenquadramento RFB' : ''),
          opcaoMei: item.opcaoMei || false
        }));
        setCompanies(fallback);
        localStorage.setItem('moreira_lima_companies', JSON.stringify(fallback));
      }
    } catch (e) {
      console.error('Erro ao carregar empresas:', e);
    }
  };

  useEffect(() => {
    loadCompanies();

    const handleStorageUpdate = () => {
      loadCompanies();
    };
    window.addEventListener('moreira_lima_companies_updated', handleStorageUpdate);
    return () => window.removeEventListener('moreira_lima_companies_updated', handleStorageUpdate);
  }, []);

  const saveToStorage = (list: Company[]) => {
    const sorted = [...list].sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '', 'pt-BR', { sensitivity: 'base' }));
    setCompanies(sorted);
    localStorage.setItem('moreira_lima_companies', JSON.stringify(sorted));
    window.dispatchEvent(new Event('moreira_lima_companies_updated'));
  };

  const formatCNPJ = (val: string) => {
    const clean = val.replace(/\D/g, '');
    if (clean.length <= 2) return clean;
    if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`;
    if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
    if (clean.length <= 12) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`;
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
  };

  // Atualizar única empresa
  const handleUpdateSingle = async (company: Company) => {
    const cleanCnpj = company.cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      showFeedback('CNPJ inválido para consulta na API.', true);
      return;
    }

    setUpdatingSingleId(company.id);
    try {
      const raw = await fetchCnpjSafe(cleanCnpj);
      const parsed = parseCnpjResponseData(raw);

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
            situacaoCadastral: parsed.situacaoCadastral || c.situacaoCadastral
          };
        }
        return c;
      });

      saveToStorage(updated);
      showFeedback(`Opção pelo Simples Nacional de ${parsed.razaoSocial || company.razaoSocial} atualizada via API da Receita Federal!`);
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
      if (cleanCnpj.length === 14) {
        try {
          const raw = await fetchCnpjSafe(cleanCnpj);
          const parsed = parseCnpjResponseData(raw);

          updatedCompanies[i] = {
            ...company,
            razaoSocial: parsed.razaoSocial || company.razaoSocial,
            regimeTributario: parsed.opcaoSimples ? 'SIMPLES_NACIONAL' : (company.regimeTributario === 'SIMPLES_NACIONAL' ? 'LUCRO_PRESUMIDO' : company.regimeTributario),
            opcaoSimples: parsed.opcaoSimples,
            dataOpcaoSimples: parsed.dataOpcaoSimples || company.dataOpcaoSimples,
            dataExclusaoSimples: parsed.dataExclusaoSimples || company.dataExclusaoSimples,
            motivoExclusaoSimples: parsed.motivoExclusaoSimples || company.motivoExclusaoSimples || (parsed.dataExclusaoSimples ? 'Ato Administrativo / Desenquadramento RFB' : ''),
            opcaoMei: parsed.opcaoMei ?? company.opcaoMei,
            situacaoCadastral: parsed.situacaoCadastral || company.situacaoCadastral
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
          item.id === company.id ? { ...item, status: 'error', message: 'CNPJ inválido' } : item
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
    showFeedback(`Consulta em lote do Simples Nacional concluída! ${successCount} atualizadas.`);
  };

  // Filtragem
  const filteredCompanies = companies.filter(c => {
    const matchSearch = (c.razaoSocial || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (c.cnpj || '').replace(/\D/g, '').includes(searchTerm.replace(/\D/g, ''));
    if (!matchSearch) return false;

    const isSimplesOpt = c.opcaoSimples === true || c.opcaoSimples === 'Sim' || c.regimeTributario === 'SIMPLES_NACIONAL';

    if (filterMode === 'simples') return isSimplesOpt;
    if (filterMode === 'nao_simples') return !isSimplesOpt && !c.dataExclusaoSimples;
    if (filterMode === 'excluidos') return Boolean(c.dataExclusaoSimples);
    if (filterMode === 'mei') return Boolean(c.opcaoMei === true || c.opcaoMei === 'Sim');
    return true;
  });

  // Estatísticas
  const totalCount = companies.length;
  const optantesCount = companies.filter(c => c.opcaoSimples === true || c.opcaoSimples === 'Sim' || c.regimeTributario === 'SIMPLES_NACIONAL').length;
  const meiCount = companies.filter(c => c.opcaoMei === true || c.opcaoMei === 'Sim').length;
  const excluidosCount = companies.filter(c => Boolean(c.dataExclusaoSimples)).length;

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
    const maxColIndex = 6;

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
      writeCell(currentRow, c, c === 0 ? 'AUDITORIA DE OPÇÃO PELO SIMPLES NACIONAL E MEI' : '', 's', c === 0 ? styleHeaderSub : styleHeaderBannerBase);
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
    merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 6 } });
    rowHeights.push({ hpt: 22 });
    currentRow++;

    // Row 4: Summary Bar 2 (Counts)
    writeCell(currentRow, 0, `Total Listado: ${filteredCompanies.length}`, 's', styleBarLeft);
    writeCell(currentRow, 1, '', 's', styleBarLeft);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });

    writeCell(currentRow, 2, `Optantes Simples: ${optantesCount}`, 's', styleBarCenter);
    writeCell(currentRow, 3, '', 's', styleBarCenter);
    merges.push({ s: { r: currentRow, c: 2 }, e: { r: currentRow, c: 3 } });

    writeCell(currentRow, 4, `MEI: ${meiCount} | Excluídas: ${excluidosCount}`, 's', styleBarRight);
    writeCell(currentRow, 5, '', 's', styleBarRight);
    writeCell(currentRow, 6, '', 's', styleBarRight);
    merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 6 } });
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
      'Motivo da Exclusão',
      'Optante MEI'
    ];

    headers.forEach((h, c) => {
      const alignStyle = (c === 1 || c === 5) ? styleTableHeaderLeft : styleTableHeaderCenter;
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
      const motivoExclusao = comp.motivoExclusaoSimples || (comp.dataExclusaoSimples ? 'Ato Administrativo / Desenquadramento RFB' : '-');
      const statusMei = (comp.opcaoMei === true || comp.opcaoMei === 'Sim') ? 'SIM (MEI)' : 'NÃO';

      const statusColor = isSimples ? "059669" : (comp.dataExclusaoSimples ? "E11D48" : "475569");

      writeCell(currentRow, 0, comp.cnpj, 's', getRowStyle(isEven, 'center', false, "475569"));
      writeCell(currentRow, 1, comp.razaoSocial || '', 's', getRowStyle(isEven, 'left', true, "0F172A"));
      writeCell(currentRow, 2, statusSimples, 's', getRowStyle(isEven, 'center', true, statusColor));
      writeCell(currentRow, 3, dataAdesao, 's', getRowStyle(isEven, 'center', false, "334155"));
      writeCell(currentRow, 4, dataExclusao, 's', getRowStyle(isEven, 'center', false, "334155"));
      writeCell(currentRow, 5, motivoExclusao, 's', getRowStyle(isEven, 'left', false, "334155"));
      writeCell(currentRow, 6, statusMei, 's', getRowStyle(isEven, 'center', statusMei.startsWith('SIM') ? true : false, statusMei.startsWith('SIM') ? "0284C7" : "475569"));

      rowHeights.push({ hpt: 20 });
      currentRow++;
    });

    // Metadata setup
    ws['!merges'] = merges;
    ws['!rows'] = rowHeights;

    ws['!cols'] = [
      { wch: 20 }, // CNPJ
      { wch: 45 }, // Razão Social
      { wch: 24 }, // Opção Simples
      { wch: 20 }, // Data Adesão
      { wch: 20 }, // Data Exclusão
      { wch: 45 }, // Motivo Exclusão
      { wch: 18 }  // Optante MEI
    ];
    ws['!views'] = [{ showGridLines: false }];

    const lastRef = getCellRef(currentRow - 1, maxColIndex);
    ws['!ref'] = `A1:${lastRef}`;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, ws, 'Opção Simples Nacional');
    const fileName = `Relatorio_Opcao_Simples_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    showFeedback(`Planilha Excel formatada (${fileName}) exportada com sucesso!`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Feedback Toast */}
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
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Consulta Optantes Simples Nacional</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Acompanhamento cadastral, datas de adesão, exclusão e geração de relatórios oficiais para auditoria.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleOpenBatchModal}
            disabled={isUpdatingBatch}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs uppercase flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
            title="Atualizar situação no Simples Nacional de todas as empresas"
          >
            <RefreshCw className={`h-4 w-4 ${isUpdatingBatch ? 'animate-spin' : ''}`} />
            Atualizar Consulta
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
      <div className="print:hidden grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase mb-1">
            <span>Total Monitoradas</span>
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

        <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-blue-800 text-xs font-bold uppercase mb-1">
            <span>Optantes MEI</span>
            <ShieldCheck className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-blue-900">{meiCount}</p>
          <span className="text-[10px] text-blue-700">Microempreendedor Individual</span>
        </div>

        <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-amber-800 text-xs font-bold uppercase mb-1">
            <span>Com Exclusão / Histórico</span>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-900">{excluidosCount}</p>
          <span className="text-[10px] text-amber-700">Registram data de exclusão</span>
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
              {logoPath ? (
                <img src={logoPath} alt="Logotipo" className="h-14 w-auto object-contain" />
              ) : (
                <div className="p-3 bg-[#04243b] text-[#e4b35e] rounded-xl font-bold">M&L</div>
              )}
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
              Auditoria de Opção pelo Simples Nacional e MEI (Consulta API RFB)
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
                <th className="py-3.5 px-4">Data Adesão / Opção</th>
                <th className="py-3.5 px-4">Data Exclusão</th>
                <th className="py-3.5 px-4 text-center">Optante MEI</th>
                <th className="py-3.5 px-4 text-right print:hidden">Consulta API</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    Nenhuma empresa encontrada com os critérios de filtro selecionados.
                  </td>
                </tr>
              ) : (
                filteredCompanies.map((comp) => {
                  const isSimples = comp.opcaoSimples === true || comp.opcaoSimples === 'Sim' || comp.regimeTributario === 'SIMPLES_NACIONAL';
                  const isMei = comp.opcaoMei === true || comp.opcaoMei === 'Sim';
                  const hasExclusao = Boolean(comp.dataExclusaoSimples);
                  const isUpdatingThis = updatingSingleId === comp.id;

                  return (
                    <tr key={comp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {comp.cnpj}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 max-w-xs truncate" title={comp.razaoSocial}>
                        {comp.razaoSocial}
                      </td>
                      <td className="py-3 px-4 text-center">
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
                      <td className="py-3 px-4 text-center">
                        {isMei ? (
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                            SIM (MEI)
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Não</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right print:hidden whitespace-nowrap">
                        <button
                          onClick={() => handleUpdateSingle(comp)}
                          disabled={isUpdatingThis || isUpdatingBatch}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-[#04243b] hover:text-[#e4b35e] text-slate-700 font-bold text-[11px] transition-colors flex items-center gap-1 ml-auto cursor-pointer disabled:opacity-40"
                          title="Atualizar dados do Simples Nacional via API pública"
                        >
                          <RefreshCw className={`h-3 w-3 ${isUpdatingThis ? 'animate-spin text-[#e4b35e]' : ''}`} />
                          {isUpdatingThis ? 'Consultando...' : 'Atualizar'}
                        </button>
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

      {/* MODAL DE ATUALIZAÇÃO EM LOTE COM PROGRESSO */}
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
