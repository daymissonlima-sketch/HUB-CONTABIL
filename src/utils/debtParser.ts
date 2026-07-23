import { DebtItem, ClientInfo, DebtCategory } from '../types_debits';

// Helper to convert localized Brazilian numbers "1.234,56" to floats
function parseBrFloat(valStr: string): number {
  if (!valStr) return 0;
  const normalized = valStr.replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

// Helper to format competence/period to "mmm/aaaa" format (e.g., jan/2026, mai/2025)
export function formatCompetencia(rawPeriod: string): string {
  if (!rawPeriod) return '';
  const trimmed = rawPeriod.trim();
  if (!trimmed) return '';

  const MONTHS_MAP: Record<string, string> = {
    '1': 'jan', '01': 'jan', 'jan': 'jan', 'janeiro': 'jan',
    '2': 'fev', '02': 'fev', 'fev': 'fev', 'fevereiro': 'fev',
    '3': 'mar', '03': 'mar', 'mar': 'mar', 'março': 'mar', 'marco': 'mar',
    '4': 'abr', '04': 'abr', 'abr': 'abr', 'abril': 'abr',
    '5': 'mai', '05': 'mai', 'mai': 'mai', 'maio': 'mai',
    '6': 'jun', '06': 'jun', 'jun': 'jun', 'junho': 'jun',
    '7': 'jul', '07': 'jul', 'jul': 'jul', 'julho': 'jul',
    '8': 'ago', '08': 'ago', 'ago': 'ago', 'agosto': 'ago',
    '9': 'set', '09': 'set', 'set': 'set', 'setembro': 'set',
    '10': 'out', 'out': 'out', 'outubro': 'out',
    '11': 'nov', 'nov': 'nov', 'novembro': 'nov',
    '12': 'dez', 'dez': 'dez', 'dezembro': 'dez',
  };

  // Replace dots, dashes, spaces with clean slash separator
  const clean = trimmed.toLowerCase().replace(/[\.-]/g, '/').replace(/\s+/g, '');
  const parts = clean.split('/').filter(Boolean);

  if (parts.length === 3) {
    let day = parts[0];
    let monthStr = parts[1];
    let yearStr = parts[2];

    if (day.length === 4) {
      yearStr = parts[0];
      monthStr = parts[1];
    }

    if (yearStr.length === 2) yearStr = `20${yearStr}`;
    const month = MONTHS_MAP[monthStr] || monthStr;
    return `${month}/${yearStr}`;
  }

  if (parts.length === 2) {
    let monthStr = parts[0];
    let yearStr = parts[1];

    if (monthStr.length === 4 && yearStr.length <= 2) {
      const temp = monthStr;
      monthStr = yearStr;
      yearStr = temp;
    }

    if (yearStr.length === 2) yearStr = `20${yearStr}`;
    const month = MONTHS_MAP[monthStr] || monthStr;
    return `${month}/${yearStr}`;
  }

  return trimmed;
}

const MONTH_SORT_MAP: Record<string, number> = {
  'jan': 1, 'janeiro': 1, '1': 1, '01': 1,
  'fev': 2, 'fevereiro': 2, '2': 2, '02': 2,
  'mar': 3, 'marco': 3, 'março': 3, '3': 3, '03': 3,
  'abr': 4, 'abril': 4, '4': 4, '04': 4,
  'mai': 5, 'maio': 5, '5': 5, '05': 5,
  'jun': 6, 'junho': 6, '6': 6, '06': 6,
  'jul': 7, 'julho': 7, '7': 7, '07': 7,
  'ago': 8, 'agosto': 8, '8': 8, '08': 8,
  'set': 9, 'setembro': 9, '9': 9, '09': 9,
  'out': 10, 'outubro': 10, '10': 10,
  'nov': 11, 'novembro': 11, '11': 11,
  'dez': 12, 'dezembro': 12, '12': 12,
  '13': 13,
};

export function parseCompetenciaToSortKey(periodStr: string | undefined | null): number {
  if (!periodStr) return 0;
  const raw = String(periodStr).trim();
  if (!raw) return 0;

  // Replace dots, dashes, spaces with clean slash separator
  const clean = raw.toLowerCase().replace(/[\.-]/g, '/').replace(/\s+/g, '');
  const parts = clean.split('/').filter(Boolean);

  let year = 0;
  let month = 0;
  let day = 1;

  if (parts.length === 3) {
    let p0 = parts[0];
    let p1 = parts[1];
    let p2 = parts[2];

    if (p0.length === 4) {
      // YYYY/MM/DD
      year = parseInt(p0, 10);
      month = MONTH_SORT_MAP[p1] || parseInt(p1, 10) || 1;
      day = parseInt(p2, 10) || 1;
    } else {
      // DD/MM/YYYY
      day = parseInt(p0, 10) || 1;
      month = MONTH_SORT_MAP[p1] || parseInt(p1, 10) || 1;
      let yVal = parseInt(p2, 10);
      if (yVal < 100) yVal = yVal < 50 ? 2000 + yVal : 1900 + yVal;
      year = yVal;
    }
  } else if (parts.length === 2) {
    let p0 = parts[0];
    let p1 = parts[1];

    if (p0.length === 4 && p1.length <= 2) {
      // YYYY/MM
      year = parseInt(p0, 10);
      month = MONTH_SORT_MAP[p1] || parseInt(p1, 10) || 1;
    } else {
      // MM/YYYY or mmm/yyyy
      month = MONTH_SORT_MAP[p0] || parseInt(p0, 10) || 1;
      let yVal = parseInt(p1, 10);
      if (!isNaN(yVal)) {
        if (yVal < 100) yVal = yVal < 50 ? 2000 + yVal : 1900 + yVal;
        year = yVal;
      }
    }
  } else if (parts.length === 1) {
    const num = parseInt(parts[0], 10);
    if (!isNaN(num)) {
      if (num > 1000) year = num;
    }
  }

  if (isNaN(year) || year <= 0) return 0;
  if (isNaN(month) || month < 1) month = 1;
  if (month > 13) month = 13;
  if (isNaN(day) || day < 1) day = 1;
  if (day > 31) day = 31;

  return year * 10000 + month * 100 + day;
}

export function sortDebtsByCompetencia<T extends { period: string }>(debts: T[]): T[] {
  return [...debts].sort((a, b) => {
    const keyA = parseCompetenciaToSortKey(a.period);
    const keyB = parseCompetenciaToSortKey(b.period);
    if (keyA !== keyB) {
      return keyA - keyB;
    }
    return a.period.localeCompare(b.period);
  });
}

// Helper to split a CSV line properly, handling commas/semicolons and quotes
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  // Choose delimiter: prefer semicolon, fallback to comma if no semicolon but has comma
  let delimiter = ';';
  if (!line.includes(';') && line.includes(',')) {
    delimiter = ',';
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseSituationFiscalText(text: string, categories?: DebtCategory[]): {
  clientInfo: ClientInfo;
  debts: DebtItem[];
  warnings: string[];
} {
  const debts: DebtItem[] = [];
  const warnings: string[] = [];
  let clientInfo: ClientInfo = { cnpj: '', name: '' };

  if (!text || text.trim() === '') {
    return { clientInfo, debts, warnings };
  }

  const lines = text.split('\n');

  // 1. Try to parse CNPJ and Client Name (Razão Social) with an advanced robust scanner
  for (const line of lines) {
    const cleanLine = line.replace(/["']/g, '').trim();
    
    // Match CNPJ with various prefixes (colon, semicolon, comma, spaces)
    if (!clientInfo.cnpj) {
      const cnpjMatch = cleanLine.match(/(?:CNPJ|Inscrição|Cadastro)[:;,\s]+([\d\.\-\/]{14,18})/i);
      if (cnpjMatch) {
        clientInfo.cnpj = cnpjMatch[1].trim();
      } else {
        // Just search for any formatted CNPJ (e.g., xx.xxx.xxx/xxxx-xx) in the line
        const generalCnpjMatch = cleanLine.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
        if (generalCnpjMatch) {
          clientInfo.cnpj = generalCnpjMatch[0];
        } else {
          // Check for 14-digit continuous numbers
          const digitsCnpjMatch = cleanLine.match(/\b\d{14}\b/);
          if (digitsCnpjMatch) {
            clientInfo.cnpj = digitsCnpjMatch[0];
          }
        }
      }
    }

    // Match Client Name
    if (!clientInfo.name) {
      // Look for explicit Name / Razão Social indicators
      const nameMatch = cleanLine.match(/(?:Razão Social|Razao Social|Cliente|Nome|Empresa|Contribuinte|Nome\/Razão Social|Nome\/Razao Social)[:;,\s]+([A-Za-z0-9À-ÖØ-öø-ÿ\s\.,&\-]+)/i);
      if (nameMatch) {
        const potentialName = nameMatch[1].replace(/__________________+/g, '').trim();
        if (potentialName && potentialName.toUpperCase() !== 'NOME' && potentialName.toUpperCase() !== 'CLIENTE' && potentialName.toUpperCase() !== 'RAZAO SOCIAL') {
          clientInfo.name = potentialName;
        }
      }
    }
  }

  // Fallback for CNPJ and Name if they are in the same line after "-"
  if (!clientInfo.name || !clientInfo.cnpj) {
    for (const line of lines) {
      const cleanLine = line.replace(/["']/g, '').trim();
      if (cleanLine.includes('CNPJ:') || cleanLine.includes('CNPJ') || (clientInfo.cnpj && cleanLine.includes(clientInfo.cnpj))) {
        // Extract CNPJ if not already done
        if (!clientInfo.cnpj) {
          const cnpjMatch = cleanLine.match(/([\d\.\-\/]{14,18})/);
          if (cnpjMatch) clientInfo.cnpj = cnpjMatch[1].trim();
        }
        
        // Find other segments that could be the company name
        const parts = cleanLine.split(/[-;,\t]/);
        for (const part of parts) {
          const trimmed = part.replace(/(?:CNPJ|Inscrição|Cadastro)[:;,\s]*[\d\.\-\/]*/i, '').trim();
          if (trimmed && trimmed.length > 5 && !/^\d+$/.test(trimmed) && !trimmed.toUpperCase().includes('CERTIDÃO')) {
            clientInfo.name = trimmed;
            break;
          }
        }
      }
    }
  }

  // Additional fallback for Name standard pattern
  if (!clientInfo.name) {
    const rawMatch = text.match(/CNPJ:\s*[\d\.\-]+?\s*-\s*([A-Za-z0-9À-ÖØ-öø-ÿ\s]+(?:LTDA|S\/A|S\.A\.|ME|EPP|EIRELI|LIMITADA))/i);
    if (rawMatch) {
      clientInfo.name = rawMatch[1].trim();
    }
  }

  // SIEF: 1099-01 - CP-SEGUR. 01/2026 20/02/2026 440,00 440,00 88,00 19,22 547,22 DEVEDOR
  // SIMPLES NACIONAL. 03/2026 20/04/2026 298,84 298,84 59,76 6,18 364,78 DEVEDOR
  const siefRegex = /([\w\d\s\-\.]+?)\s+(\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+([\d\.,]+)\s+([\d\.,]+)\s+([\d\.,]+)\s+([\d\.,]+)\s+([\d\.,]+)(?:\s+([A-ZÀ-ÖØ-öø-ÿ\s\-]+))?/i;
  
  // Suspended Exigibility pattern (has fewer columns, e.g. 5 values instead of 7)
  // 4406-01 - MAED - PGDAS-D 21/05/2026 13/07/2026 50,00 50,00 A VENCER
  const suspendedRegex = /([\w\d\s\-\.]+?)\s+(\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+([\d\.,]+)\s+([\d\.,]+)\s+([A-ZÀ-ÖØ-öø-ÿ\s\-]+)/i;

  // Custom SEFAZ and SEFIN simplified copy-paste:
  const sefazRegex = /(ICMS|ISS|PIS|COFINS|IRPJ|CSLL|DAS)\s+(\d{2}\/\d{4})\s+(?:Principal\s+)?([\d\.,]+)\s+(?:Multa\s+)?([\d\.,]+)\s+(?:Juros\s+)?([\d\.,]+)/i;

  let currentParcelCategory = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // A) Check if CSV or structured line (either ; or , separated)
    if (line.includes(';') || (line.includes(',') && line.split(',').length >= 4)) {
      const parts = parseCsvLine(line);
      const firstColClean = parts[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
      // Skip headers
      if (firstColClean.includes('categoria') || 
          firstColClean.includes('cnpj') || 
          firstColClean.includes('nome') ||
          firstColClean.includes('referencia') ||
          firstColClean.includes('category') ||
          firstColClean.includes('codigo') ||
          firstColClean.includes('code') ||
          firstColClean.includes('competencia') ||
          firstColClean.includes('competence') ||
          parts[0].trim() === '') {
        if (firstColClean.includes('cnpj') && parts[1]) {
          clientInfo.cnpj = parts[1].trim();
        }
        if (firstColClean.includes('nome') && parts[1]) {
          clientInfo.name = parts[1].trim();
        }
        continue;
      }
      
      // 1. Ceará State SITRAM CSV Format detection
      // Headers: "Referência","Data vencimento","Código","Descrição","Vencido","Origem","Exigibilidade","Saldo R$"
      // e.g.: "01/09/2025","19/09/2025","1031","ICMS SUBSTITUICAO ENTRADA INTERESTADUAL","Sim","SITRAM","Sim","15,18"
      if (parts.length >= 8 && parts[0].includes('/') && parts[1].includes('/') && !parts[3].match(/^\d+$/)) {
        const rawRef = parts[0]; // e.g. "01/09/2025"
        let period = rawRef;
        const refParts = rawRef.split('/');
        if (refParts.length === 3) {
          period = `${refParts[1]}/${refParts[2]}`; // convert to MM/YYYY
        }
        
        const rawDesc = parts[3].trim().toUpperCase(); // Descrição e.g. "ICMS SUBSTITUICAO ENTRADA INTERESTADUAL"
        let category = rawDesc;
        if (rawDesc.includes('FECOP')) category = 'FECOP';
        else if (rawDesc.includes('ANTECIPA')) category = 'ICMS ANTECIPADO';
        else if (rawDesc.includes('SUBSTITU') || rawDesc.includes(' ST')) category = 'ICMS SUBSTITUIÇÃO TRIBUTÁRIA';
        else if (rawDesc.includes('DIVIDA') || rawDesc.includes('PGE')) category = 'ICMS DÍVIDA ATIVA';

        const principal = parseBrFloat(parts[7]); // "15,18" -> 15.18
        const isVencido = parts[4].toLowerCase().includes('sim');
        const status = isVencido ? 'DEVEDOR' : 'A VENCER';

        if (category && principal > 0) {
          debts.push({
            id: 'sitram-' + Math.random().toString(36).substr(2, 9),
            category: category,
            period,
            principal,
            penalty: 0,
            interest: 0,
            total: principal,
            status: status
          });
          continue;
        }
      }

      // 2. Exact 8-column CSV Import layout requested by user:
      // Category; Code; Competence; Value; Penalty amount; Interest amount; Total updated value; Situation
      // e.g.: DAS SIMPLES NACIONAL;1234;03/2026;298,84;59,76;6,18;364,78;DEVEDOR
      // Let's check if the row has 8 columns and looks like Category; Code/Other; Competence (contains / or digits); principal...
      const secondVal = parts[1]?.trim() || '';
      const thirdVal = parts[2]?.trim() || '';
      const looksLike8Col = parts.length === 8 || (parts.length >= 7 && (thirdVal.includes('/') || /^\d{2}\/\d{4}$/.test(thirdVal) || /^\d+$/.test(secondVal)));

      if (looksLike8Col && parts.length >= 6) {
        const rawCategory = parts[0].trim().toUpperCase();
        const code = parts[1]?.trim() || '';
        const period = parts[2]?.trim() || '01/2026';
        const principal = parseBrFloat(parts[3] || '0');
        const penalty = parts.length > 4 ? parseBrFloat(parts[4] || '0') : 0;
        const interest = parts.length > 5 ? parseBrFloat(parts[5] || '0') : 0;
        const totalVal = parts.length > 6 ? parseBrFloat(parts[6] || '0') : (principal + penalty + interest);
        const status = parts.length > 7 && parts[7]?.trim() ? parts[7].trim().toUpperCase() : 'DEVEDOR';

        if (rawCategory && principal > 0) {
          debts.push({
            id: 'csv-' + Math.random().toString(36).substr(2, 9),
            category: rawCategory,
            period,
            principal,
            penalty,
            interest,
            total: totalVal || (principal + penalty + interest),
            status: status as any
          });
          continue;
        }
      }

      // 3. Legacy Standard CSV Import template fallback (6-columns)
      // e.g.: DAS SIMPLES NACIONAL;03/2026;298,84;59,76;6,18;DEVEDOR
      if (parts.length >= 3) {
        const rawCategory = parts[0].trim().toUpperCase();
        const period = parts[1]?.trim() || '01/2026';
        const principal = parseBrFloat(parts[2] || '0');
        const penalty = parts.length > 3 ? parseBrFloat(parts[3] || '0') : 0;
        const interest = parts.length > 4 ? parseBrFloat(parts[4] || '0') : 0;
        const total = principal + penalty + interest;
        const status = parts.length > 5 && parts[5]?.trim() ? parts[5].trim().toUpperCase() : 'DEVEDOR';

        if (rawCategory && principal > 0) {
          debts.push({
            id: 'csv-' + Math.random().toString(36).substr(2, 9),
            category: rawCategory,
            period,
            principal,
            penalty,
            interest,
            total,
            status: status as any
          });
          continue;
        }
      }
    }

    // B) Detect parcel section category clues
    if (line.includes('MEI - EM PARCELAMENTO')) {
      currentParcelCategory = 'PARCELAMENTO MEI';
    } else if (line.includes('SIMPLES NACIONAL - EM PARCELAMENTO')) {
      currentParcelCategory = 'PARCELAMENTOS SIMPLES NACIONAL';
    } else if (line.includes('PREVIDENCIÁRIO') && line.includes('PARCELAMENTO')) {
      currentParcelCategory = 'PARCELAMENTOS PREVIDENCIÁRIOS';
    }

    // C) SIEF status on a secondary line: e.g. "Situação: A ANALISAR-A VENCER"
    if (line.includes('Situação:') || line.includes('Situacao:')) {
      const match = line.match(/(?:Situação|Situacao):\s*([A-ZÀ-ÖØ-öø-ÿ\s\-]+)/i);
      if (match && debts.length > 0) {
        debts[debts.length - 1].status = match[1].trim().toUpperCase();
      }
      continue;
    }

    // D) Match standard SIEF debt lines
    const siefMatch = line.match(siefRegex);
    if (siefMatch) {
      const rawCategory = siefMatch[1].trim();
      const period = siefMatch[2].trim();
      const principal = parseBrFloat(siefMatch[4]); // Sdo Devedor
      const penalty = parseBrFloat(siefMatch[5]); // Multa
      const juros = parseBrFloat(siefMatch[6]); // Juros
      const total = parseBrFloat(siefMatch[7]); // Total
      const status = siefMatch[8]?.trim() || 'DEVEDOR';

      let category = 'DAS SIMPLES NACIONAL';
      const uCategory = rawCategory.toUpperCase();
      
      const matchedCat = categories?.find(cat => cat.code && uCategory.includes(cat.code.trim().toUpperCase()));
      if (matchedCat) {
        category = matchedCat.title;
      } else if (uCategory.includes('CP-SEGUR') || uCategory.includes('INSS') || uCategory.includes('PREV')) {
        category = 'PARCELAMENTOS PREVIDENCIÁRIOS';
      } else if (uCategory.includes('SIMPLES NACIONAL') || uCategory.includes('PGDAS')) {
        category = 'DAS SIMPLES NACIONAL';
      } else if (uCategory.includes('FECOP')) {
        category = 'FECOP';
      } else if (uCategory.includes('ANTECIPA')) {
        category = 'ICMS ANTECIPADO';
      } else if (uCategory.includes('SUBSTITU') || uCategory.includes(' ST')) {
        category = 'ICMS SUBSTITUIÇÃO TRIBUTÁRIA';
      } else if (uCategory.includes('DIVIDA') || uCategory.includes('PGE')) {
        category = 'ICMS DÍVIDA ATIVA';
      } else if (uCategory.includes('PIS')) {
        category = 'PIS';
      } else if (uCategory.includes('COFINS')) {
        category = 'COFINS';
      } else if (uCategory.includes('IRPJ')) {
        category = 'IRPJ';
      } else if (uCategory.includes('CSLL')) {
        category = 'CSLL';
      } else if (uCategory.includes('ICMS')) {
        category = 'ICMS';
      } else if (uCategory.includes('ISS')) {
        category = 'ISS';
      } else {
        category = rawCategory.toUpperCase();
      }

      debts.push({
        id: Math.random().toString(36).substr(2, 9),
        category,
        period,
        principal,
        penalty,
        interest: juros,
        total,
        status: status.toUpperCase()
      });
      continue;
    }

    // E) Match Suspended Exigibility / fewer columns lines
    const suspendedMatch = line.match(suspendedRegex);
    if (suspendedMatch) {
      const rawCategory = suspendedMatch[1].trim();
      let period = suspendedMatch[2].trim();
      const pParts = period.split('/');
      if (pParts.length === 3) {
        period = `${pParts[1]}/${pParts[2]}`;
      }
      const principal = parseBrFloat(suspendedMatch[4]); // Sdo Devedor
      const status = suspendedMatch[5].trim().toUpperCase();

      let category = rawCategory.toUpperCase();
      const matchedCat = categories?.find(cat => cat.code && category.includes(cat.code.trim().toUpperCase()));
      if (matchedCat) {
        category = matchedCat.title;
      } else if (category.includes('PGDAS') || category.includes('SIMPLES NACIONAL')) {
        category = 'DAS SIMPLES NACIONAL';
      } else if (category.includes('DCTFWEB') || category.includes('SEGUR') || category.includes('INSS')) {
        category = 'PARCELAMENTOS PREVIDENCIÁRIOS';
      }

      debts.push({
        id: 'susp-' + Math.random().toString(36).substr(2, 9),
        category,
        period,
        principal,
        penalty: 0,
        interest: 0,
        total: principal,
        status: status + ' (SUSPENSO)'
      });
      continue;
    }

    // F) Match simplified SEFAZ/SEFIN lines
    const sefazMatch = line.match(sefazRegex);
    if (sefazMatch) {
      const rawTax = sefazMatch[1].toUpperCase();
      const period = sefazMatch[2];
      const principal = parseBrFloat(sefazMatch[3]);
      const penalty = parseBrFloat(sefazMatch[4]);
      const interest = parseBrFloat(sefazMatch[5]);
      const total = principal + penalty + interest;

      let category = 'DAS SIMPLES NACIONAL';
      if (rawTax === 'ICMS') category = 'ICMS';
      else if (rawTax === 'ISS') category = 'ISS';
      else if (rawTax === 'PIS') category = 'PIS';
      else if (rawTax === 'COFINS') category = 'COFINS';
      else if (rawTax === 'IRPJ') category = 'IRPJ';
      else if (rawTax === 'CSLL') category = 'CSLL';
      else if (rawTax === 'DAS') category = 'DAS SIMPLES NACIONAL';

      debts.push({
        id: Math.random().toString(36).substr(2, 9),
        category,
        period,
        principal,
        penalty,
        interest,
        total,
        status: 'DEVEDOR'
      });
      continue;
    }

    // G) Parse parcel info in SIEFPAR:
    if (line.includes('Parcelas em Atraso') && line.includes('Valor em Atraso')) {
      const valMatch = line.match(/Valor em Atraso:\s*([\d\.,]+)/i);
      const atrasoMatch = line.match(/Parcelas em Atraso:\s*(\d+)/i);
      if (valMatch) {
        const totalValue = parseBrFloat(valMatch[1]);
        const count = atrasoMatch ? parseInt(atrasoMatch[1], 10) : 1;
        
        let category = currentParcelCategory || 'PARCELAMENTOS PREVIDENCIÁRIOS';
        debts.push({
          id: Math.random().toString(36).substr(2, 9),
          category,
          period: `${count} Parc.`,
          principal: totalValue,
          penalty: 0,
          interest: 0,
          total: totalValue,
          status: 'EM ATRASO'
        });
      }
    }
  }

  // Fallback default client info if empty
  if (!clientInfo.cnpj && !clientInfo.name) {
    clientInfo = {
      cnpj: '',
      name: ''
    };
  }

  const sortedDebts = sortDebtsByCompetencia(debts);

  return { clientInfo, debts: sortedDebts, warnings };
}

// Quick samples for users to test
export const SAMPLE_RECEITA_FEDERAL = `
MINISTÉRIO DA FAZENDA Por meio do Portal de Serviços da Receita Federal
SECRETARIA ESPECIAL DA RECEITA FEDERAL DO BRASIL CNPJ do certificado: 12.345.678/0001-95
PROCURADORIA-GERAL DA FAZENDA NACIONAL 25/06/2026 08:43:01
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 12.345.678 - EMPRESA EXEMPLO COMERCIO E SERVICOS LTDA

Pendência - Parcelamento (PARCSN/PARCMEI) _______________________________________________________________________
CNPJ: 12.345.678/0001-95
MEI - EM PARCELAMENTO
Parcelas em atraso
5
SIMPLES NACIONAL - EM PARCELAMENTO
Parcelas em atraso
3

Pendência - Débito (SIEF) _______________________________________________________________________________________
CNPJ: 12.345.678/0001-95
Receita PA/Exerc. Dt. Vcto Vl. Original Sdo. Devedor Multa Juros Sdo. Dev. Cons. Situação
1099-01 - CP-SEGUR. 01/2026 20/02/2026 440,00 440,00 88,00 19,22 547,22 DEVEDOR
1099-01 - CP-SEGUR. 02/2026 20/03/2026 440,00 440,00 88,00 13,90 541,90 DEVEDOR
1099-01 - CP-SEGUR. 03/2026 20/04/2026 440,00 440,00 88,00 9,10 537,10 DEVEDOR
1099-01 - CP-SEGUR. 04/2026 20/05/2026 440,00 440,00 52,27 4,40 496,67 DEVEDOR
SIMPLES NACIONAL. 03/2026 20/04/2026 298,84 298,84 59,76 6,18 364,78 DEVEDOR

Pendência – Parcelamento (SIEFPAR) ______________________________________________________________________________
CNPJ: 12.345.678/0001-95
Parcelamento: 0211.00012.0013744355.26-73 Parcelas em Atraso: 3 Valor em Atraso: 1.589,34
Parcelamento Simplificado
`;

export const SAMPLE_SEFAZ = `
"Referência","Data vencimento","Código","Descrição","Vencido","Origem","Exigibilidade","Saldo R$"
"01/09/2025","19/09/2025","1031","ICMS SUBSTITUICAO ENTRADA INTERESTADUAL","Sim","SITRAM","Sim","15,18"
"01/08/2025","03/09/2025","1031","ICMS SUBSTITUICAO ENTRADA INTERESTADUAL","Sim","SITRAM","Sim","52,98"
"01/02/2025","17/02/2025","1031","ICMS SUBSTITUICAO ENTRADA INTERESTADUAL","Sim","SITRAM","Sim","99,93"
`;

export const SAMPLE_SEFIN = `
SEFIN - SECRETARIA MUNICIPAL DAS FINANÇAS
EXTRATO DE DÉBITOS EM ABERTO - ISSQN
CNPJ: 12.345.678/0001-95 - EMPRESA EXEMPLO COMERCIO E SERVICOS LTDA

ISS 03/2026 Principal 900,00 Multa 90,00 Juros 18,00
ISS 04/2026 Principal 1.150,00 Multa 115,00 Juros 23,00
`;
