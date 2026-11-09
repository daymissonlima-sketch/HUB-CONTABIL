import XLSX from 'xlsx-js-style';
import { DebtItem, ClientInfo, DebtSimulationLink, DebtCustomGroup } from '../types_debits';
import { NFeItemRow } from '../types';
import { sortDebtsByCompetencia } from './debtParser';

import { ALL_COLUMNS, ColumnDefinition } from '../components/NfeGrid';
import { isSupplierEligibleForDecreto29560 } from './decreto29560Helper';

// Helper to convert 0-indexed column number to Excel column letters (A, B, ..., Z, AA, AB, ...)
function colIndexToLetter(colIdx: number): string {
  let temp = colIdx;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// Helper to parse date string (DD/MM/YYYY or YYYY-MM-DD) into timestamp
function parseDateToTime(dateStr: string): number {
  if (!dateStr) return 0;
  try {
    const clean = dateStr.trim();
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
      }
    } else if (clean.includes('-')) {
      return new Date(clean).getTime();
    }
  } catch (e) {
    return 0;
  }
  return 0;
}

// Helper to consolidate items by unique product (cProd or xProd), keeping only the latest billed invoice
export function getLatestBilledRowsPerProduct(rows: NFeItemRow[]): NFeItemRow[] {
  const productMap = new Map<string, { row: NFeItemRow; dateTime: number; nNfNum: number }>();

  rows.forEach(row => {
    const prodKey = (row.cProd && row.cProd.trim() !== '') 
      ? `cprod:${row.cProd.trim().toLowerCase()}` 
      : `xprod:${(row.xProd || '').trim().toLowerCase()}`;

    const dateTime = parseDateToTime(row.dhEmi);
    const nNfNum = parseInt(String(row.nNF || '').replace(/\D/g, ''), 10) || 0;

    const existing = productMap.get(prodKey);
    if (!existing) {
      productMap.set(prodKey, { row, dateTime, nNfNum });
    } else {
      // If newer emission date, or same date but higher NF number, replace with newer
      if (dateTime > existing.dateTime || (dateTime === existing.dateTime && nNfNum > existing.nNfNum)) {
        productMap.set(prodKey, { row, dateTime, nNfNum });
      }
    }
  });

  return Array.from(productMap.values()).map(v => v.row);
}

// Internal builder to create a fully styled worksheet for a given dataset of rows
function buildAuditedNfeWorksheet(
  rows: NFeItemRow[],
  activeCols: ColumnDefinition[],
  sheetTitle: string,
  badgeText: string,
  decreto29560Enabled: boolean = false,
  decretoSuppliers: string[] = []
) {
  const ws: any = {};
  const merges: any[] = [];
  const rowHeights: any[] = [];
  const totalCols = activeCols.length;
  const maxBannerCol = Math.max(totalCols - 1, 5);

  const getCellRef = (r: number, c: number) => `${colIndexToLetter(c)}${r + 1}`;

  const writeCell = (
    r: number,
    c: number,
    val: any,
    type: 's' | 'n',
    style: any = {},
    format: string = ''
  ) => {
    const ref = getCellRef(r, c);
    ws[ref] = { v: val ?? '', t: type, s: style };
    if (format) ws[ref].z = format;
  };

  // Corporate Moreira & Lima Banner Styles
  const styleBannerMain = {
    fill: { fgColor: { rgb: '04243B' } },
    font: { name: 'Arial', sz: 15, bold: true, color: { rgb: 'E4B35E' } },
    alignment: { horizontal: 'left', vertical: 'center' }
  };

  const styleBannerSub = {
    fill: { fgColor: { rgb: '04243B' } },
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'left', vertical: 'center' }
  };

  const styleBannerMeta = {
    fill: { fgColor: { rgb: '063354' } },
    font: { name: 'Arial', sz: 9.5, bold: false, color: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      bottom: { style: 'medium', color: { rgb: 'E4B35E' } }
    }
  };

  // Category Group Super-Header themes (Corporate Moreira & Lima Navy & Gold harmonious palette)
  const getCategoryGroupStyle = (category: ColumnDefinition['category']) => {
    // Cohesive, elegant executive palette anchored in Navy #04243B, Slate, and Gold #E4B35E accents
    let bg = '04243B';
    let fg = 'FFFFFF';
    let accent = 'E4B35E';

    switch (category) {
      case 'Identificação':
        bg = '04243B'; // Navy Institucional
        fg = 'E4B35E'; // Ouro
        accent = 'E4B35E';
        break;
      case 'Dados do Item':
        bg = '1E293B'; // Slate 800
        fg = 'FFFFFF';
        accent = '94A3B8';
        break;
      case 'ICMS Normal':
        bg = '0F3756'; // Navy suave / azul petróleo
        fg = 'FFFFFF';
        accent = '38BDF8';
        break;
      case 'ICMS ST':
        bg = '184A6E'; // Azul profundo corporativo
        fg = 'FFFFFF';
        accent = '60A5FA';
        break;
      case 'ICMS ST Decreto 29.560':
        bg = '78350F'; // Âmbar café corporativo refinado
        fg = 'E4B35E'; // Dourado
        accent = 'F59E0B';
        break;
      case 'FECOP':
        bg = '134E4A'; // Teal corporativo sóbrio
        fg = 'FFFFFF';
        accent = '5EEAD4';
        break;
      case 'IPI':
        bg = '312E81'; // Índigo profundo institucional
        fg = 'FFFFFF';
        accent = 'A5B4FC';
        break;
      case 'PIS / COFINS':
        bg = '1E3A8A'; // Azul marinho escuro
        fg = 'FFFFFF';
        accent = '93C5FD';
        break;
      case 'IBS / CBS':
        bg = '064E3B'; // Verde floresta profundo elegante
        fg = 'FFFFFF';
        accent = '6EE7B7';
        break;
      case 'Informações Complementares':
        bg = '78350F'; // Âmbar café corporativo
        fg = 'FFFFFF';
        accent = 'FCD34D';
        break;
    }

    return {
      superHeader: {
        fill: { fgColor: { rgb: bg } },
        font: { name: 'Arial', sz: 10, bold: true, color: { rgb: fg } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'medium', color: { rgb: accent } },
          bottom: { style: 'thin', color: { rgb: accent } },
          left: { style: 'thin', color: { rgb: '334155' } },
          right: { style: 'thin', color: { rgb: '334155' } }
        }
      },
      colHeader: {
        fill: { fgColor: { rgb: '04243B' } },
        font: { name: 'Arial', sz: 9.5, bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: {
          top: { style: 'thin', color: { rgb: accent } },
          bottom: { style: 'medium', color: { rgb: accent } },
          left: { style: 'thin', color: { rgb: '1E293B' } },
          right: { style: 'thin', color: { rgb: '1E293B' } }
        }
      }
    };
  };

  let currentRow = 0;

  // Row 0: Corporate Brand Title
  for (let c = 0; c <= maxBannerCol; c++) {
    writeCell(currentRow, c, c === 0 ? '   MOREIRA & LIMA — CONTADORES ASSOCIADOS' : '', 's', styleBannerMain);
  }
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: maxBannerCol } });
  rowHeights.push({ hpt: 28 });
  currentRow++;

  // Row 1: Report Title
  for (let c = 0; c <= maxBannerCol; c++) {
    writeCell(
      currentRow,
      c,
      c === 0 ? `   AUDITORIA DIGITAL DE DOCUMENTOS FISCAIS (NF-e / NFC-e) — ${sheetTitle.toUpperCase()}` : '',
      's',
      styleBannerSub
    );
  }
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: maxBannerCol } });
  rowHeights.push({ hpt: 20 });
  currentRow++;

  // Row 2: Metadata Info
  const dateStr = `${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const uniqueNfCount = new Set(rows.map(r => r.chNFe || r.nNF)).size;
  const metaText = `   Emissão: ${dateStr}   |   ${badgeText}   |   Documentos: ${uniqueNfCount}   |   Itens: ${rows.length}   |   Colunas: ${activeCols.length}`;
  for (let c = 0; c <= maxBannerCol; c++) {
    writeCell(currentRow, c, c === 0 ? metaText : '', 's', styleBannerMeta);
  }
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: maxBannerCol } });
  rowHeights.push({ hpt: 20 });
  currentRow++;

  // Row 3: Blank separator row
  rowHeights.push({ hpt: 10 });
  currentRow++;

  // Row 4: Group Super-Headers (ICMS Normal, ICMS ST, FECOP, IPI, PIS / COFINS, IBS / CBS, etc.)
  let groupStartIdx = 0;
  while (groupStartIdx < activeCols.length) {
    const currentCategory = activeCols[groupStartIdx].category;
    let groupEndIdx = groupStartIdx;
    while (
      groupEndIdx + 1 < activeCols.length &&
      activeCols[groupEndIdx + 1].category === currentCategory
    ) {
      groupEndIdx++;
    }

    const { superHeader } = getCategoryGroupStyle(currentCategory);
    for (let c = groupStartIdx; c <= groupEndIdx; c++) {
      writeCell(
        currentRow,
        c,
        c === groupStartIdx ? currentCategory.toUpperCase() : '',
        's',
        superHeader
      );
    }

    if (groupEndIdx > groupStartIdx) {
      merges.push({
        s: { r: currentRow, c: groupStartIdx },
        e: { r: currentRow, c: groupEndIdx }
      });
    }

    groupStartIdx = groupEndIdx + 1;
  }
  rowHeights.push({ hpt: 24 });
  currentRow++;

  // Row 5: Individual Column Headers
  activeCols.forEach((col, colIdx) => {
    const { colHeader } = getCategoryGroupStyle(col.category);
    writeCell(currentRow, colIdx, col.label, 's', colHeader);
  });
  rowHeights.push({ hpt: 26 });
  currentRow++;

  // Helper to classify field formatting
  const isCurrencyField = (key: keyof NFeItemRow) =>
    key === 'vUnCom' ||
    key === 'vProd' ||
    key.startsWith('vBC') ||
    key === 'vICMS' ||
    key === 'vICMSST' ||
    key === 'vICMSST_29560' ||
    key === 'vFCP' ||
    key === 'vFCPST' ||
    key === 'vIPI' ||
    key === 'vPIS' ||
    key === 'vCOFINS' ||
    key === 'vIBSUF' ||
    key === 'vIBSMun' ||
    key === 'vIBS' ||
    key === 'vCBS';

  const isPercentField = (key: keyof NFeItemRow) => key.startsWith('p');
  const isQuantityField = (key: keyof NFeItemRow) => key === 'qCom';
  const isTextLeftField = (key: keyof NFeItemRow) =>
    key === 'xProd' ||
    key === 'emitNome' ||
    key === 'destNome' ||
    key === 'infAdic' ||
    key === 'infAdFisco';

  // Track totals for footer row
  const columnTotals: Record<string, number> = {};
  activeCols.forEach(col => {
    if (isCurrencyField(col.key) || isQuantityField(col.key)) {
      columnTotals[col.key as string] = 0;
    }
  });

  // Render Data Rows
  rows.forEach((row, rowIdx) => {
    const isEven = rowIdx % 2 === 0;
    const baseRowBg = isEven ? 'FFFFFF' : 'F8FAFC';

    activeCols.forEach((col, colIdx) => {
      const rawVal = row[col.key];
      const isGroupEnd =
        colIdx === activeCols.length - 1 ||
        activeCols[colIdx + 1].category !== col.category;

      // Clean, professional neutral alternating zebra pattern (white / slate-50) across all columns
      const cellBg = isEven ? 'FFFFFF' : 'F8FAFC';

      const borderStyle = {
        bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
        left: { style: 'thin', color: { rgb: 'E2E8F0' } },
        right: isGroupEnd
          ? { style: 'medium', color: { rgb: '94A3B8' } }
          : { style: 'thin', color: { rgb: 'E2E8F0' } }
      };

      // Alignment: From column I (index >= 8) onwards, user requested centering in the middle of the cell.
      // If it's a left-aligned text field (like observations), keep left; otherwise center!
      const shouldCenterMiddle = colIdx >= 8 || (!isTextLeftField(col.key) && col.key !== 'chNFe');
      const horizAlign = isTextLeftField(col.key) ? 'left' : (shouldCenterMiddle ? 'center' : 'left');

      // Font color: Strong dark #0F172A (NEVER light grey #94A3B8)
      const primaryTextColor = '0F172A';

      // Check if this column belongs to ICMS ST Decreto 29.560 and if this supplier is eligible
      const isDecretoCol = col.key === 'vBC_ST_29560' || col.key === 'pICMSST_29560' || col.key === 'vICMSST_29560';
      const isEligibleDecreto = decreto29560Enabled && isSupplierEligibleForDecreto29560(row.emitNome, decretoSuppliers);

      if (isDecretoCol && !isEligibleDecreto) {
        writeCell(
          currentRow,
          colIdx,
          '-',
          's',
          {
            fill: { fgColor: { rgb: cellBg } },
            font: { name: 'Arial', sz: 9.5, bold: false, color: { rgb: '94A3B8' } },
            alignment: { horizontal: horizAlign, vertical: 'center' },
            border: borderStyle
          }
        );
        return;
      }

      if (isCurrencyField(col.key)) {
        const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal || 0)) || 0;
        if (col.key !== 'vUnCom') {
          columnTotals[col.key as string] = (columnTotals[col.key as string] || 0) + numVal;
        }
        const isBoldValue =
          col.key === 'vProd' ||
          col.key === 'vICMS' ||
          col.key === 'vICMSST' ||
          col.key === 'vICMSST_29560' ||
          col.key === 'vFCP' ||
          col.key === 'vFCPST' ||
          col.key === 'vIPI' ||
          col.key === 'vPIS' ||
          col.key === 'vCOFINS' ||
          col.key === 'vIBS' ||
          col.key === 'vCBS';

        writeCell(
          currentRow,
          colIdx,
          numVal,
          'n',
          {
            fill: { fgColor: { rgb: cellBg } },
            font: {
              name: 'Arial',
              sz: 9.5,
              bold: isBoldValue,
              color: { rgb: primaryTextColor } // Strong dark color for all values including R$ 0,00
            },
            alignment: { horizontal: horizAlign, vertical: 'center' },
            border: borderStyle
          },
          '"R$ " #,##0.00'
        );
      } else if (isPercentField(col.key)) {
        const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal || 0)) || 0;
        writeCell(
          currentRow,
          colIdx,
          numVal,
          'n',
          {
            fill: { fgColor: { rgb: cellBg } },
            font: {
              name: 'Arial',
              sz: 9.5,
              bold: false,
              color: { rgb: primaryTextColor } // Strong dark color for all percentages including 0,00%
            },
            alignment: { horizontal: horizAlign, vertical: 'center' },
            border: borderStyle
          },
          '0.00"%"'
        );
      } else if (isQuantityField(col.key)) {
        const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal || 0)) || 0;
        columnTotals[col.key as string] = (columnTotals[col.key as string] || 0) + numVal;
        writeCell(
          currentRow,
          colIdx,
          numVal,
          'n',
          {
            fill: { fgColor: { rgb: cellBg } },
            font: { name: 'Arial', sz: 9.5, bold: true, color: { rgb: primaryTextColor } },
            alignment: { horizontal: horizAlign, vertical: 'center' },
            border: borderStyle
          },
          '#,##0.00'
        );
      } else {
        const strVal = rawVal !== undefined && rawVal !== null && rawVal !== '' ? String(rawVal) : '-';
        writeCell(
          currentRow,
          colIdx,
          strVal,
          's',
          {
            fill: { fgColor: { rgb: cellBg } },
            font: {
              name: 'Arial',
              sz: 9.5,
              bold: col.key === 'nNF' || col.key === 'xProd',
              color: { rgb: primaryTextColor }
            },
            alignment: { horizontal: horizAlign, vertical: 'center' },
            border: borderStyle
          }
        );
      }
    });

    rowHeights.push({ hpt: 20 });
    currentRow++;
  });

  // Footer Row: TOTAL GERAL CONSOLIDADO
  if (rows.length > 0) {
    activeCols.forEach((col, colIdx) => {
      const isGroupEnd =
        colIdx === activeCols.length - 1 ||
        activeCols[colIdx + 1].category !== col.category;

      const footerBorder = {
        top: { style: 'medium', color: { rgb: 'E4B35E' } },
        bottom: { style: 'medium', color: { rgb: '04243B' } },
        left: { style: 'thin', color: { rgb: '1E293B' } },
        right: isGroupEnd
          ? { style: 'medium', color: { rgb: 'E4B35E' } }
          : { style: 'thin', color: { rgb: '1E293B' } }
      };

      if (colIdx === 0) {
        writeCell(
          currentRow,
          colIdx,
          'TOTAL GERAL CONSOLIDADO',
          's',
          {
            fill: { fgColor: { rgb: '04243B' } },
            font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'E4B35E' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: footerBorder
          }
        );
      } else if (isCurrencyField(col.key) && col.key !== 'vUnCom') {
        const sumVal = columnTotals[col.key as string] || 0;
        const horizAlign = colIdx >= 8 ? 'center' : 'right';
        writeCell(
          currentRow,
          colIdx,
          sumVal,
          'n',
          {
            fill: { fgColor: { rgb: '04243B' } },
            font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'E4B35E' } },
            alignment: { horizontal: horizAlign, vertical: 'center' },
            border: footerBorder
          },
          '"R$ " #,##0.00'
        );
      } else if (isQuantityField(col.key)) {
        const sumQty = columnTotals[col.key as string] || 0;
        const horizAlign = colIdx >= 8 ? 'center' : 'right';
        writeCell(
          currentRow,
          colIdx,
          sumQty,
          'n',
          {
            fill: { fgColor: { rgb: '04243B' } },
            font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: horizAlign, vertical: 'center' },
            border: footerBorder
          },
          '#,##0.00'
        );
      } else {
        writeCell(
          currentRow,
          colIdx,
          '',
          's',
          {
            fill: { fgColor: { rgb: '04243B' } },
            font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: footerBorder
          }
        );
      }
    });
    rowHeights.push({ hpt: 25 });
    currentRow++;
  }

  // Configure optimal column widths based on column type
  ws['!cols'] = activeCols.map(col => {
    if (col.key === 'chNFe') return { wch: 48 };
    if (col.key === 'xProd' || col.key === 'emitNome' || col.key === 'destNome') return { wch: 36 };
    if (col.key === 'infAdic' || col.key === 'infAdFisco') return { wch: 45 };
    if (col.key === 'emitCNPJ' || col.key === 'destCNPJ') return { wch: 20 };
    if (isCurrencyField(col.key)) return { wch: 18 };
    if (isPercentField(col.key)) return { wch: 16 };
    if (col.key === 'dhEmi' || col.key === 'nNF' || col.key === 'cProd') return { wch: 14 };
    return { wch: 12 };
  });

  ws['!merges'] = merges;
  ws['!rows'] = rowHeights;
  const lastColIndex = Math.max(totalCols - 1, maxBannerCol);
  ws['!ref'] = `A1:${getCellRef(currentRow - 1, lastColIndex)}`;

  return ws;
}

export function exportToExcel(
  rows: NFeItemRow[],
  visibleColumns: string[],
  reportName: string,
  includeConsolidatedLastItems: boolean = false,
  decreto29560Enabled: boolean = false,
  decretoSuppliers: string[] = []
) {
  // Order visible columns according to ALL_COLUMNS so each category group is contiguous
  const activeCols: ColumnDefinition[] = ALL_COLUMNS.filter(col => visibleColumns.includes(col.key));
  if (activeCols.length === 0) return;

  const wb = XLSX.utils.book_new();

  // 1. Aba 1: Histórico Completo de Notas (todas as notas e itens)
  const wsFull = buildAuditedNfeWorksheet(
    rows,
    activeCols,
    reportName || 'Histórico Completo de Notas',
    'Aba: Histórico Completo',
    decreto29560Enabled,
    decretoSuppliers
  );
  XLSX.utils.book_append_sheet(wb, wsFull, 'Histórico Completo');

  // 2. Aba 2 (Opcional): Nova aba consolidada trazendo apenas o último faturamento de cada produto
  if (includeConsolidatedLastItems) {
    const consolidatedRows = getLatestBilledRowsPerProduct(rows);
    const wsConsolidated = buildAuditedNfeWorksheet(
      consolidatedRows,
      activeCols,
      `${reportName || 'Auditoria'} (Última Nota por Produto)`,
      'Aba: Consolidado (Última Nota Faturada)',
      decreto29560Enabled,
      decretoSuppliers
    );
    XLSX.utils.book_append_sheet(wb, wsConsolidated, 'Última Nota por Produto');
  }

  const safeReportName = (reportName || 'Auditoria_NFe').replace(/\s+/g, '_');
  const filename = `Relatorio_NFe_${safeReportName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportDebtsToExcel(
  clientInfo: ClientInfo, 
  debts: DebtItem[],
  linkedSimulations: Record<string, DebtSimulationLink> = {},
  customGroups: DebtCustomGroup[] = []
) {
  const ws: any = {};
  let currentRow = 0;
  const merges: any[] = [];
  const rowHeights: any[] = [];

  // Helper to convert row/col to A1
  const getCellRef = (r: number, c: number) => {
    const colLetter = String.fromCharCode(65 + c);
    return `${colLetter}${r + 1}`;
  };

  const writeCell = (
    r: number, 
    c: number, 
    val: any, 
    type: 's' | 'n', 
    style: any = {}, 
    format: string = ''
  ) => {
    const ref = getCellRef(r, c);
    ws[ref] = { v: val, t: type, s: style };
    if (format) ws[ref].z = format;
  };

  // Helper to format currency in Real (BRL)
  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  // Common Styles (Corporate Blue #04243B & Gold #E4B35E)
  const styleHeaderTitle = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 16, bold: true, color: { rgb: "E4B35E" } },
    alignment: { horizontal: "center", vertical: "center" }
  };

  const styleHeaderSub = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 9, bold: true, color: { rgb: "E4B35E" } },
    alignment: { horizontal: "center", vertical: "center" }
  };

  const styleHeaderTitleLabel = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" }
  };

  const styleClientLabel = {
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "04243B" } },
    alignment: { horizontal: "left", vertical: "center" }
  };

  const styleClientValue = {
    font: { name: "Arial", sz: 10, color: { rgb: "1E293B" } },
    alignment: { horizontal: "left", vertical: "center" }
  };

  const styleTableHeader = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      bottom: { style: "medium", color: { rgb: "E4B35E" } }
    }
  };

  const styleGroupBanner = {
    fill: { fgColor: { rgb: "FDE68A" } }, // Amber-200
    font: { name: "Arial", sz: 12, bold: true, color: { rgb: "04243B" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "medium", color: { rgb: "F59E0B" } },
      bottom: { style: "medium", color: { rgb: "F59E0B" } }
    }
  };

  const styleGroupSubBanner = {
    fill: { fgColor: { rgb: "FEF3C7" } }, // Amber-100
    font: { name: "Arial", sz: 9.5, italic: true, color: { rgb: "78350F" } },
    alignment: { horizontal: "left", vertical: "center" }
  };

  const styleCategoryRibbon = {
    fill: { fgColor: { rgb: "F1F5F9" } },
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "04243B" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "CBD5E1" } },
      bottom: { style: "thin", color: { rgb: "E4B35E" } }
    }
  };

  const styleDataCellLeft = {
    font: { name: "Arial", sz: 10, color: { rgb: "1E293B" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: "F1F5F9" } } }
  };

  const styleDataCellRight = {
    font: { name: "Arial", sz: 10, color: { rgb: "1E293B" } },
    alignment: { horizontal: "right", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: "F1F5F9" } } }
  };

  const styleDataCellRightBold = {
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "1E293B" } },
    alignment: { horizontal: "right", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: "F1F5F9" } } }
  };

  const styleSubtotalLabel = {
    fill: { fgColor: { rgb: "F8FAFC" } },
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "04243B" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "E4B35E" } },
      bottom: { style: "thin", color: { rgb: "E4B35E" } }
    }
  };

  const styleSubtotalValue = {
    fill: { fgColor: { rgb: "F8FAFC" } },
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "04243B" } },
    alignment: { horizontal: "right", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "E4B35E" } },
      bottom: { style: "thin", color: { rgb: "E4B35E" } }
    }
  };

  const styleGroupTotalLabel = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 10.5, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "left", vertical: "center" }
  };

  const styleGroupTotalValue = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 10.5, bold: true, color: { rgb: "E4B35E" } },
    alignment: { horizontal: "right", vertical: "center" }
  };

  // Simulação box styles
  const styleSimHeader = {
    fill: { fgColor: { rgb: "F1F5F9" } }, // Cinza Profissional / Gelo #F1F5F9
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "001D3B" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "medium", color: { rgb: "3EA049" } },
      left: { style: "medium", color: { rgb: "3EA049" } },
      right: { style: "thin", color: { rgb: "CBD5E1" } }
    }
  };

  const styleSimRowLabel = {
    fill: { fgColor: { rgb: "F0F9FF" } },
    font: { name: "Arial", sz: 9.5, bold: true, color: { rgb: "0369A1" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      left: { style: "medium", color: { rgb: "3EA049" } },
      bottom: { style: "thin", color: { rgb: "E0F2FE" } }
    }
  };

  const styleSimRowValue = {
    fill: { fgColor: { rgb: "F0F9FF" } },
    font: { name: "Arial", sz: 9.5, bold: true, color: { rgb: "04243B" } },
    alignment: { horizontal: "right", vertical: "center" },
    border: {
      bottom: { style: "thin", color: { rgb: "E0F2FE" } },
      right: { style: "thin", color: { rgb: "BAE6FD" } }
    }
  };

  const styleGrandTotalLabel = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "left", vertical: "center" }
  };

  const styleGrandTotalValue = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "E4B35E" } },
    alignment: { horizontal: "right", vertical: "center" }
  };

  // Build Header Row 1
  writeCell(currentRow, 0, 'Moreira & Lima', 's', styleHeaderTitle);
  writeCell(currentRow, 1, '', 's', styleHeaderTitle);
  writeCell(currentRow, 2, '', 's', styleHeaderTitle);
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 2 } });
  rowHeights.push({ hpt: 26 });
  currentRow++;

  // Header Row 2
  writeCell(currentRow, 0, 'CONTADORES ASSOCIADOS', 's', styleHeaderSub);
  writeCell(currentRow, 1, '', 's', styleHeaderSub);
  writeCell(currentRow, 2, '', 's', styleHeaderSub);
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 2 } });
  rowHeights.push({ hpt: 16 });
  currentRow++;

  // Header Row 3
  writeCell(currentRow, 0, 'LEVANTAMENTO DE DÉBITOS FISCAIS & SIMULAÇÃO', 's', styleHeaderTitleLabel);
  writeCell(currentRow, 1, '', 's', styleHeaderTitleLabel);
  writeCell(currentRow, 2, '', 's', styleHeaderTitleLabel);
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 2 } });
  rowHeights.push({ hpt: 20 });
  currentRow++;

  // Gap Row
  rowHeights.push({ hpt: 10 });
  currentRow++;

  // Client Details Section
  writeCell(currentRow, 0, 'CLIENTE / RAZÃO SOCIAL:', 's', styleClientLabel);
  writeCell(currentRow, 1, clientInfo.name || 'NÃO CONFIGURADO', 's', styleClientValue);
  writeCell(currentRow, 2, '', 's', styleClientValue);
  merges.push({ s: { r: currentRow, c: 1 }, e: { r: currentRow, c: 2 } });
  rowHeights.push({ hpt: 18 });
  currentRow++;

  writeCell(currentRow, 0, 'CNPJ / CPF DO CONTRIBUINTE:', 's', styleClientLabel);
  writeCell(currentRow, 1, clientInfo.cnpj || 'NÃO CONFIGURADO', 's', styleClientValue);
  writeCell(currentRow, 2, '', 's', styleClientValue);
  merges.push({ s: { r: currentRow, c: 1 }, e: { r: currentRow, c: 2 } });
  rowHeights.push({ hpt: 18 });
  currentRow++;

  writeCell(currentRow, 0, 'DATA DE EMISSÃO:', 's', styleClientLabel);
  const dateStr = `${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;
  writeCell(currentRow, 1, dateStr, 's', styleClientValue);
  writeCell(currentRow, 2, '', 's', styleClientValue);
  merges.push({ s: { r: currentRow, c: 1 }, e: { r: currentRow, c: 2 } });
  rowHeights.push({ hpt: 18 });
  currentRow++;

  // Gap Row
  rowHeights.push({ hpt: 15 });
  currentRow++;

  // Table Column Headers
  writeCell(currentRow, 0, 'Descrição / Competência', 's', styleTableHeader);
  writeCell(currentRow, 1, 'Valor Original', 's', styleTableHeader);
  writeCell(currentRow, 2, 'Valor Atualizado', 's', styleTableHeader);
  rowHeights.push({ hpt: 24 });
  currentRow++;

  let grandPrincipal = 0;
  let grandTotal = 0;

  // Track categories in custom groups
  const groupedCategoriesSet = new Set<string>();
  const activeCustomGroups = (customGroups || []).filter(group => {
    const hasDebts = debts.some(d => group.categories.some(c => c.toLowerCase() === d.category.toLowerCase()));
    if (hasDebts) {
      group.categories.forEach(c => groupedCategoriesSet.add(c.toLowerCase()));
    }
    return hasDebts;
  });

  // 1. RENDER EACH CUSTOM CONSOLIDATED GROUP FIRST
  activeCustomGroups.forEach(group => {
    // Group Top Banner
    const groupTitle = group.name.toUpperCase().startsWith('GRUPO') ? group.name.toUpperCase() : `GRUPO ${group.name.toUpperCase()}`;
    writeCell(currentRow, 0, `${groupTitle}: SIMULAÇÃO UNIFICADA`, 's', styleGroupBanner);
    writeCell(currentRow, 1, '', 's', styleGroupBanner);
    writeCell(currentRow, 2, '', 's', styleGroupBanner);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 2 } });
    rowHeights.push({ hpt: 22 });
    currentRow++;

    writeCell(currentRow, 0, `Classificações agrupadas: ${group.categories.join(' + ')}`, 's', styleGroupSubBanner);
    writeCell(currentRow, 1, '', 's', styleGroupSubBanner);
    writeCell(currentRow, 2, '', 's', styleGroupSubBanner);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 2 } });
    rowHeights.push({ hpt: 16 });
    currentRow++;

    let groupPrincipal = 0;
    let groupTotal = 0;

    // Render each category in this group SEPARATELY (as in the spreadsheet)
    group.categories.forEach(catName => {
      const catDebts = sortDebtsByCompetencia(
        debts.filter(d => d.category.toLowerCase() === catName.toLowerCase())
      );
      if (catDebts.length === 0) return;

      // Category Ribbon inside group
      writeCell(currentRow, 0, catName.toUpperCase(), 's', styleCategoryRibbon);
      writeCell(currentRow, 1, '', 's', styleCategoryRibbon);
      writeCell(currentRow, 2, '', 's', styleCategoryRibbon);
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 2 } });
      rowHeights.push({ hpt: 19 });
      currentRow++;

      let catPrincipal = 0;
      let catTotal = 0;

      catDebts.forEach(item => {
        writeCell(currentRow, 0, item.period, 's', styleDataCellLeft);
        writeCell(currentRow, 1, item.principal, 'n', styleDataCellRight, '"R$ " #,##0.00');
        writeCell(currentRow, 2, item.total, 'n', styleDataCellRightBold, '"R$ " #,##0.00');
        rowHeights.push({ hpt: 18 });

        catPrincipal += item.principal;
        catTotal += item.total;
        currentRow++;
      });

      // Subtotal of this classification inside group
      writeCell(currentRow, 0, `Subtotal ${catName.toUpperCase()}`, 's', styleSubtotalLabel);
      writeCell(currentRow, 1, catPrincipal, 'n', styleSubtotalValue, '"R$ " #,##0.00');
      writeCell(currentRow, 2, catTotal, 'n', styleSubtotalValue, '"R$ " #,##0.00');
      rowHeights.push({ hpt: 19 });
      currentRow++;

      groupPrincipal += catPrincipal;
      groupTotal += catTotal;
    });

    // Consolidated Total of Group
    writeCell(currentRow, 0, `TOTAL CONSOLIDADO DO GRUPO (${group.name})`, 's', styleGroupTotalLabel);
    writeCell(currentRow, 1, groupPrincipal, 'n', styleGroupTotalValue, '"R$ " #,##0.00');
    writeCell(currentRow, 2, groupTotal, 'n', styleGroupTotalValue, '"R$ " #,##0.00');
    rowHeights.push({ hpt: 22 });
    currentRow++;

    // Unified Simulation Block for Group
    const groupSim = linkedSimulations[`custom_group:${group.id}`] || linkedSimulations[`group:${group.name}`];
    if (groupSim && groupSim.isViable) {
      writeCell(currentRow, 0, `PROPOSTA DE PARCELAMENTO - ${group.name.toUpperCase()}`, 's', styleSimHeader);
      writeCell(currentRow, 1, '', 's', styleSimHeader);
      writeCell(currentRow, 2, groupSim.parcelamentoType || 'Parcelamento Ordinário', 's', styleSimHeader);
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });
      rowHeights.push({ hpt: 20 });
      currentRow++;

      // Row 1: Prazo e Parcela
      writeCell(currentRow, 0, `Prazo Proposto: ${groupSim.installmentsCount} parcelas mensais`, 's', styleSimRowLabel);
      writeCell(currentRow, 1, '', 's', styleSimRowLabel);
      writeCell(currentRow, 2, `${groupSim.installmentsCount}x de ${formatBRL(groupSim.avgInstallment)}`, 's', styleSimRowValue);
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });
      rowHeights.push({ hpt: 18 });
      currentRow++;

      // Row 2: Entrada
      const downText = groupSim.isDownPaymentInstallment
        ? `Entrada: ${groupSim.downPaymentInstallmentsCount || 12}x de ${formatBRL(groupSim.downPaymentInstallmentValue || (groupSim.totalDown / (groupSim.downPaymentInstallmentsCount || 12)))}`
        : (groupSim.totalDown > 0 ? `Entrada: ${formatBRL(groupSim.totalDown)} (À vista)` : 'Entrada: Sem entrada (R$ 0,00)');
      const financed = formatBRL(groupSim.financedAmount || Math.max(0, groupSim.totalDebt - groupSim.totalDown));
      writeCell(currentRow, 0, downText, 's', styleSimRowLabel);
      writeCell(currentRow, 1, '', 's', styleSimRowLabel);
      writeCell(currentRow, 2, '', 's', styleSimRowValue);
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });
      rowHeights.push({ hpt: 18 });
      currentRow++;

      // Row 3: Total
      writeCell(currentRow, 0, 'Total:', 's', styleSimRowLabel);
      writeCell(currentRow, 1, '', 's', styleSimRowLabel);
      writeCell(currentRow, 2, formatBRL(groupSim.totalPaid || groupTotal), 's', styleSimRowValue);
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });
      rowHeights.push({ hpt: 18 });
      currentRow++;
    }

    grandPrincipal += groupPrincipal;
    grandTotal += groupTotal;

    // Spacing between groups
    rowHeights.push({ hpt: 14 });
    currentRow++;
  });

  // 2. RENDER UNGROUPED CATEGORIES
  const ungroupedCategories = Array.from(new Set(
    debts.map(d => d.category).filter(c => !groupedCategoriesSet.has(c.toLowerCase()))
  ));

  ungroupedCategories.forEach((catName, idx) => {
    const catDebts = sortDebtsByCompetencia(
      debts.filter(d => d.category.toLowerCase() === catName.toLowerCase())
    );
    if (catDebts.length === 0) return;

    // Category Ribbon
    writeCell(currentRow, 0, catName.toUpperCase(), 's', styleCategoryRibbon);
    writeCell(currentRow, 1, '', 's', styleCategoryRibbon);
    writeCell(currentRow, 2, '', 's', styleCategoryRibbon);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 2 } });
    rowHeights.push({ hpt: 20 });
    currentRow++;

    let catPrincipal = 0;
    let catTotal = 0;

    catDebts.forEach(item => {
      writeCell(currentRow, 0, item.period, 's', styleDataCellLeft);
      writeCell(currentRow, 1, item.principal, 'n', styleDataCellRight, '"R$ " #,##0.00');
      writeCell(currentRow, 2, item.total, 'n', styleDataCellRightBold, '"R$ " #,##0.00');
      rowHeights.push({ hpt: 18 });

      catPrincipal += item.principal;
      catTotal += item.total;
      currentRow++;
    });

    // Subtotal of category
    writeCell(currentRow, 0, `SUBTOTAL ${catName.toUpperCase()}`, 's', styleSubtotalLabel);
    writeCell(currentRow, 1, catPrincipal, 'n', styleSubtotalValue, '"R$ " #,##0.00');
    writeCell(currentRow, 2, catTotal, 'n', styleSubtotalValue, '"R$ " #,##0.00');
    rowHeights.push({ hpt: 20 });
    currentRow++;

    // Check if category has a simulation
    const catSim = linkedSimulations[`group:${catName}`];
    if (catSim && catSim.isViable) {
      writeCell(currentRow, 0, `PROPOSTA DE PARCELAMENTO - ${catName.toUpperCase()}`, 's', styleSimHeader);
      writeCell(currentRow, 1, '', 's', styleSimHeader);
      writeCell(currentRow, 2, catSim.parcelamentoType || 'Parcelamento', 's', styleSimHeader);
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });
      rowHeights.push({ hpt: 20 });
      currentRow++;

      writeCell(currentRow, 0, `Prazo: ${catSim.installmentsCount} parcelas mensais`, 's', styleSimRowLabel);
      writeCell(currentRow, 1, '', 's', styleSimRowLabel);
      writeCell(currentRow, 2, `${catSim.installmentsCount}x de ${formatBRL(catSim.avgInstallment)}`, 's', styleSimRowValue);
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });
      rowHeights.push({ hpt: 18 });
      currentRow++;

      const downText = catSim.isDownPaymentInstallment
        ? `Entrada: ${catSim.downPaymentInstallmentsCount || 12}x de ${formatBRL(catSim.downPaymentInstallmentValue || (catSim.totalDown / (catSim.downPaymentInstallmentsCount || 12)))}`
        : (catSim.totalDown > 0 ? `Entrada: ${formatBRL(catSim.totalDown)} (À vista)` : 'Entrada: Sem entrada (R$ 0,00)');
      writeCell(currentRow, 0, downText, 's', styleSimRowLabel);
      writeCell(currentRow, 1, '', 's', styleSimRowLabel);
      writeCell(currentRow, 2, `Total: ${formatBRL(catSim.totalPaid || catTotal)}`, 's', styleSimRowValue);
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });
      rowHeights.push({ hpt: 18 });
      currentRow++;
    }

    grandPrincipal += catPrincipal;
    grandTotal += catTotal;

    // Spacing between categories
    if (idx < ungroupedCategories.length - 1) {
      rowHeights.push({ hpt: 14 });
      currentRow++;
    }
  });

  // Gap row before grand totals
  rowHeights.push({ hpt: 12 });
  currentRow++;

  // Grand totals row
  writeCell(currentRow, 0, 'TOTAIS GERAIS CONSOLIDADOS', 's', styleGrandTotalLabel);
  writeCell(currentRow, 1, grandPrincipal, 'n', styleGrandTotalValue, '"R$ " #,##0.00');
  writeCell(currentRow, 2, grandTotal, 'n', styleGrandTotalValue, '"R$ " #,##0.00');
  rowHeights.push({ hpt: 24 });
  currentRow++;

  // Set worksheet metadata
  ws['!merges'] = merges;
  ws['!rows'] = rowHeights;
  ws['!cols'] = [
    { wch: 45 }, // Description / Period
    { wch: 22 }, // Original
    { wch: 24 }  // Updated
  ];

  // Derive !ref
  const lastCellRef = getCellRef(currentRow - 1, 2);
  ws['!ref'] = `A1:${lastCellRef}`;

  // Create workbook and save
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Levantamento');
  
  const filename = `Levantamento_Debitos_${(clientInfo.name || 'Cliente').replace(/\s+/g, '_')}.xlsx`;
  XLSX.writeFile(wb, filename);
}

