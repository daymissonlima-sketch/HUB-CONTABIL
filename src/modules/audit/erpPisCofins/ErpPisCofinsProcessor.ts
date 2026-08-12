/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MÓDULO 3: ERP - PIS & COFINS (DESENVOLVIDO DO ZERO)
 * Lógica de parsing, auditoria tributária e validação específica para PIS e COFINS do ERP.
 */

import * as XLSX from 'xlsx-js-style';
import { IAuditStrategy } from '../core/IAuditStrategy';
import { 
  ReportType, 
  AuditInputPayload, 
  AuditExecutionResult, 
  AuditValidationError, 
  AuditExecutionSummary 
} from '../types/AuditTypes';
import { ErpPisCofinsConfig, DEFAULT_ERP_PIS_COFINS_CONFIG } from '../config/ErpPisCofinsConfig';

export interface ErpPisCofinsReportItem {
  id: string;
  notaFiscal: string;
  dataEmissao: string;
  modelo: string;
  cfop: string;
  codigoProduto: string;
  descricaoProduto: string;
  cstPis: string;
  cstCofins: string;
  valorItem: number;
  baseCalculoPis: number;
  aliquotaPis: number;
  valorPis: number;
  baseCalculoCofins: number;
  aliquotaCofins: number;
  valorCofins: number;
  valorTotalTributos: number;
  regimeTributario: 'CUMULATIVO' | 'NAO_CUMULATIVO';
  pisRecalculated: number;
  cofinsRecalculated: number;
  hasPisDivergence: boolean;
  hasCofinsDivergence: boolean;
  statusAudit: 'OK' | 'DIVERGENCIA_PIS' | 'DIVERGENCIA_COFINS' | 'DIVERGENCIA_AMBOS' | 'CST_INCOMPATIVEL' | 'CREDITO_INCORRETO';
}

export interface PisCofinsConsolidatedSummary {
  cfop: string;
  cstPis: string;
  cstCofins: string;
  recordCount: number;
  totalValorItem: number;
  totalBasePis: number;
  totalValorPis: number;
  totalBaseCofins: number;
  totalValorCofins: number;
  totalImposto: number;
}

export class ErpPisCofinsProcessor implements IAuditStrategy {
  public readonly reportType: ReportType = 'ERP_PIS_COFINS';
  public readonly strategyName: string = 'Módulo 3: ERP - PIS & COFINS';
  public readonly moduleVersion: string = '1.0.0-PROD';

  private config: ErpPisCofinsConfig;

  constructor(customConfig?: Partial<ErpPisCofinsConfig>) {
    this.config = { ...DEFAULT_ERP_PIS_COFINS_CONFIG, ...customConfig };
  }

  public canHandle(content: string, filename?: string): boolean {
    if (!content) return false;
    const lowerContent = content.toLowerCase();
    const lowerFilename = (filename || '').toLowerCase();

    if (lowerFilename.includes('pis') || lowerFilename.includes('cofins') || lowerFilename.includes('erp_pis_cofins')) {
      return true;
    }

    const hasPisCofinsHeader = 
      (lowerContent.includes('pis') && lowerContent.includes('cofins')) &&
      (lowerContent.includes('base') || lowerContent.includes('cst') || lowerContent.includes('aliquota') || lowerContent.includes('alíquota'));

    return hasPisCofinsHeader;
  }

  public async process(input: AuditInputPayload): Promise<AuditExecutionResult<ErpPisCofinsReportItem>> {
    const startTime = new Date().toISOString();
    const { content, filename, customConfig } = input;

    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    const rawLines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const { items, validationErrors } = this.parseAndValidatePisCofinsReport(rawLines);

    // Calculate Summary Metrics
    const totalRecords = items.length;
    const validRecords = items.filter(i => i.statusAudit === 'OK').length;
    const divergentRecords = items.filter(i => i.statusAudit !== 'OK').length;
    const totalValue = items.reduce((acc, i) => acc + i.valorItem, 0);
    const totalTaxValue = items.reduce((acc, i) => acc + i.valorTotalTributos, 0);

    const criticalCount = validationErrors.filter(e => e.severity === 'CRITICAL').length;
    const warningCount = validationErrors.filter(e => e.severity === 'WARNING').length;

    const summary: AuditExecutionSummary = {
      reportType: 'ERP_PIS_COFINS',
      totalRecords,
      validRecords,
      divergentRecords,
      duplicateRecords: 0,
      totalValue,
      totalTaxValue,
      sanitizedTotalValue: totalValue,
      criticalErrorsCount: criticalCount,
      warningCount
    };

    return {
      success: true,
      reportType: 'ERP_PIS_COFINS',
      moduleName: this.strategyName,
      moduleVersion: this.moduleVersion,
      timestamp: startTime,
      metadata: {
        empresa: 'EMPRESA ERP - PIS & COFINS',
        periodo: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        dataGeracao: new Date().toLocaleDateString('pt-BR'),
        totalLinhasLidas: rawLines.length,
        moduloVersao: this.moduleVersion
      },
      items,
      summary,
      validationErrors,
      exportExcel: (outFilename?: string) => {
        this.exportPisCofinsExcel(items, summary, outFilename || filename || `Auditoria_ERP_PIS_COFINS_${Date.now()}.xlsx`);
      }
    };
  }

  private parseAndValidatePisCofinsReport(lines: string[]): { items: ErpPisCofinsReportItem[]; validationErrors: AuditValidationError[] } {
    if (lines.length === 0) return { items: [], validationErrors: [] };

    // Detect delimiter
    let delimiter = ';';
    const firstLine = lines[0];
    if (firstLine.includes(';') && (firstLine.match(/;/g) || []).length >= 2) delimiter = ';';
    else if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes('|')) delimiter = '|';
    else if (firstLine.includes(',')) delimiter = ',';

    // Header Mapping
    let headerIdx = -1;
    let notaIdx = 0, dataIdx = 1, cfopIdx = 2, codProdIdx = 3, descProdIdx = 4, cstPisIdx = 5, cstCofinsIdx = 6;
    let valItemIdx = 7, basePisIdx = 8, aliqPisIdx = 9, valPisIdx = 10, baseCofinsIdx = 11, aliqCofinsIdx = 12, valCofinsIdx = 13;

    for (let i = 0; i < Math.min(15, lines.length); i++) {
      const lower = lines[i].toLowerCase();
      if (lower.includes('pis') || lower.includes('cofins') || lower.includes('cst') || lower.includes('cfop')) {
        headerIdx = i;
        const headers = lines[i].split(delimiter).map(h => h.trim().toLowerCase());

        headers.forEach((h, idx) => {
          if (h.includes('nota') || h.includes('num_doc') || h.includes('número')) notaIdx = idx;
          else if (h.includes('data') || h.includes('emissao') || h.includes('emissão')) dataIdx = idx;
          else if (h.includes('cfop')) cfopIdx = idx;
          else if (h.includes('código') || h.includes('codigo') || h.includes('item')) codProdIdx = idx;
          else if (h.includes('descri') || h.includes('produto') || h.includes('nome')) descProdIdx = idx;
          else if (h.includes('cst_pis') || (h.includes('cst') && h.includes('pis'))) cstPisIdx = idx;
          else if (h.includes('cst_cofins') || (h.includes('cst') && h.includes('cofins'))) cstCofinsIdx = idx;
          else if (h.includes('valor_item') || h.includes('vlr_produto') || h.includes('valor_total') || h.includes('contabil')) valItemIdx = idx;
          else if (h.includes('base') && h.includes('pis')) basePisIdx = idx;
          else if (h.includes('aliq') && h.includes('pis')) aliqPisIdx = idx;
          else if (h.includes('valor') && h.includes('pis')) valPisIdx = idx;
          else if (h.includes('base') && h.includes('cofins')) baseCofinsIdx = idx;
          else if (h.includes('aliq') && h.includes('cofins')) aliqCofinsIdx = idx;
          else if (h.includes('valor') && h.includes('cofins')) valCofinsIdx = idx;
        });
        break;
      }
    }

    const startIdx = headerIdx !== -1 ? headerIdx + 1 : 0;
    const items: ErpPisCofinsReportItem[] = [];
    const validationErrors: AuditValidationError[] = [];

    for (let i = startIdx; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;

      const cells = rawLine.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
      if (cells.length < 3) continue;

      const notaFiscal = cells[notaIdx] ? cells[notaIdx].replace(/\D/g, '') : `${i}`;
      const dataEmissao = cells[dataIdx] || new Date().toLocaleDateString('pt-BR');
      const cfop = cells[cfopIdx] || '5102';
      const codigoProduto = cells[codProdIdx] || `PROD-${i}`;
      const descricaoProduto = cells[descProdIdx] || 'PRODUTO / SERVIÇO';
      const cstPis = cells[cstPisIdx] || '01';
      const cstCofins = cells[cstCofinsIdx] || cells[cstPisIdx] || '01';

      const valorItem = this.parseBrazilianFloat(cells[valItemIdx] || '0');
      const baseCalculoPis = this.parseBrazilianFloat(cells[basePisIdx] || '0') || valorItem;
      const aliquotaPis = this.parseBrazilianFloat(cells[aliqPisIdx] || '0') || this.config.defaultAliqPisNonCumulative;
      const valorPis = this.parseBrazilianFloat(cells[valPisIdx] || '0');

      const baseCalculoCofins = this.parseBrazilianFloat(cells[baseCofinsIdx] || '0') || valorItem;
      const aliquotaCofins = this.parseBrazilianFloat(cells[aliqCofinsIdx] || '0') || this.config.defaultAliqCofinsNonCumulative;
      const valorCofins = this.parseBrazilianFloat(cells[valCofinsIdx] || '0');

      // Recalculations
      const pisRecalculated = Number((baseCalculoPis * (aliquotaPis / 100)).toFixed(2));
      const cofinsRecalculated = Number((baseCalculoCofins * (aliquotaCofins / 100)).toFixed(2));

      const hasPisDivergence = Math.abs(valorPis - pisRecalculated) > this.config.toleranceAmount;
      const hasCofinsDivergence = Math.abs(valorCofins - cofinsRecalculated) > this.config.toleranceAmount;

      // CST Match Check
      const isCstIncompatible = this.config.checkCstPisCofinsMatch && (cstPis !== cstCofins);

      // Determine Status
      let statusAudit: ErpPisCofinsReportItem['statusAudit'] = 'OK';
      if (isCstIncompatible) statusAudit = 'CST_INCOMPATIVEL';
      else if (hasPisDivergence && hasCofinsDivergence) statusAudit = 'DIVERGENCIA_AMBOS';
      else if (hasPisDivergence) statusAudit = 'DIVERGENCIA_PIS';
      else if (hasCofinsDivergence) statusAudit = 'DIVERGENCIA_COFINS';

      const regimeTributario: 'CUMULATIVO' | 'NAO_CUMULATIVO' = (aliquotaPis <= 0.65 && aliquotaCofins <= 3.0) ? 'CUMULATIVO' : 'NAO_CUMULATIVO';

      const item: ErpPisCofinsReportItem = {
        id: `erp-piscofins-${i}-${Math.random().toString(36).substring(2, 7)}`,
        notaFiscal,
        dataEmissao,
        modelo: '55',
        cfop,
        codigoProduto,
        descricaoProduto,
        cstPis,
        cstCofins,
        valorItem,
        baseCalculoPis,
        aliquotaPis,
        valorPis,
        baseCalculoCofins,
        aliquotaCofins,
        valorCofins,
        valorTotalTributos: Number((valorPis + valorCofins).toFixed(2)),
        regimeTributario,
        pisRecalculated,
        cofinsRecalculated,
        hasPisDivergence,
        hasCofinsDivergence,
        statusAudit
      };

      items.push(item);

      if (hasPisDivergence) {
        validationErrors.push({
          id: `err-pis-${i}`,
          severity: 'WARNING',
          code: 'DIVERGENCIA_PIS',
          message: `Divergência de PIS no item ${codigoProduto}: Calculado R$ ${pisRecalculated.toFixed(2)} vs Declarado R$ ${valorPis.toFixed(2)}`,
          rowNumber: i + 1,
          documentNumber: notaFiscal,
          field: 'valorPis',
          expectedValue: pisRecalculated,
          foundValue: valorPis
        });
      }

      if (hasCofinsDivergence) {
        validationErrors.push({
          id: `err-cofins-${i}`,
          severity: 'WARNING',
          code: 'DIVERGENCIA_COFINS',
          message: `Divergência de COFINS no item ${codigoProduto}: Calculado R$ ${cofinsRecalculated.toFixed(2)} vs Declarado R$ ${valorCofins.toFixed(2)}`,
          rowNumber: i + 1,
          documentNumber: notaFiscal,
          field: 'valorCofins',
          expectedValue: cofinsRecalculated,
          foundValue: valorCofins
        });
      }
    }

    return { items, validationErrors };
  }

  private parseBrazilianFloat(valStr: string): number {
    if (!valStr) return 0;
    let clean = valStr.replace(/[R$\s]/g, '').trim();
    if (clean === '' || clean === '-') return 0;
    if (clean.includes('.') && clean.includes(',')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
      clean = clean.replace(',', '.');
    }
    const num = parseFloat(clean);
    return Number.isNaN(num) ? 0 : num;
  }

  private exportPisCofinsExcel(items: ErpPisCofinsReportItem[], summary: AuditExecutionSummary, filename: string): void {
    const wb = XLSX.utils.book_new();

    const wsData: any[][] = [
      ['MOREIRA & LIMA CONTADORES ASSOCIADOS - MÓDULO 3: ERP PIS & COFINS'],
      [`Relatório Processado em: ${new Date().toLocaleString('pt-BR')}`],
      [`Total Registros: ${summary.totalRecords} | Válidos: ${summary.validRecords} | Divergências: ${summary.divergentRecords} | Valor Total Tributos: R$ ${summary.totalTaxValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      [],
      [
        'Nota Fiscal', 'Data', 'CFOP', 'Código Produto', 'Descrição Produto', 'CST PIS', 'CST COFINS',
        'Valor Item R$', 'Base PIS R$', 'Aliq PIS %', 'Valor PIS R$', 'PIS Recalc R$', 'Base COFINS R$', 'Aliq COFINS %', 'Valor COFINS R$', 'COFINS Recalc R$', 'Status Audit'
      ]
    ];

    items.forEach(item => {
      wsData.push([
        item.notaFiscal,
        item.dataEmissao,
        item.cfop,
        item.codigoProduto,
        item.descricaoProduto,
        item.cstPis,
        item.cstCofins,
        item.valorItem,
        item.baseCalculoPis,
        item.aliquotaPis,
        item.valorPis,
        item.pisRecalculated,
        item.baseCalculoCofins,
        item.aliquotaCofins,
        item.valorCofins,
        item.cofinsRecalculated,
        item.statusAudit
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 32 }, { wch: 10 }, { wch: 12 },
      { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 22 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Auditoria PIS COFINS');
    XLSX.writeFile(wb, filename);
  }
}
