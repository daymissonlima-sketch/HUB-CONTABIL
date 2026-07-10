/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Utility for sanitizing and standardizing Electronic Invoice Access Keys (Model 55 and 65).
 */

/**
 * Sanitizes the raw key input by removing any character that is not a numeric digit.
 * Uses the regex /[^0-9]/g as per business rules.
 * 
 * @param key The raw input string
 * @returns The sanitized sequence of digits
 */
export function cleanAccessKey(key: string): string {
  if (typeof key !== 'string') return '';
  return key.replace(/[^0-9]/g, '');
}

/**
 * Validates if the sanitized key has exactly 44 digits (the national standard length for electronic documents).
 * 
 * @param key The sanitized key
 * @returns boolean
 */
export function isAccessKeyValid(key: string): boolean {
  return key.length === 44;
}
