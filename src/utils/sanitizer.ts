/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Sanitizer Module
 * Proteção ativa contra:
 * 1. XSS (Cross-Site Scripting) em inputs, payloads XML e renderizações.
 * 2. Injeção de Fórmulas CSV/Excel (CWE-1236).
 * 3. Injeção de Comandos / Operadores NoSQL / SQL em buscas e filtros.
 * 4. Validação estrita de Chaves de Acesso e Documentos Fiscais.
 */

/**
 * Remove scripts malignos, eventos inline (onerror, onload) e URLs javascript: de strings brutas.
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    // Remove tags de script, style, iframe, object, embed, applet e link completas
    .replace(/<\s*(script|style|iframe|object|embed|applet|meta|link)[^>]*>.*?<\s*\/\s*\1\s*>/gis, '')
    // Remove tags auto-fechadas ou abertas prejudiciais
    .replace(/<\s*(script|iframe|object|embed|applet|meta|link)[^>]*>/gis, '')
    // Remove atributos de eventos inline (onerror, onload, onclick, onmouseover, onfocus, etc.)
    .replace(/\b(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gis, '')
    // Neutraliza prefixos de schemas de script perigosos
    .replace(/javascript\s*:/gis, 'blocked-js:')
    .replace(/vbscript\s*:/gis, 'blocked-vb:')
    .replace(/data\s*:\s*text\/html/gis, 'blocked-data:');
}

/**
 * Escapa caracteres HTML especiais para prevenir injeção em contextos de texto renderizado.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitiza o conteúdo bruto de um arquivo XML antes do DOMParser analisar,
 * prevenindo ataques de expansão de entidades (XXE) e tags ativas.
 */
export function sanitizeXmlPayload(xmlText: string): string {
  if (!xmlText) return '';
  return xmlText
    // Remove declarações de DOCTYPE que contenham entidades externas (XXE mitigation)
    .replace(/<!DOCTYPE[^>]*\[.*?\]>/gis, '')
    .replace(/<!ENTITY[^>]*>/gis, '')
    .replace(/<\s*(script|iframe|embed|object)[^>]*>.*?<\s*\/\s*\1\s*>/gis, '');
}

/**
 * Sanitiza campos individuais exportados para CSV ou Excel (prevenção contra CSV Injection / CWE-1236).
 * Impede que fórmulas com =, +, -, @, \t, \r executem comandos maliciosos no software de planilha.
 */
export function sanitizeCsvField(field: string): string {
  if (!field) return '';
  let clean = sanitizeString(field.trim());
  // Se iniciar com caracteres de comando de fórmula no Excel/Calc, prefixa com apóstrofo
  if (/^[=+\-@\t\r]/.test(clean)) {
    clean = "'" + clean;
  }
  return clean;
}

/**
 * Sanitiza termos de pesquisa e filtros do usuário, neutralizando injeções SQL,
 * caracteres de escape de regex e operadores NoSQL ($where, $regex, $gt, etc.).
 */
export function sanitizeSearchQuery(query: string): string {
  if (typeof query !== 'string') return '';
  return query
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // remove caracteres de controle ASCII
    .replace(/\$where|\$gt|\$lt|\$ne|\$regex|\$in/gi, '') // neutraliza operadores NoSQL
    .replace(/['";\\]/g, '') // remove aspas e barras usadas em SQL injection
    .trim()
    .slice(0, 150); // limita tamanho para prevenir DoS por queries gigantes
}

/**
 * Sanitiza parâmetros vindos de URL ou Hash, garantindo apenas caracteres alfanuméricos seguros.
 */
export function sanitizeUrlParam(param: string): string {
  if (typeof param !== 'string') return '';
  return param.replace(/[^a-zA-Z0-9_\-\.]/g, '').slice(0, 100);
}

/**
 * Sanitiza a entrada de Chave de Acesso da NF-e/NFC-e removendo tudo que não for dígito numérico.
 */
export function cleanAccessKey(key: string): string {
  if (typeof key !== 'string') return '';
  return key.replace(/[^0-9]/g, '');
}

/**
 * Valida se a chave de acesso possui exatamente 44 dígitos numéricos válidos.
 */
export function isAccessKeyValid(key: string): boolean {
  return typeof key === 'string' && /^[0-9]{44}$/.test(key);
}

/**
 * Sanitiza o CNPJ removendo pontos (.), barras (/), traços (-) e espaços.
 */
export function sanitizeCnpjDigits(cnpj: string): string {
  if (typeof cnpj !== 'string') return '';
  return cnpj.replace(/[.\-\/\s]/g, '').replace(/[^0-9]/g, '');
}

/**
 * Valida se o CNPJ sanitizado possui exatamente 14 dígitos numéricos.
 */
export function isCnpjValidLength(cnpj: string): boolean {
  return typeof cnpj === 'string' && /^[0-9]{14}$/.test(cnpj);
}

