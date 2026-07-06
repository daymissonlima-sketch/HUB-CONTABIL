import { loadPdfJS } from './pdfExtractor';

interface TextItemPos {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  width?: number;
}

/**
 * Converte um arquivo PDF tabular em string CSV (formato compatível com importação de faturamento).
 * Algoritmo baseado em agrupamento vertical (Y) com tolerância dinâmica e mesclagem horizontal (X).
 */
export async function convertPdfToCsvString(file: File): Promise<string> {
  const pdfjsLib = await loadPdfJS();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  
  const allRows: string[][] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const items = (textContent.items || []) as any[];

    const withPos: TextItemPos[] = items
      .filter(it => it.str && it.str.trim().length > 0)
      .map(it => {
        const transform = it.transform;
        const x = transform[4];
        const y = viewport.height - transform[5];
        return {
          text: it.str.trim(),
          x,
          y,
          fontSize: it.height || transform[0] || 10,
          width: it.width || 0
        };
      });

    if (withPos.length === 0) continue;

    // Estimativa de tolerância de linha Y
    const heights = withPos.map(i => i.fontSize).filter(h => h > 0);
    const avgHeight = heights.length > 0 ? heights.reduce((a, b) => a + b, 0) / heights.length : 10;
    const yTolerance = Math.max(4, avgHeight * 0.65);

    // Agrupamento em linhas
    const groups: { y: number; items: TextItemPos[] }[] = [];
    withPos.forEach(item => {
      let best: { y: number; items: TextItemPos[] } | null = null;
      let bestDiff = Infinity;
      for (const g of groups) {
        const diff = Math.abs(g.y - item.y);
        if (diff < bestDiff && diff <= yTolerance) {
          bestDiff = diff;
          best = g;
        }
      }
      if (best) {
        best.items.push(item);
        best.y = (best.y * (best.items.length - 1) + item.y) / best.items.length;
      } else {
        groups.push({ y: item.y, items: [item] });
      }
    });

    groups.sort((a, b) => a.y - b.y);

    // Mesclar células por proximidade X e montar linha
    groups.forEach(g => {
      const sorted = g.items.sort((a, b) => a.x - b.x);
      if (sorted.length === 0) return;
      const merged: string[] = [];
      let current = { text: sorted[0].text, x: sorted[0].x };
      for (let i = 1; i < sorted.length; i++) {
        const it = sorted[i];
        const last = sorted[i - 1];
        const gap = it.x - (last.x + (last.width || last.fontSize * 0.5));
        if (gap < 0 || gap < it.fontSize * 0.6) {
          current.text += ' ' + it.text;
        } else {
          merged.push(current.text.trim());
          current = { text: it.text, x: it.x };
        }
      }
      merged.push(current.text.trim());
      allRows.push(merged);
    });
  }

  if (allRows.length === 0) {
    throw new Error('Nenhuma tabela ou dado estruturado detectado no arquivo PDF.');
  }

  // Conversão para string CSV normalizada com delimitador vírgula
  const maxCols = Math.max(1, ...allRows.map(r => r.length));
  const normalized = allRows.map(r => {
    const padded = r.slice();
    while (padded.length < maxCols) padded.push('');
    return padded.slice(0, maxCols);
  });

  const escapeCsv = (val: string) => {
    const str = String(val ?? '');
    if (/[\,\"\n\r]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  return normalized.map(r => r.map(escapeCsv).join(',')).join('\n');
}
