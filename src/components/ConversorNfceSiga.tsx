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
  Calendar
} from 'lucide-react';

export interface InvoiceRow {
  id: string;
  chaveDeAcesso: string;
  dataEmissao: string;
  valorString: string;
  valorDecimal: number;
  ufCodigo: string;
  ufNome: string;
  anoMes: string;
  cnpj: string;
  cnpjFormatado: string;
  modelo: string;
  serie: string;
  numeroNota: string;
  numeroNotaFormatado: string;
  tipoEmissao: string;
  tipoEmissaoFriendly: string;
  isValidChave: boolean;
  chaveError?: string;
}

export interface StatsData {
  totalCount: number;
  totalValor: number;
  minValor: number;
  maxValor: number;
  statesDistribution: Record<string, number>;
  seriesDistribution: Record<string, number>;
  modeloDistribution: Record<string, number>;
  periodo: { inicio: string; fim: string } | null;
}

const BRAND_CONFIG = {
  COMPANY_NAME: 'MOREIRA & LIMA CONTADORES ASSOCIADOS',
  SUBTITLE: 'RELATÓRIO DE FATURAMENTO NFC-E (INTEGRAÇÃO SIGA)',
} as const;

const UF_MAP: Record<string, { sigla: string; nome: string }> = {
  '11': { sigla: 'RO', nome: 'Rondônia' }, '12': { sigla: 'AC', nome: 'Acre' },
  '13': { sigla: 'AM', nome: 'Amazonas' }, '14': { sigla: 'RR', nome: 'Roraima' },
  '15': { sigla: 'PA', nome: 'Pará' }, '16': { sigla: 'AP', nome: 'Amapá' },
  '17': { sigla: 'TO', nome: 'Tocantins' }, '21': { sigla: 'MA', nome: 'Maranhão' },
  '22': { sigla: 'PI', nome: 'Piauí' }, '23': { sigla: 'CE', nome: 'Ceará' },
  '24': { sigla: 'RN', nome: 'Rio Grande do Norte' }, '25': { sigla: 'PB', nome: 'Paraíba' },
  '26': { sigla: 'PE', nome: 'Pernambuco' }, '27': { sigla: 'AL', nome: 'Alagoas' },
  '28': { sigla: 'SE', nome: 'Sergipe' }, '29': { sigla: 'BA', nome: 'Bahia' },
  '31': { sigla: 'MG', nome: 'Minas Gerais' }, '32': { sigla: 'ES', nome: 'Espírito Santo' },
  '33': { sigla: 'RJ', nome: 'Rio de Janeiro' }, '35': { sigla: 'SP', nome: 'São Paulo' },
  '41': { sigla: 'PR', nome: 'Paraná' }, '42': { sigla: 'SC', nome: 'Santa Catarina' },
  '43': { sigla: 'RS', nome: 'Rio Grande do Sul' }, '50': { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  '51': { sigla: 'MT', nome: 'Mato Grosso' }, '52': { sigla: 'GO', nome: 'Goiás' },
  '53': { sigla: 'DF', nome: 'Distrito Federal' },
};

const EMISSION_TYPES: Record<string, string> = {
  '1': 'Normal', '2': 'Contingência FS-IA', '3': 'Contingência SCAN',
  '4': 'Contingência EPEC', '5': 'Contingência FS-DA', '9': 'Contingência offline NFC-e',
};

const EXCEL_STYLES = {
  NAVY: '0F172A', GOLD: 'D4AF37', GRAY_BG: 'F1F5F9', ZEBRA: 'F8FAFC', TOTAL: 'FEF08A',
} as const;

function sanitizeFiscalCell(val: string): string {
  return val.trim().replace(/\s+/g, ' ');
}

function parseCurrencySafe(valStr: string): number {
  if (!valStr) return 0;
  let clean = valStr.replace(/[R$\s]/g, '');
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const num = parseFloat(clean);
  return Number.isNaN(num) ? 0 : Number(num.toFixed(2));
}

function validateFiscalKey(key: string): { isValid: boolean; cleanKey?: string; error?: string } {
  const clean = key.replace(/\D/g, '');
  if (clean.length !== 44) {
    return { isValid: false, cleanKey: clean, error: `Chave com ${clean.length} dígitos (esperado: 44)` };
  }
  return { isValid: true, cleanKey: clean };
}

function validateAndCleanDate(dateStr: string): string {
  if (!dateStr) return '-';
  const match = dateStr.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (match) return `${match[1]}/${match[2]}/${match[3]}`;
  return dateStr;
}

function formatCNPJ(cnpj: string): string {
  return cnpj.length === 14 ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : cnpj;
}

function parseChaveDeAcesso(chaveRaw: string): Omit<InvoiceRow, 'id' | 'dataEmissao' | 'valorString' | 'valorDecimal'> & { isValidChave: boolean; chaveError?: string } {
  const validation = validateFiscalKey(chaveRaw);
  if (!validation.isValid) {
    return {
      chaveDeAcesso: validation.cleanKey || chaveRaw, ufCodigo: '', ufNome: 'Inválido', anoMes: '',
      cnpj: '', cnpjFormatado: '', modelo: '', serie: '', numeroNota: '', numeroNotaFormatado: '',
      tipoEmissao: '', tipoEmissaoFriendly: '', isValidChave: false, chaveError: validation.error,
    };
  }

  const chave = validation.cleanKey;
  const ufCodigo = chave.substring(0, 2);
  const anoMesRaw = chave.substring(2, 6);
  const cnpj = chave.substring(6, 20);
  const modelo = chave.substring(20, 22);
  const serie = chave.substring(22, 25);
  const numeroNota = chave.substring(25, 34);
  const tipoEmissao = chave.substring(34, 35);
  const ufInfo = UF_MAP[ufCodigo] || { sigla: '??', nome: 'UF Desconhecida' };
  const numNotaClean = parseInt(numeroNota, 10);

  return {
    chaveDeAcesso: chave, ufCodigo, ufNome: `${ufInfo.nome} (${ufInfo.sigla})`,
    anoMes: /^\d{4}$/.test(anoMesRaw) ? `${anoMesRaw.substring(2, 4)}/20${anoMesRaw.substring(0, 2)}` : anoMesRaw,
    cnpj, cnpjFormatado: formatCNPJ(cnpj), modelo, serie: parseInt(serie, 10).toString(),
    numeroNota, numeroNotaFormatado: Number.isNaN(numNotaClean) ? numeroNota : numNotaClean.toString(),
    tipoEmissao, tipoEmissaoFriendly: EMISSION_TYPES[tipoEmissao] || 'Desconhecido', isValidChave: true,
  };
}

function parseCSV(text: string): InvoiceRow[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === delimiter && !inQuotes) {
        cells.push(sanitizeFiscalCell(current.trim().replace(/^"|"$/g, ''))); current = '';
      } else current += char;
    }
    cells.push(sanitizeFiscalCell(current.trim().replace(/^"|"$/g, '')));
    return cells;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase());
  const chaveIdx = Math.max(0, headers.findIndex(h => h.includes('chave') || h.includes('acesso')));
  const dataIdx = Math.max(1, headers.findIndex(h => h.includes('data') || h.includes('emiss')));
  const valorIdx = Math.max(2, headers.findIndex(h => h.includes('valor') || h.includes('r$')));

  const parsedRows = lines.slice(1).map((line, i) => {
    const cells = parseLine(line);
    if (cells.length < 2) return null;
    const chaveRaw = cells[chaveIdx] || '';
    const valorRaw = cells[valorIdx] || '0';
    return {
      id: `inv-${i}-${Math.random().toString(36).substring(2, 7)}`,
      dataEmissao: validateAndCleanDate(cells[dataIdx] || ''),
      valorString: valorRaw, valorDecimal: parseCurrencySafe(valorRaw),
      ...parseChaveDeAcesso(chaveRaw),
    };
  }).filter(Boolean) as InvoiceRow[];

  return parsedRows.sort((a, b) => {
    const numA = parseInt(a.numeroNota, 10) || 0;
    const numB = parseInt(b.numeroNota, 10) || 0;
    return numA - numB;
  });
}

function calculateStats(rows: InvoiceRow[]): StatsData {
  let totalValor = 0, minValor = rows.length ? Infinity : 0, maxValor = rows.length ? -Infinity : 0;
  const statesDist: Record<string, number> = {}, seriesDist: Record<string, number> = {}, modeloDist: Record<string, number> = {};
  let minDT = Infinity, maxDT = -Infinity, minDateRaw = '', maxDateRaw = '';

  for (const r of rows) {
    totalValor += r.valorDecimal;
    if (r.valorDecimal < minValor) minValor = r.valorDecimal;
    if (r.valorDecimal > maxValor) maxValor = r.valorDecimal;
    if (r.ufNome) statesDist[r.ufNome] = (statesDist[r.ufNome] || 0) + 1;
    if (r.serie) seriesDist[`Série ${r.serie}`] = (seriesDist[`Série ${r.serie}`] || 0) + 1;
    if (r.modelo) {
      const mLabel = r.modelo === '65' ? 'NFC-e (65)' : r.modelo === '55' ? 'NF-e (55)' : `Modelo ${r.modelo}`;
      modeloDist[mLabel] = (modeloDist[mLabel] || 0) + 1;
    }
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
    totalCount: rows.length, totalValor: Number(totalValor.toFixed(2)),
    minValor: minValor === Infinity ? 0 : Number(minValor.toFixed(2)),
    maxValor: maxValor === -Infinity ? 0 : Number(maxValor.toFixed(2)),
    statesDistribution: statesDist, seriesDistribution: seriesDist, modeloDistribution: modeloDist,
    periodo: minDateRaw ? { inicio: minDateRaw, fim: maxDateRaw } : null,
  };
}

function exportToExcel(rows: InvoiceRow[], customFileName = 'Relatorio_NFCe_Processado.xlsx', includeExtras = false): void {
  const maxColIndex = includeExtras ? 8 : 3;
  const exportDate = `${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const sortedRows = [...rows].sort((a, b) => (parseInt(a.numeroNota, 10) || 0) - (parseInt(b.numeroNota, 10) || 0));
  const totalValue = sortedRows.reduce((acc, curr) => acc + curr.valorDecimal, 0);

  const ws: any = {};
  let currentRow = 0;
  const merges: any[] = [];
  const rowHeights: any[] = [];

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

  // Row 0: Company Name Banner
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

  // Row 2: Spacer
  rowHeights.push({ hpt: 10 });
  currentRow++;

  // Row 3: Summary Bar (All 3 fields on the same line)
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

  // Row 4: Spacer
  rowHeights.push({ hpt: 14 });
  currentRow++;

  // Row 6: Table Headers
  const headers = includeExtras 
    ? ['Chave de Acesso', 'Número da Nota', 'Data de Emissão', 'Valor', 'Série', 'Modelo', 'CNPJ Emitente', 'UF Emitente', 'Tipo Emissão']
    : ['Chave de Acesso', 'Número da Nota', 'Data de Emissão', 'Valor'];

  headers.forEach((h, c) => {
    const alignStyle = c === 3 ? styleTableHeaderRight : (c >= 7 ? styleTableHeaderLeft : styleTableHeaderCenter);
    writeCell(currentRow, c, h, 's', alignStyle);
  });
  rowHeights.push({ hpt: 26 });
  currentRow++;

  // Table Data Rows
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

  // Grand Total Row
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

  // Metadata setup
  ws['!merges'] = merges;
  ws['!rows'] = rowHeights;

  const cols = [
    { wch: 50 }, // Chave de Acesso
    { wch: 24 }, // Número da Nota
    { wch: 22 }, // Data de Emissão
    { wch: 28 }, // Valor
  ];
  if (includeExtras) {
    cols.push(
      { wch: 16 }, // Série
      { wch: 16 }, // Modelo
      { wch: 24 }, // CNPJ Emitente
      { wch: 26 }, // UF Emitente
      { wch: 28 }  // Tipo Emissão
    );
  }
  ws['!cols'] = cols;
  ws['!views'] = [{ showGridLines: false }];

  const lastRef = getCellRef(currentRow - 1, maxColIndex);
  ws['!ref'] = `A1:${lastRef}`;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, 'Relatório NFC-e');
  XLSX.writeFile(workbook, customFileName.endsWith('.xlsx') ? customFileName : `${customFileName}.xlsx`);
}

export function ConversorNfceSiga() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'valid' | 'invalid'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => calculateStats(rows), [rows]);

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

  const handleFileProcess = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        const parsed = parseCSV(text);
        setRows(parsed);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const resetAll = () => {
    setRows([]);
    setFileName('');
    setSearchTerm('');
    setFilterStatus('all');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Title block */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#04243b] text-[#e4b35e]">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-extrabold text-[#04243b] tracking-tight">
              Conversor NFC-e - SIGA
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 ml-9">
            Converta relatórios de NFC-e do SIGA para planilhas formatadas em Excel.
          </p>
        </div>

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => exportToExcel(rows, `NFCe_SIGA_${new Date().toISOString().slice(0,10)}.xlsx`, false)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-bold text-xs transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Exportar Excel (Padrão)
            </button>
            <button
              onClick={() => exportToExcel(rows, `NFCe_SIGA_Completo_${new Date().toISOString().slice(0,10)}.xlsx`, true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Exportar Detalhado
            </button>
            <button
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

      {/* Upload area when empty */}
      {rows.length === 0 ? (
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
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
          <h3 className="text-base font-bold text-[#04243b]">
            Arraste o arquivo CSV do SIGA ou clique para selecionar
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            O sistema extrai automaticamente chaves de acesso de 44 dígitos, datas de emissão, números das notas e valores consolidados.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-200">
            Formatos suportados: CSV (separado por ponto e vírgula ou vírgula)
          </span>
        </div>
      ) : (
        <>
          {/* Stats KPI grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total de Notas</span>
                <span className="text-xl font-black text-[#04243b] font-mono mt-0.5 block">{stats.totalCount}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#04243b]/5 text-[#04243b] flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Valor Acumulado</span>
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
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Período Identificado</span>
                <span className="text-xs font-bold text-[#04243b] mt-1 block">
                  {stats.periodo ? `${stats.periodo.inicio} a ${stats.periodo.fim}` : 'Período não identificado'}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">Com base na data de emissão</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#e4b35e]/15 text-[#e4b35e] flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Table section with search and filter */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs uppercase tracking-wider text-[#04243b]">
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
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Válida
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-bold text-[10px] border border-red-200" title={r.chaveError}>
                              <AlertTriangle className="w-3 h-3 text-red-600" />
                              Inválida
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-[#04243b]">
                          {r.numeroNotaFormatado}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">
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
    </div>
  );
}
