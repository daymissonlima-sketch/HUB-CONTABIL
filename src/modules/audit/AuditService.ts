/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SERVIÇO UNIFICADO DE AUDITORIA FISCAL (FAÇADE API)
 * Ponto de entrada único que roteia as requisições para o Módulo correspondente
 * sem interferir no core de processamento interno de cada um.
 */

import { AuditInputPayload, AuditExecutionResult, ReportType } from './types/AuditTypes';
import { AuditProcessorFactory } from './factory/AuditProcessorFactory';

export class AuditService {
  /**
   * Unified entrance point for file auditing.
   * Directs the file to Módulo 1 (SIGA), Módulo 2 (ERP ICMS), or Módulo 3 (ERP PIS/COFINS).
   */
  public static async processReport(payload: AuditInputPayload): Promise<AuditExecutionResult> {
    if (!payload || !payload.content) {
      throw new Error('Conteúdo do arquivo não fornecido para auditoria.');
    }

    // Resolve processor using Factory/Strategy
    const processor = AuditProcessorFactory.resolveProcessor(payload);

    // Execute in isolated strategy context
    return await processor.process(payload);
  }

  /**
   * Auto-detects the report type without executing the full audit.
   */
  public static detectReportType(content: string, filename?: string): ReportType {
    return AuditProcessorFactory.detectReportType(content, filename);
  }

  /**
   * Returns list of supported modular audit engines for UI options.
   */
  public static getAvailableModules(): { type: ReportType; name: string; description: string; status: string }[] {
    return [
      {
        type: 'SIGA',
        name: 'Módulo 1: Relatório SIGA',
        description: 'Auditoria homologada de relatórios SIGA/SEFAZ (Entradas e Saídas com deduplicação).',
        status: 'Homologado / Estável'
      },
      {
        type: 'ERP_ICMS',
        name: 'Módulo 2: ERP - Movimentação ICMS',
        description: 'Parsing e validação tributária isolada para relatórios ERP contábeis de ICMS.',
        status: 'Ativo'
      },
      {
        type: 'ERP_PIS_COFINS',
        name: 'Módulo 3: ERP - PIS & COFINS',
        description: 'Auditoria fiscal de PIS/COFINS do ERP com apuração por CST e regras de crédito.',
        status: 'Ativo'
      }
    ];
  }
}
