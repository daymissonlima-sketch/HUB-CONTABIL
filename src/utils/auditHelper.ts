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

function formatCNPJ(cnpj: string): string {
  return cnpj.length === 14 ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : cnpj;
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
