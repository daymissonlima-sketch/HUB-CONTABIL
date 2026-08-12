/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ReportType = 'SIGA' | 'ERP_ICMS' | 'ERP_PIS_COFINS';

export type AuditOperationType = 'ENTRADA' | 'SAIDA' | 'AMBOS';

export type ValidationErrorSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface AuditValidationError {
  id: string;
  severity: ValidationErrorSeverity;
  code: string;
  message: string;
  rowNumber?: number;
  documentNumber?: string;
  field?: string;
  expectedValue?: string | number;
  foundValue?: string | number;
}

export interface BaseAuditMetadata {
  empresa: string;
  cnpjEmpresa?: string;
  periodo: string;
  dataGeracao: string;
  totalLinhasLidas: number;
  moduloVersao: string;
}

export interface AuditInputPayload {
  content: string;
  filename?: string;
  forceType?: ReportType;
  operationType?: AuditOperationType;
  customConfig?: Record<string, any>;
}

export interface AuditExecutionSummary {
  reportType: ReportType;
  totalRecords: number;
  validRecords: number;
  divergentRecords: number;
  duplicateRecords: number;
  totalValue: number;
  totalTaxValue: number;
  sanitizedTotalValue: number;
  criticalErrorsCount: number;
  warningCount: number;
}

export interface AuditExecutionResult<T = any> {
  success: boolean;
  reportType: ReportType;
  moduleName: string;
  moduleVersion: string;
  timestamp: string;
  metadata: BaseAuditMetadata;
  items: T[];
  summary: AuditExecutionSummary;
  validationErrors: AuditValidationError[];
  exportExcel: (filename?: string) => void;
}
