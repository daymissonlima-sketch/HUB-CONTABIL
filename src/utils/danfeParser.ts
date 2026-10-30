/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Parser Completo de XML NF-e 4.00 (<nfeProc>) e Gerador de Código de Barras Code-128C
 * no Padrão Nacional do DANFE (Manual de Orientação do Contribuinte - MOC SEFAZ)
 */

import { DocumentoFiscalArmazenado } from '../types/sefazTypes';

export interface DanfeItemProduto {
  nItem: string;
  cProd: string;
  cEAN: string;
  xProd: string;
  infAdProd: string;
  ncm: string;
  cest: string;
  cstCsosn: string;
  cfop: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
  vDesc: number;
  vBC: number;
  vICMS: number;
  vIPI: number;
  pICMS: number;
  pIPI: number;
}

export interface DanfeDuplicata {
  nDup: string;
  dVenc: string;
  vDup: number;
}

export interface DadosDanfeOficial {
  isNfeCompleta: boolean;
  chave: string;
  chaveFormatada: string;
  nNF: string;
  nNFFormatado: string;
  serie: string;
  tpNF: '0' | '1'; // 0-Entrada, 1-Saída
  natOp: string;
  dhEmi: string;
  dataEmissao: string;
  horaEmissao: string;
  dataSaidaEntrada: string;
  horaSaidaEntrada: string;
  protocolo: string;
  dhRecbto: string;
  situacao: string;
  isCancelada: boolean;

  emitente: {
    razaoSocial: string;
    nomeFantasia: string;
    cnpjCpf: string;
    ie: string;
    ieSt: string;
    im: string;
    crt: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    fone: string;
  };

  destinatario: {
    razaoSocial: string;
    cnpjCpf: string;
    ie: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    fone: string;
  };

  fatura: {
    nFat: string;
    vOrig: number;
    vDesc: number;
    vLiq: number;
    formaPagamento: string;
  };
  duplicatas: DanfeDuplicata[];

  impostos: {
    vBC: number;
    vICMS: number;
    vBCST: number;
    vST: number;
    vProd: number;
    vFrete: number;
    vSeg: number;
    vDesc: number;
    vII: number;
    vIPI: number;
    vPIS: number;
    vCOFINS: number;
    vOutro: number;
    vNF: number;
    vTotTrib: number;
  };

  transporte: {
    modFrete: string;
    modFreteDescricao: string;
    razaoSocial: string;
    cnpjCpf: string;
    ie: string;
    endereco: string;
    municipio: string;
    uf: string;
    placa: string;
    ufVeiculo: string;
    rntc: string;
    qVol: string;
    esp: string;
    marca: string;
    nVol: string;
    pesoB: number;
    pesoL: number;
  };

  itens: DanfeItemProduto[];
  infCpl: string;
  infAdFisco: string;
}

// Tabela de padrões de barras do Code-128 (valores 0 a 106)
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

/**
 * Gera os retângulos (barras pretas) de um Código de Barras Code-128C para a chave de 44 dígitos
 */
export function gerarBarrasCode128C(chave: string): { barras: Array<{ x: number; w: number }>; larguraTotal: number } {
  const digits = (chave || '').replace(/\D/g, '').padEnd(44, '0').slice(0, 44);
  const codes: number[] = [105]; // Start Code C
  let checksum = 105;

  for (let i = 0; i < 44; i += 2) {
    const pair = parseInt(digits.slice(i, i + 2), 10) || 0;
    codes.push(pair);
    checksum += pair * (i / 2 + 1);
  }

  codes.push(checksum % 103);
  codes.push(106); // Stop Code

  const barras: Array<{ x: number; w: number }> = [];
  let cursor = 10; // Quiet zone inicial

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code] || CODE128_PATTERNS[0];
    for (let i = 0; i < pattern.length; i++) {
      const width = parseInt(pattern[i], 10);
      if (i % 2 === 0) {
        barras.push({ x: cursor, w: width });
      }
      cursor += width;
    }
  }

  return { barras, larguraTotal: cursor + 10 };
}

function getTagText(parent: Element | Document | null, tagName: string): string {
  if (!parent) return '';
  const els = parent.getElementsByTagName(tagName);
  if (els && els.length > 0 && els[0].textContent) {
    return els[0].textContent.trim();
  }
  // Fallback com namespace
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const local = all[i].localName || all[i].tagName.split(':').pop();
    if (local === tagName && all[i].textContent) {
      return all[i].textContent!.trim();
    }
  }
  return '';
}

function getFirstElement(parent: Element | Document | null, tagName: string): Element | null {
  if (!parent) return null;
  const els = parent.getElementsByTagName(tagName);
  if (els && els.length > 0) return els[0];
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const local = all[i].localName || all[i].tagName.split(':').pop();
    if (local === tagName) return all[i];
  }
  return null;
}

function getAllElements(parent: Element | Document | null, tagName: string): Element[] {
  if (!parent) return [];
  const els = parent.getElementsByTagName(tagName);
  if (els && els.length > 0) return Array.from(els);
  const result: Element[] = [];
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const local = all[i].localName || all[i].tagName.split(':').pop();
    if (local === tagName) result.push(all[i]);
  }
  return result;
}

import { formatCnpjCpf } from '../shared/utils/formatters';

export function formatarDocFiscal(val: string): string {
  return formatCnpjCpf(val);
}

export function formatarCep(cep: string): string {
  const c = (cep || '').replace(/\D/g, '');
  if (c.length === 8) {
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  }
  return cep || '';
}

export function formatarFone(fone: string): string {
  const c = (fone || '').replace(/\D/g, '');
  if (c.length === 10) {
    return `(${c.slice(0, 2)}) ${c.slice(2, 6)}-${c.slice(6)}`;
  }
  if (c.length === 11) {
    return `(${c.slice(0, 2)}) ${c.slice(2, 7)}-${c.slice(7)}`;
  }
  return fone || '';
}

export function formatarDataHoraIso(iso: string): { data: string; hora: string; completo: string } {
  if (!iso) return { data: '', hora: '', completo: '' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) {
    const [y, m, d] = iso.trim().split('-');
    return { data: `${d}/${m}/${y}`, hora: '', completo: `${d}/${m}/${y}` };
  }
  try {
    const dObj = new Date(iso);
    if (!isNaN(dObj.getTime())) {
      const d = String(dObj.getDate()).padStart(2, '0');
      const m = String(dObj.getMonth() + 1).padStart(2, '0');
      const y = dObj.getFullYear();
      const hh = String(dObj.getHours()).padStart(2, '0');
      const mm = String(dObj.getMinutes()).padStart(2, '0');
      const ss = String(dObj.getSeconds()).padStart(2, '0');
      return {
        data: `${d}/${m}/${y}`,
        hora: `${hh}:${mm}:${ss}`,
        completo: `${d}/${m}/${y} ${hh}:${mm}:${ss}`
      };
    }
  } catch {}
  return { data: iso.slice(0, 10), hora: '', completo: iso };
}

export function formatarNumeroNfe(nNF: string): string {
  const num = (nNF || '0').replace(/\D/g, '').padStart(9, '0');
  return `${num.slice(0, 3)}.${num.slice(3, 6)}.${num.slice(6, 9)}`;
}

const MAPA_MOD_FRETE: Record<string, string> = {
  '0': '0 - Remetente (CIF)',
  '1': '1 - Destinatário (FOB)',
  '2': '2 - Terceiros',
  '3': '3 - Próprio p/ Remetente',
  '4': '4 - Próprio p/ Destinatário',
  '9': '9 - Sem Ocorrência de Transporte'
};

const MAPA_TP_PAG: Record<string, string> = {
  '01': 'Dinheiro',
  '02': 'Cheque',
  '03': 'Cartão de Crédito',
  '04': 'Cartão de Débito',
  '05': 'Crédito Loja',
  '10': 'Vale Alimentação',
  '11': 'Vale Refeição',
  '12': 'Vale Presente',
  '13': 'Vale Combustível',
  '14': 'Duplicata Mercantil',
  '15': 'Boleto Bancário',
  '16': 'Depósito Bancário',
  '17': 'PIX',
  '18': 'Transferência Bancária',
  '19': 'Programa de Fidelidade',
  '90': 'Sem Pagamento',
  '99': 'Outros'
};

/**
 * Extrai todos os campos oficiais do XML da NF-e para renderização do DANFE Padrão Nacional
 */
export function extrairDadosDanfeOficial(doc: DocumentoFiscalArmazenado): DadosDanfeOficial {
  const xml = doc.xml || '';
  let xmlDoc: Document | null = null;

  if (xml && typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      xmlDoc = parser.parseFromString(xml, 'text/xml');
    } catch {}
  }

  const infNFe = getFirstElement(xmlDoc, 'infNFe');
  const ide = getFirstElement(infNFe || xmlDoc, 'ide');
  const emit = getFirstElement(infNFe || xmlDoc, 'emit');
  const enderEmit = getFirstElement(emit, 'enderEmit');
  const dest = getFirstElement(infNFe || xmlDoc, 'dest');
  const enderDest = getFirstElement(dest, 'enderDest');
  const cobr = getFirstElement(infNFe || xmlDoc, 'cobr');
  const fat = getFirstElement(cobr, 'fat');
  const pag = getFirstElement(infNFe || xmlDoc, 'pag');
  const total = getFirstElement(infNFe || xmlDoc, 'total');
  const icmsTot = getFirstElement(total, 'ICMSTot');
  const transp = getFirstElement(infNFe || xmlDoc, 'transp');
  const transporta = getFirstElement(transp, 'transporta');
  const veicTransp = getFirstElement(transp, 'veicTransp');
  const vol = getFirstElement(transp, 'vol');
  const infAdic = getFirstElement(infNFe || xmlDoc, 'infAdic');
  const infProt = getFirstElement(xmlDoc, 'infProt');

  const isNfeCompleta = Boolean(infNFe && emit && getAllElements(infNFe, 'det').length > 0);

  const cleanChave = (
    getTagText(infProt, 'chNFe') ||
    (infNFe?.getAttribute('Id') || '').replace(/^NFe/i, '') ||
    doc.chave ||
    ''
  ).replace(/\D/g, '');

  const chaveFormatada = cleanChave
    ? cleanChave.replace(/(\d{4})/g, '$1 ').trim()
    : 'CHAVE NÃO DISPONÍVEL';

  const nNF = getTagText(ide, 'nNF') || doc.nNF || '0';
  const serie = getTagText(ide, 'serie') || doc.serie || '1';
  const tpNFXml = getTagText(ide, 'tpNF');
  const tpNF: '0' | '1' = tpNFXml === '0' || tpNFXml === '1'
    ? tpNFXml
    : (doc.tipoOperacao === 'ENTRADA' ? '0' : '1');

  const dhEmiRaw = getTagText(ide, 'dhEmi') || getTagText(ide, 'dEmi') || doc.dataEmissao || '';
  const dhSaiEntRaw = getTagText(ide, 'dhSaiEnt') || getTagText(ide, 'dSaiEnt') || '';
  const emiFmt = formatarDataHoraIso(dhEmiRaw);
  const saiFmt = formatarDataHoraIso(dhSaiEntRaw);

  const nProt = getTagText(infProt, 'nProt') || getTagText(xmlDoc, 'nProt') || '';
  const dhRecbtoRaw = getTagText(infProt, 'dhRecbto') || getTagText(xmlDoc, 'dhRecbto') || '';
  const recbtoFmt = formatarDataHoraIso(dhRecbtoRaw);

  const duplicatas: DanfeDuplicata[] = getAllElements(cobr, 'dup').map(dupEl => ({
    nDup: getTagText(dupEl, 'nDup'),
    dVenc: formatarDataHoraIso(getTagText(dupEl, 'dVenc')).data,
    vDup: parseFloat(getTagText(dupEl, 'vDup')) || 0
  }));

  const detPagEl = getFirstElement(pag, 'detPag');
  const tPagCode = getTagText(detPagEl, 'tPag');
  const vPagVal = parseFloat(getTagText(detPagEl, 'vPag')) || 0;
  const formaPagStr = tPagCode
    ? `${MAPA_TP_PAG[tPagCode] || `Cód. ${tPagCode}`}${vPagVal > 0 ? ` (${vPagVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : ''}`
    : '';

  const detElements = getAllElements(infNFe, 'det');
  const itens: DanfeItemProduto[] = detElements.map((detEl, index) => {
    const prod = getFirstElement(detEl, 'prod');
    const imposto = getFirstElement(detEl, 'imposto');
    const icmsGroup = getFirstElement(imposto, 'ICMS');
    const ipiGroup = getFirstElement(imposto, 'IPI');

    const orig = getTagText(icmsGroup, 'orig') || '0';
    const cst = getTagText(icmsGroup, 'CST');
    const csosn = getTagText(icmsGroup, 'CSOSN');
    const cstCsosn = csosn ? `${orig}${csosn}` : cst ? `${orig}${cst}` : orig;

    const vBC = parseFloat(getTagText(icmsGroup, 'vBC')) || 0;
    const pICMS = parseFloat(getTagText(icmsGroup, 'pICMS')) || 0;
    const vICMS = parseFloat(getTagText(icmsGroup, 'vICMS')) || 0;

    const vIPI = parseFloat(getTagText(ipiGroup, 'vIPI')) || 0;
    const pIPI = parseFloat(getTagText(ipiGroup, 'pIPI')) || 0;

    return {
      nItem: detEl.getAttribute('nItem') || String(index + 1),
      cProd: getTagText(prod, 'cProd'),
      cEAN: getTagText(prod, 'cEAN'),
      xProd: getTagText(prod, 'xProd'),
      infAdProd: getTagText(detEl, 'infAdProd'),
      ncm: getTagText(prod, 'NCM'),
      cest: getTagText(prod, 'CEST'),
      cstCsosn,
      cfop: getTagText(prod, 'CFOP'),
      uCom: getTagText(prod, 'uCom'),
      qCom: parseFloat(getTagText(prod, 'qCom')) || 0,
      vUnCom: parseFloat(getTagText(prod, 'vUnCom')) || 0,
      vProd: parseFloat(getTagText(prod, 'vProd')) || 0,
      vDesc: parseFloat(getTagText(prod, 'vDesc')) || 0,
      vBC,
      vICMS,
      vIPI,
      pICMS,
      pIPI
    };
  });

  const modFrete = getTagText(transp, 'modFrete') || '9';
  const vNFXml = parseFloat(getTagText(icmsTot, 'vNF') || getTagText(xmlDoc, 'vNF')) || doc.valorTotal || 0;
  const vProdXml = parseFloat(getTagText(icmsTot, 'vProd')) || (isNfeCompleta ? 0 : vNFXml);

  return {
    isNfeCompleta,
    chave: cleanChave,
    chaveFormatada,
    nNF,
    nNFFormatado: formatarNumeroNfe(nNF),
    serie,
    tpNF,
    natOp: getTagText(ide, 'natOp') || (isNfeCompleta ? '' : 'RESUMO DE NF-E (AGUARDANDO LIBERAÇÃO DO XML COMPLETO NA SEFAZ)'),
    dhEmi: dhEmiRaw,
    dataEmissao: emiFmt.data || doc.dataGeracaoFormatada.split(' ')[0],
    horaEmissao: emiFmt.hora || doc.dataGeracaoFormatada.split(' ')[1] || '',
    dataSaidaEntrada: saiFmt.data || emiFmt.data || '',
    horaSaidaEntrada: saiFmt.hora || '',
    protocolo: nProt ? `${nProt}${recbtoFmt.completo ? ` - ${recbtoFmt.completo}` : ''}` : 'Consulte autenticidade no Portal Nacional',
    dhRecbto: recbtoFmt.completo,
    situacao: doc.situacao,
    isCancelada: doc.situacao === 'CANCELADA',

    emitente: {
      razaoSocial: getTagText(emit, 'xNome') || getTagText(xmlDoc, 'xNome') || doc.emitenteNome || '',
      nomeFantasia: getTagText(emit, 'xFant') || '',
      cnpjCpf: formatarDocFiscal(getTagText(emit, 'CNPJ') || getTagText(emit, 'CPF') || doc.emitenteCnpj || ''),
      ie: getTagText(emit, 'IE') || getTagText(xmlDoc, 'IE') || '',
      ieSt: getTagText(emit, 'IEST') || '',
      im: getTagText(emit, 'IM') || '',
      crt: getTagText(emit, 'CRT') || '',
      logradouro: getTagText(enderEmit, 'xLgr') || '',
      numero: getTagText(enderEmit, 'nro') || '',
      complemento: getTagText(enderEmit, 'xCpl') || '',
      bairro: getTagText(enderEmit, 'xBairro') || '',
      municipio: getTagText(enderEmit, 'xMun') || '',
      uf: getTagText(enderEmit, 'UF') || '',
      cep: formatarCep(getTagText(enderEmit, 'CEP')),
      fone: formatarFone(getTagText(enderEmit, 'fone'))
    },

    destinatario: {
      razaoSocial: getTagText(dest, 'xNome') || doc.destinatarioNome || doc.empresaRazaoSocial || '',
      cnpjCpf: formatarDocFiscal(getTagText(dest, 'CNPJ') || getTagText(dest, 'CPF') || doc.destinatarioCnpj || doc.empresaCnpj || ''),
      ie: getTagText(dest, 'IE') || '',
      logradouro: getTagText(enderDest, 'xLgr') || '',
      numero: getTagText(enderDest, 'nro') || '',
      complemento: getTagText(enderDest, 'xCpl') || '',
      bairro: getTagText(enderDest, 'xBairro') || '',
      municipio: getTagText(enderDest, 'xMun') || '',
      uf: getTagText(enderDest, 'UF') || '',
      cep: formatarCep(getTagText(enderDest, 'CEP')),
      fone: formatarFone(getTagText(enderDest, 'fone'))
    },

    fatura: {
      nFat: getTagText(fat, 'nFat'),
      vOrig: parseFloat(getTagText(fat, 'vOrig')) || 0,
      vDesc: parseFloat(getTagText(fat, 'vDesc')) || 0,
      vLiq: parseFloat(getTagText(fat, 'vLiq')) || 0,
      formaPagamento: formaPagStr
    },
    duplicatas,

    impostos: {
      vBC: parseFloat(getTagText(icmsTot, 'vBC')) || 0,
      vICMS: parseFloat(getTagText(icmsTot, 'vICMS')) || 0,
      vBCST: parseFloat(getTagText(icmsTot, 'vBCST')) || 0,
      vST: parseFloat(getTagText(icmsTot, 'vST')) || 0,
      vProd: vProdXml,
      vFrete: parseFloat(getTagText(icmsTot, 'vFrete')) || 0,
      vSeg: parseFloat(getTagText(icmsTot, 'vSeg')) || 0,
      vDesc: parseFloat(getTagText(icmsTot, 'vDesc')) || 0,
      vII: parseFloat(getTagText(icmsTot, 'vII')) || 0,
      vIPI: parseFloat(getTagText(icmsTot, 'vIPI')) || 0,
      vPIS: parseFloat(getTagText(icmsTot, 'vPIS')) || 0,
      vCOFINS: parseFloat(getTagText(icmsTot, 'vCOFINS')) || 0,
      vOutro: parseFloat(getTagText(icmsTot, 'vOutro')) || 0,
      vNF: vNFXml,
      vTotTrib: parseFloat(getTagText(icmsTot, 'vTotTrib')) || 0
    },

    transporte: {
      modFrete,
      modFreteDescricao: MAPA_MOD_FRETE[modFrete] || modFrete,
      razaoSocial: getTagText(transporta, 'xNome'),
      cnpjCpf: formatarDocFiscal(getTagText(transporta, 'CNPJ') || getTagText(transporta, 'CPF')),
      ie: getTagText(transporta, 'IE'),
      endereco: getTagText(transporta, 'xEnder'),
      municipio: getTagText(transporta, 'xMun'),
      uf: getTagText(transporta, 'UF'),
      placa: getTagText(veicTransp, 'placa'),
      ufVeiculo: getTagText(veicTransp, 'UF'),
      rntc: getTagText(veicTransp, 'RNTC'),
      qVol: getTagText(vol, 'qVol'),
      esp: getTagText(vol, 'esp'),
      marca: getTagText(vol, 'marca'),
      nVol: getTagText(vol, 'nVol'),
      pesoB: parseFloat(getTagText(vol, 'pesoB')) || 0,
      pesoL: parseFloat(getTagText(vol, 'pesoL')) || 0
    },

    itens,
    infCpl: getTagText(infAdic, 'infCpl'),
    infAdFisco: getTagText(infAdic, 'infAdFisco')
  };
}
