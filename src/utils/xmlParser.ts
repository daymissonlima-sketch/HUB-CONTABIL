/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NFeItemRow } from '../types';
import { sanitizeXmlPayload } from './sanitizer';
import { 
  resolveOriginRegion, 
  getDecreto29560TaxRate, 
  calculateDecreto29560ST,
  isSimplesNacionalSupplier,
  isImportedGoods4Pct,
  calculateDecreto29560TaxRate
} from './decreto29560Helper';

// Helper to safely get node text content by tag name
function getTagValue(parent: Element, tagName: string): string {
  const el = parent.getElementsByTagName(tagName)[0];
  return el ? el.textContent || '' : '';
}

// Helper to recursively search for a tag and extract its value (for deep nested nodes)
function getDeepTagValue(parent: Element, tagNames: string[]): string {
  let current: Element | null = parent;
  for (const tag of tagNames) {
    if (!current) break;
    const next = current.getElementsByTagName(tag)[0];
    if (next) {
      current = next;
    } else {
      current = null;
    }
  }
  return current ? current.textContent || '' : '';
}

// Helper to parse float values safely
function parseFloatValue(parent: Element, tagName: string): number {
  const val = getTagValue(parent, tagName);
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

// Helper to look for CST or CSOSN inside nested elements
function getCstOrCsosn(impostoEl: Element, parentTag: string): string {
  const parent = impostoEl.getElementsByTagName(parentTag)[0];
  if (!parent) return '';
  
  // Try CST first
  const cst = getTagValue(parent, 'CST');
  if (cst) return cst;
  
  // Try CSOSN
  const csosn = getTagValue(parent, 'CSOSN');
  if (csosn) return csosn;
  
  // Look into any nested children
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const nestedCst = getTagValue(child, 'CST') || getTagValue(child, 'CSOSN');
    if (nestedCst) return nestedCst;
  }
  
  return '';
}

export async function parseNfeXml(xmlText: string, simulateIbsCbs: boolean = true, ibsRate: number = 17.7, cbsRate: number = 8.8): Promise<NFeItemRow[]> {
  const cleanXml = sanitizeXmlPayload(xmlText);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(cleanXml, 'text/xml');
  
  // Check for parser errors
  const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error('Erro ao processar o arquivo XML. Certifique-se de que é um documento XML de NFe válido.');
  }

  const infNfeList = xmlDoc.getElementsByTagName('infNFe');
  if (infNfeList.length === 0) {
    throw new Error('Nenhuma tag <infNFe> encontrada no arquivo XML. Este pode não ser um XML de NFe válido.');
  }

  const infNfe = infNfeList[0];
  
  // Extract Chave de Acesso (from Id attribute of infNFe, e.g. Id="NFe351911...")
  let chNFe = infNfe.getAttribute('Id') || '';
  if (chNFe.startsWith('NFe')) {
    chNFe = chNFe.substring(3);
  }
  // Alternate way: look under protNFe -> infProt -> chNFe
  if (!chNFe) {
    chNFe = getTagValue(xmlDoc.documentElement, 'chNFe');
  }

  // Header Details
  const ide = infNfe.getElementsByTagName('ide')[0];
  const nNF = ide ? getTagValue(ide, 'nNF') : '';
  const serie = ide ? getTagValue(ide, 'serie') : '';
  const modelo = ide ? (getTagValue(ide, 'mod') || '55') : '55';
  
  // Format issue date (dhEmi or dEmi)
  let rawDate = ide ? (getTagValue(ide, 'dhEmi') || getTagValue(ide, 'dEmi')) : '';
  let dhEmi = 'N/A';
  if (rawDate) {
    try {
      // Typically: 2023-10-25T14:30:00-03:00 or 2023-10-25
      const parts = rawDate.split('T')[0].split('-');
      if (parts.length === 3) {
        dhEmi = `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else {
        dhEmi = rawDate;
      }
    } catch (e) {
      dhEmi = rawDate;
    }
  }

  // Emitente Info
  const emit = infNfe.getElementsByTagName('emit')[0];
  const emitCNPJ = emit ? (getTagValue(emit, 'CNPJ') || getTagValue(emit, 'CPF')) : '';
  const emitNome = emit ? getTagValue(emit, 'xNome') : '';
  const crt = emit ? getTagValue(emit, 'CRT') : '';
  const enderEmit = emit ? emit.getElementsByTagName('enderEmit')[0] : null;
  const emitUF = enderEmit ? getTagValue(enderEmit, 'UF') : (getTagValue(xmlDoc.documentElement, 'UF') || '');

  // Destinatário Info
  const dest = infNfe.getElementsByTagName('dest')[0];
  const destCNPJ = dest ? (getTagValue(dest, 'CNPJ') || getTagValue(dest, 'CPF')) : '';
  const destNome = dest ? getTagValue(dest, 'xNome') : '';
  const enderDest = dest ? dest.getElementsByTagName('enderDest')[0] : null;
  const destUF = enderDest ? getTagValue(enderDest, 'UF') : 'CE';

  // Global complementary / fiscal info
  const infAdicEl = infNfe.getElementsByTagName('infAdic')[0];
  const globalInfAdic = infAdicEl ? getTagValue(infAdicEl, 'infCpl') : '';
  const globalInfAdFisco = infAdicEl ? getTagValue(infAdicEl, 'infAdFisco') : '';

  const itemRows: NFeItemRow[] = [];
  const detList = infNfe.getElementsByTagName('det');

  for (let i = 0; i < detList.length; i++) {
    const det = detList[i];
    const nItem = det.getAttribute('nItem') || (i + 1).toString();
    
    // Product Details
    const prod = det.getElementsByTagName('prod')[0];
    if (!prod) continue;

    const cProd = getTagValue(prod, 'cProd');
    const xProd = getTagValue(prod, 'xProd');
    const NCM = getTagValue(prod, 'NCM');
    const CFOP = getTagValue(prod, 'CFOP');
    const uCom = getTagValue(prod, 'uCom');
    const qCom = parseFloatValue(prod, 'qCom');
    const vUnCom = parseFloatValue(prod, 'vUnCom');
    const vProd = parseFloatValue(prod, 'vProd');
    const vFrete = parseFloatValue(prod, 'vFrete');
    const vSeg = parseFloatValue(prod, 'vSeg');
    const vOutro = parseFloatValue(prod, 'vOutro');
    const vDesc = parseFloatValue(prod, 'vDesc');

    // Taxes
    const imposto = det.getElementsByTagName('imposto')[0];
    
    // ICMS & FECOP Default Values
    let cstICMS = '';
    let orig = '0';
    let vBC_ICMS = 0;
    let pICMS = 0;
    let vICMS = 0;
    let vBCST = 0;
    let pICMSST = 0;
    let vICMSST = 0;
    let vBCFCP = 0;
    let pFCP = 0;
    let vFCP = 0;
    let vBCFCPST = 0;
    let pFCPST = 0;
    let vFCPST = 0;

    if (imposto) {
      // Find the ICMS node
      const icmsNode = imposto.getElementsByTagName('ICMS')[0];
      if (icmsNode && icmsNode.children.length > 0) {
        const icmsDetail = icmsNode.children[0]; // e.g. ICMS00, ICMS10, ICMS20, ICMS60, ICMSSN102
        cstICMS = getTagValue(icmsDetail, 'CST') || getTagValue(icmsDetail, 'CSOSN') || '';
        orig = getTagValue(icmsDetail, 'orig') || '0';
        vBC_ICMS = parseFloatValue(icmsDetail, 'vBC');
        pICMS = parseFloatValue(icmsDetail, 'pICMS');
        vICMS = parseFloatValue(icmsDetail, 'vICMS');
        vBCST = parseFloatValue(icmsDetail, 'vBCST') || parseFloatValue(icmsDetail, 'vBCSTRet');
        pICMSST = parseFloatValue(icmsDetail, 'pICMSST') || parseFloatValue(icmsDetail, 'pST');
        vICMSST = parseFloatValue(icmsDetail, 'vICMSST') || parseFloatValue(icmsDetail, 'vICMSSTRet');

        // FECOP / FCP (Fundo de Combate à Pobreza) Normal e ST
        vBCFCP = parseFloatValue(icmsDetail, 'vBCFCP');
        pFCP = parseFloatValue(icmsDetail, 'pFCP');
        vFCP = parseFloatValue(icmsDetail, 'vFCP');
        vBCFCPST = parseFloatValue(icmsDetail, 'vBCFCPST') || parseFloatValue(icmsDetail, 'vBCFCPSTRet');
        pFCPST = parseFloatValue(icmsDetail, 'pFCPST') || parseFloatValue(icmsDetail, 'pFCPSTRet');
        vFCPST = parseFloatValue(icmsDetail, 'vFCPST') || parseFloatValue(icmsDetail, 'vFCPSTRet');
      }

      // If CST/CSOSN is empty, look deeper
      if (!cstICMS && icmsNode) {
        cstICMS = getCstOrCsosn(imposto, 'ICMS');
      }
    }

    // PIS Default Values
    let cstPIS = '';
    let vBC_PIS = 0;
    let pPIS = 0;
    let vPIS = 0;

    if (imposto) {
      const pisNode = imposto.getElementsByTagName('PIS')[0];
      if (pisNode && pisNode.children.length > 0) {
        const pisDetail = pisNode.children[0];
        cstPIS = getTagValue(pisDetail, 'CST');
        vBC_PIS = parseFloatValue(pisDetail, 'vBC');
        pPIS = parseFloatValue(pisDetail, 'pPIS');
        vPIS = parseFloatValue(pisDetail, 'vPIS');
      }
    }

    // COFINS Default Values
    let cstCOFINS = '';
    let vBC_COFINS = 0;
    let pCOFINS = 0;
    let vCOFINS = 0;

    if (imposto) {
      const cofinsNode = imposto.getElementsByTagName('COFINS')[0];
      if (cofinsNode && cofinsNode.children.length > 0) {
        const cofinsDetail = cofinsNode.children[0];
        cstCOFINS = getTagValue(cofinsDetail, 'CST');
        vBC_COFINS = parseFloatValue(cofinsDetail, 'vBC');
        pCOFINS = parseFloatValue(cofinsDetail, 'pCOFINS');
        vCOFINS = parseFloatValue(cofinsDetail, 'vCOFINS');
      }
    }

    // IPI Default Values
    let cstIPI = '';
    let vBC_IPI = 0;
    let pIPI = 0;
    let vIPI = 0;

    if (imposto) {
      const ipiNode = imposto.getElementsByTagName('IPI')[0];
      if (ipiNode && ipiNode.children.length > 0) {
        const ipiDetail = ipiNode.getElementsByTagName('IPITrib')[0] || ipiNode.children[0];
        cstIPI = getTagValue(ipiDetail, 'CST') || '';
        vBC_IPI = parseFloatValue(ipiDetail, 'vBC');
        pIPI = parseFloatValue(ipiDetail, 'pIPI');
        vIPI = parseFloatValue(ipiDetail, 'vIPI') || parseFloatValue(ipiNode, 'vIPI');
      }
    }

    // Parse New IBS/CBS Tax Reform tags if they exist in XML
    let cClassTrib = '';
    let cstIBS = '';
    let cstCBS = '';
    let vBC_IBS = 0;
    let pIBS = 0;
    let vIBS = 0;
    let vBC_CBS = 0;
    let pCBS = 0;
    let vCBS = 0;

    let pIBSUF = 0;
    let vIBSUF = 0;
    let pIBSMun = 0;
    let vIBSMun = 0;

    if (imposto) {
      // 1. Try parsing user's new consolidated <IBSCBS> tag structure
      const ibsCbsNode = imposto.getElementsByTagName('IBSCBS')[0];
      if (ibsCbsNode) {
        // CST
        const commonCst = getTagValue(ibsCbsNode, 'CST');
        cstIBS = commonCst;
        cstCBS = commonCst;
        
        cClassTrib = getTagValue(ibsCbsNode, 'cClassTrib');
        
        const gIbsCbsNode = ibsCbsNode.getElementsByTagName('gIBSCBS')[0];
        if (gIbsCbsNode) {
          const vBcVal = parseFloatValue(gIbsCbsNode, 'vBC');
          vBC_IBS = vBcVal;
          vBC_CBS = vBcVal;
          
          vIBS = parseFloatValue(gIbsCbsNode, 'vIBS');
          
          // State part of IBS
          const gIbsUfNode = gIbsCbsNode.getElementsByTagName('gIBSUF')[0];
          if (gIbsUfNode) {
            pIBSUF = parseFloatValue(gIbsUfNode, 'pIBSUF');
            vIBSUF = parseFloatValue(gIbsUfNode, 'vIBSUF');
          }
          
          // Municipal part of IBS
          const gIbsMunNode = gIbsCbsNode.getElementsByTagName('gIBSMun')[0];
          if (gIbsMunNode) {
            pIBSMun = parseFloatValue(gIbsMunNode, 'pIBSMun');
            vIBSMun = parseFloatValue(gIbsMunNode, 'vIBSMun');
          }
          
          // Total IBS rate is pIBSUF + pIBSMun
          pIBS = pIBSUF + pIBSMun;
          
          // CBS part
          const gCbsNode = gIbsCbsNode.getElementsByTagName('gCBS')[0];
          if (gCbsNode) {
            pCBS = parseFloatValue(gCbsNode, 'pCBS');
            vCBS = parseFloatValue(gCbsNode, 'vCBS');
          }
        }
      } else {
        // 2. Fallback to separate <IBS> and <CBS> tags if present
        const ibsNode = imposto.getElementsByTagName('IBS')[0];
        if (ibsNode) {
          cstIBS = getTagValue(ibsNode, 'CST') || getTagValue(ibsNode, 'cstIBS') || '';
          vBC_IBS = parseFloatValue(ibsNode, 'vBC') || parseFloatValue(ibsNode, 'vBC_IBS');
          pIBS = parseFloatValue(ibsNode, 'pIBS');
          vIBS = parseFloatValue(ibsNode, 'vIBS');
        }

        const cbsNode = imposto.getElementsByTagName('CBS')[0];
        if (cbsNode) {
          cstCBS = getTagValue(cbsNode, 'CST') || getTagValue(cbsNode, 'cstCBS') || '';
          vBC_CBS = parseFloatValue(cbsNode, 'vBC') || parseFloatValue(cbsNode, 'vBC_CBS');
          pCBS = parseFloatValue(cbsNode, 'pCBS');
          vCBS = parseFloatValue(cbsNode, 'vCBS');
        }

        cClassTrib = getTagValue(imposto, 'cClassTrib') || getTagValue(prod, 'cClassTrib') || getTagValue(det, 'cClassTrib');
      }
    }

    // If simulating or IBS/CBS not found in XML, calculate estimated values
    if (simulateIbsCbs && (!cstIBS || !cstCBS)) {
      if (!cClassTrib) {
        cClassTrib = CFOP.startsWith('5') || CFOP.startsWith('6') ? '21' : '10';
      }
      
      if (!cstIBS) cstIBS = '10';
      if (!cstCBS) cstCBS = '10';

      if (vBC_IBS === 0) vBC_IBS = vProd;
      if (vBC_CBS === 0) vBC_CBS = vProd;

      if (pIBS === 0) pIBS = ibsRate;
      if (pCBS === 0) pCBS = cbsRate;

      pIBSUF = parseFloat((pIBS * 0.7).toFixed(4));
      pIBSMun = parseFloat((pIBS * 0.3).toFixed(4));

      if (vIBS === 0) vIBS = parseFloat(((vBC_IBS * pIBS) / 100).toFixed(2));
      if (vCBS === 0) vCBS = parseFloat(((vBC_CBS * pCBS) / 100).toFixed(2));

      vIBSUF = parseFloat(((vBC_IBS * pIBSUF) / 100).toFixed(2));
      vIBSMun = parseFloat(((vBC_IBS * pIBSMun) / 100).toFixed(2));
    }

    // Calculate Decreto 29.560 (RET 2024 - Termo de Acordo Atacadista)
    // 1. Identificar se o fornecedor é optante pelo Simples Nacional
    const isSimplesNacional = isSimplesNacionalSupplier(emitNome, crt, cstICMS);

    // 2. Identificar se é operação interestadual
    const isInterstate = CFOP.startsWith('2') || CFOP.startsWith('6') || (emitUF !== '' && emitUF !== destUF);

    // 3. Identificar se é produto de origem estrangeira com alíquota interestadual de 4% (Res. 13/2012)
    const isImportado4Pct = isImportedGoods4Pct(orig, pICMS, isInterstate);

    // 4. Resolver a região geográfica da operação
    const originRegion = resolveOriginRegion(emitUF, destUF);

    // 5. Apurar alíquota líquida considerando base e acréscimos legais do Decreto 29.560/08
    const rateCalc = calculateDecreto29560TaxRate({
      region: originRegion,
      internalRate: 20, // Alíquota geral interna no Ceará
      isSimplesNacional,
      isImportado4Pct
    });

    const pICMSST_29560 = rateCalc.finalRate;
    const { vBC_ST_29560, vICMSST_29560 } = calculateDecreto29560ST(
      vProd,
      vIPI,
      vFrete,
      vSeg,
      vOutro,
      vDesc,
      pICMSST_29560
    );

    // Add row
    itemRows.push({
      id: `${chNFe}_${nItem}`,
      chNFe,
      nNF,
      serie,
      modelo,
      dhEmi,
      emitCNPJ: formatCNPJorCPF(emitCNPJ),
      emitNome,
      destCNPJ: formatCNPJorCPF(destCNPJ),
      destNome,
      emitUF,
      destUF,
      crt,
      
      nItem,
      cProd,
      xProd,
      NCM,
      CFOP,
      uCom,
      qCom,
      vUnCom,
      vProd,
      orig,
      vFrete,
      vSeg,
      vOutro,
      vDesc,
      
      cstICMS,
      vBC_ICMS,
      pICMS,
      vICMS,
      vBCST,
      pICMSST,
      vICMSST,

      vBC_ST_29560,
      pICMSST_29560,
      vICMSST_29560,
      regraDecreto29560: rateCalc.descricaoRegra,
      isSimplesNacional,
      isImportado4Pct,
      vBCFCP,
      pFCP,
      vFCP,
      vBCFCPST,
      pFCPST,
      vFCPST,
      
      cstIPI,
      vBC_IPI,
      pIPI,
      vIPI,
      
      cstPIS,
      vBC_PIS,
      pPIS,
      vPIS,
      cstCOFINS,
      vBC_COFINS,
      pCOFINS,
      vCOFINS,
      
      cClassTrib,
      cstIBS,
      cstCBS,
      vBC_IBS,
      pIBS,
      vIBS,
      vBC_CBS,
      pCBS,
      vCBS,
      
      pIBSUF,
      vIBSUF,
      pIBSMun,
      vIBSMun,
      
      infAdic: globalInfAdic,
      infAdFisco: globalInfAdFisco,
    });
  }

  return itemRows;
}

// Utility to format CNPJ or CPF cleanly
function formatCNPJorCPF(val: string): string {
  const digits = val.replace(/\D/g, '');
  if (digits.length === 14) {
    return `${digits.substring(0, 2)}.${digits.substring(2, 5)}.${digits.substring(5, 8)}/${digits.substring(8, 12)}-${digits.substring(12, 14)}`;
  } else if (digits.length === 11) {
    return `${digits.substring(0, 3)}.${digits.substring(3, 6)}.${digits.substring(6, 9)}-${digits.substring(9, 11)}`;
  }
  return val;
}
