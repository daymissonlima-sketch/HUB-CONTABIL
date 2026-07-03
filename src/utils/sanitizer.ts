/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Sanitizer Module
 * Proteção contra injeção de scripts (XSS) em conversores e processadores de XML/CSV.
 */

/**
 * Remove scripts malignos, eventos inline (onerror, onload) e URLs javascript: de strings brutas.
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    // Remove tags de script e style completas
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>.*?<\s*\/\s*\1\s*>/gis, '')
    // Remove tags auto-fechadas ou abertas prejudiciais
    .replace(/<\s*(script|iframe|object|embed|applet)[^>]*>/gis, '')
    // Remove atributos de eventos inline (onerror, onload, onclick, onmouseover, etc.)
    .replace(/\b(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gis, '')
    // Neutraliza prefixos javascript: e vbscript:
    .replace(/javascript\s*:/gis, 'blocked-js:')
    .replace(/vbscript\s*:/gis, 'blocked-vb:');
}

/**
 * Sanitiza o conteúdo bruto de um arquivo XML antes do DOMParser analisar.
 */
export function sanitizeXmlPayload(xmlText: string): string {
  if (!xmlText) return '';
  return sanitizeString(xmlText);
}

/**
 * Sanitiza campos individuais vindos de tabelas CSV ou Excel antes da renderização na UI.
 */
export function sanitizeCsvField(field: string): string {
  if (!field) return '';
  // Evita injeção de fórmulas CSV/Excel que começam com =, +, -, @
  let clean = sanitizeString(field.trim());
  if (/^[=+\-@]/.test(clean)) {
    clean = "'" + clean;
  }
  return clean;
}
