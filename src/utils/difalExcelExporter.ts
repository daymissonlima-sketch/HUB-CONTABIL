/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import XLSX from 'xlsx-js-style';
import { ResultadoDifalLote } from './difalCearaCalculator';

export function exportarDifalParaExcel(resultadoLote: ResultadoDifalLote, nomeEmpresa: string = 'Empresa Emitente') {
  const ws: any = {};
  let currentRow = 0;
  const merges: any[] = [];

  const getCellRef = (r: number, c: number) => {
    const colLetter = String.fromCharCode(65 + c);
    return `${colLetter}${r + 1}`;
  };

  const writeCell = (
    r: number, 
    c: number, 
    val: any, 
    type: 's' | 'n', 
    style: any = {}, 
    format: string = ''
  ) => {
    const ref = getCellRef(r, c);
    ws[ref] = { v: val, t: type, s: style };
    if (format) ws[ref].z = format;
  };

  // Cores da Identidade Visual: Azul Petróleo (#04243b) e Dourado (#e4b35e)
  const styleHeader = {
    fill: { fgColor: { rgb: '04243B' } },
    font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: 'E4B35E' } },
    alignment: { horizontal: 'center', vertical: 'center' }
  };

  const styleSubHeader = {
    fill: { fgColor: { rgb: '031D30' } },
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'center' }
  };

  const styleSection = {
    fill: { fgColor: { rgb: 'F1F5F9' } },
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '04243B' } },
    alignment: { horizontal: 'left', vertical: 'center' }
  };

  const styleTh = {
    fill: { fgColor: { rgb: '04243B' } },
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'E4B35E' } },
      bottom: { style: 'thin', color: { rgb: 'E4B35E' } },
    }
  };

  const styleTdText = {
    font: { name: 'Calibri', sz: 9 },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } }
  };

  const styleTdNum = {
    font: { name: 'Calibri', sz: 9 },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } }
  };

  const styleTotal = {
    fill: { fgColor: { rgb: 'FEF3C7' } },
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '04243B' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: {
      top: { style: 'medium', color: { rgb: '04243B' } },
      bottom: { style: 'medium', color: { rgb: '04243B' } }
    }
  };

  const totalCols = 9;

  // 1. TÍTULO PRINCIPAL
  writeCell(currentRow, 0, 'MY HUB - MOREIRA & LIMA | GESTÃO TRIBUTÁRIA', 's', styleHeader);
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: totalCols - 1 } });
  currentRow++;

  // 2. SUBTÍTULO
  writeCell(currentRow, 0, `DEMONSTRATIVO DE CÁLCULO DO ICMS DIFAL - CEARÁ (SEFAZ-CE) | ${new Date().toLocaleDateString('pt-BR')}`, 's', styleSubHeader);
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: totalCols - 1 } });
  currentRow += 2;

  // 3. CABEÇALHOS DA TABELA DE ITENS
  const colunas = [
    'Item',
    'UF Origem',
    'Vr. Operação',
    'Alq. Inter',
    'Crédito / Abatimento',
    'Alq. CE',
    'BC Ceará (Por Dentro)',
    'ICMS Destino',
    'DIFAL a Recolher'
  ];

  colunas.forEach((col, idx) => {
    writeCell(currentRow, idx, col, 's', styleTh);
  });
  currentRow++;

  // 4. LINHAS DE DADOS
  resultadoLote.itens.forEach((res, i) => {
    writeCell(currentRow, 0, res.item.descricao || `Item ${i + 1}`, 's', styleTdText);
    writeCell(currentRow, 1, res.item.ufOrigem, 's', styleTdText);
    writeCell(currentRow, 2, res.valorOperacao, 'n', styleTdNum, 'R$ #,##0.00');
    writeCell(currentRow, 3, res.item.aliquotaInter / 100, 'n', styleTdNum, '0.00%');
    writeCell(currentRow, 4, res.deducaoInterestadual, 'n', styleTdNum, 'R$ #,##0.00');
    writeCell(currentRow, 5, res.item.aliquotaIntra / 100, 'n', styleTdNum, '0.00%');
    writeCell(currentRow, 6, res.baseCalculoDestino, 'n', styleTdNum, 'R$ #,##0.00');
    writeCell(currentRow, 7, res.icmsDestinoTotal, 'n', styleTdNum, 'R$ #,##0.00');
    writeCell(currentRow, 8, res.totalDifalGeral, 'n', styleTdNum, 'R$ #,##0.00');
    currentRow++;
  });

  // 5. LINHA DE TOTAIS
  const totalDeducoes = resultadoLote.itens.reduce((acc, r) => acc + (r.deducaoInterestadual ?? r.icmsOrigem), 0);
  writeCell(currentRow, 0, 'TOTAIS CONSOLIDADOS', 's', { ...styleTotal, alignment: { horizontal: 'left' } });
  writeCell(currentRow, 1, '', 's', styleTotal);
  writeCell(currentRow, 2, resultadoLote.totalOperacao, 'n', styleTotal, 'R$ #,##0.00');
  writeCell(currentRow, 3, '', 's', styleTotal);
  writeCell(currentRow, 4, totalDeducoes, 'n', styleTotal, 'R$ #,##0.00');
  writeCell(currentRow, 5, '', 's', styleTotal);
  writeCell(currentRow, 6, resultadoLote.totalBaseCalculoDestino, 'n', styleTotal, 'R$ #,##0.00');
  writeCell(currentRow, 7, resultadoLote.totalIcmsDestino, 'n', styleTotal, 'R$ #,##0.00');
  writeCell(currentRow, 8, resultadoLote.totalGeralPagar, 'n', styleTotal, 'R$ #,##0.00');
  currentRow += 2;

  // 6. SEÇÃO DE MEMÓRIA DE CÁLCULO E FUNDAMENTAÇÃO
  writeCell(currentRow, 0, 'MEMÓRIA DE CÁLCULO DETALHADA E FUNDAMENTAÇÃO LEGAL (SEFAZ-CE)', 's', styleSection);
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: totalCols - 1 } });
  currentRow++;

  resultadoLote.itens.forEach((res, itemIdx) => {
    writeCell(currentRow, 0, `ITEM ${itemIdx + 1}: (Origem: ${res.item.ufOrigem} ➔ Ceará)`, 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '04243B' } },
      fill: { fgColor: { rgb: 'E2E8F0' } }
    });
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: totalCols - 1 } });
    currentRow++;

    writeCell(currentRow, 0, `Legislação Aplicável: ${res.fundamentacaoLegal}`, 's', {
      font: { name: 'Calibri', sz: 9, italic: true, color: { rgb: '475569' } }
    });
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: totalCols - 1 } });
    currentRow++;

    res.memoriaPassos.forEach((p) => {
      writeCell(currentRow, 0, `• ${p.titulo}: ${p.descricao}`, 's', styleTdText);
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: totalCols - 1 } });
      currentRow++;

      writeCell(currentRow, 0, `   Fórmula: ${p.formula}`, 's', { font: { name: 'Consolas', sz: 8.5, color: { rgb: '1E293B' } } });
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: totalCols - 1 } });
      currentRow++;

      writeCell(currentRow, 0, `   Substituição: ${p.substituicao} => ${p.resultadoFormatado}`, 's', { 
        font: { name: 'Consolas', sz: 8.5, bold: true, color: { rgb: '04243B' } },
        fill: { fgColor: { rgb: 'F8FAFC' } }
      });
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: totalCols - 1 } });
      currentRow++;
    });
    currentRow++;
  });

  // Configuração das larguras de coluna
  ws['!cols'] = [
    { wch: 18 }, // Item
    { wch: 12 }, // UF
    { wch: 16 }, // Vr Operação
    { wch: 12 }, // Alq Inter
    { wch: 16 }, // ICMS Origem
    { wch: 12 }, // Alq CE
    { wch: 22 }, // BC Ceará
    { wch: 16 }, // ICMS Destino
    { wch: 18 }  // Total Pagar
  ];

  ws['!merges'] = merges;
  ws['!ref'] = `A1:I${currentRow + 2}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DIFAL Ceará');

  const filename = `DIFAL_Ceara_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}
