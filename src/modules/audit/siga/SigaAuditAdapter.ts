/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MÓDULO 1: RELATÓRIO SIGA (ADAPTER ISOLADO)
 * RESTRIÇÃO CRÍTICA: Não altera a lógica interna existente do SIGA.
 * Atua como Adapter isolado encapsulando as funções homologadas.
 */

import { IAuditStrategy } from '../core/IAuditStrategy';
import { 
  ReportType, 
  AuditInputPayload, 
  AuditExecutionResult, 
  AuditValidationError, 
  AuditExecutionSummary 
} from '../types/AuditTypes';
import { 
  parseSigaFullReport, 
  parseSigaChannelFile, 
  identifySigaDuplicates, 
  exportSigaAuditExcel,
  SigaReportItem,
  SigaReportMetadata
} from '../../../utils/auditHelper';

export class SigaAuditAdapter implements IAuditStrategy {
  public readonly reportType: ReportType = 'SIGA';
  public readonly strategyName: string = 'Módulo 1: Auditoria SIGA (Homologado)';
  public readonly moduleVersion: string = '1.0.0-STABLE';

  public canHandle(content: string, filename?: string): boolean {
    if (!content) return false;
    const lowerContent = content.toLowerCase();
    const lowerFilename = (filename || '').toLowerCase();

    if (
      lowerFilename.includes('siga') || 
      lowerFilename.includes('sefaz_siga') ||
      lowerFilename.includes('nfc') ||
      lowerFilename.includes('informações fiscais') ||
      lowerFilename.includes('informacoes fiscais')
    ) {
      return true;
    }

    return (
      lowerContent.includes('notas fiscais de entrada') ||
      lowerContent.includes('notas fiscais de saída') ||
      lowerContent.includes('notas fiscais de saida') ||
      lowerContent.includes('sl distribuidora') ||
      lowerContent.includes('distribuidora de produtos alimenticio') ||
      lowerContent.includes('nfc-e') ||
      lowerContent.includes('nfce') ||
      lowerContent.includes('informações fiscais') ||
      lowerContent.includes('informacoes fiscais') ||
      (lowerContent.includes('cnpj') && lowerContent.includes('cfop') && lowerContent.includes('chave de acesso'))
    );
  }

  public async process(input: AuditInputPayload): Promise<AuditExecutionResult<SigaReportItem>> {
    const { content, filename, operationType, customConfig } = input;
    const startTime = new Date().toISOString();

    let items: SigaReportItem[] = [];
    let metadata: SigaReportMetadata = { empresa: 'EMPRESA SIGA', periodo: 'Período', dataGeracao: new Date().toLocaleDateString('pt-BR') };

    // Isolated invocation based on channel or full report mode
    if (operationType === 'ENTRADA') {
      const channelResult = parseSigaChannelFile(content, 'ENTRADA');
      items = channelResult.items;
      metadata = channelResult.metadata;
    } else if (operationType === 'SAIDA') {
      const channelResult = parseSigaChannelFile(content, 'SAIDA');
      items = channelResult.items;
      metadata = channelResult.metadata;
    } else {
      const fullReport = parseSigaFullReport(content);
      items = [...fullReport.entradas, ...fullReport.saidas];
      metadata = fullReport.metadata;
    }

    // Deduplication audit using the unchanged, homologated function
    const { itemsWithStatus, summary: deduplicationSummary } = identifySigaDuplicates(items);

    // Map errors
    const validationErrors: AuditValidationError[] = itemsWithStatus
      .filter(item => item.isDuplicate)
      .map((item, index) => ({
        id: `err-siga-dup-${index}`,
        severity: 'WARNING',
        code: 'DUPLICIDADE_SIGA',
        message: `Registro duplicado detectado para a NF ${item.notaFiscal} - Valor R$ ${item.vlrContabil.toFixed(2)}`,
        documentNumber: item.notaFiscal,
        field: 'deduplicationKey',
        foundValue: item.deduplicationKey
      }));

    const summary: AuditExecutionSummary = {
      reportType: 'SIGA',
      totalRecords: deduplicationSummary.totalProcessed,
      validRecords: deduplicationSummary.uniqueRecords,
      divergentRecords: deduplicationSummary.duplicateCount,
      duplicateRecords: deduplicationSummary.duplicateCount,
      totalValue: deduplicationSummary.originalTotalValue,
      totalTaxValue: itemsWithStatus.reduce((acc, item) => acc + (item.rIcms || 0), 0),
      sanitizedTotalValue: deduplicationSummary.sanitizedTotalValue,
      criticalErrorsCount: 0,
      warningCount: validationErrors.length
    };

    const entradas = itemsWithStatus.filter(i => i.tipoOperacao === 'ENTRADA');
    const saidas = itemsWithStatus.filter(i => i.tipoOperacao === 'SAIDA');

    return {
      success: true,
      reportType: 'SIGA',
      moduleName: this.strategyName,
      moduleVersion: this.moduleVersion,
      timestamp: startTime,
      metadata: {
        empresa: metadata.empresa,
        periodo: metadata.periodo,
        dataGeracao: metadata.dataGeracao,
        totalLinhasLidas: items.length,
        moduloVersao: this.moduleVersion
      },
      items: itemsWithStatus,
      summary,
      validationErrors,
      exportExcel: (outFilename?: string) => {
        exportSigaAuditExcel({
          entradas,
          saidas,
          metadata,
          filename: outFilename || filename || `Auditoria_SIGA_${Date.now()}.xlsx`
        });
      }
    };
  }
}
