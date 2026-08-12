/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReportType, AuditInputPayload, AuditExecutionResult } from '../types/AuditTypes';

export interface IAuditStrategy {
  readonly reportType: ReportType;
  readonly strategyName: string;
  readonly moduleVersion: string;

  /**
   * Sniffs the file content / filename to determine if this strategy can handle the report layout.
   */
  canHandle(content: string, filename?: string): boolean;

  /**
   * Executes the full isolated audit pipeline for the specific module.
   */
  process(input: AuditInputPayload): Promise<AuditExecutionResult>;
}
