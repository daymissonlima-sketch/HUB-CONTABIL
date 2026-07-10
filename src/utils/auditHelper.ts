/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx-js-style';
import { InvoiceRow } from '../components/ConversorNfceSiga';

export interface ErpRecord {
  nota: number;
  dataEmissao: string;
  valor: number;
  serie: string;
  cliente: string;
  linhaOriginal: string;
}

export interface AuditItem {
  nota: number;
  status: 'OK' | 'FALTANTE_ERP' | 'NAO_CONSTA_SEFAZ' | 'SALTO_SEQUENCIA';
  sefazValue?: number;
  erpValue?: number;
  sefazDate?: string;
  erpDate?: string;
  chaveDeAcesso?: string;
  cliente?: string;
  serie?: string;
}

export interface AuditSummary {
  totalSefaz: number;
  totalErp: number;
  sincronizadas: number;
  faltantesErp: number;
  naoConstamSefaz: number;
  saltosSequencia: number;
  minNota: number;
  maxNota: number;
}

// Simple currency parser mirroring system behavior
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

/**
 * Parses the accounting ERP CSV text into ErpRecord structured format.
 * Semicolon or comma delimited, tolerating metadata blocks.
 */
export function parseErpReport(text: string): ErpRecord[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];

  // Identify delimiter and header line
  let headerIndex = -1;
  let delimiter = ';';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split(';');
    const hasNota = cells.some(c => c.toLowerCase().includes('nota'));
    const hasEmissao = cells.some(c => c.toLowerCase().includes('emissão') || c.toLowerCase().includes('emissao'));
    if (hasNota && hasEmissao) {
      headerIndex = i;
      delimiter = ';';
      break;
    }

    const cellsComma = line.split(',');
    const hasNotaComma = cellsComma.some(c => c.toLowerCase().includes('nota'));
    const hasEmissaoComma = cellsComma.some(c => c.toLowerCase().includes('emissão') || c.toLowerCase().includes('emissao'));
    if (hasNotaComma && hasEmissaoComma) {
      headerIndex = i;
      delimiter = ',';
      break;
    }
  }

  // Fallbacks if no matching header row found
  let notaIdx = 4;
  let dataIdx = 1;
  let valorIdx = 22;
  let serieIdx = 5;
  let clienteIdx = 11;

  if (headerIndex !== -1) {
    const headerCells = lines[headerIndex].split(delimiter).map(c => c.trim().toLowerCase());
    const foundNota = headerCells.findIndex(c => c === 'nota');
    if (foundNota !== -1) notaIdx = foundNota;

    const foundData = headerCells.findIndex(c => c.includes('data emiss') || c === 'data');
    if (foundData !== -1) dataIdx = foundData;

    const foundValor = headerCells.findIndex(c => c.includes('valor cont') || c.includes('valor c') || c === 'valor');
    if (foundValor !== -1) valorIdx = foundValor;

    const foundSerie = headerCells.findIndex(c => c.includes('série') || c === 'serie');
    if (foundSerie !== -1) serieIdx = foundSerie;

    const foundCliente = headerCells.findIndex(c => c === 'cliente');
    if (foundCliente !== -1) clienteIdx = foundCliente;
  } else {
    // If absolutely no header was found, use row 0 as header, or assume first line starting with a code is data
    headerIndex = -1; 
  }

  const erpRecordsMap = new Map<number, ErpRecord>();
  const startIdx = headerIndex !== -1 ? headerIndex + 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    
    // Ignore totalizers or system licensing footers
    const lowerLine = line.toLowerCase();
    if (
      lowerLine.includes('total cliente') || 
      lowerLine.includes('total geral') || 
      lowerLine.includes('sistema licenciado') ||
      lowerLine.includes('acompanhamento de')
    ) {
      continue;
    }

    const cells = line.split(delimiter).map(c => c.trim());
    if (cells.length <= Math.max(notaIdx, dataIdx)) continue;

    const rawNota = cells[notaIdx] || '';
    const cleanNotaStr = rawNota.replace(/\D/g, '');
    if (!cleanNotaStr) continue;

    const notaNum = parseInt(cleanNotaStr, 10);
    if (Number.isNaN(notaNum)) continue;

    const dataEmissao = cells[dataIdx] || '';
    const rawValor = cells[valorIdx] || '0';
    const valor = parseCurrencySafe(rawValor);
    const serie = cells[serieIdx] || '1';
    const cliente = cells[clienteIdx] || 'CLIENTES DIVERSOS';

    if (erpRecordsMap.has(notaNum)) {
      const existing = erpRecordsMap.get(notaNum)!;
      existing.valor = Number((existing.valor + valor).toFixed(2));
      
      // Update with non-default/valid info if available
      if (!existing.dataEmissao && dataEmissao) {
        existing.dataEmissao = dataEmissao;
      }
      if ((existing.cliente === 'CLIENTES DIVERSOS' || !existing.cliente) && cliente && cliente !== 'CLIENTES DIVERSOS') {
        existing.cliente = cliente;
      }
      if ((existing.serie === '1' || !existing.serie) && serie && serie !== '1') {
        existing.serie = serie;
      }
      existing.linhaOriginal += '\n' + line;
    } else {
      erpRecordsMap.set(notaNum, {
        nota: notaNum,
        dataEmissao,
        valor,
        serie,
        cliente,
        linhaOriginal: line
      });
    }
  }

  return Array.from(erpRecordsMap.values());
}

/**
 * Execute bilateral data audit between SEFAZ and ERP databases.
 */
export function executeDataAudit(sefazRows: InvoiceRow[], erpText: string): { items: AuditItem[]; summary: AuditSummary } {
  // Map SEFAZ records
  const sefazMap = new Map<number, InvoiceRow>();
  sefazRows.forEach(row => {
    // Sanitary cleanup of note number
    const num = parseInt(row.numeroNota.replace(/\D/g, ''), 10);
    if (!Number.isNaN(num)) {
      sefazMap.set(num, row);
    }
  });

  // Map ERP records
  const erpMap = new Map<number, ErpRecord>();
  const erpRecords = parseErpReport(erpText);
  erpRecords.forEach(rec => {
    erpMap.set(rec.nota, rec);
  });

  const allNotes = [...sefazMap.keys(), ...erpMap.keys()];
  if (allNotes.length === 0) {
    return {
      items: [],
      summary: {
        totalSefaz: 0,
        totalErp: 0,
        sincronizadas: 0,
        faltantesErp: 0,
        naoConstamSefaz: 0,
        saltosSequencia: 0,
        minNota: 0,
        maxNota: 0
      }
    };
  }

  const minNota = Math.min(...allNotes);
  const maxNota = Math.max(...allNotes);

  const items: AuditItem[] = [];
  let sincronizadas = 0;
  let faltantesErp = 0;
  let naoConstamSefaz = 0;
  let saltosSequencia = 0;

  for (let n = minNota; n <= maxNota; n++) {
    const hasSefaz = sefazMap.has(n);
    const hasErp = erpMap.has(n);

    if (hasSefaz && hasErp) {
      const sefaz = sefazMap.get(n)!;
      const erp = erpMap.get(n)!;
      sincronizadas++;
      items.push({
        nota: n,
        status: 'OK',
        sefazValue: sefaz.valorDecimal,
        erpValue: erp.valor,
        sefazDate: sefaz.dataEmissao,
        erpDate: erp.dataEmissao,
        chaveDeAcesso: sefaz.chaveDeAcesso,
        cliente: erp.cliente,
        serie: sefaz.serie || erp.serie
      });
    } else if (hasSefaz) {
      const sefaz = sefazMap.get(n)!;
      faltantesErp++;
      items.push({
        nota: n,
        status: 'FALTANTE_ERP',
        sefazValue: sefaz.valorDecimal,
        sefazDate: sefaz.dataEmissao,
        chaveDeAcesso: sefaz.chaveDeAcesso,
        serie: sefaz.serie
      });
    } else if (hasErp) {
      const erp = erpMap.get(n)!;
      naoConstamSefaz++;
      items.push({
        nota: n,
        status: 'NAO_CONSTA_SEFAZ',
        erpValue: erp.valor,
        erpDate: erp.dataEmissao,
        cliente: erp.cliente,
        serie: erp.serie
      });
    } else {
      saltosSequencia++;
      items.push({
        nota: n,
        status: 'SALTO_SEQUENCIA'
      });
    }
  }

  const summary: AuditSummary = {
    totalSefaz: sefazMap.size,
    totalErp: erpMap.size,
    sincronizadas,
    faltantesErp,
    naoConstamSefaz,
    saltosSequencia,
    minNota,
    maxNota
  };

  return { items, summary };
}

/**
 * Generate beautifully styled Excel report containing Divergences and Gaps sheets.
 */
export function exportAuditExcel(items: AuditItem[], summary: AuditSummary): void {
  const exportDate = `${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  
  // Create workbook
  const wb = XLSX.utils.book_new();

  // STYLES (Navy #04243B & Gold #E4B35E)
  const styleHeaderTitle = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 14, bold: true, color: { rgb: "E4B35E" } },
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
  
  const styleTableHeaderCenter = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "medium", color: { rgb: "04243B" } },
      bottom: { style: "medium", color: { rgb: "E4B35E" } }
    }
  };
  const styleTableHeaderLeft = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "medium", color: { rgb: "04243B" } },
      bottom: { style: "medium", color: { rgb: "E4B35E" } }
    }
  };
  const styleTableHeaderRight = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "right", vertical: "center" },
    border: {
      top: { style: "medium", color: { rgb: "04243B" } },
      bottom: { style: "medium", color: { rgb: "E4B35E" } }
    }
  };

  const getRowStyle = (isEven: boolean, align: 'left' | 'center' | 'right', bold = false, textColor = "1E293B") => ({
    fill: { fgColor: { rgb: isEven ? "FFFFFF" : "F8FAFC" } },
    font: { name: "Arial", sz: 9, bold, color: { rgb: textColor } },
    alignment: { horizontal: align, vertical: "center" },
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "F1F5F9" } },
      right: { style: "thin", color: { rgb: "F1F5F9" } }
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OK': return '059669'; // Emerald
      case 'FALTANTE_ERP': return 'DC2626'; // Red
      case 'NAO_CONSTA_SEFAZ': return 'D97706'; // Yellow/Amber
      case 'SALTO_SEQUENCIA': return 'EA580C'; // Orange
      default: return '1E293B';
    }
  };

  // --- SHEET 1: DIVERGÊNCIAS ---
  const wsDiv: any = {};
  let currentDivRow = 0;
  const divMerges: any[] = [];
  const divHeights: any[] = [];

  const writeDivCell = (r: number, c: number, val: any, type: 's' | 'n', style: any = {}, format: string = '') => {
    const ref = XLSX.utils.encode_cell({ r, c });
    wsDiv[ref] = { v: val, t: type, s: style };
    if (format) wsDiv[ref].z = format;
  };

  // Row 0: Company Banner
  for (let c = 0; c <= 7; c++) {
    writeDivCell(currentDivRow, c, c === 0 ? "MOREIRA & LIMA CONTADORES ASSOCIADOS" : '', 's', c === 0 ? styleHeaderTitle : styleHeaderBannerBase);
  }
  divMerges.push({ s: { r: currentDivRow, c: 0 }, e: { r: currentDivRow, c: 7 } });
  divHeights.push({ hpt: 26 });
  currentDivRow++;

  // Row 1: Subtitle Banner
  for (let c = 0; c <= 7; c++) {
    writeDivCell(currentDivRow, c, c === 0 ? `AUDITORIA DE DIVERGÊNCIAS - EMISSÃO: ${exportDate}` : '', 's', c === 0 ? styleHeaderSub : styleHeaderBannerBase);
  }
  divMerges.push({ s: { r: currentDivRow, c: 0 }, e: { r: currentDivRow, c: 7 } });
  divHeights.push({ hpt: 18 });
  currentDivRow++;

  // Spacer row
  divHeights.push({ hpt: 12 });
  currentDivRow++;

  // Summary Metrics Rows
  const styleSummaryLabel = { font: { name: "Arial", sz: 9, bold: true, color: { rgb: "475569" } }, alignment: { horizontal: "right" } };
  const styleSummaryValue = { font: { name: "Arial", sz: 9.5, bold: true, color: { rgb: "0F172A" } }, alignment: { horizontal: "left" } };

  writeDivCell(currentDivRow, 0, "Notas na SEFAZ:", 's', styleSummaryLabel);
  writeDivCell(currentDivRow, 1, summary.totalSefaz, 'n', styleSummaryValue);
  writeDivCell(currentDivRow, 3, "Sincronizadas (OK):", 's', styleSummaryLabel);
  writeDivCell(currentDivRow, 4, summary.sincronizadas, 'n', styleSummaryValue);
  divHeights.push({ hpt: 16 });
  currentDivRow++;

  writeDivCell(currentDivRow, 0, "Notas no ERP:", 's', styleSummaryLabel);
  writeDivCell(currentDivRow, 1, summary.totalErp, 'n', styleSummaryValue);
  writeDivCell(currentDivRow, 3, "Faltantes no ERP:", 's', styleSummaryLabel);
  writeDivCell(currentDivRow, 4, summary.faltantesErp, 'n', styleSummaryValue);
  divHeights.push({ hpt: 16 });
  currentDivRow++;

  writeDivCell(currentDivRow, 3, "Não Constam na SEFAZ:", 's', styleSummaryLabel);
  writeDivCell(currentDivRow, 4, summary.naoConstamSefaz, 'n', styleSummaryValue);
  divHeights.push({ hpt: 16 });
  currentDivRow++;

  // Spacer row
  divHeights.push({ hpt: 12 });
  currentDivRow++;

  // Headers for Divergences table
  const divHeaders = [
    'Documento (Nota)', 
    'Série', 
    'Status de Auditoria', 
    'Valor SEFAZ', 
    'Valor ERP', 
    'Data SEFAZ', 
    'Data ERP', 
    'Chave de Acesso / Info'
  ];
  divHeaders.forEach((h, c) => {
    const alignStyle = (c === 3 || c === 4) ? styleTableHeaderRight : ((c === 2 || c === 7) ? styleTableHeaderLeft : styleTableHeaderCenter);
    writeDivCell(currentDivRow, c, h, 's', alignStyle);
  });
  divHeights.push({ hpt: 24 });
  currentDivRow++;

  // Filter items that actually need adjustment (not OK and not SALTO_SEQUENCIA)
  const divergences = items.filter(item => item.status === 'FALTANTE_ERP' || item.status === 'NAO_CONSTA_SEFAZ');

  if (divergences.length === 0) {
    writeDivCell(currentDivRow, 0, "Nenhuma divergência de faturamento encontrada no lote analisado.", 's', getRowStyle(true, 'left', true, "059669"));
    divMerges.push({ s: { r: currentDivRow, c: 0 }, e: { r: currentDivRow, c: 7 } });
    divHeights.push({ hpt: 20 });
    currentDivRow++;
  } else {
    divergences.forEach((r, idx) => {
      const isEven = idx % 2 === 0;
      const statusText = r.status === 'FALTANTE_ERP' ? 'FALTANTE NO ERP' : 'NÃO CONSTA NA SEFAZ';
      const statusColor = getStatusColor(r.status);

      writeDivCell(currentDivRow, 0, r.nota, 'n', getRowStyle(isEven, 'center', true));
      writeDivCell(currentDivRow, 1, r.serie || '1', 's', getRowStyle(isEven, 'center'));
      writeDivCell(currentDivRow, 2, statusText, 's', getRowStyle(isEven, 'left', true, statusColor));
      writeDivCell(currentDivRow, 3, r.sefazValue ?? 0, 'n', getRowStyle(isEven, 'right', false, r.sefazValue !== undefined ? "1E293B" : "94A3B8"), '"R$ " #,##0.00');
      writeDivCell(currentDivRow, 4, r.erpValue ?? 0, 'n', getRowStyle(isEven, 'right', false, r.erpValue !== undefined ? "1E293B" : "94A3B8"), '"R$ " #,##0.00');
      writeDivCell(currentDivRow, 5, r.sefazDate || '-', 's', getRowStyle(isEven, 'center'));
      writeDivCell(currentDivRow, 6, r.erpDate || '-', 's', getRowStyle(isEven, 'center'));
      writeDivCell(currentDivRow, 7, r.chaveDeAcesso || r.cliente || '-', 's', getRowStyle(isEven, 'left'));

      divHeights.push({ hpt: 20 });
      currentDivRow++;
    });
  }

  wsDiv['!merges'] = divMerges;
  wsDiv['!rows'] = divHeights;
  wsDiv['!cols'] = [
    { wch: 18 }, // Nota
    { wch: 10 }, // Série
    { wch: 26 }, // Status
    { wch: 18 }, // Valor SEFAZ
    { wch: 18 }, // Valor ERP
    { wch: 15 }, // Data SEFAZ
    { wch: 15 }, // Data ERP
    { wch: 50 }, // Chave / Info
  ];
  wsDiv['!views'] = [{ showGridLines: false }];
  wsDiv['!ref'] = `A1:${XLSX.utils.encode_cell({ r: currentDivRow - 1, c: 7 })}`;


  // --- SHEET 2: SALTOS DE SEQUÊNCIA ---
  const wsGap: any = {};
  let currentGapRow = 0;
  const gapMerges: any[] = [];
  const gapHeights: any[] = [];

  const writeGapCell = (r: number, c: number, val: any, type: 's' | 'n', style: any = {}) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    wsGap[ref] = { v: val, t: type, s: style };
  };

  // Row 0: Company Banner
  for (let c = 0; c <= 3; c++) {
    writeGapCell(currentGapRow, c, c === 0 ? "MOREIRA & LIMA CONTADORES ASSOCIADOS" : '', 's', c === 0 ? styleHeaderTitle : styleHeaderBannerBase);
  }
  gapMerges.push({ s: { r: currentGapRow, c: 0 }, e: { r: currentGapRow, c: 3 } });
  gapHeights.push({ hpt: 26 });
  currentGapRow++;

  // Row 1: Subtitle Banner
  for (let c = 0; c <= 3; c++) {
    writeGapCell(currentGapRow, c, c === 0 ? "RELATÓRIO DE SALTOS DE SEQUÊNCIA (PARA INUTILIZAÇÃO)" : '', 's', c === 0 ? styleHeaderSub : styleHeaderBannerBase);
  }
  gapMerges.push({ s: { r: currentGapRow, c: 0 }, e: { r: currentGapRow, c: 3 } });
  gapHeights.push({ hpt: 18 });
  currentGapRow++;

  // Spacer row
  gapHeights.push({ hpt: 12 });
  currentGapRow++;

  // Summary Metrics Rows
  writeGapCell(currentGapRow, 0, "Numeração Inicial:", 's', styleSummaryLabel);
  writeGapCell(currentGapRow, 1, summary.minNota, 'n', styleSummaryValue);
  writeGapCell(currentGapRow, 2, "Total de Saltos:", 's', styleSummaryLabel);
  writeGapCell(currentGapRow, 3, summary.saltosSequencia, 'n', styleSummaryValue);
  gapHeights.push({ hpt: 16 });
  currentGapRow++;

  writeGapCell(currentGapRow, 0, "Numeração Final:", 's', styleSummaryLabel);
  writeGapCell(currentGapRow, 1, summary.maxNota, 'n', styleSummaryValue);
  gapHeights.push({ hpt: 16 });
  currentGapRow++;

  // Spacer row
  gapHeights.push({ hpt: 12 });
  currentGapRow++;

  // Table Headers
  const gapHeaders = ['Número Ausente', 'Série Presumida', 'Status de Auditoria', 'Ação Corretiva Recomendada'];
  gapHeaders.forEach((h, c) => {
    writeGapCell(currentGapRow, c, h, 's', c === 3 ? styleTableHeaderLeft : styleTableHeaderCenter);
  });
  gapHeights.push({ hpt: 24 });
  currentGapRow++;

  const sequenceGaps = items.filter(item => item.status === 'SALTO_SEQUENCIA');

  if (sequenceGaps.length === 0) {
    writeGapCell(currentGapRow, 0, "Nenhum salto de sequência detectado na numeração analisada.", 's', getRowStyle(true, 'left', true, "059669"));
    gapMerges.push({ s: { r: currentGapRow, c: 0 }, e: { r: currentGapRow, c: 3 } });
    gapHeights.push({ hpt: 20 });
    currentGapRow++;
  } else {
    sequenceGaps.forEach((r, idx) => {
      const isEven = idx % 2 === 0;
      writeGapCell(currentGapRow, 0, r.nota, 'n', getRowStyle(isEven, 'center', true));
      writeGapCell(currentGapRow, 1, "1", 's', getRowStyle(isEven, 'center'));
      writeGapCell(currentGapRow, 2, "SALTO DE SEQUÊNCIA", 's', getRowStyle(isEven, 'center', true, "EA580C"));
      writeGapCell(currentGapRow, 3, "Avaliar necessidade de Inutilização de Número na SEFAZ", 's', getRowStyle(isEven, 'left'));

      gapHeights.push({ hpt: 20 });
      currentGapRow++;
    });
  }

  wsGap['!merges'] = gapMerges;
  wsGap['!rows'] = gapHeights;
  wsGap['!cols'] = [
    { wch: 18 }, // Número Ausente
    { wch: 16 }, // Série Presumida
    { wch: 24 }, // Status
    { wch: 45 }, // Recomendação
  ];
  wsGap['!views'] = [{ showGridLines: false }];
  wsGap['!ref'] = `A1:${XLSX.utils.encode_cell({ r: currentGapRow - 1, c: 3 })}`;

  // Append sheets
  XLSX.utils.book_append_sheet(wb, wsDiv, 'Divergências');
  XLSX.utils.book_append_sheet(wb, wsGap, 'Saltos de Sequência');

  // Trigger download
  XLSX.writeFile(wb, `Auditoria_Faturamento_${new Date().toISOString().slice(0,10)}.xlsx`);
}
