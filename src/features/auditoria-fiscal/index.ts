/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Feature: Auditoria Fiscal
 * Public API Entry Point
 */

export { AuditoriaFiscalWorkspace } from '../../components/AuditoriaFiscalWorkspace';
export { FornecedoresSimplesAuditor } from '../../components/FornecedoresSimplesAuditor';
export { AuditService } from '../../modules/audit/AuditService';
export * from '../../services/fornecedorSimplesService';
export type { ErpIcmsReportItem } from '../../modules/audit/erpIcms/ErpIcmsProcessor';
