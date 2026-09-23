import { jsPDF } from 'jspdf';
import { DebtItem, ClientInfo, DebtSimulationLink, DebtCustomGroup } from '../types_debits';
import { sortDebtsByCompetencia } from './debtParser';

// Helper to format currency in Real (BRL)
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

export async function exportDebtsToPDF(
  clientInfo: ClientInfo,
  debts: DebtItem[],
  categories: string[],
  linkedSimulations: Record<string, DebtSimulationLink> = {},
  customGroups: DebtCustomGroup[] = []
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

  // --- PALETA EXECUTIVA: AZUL/VERDE (#04243b), DOURADO (#e4b35e) E FUNDO CINZA NEUTRO ---
  const colorPrimary = { r: 4, g: 36, b: 59 }; // #04243b
  const colorGold = { r: 228, g: 179, b: 94 }; // #e4b35e
  const colorBgLight = { r: 248, g: 250, b: 252 }; // #f8fafc (Cinza neutro claro)
  const colorBgHeader = { r: 241, g: 245, b: 249 }; // #f1f5f9 (Cinza neutro médio)
  const colorBorder = { r: 226, g: 232, b: 240 }; // #e2e8f0 (Borda sutil)
  const colorBorderDark = { r: 203, g: 213, b: 225 }; // #cbd5e1 (Borda demarcada)
  const colorTextDark = { r: 15, g: 23, b: 42 }; // #0f172a (Texto escuro)
  const colorTextMuted = { r: 100, g: 116, b: 139 }; // #64748b (Texto secundário)

  // Colunas padronizadas com espaçamento milimétrico garantido (sem sobreposição)
  const colCompetenciaX = margin + 4; // 19mm
  const colOriginalX = margin + 98; // 113mm (Alinhado à direita)
  const colAtualizadoX = margin + 142; // 157mm (Alinhado à direita)
  const colSituacaoX = margin + 176; // 191mm (Alinhado à direita)

  // Helper for page headers and footers
  const addPageDecorations = (pageNum: number, totalPagesCount: number) => {
    if (pageNum > 1) {
      doc.setFillColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
      doc.rect(0, 0, pageWidth, 16, 'F');
      doc.setFillColor(colorGold.r, colorGold.g, colorGold.b);
      doc.rect(0, 16, pageWidth, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(colorGold.r, colorGold.g, colorGold.b);
      doc.text('MOREIRA & LIMA', margin, 10.5);
      doc.setTextColor(255, 255, 255);
      doc.text('CONTADORES ASSOCIADOS', margin + 30, 10.5);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(210, 220, 230);
      doc.text('Relatório Consolidado: Débitos & Parcelamento', pageWidth - margin, 10.5, { align: 'right' });
    }

    // Executive Footer
    doc.setDrawColor(colorBorderDark.r, colorBorderDark.g, colorBorderDark.b);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(colorTextMuted.r, colorTextMuted.g, colorTextMuted.b);
    
    doc.text('Relatório emitido para fins de planejamento tributário e tomada de decisão executiva.', margin, pageHeight - 9);
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

  // Dourado accent stripe
  doc.setFillColor(colorGold.r, colorGold.g, colorGold.b);
  doc.rect(0, 35, pageWidth, 1.5, 'F');

  const titleCenterX = pageWidth / 2;

  // 1. "Moreira & Lima"
  doc.setTextColor(colorGold.r, colorGold.g, colorGold.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Moreira & Lima', titleCenterX, 9.5, { align: 'center' });

  // 2. "CONTADORES ASSOCIADOS"
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('CONTADORES ASSOCIADOS', titleCenterX, 15, { align: 'center' });

  // 3. Document Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11.5);
  doc.setFont('helvetica', 'bold');
  doc.text('LEVANTAMENTO DE DÉBITOS & PROPOSTAS DE PARCELAMENTO', titleCenterX, 22.5, { align: 'center' });

  // 4. "Emissão: DD/MM/AAAA às HH:MM"
  doc.setTextColor(colorGold.r, colorGold.g, colorGold.b);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const dateStr = `Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;
  doc.text(dateStr, titleCenterX, 29, { align: 'center' });

  currentY = 41;

  // --- CLIENT DETAILS SECTION (Fundo Cinza Neutro com Detalhes #04243b e Dourado) ---
  doc.setFillColor(colorBgLight.r, colorBgLight.g, colorBgLight.b);
  doc.rect(margin, currentY, contentWidth, 21, 'F');
  doc.setDrawColor(colorBorderDark.r, colorBorderDark.g, colorBorderDark.b);
  doc.setLineWidth(0.4);
  doc.rect(margin, currentY, contentWidth, 21, 'D');

  // Accent vertical bar: Azul/Verde + Dourado
  doc.setFillColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.rect(margin, currentY, 3, 21, 'F');
  doc.setFillColor(colorGold.r, colorGold.g, colorGold.b);
  doc.rect(margin + 3, currentY, 1, 21, 'F');

  // Client labels & content
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('CLIENTE / RAZÃO SOCIAL:', margin + 7, currentY + 6.5);
  doc.text('CNPJ / CPF DO CONTRIBUINTE:', margin + 110, currentY + 6.5);

  doc.setTextColor(colorTextDark.r, colorTextDark.g, colorTextDark.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(clientInfo.name || 'NÃO CONFIGURADO', margin + 7, currentY + 14, { maxWidth: 95 });
  doc.text(clientInfo.cnpj || 'NÃO CONFIGURADO', margin + 110, currentY + 14);

  // NOTE: SUMÁRIO EXECUTIVO CONSOLIDADO FOI COMPLETAMENTE REMOVIDO CONFORME SOLICITADO
  currentY += 26;

  // --- SECTION TITLE: DETALHAMENTO DOS DÉBITOS & SIMULAÇÕES ---
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DETALHAMENTO DOS DÉBITOS & SIMULAÇÕES', margin, currentY);
  doc.setDrawColor(colorGold.r, colorGold.g, colorGold.b);
  doc.setLineWidth(0.9);
  doc.line(margin, currentY + 2.5, margin + 50, currentY + 2.5);

  currentY += 8;

  let simCounter = 1;

  // Função para renderizar a simulação inspirada exatamente no modelo com card, barra verde e destaque executivo
  const renderSimulationBlock = (
    sim: DebtSimulationLink,
    fallbackTitle: string,
    fallbackDebtTotal: number
  ) => {
    const cardH = 34; // mm
    currentY += 2;
    checkPageOverflow(cardH + 10);

    const simNumber = simCounter++;
    const simTitle = `SIMULAÇÃO #${simNumber}: ${(sim.parcelamentoType || fallbackTitle).toUpperCase()}`;
    const totalDebt = sim.totalDebt || fallbackDebtTotal;

    // 1. Linha de destaque em Dourado (#e4b35e) separando os débitos da simulação
    doc.setDrawColor(colorGold.r, colorGold.g, colorGold.b);
    doc.setLineWidth(0.9);
    doc.line(margin, currentY, pageWidth - margin, currentY);

    currentY += 4;

    const cardX = margin;
    const cardY = currentY;
    const cardW = contentWidth;

    // 2. Sombra sutil ao redor e abaixo do Card (estilo drop-shadow moderno)
    doc.setFillColor(226, 232, 240); // #e2e8f0
    doc.rect(cardX + 0.8, cardY + 0.8, cardW, cardH, 'F');
    doc.setFillColor(241, 245, 249); // #f1f5f9
    doc.rect(cardX + 0.4, cardY + 0.4, cardW, cardH, 'F');

    // 3. Fundo do Card (Branco puro) e borda neutra
    doc.setFillColor(255, 255, 255);
    doc.rect(cardX, cardY, cardW, cardH, 'F');
    doc.setDrawColor(203, 213, 225); // #cbd5e1
    doc.setLineWidth(0.35);
    doc.rect(cardX, cardY, cardW, cardH, 'D');

    // 4. Barra vertical de destaque em VERDE na lateral esquerda do Card (referência da imagem)
    doc.setFillColor(22, 140, 55); // Verde executivo / esmeralda
    doc.rect(cardX, cardY, 3.8, cardH, 'F');

    // Área interna útil com recuo da barra verde
    const innerX = cardX + 6.5;
    const innerW = cardW - 10;
    const tableRight = innerX + innerW;

    // 5. Linha superior do Card: Título da Simulação à esquerda
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
    doc.text(simTitle, innerX, cardY + 5.2, { maxWidth: innerW - 4 });

    // 6. Cabeçalho da Mini-Tabela em Azul Escuro (#04243b) com texto em branco
    const tableHeaderY = cardY + 7.5;
    const tableHeaderH = 5.4;
    doc.setFillColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
    doc.rect(innerX, tableHeaderY, innerW, tableHeaderH, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('Forma de pagamento', innerX + 3, tableHeaderY + 3.7);
    doc.text('Quantidade', innerX + 80, tableHeaderY + 3.7);
    doc.text('Valor', tableRight - 3, tableHeaderY + 3.7, { align: 'right' });

    // 7. Linha 1: Entrada
    const row1Y = tableHeaderY + tableHeaderH;
    const rowH = 5.8;

    doc.setTextColor(colorTextDark.r, colorTextDark.g, colorTextDark.b);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Entrada', innerX + 3, row1Y + 4);

    const qtdEntrada = sim.isDownPaymentInstallment
      ? `${sim.downPaymentInstallmentsCount || 12}x (Parcelada)`
      : (sim.totalDown > 0 ? '1x (À vista)' : '0x (Sem Entrada)');
    doc.setFont('helvetica', 'normal');
    doc.text(qtdEntrada, innerX + 80, row1Y + 4);

    const valEntrada = sim.isDownPaymentInstallment
      ? `${formatCurrency(sim.downPaymentInstallmentValue || (sim.totalDown / (sim.downPaymentInstallmentsCount || 12)))}`
      : formatCurrency(sim.totalDown);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
    doc.text(valEntrada, tableRight - 3, row1Y + 4, { align: 'right' });

    // Linha divisória sutil
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(innerX, row1Y + rowH, tableRight, row1Y + rowH);

    // 8. Linha 2: Parcela (Parcelamento mensal)
    const row2Y = row1Y + rowH;

    doc.setTextColor(colorTextDark.r, colorTextDark.g, colorTextDark.b);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Parcela', innerX + 3, row2Y + 4);

    doc.setFont('helvetica', 'normal');
    doc.text(`${sim.installmentsCount}x`, innerX + 80, row2Y + 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
    doc.text(formatCurrency(sim.avgInstallment), tableRight - 3, row2Y + 4, { align: 'right' });

    // Linha divisória
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(innerX, row2Y + rowH, tableRight, row2Y + rowH);

    // 9. Rodapé do Card: Total destacado à direita
    const footerY = row2Y + rowH + 1.2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
    doc.text(`Total: ${formatCurrency(sim.totalPaid)}`, tableRight - 1.5, footerY + 3.8, { align: 'right' });

    currentY = cardY + cardH + 7;
  };

  // Unique categories
  const allUniqueDebtCategories = Array.from(new Set(debts.map(d => d.category)));
  const targetCategories = allUniqueDebtCategories.length > 0 ? allUniqueDebtCategories : categories;

  if (debts.length === 0) {
    doc.setTextColor(colorTextMuted.r, colorTextMuted.g, colorTextMuted.b);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text('Nenhum débito em aberto registrado ou importado para este cliente.', margin, currentY + 10);
    currentY += 20;
  } else {
    // 1. Identify active custom groups
    const activeCustomGroups = (customGroups || []).filter(g =>
      debts.some(d => g.categories.some(c => c.toLowerCase() === d.category.toLowerCase()))
    );

    const groupedCategoriesSet = new Set(
      activeCustomGroups.flatMap(g => g.categories.map(c => c.toLowerCase()))
    );

    // 2. Render each custom consolidated group
    for (const group of activeCustomGroups) {
      const hasDebts = debts.some(d => group.categories.some(c => c.toLowerCase() === d.category.toLowerCase()));
      if (!hasDebts) continue;

      checkPageOverflow(30);

      // Group Header: Fundo Cinza Neutro, Barra Dourada, Texto #04243b
      doc.setFillColor(colorBgHeader.r, colorBgHeader.g, colorBgHeader.b);
      doc.rect(margin, currentY, contentWidth, 8, 'F');
      doc.setDrawColor(colorBorderDark.r, colorBorderDark.g, colorBorderDark.b);
      doc.setLineWidth(0.3);
      doc.rect(margin, currentY, contentWidth, 8, 'D');
      
      // Barra Dourada na esquerda
      doc.setFillColor(colorGold.r, colorGold.g, colorGold.b);
      doc.rect(margin, currentY, 3.5, 8, 'F');

      // Título do Grupo com limite de largura (maxWidth) para nunca sobrepor o badge da direita
      doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(`GRUPO CONSOLIDADO: ${group.name.toUpperCase()}`, margin + 6, currentY + 5.2, { maxWidth: 130 });

      // Indicação de tributos no canto direito com margem interna de segurança
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(colorGold.r, colorGold.g, colorGold.b);
      doc.text(`(${group.categories.length} TRIBUTOS CONSOLIDADOS)`, pageWidth - margin - 6, currentY + 5.2, { align: 'right' });

      currentY += 9.5;

      let groupPrincipal = 0;
      let groupTotal = 0;

      // Render each category in this group SEPARATELY (as in the spreadsheet)
      for (const catName of group.categories) {
        const catDebts = sortDebtsByCompetencia(
          debts.filter(d => d.category.toLowerCase() === catName.toLowerCase())
        );
        if (catDebts.length === 0) continue;

        checkPageOverflow(25);

        // Category sub-ribbon inside group (Fundo cinza claro)
        doc.setFillColor(colorBgLight.r, colorBgLight.g, colorBgLight.b);
        doc.rect(margin, currentY, contentWidth, 6, 'F');
        doc.setFillColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
        doc.rect(margin, currentY, 2.5, 6, 'F');

        doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(catName.toUpperCase(), margin + 5, currentY + 4.2, { maxWidth: 165 });

        currentY += 6;

        // Table Column Headers (Fundo cinza neutro)
        doc.setFillColor(colorBgHeader.r, colorBgHeader.g, colorBgHeader.b);
        doc.rect(margin, currentY, contentWidth, 5.5, 'F');
        
        doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text('Competência', colCompetenciaX, currentY + 3.8);
        doc.text('Original', colOriginalX, currentY + 3.8, { align: 'right' });
        doc.text('Atualizado', colAtualizadoX, currentY + 3.8, { align: 'right' });
        doc.text('Situação', colSituacaoX, currentY + 3.8, { align: 'right' });

        doc.setDrawColor(colorBorder.r, colorBorder.g, colorBorder.b);
        doc.setLineWidth(0.3);
        doc.line(margin, currentY + 5.5, pageWidth - margin, currentY + 5.5);

        currentY += 5.5;

        let catPrincipal = 0;
        let catTotal = 0;

        for (const debt of catDebts) {
          checkPageOverflow(10);
          
          doc.setTextColor(colorTextDark.r, colorTextDark.g, colorTextDark.b);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(debt.period, colCompetenciaX, currentY + 4);
          doc.text(formatCurrency(debt.principal), colOriginalX, currentY + 4, { align: 'right' });
          
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
          doc.text(formatCurrency(debt.total), colAtualizadoX, currentY + 4, { align: 'right' });

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(colorTextMuted.r, colorTextMuted.g, colorTextMuted.b);
          doc.setFontSize(7.5);
          doc.text(debt.status || 'EM ABERTO', colSituacaoX, currentY + 4, { align: 'right' });

          catPrincipal += debt.principal;
          catTotal += debt.total;

          doc.setDrawColor(colorBorder.r, colorBorder.g, colorBorder.b);
          doc.setLineWidth(0.2);
          doc.line(margin, currentY + 5.5, pageWidth - margin, currentY + 5.5);

          currentY += 6;
        }

        // Subtotal of this classification (Largura do texto limitada para NUNCA encavalar nos números)
        checkPageOverflow(8);
        doc.setFillColor(colorBgLight.r, colorBgLight.g, colorBgLight.b);
        doc.rect(margin, currentY, contentWidth, 5.5, 'F');
        
        doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(`Subtotal (${catName})`, colCompetenciaX, currentY + 4, { maxWidth: 65 });
        doc.setTextColor(colorTextDark.r, colorTextDark.g, colorTextDark.b);
        doc.text(formatCurrency(catPrincipal), colOriginalX, currentY + 4, { align: 'right' });
        doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
        doc.text(formatCurrency(catTotal), colAtualizadoX, currentY + 4, { align: 'right' });

        currentY += 7.5;

        groupPrincipal += catPrincipal;
        groupTotal += catTotal;
      }

      // Group Consolidated Total row (Demarcado com Dourado e Cinza Neutro)
      checkPageOverflow(10);
      doc.setFillColor(colorBgHeader.r, colorBgHeader.g, colorBgHeader.b);
      doc.rect(margin, currentY, contentWidth, 7, 'F');
      doc.setDrawColor(colorGold.r, colorGold.g, colorGold.b);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      doc.line(margin, currentY + 7, pageWidth - margin, currentY + 7);

      doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      // Rótulo seguro com maxWidth para garantir que nunca colida com os valores numéricos
      doc.text('TOTAL CONSOLIDADO DO GRUPO', colCompetenciaX, currentY + 4.8, { maxWidth: 65 });
      doc.setTextColor(colorTextDark.r, colorTextDark.g, colorTextDark.b);
      doc.text(formatCurrency(groupPrincipal), colOriginalX, currentY + 4.8, { align: 'right' });
      doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
      doc.text(formatCurrency(groupTotal), colAtualizadoX, currentY + 4.8, { align: 'right' });

      currentY += 9;

      // Group Simulation (custom_group:id or group:name)
      const groupSim = linkedSimulations[`custom_group:${group.id}`] || linkedSimulations[`group:${group.name}`];
      if (groupSim && groupSim.isViable) {
        renderSimulationBlock(groupSim, group.name, groupTotal);
      } else {
        currentY += 4;
      }
    }

    // 3. Iterate over ungrouped categories and render their detailed block + simulation block
    for (const category of targetCategories) {
      if (groupedCategoriesSet.has(category.toLowerCase())) continue;

      const categoryDebts = sortDebtsByCompetencia(
        debts.filter(d => d.category.toLowerCase() === category.toLowerCase())
      );
      if (categoryDebts.length === 0) continue;

      checkPageOverflow(30);

      // Category Header Ribbon: Fundo #04243b com detalhe Dourado
      doc.setFillColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
      doc.rect(margin, currentY, contentWidth, 7, 'F');
      
      doc.setFillColor(colorGold.r, colorGold.g, colorGold.b);
      doc.rect(margin, currentY, 3.5, 7, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(category.toUpperCase(), margin + 6, currentY + 4.8, { maxWidth: 165 });

      currentY += 7;

      // Table Column Headers (Cinza Neutro)
      doc.setFillColor(colorBgHeader.r, colorBgHeader.g, colorBgHeader.b);
      doc.rect(margin, currentY, contentWidth, 6, 'F');
      
      doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text('Competência', colCompetenciaX, currentY + 4);
      doc.text('Original', colOriginalX, currentY + 4, { align: 'right' });
      doc.text('Atualizado', colAtualizadoX, currentY + 4, { align: 'right' });
      doc.text('Situação', colSituacaoX, currentY + 4, { align: 'right' });
      
      doc.setDrawColor(colorBorderDark.r, colorBorderDark.g, colorBorderDark.b);
      doc.setLineWidth(0.3);
      doc.line(margin, currentY + 6, pageWidth - margin, currentY + 6);

      currentY += 6;

      let catPrincipal = 0;
      let catTotal = 0;

      // Render Debt rows
      for (const debt of categoryDebts) {
        checkPageOverflow(12);
        
        doc.setTextColor(colorTextDark.r, colorTextDark.g, colorTextDark.b);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);

        // Competência
        doc.text(debt.period, colCompetenciaX, currentY + 4.2);
        // Original Value
        doc.text(formatCurrency(debt.principal), colOriginalX, currentY + 4.2, { align: 'right' });
        // Updated Value
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
        doc.text(formatCurrency(debt.total), colAtualizadoX, currentY + 4.2, { align: 'right' });

        doc.setTextColor(colorTextMuted.r, colorTextMuted.g, colorTextMuted.b);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(debt.status || 'EM ABERTO', colSituacaoX, currentY + 4.2, { align: 'right' });

        catPrincipal += debt.principal;
        catTotal += debt.total;

        // Thin separator line
        doc.setDrawColor(colorBorder.r, colorBorder.g, colorBorder.b);
        doc.setLineWidth(0.2);
        doc.line(margin, currentY + 6, pageWidth - margin, currentY + 6);

        currentY += 6.5;
      }

      // Category Subtotal row
      checkPageOverflow(10);
      doc.setFillColor(colorBgLight.r, colorBgLight.g, colorBgLight.b);
      doc.rect(margin, currentY, contentWidth, 7, 'F');
      doc.setDrawColor(colorBorderDark.r, colorBorderDark.g, colorBorderDark.b);
      doc.setLineWidth(0.3);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      doc.line(margin, currentY + 7, pageWidth - margin, currentY + 7);

      doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('SUBTOTAL', colCompetenciaX, currentY + 4.8);

      doc.setTextColor(colorTextDark.r, colorTextDark.g, colorTextDark.b);
      doc.text(formatCurrency(catPrincipal), colOriginalX, currentY + 4.8, { align: 'right' });
      doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
      doc.text(formatCurrency(catTotal), colAtualizadoX, currentY + 4.8, { align: 'right' });

      currentY += 8.5;

      // Group / Category Simulation Proposal Table
      const groupSim = linkedSimulations[`group:${category}`];

      if (groupSim && groupSim.isViable) {
        renderSimulationBlock(groupSim, category, catTotal);
      } else {
        currentY += 4; // Spacing before next category
      }
    }
  }

  // --- APPLY PAGE DECORATIONS (HEADER/FOOTER) TO ALL PAGES ---
  const totalPages = typeof doc.getNumberOfPages === 'function' ? doc.getNumberOfPages() : (doc.internal.pages.length - 1);
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addPageDecorations(i, totalPages);
  }

  // Save the PDF directly
  const filename = `Relatorio_Unificado_Debitos_Parcelamento_${(clientInfo.name || 'Cliente').replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
}
