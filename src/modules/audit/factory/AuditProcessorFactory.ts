/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * FACTORY & ROUTER DE MÓDULOS DE AUDITORIA FISCAL
 * Instancia dinamicamente o Módulo apropriado (SIGA, ERP ICMS, ERP PIS/COFINS)
 * garantindo isolamento total de memória, contexto e execução.
 */

import { IAuditStrategy } from '../core/IAuditStrategy';
import { ReportType, AuditInputPayload } from '../types/AuditTypes';
import { SigaAuditAdapter } from '../siga/SigaAuditAdapter';
import { ErpIcmsProcessor } from '../erpIcms/ErpIcmsProcessor';
import { ErpPisCofinsProcessor } from '../erpPisCofins/ErpPisCofinsProcessor';

export class AuditProcessorFactory {
  /**
   * Automatically detects the report layout type based on file signature, headers, or filename.
   */
  public static detectReportType(content: string, filename?: string): ReportType {
    if (!content) return 'SIGA';

    const sigaAdapter = new SigaAuditAdapter();
    const erpIcmsProcessor = new ErpIcmsProcessor();
    const erpPisCofinsProcessor = new ErpPisCofinsProcessor();

    // Priority 1: Check Filename Hints
    const lowerFilename = (filename || '').toLowerCase();
    if (lowerFilename.includes('siga')) return 'SIGA';
    if (lowerFilename.includes('pis') || lowerFilename.includes('cofins')) return 'ERP_PIS_COFINS';
    if (lowerFilename.includes('icms')) return 'ERP_ICMS';

    // Priority 2: Check Strategy Capabilities
    if (erpPisCofinsProcessor.canHandle(content, filename)) return 'ERP_PIS_COFINS';
    if (erpIcmsProcessor.canHandle(content, filename)) return 'ERP_ICMS';
    if (sigaAdapter.canHandle(content, filename)) return 'SIGA';

    // Default Fallback
    return 'SIGA';
  }

  /**
   * Factory method to obtain an isolated strategy instance.
   * Guarantees a clean, unpolluted instance for every audit run.
   */
  public static getProcessor(reportType: ReportType, customConfig?: Record<string, any>): IAuditStrategy {
    switch (reportType) {
      case 'SIGA':
        return new SigaAuditAdapter();

      case 'ERP_ICMS':
        return new ErpIcmsProcessor(customConfig);

      case 'ERP_PIS_COFINS':
        return new ErpPisCofinsProcessor(customConfig);

      default:
        throw new Error(`Módulo de Auditoria não suportado: ${reportType}`);
    }
  }

  /**
   * Resolves the target processor from payload (explicit forceType or auto-detection).
   */
  public static resolveProcessor(payload: AuditInputPayload): IAuditStrategy {
    const targetType = payload.forceType || this.detectReportType(payload.content, payload.filename);
    return this.getProcessor(targetType, payload.customConfig);
  }
}
