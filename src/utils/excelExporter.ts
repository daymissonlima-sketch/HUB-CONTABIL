import XLSX from 'xlsx-js-style';
import { DebtItem, ClientInfo } from '../types_debits';
import { NFeItemRow } from '../types';
import { sortDebtsByCompetencia } from './debtParser';

export function exportToExcel(rows: NFeItemRow[], visibleColumns: string[], reportName: string) {
  // Map rows to excel objects using only visibleColumns
  const data = rows.map(row => {
    const obj: Record<string, any> = {};
    visibleColumns.forEach(col => {
      obj[col] = (row as any)[col];
    });
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  
  const filename = `${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportDebtsToExcel(clientInfo: ClientInfo, debts: DebtItem[]) {
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

  const styleCategoryRibbon = {
    fill: { fgColor: { rgb: "F1F5F9" } },
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "04243B" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "E2E8F0" } },
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
  writeCell(currentRow, 0, 'LEVANTAMENTO DE DÉBITOS FISCAIS', 's', styleHeaderTitleLabel);
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

  // Group by Category
  const grouped: Record<string, DebtItem[]> = {};
  debts.forEach(d => {
    const cat = d.category || 'OUTROS';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(d);
  });

  let grandPrincipal = 0;
  let grandTotal = 0;

  const groupedEntries = Object.entries(grouped);
  groupedEntries.forEach(([categoryName, items], idx) => {
    // Category Ribbon Row
    writeCell(currentRow, 0, categoryName.toUpperCase(), 's', styleCategoryRibbon);
    writeCell(currentRow, 1, '', 's', styleCategoryRibbon);
    writeCell(currentRow, 2, '', 's', styleCategoryRibbon);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 2 } });
    rowHeights.push({ hpt: 20 });
    currentRow++;

    let catPrincipal = 0;
    let catTotal = 0;

    const sortedItems = sortDebtsByCompetencia(items);

    sortedItems.forEach(item => {
      // Data cell formatting
      writeCell(currentRow, 0, item.period, 's', styleDataCellLeft);
      writeCell(currentRow, 1, item.principal, 'n', styleDataCellRight, '"R$ " #,##0.00');
      writeCell(currentRow, 2, item.total, 'n', styleDataCellRightBold, '"R$ " #,##0.00');
      rowHeights.push({ hpt: 18 });
      
      catPrincipal += item.principal;
      catTotal += item.total;
      currentRow++;
    });

    // Subtotal Row
    writeCell(currentRow, 0, `SUBTOTAL ${categoryName.toUpperCase()}`, 's', styleSubtotalLabel);
    writeCell(currentRow, 1, catPrincipal, 'n', styleSubtotalValue, '"R$ " #,##0.00');
    writeCell(currentRow, 2, catTotal, 'n', styleSubtotalValue, '"R$ " #,##0.00');
    rowHeights.push({ hpt: 20 });
    currentRow++;

    // Spacing row between this subtotal and the next group of debts
    if (idx < groupedEntries.length - 1) {
      rowHeights.push({ hpt: 15 });
      currentRow++;
    }

    grandPrincipal += catPrincipal;
    grandTotal += catTotal;
  });

  // Gap row before grand totals
  rowHeights.push({ hpt: 10 });
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
    { wch: 22 }  // Updated
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
