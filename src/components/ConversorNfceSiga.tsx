/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx-js-style';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  RefreshCw, 
  FileText,
  DollarSign,
  Calendar,
  ShieldAlert,
  FileCheck2,
  ArrowLeft,
  ClipboardCheck,
  X,
  AlertCircle,
  Table
} from 'lucide-react';
import { 
  executeDataAudit, 
  exportAuditExcel, 
  parseSefazReport,
  AuditItem, 
  AuditSummary,
  InvoiceRow,
  parseCurrencySafe,
  parseSefazReportAsync,
  parseErpReportAsync,
  executeDataAuditAsync
} from '../utils/auditHelper';

const BRAND_CONFIG = {
  COMPANY_NAME: 'MOREIRA & LIMA CONTADORES ASSOCIADOS',
  SUBTITLE: 'RELATÓRIO DE FATURAMENTO NFC-E (INTEGRAÇÃO SIGA)',
} as const;

export function ConversorNfceSiga() {
  // Flow selector mode: nfce (SIGA), nfe_vendas (Saídas), nfe_compras (Entradas)
  const [flowMode, setFlowMode] = useState<'nfce' | 'nfe_vendas' | 'nfe_compras'>('nfce');

  // Single file state (for NFC-e)
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'valid' | 'invalid'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dual file state (for NF-e Vendas and Compras)
  const [sefazFile, setSefazFile] = useState<File | null>(null);
  const [erpFile, setErpFile] = useState<File | null>(null);
  const [sefazDragOver, setSefazDragOver] = useState<boolean>(false);
  const [erpDragOver, setErpDragOver] = useState<boolean>(false);
  const sefazFileInputRef = useRef<HTMLInputElement>(null);
  const erpFileInputRef = useRef<HTMLInputElement>(null);

  // States for Bilateral Audit Layer
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [isAuditActive, setIsAuditActive] = useState<boolean>(false);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [auditSearchTerm, setAuditSearchTerm] = useState<string>('');
  const [auditFilterStatus, setAuditFilterStatus] = useState<'all' | 'OK' | 'FALTANTE_ERP' | 'NAO_CONSTA_SEFAZ' | 'SALTO_SEQUENCIA' | 'DIVERGENCIA_VALOR'>('all');
  const [dragOverModal, setDragOverModal] = useState<boolean>(false);

  // States for Progress Tracking of large files
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingStage, setProcessingStage] = useState<string>('');

  // Basic stats for the currently loaded SEFAZ data in NFC-e
  const stats = useMemo(() => {
    let totalValor = 0;
    let minValor = rows.length ? Infinity : 0;
    let maxValor = rows.length ? -Infinity : 0;
    let minDT = Infinity;
    let maxDT = -Infinity;
    let minDateRaw = '';
    let maxDateRaw = '';

    for (const r of rows) {
      totalValor += r.valorDecimal;
      if (r.valorDecimal < minValor) minValor = r.valorDecimal;
      if (r.valorDecimal > maxValor) maxValor = r.valorDecimal;
      
      const p = r.dataEmissao.split('/');
      if (p.length === 3) {
        const t = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime();
        if (!Number.isNaN(t)) {
          if (t < minDT) { minDT = t; minDateRaw = r.dataEmissao; }
          if (t > maxDT) { maxDT = t; maxDateRaw = r.dataEmissao; }
        }
      }
    }

    return {
      totalCount: rows.length,
      totalValor: Number(totalValor.toFixed(2)),
      minValor: minValor === Infinity ? 0 : Number(minValor.toFixed(2)),
      maxValor: maxValor === -Infinity ? 0 : Number(maxValor.toFixed(2)),
      periodo: minDateRaw ? { inicio: minDateRaw, fim: maxDateRaw } : null,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      const matchesSearch = !searchTerm || 
        r.chaveDeAcesso.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.numeroNotaFormatado.includes(searchTerm) ||
        r.dataEmissao.includes(searchTerm) ||
        r.cnpjFormatado.includes(searchTerm);

      const matchesStatus = 
        filterStatus === 'all' ||
        (filterStatus === 'valid' && r.isValidChave) ||
        (filterStatus === 'invalid' && !r.isValidChave);

      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      const numA = parseInt(a.numeroNota, 10) || 0;
      const numB = parseInt(b.numeroNota, 10) || 0;
      return numA - numB;
    });
  }, [rows, searchTerm, filterStatus]);

  const filteredAuditItems = useMemo(() => {
    return auditItems.filter(item => {
      const matchesSearch = !auditSearchTerm ||
        item.nota.toString().includes(auditSearchTerm) ||
        (item.chaveDeAcesso && item.chaveDeAcesso.toLowerCase().includes(auditSearchTerm.toLowerCase())) ||
        (item.cliente && item.cliente.toLowerCase().includes(auditSearchTerm.toLowerCase()));

      let matchesStatus = true;
      if (auditFilterStatus !== 'all') {
        matchesStatus = item.status === auditFilterStatus;
      }

      return matchesSearch && matchesStatus;
    });
  }, [auditItems, auditSearchTerm, auditFilterStatus]);

  // Handle SEFAZ file process in NFC-e flow
  const handleFileProcess = async (file: File) => {
    if (!file) return;
    setFileName(file.name);
    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStage('Carregando arquivo SEFAZ...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (text) {
        setProcessingStage('Processando registros da SEFAZ...');
        try {
          const parsed = await parseSefazReportAsync(text, (pct) => {
            setProcessingProgress(pct);
          });
          setRows(parsed);
        } catch (error) {
          console.error(error);
        } finally {
          setIsProcessing(false);
        }
      } else {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  // Handle ERP file process in NFC-e flow
  const handleErpFileProcess = async (file: File) => {
    if (!file) return;
    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStage('Carregando relatório do ERP...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (text) {
        setProcessingStage('Processando registros do ERP...');
        try {
          const parsedErp = await parseErpReportAsync(text, (pct) => {
            setProcessingProgress(Math.round(pct * 0.4)); // 0-40%
          });

          setProcessingStage('Executando confronto e cruzamento...');
          const { items, summary } = await executeDataAuditAsync(rows, parsedErp, (pct) => {
            setProcessingProgress(40 + Math.round(pct * 0.6)); // 40-100%
          });

          setAuditItems(items);
          setAuditSummary(summary);
          setIsAuditModalOpen(false);
          setIsAuditActive(true);
        } catch (error) {
          console.error(error);
        } finally {
          setIsProcessing(false);
        }
      } else {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  // Execute dual file cross-audit processing for NF-e
  const handleDualProcess = async () => {
    if (!sefazFile || !erpFile) return;
    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStage('Iniciando carregamento das bases...');

    const readSefaz = (): Promise<string> => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string || '');
      reader.readAsText(sefazFile, 'utf-8');
    });

    const readErp = (): Promise<string> => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string || '');
      reader.readAsText(erpFile, 'utf-8');
    });

    try {
      const [sefazText, erpText] = await Promise.all([readSefaz(), readErp()]);

      setProcessingStage('Analisando arquivo SEFAZ (0%)...');
      const parsedSefaz = await parseSefazReportAsync(sefazText, (pct) => {
        setProcessingProgress(Math.round(pct * 0.3)); // 0% to 30%
      });
      setRows(parsedSefaz);

      setProcessingStage('Analisando arquivo ERP (30%)...');
      const parsedErp = await parseErpReportAsync(erpText, (pct) => {
        setProcessingProgress(30 + Math.round(pct * 0.3)); // 30% to 60%
      });

      setProcessingStage('Executando cruzamento bidirecional (60%)...');
      const { items, summary } = await executeDataAuditAsync(parsedSefaz, parsedErp, (pct) => {
        setProcessingProgress(60 + Math.round(pct * 0.4)); // 60% to 100%
      });

      setAuditItems(items);
      setAuditSummary(summary);
      setIsAuditActive(true);
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetAll = () => {
    setRows([]);
    setFileName('');
    setSearchTerm('');
    setFilterStatus('all');
    // Dual states
    setSefazFile(null);
    setErpFile(null);
    setSefazDragOver(false);
    setErpDragOver(false);
    // Audit state
    setIsAuditActive(false);
    setAuditItems([]);
    setAuditSummary(null);
    setAuditSearchTerm('');
    setAuditFilterStatus('all');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (sefazFileInputRef.current) sefazFileInputRef.current.value = '';
    if (erpFileInputRef.current) erpFileInputRef.current.value = '';
  };

  // Export NFC-e converted base directly (Before Audit is ran)
  const handleDirectExport = (includeExtras: boolean) => {
    const customFileName = includeExtras ? 'NFCe_SIGA_Completo.xlsx' : 'NFCe_SIGA.xlsx';
    const exportDate = `${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const sortedRows = [...rows].sort((a, b) => (parseInt(a.numeroNota, 10) || 0) - (parseInt(b.numeroNota, 10) || 0));
    const totalValue = sortedRows.reduce((acc, curr) => acc + curr.valorDecimal, 0);

    const ws: any = {};
    let currentRow = 0;
    const merges: any[] = [];
    const rowHeights: any[] = [];
    const maxColIndex = includeExtras ? 8 : 3;

    const getCellRef = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
    const writeCell = (r: number, c: number, val: any, type: 's' | 'n', style: any = {}, format: string = '') => {
      const ref = getCellRef(r, c);
      ws[ref] = { v: val, t: type, s: style };
      if (format) ws[ref].z = format;
    };

    // Styles definitions (Corporate Blue #04243B & Gold #E4B35E)
    const styleHeaderTitle = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 15, bold: true, color: { rgb: "E4B35E" } },
      alignment: { horizontal: "center", vertical: "center" }
    };
    const styleHeaderSub = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 9.5, bold: true, color: { rgb: "FFFFFF" } },
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
      font: { name: "Arial", sz: 10.5, bold: true, color: { rgb: "059669" } },
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
    const styleTableHeaderRight = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10.5, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "right", vertical: "center" },
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

    const styleGrandTotalLabel = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "right", vertical: "center" },
      border: {
        top: { style: "medium", color: { rgb: "E4B35E" } },
        bottom: { style: "double", color: { rgb: "E4B35E" } }
      }
    };
    const styleGrandTotalValue = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 11.5, bold: true, color: { rgb: "E4B35E" } },
      alignment: { horizontal: "right", vertical: "center" },
      border: {
        top: { style: "medium", color: { rgb: "E4B35E" } },
        bottom: { style: "double", color: { rgb: "E4B35E" } }
      }
    };

    // Row 0: Company Banner
    for (let c = 0; c <= maxColIndex; c++) {
      writeCell(currentRow, c, c === 0 ? BRAND_CONFIG.COMPANY_NAME : '', 's', c === 0 ? styleHeaderTitle : styleHeaderBannerBase);
    }
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: maxColIndex } });
    rowHeights.push({ hpt: 28 });
    currentRow++;

    // Row 1: Subtitle Banner
    for (let c = 0; c <= maxColIndex; c++) {
      writeCell(currentRow, c, c === 0 ? BRAND_CONFIG.SUBTITLE : '', 's', c === 0 ? styleHeaderSub : styleHeaderBannerBase);
    }
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: maxColIndex } });
    rowHeights.push({ hpt: 20 });
    currentRow++;

    // Spacer
    rowHeights.push({ hpt: 10 });
    currentRow++;

    // Summary Metric Bar
    const strExport = `Exportado em: ${exportDate}`;
    const strCount = `Total de Notas: ${sortedRows.length}`;
    const strValue = `Valor Acumulado: R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (includeExtras) {
      writeCell(currentRow, 0, strExport, 's', styleBarLeft);
      writeCell(currentRow, 1, '', 's', styleBarLeft);
      writeCell(currentRow, 2, '', 's', styleBarLeft);
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 2 } });

      writeCell(currentRow, 3, strCount, 's', styleBarCenter);
      writeCell(currentRow, 4, '', 's', styleBarCenter);
      writeCell(currentRow, 5, '', 's', styleBarCenter);
      merges.push({ s: { r: currentRow, c: 3 }, e: { r: currentRow, c: 5 } });

      writeCell(currentRow, 6, strValue, 's', styleBarRight);
      writeCell(currentRow, 7, '', 's', styleBarRight);
      writeCell(currentRow, 8, '', 's', styleBarRight);
      merges.push({ s: { r: currentRow, c: 6 }, e: { r: currentRow, c: 8 } });
    } else {
      writeCell(currentRow, 0, strExport, 's', styleBarLeft);
      writeCell(currentRow, 1, strCount, 's', styleBarCenter);
      writeCell(currentRow, 2, strValue, 's', styleBarRight);
      writeCell(currentRow, 3, '', 's', styleBarRight);
      merges.push({ s: { r: currentRow, c: 2 }, e: { r: currentRow, c: 3 } });
    }
    rowHeights.push({ hpt: 24 });
    currentRow++;

    // Spacer
    rowHeights.push({ hpt: 14 });
    currentRow++;

    const headers = includeExtras 
      ? ['Chave de Acesso', 'Número da Nota', 'Data de Emissão', 'Valor', 'Série', 'Modelo', 'CNPJ Emitente', 'UF Emitente', 'Tipo Emissão']
      : ['Chave de Acesso', 'Número da Nota', 'Data de Emissão', 'Valor'];

    headers.forEach((h, c) => {
      const alignStyle = c === 3 ? styleTableHeaderRight : (c >= 7 ? styleTableHeaderLeft : styleTableHeaderCenter);
      writeCell(currentRow, c, h, 's', alignStyle);
    });
    rowHeights.push({ hpt: 26 });
    currentRow++;

    sortedRows.forEach((r, idx) => {
      const isEven = idx % 2 === 0;
      const numNota = r.isValidChave ? parseInt(r.numeroNota, 10) : 'Erro';
      const numNotaVal = Number.isNaN(Number(numNota)) ? 'Erro' : Number(numNota);

      writeCell(currentRow, 0, r.chaveDeAcesso, 's', getRowStyle(isEven, 'center', false, "475569"));
      writeCell(currentRow, 1, numNotaVal, typeof numNotaVal === 'number' ? 'n' : 's', getRowStyle(isEven, 'center', true, "0F172A"));
      writeCell(currentRow, 2, r.dataEmissao, 's', getRowStyle(isEven, 'center', false, "334155"));
      writeCell(currentRow, 3, r.valorDecimal, 'n', getRowStyle(isEven, 'right', true, "04243B"), '"R$ " #,##0.00');

      if (includeExtras) {
        const serieVal = r.isValidChave ? parseInt(r.serie, 10) : 'N/A';
        const modVal = r.isValidChave ? parseInt(r.modelo, 10) : 'N/A';
        writeCell(currentRow, 4, Number.isNaN(Number(serieVal)) ? 'N/A' : Number(serieVal), typeof serieVal === 'number' && !Number.isNaN(Number(serieVal)) ? 'n' : 's', getRowStyle(isEven, 'center'));
        writeCell(currentRow, 5, Number.isNaN(Number(modVal)) ? 'N/A' : Number(modVal), typeof modVal === 'number' && !Number.isNaN(Number(modVal)) ? 'n' : 's', getRowStyle(isEven, 'center'));
        writeCell(currentRow, 6, r.isValidChave ? r.cnpjFormatado : 'N/A', 's', getRowStyle(isEven, 'center'));
        writeCell(currentRow, 7, r.isValidChave ? r.ufNome : 'N/A', 's', getRowStyle(isEven, 'left'));
        writeCell(currentRow, 8, r.isValidChave ? r.tipoEmissaoFriendly : 'N/A', 's', getRowStyle(isEven, 'left'));
      }
      rowHeights.push({ hpt: 20 });
      currentRow++;
    });

    writeCell(currentRow, 0, 'TOTAL ACUMULADO DO LOTE', 's', styleGrandTotalLabel);
    writeCell(currentRow, 1, '', 's', styleGrandTotalLabel);
    writeCell(currentRow, 2, '', 's', styleGrandTotalLabel);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 2 } });
    writeCell(currentRow, 3, totalValue, 'n', styleGrandTotalValue, '"R$ " #,##0.00');

    for (let c = 4; c <= maxColIndex; c++) {
      writeCell(currentRow, c, '', 's', styleGrandTotalLabel);
    }
    rowHeights.push({ hpt: 26 });
    currentRow++;

    ws['!merges'] = merges;
    ws['!rows'] = rowHeights;

    const cols = [{ wch: 50 }, { wch: 24 }, { wch: 22 }, { wch: 28 }];
    if (includeExtras) {
      cols.push({ wch: 16 }, { wch: 16 }, { wch: 24 }, { wch: 26 }, { wch: 28 });
    }
    ws['!cols'] = cols;
    ws['!views'] = [{ showGridLines: false }];
    ws['!ref'] = `A1:${getCellRef(currentRow - 1, maxColIndex)}`;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, ws, 'Relatório NFC-e');
    XLSX.writeFile(workbook, customFileName);
  };

  // Switch between operation tabs and reset state
  const handleTabSwitch = (mode: 'nfce' | 'nfe_vendas' | 'nfe_compras') => {
    setFlowMode(mode);
    resetAll();
  };

  // Return the customized Title prefix for excel exports
  const getFlowTitle = () => {
    if (flowMode === 'nfce') return 'Auditoria NFC-e (Modelo 65)';
    if (flowMode === 'nfe_vendas') return 'Auditoria NF-e Vendas (Saídas)';
    return 'Auditoria NF-e Compras (Entradas)';
  };

  // If audit is active, render the Compliance Dashboard and detailed tables
  if (isAuditActive && auditSummary) {
    return (
      <div className="space-y-6 animate-fadeIn" id="audit-active-view">
        {/* Title Block of Audit */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[#04243b] text-[#e4b35e]">
                <FileCheck2 className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-extrabold text-[#04243b] tracking-tight" id="audit-title">
                {flowMode === 'nfce' ? 'Auditoria de Confronto de Dados - NFC-e' : 
                 flowMode === 'nfe_vendas' ? 'Auditoria de Confronto - NF-e Vendas (Saídas)' : 
                 'Auditoria de Confronto - NF-e Compras (Entradas)'}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 ml-9">
              {flowMode === 'nfce' ? 'Visualização cruzada de Modelo 65 entre a base da SEFAZ e o Relatório do ERP.' :
               flowMode === 'nfe_vendas' ? 'Confronto bidirecional e análise de lacunas (Gap Analysis) de faturamento de saída (Modelo 55).' :
               'Confronto bidirecional e análise de lacunas (Gap Analysis) de faturamento de compras (Modelo 55).'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="export-audit-excel-btn"
              onClick={() => exportAuditExcel(rows, auditItems, auditSummary, getFlowTitle())}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-bold text-xs transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Exportar Relatório Consolidado (.XLSX)
            </button>
            <button
              id="back-to-converter-btn"
              onClick={() => { setIsAuditActive(false); if (flowMode !== 'nfce') { resetAll(); } }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-xs transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Início
            </button>
          </div>
        </div>

        {/* Compliance Dashboard KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4" id="kpi-grid">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between" id="kpi-sincronizadas">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-sans">Sincronizadas (OK)</span>
              <span className="text-xl font-black text-emerald-600 font-mono mt-0.5 block">{auditSummary.sincronizadas}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Presente nas duas bases</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between" id="kpi-faltantes">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-sans">Omissão no ERP</span>
              <span className="text-xl font-black text-red-600 font-mono mt-0.5 block">{auditSummary.faltantesErp}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5 font-sans">Consta na SEFAZ, não no ERP</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between" id="kpi-divergencias">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-sans font-sans">Divergência SEFAZ</span>
              <span className="text-xl font-black text-amber-600 font-mono mt-0.5 block">{auditSummary.naoConstamSefaz}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Consta no ERP, não na SEFAZ</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between" id="kpi-divergencias-valor">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-sans">Divergência de Valor</span>
              <span className="text-xl font-black text-blue-600 font-mono mt-0.5 block">{auditSummary.divergenciasValor || 0}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Valores divergentes no ERP</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between" id="kpi-saltos">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-sans font-sans">Saltos de Sequência</span>
              <span className="text-xl font-black text-orange-600 font-mono mt-0.5 block">{auditSummary.saltosSequencia}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Lacuna na numeração do lote</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Audit List Table with search and status filter */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden" id="audit-table-card">
          <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs uppercase tracking-wider text-[#04243b] font-sans">
                Relatório Cruzado de Auditoria Bidirecional
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#04243b] text-white text-[10px] font-bold font-mono">
                {filteredAuditItems.length} registros
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <div className="relative flex-grow sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={auditSearchTerm}
                  onChange={(e) => setAuditSearchTerm(e.target.value)}
                  placeholder="Buscar nota, chave, emitente..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:border-[#04243b]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5">
                <button
                  onClick={() => setAuditFilterStatus('all')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer ${
                    auditFilterStatus === 'all' ? 'bg-[#04243b] text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Todas ({auditItems.length})
                </button>
                <button
                  onClick={() => setAuditFilterStatus('OK')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer ${
                    auditFilterStatus === 'OK' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Sincronizado ({auditSummary.sincronizadas})
                </button>
                <button
                  onClick={() => setAuditFilterStatus('FALTANTE_ERP')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer ${
                    auditFilterStatus === 'FALTANTE_ERP' ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Omissão ERP ({auditSummary.faltantesErp})
                </button>
                <button
                  onClick={() => setAuditFilterStatus('NAO_CONSTA_SEFAZ')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer ${
                    auditFilterStatus === 'NAO_CONSTA_SEFAZ' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Divergência SEFAZ ({auditSummary.naoConstamSefaz})
                </button>
                <button
                  onClick={() => setAuditFilterStatus('DIVERGENCIA_VALOR')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer ${
                    auditFilterStatus === 'DIVERGENCIA_VALOR' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Divergência Valor ({auditSummary.divergenciasValor || 0})
                </button>
                <button
                  onClick={() => setAuditFilterStatus('SALTO_SEQUENCIA')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer ${
                    auditFilterStatus === 'SALTO_SEQUENCIA' ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Salto ({auditSummary.saltosSequencia})
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Status de Auditoria</th>
                  <th className="py-3 px-4">Nº Nota</th>
                  <th className="py-3 px-4">Série</th>
                  <th className="py-3 px-4 text-right">Valor SEFAZ</th>
                  <th className="py-3 px-4 text-right">Valor ERP</th>
                  <th className="py-3 px-4 text-center">Diferença de Valor</th>
                  <th className="py-3 px-4">Data Emissão</th>
                  <th className="py-3 px-4">Info Adicional</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredAuditItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      Nenhum registro encontrado com os filtros atuais de auditoria.
                    </td>
                  </tr>
                ) : (
                  filteredAuditItems.map((item) => {
                    const diff = (item.sefazValue !== undefined && item.erpValue !== undefined) 
                      ? Number((item.sefazValue - item.erpValue).toFixed(2))
                      : 0;
                    const hasValueDiff = Math.abs(diff) > 0.01;

                    return (
                      <tr key={`audit-${item.nota}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4">
                          {item.status === 'OK' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 font-sans">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Sincronizado (OK)
                            </span>
                          ) : item.status === 'FALTANTE_ERP' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-red-50 text-red-700 font-bold text-[10px] border border-red-200 font-sans">
                              <ShieldAlert className="w-3 h-3 text-red-600" />
                              Omissão no ERP
                            </span>
                          ) : item.status === 'NAO_CONSTA_SEFAZ' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold text-[10px] border border-amber-200 font-sans">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Divergência SEFAZ
                            </span>
                          ) : item.status === 'DIVERGENCIA_VALOR' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[10px] border border-blue-200 font-sans">
                              <AlertCircle className="w-3 h-3 text-blue-600" />
                              Divergência de Valor
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-orange-50 text-orange-700 font-bold text-[10px] border border-orange-200 font-sans">
                              <AlertCircle className="w-3 h-3 text-orange-600" />
                              Salto de Sequência
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-[#04243b]">
                          {item.nota}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">
                          {item.serie || '1'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-700">
                          {item.sefazValue !== undefined ? `R$ ${item.sefazValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-700">
                          {item.erpValue !== undefined ? `R$ ${item.erpValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {item.status === 'OK' || item.status === 'DIVERGENCIA_VALOR' ? (
                            hasValueDiff ? (
                              <span className="inline-block px-2 py-0.5 rounded bg-red-50 text-red-700 font-bold text-[10px] border border-red-100 font-sans">
                                Dif: R$ {diff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-100 font-sans">
                                Valores Batem
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400 font-mono">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 font-mono text-[11px]">
                          {item.sefazDate || item.erpDate || '-'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[10px] text-slate-500 max-w-xs truncate" title={item.chaveDeAcesso || item.cliente}>
                          {item.chaveDeAcesso || item.cliente || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" id="config-module-root">
      {/* Title block */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[#04243b] text-[#e4b35e]">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-extrabold text-[#04243b] tracking-tight">
                Auditoria Fiscal - SIGA
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 ml-9 font-sans">
              Plataforma integrada de conversão e auditoria de documentos fiscais (NFC-e e NF-e).
            </p>
          </div>

          {rows.length > 0 && flowMode === 'nfce' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                id="export-direct-std-btn"
                onClick={() => handleDirectExport(false)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-bold text-xs transition-all shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Exportar Excel (Padrão)
              </button>
              <button
                id="export-direct-det-btn"
                onClick={() => handleDirectExport(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-all shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Exportar Detalhado
              </button>
              <button
                id="trigger-audit-modal-btn"
                onClick={() => setIsAuditModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-[#e4b35e] text-[#04243b] hover:bg-[#e4b35e]/10 bg-transparent font-extrabold text-xs transition-all shadow-xs cursor-pointer"
              >
                <ClipboardCheck className="w-4 h-4 text-[#e4b35e]" />
                Executar Auditoria de Dados
              </button>
              <button
                id="reset-conversion-btn"
                onClick={resetAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-xs transition-all cursor-pointer"
                title="Limpar e enviar novo arquivo"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Limpar
              </button>
            </div>
          )}
        </div>

        {/* Operation Selection switcher tab layout */}
        <div className="mt-5 border-t border-slate-100 pt-4" id="operation-selector-container">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2 font-sans">
            Seletor de Operação Fiscal
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200/60" id="operation-tabs">
            <button
              id="tab-flow-nfce"
              onClick={() => handleTabSwitch('nfce')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                flowMode === 'nfce' ? 'bg-[#04243b] text-[#e4b35e] shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Table className="w-4 h-4" />
              NFC-e (SIGA)
            </button>
            <button
              id="tab-flow-nfe-vendas"
              onClick={() => handleTabSwitch('nfe_vendas')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                flowMode === 'nfe_vendas' ? 'bg-[#04243b] text-[#e4b35e] shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <ArrowLeft className="w-4 h-4 rotate-180" />
              NF-e Vendas (Saídas)
            </button>
            <button
              id="tab-flow-nfe-compras"
              onClick={() => handleTabSwitch('nfe_compras')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                flowMode === 'nfe_compras' ? 'bg-[#04243b] text-[#e4b35e] shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
              NF-e Compras (Entradas)
            </button>
          </div>
        </div>
      </div>

      {/* RENDER MODE A: NFC-e Standard flow */}
      {flowMode === 'nfce' && (
        <>
          {/* Upload area when empty */}
          {rows.length === 0 ? (
            <div 
              id="nfce-dropzone"
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  handleFileProcess(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center bg-white shadow-xs ${
                isDragOver 
                  ? 'border-[#e4b35e] bg-[#e4b35e]/5' 
                  : 'border-slate-300 hover:border-[#04243b] hover:bg-slate-50/50'
              }`}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".csv,.txt"
                onChange={(e) => e.target.files && handleFileProcess(e.target.files[0])}
                className="hidden" 
              />
              <div className="w-16 h-16 rounded-2xl bg-[#04243b] flex items-center justify-center text-[#e4b35e] mb-4 shadow-sm">
                <Upload className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-[#04243b] font-sans">
                Arraste o arquivo CSV da SEFAZ ou clique para selecionar. O sistema identifica automaticamente modelos 55 e 65.
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md font-sans">
                O sistema extrai automaticamente chaves de acesso de 44 dígitos, datas de emissão, números das notas e valores consolidados.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-200 font-sans">
                Formatos suportados: CSV (separado por ponto e vírgula ou vírgula)
              </span>
            </div>
          ) : (
            <>
              {/* Stats KPI grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="nfce-stats-grid">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-sans">Total de Notas</span>
                    <span className="text-xl font-black text-[#04243b] font-mono mt-0.5 block">{stats.totalCount}</span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#04243b]/5 text-[#04243b] flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-sans">Valor Acumulado</span>
                    <span className="text-xl font-black text-emerald-600 font-mono mt-0.5 block">
                      R$ {stats.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-sans">Período Identificado</span>
                    <span className="text-xs font-bold text-[#04243b] mt-1 block font-mono">
                      {stats.periodo ? `${stats.periodo.inicio} a ${stats.periodo.fim}` : 'Período não identificado'}
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5 font-sans">Com base na data de emissão</span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#e4b35e]/15 text-[#e4b35e] flex items-center justify-center">
                    <Calendar className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Table section with search and filter */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden" id="nfce-table-card">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-[#04243b] font-sans">
                      Pré-visualização do Relatório processado
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#04243b] text-white text-[10px] font-bold font-mono">
                      {filteredRows.length} de {rows.length}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-grow sm:w-64">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por chave, nota, data..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:border-[#04243b]"
                      />
                    </div>

                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5">
                      <button
                        onClick={() => setFilterStatus('all')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          filterStatus === 'all' ? 'bg-[#04243b] text-white' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Todas
                      </button>
                      <button
                        onClick={() => setFilterStatus('valid')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          filterStatus === 'valid' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Válidas
                      </button>
                      <button
                        onClick={() => setFilterStatus('invalid')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          filterStatus === 'invalid' ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Inválidas
                      </button>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Nº Nota</th>
                        <th className="py-3 px-4">Data Emissão</th>
                        <th className="py-3 px-4 text-right">Valor R$</th>
                        <th className="py-3 px-4">Chave de Acesso</th>
                        <th className="py-3 px-4">UF</th>
                        <th className="py-3 px-4">Série / Mod</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-slate-400">
                            Nenhum registro encontrado com os filtros atuais.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-4">
                              {r.isValidChave ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 font-sans">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Válida
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-bold text-[10px] border border-red-200 font-sans" title={r.chaveError}>
                                  <AlertTriangle className="w-3 h-3 text-red-600" />
                                  Inválida
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 font-mono font-bold text-[#04243b]">
                              {r.numeroNotaFormatado}
                            </td>
                            <td className="py-2.5 px-4 text-slate-700 font-mono">
                              {r.dataEmissao}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">
                              R$ {r.valorDecimal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600 select-all max-w-xs truncate" title={r.chaveDeAcesso}>
                              {r.chaveDeAcesso || '-'}
                            </td>
                            <td className="py-2.5 px-4 text-slate-700">
                              {r.ufNome || '-'}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600 font-mono text-[11px]">
                              {r.isValidChave ? `S.${r.serie} / Mod.${r.modelo}` : '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* RENDER MODE B & C: NF-e Vendas (Saídas) & Compras (Entradas) - Joint Dual Upload */}
      {(flowMode === 'nfe_vendas' || flowMode === 'nfe_compras') && (
        <div className="space-y-6" id="nfe-dual-container">
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-3 text-slate-600">
            <AlertCircle className="w-5 h-5 text-[#C5A059] shrink-0" />
            <p className="text-xs leading-relaxed font-sans">
              Os fluxos de auditoria estratégica de NF-e (Modelo 55) exigem o carregamento concomitante da base oficial da <strong>SEFAZ</strong> e do <strong>Relatório do ERP Contábil</strong> para a realização do confronto bidirecional e detecção automática de omissões e lacunas numéricas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="nfe-upload-grid">
            {/* Box 1: SEFAZ File */}
            <div 
              id="sefaz-dropzone-box"
              onDragOver={(e) => { e.preventDefault(); setSefazDragOver(true); }}
              onDragLeave={() => setSefazDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSefazDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  setSefazFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => sefazFileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center bg-white shadow-xs min-h-[220px] ${
                sefazDragOver 
                  ? 'border-[#e4b35e] bg-[#e4b35e]/5' 
                  : sefazFile 
                    ? 'border-emerald-500 bg-emerald-50/20' 
                    : 'border-slate-300 hover:border-[#04243b] hover:bg-slate-50/50'
              }`}
            >
              <input 
                ref={sefazFileInputRef}
                type="file" 
                accept=".csv,.txt"
                onChange={(e) => e.target.files && setSefazFile(e.target.files[0])}
                className="hidden" 
              />
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 shadow-sm ${
                sefazFile ? 'bg-emerald-600 text-white' : 'bg-[#04243b] text-[#e4b35e]'
              }`}>
                {sefazFile ? <CheckCircle2 className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
              </div>
              <h3 className="text-sm font-bold text-[#04243b] font-sans">
                {sefazFile ? `Carregado: ${sefazFile.name}` : 'Arquivo SEFAZ (Modelo 55)'}
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs font-sans">
                {sefazFile 
                  ? `${(sefazFile.size / 1024).toFixed(1)} KB - Clique ou arraste para substituir` 
                  : 'Arraste os arquivos CSV (SEFAZ e ERP) ou clique para selecionar. O sistema identifica automaticamente modelos 55 e 65.'}
              </p>
            </div>

            {/* Box 2: ERP Contábil File */}
            <div 
              id="erp-dropzone-box"
              onDragOver={(e) => { e.preventDefault(); setErpDragOver(true); }}
              onDragLeave={() => setErpDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setErpDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  setErpFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => erpFileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center bg-white shadow-xs min-h-[220px] ${
                erpDragOver 
                  ? 'border-[#e4b35e] bg-[#e4b35e]/5' 
                  : erpFile 
                    ? 'border-emerald-500 bg-emerald-50/20' 
                    : 'border-slate-300 hover:border-[#04243b] hover:bg-slate-50/50'
              }`}
            >
              <input 
                ref={erpFileInputRef}
                type="file" 
                accept=".csv,.txt"
                onChange={(e) => e.target.files && setErpFile(e.target.files[0])}
                className="hidden" 
              />
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 shadow-sm ${
                erpFile ? 'bg-emerald-600 text-white' : 'bg-[#04243b] text-[#e4b35e]'
              }`}>
                {erpFile ? <CheckCircle2 className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
              </div>
              <h3 className="text-sm font-bold text-[#04243b] font-sans">
                {erpFile ? `Carregado: ${erpFile.name}` : 'Relatório do ERP Contábil'}
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs font-sans">
                {erpFile 
                  ? `${(erpFile.size / 1024).toFixed(1)} KB - Clique ou arraste para substituir` 
                  : 'Arraste os arquivos CSV (SEFAZ e ERP) ou clique para selecionar. O sistema identifica automaticamente modelos 55 e 65.'}
              </p>
            </div>
          </div>

          {/* Action trigger button when both are selected */}
          {sefazFile && erpFile ? (
            <div className="bg-[#04243b]/5 border-2 border-dashed border-[#e4b35e]/40 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn" id="run-audit-action-bar">
              <div>
                <h4 className="font-extrabold text-[#04243b] text-sm font-sans">Ambos os relatórios fiscais carregados com sucesso!</h4>
                <p className="text-xs text-slate-500 mt-1 font-sans">Clique ao lado para processar o cruzamento bidirecional e detecção de saltos numéricos.</p>
              </div>
              <button
                id="process-dual-audit-btn"
                onClick={handleDualProcess}
                className="px-6 py-3 rounded-xl bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-extrabold text-xs tracking-wider uppercase transition-all shadow-md hover:shadow-lg cursor-pointer shrink-0"
              >
                Processar Confronto de Auditoria
              </button>
            </div>
          ) : (
            <div className="text-center p-4 text-slate-400 text-xs font-sans">
              Carregue os dois arquivos acima para habilitar o botão de processamento.
            </div>
          )}
        </div>
      )}

      {/* Modal de Upload do ERP (only used during the NFC-e flow) */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs" id="audit-modal">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden animate-fadeIn">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-[#C5A059]" />
                <h3 className="font-extrabold text-[#001F3F] text-sm uppercase tracking-tight font-sans">
                  Iniciar Auditoria de Dados NFC-e
                </h3>
              </div>
              <button 
                onClick={() => setIsAuditModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                Para confrontar as notas fiscais processadas da SEFAZ com o seu ERP Contábil, faça o upload do relatório de faturamento de saídas.
              </p>

              <div 
                id="modal-drag-area"
                onDragOver={(e) => { e.preventDefault(); setDragOverModal(true); }}
                onDragLeave={() => setDragOverModal(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverModal(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleErpFileProcess(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => erpFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                  dragOverModal 
                    ? 'border-[#e4b35e] bg-[#e4b35e]/5' 
                    : 'border-slate-300 hover:border-[#04243b] hover:bg-slate-50/50'
                }`}
              >
                <input 
                  ref={erpFileInputRef}
                  type="file" 
                  accept=".csv,.txt"
                  onChange={(e) => e.target.files && handleErpFileProcess(e.target.files[0])}
                  className="hidden" 
                />
                <div className="w-12 h-12 rounded-xl bg-[#04243b]/5 text-[#04243b] flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6 text-[#e4b35e]" />
                </div>
                <h4 className="text-xs font-bold text-[#04243b] font-sans">
                  Selecione ou arraste o Relatório do ERP
                </h4>
                <p className="text-[10px] text-slate-400 mt-1 font-sans">
                  Suporta arquivos .csv ou .txt (separadores vírgula ou ponto e vírgula)
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block font-sans">
                  Instruções de Formato ERP
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block leading-relaxed font-sans">
                  O relatório contábil deve conter colunas de <strong className="text-slate-700 font-sans">Nota</strong>, <strong className="text-slate-700 font-sans">Data Emissão</strong>, <strong className="text-slate-700 font-sans">Série</strong> e <strong className="text-slate-700 font-sans">Valor Contábil</strong>.
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer font-sans"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROGRESS TRACKING OVERLAY */}
      {isProcessing && (
        <div className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fadeIn" id="processing-overlay">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 max-w-md w-full shadow-2xl text-center space-y-6">
            <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
              {/* Spinning background track */}
              <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
              {/* Dynamic progress circle */}
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  className="stroke-[#04243b] stroke-[5] fill-none transition-all duration-300"
                  strokeDasharray={251.2}
                  strokeDashoffset={251.2 - (251.2 * processingProgress) / 100}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-base font-black text-[#04243b] font-mono">{processingProgress}%</span>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-extrabold text-[#04243b] font-sans">
                Processando Documentos Fiscais
              </h3>
              <p className="text-xs text-[#e4b35e] font-extrabold font-sans tracking-wide">
                {processingStage}
              </p>
            </div>

            {/* Horizontal progress bar */}
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-[#e4b35e] h-full rounded-full transition-all duration-300"
                style={{ width: `${processingProgress}%` }}
              ></div>
            </div>

            <p className="text-[10px] text-slate-400 font-sans leading-normal">
              Otimizado para processar arquivos extremamente grandes sem congelar o navegador. Aguarde alguns instantes...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
