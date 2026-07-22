/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  Table,
  Database,
  TrendingUp,
  Coins,
  Package,
  Percent,
  Info,
  Building2,
  FileUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ClipboardType,
  ArrowUpRight,
  ArrowDownLeft,
  Combine
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
import {
  PisCofinsItem,
  PisCofinsMetadata,
  PisCofinsConsolidatedItem,
  parsePisCofinsReport,
  parsePisCofinsReportAsync,
  consolidatePisCofinsRows,
  exportPisCofinsExcel,
  PisCofinsAuditError,
  auditPisCofinsReport
} from '../utils/pisCofinsHelper';
import { SAMPLE_RAW_REPORT } from '../data/sampleReport';

// Interface structures
export interface ReportItem {
  notaFiscal: string;
  data: string;
  cnpj: string;
  cfop: string;
  codigoProduto: string;
  nomeProduto: string;
  ncm: string;
  un: string;
  qtde: number;
  rUnit: number;
  rProduto: number;
  desconto: number;
  vlrContabil: number;
  cst: string;
  rBaseIcms: number;
  pIcms: number;
  rIcms: number;
  pIpi: number;
  rIpi: number;
}

export interface ReportMetadata {
  empresa: string;
  periodo: string;
  dataGeracao: string;
}

const BRAND_CONFIG = {
  COMPANY_NAME: 'MOREIRA & LIMA CONTADORES ASSOCIADOS',
  SUBTITLE: 'WORKSPACE COCKPIT FISCAL & DATA LAKE DE AUDITORIA',
} as const;

const CFOP_DESC: Record<string, string> = {
  '1-403': 'Compra p/ revenda sujeita a Substituição Tributária (ST)',
  '5-405': 'Venda de mercadoria c/ ST cobrado anteriormente',
  '5-910': 'Remessa em bonificação, doação ou brinde',
  '5-949': 'Outra saída de mercadoria ou prestação não especificada',
  '1403': 'Compra p/ revenda sujeita a Substituição Tributária (ST)',
  '5405': 'Venda de mercadoria c/ ST cobrado anteriormente',
  '5910': 'Remessa em bonificação, doação ou brinde',
  '5949': 'Outra saída de mercadoria ou prestação não especificada',
};

const CST_DESC: Record<string, string> = {
  '00': 'Tributada integralmente',
  '10': 'Tributada e com cobrança do ICMS por ST',
  '20': 'Com redução de base de cálculo',
  '30': 'Isenta ou não tributada e com cobrança do ICMS por ST',
  '40': 'Isenta',
  '41': 'Não tributada',
  '50': 'Suspensão',
  '51': 'Diferimento',
  '60': 'ICMS cobrado anteriormente por substituição tributária',
  '70': 'Com redução de base de cálculo e cobrança do ICMS por ST',
  '90': 'Outras',
  '260': 'Estrangeira - Adquirida no mercado interno c/ ICMS ST',
  '560': 'Nacional, com cobrança anterior de ICMS por ST (venda simples)'
};

// Pt-Br float parser helper
function parsePtBrFloat(val: string): number {
  if (!val) return 0;
  let clean = val.replace(/[R$\s]/g, '').trim();
  if (clean === '' || clean === '-') return 0;
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const num = parseFloat(clean);
  return Number.isNaN(num) ? 0 : num;
}

// Helpers for Document type and formatting
export function formatDocument(raw: string): string {
  if (!raw) return '';
  if (raw === 'DIVERSOS' || raw === 'DIVERSO') return 'DIVERSOS';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.substring(0, 3)}.${digits.substring(3, 6)}.${digits.substring(6, 9)}-${digits.substring(9, 11)}`;
  }
  if (digits.length === 14) {
    return `${digits.substring(0, 2)}.${digits.substring(2, 5)}.${digits.substring(5, 8)}/${digits.substring(8, 12)}-${digits.substring(12, 14)}`;
  }
  return raw;
}

export function getDocumentType(raw: string): 'PF' | 'PJ' | 'Outro' {
  if (!raw) return 'Outro';
  if (raw === 'DIVERSOS' || raw === 'DIVERSO') return 'Outro';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return 'PF';
  if (digits.length === 14) return 'PJ';
  return 'Outro';
}

// Helper to group and sum duplicate products by CFOP and CST
function aggregateDuplicates(items: ReportItem[]): ReportItem[] {
  const grouped: Record<string, { item: ReportItem; nfs: Set<string>; dates: Set<string>; cnpjs: Set<string> }> = {};

  items.forEach(item => {
    const key = `${item.codigoProduto || ''}_${item.nomeProduto}_${item.cfop}_${item.cst}`;

    if (!grouped[key]) {
      grouped[key] = {
        item: { ...item },
        nfs: new Set<string>([item.notaFiscal]),
        dates: new Set<string>([item.data]),
        cnpjs: new Set<string>([item.cnpj])
      };
    } else {
      const entry = grouped[key];
      entry.item.qtde += item.qtde;
      entry.item.rProduto += item.rProduto;
      entry.item.desconto += item.desconto;
      entry.item.vlrContabil += item.vlrContabil;
      entry.item.rBaseIcms += item.rBaseIcms;
      entry.item.rIcms += item.rIcms;
      entry.item.rIpi += item.rIpi;
      
      if (item.notaFiscal) entry.nfs.add(item.notaFiscal);
      if (item.data) entry.dates.add(item.data);
      if (item.cnpj) entry.cnpjs.add(item.cnpj);
    }
  });

  return Object.values(grouped).map(entry => {
    const { item, nfs, dates, cnpjs } = entry;
    
    const uniqueNfs = Array.from(nfs).filter(Boolean).sort();
    if (uniqueNfs.length === 0) {
      item.notaFiscal = '';
    } else if (uniqueNfs.length === 1) {
      item.notaFiscal = uniqueNfs[0];
    } else if (uniqueNfs.length <= 3) {
      item.notaFiscal = uniqueNfs.join(', ');
    } else {
      item.notaFiscal = `CONSOLIDADO (${uniqueNfs.length} NFs)`;
    }

    const uniqueDates = Array.from(dates).filter(Boolean).sort();
    if (uniqueDates.length === 1) {
      item.data = uniqueDates[0];
    } else {
      item.data = 'DIVERSAS';
    }

    const uniqueCnpjs = Array.from(cnpjs).filter(Boolean);
    if (uniqueCnpjs.length === 1) {
      item.cnpj = uniqueCnpjs[0];
    } else {
      item.cnpj = 'DIVERSOS';
    }

    if (item.qtde > 0) {
      item.rUnit = item.rProduto / item.qtde;
    } else {
      item.rUnit = 0;
    }

    return item;
  });
}

export function AuditoriaFiscalWorkspace() {
  // Navigation tabs for the unified output views
  const [activeOutputTab, setActiveOutputTab] = useState<'confronto' | 'organizador' | 'integridade' | 'conversor_siga' | 'pis_cofins'>('confronto');

  // Sub-blocks subdivisions state
  const [activeMainModule, setActiveMainModule] = useState<'siga' | 'icms' | 'pis_cofins'>('icms');

  // Unified Data Lake loaded files state
  const [loadedFiles, setLoadedFiles] = useState<Array<{ name: string; size: number; type: 'sefaz' | 'erp' | 'siga_tax' | 'pis_cofins'; recordsCount: number }>>([]);

  // Master Data Lake Datasets
  const [sefazRows, setSefazRows] = useState<InvoiceRow[]>([]);
  const [rawSefazText, setRawSefazText] = useState<string>('');
  const [erpRowsText, setErpRowsText] = useState<string>('');
  const [sigaTaxText, setSigaTaxText] = useState<string>('');

  // PIS/COFINS Report Specific State
  const [pisCofinsRows, setPisCofinsRows] = useState<PisCofinsItem[]>([]);
  const [pisCofinsMetadata, setPisCofinsMetadata] = useState<PisCofinsMetadata | null>(null);
  const [pisCofinsCriteria, setPisCofinsCriteria] = useState<'cfop_cst' | 'cfop_cst_product'>('cfop_cst');
  const [activePisCofinsSubTab, setActivePisCofinsSubTab] = useState<'entradas' | 'saidas' | 'consolidado' | 'todos' | 'auditoria'>('todos');
  const [pisCofinsViewMode, setPisCofinsViewMode] = useState<'original' | 'consolidated'>('original');
  const [searchTermPisCofins, setSearchTermPisCofins] = useState<string>('');
  const [pisCofinsCurrentPage, setPisCofinsCurrentPage] = useState<number>(1);
  const pisCofinsItemsPerPage = 50;

  // PIS/COFINS Audit state
  const [selectedPisCofinsAuditError, setSelectedPisCofinsAuditError] = useState<PisCofinsAuditError | null>(null);
  const [pisCofinsActiveAuditFilter, setPisCofinsActiveAuditFilter] = useState<'todos' | 'divergencia_bc' | 'erro_calculo_pis' | 'erro_calculo_cofins' | 'cst_incompativel' | 'aliquota_incoerente' | 'bc_maior_produto'>('todos');
  const [enablePisCofinsAlerts, setEnablePisCofinsAlerts] = useState<boolean>(false);

  const pisCofinsAuditErrors = useMemo(() => {
    if (!enablePisCofinsAlerts) return [];
    return auditPisCofinsReport(pisCofinsRows);
  }, [pisCofinsRows, enablePisCofinsAlerts]);

  // Siga/Organizador Relatorio specific state
  const [organizadorEntradas, setOrganizadorEntradas] = useState<ReportItem[]>([]);
  const [organizadorSaidas, setOrganizadorSaidas] = useState<ReportItem[]>([]);
  const [organizadorMetadata, setOrganizadorMetadata] = useState<ReportMetadata | null>(null);
  const [groupDuplicates, setGroupDuplicates] = useState<boolean>(false);
  const [orgSearchTerm, setOrgSearchTerm] = useState<string>('');
  const [orgCfopFilter, setOrgCfopFilter] = useState<string>('all');
  const [orgCstFilter, setOrgCstFilter] = useState<string>('all');
  const [orgCurrentPage, setOrgCurrentPage] = useState<number>(1);
  const [activeOrgSubTab, setActiveOrgSubTab] = useState<'entradas' | 'saidas' | 'auditoria'>('entradas');
  const itemsPerPage = 12;

  // NFC-e / SIGA access key analysis specific state
  const [searchTermNfce, setSearchTermNfce] = useState<string>('');
  const [filterStatusNfce, setFilterStatusNfce] = useState<'all' | 'valid' | 'invalid'>('all');

  // Bilateral Cross-Audit results
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [auditSearchTerm, setAuditSearchTerm] = useState<string>('');
  const [auditFilterStatus, setAuditFilterStatus] = useState<string>('all');

  // Drag and drop states
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isGlobalDragOver, setIsGlobalDragOver] = useState<boolean>(false);
  const dragCounter = useRef<number>(0);
  const processFilesRef = useRef<((files: File[]) => void) | null>(null);

  const handleDragEnter = (e: DragEvent | React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsGlobalDragOver(true);
    }
  };

  const handleDragLeave = (e: DragEvent | React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setIsGlobalDragOver(false);
      dragCounter.current = 0;
    }
  };

  const handleDragOver = (e: DragEvent | React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent | React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsGlobalDragOver(false);
    dragCounter.current = 0;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFilesRef.current?.(Array.from(e.dataTransfer.files));
    }
  };

  const handleDeleteFile = (fileName: string, type: 'sefaz' | 'erp' | 'siga_tax' | 'pis_cofins') => {
    setLoadedFiles(prev => prev.filter(f => f.name !== fileName));
    if (type === 'sefaz') {
      setSefazRows([]);
      setRawSefazText('');
      setAuditItems([]);
      setAuditSummary(null);
    } else if (type === 'erp') {
      setErpRowsText('');
      setAuditItems([]);
      setAuditSummary(null);
    } else if (type === 'siga_tax') {
      setSigaTaxText('');
      setOrganizadorEntradas([]);
      setOrganizadorSaidas([]);
      setOrganizadorMetadata(null);
    } else if (type === 'pis_cofins') {
      setPisCofinsRows([]);
      setPisCofinsMetadata(null);
    }
  };

  const availableTabs = useMemo(() => {
    if (!loadedFiles || loadedFiles.length === 0) {
      return ['confronto', 'organizador', 'integridade', 'conversor_siga', 'pis_cofins'] as const;
    }
    const hasSefaz = loadedFiles.some(f => f.type === 'sefaz');
    const hasErp = loadedFiles.some(f => f.type === 'erp' || f.type === 'siga_tax');
    const hasSiga = loadedFiles.some(f => f.type === 'siga_tax');
    const hasPisCofins = loadedFiles.some(f => f.type === 'pis_cofins');

    const tabs: Array<'confronto' | 'organizador' | 'integridade' | 'conversor_siga' | 'pis_cofins'> = [];
    if (hasSefaz && hasErp) {
      tabs.push('confronto');
      tabs.push('integridade');
    }
    if (hasSiga) {
      tabs.push('organizador');
    }
    if (hasSefaz) {
      tabs.push('conversor_siga');
    }
    if (hasPisCofins || (!hasSefaz && !hasErp && !hasSiga)) {
      tabs.push('pis_cofins');
    }
    return tabs;
  }, [loadedFiles]);

  useEffect(() => {
    if (!availableTabs.includes(activeOutputTab)) {
      if (availableTabs.length > 0) {
        setActiveOutputTab(availableTabs[0]);
      }
    }
  }, [availableTabs, activeOutputTab]);

  useEffect(() => {
    processFilesRef.current = handleProcessMultipleFiles;
  });

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => handleDragEnter(e);
    const onDragLeave = (e: DragEvent) => handleDragLeave(e);
    const onDragOver = (e: DragEvent) => handleDragOver(e);
    const onDrop = (e: DragEvent) => handleDrop(e);

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // Background Async Processing State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingStage, setProcessingStage] = useState<string>('');

  // --------------------------------------------------------
  // Auto-Detect & Parse files uploaded to the Universal Data Lake
  // --------------------------------------------------------
  const handleProcessMultipleFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    setProcessingProgress(5);
    setProcessingStage('Analisando arquivos e indexando chaves no Data Lake...');

    // Process files sequentially or in parallel
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string || '');
        reader.readAsText(file, 'utf-8');
      });

      const pctBase = Math.round((i / files.length) * 80);
      setProcessingProgress(5 + pctBase);

      if (!text.trim()) continue;

      // Automatic Detection Logic:
      // Case 1: PIS/COFINS Report
      if (
        text.toLowerCase().includes('demonstração dos créditos do pis') ||
        text.toLowerCase().includes('crédito vinculado à receita') ||
        text.toLowerCase().includes('entradas sem direito a créditos') ||
        text.toLowerCase().includes('b. c. créd.') ||
        text.toLowerCase().includes('informações dos produtos nas notas de entrada') ||
        text.toLowerCase().includes('informações dos produtos nas notas de saída') ||
        text.toLowerCase().includes('informacoes dos produtos nas notas de entrada') ||
        text.toLowerCase().includes('informacoes dos produtos nas notas de saida') ||
        text.toLowerCase().includes('sped pis/cofins') ||
        text.toLowerCase().includes('notas fiscais de entradas - sped') ||
        text.toLowerCase().includes('notas fiscais de saídas - sped') ||
        text.toLowerCase().includes('notas fiscais de saidas - sped') ||
        text.toLowerCase().includes('dados guia estoque notas de entrada') ||
        text.toLowerCase().includes('dados guia estoque notas de saída') ||
        text.toLowerCase().includes('dados guia estoque notas de saida')
      ) {
        setProcessingStage(`Identificado: Demonstrativo PIS/COFINS (${file.name})`);
        const { items: parsedItems, metadata: parsedMetadata } = await parsePisCofinsReportAsync(text, (pct) => {
          setProcessingProgress(Math.min(95, 5 + pctBase + Math.round(pct * 0.1)));
        });
        setPisCofinsRows(prev => {
          const seen = new Set<string>();
          prev.forEach(item => {
            const key = `${item.tipo}_${item.numeroNota}_${item.codigoProduto}_${item.cfop}_${item.data}_${item.valorProduto}`;
            seen.add(key);
          });
          const uniqueNewItems = parsedItems.filter(item => {
            const key = `${item.tipo}_${item.numeroNota}_${item.codigoProduto}_${item.cfop}_${item.data}_${item.valorProduto}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return [...prev, ...uniqueNewItems];
        });
        setPisCofinsMetadata(parsedMetadata);
        updateDataLakeFilesList(file.name, file.size, 'pis_cofins', parsedItems.length);
      }
      // Case 2: Organizador de Relatório (Siga Tax / Movimentação / ERP)
      else if (
        text.toLowerCase().includes('notas fiscais de entrada') || 
        text.toLowerCase().includes('notas fiscais de saída') ||
        text.toLowerCase().includes('notas fiscais de saida') ||
        (text.includes(';') && text.toLowerCase().includes('nota fiscal') && text.toLowerCase().includes('cfop') && text.toLowerCase().includes('cst'))
      ) {
        setProcessingStage(`Identificado: Relatório Siga Impostos / ERP (${file.name})`);
        setSigaTaxText(text);
        setErpRowsText(text);
        parseSigaTaxReport(text);
        updateDataLakeFilesList(file.name, file.size, 'siga_tax', 1); // count will be detailed upon parsing
      }
      // Case 3: SEFAZ Access Keys
      else if (
        text.toLowerCase().includes('chave') || 
        text.toLowerCase().includes('chv_aces') ||
        text.toLowerCase().includes('indicadores selecionados') ||
        /\b\d{44}\b/.test(text)
      ) {
        setProcessingStage(`Identificado: Notas de Venda SEFAZ (${file.name})`);
        setRawSefazText(text);
        const parsedSefaz = await parseSefazReportAsync(text, (pct) => {
          setProcessingProgress(5 + pctBase + Math.round(pct * 0.1));
        });
        setSefazRows(parsedSefaz);
        updateDataLakeFilesList(file.name, file.size, 'sefaz', parsedSefaz.length);
      }
      // Case 4: ERP Records
      else {
        setProcessingStage(`Identificado: Lançamentos ERP Contábil (${file.name})`);
        setErpRowsText(text);
        updateDataLakeFilesList(file.name, file.size, 'erp', text.split('\n').length - 1);
      }
    }

    setProcessingProgress(90);
    setProcessingStage('Finalizando normalização e cruzando registros...');
    setIsProcessing(false);
  };

  const updateDataLakeFilesList = (name: string, size: number, type: 'sefaz' | 'erp' | 'siga_tax' | 'pis_cofins', count: number) => {
    setLoadedFiles(prev => {
      const filtered = prev.filter(f => f.name !== name);
      return [...filtered, { name, size, type, recordsCount: count }];
    });
  };

  // Siga/Organizador specific text parser
  const parseSigaTaxReport = (text: string) => {
    const lines = text.split(/\r?\n/);
    const parsedEntradas: ReportItem[] = [];
    const parsedSaidas: ReportItem[] = [];
    let currentSection: 'entrada' | 'saida' | null = null;
    let empresa = '';
    let periodo = '';
    let dataGeracao = '';

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      if (line.toLowerCase().includes('notas fiscais de entrada')) {
        currentSection = 'entrada';
        continue;
      } else if (line.toLowerCase().includes('notas fiscais de saída') || line.toLowerCase().includes('notas fiscais de saida')) {
        currentSection = 'saida';
        continue;
      }

      if (line.includes('DISTRIBUIDORA') || line.includes('PRODUTOS ALIMENTICIO') || line.includes('LTDA')) {
        const parts = line.split(';');
        if (parts[0] && !empresa) {
          empresa = parts[0].trim();
        }
      }
      if (line.includes('De:') && line.includes('até:')) {
        const parts = line.split(';');
        const pText = parts[0] || '';
        if (pText) {
          periodo = pText.replace(/\s+/g, ' ').trim();
        }
        const datePart = parts.find(p => p.toLowerCase().includes('data:'));
        if (datePart) {
          dataGeracao = datePart.replace(/data:/i, '').trim();
        }
      }

      if (line.startsWith('Nota Fiscal;;') || line.includes('Total de Notas Fiscais') || line.startsWith(';;;;;')) {
        continue;
      }

      const parts = line.split(';');
      if (parts.length >= 15 && parts[0] && /^\d+$/.test(parts[0].trim())) {
        const item: ReportItem = {
          notaFiscal: parts[0].trim(),
          data: parts[2] ? parts[2].trim() : '',
          cnpj: parts[4] ? formatDocument(parts[4].trim().replace(/\s+-\s*$/, '')) : '',
          cfop: parts[6] ? parts[6].trim() : '',
          codigoProduto: '',
          nomeProduto: '',
          ncm: parts[13] ? parts[13].trim() : '',
          un: parts[15] ? parts[15].trim() : '',
          qtde: parsePtBrFloat(parts[17]),
          rUnit: parsePtBrFloat(parts[19]),
          rProduto: parsePtBrFloat(parts[21]),
          desconto: parsePtBrFloat(parts[22]),
          vlrContabil: parsePtBrFloat(parts[24]),
          cst: parts[25] ? parts[25].trim() : '',
          rBaseIcms: parsePtBrFloat(parts[27]),
          pIcms: parsePtBrFloat(parts[29]),
          rIcms: parsePtBrFloat(parts[31]),
          pIpi: parsePtBrFloat(parts[35]),
          rIpi: parsePtBrFloat(parts[37]),
        };

        const rawProduct = parts[8] || '';
        const hyphenIndex = rawProduct.indexOf(' - ');
        if (hyphenIndex !== -1) {
          item.codigoProduto = rawProduct.substring(0, hyphenIndex).trim();
          item.nomeProduto = rawProduct.substring(hyphenIndex + 3).trim();
        } else {
          item.nomeProduto = rawProduct.trim();
        }

        if (currentSection === 'entrada') {
          parsedEntradas.push(item);
        } else if (currentSection === 'saida') {
          parsedSaidas.push(item);
        }
      }
    }

    setOrganizadorEntradas(parsedEntradas);
    setOrganizadorSaidas(parsedSaidas);
    setOrganizadorMetadata({
      empresa: empresa || 'SL DISTRIBUIDORA DE PRODUTOS ALIMENTICIO',
      periodo: periodo || 'Período não identificado',
      dataGeracao: dataGeracao || new Date().toLocaleDateString('pt-BR'),
    });

    setLoadedFiles(prev => {
      const idx = prev.findIndex(f => f.type === 'siga_tax');
      if (idx !== -1) {
        prev[idx].recordsCount = parsedEntradas.length + parsedSaidas.length;
      }
      return [...prev];
    });
  };

  // Run Bilateral Strategic Reconciliation
  const handleTriggerStrategicConciliation = async () => {
    if (sefazRows.length === 0) {
      alert('Carregue pelo menos um relatório SEFAZ de Notas para cruzar!');
      return;
    }
    if (!erpRowsText.trim()) {
      alert('Carregue também um extrato ou relatório ERP para cruzar com a SEFAZ!');
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStage('Carregando extratos do ERP contábil...');

    try {
      const parsedErp = await parseErpReportAsync(erpRowsText, (pct) => {
        setProcessingProgress(Math.round(pct * 0.4));
      });

      setProcessingStage('Executando confronto bidirecional indexado...');
      const { items, summary } = await executeDataAuditAsync(sefazRows, parsedErp, (pct) => {
        setProcessingProgress(40 + Math.round(pct * 0.6));
      });

      setAuditItems(items);
      setAuditSummary(summary);
      setActiveMainModule('icms');
      setActiveOutputTab('confronto');
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveSefazDuplicates = () => {
    if (sefazRows.length === 0) return;
    const cleanSefazRows: InvoiceRow[] = [];
    const seenKeys = new Set<string>();
    sefazRows.forEach(row => {
      const key = row.chaveDeAcesso && row.chaveDeAcesso.trim() !== ''
        ? row.chaveDeAcesso.trim()
        : `NOTA_${row.numeroNota}_SERIE_${row.serie}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        cleanSefazRows.push(row);
      }
    });

    setSefazRows(cleanSefazRows);

    // Update loadedFiles recordCount for SEFAZ
    setLoadedFiles(prev => prev.map(f => {
      if (f.type === 'sefaz') {
        return { ...f, recordsCount: cleanSefazRows.length };
      }
      return f;
    }));

    // If an ERP file is also loaded, automatically re-run the strategic conciliation with the cleaned data!
    if (erpRowsText.trim()) {
      setIsProcessing(true);
      setProcessingProgress(0);
      setProcessingStage('Removendo duplicatas e reprocessando confronto...');
      setTimeout(async () => {
        try {
          const parsedErp = await parseErpReportAsync(erpRowsText, (pct) => {
            setProcessingProgress(Math.round(pct * 0.4));
          });
          const { items, summary } = await executeDataAuditAsync(cleanSefazRows, parsedErp, (pct) => {
            setProcessingProgress(40 + Math.round(pct * 0.6));
          });
          setAuditItems(items);
          setAuditSummary(summary);
        } catch (e) {
          console.error(e);
        } finally {
          setIsProcessing(false);
        }
      }, 300);
    }
  };

  // Load Preset Mock Database (for high-fidelity demo & testing)
  const handleLoadSampleDatabase = async () => {
    setIsProcessing(true);
    setProcessingProgress(15);
    setProcessingStage('Indexando base SEFAZ fictícia...');

    // Simulate database seeding
    setTimeout(() => {
      setProcessingProgress(45);
      setProcessingStage('Alocando registros ERP correspondentes...');

      // Build mock sefaz data
      const mockSefaz: InvoiceRow[] = Array.from({ length: 100 }, (_, index) => {
        const notaNum = 1832138 + index;
        const fakeCpfCnpj = index % 3 === 0 ? '17.503.644/0002-86' : '07.454.439/314';
        const rawKey = `352606${fakeCpfCnpj.replace(/\D/g, '')}55001${notaNum.toString().padStart(9, '0')}1999999991`;
        const valor = 50 + index * 12.5;

        // Simulate some canceled notes (canceled at indices divisible by 15)
        const isCanceled = index % 15 === 0;

        return {
          id: `fake-sefaz-${index}`,
          chaveDeAcesso: rawKey,
          dataEmissao: '01/06/2026',
          valorString: `R$ ${valor.toFixed(2)}`,
          valorDecimal: isCanceled ? 0 : valor,
          ufCodigo: '35',
          ufNome: 'São Paulo (SP)',
          anoMes: '06/2026',
          cnpj: fakeCpfCnpj.replace(/\D/g, ''),
          cnpjFormatado: fakeCpfCnpj,
          modelo: '55',
          serie: '1',
          numeroNota: notaNum.toString(),
          numeroNotaFormatado: notaNum.toString(),
          tipoEmissao: '1',
          tipoEmissaoFriendly: 'Normal',
          isValidChave: true
        };
      });

      // Build mock erp records
      // Simulate 1 missing in ERP, 1 value discrepancy
      const mockErpTextLines = ['Nota;Data Emissao;Série;Valor Total;Cliente'];
      mockSefaz.forEach((s, idx) => {
        const notaNum = parseInt(s.numeroNota, 10);
        
        // Skip 1832145 in ERP (FALTANTE_ERP)
        if (notaNum === 1832145) return;

        let val = s.valorDecimal;
        // Introduce value divergence on 1832150 (DIVERGENCIA_VALOR)
        if (notaNum === 1832150) {
          val += 150.00;
        }

        mockErpTextLines.push(`${notaNum};01/06/2026;1;${val.toFixed(2)};CLIENTE PARCEIRO LTDA`);
      });

      // Also add 1 record in ERP that is NOT in SEFAZ
      mockErpTextLines.push(`9999999;01/06/2026;1;1250.00;CLIENTE DESCONHECIDO SEFAZ`);

      const erpTextRaw = mockErpTextLines.join('\n');

      setSefazRows(mockSefaz);
      setErpRowsText(erpTextRaw);

      setProcessingProgress(75);
      setProcessingStage('Sincronizando Relatórios de Impostos SIGA (CSV)...');

      // Seed Siga Impostos
      setSigaTaxText(SAMPLE_RAW_REPORT);
      parseSigaTaxReport(SAMPLE_RAW_REPORT);

      // Seed PIS/COFINS mock rows
      const mockPisCofins: PisCofinsItem[] = [
        {
          id: 'pc-1',
          empresaId: '7',
          numeroNota: '1832138',
          data: '01/06/2026',
          modelo: 'NF-e',
          cfop: '1.403',
          codigoProduto: 'PROD001',
          nomeProduto: 'PRODUTO COM BASE DIVERGENTE PIS/COFINS',
          cst: '50',
          valorProduto: 1000,
          baseCalculo: 1000,
          baseCalculoPis: 1000,
          baseCalculoCofins: 800, // Divergent base
          aliquotaPis: 1.65,
          aliquotaCofins: 7.6,
          valorPis: 16.5,
          valorCofins: 60.8,
          valor: 1000,
          aliquota: 9.25,
          imposto: 77.3,
          tipo: 'entrada'
        },
        {
          id: 'pc-2',
          empresaId: '7',
          numeroNota: '1832139',
          data: '02/06/2026',
          modelo: 'NF-e',
          cfop: '1.403',
          codigoProduto: 'PROD002',
          nomeProduto: 'PRODUTO COM CALCULO PIS INCORRETO',
          cst: '50',
          valorProduto: 1000,
          baseCalculo: 1000,
          baseCalculoPis: 1000,
          baseCalculoCofins: 1000,
          aliquotaPis: 1.65,
          aliquotaCofins: 7.6,
          valorPis: 10.0, // Error: 1000 * 1.65% should be 16.5
          valorCofins: 76.0,
          valor: 1000,
          aliquota: 9.25,
          imposto: 86.0,
          tipo: 'entrada'
        },
        {
          id: 'pc-3',
          empresaId: '7',
          numeroNota: '1832140',
          data: '03/06/2026',
          modelo: 'NF-e',
          cfop: '1.403',
          codigoProduto: 'PROD003',
          nomeProduto: 'PRODUTO COM CST PIS/COFINS INCOMPATIVEL',
          cst: '01', // Outgoing CST for an incoming operation triggers CST incompatible!
          valorProduto: 1000,
          baseCalculo: 1000,
          baseCalculoPis: 1000,
          baseCalculoCofins: 1000,
          aliquotaPis: 1.65,
          aliquotaCofins: 7.6,
          valorPis: 16.5,
          valorCofins: 76.0,
          valor: 1000,
          aliquota: 9.25,
          imposto: 92.5,
          tipo: 'entrada'
        },
        {
          id: 'pc-4',
          empresaId: '7',
          numeroNota: '1832141',
          data: '04/06/2026',
          modelo: 'NF-e',
          cfop: '1.403',
          codigoProduto: 'PROD004',
          nomeProduto: 'PRODUTO CORRETO EXEMPLO',
          cst: '50',
          valorProduto: 500,
          baseCalculo: 500,
          baseCalculoPis: 500,
          baseCalculoCofins: 500,
          aliquotaPis: 1.65,
          aliquotaCofins: 7.6,
          valorPis: 8.25,
          valorCofins: 38.0,
          valor: 500,
          aliquota: 9.25,
          imposto: 46.25,
          tipo: 'entrada'
        }
      ];
      setPisCofinsRows(mockPisCofins);
      setPisCofinsMetadata({
        empresa: 'MOREIRA & LIMA CONTADORES ASSOCIADOS',
        periodo: '06/2026',
        dataGeracao: '21/06/2026 14:30:22'
      });

      // Setup list
      setLoadedFiles([
        { name: 'sefaz_automatico_m55_65.csv', size: 12540, type: 'sefaz', recordsCount: mockSefaz.length },
        { name: 'erp_faturamento_vendas.csv', size: 8430, type: 'erp', recordsCount: mockErpTextLines.length - 1 },
        { name: 'siga_movimentacao_entrada_saida.txt', size: 5688, type: 'siga_tax', recordsCount: 12 },
        { name: 'demonstrativo_pis_cofins_apurado.csv', size: 6120, type: 'pis_cofins', recordsCount: mockPisCofins.length }
      ]);

      // Calculate auto cross-audit immediately for high fidelity
      const mockErpRecords = mockSefaz.map(s => {
        const notaNum = parseInt(s.numeroNota, 10);
        if (notaNum === 1832145) return null;
        let val = s.valorDecimal;
        if (notaNum === 1832150) val += 150.00;
        return {
          nota: notaNum,
          dataEmissao: '01/06/2026',
          valor: val,
          serie: '1',
          cliente: 'CLIENTE PARCEIRO LTDA',
          linhaOriginal: ''
        };
      }).filter(Boolean);

      // Add the extra erp row
      mockErpRecords.push({
        nota: 9999999,
        dataEmissao: '01/06/2026',
        valor: 1250.00,
        serie: '1',
        cliente: 'CLIENTE DESCONHECIDO SEFAZ',
        linhaOriginal: ''
      });

      const { items, summary } = executeDataAudit(mockSefaz, erpTextRaw);

      setAuditItems(items);
      setAuditSummary(summary);

      setProcessingProgress(100);
      setIsProcessing(false);
    }, 1000);
  };

  const handleClearDataLake = () => {
    setLoadedFiles([]);
    setSefazRows([]);
    setRawSefazText('');
    setErpRowsText('');
    setSigaTaxText('');
    setOrganizadorEntradas([]);
    setOrganizadorSaidas([]);
    setOrganizadorMetadata(null);
    setAuditItems([]);
    setAuditSummary(null);
    setPisCofinsRows([]);
    setPisCofinsMetadata(null);
  };

  // --------------------------------------------------------
  // Computations for Organizador / Tax tab
  // --------------------------------------------------------
  const currentTabItems = useMemo(() => {
    const baseItems = activeOrgSubTab === 'entradas' ? organizadorEntradas : organizadorSaidas;
    return groupDuplicates ? aggregateDuplicates(baseItems) : baseItems;
  }, [activeOrgSubTab, organizadorEntradas, organizadorSaidas, groupDuplicates]);

  const uniqueCfops = useMemo(() => {
    const cfops = new Set<string>();
    currentTabItems.forEach(item => {
      if (item.cfop) cfops.add(item.cfop);
    });
    return Array.from(cfops).sort();
  }, [currentTabItems]);

  const uniqueCsts = useMemo(() => {
    const csts = new Set<string>();
    currentTabItems.forEach(item => {
      if (item.cst) csts.add(item.cst);
    });
    return Array.from(csts).sort();
  }, [currentTabItems]);

  const filteredOrgItems = useMemo(() => {
    const filtered = currentTabItems.filter(item => {
      const matchSearch = !orgSearchTerm || 
        item.notaFiscal.includes(orgSearchTerm) ||
        item.nomeProduto.toLowerCase().includes(orgSearchTerm.toLowerCase()) ||
        item.codigoProduto.includes(orgSearchTerm) ||
        item.ncm.includes(orgSearchTerm) ||
        item.cnpj.includes(orgSearchTerm);

      const matchCfop = orgCfopFilter === 'all' || item.cfop === orgCfopFilter;
      const matchCst = orgCstFilter === 'all' || item.cst === orgCstFilter;

      return matchSearch && matchCfop && matchCst;
    });
    return [...filtered].sort((a, b) => a.nomeProduto.localeCompare(b.nomeProduto, 'pt-BR'));
  }, [currentTabItems, orgSearchTerm, orgCfopFilter, orgCstFilter]);

  const totalOrgPages = Math.ceil(filteredOrgItems.length / itemsPerPage);
  const paginatedOrgItems = useMemo(() => {
    const start = (orgCurrentPage - 1) * itemsPerPage;
    return filteredOrgItems.slice(start, start + itemsPerPage);
  }, [filteredOrgItems, orgCurrentPage]);

  // Organizador General Metrics block
  const orgStats = useMemo(() => {
    const calc = (items: ReportItem[]) => {
      let vContabil = 0;
      let vProduto = 0;
      let icms = 0;
      let ipi = 0;
      let desconto = 0;
      let qtde = 0;
      const products = new Set<string>();

      items.forEach(item => {
        vContabil += item.vlrContabil;
        vProduto += item.rProduto;
        icms += item.rIcms;
        ipi += item.rIpi;
        desconto += item.desconto;
        qtde += item.qtde;
        products.add(item.codigoProduto);
      });

      return {
        vContabil,
        vProduto,
        totalTaxes: icms + ipi,
        icms,
        ipi,
        desconto,
        qtde,
        uniqProdCount: products.size
      };
    };

    return {
      entradas: calc(organizadorEntradas),
      saidas: calc(organizadorSaidas)
    };
  }, [organizadorEntradas, organizadorSaidas]);

  // Tax CFOP & Product classifications compilation
  const auditReport = useMemo(() => {
    const compile = (items: ReportItem[]) => {
      const cfopSummary: Record<string, { 
        cfop: string; 
        count: number; 
        total: number; 
        rBaseIcms: number;
        pIcms: number;
        rIcms: number; 
        isentas: number;
        outras: number;
        rIpi: number;
      }> = {};
      const productSummary: Record<string, { code: string; name: string; un: string; qty: number; value: number }> = {};
      const ncmSummary: Record<string, { ncm: string; value: number }> = {};

      items.forEach(item => {
        // CFOP Grouping
        if (!cfopSummary[item.cfop]) {
          cfopSummary[item.cfop] = { 
            cfop: item.cfop, count: 0, total: 0, rBaseIcms: 0, pIcms: item.pIcms || 0,
            rIcms: 0, isentas: 0, outras: 0, rIpi: 0
          };
        }
        cfopSummary[item.cfop].count += 1;
        cfopSummary[item.cfop].total += item.vlrContabil;
        cfopSummary[item.cfop].rBaseIcms += item.rBaseIcms;
        cfopSummary[item.cfop].rIcms += item.rIcms;
        cfopSummary[item.cfop].rIpi += item.rIpi;
        if (item.pIcms > 0) {
          cfopSummary[item.cfop].pIcms = item.pIcms;
        }

        // Product Grouping
        if (!productSummary[item.codigoProduto]) {
          productSummary[item.codigoProduto] = { code: item.codigoProduto, name: item.nomeProduto, un: item.un, qty: 0, value: 0 };
        }
        productSummary[item.codigoProduto].qty += item.qtde;
        productSummary[item.codigoProduto].value += item.vlrContabil;

        // NCM Grouping
        if (!ncmSummary[item.ncm]) {
          ncmSummary[item.ncm] = { ncm: item.ncm, value: 0 };
        }
        ncmSummary[item.ncm].value += item.vlrContabil;
      });

      return {
        cfopList: Object.values(cfopSummary).sort((a, b) => b.total - a.total),
        productList: Object.values(productSummary).sort((a, b) => b.value - a.value),
        ncmList: Object.values(ncmSummary).sort((a, b) => b.value - a.value)
      };
    };

    return {
      entradas: compile(organizadorEntradas),
      saidas: compile(organizadorSaidas)
    };
  }, [organizadorEntradas, organizadorSaidas]);

  // PF vs PJ Vendas details
  const pfPjMetrics = useMemo(() => {
    let pfValue = 0, pfCount = 0;
    let pjValue = 0, pjCount = 0;
    let otherValue = 0, otherCount = 0;

    organizadorSaidas.forEach(item => {
      const type = getDocumentType(item.cnpj);
      if (type === 'PF') {
        pfValue += item.vlrContabil;
        pfCount++;
      } else if (type === 'PJ') {
        pjValue += item.vlrContabil;
        pjCount++;
      } else {
        otherValue += item.vlrContabil;
        otherCount++;
      }
    });

    const totalValue = pfValue + pjValue + otherValue || 1;
    const totalCount = pfCount + pjCount + otherCount || 1;

    return {
      pfValue, pfCount, pfPctValue: (pfValue / totalValue) * 100, pfPctCount: (pfCount / totalCount) * 100,
      pjValue, pjCount, pjPctValue: (pjValue / totalValue) * 100, pjPctCount: (pjCount / totalCount) * 100,
      otherValue, otherCount, otherPctValue: (otherValue / totalValue) * 100, otherPctCount: (otherCount / totalCount) * 100,
    };
  }, [organizadorSaidas]);

  // --------------------------------------------------------
  // NFC-e Access Key analysis stats
  // --------------------------------------------------------
  const nfceFilteredRows = useMemo(() => {
    return sefazRows.filter(r => {
      const matchesSearch = !searchTermNfce || 
        r.chaveDeAcesso.toLowerCase().includes(searchTermNfce.toLowerCase()) ||
        r.numeroNotaFormatado.includes(searchTermNfce) ||
        r.dataEmissao.includes(searchTermNfce) ||
        r.cnpjFormatado.includes(searchTermNfce);

      const matchesStatus = 
        filterStatusNfce === 'all' ||
        (filterStatusNfce === 'valid' && r.isValidChave) ||
        (filterStatusNfce === 'invalid' && !r.isValidChave);

      return matchesSearch && matchesStatus;
    });
  }, [sefazRows, searchTermNfce, filterStatusNfce]);

  const nfceStats = useMemo(() => {
    let totalValor = 0;
    let validKeysCount = 0;
    let count55 = 0;
    let count65 = 0;

    sefazRows.forEach(r => {
      totalValor += r.valorDecimal;
      if (r.isValidChave) validKeysCount++;
      if (r.modelo === '55') count55++;
      else if (r.modelo === '65') count65++;
    });

    return {
      totalCount: sefazRows.length,
      totalValor,
      validKeysCount,
      invalidKeysCount: sefazRows.length - validKeysCount,
      count55,
      count65,
    };
  }, [sefazRows]);

  // PIS/COFINS useMemo filtering & stats hooks
  const filteredPisCofinsRows = useMemo(() => {
    let list = pisCofinsRows;
    
    // Filter by tab: entradas, saidas
    if (activePisCofinsSubTab === 'entradas') {
      list = list.filter(item => item.tipo === 'entrada');
    } else if (activePisCofinsSubTab === 'saidas') {
      list = list.filter(item => item.tipo === 'saida');
    }

    // Filter by search term
    if (searchTermPisCofins.trim()) {
      const term = searchTermPisCofins.toLowerCase();
      list = list.filter(item => 
        item.cfop.toLowerCase().includes(term) ||
        item.cst.toLowerCase().includes(term) ||
        item.codigoProduto.toLowerCase().includes(term) ||
        item.nomeProduto.toLowerCase().includes(term)
      );
    }

    // Sort alphabetically by product description (nomeProduto)
    const ptBrCollator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
    return [...list].sort((a, b) => {
      const nameA = a.nomeProduto || '';
      const nameB = b.nomeProduto || '';
      return ptBrCollator.compare(nameA, nameB);
    });
  }, [pisCofinsRows, activePisCofinsSubTab, searchTermPisCofins]);

  const consolidatedPisCofinsRows = useMemo(() => {
    let baseRows = pisCofinsRows;
    
    // Aggregate/Consolidate
    let consolidated = consolidatePisCofinsRows(baseRows, pisCofinsCriteria);
    
    if (activePisCofinsSubTab === 'entradas') {
      consolidated = consolidated.filter(item => item.tipo === 'entrada');
    } else if (activePisCofinsSubTab === 'saidas') {
      consolidated = consolidated.filter(item => item.tipo === 'saida');
    }

    const term = searchTermPisCofins.toLowerCase().trim();
    if (term) {
      return consolidated.filter(item => 
        item.cfop.toLowerCase().includes(term) ||
        item.cst.toLowerCase().includes(term) ||
        item.codigoProduto?.toLowerCase().includes(term) ||
        item.nomeProduto?.toLowerCase().includes(term)
      );
    }
    
    return consolidated;
  }, [pisCofinsRows, pisCofinsCriteria, activePisCofinsSubTab, searchTermPisCofins]);

  const paginatedFilteredPisCofinsRows = useMemo(() => {
    const start = (pisCofinsCurrentPage - 1) * pisCofinsItemsPerPage;
    return filteredPisCofinsRows.slice(start, start + pisCofinsItemsPerPage);
  }, [filteredPisCofinsRows, pisCofinsCurrentPage]);

  const paginatedConsolidatedPisCofinsRows = useMemo(() => {
    const start = (pisCofinsCurrentPage - 1) * pisCofinsItemsPerPage;
    return consolidatedPisCofinsRows.slice(start, start + pisCofinsItemsPerPage);
  }, [consolidatedPisCofinsRows, pisCofinsCurrentPage]);

  const totalPisCofinsPages = useMemo(() => {
    const rows = pisCofinsViewMode === 'consolidated' ? consolidatedPisCofinsRows : filteredPisCofinsRows;
    return Math.ceil(rows.length / pisCofinsItemsPerPage);
  }, [filteredPisCofinsRows, consolidatedPisCofinsRows, pisCofinsViewMode]);

  const pisCofinsStats = useMemo(() => {
    let totalEntradas = 0;
    let totalSaidas = 0;
    let valorProdutoEntradas = 0;
    let valorProdutoSaidas = 0;
    let baseCalculoEntradas = 0;
    let baseCalculoSaidas = 0;
    let impostoTotal = 0;
    let pisTotal = 0;         // PIS Crédito (Entradas)
    let cofinstotal = 0;       // COFINS Crédito (Entradas)
    let pisDebitoTotal = 0;    // PIS Débito (Saídas)
    let cofinsDebitoTotal = 0; // COFINS Débito (Saídas)

    pisCofinsRows.forEach(row => {
      if (row.tipo === 'entrada') {
        totalEntradas++;
        valorProdutoEntradas += row.valorProduto;
        baseCalculoEntradas += row.baseCalculo;
        pisTotal += row.valorPis;
        cofinstotal += row.valorCofins;
      } else {
        totalSaidas++;
        valorProdutoSaidas += row.valorProduto;
        baseCalculoSaidas += row.baseCalculo;
        pisDebitoTotal += row.valorPis;
        cofinsDebitoTotal += row.valorCofins;
      }
      impostoTotal += row.valorPis + row.valorCofins;
    });

    return {
      totalEntradas,
      totalSaidas,
      valorProdutoEntradas,
      valorProdutoSaidas,
      baseCalculoEntradas,
      baseCalculoSaidas,
      impostoTotal,
      pisTotal,
      cofinstotal,
      pisDebitoTotal,
      cofinsDebitoTotal,
      saldoPis: pisTotal - pisDebitoTotal,
      saldoCofins: cofinstotal - cofinsDebitoTotal,
      totalCount: pisCofinsRows.length
    };
  }, [pisCofinsRows]);

  // --------------------------------------------------------
  // Bilateral Cross-Audit filters
  // --------------------------------------------------------
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

  const sefazDuplicates = useMemo(() => {
    if (!sefazRows || sefazRows.length === 0) return [];
    const counts = new Map<string, InvoiceRow[]>();
    sefazRows.forEach(row => {
      const key = row.chaveDeAcesso && row.chaveDeAcesso.trim() !== ''
        ? row.chaveDeAcesso.trim()
        : `NOTA_${row.numeroNota}_SERIE_${row.serie}`;
      if (!counts.has(key)) {
        counts.set(key, []);
      }
      counts.get(key)!.push(row);
    });

    const dupList: Array<{ key: string; numeroNota: string; serie: string; rows: InvoiceRow[]; count: number }> = [];
    counts.forEach((rows, key) => {
      if (rows.length > 1) {
        dupList.push({
          key,
          numeroNota: rows[0].numeroNota,
          serie: rows[0].serie,
          rows,
          count: rows.length
        });
      }
    });
    return dupList;
  }, [sefazRows]);

  // --------------------------------------------------------
  // Exporting functions
  // --------------------------------------------------------
  const handleExportAuditExcelUnified = () => {
    if (!auditSummary) return;
    exportAuditExcel(sefazRows, auditItems, auditSummary, 'Auditoria_DataLake_Moreira_Lima');
  };

  // Highly customized Siga Tax Sheet export
  const handleExportSigaTaxExcel = () => {
    if (organizadorEntradas.length === 0 && organizadorSaidas.length === 0) return;

    const wb = XLSX.utils.book_new();

    // Style elements matching our brand identity (Navy Blue / Gold)
    const styleHeaderTitle = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 14, bold: true, color: { rgb: "E4B35E" } },
      alignment: { horizontal: "center", vertical: "center" }
    };
    const styleHeaderSub = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const getHeaderStyle = (align: 'left' | 'center' | 'right' = 'center') => ({
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: align, vertical: "center" }
    });

    const getRowStyle = (isEven: boolean, align: 'left' | 'center' | 'right' = 'left') => ({
      fill: { fgColor: { rgb: isEven ? "FFFFFF" : "F8FAFC" } },
      font: { name: "Arial", sz: 9, color: { rgb: "1E293B" } },
      alignment: { horizontal: align, vertical: "center" },
      border: {
        bottom: { style: "thin", color: { rgb: "E2E8F0" } }
      }
    });

    // Detailed column configuration to guarantee perfect horizontal alignment (avoiding descentralização)
    const rawColConfig: { header: string; key: keyof ReportItem; align: 'left' | 'center' | 'right'; width: number; isNumeric?: boolean; format?: string }[] = [
      { header: 'NF-e', key: 'notaFiscal', align: 'center', width: 12 },
      { header: 'Data Emissão', key: 'data', align: 'center', width: 14 },
      { header: 'CNPJ/CPF', key: 'cnpj', align: 'center', width: 18 },
      { header: 'CFOP', key: 'cfop', align: 'center', width: 10 },
      { header: 'Código', key: 'codigoProduto', align: 'center', width: 10 },
      { header: 'Produto', key: 'nomeProduto', align: 'left', width: 35 },
      { header: 'NCM', key: 'ncm', align: 'center', width: 12 },
      { header: 'UN', key: 'un', align: 'center', width: 8 },
      { header: 'Qtde', key: 'qtde', align: 'right', width: 10, isNumeric: true },
      { header: 'Unitário', key: 'rUnit', align: 'right', width: 12, isNumeric: true, format: '"R$ " #,##0.00' },
      { header: 'R$ Produto', key: 'rProduto', align: 'right', width: 12, isNumeric: true, format: '"R$ " #,##0.00' },
      { header: 'Desconto', key: 'desconto', align: 'right', width: 12, isNumeric: true, format: '"R$ " #,##0.00' },
      { header: 'Vlr Contábil', key: 'vlrContabil', align: 'right', width: 14, isNumeric: true, format: '"R$ " #,##0.00' },
      { header: 'CST', key: 'cst', align: 'center', width: 8 },
      { header: 'R$ Base ICMS', key: 'rBaseIcms', align: 'right', width: 14, isNumeric: true, format: '"R$ " #,##0.00' },
      { header: '% ICMS', key: 'pIcms', align: 'right', width: 10, isNumeric: true, format: '0.00"%"' },
      { header: 'R$ ICMS', key: 'rIcms', align: 'right', width: 12, isNumeric: true, format: '"R$ " #,##0.00' },
      { header: '% IPI', key: 'pIpi', align: 'right', width: 10, isNumeric: true, format: '0.00"%"' },
      { header: 'R$ IPI', key: 'rIpi', align: 'right', width: 12, isNumeric: true, format: '"R$ " #,##0.00' }
    ];

    const colConfig = groupDuplicates
      ? rawColConfig.filter(cfg => cfg.key !== 'notaFiscal' && cfg.key !== 'data' && cfg.key !== 'cnpj')
      : rawColConfig;

    // Sub-sheet generator for Entrada / Saida
    const makeSheet = (sheetName: string, items: ReportItem[]) => {
      const ws: any = {};
      const numCols = colConfig.length;

      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } }
      ];

      // Titles
      ws['A1'] = { v: BRAND_CONFIG.COMPANY_NAME, s: styleHeaderTitle };
      ws['A2'] = { v: `SÍNTESE DA MOVIMENTAÇÃO DE ${sheetName.toUpperCase()} - ${organizadorMetadata?.periodo || ''}`, s: styleHeaderSub };

      // Headers writing
      colConfig.forEach((cfg, colIdx) => {
        const cellRef = XLSX.utils.encode_cell({ r: 3, c: colIdx });
        ws[cellRef] = { v: cfg.header, s: getHeaderStyle(cfg.align) };
      });

      // Sort items alphabetically by Product Name in Portuguese language
      const ptBrCollator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
      const sortedItems = [...items].sort((a, b) => {
        const nameA = a.nomeProduto || '';
        const nameB = b.nomeProduto || '';
        return ptBrCollator.compare(nameA, nameB);
      });

      // Rows writing
      sortedItems.forEach((item, rowIdx) => {
        const r = 4 + rowIdx;

        colConfig.forEach((cfg, colIdx) => {
          const style = getRowStyle(rowIdx % 2 === 0, cfg.align);
          const val = item[cfg.key];
          const cellRef = XLSX.utils.encode_cell({ r, c: colIdx });

          if (cfg.isNumeric) {
            const numVal = typeof val === 'number' ? val : parseFloat(val as string) || 0;
            ws[cellRef] = { 
              v: numVal, 
              t: 'n', 
              s: style,
              ...(cfg.format ? { z: cfg.format } : {})
            };
          } else {
            ws[cellRef] = { 
              v: val === undefined || val === null ? '' : String(val), 
              s: style 
            };
          }
        });
      });

      const maxRow = 4 + sortedItems.length;
      ws['!ref'] = `A1:${XLSX.utils.encode_col(numCols - 1)}${maxRow}`;
      ws['!cols'] = colConfig.map(cfg => ({ wch: cfg.width }));

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    };

    if (organizadorEntradas.length > 0) {
      const entries = groupDuplicates ? aggregateDuplicates(organizadorEntradas) : organizadorEntradas;
      makeSheet('Entradas', entries);
    }
    if (organizadorSaidas.length > 0) {
      const exits = groupDuplicates ? aggregateDuplicates(organizadorSaidas) : organizadorSaidas;
      makeSheet('Saídas', exits);
    }

    XLSX.writeFile(wb, `Faturamento_Impostos_Consolidado_${Date.now()}.xlsx`);
  };

  const handleExportConversorExcel = () => {
    if (sefazRows.length === 0) return;

    const wb = XLSX.utils.book_new();

    // Style elements matching our brand identity (Navy Blue / Gold)
    const styleHeaderTitle = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 14, bold: true, color: { rgb: "E4B35E" } },
      alignment: { horizontal: "center", vertical: "center" }
    };
    const styleHeaderSub = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const styleTableHeader = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const getRowStyle = (isEven: boolean, align: 'left' | 'center' | 'right' = 'left') => ({
      fill: { fgColor: { rgb: isEven ? "FFFFFF" : "F8FAFC" } },
      font: { name: "Arial", sz: 9, color: { rgb: "1E293B" } },
      alignment: { horizontal: align, vertical: "center" },
      border: {
        bottom: { style: "thin", color: { rgb: "E2E8F0" } }
      }
    });

    const ws: any = {};
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } }
    ];

    // Titles
    ws['A1'] = { v: BRAND_CONFIG.COMPANY_NAME, s: styleHeaderTitle };
    ws['A2'] = { v: `CONVERSOR DE CHAVES DE ACESSO - RELATÓRIO DE NOTAS FISCAIS`, s: styleHeaderSub };
    ws['A3'] = { v: `EXPORTADO EM: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`, s: styleHeaderSub };

    const headers = [
      'Chave de Acesso',
      'Número Nota',
      'Data da Emissão',
      'CPF/CNPJ Fornecedor',
      'Nome/Razão Social Fornecedor',
      'Série',
      'UF',
      'Valor da NF-e',
      'ICMS Destacado',
      'Situação NF-e'
    ];

    headers.forEach((h, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: 4, c: colIdx });
      ws[cellRef] = { v: h, s: styleTableHeader };
    });

    const rowsToExport = nfceFilteredRows.length > 0 ? nfceFilteredRows : sefazRows;

    rowsToExport.forEach((item, rowIdx) => {
      const r = 5 + rowIdx;
      const isEven = rowIdx % 2 === 0;

      // 1. Chave de Acesso
      ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: item.chaveDeAcesso, s: getRowStyle(isEven, 'left') };

      // 2. Número Nota
      ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: item.numeroNotaFormatado, s: getRowStyle(isEven, 'center') };

      // 3. Data da Emissão
      ws[XLSX.utils.encode_cell({ r, c: 2 })] = { v: item.dataEmissao, s: getRowStyle(isEven, 'center') };

      // 4. CPF/CNPJ Fornecedor
      ws[XLSX.utils.encode_cell({ r, c: 3 })] = { v: item.cnpjFornecedorFormatado || item.cnpjFormatado, s: getRowStyle(isEven, 'center') };

      // 5. Nome/Razão Social Fornecedor
      ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: item.nomeFornecedor || 'FORNECEDOR NÃO INFORMADO', s: getRowStyle(isEven, 'left') };

      // 6. Série
      ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: item.serie, s: getRowStyle(isEven, 'center') };

      // 7. UF
      const ufClean = item.ufNome.includes('(') 
        ? item.ufNome.substring(item.ufNome.indexOf('(') + 1, item.ufNome.indexOf(')')) 
        : item.ufNome;
      ws[XLSX.utils.encode_cell({ r, c: 6 })] = { v: ufClean, s: getRowStyle(isEven, 'center') };

      // 8. Valor da NF-e
      ws[XLSX.utils.encode_cell({ r, c: 7 })] = { 
        v: item.valorDecimal, 
        t: 'n', 
        z: '"R$ " #,##0.00', 
        s: getRowStyle(isEven, 'right') 
      };

      // 9. ICMS Destacado
      ws[XLSX.utils.encode_cell({ r, c: 8 })] = { 
        v: item.valorIcms || 0, 
        t: 'n', 
        z: '"R$ " #,##0.00', 
        s: getRowStyle(isEven, 'right') 
      };

      // 10. Situação NF-e
      ws[XLSX.utils.encode_cell({ r, c: 9 })] = { v: item.situacaoNfe || 'AUTORIZADA', s: getRowStyle(isEven, 'center') };
    });

    const maxRow = 5 + rowsToExport.length;
    ws['!ref'] = `A1:J${maxRow}`;
    
    // Auto-fit or professional column widths
    ws['!cols'] = [
      { wch: 48 }, // Chave de Acesso
      { wch: 15 }, // Número Nota
      { wch: 15 }, // Data da Emissão
      { wch: 22 }, // CPF/CNPJ Fornecedor
      { wch: 45 }, // Nome/Razão Social Fornecedor
      { wch: 10 }, // Série
      { wch: 10 }, // UF
      { wch: 18 }, // Valor da NF-e
      { wch: 18 }, // ICMS Destacado
      { wch: 18 }, // Situação NF-e
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Relatório Chaves');
    XLSX.writeFile(wb, `Chaves_Acesso_SEFAZ_Formatado_${Date.now()}.xlsx`);
  };

  const handleExportPisCofinsExcel = () => {
    if (pisCofinsRows.length === 0 || !pisCofinsMetadata) return;
    const consolidated = consolidatePisCofinsRows(pisCofinsRows, pisCofinsCriteria);
    exportPisCofinsExcel(pisCofinsRows, consolidated, pisCofinsMetadata, pisCofinsCriteria);
  };

  const sefazFile = loadedFiles.find(f => f.type === 'sefaz');
  const erpFile = loadedFiles.find(f => f.type === 'erp' || f.type === 'siga_tax');

  return (
    <div 
      className="space-y-6 relative min-h-[500px]" 
      id="auditoria-fiscal-workspace"
    >
      {/* Global Drag-and-Drop Overlay */}
      {isGlobalDragOver && (
        <div 
          className="absolute inset-0 z-50 bg-[#04243b]/95 border-4 border-dashed border-[#e4b35e] rounded-3xl flex flex-col items-center justify-center space-y-4 transition-all duration-300"
        >
          <div className="p-6 bg-[#e4b35e]/10 text-[#e4b35e] rounded-full animate-bounce pointer-events-none">
            <Upload className="w-12 h-12" />
          </div>
          <h3 className="text-xl font-extrabold text-white pointer-events-none">Solte seus arquivos em qualquer lugar</h3>
          <p className="text-sm text-slate-300 max-w-md text-center px-4 leading-relaxed pointer-events-none">
            Solte seus relatórios SEFAZ, ERP Contábil, Siga Impostos ou demonstrativo de PIS/COFINS. O parser auto-identificará e importará os dados para o Data Lake de Auditoria.
          </p>
        </div>
      )}

      {/* 1. TOP TITLE BANNER */}
      <div className="bg-[#04243b] rounded-3xl p-6 text-white relative overflow-hidden shadow-md border border-[#e4b35e]/15 animate-fadeIn">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-gradient-to-br from-[#e4b35e]/10 to-transparent rounded-full blur-2xl" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white uppercase font-sans">
              Módulo de Auditoria e Gestão Fiscal
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleClearDataLake}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white font-extrabold text-xs tracking-wider uppercase transition-all border border-slate-700 cursor-pointer flex items-center gap-2"
              title="Limpar todos os dados carregados"
            >
              <RefreshCw className="w-4 h-4" />
              Limpar Tudo
            </button>
          </div>
        </div>
      </div>

      {/* 2. SUBDIVISIONS SUB-BLOCKS GRID ON INITIAL VIEW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Module 1: SIGA */}
        <button
          onClick={() => {
            setActiveMainModule('siga');
            setActiveOutputTab('organizador');
          }}
          className={`p-5 rounded-3xl border text-left transition-all relative overflow-hidden flex flex-col justify-between h-40 cursor-pointer ${
            activeMainModule === 'siga'
              ? 'bg-gradient-to-br from-[#04243b] to-[#083454] border-[#e4b35e] text-white shadow-md ring-2 ring-[#e4b35e]/30'
              : 'bg-white border-slate-200 text-[#04243b] hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
          }`}
        >
          <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-5 pointer-events-none">
            <FileSpreadsheet className="w-32 h-32 text-white" />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-full ${
                activeMainModule === 'siga' ? 'bg-[#e4b35e]/10 text-[#e4b35e]' : 'bg-slate-100 text-slate-500'
              }`}>
                Módulo 1
              </span>
              <FileSpreadsheet className={`w-5 h-5 ${activeMainModule === 'siga' ? 'text-[#e4b35e]' : 'text-slate-400'}`} />
            </div>
            <h3 className="font-extrabold text-sm tracking-tight leading-snug">
              Módulo 1: Auditor de relatórios SIGA
            </h3>
            <p className={`text-[11px] leading-relaxed font-sans ${activeMainModule === 'siga' ? 'text-slate-300' : 'text-slate-500'}`}>
              Organizador de impostos por CFOP/CST e listagem inteligente de chaves do SIGA.
            </p>
          </div>

          <div className="border-t border-dashed border-slate-200/20 pt-2 w-full flex items-center justify-between text-[10px] font-bold">
            <span className={activeMainModule === 'siga' ? 'text-[#e4b35e]' : 'text-slate-500'}>
              {organizadorEntradas.length > 0 || organizadorSaidas.length > 0 ? '✓ Ativo & Analisado' : '⚡ Toque para carregar'}
            </span>
            <span className={`font-mono ${activeMainModule === 'siga' ? 'text-white' : 'text-slate-700'}`}>
              {organizadorEntradas.length + organizadorSaidas.length} registros
            </span>
          </div>
        </button>

        {/* Module 2: ICMS */}
        <button
          onClick={() => {
            setActiveMainModule('icms');
            setActiveOutputTab('confronto');
          }}
          className={`p-5 rounded-3xl border text-left transition-all relative overflow-hidden flex flex-col justify-between h-40 cursor-pointer ${
            activeMainModule === 'icms'
              ? 'bg-gradient-to-br from-[#04243b] to-[#083454] border-[#e4b35e] text-white shadow-md ring-2 ring-[#e4b35e]/30'
              : 'bg-white border-slate-200 text-[#04243b] hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
          }`}
        >
          <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-5 pointer-events-none">
            <Table className="w-32 h-32 text-white" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-full ${
                activeMainModule === 'icms' ? 'bg-[#e4b35e]/10 text-[#e4b35e]' : 'bg-slate-100 text-slate-500'
              }`}>
                Módulo 2
              </span>
              <Table className={`w-5 h-5 ${activeMainModule === 'icms' ? 'text-[#e4b35e]' : 'text-slate-400'}`} />
            </div>
            <h3 className="font-extrabold text-sm tracking-tight leading-snug">
              Módulo 2: Auditor de relatórios ICMS
            </h3>
            <p className={`text-[11px] leading-relaxed font-sans ${activeMainModule === 'icms' ? 'text-slate-300' : 'text-slate-500'}`}>
              Confronto bidirecional SEFAZ x ERP contábil com furos de sequencial e cancelados.
            </p>
          </div>

          <div className="border-t border-dashed border-slate-200/20 pt-2 w-full flex items-center justify-between text-[10px] font-bold">
            <span className={activeMainModule === 'icms' ? 'text-[#e4b35e]' : 'text-slate-500'}>
              {auditSummary ? '✓ Confronto executado' : '⚡ Toque para carregar'}
            </span>
            <span className={`font-mono ${activeMainModule === 'icms' ? 'text-white' : 'text-slate-700'}`}>
              {auditSummary?.saltosSequencia ?? 0} furos seq.
            </span>
          </div>
        </button>

        {/* Module 3: PIS & COFINS */}
        <button
          onClick={() => {
            setActiveMainModule('pis_cofins');
            setActiveOutputTab('pis_cofins');
          }}
          className={`p-5 rounded-3xl border text-left transition-all relative overflow-hidden flex flex-col justify-between h-40 cursor-pointer ${
            activeMainModule === 'pis_cofins'
              ? 'bg-gradient-to-br from-[#04243b] to-[#083454] border-[#e4b35e] text-white shadow-md ring-2 ring-[#e4b35e]/30'
              : 'bg-white border-slate-200 text-[#04243b] hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
          }`}
        >
          <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-5 pointer-events-none">
            <Coins className="w-32 h-32 text-white" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-full ${
                activeMainModule === 'pis_cofins' ? 'bg-[#e4b35e]/10 text-[#e4b35e]' : 'bg-slate-100 text-slate-500'
              }`}>
                Módulo 3
              </span>
              <Coins className={`w-5 h-5 ${activeMainModule === 'pis_cofins' ? 'text-[#e4b35e]' : 'text-slate-400'}`} />
            </div>
            <h3 className="font-extrabold text-sm tracking-tight leading-snug">
              Módulo 3: Auditor de relatórios PIS & COFINS
            </h3>
            <p className={`text-[11px] leading-relaxed font-sans ${activeMainModule === 'pis_cofins' ? 'text-slate-300' : 'text-slate-500'}`}>
              Mapeador de créditos e apuração de inconsistências no cálculo de PIS/COFINS por item.
            </p>
          </div>

          <div className="border-t border-dashed border-slate-200/20 pt-2 w-full flex items-center justify-between text-[10px] font-bold">
            <span className={activeMainModule === 'pis_cofins' ? 'text-[#e4b35e]' : 'text-slate-500'}>
              {pisCofinsRows.length > 0 ? '✓ Auditoria ativa' : '⚡ Toque para carregar'}
            </span>
            <span className={`font-mono ${activeMainModule === 'pis_cofins' ? 'text-white' : 'text-slate-700'}`}>
              {pisCofinsAuditErrors.length} inconsistências
            </span>
          </div>
        </button>
      </div>

      {/* 3. THE DATA LAKE INGESTION SECTION (TAILORED PER MAIN MODULE) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
        
        {/* Left Column: Data Lake status & files filtered by current module */}
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col space-y-4 transition-all duration-300">
          <div className="flex items-center justify-between border-b border-slate-150 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#e4b35e]" />
              <h2 className="text-sm font-black text-[#04243b] uppercase tracking-tight font-sans">
                {activeMainModule === 'siga' && 'Arquivos SIGA no Data Lake'}
                {activeMainModule === 'icms' && 'Arquivos ICMS no Data Lake'}
                {activeMainModule === 'pis_cofins' && 'Arquivos PIS/COFINS no Data Lake'}
              </h2>
            </div>
          </div>

          <div className="flex-grow">
            {(() => {
              const filesToShow = loadedFiles.filter(f => {
                if (activeMainModule === 'siga') return f.type === 'siga_tax' || f.type === 'sefaz';
                if (activeMainModule === 'icms') return f.type === 'sefaz' || f.type === 'erp';
                if (activeMainModule === 'pis_cofins') return f.type === 'pis_cofins';
                return true;
              });

              if (filesToShow.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-8 px-4 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-center transition-all">
                    <div className="w-10 h-10 rounded-xl bg-[#04243b]/5 text-[#04243b] flex items-center justify-center mb-3.5">
                      <FileUp className="w-5 h-5 text-[#04243b]" />
                    </div>
                    {activeMainModule === 'siga' && (
                      <>
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Nenhum relatório SIGA importado</h4>
                        <p className="text-[11px] text-slate-400 mt-1 max-w-sm leading-relaxed">
                          Arraste e solte o arquivo Siga Impostos (txt) na área superior ou utilize os dados de exemplo.
                        </p>
                      </>
                    )}
                    {activeMainModule === 'icms' && (
                      <>
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Aguardando relatórios para confronto</h4>
                        <p className="text-[11px] text-slate-400 mt-1 max-w-sm leading-relaxed">
                          Carregue a planilha SEFAZ (csv) e o extrato ERP (csv) para realizar o confronto de notas.
                        </p>
                      </>
                    )}
                    {activeMainModule === 'pis_cofins' && (
                      <>
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Sem dados de PIS/COFINS</h4>
                        <p className="text-[11px] text-slate-400 mt-1 max-w-sm leading-relaxed">
                          Importe o relatório de apuração de PIS/COFINS (csv/txt) para gerar os demonstrativos.
                        </p>
                      </>
                    )}
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filesToShow.map((file, idx) => (
                    <div key={`file-dl-${idx}`} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100/50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg text-white font-extrabold shrink-0 ${
                          file.type === 'sefaz' ? 'bg-[#04243b]' : file.type === 'erp' ? 'bg-[#e4b35e]' : file.type === 'siga_tax' ? 'bg-emerald-600' : 'bg-indigo-600'
                        }`}>
                          <FileText className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-700 text-xs block truncate" title={file.name}>
                            {file.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono block">
                            {(file.size / 1024).toFixed(1)} KB | {file.recordsCount} {file.type === 'siga_tax' ? 'itens' : file.type === 'pis_cofins' ? 'registros' : 'linhas'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {file.type === 'sefaz' && sefazDuplicates.length > 0 && (
                          <span className="text-[9px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse" title="Duplicidades detectadas no relatório">
                            <AlertTriangle className="w-2.5 h-2.5 text-red-600" />
                            DUPLICADO
                          </span>
                        )}
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          file.type === 'sefaz' ? 'bg-[#04243b]/10 text-[#04243b]' : file.type === 'erp' ? 'bg-[#e4b35e]/10 text-[#04243b]' : file.type === 'siga_tax' ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'
                        }`}>
                          {file.type === 'sefaz' ? 'SEFAZ' : file.type === 'erp' ? 'ERP' : file.type === 'siga_tax' ? 'SIGA' : 'PIS/COF'}
                        </span>
                        <button
                          onClick={() => handleDeleteFile(file.name, file.type)}
                          className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                          title="Remover arquivo do Data Lake"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Right Column: Custom Strategic Cockpits per active Module */}
        {activeMainModule === 'siga' && (
          <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5">
                <div className="p-2 rounded-xl bg-[#e4b35e]/10 text-[#04243b]">
                  <FileSpreadsheet className="w-4 h-4 text-[#04243b]" />
                </div>
                <div>
                  <h2 className="text-xs font-black text-[#04243b] uppercase tracking-wider font-sans">
                    Painel do Auditor SIGA
                  </h2>
                  <span className="text-[10px] text-slate-400 font-medium block">
                    Análise e consolidação de Entradas & Saídas
                  </span>
                </div>
              </div>
              
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                Consolidação dos relatórios de Entradas e Saídas do SIGA com cálculo automático de ICMS, PIS e COFINS.
              </p>

              {/* Status information */}
              <div className="space-y-2.5">
                <div className="p-3.5 rounded-2xl border border-slate-150/80 bg-slate-50/60 flex items-center justify-between transition-all">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl text-white shrink-0 ${
                      organizadorEntradas.length > 0 || organizadorSaidas.length > 0 ? 'bg-emerald-600' : 'bg-slate-200 text-slate-400'
                    }`}>
                      <FileText className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 block">Relatório SIGA Impostos</span>
                      {organizadorEntradas.length > 0 || organizadorSaidas.length > 0 ? (
                        <span className="text-[11px] text-emerald-700 font-bold block truncate">
                          {organizadorMetadata?.empresa || 'Empresa Identificada'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium block">Pendente de importação</span>
                      )}
                    </div>
                  </div>
                  {(organizadorEntradas.length > 0 || organizadorSaidas.length > 0) ? (
                    <span className="bg-emerald-100/70 text-emerald-800 font-bold text-[10px] px-2.5 py-1 rounded-full border border-emerald-200/60">
                      {organizadorEntradas.length + organizadorSaidas.length} itens
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-500 font-semibold text-[10px] px-2.5 py-1 rounded-full border border-slate-200/60">
                      Aguardando
                    </span>
                  )}
                </div>

                {/* Sefaz count for conversion */}
                <div className="p-3.5 rounded-2xl border border-slate-150/80 bg-slate-50/60 flex items-center justify-between transition-all">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl text-white shrink-0 ${
                      sefazFile ? 'bg-[#04243b]' : 'bg-slate-200 text-slate-400'
                    }`}>
                      <FileText className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 block">Notas SEFAZ (Chaves)</span>
                      {sefazFile ? (
                        <span className="text-[11px] text-emerald-700 font-bold block truncate">
                          {sefazFile.name}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium block">Opcional para auditoria de chaves</span>
                      )}
                    </div>
                  </div>
                  {sefazFile ? (
                    <span className="bg-[#04243b]/10 text-[#04243b] font-bold text-[10px] px-2.5 py-1 rounded-full border border-[#04243b]/20">
                      {sefazFile.recordsCount} notas
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-400 font-medium text-[10px] px-2.5 py-1 rounded-full border border-slate-200/60">
                      Opcional
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {organizadorEntradas.length > 0 || organizadorSaidas.length > 0 ? (
                <button
                  onClick={() => {
                    setActiveOutputTab('organizador');
                    const element = document.getElementById('workspace-output-cockpit');
                    element?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="w-full py-3.5 rounded-xl bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-black text-xs tracking-wider uppercase transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-[#e4b35e]" />
                  Visualizar Relatório Organizador & Impostos
                </button>
              ) : (
                <div className="space-y-3">
                  <button
                    disabled
                    className="w-full py-3.5 rounded-xl bg-slate-100 text-slate-400 font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 cursor-not-allowed border border-slate-200/60"
                  >
                    <FileSpreadsheet className="w-4 h-4 opacity-50" />
                    Aguardando Relatório SIGA
                  </button>
                  <div className="text-center pt-1">
                    <button
                      onClick={handleLoadSampleDatabase}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-[#04243b] transition-all cursor-pointer font-sans"
                    >
                      <span>⚡ Carregar relatórios de exemplo integrados</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeMainModule === 'icms' && (
          <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-150 pb-3">
                <RefreshCw className="w-5 h-5 text-[#e4b35e]" />
                <h2 className="text-sm font-black text-[#04243b] uppercase tracking-tight font-sans">
                  Painel de Confronto Direto
                </h2>
              </div>
              
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                Compare de forma bidirecional e automatizada o relatório de chaves da SEFAZ com os lançamentos de notas no sistema ERP. Identifique furos de numeração e erros de valor.
              </p>

              <div className="space-y-3">
                {/* Relatório SEFAZ Required Row */}
                <div className="p-3 rounded-2xl border border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-1.5 rounded-lg text-white font-extrabold shrink-0 ${
                      sefazFile ? 'bg-[#04243b]' : 'bg-slate-200'
                    }`}>
                      <FileText className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-700 block font-sans">Relatório SEFAZ (Chaves)</span>
                      {sefazFile ? (
                        <span className="text-[10px] text-emerald-600 font-extrabold block truncate font-sans" title={sefazFile.name}>
                          ✓ {sefazFile.name}
                        </span>
                      ) : (
                        <span className="text-[10px] text-red-500 font-bold block font-sans">✗ Aguardando relatório SEFAZ</span>
                      )}
                    </div>
                  </div>
                  {sefazFile && (
                    <span className="bg-[#04243b]/10 text-[#04243b] font-mono text-[9px] font-bold px-2 py-0.5 rounded-full">
                      {sefazFile.recordsCount} notas
                    </span>
                  )}
                </div>

                {/* Relatório ERP Required Row */}
                <div className="p-3 rounded-2xl border border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-1.5 rounded-lg text-white font-extrabold shrink-0 ${
                      erpFile ? 'bg-[#e4b35e]' : 'bg-slate-200'
                    }`}>
                      <FileText className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-700 block font-sans">Registros ERP (Sistema)</span>
                      {erpFile ? (
                        <span className="text-[10px] text-emerald-600 font-extrabold block truncate font-sans" title={erpFile.name}>
                          ✓ {erpFile.name}
                        </span>
                      ) : (
                        <span className="text-[10px] text-red-500 font-bold block font-sans">✗ Aguardando relatório do ERP</span>
                      )}
                    </div>
                  </div>
                  {erpFile && (
                    <span className="bg-[#e4b35e]/10 text-[#04243b] font-mono text-[9px] font-bold px-2 py-0.5 rounded-full">
                      {erpFile.recordsCount} registros
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {sefazFile && erpFile ? (
                <button
                  onClick={handleTriggerStrategicConciliation}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#04243b] to-[#0d3b5c] hover:from-[#031d30] hover:to-[#092d47] text-[#e4b35e] font-black text-xs tracking-wider uppercase transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <RefreshCw className="w-4 h-4 text-[#e4b35e]" />
                  Confrontar Relatórios (SEFAZ x ERP)
                </button>
              ) : (
                <div className="space-y-3">
                  <button
                    disabled
                    className="w-full py-3 rounded-xl bg-slate-100 text-slate-400 font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 cursor-not-allowed font-sans"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Confrontar (Aguardando Relatórios)
                  </button>
                  <div className="text-center">
                    <span className="text-[10px] text-slate-450 block mb-1 font-sans">Sem arquivos reais no momento para testar?</span>
                    <button
                      onClick={handleLoadSampleDatabase}
                      className="inline-flex items-center gap-1 text-xs font-extrabold text-[#04243b] hover:text-[#e4b35e] transition-colors cursor-pointer font-sans"
                    >
                      ⚡ Carregar relatórios de exemplo integrados
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeMainModule === 'pis_cofins' && (
          <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-150 pb-3">
                <Coins className="w-5 h-5 text-[#e4b35e]" />
                <h2 className="text-sm font-black text-[#04243b] uppercase tracking-tight font-sans">
                  Auditoria de PIS & COFINS
                </h2>
              </div>
              
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                Identifique divergências de base de cálculo do PIS/COFINS, alíquotas incorretas, e inconsistências de CST por produto no SPED Contribuições.
              </p>

              {/* Status information */}
              <div className="space-y-3">
                <div className="p-3 rounded-2xl border border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-1.5 rounded-lg text-white font-extrabold shrink-0 ${
                      pisCofinsRows.length > 0 ? 'bg-indigo-600' : 'bg-slate-200'
                    }`}>
                      <FileText className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-700 block font-sans">Relatório PIS/COFINS</span>
                      {pisCofinsRows.length > 0 ? (
                        <span className="text-[10px] text-indigo-600 font-extrabold block truncate font-sans">
                          ✓ {pisCofinsMetadata?.empresa || 'Empresa Identificada'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-red-500 font-bold block font-sans">✗ Aguardando demonstrativo</span>
                      )}
                    </div>
                  </div>
                  {pisCofinsRows.length > 0 && (
                    <span className="bg-indigo-50 text-indigo-700 font-mono text-[9px] font-bold px-2 py-0.5 rounded-full">
                      {pisCofinsRows.length} registros
                    </span>
                  )}
                </div>

                {/* Audit Errors status */}
                {pisCofinsRows.length > 0 && (
                  <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                    pisCofinsAuditErrors.length > 0 ? 'border-red-100 bg-red-50/50 text-red-900' : 'border-emerald-100 bg-emerald-50/50 text-emerald-900'
                  }`}>
                    <div className="flex items-center gap-2">
                      <AlertCircle className={`w-4 h-4 ${pisCofinsAuditErrors.length > 0 ? 'text-red-600 animate-pulse' : 'text-emerald-600'}`} />
                      <span className="text-xs font-bold">
                        {pisCofinsAuditErrors.length > 0 
                          ? `${pisCofinsAuditErrors.length} divergências encontradas!`
                          : 'Nenhuma divergência de cálculo!'
                        }
                      </span>
                    </div>
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                      pisCofinsAuditErrors.length > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {pisCofinsAuditErrors.length > 0 ? 'ALERTA' : 'OK'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {pisCofinsRows.length > 0 ? (
                <button
                  onClick={() => {
                    setActiveOutputTab('pis_cofins');
                    setActivePisCofinsSubTab('auditoria');
                    const element = document.getElementById('workspace-output-cockpit');
                    element?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs tracking-wider uppercase transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldAlert className="w-4 h-4 text-white" />
                  Visualizar Erros de PIS/COFINS
                </button>
              ) : (
                <div className="space-y-3">
                  <button
                    disabled
                    className="w-full py-3 rounded-xl bg-slate-100 text-slate-400 font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 cursor-not-allowed font-sans"
                  >
                    <Coins className="w-4 h-4" />
                    Analisar PIS/COFINS (Aguardando Relatório)
                  </button>
                  <div className="text-center">
                    <span className="text-[10px] text-slate-450 block mb-1 font-sans">Sem arquivos no momento?</span>
                    <button
                      onClick={handleLoadSampleDatabase}
                      className="inline-flex items-center gap-1 text-xs font-extrabold text-[#04243b] hover:text-[#e4b35e] transition-colors cursor-pointer font-sans"
                    >
                      ⚡ Carregar relatórios de exemplo integrados
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* 4. MULTI-MODULE OUTPUT AREA & TABS SELECTOR */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" id="workspace-output-cockpit">
        
        {/* Module Header Tabs Selector - Dynamically filters tabs based on imported file capabilities */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            
            {/* Tab 1: Confronto */}
            {activeMainModule === 'icms' && availableTabs.includes('confronto') && (
              <button
                onClick={() => setActiveOutputTab('confronto')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  activeOutputTab === 'confronto'
                    ? 'bg-[#04243b] text-[#e4b35e] shadow-sm'
                    : 'text-slate-500 hover:text-[#04243b] hover:bg-slate-100'
                }`}
              >
                <Table className="w-4.5 h-4.5" />
                Confronto Bidirecional
              </button>
            )}

            {/* Tab 2: Organizador */}
            {activeMainModule === 'siga' && availableTabs.includes('organizador') && (
              <button
                onClick={() => setActiveOutputTab('organizador')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  activeOutputTab === 'organizador'
                    ? 'bg-[#04243b] text-[#e4b35e] shadow-sm'
                    : 'text-slate-500 hover:text-[#04243b] hover:bg-slate-100'
                }`}
              >
                <FileSpreadsheet className="w-4.5 h-4.5" />
                Organizador de Impostos
              </button>
            )}

            {/* Tab 3: Integridade */}
            {activeMainModule === 'icms' && availableTabs.includes('integridade') && (
              <button
                onClick={() => setActiveOutputTab('integridade')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  activeOutputTab === 'integridade'
                    ? 'bg-[#04243b] text-[#e4b35e] shadow-sm'
                    : 'text-slate-500 hover:text-[#04243b] hover:bg-slate-100'
                }`}
              >
                <ShieldAlert className="w-4.5 h-4.5" />
                Integridade & Sequência
              </button>
            )}

            {/* Tab 4: Conversor NF-e/NFC-e key list */}
            {activeMainModule === 'siga' && availableTabs.includes('conversor_siga') && (
              <button
                onClick={() => setActiveOutputTab('conversor_siga')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  activeOutputTab === 'conversor_siga'
                    ? 'bg-[#04243b] text-[#e4b35e] shadow-sm'
                    : 'text-slate-500 hover:text-[#04243b] hover:bg-slate-100'
                }`}
              >
                <CheckCircle2 className="w-4.5 h-4.5" />
                Conversor NF-e / NFC-e SIGA
              </button>
            )}

            {/* Tab 5: PIS/COFINS Mapper */}
            {activeMainModule === 'pis_cofins' && availableTabs.includes('pis_cofins') && (
              <button
                onClick={() => setActiveOutputTab('pis_cofins')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  activeOutputTab === 'pis_cofins'
                    ? 'bg-[#04243b] text-[#e4b35e] shadow-sm'
                    : 'text-slate-500 hover:text-[#04243b] hover:bg-slate-100'
                }`}
              >
                <Coins className="w-4.5 h-4.5" />
                Mapeador PIS / COFINS
              </button>
            )}

          </div>

          {/* Quick Module-specific export actions */}
          <div className="flex gap-2">
            {activeOutputTab === 'confronto' && auditSummary && (
              <button
                onClick={handleExportAuditExcelUnified}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 text-white" />
                Exportar Confronto Excel
              </button>
            )}

            {activeOutputTab === 'organizador' && (organizadorEntradas.length > 0 || organizadorSaidas.length > 0) && (
              <button
                onClick={handleExportSigaTaxExcel}
                className="px-4 py-2 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-extrabold text-[11px] tracking-wide uppercase rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer border border-[#e4b35e]/30"
              >
                <Download className="w-4 h-4 text-[#e4b35e]" />
                Exportar Impostos Excel
              </button>
            )}

            {activeOutputTab === 'conversor_siga' && sefazRows.length > 0 && (
              <button
                onClick={handleExportConversorExcel}
                className="px-4 py-2 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-extrabold text-[11px] tracking-wide uppercase rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer border border-[#e4b35e]/30"
              >
                <Download className="w-4 h-4 text-[#e4b35e]" />
                Exportar Notas Excel
              </button>
            )}

            {activeOutputTab === 'pis_cofins' && pisCofinsRows.length > 0 && (
              <button
                onClick={handleExportPisCofinsExcel}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 text-white" />
                Exportar PIS/COFINS Excel
              </button>
            )}
          </div>
        </div>

        {/* Sub-Interface active views */}
        <div className="p-6">
          
          {/* ======================================================== */}
          {/* MODULE 1: CONFRONTO BIDIRECIONAL SEFAZ vs ERP */}
          {/* ======================================================== */}
          {activeOutputTab === 'confronto' && (
            <div className="space-y-6">
              {sefazDuplicates.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-900 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center shadow-xs animate-fadeIn">
                  <div className="flex gap-3 min-w-0">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-extrabold uppercase tracking-tight text-red-800">
                        Alerta de Duplicidade no Relatório SEFAZ
                      </h4>
                      <p className="text-xs text-red-700 leading-normal font-sans">
                        Identificamos {sefazDuplicates.length} {sefazDuplicates.length === 1 ? 'chave' : 'chaves'} de acesso duplicada(s) ou repetida(s) no arquivo da SEFAZ. Isto pode provocar divergências falsas e duplicar valores contábeis no confronto.
                      </p>
                      <div className="mt-2 space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                        {sefazDuplicates.map((dup, idx) => (
                          <div key={`dup-${idx}`} className="text-xs font-mono bg-red-100/50 p-2 rounded-lg border border-red-150 flex flex-col sm:flex-row sm:justify-between gap-1">
                            <span className="font-bold text-red-900">Nota #{dup.numeroNota} {dup.serie ? `(Série ${dup.serie})` : ''}</span>
                            <span className="text-[10px] text-red-800 truncate sm:max-w-md" title={dup.key}>Chave: {dup.key}</span>
                            <span className="text-[10px] bg-red-200 px-2 py-0.5 rounded-full font-bold text-red-950 shrink-0 self-start sm:self-center">{dup.count}x no relatório</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                    <button
                      onClick={handleRemoveSefazDuplicates}
                      className="w-full md:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
                    >
                      ⚡ Corrigir & Remover Duplicados
                    </button>
                  </div>
                </div>
              )}

              {!auditSummary ? (
                <div className="text-center py-16 text-slate-400 space-y-4">
                  <Table className="w-12 h-12 text-slate-300 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-600 font-sans">Sem Confronto Executado</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto font-sans">
                      Carregue um arquivo SEFAZ de notas e um Extrato ERP contábil no painel acima para calcular o cruzamento de dados.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-fadeIn">
                  
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-slate-400 font-sans block">Total SEFAZ</span>
                      <span className="text-xl font-black text-[#04243b] block mt-1 font-mono">{auditSummary.totalSefaz}</span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-slate-400 font-sans block">Total ERP</span>
                      <span className="text-xl font-black text-[#04243b] block mt-1 font-mono">{auditSummary.totalErp}</span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl text-emerald-800">
                      <span className="text-[10px] uppercase font-bold text-emerald-600 font-sans block">Conciliadas (OK)</span>
                      <span className="text-xl font-black block mt-1 font-mono">{auditSummary.sincronizadas}</span>
                    </div>
                    <div className="bg-red-50 border border-red-100 p-4 rounded-2xl text-red-800" title="Presente no relatório da SEFAZ, mas ausente nos registros do ERP">
                      <span className="text-[10px] uppercase font-bold text-red-600 font-sans block">Faltantes no ERP</span>
                      <span className="text-xl font-black block mt-1 font-mono">{auditSummary.faltantesErp}</span>
                      <span className="text-[8.5px] text-red-500 font-sans mt-0.5 block">Só constam na SEFAZ</span>
                    </div>
                    <div className="bg-purple-50 border border-purple-100 p-4 rounded-2xl text-purple-800" title="Presente nos registros do ERP, mas ausente no relatório da SEFAZ">
                      <span className="text-[10px] uppercase font-bold text-purple-600 font-sans block">Não Constam SEFAZ</span>
                      <span className="text-xl font-black block mt-1 font-mono">{auditSummary.naoConstamSefaz}</span>
                      <span className="text-[8.5px] text-purple-500 font-sans mt-0.5 block">Só constam no ERP</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-amber-800" title="Registros com número igual mas divergência nos valores monetários">
                      <span className="text-[10px] uppercase font-bold text-amber-600 font-sans block">Divergências Valor</span>
                      <span className="text-xl font-black block mt-1 font-mono">{auditSummary.divergenciasValor}</span>
                      <span className="text-[8.5px] text-amber-600 font-sans mt-0.5 block">Divergência de valores</span>
                    </div>
                  </div>

                  {/* Filter / Search controls */}
                  <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                    <div className="relative w-full md:w-80">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={auditSearchTerm}
                        onChange={(e) => setAuditSearchTerm(e.target.value)}
                        placeholder="Buscar por número da Nota, chave ou cliente..."
                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#04243b]"
                      />
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>Status de Confronto:</span>
                      <select
                        value={auditFilterStatus}
                        onChange={(e) => setAuditFilterStatus(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-bold"
                      >
                        <option value="all">Todos os Registros ({auditItems.length})</option>
                        <option value="OK">Sincronizado / OK</option>
                        <option value="FALTANTE_ERP">Omitido no ERP</option>
                        <option value="NAO_CONSTA_SEFAZ">Não consta na SEFAZ</option>
                        <option value="DIVERGENCIA_VALOR">Divergência de Valores</option>
                      </select>
                    </div>
                  </div>

                  {/* Table results list */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100">
                        <tr>
                          <th className="py-2.5 px-4">Nota</th>
                          <th className="py-2.5 px-4 text-center">Status</th>
                          <th className="py-2.5 px-4 text-right">R$ SEFAZ</th>
                          <th className="py-2.5 px-4 text-right">R$ ERP</th>
                          <th className="py-2.5 px-4 text-center">Diferença</th>
                          <th className="py-2.5 px-4">Cliente / Emitente</th>
                          <th className="py-2.5 px-4">Chave de Acesso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-mono">
                        {filteredAuditItems.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-10 text-slate-400 font-sans">
                              Nenhum registro encontrado correspondente aos filtros atuais.
                            </td>
                          </tr>
                        ) : (
                          filteredAuditItems.map((item, idx) => {
                            const diff = Math.abs((item.sefazValue || 0) - (item.erpValue || 0));
                            return (
                              <tr key={`audit-row-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-2.5 px-4 font-bold text-[#04243b]">{item.nota}</td>
                                <td className="py-2.5 px-4 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                    item.status === 'OK' ? 'bg-emerald-50 text-emerald-700' :
                                    item.status === 'FALTANTE_ERP' ? 'bg-red-50 text-red-700 font-bold' :
                                    item.status === 'NAO_CONSTA_SEFAZ' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'
                                  }`}>
                                    {item.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-right text-slate-700 font-bold">
                                  R$ {item.sefazValue !== undefined && item.sefazValue !== null ? item.sefazValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}
                                </td>
                                <td className="py-2.5 px-4 text-right text-slate-700 font-bold">
                                  R$ {item.erpValue !== undefined && item.erpValue !== null ? item.erpValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  {diff > 0.01 ? (
                                    <span className="text-red-600 font-bold">
                                      R$ {(diff ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                  ) : '-'}
                                </td>
                                <td className="py-2.5 px-4 font-sans text-slate-600 truncate max-w-[200px]" title={item.cliente}>
                                  {item.cliente || '-'}
                                </td>
                                <td className="py-2.5 px-4 text-[10px] text-slate-400 select-all tracking-tight font-mono">{item.chaveDeAcesso || '-'}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* ======================================================== */}
          {/* MODULE 2: ORGANIZADOR DE RELATÓRIO E IMPOSTOS */}
          {/* ======================================================== */}
          {activeOutputTab === 'organizador' && (
            <div className="space-y-6">
              {organizadorEntradas.length === 0 && organizadorSaidas.length === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-4">
                  <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-600 font-sans">Sem Relatório SIGA Carregado</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto font-sans">
                      Arraste ou selecione o arquivo semicolon-delimited de movimentação SIGA no painel do Data Lake para visualizar o relatório.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-fadeIn font-sans">
                  
                  {/* Top Stats of Organizador */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold text-emerald-800">Total de Entradas</span>
                      <span className="text-xl font-black text-emerald-950 font-mono mt-1">
                        R$ {(orgStats?.entradas?.vlrContabil ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1">{organizadorEntradas.length} lançamentos fiscais</span>
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold text-blue-800">Total de Saídas</span>
                      <span className="text-xl font-black text-blue-950 font-mono mt-1">
                        R$ {(orgStats?.saidas?.vlrContabil ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1">{organizadorSaidas.length} lançamentos fiscais</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Saldo Operacional</span>
                      <span className="text-xl font-black text-slate-800 font-mono mt-1">
                        R$ {((orgStats?.saidas?.vlrContabil ?? 0) - (orgStats?.entradas?.vlrContabil ?? 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1">Diferença Saídas - Entradas</span>
                    </div>

                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold text-amber-800">Carga Tributária Total</span>
                      <span className="text-xl font-black text-amber-950 font-mono mt-1">
                        R$ {((orgStats?.entradas?.totalTaxes ?? 0) + (orgStats?.saidas?.totalTaxes ?? 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1">ICMS + IPI identificados</span>
                    </div>
                  </div>

                  {/* Sub-tab selection for Entrada, Saída, and Consolidado summaries */}
                  <div className="border-b border-slate-200 flex flex-wrap gap-2 pt-2">
                    <button
                      onClick={() => { setActiveOrgSubTab('entradas'); setOrgCurrentPage(1); }}
                      className={`px-4 py-2 border-b-2 text-xs font-bold transition-all cursor-pointer ${
                        activeOrgSubTab === 'entradas' ? 'border-[#04243b] text-[#04243b]' : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Entradas (📥 {organizadorEntradas.length} NFs)
                    </button>
                    <button
                      onClick={() => { setActiveOrgSubTab('saidas'); setOrgCurrentPage(1); }}
                      className={`px-4 py-2 border-b-2 text-xs font-bold transition-all cursor-pointer ${
                        activeOrgSubTab === 'saidas' ? 'border-[#04243b] text-[#04243b]' : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Saídas (📤 {organizadorSaidas.length} NFs)
                    </button>
                    <button
                      onClick={() => { setActiveOrgSubTab('auditoria'); setOrgCurrentPage(1); }}
                      className={`px-4 py-2 border-b-2 text-xs font-bold transition-all cursor-pointer ${
                        activeOrgSubTab === 'auditoria' ? 'border-[#04243b] text-[#04243b]' : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Resumo Fiscal & Impostos CST
                    </button>
                  </div>

                  {/* Standard Search, Pagination and Rows display when viewing Entradas / Saídas list */}
                  {activeOrgSubTab !== 'auditoria' ? (
                    <div className="space-y-4">
                      
                      {/* Controls toolbar */}
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150 flex flex-col md:flex-row gap-3 items-center justify-between">
                        <div className="relative w-full md:w-80">
                          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={orgSearchTerm}
                            onChange={(e) => { setOrgSearchTerm(e.target.value); setOrgCurrentPage(1); }}
                            placeholder="Buscar nota, produto, CNPJ, NCM..."
                            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#04243b]"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          
                          {/* Aggregate Duplicates Switch */}
                          <label className="inline-flex items-center gap-2 cursor-pointer bg-white border border-slate-200 px-3 py-1 rounded-xl transition-all h-[32px] select-none shadow-2xs">
                            <input 
                              type="checkbox" 
                              checked={groupDuplicates} 
                              onChange={(e) => { setGroupDuplicates(e.target.checked); setOrgCurrentPage(1); }}
                              className="sr-only peer"
                            />
                            <div className="relative w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1 font-sans">
                              Somar Duplicados
                            </span>
                          </label>

                          <select
                            value={orgCfopFilter}
                            onChange={(e) => { setOrgCfopFilter(e.target.value); setOrgCurrentPage(1); }}
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 font-bold"
                          >
                            <option value="all">Filtrar CFOP ({uniqueCfops.length})</option>
                            {uniqueCfops.map(c => <option key={`opt-cfop-${c}`} value={c}>{c}</option>)}
                          </select>

                          <select
                            value={orgCstFilter}
                            onChange={(e) => { setOrgCstFilter(e.target.value); setOrgCurrentPage(1); }}
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 font-bold"
                          >
                            <option value="all">Filtrar CST ({uniqueCsts.length})</option>
                            {uniqueCsts.map(c => <option key={`opt-cst-${c}`} value={c}>{c}</option>)}
                          </select>

                        </div>
                      </div>

                      {/* Rows Grid Table */}
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-2xs">
                        <table className="w-full text-left border-collapse min-w-[1500px]">
                          <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100">
                            <tr>
                              {!groupDuplicates && <th className="py-2 px-3">Nota Fiscal</th>}
                              {!groupDuplicates && <th className="py-2 px-3">Data</th>}
                              {!groupDuplicates && <th className="py-2 px-3">CNPJ / CPF</th>}
                              <th className="py-2 px-3 text-center">CFOP</th>
                              <th className="py-2 px-3">Produto</th>
                              <th className="py-2 px-3 text-center">NCM</th>
                              <th className="py-2 px-3 text-center">UN</th>
                              <th className="py-2 px-3 text-center">Qtde</th>
                              <th className="py-2 px-3 text-right">R$ Unit.</th>
                              <th className="py-2 px-3 text-right">R$ Produto</th>
                              <th className="py-2 px-3 text-right">Desconto</th>
                              <th className="py-2 px-3 text-right">Vlr. Contábil</th>
                              <th className="py-2 px-3 text-center">CST</th>
                              <th className="py-2 px-3 text-right">R$ Base ICMS</th>
                              <th className="py-2 px-3 text-right">% ICMS</th>
                              <th className="py-2 px-3 text-right">R$ ICMS</th>
                              <th className="py-2 px-3 text-right">% IPI</th>
                              <th className="py-2 px-3 text-right">R$ IPI</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-[11px] font-mono">
                            {paginatedOrgItems.length === 0 ? (
                              <tr>
                                <td colSpan={groupDuplicates ? 15 : 18} className="text-center py-10 text-slate-400 font-sans">
                                  Nenhum registro encontrado correspondente aos filtros aplicados.
                                </td>
                              </tr>
                            ) : (
                              paginatedOrgItems.map((item, idx) => (
                                <tr key={`item-org-row-${idx}`} className="hover:bg-slate-50/50">
                                  {!groupDuplicates && <td className="py-2 px-3 font-bold text-[#04243b]">{item.notaFiscal}</td>}
                                  {!groupDuplicates && <td className="py-2 px-3">{item.data}</td>}
                                  {!groupDuplicates && <td className="py-2 px-3 text-[10px] text-slate-500">{item.cnpj}</td>}
                                  <td className="py-2 px-3 text-center font-bold">{item.cfop}</td>
                                  <td className="py-2 px-3 font-sans max-w-[220px] truncate">
                                    <span className="font-bold text-slate-700 block truncate text-[11px]">{item.nomeProduto}</span>
                                    <span className="text-[9px] text-slate-400">Cód: {item.codigoProduto}</span>
                                  </td>
                                  <td className="py-2 px-3 text-center text-slate-500">{item.ncm}</td>
                                  <td className="py-2 px-3 text-center">{item.un}</td>
                                  <td className="py-2 px-3 text-center">{item.qtde}</td>
                                  <td className="py-2 px-3 text-right">R$ {(item.rUnit ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                  <td className="py-2 px-3 text-right">R$ {(item.rProduto ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                  <td className="py-2 px-3 text-right text-slate-500">R$ {(item.desconto ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                  <td className="py-2 px-3 text-right font-bold text-slate-800">R$ {(item.vlrContabil ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                  <td className="py-2 px-3 text-center"><span className="bg-slate-100 px-1.5 py-0.2 rounded font-bold text-[10px]">{item.cst}</span></td>
                                  <td className="py-2 px-3 text-right text-slate-600">R$ {(item.rBaseIcms ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                  <td className="py-2 px-3 text-right text-slate-600">{(item.pIcms ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%</td>
                                  <td className="py-2 px-3 text-right text-slate-600 font-bold">R$ {(item.rIcms ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                  <td className="py-2 px-3 text-right text-slate-600">{(item.pIpi ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%</td>
                                  <td className="py-2 px-3 text-right text-slate-600 font-bold">R$ {(item.rIpi ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Controls */}
                      {totalOrgPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-xs text-slate-400 font-sans">Página <strong>{orgCurrentPage}</strong> de {totalOrgPages}</span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setOrgCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={orgCurrentPage === 1}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setOrgCurrentPage(prev => Math.min(totalOrgPages, prev + 1))}
                              disabled={orgCurrentPage === totalOrgPages}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                    </div>
                  ) : (
                    // Auditoria summaries / Impostos tables
                    <div className="space-y-6">
                      
                      {/* Sintese de Operações por CFOP */}
                      <div className="bg-[#04243b]/5 p-5 rounded-2xl border border-slate-200/50">
                        <h4 className="text-xs font-black text-[#04243b] uppercase mb-4 tracking-wider">
                          Síntese das Operações Fiscais por CFOP
                        </h4>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          
                          {/* ENTRADAS */}
                          <div className="bg-white border border-slate-150 rounded-xl overflow-hidden shadow-2xs">
                            <div className="bg-emerald-700 text-white px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider flex justify-between items-center font-sans">
                              <span>📥 SÍNTESE ENTRADAS CFOP</span>
                              <span className="font-mono bg-emerald-800/80 px-2 py-0.5 rounded text-[10px]">
                                R$ {(auditReport?.entradas?.cfopList ?? []).reduce((acc, curr) => acc + (curr?.total ?? 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="p-2 overflow-x-auto">
                              <table className="w-full text-left border-collapse text-[10px]">
                                <thead className="bg-slate-50 text-slate-500 uppercase text-[8px] font-bold">
                                  <tr>
                                    <th className="py-2 px-2">CFOP</th>
                                    <th className="py-2 px-2 text-right">Lançamentos</th>
                                    <th className="py-2 px-2 text-right">Contábil</th>
                                    <th className="py-2 px-2 text-right">Base ICMS</th>
                                    <th className="py-2 px-2 text-right">ICMS</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 font-mono text-[10px]">
                                  {auditReport.entradas.cfopList.map(c => (
                                    <tr key={`sum-ent-cfop-${c.cfop}`} className="hover:bg-slate-50/50">
                                      <td className="py-1.5 px-2 font-bold text-slate-700">{c.cfop}</td>
                                      <td className="py-1.5 px-2 text-center">{c.count}</td>
                                      <td className="py-1.5 px-2 text-right font-bold">R$ {(c?.total ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                      <td className="py-1.5 px-2 text-right text-slate-500">R$ {(c?.rBaseIcms ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                      <td className="py-1.5 px-2 text-right text-slate-600 font-bold">R$ {(c?.rIcms ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* SAÍDAS */}
                          <div className="bg-white border border-slate-150 rounded-xl overflow-hidden shadow-2xs">
                            <div className="bg-blue-700 text-white px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider flex justify-between items-center font-sans">
                              <span>📤 SÍNTESE SAÍDAS CFOP</span>
                              <span className="font-mono bg-blue-800/80 px-2 py-0.5 rounded text-[10px]">
                                R$ {(auditReport?.saidas?.cfopList ?? []).reduce((acc, curr) => acc + (curr?.total ?? 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="p-2 overflow-x-auto">
                              <table className="w-full text-left border-collapse text-[10px]">
                                <thead className="bg-slate-50 text-slate-500 uppercase text-[8px] font-bold">
                                  <tr>
                                    <th className="py-2 px-2">CFOP</th>
                                    <th className="py-2 px-2 text-right">Lançamentos</th>
                                    <th className="py-2 px-2 text-right">Contábil</th>
                                    <th className="py-2 px-2 text-right">Base ICMS</th>
                                    <th className="py-2 px-2 text-right">ICMS</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 font-mono text-[10px]">
                                  {auditReport.saidas.cfopList.map(c => (
                                    <tr key={`sum-sai-cfop-${c.cfop}`} className="hover:bg-slate-50/50">
                                      <td className="py-1.5 px-2 font-bold text-slate-700">{c.cfop}</td>
                                      <td className="py-1.5 px-2 text-center">{c.count}</td>
                                      <td className="py-1.5 px-2 text-right font-bold">R$ {(c?.total ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                      <td className="py-1.5 px-2 text-right text-slate-500">R$ {(c?.rBaseIcms ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                      <td className="py-1.5 px-2 text-right text-slate-600 font-bold">R$ {(c?.rIcms ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                        </div>
                      </div>

                      {/* Concentração Fiscal por NCM */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
                        <h4 className="text-xs font-black text-[#04243b] uppercase mb-4 tracking-wider">
                          Concentração Fiscal por Código NCM (Nomenclatura Comum do Mercosul)
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] border-b border-slate-250">
                              <tr>
                                <th className="py-2 px-3">Código NCM</th>
                                <th className="py-2 px-3">Origem</th>
                                <th className="py-2 px-3 text-right">Contábil Acumulado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                              {auditReport.entradas.ncmList.slice(0, 5).map(n => (
                                <tr key={`ncm-ent-${n.ncm}`} className="hover:bg-slate-50/50">
                                  <td className="py-2 px-3 font-bold text-slate-700">{n.ncm}</td>
                                  <td className="py-2 px-3"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">ENTRADA</span></td>
                                  <td className="py-2 px-3 text-right font-bold">R$ {(n?.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                </tr>
                              ))}
                              {auditReport.saidas.ncmList.slice(0, 5).map(n => (
                                <tr key={`ncm-sai-${n.ncm}`} className="hover:bg-slate-50/50">
                                  <td className="py-2 px-3 font-bold text-slate-700">{n.ncm}</td>
                                  <td className="py-2 px-3"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">SAÍDA</span></td>
                                  <td className="py-2 px-3 text-right font-bold">R$ {(n?.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                    </div>
                  )}

                </div>
              )}

            </div>
          )}

          {/* ======================================================== */}
          {/* MODULE 3: INTEGRIDADE & SEQUENCIA */}
          {/* ======================================================== */}
          {activeOutputTab === 'integridade' && (
            <div className="space-y-6">
              {sefazDuplicates.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-900 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center shadow-xs animate-fadeIn">
                  <div className="flex gap-3 min-w-0">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-extrabold uppercase tracking-tight text-red-800">
                        Alerta de Duplicidade no Relatório SEFAZ
                      </h4>
                      <p className="text-xs text-red-700 leading-normal font-sans">
                        Identificamos {sefazDuplicates.length} {sefazDuplicates.length === 1 ? 'chave' : 'chaves'} de acesso duplicada(s) ou repetida(s) no arquivo da SEFAZ. Isto pode provocar divergências falsas e duplicar valores contábeis no confronto.
                      </p>
                      <div className="mt-2 space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                        {sefazDuplicates.map((dup, idx) => (
                          <div key={`dup-${idx}`} className="text-xs font-mono bg-red-100/50 p-2 rounded-lg border border-red-150 flex flex-col sm:flex-row sm:justify-between gap-1">
                            <span className="font-bold text-red-900">Nota #{dup.numeroNota} {dup.serie ? `(Série ${dup.serie})` : ''}</span>
                            <span className="text-[10px] text-red-800 truncate sm:max-w-md" title={dup.key}>Chave: {dup.key}</span>
                            <span className="text-[10px] bg-red-200 px-2 py-0.5 rounded-full font-bold text-red-950 shrink-0 self-start sm:self-center">{dup.count}x no relatório</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                    <button
                      onClick={handleRemoveSefazDuplicates}
                      className="w-full md:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
                    >
                      ⚡ Corrigir & Remover Duplicados
                    </button>
                  </div>
                </div>
              )}

              {!auditSummary ? (
                <div className="text-center py-16 text-slate-400 space-y-4">
                  <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-600 font-sans">Sem Estatísticas de Sequência Calculadas</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto font-sans">
                      Execute a conciliação estratégica no Data Lake acima para calcular saltos de numeração e quebra de sequencial.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-fadeIn font-sans">
                  
                  {/* Sequence header block */}
                  <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h3 className="text-sm font-black text-[#04243b] uppercase">Resumo de Sequencial de Notas (Gaps)</h3>
                      <p className="text-xs text-slate-400 mt-1">Análise de sequência de nota {auditSummary.minNota} até {auditSummary.maxNota}</p>
                    </div>
                    <div className="bg-[#04243b] text-[#e4b35e] px-4 py-2 rounded-xl text-xs font-mono font-bold">
                      SALTOS ENCONTRADOS: {auditSummary.saltosSequencia}
                    </div>
                  </div>

                  {/* Canceled/Inutilizadas logs and gaps table list */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Gaps found log */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        <h4 className="text-xs font-black text-[#04243b] uppercase">Gaps Identificados na SEFAZ</h4>
                      </div>

                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {auditItems.filter(i => i.status === 'SALTO_SEQUENCIA').length === 0 ? (
                          <div className="text-center py-10 text-slate-400 text-xs">
                            Nenhum salto sequencial detectado na faixa processada. Integridade 100% OK!
                          </div>
                        ) : (
                          auditItems.filter(i => i.status === 'SALTO_SEQUENCIA').map((gap, idx) => (
                            <div key={`gap-${idx}`} className="flex items-center justify-between p-3 rounded-xl bg-amber-50/50 border border-amber-100 font-mono text-xs">
                              <span className="font-bold text-amber-800">Nota Faltante: #{gap.nota}</span>
                              <span className="text-[10px] text-slate-400">Status SEFAZ: Inutilizada / Não Emitida</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* General Invoices Status audit check */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-3">
                        <FileCheck2 className="w-5 h-5 text-emerald-600" />
                        <h4 className="text-xs font-black text-[#04243b] uppercase">Validação de Integridade Geral</h4>
                      </div>

                      <div className="space-y-4 text-xs text-slate-600">
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span>Primeira nota fiscal emitida:</span>
                          <span className="font-mono font-bold text-[#04243b]">#{auditSummary.minNota}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span>Última nota fiscal emitida:</span>
                          <span className="font-mono font-bold text-[#04243b]">#{auditSummary.maxNota}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span>Percentual de Consistência Geral:</span>
                          <span className="font-mono font-bold text-emerald-600">
                            {((auditSummary.sincronizadas / (auditSummary.totalSefaz || 1)) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex gap-2">
                          <Info className="w-4 h-4 text-slate-400 shrink-0" />
                          <p className="text-[10px] text-slate-400 leading-normal">
                            Documentos cancelados na base da SEFAZ são ignorados dos cálculos de diferenças monetárias mas são contabilizados na integridade de numeração.
                          </p>
                        </div>
                      </div>
                    </div>

                  </div>

                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* MODULE 4: CONVERSOR NFC-E SIGA (ACCESS KEYS) */}
          {/* ======================================================== */}
          {activeOutputTab === 'conversor_siga' && (
            <div className="space-y-6 animate-fadeIn font-sans">
              
              {sefazRows.length === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-4">
                  <Database className="w-12 h-12 text-slate-300 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-600 font-sans">Sem Chaves de Notas Indexadas</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto font-sans">
                      Faça o upload do relatório com Chaves de Acesso SEFAZ (NF-e/NFC-e) no Data Lake para carregar a lista.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* Stats of NF-e / NFC-e loaded */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Total Indexado</span>
                      <span className="text-xl font-black text-[#04243b] block mt-1 font-mono">{nfceStats.totalCount} NFs</span>
                      <div className="text-[10px] text-slate-500 mt-1 flex gap-2">
                        <span>Model 55: <strong>{nfceStats.count55}</strong></span>
                        <span>Model 65: <strong>{nfceStats.count65}</strong></span>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Valor Acumulado</span>
                      <span className="text-xl font-black text-slate-800 block mt-1 font-mono">
                        R$ {(nfceStats?.totalValor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-1">Confrontável com extrato ERP</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl text-emerald-800">
                      <span className="text-[10px] uppercase font-bold text-emerald-600">Chaves Válidas</span>
                      <span className="text-xl font-black block mt-1 font-mono">{nfceStats.validKeysCount}</span>
                      <div className="text-[10px] text-emerald-600 mt-1">Comprimento de 44 dígitos</div>
                    </div>
                    <div className="bg-red-50 border border-red-100 p-4 rounded-2xl text-red-800">
                      <span className="text-[10px] uppercase font-bold text-red-600">Chaves Inválidas</span>
                      <span className="text-xl font-black block mt-1 font-mono">{nfceStats.invalidKeysCount}</span>
                      <div className="text-[10px] text-red-600 mt-1">Erros de estrutura</div>
                    </div>
                  </div>

                  {/* Filters / Search controls */}
                  <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                    <div className="relative w-full md:w-80">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchTermNfce}
                        onChange={(e) => setSearchTermNfce(e.target.value)}
                        placeholder="Buscar por Nota, Série, CNPJ..."
                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#04243b]"
                      />
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>Validação do Registro:</span>
                      <select
                        value={filterStatusNfce}
                        onChange={(e) => setFilterStatusNfce(e.target.value as any)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-bold"
                      >
                        <option value="all">Todas as notas ({sefazRows.length})</option>
                        <option value="valid">Apenas Válidas</option>
                        <option value="invalid">Apenas Inválidas</option>
                      </select>
                    </div>
                  </div>

                  {/* List grid list */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100">
                        <tr>
                          <th className="py-2.5 px-3">Chave de Acesso</th>
                          <th className="py-2.5 px-3">Número</th>
                          <th className="py-2.5 px-3">Data Emissão</th>
                          <th className="py-2.5 px-3">CNPJ/CPF Fornecedor</th>
                          <th className="py-2.5 px-3">Nome Fornecedor</th>
                          <th className="py-2.5 px-3">Série</th>
                          <th className="py-2.5 px-3">UF</th>
                          <th className="py-2.5 px-3 text-right">Valor</th>
                          <th className="py-2.5 px-3 text-center">Situação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px] font-mono">
                        {nfceFilteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="text-center py-10 text-slate-400 font-sans">
                              Nenhuma nota fiscal encontrada no filtro selecionado.
                            </td>
                          </tr>
                        ) : (
                          nfceFilteredRows.map((r, idx) => {
                            const ufClean = r.ufNome.includes('(') 
                              ? r.ufNome.substring(r.ufNome.indexOf('(') + 1, r.ufNome.indexOf(')')) 
                              : r.ufNome;
                            return (
                              <tr key={`nfce-row-${idx}`} className="hover:bg-slate-50/50">
                                <td className="py-2 px-3 text-slate-400 select-all font-mono tracking-tight text-[10px]">{r.chaveDeAcesso}</td>
                                <td className="py-2 px-3 font-bold text-[#04243b]">{r.numeroNotaFormatado}</td>
                                <td className="py-2 px-3">{r.dataEmissao}</td>
                                <td className="py-2 px-3 text-slate-500">{r.cnpjFornecedorFormatado || r.cnpjFormatado}</td>
                                <td className="py-2 px-3 font-sans text-slate-700 max-w-xs truncate" title={r.nomeFornecedor}>{r.nomeFornecedor || 'FORNECEDOR NÃO INFORMADO'}</td>
                                <td className="py-2 px-3">{r.serie}</td>
                                <td className="py-2 px-3 font-sans text-slate-600">{ufClean}</td>
                                <td className="py-2 px-3 text-right font-bold text-slate-700">
                                  R$ {(r?.valorDecimal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  {r.situacaoNfe === 'CANCELADA' ? (
                                    <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-md text-[9px] uppercase tracking-wider font-extrabold font-sans">
                                      CANCELADA
                                    </span>
                                  ) : r.situacaoNfe === 'DENEGADA' ? (
                                    <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md text-[9px] uppercase tracking-wider font-extrabold font-sans">
                                      DENEGADA
                                    </span>
                                  ) : (
                                    <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md text-[9px] uppercase tracking-wider font-extrabold font-sans">
                                      AUTORIZADA
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* ======================================================== */}
          {/* MODULE 5: PIS/COFINS MAPPER */}
          {/* ======================================================== */}
          {activeOutputTab === 'pis_cofins' && (
            <div className="space-y-6 animate-fadeIn font-sans">
              
              {pisCofinsRows.length === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-4">
                  <Coins className="w-12 h-12 text-slate-300 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-600 font-sans">Sem Dados de PIS/COFINS Indexados</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto font-sans">
                      Carregue o Demonstrativo de Créditos PIS/COFINS no Data Lake para analisar os itens de Entradas e Saídas mapeados por CFOP e CST.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* Metadata Header Cards */}
                  {pisCofinsMetadata && (
                    <div className="bg-[#04243b] text-white p-6 rounded-2xl border border-slate-700/50 shadow-md">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <span className="text-[#e4b35e] text-[10px] font-black uppercase tracking-wider">Metadados do Demonstrativo</span>
                          <h3 className="text-lg font-black tracking-tight">{pisCofinsMetadata.empresa || 'Empresa não identificada'}</h3>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300 font-medium">
                            {pisCofinsMetadata.cnpj && (
                              <span>CNPJ: <strong className="font-mono text-white">{pisCofinsMetadata.cnpj}</strong></span>
                            )}
                            {pisCofinsMetadata.periodo && (
                              <span>Período: <strong className="text-white">{pisCofinsMetadata.periodo}</strong></span>
                            )}
                          </div>
                        </div>
                        <div className="bg-slate-800/80 border border-slate-700 px-4 py-2.5 rounded-xl text-right">
                          <span className="text-[9px] text-[#e4b35e] font-black uppercase block">Regime Tributário</span>
                          <span className="font-extrabold text-sm block mt-0.5">{pisCofinsMetadata.regime || 'Lucro Real'}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Stats of PIS/COFINS */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* CRÉDITOS */}
                    <div className="bg-emerald-50/70 border border-emerald-100 p-4 rounded-2xl text-emerald-900">
                      <div className="flex items-center gap-1.5">
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-[10px] uppercase font-bold text-emerald-600 block">Créditos (Entradas)</span>
                      </div>
                      <span className="text-xl font-black block mt-1.5 font-mono text-emerald-800">
                        R$ {(pisCofinsStats.pisTotal + pisCofinsStats.cofinstotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <div className="text-[10px] text-emerald-700/80 mt-1 space-y-0.5">
                        <div className="flex justify-between">
                          <span>PIS (1.65%):</span>
                          <strong className="font-mono">R$ {pisCofinsStats.pisTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>COFINS (7.60%):</span>
                          <strong className="font-mono">R$ {pisCofinsStats.cofinstotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                        </div>
                      </div>
                    </div>

                    {/* DÉBITOS */}
                    <div className="bg-rose-50/70 border border-rose-100 p-4 rounded-2xl text-rose-900">
                      <div className="flex items-center gap-1.5">
                        <ArrowDownLeft className="w-3.5 h-3.5 text-rose-600" />
                        <span className="text-[10px] uppercase font-bold text-rose-600 block">Débitos (Saídas)</span>
                      </div>
                      <span className="text-xl font-black block mt-1.5 font-mono text-rose-800">
                        R$ {(pisCofinsStats.pisDebitoTotal + pisCofinsStats.cofinsDebitoTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <div className="text-[10px] text-rose-700/80 mt-1 space-y-0.5">
                        <div className="flex justify-between">
                          <span>PIS (1.65%):</span>
                          <strong className="font-mono">R$ {pisCofinsStats.pisDebitoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>COFINS (7.60%):</span>
                          <strong className="font-mono">R$ {pisCofinsStats.cofinsDebitoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                        </div>
                      </div>
                    </div>

                    {/* APURAÇÃO PIS */}
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-slate-800">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Apuração Líquida PIS</span>
                      <span className={`text-xl font-black block mt-1.5 font-mono ${pisCofinsStats.saldoPis >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        R$ {pisCofinsStats.saldoPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wide block mt-1">
                        {pisCofinsStats.saldoPis >= 0 ? (
                          <span className="text-emerald-600 bg-emerald-100/60 px-1.5 py-0.5 rounded">Crédito a Compensar</span>
                        ) : (
                          <span className="text-rose-600 bg-rose-100/60 px-1.5 py-0.5 rounded">Imposto a Recolher</span>
                        )}
                      </span>
                    </div>

                    {/* APURAÇÃO COFINS */}
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-slate-800">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Apuração Líquida COFINS</span>
                      <span className={`text-xl font-black block mt-1.5 font-mono ${pisCofinsStats.saldoCofins >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        R$ {pisCofinsStats.saldoCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wide block mt-1">
                        {pisCofinsStats.saldoCofins >= 0 ? (
                          <span className="text-emerald-600 bg-emerald-100/60 px-1.5 py-0.5 rounded">Crédito a Compensar</span>
                        ) : (
                          <span className="text-rose-600 bg-rose-100/60 px-1.5 py-0.5 rounded">Imposto a Recolher</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Visualisation Selector Mode */}
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row items-center gap-3 bg-[#04243b]/5 p-3 rounded-2xl border border-[#04243b]/10">
                      <span className="text-xs font-bold text-[#04243b] uppercase tracking-wider">Modo de Exibição:</span>
                      <div className="flex flex-wrap bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                        <button
                          onClick={() => {
                            setPisCofinsViewMode('original');
                            setActivePisCofinsSubTab('todos');
                            setPisCofinsCurrentPage(1);
                          }}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                            pisCofinsViewMode === 'original'
                              ? 'bg-[#04243b] text-[#e4b35e]'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          1. Relatório Original Formatado
                        </button>
                        <button
                          onClick={() => {
                            setPisCofinsViewMode('consolidated');
                            setActivePisCofinsSubTab('consolidado');
                            setPisCofinsCurrentPage(1);
                          }}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                            pisCofinsViewMode === 'consolidated'
                              ? 'bg-[#04243b] text-[#e4b35e]'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Combine className="w-3.5 h-3.5" />
                          2. Relatório Consolidado (Soma por CFOP/CST)
                        </button>
                      </div>
                    </div>

                    {pisCofinsViewMode === 'consolidated' && (
                      <div className="flex flex-col sm:flex-row items-center gap-3 bg-amber-500/5 p-3 rounded-2xl border border-amber-500/10">
                        <span className="text-xs font-bold text-[#04243b] uppercase tracking-wider">Critério de Consolidação:</span>
                        <div className="flex flex-wrap bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                          <button
                            onClick={() => {
                              setPisCofinsCriteria('cfop_cst');
                              setPisCofinsCurrentPage(1);
                            }}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                              pisCofinsCriteria === 'cfop_cst'
                                ? 'bg-[#04243b] text-[#e4b35e]'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            <Table className="w-3.5 h-3.5" />
                            Agrupar apenas por CFOP + CST
                          </button>
                          <button
                            onClick={() => {
                              setPisCofinsCriteria('cfop_cst_product');
                              setPisCofinsCurrentPage(1);
                            }}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                              pisCofinsCriteria === 'cfop_cst_product'
                                ? 'bg-[#04243b] text-[#e4b35e]'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            <Package className="w-3.5 h-3.5" />
                            Agrupar por Produto + CFOP + CST
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Navigation controls */}
                  <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between border-b border-slate-100 pb-4">
                    {/* Sub tabs inside PIS/COFINS */}
                    <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-fit self-start" id="piscofins-main-tabs">
                      <button
                        onClick={() => {
                          setActivePisCofinsSubTab('todos');
                          setPisCofinsCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          activePisCofinsSubTab === 'todos'
                            ? 'bg-[#04243b] text-[#e4b35e] shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Todos ({
                          pisCofinsViewMode === 'consolidated' 
                            ? consolidatePisCofinsRows(pisCofinsRows, pisCofinsCriteria).length
                            : pisCofinsRows.length
                        })
                      </button>
                      <button
                        onClick={() => {
                          setActivePisCofinsSubTab('entradas');
                          setPisCofinsCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          activePisCofinsSubTab === 'entradas'
                            ? 'bg-[#04243b] text-[#e4b35e] shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Entradas / Crédito ({
                          pisCofinsViewMode === 'consolidated'
                            ? consolidatePisCofinsRows(pisCofinsRows, pisCofinsCriteria).filter(i => i.tipo === 'entrada').length
                            : pisCofinsRows.filter(i => i.tipo === 'entrada').length
                        })
                      </button>
                      <button
                        onClick={() => {
                          setActivePisCofinsSubTab('saidas');
                          setPisCofinsCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          activePisCofinsSubTab === 'saidas'
                            ? 'bg-[#04243b] text-[#e4b35e] shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Saídas / Débito ({
                          pisCofinsViewMode === 'consolidated'
                            ? consolidatePisCofinsRows(pisCofinsRows, pisCofinsCriteria).filter(i => i.tipo === 'saida').length
                            : pisCofinsRows.filter(i => i.tipo === 'saida').length
                        })
                      </button>
                      <button
                        onClick={() => {
                          setActivePisCofinsSubTab('auditoria');
                          setPisCofinsCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 relative ${
                          activePisCofinsSubTab === 'auditoria'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-rose-600 hover:bg-rose-50'
                        }`}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Inconsistências & Auditoria
                        {pisCofinsAuditErrors.length > 0 && (
                          <span className="bg-rose-500 text-white font-sans font-black text-[9px] rounded-full px-1.5 py-0.2 animate-pulse">
                            {pisCofinsAuditErrors.length}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Search bar */}
                    <div className="relative w-full lg:w-72 shrink-0">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchTermPisCofins}
                        onChange={(e) => {
                          setSearchTermPisCofins(e.target.value);
                          setPisCofinsCurrentPage(1);
                        }}
                        placeholder="Buscar por CFOP, CST, Produto..."
                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#04243b]"
                      />
                    </div>
                  </div>

                  {/* Table or Audit view */}
                  {activePisCofinsSubTab === 'auditoria' ? (
                    <div className="space-y-6">
                      {/* Summary statistics bar for audits */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl flex items-center gap-4">
                          <div className="p-3.5 bg-rose-100 text-rose-700 rounded-xl">
                            <ShieldAlert className="w-6 h-6" />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-black text-rose-500 block">Críticos / Inconsistências</span>
                            <span className="text-2xl font-black text-rose-800 font-mono block mt-0.5">
                              {pisCofinsAuditErrors.filter(e => e.severidade === 'critico').length}
                            </span>
                            <span className="text-[9px] text-rose-600 font-sans block">Erros que travam o envio do SPED</span>
                          </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl flex items-center gap-4">
                          <div className="p-3.5 bg-amber-100 text-amber-700 rounded-xl">
                            <AlertTriangle className="w-6 h-6" />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-black text-amber-500 block">Avisos / Alertas</span>
                            <span className="text-2xl font-black text-amber-800 font-mono block mt-0.5">
                              {pisCofinsAuditErrors.filter(e => e.severidade === 'aviso').length}
                            </span>
                            <span className="text-[9px] text-amber-600 font-sans block">Alíquotas e bases atípicas</span>
                          </div>
                        </div>

                        <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl flex items-center gap-4">
                          <div className="p-3.5 bg-emerald-100 text-emerald-700 rounded-xl">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-black text-emerald-500 block">Taxa de Integridade</span>
                            <span className="text-2xl font-black text-emerald-800 font-mono block mt-0.5">
                              {pisCofinsRows.length > 0 
                                ? `${Math.max(0, Math.round((1 - pisCofinsAuditErrors.length / pisCofinsRows.length) * 100))}%`
                                : '100%'
                              }
                            </span>
                            <span className="text-[9px] text-emerald-600 font-sans block">Dos registros sem inconsistências</span>
                          </div>
                        </div>
                      </div>

                      {/* Filter pills for PIS/COFINS errors */}
                      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-50 border border-slate-100 rounded-2xl">
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('todos')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'todos'
                              ? 'bg-[#04243b] text-[#e4b35e]'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          Todos ({pisCofinsAuditErrors.length})
                        </button>
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('divergencia_bc')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'divergencia_bc'
                              ? 'bg-rose-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          BC Divergente ({pisCofinsAuditErrors.filter(e => e.tipoErro === 'divergencia_bc').length})
                        </button>
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('erro_calculo_pis')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'erro_calculo_pis'
                              ? 'bg-rose-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          Erro Cálculo PIS ({pisCofinsAuditErrors.filter(e => e.tipoErro === 'erro_calculo_pis').length})
                        </button>
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('erro_calculo_cofins')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'erro_calculo_cofins'
                              ? 'bg-rose-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          Erro Cálculo COFINS ({pisCofinsAuditErrors.filter(e => e.tipoErro === 'erro_calculo_cofins').length})
                        </button>
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('cst_incompativel')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'cst_incompativel'
                              ? 'bg-rose-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          CST Incompatível ({pisCofinsAuditErrors.filter(e => e.tipoErro === 'cst_incompativel').length})
                        </button>
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('aliquota_incoerente')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'aliquota_incoerente'
                              ? 'bg-amber-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          Alíquota Incoerente ({pisCofinsAuditErrors.filter(e => e.tipoErro === 'aliquota_incoerente').length})
                        </button>
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('bc_maior_produto')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'bc_maior_produto'
                              ? 'bg-amber-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          BC &gt; Produto ({pisCofinsAuditErrors.filter(e => e.tipoErro === 'bc_maior_produto').length})
                        </button>
                      </div>

                      {/* Error listing */}
                      <div className="space-y-4">
                        {pisCofinsAuditErrors.filter(e => pisCofinsActiveAuditFilter === 'todos' || e.tipoErro === pisCofinsActiveAuditFilter).length === 0 ? (
                          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-8 text-center space-y-3">
                            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                            <h4 className="text-emerald-900 font-bold text-sm">Nenhum erro encontrado!</h4>
                            <p className="text-xs text-emerald-700 max-w-md mx-auto">
                              O filtro selecionado não apresenta inconsistências. Os dados de PIS/COFINS estão em conformidade com as regras de integridade do SPED Contribuições.
                            </p>
                          </div>
                        ) : (
                          pisCofinsAuditErrors
                            .filter(e => pisCofinsActiveAuditFilter === 'todos' || e.tipoErro === pisCofinsActiveAuditFilter)
                            .map((err) => (
                              <div
                                key={err.id}
                                className={`border rounded-2xl p-5 bg-white transition-all shadow-2xs hover:shadow-xs flex flex-col md:flex-row gap-4 items-start ${
                                  err.severidade === 'critico' ? 'border-l-4 border-l-rose-500 border-slate-200' : 'border-l-4 border-l-amber-500 border-slate-200'
                                }`}
                              >
                                <div className="flex-1 space-y-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`text-[9px] font-black tracking-wide uppercase px-2 py-0.5 rounded-full ${
                                      err.severidade === 'critico' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                                    }`}>
                                      {err.severidade === 'critico' ? 'Inconsistência Crítica' : 'Alerta Fiscal'}
                                    </span>
                                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                      {err.item.tipo === 'entrada' ? 'ENTRADA (CRÉDITO)' : 'SAÍDA (DÉBITO)'}
                                    </span>
                                    <span className="text-xs font-bold text-[#04243b]">
                                      Nota Fiscal: {err.item.numeroNota}
                                    </span>
                                    <span className="text-[11px] text-slate-500 font-mono">
                                      {err.item.data}
                                    </span>
                                  </div>

                                  <div className="space-y-1">
                                    <h4 className="text-slate-800 font-extrabold text-sm flex items-center gap-1.5">
                                      {err.severidade === 'critico' ? (
                                        <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                                      ) : (
                                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                      )}
                                      {err.titulo}
                                    </h4>
                                    <p className="text-xs text-slate-600 font-sans leading-relaxed">
                                      {err.descricao}
                                    </p>
                                  </div>

                                  {/* Original details box */}
                                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-[11px] font-mono grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600">
                                    <div>
                                      <span className="text-[9px] text-slate-400 font-sans block">Produto:</span>
                                      <span className="font-bold font-sans text-slate-700 truncate block" title={err.item.nomeProduto}>
                                        {err.item.nomeProduto}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-slate-400 font-sans block">CFOP / CST:</span>
                                      <span className="font-bold text-slate-700">
                                        {err.item.cfop} / CST {err.item.cst}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-slate-400 font-sans block">Base PIS/COFINS:</span>
                                      <span className="font-bold text-slate-700 block">
                                        R$ {err.item.baseCalculoPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {err.item.baseCalculoCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-slate-400 font-sans block">Imposto Declarado:</span>
                                      <span className="font-bold text-emerald-700 block">
                                        PIS: R$ {err.item.valorPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / COF: R$ {err.item.valorCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Detailed context/reasons and SPED impacts */}
                                  <div className="text-xs font-sans text-slate-500 bg-slate-50 border-l-2 border-slate-300 p-2.5 rounded-r-xl">
                                    <span className="font-bold block text-slate-700 mb-0.5">Diagnóstico Fiscal:</span>
                                    {err.detalhe}
                                    <span className="font-bold block text-slate-700 mt-2 mb-0.5">Como corrigir no ERP ou SPED:</span>
                                    <span className="text-slate-600 block leading-relaxed">
                                      {err.tipoErro === 'divergencia_bc' && 'Acesse a escrituração do documento fiscal no ERP, verifique o cadastro de tributação do item para corrigir as bases. Elas devem coincidir com o valor bruto da operação deduzido de possíveis exclusões legais.'}
                                      {err.tipoErro === 'erro_calculo_pis' && 'Corrija o arredondamento ou recalcule as alíquotas no sistema contábil. Uma diferença maior que R$ 0.05 causará o erro de soma inválida no validador do SPED Contribuições.'}
                                      {err.tipoErro === 'erro_calculo_cofins' && 'Corrija o arredondamento ou recalcule as alíquotas no sistema contábil. Uma diferença maior que R$ 0.05 causará o erro de soma inválida no validador do SPED Contribuições.'}
                                      {err.tipoErro === 'cst_incompativel' && 'Configure o CST do item com a faixa correspondente para evitar rejeições cadastrais imediatas durante a importação do arquivo no PVA.'}
                                      {err.tipoErro === 'aliquota_incoerente' && 'Verifique se o produto está cadastrado como Monofásico, Alíquota Zero ou Isento. Itens nestas condições devem ter alíquotas zeradas. Itens tributados normalmente devem possuir alíquotas cheias.'}
                                      {err.tipoErro === 'bc_maior_produto' && 'Verifique se não houve digitação errada de casas decimais na Base de Cálculo do produto ou se outros valores não-operacionais foram somados incorretamente à base.'}
                                    </span>
                                  </div>
                                </div>

                                <div className="shrink-0 w-full md:w-auto md:self-stretch flex flex-row md:flex-col justify-end gap-2 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4">
                                  <button
                                    onClick={() => {
                                      setPisCofinsViewMode('original');
                                      setActivePisCofinsSubTab('todos');
                                      setSearchTermPisCofins(err.item.numeroNota);
                                      setPisCofinsCurrentPage(1);
                                      const element = document.getElementById('piscofins-main-tabs');
                                      if (element) {
                                        element.scrollIntoView({ behavior: 'smooth' });
                                      }
                                    }}
                                    className="flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all cursor-pointer whitespace-nowrap"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    Ver no Relatório
                                  </button>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100">
                            {pisCofinsViewMode === 'consolidated' ? (
                              <tr>
                                {pisCofinsCriteria === 'cfop_cst_product' && (
                                  <>
                                    <th className="py-2.5 px-3">Cód Produto</th>
                                    <th className="py-2.5 px-3">Descrição Produto</th>
                                  </>
                                )}
                                <th className="py-2.5 px-3">CFOP</th>
                                <th className="py-2.5 px-3">CST PIS/COF</th>
                                <th className="py-2.5 px-3 text-right">Valor Produto Total</th>
                                <th className="py-2.5 px-3 text-right">Base de Cálculo PIS</th>
                                <th className="py-2.5 px-3 text-center">Alíquota PIS</th>
                                <th className="py-2.5 px-3 text-right">PIS Total</th>
                                <th className="py-2.5 px-3 text-right">Base de Cálculo COFINS</th>
                                <th className="py-2.5 px-3 text-center">Alíquota COFINS</th>
                                <th className="py-2.5 px-3 text-right">COFINS Total</th>
                              </tr>
                            ) : (
                              <tr>
                                <th className="py-2.5 px-3">Tipo</th>
                                <th className="py-2.5 px-3">Data</th>
                                <th className="py-2.5 px-3">Nº Nota</th>
                                <th className="py-2.5 px-3">CFOP</th>
                                <th className="py-2.5 px-3">CST</th>
                                <th className="py-2.5 px-3">Código</th>
                                <th className="py-2.5 px-3">Descrição Produto</th>
                                <th className="py-2.5 px-3 text-right">Valor Produto</th>
                                <th className="py-2.5 px-3 text-right">BC PIS</th>
                                <th className="py-2.5 px-3 text-center">Alíq. PIS</th>
                                <th className="py-2.5 px-3 text-right">Valor PIS</th>
                                <th className="py-2.5 px-3 text-right">BC COFINS</th>
                                <th className="py-2.5 px-3 text-center">Alíq. COFINS</th>
                                <th className="py-2.5 px-3 text-right">Valor COFINS</th>
                                <th className="py-2.5 px-3 text-right bg-indigo-50/50">Imposto Total</th>
                              </tr>
                            )}
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-[11px] font-mono">
                            {pisCofinsViewMode === 'consolidated' ? (
                              consolidatedPisCofinsRows.length === 0 ? (
                                <tr>
                                  <td colSpan={pisCofinsCriteria === 'cfop_cst_product' ? 11 : 9} className="text-center py-10 text-slate-400 font-sans">
                                    Nenhum item consolidado encontrado.
                                  </td>
                                </tr>
                              ) : (
                                paginatedConsolidatedPisCofinsRows.map((r, idx) => (
                                  <tr key={`piscof-row-c-${idx}`} className="hover:bg-slate-50/50">
                                    {pisCofinsCriteria === 'cfop_cst_product' && (
                                      <>
                                        <td className="py-2 px-3 text-slate-600">{r.codigoProduto || '-'}</td>
                                        <td className="py-2 px-3 text-slate-700 font-sans max-w-xs truncate" title={r.nomeProduto}>{r.nomeProduto || '-'}</td>
                                      </>
                                    )}
                                    <td className="py-2 px-3 font-bold text-[#04243b]">{r.cfop}</td>
                                    <td className="py-2 px-3">
                                      <span className="bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded font-sans">CST {r.cst}</span>
                                    </td>
                                    <td className="py-2 px-3 text-right text-slate-700">R$ {r.valorProduto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="py-2 px-3 text-right text-slate-700">R$ {(r.baseCalculoPis !== undefined ? r.baseCalculoPis : r.baseCalculo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="py-2 px-3 text-center text-slate-500 font-sans">{r.aliquotaPis.toFixed(2)}%</td>
                                    <td className="py-2 px-3 text-right text-emerald-700 font-bold">R$ {r.valorPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="py-2 px-3 text-right text-slate-700">R$ {(r.baseCalculoCofins !== undefined ? r.baseCalculoCofins : r.baseCalculo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="py-2 px-3 text-center text-slate-500 font-sans">{r.aliquotaCofins.toFixed(2)}%</td>
                                    <td className="py-2 px-3 text-right text-amber-700 font-bold">R$ {r.valorCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                  </tr>
                                ))
                              )
                            ) : (
                              filteredPisCofinsRows.length === 0 ? (
                                <tr>
                                  <td colSpan={15} className="text-center py-10 text-slate-400 font-sans">
                                    Nenhum item encontrado para os filtros selecionados.
                                  </td>
                                </tr>
                              ) : (
                                paginatedFilteredPisCofinsRows.map((r, idx) => (
                                  <tr key={`piscof-row-f-${idx}`} className={`hover:bg-slate-50/50 ${r.isCreditReduction ? 'bg-amber-50/30' : ''}`}>
                                    <td className="py-2 px-3">
                                      <span className={`font-sans text-[9px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded ${
                                        r.tipo === 'entrada'
                                          ? r.isCreditReduction
                                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}>
                                        {r.tipo === 'entrada'
                                          ? r.isCreditReduction
                                            ? 'ESTORNO CRÉD.'
                                            : 'CRÉDITO'
                                          : 'DÉBITO'}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 font-sans text-slate-500 whitespace-nowrap">{r.data}</td>
                                    <td className="py-2 px-3 text-slate-600 font-bold">{r.numeroNota}</td>
                                    <td className="py-2 px-3 font-bold text-[#04243b]">{r.cfop}</td>
                                    <td className="py-2 px-3">
                                      <span className="bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded font-sans">CST {r.cst}</span>
                                    </td>
                                    <td className="py-2 px-3 text-slate-600">{r.codigoProduto || '-'}</td>
                                    <td className="py-2 px-3 font-sans text-slate-700 max-w-xs truncate" title={r.nomeProduto}>{r.nomeProduto}</td>
                                    <td className={`py-2 px-3 text-right ${r.isCreditReduction ? 'text-amber-700 font-semibold' : 'text-slate-700'}`}>
                                      R$ {r.valorProduto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className={`py-2 px-3 text-right ${r.isCreditReduction ? 'text-amber-700 font-semibold' : 'text-slate-700'}`}>
                                      R$ {(r.baseCalculoPis !== undefined ? r.baseCalculoPis : r.baseCalculo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-2 px-3 text-center text-slate-500 font-sans">{r.aliquotaPis.toFixed(2)}%</td>
                                    <td className={`py-2 px-3 text-right ${r.isCreditReduction ? 'text-red-600 font-bold' : 'text-emerald-700'}`}>
                                      R$ {r.valorPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className={`py-2 px-3 text-right ${r.isCreditReduction ? 'text-amber-700 font-semibold' : 'text-slate-700'}`}>
                                      R$ {(r.baseCalculoCofins !== undefined ? r.baseCalculoCofins : r.baseCalculo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-2 px-3 text-center text-slate-500 font-sans">{r.aliquotaCofins.toFixed(2)}%</td>
                                    <td className={`py-2 px-3 text-right ${r.isCreditReduction ? 'text-red-600 font-bold' : 'text-amber-700'}`}>
                                      R$ {r.valorCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-2 px-3 text-right font-black text-indigo-700 bg-indigo-50/20">
                                      R$ {r.imposto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                ))
                              )
                            )}
                          </tbody>
                        </table>
                      </div>

                      {totalPisCofinsPages > 1 && (
                        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 bg-[#04243b]/5">
                          <span className="text-xs text-slate-500 font-sans">
                            Página <strong>{pisCofinsCurrentPage}</strong> de {totalPisCofinsPages} (Exibindo {pisCofinsCurrentPage * pisCofinsItemsPerPage - pisCofinsItemsPerPage + 1} - {Math.min(pisCofinsCurrentPage * pisCofinsItemsPerPage, pisCofinsViewMode === 'consolidated' ? consolidatedPisCofinsRows.length : filteredPisCofinsRows.length)} de {pisCofinsViewMode === 'consolidated' ? consolidatedPisCofinsRows.length : filteredPisCofinsRows.length} itens)
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setPisCofinsCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={pisCofinsCurrentPage === 1}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition-all cursor-pointer"
                            >
                              Anterior
                            </button>
                            <button
                              onClick={() => setPisCofinsCurrentPage(prev => Math.min(totalPisCofinsPages, prev + 1))}
                              disabled={pisCofinsCurrentPage === totalPisCofinsPages}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition-all cursor-pointer"
                            >
                              Próxima
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}

            </div>
          )}

        </div>
      </div>

      {/* 5. PROCESS MONITORING MODAL SPINNER */}
      {isProcessing && (
        <div className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fadeIn" id="workspace-processing-overlay">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 max-w-md w-full shadow-2xl text-center space-y-6">
            <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
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
