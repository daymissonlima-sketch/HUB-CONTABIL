/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MÓDULO 2: ERP - MOVIMENTAÇÃO ICMS (DESENVOLVIDO DO ZERO)
 * Lógica de parsing, validações fiscais e auditoria para relatórios do ERP focados em ICMS.
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
import { ErpIcmsConfig, DEFAULT_ERP_ICMS_CONFIG } from '../config/ErpIcmsConfig';
import { formatCnpjCpf, splitProductCodeAndDesc } from '../../../utils/auditHelper';

export interface ErpIcmsReportItem {
  id: string;
  tipoOperacao: 'ENTRADA' | 'SAIDA';
  notaFiscal: string;
  serie: string;
  modelo: string;
  dataEmissao: string;
  cnpjEmitente: string;
  razaoSocialEmitente: string;
  uf: string;
  cfop: string;
  codigoProduto?: string;
  descricaoProduto?: string;
  produto: string;
  ncm: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorProduto: number;
  desconto: number;
  valorContabil: number;
  cstIcms: string;
  baseCalculoIcms: number;
  aliquotaIcms: number;
  valorIcms: number;
  aliquotaIpi: number;
  valorIpi: number;
  valorIsentoIcms: number;
  valorOutrosIcms: number;
  chaveDeAcesso: string;
  isValidChave: boolean;
  chaveError?: string;
  icmsRecalculated: number;
  icmsDivergence: number;
  hasDivergence: boolean;
  statusAudit: 'OK' | 'DIVERGENCIA_CALCULO' | 'CST_INCOMPATIVEL' | 'CHAVE_INVALIDA' | 'DUPLICADO';
  deduplicationKey: string;
  isDuplicate?: boolean;
}

export class ErpIcmsProcessor implements IAuditStrategy {
  public readonly reportType: ReportType = 'ERP_ICMS';
  public readonly strategyName: string = 'Módulo 2: ERP - Movimentação ICMS';
  public readonly moduleVersion: string = '1.0.0-PROD';

  private config: ErpIcmsConfig;

  constructor(customConfig?: Partial<ErpIcmsConfig>) {
    this.config = { ...DEFAULT_ERP_ICMS_CONFIG, ...customConfig };
  }

  public canHandle(content: string, filename?: string): boolean {
    if (!content) return false;
    const lowerContent = content.toLowerCase();
    const lowerFilename = (filename || '').toLowerCase();

    if (lowerFilename.includes('icms') || lowerFilename.includes('erp_icms') || lowerFilename.includes('movimentacao')) {
      return true;
    }

    const hasIcmsHeader = 
      (lowerContent.includes('movimentação de entrada e saída') || lowerContent.includes('movimentacao de entrada e saida') || lowerContent.includes('base icms') || lowerContent.includes('vlr icms') || lowerContent.includes('aliquota icms') || lowerContent.includes('cst icms') || lowerContent.includes('r$ produto')) &&
      (lowerContent.includes('nota') || lowerContent.includes('documento') || lowerContent.includes('cfop'));

    return hasIcmsHeader;
  }

  public async process(input: AuditInputPayload): Promise<AuditExecutionResult<ErpIcmsReportItem>> {
    const startTime = new Date().toISOString();
    const { content, filename, customConfig } = input;

    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    const rawLines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const { items, validationErrors } = this.parseAndValidateIcmsReport(rawLines);

    // Calculate Summary Metrics
    const totalRecords = items.length;
    const validRecords = items.filter(i => i.statusAudit === 'OK').length;
    const divergentRecords = items.filter(i => i.statusAudit === 'DIVERGENCIA_CALCULO' || i.statusAudit === 'CST_INCOMPATIVEL').length;
    const duplicateRecords = items.filter(i => i.isDuplicate).length;
    const totalValue = items.reduce((acc, i) => acc + i.valorContabil, 0);
    const totalTaxValue = items.reduce((acc, i) => acc + i.valorIcms, 0);
    const sanitizedTotalValue = items.filter(i => !i.isDuplicate).reduce((acc, i) => acc + i.valorContabil, 0);

    const criticalCount = validationErrors.filter(e => e.severity === 'CRITICAL').length;
    const warningCount = validationErrors.filter(e => e.severity === 'WARNING').length;

    const summary: AuditExecutionSummary = {
      reportType: 'ERP_ICMS',
      totalRecords,
      validRecords,
      divergentRecords,
      duplicateRecords,
      totalValue,
      totalTaxValue,
      sanitizedTotalValue,
      criticalErrorsCount: criticalCount,
      warningCount
    };

    return {
      success: true,
      reportType: 'ERP_ICMS',
      moduleName: this.strategyName,
      moduleVersion: this.moduleVersion,
      timestamp: startTime,
      metadata: {
        empresa: 'SL DISTRIBUIDORA DE PRODUTOS ALIMENTICIO - ERP ICMS',
        periodo: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        dataGeracao: new Date().toLocaleDateString('pt-BR'),
        totalLinhasLidas: rawLines.length,
        moduloVersao: this.moduleVersion
      },
      items,
      summary,
      validationErrors,
      exportExcel: (outFilename?: string) => {
        this.exportIcmsExcel(items, summary, outFilename || filename || `Auditoria_ERP_ICMS_${Date.now()}.xlsx`);
      }
    };
  }

  private parseAndValidateIcmsReport(lines: string[]): { items: ErpIcmsReportItem[]; validationErrors: AuditValidationError[] } {
    if (lines.length === 0) return { items: [], validationErrors: [] };

    let delimiter = ';';
    for (const l of lines) {
      if (l.includes(';') && (l.match(/;/g) || []).length >= 5) { delimiter = ';'; break; }
      if (l.includes('\t')) { delimiter = '\t'; break; }
      if (l.includes('|')) { delimiter = '|'; break; }
      if (l.includes(',') && (l.match(/,/g) || []).length >= 5) { delimiter = ','; break; }
    }

    const items: ErpIcmsReportItem[] = [];
    const validationErrors: AuditValidationError[] = [];
    const seenKeys = new Map<string, number>();

    let currentOperationType: 'ENTRADA' | 'SAIDA' = 'ENTRADA';

    // Header index map initialized with default positions
    let hIndices = {
      nota: 0,
      data: 2,
      cnpj: 4,
      cfop: 5,
      produto: 8,
      ncm: 13,
      unidade: 14,
      quantidade: 16,
      valorUnitario: 18,
      valorProduto: 21,
      desconto: 22,
      valorContabil: 24,
      cstIcms: 25,
      baseCalculoIcms: 27,
      aliquotaIcms: 28,
      valorIcms: 30,
      aliquotaIpi: 34,
      valorIpi: 36
    };

    // First pass to detect header row if present in file
    for (const rawLine of lines) {
      const lower = rawLine.toLowerCase();
      if (
        (lower.includes('nota') || lower.includes('doc')) &&
        (lower.includes('cfop') || lower.includes('cnpj') || lower.includes('produto') || lower.includes('icms'))
      ) {
        const cells = rawLine.split(delimiter).map(c => c.trim().toLowerCase().replace(/^"|"$/g, ''));

        const fNota = cells.findIndex(c => c.includes('nota') || c.includes('num_doc') || c === 'doc' || c === 'documento');
        if (fNota !== -1) hIndices.nota = fNota;

        const fData = cells.findIndex(c => c.includes('data') || c.includes('emissão') || c.includes('emissao'));
        if (fData !== -1) hIndices.data = fData;

        const fCnpj = cells.findIndex(c => c.includes('cnpj') || c.includes('cpf') || c.includes('emitente') || c.includes('fornecedor'));
        if (fCnpj !== -1) hIndices.cnpj = fCnpj;

        const fCfop = cells.findIndex(c => c.includes('cfop'));
        if (fCfop !== -1) hIndices.cfop = fCfop;

        const fProd = cells.findIndex(c => c.includes('produto') || c.includes('descri') || c.includes('item') || c === 'nome');
        if (fProd !== -1) hIndices.produto = fProd;

        const fNcm = cells.findIndex(c => c.includes('ncm'));
        if (fNcm !== -1) hIndices.ncm = fNcm;

        const fUn = cells.findIndex(c => c === 'un' || c.includes('unid') || c === 'unidade');
        if (fUn !== -1) hIndices.unidade = fUn;

        const fQtde = cells.findIndex(c => c.includes('qtde') || c.includes('quant') || c === 'qtd');
        if (fQtde !== -1) hIndices.quantidade = fQtde;

        const fVUnit = cells.findIndex(c => c.includes('unit') || c.includes('vlr_unit'));
        if (fVUnit !== -1) hIndices.valorUnitario = fVUnit;

        const fVProd = cells.findIndex(c => c.includes('r$ prod') || c.includes('valor prod') || c.includes('vlr prod'));
        if (fVProd !== -1) hIndices.valorProduto = fVProd;

        const fDesc = cells.findIndex(c => c.includes('desc'));
        if (fDesc !== -1) hIndices.desconto = fDesc;

        const fVContabil = cells.findIndex(c => c.includes('contab') || c.includes('vlr_cont') || c.includes('valor total'));
        if (fVContabil !== -1) hIndices.valorContabil = fVContabil;

        const fCst = cells.findIndex(c => c.includes('cst') || c.includes('cst icms'));
        if (fCst !== -1) hIndices.cstIcms = fCst;

        const fBase = cells.findIndex(c => c.includes('base') || c.includes('b.calc') || c.includes('vlr_base'));
        if (fBase !== -1) hIndices.baseCalculoIcms = fBase;

        const fAliqIcms = cells.findIndex(c => c.includes('% icms') || c.includes('aliq icms') || c.includes('aliquota icms'));
        if (fAliqIcms !== -1) hIndices.aliquotaIcms = fAliqIcms;

        const fVIcms = cells.findIndex(c => c.includes('vlr icms') || c.includes('r$ icms') || c.includes('valor icms'));
        if (fVIcms !== -1) hIndices.valorIcms = fVIcms;

        break;
      }
    }

    const cfopRegex = /^[1-7][.\-]?\d{3}$/;
    const cnpjRegex = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/;
    const dateRegex = /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/;
    const ncmRegex = /^\d{8}$|^\d{4}\.\d{2}\.\d{2}$/;
    const cstRegex = /^\d{2,3}$/;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;

      const lower = rawLine.toLowerCase();

      // Section Trackers
      if (lower.includes('notas fiscais de entrada')) {
        currentOperationType = 'ENTRADA';
        continue;
      }
      if (lower.includes('notas fiscais de saída') || lower.includes('notas fiscais de saida')) {
        currentOperationType = 'SAIDA';
        continue;
      }

      // Ignore Metadata / Title / Header / Total summary rows
      if (
        lower.includes('movimentação de entrada') ||
        lower.includes('movimentacao de entrada') ||
        lower.includes('página:') || lower.includes('pagina:') ||
        lower.includes('total de notas') ||
        lower.startsWith('nota fiscal') ||
        lower.startsWith('de:') ||
        lower.includes('distribuida') || lower.includes('distribuidora') ||
        (lower.includes('cfop') && lower.includes('cnpj'))
      ) {
        continue;
      }

      const cells = rawLine.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
      if (cells.length < 2) continue;

      // Extract Nota Fiscal Number
      let notaFiscal = '';
      if (cells[hIndices.nota] && /\d/.test(cells[hIndices.nota])) {
        notaFiscal = cells[hIndices.nota].replace(/\D/g, '');
      }
      if (!notaFiscal || notaFiscal.length === 0) {
        for (let cIdx = 0; cIdx < Math.min(cells.length, 5); cIdx++) {
          const digits = (cells[cIdx] || '').replace(/\D/g, '');
          if (digits.length >= 3 && digits.length <= 10) {
            notaFiscal = digits;
            break;
          }
        }
      }
      if (!notaFiscal) continue;

      // Dynamic CFOP Resolution:
      // Handles cases where Header is in Column F (index 5) and Data is in Column G (index 6) or shifted.
      let cfop = '';
      const checkCfopCell = (cVal: string) => {
        if (!cVal) return false;
        const clean = cVal.trim();
        return cfopRegex.test(clean) || /^\d[.\-]\d{3}$/.test(clean);
      };

      if (checkCfopCell(cells[hIndices.cfop])) {
        cfop = cells[hIndices.cfop].trim();
      } else if (checkCfopCell(cells[hIndices.cfop + 1])) {
        cfop = cells[hIndices.cfop + 1].trim();
      } else if (hIndices.cfop > 0 && checkCfopCell(cells[hIndices.cfop - 1])) {
        cfop = cells[hIndices.cfop - 1].trim();
      } else if (checkCfopCell(cells[6])) {
        cfop = cells[6].trim();
      } else if (checkCfopCell(cells[5])) {
        cfop = cells[5].trim();
      } else if (checkCfopCell(cells[7])) {
        cfop = cells[7].trim();
      } else {
        for (const cellVal of cells) {
          if (checkCfopCell(cellVal)) {
            cfop = cellVal.trim();
            break;
          }
        }
      }

      if (!cfop) {
        cfop = currentOperationType === 'SAIDA' ? '5102' : '1102';
      }

      // Dynamic CNPJ Resolution:
      let cnpjEmitente = cells[hIndices.cnpj] || cells[hIndices.cnpj + 1] || cells[hIndices.cnpj - 1] || cells[4] || cells[3] || '';
      if (!cnpjRegex.test(cnpjEmitente)) {
        for (const cellVal of cells) {
          if (cnpjRegex.test(cellVal) || cellVal.replace(/\D/g, '').length === 14 || cellVal.replace(/\D/g, '').length === 11) {
            cnpjEmitente = cellVal;
            break;
          }
        }
      }
      cnpjEmitente = formatCnpjCpf(cnpjEmitente);

      // Dynamic Data (Date) Resolution:
      let dataEmissao = cells[hIndices.data] || cells[hIndices.data + 1] || cells[hIndices.data - 1] || cells[2] || cells[1] || '';
      if (!dateRegex.test(dataEmissao)) {
        for (const cellVal of cells) {
          if (dateRegex.test(cellVal)) {
            dataEmissao = cellVal;
            break;
          }
        }
      }

      // Dynamic Produto Resolution:
      let produto = cells[hIndices.produto] || cells[hIndices.produto + 1] || cells[hIndices.produto - 1] || cells[8] || cells[9] || cells[7] || '';
      if (!produto || produto.length < 2 || dateRegex.test(produto) || cnpjRegex.test(produto) || cfopRegex.test(produto)) {
        for (let cIdx = 4; cIdx < Math.min(cells.length, 12); cIdx++) {
          const val = cells[cIdx];
          if (
            val && val.length > 2 &&
            !dateRegex.test(val) &&
            !cnpjRegex.test(val) &&
            !cfopRegex.test(val) &&
            !ncmRegex.test(val) &&
            val.replace(/\D/g, '') !== notaFiscal
          ) {
            produto = val;
            break;
          }
        }
      }

      // Dynamic NCM Resolution:
      let ncm = cells[hIndices.ncm] || cells[hIndices.ncm + 1] || cells[hIndices.ncm - 1] || cells[13] || cells[12] || '';
      if (!ncmRegex.test(ncm)) {
        for (const cellVal of cells) {
          if (ncmRegex.test(cellVal.trim())) {
            ncm = cellVal.trim();
            break;
          }
        }
      }

      // Dynamic Unidade Resolution:
      let unidade = cells[hIndices.unidade] || cells[hIndices.unidade + 1] || cells[14] || cells[15] || 'UN';

      // Dynamic Quantidade Resolution:
      let quantidade = this.parseBrazilianFloat(cells[hIndices.quantidade] || cells[hIndices.quantidade + 1] || cells[16] || cells[17] || '0');

      // Dynamic Valor Unitario Resolution:
      let valorUnitario = this.parseBrazilianFloat(cells[hIndices.valorUnitario] || cells[hIndices.valorUnitario + 1] || cells[18] || cells[19] || '0');

      // Dynamic Valor Produto Resolution:
      let valorProduto = this.parseBrazilianFloat(cells[hIndices.valorProduto] || cells[hIndices.valorProduto + 1] || cells[21] || cells[20] || '0');

      // Dynamic Desconto Resolution:
      let desconto = this.parseBrazilianFloat(cells[hIndices.desconto] || cells[hIndices.desconto + 1] || cells[22] || cells[23] || '0');

      // Dynamic Valor Contabil Resolution:
      let valorContabil = this.parseBrazilianFloat(cells[hIndices.valorContabil] || cells[hIndices.valorContabil + 1] || cells[24] || cells[25] || '0');
      if (valorContabil === 0 && valorProduto > 0) {
        valorContabil = valorProduto - desconto;
      }

      // Dynamic CST Resolution:
      let cstIcms = cells[hIndices.cstIcms] || cells[hIndices.cstIcms + 1] || cells[25] || cells[26] || '00';
      if (!cstRegex.test(cstIcms.trim())) {
        for (let cIdx = Math.max(0, hIndices.cstIcms - 2); cIdx <= Math.min(cells.length - 1, hIndices.cstIcms + 2); cIdx++) {
          if (cstRegex.test((cells[cIdx] || '').trim())) {
            cstIcms = cells[cIdx].trim();
            break;
          }
        }
      }

      // Dynamic Base Calculo ICMS Resolution:
      let baseCalculoIcms = this.parseBrazilianFloat(cells[hIndices.baseCalculoIcms] || cells[hIndices.baseCalculoIcms + 1] || cells[27] || cells[28] || '0');

      // Dynamic Aliquota ICMS Resolution:
      let aliquotaIcms = this.parseBrazilianFloat(cells[hIndices.aliquotaIcms] || cells[hIndices.aliquotaIcms + 1] || cells[28] || cells[29] || '0');

      // Dynamic Valor ICMS Resolution:
      let valorIcms = this.parseBrazilianFloat(cells[hIndices.valorIcms] || cells[hIndices.valorIcms + 1] || cells[30] || cells[31] || '0');

      // Se a alíquota não veio expressa na coluna mas há base e valor de ICMS, inferir a alíquota nominal
      if (aliquotaIcms === 0 && baseCalculoIcms > 0 && valorIcms > 0) {
        const rawAliq = (valorIcms / baseCalculoIcms) * 100;
        const nearestInt = Math.round(rawAliq);
        if (Math.abs(rawAliq - nearestInt) < 0.08) {
          aliquotaIcms = nearestInt;
        } else {
          aliquotaIcms = Number(rawAliq.toFixed(2));
        }
      }

      // Dynamic Aliquota IPI & Valor IPI Resolution:
      let aliquotaIpi = this.parseBrazilianFloat(cells[hIndices.aliquotaIpi] || cells[34] || '0');
      let valorIpi = this.parseBrazilianFloat(cells[hIndices.valorIpi] || cells[36] || '0');

      // Determine CST Consistency & ICMS Recalculation
      let icmsRecalculated = 0;
      if (baseCalculoIcms > 0 && aliquotaIcms > 0) {
        icmsRecalculated = Number((baseCalculoIcms * (aliquotaIcms / 100)).toFixed(2));
      } else if (valorContabil > 0 && aliquotaIcms > 0 && (cstIcms === '00' || cstIcms === '000' || cstIcms === '20')) {
        icmsRecalculated = Number((valorContabil * (aliquotaIcms / 100)).toFixed(2));
      }

      const icmsDivergence = Number(Math.abs(valorIcms - icmsRecalculated).toFixed(2));
      const hasDivergence = icmsDivergence > this.config.toleranceAmount;

      let isCstIncompatible = false;
      if (this.config.checkCstConsistency) {
        if ((cstIcms === '00' || cstIcms === '000') && (baseCalculoIcms > 0 || valorContabil > 0) && valorIcms === 0 && aliquotaIcms > 0) {
          isCstIncompatible = true;
        }
      }

      const deduplicationKey = `ERP_ICMS_NF_${notaFiscal}_PROD_${produto}_VAL_${valorContabil.toFixed(2)}`;
      const existingCount = seenKeys.get(deduplicationKey) || 0;
      seenKeys.set(deduplicationKey, existingCount + 1);
      const isDuplicate = existingCount > 0;

      let statusAudit: ErpIcmsReportItem['statusAudit'] = 'OK';
      if (isDuplicate) statusAudit = 'DUPLICADO';
      else if (isCstIncompatible) statusAudit = 'CST_INCOMPATIVEL';
      else if (hasDivergence) statusAudit = 'DIVERGENCIA_CALCULO';

      const item: ErpIcmsReportItem = {
        id: `erp-icms-${i}-${Math.random().toString(36).substring(2, 7)}`,
        tipoOperacao: currentOperationType,
        notaFiscal,
        serie: '1',
        modelo: '55',
        dataEmissao,
        cnpjEmitente,
        razaoSocialEmitente: 'PARCEIRO / CLIENTE',
        uf: this.config.defaultUf,
        cfop,
        codigoProduto: splitProductCodeAndDesc(produto).codigo,
        descricaoProduto: splitProductCodeAndDesc(produto).descricao || produto,
        produto,
        ncm,
        unidade,
        quantidade,
        valorUnitario,
        valorProduto,
        desconto,
        valorContabil,
        cstIcms,
        baseCalculoIcms,
        aliquotaIcms,
        valorIcms,
        aliquotaIpi,
        valorIpi,
        valorIsentoIcms: 0,
        valorOutrosIcms: 0,
        chaveDeAcesso: '',
        isValidChave: true,
        icmsRecalculated,
        icmsDivergence,
        hasDivergence,
        statusAudit,
        deduplicationKey,
        isDuplicate
      };

      items.push(item);

      if (hasDivergence) {
        validationErrors.push({
          id: `err-icms-div-${i}`,
          severity: 'WARNING',
          code: 'DIVERGENCIA_ICMS',
          message: `Divergência de ICMS na NF ${notaFiscal} (${produto}): Calculado R$ ${icmsRecalculated.toFixed(2)} vs Declarado R$ ${valorIcms.toFixed(2)}`,
          rowNumber: i + 1,
          documentNumber: notaFiscal,
          field: 'valorIcms',
          expectedValue: icmsRecalculated,
          foundValue: valorIcms
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

  private exportIcmsExcel(items: ErpIcmsReportItem[], summary: AuditExecutionSummary, filename: string): void {
    const wb = XLSX.utils.book_new();

    const sortedItems = [...items].sort((a, b) => {
      const descA = a.descricaoProduto || splitProductCodeAndDesc(a.produto).descricao || a.produto || '';
      const descB = b.descricaoProduto || splitProductCodeAndDesc(b.produto).descricao || b.produto || '';
      return descA.localeCompare(descB, 'pt-BR', { sensitivity: 'base' });
    });

    const wsData: any[][] = [
      ['MOREIRA & LIMA CONTADORES ASSOCIADOS - MÓDULO 2: ERP MOVIMENTAÇÃO ICMS POR PRODUTO'],
      [`Relatório Processado em: ${new Date().toLocaleString('pt-BR')}`],
      [`Total Registros: ${summary.totalRecords} | Válidos: ${summary.validRecords} | Divergências: ${summary.divergentRecords} | Valor Total: R$ ${summary.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      [],
      [
        'Tipo Operação', 'Nota Fiscal', 'Data Emissão', 'CNPJ/CPF', 'PF / PJ', 'CFOP', 'Código do Produto', 'Descrição do Produto', 'NCM', 'UN',
        'Quantidade', 'R$ Unitario', 'R$ Produto', 'Desconto R$', 'Vlr. Contabil R$', 'CST ICMS', 'R$ Base ICMS', '% ICMS',
        'R$ ICMS Declarado', 'R$ ICMS Recalculado', 'Divergencia ICMS R$', '% IPI', 'R$ IPI', 'Status Auditoria'
      ]
    ];

    sortedItems.forEach(item => {
      const cleanDocDigits = (item.cnpjEmitente || '').replace(/\D/g, '');
      const tipoPessoa = cleanDocDigits.length === 11 ? 'PF' : cleanDocDigits.length === 14 ? 'PJ' : '';
      const { codigo: splitCod, descricao: splitDesc } = splitProductCodeAndDesc(item.produto);
      const codigoProd = item.codigoProduto || splitCod || '';
      const descProd = item.descricaoProduto || splitDesc || item.produto || '';

      wsData.push([
        item.tipoOperacao,
        item.notaFiscal,
        item.dataEmissao,
        item.cnpjEmitente,
        tipoPessoa,
        item.cfop,
        codigoProd,
        descProd,
        item.ncm,
        item.unidade,
        item.quantidade,
        item.valorUnitario,
        item.valorProduto,
        item.desconto,
        item.valorContabil,
        item.cstIcms,
        item.baseCalculoIcms,
        item.aliquotaIcms,
        item.valorIcms,
        item.icmsRecalculated,
        item.icmsDivergence,
        item.aliquotaIpi,
        item.valorIpi,
        item.statusAudit
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 42 }, { wch: 12 }, { wch: 6 },
      { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 10 },
      { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 22 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Movimentação ICMS ERP');
    XLSX.writeFile(wb, filename);
  }
}
