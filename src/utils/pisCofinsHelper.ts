/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import XLSX from 'xlsx-js-style';

export interface PisCofinsItem {
  id: string;
  empresaId: string;
  data: string;
  modelo: string;
  numeroNota: string;
  cfop: string;
  codigoProduto: string;
  nomeProduto: string;
  cst: string;
  valorProduto: number;
  baseCalculo: number;
  baseCalculoPis: number;
  baseCalculoCofins: number;
  aliquotaPis: number;
  aliquotaCofins: number;
  valorPis: number;
  valorCofins: number;
  valor: number; // compatible with existing code (mapping to valorProduto)
  aliquota: number; // compatible with existing code (total PIS + COFINS rate)
  imposto: number; // compatible with existing code (valorPis + valorCofins)
  tipo: 'entrada' | 'saida';
  isCreditReduction?: boolean;

  // New layout fields
  codSeqNf?: string;
  fornec?: string;
  acum?: string;
  ncm?: string;
  valorContabil?: number;
  cstPis?: string;
  vincCredPis?: string;
  cstCofins?: string;
  vincCredCofins?: string;
  baseCred?: string;
  vincCredProd?: string;
  baseCredProd?: string;
  tipoContrib?: string;
}

export interface PisCofinsMetadata {
  empresa: string;
  cnpj: string;
  periodo: string;
  emissao: string;
}

export interface PisCofinsConsolidatedItem {
  cfop: string;
  cst: string;
  codigoProduto?: string;
  nomeProduto?: string;
  valorProduto: number;
  baseCalculo: number;
  baseCalculoPis: number;
  baseCalculoCofins: number;
  valorPis: number;
  valorCofins: number;
  valor: number; // compatible with existing code (valorProduto)
  imposto: number; // compatible with existing code (valorPis + valorCofins)
  itemCount: number;
  tipo: 'entrada' | 'saida';
  aliquotaPis: number;
  aliquotaCofins: number;
}

/**
 * Parses decimal string with possible thousand separators (like "20.952,00" or "53,99") to number
 */
export function parseBrazilianNumber(val: string): number {
  if (!val) return 0;
  const cleaned = val.trim()
    .replace(/\./g, '') // remove dot thousand separators
    .replace(',', '.'); // replace comma with dot
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizeHeader(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects the column index layout for Entrada rows in a given CSV/TXT report
 */
export function detectEntradaLayout(lines: string[]): {
  bcPis: number;
  aliqPis: number;
  valPis: number;
  bcCofins: number;
  aliqCofins: number;
  valCofins: number;
} {
  // Defaults (9-distance layout)
  const layout = {
    bcPis: 20,
    aliqPis: 21,
    valPis: 23,
    bcCofins: 29,
    aliqCofins: 30,
    valCofins: 32
  };

  const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;

  // 1. Try Strategy 1: Mathematical auto-detection on actual data rows
  // Find a line with valid PIS & COFINS calculations to get exact column indices
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cells = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cells.length < 35) continue;

    // We only care about rows that appear to be items
    // (either cells[0] is empty or numeric, and we have a product indicator or CFOP)
    const hasProductIndicator = cells[7] && /^\d+$/.test(cells[7]) && cells[8] && cells[8].length > 5;
    if (!hasProductIndicator) continue;

    // Collect all indices with valid positive numbers after index 15
    const numIndices: { idx: number; val: number }[] = [];
    for (let idx = 15; idx < cells.length; idx++) {
      const val = parseBrazilianNumber(cells[idx]);
      if (val > 0) {
        numIndices.push({ idx, val });
      }
    }

    // Try finding PIS: i1 (BC), i2 (Aliq), i3 (Valor)
    let foundPis = false;
    let pisLayout = null;
    for (let a = 0; a < numIndices.length; a++) {
      for (let b = a + 1; b < numIndices.length; b++) {
        for (let c = b + 1; c < numIndices.length; c++) {
          const i1 = numIndices[a];
          const i2 = numIndices[b];
          const i3 = numIndices[c];
          
          // Distance constraints to ensure they are close together and represent the PIS columns
          if (i3.idx - i1.idx <= 8 && i2.idx - i1.idx <= 4) {
            // Realistic aliquots for PIS are usually small (0.1% to 15%)
            if (i2.val >= 0.1 && i2.val <= 15) {
              const expectedVal = i1.val * (i2.val / 100);
              if (Math.abs(i3.val - expectedVal) < 0.05) {
                pisLayout = { bcPis: i1.idx, aliqPis: i2.idx, valPis: i3.idx };
                foundPis = true;
                break;
              }
            }
          }
        }
        if (foundPis) break;
      }
      if (foundPis) break;
    }

    if (!foundPis || !pisLayout) continue;

    // Try finding COFINS: i4 (BC), i5 (Aliq), i6 (Valor) after the PIS columns
    let foundCofins = false;
    let cofinsLayout = null;
    const numIndicesCofins = numIndices.filter(item => item.idx > pisLayout.valPis);
    for (let a = 0; a < numIndicesCofins.length; a++) {
      for (let b = a + 1; b < numIndicesCofins.length; b++) {
        for (let c = b + 1; c < numIndicesCofins.length; c++) {
          const i4 = numIndicesCofins[a];
          const i5 = numIndicesCofins[b];
          const i6 = numIndicesCofins[c];
          
          // Distance constraints for COFINS columns
          if (i6.idx - i4.idx <= 8 && i5.idx - i4.idx <= 4) {
            // Realistic aliquots for COFINS are usually 0.1% to 20%
            if (i5.val >= 0.1 && i5.val <= 20) {
              const expectedVal = i4.val * (i5.val / 100);
              if (Math.abs(i6.val - expectedVal) < 0.05) {
                cofinsLayout = { bcCofins: i4.idx, aliqCofins: i5.idx, valCofins: i6.idx };
                foundCofins = true;
                break;
              }
            }
          }
        }
        if (foundCofins) break;
      }
      if (foundCofins) break;
    }

    if (foundPis && foundCofins && pisLayout && cofinsLayout) {
      return {
        bcPis: pisLayout.bcPis,
        aliqPis: pisLayout.aliqPis,
        valPis: pisLayout.valPis,
        bcCofins: cofinsLayout.bcCofins,
        aliqCofins: cofinsLayout.aliqCofins,
        valCofins: cofinsLayout.valCofins
      };
    }
  }

  // 2. Try Strategy 2: Header-based detection with robust text matching and wider range
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const cells = line.split(';').map(c => normalizeHeader(c));
    const hasPisBc = cells.some(c => (c.includes('base') || c.includes('bc') || c.includes('b.c.')) && c.includes('pis'));
    const hasCofinsBc = cells.some(c => (c.includes('base') || c.includes('bc') || c.includes('b.c.')) && c.includes('cofins'));
    
    if (hasPisBc && hasCofinsBc) {
      const idxBcPis = cells.findIndex(c => (c.includes('base') || c.includes('bc') || c.includes('b.c.')) && c.includes('pis') && (c.includes('calculo') || c.includes('calc') || c.includes('bc') || c.includes('b.c.')));
      const idxBcCofins = cells.findIndex(c => (c.includes('base') || c.includes('bc') || c.includes('b.c.')) && c.includes('cofins') && (c.includes('calculo') || c.includes('calc') || c.includes('bc') || c.includes('b.c.')));
      
      if (idxBcPis !== -1) {
        layout.bcPis = idxBcPis;
        layout.aliqPis = idxBcPis + 1;
        layout.valPis = idxBcPis + 2;
        
        // Use wider range (12) to handle empty spacer columns
        const namedAliqPis = cells.findIndex((c, idx) => idx >= idxBcPis && idx < idxBcPis + 12 && (c.includes('aliq') || c.includes('%')) && c.includes('pis'));
        if (namedAliqPis !== -1) layout.aliqPis = namedAliqPis;
        
        const namedValPis = cells.findIndex((c, idx) => idx >= idxBcPis && idx < idxBcPis + 12 && (c.includes('valor') || c.includes('vlr') || c.includes('vlr.') || c.includes('r$')) && c.includes('pis') && !c.includes('base') && !c.includes('bc'));
        if (namedValPis !== -1) layout.valPis = namedValPis;
      }
      
      if (idxBcCofins !== -1) {
        layout.bcCofins = idxBcCofins;
        layout.aliqCofins = idxBcCofins + 1;
        layout.valCofins = idxBcCofins + 2;
        
        // Use wider range (12) to handle empty spacer columns
        const namedAliqCofins = cells.findIndex((c, idx) => idx >= idxBcCofins && idx < idxBcCofins + 12 && (c.includes('aliq') || c.includes('%')) && c.includes('cofins'));
        if (namedAliqCofins !== -1) layout.aliqCofins = namedAliqCofins;
        
        const namedValCofins = cells.findIndex((c, idx) => idx >= idxBcCofins && idx < idxBcCofins + 12 && (c.includes('valor') || c.includes('vlr') || c.includes('vlr.') || c.includes('r$')) && c.includes('cofins') && !c.includes('base') && !c.includes('bc'));
        if (namedValCofins !== -1) layout.valCofins = namedValCofins;
      }

      // If we matched the 31/44 header structure, we map to the exact shifted columns for the items
      if (layout.bcPis === 31) {
        return {
          bcPis: 32,
          aliqPis: 34,
          valPis: 37,
          bcCofins: 45,
          aliqCofins: 48,
          valCofins: 51
        };
      }
      
      return layout;
    }
  }

  // 3. Strategy 3: Standard Fallback based on non-zero columns
  for (const line of lines.slice(0, 100)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cells = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cells.length < 15) continue;
    
    const isEntradaRow = cells[0] && /^\d+$/.test(cells[0]) && datePattern.test(cells[1]);
    if (isEntradaRow) {
      if (cells.length < 29) {
        return {
          bcPis: 20,
          aliqPis: 21,
          valPis: 22,
          bcCofins: 25,
          aliqCofins: 26,
          valCofins: 27
        };
      }
      
      const val25 = cells[25] !== undefined ? parseBrazilianNumber(cells[25]) : 0;
      const val29 = cells[29] !== undefined ? parseBrazilianNumber(cells[29]) : 0;
      
      if (val25 > 0 && val29 === 0) {
        return {
          bcPis: 20,
          aliqPis: 21,
          valPis: 22,
          bcCofins: 25,
          aliqCofins: 26,
          valCofins: 27
        };
      } else if (val29 > 0) {
        return {
          bcPis: 20,
          aliqPis: 21,
          valPis: 23,
          bcCofins: 29,
          aliqCofins: 30,
          valCofins: 32
        };
      }
    }
  }

  return layout;
}

export function extractPisCofinsMetadata(lines: string[]): PisCofinsMetadata {
  const metadata: PisCofinsMetadata = {
    empresa: '',
    cnpj: '',
    periodo: '',
    emissao: ''
  };

  const maxHeaderLines = Math.min(lines.length, 40);
  for (let i = 0; i < maxHeaderLines; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    const parts = trimmed.split(';').map(p => p.trim().replace(/^"|"$/g, ''));

    // 1. Empresa
    if (!metadata.empresa) {
      if (lower.includes('empresa:') || lower.includes('razao social:') || lower.includes('razão social:')) {
        const empIdx = parts.findIndex(p => {
          const l = p.toLowerCase();
          return l.includes('empresa:') || l.includes('razao social:') || l.includes('razão social:');
        });
        if (empIdx !== -1) {
          for (let idx = empIdx + 1; idx < parts.length; idx++) {
            if (parts[idx]) {
              metadata.empresa = parts[idx];
              break;
            }
          }
        }
      } else if (i <= 5) {
        const firstCell = parts[0];
        const firstCellLower = firstCell ? firstCell.toLowerCase() : '';
        if (
          firstCell &&
          firstCell.length >= 3 &&
          !firstCellLower.startsWith('cnpj') &&
          !firstCellLower.startsWith('periodo') &&
          !firstCellLower.startsWith('período') &&
          !firstCellLower.startsWith('data') &&
          !firstCellLower.startsWith('detalhamento') &&
          !firstCellLower.startsWith('relatório') &&
          !firstCellLower.startsWith('relatorio') &&
          !firstCellLower.startsWith('demonstração') &&
          !firstCellLower.startsWith('demonstracao') &&
          !firstCellLower.startsWith('código') &&
          !firstCellLower.startsWith('codigo') &&
          !firstCellLower.startsWith('página') &&
          !firstCellLower.startsWith('pagina') &&
          !firstCellLower.startsWith('produto') &&
          !firstCellLower.startsWith('movimento') &&
          !firstCellLower.startsWith('notas') &&
          !firstCellLower.startsWith('entradas') &&
          !firstCellLower.startsWith('saídas') &&
          !firstCellLower.startsWith('saidas')
        ) {
          metadata.empresa = firstCell;
        }
      }
    }

    // 2. CNPJ
    if (!metadata.cnpj && lower.includes('cnpj:')) {
      const cnpjIdx = parts.findIndex(p => p.toLowerCase().includes('cnpj:'));
      if (cnpjIdx !== -1) {
        for (let idx = cnpjIdx + 1; idx < parts.length; idx++) {
          if (parts[idx]) {
            const rawCnpj = parts[idx];
            const digits = rawCnpj.replace(/\D/g, '');
            if (digits.length === 14) {
              metadata.cnpj = `${digits.substring(0, 2)}.${digits.substring(2, 5)}.${digits.substring(5, 8)}/${digits.substring(8, 12)}-${digits.substring(12, 14)}`;
            } else if (rawCnpj) {
              metadata.cnpj = rawCnpj;
            }
            break;
          }
        }
      }
    }

    // 3. Período
    if (!metadata.periodo && (lower.includes('periodo') || lower.includes('período'))) {
      const pIdx = parts.findIndex(p => {
        const l = p.toLowerCase();
        return l.includes('periodo') || l.includes('período');
      });
      if (pIdx !== -1) {
        const nonValParts: string[] = [];
        for (let idx = pIdx + 1; idx < parts.length; idx++) {
          const item = parts[idx];
          if (item && !item.toLowerCase().includes('hora:')) {
            nonValParts.push(item);
          } else if (item && item.toLowerCase().includes('hora:')) {
            break;
          }
        }
        const fullStr = nonValParts.join(' ').trim();
        const dates = fullStr.match(/\d{2}\/\d{2}\/\d{4}/g);
        if (dates && dates.length >= 2) {
          if (dates[0] === dates[1]) {
            const partsD = dates[0].split('/');
            metadata.periodo = `${partsD[1]}/${partsD[2]}`;
          } else {
            metadata.periodo = `${dates[0]} até ${dates[1]}`;
          }
        } else if (dates && dates.length === 1) {
          metadata.periodo = dates[0];
        } else if (fullStr) {
          metadata.periodo = fullStr.replace(/^de:?\s*/i, '').replace(/^por:?\s*/i, '');
        }
      }
    }

    // 4. Emissão
    if (!metadata.emissao && (lower.includes('emissao:') || lower.includes('emissão:') || lower.includes('data:'))) {
      const eIdx = parts.findIndex(p => {
        const l = p.toLowerCase();
        return l.includes('emissao:') || l.includes('emissão:') || l.includes('data:');
      });
      if (eIdx !== -1) {
        for (let idx = eIdx + 1; idx < parts.length; idx++) {
          if (parts[idx]) {
            metadata.emissao = parts[idx];
            break;
          }
        }
      }
    }
  }

  if (!metadata.empresa) metadata.empresa = 'EMPRESA IDENTIFICADA NO DEMONSTRATIVO';
  if (!metadata.periodo) metadata.periodo = 'PERÍODO AUDITADO';
  if (!metadata.emissao) metadata.emissao = new Date().toLocaleDateString('pt-BR');

  return metadata;
}

/**
 * Main parser for PIS/COFINS csv/txt report
 */
export function parsePisCofinsReport(text: string): { items: PisCofinsItem[]; metadata: PisCofinsMetadata } {
  const items: PisCofinsItem[] = [];
  if (!text) return { items, metadata: { empresa: '', cnpj: '', periodo: '', emissao: '' } };

  const lines = text.split(/\r?\n/);
  const metadata = extractPisCofinsMetadata(lines);

  const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;

  // Check if file is of the 'Por Produtos' layout
  const isPorProdutosLayout = lines.some(line => 
    line.toLowerCase().includes('detalhamento de movimento') ||
    line.toLowerCase().includes('por produtos') ||
    line.toLowerCase().startsWith('produto:')
  );

  if (isPorProdutosLayout) {
    let currentProductCode = '';
    let currentProductName = '';
    const isSaida = lines.some(line => line.toLowerCase().includes('movimento de saídas') || line.toLowerCase().includes('movimento de saidas'));

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.toLowerCase().startsWith('produto:')) {
        const rawProd = trimmed.replace(/^produto:\s*/i, '');
        const cleanProd = rawProd.split(';')[0].trim();
        const parts = cleanProd.split('-').map(s => s.trim());
        if (parts.length >= 2) {
          currentProductCode = parts[0];
          currentProductName = parts.slice(1).join(' - ');
        } else {
          currentProductCode = cleanProd;
          currentProductName = cleanProd;
        }
        return;
      }

      const cells = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cells.length < 25) return;

      if (cells[0].toLowerCase().includes('total:') || cells[1].toLowerCase().includes('total:') || cells[2].toLowerCase().includes('total:')) {
        return;
      }

      const dateIdx = datePattern.test(cells[2]) ? 2 : datePattern.test(cells[1]) ? 1 : datePattern.test(cells[0]) ? 0 : -1;
      if (dateIdx !== -1) {
        const data = cells[dateIdx];
        const codSeqNf = cells[0] || '';
        const fornec = dateIdx === 2 ? cells[5] || '' : cells[3] || '';
        const numeroNota = dateIdx === 2 ? cells[12] || '' : cells[4] || '';
        const acum = dateIdx === 2 ? cells[15] || '' : cells[6] || '';
        const codigoProduto = (dateIdx === 2 ? cells[18] : cells[7]) || currentProductCode;
        const nomeProduto = currentProductName || `PRODUTO ${codigoProduto}`;
        const ncm = (dateIdx === 2 ? cells[20] : cells[9]) || '';
        const valorProduto = parseBrazilianNumber(dateIdx === 2 ? cells[22] : cells[11]);
        const valorContabil = parseBrazilianNumber(dateIdx === 2 ? cells[24] : cells[13]);
        const cfop = (dateIdx === 2 ? cells[26] : cells[15]) || '';
        
        let baseCred = '';
        let cstPis = '';
        let vincCredPis = '';
        let baseCalculoPis = 0;
        let aliquotaPis = 0;
        let valorPis = 0;

        let cstCofins = '';
        let vincCredCofins = '';
        let baseCalculoCofins = 0;
        let aliquotaCofins = 0;
        let valorCofins = 0;

        if (isSaida) {
          cstPis = (dateIdx === 2 ? cells[28] : cells[17]) || '';
          vincCredPis = (dateIdx === 2 ? cells[30] : cells[19]) || '';
          baseCalculoPis = parseBrazilianNumber(dateIdx === 2 ? cells[32] : cells[21]);
          aliquotaPis = parseBrazilianNumber(dateIdx === 2 ? cells[34] : cells[23]);
          valorPis = parseBrazilianNumber(dateIdx === 2 ? cells[36] : cells[25]);

          cstCofins = (dateIdx === 2 ? cells[39] : cells[28]) || '';
          vincCredCofins = (dateIdx === 2 ? cells[41] : cells[30]) || '';
          baseCalculoCofins = parseBrazilianNumber(dateIdx === 2 ? cells[43] : cells[32]);
          aliquotaCofins = parseBrazilianNumber(dateIdx === 2 ? cells[45] : cells[34]);

          let rawValCofins = dateIdx === 2 ? cells[48] : cells[37];
          if ((!rawValCofins || rawValCofins === '') && dateIdx === 2) {
            rawValCofins = cells[49] || cells[50] || '0';
          }
          valorCofins = parseBrazilianNumber(rawValCofins);
        } else {
          baseCred = (dateIdx === 2 ? cells[28] : cells[17]) || '';
          cstPis = (dateIdx === 2 ? cells[30] : cells[19]) || '';
          vincCredPis = (dateIdx === 2 ? cells[32] : cells[21]) || '01';
          baseCalculoPis = parseBrazilianNumber(dateIdx === 2 ? cells[34] : cells[23]);
          aliquotaPis = parseBrazilianNumber(dateIdx === 2 ? cells[36] : cells[25]);
          valorPis = parseBrazilianNumber(dateIdx === 2 ? cells[38] : cells[27]);

          cstCofins = (dateIdx === 2 ? cells[41] : cells[30]) || '';
          vincCredCofins = (dateIdx === 2 ? cells[43] : cells[32]) || '01';
          baseCalculoCofins = parseBrazilianNumber(dateIdx === 2 ? cells[45] : cells[34]);
          aliquotaCofins = parseBrazilianNumber(dateIdx === 2 ? cells[47] : cells[36]);
          valorCofins = parseBrazilianNumber(dateIdx === 2 ? cells[50] : cells[39]);
        }

        let cst = cstPis || cstCofins || (isSaida ? '01' : '50');
        if (cst.length === 1) cst = cst.padStart(2, '0');

        items.push({
          id: `pis-por-produto-${index}-${Math.random().toString(36).substring(2, 7)}`,
          empresaId: '7',
          data,
          modelo: 'NF-e',
          numeroNota,
          cfop,
          codigoProduto,
          nomeProduto,
          ncm,
          cst,
          cstPis,
          cstCofins,
          valorProduto,
          valorContabil,
          baseCalculo: baseCalculoPis || baseCalculoCofins || valorProduto,
          baseCalculoPis,
          baseCalculoCofins,
          aliquotaPis,
          aliquotaCofins,
          valorPis,
          valorCofins,
          valor: valorProduto,
          aliquota: aliquotaPis + aliquotaCofins,
          imposto: valorPis + valorCofins,
          tipo: isSaida ? 'saida' : 'entrada',
          
          codSeqNf,
          fornec,
          acum,
          baseCred,
          vincCredPis,
          vincCredCofins,
          vincCredProd: vincCredPis || vincCredCofins
        });
      }
    });

    if (items.length > 0) {
      const firstDate = items[0].data;
      const parts = firstDate.split('/');
      if (parts.length === 3) {
        metadata.periodo = `${parts[1]}/${parts[2]}`;
      }
    }

    return { items, metadata };
  }

  // Check if file is of the new, more robust layout
  const isNewLayout = lines.some(line => 
    line.toLowerCase().includes('notas fiscais de entradas - sped pis/cofins') ||
    line.toLowerCase().includes('dados guia estoque notas de entrada') ||
    line.toLowerCase().includes('notas fiscais de saídas - sped pis/cofins') ||
    line.toLowerCase().includes('notas fiscais de saidas - sped pis/cofins') ||
    line.toLowerCase().includes('dados guia estoque notas de saída') ||
    line.toLowerCase().includes('dados guia estoque notas de saida')
  );

  if (isNewLayout) {
    const isSaida = lines.some(line => 
      line.toLowerCase().includes('notas fiscais de saídas') ||
      line.toLowerCase().includes('notas fiscais de saidas') ||
      line.toLowerCase().includes('dados guia estoque notas de saída') ||
      line.toLowerCase().includes('dados guia estoque notas de saida')
    );

    if (isSaida) {
      let currentDataSaida = '';
      let currentCodSeqNf = '';
      let currentCliente = '';
      let currentNumeroNota = '';
      let currentAcum = '';

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const cells = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cells.length < 15) return;

        const isDate = datePattern.test(cells[0]);
        if (isDate) {
          currentDataSaida = cells[0];
          currentCodSeqNf = cells[4] || '';
          currentCliente = cells[6] || '';
          currentNumeroNota = cells[8] || '';
          currentAcum = cells[9] || '';
          return;
        }

        const isChildRow = !cells[0] && cells[10] && cells[10].trim() && cells[16] && cells[16].trim();
        if (isChildRow && currentNumeroNota) {
          const codigoProduto = cells[10].trim();
          const nomeProduto = cells[16].trim();
          const cfop = cells[18].trim();
          const cstPis = cells[21].trim();
          const bcPis = parseBrazilianNumber(cells[29]);
          const aliquotaPis = parseBrazilianNumber(cells[33]);
          const valorPis = parseBrazilianNumber(cells[34]);
          const cstCofins = cells[41].trim();
          const bcCofins = parseBrazilianNumber(cells[46]);
          const aliquotaCofins = parseBrazilianNumber(cells[50]);
          const valorCofins = parseBrazilianNumber(cells[52]);
          const tipoContrib = cells[63] ? cells[63].trim() : '';

          let cst = cstPis || cstCofins || '01';
          if (cst.length === 1) cst = cst.padStart(2, '0');
          
          const valorProduto = bcPis || bcCofins || 0;

          items.push({
            id: `pis-saida-new-${index}-${Math.random().toString(36).substring(2, 7)}`,
            empresaId: '7',
            data: currentDataSaida,
            modelo: 'NF-e',
            numeroNota: currentNumeroNota,
            cfop,
            codigoProduto,
            nomeProduto,
            cst,
            cstPis,
            cstCofins,
            valorProduto,
            baseCalculo: bcPis,
            baseCalculoPis: bcPis,
            baseCalculoCofins: bcCofins,
            aliquotaPis,
            aliquotaCofins,
            valorPis,
            valorCofins,
            valor: valorProduto,
            aliquota: aliquotaPis + aliquotaCofins,
            imposto: valorPis + valorCofins,
            tipo: 'saida',
            
            // New fields
            codSeqNf: currentCodSeqNf,
            fornec: currentCliente,
            acum: currentAcum,
            tipoContrib
          });
        }
      });

      // Extract dynamic period
      if (items.length > 0) {
        const firstDate = items[0].data;
        const parts = firstDate.split('/');
        if (parts.length === 3) {
          metadata.periodo = `${parts[1]}/${parts[2]}`;
        }
      }

      return { items, metadata };
    } else {
      let currentDataEntrada = '';
      let currentCodSeqNf = '';
      let currentFornec = '';
      let currentNumeroNota = '';
      let currentAcum = '';

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const cells = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cells.length < 15) return;

        const isDate = datePattern.test(cells[0]);
        if (isDate) {
          currentDataEntrada = cells[0];
          currentCodSeqNf = cells[3] || '';
          currentFornec = cells[6] || '';
          currentNumeroNota = cells[8] || '';
          currentAcum = cells[13] || '';
          return;
        }

        const isChildRow = !cells[0] && cells[11] && cells[11].trim() && cells[17] && cells[17].trim();
        if (isChildRow && currentNumeroNota) {
          const codigoProduto = cells[11].trim();
          const nomeProduto = cells[17].trim();
          const cfop = cells[23].trim();
          const cstPis = cells[28].trim();
          const bcPis = parseBrazilianNumber(cells[32]);
          const aliquotaPis = parseBrazilianNumber(cells[34]);
          const valorPis = parseBrazilianNumber(cells[37]);
          const cstCofins = cells[40].trim();
          const bcCofins = parseBrazilianNumber(cells[45]);
          const aliquotaCofins = parseBrazilianNumber(cells[48]);
          const valorCofins = parseBrazilianNumber(cells[51]);
          const baseCred = cells[55] ? cells[55].trim() : '';
          const vincCredProd = cells[66] ? cells[66].trim() : '';
          const baseCredProd = cells[70] ? cells[70].trim() : '';
          const tipoContrib = cells[72] ? cells[72].trim() : '';

          const cst = cstPis || cstCofins || '50';
          const valorProduto = bcPis || bcCofins || 0;

          items.push({
            id: `pis-entrada-new-${index}-${Math.random().toString(36).substring(2, 7)}`,
            empresaId: '7',
            data: currentDataEntrada,
            modelo: 'NF-e',
            numeroNota: currentNumeroNota,
            cfop,
            codigoProduto,
            nomeProduto,
            cst,
            cstPis,
            cstCofins,
            valorProduto,
            baseCalculo: bcPis,
            baseCalculoPis: bcPis,
            baseCalculoCofins: bcCofins,
            aliquotaPis,
            aliquotaCofins,
            valorPis,
            valorCofins,
            valor: valorProduto,
            aliquota: aliquotaPis + aliquotaCofins,
            imposto: valorPis + valorCofins,
            tipo: 'entrada',
            
            // New fields
            codSeqNf: currentCodSeqNf,
            fornec: currentFornec,
            acum: currentAcum,
            baseCred,
            vincCredProd,
            baseCredProd,
            tipoContrib
          });
        }
      });

      // Extract dynamic period
      if (items.length > 0) {
        const firstDate = items[0].data;
        const parts = firstDate.split('/');
        if (parts.length === 3) {
          metadata.periodo = `${parts[1]}/${parts[2]}`;
        }
      }

      return { items, metadata };
    }
  }

  const layout = detectEntradaLayout(lines);

  // Parse items (legacy format)
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Ignore headers, totals, and lines without enough cells
    if (
      trimmed.includes('AVALIAR DESTAQUES') ||
      trimmed.includes('Informações dos produtos') ||
      trimmed.includes('Informacoes dos produtos') ||
      trimmed.includes('Nota fiscal de') ||
      trimmed.includes('Total de Notas') ||
      trimmed.includes('Página:') ||
      trimmed.includes('Pagina:')
    ) {
      return;
    }

    const cells = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cells.length < 15) return;

    // Detect row types (Entrada or Saida)
    const isEntradaRow = cells[0] && /^\d+$/.test(cells[0]) && datePattern.test(cells[1]);
    const isSaidaRow = !cells[0] && cells[1] && /^\d+$/.test(cells[1]) && datePattern.test(cells[2]);

    if (isEntradaRow) {
      const data = cells[1];
      const documento = cells[3] || '';
      const codigoProduto = cells[7] || '';
      const nomeProduto = cells[8] || '';
      const rawCfop = cells[17] || '';
      let cfop = rawCfop;
      if (cfop.length === 4 && !cfop.includes('.')) {
        cfop = `${cfop.charAt(0)}.${cfop.substring(1)}`;
      }
      
      let cst = cells[18] || '50';
      if (cst.length === 1) cst = cst.padStart(2, '0');

      let valorProduto = parseBrazilianNumber(cells[15]);
      let baseCalculo = parseBrazilianNumber(cells[layout.bcPis]);
      let baseCalculoPis = baseCalculo;
      let baseCalculoCofins = cells[layout.bcCofins] !== undefined ? parseBrazilianNumber(cells[layout.bcCofins]) : baseCalculo;
      let aliquotaPis = parseBrazilianNumber(cells[layout.aliqPis]);
      let aliquotaCofins = parseBrazilianNumber(cells[layout.aliqCofins]);
      let valorPis = parseBrazilianNumber(cells[layout.valPis]);
      let valorCofins = parseBrazilianNumber(cells[layout.valCofins]);

      const isCreditReduction = ['5.411', '5411', '5.202', '5202', '6.411', '6411', '6.202', '6202'].includes(cfop.trim().replace('-', '.'));

      if (isCreditReduction) {
        valorProduto = -Math.abs(valorProduto);
        baseCalculo = -Math.abs(baseCalculo);
        baseCalculoPis = -Math.abs(baseCalculoPis);
        baseCalculoCofins = -Math.abs(baseCalculoCofins);
        valorPis = -Math.abs(valorPis);
        valorCofins = -Math.abs(valorCofins);
      }

      items.push({
        id: `pis-entrada-${index}-${Math.random().toString(36).substring(2, 7)}`,
        empresaId: '7',
        data,
        modelo: 'NF-e',
        numeroNota: documento,
        cfop,
        codigoProduto,
        nomeProduto,
        cst,
        cstPis: cst,
        cstCofins: cst,
        valorProduto,
        baseCalculo,
        baseCalculoPis,
        baseCalculoCofins,
        aliquotaPis,
        aliquotaCofins,
        valorPis,
        valorCofins,
        valor: valorProduto,
        aliquota: aliquotaPis + aliquotaCofins,
        imposto: valorPis + valorCofins,
        tipo: 'entrada',
        isCreditReduction
      });
    } else if (isSaidaRow) {
      const data = cells[2];
      const documento = cells[4] || '';
      const codigoProduto = cells[8] || '';
      const nomeProduto = cells[10] || '';
      const rawCfop = cells[16] || '';
      let cfop = rawCfop;
      if (cfop.length === 4 && !cfop.includes('.')) {
        cfop = `${cfop.charAt(0)}.${cfop.substring(1)}`;
      }

      let cst = cells[17] || '01';
      if (cst.length === 1) cst = cst.padStart(2, '0');

      let valorProduto = parseBrazilianNumber(cells[15]);
      let baseCalculo = parseBrazilianNumber(cells[19]);
      let baseCalculoPis = baseCalculo;
      let baseCalculoCofins = cells[25] !== undefined ? parseBrazilianNumber(cells[25]) : baseCalculo;
      let aliquotaPis = parseBrazilianNumber(cells[21]);
      let aliquotaCofins = parseBrazilianNumber(cells[26]);
      let valorPis = parseBrazilianNumber(cells[22]);
      let valorCofins = parseBrazilianNumber(cells[27]);

      items.push({
        id: `pis-saida-${index}-${Math.random().toString(36).substring(2, 7)}`,
        empresaId: '7',
        data,
        modelo: 'NF-e',
        numeroNota: documento,
        cfop,
        codigoProduto,
        nomeProduto,
        cst,
        cstPis: cst,
        cstCofins: cst,
        valorProduto,
        baseCalculo,
        baseCalculoPis,
        baseCalculoCofins,
        aliquotaPis,
        aliquotaCofins,
        valorPis,
        valorCofins,
        valor: valorProduto,
        aliquota: aliquotaPis + aliquotaCofins,
        imposto: valorPis + valorCofins,
        tipo: 'saida'
      });
    }
  });

  // Extract period dynamically from dates if period was empty or fallback
  if (items.length > 0) {
    const firstDate = items[0].data;
    const parts = firstDate.split('/');
    if (parts.length === 3) {
      metadata.periodo = `${parts[1]}/${parts[2]}`;
    }
  }

  return { items, metadata };
}

/**
 * Parses PIS/COFINS csv/txt report asynchronously to avoid freezing the browser.
 */
export async function parsePisCofinsReportAsync(
  text: string,
  onProgress: (pct: number) => void
): Promise<{ items: PisCofinsItem[]; metadata: PisCofinsMetadata }> {
  const items: PisCofinsItem[] = [];
  if (!text) return { items, metadata: { empresa: '', cnpj: '', periodo: '', emissao: '' } };

  const lines = text.split(/\r?\n/);
  const totalLines = lines.length;

  const metadata = extractPisCofinsMetadata(lines);

  const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;

  // Check if file is of the 'Por Produtos' layout
  const isPorProdutosLayout = lines.some(line => 
    line.toLowerCase().includes('detalhamento de movimento') ||
    line.toLowerCase().includes('por produtos') ||
    line.toLowerCase().startsWith('produto:')
  );

  if (isPorProdutosLayout) {
    let currentProductCode = '';
    let currentProductName = '';
    const isSaida = lines.some(line => line.toLowerCase().includes('movimento de saídas') || line.toLowerCase().includes('movimento de saidas'));

    const chunkSize = 1500;
    for (let i = 0; i < totalLines; i += chunkSize) {
      const end = Math.min(i + chunkSize, totalLines);
      for (let j = i; j < end; j++) {
        const line = lines[j];
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.toLowerCase().startsWith('produto:')) {
          const rawProd = trimmed.replace(/^produto:\s*/i, '');
          const cleanProd = rawProd.split(';')[0].trim();
          const parts = cleanProd.split('-').map(s => s.trim());
          if (parts.length >= 2) {
            currentProductCode = parts[0];
            currentProductName = parts.slice(1).join(' - ');
          } else {
            currentProductCode = cleanProd;
            currentProductName = cleanProd;
          }
          continue;
        }

        const cells = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cells.length < 25) continue;

        if (cells[0].toLowerCase().includes('total:') || cells[1].toLowerCase().includes('total:') || cells[2].toLowerCase().includes('total:')) {
          continue;
        }

        const dateIdx = datePattern.test(cells[2]) ? 2 : datePattern.test(cells[1]) ? 1 : datePattern.test(cells[0]) ? 0 : -1;
        if (dateIdx !== -1) {
          const data = cells[dateIdx];
          const codSeqNf = cells[0] || '';
          const fornec = dateIdx === 2 ? cells[5] || '' : cells[3] || '';
          const numeroNota = dateIdx === 2 ? cells[12] || '' : cells[4] || '';
          const acum = dateIdx === 2 ? cells[15] || '' : cells[6] || '';
          const codigoProduto = (dateIdx === 2 ? cells[18] : cells[7]) || currentProductCode;
          const nomeProduto = currentProductName || `PRODUTO ${codigoProduto}`;
          const ncm = (dateIdx === 2 ? cells[20] : cells[9]) || '';
          const valorProduto = parseBrazilianNumber(dateIdx === 2 ? cells[22] : cells[11]);
          const valorContabil = parseBrazilianNumber(dateIdx === 2 ? cells[24] : cells[13]);
          const cfop = (dateIdx === 2 ? cells[26] : cells[15]) || '';
          
          let baseCred = '';
          let cstPis = '';
          let vincCredPis = '';
          let baseCalculoPis = 0;
          let aliquotaPis = 0;
          let valorPis = 0;

          let cstCofins = '';
          let vincCredCofins = '';
          let baseCalculoCofins = 0;
          let aliquotaCofins = 0;
          let valorCofins = 0;

          if (isSaida) {
            cstPis = (dateIdx === 2 ? cells[28] : cells[17]) || '';
            vincCredPis = (dateIdx === 2 ? cells[30] : cells[19]) || '';
            baseCalculoPis = parseBrazilianNumber(dateIdx === 2 ? cells[32] : cells[21]);
            aliquotaPis = parseBrazilianNumber(dateIdx === 2 ? cells[34] : cells[23]);
            valorPis = parseBrazilianNumber(dateIdx === 2 ? cells[36] : cells[25]);

            cstCofins = (dateIdx === 2 ? cells[39] : cells[28]) || '';
            vincCredCofins = (dateIdx === 2 ? cells[41] : cells[30]) || '';
            baseCalculoCofins = parseBrazilianNumber(dateIdx === 2 ? cells[43] : cells[32]);
            aliquotaCofins = parseBrazilianNumber(dateIdx === 2 ? cells[45] : cells[34]);

            let rawValCofins = dateIdx === 2 ? cells[48] : cells[37];
            if ((!rawValCofins || rawValCofins === '') && dateIdx === 2) {
              rawValCofins = cells[49] || cells[50] || '0';
            }
            valorCofins = parseBrazilianNumber(rawValCofins);
          } else {
            baseCred = (dateIdx === 2 ? cells[28] : cells[17]) || '';
            cstPis = (dateIdx === 2 ? cells[30] : cells[19]) || '';
            vincCredPis = (dateIdx === 2 ? cells[32] : cells[21]) || '01';
            baseCalculoPis = parseBrazilianNumber(dateIdx === 2 ? cells[34] : cells[23]);
            aliquotaPis = parseBrazilianNumber(dateIdx === 2 ? cells[36] : cells[25]);
            valorPis = parseBrazilianNumber(dateIdx === 2 ? cells[38] : cells[27]);

            cstCofins = (dateIdx === 2 ? cells[41] : cells[30]) || '';
            vincCredCofins = (dateIdx === 2 ? cells[43] : cells[32]) || '01';
            baseCalculoCofins = parseBrazilianNumber(dateIdx === 2 ? cells[45] : cells[34]);
            aliquotaCofins = parseBrazilianNumber(dateIdx === 2 ? cells[47] : cells[36]);
            valorCofins = parseBrazilianNumber(dateIdx === 2 ? cells[50] : cells[39]);
          }

          let cst = cstPis || cstCofins || (isSaida ? '01' : '50');
          if (cst.length === 1) cst = cst.padStart(2, '0');

          items.push({
            id: `pis-por-produto-${j}-${Math.random().toString(36).substring(2, 7)}`,
            empresaId: '7',
            data,
            modelo: 'NF-e',
            numeroNota,
            cfop,
            codigoProduto,
            nomeProduto,
            ncm,
            cst,
            cstPis,
            cstCofins,
            valorProduto,
            valorContabil,
            baseCalculo: baseCalculoPis || baseCalculoCofins || valorProduto,
            baseCalculoPis,
            baseCalculoCofins,
            aliquotaPis,
            aliquotaCofins,
            valorPis,
            valorCofins,
            valor: valorProduto,
            aliquota: aliquotaPis + aliquotaCofins,
            imposto: valorPis + valorCofins,
            tipo: isSaida ? 'saida' : 'entrada',
            
            codSeqNf,
            fornec,
            acum,
            baseCred,
            vincCredPis,
            vincCredCofins,
            vincCredProd: vincCredPis || vincCredCofins
          });
        }
      }
      onProgress(Math.round((end / totalLines) * 100));
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (items.length > 0) {
      const firstDate = items[0].data;
      const parts = firstDate.split('/');
      if (parts.length === 3) {
        metadata.periodo = `${parts[1]}/${parts[2]}`;
      }
    }

    onProgress(100);
    return { items, metadata };
  }

  // Check if file is of the new layout
  const isNewLayout = lines.some(line => 
    line.toLowerCase().includes('notas fiscais de entradas - sped pis/cofins') ||
    line.toLowerCase().includes('dados guia estoque notas de entrada') ||
    line.toLowerCase().includes('notas fiscais de saídas - sped pis/cofins') ||
    line.toLowerCase().includes('notas fiscais de saidas - sped pis/cofins') ||
    line.toLowerCase().includes('dados guia estoque notas de saída') ||
    line.toLowerCase().includes('dados guia estoque notas de saida')
  );

  if (isNewLayout) {
    const isSaida = lines.some(line => 
      line.toLowerCase().includes('notas fiscais de saídas') ||
      line.toLowerCase().includes('notas fiscais de saidas') ||
      line.toLowerCase().includes('dados guia estoque notas de saída') ||
      line.toLowerCase().includes('dados guia estoque notas de saida')
    );

    if (isSaida) {
      let currentDataSaida = '';
      let currentCodSeqNf = '';
      let currentCliente = '';
      let currentNumeroNota = '';
      let currentAcum = '';

      const chunkSize = 1500;
      for (let i = 0; i < totalLines; i += chunkSize) {
        const end = Math.min(i + chunkSize, totalLines);
        for (let j = i; j < end; j++) {
          const line = lines[j];
          const trimmed = line.trim();
          if (!trimmed) continue;

          const cells = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
          if (cells.length < 15) continue;

          const isDate = datePattern.test(cells[0]);
          if (isDate) {
            currentDataSaida = cells[0];
            currentCodSeqNf = cells[4] || '';
            currentCliente = cells[6] || '';
            currentNumeroNota = cells[8] || '';
            currentAcum = cells[9] || '';
            continue;
          }

          const isChildRow = !cells[0] && cells[10] && cells[10].trim() && cells[16] && cells[16].trim();
          if (isChildRow && currentNumeroNota) {
            const codigoProduto = cells[10].trim();
            const nomeProduto = cells[16].trim();
            const cfop = cells[18].trim();
            const cstPis = cells[21].trim();
            const bcPis = parseBrazilianNumber(cells[29]);
            const aliquotaPis = parseBrazilianNumber(cells[33]);
            const valorPis = parseBrazilianNumber(cells[34]);
            const cstCofins = cells[41].trim();
            const bcCofins = parseBrazilianNumber(cells[46]);
            const aliquotaCofins = parseBrazilianNumber(cells[50]);
            const valorCofins = parseBrazilianNumber(cells[52]);
            const tipoContrib = cells[63] ? cells[63].trim() : '';

            let cst = cstPis || cstCofins || '01';
            if (cst.length === 1) cst = cst.padStart(2, '0');
            
            const valorProduto = bcPis || bcCofins || 0;

            items.push({
              id: `pis-saida-new-${j}-${Math.random().toString(36).substring(2, 7)}`,
              empresaId: '7',
              data: currentDataSaida,
              modelo: 'NF-e',
              numeroNota: currentNumeroNota,
              cfop,
              codigoProduto,
              nomeProduto,
              cst,
              cstPis,
              cstCofins,
              valorProduto,
              baseCalculo: bcPis,
              baseCalculoPis: bcPis,
              baseCalculoCofins: bcCofins,
              aliquotaPis,
              aliquotaCofins,
              valorPis,
              valorCofins,
              valor: valorProduto,
              aliquota: aliquotaPis + aliquotaCofins,
              imposto: valorPis + valorCofins,
              tipo: 'saida',
              
              // New fields
              codSeqNf: currentCodSeqNf,
              fornec: currentCliente,
              acum: currentAcum,
              tipoContrib
            });
          }
        }
        onProgress(Math.round((end / totalLines) * 100));
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Extract dynamic period
      if (items.length > 0) {
        const firstDate = items[0].data;
        const parts = firstDate.split('/');
        if (parts.length === 3) {
          metadata.periodo = `${parts[1]}/${parts[2]}`;
        }
      }

      return { items, metadata };
    } else {
      let currentDataEntrada = '';
      let currentCodSeqNf = '';
      let currentFornec = '';
      let currentNumeroNota = '';
      let currentAcum = '';

      const chunkSize = 1500;
      for (let i = 0; i < totalLines; i += chunkSize) {
        const end = Math.min(i + chunkSize, totalLines);
        for (let j = i; j < end; j++) {
          const line = lines[j];
          const trimmed = line.trim();
          if (!trimmed) continue;

          const cells = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
          if (cells.length < 15) continue;

          const isDate = datePattern.test(cells[0]);
          if (isDate) {
            currentDataEntrada = cells[0];
            currentCodSeqNf = cells[3] || '';
            currentFornec = cells[6] || '';
            currentNumeroNota = cells[8] || '';
            currentAcum = cells[13] || '';
            continue;
          }

          const isChildRow = !cells[0] && cells[11] && cells[11].trim() && cells[17] && cells[17].trim();
          if (isChildRow && currentNumeroNota) {
            const codigoProduto = cells[11].trim();
            const nomeProduto = cells[17].trim();
            const cfop = cells[23].trim();
            const cstPis = cells[28].trim();
            const bcPis = parseBrazilianNumber(cells[32]);
            const aliquotaPis = parseBrazilianNumber(cells[34]);
            const valorPis = parseBrazilianNumber(cells[37]);
            const cstCofins = cells[40].trim();
            const bcCofins = parseBrazilianNumber(cells[45]);
            const aliquotaCofins = parseBrazilianNumber(cells[48]);
            const valorCofins = parseBrazilianNumber(cells[51]);
            const baseCred = cells[55] ? cells[55].trim() : '';
            const vincCredProd = cells[66] ? cells[66].trim() : '';
            const baseCredProd = cells[70] ? cells[70].trim() : '';
            const tipoContrib = cells[72] ? cells[72].trim() : '';

            const cst = cstPis || cstCofins || '50';
            const valorProduto = bcPis || bcCofins || 0;

            items.push({
              id: `pis-entrada-new-${j}-${Math.random().toString(36).substring(2, 7)}`,
              empresaId: '7',
              data: currentDataEntrada,
              modelo: 'NF-e',
              numeroNota: currentNumeroNota,
              cfop,
              codigoProduto,
              nomeProduto,
              cst,
              cstPis,
              cstCofins,
              valorProduto,
              baseCalculo: bcPis,
              baseCalculoPis: bcPis,
              baseCalculoCofins: bcCofins,
              aliquotaPis,
              aliquotaCofins,
              valorPis,
              valorCofins,
              valor: valorProduto,
              aliquota: aliquotaPis + aliquotaCofins,
              imposto: valorPis + valorCofins,
              tipo: 'entrada',
              
              // New fields
              codSeqNf: currentCodSeqNf,
              fornec: currentFornec,
              acum: currentAcum,
              baseCred,
              vincCredProd,
              baseCredProd,
              tipoContrib
            });
          }
        }
        onProgress(Math.round((end / totalLines) * 100));
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Extract dynamic period
      if (items.length > 0) {
        const firstDate = items[0].data;
        const parts = firstDate.split('/');
        if (parts.length === 3) {
          metadata.periodo = `${parts[1]}/${parts[2]}`;
        }
      }

      return { items, metadata };
    }
  }

  const layout = detectEntradaLayout(lines);
  const chunkSize = 2000;

  for (let i = 0; i < totalLines; i += chunkSize) {
    const end = Math.min(i + chunkSize, totalLines);
    for (let j = i; j < end; j++) {
      const line = lines[j];
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Ignore headers, totals, and lines without enough cells
      if (
        trimmed.includes('AVALIAR DESTAQUES') ||
        trimmed.includes('Informações dos produtos') ||
        trimmed.includes('Informacoes dos produtos') ||
        trimmed.includes('Nota fiscal de') ||
        trimmed.includes('Total de Notas') ||
        trimmed.includes('Página:') ||
        trimmed.includes('Pagina:')
      ) {
        continue;
      }

      const cells = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cells.length < 15) continue;

      // Detect row types (Entrada or Saida)
      const isEntradaRow = cells[0] && /^\d+$/.test(cells[0]) && datePattern.test(cells[1]);
      const isSaidaRow = !cells[0] && cells[1] && /^\d+$/.test(cells[1]) && datePattern.test(cells[2]);

      if (isEntradaRow) {
        const data = cells[1];
        const documento = cells[3] || '';
        const codigoProduto = cells[7] || '';
        const nomeProduto = cells[8] || '';
        const rawCfop = cells[17] || '';
        let cfop = rawCfop;
        if (cfop.length === 4 && !cfop.includes('.')) {
          cfop = `${cfop.charAt(0)}.${cfop.substring(1)}`;
        }
        
        let cst = cells[18] || '50';
        if (cst.length === 1) cst = cst.padStart(2, '0');

        let valorProduto = parseBrazilianNumber(cells[15]);
        let baseCalculo = parseBrazilianNumber(cells[layout.bcPis]);
        let baseCalculoPis = baseCalculo;
        let baseCalculoCofins = cells[layout.bcCofins] !== undefined ? parseBrazilianNumber(cells[layout.bcCofins]) : baseCalculo;
        let aliquotaPis = parseBrazilianNumber(cells[layout.aliqPis]);
        let aliquotaCofins = parseBrazilianNumber(cells[layout.aliqCofins]);
        let valorPis = parseBrazilianNumber(cells[layout.valPis]);
        let valorCofins = parseBrazilianNumber(cells[layout.valCofins]);

        const isCreditReduction = ['5.411', '5411', '5.202', '5202', '6.411', '6411', '6.202', '6202'].includes(cfop.trim().replace('-', '.'));

        if (isCreditReduction) {
          valorProduto = -Math.abs(valorProduto);
          baseCalculo = -Math.abs(baseCalculo);
          baseCalculoPis = -Math.abs(baseCalculoPis);
          baseCalculoCofins = -Math.abs(baseCalculoCofins);
          valorPis = -Math.abs(valorPis);
          valorCofins = -Math.abs(valorCofins);
        }

        items.push({
          id: `pis-entrada-${j}-${Math.random().toString(36).substring(2, 7)}`,
          empresaId: '7',
          data,
          modelo: 'NF-e',
          numeroNota: documento,
          cfop,
          codigoProduto,
          nomeProduto,
          cst,
          cstPis: cst,
          cstCofins: cst,
          valorProduto,
          baseCalculo,
          baseCalculoPis,
          baseCalculoCofins,
          aliquotaPis,
          aliquotaCofins,
          valorPis,
          valorCofins,
          valor: valorProduto,
          aliquota: aliquotaPis + aliquotaCofins,
          imposto: valorPis + valorCofins,
          tipo: 'entrada',
          isCreditReduction
        });
      } else if (isSaidaRow) {
        const data = cells[2];
        const documento = cells[4] || '';
        const codigoProduto = cells[8] || '';
        const nomeProduto = cells[10] || '';
        const rawCfop = cells[16] || '';
        let cfop = rawCfop;
        if (cfop.length === 4 && !cfop.includes('.')) {
          cfop = `${cfop.charAt(0)}.${cfop.substring(1)}`;
        }

        let cst = cells[17] || '01';
        if (cst.length === 1) cst = cst.padStart(2, '0');

        let valorProduto = parseBrazilianNumber(cells[15]);
        let baseCalculo = parseBrazilianNumber(cells[19]);
        let baseCalculoPis = baseCalculo;
        let baseCalculoCofins = cells[25] !== undefined ? parseBrazilianNumber(cells[25]) : baseCalculo;
        let aliquotaPis = parseBrazilianNumber(cells[21]);
        let aliquotaCofins = parseBrazilianNumber(cells[26]);
        let valorPis = parseBrazilianNumber(cells[22]);
        let valorCofins = parseBrazilianNumber(cells[27]);

        items.push({
          id: `pis-saida-${j}-${Math.random().toString(36).substring(2, 7)}`,
          empresaId: '7',
          data,
          modelo: 'NF-e',
          numeroNota: documento,
          cfop,
          codigoProduto,
          nomeProduto,
          cst,
          cstPis: cst,
          cstCofins: cst,
          valorProduto,
          baseCalculo,
          baseCalculoPis,
          baseCalculoCofins,
          aliquotaPis,
          aliquotaCofins,
          valorPis,
          valorCofins,
          valor: valorProduto,
          aliquota: aliquotaPis + aliquotaCofins,
          imposto: valorPis + valorCofins,
          tipo: 'saida'
        });
      }
    }

    onProgress(Math.min(100, Math.round((i / totalLines) * 100)));
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  // Extract period dynamically from dates if period was empty or fallback
  if (items.length > 0) {
    const firstDate = items[0].data;
    const parts = firstDate.split('/');
    if (parts.length === 3) {
      metadata.periodo = `${parts[1]}/${parts[2]}`;
    }
  }

  onProgress(100);
  return { items, metadata };
}

/**
 * Groups and sums duplicate items based on criteria
 */
export function consolidatePisCofinsRows(
  rows: PisCofinsItem[],
  criteria: 'cfop_cst' | 'cfop_cst_product' = 'cfop_cst'
): PisCofinsConsolidatedItem[] {
  const map = new Map<string, PisCofinsConsolidatedItem>();

  rows.forEach(item => {
    // Group by either (tipo, cfop, cst) or (tipo, cfop, cst, codigoProduto, nomeProduto)
    const key = criteria === 'cfop_cst_product'
      ? `${item.tipo}_${item.cfop}_${item.cst}_${item.codigoProduto || ''}_${item.nomeProduto || ''}`
      : `${item.tipo}_${item.cfop}_${item.cst}`;

    const existing = map.get(key);
    if (existing) {
      existing.valorProduto += item.valorProduto;
      existing.baseCalculo += item.baseCalculo;
      existing.baseCalculoPis += item.baseCalculoPis !== undefined ? item.baseCalculoPis : item.baseCalculo;
      existing.baseCalculoCofins += item.baseCalculoCofins !== undefined ? item.baseCalculoCofins : item.baseCalculo;
      existing.valorPis += item.valorPis;
      existing.valorCofins += item.valorCofins;
      existing.valor = existing.valorProduto;
      existing.imposto = existing.valorPis + existing.valorCofins;
      existing.itemCount += 1;
    } else {
      map.set(key, {
        cfop: item.cfop,
        cst: item.cst,
        codigoProduto: item.codigoProduto || '',
        nomeProduto: item.nomeProduto || '',
        valorProduto: item.valorProduto,
        baseCalculo: item.baseCalculo,
        baseCalculoPis: item.baseCalculoPis !== undefined ? item.baseCalculoPis : item.baseCalculo,
        baseCalculoCofins: item.baseCalculoCofins !== undefined ? item.baseCalculoCofins : item.baseCalculo,
        valorPis: item.valorPis,
        valorCofins: item.valorCofins,
        valor: item.valorProduto,
        imposto: item.valorPis + item.valorCofins,
        itemCount: 1,
        tipo: item.tipo,
        aliquotaPis: item.aliquotaPis,
        aliquotaCofins: item.aliquotaCofins
      });
    }
  });

  const ptBrCollator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

  return Array.from(map.values()).sort((a, b) => {
    if (criteria === 'cfop_cst_product') {
      const nameA = a.nomeProduto || '';
      const nameB = b.nomeProduto || '';
      if (nameA !== nameB) {
        return ptBrCollator.compare(nameA, nameB);
      }
    }
    if (a.tipo !== b.tipo) return a.tipo === 'entrada' ? -1 : 1;
    if (a.cfop !== b.cfop) return ptBrCollator.compare(a.cfop, b.cfop);
    return ptBrCollator.compare(a.cst, b.cst);
  });
}

/**
 * Exports parsed PIS/COFINS data to professional styled Excel with separate sheets for Inputs (Entradas) and Outputs (Saídas)
 */
export function exportPisCofinsExcel(
  items: PisCofinsItem[],
  consolidatedRows: PisCofinsConsolidatedItem[],
  metadata: PisCofinsMetadata,
  criteria: 'cfop_cst' | 'cfop_cst_product' = 'cfop_cst'
): void {
  const wb = XLSX.utils.book_new();

  // Branding Styles
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

  const styleTableHeader = {
    fill: { fgColor: { rgb: "04243B" } },
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" }
  };

  const getRowStyle = (isEven: boolean, align: 'left' | 'center' | 'right' = 'left', isBold: boolean = false) => ({
    fill: { fgColor: { rgb: isEven ? "FFFFFF" : "F8FAFC" } },
    font: { name: "Arial", sz: 9, bold: isBold, color: { rgb: "1E293B" } },
    alignment: { horizontal: align, vertical: "center" },
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } }
    }
  });

  if (items.length === 0) {
    const ws = {};
    ws['A1'] = { v: "Nenhum dado importado para exportação." };
    XLSX.utils.book_append_sheet(wb, ws, "Sem Dados");
    XLSX.writeFile(wb, `Demonstrativo_PIS_COFINS_Vazio_${Date.now()}.xlsx`);
    return;
  }

  // 1. Sheet 1: Relatório Completo (Detailed Items, with 17 specific columns)
  const buildDetailedNewSheet = (title: string, rows: PisCofinsItem[]) => {
    const ws: any = {};
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 16 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 16 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 16 } }
    ];

    ws['A1'] = { v: metadata.empresa || 'EMPRESA IDENTIFICADA NO DEMONSTRATIVO', s: styleHeaderTitle };
    ws['A2'] = { v: title, s: styleHeaderSub };
    ws['A3'] = { v: `COMPETÊNCIA: ${metadata.periodo} | CNPJ: ${metadata.cnpj || ''}`, s: styleHeaderSub };

    const headers = [
      'Data Entrada',
      'Nº NF',
      'Acum.',
      'Cod. Prod',
      'Descrição do Produto',
      'CFOP',
      'CST PIS',
      'BC PIS',
      'Alíq. Pis',
      'Valor Pis',
      'CST COFINS',
      'BC COFINS',
      'Alíq. Cofins',
      'Valor Cofins',
      'Base Créd',
      'Vinc Créd Prod',
      'Base Créd Prod'
    ];

    headers.forEach((h, colIdx) => {
      ws[XLSX.utils.encode_cell({ r: 4, c: colIdx })] = { v: h, s: styleTableHeader };
    });

    rows.forEach((item, rowIdx) => {
      const r = 5 + rowIdx;
      const isEven = rowIdx % 2 === 0;

      ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: item.data || '', s: getRowStyle(isEven, 'center') };
      ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: item.numeroNota || '', s: getRowStyle(isEven, 'center') };
      ws[XLSX.utils.encode_cell({ r, c: 2 })] = { v: item.acum ? Number(item.acum) : '', t: item.acum ? 'n' : 's', s: getRowStyle(isEven, 'center') };
      ws[XLSX.utils.encode_cell({ r, c: 3 })] = { v: item.codigoProduto || '', s: getRowStyle(isEven, 'center') };
      ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: item.nomeProduto || '', s: getRowStyle(isEven, 'left') };
      ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: item.cfop || '', s: getRowStyle(isEven, 'center') };
      ws[XLSX.utils.encode_cell({ r, c: 6 })] = { v: `CST ${item.cstPis || item.cst}`, s: getRowStyle(isEven, 'center') };
      
      ws[XLSX.utils.encode_cell({ r, c: 7 })] = { 
        v: item.baseCalculoPis !== undefined ? item.baseCalculoPis : item.baseCalculo, 
        t: 'n', 
        z: '"R$ " #,##0.00', 
        s: getRowStyle(isEven, 'right') 
      };
      ws[XLSX.utils.encode_cell({ r, c: 8 })] = { 
        v: item.aliquotaPis / 100, 
        t: 'n', 
        z: '0.00%', 
        s: getRowStyle(isEven, 'center') 
      };
      ws[XLSX.utils.encode_cell({ r, c: 9 })] = { 
        v: item.valorPis, 
        t: 'n', 
        z: '"R$ " #,##0.00', 
        s: getRowStyle(isEven, 'right', true) 
      };

      ws[XLSX.utils.encode_cell({ r, c: 10 })] = { v: `CST ${item.cstCofins || item.cst}`, s: getRowStyle(isEven, 'center') };
      ws[XLSX.utils.encode_cell({ r, c: 11 })] = { 
        v: item.baseCalculoCofins !== undefined ? item.baseCalculoCofins : item.baseCalculo, 
        t: 'n', 
        z: '"R$ " #,##0.00', 
        s: getRowStyle(isEven, 'right') 
      };
      ws[XLSX.utils.encode_cell({ r, c: 12 })] = { 
        v: item.aliquotaCofins / 100, 
        t: 'n', 
        z: '0.00%', 
        s: getRowStyle(isEven, 'center') 
      };
      ws[XLSX.utils.encode_cell({ r, c: 13 })] = { 
        v: item.valorCofins, 
        t: 'n', 
        z: '"R$ " #,##0.00', 
        s: getRowStyle(isEven, 'right', true) 
      };

      ws[XLSX.utils.encode_cell({ r, c: 14 })] = { 
        v: item.baseCred ? Number(item.baseCred) : '', 
        t: item.baseCred ? 'n' : 's', 
        s: getRowStyle(isEven, 'center') 
      };
      ws[XLSX.utils.encode_cell({ r, c: 15 })] = { 
        v: item.vincCredProd ? Number(item.vincCredProd) : '', 
        t: item.vincCredProd ? 'n' : 's', 
        s: getRowStyle(isEven, 'center') 
      };
      ws[XLSX.utils.encode_cell({ r, c: 16 })] = { 
        v: item.baseCredProd ? Number(item.baseCredProd) : '', 
        t: item.baseCredProd ? 'n' : 's', 
        s: getRowStyle(isEven, 'center') 
      };
    });

    ws['!ref'] = `A1:Q${5 + Math.max(1, rows.length)}`;
    ws['!cols'] = [
      { wch: 14 }, // Data Entrada
      { wch: 12 }, // Nº NF
      { wch: 10 }, // Acum.
      { wch: 12 }, // Cod. Prod
      { wch: 45 }, // Descrição do Produto
      { wch: 10 }, // CFOP
      { wch: 12 }, // CST PIS
      { wch: 18 }, // BC PIS
      { wch: 12 }, // Alíq. Pis
      { wch: 16 }, // Valor Pis
      { wch: 14 }, // CST COFINS
      { wch: 18 }, // BC COFINS
      { wch: 12 }, // Alíq. Cofins
      { wch: 16 }, // Valor Cofins
      { wch: 12 }, // Base Créd
      { wch: 15 }, // Vinc Créd Prod
      { wch: 15 }  // Base Créd Prod
    ];
    return ws;
  };

  // 2. Sheet 2: Resumo por CFOP e CST (Produtos, grouped by Product + CFOP + CST)
  const buildConsolidatedByProductSheet = (title: string, rows: PisCofinsConsolidatedItem[]) => {
    const ws: any = {};
    
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } }
    ];

    ws['A1'] = { v: metadata.empresa || 'EMPRESA IDENTIFICADA NO DEMONSTRATIVO', s: styleHeaderTitle };
    ws['A2'] = { v: title, s: styleHeaderSub };
    ws['A3'] = { v: `COMPETÊNCIA: ${metadata.periodo} | CNPJ: ${metadata.cnpj || ''}`, s: styleHeaderSub };

    const headers = [
      'Cod. Prod',
      'Descrição do Produto',
      'CFOP',
      'CST PIS/COFINS',
      'Valor Produto Total',
      'BC PIS',
      'Alíquota PIS',
      'PIS Total',
      'BC COFINS',
      'Alíquota COFINS',
      'COFINS Total'
    ];

    headers.forEach((h, colIdx) => {
      ws[XLSX.utils.encode_cell({ r: 4, c: colIdx })] = { v: h, s: styleTableHeader };
    });

    rows.forEach((item, rowIdx) => {
      const r = 5 + rowIdx;
      const isEven = rowIdx % 2 === 0;

      ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: item.codigoProduto || '', s: getRowStyle(isEven, 'center') };
      ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: item.nomeProduto || '', s: getRowStyle(isEven, 'left') };
      ws[XLSX.utils.encode_cell({ r, c: 2 })] = { v: item.cfop, s: getRowStyle(isEven, 'center') };
      ws[XLSX.utils.encode_cell({ r, c: 3 })] = { v: `CST ${item.cst}`, s: getRowStyle(isEven, 'center') };
      
      ws[XLSX.utils.encode_cell({ r, c: 4 })] = { 
        v: item.valorProduto, 
        t: 'n', 
        z: '"R$ " #,##0.00', 
        s: getRowStyle(isEven, 'right', true) 
      };
      
      ws[XLSX.utils.encode_cell({ r, c: 5 })] = { 
        v: item.baseCalculoPis, 
        t: 'n', 
        z: '"R$ " #,##0.00', 
        s: getRowStyle(isEven, 'right') 
      };

      const effAliqPis = item.aliquotaPis / 100;
      ws[XLSX.utils.encode_cell({ r, c: 6 })] = { 
        v: effAliqPis, 
        t: 'n', 
        z: '0.00%', 
        s: getRowStyle(isEven, 'center') 
      };

      ws[XLSX.utils.encode_cell({ r, c: 7 })] = { 
        v: item.valorPis, 
        t: 'n', 
        z: '"R$ " #,##0.00', 
        s: getRowStyle(isEven, 'right', true) 
      };

      ws[XLSX.utils.encode_cell({ r, c: 8 })] = { 
        v: item.baseCalculoCofins, 
        t: 'n', 
        z: '"R$ " #,##0.00', 
        s: getRowStyle(isEven, 'right') 
      };

      const effAliqCofins = item.aliquotaCofins / 100;
      ws[XLSX.utils.encode_cell({ r, c: 9 })] = { 
        v: effAliqCofins, 
        t: 'n', 
        z: '0.00%', 
        s: getRowStyle(isEven, 'center') 
      };

      ws[XLSX.utils.encode_cell({ r, c: 10 })] = { 
        v: item.valorCofins, 
        t: 'n', 
        z: '"R$ " #,##0.00', 
        s: getRowStyle(isEven, 'right', true) 
      };
    });

    ws['!ref'] = `A1:K${5 + Math.max(1, rows.length)}`;
    ws['!cols'] = [
      { wch: 15 }, // Cod. Prod
      { wch: 45 }, // Descrição do Produto
      { wch: 10 }, // CFOP
      { wch: 18 }, // CST
      { wch: 20 }, // Valor Produto Total
      { wch: 18 }, // BC PIS
      { wch: 15 }, // Alíquota PIS
      { wch: 16 }, // PIS Total
      { wch: 18 }, // BC COFINS
      { wch: 15 }, // Alíquota COFINS
      { wch: 16 }  // COFINS Total
    ];
    return ws;
  };

  // 3. Sheet 3: Resumo por CFOP e CST (PIS-COFINS, grouped only by CFOP + CST with Entradas/Saídas separation and Totals)
  const buildConsolidatedByCfopCstSheet = (title: string, rows: PisCofinsConsolidatedItem[]) => {
    const ws: any = {};
    const merges: any[] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } }
    ];

    // Populate top title merged header cells across all columns A..I to ensure seamless navy background
    for (let c = 0; c <= 8; c++) {
      ws[XLSX.utils.encode_cell({ r: 0, c })] = { v: c === 0 ? (metadata.empresa || 'EMPRESA IDENTIFICADA NO DEMONSTRATIVO') : '', s: styleHeaderTitle };
      ws[XLSX.utils.encode_cell({ r: 1, c })] = { v: c === 0 ? title : '', s: styleHeaderSub };
      ws[XLSX.utils.encode_cell({ r: 2, c })] = { v: c === 0 ? `COMPETÊNCIA: ${metadata.periodo} | CNPJ: ${metadata.cnpj || ''}` : '', s: styleHeaderSub };
    }

    const headers = [
      'CFOP',
      'CST PIS/COF',
      'VALOR PRODUTO TOTAL',
      'BASE DE CÁLCULO PIS',
      'ALÍQUOTA PIS',
      'PIS TOTAL',
      'BASE DE CÁLCULO COFINS',
      'ALÍQUOTA COFINS',
      'COFINS TOTAL'
    ];

    headers.forEach((h, colIdx) => {
      ws[XLSX.utils.encode_cell({ r: 4, c: colIdx })] = { v: h, s: styleTableHeader };
    });

    const entradas = rows.filter(r => r.tipo === 'entrada');
    const saidas = rows.filter(r => r.tipo === 'saida');

    let currentR = 5;

    // Brand-aligned Styles for Section Banners and Totals (matching #04243b dark navy and #e4b35e gold)
    const styleEntradaHeader = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "E4B35E" } },
      alignment: { horizontal: "left", vertical: "center" }
    };

    const styleEntradaTotal = {
      fill: { fgColor: { rgb: "EBF3F9" } },
      font: { name: "Arial", sz: 9, bold: true, color: { rgb: "04243B" } },
      alignment: { horizontal: "right", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "04243B" } },
        bottom: { style: "double", color: { rgb: "04243B" } }
      }
    };

    const styleEntradaTotalText = {
      ...styleEntradaTotal,
      alignment: { horizontal: "left", vertical: "center" }
    };

    const styleSaidaHeader = {
      fill: { fgColor: { rgb: "3D2800" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "E4B35E" } },
      alignment: { horizontal: "left", vertical: "center" }
    };

    const styleSaidaTotal = {
      fill: { fgColor: { rgb: "FAF2E1" } },
      font: { name: "Arial", sz: 9, bold: true, color: { rgb: "523600" } },
      alignment: { horizontal: "right", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "E4B35E" } },
        bottom: { style: "double", color: { rgb: "E4B35E" } }
      }
    };

    const styleSaidaTotalText = {
      ...styleSaidaTotal,
      alignment: { horizontal: "left", vertical: "center" }
    };

    // 1. ENTRADAS SECTION
    if (entradas.length > 0) {
      // Banner row ENTRADAS - populate all cells A..I so fill background is continuous
      merges.push({ s: { r: currentR, c: 0 }, e: { r: currentR, c: 8 } });
      for (let col = 0; col <= 8; col++) {
        ws[XLSX.utils.encode_cell({ r: currentR, c: col })] = {
          v: col === 0 ? 'ENTRADAS / CRÉDITOS' : '',
          s: styleEntradaHeader
        };
      }
      currentR++;

      // Data rows
      let eValProd = 0, eBasePis = 0, eValPis = 0, eBaseCofins = 0, eValCofins = 0;

      entradas.forEach((item, idx) => {
        const isEven = idx % 2 === 0;
        eValProd += item.valorProduto;
        eBasePis += item.baseCalculoPis;
        eValPis += item.valorPis;
        eBaseCofins += item.baseCalculoCofins;
        eValCofins += item.valorCofins;

        ws[XLSX.utils.encode_cell({ r: currentR, c: 0 })] = { v: item.cfop, s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 1 })] = { v: `CST ${item.cst}`, s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 2 })] = { v: item.valorProduto, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'right', true) };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 3 })] = { v: item.baseCalculoPis, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'right') };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 4 })] = { v: item.aliquotaPis / 100, t: 'n', z: '0.00%', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 5 })] = { v: item.valorPis, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'right', true) };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 6 })] = { v: item.baseCalculoCofins, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'right') };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 7 })] = { v: item.aliquotaCofins / 100, t: 'n', z: '0.00%', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 8 })] = { v: item.valorCofins, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'right', true) };
        currentR++;
      });

      // Total row ENTRADAS - populate BOTH A and B so the merged range has continuous background and borders
      merges.push({ s: { r: currentR, c: 0 }, e: { r: currentR, c: 1 } });
      ws[XLSX.utils.encode_cell({ r: currentR, c: 0 })] = { v: 'TOTAL ENTRADAS', s: styleEntradaTotalText };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 1 })] = { v: '', s: styleEntradaTotalText };
      
      ws[XLSX.utils.encode_cell({ r: currentR, c: 2 })] = { v: eValProd, t: 'n', z: '"R$ " #,##0.00', s: styleEntradaTotal };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 3 })] = { v: eBasePis, t: 'n', z: '"R$ " #,##0.00', s: styleEntradaTotal };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 4 })] = { v: '-', s: { ...styleEntradaTotal, alignment: { horizontal: 'center', vertical: 'center' } } };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 5 })] = { v: eValPis, t: 'n', z: '"R$ " #,##0.00', s: styleEntradaTotal };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 6 })] = { v: eBaseCofins, t: 'n', z: '"R$ " #,##0.00', s: styleEntradaTotal };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 7 })] = { v: '-', s: { ...styleEntradaTotal, alignment: { horizontal: 'center', vertical: 'center' } } };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 8 })] = { v: eValCofins, t: 'n', z: '"R$ " #,##0.00', s: styleEntradaTotal };
      currentR++;
    }

    // 2. SAÍDAS SECTION
    if (saidas.length > 0) {
      if (entradas.length > 0) {
        currentR++; // Empty row spacer between sections
      }

      // Banner row SAÍDAS - populate all cells A..I so fill background is continuous
      merges.push({ s: { r: currentR, c: 0 }, e: { r: currentR, c: 8 } });
      for (let col = 0; col <= 8; col++) {
        ws[XLSX.utils.encode_cell({ r: currentR, c: col })] = {
          v: col === 0 ? 'SAÍDAS / DÉBITOS' : '',
          s: styleSaidaHeader
        };
      }
      currentR++;

      // Data rows
      let sValProd = 0, sBasePis = 0, sValPis = 0, sBaseCofins = 0, sValCofins = 0;

      saidas.forEach((item, idx) => {
        const isEven = idx % 2 === 0;
        sValProd += item.valorProduto;
        sBasePis += item.baseCalculoPis;
        sValPis += item.valorPis;
        sBaseCofins += item.baseCalculoCofins;
        sValCofins += item.valorCofins;

        ws[XLSX.utils.encode_cell({ r: currentR, c: 0 })] = { v: item.cfop, s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 1 })] = { v: `CST ${item.cst}`, s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 2 })] = { v: item.valorProduto, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'right', true) };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 3 })] = { v: item.baseCalculoPis, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'right') };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 4 })] = { v: item.aliquotaPis / 100, t: 'n', z: '0.00%', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 5 })] = { v: item.valorPis, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'right', true) };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 6 })] = { v: item.baseCalculoCofins, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'right') };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 7 })] = { v: item.aliquotaCofins / 100, t: 'n', z: '0.00%', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r: currentR, c: 8 })] = { v: item.valorCofins, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'right', true) };
        currentR++;
      });

      // Total row SAÍDAS - populate BOTH A and B so the merged range has continuous background and borders
      merges.push({ s: { r: currentR, c: 0 }, e: { r: currentR, c: 1 } });
      ws[XLSX.utils.encode_cell({ r: currentR, c: 0 })] = { v: 'TOTAL SAÍDAS', s: styleSaidaTotalText };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 1 })] = { v: '', s: styleSaidaTotalText };
      
      ws[XLSX.utils.encode_cell({ r: currentR, c: 2 })] = { v: sValProd, t: 'n', z: '"R$ " #,##0.00', s: styleSaidaTotal };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 3 })] = { v: sBasePis, t: 'n', z: '"R$ " #,##0.00', s: styleSaidaTotal };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 4 })] = { v: '-', s: { ...styleSaidaTotal, alignment: { horizontal: 'center', vertical: 'center' } } };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 5 })] = { v: sValPis, t: 'n', z: '"R$ " #,##0.00', s: styleSaidaTotal };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 6 })] = { v: sBaseCofins, t: 'n', z: '"R$ " #,##0.00', s: styleSaidaTotal };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 7 })] = { v: '-', s: { ...styleSaidaTotal, alignment: { horizontal: 'center', vertical: 'center' } } };
      ws[XLSX.utils.encode_cell({ r: currentR, c: 8 })] = { v: sValCofins, t: 'n', z: '"R$ " #,##0.00', s: styleSaidaTotal };
      currentR++;
    }

    ws['!merges'] = merges;
    ws['!ref'] = `A1:I${currentR}`;
    ws['!cols'] = [
      { wch: 10 }, // CFOP
      { wch: 16 }, // CST PIS/COF
      { wch: 22 }, // VALOR PRODUTO TOTAL
      { wch: 22 }, // BASE DE CÁLCULO PIS
      { wch: 15 }, // ALÍQUOTA PIS
      { wch: 16 }, // PIS TOTAL
      { wch: 22 }, // BASE DE CÁLCULO COFINS
      { wch: 15 }, // ALÍQUOTA COFINS
      { wch: 16 }  // COFINS TOTAL
    ];
    return ws;
  };

  // Separate items into Entradas and Saídas
  const entradas = items.filter(i => 
    i.tipo === 'entrada' || 
    (i.cfop && (i.cfop.startsWith('1') || i.cfop.startsWith('2') || i.cfop.startsWith('3')))
  );

  const saidas = items.filter(i => 
    i.tipo === 'saida' || 
    (i.cfop && (i.cfop.startsWith('5') || i.cfop.startsWith('6') || i.cfop.startsWith('7')))
  );

  const entradasResumidas = consolidatePisCofinsRows(entradas, 'cfop_cst_product');
  const saidasResumidas = consolidatePisCofinsRows(saidas, 'cfop_cst_product');
  const resumoCfopCst = consolidatePisCofinsRows(items, 'cfop_cst');

  // Build the 5 worksheets
  const wsEntradasCompleto = buildDetailedNewSheet(
    'RELATÓRIO COMPLETO DE ENTRADAS (PIS/COFINS)', 
    entradas
  );
  const wsEntradasResumido = buildConsolidatedByProductSheet(
    'RESUMO DE ENTRADAS POR PRODUTO, CFOP E CST', 
    entradasResumidas
  );
  const wsSaidasCompleto = buildDetailedNewSheet(
    'RELATÓRIO COMPLETO DE SAÍDAS (PIS/COFINS)', 
    saidas
  );
  const wsSaidasResumido = buildConsolidatedByProductSheet(
    'RESUMO DE SAÍDAS POR PRODUTO, CFOP E CST', 
    saidasResumidas
  );
  const wsResumoCfopCst = buildConsolidatedByCfopCstSheet(
    'RESUMO CONSOLIDADO POR CFOP E CST (PIS/COFINS)', 
    resumoCfopCst
  );

  // Append 5 sheets with EXACT requested names
  XLSX.utils.book_append_sheet(wb, wsEntradasCompleto, 'Entradas Completo');
  XLSX.utils.book_append_sheet(wb, wsEntradasResumido, 'Entradas Resumido');
  XLSX.utils.book_append_sheet(wb, wsSaidasCompleto, 'Saídas Completo');
  XLSX.utils.book_append_sheet(wb, wsSaidasResumido, 'Saídas Resumido');
  XLSX.utils.book_append_sheet(wb, wsResumoCfopCst, 'Resumo CFOP-CST');

  const periodStr = metadata && metadata.periodo ? metadata.periodo.replace('/', '_') : 'Geral';
  XLSX.writeFile(wb, `Relatorio_PIS_COFINS_5_Abas_${periodStr}_${Date.now()}.xlsx`);
}

export interface PisCofinsAuditError {
  id: string;
  tipoErro: 'divergencia_bc' | 'erro_calculo_pis' | 'erro_calculo_cofins' | 'cst_incompativel' | 'aliquota_incoerente' | 'bc_maior_produto';
  severidade: 'critico' | 'aviso' | 'informativo';
  item: PisCofinsItem;
  titulo: string;
  descricao: string;
  detalhe: string;
}

export function auditPisCofinsReport(rows: PisCofinsItem[]): PisCofinsAuditError[] {
  const errors: PisCofinsAuditError[] = [];

  rows.forEach((row, idx) => {
    // 1. Divergência de Base de Cálculo (BC PIS vs BC COFINS)
    const absBcPis = Math.abs(row.baseCalculoPis);
    const absBcCofins = Math.abs(row.baseCalculoCofins);
    const diffBc = Math.abs(absBcPis - absBcCofins);
    
    if (diffBc > 0.01 && (absBcPis > 0 || absBcCofins > 0)) {
      errors.push({
        id: `audit-pc-bc-${idx}-${row.numeroNota}`,
        tipoErro: 'divergencia_bc',
        severidade: 'critico',
        item: row,
        titulo: 'Divergência de BC PIS e BC COFINS',
        descricao: `Divergência de R$ ${diffBc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} na Base de Cálculo do PIS e COFINS.`,
        detalhe: `O produto '${row.nomeProduto}' na NF ${row.numeroNota} apresenta BC PIS de R$ ${row.baseCalculoPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} e BC COFINS de R$ ${row.baseCalculoCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
      });
    }

    // 2. Erro de Cálculo do PIS (Base * Alíquota)
    const expectedPis = Number((row.baseCalculoPis * (row.aliquotaPis / 100)).toFixed(2));
    const diffPis = Math.abs(row.valorPis - expectedPis);
    if (diffPis > 0.05 && Math.abs(row.baseCalculoPis) > 0 && row.aliquotaPis > 0) {
      errors.push({
        id: `audit-pc-calc-pis-${idx}-${row.numeroNota}`,
        tipoErro: 'erro_calculo_pis',
        severidade: 'critico',
        item: row,
        titulo: 'Erro no Cálculo do PIS',
        descricao: `PIS Declarado (R$ ${row.valorPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) difere do Calculado (R$ ${expectedPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`,
        detalhe: `Multiplicando a Base (R$ ${row.baseCalculoPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) pela Alíquota (${row.aliquotaPis.toFixed(2)}%), o valor deveria ser R$ ${expectedPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Divergência de R$ ${diffPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
      });
    }

    // 3. Erro de Cálculo da COFINS (Base * Alíquota)
    const expectedCofins = Number((row.baseCalculoCofins * (row.aliquotaCofins / 100)).toFixed(2));
    const diffCofins = Math.abs(row.valorCofins - expectedCofins);
    if (diffCofins > 0.05 && Math.abs(row.baseCalculoCofins) > 0 && row.aliquotaCofins > 0) {
      errors.push({
        id: `audit-pc-calc-cofins-${idx}-${row.numeroNota}`,
        tipoErro: 'erro_calculo_cofins',
        severidade: 'critico',
        item: row,
        titulo: 'Erro no Cálculo da COFINS',
        descricao: `COFINS Declarada (R$ ${row.valorCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) difere da Calculada (R$ ${expectedCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`,
        detalhe: `Multiplicando a Base (R$ ${row.baseCalculoCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) pela Alíquota (${row.aliquotaCofins.toFixed(2)}%), o valor deveria ser R$ ${expectedCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Divergência de R$ ${diffCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
      });
    }

    // 4. CST Incompatível com o Tipo da Operação
    const isEntradaCstForSaida = row.tipo === 'saida' && ['50', '51', '52', '53', '54', '55', '56', '60', '61', '62', '63', '64', '65', '66', '67', '70', '71', '72', '73', '74', '75'].includes(row.cst);
    const isSaidaCstForEntrada = row.tipo === 'entrada' && ['01', '02', '03', '04', '05', '06', '07', '08', '09'].includes(row.cst);
    if (isEntradaCstForSaida || isSaidaCstForEntrada) {
      errors.push({
        id: `audit-pc-cst-compat-${idx}-${row.numeroNota}`,
        tipoErro: 'cst_incompativel',
        severidade: 'critico',
        item: row,
        titulo: 'CST Incompatível com Operação',
        descricao: `CST ${row.cst} é inválido para uma operação de ${row.tipo === 'entrada' ? 'Entrada (Crédito)' : 'Saída (Débito)'}.`,
        detalhe: `CSTs de 01 a 09 são exclusivos para operações de Saída/Débito. CSTs de 50 a 75 são exclusivos para operações de Entrada/Crédito. Corrija o CST do produto '${row.nomeProduto}' na NF ${row.numeroNota} para evitar rejeições no SPED.`
      });
    }

    // 5. Alíquota Incoerente com CST
    const isExemptCst = ['04', '06', '07', '08', '09', '70', '71', '72', '73', '74', '75'].includes(row.cst);
    const isTaxedCst = ['01', '02', '50', '51', '52'].includes(row.cst);

    if (isExemptCst && (row.aliquotaPis > 0 || row.aliquotaCofins > 0 || row.valorPis > 0 || row.valorCofins > 0)) {
      errors.push({
        id: `audit-pc-aliq-inc-${idx}-${row.numeroNota}`,
        tipoErro: 'aliquota_incoerente',
        severidade: 'aviso',
        item: row,
        titulo: 'Alíquota em CST de Isenção / Alíquota Zero',
        descricao: `CST ${row.cst} indica Isenção/Alíquota Zero, mas há valores tributados informados.`,
        detalhe: `Para o CST ${row.cst} no produto '${row.nomeProduto}' (NF ${row.numeroNota}), as alíquotas de PIS/COFINS deveriam ser 0%. Valores declarados: PIS ${row.aliquotaPis}% (R$ ${row.valorPis}), COFINS ${row.aliquotaCofins}% (R$ ${row.valorCofins}).`
      });
    } else if (isTaxedCst && (row.baseCalculoPis > 0 || row.baseCalculoCofins > 0) && (row.aliquotaPis === 0 || row.aliquotaCofins === 0)) {
      errors.push({
        id: `audit-pc-aliq-zero-${idx}-${row.numeroNota}`,
        tipoErro: 'aliquota_incoerente',
        severidade: 'aviso',
        item: row,
        titulo: 'Alíquota Zero em CST de Débito/Crédito',
        descricao: `CST ${row.cst} indica operação tributada, mas a alíquota informada é de 0%.`,
        detalhe: `O CST ${row.cst} no produto '${row.nomeProduto}' (NF ${row.numeroNota}) deveria possuir alíquotas tributadas de PIS/COFINS (comumente 1.65% e 7.60% no Lucro Real), mas foi declarada alíquota de 0% mesmo com base de cálculo existente.`
      });
    }

    // 6. Base de Cálculo maior que o valor da Operação (BC > Valor Produto)
    const absValorProd = Math.abs(row.valorProduto);
    if ((absBcPis > absValorProd || absBcCofins > absValorProd) && absValorProd > 0) {
      errors.push({
        id: `audit-pc-bc-maior-${idx}-${row.numeroNota}`,
        tipoErro: 'bc_maior_produto',
        severidade: 'aviso',
        item: row,
        titulo: 'BC Maior que o Valor da Operação',
        descricao: `A base de cálculo de PIS (R$ ${row.baseCalculoPis}) ou COFINS (R$ ${row.baseCalculoCofins}) supera o valor do produto (R$ ${row.valorProduto}).`,
        detalhe: `Na NF ${row.numeroNota}, o produto '${row.nomeProduto}' tem valor total de R$ ${row.valorProduto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, mas a base de cálculo informada para PIS é R$ ${row.baseCalculoPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} e para COFINS é R$ ${row.baseCalculoCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
      });
    }
  });

  return errors;
}
