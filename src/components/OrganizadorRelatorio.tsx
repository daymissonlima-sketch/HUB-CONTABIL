/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx-js-style';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  Search, 
  RefreshCw, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  Coins, 
  Package, 
  Percent, 
  Info,
  Calendar,
  Building2,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ClipboardType
} from 'lucide-react';
import { SAMPLE_RAW_REPORT } from '../data/sampleReport';

// Product, Tax, and general interfaces
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

// Helper to group and sum duplicate products by CFOP and CST
function aggregateDuplicates(items: ReportItem[]): ReportItem[] {
  const grouped: Record<string, { item: ReportItem; nfs: Set<string>; dates: Set<string>; cnpjs: Set<string> }> = {};

  items.forEach(item => {
    // Grouping criteria: product code/name, CFOP and CST
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

    // Re-calculate average unit price mathematically (R$ Prod / Qtde)
    if (item.qtde > 0) {
      item.rUnit = item.rProduto / item.qtde;
    } else {
      item.rUnit = 0;
    }

    return item;
  });
}

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

export function OrganizadorRelatorio() {
  const [rawText, setRawText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'entradas' | 'saidas' | 'auditoria'>('entradas');
  
  // Parsed items states
  const [entradas, setEntradas] = useState<ReportItem[]>([]);
  const [saidas, setSaidas] = useState<ReportItem[]>([]);
  const [metadata, setMetadata] = useState<ReportMetadata | null>(null);
  const [isProcessed, setIsProcessed] = useState<boolean>(false);

  // Pagination & Filtering
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [cfopFilter, setCfopFilter] = useState<string>('all');
  const [cstFilter, setCstFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [groupDuplicates, setGroupDuplicates] = useState<boolean>(false);
  const itemsPerPage = 12;

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Text report parser
  const handleParseText = (text: string) => {
    if (!text.trim()) return;

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

      // Detect section transitions
      if (line.toLowerCase().includes('notas fiscais de entrada')) {
        currentSection = 'entrada';
        continue;
      } else if (line.toLowerCase().includes('notas fiscais de saída') || line.toLowerCase().includes('notas fiscais de saida')) {
        currentSection = 'saida';
        continue;
      }

      // Parse metadata
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
        // find generation date
        const datePart = parts.find(p => p.toLowerCase().includes('data:'));
        if (datePart) {
          dataGeracao = datePart.replace(/data:/i, '').trim();
        }
      }

      // Skip column headers, summary lines, or separator lines
      if (line.startsWith('Nota Fiscal;;') || line.includes('Total de Notas Fiscais') || line.startsWith(';;;;;')) {
        continue;
      }

      // Parse data rows
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

        // Split product code and name
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

    setEntradas(parsedEntradas);
    setSaidas(parsedSaidas);
    setMetadata({
      empresa: empresa || 'SL DISTRIBUIDORA DE PRODUTOS ALIMENTICIO',
      periodo: periodo || 'Período não identificado',
      dataGeracao: dataGeracao || new Date().toLocaleDateString('pt-BR'),
    });
    setIsProcessed(true);
    setCurrentPage(1);
    setActiveTab(parsedEntradas.length > 0 ? 'entradas' : 'saidas');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setRawText(text);
        handleParseText(text);
      };
      reader.readAsText(file, 'utf-8');
    }
  };

  const loadSample = () => {
    setFileName('relatorio_movimentacao_exemplo.txt');
    setRawText(SAMPLE_RAW_REPORT);
    handleParseText(SAMPLE_RAW_REPORT);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setRawText(text);
        handleParseText(text);
      };
      reader.readAsText(file, 'utf-8');
    }
  };

  const reset = () => {
    setRawText('');
    setFileName('');
    setEntradas([]);
    setSaidas([]);
    setMetadata(null);
    setIsProcessed(false);
    setSearchTerm('');
    setCfopFilter('all');
    setCstFilter('all');
    setGroupDuplicates(false);
  };

  // Filter and process row items based on tab selection
  const currentTabItems = useMemo(() => {
    const baseItems = activeTab === 'entradas' ? entradas : saidas;
    return groupDuplicates ? aggregateDuplicates(baseItems) : baseItems;
  }, [activeTab, entradas, saidas, groupDuplicates]);

  // Unique list of CFOPs and CSTs in the current dataset for drop-down filters
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

  // Search & Filtered results
  const filteredItems = useMemo(() => {
    const filtered = currentTabItems.filter(item => {
      const matchSearch = !searchTerm || 
        item.notaFiscal.includes(searchTerm) ||
        item.nomeProduto.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.codigoProduto.includes(searchTerm) ||
        item.ncm.includes(searchTerm) ||
        item.cnpj.includes(searchTerm);

      const matchCfop = cfopFilter === 'all' || item.cfop === cfopFilter;
      const matchCst = cstFilter === 'all' || item.cst === cstFilter;

      return matchSearch && matchCfop && matchCst;
    });
    return [...filtered].sort((a, b) => a.nomeProduto.localeCompare(b.nomeProduto, 'pt-BR'));
  }, [currentTabItems, searchTerm, cfopFilter, cstFilter]);

  // Pagination math
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage]);

  // Consolidated general metrics
  const stats = useMemo(() => {
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
      entradas: calc(entradas),
      saidas: calc(saidas)
    };
  }, [entradas, saidas]);

  // Auditoria and fiscal reports compilation
  const auditReport = useMemo(() => {
    const compile = (items: ReportItem[]) => {
      // Group by CFOP
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
      // Group by Product
      const productSummary: Record<string, { code: string; name: string; un: string; qty: number; value: number }> = {};
      // Group by NCM
      const ncmSummary: Record<string, { ncm: string; value: number }> = {};

      items.forEach(item => {
        // CFOP Grouping
        if (!cfopSummary[item.cfop]) {
          cfopSummary[item.cfop] = { 
            cfop: item.cfop, 
            count: 0, 
            total: 0, 
            rBaseIcms: 0,
            pIcms: item.pIcms || 0,
            rIcms: 0, 
            isentas: 0,
            outras: 0,
            rIpi: 0
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

        const cstStr = item.cst || '';
        const isIsenta = cstStr.startsWith('3') || cstStr.startsWith('4') || ['30', '40', '41', '50'].includes(cstStr);
        const difference = item.vlrContabil - item.rBaseIcms - item.rIpi;
        const diffVal = Math.max(0, difference);

        if (isIsenta) {
          cfopSummary[item.cfop].isentas += diffVal;
        } else {
          cfopSummary[item.cfop].outras += diffVal;
        }

        // Product Grouping
        const pKey = `${item.codigoProduto}_${item.nomeProduto}`;
        if (!productSummary[pKey]) {
          productSummary[pKey] = { code: item.codigoProduto, name: item.nomeProduto, un: item.un, qty: 0, value: 0 };
        }
        productSummary[pKey].qty += item.qtde;
        productSummary[pKey].value += item.vlrContabil;

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
      entradas: compile(entradas),
      saidas: compile(saidas)
    };
  }, [entradas, saidas]);

  // Calculation of PF/PJ percentages on Saídas
  const pfPjMetrics = useMemo(() => {
    let pfValue = 0;
    let pfCount = 0;
    let pjValue = 0;
    let pjCount = 0;
    let otherValue = 0;
    let otherCount = 0;

    saidas.forEach(item => {
      const cleanDoc = (item.cnpj || '').replace(/\D/g, '');
      if (cleanDoc.length === 11) {
        pfValue += item.vlrContabil;
        pfCount += 1;
      } else if (cleanDoc.length === 14) {
        pjValue += item.vlrContabil;
        pjCount += 1;
      } else {
        otherValue += item.vlrContabil;
        otherCount += 1;
      }
    });

    const totalValue = pfValue + pjValue + otherValue;
    const totalCount = pfCount + pjCount + otherCount;

    return {
      pfValue,
      pfCount,
      pjValue,
      pjCount,
      otherValue,
      otherCount,
      totalValue,
      totalCount,
      pfPctValue: totalValue > 0 ? (pfValue / totalValue) * 100 : 0,
      pjPctValue: totalValue > 0 ? (pjValue / totalValue) * 100 : 0,
      otherPctValue: totalValue > 0 ? (otherValue / totalValue) * 100 : 0,
      pfPctCount: totalCount > 0 ? (pfCount / totalCount) * 100 : 0,
      pjPctCount: totalCount > 0 ? (pjCount / totalCount) * 100 : 0,
      otherPctCount: totalCount > 0 ? (otherCount / totalCount) * 100 : 0,
    };
  }, [saidas]);

  // Master beautiful Excel generation
  const handleExportExcel = () => {
    if (!metadata) return;

    const wb = XLSX.utils.book_new();

    // Styled write cells helpers
    const writeCell = (ws: any, r: number, c: number, val: any, type: 's' | 'n', style: any = {}, format = '') => {
      const colLetter = String.fromCharCode(65 + c);
      const ref = `${colLetter}${r + 1}`;
      ws[ref] = { v: val, t: type, s: style };
      if (format) ws[ref].z = format;
    };

    // Styling configurations (Moreira & Lima corporate identity)
    const primaryBgHex = "04243B"; // Deep navy
    const accentBgHex = "E4B35E";  // Gold
    const softBgHex = "F8FAFC";    // Off-white/slate
    
    const styleBannerTitle = {
      fill: { fgColor: { rgb: primaryBgHex } },
      font: { name: "Calibri", sz: 16, bold: true, color: { rgb: accentBgHex } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const styleBannerSub = {
      fill: { fgColor: { rgb: primaryBgHex } },
      font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const styleHeaderLabel = {
      fill: { fgColor: { rgb: "0A3654" } },
      font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: { bottom: { style: "medium", color: { rgb: accentBgHex } } }
    };

    const styleSummaryLabel = {
      fill: { fgColor: { rgb: "E2E8F0" } },
      font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "1E293B" } },
      alignment: { horizontal: "left", vertical: "center" }
    };

    const styleSummaryValue = {
      fill: { fgColor: { rgb: "E2E8F0" } },
      font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "1E293B" } },
      alignment: { horizontal: "right", vertical: "center" }
    };

    const styleTableHead = {
      fill: { fgColor: { rgb: primaryBgHex } },
      font: { name: "Calibri", sz: 10.5, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: { bottom: { style: "medium", color: { rgb: accentBgHex } } }
    };

    const getRowStyle = (isEven: boolean, align: 'left' | 'center' | 'right', bold = false) => ({
      fill: { fgColor: { rgb: isEven ? "FFFFFF" : "F1F5F9" } },
      font: { name: "Calibri", sz: 10, bold, color: { rgb: "1E293B" } },
      alignment: { horizontal: align, vertical: "center" },
      border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } }
    });

    const styleTotalRow = {
      fill: { fgColor: { rgb: "0F172A" } },
      font: { name: "Calibri", sz: 10.5, bold: true, color: { rgb: accentBgHex } },
      alignment: { horizontal: "right", vertical: "center" }
    };

    const styleTotalRowCenter = {
      fill: { fgColor: { rgb: "0F172A" } },
      font: { name: "Calibri", sz: 10.5, bold: true, color: { rgb: accentBgHex } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const styleTotalLabel = {
      fill: { fgColor: { rgb: "0F172A" } },
      font: { name: "Calibri", sz: 10.5, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "left", vertical: "center" }
    };

    // SHEET 1: DASHBOARD DE RESUMO FISCAL
    const buildSummarySheet = () => {
      const ws: any = {};
      let r = 0;
      const merges: any[] = [];
      const rowHeights: any[] = [];

      const styleSecTitle = {
        fill: { fgColor: { rgb: "0A3654" } },
        font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" }
      };

      const styleMovHeader = {
        fill: { fgColor: { rgb: "F1F5F9" } },
        font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "0F172A" } },
        alignment: { horizontal: "left", vertical: "center" },
        border: { 
          top: { style: "thin", color: { rgb: "CBD5E1" } },
          bottom: { style: "thin", color: { rgb: "CBD5E1" } }
        }
      };

      const styleColHeaderDouble = {
        fill: { fgColor: { rgb: "04243B" } },
        font: { name: "Calibri", sz: 9.5, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: { 
          top: { style: "thin", color: { rgb: "FFFFFF" } },
          bottom: { style: "thin", color: { rgb: "FFFFFF" } },
          left: { style: "thin", color: { rgb: "FFFFFF" } },
          right: { style: "thin", color: { rgb: "FFFFFF" } }
        }
      };

      const styleTotalRowGroup = {
        fill: { fgColor: { rgb: "E2E8F0" } },
        font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "0F172A" } },
        alignment: { horizontal: "right", vertical: "center" },
        border: { 
          top: { style: "thin", color: { rgb: "94A3B8" } },
          bottom: { style: "double", color: { rgb: "0F172A" } }
        }
      };

      const styleTotalRowGroupLeft = {
        ...styleTotalRowGroup,
        alignment: { horizontal: "left", vertical: "center" }
      };

      const styleTotalGeralRow = {
        fill: { fgColor: { rgb: "0F172A" } },
        font: { name: "Calibri", sz: 10.5, bold: true, color: { rgb: "E4B35E" } },
        alignment: { horizontal: "right", vertical: "center" },
        border: { 
          top: { style: "medium", color: { rgb: "E4B35E" } },
          bottom: { style: "double", color: { rgb: "E4B35E" } }
        }
      };

      const styleTotalGeralRowLeft = {
        ...styleTotalGeralRow,
        alignment: { horizontal: "left", vertical: "center" }
      };

      // Banner Row 1
      writeCell(ws, r, 0, metadata.empresa.toUpperCase(), 's', styleBannerTitle);
      merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
      rowHeights.push({ hpt: 30 });
      r++;

      // Banner Row 2
      writeCell(ws, r, 0, `AUDITORIA E SANEAMENTO FISCAL DE MOVIMENTAÇÕES DE ESTOQUE`, 's', styleBannerSub);
      merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
      rowHeights.push({ hpt: 20 });
      r++;

      // Banner Row 3 (Period)
      const subInfo = `${metadata.periodo}   |   Geração: ${metadata.dataGeracao}`;
      writeCell(ws, r, 0, subInfo, 's', styleBannerSub);
      merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
      rowHeights.push({ hpt: 20 });
      r++;

      // Gap
      rowHeights.push({ hpt: 12 });
      r++;

      // KPI KPI METRIC BLOCKS
      writeCell(ws, r, 0, 'RESUMO CONSOLIDADO FINANCEIRO', 's', styleHeaderLabel);
      merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
      rowHeights.push({ hpt: 22 });
      r++;

      const metricRows = [
        { label: 'Valor Total das Entradas (Vlr. Contábil)', val: stats.entradas.vContabil, format: '"R$ " #,##0.00' },
        { label: 'Valor Total das Saídas (Vlr. Contábil)', val: stats.saidas.vContabil, format: '"R$ " #,##0.00' },
        { label: 'Total Geral Movimentado', val: stats.entradas.vContabil + stats.saidas.vContabil, format: '"R$ " #,##0.00' },
        { label: 'Total de Impostos Retidos (ICMS + IPI)', val: stats.entradas.totalTaxes + stats.saidas.totalTaxes, format: '"R$ " #,##0.00' },
        { label: 'Quantidade Total de Itens Movimentados', val: stats.entradas.qtde + stats.saidas.qtde, format: '#,##0' },
        { label: 'Diversidade de Produtos Ativos', val: entradas.length + saidas.length ? stats.entradas.uniqProdCount + stats.saidas.uniqProdCount : 0, format: '#,##0' }
      ];

      metricRows.forEach((m) => {
        writeCell(ws, r, 0, m.label, 's', styleSummaryLabel);
        writeCell(ws, r, 8, m.val, 'n', styleSummaryValue, m.format);
        merges.push({ s: { r, c: 0 }, e: { r, c: 7 } });
        rowHeights.push({ hpt: 20 });
        r++;
      });

      // Gap
      rowHeights.push({ hpt: 15 });
      r++;

      // Subgroup CFOP lists
      const entInternas = auditReport.entradas.cfopList.filter(c => c.cfop.replace('-', '').startsWith('1'));
      const entInterestaduais = auditReport.entradas.cfopList.filter(c => c.cfop.replace('-', '').startsWith('2') || c.cfop.replace('-', '').startsWith('3'));
      const saiInternas = auditReport.saidas.cfopList.filter(c => c.cfop.replace('-', '').startsWith('5'));
      const saiInterestaduais = auditReport.saidas.cfopList.filter(c => c.cfop.replace('-', '').startsWith('6') || c.cfop.replace('-', '').startsWith('7'));

      // ==================== ENTRADAS TABLE ====================
      writeCell(ws, r, 0, 'RESUMO DAS OPERAÇÕES POR CFOP E ALÍQUOTA - ENTRADAS', 's', styleSecTitle);
      merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
      rowHeights.push({ hpt: 24 });
      r++;

      // Double Column headers for ENTRADAS
      // Row 1
      writeCell(ws, r, 0, 'CFOP', 's', styleColHeaderDouble);
      writeCell(ws, r, 1, 'Valor Contábil', 's', styleColHeaderDouble);
      writeCell(ws, r, 2, 'ICMS', 's', styleColHeaderDouble);
      writeCell(ws, r, 7, 'IPI', 's', styleColHeaderDouble);
      
      merges.push({ s: { r, c: 0 }, e: { r: r + 1, c: 0 } });
      merges.push({ s: { r, c: 1 }, e: { r: r + 1, c: 1 } });
      merges.push({ s: { r, c: 2 }, e: { r, c: 6 } });
      merges.push({ s: { r, c: 7 }, e: { r, c: 8 } });
      rowHeights.push({ hpt: 20 });
      r++;

      // Row 2
      writeCell(ws, r, 2, 'Alíquota', 's', styleColHeaderDouble);
      writeCell(ws, r, 3, 'Base de Cálculo', 's', styleColHeaderDouble);
      writeCell(ws, r, 4, 'Valor Imposto', 's', styleColHeaderDouble);
      writeCell(ws, r, 5, 'Isentas/N. Tribut.', 's', styleColHeaderDouble);
      writeCell(ws, r, 6, 'Outras', 's', styleColHeaderDouble);
      writeCell(ws, r, 7, 'Não Creditado', 's', styleColHeaderDouble);
      writeCell(ws, r, 8, 'Creditado', 's', styleColHeaderDouble);
      rowHeights.push({ hpt: 20 });
      r++;

      // Helper to render a CFOP list subgroup
      const renderCfopSubgroup = (cfopList: any[], title: string, totalLabel: string) => {
        // Section sub-header row
        writeCell(ws, r, 0, title, 's', styleMovHeader);
        merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
        rowHeights.push({ hpt: 20 });
        r++;

        let subTotalVlrContabil = 0;
        let subTotalBaseIcms = 0;
        let subTotalIcms = 0;
        let subTotalIsentas = 0;
        let subTotalOutras = 0;
        let subTotalIpi = 0;

        cfopList.forEach((c, idx) => {
          const isEven = idx % 2 === 0;
          writeCell(ws, r, 0, c.cfop, 's', getRowStyle(isEven, 'center', true));
          writeCell(ws, r, 1, c.total, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');
          writeCell(ws, r, 2, c.pIcms / 100, 'n', getRowStyle(isEven, 'center'), '0.00%');
          writeCell(ws, r, 3, c.rBaseIcms, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');
          writeCell(ws, r, 4, c.rIcms, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');
          writeCell(ws, r, 5, c.isentas, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');
          writeCell(ws, r, 6, c.outras, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');
          writeCell(ws, r, 7, 0, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');
          writeCell(ws, r, 8, c.rIpi, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');

          subTotalVlrContabil += c.total;
          subTotalBaseIcms += c.rBaseIcms;
          subTotalIcms += c.rIcms;
          subTotalIsentas += c.isentas;
          subTotalOutras += c.outras;
          subTotalIpi += c.rIpi;

          rowHeights.push({ hpt: 19 });
          r++;
        });

        // Subgroup Total Row
        writeCell(ws, r, 0, totalLabel, 's', styleTotalRowGroupLeft);
        writeCell(ws, r, 1, subTotalVlrContabil, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        writeCell(ws, r, 2, '', 's', styleTotalRowGroup);
        writeCell(ws, r, 3, subTotalBaseIcms, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        writeCell(ws, r, 4, subTotalIcms, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        writeCell(ws, r, 5, subTotalIsentas, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        writeCell(ws, r, 6, subTotalOutras, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        writeCell(ws, r, 7, 0, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        writeCell(ws, r, 8, subTotalIpi, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        rowHeights.push({ hpt: 21 });
        r++;

        return {
          totalVlrContabil: subTotalVlrContabil,
          totalBaseIcms: subTotalBaseIcms,
          totalIcms: subTotalIcms,
          totalIsentas: subTotalIsentas,
          totalOutras: subTotalOutras,
          totalIpi: subTotalIpi
        };
      };

      // 1. Entradas Internas
      const t1000 = renderCfopSubgroup(entInternas, 'Movimento: Entradas Internas', 'Total 1.000:');

      // 2. Entradas Interestaduais
      const t2000 = renderCfopSubgroup(entInterestaduais, 'Movimento: Entradas Interestaduais', 'Total 2.000:');

      // Entradas Total Geral Row
      const grandTotalEntradas = {
        vlrContabil: t1000.totalVlrContabil + t2000.totalVlrContabil,
        baseIcms: t1000.totalBaseIcms + t2000.totalBaseIcms,
        icms: t1000.totalIcms + t2000.totalIcms,
        isentas: t1000.totalIsentas + t2000.totalIsentas,
        outras: t1000.totalOutras + t2000.totalOutras,
        ipi: t1000.totalIpi + t2000.totalIpi
      };

      writeCell(ws, r, 0, 'Total Geral:', 's', styleTotalGeralRowLeft);
      writeCell(ws, r, 1, grandTotalEntradas.vlrContabil, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      writeCell(ws, r, 2, '', 's', styleTotalGeralRow);
      writeCell(ws, r, 3, grandTotalEntradas.baseIcms, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      writeCell(ws, r, 4, grandTotalEntradas.icms, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      writeCell(ws, r, 5, grandTotalEntradas.isentas, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      writeCell(ws, r, 6, grandTotalEntradas.outras, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      writeCell(ws, r, 7, 0, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      writeCell(ws, r, 8, grandTotalEntradas.ipi, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      rowHeights.push({ hpt: 22 });
      r++;

      // Gap between tables
      rowHeights.push({ hpt: 20 });
      r++;

      // ==================== SAÍDAS TABLE ====================
      writeCell(ws, r, 0, 'RESUMO DAS OPERAÇÕES POR CFOP E ALÍQUOTA - SAÍDAS', 's', styleSecTitle);
      merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
      rowHeights.push({ hpt: 24 });
      r++;

      // Double Column headers for SAÍDAS
      // Row 1
      writeCell(ws, r, 0, 'CFOP', 's', styleColHeaderDouble);
      writeCell(ws, r, 1, 'Valor Contábil', 's', styleColHeaderDouble);
      writeCell(ws, r, 2, 'ICMS', 's', styleColHeaderDouble);
      writeCell(ws, r, 7, 'IPI Debitado', 's', styleColHeaderDouble);
      
      merges.push({ s: { r, c: 0 }, e: { r: r + 1, c: 0 } });
      merges.push({ s: { r, c: 1 }, e: { r: r + 1, c: 1 } });
      merges.push({ s: { r, c: 2 }, e: { r, c: 6 } });
      merges.push({ s: { r, c: 7 }, e: { r, c: 8 } });
      rowHeights.push({ hpt: 20 });
      r++;

      // Row 2
      writeCell(ws, r, 2, 'Alíquota', 's', styleColHeaderDouble);
      writeCell(ws, r, 3, 'Base de Cálculo', 's', styleColHeaderDouble);
      writeCell(ws, r, 4, 'Valor Imposto', 's', styleColHeaderDouble);
      writeCell(ws, r, 5, 'Isentas/N. Tribut.', 's', styleColHeaderDouble);
      writeCell(ws, r, 6, 'Outras', 's', styleColHeaderDouble);
      writeCell(ws, r, 7, 'Não Debitado', 's', styleColHeaderDouble);
      writeCell(ws, r, 8, 'Debitado', 's', styleColHeaderDouble);
      rowHeights.push({ hpt: 20 });
      r++;

      const renderCfopSubgroupSaidas = (cfopList: any[], title: string, totalLabel: string) => {
        // Section sub-header row
        writeCell(ws, r, 0, title, 's', styleMovHeader);
        merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
        rowHeights.push({ hpt: 20 });
        r++;

        let subTotalVlrContabil = 0;
        let subTotalBaseIcms = 0;
        let subTotalIcms = 0;
        let subTotalIsentas = 0;
        let subTotalOutras = 0;
        let subTotalIpi = 0;

        cfopList.forEach((c, idx) => {
          const isEven = idx % 2 === 0;
          writeCell(ws, r, 0, c.cfop, 's', getRowStyle(isEven, 'center', true));
          writeCell(ws, r, 1, c.total, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');
          writeCell(ws, r, 2, c.pIcms / 100, 'n', getRowStyle(isEven, 'center'), '0.00%');
          writeCell(ws, r, 3, c.rBaseIcms, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');
          writeCell(ws, r, 4, c.rIcms, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');
          writeCell(ws, r, 5, c.isentas, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');
          writeCell(ws, r, 6, c.outras, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');
          writeCell(ws, r, 7, 0, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');
          writeCell(ws, r, 8, c.rIpi, 'n', getRowStyle(isEven, 'right'), '"R$ " #,##0.00');

          subTotalVlrContabil += c.total;
          subTotalBaseIcms += c.rBaseIcms;
          subTotalIcms += c.rIcms;
          subTotalIsentas += c.isentas;
          subTotalOutras += c.outras;
          subTotalIpi += c.rIpi;

          rowHeights.push({ hpt: 19 });
          r++;
        });

        // Subgroup Total Row
        writeCell(ws, r, 0, totalLabel, 's', styleTotalRowGroupLeft);
        writeCell(ws, r, 1, subTotalVlrContabil, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        writeCell(ws, r, 2, '', 's', styleTotalRowGroup);
        writeCell(ws, r, 3, subTotalBaseIcms, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        writeCell(ws, r, 4, subTotalIcms, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        writeCell(ws, r, 5, subTotalIsentas, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        writeCell(ws, r, 6, subTotalOutras, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        writeCell(ws, r, 7, 0, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        writeCell(ws, r, 8, subTotalIpi, 'n', styleTotalRowGroup, '"R$ " #,##0.00');
        rowHeights.push({ hpt: 21 });
        r++;

        return {
          totalVlrContabil: subTotalVlrContabil,
          totalBaseIcms: subTotalBaseIcms,
          totalIcms: subTotalIcms,
          totalIsentas: subTotalIsentas,
          totalOutras: subTotalOutras,
          totalIpi: subTotalIpi
        };
      };

      // 1. Saídas Internas
      const t5000 = renderCfopSubgroupSaidas(saiInternas, 'Movimento: Saídas Internas', 'Total 5.000:');

      // 2. Saídas Interestaduais
      const t6000 = renderCfopSubgroupSaidas(saiInterestaduais, 'Movimento: Saídas Interestaduais', 'Total 6.000:');

      // Saídas Total Geral Row
      const grandTotalSaidas = {
        vlrContabil: t5000.totalVlrContabil + t6000.totalVlrContabil,
        baseIcms: t5000.totalBaseIcms + t6000.totalBaseIcms,
        icms: t5000.totalIcms + t6000.totalIcms,
        isentas: t5000.totalIsentas + t6000.totalIsentas,
        outras: t5000.totalOutras + t6000.totalOutras,
        ipi: t5000.totalIpi + t6000.totalIpi
      };

      writeCell(ws, r, 0, 'Total Geral:', 's', styleTotalGeralRowLeft);
      writeCell(ws, r, 1, grandTotalSaidas.vlrContabil, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      writeCell(ws, r, 2, '', 's', styleTotalGeralRow);
      writeCell(ws, r, 3, grandTotalSaidas.baseIcms, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      writeCell(ws, r, 4, grandTotalSaidas.icms, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      writeCell(ws, r, 5, grandTotalSaidas.isentas, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      writeCell(ws, r, 6, grandTotalSaidas.outras, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      writeCell(ws, r, 7, 0, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      writeCell(ws, r, 8, grandTotalSaidas.ipi, 'n', styleTotalGeralRow, '"R$ " #,##0.00');
      rowHeights.push({ hpt: 22 });
      r++;

      ws['!merges'] = merges;
      ws['!rows'] = rowHeights;
      ws['!cols'] = [
        { wch: 10 }, // CFOP
        { wch: 18 }, // Valor Contábil
        { wch: 10 }, // Alíquota
        { wch: 16 }, // Base de Cálculo
        { wch: 16 }, // Valor Imposto
        { wch: 18 }, // Isentas/N. Tribut.
        { wch: 16 }, // Outras
        { wch: 15 }, // Não Creditado
        { wch: 15 }, // Creditado/Debitado
      ];
      ws['!ref'] = `A1:I${r}`;
      ws['!views'] = [{ showGridLines: true }];
      return ws;
    };

    // SHEET 2 & 3: DETAILS EXPORT (ENTRADAS & SAÍDAS)
    const buildDetailsSheet = (items: ReportItem[], label: string) => {
      const ws: any = {};
      let r = 0;
      const merges: any[] = [];
      const rowHeights: any[] = [];

      const colSpecs: {
        key: string;
        header: string;
        type: string;
        align: 'left' | 'center' | 'right';
        width: number;
        format?: string;
        isSum?: boolean;
        bold?: boolean;
      }[] = groupDuplicates
        ? [
            { key: 'cfop', header: 'Código CFOP', type: 's', align: 'center', width: 13 },
            { key: 'codigoProduto', header: 'Cód. Prod.', type: 's', align: 'center', width: 13 },
            { key: 'nomeProduto', header: 'Nome Comercial do Produto', type: 's', align: 'left', width: 38 },
            { key: 'ncm', header: 'Cód. NCM', type: 's', align: 'center', width: 14 },
            { key: 'un', header: 'UN', type: 's', align: 'center', width: 8 },
            { key: 'qtde', header: 'Qtde', type: 'n', align: 'center', width: 14, format: '#,##0.000', isSum: true },
            { key: 'rUnit', header: 'R$ Unitário', type: 'n', align: 'right', width: 14, format: '"R$ " #,##0.00' },
            { key: 'rProduto', header: 'R$ Líq. Produto', type: 'n', align: 'center', width: 16, format: '"R$ " #,##0.00', isSum: true },
            { key: 'desconto', header: 'R$ Desconto', type: 'n', align: 'right', width: 14, format: '"R$ " #,##0.00', isSum: true },
            { key: 'vlrContabil', header: 'R$ Vlr. Contábil', type: 'n', align: 'right', width: 18, format: '"R$ " #,##0.00', isSum: true, bold: true },
            { key: 'cst', header: 'CST', type: 's', align: 'center', width: 8 },
            { key: 'rBaseIcms', header: 'R$ Base ICMS', type: 'n', align: 'center', width: 14, format: '"R$ " #,##0.00' },
            { key: 'pIcms', header: '% ICMS', type: 'n', align: 'center', width: 10, format: '0.00"%"' },
            { key: 'rIcms', header: 'R$ ICMS', type: 'n', align: 'right', width: 14, format: '"R$ " #,##0.00', isSum: true },
            { key: 'rIpi', header: 'R$ IPI', type: 'n', align: 'center', width: 14, format: '"R$ " #,##0.00', isSum: true }
          ]
        : [
            { key: 'notaFiscal', header: 'Nota Fiscal', type: 's', align: 'center', width: 14, bold: true },
            { key: 'data', header: 'Data', type: 's', align: 'center', width: 12 },
            { key: 'cnpj', header: 'CNPJ do Contribuinte', type: 's', align: 'center', width: 22 },
            { key: 'tipo', header: 'Tipo (PF/PJ)', type: 's', align: 'center', width: 13 },
            { key: 'cfop', header: 'Código CFOP', type: 's', align: 'center', width: 13 },
            { key: 'codigoProduto', header: 'Cód. Prod.', type: 's', align: 'center', width: 13 },
            { key: 'nomeProduto', header: 'Nome Comercial do Produto', type: 's', align: 'left', width: 38 },
            { key: 'ncm', header: 'Cód. NCM', type: 's', align: 'center', width: 14 },
            { key: 'un', header: 'UN', type: 's', align: 'center', width: 8 },
            { key: 'qtde', header: 'Qtde', type: 'n', align: 'center', width: 14, format: '#,##0.000', isSum: true },
            { key: 'rUnit', header: 'R$ Unitário', type: 'n', align: 'right', width: 14, format: '"R$ " #,##0.00' },
            { key: 'rProduto', header: 'R$ Líq. Produto', type: 'n', align: 'center', width: 16, format: '"R$ " #,##0.00', isSum: true },
            { key: 'desconto', header: 'R$ Desconto', type: 'n', align: 'right', width: 14, format: '"R$ " #,##0.00', isSum: true },
            { key: 'vlrContabil', header: 'R$ Vlr. Contábil', type: 'n', align: 'right', width: 18, format: '"R$ " #,##0.00', isSum: true, bold: true },
            { key: 'cst', header: 'CST', type: 's', align: 'center', width: 8 },
            { key: 'rBaseIcms', header: 'R$ Base ICMS', type: 'n', align: 'center', width: 14, format: '"R$ " #,##0.00' },
            { key: 'pIcms', header: '% ICMS', type: 'n', align: 'center', width: 10, format: '0.00"%"' },
            { key: 'rIcms', header: 'R$ ICMS', type: 'n', align: 'right', width: 14, format: '"R$ " #,##0.00', isSum: true },
            { key: 'rIpi', header: 'R$ IPI', type: 'n', align: 'center', width: 14, format: '"R$ " #,##0.00', isSum: true }
          ];

      const totalCols = colSpecs.length;

      // Title header banner
      writeCell(ws, r, 0, `${metadata.empresa.toUpperCase()}   -   ABA DE ${label.toUpperCase()}`, 's', styleBannerTitle);
      merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });
      rowHeights.push({ hpt: 28 });
      r++;

      writeCell(ws, r, 0, `Relatório Sanitizado e Organizado de Itens de Notas Fiscais de ${label}`, 's', styleBannerSub);
      merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });
      rowHeights.push({ hpt: 18 });
      r++;

      // Gap
      rowHeights.push({ hpt: 10 });
      r++;

      // Table Header row
      colSpecs.forEach((spec, colIdx) => {
        writeCell(ws, r, colIdx, spec.header, 's', styleTableHead);
      });
      rowHeights.push({ hpt: 26 });
      r++;

      // Items parsing loop (Sorted alphabetically by product name)
      const sortedItems = [...items].sort((a, b) => a.nomeProduto.localeCompare(b.nomeProduto, 'pt-BR'));

      sortedItems.forEach((item, idx) => {
        const isEven = idx % 2 === 0;

        colSpecs.forEach((spec, colIdx) => {
          let val;
          if (spec.key === 'tipo') {
            val = getDocumentType(item.cnpj);
          } else {
            val = item[spec.key as keyof ReportItem];
          }
          writeCell(
            ws,
            r,
            colIdx,
            val,
            spec.type as any,
            getRowStyle(isEven, spec.align, spec.bold),
            spec.format
          );
        });

        rowHeights.push({ hpt: 19 });
        r++;
      });

      // Total summation row
      for (let colIdx = 0; colIdx < totalCols; colIdx++) {
        writeCell(ws, r, colIdx, '', 's', styleTotalRow);
      }
      
      const qtyColIdx = colSpecs.findIndex(spec => spec.key === 'qtde');
      writeCell(ws, r, 0, 'TOTAIS GERAIS ACUMULADOS', 's', styleTotalLabel);
      merges.push({ s: { r, c: 0 }, e: { r, c: qtyColIdx - 1 } });

      colSpecs.forEach((spec, colIdx) => {
        if (spec.isSum) {
          const sumVal = sortedItems.reduce((acc, item) => acc + (Number(item[spec.key as keyof ReportItem]) || 0), 0);
          const isCenter = spec.key === 'qtde' || spec.key === 'rProduto' || spec.key === 'rIpi';
          writeCell(
            ws,
            r,
            colIdx,
            sumVal,
            'n',
            isCenter ? styleTotalRowCenter : styleTotalRow,
            spec.format
          );
        }
      });

      rowHeights.push({ hpt: 24 });
      r++;

      ws['!merges'] = merges;
      ws['!rows'] = rowHeights;
      ws['!cols'] = colSpecs.map(spec => ({ wch: spec.width }));
      
      const lastColLetter = XLSX.utils.encode_col(totalCols - 1);
      ws['!ref'] = `A1:${lastColLetter}${r}`;
      ws['!views'] = [{ showGridLines: true }];
      return ws;
    };

    // Construct book structure
    XLSX.utils.book_append_sheet(wb, buildSummarySheet(), 'Resumo Executivo');
    const finalEntradas = groupDuplicates ? aggregateDuplicates(entradas) : entradas;
    const finalSaidas = groupDuplicates ? aggregateDuplicates(saidas) : saidas;

    if (finalEntradas.length > 0) {
      XLSX.utils.book_append_sheet(wb, buildDetailsSheet(finalEntradas, 'Entrada'), '1. Notas de Entrada');
    }
    if (finalSaidas.length > 0) {
      XLSX.utils.book_append_sheet(wb, buildDetailsSheet(finalSaidas, 'Saída'), '2. Notas de Saída');
    }

    const filename = `Relatorio_Movimentacao_Formatado_${metadata.empresa.replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  return (
    <div className="space-y-6 animate-fadeIn" id="organizador-relatorio-root">
      {/* 1. Header Hero Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-[#04243b] text-[#e4b35e]">
              <FileSpreadsheet className="w-5.5 h-5.5" />
            </span>
            <h2 className="text-xl font-black text-[#04243b] tracking-tight">
              Organizador Profissional de Relatórios
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 ml-10 max-w-2xl font-sans">
            Converta relatórios fiscais de entrada/saída truncados e desorganizados em planilhas Excel perfeitamente estruturadas para reconciliação de estoques, auditoria de impostos e declarações contábeis.
          </p>
        </div>

        {isProcessed && (
          <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
            <button
              onClick={handleExportExcel}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-all shadow-xs cursor-pointer"
              title="Gerar planilha excel formatada com múltiplas abas"
            >
              <Download className="w-4 h-4" />
              Gerar Relatório Excel Formatado
            </button>
            <button
              onClick={reset}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-xs transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Limpar
            </button>
          </div>
        )}
      </div>

      {/* 2. Setup Mode - File Upload & Copy Paste area */}
      {!isProcessed ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="upload-panel-container">
          
          {/* Main Upload Zone */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#04243b] font-sans">
              Enviar Relatório Desconfigurado
            </h3>
            
            {/* Drag & Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 flex flex-col items-center justify-center cursor-pointer ${
                isDragOver
                  ? 'border-indigo-500 bg-indigo-50/40 scale-[0.99]'
                  : 'border-slate-300 hover:border-[#e4b35e] hover:bg-slate-50/50'
              }`}
              id="report-drop-area"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="p-3.5 rounded-full bg-slate-100 text-slate-500 mb-3">
                <Upload className="h-6 h-6 text-slate-600" />
              </div>
              <p className="text-xs font-bold text-slate-700 font-sans">
                {fileName ? `Selecionado: ${fileName}` : 'Arraste e solte o arquivo de texto (.TXT / .CSV) do relatório aqui'}
              </p>
              <p className="text-[10px] text-slate-400 mt-1 font-sans">
                ou clique para procurar no seu computador
              </p>
            </div>

            {/* Paste Box Area */}
            <div className="flex flex-col space-y-2 pt-2">
              <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                <ClipboardType className="w-3.5 h-3.5 text-slate-400" />
                Ou cole o conteúdo de texto do relatório desorganizado diretamente abaixo:
              </label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Cole o texto delimitado por ponto e vírgula aqui..."
                rows={8}
                className="w-full p-4 text-xs font-mono border border-slate-200 rounded-xl bg-slate-50/50 focus:outline-none focus:border-[#04243b] focus:bg-white resize-y"
              />
              <button
                onClick={() => handleParseText(rawText)}
                disabled={!rawText.trim()}
                className="w-full py-2.5 rounded-xl bg-[#04243b] hover:bg-[#031d30] disabled:bg-slate-200 text-[#e4b35e] disabled:text-slate-400 font-bold text-xs transition-all shadow-xs cursor-pointer"
              >
                Analisar e Organizar Relatório de Texto
              </button>
            </div>
          </div>

          {/* Quick Info & Demo trigger Column */}
          <div className="bg-gradient-to-br from-[#04243b] to-[#031d30] text-slate-200 rounded-2xl p-6 border border-[#e4b35e]/15 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-[#e4b35e]/25 pb-3">
                <Sparkles className="w-5 h-5 text-[#e4b35e]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#e4b35e] font-sans">
                  Como funciona?
                </h4>
              </div>
              <ul className="text-xs space-y-3.5 text-slate-300 font-sans leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#e4b35e] mt-1.5 shrink-0" />
                  <span><strong>Importação Rápida:</strong> Carregue o arquivo de saída gerado pelo seu ERP ou cole o bloco bruto de texto copiado.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#e4b35e] mt-1.5 shrink-0" />
                  <span><strong>Higienização Automática:</strong> O sistema remove linhas nulas, cabeçalhos de paginação duplicados e formata pontos e vírgulas.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#e4b35e] mt-1.5 shrink-0" />
                  <span><strong>Separação Inteligente:</strong> Classifica de forma instantânea todos os registros de notas em Abas separadas de <strong>Entradas</strong> e <strong>Saídas</strong>.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#e4b35e] mt-1.5 shrink-0" />
                  <span><strong>Relatório Reconciliado:</strong> Baixe uma planilha Excel altamente polida com as abas limpas e com uma folha consolidada com resumo por Produto, CFOP e NCM.</span>
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-[#e4b35e]/15">
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed mb-3">
                Não possui um relatório desconfigurado à mão no momento? Use nosso arquivo de teste com registros fiscais reais de entrada e saída.
              </p>
              <button
                onClick={loadSample}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#e4b35e] hover:bg-[#d09e4c] text-[#04243b] font-bold text-xs py-2.5 px-4 rounded-xl shadow-md transition-all duration-300 font-sans cursor-pointer shrink-0"
              >
                <Info className="w-4 h-4 shrink-0" />
                Carregar Relatório de Exemplo
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 3. Output Mode - Dashboard with Tabs and Tables */
        <div className="space-y-6">
          
          {/* Metadata banner */}
          <div className="bg-white px-5 py-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4 font-sans text-xs">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Razão Social / Empresa</span>
                <span className="font-extrabold text-slate-700">{metadata?.empresa}</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Período de Referência</span>
                <span className="font-extrabold text-slate-700">{metadata?.periodo}</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Info className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Data de Geração do Arquivo</span>
                <span className="font-extrabold text-slate-700">{metadata?.dataGeracao}</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="report-summary-cards">
            {/* Total Entries Card */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Entradas Totais</span>
                <span className="text-base font-black text-emerald-600 font-mono mt-0.5 block">
                  R$ {stats.entradas.vContabil.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  {entradas.length} itens correspondentes
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Coins className="w-5 h-5" />
              </div>
            </div>

            {/* Total Exits Card */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Saídas Totais</span>
                <span className="text-base font-black text-blue-600 font-mono mt-0.5 block">
                  R$ {stats.saidas.vContabil.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  {saidas.length} itens correspondentes
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            {/* Total Taxes Card */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Impostos Totais (ICMS+IPI)</span>
                <span className="text-base font-black text-amber-600 font-mono mt-0.5 block">
                  R$ {(stats.entradas.totalTaxes + stats.saidas.totalTaxes).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Base total: R$ {(stats.entradas.icms + stats.saidas.icms).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Percent className="w-5 h-5" />
              </div>
            </div>

            {/* Product count */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Produtos Distintos</span>
                <span className="text-base font-black text-[#04243b] font-mono mt-0.5 block">
                  {stats.entradas.uniqProdCount + stats.saidas.uniqProdCount} itens
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Total de volume: {(stats.entradas.qtde + stats.saidas.qtde).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} un
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#04243b]/5 text-[#04243b] flex items-center justify-center shrink-0">
                <Package className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Abas selection Tab Layout */}
          <div className="border-b border-slate-200" id="results-tabs-wrapper">
            <nav className="flex space-x-6" aria-label="Tabs">
              <button
                onClick={() => { setActiveTab('entradas'); setSearchTerm(''); setCfopFilter('all'); setCstFilter('all'); setCurrentPage(1); }}
                className={`py-3.5 px-1 border-b-2 font-extrabold text-sm transition-all cursor-pointer ${
                  activeTab === 'entradas'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                📥 Notas de Entrada ({entradas.length})
              </button>
              <button
                onClick={() => { setActiveTab('saidas'); setSearchTerm(''); setCfopFilter('all'); setCstFilter('all'); setCurrentPage(1); }}
                className={`py-3.5 px-1 border-b-2 font-extrabold text-sm transition-all cursor-pointer ${
                  activeTab === 'saidas'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                📤 Notas de Saída ({saidas.length})
              </button>
              <button
                onClick={() => { setActiveTab('auditoria'); }}
                className={`py-3.5 px-1 border-b-2 font-extrabold text-sm transition-all cursor-pointer ${
                  activeTab === 'auditoria'
                    ? 'border-[#e4b35e] text-[#04243b]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                📊 Resumos & Reconciliação Fiscal (Auditoria)
              </button>
            </nav>
          </div>

          {/* 3.1. RENDER TABLES TABS: ENTRADAS / SAÍDAS */}
          {activeTab !== 'auditoria' ? (
            <div className="space-y-4">

              {/* Tool para percentual de PF e PJ (exclusivo para Saídas) */}
              {activeTab === 'saidas' && (
                <div className="bg-gradient-to-r from-slate-50 to-white p-5 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-12 gap-5 items-center font-sans animate-fadeIn">
                  <div className="md:col-span-4 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="p-1.5 rounded-lg bg-[#04243b] text-[#e4b35e]">
                        <Percent className="w-4 h-4" />
                      </span>
                      <h4 className="text-xs font-black text-[#04243b] uppercase tracking-wider">
                        Vendas para PF e PJ (Saídas)
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Cálculo automático do percentual de vendas conforme os documentos identificados no relatório de saídas. CPF (11 dígitos) e CNPJ (14 dígitos).
                    </p>
                  </div>

                  <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                    {/* Pessoa Física (PF) */}
                    <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-100/80 flex flex-col">
                      <span className="text-[9px] uppercase font-bold text-amber-800 tracking-wider">Pessoa Física (PF)</span>
                      <span className="text-xl font-black text-amber-700 font-mono mt-1">
                        {pfPjMetrics.pfPctValue.toFixed(1)}%
                      </span>
                      <div className="flex justify-between items-center text-[10px] text-amber-600 mt-1 font-mono">
                        <span>R$ {pfPjMetrics.pfValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        <span className="bg-amber-100 px-1 py-0.2 rounded text-[9px] font-bold">{pfPjMetrics.pfCount} NFs</span>
                      </div>
                    </div>

                    {/* Pessoa Jurídica (PJ) */}
                    <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-100/80 flex flex-col">
                      <span className="text-[9px] uppercase font-bold text-blue-800 tracking-wider">Pessoa Jurídica (PJ)</span>
                      <span className="text-xl font-black text-blue-700 font-mono mt-1">
                        {pfPjMetrics.pjPctValue.toFixed(1)}%
                      </span>
                      <div className="flex justify-between items-center text-[10px] text-blue-600 mt-1 font-mono">
                        <span>R$ {pfPjMetrics.pjValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        <span className="bg-blue-100 px-1 py-0.2 rounded text-[9px] font-bold">{pfPjMetrics.pjCount} NFs</span>
                      </div>
                    </div>

                    {/* Outros / Não Identificados */}
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex flex-col">
                      <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Outros / Não Ident.</span>
                      <span className="text-xl font-black text-slate-700 font-mono mt-1">
                        {pfPjMetrics.otherPctValue.toFixed(1)}%
                      </span>
                      <div className="flex justify-between items-center text-[10px] text-slate-600 mt-1 font-mono">
                        <span>R$ {pfPjMetrics.otherValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        <span className="bg-slate-100 px-1 py-0.2 rounded text-[9px] font-bold">{pfPjMetrics.otherCount} NFs</span>
                      </div>
                    </div>
                  </div>

                  {/* Split Visual Progress Bar */}
                  <div className="md:col-span-12">
                    <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
                      {pfPjMetrics.pfPctValue > 0 && (
                        <div 
                          className="bg-amber-500 transition-all duration-500 hover:opacity-90 cursor-help" 
                          style={{ width: `${pfPjMetrics.pfPctValue}%` }} 
                          title={`PF: ${pfPjMetrics.pfPctValue.toFixed(1)}%`}
                        />
                      )}
                      {pfPjMetrics.pjPctValue > 0 && (
                        <div 
                          className="bg-blue-600 transition-all duration-500 hover:opacity-90 cursor-help" 
                          style={{ width: `${pfPjMetrics.pjPctValue}%` }} 
                          title={`PJ: ${pfPjMetrics.pjPctValue.toFixed(1)}%`}
                        />
                      )}
                      {pfPjMetrics.otherPctValue > 0 && (
                        <div 
                          className="bg-slate-400 transition-all duration-500 hover:opacity-90 cursor-help" 
                          style={{ width: `${pfPjMetrics.otherPctValue}%` }} 
                          title={`Outros: ${pfPjMetrics.otherPctValue.toFixed(1)}%`}
                        />
                      )}
                    </div>
                    
                    {/* Progress Bar Labels */}
                    <div className="flex justify-between items-center mt-2 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full" /> PF ({pfPjMetrics.pfPctValue.toFixed(1)}%)</span>
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-blue-600 rounded-full" /> PJ ({pfPjMetrics.pjPctValue.toFixed(1)}%)</span>
                      {pfPjMetrics.otherPctValue > 0 && (
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-slate-400 rounded-full" /> Outros ({pfPjMetrics.otherPctValue.toFixed(1)}%)</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Filter and search bar controls */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-3 items-center justify-between">
                
                {/* Search query */}
                <div className="relative w-full md:w-80">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    placeholder="Buscar por Nota, Produto, CNPJ, NCM..."
                    className="w-full pl-8.5 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#04243b] focus:ring-1 focus:ring-[#04243b]"
                  />
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3.5 w-full md:w-auto justify-end">
                  
                  {/* Toggle: Somar Duplicados */}
                  <label className="inline-flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1 rounded-xl transition-all h-[30px] select-none shadow-xs">
                    <input 
                      type="checkbox" 
                      checked={groupDuplicates} 
                      onChange={(e) => { setGroupDuplicates(e.target.checked); setCurrentPage(1); }}
                      className="sr-only peer"
                    />
                    <div className="relative w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                    <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> Somar Duplicados
                    </span>
                  </label>

                  {/* CFOP dropdown */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                    <span>CFOP:</span>
                    <select
                      value={cfopFilter}
                      onChange={(e) => { setCfopFilter(e.target.value); setCurrentPage(1); }}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[#04243b] text-slate-700 font-bold"
                    >
                      <option value="all">Todos ({uniqueCfops.length})</option>
                      {uniqueCfops.map(c => (
                        <option key={`opt-cfop-${c}`} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* CST dropdown */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span>CST:</span>
                    <select
                      value={cstFilter}
                      onChange={(e) => { setCstFilter(e.target.value); setCurrentPage(1); }}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[#04243b] text-slate-700 font-bold"
                    >
                      <option value="all">Todos ({uniqueCsts.length})</option>
                      {uniqueCsts.map(c => (
                        <option key={`opt-cst-${c}`} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                </div>
              </div>

              {/* Items List Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden" id="report-items-table">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-600 text-[10px] font-bold tracking-wider uppercase border-b border-slate-100">
                      <tr>
                        {!groupDuplicates && <th className="py-3 px-4">Nota Fiscal</th>}
                        {!groupDuplicates && <th className="py-3 px-4">Data</th>}
                        {!groupDuplicates && <th className="py-3 px-4">CNPJ / CPF do Contribuinte</th>}
                        {!groupDuplicates && <th className="py-3 px-4 text-center">Tipo (PF/PJ)</th>}
                        <th className="py-3 px-4 text-center">CFOP</th>
                        <th className="py-3 px-4">Produto</th>
                        <th className="py-3 px-4 text-center">NCM</th>
                        <th className="py-3 px-4 text-center">UN</th>
                        <th className="py-3 px-4 text-center">Qtde</th>
                        <th className="py-3 px-4 text-right">R$ Unit.</th>
                        <th className="py-3 px-4 text-center">R$ Prod.</th>
                        <th className="py-3 px-4 text-right">Vlr. Contábil</th>
                        <th className="py-3 px-4 text-center">CST</th>
                        <th className="py-3 px-4 text-right">Impostos (ICMS/IPI)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {paginatedItems.length === 0 ? (
                        <tr>
                          <td colSpan={groupDuplicates ? 10 : 14} className="text-center py-10 text-slate-400 font-sans">
                            Nenhum registro encontrado correspondente aos critérios de busca ou filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        paginatedItems.map((item, idx) => {
                          const taxSum = item.rIcms + item.rIpi;
                          return (
                            <tr key={`item-${item.notaFiscal}-${item.codigoProduto}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                              {!groupDuplicates && (
                                <td className="py-2.5 px-4 font-mono font-bold text-[#04243b]">
                                  {item.notaFiscal.includes('CONSOLIDADO') ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-extrabold border border-emerald-200">
                                      Consolidado
                                    </span>
                                  ) : item.notaFiscal.includes(',') ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-extrabold border border-blue-200" title={item.notaFiscal}>
                                      Várias ({item.notaFiscal.split(',').length} NFs)
                                    </span>
                                  ) : (
                                    item.notaFiscal
                                  )}
                                </td>
                              )}
                              {!groupDuplicates && (
                                <td className="py-2.5 px-4 text-slate-600 font-mono">
                                  {item.data === 'DIVERSAS' ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 text-[10px] font-semibold border border-slate-200">
                                      Várias
                                    </span>
                                  ) : (
                                    item.data
                                  )}
                                </td>
                              )}
                              {!groupDuplicates && (
                                <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">
                                  {item.cnpj === 'DIVERSOS' ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-50 text-slate-400 text-[9px] font-semibold">
                                      Diversos
                                    </span>
                                  ) : (
                                    item.cnpj
                                  )}
                                </td>
                              )}
                              {!groupDuplicates && (
                                <td className="py-2.5 px-4 text-center">
                                  {item.cnpj === 'DIVERSOS' ? (
                                    <span className="text-slate-400 text-[10px] font-medium">-</span>
                                  ) : (() => {
                                    const type = getDocumentType(item.cnpj);
                                    if (type === 'PF') {
                                      return (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black border border-amber-200 uppercase tracking-wide">
                                          PF
                                        </span>
                                      );
                                    } else if (type === 'PJ') {
                                      return (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black border border-blue-200 uppercase tracking-wide">
                                          PJ
                                        </span>
                                      );
                                    }
                                    return (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200 uppercase tracking-wide">
                                        Outro
                                      </span>
                                    );
                                  })()}
                                </td>
                              )}
                              <td className="py-2.5 px-4 text-center">
                                <span 
                                  className="inline-block px-2 py-0.5 rounded-md font-extrabold text-[10px] bg-slate-100 text-slate-700" 
                                  title={CFOP_DESC[item.cfop] || 'CFOP não cadastrado'}
                                >
                                  {item.cfop}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 max-w-xs truncate" title={item.nomeProduto}>
                                <div className="font-bold text-slate-700">{item.nomeProduto}</div>
                                <div className="text-[10px] text-slate-400 font-mono">Cód: {item.codigoProduto}</div>
                              </td>
                              <td className="py-2.5 px-4 text-center font-mono text-[11px] text-slate-500">
                                {item.ncm}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-bold">
                                  {item.un}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-center font-mono font-bold text-slate-600">
                                {item.qtde.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                                R$ {item.rUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-4 text-center font-mono text-slate-600">
                                R$ {item.rProduto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-800">
                                R$ {item.vlrContabil.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <span 
                                  className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-800 border border-blue-200"
                                  title={CST_DESC[item.cst] || 'CST não mapeado'}
                                >
                                  {item.cst}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono text-slate-500">
                                <div className="text-[11px]">
                                  {taxSum > 0 ? `R$ ${taxSum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                                </div>
                                {taxSum > 0 && (
                                  <div className="text-[9px] text-slate-400">
                                    {item.rIcms > 0 && `ICMS: R$ ${item.rIcms.toFixed(0)}`}
                                    {item.rIpi > 0 && ` | IPI: R$ ${item.rIpi.toFixed(0)}`}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination footer bar */}
                {totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-sans" id="pagination-controls">
                    <div>
                      Mostrando <span className="font-bold text-slate-700">{(currentPage - 1) * itemsPerPage + 1}</span> a{' '}
                      <span className="font-bold text-slate-700">{Math.min(currentPage * itemsPerPage, filteredItems.length)}</span> de{' '}
                      <span className="font-bold text-slate-700">{filteredItems.length}</span> registros
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      
                      <span className="px-3 py-1 font-extrabold text-[#04243b] bg-slate-100 border border-slate-200 rounded-lg">
                        Página {currentPage} de {totalPages}
                      </span>

                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* 3.2. RENDER COMPLIANCE TAX & STOCK AUDIT PANEL (ABA 3) */
            <div className="space-y-6" id="compliance-auditoria-panel-wrapper">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="compliance-auditoria-panel">
              
              {/* Product Inventory summaries (Stock Check) */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Package className="w-5 h-5 text-[#04243b]" />
                  <h3 className="text-sm font-black text-[#04243b] tracking-tight uppercase font-sans">
                    Estoque: Reconciliação Física de Itens (Volume e Valores)
                  </h3>
                </div>

                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                  
                  {/* Entradas unique items list */}
                  <div>
                    <h4 className="text-xs font-bold text-emerald-700 uppercase mb-2 flex items-center gap-1.5 font-sans">
                      <span className="w-2 h-2 rounded-full bg-emerald-600" />
                      Entradas por Produto
                    </h4>
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Código / Nome do Produto</th>
                          <th className="py-2 px-3 text-right">Qtde Total</th>
                          <th className="py-2 px-3 text-right">Vlr. Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {auditReport.entradas.productList.slice(0, 10).map(p => (
                          <tr key={`p-ent-${p.code}`} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3">
                              <span className="font-bold text-slate-700 block text-[11px] truncate font-sans">{p.name}</span>
                              <span className="text-[9px] text-slate-400 block">Cód: {p.code} | {p.un}</span>
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-600">
                              {p.qty.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-800">
                              R$ {p.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Saídas unique items list */}
                  <div className="pt-2 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-blue-700 uppercase mb-2 flex items-center gap-1.5 font-sans">
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                      Saídas por Produto (Ranking de Volume de Vendas)
                    </h4>
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Código / Nome do Produto</th>
                          <th className="py-2 px-3 text-right">Qtde Total</th>
                          <th className="py-2 px-3 text-right">Vlr. Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {auditReport.saidas.productList.slice(0, 10).map(p => (
                          <tr key={`p-sai-${p.code}`} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3">
                              <span className="font-bold text-slate-700 block text-[11px] truncate font-sans">{p.name}</span>
                              <span className="text-[9px] text-slate-400 block">Cód: {p.code} | {p.un}</span>
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-600">
                              {p.qty.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-800">
                              R$ {p.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                </div>
              </div>

              {/* Tax CFOP & CST reconciliations (Impostos check) */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Coins className="w-5 h-5 text-[#04243b]" />
                  <h3 className="text-sm font-black text-[#04243b] tracking-tight uppercase font-sans">
                    Impostos: Conciliação por CFOP, NCM e CST tributário
                  </h3>
                </div>

                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                  
                  {/* CFOP summaries */}
                  <div>
                    <h4 className="text-xs font-bold text-[#04243b] uppercase mb-4 flex items-center gap-1.5 font-sans border-b border-slate-100 pb-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#04243b]" />
                      SÍNTESE DE OPERAÇÕES FISCAIS POR CFOP
                    </h4>

                    <div className="space-y-6 max-h-[500px] overflow-y-auto pr-1">
                      {/* ENTRADAS */}
                      <div className="border border-emerald-100 rounded-xl overflow-hidden bg-emerald-50/10">
                        <div className="bg-emerald-700 text-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider flex justify-between items-center">
                          <span>📥 ENTRADAS (Dentro & Fora do Estado)</span>
                          <span className="text-[10px] font-mono bg-emerald-800/60 px-2 py-0.5 rounded">
                            R$ {(
                              auditReport.entradas.cfopList.reduce((acc, curr) => acc + curr.total, 0)
                            ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        
                        <div className="p-2 space-y-4">
                          {/* Internas */}
                          {auditReport.entradas.cfopList.filter(c => c.cfop.replace('-', '').startsWith('1')).length > 0 && (
                            <div>
                              <div className="text-[9px] uppercase font-black text-emerald-800 mb-1 px-1 tracking-wider">
                                Movimento: Entradas Internas (1.000)
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-[10px] bg-white rounded-lg border border-slate-100 overflow-hidden shadow-2xs min-w-[400px]">
                                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[8px] border-b border-slate-100">
                                    <tr>
                                      <th className="py-2 px-2.5">CFOP</th>
                                      <th className="py-2 px-2 text-right">Vlr. Contábil</th>
                                      <th className="py-2 px-2 text-right">Base ICMS</th>
                                      <th className="py-2 px-2 text-right">Vlr. ICMS</th>
                                      <th className="py-2 px-2 text-right">Isentas/Outras</th>
                                      <th className="py-2 px-2.5 text-right">IPI</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50 font-mono text-[10px]">
                                    {auditReport.entradas.cfopList.filter(c => c.cfop.replace('-', '').startsWith('1')).map(c => (
                                      <tr key={`ui-cfop-ent-int-${c.cfop}`} className="hover:bg-slate-50/50">
                                        <td className="py-1.5 px-2.5 font-bold text-slate-700">
                                          {c.cfop}
                                          <span className="text-[8px] font-sans text-slate-400 block truncate max-w-[120px]" title={CFOP_DESC[c.cfop] || 'Operação'}>
                                            {CFOP_DESC[c.cfop] || 'Operação de Entrada'}
                                          </span>
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-extrabold text-slate-700">
                                          R$ {c.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-slate-500">
                                          R$ {c.rBaseIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-slate-600 font-bold">
                                          R$ {c.rIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-slate-500">
                                          R$ {(c.isentas + c.outras).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-right text-slate-500">
                                          R$ {c.rIpi.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Interestaduais */}
                          {auditReport.entradas.cfopList.filter(c => c.cfop.replace('-', '').startsWith('2') || c.cfop.replace('-', '').startsWith('3')).length > 0 && (
                            <div>
                              <div className="text-[9px] uppercase font-black text-emerald-800 mb-1 px-1 tracking-wider">
                                Movimento: Entradas Interestaduais (2.000 / 3.000)
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-[10px] bg-white rounded-lg border border-slate-100 overflow-hidden shadow-2xs min-w-[400px]">
                                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[8px] border-b border-slate-100">
                                    <tr>
                                      <th className="py-2 px-2.5">CFOP</th>
                                      <th className="py-2 px-2 text-right">Vlr. Contábil</th>
                                      <th className="py-2 px-2 text-right">Base ICMS</th>
                                      <th className="py-2 px-2 text-right">Vlr. ICMS</th>
                                      <th className="py-2 px-2 text-right">Isentas/Outras</th>
                                      <th className="py-2 px-2.5 text-right">IPI</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50 font-mono text-[10px]">
                                    {auditReport.entradas.cfopList.filter(c => c.cfop.replace('-', '').startsWith('2') || c.cfop.replace('-', '').startsWith('3')).map(c => (
                                      <tr key={`ui-cfop-ent-ext-${c.cfop}`} className="hover:bg-slate-50/50">
                                        <td className="py-1.5 px-2.5 font-bold text-slate-700">
                                          {c.cfop}
                                          <span className="text-[8px] font-sans text-slate-400 block truncate max-w-[120px]" title={CFOP_DESC[c.cfop] || 'Operação'}>
                                            {CFOP_DESC[c.cfop] || 'Operação de Entrada'}
                                          </span>
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-extrabold text-slate-700">
                                          R$ {c.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-slate-500">
                                          R$ {c.rBaseIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-slate-600 font-bold">
                                          R$ {c.rIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-slate-500">
                                          R$ {(c.isentas + c.outras).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-right text-slate-500">
                                          R$ {c.rIpi.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* SAÍDAS */}
                      <div className="border border-blue-100 rounded-xl overflow-hidden bg-blue-50/10">
                        <div className="bg-blue-700 text-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider flex justify-between items-center">
                          <span>📤 SAÍDAS (Dentro & Fora do Estado)</span>
                          <span className="text-[10px] font-mono bg-blue-800/60 px-2 py-0.5 rounded">
                            R$ {(
                              auditReport.saidas.cfopList.reduce((acc, curr) => acc + curr.total, 0)
                            ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        
                        <div className="p-2 space-y-4">
                          {/* Internas */}
                          {auditReport.saidas.cfopList.filter(c => c.cfop.replace('-', '').startsWith('5')).length > 0 && (
                            <div>
                              <div className="text-[9px] uppercase font-black text-blue-800 mb-1 px-1 tracking-wider">
                                Movimento: Saídas Internas (5.000)
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-[10px] bg-white rounded-lg border border-slate-100 overflow-hidden shadow-2xs min-w-[400px]">
                                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[8px] border-b border-slate-100">
                                    <tr>
                                      <th className="py-2 px-2.5">CFOP</th>
                                      <th className="py-2 px-2 text-right">Vlr. Contábil</th>
                                      <th className="py-2 px-2 text-right">Base ICMS</th>
                                      <th className="py-2 px-2 text-right">Vlr. ICMS</th>
                                      <th className="py-2 px-2 text-right">Isentas/Outras</th>
                                      <th className="py-2 px-2.5 text-right">IPI</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50 font-mono text-[10px]">
                                    {auditReport.saidas.cfopList.filter(c => c.cfop.replace('-', '').startsWith('5')).map(c => (
                                      <tr key={`ui-cfop-sai-int-${c.cfop}`} className="hover:bg-slate-50/50">
                                        <td className="py-1.5 px-2.5 font-bold text-slate-700">
                                          {c.cfop}
                                          <span className="text-[8px] font-sans text-slate-400 block truncate max-w-[120px]" title={CFOP_DESC[c.cfop] || 'Operação'}>
                                            {CFOP_DESC[c.cfop] || 'Operação de Saída'}
                                          </span>
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-extrabold text-slate-700">
                                          R$ {c.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-slate-500">
                                          R$ {c.rBaseIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-slate-600 font-bold">
                                          R$ {c.rIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-slate-500">
                                          R$ {(c.isentas + c.outras).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-right text-slate-500">
                                          R$ {c.rIpi.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Interestaduais */}
                          {auditReport.saidas.cfopList.filter(c => c.cfop.replace('-', '').startsWith('6') || c.cfop.replace('-', '').startsWith('7')).length > 0 && (
                            <div>
                              <div className="text-[9px] uppercase font-black text-blue-800 mb-1 px-1 tracking-wider">
                                Movimento: Saídas Interestaduais (6.000 / 7.000)
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-[10px] bg-white rounded-lg border border-slate-100 overflow-hidden shadow-2xs min-w-[400px]">
                                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[8px] border-b border-slate-100">
                                    <tr>
                                      <th className="py-2 px-2.5">CFOP</th>
                                      <th className="py-2 px-2 text-right">Vlr. Contábil</th>
                                      <th className="py-2 px-2 text-right">Base ICMS</th>
                                      <th className="py-2 px-2 text-right">Vlr. ICMS</th>
                                      <th className="py-2 px-2 text-right">Isentas/Outras</th>
                                      <th className="py-2 px-2.5 text-right">IPI</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50 font-mono text-[10px]">
                                    {auditReport.saidas.cfopList.filter(c => c.cfop.replace('-', '').startsWith('6') || c.cfop.replace('-', '').startsWith('7')).map(c => (
                                      <tr key={`ui-cfop-sai-ext-${c.cfop}`} className="hover:bg-slate-50/50">
                                        <td className="py-1.5 px-2.5 font-bold text-slate-700">
                                          {c.cfop}
                                          <span className="text-[8px] font-sans text-slate-400 block truncate max-w-[120px]" title={CFOP_DESC[c.cfop] || 'Operação'}>
                                            {CFOP_DESC[c.cfop] || 'Operação de Saída'}
                                          </span>
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-extrabold text-slate-700">
                                          R$ {c.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-slate-500">
                                          R$ {c.rBaseIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-slate-600 font-bold">
                                          R$ {c.rIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-slate-500">
                                          R$ {(c.isentas + c.outras).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-right text-slate-500">
                                          R$ {c.rIpi.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* NCM summaries */}
                  <div className="pt-2 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-1.5 font-sans">
                      <span className="w-2 h-2 rounded-full bg-[#04243b]" />
                      Concentração Fiscal por Código NCM
                    </h4>
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Código NCM</th>
                          <th className="py-2 px-3">Fluxo</th>
                          <th className="py-2 px-3 text-right">Vlr. Total Acumulado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {/* Entradas */}
                        {auditReport.entradas.ncmList.slice(0, 5).map(n => (
                          <tr key={`ncm-ent-${n.ncm}`} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-bold text-slate-700">
                              {n.ncm}
                            </td>
                            <td className="py-2 px-3">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">ENTRADA</span>
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-700">
                              R$ {n.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                        {/* Saídas */}
                        {auditReport.saidas.ncmList.slice(0, 5).map(n => (
                          <tr key={`ncm-sai-${n.ncm}`} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-bold text-slate-700">
                              {n.ncm}
                            </td>
                            <td className="py-2 px-3">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">SAÍDA</span>
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-700">
                              R$ {n.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                </div>
              </div>

            </div>

            {/* PF vs PJ Vendas Summary Card inside Auditoria tab */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col space-y-4 animate-fadeIn">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Percent className="w-5 h-5 text-[#04243b]" />
                  <h3 className="text-sm font-black text-[#04243b] tracking-tight uppercase font-sans">
                    Análise Faturamento por Tipo de Destinatário (PF vs PJ)
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
                  <div className="flex flex-col justify-center">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Esta análise separa o faturamento (Valor Contábil) das notas fiscais de saída entre <strong>Pessoa Física (PF)</strong> e <strong>Pessoa Jurídica (PJ)</strong>.
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed mt-2">
                      O critério utilizado analisa o tamanho do documento (CPF com 11 dígitos e CNPJ com 14 dígitos), limpando quaisquer caracteres especiais de formatação.
                    </p>
                  </div>

                  <div className="md:col-span-2 flex flex-col justify-center space-y-4">
                    {/* Progress Bar visual indicator */}
                    <div className="w-full h-4 rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
                      {pfPjMetrics.pfPctValue > 0 && (
                        <div 
                          className="bg-amber-500 transition-all duration-500 hover:opacity-90 cursor-help" 
                          style={{ width: `${pfPjMetrics.pfPctValue}%` }} 
                          title={`PF: ${pfPjMetrics.pfPctValue.toFixed(1)}%`}
                        />
                      )}
                      {pfPjMetrics.pjPctValue > 0 && (
                        <div 
                          className="bg-blue-600 transition-all duration-500 hover:opacity-90 cursor-help" 
                          style={{ width: `${pfPjMetrics.pjPctValue}%` }} 
                          title={`PJ: ${pfPjMetrics.pjPctValue.toFixed(1)}%`}
                        />
                      )}
                      {pfPjMetrics.otherPctValue > 0 && (
                        <div 
                          className="bg-slate-400 transition-all duration-500 hover:opacity-90 cursor-help" 
                          style={{ width: `${pfPjMetrics.otherPctValue}%` }} 
                          title={`Outros: ${pfPjMetrics.otherPctValue.toFixed(1)}%`}
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* PF Summary */}
                      <div className="p-3 border border-amber-100 bg-amber-50/20 rounded-xl flex flex-col">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          Pessoa Física (CPF)
                        </div>
                        <span className="text-2xl font-black text-amber-700 font-mono mt-1">
                          {pfPjMetrics.pfPctValue.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5 font-mono">
                          R$ {pfPjMetrics.pfValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] text-slate-400 font-sans">
                          {pfPjMetrics.pfCount} Notas ({pfPjMetrics.pfPctCount.toFixed(1)}% das transações)
                        </span>
                      </div>

                      {/* PJ Summary */}
                      <div className="p-3 border border-blue-100 bg-blue-50/20 rounded-xl flex flex-col">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-800 uppercase tracking-wider">
                          <span className="w-2 h-2 rounded-full bg-blue-600" />
                          Pessoa Jurídica (CNPJ)
                        </div>
                        <span className="text-2xl font-black text-blue-700 font-mono mt-1">
                          {pfPjMetrics.pjPctValue.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5 font-mono">
                          R$ {pfPjMetrics.pjValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] text-slate-400 font-sans">
                          {pfPjMetrics.pjCount} Notas ({pfPjMetrics.pjPctCount.toFixed(1)}% das transações)
                        </span>
                      </div>

                      {/* Other Summary */}
                      <div className="p-3 border border-slate-150 bg-slate-50/50 rounded-xl flex flex-col">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <span className="w-2 h-2 rounded-full bg-slate-400" />
                          Outros / Não Identif.
                        </div>
                        <span className="text-2xl font-black text-slate-700 font-mono mt-1">
                          {pfPjMetrics.otherPctValue.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5 font-mono">
                          R$ {pfPjMetrics.otherValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] text-slate-400 font-sans">
                          {pfPjMetrics.otherCount} Notas ({pfPjMetrics.otherPctCount.toFixed(1)}% das transações)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>
      )}
    </div>
  );
}
