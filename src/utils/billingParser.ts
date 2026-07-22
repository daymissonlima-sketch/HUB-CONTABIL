/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Company, FaturamentoItem } from '../types_debits';
import { calculateEstimatedTaxes } from './taxEstimator';

// Helper to format CNPJ nicely
const formatCNPJ = (val: string) => {
  const clean = val.replace(/\D/g, "");
  if (clean.length <= 2) return clean;
  if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`;
  if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
  if (clean.length <= 12) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`;
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
};

export const identifyCompanyForFile = (
  fileName: string, 
  csvContent: string, 
  currentCompanies: Company[]
): { company: Company | null; identifiedCnpj: string | null } => {
  const cnpjRegex = /(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})/;
  const matchFileName = fileName.match(cnpjRegex);
  if (matchFileName) {
    const cleanCnpj = matchFileName[0].replace(/\D/g, "");
    if (cleanCnpj.length === 14) {
      const found = currentCompanies.find(c => c.cnpj.replace(/\D/g, "") === cleanCnpj);
      if (found) return { company: found, identifiedCnpj: cleanCnpj };
      return { company: null, identifiedCnpj: cleanCnpj };
    }
  }

  const digits14Regex = /\d{14}/;
  const matchDigits = fileName.match(digits14Regex);
  if (matchDigits) {
    const cleanCnpj = matchDigits[0];
    const found = currentCompanies.find(c => c.cnpj.replace(/\D/g, "") === cleanCnpj);
    if (found) return { company: found, identifiedCnpj: cleanCnpj };
    return { company: null, identifiedCnpj: cleanCnpj };
  }

  const lines = csvContent.split('\n');
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i];
    const matchContent = line.match(cnpjRegex);
    if (matchContent) {
      const cleanCnpj = matchContent[0].replace(/\D/g, "");
      if (cleanCnpj.length === 14) {
        const found = currentCompanies.find(c => c.cnpj.replace(/\D/g, "") === cleanCnpj);
        if (found) return { company: found, identifiedCnpj: cleanCnpj };
        return { company: null, identifiedCnpj: cleanCnpj };
      }
    }
    
    const matchDigitsContent = line.match(digits14Regex);
    if (matchDigitsContent) {
      const cleanCnpj = matchDigitsContent[0];
      const found = currentCompanies.find(c => c.cnpj.replace(/\D/g, "") === cleanCnpj);
      if (found) return { company: found, identifiedCnpj: cleanCnpj };
      return { company: null, identifiedCnpj: cleanCnpj };
    }
  }

  const lowerFileName = fileName.toLowerCase();
  for (const company of currentCompanies) {
    const lowerRazao = company.razaoSocial.toLowerCase().trim();
    if (lowerRazao && (lowerFileName.includes(lowerRazao) || csvContent.toLowerCase().includes(lowerRazao))) {
      return { company, identifiedCnpj: company.cnpj.replace(/\D/g, "") };
    }
    const cleanRazao = lowerRazao.replace(/[^a-z0-9]/g, '');
    if (cleanRazao.length > 5) {
      const cleanFileName = lowerFileName.replace(/[^a-z0-9]/g, '');
      const cleanContent = csvContent.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanFileName.includes(cleanRazao) || cleanContent.includes(cleanRazao)) {
        return { company, identifiedCnpj: company.cnpj.replace(/\D/g, "") };
      }
    }
  }

  return { company: null, identifiedCnpj: null };
};

// Helper to split CSV line respecting quotes
export const splitCsvLine = (line: string, delimiter: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
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
};

// Helper to convert Excel serial date to Date object
export const parseExcelSerialDate = (serial: number): Date => {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
};

export const parseFaturamentoFromCsv = (csvContent: string, company: Company): FaturamentoItem[] => {
  const cleanContent = csvContent.replace(/^\uFEFF/, '').trim();
  const lines = cleanContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items: FaturamentoItem[] = [];
  
  const ptMonths: { [key: string]: number } = {
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4, 'maio': 5, 'junho': 6,
    'julho': 7, 'agosto': 8, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12, 'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6
  };

  const parseNumericValue = (valStr: string): number => {
    if (!valStr) return 0;
    const clean = valStr.replace(/[R$\s"]/gi, '').trim();
    if (!clean) return 0;
    
    if (clean.includes(',') && clean.includes('.')) {
      if (clean.indexOf('.') < clean.indexOf(',')) {
        return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
      } else {
        return parseFloat(clean.replace(/,/g, '')) || 0;
      }
    } else if (clean.includes(',')) {
      const parts = clean.split(',');
      if (parts[1].length === 2 || parts[1].length === 1) {
        return parseFloat(clean.replace(',', '.')) || 0;
      } else {
        return parseFloat(clean.replace(',', '')) || 0;
      }
    } else {
      return parseFloat(clean) || 0;
    }
  };

  // Detect delimiter
  let delimiter = ';';
  const firstLineWithDelim = lines.find(l => l.includes(';') || l.includes(','));
  if (firstLineWithDelim) {
    const semicolonCount = (firstLineWithDelim.match(/;/g) || []).length;
    const commaCount = (firstLineWithDelim.match(/,/g) || []).length;
    if (semicolonCount >= commaCount) {
      delimiter = ';';
    } else {
      delimiter = ',';
    }
  }

  // Attempt to identify columns based on header matching
  let monthColIdx = -1;
  let yearColIdx = -1;
  let faturamentoColIdx = -1;

  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i];
    if (line.startsWith('---') || line.startsWith('===')) continue;
    
    const cells = splitCsvLine(line, delimiter);
    
    const mIdx = cells.findIndex(c => {
      const val = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      return val === 'mes' || val.includes('competencia') || val.includes('periodo') || val === 'data' || val === 'mesano' || val === 'compet' || val === 'meses';
    });

    const yIdx = cells.findIndex(c => {
      const val = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      return val === 'ano' || val === 'anos';
    });

    // Tier 1: Look for exact or highly specific total billing column matches
    let fIdx = cells.findIndex(c => {
      const val = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      return val === 'total' || val === 'totalr' || val === 'totalr$' || val === 'faturamentototal' || val === 'receitatotal' || val === 'totalfaturamento' || val === 'faturamentototalr';
    });

    // Tier 2: Look for cells containing 'total' (e.g., 'Total R$', 'Faturamento Total', 'Total Geral')
    if (fIdx === -1) {
      fIdx = cells.findIndex(c => {
        const val = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        return val.includes('total') || val.includes('faturamentototal') || val.includes('receitatotal');
      });
    }

    // Tier 3: Look for general billing/faturamento or receita matches
    if (fIdx === -1) {
      fIdx = cells.findIndex(c => {
        const val = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        return val.includes('faturamento') || val.includes('receita');
      });
    }

    // Tier 4: Look for saidas or valor
    if (fIdx === -1) {
      fIdx = cells.findIndex(c => {
        const val = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        return val.includes('saidas') || val.includes('valor');
      });
    }

    if (mIdx !== -1) {
      monthColIdx = mIdx;
    }
    if (yIdx !== -1 && yIdx !== mIdx) {
      yearColIdx = yIdx;
    }
    if (fIdx !== -1 && fIdx !== mIdx && fIdx !== yIdx) {
      faturamentoColIdx = fIdx;
    }

    if (monthColIdx !== -1 && faturamentoColIdx !== -1) {
      break;
    }
  }

  // Now loop over every line to extract the data
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    const lowerLine = line.toLowerCase();
    if (
      lowerLine.includes('emissao') || 
      lowerLine.includes('emissáo') || 
      lowerLine.includes('emissão') ||
      lowerLine.includes('periodo') || 
      lowerLine.includes('período') ||
      lowerLine.includes('empresa:') ||
      lowerLine.includes('cnpj:') ||
      lowerLine.includes('cidade:') ||
      lowerLine.includes('endereco') ||
      lowerLine.includes('endereço') ||
      lowerLine.includes('insc.est') ||
      lowerLine.includes('inscricao') ||
      lowerLine.includes('inscrição') ||
      lowerLine.includes('relatorio') ||
      lowerLine.includes('relatório') ||
      lowerLine.includes('pagina') ||
      lowerLine.includes('página') ||
      lowerLine.includes('competencia') ||
      lowerLine.includes('competência') ||
      lowerLine.includes('faturamento bruto') ||
      lowerLine.includes('vendas a vista') ||
      lowerLine.includes('vendas a prazo') ||
      lowerLine.includes('m e s') ||
      lowerLine.includes('m ê s') ||
      lowerLine.includes('totais') ||
      lowerLine.includes('total geral') ||
      lowerLine.includes('soma') ||
      lowerLine.includes('gerado') ||
      lowerLine.includes('geracao') ||
      lowerLine.includes('geração') ||
      lowerLine.includes('impressao') ||
      lowerLine.includes('impressão') ||
      lowerLine.includes('impresso') ||
      lowerLine.includes('emitido') ||
      lowerLine.includes('extraido') ||
      lowerLine.includes('extraído') ||
      lowerLine.includes('data de') ||
      lowerLine.includes('data/hora') ||
      lowerLine.includes('data e hora') ||
      lowerLine.includes('hora:') ||
      lowerLine.includes('sistema') ||
      lowerLine.includes('usuario') ||
      lowerLine.includes('usuário') ||
      lowerLine.includes('operador') ||
      lowerLine.includes('faturamento gerador') ||
      lowerLine.includes('gerador') ||
      lowerLine.includes('data:')
    ) {
      continue;
    }
    
    // Skip obvious dividers or total lines
    if (line.startsWith('---') || line.startsWith('===') || line.toLowerCase().startsWith('totais') || line.toLowerCase().includes('soma')) {
      continue;
    }

    // Strip full dates like DD/MM/YYYY to avoid partial matching as MM/YYYY (removing \b for safety)
    line = line.replace(/\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}/g, '');
    // Strip Portuguese written dates like "17 de julho de 2026" or "17 de julho de 26"
    line = line.replace(/\d{1,2}\s+de\s+[a-zA-Z\u00C0-\u00FF]+\s+de\s+\d{2,4}/gi, '');

    const cells = splitCsvLine(line, delimiter);
    if (cells.length < 2) continue;

    // Skip total rows inside cells
    const hasTotalWord = cells.some(c => {
      const val = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      return val === 'totais' || val === 'total';
    });
    if (hasTotalWord) continue;

    // Check if this row is a data row by inspecting cells for month & year
    let rowMonthNum = -1;
    let rowYearNum = -1;
    let rowMonthIdx = -1;
    let rowYearIdx = -1;

    cells.forEach((cell, idx) => {
      const cleanCell = cell.replace(/["']/g, '').trim().toLowerCase();
      
      // Match Portuguese month
      if (ptMonths[cleanCell] !== undefined) {
        rowMonthNum = ptMonths[cleanCell];
        rowMonthIdx = idx;
      } else {
        // Try normalized
        const normalizedCell = cleanCell.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (ptMonths[normalizedCell] !== undefined) {
          rowMonthNum = ptMonths[normalizedCell];
          rowMonthIdx = idx;
        }
      }
      
      // Match 4-digit year
      const parsedYear = parseInt(cleanCell);
      if (!isNaN(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100 && cleanCell.length === 4) {
        rowYearNum = parsedYear;
        rowYearIdx = idx;
      }
    });

    // If we identified a month and a year in this row, process it!
    if (rowMonthNum !== -1 && rowYearNum !== -1) {
      const competencia = `${rowMonthNum.toString().padStart(2, '0')}/${rowYearNum}`;
      
      // Find the faturamento total cell
      let valIdx = faturamentoColIdx;
      if (valIdx === -1 || valIdx === rowMonthIdx || valIdx === rowYearIdx) {
        // If no faturamento column is explicitly identified, use cells[5] if present, otherwise the last column
        if (cells.length > 5 && 5 !== rowMonthIdx && 5 !== rowYearIdx) {
          valIdx = 5;
        } else {
          // Find the last column that is not empty and is not the month or year
          valIdx = cells.length - 1;
          while (valIdx > 0 && (valIdx === rowMonthIdx || valIdx === rowYearIdx || cells[valIdx].trim() === '')) {
            valIdx--;
          }
        }
      }

      const rawVal = cells[valIdx];
      let faturamentoTotal = 0;
      if (rawVal) {
        faturamentoTotal = parseNumericValue(rawVal);
      }

      if (isNaN(faturamentoTotal) || faturamentoTotal < 0) {
        continue;
      }

      const vendaVista = faturamentoTotal * (company.vendaVistaPercent / 100);
      const vendaPrazo = faturamentoTotal * (company.vendaPrazoPercent / 100);
      const estimatedTaxes = calculateEstimatedTaxes(faturamentoTotal, company.regimeTributario);

      const existingIdx = items.findIndex(item => item.competencia === competencia);
      if (existingIdx !== -1) {
        items[existingIdx] = {
          id: items[existingIdx].id,
          competencia,
          faturamentoTotal,
          vendaVista,
          vendaPrazo,
          estimatedTaxes
        };
      } else {
        items.push({
          id: `fat_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          competencia,
          faturamentoTotal,
          vendaVista,
          vendaPrazo,
          estimatedTaxes
        });
      }
    }
  }

  // Sort competence items chronologically
  items.sort((a, b) => {
    const [mA, yA] = a.competencia.split('/').map(Number);
    const [mB, yB] = b.competencia.split('/').map(Number);
    const yearA = yA < 100 ? 2000 + yA : yA;
    const yearB = yB < 100 ? 2000 + yB : yB;
    if (yearA !== yearB) return yearA - yearB;
    return mA - mB;
  });

  return items;
};

export const parseFaturamentoFromPdfDirect = (pdfContent: string, company: Company): FaturamentoItem[] => {
  const lines = pdfContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items: FaturamentoItem[] = [];
  const ptMonths: { [key: string]: number } = {
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4, 'maio': 5, 'junho': 6,
    'julho': 7, 'agosto': 8, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12, 'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6
  };

  const parseNumericValue = (valStr: string): number => {
    if (!valStr) return 0;
    const clean = valStr.replace(/[R$\s"]/gi, '').trim();
    if (!clean) return 0;
    if (clean.includes(',') && clean.includes('.')) {
      if (clean.indexOf('.') < clean.indexOf(',')) {
        return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
      } else {
        return parseFloat(clean.replace(/,/g, '')) || 0;
      }
    } else if (clean.includes(',')) {
      const parts = clean.split(',');
      if (parts[1].length === 2 || parts[1].length === 1) {
        return parseFloat(clean.replace(',', '.')) || 0;
      } else {
        return parseFloat(clean.replace(',', '')) || 0;
      }
    } else {
      return parseFloat(clean) || 0;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const lowerLine = line.toLowerCase();
    if (
      lowerLine.includes('emissao') || 
      lowerLine.includes('emissáo') || 
      lowerLine.includes('emissão') ||
      lowerLine.includes('periodo') || 
      lowerLine.includes('período') ||
      lowerLine.includes('empresa:') ||
      lowerLine.includes('cnpj:') ||
      lowerLine.includes('cidade:') ||
      lowerLine.includes('endereco') ||
      lowerLine.includes('endereço') ||
      lowerLine.includes('insc.est') ||
      lowerLine.includes('inscricao') ||
      lowerLine.includes('inscrição') ||
      lowerLine.includes('relatorio') ||
      lowerLine.includes('relatório') ||
      lowerLine.includes('pagina') ||
      lowerLine.includes('página') ||
      lowerLine.includes('competencia') ||
      lowerLine.includes('competência') ||
      lowerLine.includes('faturamento bruto') ||
      lowerLine.includes('vendas a vista') ||
      lowerLine.includes('vendas a prazo') ||
      lowerLine.includes('m e s') ||
      lowerLine.includes('m ê s') ||
      lowerLine.includes('totais') ||
      lowerLine.includes('total geral') ||
      lowerLine.includes('soma') ||
      lowerLine.includes('gerado') ||
      lowerLine.includes('geracao') ||
      lowerLine.includes('geração') ||
      lowerLine.includes('impressao') ||
      lowerLine.includes('impressão') ||
      lowerLine.includes('impresso') ||
      lowerLine.includes('emitido') ||
      lowerLine.includes('extraido') ||
      lowerLine.includes('extraído') ||
      lowerLine.includes('data de') ||
      lowerLine.includes('data/hora') ||
      lowerLine.includes('data e hora') ||
      lowerLine.includes('hora:') ||
      lowerLine.includes('sistema') ||
      lowerLine.includes('usuario') ||
      lowerLine.includes('usuário') ||
      lowerLine.includes('operador') ||
      lowerLine.includes('faturamento gerador') ||
      lowerLine.includes('gerador') ||
      lowerLine.includes('data:')
    ) {
      continue;
    }

    if (line.toLowerCase().startsWith('totais') || line.toLowerCase().includes('total geral') || line.toLowerCase().startsWith('soma')) {
      continue;
    }

    // Strip full dates like DD/MM/YYYY to avoid partial matching of MM/YYYY (removing \b for safety)
    line = line.replace(/\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}/g, '');
    // Strip Portuguese written dates like "17 de julho de 2026" or "17 de julho de 26"
    line = line.replace(/\d{1,2}\s+de\s+[a-zA-Z\u00C0-\u00FF]+\s+de\s+\d{2,4}/gi, '');

    let monthNum = -1;
    let yearNum = -1;

    const numMatch = line.match(/\b(0?[1-9]|1[0-2])\s*[\/\.-]\s*(20\d{2})\b/);
    if (numMatch) {
      monthNum = parseInt(numMatch[1], 10);
      yearNum = parseInt(numMatch[2], 10);
    } else {
      const words = line.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/);
      for (const w of words) {
        const cleanW = w.replace(/[^a-z]/g, '');
        if (ptMonths[cleanW] !== undefined) {
          monthNum = ptMonths[cleanW];
          break;
        }
      }
      if (monthNum !== -1) {
        const yearMatch = line.match(/\b(20\d{2})\b/);
        if (yearMatch) {
          yearNum = parseInt(yearMatch[1], 10);
        }
      }
    }

    if (monthNum !== -1 && yearNum !== -1) {
      const competencia = `${monthNum.toString().padStart(2, '0')}/${yearNum}`;
      const linesToCheck = [line];
      if (i + 1 < lines.length) linesToCheck.push(lines[i + 1]);

      let faturamentoTotal = 0;
      for (const checkLine of linesToCheck) {
        const matches = checkLine.match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+,\d{2}|\d+\.\d{2})/g);
        if (matches && matches.length > 0) {
          const numbers = matches.map(m => parseNumericValue(m)).filter(n => !isNaN(n) && n >= 0);
          if (numbers.length > 0) {
            faturamentoTotal = Math.max(...numbers);
            break;
          }
        }
      }

      if (faturamentoTotal < 0) continue;

      const vendaVista = faturamentoTotal * (company.vendaVistaPercent / 100);
      const vendaPrazo = faturamentoTotal * (company.vendaPrazoPercent / 100);
      const estimatedTaxes = calculateEstimatedTaxes(faturamentoTotal, company.regimeTributario);

      const existingIdx = items.findIndex(item => item.competencia === competencia);
      if (existingIdx !== -1) {
        items[existingIdx] = {
          id: items[existingIdx].id,
          competencia,
          faturamentoTotal,
          vendaVista,
          vendaPrazo,
          estimatedTaxes
        };
      } else {
        items.push({
          id: `fat_pdf_${i}_${Date.now()}`,
          competencia,
          faturamentoTotal,
          vendaVista,
          vendaPrazo,
          estimatedTaxes
        });
      }
    }
  }

  items.sort((a, b) => {
    const [mA, yA] = a.competencia.split('/').map(Number);
    const [mB, yB] = b.competencia.split('/').map(Number);
    if (yA !== yB) return yA - yB;
    return mA - mB;
  });

  return items;
};
