import { jsPDF } from 'jspdf';
import { DebtItem, ClientInfo } from '../types_debits';
import { getPdfLogoData, getAppLogoScale } from './logoHelper';
import { sortDebtsByCompetencia } from './debtParser';

// Helper to format currency in Real (BRL)
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export async function exportDebtsToPDF(
  clientInfo: ClientInfo,
  debts: DebtItem[],
  categories: string[]
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = typeof doc.internal.pageSize.getWidth === 'function' ? doc.internal.pageSize.getWidth() : (doc.internal.pageSize.width || 210);
  const pageHeight = typeof doc.internal.pageSize.getHeight === 'function' ? doc.internal.pageSize.getHeight() : (doc.internal.pageSize.height || 297);
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2); // 180mm

  let currentY = 15;

  // Primary color (Dark Blue #04243b)
  const colorPrimary = { r: 4, g: 36, b: 59 };
  // Accent color (Gold #e4b35e)
  const colorAccent = { r: 228, g: 179, b: 94 };
  // Text dark
  const colorTextDark = { r: 33, g: 41, b: 54 };
  // Text light/gray
  const colorTextMuted = { r: 100, g: 116, b: 139 };

  // Helper for page headers and footers
  const addPageDecorations = (pageNum: number, totalPagesCount: number) => {
    // Clean executive continuation header on subsequent pages
    if (pageNum > 1) {
      doc.setFillColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
      doc.rect(0, 0, pageWidth, 16, 'F');
      doc.setFillColor(colorAccent.r, colorAccent.g, colorAccent.b);
      doc.rect(0, 16, pageWidth, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text('MOREIRA & LIMA CONTADORES ASSOCIADOS', margin, 10.5);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(210, 220, 230);
      doc.text('Levantamento de Débitos', pageWidth - margin, 10.5, { align: 'right' });
    }

    // Executive Footer
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(colorTextMuted.r, colorTextMuted.g, colorTextMuted.b);
    
    doc.text(`Página ${pageNum} de ${totalPagesCount}`, pageWidth - margin, pageHeight - 9, { align: 'right' });
  };

  // Helper to ensure page overflow is handled correctly
  const checkPageOverflow = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - 20) {
      doc.addPage();
      currentY = 22;
      return true;
    }
    return false;
  };

  // --- EXECUTIVE HEADER SECTION (FIRST PAGE) ---
  doc.setFillColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setFillColor(colorAccent.r, colorAccent.g, colorAccent.b);
  doc.rect(0, 35, pageWidth, 1.5, 'F');

  // Logo removed by user request
  let hasDrawnLogo = false;

  const titleCenterX = pageWidth / 2;

  // 1. "Moreira & Lima" (Gold accent color)
  doc.setTextColor(colorAccent.r, colorAccent.g, colorAccent.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Moreira & Lima', titleCenterX, 9.5, { align: 'center' });

  // 2. "CONTADORES ASSOCIADOS" (Gold accent color)
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('CONTADORES ASSOCIADOS', titleCenterX, 15, { align: 'center' });

  // 3. Document Title: "LEVANTAMENTO DE DÉBITOS FISCAIS" (White)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12.5);
  doc.setFont('helvetica', 'bold');
  doc.text('LEVANTAMENTO DE DÉBITOS FISCAIS', titleCenterX, 22.5, { align: 'center' });

  // 4. "Emissão: DD/MM/AAAA às HH:MM"
  doc.setTextColor(210, 220, 230);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const dateStr = `Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;
  doc.text(dateStr, titleCenterX, 29, { align: 'center' });

  currentY = 41;

  // --- CLIENT DETAILS SECTION ---
  doc.setFillColor(248, 250, 252); // soft grey background
  doc.rect(margin, currentY, contentWidth, 22, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.rect(margin, currentY, contentWidth, 22, 'D');

  // Small vertical golden visual border decoration
  doc.setFillColor(colorAccent.r, colorAccent.g, colorAccent.b);
  doc.rect(margin, currentY, 2.5, 22, 'F');

  // Client labels & content
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CLIENTE / RAZÃO SOCIAL:', margin + 6, currentY + 7);
  doc.text('CNPJ / CPF DO CONTRIBUINTE:', margin + 110, currentY + 7);

  doc.setTextColor(colorTextDark.r, colorTextDark.g, colorTextDark.b);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(clientInfo.name || 'NÃO CONFIGURADO', margin + 6, currentY + 14);
  doc.text(clientInfo.cnpj || 'NÃO CONFIGURADO', margin + 110, currentY + 14);

  currentY += 28;

  // --- OVERALL METRICS RESUME CARD ---
  const totalPrincipal = debts.reduce((sum, item) => sum + item.principal, 0);
  const grandTotal = debts.reduce((sum, item) => sum + item.total, 0);

  doc.setFillColor(241, 245, 249);
  doc.rect(margin, currentY, contentWidth, 14, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  doc.line(margin, currentY + 14, pageWidth - margin, currentY + 14);

  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DÉBITOS CONSOLIDADOS:', margin + 4, currentY + 9);

  // Resume numbers layout with optimized spacing and right-alignment for totals to avoid right margin overflow
  doc.setTextColor(colorTextDark.r, colorTextDark.g, colorTextDark.b);
  doc.setFont('helvetica', 'normal');
  doc.text('Soma Valor Original:', margin + 50, currentY + 9);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(totalPrincipal), margin + 81, currentY + 9);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.text('TOTAL ATUALIZADO:', margin + 125, currentY + 9);
  doc.setTextColor(colorAccent.r, colorAccent.g, colorAccent.b);
  doc.text(formatCurrency(grandTotal), margin + 176, currentY + 9, { align: 'right' });

  currentY += 20;

  // --- DEBT CATEGORY-WISE TABLE LISTING ---
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DETALHAMENTO DOS DÉBITOS', margin, currentY);
  doc.setDrawColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.setLineWidth(0.8);
  doc.line(margin, currentY + 2, margin + 40, currentY + 2);

  currentY += 8;

  // Let's filter categories that actually have debts, so we keep the report extremely clean
  const categoriesWithDebts = categories.filter(cat => 
    debts.some(d => d.category.toLowerCase() === cat.toLowerCase())
  );

  // If there are custom categories in debts that are not in the predefined categories, let's include them
  const allUniqueDebtCategories = Array.from(new Set(debts.map(d => d.category)));
  
  const targetCategories = allUniqueDebtCategories.length > 0 ? allUniqueDebtCategories : categories;

  if (debts.length === 0) {
    doc.setTextColor(colorTextMuted.r, colorTextMuted.g, colorTextMuted.b);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text('Nenhum débito em aberto registrado ou importado para este cliente.', margin, currentY + 10);
    currentY += 20;
  } else {
    // Iterate over each category and render its group table
    for (const category of targetCategories) {
      const categoryDebts = sortDebtsByCompetencia(
        debts.filter(d => d.category.toLowerCase() === category.toLowerCase())
      );
      if (categoryDebts.length === 0) continue;

      // Group title
      checkPageOverflow(25);
      doc.setFillColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
      // Main ribbon header for each tax group
      doc.rect(margin, currentY, contentWidth, 7, 'F');
      
      // Visual gold corner highlight on ribbon
      doc.setFillColor(colorAccent.r, colorAccent.g, colorAccent.b);
      doc.rect(margin, currentY, 3, 7, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(category.toUpperCase(), margin + 5, currentY + 5);

      currentY += 7;

      // Table Column Headers
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, currentY, contentWidth, 7, 'F');
      
      doc.setTextColor(colorTextDark.r, colorTextDark.g, colorTextDark.b);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('Competência', margin + 5, currentY + 5);
      doc.text('Valor Original', margin + 100, currentY + 5, { align: 'right' });
      doc.text('Valor Atualizado', margin + 175, currentY + 5, { align: 'right' });
      
      // Bottom thin line under headers
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(margin, currentY + 7, pageWidth - margin, currentY + 7);

      currentY += 7;

      let catPrincipal = 0;
      let catTotal = 0;

      // Render Debt rows
      for (const debt of categoryDebts) {
        checkPageOverflow(10);
        
        doc.setTextColor(colorTextDark.r, colorTextDark.g, colorTextDark.b);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);

        // Competência
        doc.text(debt.period, margin + 5, currentY + 5);
        // Original Value
        doc.text(formatCurrency(debt.principal), margin + 100, currentY + 5, { align: 'right' });
        
        // Updated Value
        doc.setFont('helvetica', 'bold');
        doc.text(formatCurrency(debt.total), margin + 175, currentY + 5, { align: 'right' });

        // Accumulate
        catPrincipal += debt.principal;
        catTotal += debt.total;

        // Thin separator line
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.2);
        doc.line(margin, currentY + 7, pageWidth - margin, currentY + 7);

        currentY += 8;
      }

      // Group Subtotal row
      checkPageOverflow(12);
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, currentY, contentWidth, 8, 'F');
      doc.setDrawColor(colorAccent.r, colorAccent.g, colorAccent.b);
      doc.setLineWidth(0.3);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      doc.line(margin, currentY + 8, pageWidth - margin, currentY + 8);

      doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('SUBTOTAL', margin + 5, currentY + 5);

      doc.text(formatCurrency(catPrincipal), margin + 100, currentY + 5, { align: 'right' });
      
      // Total highlight gold
      doc.setTextColor(colorAccent.r, colorAccent.g, colorAccent.b);
      doc.text(formatCurrency(catTotal), margin + 175, currentY + 5, { align: 'right' });

      currentY += 14; // spacing before next category
    }
  }

  // --- APPLY PAGE DECORATIONS (HEADER/FOOTER) TO ALL PAGES ---
  const totalPages = typeof doc.getNumberOfPages === 'function' ? doc.getNumberOfPages() : (doc.internal.pages.length - 1);
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addPageDecorations(i, totalPages);
  }

  // Save the PDF directly
  const filename = `Levantamento_Debitos_${(clientInfo.name || 'Cliente').replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
}
