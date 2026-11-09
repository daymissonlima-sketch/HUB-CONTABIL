import { FornecedorReforma, CsvImportPreviewItem, RegimeTributarioFornecedor, PotencialCreditoReforma } from '../types_reforma';
import { isValidCNPJ } from '../utils/cnpjHelper';
import * as XLSX from 'xlsx-js-style';

const CACHE_PREFIX = 'fornecedor_cnpj_cache_';
const FORNECEDORES_STORAGE_KEY = 'reforma_tributaria_fornecedores_list';

/**
 * Formata um CNPJ com máscara padrão 00.000.000/0001-00
 */
export function formatCnpj(digits: string): string {
  const clean = (digits || '').replace(/\D/g, '').slice(0, 14);
  if (clean.length < 14) return clean;
  return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/**
 * Limpa o CNPJ mantendo apenas números
 */
export function cleanCnpj(val: string): string {
  return (val || '').replace(/\D/g, '');
}

/**
 * Carrega a lista de fornecedores salva localmente
 */
export function loadSavedFornecedores(): FornecedorReforma[] {
  try {
    const raw = localStorage.getItem(FORNECEDORES_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Erro ao carregar fornecedores do armazenamento:', err);
    return [];
  }
}

/**
 * Salva a lista de fornecedores no armazenamento local
 */
export function saveFornecedores(list: FornecedorReforma[]): void {
  try {
    localStorage.setItem(FORNECEDORES_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Erro ao salvar fornecedores no armazenamento:', err);
  }
}

/**
 * Recupera o cache de consulta de um CNPJ
 */
export function getCachedCnpjResult(cnpjClean: string): Partial<FornecedorReforma> | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${cnpjClean}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Salva o resultado de consulta de um CNPJ no cache
 */
export function setCachedCnpjResult(cnpjClean: string, data: Partial<FornecedorReforma>): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${cnpjClean}`, JSON.stringify(data));
  } catch {
    // Ignore quota issues
  }
}

/**
 * Parser inteligente de CSV/Texto para fornecedores.
 * Detecta delimitadores (;, \t, ,) e identifica colunas de Razão Social e CNPJ automaticamente.
 */
export function parseFornecedoresCsvOrText(rawContent: string): CsvImportPreviewItem[] {
  if (!rawContent || !rawContent.trim()) return [];

  const lines = rawContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect delimiter based on first 5 lines
  const sample = lines.slice(0, 5).join('\n');
  const semicolonCount = (sample.match(/;/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;

  let delimiter = ';';
  if (tabCount > semicolonCount && tabCount > commaCount) delimiter = '\t';
  else if (commaCount > semicolonCount && commaCount > tabCount) delimiter = ',';

  // Helper to split a line safely handling quotes
  const parseLine = (line: string): string[] => {
    if (delimiter === '\t') {
      return line.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
    }
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''));
    return result;
  };

  const parsedRows = lines.map(parseLine);
  if (parsedRows.length === 0) return [];

  // Check if first row is header
  const firstRow = parsedRows[0].map(c => c.toLowerCase());
  let cnpjColIndex = -1;
  let nameColIndex = -1;

  firstRow.forEach((col, idx) => {
    if (/cnpj|cgc|documento|doc|cpf_cnpj/i.test(col)) {
      cnpjColIndex = idx;
    }
    if (/razao|nome|fornecedor|empresa|denominacao/i.test(col)) {
      nameColIndex = idx;
    }
  });

  let dataRows = parsedRows;
  const hasHeader = cnpjColIndex !== -1 || nameColIndex !== -1 || isNaN(Number(cleanCnpj(firstRow[0])));
  if (hasHeader && (cnpjColIndex !== -1 || nameColIndex !== -1)) {
    dataRows = parsedRows.slice(1);
  }

  // If columns not determined by header, infer dynamically per row
  const previewItems: CsvImportPreviewItem[] = [];
  const seenCnpjs = new Set<string>();

  dataRows.forEach((cols, rowIdx) => {
    if (cols.length === 0 || cols.every(c => !c)) return;

    let candidateCnpj = '';
    let candidateName = '';

    if (cnpjColIndex !== -1 && cols[cnpjColIndex]) {
      candidateCnpj = cleanCnpj(cols[cnpjColIndex]);
    }
    if (nameColIndex !== -1 && cols[nameColIndex]) {
      candidateName = cols[nameColIndex];
    }

    // Heuristic inference if not resolved
    if (!candidateCnpj || candidateCnpj.length !== 14) {
      for (let i = 0; i < cols.length; i++) {
        const cleaned = cleanCnpj(cols[i]);
        if (cleaned.length === 14) {
          candidateCnpj = cleaned;
          if (nameColIndex === -1) {
            candidateName = cols.find((c, idx) => idx !== i && c.trim().length > 2) || '';
          }
          break;
        }
      }
    }

    if (!candidateName) {
      const nonCnpjCol = cols.find(c => cleanCnpj(c).length !== 14 && c.trim().length > 0);
      candidateName = nonCnpjCol || `Fornecedor CNPJ ${formatCnpj(candidateCnpj)}`;
    }

    const clean = candidateCnpj;
    const isValid = isValidCNPJ(clean);

    let erro: string | undefined = undefined;
    if (!clean) {
      erro = 'CNPJ não identificado na linha';
    } else if (clean.length !== 14) {
      erro = `CNPJ incompleto (${clean.length} dígitos)`;
    } else if (!isValid) {
      erro = 'Dígitos verificadores do CNPJ inválidos';
    } else if (seenCnpjs.has(clean)) {
      erro = 'CNPJ duplicado neste arquivo (será unificado)';
    }

    if (clean && isValid) {
      seenCnpjs.add(clean);
    }

    previewItems.push({
      id: `preview_${rowIdx}_${clean || Math.random().toString(36).substring(2, 7)}`,
      cnpj: clean,
      cnpjFormatted: clean ? formatCnpj(clean) : cols.join(' | '),
      razaoSocial: candidateName.trim() || 'Razão Social Não Informada',
      valido: isValid && !erro,
      erro
    });
  });

  return previewItems;
}

/**
 * Consulta a situação do CNPJ na API (BrasilAPI / publica.cnpj.ws via /api/cnpj/:cnpj)
 * Trata status 429 com erro específico de Rate Limit.
 */
export async function consultarCnpjSimples(cleanDoc: string): Promise<Partial<FornecedorReforma>> {
  const clean = cleanCnpj(cleanDoc);
  if (clean.length !== 14 || !isValidCNPJ(clean)) {
    throw new Error('CNPJ inválido');
  }

  // 1. Try local cache first
  const cached = getCachedCnpjResult(clean);
  if (cached && cached.regimeTributario && cached.regimeTributario !== 'DESCONHECIDO') {
    return {
      ...cached,
      statusConsulta: 'concluido'
    };
  }

  let data: any = null;
  let isRateLimited = false;

  // 2. Query internal proxy /api/cnpj/:cnpj
  try {
    const res = await fetch(`/api/cnpj/${clean}`);
    if (res.status === 429) {
      isRateLimited = true;
    } else if (res.ok) {
      const text = await res.text();
      if (text && (text.trim().startsWith('{') || text.trim().startsWith('['))) {
        data = JSON.parse(text);
      }
    }
  } catch (err) {
    console.warn(`[FornecedorSimplesService] Proxy call failed for ${clean}:`, err);
  }

  // If rate limited by server, throw explicit Rate Limit error
  if (isRateLimited) {
    const err: any = new Error('RATE_LIMIT_EXCEEDED');
    err.isRateLimit = true;
    throw err;
  }

  // 3. Client-side fallback to BrasilAPI
  if (!data) {
    try {
      const bRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
      if (bRes.status === 429) {
        const err: any = new Error('RATE_LIMIT_EXCEEDED');
        err.isRateLimit = true;
        throw err;
      }
      if (bRes.ok) {
        data = await bRes.json();
      }
    } catch (bErr: any) {
      if (bErr?.isRateLimit) throw bErr;
    }
  }

  // 4. Client-side fallback to publica.cnpj.ws
  if (!data) {
    try {
      const pubRes = await fetch(`https://publica.cnpj.ws/cnpj/${clean}`);
      if (pubRes.status === 429) {
        const err: any = new Error('RATE_LIMIT_EXCEEDED');
        err.isRateLimit = true;
        throw err;
      }
      if (pubRes.ok) {
        data = await pubRes.json();
      }
    } catch (pubErr: any) {
      if (pubErr?.isRateLimit) throw pubErr;
    }
  }

  if (!data) {
    throw new Error('Não foi possível obter os dados deste CNPJ na base pública.');
  }

  // Map response to domain model
  const razaoSocial = data.razao_social || data.nome || '';
  const nomeFantasia = data.nome_fantasia || data.fantasia || '';
  const situacaoCadastral = data.descricao_situacao_cadastral || data.situacao || data.estabelecimento?.situacao_cadastral || 'ATIVA';
  
  // Simples Nacional detection
  const isSimples = 
    data.simples?.optante === 'Sim' || 
    data.simples?.optante === true || 
    data.opcao_pelo_simples === true ||
    data.simples_nacional?.optante === true;

  const dataOpcaoSimples = data.simples?.data_opcao || data.data_opcao_pelo_simples || data.simples_nacional?.data_opcao || '';
  const dataExclusaoSimples = data.simples?.data_exclusao || data.data_exclusao_do_simples || data.simples_nacional?.data_exclusao || '';

  // MEI detection
  const isMei = 
    data.mei?.optante === true || 
    data.mei?.optante === 'Sim' || 
    data.opcao_pelo_mei === true ||
    data.simples_nacional?.optante_mei === true;

  let regimeTributario: RegimeTributarioFornecedor = 'REGIME_NORMAL';
  let potencialCredito: PotencialCreditoReforma = 'INTEGRAL';
  let impactoDescricao = 'Crédito Integral de IBS e CBS (~26,5%). Gera o máximo de crédito fiscal na Reforma Tributária para a sua empresa compradora.';

  if (isMei) {
    regimeTributario = 'MEI';
    potencialCredito = 'NENHUM';
    impactoDescricao = 'Sem Crédito Fiscal de IBS/CBS na Reforma Tributária (recolhimento em taxa fixa sem repasse de créditos).';
  } else if (isSimples) {
    regimeTributario = 'SIMPLES_NACIONAL';
    potencialCredito = 'RESTRITO';
    impactoDescricao = 'Crédito Restrito/Reduzido na Reforma Tributária. A aquisição gera crédito apenas no montante efetivamente recolhido no DAS.';
  }

  const est = data.estabelecimento || {};
  const uf = est.estado?.sigla || data.uf || '';
  const municipio = est.cidade?.nome || est.municipio?.nome || data.municipio || '';
  const cnae = data.cnae_fiscal || est.atividade_principal?.id || '';
  const cnaeDescricao = data.cnae_fiscal_descricao || est.atividade_principal?.descricao || '';

  const mappedResult: Partial<FornecedorReforma> = {
    razaoSocial: razaoSocial || undefined,
    nomeFantasia: nomeFantasia || undefined,
    situacaoCadastral: String(situacaoCadastral).toUpperCase(),
    optanteSimples: isSimples,
    dataOpcaoSimples,
    dataExclusaoSimples,
    optanteMei: isMei,
    regimeTributario,
    potencialCreditoIbsCbs: potencialCredito,
    impactoDescricao,
    uf,
    municipio,
    cnae: String(cnae),
    cnaeDescricao,
    dataConsulta: new Date().toISOString(),
    statusConsulta: 'concluido'
  };

  // Cache result
  setCachedCnpjResult(clean, mappedResult);

  return mappedResult;
}

/**
 * Gera arquivo CSV modelo para download
 */
export function generateSampleCsv(): string {
  const header = 'Razao Social;CNPJ\n';
  const rows = [
    'PETROBRAS DISTRIBUIDORA S.A.;33.000.167/0001-01',
    'AMBEV S.A.;07.526.557/0001-00',
    'MERCADINHO SAO JOSE LTDA;08.470.032/0001-62',
    'DISTRIBUIDORA CEARA ALIMENTOS;09.662.119/0001-02',
    'SILVA SERVICOS DE MANUTENCAO ME;10.599.113/0001-09'
  ].join('\n');
  return `\uFEFF${header}${rows}`;
}

/**
 * Exporta a lista filtrada de fornecedores para Excel (.xlsx) com layout estilizado
 */
export function exportFornecedoresToExcel(
  fornecedores: FornecedorReforma[],
  tipoFiltro: 'todos' | 'regime_normal' | 'simples_nacional' | 'mei'
): void {
  const wb = XLSX.utils.book_new();

  let tituloAba = 'Fornecedores';
  let tituloRelatorio = 'RELATÓRIO GERAL DE FORNECEDORES - ANÁLISE DE REGIME TRIBUTÁRIO';

  if (tipoFiltro === 'regime_normal') {
    tituloAba = 'Regime Normal';
    tituloRelatorio = 'FORNECEDORES EM REGIME NORMAL - ALTO POTENCIAL DE CRÉDITO IBS/CBS';
  } else if (tipoFiltro === 'simples_nacional') {
    tituloAba = 'Simples Nacional';
    tituloRelatorio = 'FORNECEDORES NO SIMPLES NACIONAL - CRÉDITO FISCAL RESTRITO (REFORMA)';
  } else if (tipoFiltro === 'mei') {
    tituloAba = 'Fornecedores MEI';
    tituloRelatorio = 'FORNECEDORES MICROEMPREENDEDOR INDIVIDUAL (MEI) - SEM CRÉDITO IBS/CBS';
  }

  // Data rows
  const headers = [
    'Razão Social',
    'Nome Fantasia',
    'CNPJ',
    'Regime Tributário',
    'Optante Simples',
    'Optante MEI',
    'Potencial Crédito Reforma (IBS/CBS)',
    'Impacto Tributário na Compra',
    'Situação Cadastral',
    'UF',
    'Município',
    'Data da Consulta'
  ];

  const rows = fornecedores.map(f => [
    f.razaoSocial || 'Não informado',
    f.nomeFantasia || '',
    f.cnpjFormatted || formatCnpj(f.cnpj),
    f.regimeTributario === 'REGIME_NORMAL'
      ? 'REGIME NORMAL (Lucro Real / Presumido)'
      : f.regimeTributario === 'SIMPLES_NACIONAL'
      ? 'SIMPLES NACIONAL'
      : f.regimeTributario === 'MEI'
      ? 'SIMEI (MEI)'
      : 'NÃO CONSULTADO / PENDENTE',
    f.optanteSimples === true ? 'SIM' : f.optanteSimples === false ? 'NÃO' : 'PENDENTE',
    f.optanteMei === true ? 'SIM' : f.optanteMei === false ? 'NÃO' : 'PENDENTE',
    f.potencialCreditoIbsCbs === 'INTEGRAL'
      ? 'CRÉDITO PLENO (~26,5%)'
      : f.potencialCreditoIbsCbs === 'RESTRITO'
      ? 'CRÉDITO RESTRITO (SUB-ALÍQUOTA DAS)'
      : f.potencialCreditoIbsCbs === 'NENHUM'
      ? 'SEM CRÉDITO FISCAL'
      : 'PENDENTE DE CONSULTA',
    f.impactoDescricao || '',
    f.situacaoCadastral || 'ATIVA',
    f.uf || '',
    f.municipio || '',
    f.dataConsulta ? new Date(f.dataConsulta).toLocaleString('pt-BR') : 'Não consultado'
  ]);

  // Construct sheet with styling
  const wsData = [
    ['MOREIRA & LIMA CONTADORES ASSOCIADOS - PLATAFORMA DE AUDITORIA & REFORMA TRIBUTÁRIA'],
    [tituloRelatorio],
    [`Emitido em: ${new Date().toLocaleString('pt-BR')} | Total de registros: ${fornecedores.length}`],
    [], // blank line
    headers,
    ...rows
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [
    { wch: 38 }, // Razao Social
    { wch: 25 }, // Fantasia
    { wch: 20 }, // CNPJ
    { wch: 26 }, // Regime
    { wch: 15 }, // Optante Simples
    { wch: 14 }, // MEI
    { wch: 28 }, // Potencial Credito
    { wch: 45 }, // Impacto
    { wch: 18 }, // Situacao
    { wch: 8 },  // UF
    { wch: 20 }, // Municipio
    { wch: 20 }  // Data
  ];

  // Apply styling
  const titleStyle = {
    font: { name: 'Calibri', sz: 12, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '04243B' } }, // Navy
    alignment: { horizontal: 'left', vertical: 'center' }
  };

  const headerStyle = {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '04243B' } },
    fill: { fgColor: { rgb: 'E4B35E' } }, // Gold
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'CCCCCC' } },
      bottom: { style: 'medium', color: { rgb: '04243B' } },
      left: { style: 'thin', color: { rgb: 'CCCCCC' } },
      right: { style: 'thin', color: { rgb: 'CCCCCC' } }
    }
  };

  // Apply to cell A1
  if (ws['A1']) ws['A1'].s = titleStyle;
  if (ws['A2']) ws['A2'].s = { font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '04243B' } } };

  // Headers row is index 4 (0-based) -> row 5
  const headerRowIdx = 4;
  headers.forEach((_, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c: colIdx });
    if (ws[cellRef]) {
      ws[cellRef].s = headerStyle;
    }
  });

  // Apply alternating row backgrounds and highlights for regime
  rows.forEach((row, rIdx) => {
    const curRowIdx = headerRowIdx + 1 + rIdx;
    const isEven = rIdx % 2 === 0;
    const regimeVal = row[3] as string;

    const rowBg = isEven ? 'F8FAFC' : 'FFFFFF';

    headers.forEach((_, cIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: curRowIdx, c: cIdx });
      if (!ws[cellRef]) return;

      const isRegimeCol = cIdx === 3;
      const isCreditCol = cIdx === 6;

      let fgColor = rowBg;
      let fontColor = '000000';
      let isBold = false;

      if (isRegimeCol || isCreditCol) {
        if (regimeVal?.includes('REGIME NORMAL')) {
          fgColor = 'ECFDF5'; // light emerald
          fontColor = '065F46'; // dark green
          isBold = true;
        } else if (regimeVal?.includes('SIMPLES NACIONAL')) {
          fgColor = 'FFFBEB'; // light amber
          fontColor = '92400E'; // dark amber
          isBold = true;
        } else if (regimeVal?.includes('MEI')) {
          fgColor = 'EFF6FF'; // light blue
          fontColor = '1E40AF';
          isBold = true;
        }
      }

      ws[cellRef].s = {
        font: { name: 'Calibri', sz: 10, bold: isBold, color: { rgb: fontColor } },
        fill: { fgColor: { rgb: fgColor } },
        border: {
          bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
          left: { style: 'thin', color: { rgb: 'E2E8F0' } },
          right: { style: 'thin', color: { rgb: 'E2E8F0' } }
        },
        alignment: {
          vertical: 'center',
          horizontal: cIdx === 2 || cIdx === 4 || cIdx === 5 || cIdx === 9 || cIdx === 11 ? 'center' : 'left'
        }
      };
    });
  });

  XLSX.utils.book_append_sheet(wb, ws, tituloAba);

  const fileName = `Fornecedores_Reforma_${tipoFiltro}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Exporta a lista filtrada de fornecedores para CSV formatado
 */
export function exportFornecedoresToCsv(
  fornecedores: FornecedorReforma[],
  tipoFiltro: 'todos' | 'regime_normal' | 'simples_nacional' | 'mei'
): void {
  const headers = [
    'Razao Social',
    'Nome Fantasia',
    'CNPJ',
    'Regime Tributario',
    'Optante Simples',
    'Optante MEI',
    'Potencial Credito IBS CBS',
    'Situacao Cadastral',
    'UF',
    'Municipio',
    'Data Consulta'
  ].join(';');

  const lines = fornecedores.map(f => [
    `"${(f.razaoSocial || '').replace(/"/g, '""')}"`,
    `"${(f.nomeFantasia || '').replace(/"/g, '""')}"`,
    `"${f.cnpjFormatted || formatCnpj(f.cnpj)}"`,
    `"${f.regimeTributario}"`,
    f.optanteSimples === true ? 'SIM' : f.optanteSimples === false ? 'NAO' : 'PENDENTE',
    f.optanteMei === true ? 'SIM' : f.optanteMei === false ? 'NAO' : 'PENDENTE',
    `"${f.potencialCreditoIbsCbs}"`,
    `"${f.situacaoCadastral || 'ATIVA'}"`,
    `"${f.uf || ''}"`,
    `"${f.municipio || ''}"`,
    `"${f.dataConsulta || ''}"`
  ].join(';'));

  const csvContent = `\uFEFF${headers}\n${lines.join('\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Fornecedores_Reforma_${tipoFiltro}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
