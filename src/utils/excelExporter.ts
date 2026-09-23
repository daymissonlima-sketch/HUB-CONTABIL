import XLSX from 'xlsx-js-style';
import { DebtItem, ClientInfo, DebtSimulationLink, DebtCustomGroup } from '../types_debits';
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

