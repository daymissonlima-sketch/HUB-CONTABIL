/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx-js-style';

// Shared interfaces
export interface InvoiceRow {
  id: string;
  chaveDeAcesso: string;
  dataEmissao: string;
  valorString: string;
  valorDecimal: number;
  ufCodigo: string;
  ufNome: string;
  anoMes: string;
  cnpj: string;
  cnpjFormatado: string;
  modelo: string;
  serie: string;
  numeroNota: string;
  numeroNotaFormatado: string;
  tipoEmissao: string;
  tipoEmissaoFriendly: string;
  isValidChave: boolean;
  chaveError?: string;
  cnpjFornecedor?: string;
  cnpjFornecedorFormatado?: string;
  nomeFornecedor?: string;
  valorIcms?: number;
  situacaoNfe?: string;
}

export interface ErpRecord {
  nota: number;
  dataEmissao: string;
  valor: number;
  serie: string;
  cliente: string;
  linhaOriginal: string;
}

export interface AuditItem {
  nota: number;
  status: 'OK' | 'FALTANTE_ERP' | 'NAO_CONSTA_SEFAZ' | 'SALTO_SEQUENCIA' | 'DIVERGENCIA_VALOR';
  sefazValue?: number;
  erpValue?: number;
  sefazDate?: string;
  erpDate?: string;
  chaveDeAcesso?: string;
  cliente?: string;
  serie?: string;
}

export interface AuditSummary {
  totalSefaz: number;
  totalErp: number;
  sincronizadas: number;
  faltantesErp: number;
  naoConstamSefaz: number;
  saltosSequencia: number;
  divergenciasValor: number;
  minNota: number;
  maxNota: number;
}

const UF_MAP: Record<string, { sigla: string; nome: string }> = {
  '11': { sigla: 'RO', nome: 'Rondônia' }, '12': { sigla: 'AC', nome: 'Acre' },
  '13': { sigla: 'AM', nome: 'Amazonas' }, '14': { sigla: 'RR', nome: 'Roraima' },
  '15': { sigla: 'PA', nome: 'Pará' }, '16': { sigla: 'AP', nome: 'Amapá' },
  '17': { sigla: 'TO', nome: 'Tocantins' }, '21': { sigla: 'MA', nome: 'Maranhão' },
  '22': { sigla: 'PI', nome: 'Piauí' }, '23': { sigla: 'CE', nome: 'Ceará' },
  '24': { sigla: 'RN', nome: 'Rio Grande do Norte' }, '25': { sigla: 'PB', nome: 'Paraíba' },
  '26': { sigla: 'PE', nome: 'Pernambuco' }, '27': { sigla: 'AL', nome: 'Alagoas' },
  '28': { sigla: 'SE', nome: 'Sergipe' }, '29': { sigla: 'BA', nome: 'Bahia' },
  '31': { sigla: 'MG', nome: 'Minas Gerais' }, '32': { sigla: 'ES', nome: 'Espírito Santo' },
  '33': { sigla: 'RJ', nome: 'Rio de Janeiro' }, '35': { sigla: 'SP', nome: 'São Paulo' },
  '41': { sigla: 'PR', nome: 'Paraná' }, '42': { sigla: 'SC', nome: 'Santa Catarina' },
  '43': { sigla: 'RS', nome: 'Rio Grande do Sul' }, '50': { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  '51': { sigla: 'MT', nome: 'Mato Grosso' }, '52': { sigla: 'GO', nome: 'Goiás' },
  '53': { sigla: 'DF', nome: 'Distrito Federal' },
};

const EMISSION_TYPES: Record<string, string> = {
  '1': 'Normal', '2': 'Contingência FS-IA', '3': 'Contingência SCAN',
  '4': 'Contingência EPEC', '5': 'Contingência FS-DA', '9': 'Contingência offline NFC-e',
};

// Simple helper functions
function sanitizeFiscalCell(val: string): string {
  return val.trim().replace(/\s+/g, ' ');
}

export function parseCurrencySafe(valStr: string): number {
  if (!valStr) return 0;
  let clean = valStr.replace(/[R$\s]/g, '');
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const num = parseFloat(clean);
  return Number.isNaN(num) ? 0 : Number(num.toFixed(2));
}

function validateFiscalKey(key: string): { isValid: boolean; cleanKey?: string; error?: string } {
  const clean = key.replace(/\D/g, '');
  if (clean.length !== 44) {
    return { isValid: false, cleanKey: clean, error: `Chave com ${clean.length} dígitos (esperado: 44)` };
  }
  return { isValid: true, cleanKey: clean };
}

function validateAndCleanDate(dateStr: string): string {
  if (!dateStr) return '-';
  const match = dateStr.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (match) return `${match[1]}/${match[2]}/${match[3]}`;
  return dateStr;
}

export function formatCnpjCpf(doc: string | undefined | null): string {
  if (!doc) return '';
  const clean = doc.trim();
  const digits = clean.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return clean.replace(/[\s\-\/]+$/, '');
}

export function formatCNPJ(cnpj: string): string {
  return formatCnpjCpf(cnpj);
}

export function splitProductCodeAndDesc(rawProduct: string | undefined | null): { codigo: string; descricao: string } {
  if (!rawProduct) return { codigo: '', descricao: '' };
  const trimmed = rawProduct.trim();

  // Match formats like: "11000 - ISQUEIRO CRICKET...", "11000 – ISQUEIRO...", "PROD_01 / ITEM..."
  const sepMatch = trimmed.match(/^([A-Za-z0-9_.\/]+)\s*[\-–—:\/]\s*(.+)$/);
  if (sepMatch && sepMatch[1] && sepMatch[2]) {
    return {
      codigo: sepMatch[1].trim(),
      descricao: sepMatch[2].trim()
    };
  }

  // Match numeric code followed by space and description: "11000 ISQUEIRO..."
  const numPrefixMatch = trimmed.match(/^(\d{1,12})\s+([^\d].*)$/);
  if (numPrefixMatch && numPrefixMatch[1] && numPrefixMatch[2]) {
    return {
      codigo: numPrefixMatch[1].trim(),
      descricao: numPrefixMatch[2].trim()
    };
  }

  return {
    codigo: '',
    descricao: trimmed
  };
}

export function parseChaveDeAcesso(chaveRaw: string): Omit<InvoiceRow, 'id' | 'dataEmissao' | 'valorString' | 'valorDecimal'> & { isValidChave: boolean; chaveError?: string } {
  const validation = validateFiscalKey(chaveRaw);
  if (!validation.isValid) {
    return {
      chaveDeAcesso: validation.cleanKey || chaveRaw, ufCodigo: '', ufNome: 'Inválido', anoMes: '',
      cnpj: '', cnpjFormatado: '', modelo: '', serie: '', numeroNota: '', numeroNotaFormatado: '',
      tipoEmissao: '', tipoEmissaoFriendly: '', isValidChave: false, chaveError: validation.error,
    };
  }

  const chave = validation.cleanKey;
  const ufCodigo = chave.substring(0, 2);
  const anoMesRaw = chave.substring(2, 6);
  const cnpj = chave.substring(6, 20);
  const modelo = chave.substring(20, 22);
  const serie = chave.substring(22, 25);
  const numeroNota = chave.substring(25, 34);
  const tipoEmissao = chave.substring(34, 35);
  const ufInfo = UF_MAP[ufCodigo] || { sigla: '??', nome: 'UF Desconhecida' };
  const numNotaClean = parseInt(numeroNota, 10);

  return {
    chaveDeAcesso: chave, ufCodigo, ufNome: `${ufInfo.nome} (${ufInfo.sigla})`,
    anoMes: /^\d{4}$/.test(anoMesRaw) ? `${anoMesRaw.substring(2, 4)}/20${anoMesRaw.substring(0, 2)}` : anoMesRaw,
    cnpj, cnpjFormatado: formatCNPJ(cnpj), modelo, serie: parseInt(serie, 10).toString(),
    numeroNota, numeroNotaFormatado: Number.isNaN(numNotaClean) ? numeroNota : numNotaClean.toString(),
    tipoEmissao, tipoEmissaoFriendly: EMISSION_TYPES[tipoEmissao] || 'Desconhecido', isValidChave: true,
  };
}

export function parseLineToInvoiceRow(
  cells: string[], 
  index: number, 
  headerMapping?: {
    chaveIdx: number;
    notaIdx: number;
    dataIdx: number;
    cnpjIdx: number;
    nomeIdx: number;
    serieIdx: number;
    ufIdx: number;
    valorIdx: number;
    icmsIdx: number;
    situacaoIdx: number;
  }
): InvoiceRow | null {
  if (cells.length < 2) return null;

  let chaveRaw = '';
  let dataRaw = '';
  let valorRaw = '';
  let cnpjFornecedor = '';
  let nomeFornecedor = '';
  let ufRaw = '';
  let numeroNotaRaw = '';
  let serieRaw = '';
  let situacaoNfe = '';
  let valorIcms = 0;

  // trim and sanitize quotes
  const cleanCells = cells.map(c => c.trim().replace(/^"|"$/g, ''));

  // Patterns for matching
  const isChavePat = /^\d{44}$/;
  const isDatePat = /^\d{2}[/-]\d{2}[/-]\d{4}$/;
  const isCnpjCpfPat = /^\d{11}$|^\d{14}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{3}\.\d{3}\.\d{3}-\d{2}$/;

  // Check if we have an explicit header mapping
  if (headerMapping && headerMapping.chaveIdx !== -1) {
    const hm = headerMapping;
    if (hm.chaveIdx >= 0 && hm.chaveIdx < cleanCells.length) chaveRaw = cleanCells[hm.chaveIdx];
    if (hm.dataIdx >= 0 && hm.dataIdx < cleanCells.length) dataRaw = cleanCells[hm.dataIdx];
    if (hm.valorIdx >= 0 && hm.valorIdx < cleanCells.length) valorRaw = cleanCells[hm.valorIdx];
    if (hm.cnpjIdx >= 0 && hm.cnpjIdx < cleanCells.length) cnpjFornecedor = cleanCells[hm.cnpjIdx];
    if (hm.nomeIdx >= 0 && hm.nomeIdx < cleanCells.length) nomeFornecedor = cleanCells[hm.nomeIdx];
    if (hm.ufIdx >= 0 && hm.ufIdx < cleanCells.length) ufRaw = cleanCells[hm.ufIdx];
    if (hm.notaIdx >= 0 && hm.notaIdx < cleanCells.length) numeroNotaRaw = cleanCells[hm.notaIdx];
    if (hm.serieIdx >= 0 && hm.serieIdx < cleanCells.length) serieRaw = cleanCells[hm.serieIdx];
    if (hm.situacaoIdx >= 0 && hm.situacaoIdx < cleanCells.length) situacaoNfe = cleanCells[hm.situacaoIdx];
    if (hm.icmsIdx >= 0 && hm.icmsIdx < cleanCells.length) {
      valorIcms = parseCurrencySafe(cleanCells[hm.icmsIdx]);
    }
  } else {
    // No mapping - auto-detect!
    // Check if the 8-column layout (screenshot) matches:
    // Col 0: CNPJ, Col 1: Name, Col 2: UF, Col 3: Note, Col 4: Date, Col 5: Status, Col 6: Valor, Col 7: Chave
    const isScreenshotLayout = cleanCells.length >= 8 && isChavePat.test(cleanCells[7]);

    if (isScreenshotLayout) {
      cnpjFornecedor = cleanCells[0];
      nomeFornecedor = cleanCells[1];
      ufRaw = cleanCells[2];
      numeroNotaRaw = cleanCells[3];
      dataRaw = cleanCells[4];
      situacaoNfe = cleanCells[5];
      valorRaw = cleanCells[6];
      chaveRaw = cleanCells[7];
    } else {
      // General pattern-matching fallback:
      // Find the 44-digit key anchor
      let chaveCellIdx = -1;
      for (let c = 0; c < cleanCells.length; c++) {
        if (isChavePat.test(cleanCells[c])) {
          chaveCellIdx = c;
          chaveRaw = cleanCells[c];
          break;
        }
      }

      if (chaveCellIdx !== -1) {
        // Find a date cell:
        for (let c = 0; c < cleanCells.length; c++) {
          if (c === chaveCellIdx) continue;
          if (isDatePat.test(cleanCells[c]) || /^\d{4}-\d{2}-\d{2}/.test(cleanCells[c])) {
            dataRaw = cleanCells[c];
            break;
          }
        }

        // Find status/situation cell:
        for (let c = 0; c < cleanCells.length; c++) {
          if (c === chaveCellIdx) continue;
          const val = cleanCells[c].toUpperCase();
          if (val.includes('CANCEL') || val.includes('AUTORIZ') || val.includes('DENEG') || val.includes('NORMAL')) {
            situacaoNfe = cleanCells[c];
            break;
          }
        }

        // Find CNPJ/CPF cell:
        for (let c = 0; c < cleanCells.length; c++) {
          if (c === chaveCellIdx) continue;
          if (isCnpjCpfPat.test(cleanCells[c])) {
            cnpjFornecedor = cleanCells[c];
            break;
          }
        }

        // Find UF cell:
        for (let c = 0; c < cleanCells.length; c++) {
          if (c === chaveCellIdx) continue;
          const val = cleanCells[c];
          if (/^[A-Za-z]{2}$/.test(val) && ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO','EX'].includes(val.toUpperCase())) {
            ufRaw = val;
            break;
          }
        }

        // Find Name/Razão Social cell:
        for (let c = 0; c < cleanCells.length; c++) {
          if (c === chaveCellIdx) continue;
          const val = cleanCells[c];
          if (val.length > 3 && /[A-Za-z]{4,}/.test(val)) {
            const upperVal = val.toUpperCase();
            if (!upperVal.includes('CANCEL') && !upperVal.includes('AUTORIZ') && !upperVal.includes('DENEG') && !upperVal.includes('NORMAL') && !['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO','EX'].includes(upperVal)) {
              nomeFornecedor = val;
              break;
            }
          }
        }

        // Find Valor cell:
        for (let c = 0; c < cleanCells.length; c++) {
          if (c === chaveCellIdx) continue;
          const val = cleanCells[c];
          if (/[0-9]/.test(val) && !isDatePat.test(val) && !isCnpjCpfPat.test(val)) {
            if (val.includes(',') || (val.includes('.') && val.split('.')[1]?.length === 2)) {
              valorRaw = val;
              break;
            }
          }
        }
        
        if (!valorRaw) {
          for (let c = cleanCells.length - 1; c >= 0; c--) {
            if (c === chaveCellIdx) continue;
            const val = cleanCells[c];
            if (/^[\d\.,\s]+$/.test(val) && val.length > 2) {
              valorRaw = val;
              break;
            }
          }
        }
      } else {
        return null;
      }
    }
  }

  const keyDetails = parseChaveDeAcesso(chaveRaw);
  if (!keyDetails.isValidChave) {
    return {
      id: `inv-${index}-${Math.random().toString(36).substring(2, 7)}`,
      chaveDeAcesso: chaveRaw,
      dataEmissao: validateAndCleanDate(dataRaw) || '-',
      valorString: valorRaw || '0,00',
      valorDecimal: parseCurrencySafe(valorRaw),
      ufCodigo: '',
      ufNome: ufRaw || 'Inválido',
      anoMes: '',
      cnpj: cnpjFornecedor || '',
      cnpjFormatado: formatCNPJ(cnpjFornecedor) || '',
      modelo: '',
      serie: '',
      numeroNota: numeroNotaRaw || '',
      numeroNotaFormatado: numeroNotaRaw || '',
      tipoEmissao: '',
      tipoEmissaoFriendly: '',
      isValidChave: false,
      chaveError: keyDetails.chaveError,
      cnpjFornecedor: cnpjFornecedor,
      cnpjFornecedorFormatado: formatCNPJ(cnpjFornecedor),
      nomeFornecedor: nomeFornecedor,
      valorIcms: valorIcms,
      situacaoNfe: situacaoNfe || 'NORMAL'
    };
  }

  // Back-fill missing values from key details if they are missing
  if (!cnpjFornecedor) {
    cnpjFornecedor = keyDetails.cnpj;
  }
  if (!numeroNotaRaw) {
    numeroNotaRaw = keyDetails.numeroNota;
  }
  if (!serieRaw) {
    serieRaw = keyDetails.serie;
  }
  if (!ufRaw) {
    ufRaw = keyDetails.ufNome;
  }

  // Standardize the status/situacao:
  if (!situacaoNfe) {
    situacaoNfe = 'AUTORIZADA';
  } else {
    const sUpper = situacaoNfe.toUpperCase();
    if (sUpper.includes('CANCEL')) {
      situacaoNfe = 'CANCELADA';
    } else if (sUpper.includes('DENEG')) {
      situacaoNfe = 'DENEGADA';
    } else if (sUpper.includes('AUTORIZ')) {
      situacaoNfe = 'AUTORIZADA';
    } else {
      situacaoNfe = 'AUTORIZADA'; // Fallback
    }
  }

  return {
    id: `inv-${index}-${Math.random().toString(36).substring(2, 7)}`,
    dataEmissao: validateAndCleanDate(dataRaw) !== '-' ? validateAndCleanDate(dataRaw) : (keyDetails.anoMes || '-'),
    valorString: valorRaw || '0,00',
    valorDecimal: parseCurrencySafe(valorRaw),
    ...keyDetails,
    serie: serieRaw ? parseInt(serieRaw, 10).toString() : keyDetails.serie,
    numeroNota: numeroNotaRaw,
    numeroNotaFormatado: parseInt(numeroNotaRaw, 10).toString() || keyDetails.numeroNotaFormatado,
    cnpjFornecedor: cnpjFornecedor,
    cnpjFornecedorFormatado: formatCNPJ(cnpjFornecedor),
    nomeFornecedor: nomeFornecedor || 'FORNECEDOR NÃO INFORMADO',
    valorIcms: valorIcms,
    situacaoNfe: situacaoNfe
  };
}

/**
 * Robust SEFAZ CSV text parser.
 */
export function parseSefazReport(text: string): InvoiceRow[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === delimiter && !inQuotes) {
        cells.push(sanitizeFiscalCell(current.trim().replace(/^"|"$/g, ''))); current = '';
      } else current += char;
    }
    cells.push(sanitizeFiscalCell(current.trim().replace(/^"|"$/g, '')));
    return cells;
  };

  const firstLineCells = parseLine(lines[0]);
  const headers = firstLineCells.map(h => h.toLowerCase());
  const hasHeaders = headers.some(h => h.includes('chave') || h.includes('acesso') || h.includes('key') || h.includes('nota') || h.includes('data') || h.includes('valor'));

  let headerMapping: any = undefined;
  if (hasHeaders) {
    headerMapping = {
      chaveIdx: headers.findIndex(h => h.includes('chave') || h.includes('acesso') || h.includes('key') || h.includes('chv_aces')),
      notaIdx: headers.findIndex(h => h.includes('nota') || h.includes('número') || h.includes('numero') || h.includes('nº') || h.includes('num_doc')),
      dataIdx: headers.findIndex(h => h.includes('data') || h.includes('emissão') || h.includes('emissao') || h.includes('date') || h.includes('dtemit')),
      cnpjIdx: headers.findIndex(h => h.includes('cnpj') || h.includes('cpf') || h.includes('doc') || h.includes('emitente') || h.includes('fornecedor')),
      nomeIdx: headers.findIndex(h => h.includes('nome') || h.includes('razão') || h.includes('razao') || h.includes('social') || h.includes('destinatario') || h.includes('remetente') || h.includes('emitente') || h.includes('fornecedor')),
      serieIdx: headers.findIndex(h => h.includes('série') || h.includes('serie') || h.includes('ser')),
      ufIdx: headers.findIndex(h => h.includes('uf') || h.includes('estado') || h.includes('sigla')),
      valorIdx: headers.findIndex(h => h.includes('valor') || h.includes('vlr') || h.includes('total') || h.includes('r$') || h.includes('val')),
      icmsIdx: headers.findIndex(h => h.includes('icms') || h.includes('destacado') || h.includes('v_icms') || h.includes('v_icms_dest')),
      situacaoIdx: headers.findIndex(h => h.includes('situação') || h.includes('situacao') || h.includes('status') || h.includes('sit') || h.includes('estado_nota') || h.includes('tipo_emissao') || h.includes('indicador') || h.includes('selecionados')),
    };
  }

  const startIdx = hasHeaders ? 1 : 0;
  const parsedRows = lines.slice(startIdx).map((line, i) => {
    const cells = parseLine(line);
    return parseLineToInvoiceRow(cells, i, headerMapping);
  }).filter(Boolean) as InvoiceRow[];

  return parsedRows.sort((a, b) => {
    const numA = parseInt(a.numeroNota, 10) || 0;
    const numB = parseInt(b.numeroNota, 10) || 0;
    return numA - numB;
  });
}

/**
 * Isolates the ERP data aggregation logic (Hash Map representation).
 * Aggregates multi-line CFOP division into a single financial entity per note number.
 */
export function aggregateERPData(text: string): Map<number, ErpRecord> {
  if (!text) return new Map();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return new Map();

  // Identify delimiter and header line
  let headerIndex = -1;
  let delimiter = ';';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split(';');
    const hasNota = cells.some(c => c.toLowerCase().includes('nota') || c.toLowerCase().includes('documento') || c.toLowerCase() === 'nº' || c.toLowerCase().includes('numero'));
    const hasValor = cells.some(c => c.toLowerCase().includes('valor') || c.toLowerCase().includes('total') || c.toLowerCase().includes('contábil') || c.toLowerCase().includes('contabil') || c.toLowerCase().includes('faturamento'));
    if (hasNota && hasValor) {
      headerIndex = i;
      delimiter = ';';
      break;
    }

    const cellsComma = line.split(',');
    const hasNotaComma = cellsComma.some(c => c.toLowerCase().includes('nota') || c.toLowerCase().includes('documento') || c.toLowerCase() === 'nº' || c.toLowerCase().includes('numero'));
    const hasValorComma = cellsComma.some(c => c.toLowerCase().includes('valor') || c.toLowerCase().includes('total') || c.toLowerCase().includes('contábil') || c.toLowerCase().includes('contabil') || c.toLowerCase().includes('faturamento'));
    if (hasNotaComma && hasValorComma) {
      headerIndex = i;
      delimiter = ',';
      break;
    }
  }

  // Fallbacks if no matching header row found
  let notaIdx = 4;
  let dataIdx = 1;
  let valorIdx = 22;
  let serieIdx = 5;
  let clienteIdx = 11;

  if (headerIndex !== -1) {
    const headerCells = lines[headerIndex].split(delimiter).map(c => c.trim().toLowerCase());
    
    const foundNota = headerCells.findIndex(c => c === 'nota' || c.includes('nota') || c === 'documento' || c.includes('nº') || c.includes('numero') || c === 'num' || c === 'cod');
    if (foundNota !== -1) notaIdx = foundNota;

    const foundData = headerCells.findIndex(c => c.includes('data emiss') || c === 'data' || c === 'emissao' || c === 'emissão');
    if (foundData !== -1) dataIdx = foundData;

    // Preference: Column "Valor Total" or similar total/contábil/valor column
    const foundValor = headerCells.findIndex(c => c.includes('valor total') || c.includes('val. total') || c.includes('val total') || c.includes('valor cont') || c.includes('valor c') || c === 'valor' || c.includes('total') || c.includes('contábil') || c.includes('contabil') || c.includes('faturamento'));
    if (foundValor !== -1) valorIdx = foundValor;

    const foundSerie = headerCells.findIndex(c => c.includes('série') || c === 'serie' || c === 'sub-série' || c === 'sub-serie');
    if (foundSerie !== -1) serieIdx = foundSerie;

    const foundCliente = headerCells.findIndex(c => c === 'cliente' || c.includes('nome') || c.includes('razão') || c.includes('razao'));
    if (foundCliente !== -1) clienteIdx = foundCliente;
  }

  const erpRecordsMap = new Map<number, ErpRecord>();
  const startIdx = headerIndex !== -1 ? headerIndex + 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cells.length < 2) continue;

    const notaRaw = cells[notaIdx] || '';
    // Matching estrito pelo número da nota (sem zeros à esquerda e sem caracteres especiais)
    const notaNum = parseInt(notaRaw.replace(/\D/g, ''), 10);
    if (Number.isNaN(notaNum)) continue;

    const valorRaw = cells[valorIdx] || '0';
    const valor = parseCurrencySafe(valorRaw);
    const dataEmissao = validateAndCleanDate(cells[dataIdx] || '');
    const serie = cells[serieIdx] || '1';
    const cliente = cells[clienteIdx] || 'CLIENTES DIVERSOS';

    if (erpRecordsMap.has(notaNum)) {
      const existing = erpRecordsMap.get(notaNum)!;
      existing.valor = Number((existing.valor + valor).toFixed(2));
      
      if (!existing.dataEmissao && dataEmissao) {
        existing.dataEmissao = dataEmissao;
      }
      if ((existing.cliente === 'CLIENTES DIVERSOS' || !existing.cliente) && cliente && cliente !== 'CLIENTES DIVERSOS') {
        existing.cliente = cliente;
      }
      if ((existing.serie === '1' || !existing.serie) && serie && serie !== '1') {
        existing.serie = serie;
      }
      existing.linhaOriginal += '\n' + line;
    } else {
      erpRecordsMap.set(notaNum, {
        nota: notaNum,
        dataEmissao,
        valor,
        serie,
        cliente,
        linhaOriginal: line
      });
    }
  }

  return erpRecordsMap;
}

/**
 * Parses the accounting ERP CSV text into ErpRecord structured format.
 */
export function parseErpReport(text: string): ErpRecord[] {
  const erpRecordsMap = aggregateERPData(text);
  return Array.from(erpRecordsMap.values());
}

/**
 * Execute bilateral data audit between SEFAZ and ERP databases.
 * Groups duplicate numbers in SEFAZ to prevent false discrepancies.
 */
export function executeDataAudit(sefazRows: InvoiceRow[], erpText: string): { items: AuditItem[]; summary: AuditSummary } {
  // Map and group SEFAZ records by sanitized document number
  const sefazMap = new Map<number, {
    row: InvoiceRow;
    valor: number;
    allRows: InvoiceRow[];
  }>();

  sefazRows.forEach(row => {
    const num = parseInt(row.numeroNota.replace(/\D/g, ''), 10);
    if (!Number.isNaN(num)) {
      if (sefazMap.has(num)) {
        const existing = sefazMap.get(num)!;
        existing.valor = Number((existing.valor + row.valorDecimal).toFixed(2));
        existing.allRows.push(row);
      } else {
        sefazMap.set(num, {
          row,
          valor: row.valorDecimal,
          allRows: [row]
        });
      }
    }
  });

  // Map ERP records using aggregateERPData
  const erpMap = aggregateERPData(erpText);

  const allNotes = [...sefazMap.keys(), ...erpMap.keys()];
  if (allNotes.length === 0) {
    return {
      items: [],
      summary: {
        totalSefaz: 0,
        totalErp: 0,
        sincronizadas: 0,
        faltantesErp: 0,
        naoConstamSefaz: 0,
        saltosSequencia: 0,
        divergenciasValor: 0,
        minNota: 0,
        maxNota: 0
      }
    };
  }

  let minNota = Infinity;
  let maxNota = -Infinity;
  for (let i = 0; i < allNotes.length; i++) {
    const n = allNotes[i];
    if (n < minNota) minNota = n;
    if (n > maxNota) maxNota = n;
  }

  const items: AuditItem[] = [];
  let sincronizadas = 0;
  let faltantesErp = 0;
  let naoConstamSefaz = 0;
  let saltosSequencia = 0;
  let divergenciasValor = 0;

  // For safety and fast execution on high-number ranges, cap gap scans to 100,000 notes.
  const gapRangeLimit = 100000;
  const isTooLarge = (maxNota - minNota) > gapRangeLimit;
  const upperScanLimit = isTooLarge ? minNota + gapRangeLimit : maxNota;

  for (let n = minNota; n <= upperScanLimit; n++) {
    const hasSefaz = sefazMap.has(n);
    const hasErp = erpMap.has(n);

    if (hasSefaz && hasErp) {
      const sefazObj = sefazMap.get(n)!;
      const erp = erpMap.get(n)!;
      const isDivergent = Math.abs(sefazObj.valor - erp.valor) > 0.01;
      
      if (isDivergent) {
        divergenciasValor++;
        items.push({
          nota: n,
          status: 'DIVERGENCIA_VALOR',
          sefazValue: sefazObj.valor,
          erpValue: erp.valor,
          sefazDate: sefazObj.row.dataEmissao,
          erpDate: erp.dataEmissao,
          chaveDeAcesso: sefazObj.row.chaveDeAcesso,
          cliente: erp.cliente,
          serie: sefazObj.row.serie || erp.serie
        });
      } else {
        sincronizadas++;
        items.push({
          nota: n,
          status: 'OK',
          sefazValue: sefazObj.valor,
          erpValue: erp.valor,
          sefazDate: sefazObj.row.dataEmissao,
          erpDate: erp.dataEmissao,
          chaveDeAcesso: sefazObj.row.chaveDeAcesso,
          cliente: erp.cliente,
          serie: sefazObj.row.serie || erp.serie
        });
      }
    } else if (hasSefaz) {
      const sefazObj = sefazMap.get(n)!;
      faltantesErp++;
      items.push({
        nota: n,
        status: 'FALTANTE_ERP',
        sefazValue: sefazObj.valor,
        sefazDate: sefazObj.row.dataEmissao,
        chaveDeAcesso: sefazObj.row.chaveDeAcesso,
        serie: sefazObj.row.serie
      });
    } else if (hasErp) {
      const erp = erpMap.get(n)!;
      naoConstamSefaz++;
      items.push({
        nota: n,
        status: 'NAO_CONSTA_SEFAZ',
        erpValue: erp.valor,
        erpDate: erp.dataEmissao,
        cliente: erp.cliente,
        serie: erp.serie
      });
    } else {
      saltosSequencia++;
      items.push({
        nota: n,
        status: 'SALTO_SEQUENCIA'
      });
    }
  }

  // If scan was capped, parse leftover items that are outside the gap-scan range but present in maps
  if (isTooLarge) {
    allNotes.forEach(n => {
      if (n > upperScanLimit) {
        const hasSefaz = sefazMap.has(n);
        const hasErp = erpMap.has(n);
        if (hasSefaz && hasErp) {
          const sefazObj = sefazMap.get(n)!;
          const erp = erpMap.get(n)!;
          const isDivergent = Math.abs(sefazObj.valor - erp.valor) > 0.01;
          
          if (isDivergent) {
            divergenciasValor++;
            items.push({
              nota: n, status: 'DIVERGENCIA_VALOR', sefazValue: sefazObj.valor, erpValue: erp.valor,
              sefazDate: sefazObj.row.dataEmissao, erpDate: erp.dataEmissao,
              chaveDeAcesso: sefazObj.row.chaveDeAcesso, cliente: erp.cliente, serie: sefazObj.row.serie || erp.serie
            });
          } else {
            sincronizadas++;
            items.push({
              nota: n, status: 'OK', sefazValue: sefazObj.valor, erpValue: erp.valor,
              sefazDate: sefazObj.row.dataEmissao, erpDate: erp.dataEmissao,
              chaveDeAcesso: sefazObj.row.chaveDeAcesso, cliente: erp.cliente, serie: sefazObj.row.serie || erp.serie
            });
          }
        } else if (hasSefaz) {
          const sefazObj = sefazMap.get(n)!;
          faltantesErp++;
          items.push({
            nota: n, status: 'FALTANTE_ERP', sefazValue: sefazObj.valor,
            sefazDate: sefazObj.row.dataEmissao, chaveDeAcesso: sefazObj.row.chaveDeAcesso, serie: sefazObj.row.serie
          });
        } else if (hasErp) {
          const erp = erpMap.get(n)!;
          naoConstamSefaz++;
          items.push({
            nota: n, status: 'NAO_CONSTA_SEFAZ', erpValue: erp.valor,
            erpDate: erp.dataEmissao, cliente: erp.cliente, serie: erp.serie
          });
        }
      }
    });
  }

  const summary: AuditSummary = {
    totalSefaz: sefazMap.size,
    totalErp: erpMap.size,
    sincronizadas,
    faltantesErp,
    naoConstamSefaz,
    saltosSequencia,
    divergenciasValor,
    minNota,
    maxNota
  };

  return { items, summary };
}

/**
 * Generate highly polished 3-sheet Excel containing:
 * - Sheet 1: "Base SEFAZ" (Processed/Converted list)
 * - Sheet 2: "Divergências" (Omissions and Value/Date errors)
 * - Sheet 3: "Saltos de Sequência (Gaps)"
 */
export function exportAuditExcel(
  sefazRows: InvoiceRow[],
  items: AuditItem[],
  summary: AuditSummary,
  titlePrefix = 'Relatório Geral'
): void {
  const exportDate = `${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  
  // Create workbook
  const wb = XLSX.utils.book_new();

  // STYLES (Navy #04243B & Gold #E4B35E)
  const styleHeaderTitle = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 14, bold: true, color: { rgb: "E4B35E" } },
    alignment: { horizontal: "center", vertical: "center" }
  };
  const styleHeaderSub = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 9.5, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" }
  };
  const styleHeaderBannerBase = {
    fill: { fgColor: { rgb: "04243B" } }
  };
  
  const styleTableHeaderCenter = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "medium", color: { rgb: "04243B" } },
      bottom: { style: "medium", color: { rgb: "E4B35E" } }
    }
  };
  const styleTableHeaderLeft = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "medium", color: { rgb: "04243B" } },
      bottom: { style: "medium", color: { rgb: "E4B35E" } }
    }
  };
  const styleTableHeaderRight = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "right", vertical: "center" },
    border: {
      top: { style: "medium", color: { rgb: "04243B" } },
      bottom: { style: "medium", color: { rgb: "E4B35E" } }
    }
  };

  const getRowStyle = (isEven: boolean, align: 'left' | 'center' | 'right', bold = false, textColor = "1E293B") => ({
    fill: { fgColor: { rgb: isEven ? "FFFFFF" : "F8FAFC" } },
    font: { name: "Arial", sz: 9, bold, color: { rgb: textColor } },
    alignment: { horizontal: align, vertical: "center" },
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "F1F5F9" } },
      right: { style: "thin", color: { rgb: "F1F5F9" } }
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OK': return '059669'; // Emerald
      case 'FALTANTE_ERP': return 'DC2626'; // Red
      case 'NAO_CONSTA_SEFAZ': return 'D97706'; // Amber
      case 'SALTO_SEQUENCIA': return 'EA580C'; // Orange
      case 'DIVERGENCIA_VALOR': return '0284C7'; // Blue/Sky-blue
      default: return '1E293B';
    }
  };

  // --- SHEET 1: SEFAZ BASE PROCESSADA ---
  const wsSefaz: any = {};
  let currentSefazRow = 0;
  const sefazMerges: any[] = [];
  const sefazHeights: any[] = [];

  const writeSefazCell = (r: number, c: number, val: any, type: 's' | 'n', style: any = {}, format: string = '') => {
    const ref = XLSX.utils.encode_cell({ r, c });
    wsSefaz[ref] = { v: val, t: type, s: style };
    if (format) wsSefaz[ref].z = format;
  };

  for (let c = 0; c <= 8; c++) {
    writeSefazCell(currentSefazRow, c, c === 0 ? "MOREIRA & LIMA CONTADORES ASSOCIADOS" : '', 's', c === 0 ? styleHeaderTitle : styleHeaderBannerBase);
  }
  sefazMerges.push({ s: { r: currentSefazRow, c: 0 }, e: { r: currentSefazRow, c: 8 } });
  sefazHeights.push({ hpt: 26 });
  currentSefazRow++;

  for (let c = 0; c <= 8; c++) {
    writeSefazCell(currentSefazRow, c, c === 0 ? `${titlePrefix.toUpperCase()} - SEFAZ BASE DE DADOS - ${exportDate}` : '', 's', c === 0 ? styleHeaderSub : styleHeaderBannerBase);
  }
  sefazMerges.push({ s: { r: currentSefazRow, c: 0 }, e: { r: currentSefazRow, c: 8 } });
  sefazHeights.push({ hpt: 18 });
  currentSefazRow++;

  sefazHeights.push({ hpt: 12 });
  currentSefazRow++;

  const sefazHeaders = ['Chave de Acesso', 'Número da Nota', 'Data de Emissão', 'Valor Contábil', 'Série', 'Modelo', 'CNPJ Emitente', 'UF Emitente', 'Tipo Emissão'];
  sefazHeaders.forEach((h, c) => {
    const alignStyle = c === 3 ? styleTableHeaderRight : (c >= 6 ? styleTableHeaderLeft : styleTableHeaderCenter);
    writeSefazCell(currentSefazRow, c, h, 's', alignStyle);
  });
  sefazHeights.push({ hpt: 24 });
  currentSefazRow++;

  if (sefazRows.length === 0) {
    writeSefazCell(currentSefazRow, 0, "Nenhum documento fiscal processado.", 's', getRowStyle(true, 'left', true, "94A3B8"));
    sefazMerges.push({ s: { r: currentSefazRow, c: 0 }, e: { r: currentSefazRow, c: 8 } });
    sefazHeights.push({ hpt: 20 });
    currentSefazRow++;
  } else {
    sefazRows.forEach((r, idx) => {
      const isEven = idx % 2 === 0;
      const numNota = parseInt(r.numeroNota, 10);
      const numNotaVal = Number.isNaN(numNota) ? r.numeroNota : numNota;

      writeSefazCell(currentSefazRow, 0, r.chaveDeAcesso, 's', getRowStyle(isEven, 'center', false, "475569"));
      writeSefazCell(currentSefazRow, 1, numNotaVal, typeof numNotaVal === 'number' ? 'n' : 's', getRowStyle(isEven, 'center', true, "0F172A"));
      writeSefazCell(currentSefazRow, 2, r.dataEmissao, 's', getRowStyle(isEven, 'center', false, "334155"));
      writeSefazCell(currentSefazRow, 3, r.valorDecimal, 'n', getRowStyle(isEven, 'right', true, "04243B"), '"R$ " #,##0.00');
      writeSefazCell(currentSefazRow, 4, parseInt(r.serie, 10) || r.serie || '1', 'n', getRowStyle(isEven, 'center'));
      writeSefazCell(currentSefazRow, 5, parseInt(r.modelo, 10) || r.modelo || '55', 'n', getRowStyle(isEven, 'center'));
      writeSefazCell(currentSefazRow, 6, r.cnpjFormatado || r.cnpj, 's', getRowStyle(isEven, 'center'));
      writeSefazCell(currentSefazRow, 7, r.ufNome, 's', getRowStyle(isEven, 'left'));
      writeSefazCell(currentSefazRow, 8, r.tipoEmissaoFriendly, 's', getRowStyle(isEven, 'left'));

      sefazHeights.push({ hpt: 20 });
      currentSefazRow++;
    });
  }

  wsSefaz['!merges'] = sefazMerges;
  wsSefaz['!rows'] = sefazHeights;
  wsSefaz['!cols'] = [
    { wch: 50 }, // Chave
    { wch: 18 }, // Número
    { wch: 16 }, // Data
    { wch: 20 }, // Valor
    { wch: 10 }, // Série
    { wch: 10 }, // Modelo
    { wch: 22 }, // CNPJ
    { wch: 22 }, // UF
    { wch: 24 }  // Tipo Emissão
  ];
  wsSefaz['!views'] = [{ showGridLines: false }];
  wsSefaz['!ref'] = `A1:${XLSX.utils.encode_cell({ r: currentSefazRow - 1, c: 8 })}`;

  // --- SHEET 2: DIVERGÊNCIAS ---
  const wsDiv: any = {};
  let currentDivRow = 0;
  const divMerges: any[] = [];
  const divHeights: any[] = [];

  const writeDivCell = (r: number, c: number, val: any, type: 's' | 'n', style: any = {}, format: string = '') => {
    const ref = XLSX.utils.encode_cell({ r, c });
    wsDiv[ref] = { v: val, t: type, s: style };
    if (format) wsDiv[ref].z = format;
  };

  for (let c = 0; c <= 7; c++) {
    writeDivCell(currentDivRow, c, c === 0 ? "MOREIRA & LIMA CONTADORES ASSOCIADOS" : '', 's', c === 0 ? styleHeaderTitle : styleHeaderBannerBase);
  }
  divMerges.push({ s: { r: currentDivRow, c: 0 }, e: { r: currentDivRow, c: 7 } });
  divHeights.push({ hpt: 26 });
  currentDivRow++;

  for (let c = 0; c <= 7; c++) {
    writeDivCell(currentDivRow, c, c === 0 ? `RELATÓRIO DE DIVERGÊNCIAS - EMISSÃO: ${exportDate}` : '', 's', c === 0 ? styleHeaderSub : styleHeaderBannerBase);
  }
  divMerges.push({ s: { r: currentDivRow, c: 0 }, e: { r: currentDivRow, c: 7 } });
  divHeights.push({ hpt: 18 });
  currentDivRow++;

  divHeights.push({ hpt: 12 });
  currentDivRow++;

  const styleSummaryLabel = { font: { name: "Arial", sz: 9, bold: true, color: { rgb: "475569" } }, alignment: { horizontal: "right" } };
  const styleSummaryValue = { font: { name: "Arial", sz: 9.5, bold: true, color: { rgb: "0F172A" } }, alignment: { horizontal: "left" } };

  writeDivCell(currentDivRow, 0, "Notas na SEFAZ:", 's', styleSummaryLabel);
  writeDivCell(currentDivRow, 1, summary.totalSefaz, 'n', styleSummaryValue);
  writeDivCell(currentDivRow, 3, "Sincronizadas (OK):", 's', styleSummaryLabel);
  writeDivCell(currentDivRow, 4, summary.sincronizadas, 'n', styleSummaryValue);
  divHeights.push({ hpt: 16 });
  currentDivRow++;

  writeDivCell(currentDivRow, 0, "Notas no ERP:", 's', styleSummaryLabel);
  writeDivCell(currentDivRow, 1, summary.totalErp, 'n', styleSummaryValue);
  writeDivCell(currentDivRow, 3, "Faltantes no ERP (Omissões):", 's', styleSummaryLabel);
  writeDivCell(currentDivRow, 4, summary.faltantesErp, 'n', styleSummaryValue);
  divHeights.push({ hpt: 16 });
  currentDivRow++;

  writeDivCell(currentDivRow, 3, "Não Constam na SEFAZ:", 's', styleSummaryLabel);
  writeDivCell(currentDivRow, 4, summary.naoConstamSefaz, 'n', styleSummaryValue);
  divHeights.push({ hpt: 16 });
  currentDivRow++;

  divHeights.push({ hpt: 12 });
  currentDivRow++;

  const divHeaders = [
    'Documento (Nota)', 
    'Série', 
    'Status de Auditoria', 
    'Valor SEFAZ', 
    'Valor ERP', 
    'Diferença',
    'Data SEFAZ', 
    'Chave de Acesso / Info'
  ];
  divHeaders.forEach((h, c) => {
    const alignStyle = (c === 3 || c === 4 || c === 5) ? styleTableHeaderRight : ((c === 2 || c === 7) ? styleTableHeaderLeft : styleTableHeaderCenter);
    writeDivCell(currentDivRow, c, h, 's', alignStyle);
  });
  divHeights.push({ hpt: 24 });
  currentDivRow++;

  // We filter out purely synchronized items unless they have value mismatches
  const totalDivergences = items.filter(item => item.status === 'FALTANTE_ERP' || item.status === 'NAO_CONSTA_SEFAZ' || item.status === 'DIVERGENCIA_VALOR').sort((a, b) => a.nota - b.nota);

  if (totalDivergences.length === 0) {
    writeDivCell(currentDivRow, 0, "Nenhuma divergência ou omissão de faturamento encontrada no lote analisado.", 's', getRowStyle(true, 'left', true, "059669"));
    divMerges.push({ s: { r: currentDivRow, c: 0 }, e: { r: currentDivRow, c: 7 } });
    divHeights.push({ hpt: 20 });
    currentDivRow++;
  } else {
    totalDivergences.forEach((r, idx) => {
      const isEven = idx % 2 === 0;
      let statusText = '';
      let statusColor = '';
      if (r.status === 'FALTANTE_ERP') {
        statusText = '🔴 OMISSÃO NO ERP';
        statusColor = getStatusColor('FALTANTE_ERP');
      } else if (r.status === 'NAO_CONSTA_SEFAZ') {
        statusText = '🟡 DIVERGÊNCIA SEFAZ';
        statusColor = getStatusColor('NAO_CONSTA_SEFAZ');
      } else {
        statusText = '🔵 DIVERGÊNCIA DE VALOR';
        statusColor = '0284C7'; // Blue/Sky-blue
      }

      const sefazVal = r.sefazValue ?? 0;
      const erpVal = r.erpValue ?? 0;
      const diffVal = Number((sefazVal - erpVal).toFixed(2));

      writeDivCell(currentDivRow, 0, r.nota, 'n', getRowStyle(isEven, 'center', true));
      writeDivCell(currentDivRow, 1, r.serie || '1', 's', getRowStyle(isEven, 'center'));
      writeDivCell(currentDivRow, 2, statusText, 's', getRowStyle(isEven, 'left', true, statusColor));
      writeDivCell(currentDivRow, 3, r.sefazValue !== undefined ? sefazVal : 0, 'n', getRowStyle(isEven, 'right', false, r.sefazValue !== undefined ? "1E293B" : "94A3B8"), '"R$ " #,##0.00');
      writeDivCell(currentDivRow, 4, r.erpValue !== undefined ? erpVal : 0, 'n', getRowStyle(isEven, 'right', false, r.erpValue !== undefined ? "1E293B" : "94A3B8"), '"R$ " #,##0.00');
      writeDivCell(currentDivRow, 5, diffVal, 'n', getRowStyle(isEven, 'right', true, Math.abs(diffVal) > 0.01 ? "DC2626" : "1E293B"), '"R$ " #,##0.00');
      writeDivCell(currentDivRow, 6, r.sefazDate || r.erpDate || '-', 's', getRowStyle(isEven, 'center'));
      writeDivCell(currentDivRow, 7, r.chaveDeAcesso || r.cliente || '-', 's', getRowStyle(isEven, 'left'));

      divHeights.push({ hpt: 20 });
      currentDivRow++;
    });
  }

  wsDiv['!merges'] = divMerges;
  wsDiv['!rows'] = divHeights;
  wsDiv['!cols'] = [
    { wch: 18 }, // Nota
    { wch: 10 }, // Série
    { wch: 28 }, // Status
    { wch: 18 }, // Valor SEFAZ
    { wch: 18 }, // Valor ERP
    { wch: 18 }, // Diferença
    { wch: 16 }, // Data SEFAZ
    { wch: 50 }, // Chave / Info
  ];
  wsDiv['!views'] = [{ showGridLines: false }];
  wsDiv['!ref'] = `A1:${XLSX.utils.encode_cell({ r: currentDivRow - 1, c: 7 })}`;


  // --- SHEET 3: SALTOS DE SEQUÊNCIA ---
  const wsGap: any = {};
  let currentGapRow = 0;
  const gapMerges: any[] = [];
  const gapHeights: any[] = [];

  const writeGapCell = (r: number, c: number, val: any, type: 's' | 'n', style: any = {}) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    wsGap[ref] = { v: val, t: type, s: style };
  };

  for (let c = 0; c <= 3; c++) {
    writeGapCell(currentGapRow, c, c === 0 ? "MOREIRA & LIMA CONTADORES ASSOCIADOS" : '', 's', c === 0 ? styleHeaderTitle : styleHeaderBannerBase);
  }
  gapMerges.push({ s: { r: currentGapRow, c: 0 }, e: { r: currentGapRow, c: 3 } });
  gapHeights.push({ hpt: 26 });
  currentGapRow++;

  for (let c = 0; c <= 3; c++) {
    writeGapCell(currentGapRow, c, c === 0 ? "RELATÓRIO DE SALTOS DE SEQUÊNCIA (GAP ANALYSIS)" : '', 's', c === 0 ? styleHeaderSub : styleHeaderBannerBase);
  }
  gapMerges.push({ s: { r: currentGapRow, c: 0 }, e: { r: currentGapRow, c: 3 } });
  gapHeights.push({ hpt: 18 });
  currentGapRow++;

  gapHeights.push({ hpt: 12 });
  currentGapRow++;

  writeGapCell(currentGapRow, 0, "Numeração Inicial:", 's', styleSummaryLabel);
  writeGapCell(currentGapRow, 1, summary.minNota, 'n', styleSummaryValue);
  writeGapCell(currentGapRow, 2, "Total de Saltos:", 's', styleSummaryLabel);
  writeGapCell(currentGapRow, 3, summary.saltosSequencia, 'n', styleSummaryValue);
  gapHeights.push({ hpt: 16 });
  currentGapRow++;

  writeGapCell(currentGapRow, 0, "Numeração Final:", 's', styleSummaryLabel);
  writeGapCell(currentGapRow, 1, summary.maxNota, 'n', styleSummaryValue);
  gapHeights.push({ hpt: 16 });
  currentGapRow++;

  gapHeights.push({ hpt: 12 });
  currentGapRow++;

  const gapHeaders = ['Número Ausente', 'Série Presumida', 'Status de Auditoria', 'Ação Corretiva Recomendada'];
  gapHeaders.forEach((h, c) => {
    writeGapCell(currentGapRow, c, h, 's', c === 3 ? styleTableHeaderLeft : styleTableHeaderCenter);
  });
  gapHeights.push({ hpt: 24 });
  currentGapRow++;

  const sequenceGaps = items.filter(item => item.status === 'SALTO_SEQUENCIA');

  if (sequenceGaps.length === 0) {
    writeGapCell(currentGapRow, 0, "Nenhum salto de sequência detectado na numeração analisada.", 's', getRowStyle(true, 'left', true, "059669"));
    gapMerges.push({ s: { r: currentGapRow, c: 0 }, e: { r: currentGapRow, c: 3 } });
    gapHeights.push({ hpt: 20 });
    currentGapRow++;
  } else {
    sequenceGaps.forEach((r, idx) => {
      const isEven = idx % 2 === 0;
      writeGapCell(currentGapRow, 0, r.nota, 'n', getRowStyle(isEven, 'center', true));
      writeGapCell(currentGapRow, 1, "1", 's', getRowStyle(isEven, 'center'));
      writeGapCell(currentGapRow, 2, "SALTO DE SEQUÊNCIA", 's', getRowStyle(isEven, 'center', true, "EA580C"));
      writeGapCell(currentGapRow, 3, "Avaliar necessidade de Inutilização de Número na SEFAZ", 's', getRowStyle(isEven, 'left'));

      gapHeights.push({ hpt: 20 });
      currentGapRow++;
    });
  }

  wsGap['!merges'] = gapMerges;
  wsGap['!rows'] = gapHeights;
  wsGap['!cols'] = [
    { wch: 18 }, // Número Ausente
    { wch: 16 }, // Série Presumida
    { wch: 24 }, // Status
    { wch: 45 }, // Recomendação
  ];
  wsGap['!views'] = [{ showGridLines: false }];
  wsGap['!ref'] = `A1:${XLSX.utils.encode_cell({ r: currentGapRow - 1, c: 3 })}`;

  // Append all three sheets as specified
  XLSX.utils.book_append_sheet(wb, wsDiv, 'Divergências');
  XLSX.utils.book_append_sheet(wb, wsGap, 'Saltos');
  XLSX.utils.book_append_sheet(wb, wsSefaz, 'Base SEFAZ');

  // Trigger download
  const formattedFileName = `Auditoria_Consolidada_${titlePrefix.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, formattedFileName);
}

/**
 * Optimized asynchronous SEFAZ CSV text parser that reports percentage progress
 */
export async function parseSefazReportAsync(
  text: string, 
  onProgress: (pct: number) => void
): Promise<InvoiceRow[]> {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length <= 1) return [];

  const delimiter = lines[0].includes(';') ? ';' : ',';
  
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === delimiter && !inQuotes) {
        cells.push(sanitizeFiscalCell(current.trim().replace(/^"|"$/g, ''))); current = '';
      } else current += char;
    }
    cells.push(sanitizeFiscalCell(current.trim().replace(/^"|"$/g, '')));
    return cells;
  };

  const firstLineCells = parseLine(lines[0]);
  const headers = firstLineCells.map(h => h.toLowerCase());
  const hasHeaders = headers.some(h => h.includes('chave') || h.includes('acesso') || h.includes('key') || h.includes('nota') || h.includes('data') || h.includes('valor'));

  let headerMapping: any = undefined;
  if (hasHeaders) {
    headerMapping = {
      chaveIdx: headers.findIndex(h => h.includes('chave') || h.includes('acesso') || h.includes('key') || h.includes('chv_aces')),
      notaIdx: headers.findIndex(h => h.includes('nota') || h.includes('número') || h.includes('numero') || h.includes('nº') || h.includes('num_doc')),
      dataIdx: headers.findIndex(h => h.includes('data') || h.includes('emissão') || h.includes('emissao') || h.includes('date') || h.includes('dtemit')),
      cnpjIdx: headers.findIndex(h => h.includes('cnpj') || h.includes('cpf') || h.includes('doc') || h.includes('emitente') || h.includes('fornecedor')),
      nomeIdx: headers.findIndex(h => h.includes('nome') || h.includes('razão') || h.includes('razao') || h.includes('social') || h.includes('destinatario') || h.includes('remetente') || h.includes('emitente') || h.includes('fornecedor')),
      serieIdx: headers.findIndex(h => h.includes('série') || h.includes('serie') || h.includes('ser')),
      ufIdx: headers.findIndex(h => h.includes('uf') || h.includes('estado') || h.includes('sigla')),
      valorIdx: headers.findIndex(h => h.includes('valor') || h.includes('vlr') || h.includes('total') || h.includes('r$') || h.includes('val')),
      icmsIdx: headers.findIndex(h => h.includes('icms') || h.includes('destacado') || h.includes('v_icms') || h.includes('v_icms_dest')),
      situacaoIdx: headers.findIndex(h => h.includes('situação') || h.includes('situacao') || h.includes('status') || h.includes('sit') || h.includes('estado_nota') || h.includes('tipo_emissao') || h.includes('indicador') || h.includes('selecionados')),
    };
  }

  const parsedRows: InvoiceRow[] = [];
  const chunkSize = 2500;
  const totalLines = lines.length;
  const startIdx = hasHeaders ? 1 : 0;

  for (let i = startIdx; i < lines.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, lines.length);
    for (let j = i; j < end; j++) {
      const line = lines[j];
      const cells = parseLine(line);
      const parsed = parseLineToInvoiceRow(cells, j, headerMapping);
      if (parsed) {
        parsedRows.push(parsed);
      }
    }

    onProgress(Math.min(100, Math.round((i / totalLines) * 100)));
    // Yield to browser event loop
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  // Final sort
  parsedRows.sort((a, b) => {
    const numA = parseInt(a.numeroNota, 10) || 0;
    const numB = parseInt(b.numeroNota, 10) || 0;
    return numA - numB;
  });

  onProgress(100);
  return parsedRows;
}

/**
 * Optimized asynchronous ERP CSV text parser that reports percentage progress
 */
export async function parseErpReportAsync(
  text: string,
  onProgress: (pct: number) => void
): Promise<ErpRecord[]> {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];

  // Identify delimiter and header line
  let headerIndex = -1;
  let delimiter = ';';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split(';');
    const hasNota = cells.some(c => c.toLowerCase().includes('nota') || c.toLowerCase().includes('documento'));
    const hasEmissao = cells.some(c => c.toLowerCase().includes('emissão') || c.toLowerCase().includes('emissao') || c.toLowerCase().includes('data'));
    if (hasNota && hasEmissao) {
      headerIndex = i;
      delimiter = ';';
      break;
    }

    const cellsComma = line.split(',');
    const hasNotaComma = cellsComma.some(c => c.toLowerCase().includes('nota') || c.toLowerCase().includes('documento'));
    const hasEmissaoComma = cellsComma.some(c => c.toLowerCase().includes('emissão') || c.toLowerCase().includes('emissao') || c.toLowerCase().includes('data'));
    if (hasNotaComma && hasEmissaoComma) {
      headerIndex = i;
      delimiter = ',';
      break;
    }
  }

  // Fallbacks if no matching header row found
  let notaIdx = 4;
  let dataIdx = 1;
  let valorIdx = 22;
  let serieIdx = 5;
  let clienteIdx = 11;

  if (headerIndex !== -1) {
    const headerCells = lines[headerIndex].split(delimiter).map(c => c.trim().toLowerCase());
    
    const foundNota = headerCells.findIndex(c => c === 'nota' || c === 'documento' || c.includes('nº') || c.includes('numero'));
    if (foundNota !== -1) notaIdx = foundNota;

    const foundData = headerCells.findIndex(c => c.includes('data emiss') || c === 'data' || c === 'emissao' || c === 'emissão');
    if (foundData !== -1) dataIdx = foundData;

    const foundValor = headerCells.findIndex(c => c.includes('valor cont') || c.includes('valor c') || c === 'valor' || c.includes('total') || c.includes('contábil') || c.includes('contabil'));
    if (foundValor !== -1) valorIdx = foundValor;

    const foundSerie = headerCells.findIndex(c => c.includes('série') || c === 'serie' || c === 'sub-série' || c === 'sub-serie');
    if (foundSerie !== -1) serieIdx = foundSerie;

    const foundCliente = headerCells.findIndex(c => c === 'cliente' || c.includes('nome') || c.includes('razão') || c.includes('razao'));
    if (foundCliente !== -1) clienteIdx = foundCliente;
  }

  const erpRecordsMap = new Map<number, ErpRecord>();
  const startIdx = headerIndex !== -1 ? headerIndex + 1 : 0;
  const chunkSize = 2500;
  const totalLines = lines.length - startIdx;

  for (let i = startIdx; i < lines.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, lines.length);
    for (let j = i; j < end; j++) {
      const line = lines[j];
      const cells = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
      if (cells.length < 2) continue;

      const notaRaw = cells[notaIdx] || '';
      const notaNum = parseInt(notaRaw.replace(/\D/g, ''), 10);
      if (Number.isNaN(notaNum)) continue;

      const valorRaw = cells[valorIdx] || '0';
      const valor = parseCurrencySafe(valorRaw);
      const dataEmissao = validateAndCleanDate(cells[dataIdx] || '');
      const serie = cells[serieIdx] || '1';
      const cliente = cells[clienteIdx] || 'CLIENTES DIVERSOS';

      if (erpRecordsMap.has(notaNum)) {
        const existing = erpRecordsMap.get(notaNum)!;
        existing.valor = Number((existing.valor + valor).toFixed(2));
        
        if (!existing.dataEmissao && dataEmissao) {
          existing.dataEmissao = dataEmissao;
        }
        if ((existing.cliente === 'CLIENTES DIVERSOS' || !existing.cliente) && cliente && cliente !== 'CLIENTES DIVERSOS') {
          existing.cliente = cliente;
        }
        if ((existing.serie === '1' || !existing.serie) && serie && serie !== '1') {
          existing.serie = serie;
        }
        existing.linhaOriginal += '\n' + line;
      } else {
        erpRecordsMap.set(notaNum, {
          nota: notaNum,
          dataEmissao,
          valor,
          serie,
          cliente,
          linhaOriginal: line
        });
      }
    }

    if (totalLines > 0) {
      onProgress(Math.min(100, Math.round(((i - startIdx) / totalLines) * 100)));
    }
    // Yield to browser event loop
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  onProgress(100);
  return Array.from(erpRecordsMap.values());
}

/**
 * Optimized asynchronous cross-database auditor that reports percentage progress
 */
export async function executeDataAuditAsync(
  sefazRows: InvoiceRow[],
  erpRecords: ErpRecord[],
  onProgress: (pct: number) => void
): Promise<{ items: AuditItem[]; summary: AuditSummary }> {
  // Map and group SEFAZ records by sanitized document number
  const sefazMap = new Map<number, {
    row: InvoiceRow;
    valor: number;
    allRows: InvoiceRow[];
  }>();

  sefazRows.forEach(row => {
    const num = parseInt(row.numeroNota.replace(/\D/g, ''), 10);
    if (!Number.isNaN(num)) {
      if (sefazMap.has(num)) {
        const existing = sefazMap.get(num)!;
        existing.valor = Number((existing.valor + row.valorDecimal).toFixed(2));
        existing.allRows.push(row);
      } else {
        sefazMap.set(num, {
          row,
          valor: row.valorDecimal,
          allRows: [row]
        });
      }
    }
  });

  // Map ERP records
  const erpMap = new Map<number, ErpRecord>();
  erpRecords.forEach(rec => {
    erpMap.set(rec.nota, rec);
  });

  const allNotes = [...sefazMap.keys(), ...erpMap.keys()];
  if (allNotes.length === 0) {
    return {
      items: [],
      summary: {
        totalSefaz: 0,
        totalErp: 0,
        sincronizadas: 0,
        faltantesErp: 0,
        naoConstamSefaz: 0,
        saltosSequencia: 0,
        divergenciasValor: 0,
        minNota: 0,
        maxNota: 0
      }
    };
  }

  // Safe min/max logic to avoid call stack exceeded errors
  let minNota = Infinity;
  let maxNota = -Infinity;
  for (let i = 0; i < allNotes.length; i++) {
    const n = allNotes[i];
    if (n < minNota) minNota = n;
    if (n > maxNota) maxNota = n;
  }

  const items: AuditItem[] = [];
  let sincronizadas = 0;
  let faltantesErp = 0;
  let naoConstamSefaz = 0;
  let saltosSequencia = 0;
  let divergenciasValor = 0;

  // Capping gap scan to 100,000 for performance.
  const gapRangeLimit = 100000;
  const isTooLarge = (maxNota - minNota) > gapRangeLimit;
  const upperScanLimit = isTooLarge ? minNota + gapRangeLimit : maxNota;

  const totalRange = upperScanLimit - minNota + 1;
  const chunkSize = 5000;

  for (let n = minNota; n <= upperScanLimit; n += chunkSize) {
    const chunkEnd = Math.min(n + chunkSize - 1, upperScanLimit);
    for (let currentNote = n; currentNote <= chunkEnd; currentNote++) {
      const hasSefaz = sefazMap.has(currentNote);
      const hasErp = erpMap.has(currentNote);

      if (hasSefaz && hasErp) {
        const sefazObj = sefazMap.get(currentNote)!;
        const erp = erpMap.get(currentNote)!;
        const isDivergent = Math.abs(sefazObj.valor - erp.valor) > 0.01;
        
        if (isDivergent) {
          divergenciasValor++;
          items.push({
            nota: currentNote,
            status: 'DIVERGENCIA_VALOR',
            sefazValue: sefazObj.valor,
            erpValue: erp.valor,
            sefazDate: sefazObj.row.dataEmissao,
            erpDate: erp.dataEmissao,
            chaveDeAcesso: sefazObj.row.chaveDeAcesso,
            cliente: erp.cliente,
            serie: sefazObj.row.serie || erp.serie
          });
        } else {
          sincronizadas++;
          items.push({
            nota: currentNote,
            status: 'OK',
            sefazValue: sefazObj.valor,
            erpValue: erp.valor,
            sefazDate: sefazObj.row.dataEmissao,
            erpDate: erp.dataEmissao,
            chaveDeAcesso: sefazObj.row.chaveDeAcesso,
            cliente: erp.cliente,
            serie: sefazObj.row.serie || erp.serie
          });
        }
      } else if (hasSefaz) {
        const sefazObj = sefazMap.get(currentNote)!;
        faltantesErp++;
        items.push({
          nota: currentNote,
          status: 'FALTANTE_ERP',
          sefazValue: sefazObj.valor,
          sefazDate: sefazObj.row.dataEmissao,
          chaveDeAcesso: sefazObj.row.chaveDeAcesso,
          serie: sefazObj.row.serie
        });
      } else if (hasErp) {
        const erp = erpMap.get(currentNote)!;
        naoConstamSefaz++;
        items.push({
          nota: currentNote,
          status: 'NAO_CONSTA_SEFAZ',
          erpValue: erp.valor,
          erpDate: erp.dataEmissao,
          cliente: erp.cliente,
          serie: erp.serie
        });
      } else {
        saltosSequencia++;
        items.push({
          nota: currentNote,
          status: 'SALTO_SEQUENCIA'
        });
      }
    }

    if (totalRange > 0) {
      onProgress(Math.min(100, Math.round(((n - minNota) / totalRange) * 100)));
    }
    // Yield to event loop
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  // If scan was capped, parse leftovers
  if (isTooLarge) {
    const leftoverNotes = allNotes.filter(n => n > upperScanLimit);
    leftoverNotes.forEach(currentNote => {
      const hasSefaz = sefazMap.has(currentNote);
      const hasErp = erpMap.has(currentNote);
      if (hasSefaz && hasErp) {
        const sefazObj = sefazMap.get(currentNote)!;
        const erp = erpMap.get(currentNote)!;
        const isDivergent = Math.abs(sefazObj.valor - erp.valor) > 0.01;
        
        if (isDivergent) {
          divergenciasValor++;
          items.push({
            nota: currentNote, status: 'DIVERGENCIA_VALOR', sefazValue: sefazObj.valor, erpValue: erp.valor,
            sefazDate: sefazObj.row.dataEmissao, erpDate: erp.dataEmissao,
            chaveDeAcesso: sefazObj.row.chaveDeAcesso, cliente: erp.cliente, serie: sefazObj.row.serie || erp.serie
          });
        } else {
          sincronizadas++;
          items.push({
            nota: currentNote, status: 'OK', sefazValue: sefazObj.valor, erpValue: erp.valor,
            sefazDate: sefazObj.row.dataEmissao, erpDate: erp.dataEmissao,
            chaveDeAcesso: sefazObj.row.chaveDeAcesso, cliente: erp.cliente, serie: sefazObj.row.serie || erp.serie
          });
        }
      } else if (hasSefaz) {
        const sefazObj = sefazMap.get(currentNote)!;
        faltantesErp++;
        items.push({
          nota: currentNote, status: 'FALTANTE_ERP', sefazValue: sefazObj.valor,
          sefazDate: sefazObj.row.dataEmissao, chaveDeAcesso: sefazObj.row.chaveDeAcesso, serie: sefazObj.row.serie
        });
      } else if (hasErp) {
        const erp = erpMap.get(currentNote)!;
        naoConstamSefaz++;
        items.push({
          nota: currentNote, status: 'NAO_CONSTA_SEFAZ', erpValue: erp.valor,
          erpDate: erp.dataEmissao, cliente: erp.cliente, serie: erp.serie
        });
      }
    });
  }

  const summary: AuditSummary = {
    totalSefaz: sefazMap.size,
    totalErp: erpMap.size,
    sincronizadas,
    faltantesErp,
    naoConstamSefaz,
    saltosSequencia,
    divergenciasValor,
    minNota,
    maxNota
  };

  onProgress(100);
  return { items, summary };
}

// ==========================================
// MÓDULO 01: AUDITORIA SIGA / SEFAZ (SIGA AUDIT ENGINE)
// ==========================================

export interface SigaReportItem {
  id?: string;
  notaFiscal: string;
  modelo?: string;
  serie?: string;
  data: string;
  vlrContabil: number;
  cnpj: string;
  razaoSocial?: string;
  uf?: string;
  chaveDeAcesso?: string;
  situacaoNfe?: string;
  cfop?: string;
  codigoProduto?: string;
  nomeProduto?: string;
  ncm?: string;
  un?: string;
  qtde?: number;
  rUnit?: number;
  rProduto?: number;
  desconto?: number;
  cst?: string;
  rBaseIcms?: number;
  pIcms?: number;
  rIcms?: number;
  pIpi?: number;
  rIpi?: number;
  tipoOperacao?: 'ENTRADA' | 'SAIDA';
  isDuplicate?: boolean;
  deduplicationKey?: string;
  duplicateGroupCount?: number;
}

export interface SigaReportMetadata {
  empresa: string;
  periodo: string;
  dataGeracao: string;
}

function parsePtBrFloatHelper(val: string): number {
  if (!val) return 0;
  let clean = val.replace(/[R$\s]/g, '').trim();
  if (clean === '' || clean === '-') return 0;
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const num = parseFloat(clean);
  return Number.isNaN(num) ? 0 : num;
}

function formatCnpjCpfHelper(raw: string): string {
  if (!raw) return '';
  if (raw === 'DIVERSOS' || raw === 'DIVERSO') return 'DIVERSOS';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.substring(0, 3)}.${digits.substring(3, 6)}.${digits.substring(6, 9)}-${digits.substring(9, 11)}`;
  }
  if (digits.length === 14) {
    return `${digits.substring(0, 2)}.${digits.substring(2, 5)}.${digits.substring(5, 8)}/${digits.substring(8, 12)}-${digits.substring(12, 14)}`;
  }
  return raw;
}

/**
 * CSV Tokenizer that handles delimiters inside quotes correctly.
 */
export function parseCsvLineTokens(line: string, delim: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delim && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
}

/**
 * Universal Line Parser for SIGA / ERP / SEFAZ / CSV / TSV reports.
 * Flexibly handles single/double semicolons, tabs, commas, pipes, quote wrappers, and index variations.
 */
export function parseGenericSigaLine(line: string, forceType?: 'SAIDA' | 'ENTRADA'): SigaReportItem | null {
  if (!line || !line.trim()) return null;
  const raw = line.trim();

  // Ignore header/summary or title lines
  const lowerLine = raw.toLowerCase();
  if (
    lowerLine.includes('cnpj destinatário') ||
    lowerLine.includes('cnpj destinatario') ||
    lowerLine.includes('cnpj emitente') ||
    lowerLine.includes('razão social') ||
    lowerLine.includes('razao social') ||
    lowerLine.includes('indicadores selecionados') ||
    (lowerLine.includes('nota fiscal') && lowerLine.includes('data') && lowerLine.includes('cfop')) ||
    lowerLine.includes('total de notas') ||
    lowerLine.includes('movimentação de entrada') ||
    lowerLine.startsWith(';;;;;')
  ) {
    return null;
  }

  // Detect Delimiter
  let delim = ';';
  const scCount = (raw.match(/;/g) || []).length;
  const tabCount = (raw.match(/\t/g) || []).length;
  const pipeCount = (raw.match(/\|/g) || []).length;
  const commaCount = (raw.match(/,/g) || []).length;

  if (tabCount > scCount && tabCount > pipeCount && tabCount > commaCount) delim = '\t';
  else if (pipeCount > scCount && pipeCount > tabCount && pipeCount > commaCount) delim = '|';
  else if (commaCount >= 3) delim = ',';
  else if (scCount >= 2) delim = ';';

  // 1. Check CSV with quotes / SEFAZ report format
  const csvTokens = parseCsvLineTokens(raw, delim);
  if (csvTokens.length >= 6) {
    const chaveToken = csvTokens.find(t => t.replace(/\D/g, '').length === 44);
    const dateToken = csvTokens.find(t => /\d{2}\/\d{2}\/\d{4}/.test(t));
    const statusToken = csvTokens.find(t => /AUTORIZADA|CANCELADA|INUTILIZADA|DENEGADA/i.test(t));

    if (chaveToken || (dateToken && csvTokens.some(t => /^\d{3,10}$/.test(t)))) {
      const isCanceled = statusToken ? statusToken.toUpperCase().includes('CANCELADA') : false;

      // Extract NF Number
      let nfNum = csvTokens.find((t, i) => /^\d{3,10}$/.test(t) && t !== chaveToken && i !== 0);
      if (!nfNum && chaveToken) {
        nfNum = chaveToken.substring(25, 34).replace(/^0+/, '') || '32000';
      }

      // Extract Razão Social / Name
      let nameToken = csvTokens[1] || '';
      if (!nameToken || /^\d+$/.test(nameToken) || /\d{2}\/\d{2}\/\d{4}/.test(nameToken)) {
        nameToken = csvTokens.find((t, i) => i > 0 && t.length > 2 && !/\d{2}\/\d{2}\/\d{4}/.test(t) && t !== chaveToken && !/AUTORIZADA|CANCELADA/i.test(t) && !/^[A-Z]{2}$/.test(t)) || 'DESCONHECIDO';
      }

      // Extract UF
      let ufToken = csvTokens[2] && /^[A-Z]{2}$/i.test(csvTokens[2]) ? csvTokens[2].toUpperCase() : (csvTokens.find(t => /^[A-Z]{2}$/i.test(t)) || 'CE');

      // Extract CNPJ
      let cnpjVal = csvTokens[0] ? formatCnpjCpfHelper(csvTokens[0]) : '';

      // Extract Value dynamically (do not assume column 6)
      let valToken = '';
      const numCandidates = csvTokens.filter((t, i) => {
        if (t === chaveToken) return false;
        if (/\d{2}\/\d{2}\/\d{4}/.test(t)) return false;
        if (/AUTORIZADA|CANCELADA|INUTILIZADA|DENEGADA/i.test(t)) return false;
        if (/^[A-Za-z]{2}$/.test(t)) return false;
        if (i === 0 && (t.replace(/\D/g, '').length === 11 || t.replace(/\D/g, '').length === 14)) return false;
        return /^-?\d{1,3}(\.\d{3})*,\d{2}$/.test(t) || /^-?\d+,\d{2}$/.test(t) || /^-?\d+\.\d{2}$/.test(t);
      });
      if (numCandidates.length > 0) {
        valToken = numCandidates.find(t => t === csvTokens[6] || t === csvTokens[5] || t === csvTokens[7] || t === csvTokens[4]) || numCandidates[0];
      } else {
        valToken = csvTokens[6] || '0';
      }
      const rawVal = parsePtBrFloatHelper(valToken || '0');
      const finalVal = isCanceled ? 0 : rawVal;

      // CFOP determination
      let cfopVal = forceType === 'SAIDA'
        ? (ufToken === 'EX' ? '7102' : (ufToken === 'CE' ? '5102' : '6102'))
        : (ufToken === 'EX' ? '3102' : (ufToken === 'CE' ? '1102' : '2102'));

      // Extract Modelo and Série from Chave de Acesso if present
      let modeloVal = '55';
      let serieVal = '1';
      let cnpjFromKey = '';
      let nfFromKey = '';

      if (chaveToken && chaveToken.length === 44) {
        modeloVal = chaveToken.substring(20, 22) || '55';
        serieVal = chaveToken.substring(22, 25).replace(/^0+/, '') || '1';
        cnpjFromKey = formatCnpjCpfHelper(chaveToken.substring(6, 20));
        nfFromKey = chaveToken.substring(25, 34).replace(/^0+/, '') || '0';
        const ufCode = chaveToken.substring(0, 2);
        if (UF_MAP[ufCode]) ufToken = UF_MAP[ufCode].sigla;
      }

      // For NFCe modelo 65 or if missing in file, extract NF Number & CNPJ from access key
      if (!nfNum || modeloVal === '65' || nfNum === '0') {
        if (nfFromKey && nfFromKey !== '0') nfNum = nfFromKey;
      }

      if (!cnpjVal || cnpjVal === '00.000.000/0000-00' || cnpjVal === '99.999.999/0001-99' || modeloVal === '65') {
        cnpjVal = cnpjFromKey || cnpjVal || (ufToken === 'EX' ? 'EX - EXTERIOR' : '99.999.999/0001-99');
      }

      let situacao = 'AUTORIZADA';
      if (statusToken) {
        const uStatus = statusToken.toUpperCase();
        if (uStatus.includes('CANCEL')) situacao = 'CANCELADA';
        else if (uStatus.includes('DENEG')) situacao = 'DENEGADA';
        else if (uStatus.includes('INUTIL')) situacao = 'INUTILIZADA';
        else situacao = uStatus;
      } else if (isCanceled) {
        situacao = 'CANCELADA';
      }

      const isNfce = modeloVal === '65';

      return {
        id: `${forceType === 'SAIDA' ? 'sai' : 'ent'}-${Math.random().toString(36).substring(2, 9)}`,
        notaFiscal: nfNum || '32000',
        modelo: modeloVal,
        serie: serieVal,
        data: dateToken || new Date().toLocaleDateString('pt-BR'),
        vlrContabil: finalVal,
        cnpj: isNfce ? '' : cnpjVal,
        razaoSocial: isNfce ? '' : nameToken,
        uf: ufToken,
        chaveDeAcesso: chaveToken || '',
        situacaoNfe: situacao,

        cfop: cfopVal,
        codigoProduto: `NF-${nfNum}`,
        nomeProduto: isCanceled ? `${nameToken} [CANCELADA]` : nameToken,
        ncm: 'N/A',
        un: 'UN',
        qtde: 1,
        rUnit: rawVal,
        rProduto: finalVal,
        desconto: 0,
        cst: isCanceled ? '900' : '000',
        rBaseIcms: finalVal,
        pIcms: isCanceled ? 0 : 18,
        rIcms: isCanceled ? 0 : Math.round(finalVal * 0.18 * 100) / 100,
        pIpi: 0,
        rIpi: 0,
        tipoOperacao: forceType || 'SAIDA'
      };
    }
  }

  // 2. Standard SIGA / TXT parsing with simple split
  const parts = raw.split(delim).map(p => p.trim().replace(/^["']|["']$/g, ''));
  const nonEmpties = parts.filter(Boolean);
  if (nonEmpties.length < 2) return null;

  // Extract Chave de Acesso (44 digits)
  let chaveDeAcesso = '';
  for (const p of parts) {
    const cleanP = p.replace(/\D/g, '');
    if (cleanP.length === 44) {
      chaveDeAcesso = cleanP;
      break;
    }
  }
  if (!chaveDeAcesso) {
    const match44 = raw.match(/\b\d{44}\b/);
    if (match44) chaveDeAcesso = match44[0];
  }

  let modFromKey = '';
  let serieFromKey = '';
  let cnpjFromKey = '';
  let nfFromKey = '';
  let ufFromKey = '';

  if (chaveDeAcesso && chaveDeAcesso.length === 44) {
    modFromKey = chaveDeAcesso.substring(20, 22) || '55';
    serieFromKey = chaveDeAcesso.substring(22, 25).replace(/^0+/, '') || '1';
    cnpjFromKey = formatCnpjCpfHelper(chaveDeAcesso.substring(6, 20));
    nfFromKey = chaveDeAcesso.substring(25, 34).replace(/^0+/, '') || '0';
    const ufCode = chaveDeAcesso.substring(0, 2);
    if (UF_MAP[ufCode]) ufFromKey = UF_MAP[ufCode].sigla;
  }

  let notaFiscal = '';
  let data = '';
  let cnpj = '';
  let cfop = '';
  let rawProduct = '';
  let ncm = '';
  let un = '';
  let qtde = 1;
  let rUnit = 0;
  let rProduto = 0;
  let desconto = 0;
  let vlrContabil = 0;
  let cst = '000';
  let rBaseIcms = 0;
  let pIcms = 0;
  let rIcms = 0;
  let pIpi = 0;
  let rIpi = 0;

  // Direct Index Parsing if line starts with NF number
  const p0 = parts[0] ? parts[0].trim() : '';
  if (/^\d[\d\w\-\.\/]*$/.test(p0)) {
    notaFiscal = p0;

    // Double-semicolon SIGA standard (parts[2] is Date, parts[4] is CNPJ, parts[6] is CFOP)
    if (parts.length >= 8 && (/\d{2}\/\d{2}\/\d{4}/.test(parts[2] || '') || /\d{2}\/\d{2}\/\d{4}/.test(parts[1] || ''))) {
      if (/\d{2}\/\d{2}\/\d{4}/.test(parts[2] || '')) {
        data = parts[2] ? parts[2].trim() : '';
        cnpj = parts[4] ? formatCnpjCpfHelper(parts[4].trim().replace(/\s+-\s*$/, '')) : '';
        cfop = parts[6] ? parts[6].trim() : '';
        rawProduct = parts[9] || parts[8] || parts[7] || '';
        ncm = parts[14] || parts[13] || '';
        un = parts[16] || parts[15] || '';
        qtde = parsePtBrFloatHelper(parts[18] || parts[17] || '1');
        rUnit = parsePtBrFloatHelper(parts[20] || parts[19] || '0');
        rProduto = parsePtBrFloatHelper(parts[22] || parts[21] || '0');
        desconto = parsePtBrFloatHelper(parts[23] || parts[22] || '0');
        vlrContabil = parsePtBrFloatHelper(parts[25] || parts[24] || parts[21] || '0');
        cst = parts[26] || parts[25] || '000';
        rBaseIcms = parsePtBrFloatHelper(parts[28] || parts[27] || '0');
        pIcms = parsePtBrFloatHelper(parts[30] || parts[29] || '0');
        rIcms = parsePtBrFloatHelper(parts[32] || parts[31] || '0');
        pIpi = parsePtBrFloatHelper(parts[36] || parts[35] || '0');
        rIpi = parsePtBrFloatHelper(parts[38] || parts[37] || '0');
      } else {
        // Single-delimiter standard (parts[1] is Date, parts[2] is CNPJ, parts[3] is CFOP, etc.)
        data = parts[1] || '';
        cnpj = parts[2] ? formatCnpjCpfHelper(parts[2].trim().replace(/\s+-\s*$/, '')) : '';
        cfop = parts[3] || '';
        rawProduct = parts[4] || '';
        ncm = parts[5] || '';
        un = parts[6] || '';
        qtde = parsePtBrFloatHelper(parts[7] || '1');
        rUnit = parsePtBrFloatHelper(parts[8] || '0');
        rProduto = parsePtBrFloatHelper(parts[9] || '0');
        desconto = parsePtBrFloatHelper(parts[10] || '0');
        vlrContabil = parsePtBrFloatHelper(parts[11] || parts[9] || '0');
        cst = parts[12] || '000';
        rBaseIcms = parsePtBrFloatHelper(parts[13] || '0');
        pIcms = parsePtBrFloatHelper(parts[14] || '0');
        rIcms = parsePtBrFloatHelper(parts[15] || '0');
      }
    }
  }

  // 2. Pattern Matching Fallbacks for missing fields
  if (!notaFiscal && nonEmpties.length >= 2) {
    for (const p of nonEmpties) {
      if (/^\d{3,10}$/.test(p) && p !== chaveDeAcesso) {
        notaFiscal = p;
        break;
      }
    }
    if (!notaFiscal) notaFiscal = nonEmpties[0];
  }

  if (!data) {
    for (const p of nonEmpties) {
      if (/\d{2}\/\d{2}\/\d{4}/.test(p) || /\d{4}-\d{2}-\d{2}/.test(p)) {
        data = p;
        break;
      }
    }
  }

  if (!cnpj) {
    for (const p of nonEmpties) {
      if (/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(p) || /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(p)) {
        cnpj = formatCnpjCpfHelper(p);
        break;
      }
    }
  }

  if (!cfop || !/^[1-7][.\-]?\d{3}$/.test(cfop)) {
    for (const p of nonEmpties) {
      const cleanP = p.trim();
      if (/^[1-7][.\-]?\d{3}$/.test(cleanP)) {
        cfop = cleanP;
        break;
      }
    }
    if (!cfop || !/^[1-7][.\-]?\d{3}$/.test(cfop)) {
      cfop = forceType === 'SAIDA' ? '5102' : '1102';
    }
  }

  if (!rawProduct) {
    for (const p of nonEmpties) {
      if (
        p !== notaFiscal &&
        p !== data &&
        p !== cnpj &&
        p !== cfop &&
        p !== chaveDeAcesso &&
        !/^\d+([\.,]\d+)?$/.test(p) &&
        p.length > 2
      ) {
        rawProduct = p;
        break;
      }
    }
  }

  if (vlrContabil === 0) {
    if (rProduto > 0) vlrContabil = rProduto;
    else {
      let maxVal = 0;
      for (const p of nonEmpties) {
        const val = parsePtBrFloatHelper(p);
        if (val > maxVal && p !== notaFiscal && !/\d{2}\/\d{2}\/\d{4}/.test(p) && p.replace(/\D/g, '').length !== 44) {
          maxVal = val;
        }
      }
      vlrContabil = maxVal;
    }
  }

  let codigoProduto = '';
  let nomeProduto = rawProduct.trim();
  const hyphenIndex = rawProduct.indexOf(' - ');
  if (hyphenIndex !== -1) {
    codigoProduto = rawProduct.substring(0, hyphenIndex).trim();
    nomeProduto = rawProduct.substring(hyphenIndex + 3).trim();
  }

  // Determine operacao type
  let tipoOperacao: 'SAIDA' | 'ENTRADA' = forceType || 'SAIDA';
  if (!forceType) {
    const cleanCfop = cfop.replace(/\D/g, '');
    if (cleanCfop.startsWith('1') || cleanCfop.startsWith('2') || cleanCfop.startsWith('3')) {
      tipoOperacao = 'ENTRADA';
    } else if (cleanCfop.startsWith('5') || cleanCfop.startsWith('6') || cleanCfop.startsWith('7')) {
      tipoOperacao = 'SAIDA';
    }
  }

  // For NFCe modelo 65 or missing fields, populate NF number & CNPJ from Chave de Acesso
  if (chaveDeAcesso && chaveDeAcesso.length === 44) {
    if (!notaFiscal || modFromKey === '65' || notaFiscal === '0') {
      if (nfFromKey && nfFromKey !== '0') notaFiscal = nfFromKey;
    }
    if (!cnpj || modFromKey === '65' || cnpj === '99.999.999/0001-99') {
      if (cnpjFromKey) cnpj = cnpjFromKey;
    }
  }

  if (!rawProduct && (modFromKey === '65' || (chaveDeAcesso && chaveDeAcesso.length === 44))) {
    rawProduct = 'VENDA NFC-E MODELO 65';
    nomeProduto = 'VENDA NFC-E MODELO 65';
  }

  if (!notaFiscal || (vlrContabil === 0 && !rawProduct)) return null;

  let modeloVal = modFromKey || '55';
  let serieVal = serieFromKey || '1';
  let ufVal = ufFromKey || 'CE';
  if (chaveDeAcesso && chaveDeAcesso.length === 44) {
    modeloVal = chaveDeAcesso.substring(20, 22) || '55';
    serieVal = chaveDeAcesso.substring(22, 25).replace(/^0+/, '') || '1';
    const ufCode = chaveDeAcesso.substring(0, 2);
    if (UF_MAP[ufCode]) ufVal = UF_MAP[ufCode].sigla;
  }

  const isNfceFull = modeloVal === '65';

  return {
    id: `${tipoOperacao === 'SAIDA' ? 'sai' : 'ent'}-${Math.random().toString(36).substring(2, 9)}`,
    notaFiscal,
    modelo: modeloVal,
    serie: serieVal,
    data,
    vlrContabil,
    cnpj: isNfceFull ? '' : (cnpj || '99.999.999/0001-99'),
    razaoSocial: isNfceFull ? '' : (nomeProduto || 'NÃO INFORMADO'),
    uf: ufVal,
    chaveDeAcesso,
    situacaoNfe: 'AUTORIZADA',

    cfop,
    codigoProduto,
    nomeProduto: nomeProduto || 'PRODUTO NÃO ESPECIFICADO',
    ncm,
    un,
    qtde: qtde || 1,
    rUnit: rUnit || 0,
    rProduto: rProduto || vlrContabil,
    desconto: desconto || 0,
    cst: cst || '000',
    rBaseIcms,
    pIcms,
    rIcms,
    pIpi,
    rIpi,
    tipoOperacao
  };
}

/**
 * 1. SEGREGAÇÃO DE DADOS:
 * Distinct reader function for ENTRADAS (Purchases / Inbound NFs).
 * Guarantees field integrity specific to Entrada operations (CFOP 1xxx, 2xxx, 3xxx).
 */
export function parseSigaEntradas(text: string): { items: SigaReportItem[]; metadata: SigaReportMetadata } {
  if (!text) return { items: [], metadata: { empresa: '', periodo: '', dataGeracao: '' } };
  
  const lines = text.split(/\r?\n/);
  const items: SigaReportItem[] = [];
  let inEntradaSection = false;
  let empresa = '';
  let periodo = '';
  let dataGeracao = '';

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('notas fiscais de entrada')) {
      inEntradaSection = true;
      continue;
    } else if (lowerLine.includes('notas fiscais de saída') || lowerLine.includes('notas fiscais de saida')) {
      inEntradaSection = false;
      continue;
    }

    if (line.includes('DISTRIBUIDORA') || line.includes('PRODUTOS ALIMENTICIO') || line.includes('LTDA') || line.includes('S.A')) {
      const parts = line.split(';');
      if (parts[0] && !empresa) empresa = parts[0].trim();
    }
    if (line.includes('De:') && line.includes('até:')) {
      const parts = line.split(';');
      if (parts[0]) periodo = parts[0].replace(/\s+/g, ' ').trim();
      const datePart = parts.find(p => p.toLowerCase().includes('data:'));
      if (datePart) dataGeracao = datePart.replace(/data:/i, '').trim();
    }

    const parsedItem = parseGenericSigaLine(line);
    if (parsedItem) {
      if (inEntradaSection || parsedItem.tipoOperacao === 'ENTRADA') {
        parsedItem.tipoOperacao = 'ENTRADA';
        items.push(parsedItem);
      }
    }
  }

  return {
    items,
    metadata: {
      empresa: empresa || 'EMPRESA IDENTIFICADA NO RELATÓRIO',
      periodo: periodo || 'Período não identificado',
      dataGeracao: dataGeracao || new Date().toLocaleDateString('pt-BR')
    }
  };
}

/**
 * 1. SEGREGAÇÃO DE DADOS:
 * Distinct reader function for SAÍDAS (Sales / Outbound NFs).
 * Guarantees field integrity specific to Saída operations (CFOP 5xxx, 6xxx, 7xxx).
 */
export function parseSigaSaidas(text: string): { items: SigaReportItem[]; metadata: SigaReportMetadata } {
  if (!text) return { items: [], metadata: { empresa: '', periodo: '', dataGeracao: '' } };
  
  const lines = text.split(/\r?\n/);
  const items: SigaReportItem[] = [];
  let inSaidaSection = false;
  let empresa = '';
  let periodo = '';
  let dataGeracao = '';

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('notas fiscais de saída') || lowerLine.includes('notas fiscais de saida')) {
      inSaidaSection = true;
      continue;
    } else if (lowerLine.includes('notas fiscais de entrada')) {
      inSaidaSection = false;
      continue;
    }

    if (line.includes('DISTRIBUIDORA') || line.includes('PRODUTOS ALIMENTICIO') || line.includes('LTDA') || line.includes('S.A')) {
      const parts = line.split(';');
      if (parts[0] && !empresa) empresa = parts[0].trim();
    }
    if (line.includes('De:') && line.includes('até:')) {
      const parts = line.split(';');
      if (parts[0]) periodo = parts[0].replace(/\s+/g, ' ').trim();
      const datePart = parts.find(p => p.toLowerCase().includes('data:'));
      if (datePart) dataGeracao = datePart.replace(/data:/i, '').trim();
    }

    const parsedItem = parseGenericSigaLine(line);
    if (parsedItem) {
      if (inSaidaSection || parsedItem.tipoOperacao === 'SAIDA') {
        parsedItem.tipoOperacao = 'SAIDA';
        items.push(parsedItem);
      }
    }
  }

  return {
    items,
    metadata: {
      empresa: empresa || 'EMPRESA IDENTIFICADA NO RELATÓRIO',
      periodo: periodo || 'Período não identificado',
      dataGeracao: dataGeracao || new Date().toLocaleDateString('pt-BR')
    }
  };
}

/**
 * Advanced Dynamic Parser for SEFAZ NFC-e (Modelo 65) CSV Reports.
 * Automatically adapts to changes in column layout, ordering, and delimiters.
 * Uses dictionary matching across header titles and the 44-digit Chave de Acesso decomposition standard.
 */
export function parseSigaNfceCsv(
  text: string,
  forceType: 'SAIDA' | 'ENTRADA' = 'SAIDA'
): { items: SigaReportItem[]; metadata: SigaReportMetadata; isValid: boolean } | null {
  if (!text || !text.trim()) return null;

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return null;

  const lowerText = text.toLowerCase();
  // Guarantee full preservation of traditional multi-section SIGA reports
  if (
    lowerText.includes('movimentação de entrada e saída') ||
    lowerText.includes('movimentacao de entrada e saida') ||
    (lowerText.includes('notas fiscais de entrada') && lowerText.includes('notas fiscais de saída')) ||
    (lowerText.includes('notas fiscais de entrada') && lowerText.includes('notas fiscais de saida'))
  ) {
    return null;
  }

  const isLikelyNfce =
    lowerText.includes('nfc-e') ||
    lowerText.includes('nfce') ||
    lowerText.includes('informações fiscais') ||
    lowerText.includes('informacoes fiscais') ||
    lowerText.includes('emissor - detalhamento') ||
    /\b\d{20}65\d{22}\b/.test(text);

  // If not NFC-e, return null to preserve traditional processing untouched
  if (!isLikelyNfce) {
    return null;
  }

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  // Column Matchers based on SEFAZ vocabulary
  const isChave = (h: string) => h.includes('chave') || h.includes('chv_aces');
  const isNota = (h: string) =>
    (h.includes('numero') || h.includes('nº') || h.includes('n°') || h.includes('num_doc') || h === 'nota' || h === 'nota fiscal' || h === 'num' || h === 'nro') &&
    !h.includes('protocolo') && !h.includes('lote') && !h.includes('serie') && !h.includes('item');
  const isSerie = (h: string) => h === 'serie' || h.includes('serie') || h === 'ser';
  const isData = (h: string) =>
    (h.includes('data') || h.includes('emissao') || h.includes('dtemit') || h === 'dt') && !h.includes('cancelamento');
  const isValor = (h: string) =>
    (h.includes('valor') || h.includes('vlr') || h.includes('total') || h.includes('r$')) &&
    !h.includes('icms') && !h.includes('desconto') && !h.includes('pis') && !h.includes('cofins') &&
    !h.includes('unit') && !h.includes('frete') && !h.includes('base') && !h.includes('bc');
  const isSituacao = (h: string) => h.includes('situacao') || h.includes('status') || h.includes('estado');
  const isCnpjEmit = (h: string) => (h.includes('cnpj') || h.includes('cpf')) && (h.includes('emit') || (!h.includes('dest') && !h.includes('cons')));
  const isNomeEmit = (h: string) => (h.includes('razao') || h.includes('social') || h.includes('nome')) && (h.includes('emit') || (!h.includes('dest') && !h.includes('cons')));
  const isUf = (h: string) => h === 'uf' || h.includes('estado') || h.includes('sigla');
  const isCfop = (h: string) => h.includes('cfop');
  const isBaseIcms = (h: string) => h.includes('base') || h.includes('bc');
  const isValorIcms = (h: string) => h.includes('icms') && (h.includes('valor') || h.includes('vlr') || h.includes('r$') || h === 'icms') && !h.includes('base') && !h.includes('aliq');
  const isDesconto = (h: string) => h.includes('desconto') || h.includes('desc');
  const isModelo = (h: string) => h === 'modelo' || h === 'mod';

  // Search for the header row in top 25 lines
  let headerLineIdx = -1;
  let delim = ';';
  let headers: string[] = [];

  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const rawLine = lines[i];
    const sc = (rawLine.match(/;/g) || []).length;
    const cm = (rawLine.match(/,/g) || []).length;
    const tb = (rawLine.match(/\t/g) || []).length;
    const pp = (rawLine.match(/\|/g) || []).length;

    let lineDelim = ';';
    if (tb > sc && tb > cm && tb > pp) lineDelim = '\t';
    else if (pp > sc && pp > tb && pp > cm) lineDelim = '|';
    else if (cm > sc && cm > tb && cm > pp) lineDelim = ',';
    else if (sc >= 2) lineDelim = ';';
    else continue;

    const tokens = parseCsvLineTokens(rawLine, lineDelim);
    if (tokens.length < 3) continue;

    const normTokens = tokens.map(normalize);
    let matchCount = 0;
    if (normTokens.some(isChave)) matchCount++;
    if (normTokens.some(isNota)) matchCount++;
    if (normTokens.some(isSerie)) matchCount++;
    if (normTokens.some(isData)) matchCount++;
    if (normTokens.some(isValor)) matchCount++;
    if (normTokens.some(isSituacao)) matchCount++;
    if (normTokens.some(isCnpjEmit)) matchCount++;

    if (matchCount >= 2) {
      headerLineIdx = i;
      delim = lineDelim;
      headers = normTokens;
      break;
    }
  }

  // If no header found and not NFC-e, return null to preserve traditional processing
  if (headerLineIdx === -1 && !isLikelyNfce) {
    return null;
  }

  const chaveIdx = headers.findIndex(isChave);
  const notaIdx = headers.findIndex(isNota);
  const serieIdx = headers.findIndex(isSerie);
  const dataIdx = headers.findIndex(isData);
  const valorIdx = headers.findIndex(isValor);
  const situacaoIdx = headers.findIndex(isSituacao);
  const cnpjEmitIdx = headers.findIndex(isCnpjEmit);
  const nomeEmitIdx = headers.findIndex(isNomeEmit);
  const ufIdx = headers.findIndex(isUf);
  const cfopIdx = headers.findIndex(isCfop);
  const baseIcmsIdx = headers.findIndex(isBaseIcms);
  const valorIcmsIdx = headers.findIndex(isValorIcms);
  const descontoIdx = headers.findIndex(isDesconto);
  const modeloIdx = headers.findIndex(isModelo);

  // Metadata extraction from pre-header lines
  let detectedEmpresa = '';
  let detectedPeriodo = '';
  let detectedDataGeracao = '';

  const preHeaderLimit = headerLineIdx >= 0 ? headerLineIdx : Math.min(lines.length, 10);
  for (let i = 0; i < preHeaderLimit; i++) {
    const l = lines[i];
    const monthMatch = l.match(/(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(?:de\s+)?(\d{4})/i);
    if (monthMatch && !detectedPeriodo) {
      detectedPeriodo = `${monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1).toLowerCase()} de ${monthMatch[2]}`;
    }
    const dateRangeMatch = l.match(/De:\s*(\d{2}\/\d{2}\/\d{4})\s*até:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dateRangeMatch && !detectedPeriodo) {
      detectedPeriodo = `${dateRangeMatch[1]} a ${dateRangeMatch[2]}`;
    }
    if ((l.includes('LTDA') || l.includes('S.A') || l.includes('MEI') || l.toLowerCase().includes('empresa:') || l.toLowerCase().includes('emitente:')) && !detectedEmpresa) {
      const cleanEmp = l.replace(/^(?:empresa|emitente):\s*/i, '').replace(/^[;,\s]+|[;,\s]+$/g, '').trim();
      if (cleanEmp) detectedEmpresa = cleanEmp;
    }
    const genMatch = l.match(/Data:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (genMatch && !detectedDataGeracao) {
      detectedDataGeracao = genMatch[1];
    }
  }

  const items: SigaReportItem[] = [];
  const startRow = headerLineIdx >= 0 ? headerLineIdx + 1 : 0;

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const lowerLine = line.toLowerCase();
    if (
      lowerLine.startsWith('total') ||
      lowerLine.includes('total de notas') ||
      lowerLine.includes('quantidade total') ||
      lowerLine.includes('informações fiscais') ||
      lowerLine.includes('informacoes fiscais')
    ) {
      continue;
    }

    const tokens = parseCsvLineTokens(line, delim);
    if (tokens.length < 2) continue;

    // 1. Chave de Acesso
    let chaveToken = '';
    if (chaveIdx >= 0 && tokens[chaveIdx]) {
      const clean = tokens[chaveIdx].replace(/\D/g, '');
      if (clean.length === 44) chaveToken = clean;
    }
    if (!chaveToken) {
      const cand = tokens.find(t => t.replace(/\D/g, '').length === 44);
      if (cand) chaveToken = cand.replace(/\D/g, '');
    }

    // 2. Chave de Acesso Decomposition (Standard 44-digit rule)
    let modFromKey = '65';
    let serieFromKey = '1';
    let cnpjFromKey = '';
    let nfFromKey = '';
    let ufFromKey = 'CE';
    let anoMesKey = '';

    if (chaveToken && chaveToken.length === 44) {
      const ufCode = chaveToken.substring(0, 2);
      anoMesKey = chaveToken.substring(2, 6);
      cnpjFromKey = formatCnpjCpfHelper(chaveToken.substring(6, 20));
      modFromKey = chaveToken.substring(20, 22) || '65';
      serieFromKey = chaveToken.substring(22, 25).replace(/^0+/, '') || '1';
      nfFromKey = chaveToken.substring(25, 34).replace(/^0+/, '') || '';
      if (UF_MAP[ufCode]) ufFromKey = UF_MAP[ufCode].sigla;
    }

    // 3. Modelo da Nota
    let modeloVal = modFromKey;
    if (modeloIdx >= 0 && tokens[modeloIdx]) {
      modeloVal = tokens[modeloIdx].replace(/\D/g, '') || modFromKey;
    }

    // 4. Número da Nota Fiscal
    let nfNum = '';
    if (notaIdx >= 0 && tokens[notaIdx]) {
      nfNum = tokens[notaIdx].replace(/\D/g, '').replace(/^0+/, '');
    }
    if (!nfNum || nfNum === '0') {
      nfNum = nfFromKey;
    }
    if (!nfNum) {
      const numCand = tokens.find((t, idx) => idx !== chaveIdx && idx !== dataIdx && /^\d{1,9}$/.test(t.trim()) && t.trim() !== '0');
      if (numCand) nfNum = numCand.trim().replace(/^0+/, '');
    }
    if (!nfNum) continue;

    // 5. Série
    let serieVal = serieFromKey;
    if (serieIdx >= 0 && tokens[serieIdx]) {
      serieVal = tokens[serieIdx].replace(/\D/g, '').replace(/^0+/, '') || serieFromKey;
    }

    // 6. Data de Emissão
    let dateVal = '';
    if (dataIdx >= 0 && tokens[dataIdx]) {
      const dMatch = tokens[dataIdx].match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
      if (dMatch) {
        dateVal = `${dMatch[1]}/${dMatch[2]}/${dMatch[3]}`;
      } else {
        const isoMatch = tokens[dataIdx].match(/(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) dateVal = `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
      }
    }
    if (!dateVal) {
      const dCand = tokens.find(t => /\b\d{2}[/-]\d{2}[/-]\d{4}\b/.test(t));
      if (dCand) {
        const m = dCand.match(/\b(\d{2})[/-](\d{2})[/-](\d{4})\b/);
        if (m) dateVal = `${m[1]}/${m[2]}/${m[3]}`;
      }
    }
    if (!dateVal && anoMesKey && anoMesKey.length === 4) {
      dateVal = `01/${anoMesKey.substring(2, 4)}/20${anoMesKey.substring(0, 2)}`;
    }
    if (!dateVal) {
      dateVal = new Date().toLocaleDateString('pt-BR');
    }

    // 7. Situação / Status
    let situacao = 'AUTORIZADA';
    let statusRaw = '';
    if (situacaoIdx >= 0 && tokens[situacaoIdx]) {
      statusRaw = tokens[situacaoIdx].toUpperCase();
    } else {
      const stCand = tokens.find(t => /AUTORIZADA|CANCELADA|INUTILIZADA|DENEGADA/i.test(t));
      if (stCand) statusRaw = stCand.toUpperCase();
    }
    if (statusRaw.includes('CANCEL')) situacao = 'CANCELADA';
    else if (statusRaw.includes('DENEG')) situacao = 'DENEGADA';
    else if (statusRaw.includes('INUTIL')) situacao = 'INUTILIZADA';
    else if (statusRaw.includes('AUTORIZ')) situacao = 'AUTORIZADA';
    else if (statusRaw) situacao = statusRaw;

    const isCanceled = situacao === 'CANCELADA';

    // 8. Valor Total / Contábil
    let rawVal = 0;
    if (valorIdx >= 0 && tokens[valorIdx]) {
      rawVal = parsePtBrFloatHelper(tokens[valorIdx]);
    }
    if (rawVal === 0) {
      const cand = tokens.find((t, idx) => {
        if (idx === chaveIdx || idx === notaIdx || idx === dataIdx || idx === situacaoIdx) return false;
        if (/AUTORIZADA|CANCELADA|INUTILIZADA|DENEGADA/i.test(t)) return false;
        if (/\d{2}\/\d{2}\/\d{4}/.test(t)) return false;
        return /^-?\d{1,3}(\.\d{3})*,\d{2}$|^-?\d+,\d{2}$|^-?\d+\.\d{2}$/.test(t.trim());
      });
      if (cand) rawVal = parsePtBrFloatHelper(cand);
    }
    const finalVal = isCanceled ? 0 : rawVal;

    // 9. CNPJ & Razão Social
    let cnpjVal = cnpjFromKey;
    if (cnpjEmitIdx >= 0 && tokens[cnpjEmitIdx]) {
      const c = formatCnpjCpfHelper(tokens[cnpjEmitIdx]);
      if (c) cnpjVal = c;
    }
    let nomeVal = '';
    if (nomeEmitIdx >= 0 && tokens[nomeEmitIdx]) {
      nomeVal = tokens[nomeEmitIdx].trim();
    }
    if (!detectedEmpresa && nomeVal) {
      detectedEmpresa = nomeVal;
    }

    // 10. UF
    let ufVal = ufFromKey;
    if (ufIdx >= 0 && tokens[ufIdx] && /^[A-Za-z]{2}$/.test(tokens[ufIdx].trim())) {
      ufVal = tokens[ufIdx].trim().toUpperCase();
    }

    // 11. CFOP
    let cfopVal = '5102';
    if (cfopIdx >= 0 && tokens[cfopIdx]) {
      cfopVal = tokens[cfopIdx].trim();
    }

    // 12. ICMS Base & Valor
    let baseIcms = finalVal;
    if (baseIcmsIdx >= 0 && tokens[baseIcmsIdx]) {
      baseIcms = isCanceled ? 0 : parsePtBrFloatHelper(tokens[baseIcmsIdx]);
    }
    let valorIcms = isCanceled ? 0 : Math.round(finalVal * 0.18 * 100) / 100;
    if (valorIcmsIdx >= 0 && tokens[valorIcmsIdx]) {
      valorIcms = isCanceled ? 0 : parsePtBrFloatHelper(tokens[valorIcmsIdx]);
    }

    // 13. Desconto
    let descVal = 0;
    if (descontoIdx >= 0 && tokens[descontoIdx]) {
      descVal = parsePtBrFloatHelper(tokens[descontoIdx]);
    }

    const isNfceDoc = modeloVal === '65';

    items.push({
      id: `sai-nfce-${Math.random().toString(36).substring(2, 9)}`,
      notaFiscal: nfNum,
      modelo: modeloVal || '65',
      serie: serieVal || '1',
      data: dateVal,
      vlrContabil: finalVal,
      cnpj: isNfceDoc ? '' : (cnpjVal || '99.999.999/0001-99'),
      razaoSocial: isNfceDoc ? '' : (nomeVal || 'CONSUMIDOR'),
      uf: ufVal,
      chaveDeAcesso: chaveToken || '',
      situacaoNfe: situacao,
      cfop: cfopVal,
      codigoProduto: `NF-${nfNum}`,
      nomeProduto: isCanceled ? 'VENDA NFC-E MODELO 65 [CANCELADA]' : 'VENDA NFC-E MODELO 65',
      ncm: 'N/A',
      un: 'UN',
      qtde: 1,
      rUnit: rawVal,
      rProduto: finalVal,
      desconto: descVal,
      cst: isCanceled ? '900' : '000',
      rBaseIcms: baseIcms,
      pIcms: isCanceled ? 0 : 18,
      rIcms: valorIcms,
      pIpi: 0,
      rIpi: 0,
      tipoOperacao: 'SAIDA'
    });
  }

  if (items.length === 0) return null;

  if (!detectedPeriodo && items.length > 0) {
    const dates = items.map(it => it.data).filter(Boolean);
    if (dates.length > 0) {
      const parts = dates[0].split('/');
      if (parts.length === 3) {
        detectedPeriodo = `${parts[1]}/${parts[2]}`;
      }
    }
  }

  return {
    items,
    metadata: {
      empresa: detectedEmpresa || 'EMPRESA IDENTIFICADA NO RELATÓRIO NFC-E',
      periodo: detectedPeriodo || 'Período Auditado',
      dataGeracao: detectedDataGeracao || new Date().toLocaleDateString('pt-BR')
    },
    isValid: true
  };
}

/**
 * Combined full report parser using dedicated readers for Entradas and Saídas.
 */
export function parseSigaFullReport(text: string): {
  entradas: SigaReportItem[];
  saidas: SigaReportItem[];
  metadata: SigaReportMetadata;
} {
  // If the uploaded file is an NFC-e CSV report (all items are outbound sales)
  const nfceResult = parseSigaNfceCsv(text, 'SAIDA');
  if (nfceResult && nfceResult.isValid && nfceResult.items.length > 0) {
    return {
      entradas: [],
      saidas: nfceResult.items,
      metadata: nfceResult.metadata
    };
  }

  const { items: entradas, metadata: metaEntradas } = parseSigaEntradas(text);
  const { items: saidas, metadata: metaSaidas } = parseSigaSaidas(text);

  const metadata: SigaReportMetadata = {
    empresa: metaEntradas.empresa || metaSaidas.empresa || 'SL DISTRIBUIDORA DE PRODUTOS ALIMENTICIO',
    periodo: metaEntradas.periodo || metaSaidas.periodo || 'Período não identificado',
    dataGeracao: metaEntradas.dataGeracao || metaSaidas.dataGeracao || new Date().toLocaleDateString('pt-BR')
  };

  return { entradas, saidas, metadata };
}

/**
 * Canal Import Parser: Classifies all items in the uploaded file strictly according to the channel origin.
 * Canal A (Documentos Emitidos) -> forceType: 'SAIDA'
 * Canal B (Documentos Recebidos) -> forceType: 'ENTRADA'
 */
export function parseSigaChannelFile(
  text: string,
  forceType: 'SAIDA' | 'ENTRADA'
): {
  items: SigaReportItem[];
  metadata: SigaReportMetadata;
  isValid: boolean;
} {
  if (!text || !text.trim()) {
    return { items: [], metadata: { empresa: '', periodo: '', dataGeracao: '' }, isValid: false };
  }

  // 1. Dynamic check for NFC-e / SEFAZ CSV reports
  const nfceResult = parseSigaNfceCsv(text, forceType);
  if (nfceResult && nfceResult.isValid && nfceResult.items.length > 0) {
    return nfceResult;
  }

  // 2. Fallback to standard SIGA / TXT parsing
  const lines = text.split(/\r?\n/);
  const items: SigaReportItem[] = [];
  let empresa = '';
  let periodo = '';
  let dataGeracao = '';

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.includes('DISTRIBUIDORA') || line.includes('PRODUTOS ALIMENTICIO') || line.includes('LTDA') || line.includes('S.A')) {
      const parts = line.split(';');
      if (parts[0] && !empresa) empresa = parts[0].trim();
    }
    if (line.includes('De:') && line.includes('até:')) {
      const parts = line.split(';');
      if (parts[0]) periodo = parts[0].replace(/\s+/g, ' ').trim();
      const datePart = parts.find(p => p.toLowerCase().includes('data:'));
      if (datePart) dataGeracao = datePart.replace(/data:/i, '').trim();
    }

    const item = parseGenericSigaLine(line, forceType);
    if (item) {
      items.push(item);
    }
  }

  const isValid = items.length > 0;

  return {
    items,
    metadata: {
      empresa: empresa || 'EMPRESA IDENTIFICADA NO RELATÓRIO',
      periodo: periodo || 'Período não identificado',
      dataGeracao: dataGeracao || new Date().toLocaleDateString('pt-BR')
    },
    isValid
  };
}

/**
 * 2. MÓDULO DE AUDITORIA INDEPENDENTE:
 * Algoritmo de Deduplicação.
 * Critério exato: Chave de Acesso + Número da Nota + Valor Total.
 */
export function getSigaDeduplicationKey(item: SigaReportItem): string {
  const chave = item.chaveDeAcesso ? item.chaveDeAcesso.trim().replace(/\D/g, '') : '';
  const nota = (item.notaFiscal || '').trim().replace(/\D/g, '').replace(/^0+/, '') || '0';
  const valor = (Number(item.vlrContabil) || 0).toFixed(2);

  if (chave && chave.length === 44) {
    return `CHV_${chave}_N_${nota}_V_${valor}`;
  }

  // Fallback se a Chave de Acesso não estiver presente no arquivo texto:
  const cnpjClean = (item.cnpj || '').trim().replace(/\D/g, '');
  const dataClean = (item.data || '').trim();
  return `CNPJ_${cnpjClean || 'DOC'}_N_${nota}_V_${valor}_D_${dataClean}`;
}

export function identifySigaDuplicates(items: SigaReportItem[]): {
  itemsWithStatus: SigaReportItem[];
  summary: {
    totalProcessed: number;
    uniqueRecords: number;
    duplicateCount: number;
    duplicatedValue: number;
    sanitizedTotalValue: number;
    originalTotalValue: number;
  };
} {
  const frequencyMap = new Map<string, number>();

  items.forEach(item => {
    const key = getSigaDeduplicationKey(item);
    frequencyMap.set(key, (frequencyMap.get(key) || 0) + 1);
  });

  const seenKeys = new Set<string>();
  let duplicateCount = 0;
  let duplicatedValue = 0;
  let originalTotalValue = 0;
  let sanitizedTotalValue = 0;

  const itemsWithStatus = items.map((item, idx) => {
    const key = getSigaDeduplicationKey(item);
    const count = frequencyMap.get(key) || 1;
    const val = Number(item.vlrContabil) || 0;
    originalTotalValue += val;

    let isDuplicate = false;
    if (seenKeys.has(key)) {
      isDuplicate = true;
      duplicateCount++;
      duplicatedValue += val;
    } else {
      seenKeys.add(key);
      sanitizedTotalValue += val;
    }

    return {
      ...item,
      id: item.id || `siga-${idx}-${Math.random().toString(36).substring(2, 7)}`,
      isDuplicate,
      deduplicationKey: key,
      duplicateGroupCount: count
    };
  });

  return {
    itemsWithStatus,
    summary: {
      totalProcessed: items.length,
      uniqueRecords: items.length - duplicateCount,
      duplicateCount,
      duplicatedValue,
      sanitizedTotalValue,
      originalTotalValue
    }
  };
}

/**
 * 3. APRIMORAMENTO DA EXPORTAÇÃO EXCEL:
 * Gera planilha Excel com abas separadas 'Entradas' e 'Saídas'.
 * Aplica Formatação Condicional (destaque em vermelho para notas duplicadas).
 * Adiciona linha de 'Resumo de Auditoria' no topo de cada aba.
 */
export function exportSigaAuditExcel({
  entradas,
  saidas,
  metadata,
  filename = `Auditoria_SIGA_Saneado_${Date.now()}.xlsx`
}: {
  entradas: SigaReportItem[];
  saidas: SigaReportItem[];
  metadata: SigaReportMetadata | null;
  filename?: string;
}): void {
  const wb = XLSX.utils.book_new();

  const styleHeaderTitle = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 14, bold: true, color: { rgb: "E4B35E" } },
    alignment: { horizontal: "center", vertical: "center" }
  };
  const styleHeaderSub = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" }
  };
  const styleAuditSummaryBanner = {
    fill: { fgColor: { rgb: "1E293B" } },
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "E4B35E" } },
    alignment: { horizontal: "left", vertical: "center" }
  };
  const styleAuditSummaryDetail = {
    fill: { fgColor: { rgb: "F1F5F9" } },
    font: { name: "Arial", sz: 9.5, bold: true, color: { rgb: "0F172A" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      bottom: { style: "medium", color: { rgb: "CBD5E1" } },
      top: { style: "thin", color: { rgb: "CBD5E1" } }
    }
  };

  const getTableHeaderStyle = (align: 'left' | 'center' | 'right' = 'center') => ({
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: align, vertical: "center" },
    border: {
      top: { style: "medium", color: { rgb: "04243B" } },
      bottom: { style: "medium", color: { rgb: "E4B35E" } }
    }
  });

  const getStandardRowStyle = (isEven: boolean, align: 'left' | 'center' | 'right' = 'left') => ({
    fill: { fgColor: { rgb: isEven ? "FFFFFF" : "F8FAFC" } },
    font: { name: "Arial", sz: 9, color: { rgb: "1E293B" } },
    alignment: { horizontal: align, vertical: "center" },
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } }
    }
  });

  // RED CONDITIONAL FORMATTING STYLE FOR DUPLICATE ENTRIES
  const getDuplicateRowStyle = (align: 'left' | 'center' | 'right' = 'left') => ({
    fill: { fgColor: { rgb: "FEE2E2" } }, // Red highlight background
    font: { name: "Arial", sz: 9, bold: true, color: { rgb: "990000" } }, // Dark Red text
    alignment: { horizontal: align, vertical: "center" },
    border: {
      bottom: { style: "thin", color: { rgb: "FCA5A5" } },
      top: { style: "thin", color: { rgb: "FCA5A5" } }
    }
  });

  const colConfigs: { header: string; key: keyof SigaReportItem; align: 'left' | 'center' | 'right'; width: number; isNumeric?: boolean; format?: string }[] = [
    { header: 'Nota Fiscal', key: 'notaFiscal', align: 'center', width: 14 },
    { header: 'Modelo', key: 'modelo', align: 'center', width: 10 },
    { header: 'Série', key: 'serie', align: 'center', width: 10 },
    { header: 'Data Emissão', key: 'data', align: 'center', width: 14 },
    { header: 'Valor R$', key: 'vlrContabil', align: 'right', width: 16, isNumeric: true, format: '"R$ " #,##0.00' },
    { header: 'CNPJ Emitente', key: 'cnpj', align: 'center', width: 20 },
    { header: 'Razão Social Emitente', key: 'razaoSocial', align: 'left', width: 38 },
    { header: 'UF', key: 'uf', align: 'center', width: 8 },
    { header: 'Chave de Acesso', key: 'chaveDeAcesso', align: 'center', width: 46 },
    { header: 'Situação NF-e', key: 'situacaoNfe', align: 'center', width: 16 }
  ];

  const makeSheet = (sheetName: string, rawItems: SigaReportItem[]) => {
    const ws: any = {};
    const { itemsWithStatus, summary } = identifySigaDuplicates(rawItems);
    const numCols = colConfigs.length;

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }, // Main Header Title
      { s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } }, // Subtitle
      { s: { r: 2, c: 0 }, e: { r: 2, c: numCols - 1 } }, // Resumo de Auditoria Title
      { s: { r: 3, c: 0 }, e: { r: 3, c: numCols - 1 } }, // Resumo de Auditoria Stats
    ];

    // 1. Header Block
    ws['A1'] = { v: 'MOREIRA & LIMA CONTADORES ASSOCIADOS - AUDITORIA DE RELATÓRIOS SIGA/SEFAZ', s: styleHeaderTitle };
    ws['A2'] = { v: `SÍNTESE DE MOVIMENTAÇÃO DE ${sheetName.toUpperCase()} - PERÍODO: ${metadata?.periodo || 'NÃO INFORMADO'}`, s: styleHeaderSub };

    // 2. Resumo de Auditoria (Top Summary Block)
    ws['A3'] = { v: `🛡️ RESUMO DE AUDITORIA & SANEAMENTO DE DUPLICIDADES - ${sheetName.toUpperCase()}`, s: styleAuditSummaryBanner };
    const summaryText = `Total Processado: ${summary.totalProcessed} reg. | Únicos (Saneados): ${summary.uniqueRecords} | Duplicidades Detectadas: ${summary.duplicateCount} | Valor Duplicado Removido: R$ ${summary.duplicatedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Total Bruto Original: R$ ${summary.originalTotalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Total Real Saneado: R$ ${summary.sanitizedTotalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    ws['A4'] = { v: summaryText, s: styleAuditSummaryDetail };

    // 3. Table Column Headers
    colConfigs.forEach((cfg, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: 5, c: colIdx });
      ws[cellRef] = { v: cfg.header, s: getTableHeaderStyle(cfg.align) };
    });

    // Sort items so duplicates appear with clear context or preserve original order
    const ptBrCollator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
    const sortedItems = [...itemsWithStatus].sort((a, b) => {
      const numA = parseInt((a.notaFiscal || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt((b.notaFiscal || '').replace(/\D/g, ''), 10) || 0;
      if (numA !== numB) return numA - numB;
      return ptBrCollator.compare(a.nomeProduto || '', b.nomeProduto || '');
    });

    // 4. Rows Writing with Conditional Red Formatting
    sortedItems.forEach((item, rowIdx) => {
      const r = 6 + rowIdx;
      const isDup = Boolean(item.isDuplicate);
      const chave = item.chaveDeAcesso || '';
      const isChave44 = chave.length === 44;

      colConfigs.forEach((cfg, colIdx) => {
        const style = isDup ? getDuplicateRowStyle(cfg.align) : getStandardRowStyle(rowIdx % 2 === 0, cfg.align);
        const cellRef = XLSX.utils.encode_cell({ r, c: colIdx });

        let cellValue: any = item[cfg.key as keyof SigaReportItem];

        const isNfceRow = item.modelo === '65' || (isChave44 && chave.substring(20, 22) === '65');

        if (cfg.key === 'modelo') {
          cellValue = item.modelo || (isChave44 ? chave.substring(20, 22) : '55');
        } else if (cfg.key === 'serie') {
          cellValue = item.serie || (isChave44 ? (chave.substring(22, 25).replace(/^0+/, '') || '1') : '1');
        } else if (cfg.key === 'uf') {
          cellValue = item.uf || (isChave44 ? (UF_MAP[chave.substring(0, 2)]?.sigla || 'CE') : 'CE');
        } else if (cfg.key === 'situacaoNfe') {
          cellValue = item.situacaoNfe || 'AUTORIZADA';
        } else if (cfg.key === 'razaoSocial') {
          cellValue = isNfceRow ? '' : (item.razaoSocial || item.nomeProduto || 'NÃO INFORMADO');
        } else if (cfg.key === 'cnpj') {
          cellValue = isNfceRow ? '' : item.cnpj;
        }

        if (cfg.isNumeric) {
          const numVal = typeof cellValue === 'number' ? cellValue : parseFloat(cellValue as string) || 0;
          ws[cellRef] = {
            v: numVal,
            t: 'n',
            s: style,
            ...(cfg.format ? { z: cfg.format } : {})
          };
        } else {
          ws[cellRef] = {
            v: cellValue === undefined || cellValue === null ? '' : String(cellValue),
            s: style
          };
        }
      });
    });

    const maxRow = 6 + sortedItems.length;
    ws['!ref'] = `A1:${XLSX.utils.encode_col(numCols - 1)}${maxRow}`;
    ws['!cols'] = colConfigs.map(cfg => ({ wch: cfg.width }));

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  };

  makeSheet('Entradas', entradas);
  makeSheet('Saídas', saidas);

  XLSX.writeFile(wb, filename);
}

