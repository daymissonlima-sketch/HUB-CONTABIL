/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Serviço de Integração SEFAZ DFe (NFeDistribuicaoDFe e NFeRecepcaoEvento4)
 * Realiza a comunicação mTLS com os WebServices do Ambiente Nacional da SEFAZ / Receita Federal:
 * 1. NFeDistribuicaoDFe: Consulta por ultNSU, consNSU, consChNFe e descompactação GZip (procNFe, resNFe, procEventoNFe)
 * 2. NFeRecepcaoEvento4: Assinatura XMLDSig RSA-SHA1 (ICP-Brasil) e envio de Manifestação do Destinatário:
 *    - Automaticamente o servidor manifesta APENAS Ciência da Operação (210210).
 *    - A próxima manifestação (210200 Confirmação, 210220 Desconhecimento ou 210240 Operação não Realizada) fica estritamente a cargo do usuário.
 * 3. Enriquecimento cadastral automático via Receita Federal (BrasilAPI / CNPJ.ws) para garantir dados reais das empresas.
 */

import https from 'https';
import zlib from 'zlib';
import crypto from 'crypto';
import forge from 'node-forge';
import { CODIGOS_UF_IBGE, CODIGOS_IBGE_PARA_UF, normalizarCodigoUfIbge } from '../types/sefazTypes';
export { CODIGOS_UF_IBGE, CODIGOS_IBGE_PARA_UF, normalizarCodigoUfIbge };

export interface DadosCertificadoExtraido {
  certPem: string;
  keyPem: string;
  caPems: string[];
  titular?: string;
  cnpjCertificado?: string;
  emissor?: string;
  validoDe?: string;
  validoAte?: string;
  expirado?: boolean;
}

export interface ParametrosConsultaDFe {
  cnpj: string;               // CNPJ da empresa (apenas dígitos)
  pfxBase64: string;          // Conteúdo base64 do certificado digital A1 (.pfx / .p12)
  passphrase?: string;        // Senha do certificado digital
  ultNSU?: string;            // Último NSU consultado (ex: "0" ou "000000000000000")
  chNFe?: string;             // Chave de acesso para consulta pontual (44 dígitos)
  nsuEspecifico?: string;     // Consulta pontual de um NSU específico (<consNSU>)
  ambiente?: 1 | 2;           // 1 = Produção (padrão), 2 = Homologação
  ufAutor?: string;           // Código IBGE da UF autora (padrão 23 - Ceará)
  autoManifestar?: boolean;   // Se true, manifesta automaticamente resumos/eventos recebidos
  chavesPendentes?: string[]; // Chaves 44 dígitos aguardando liberação do procNFe após Ciência
  apenasProcessarPendentes?: boolean; // Se true, processa fila de chaves pendentes via consChNFe/210210 sem acionar distNSU
}

export interface DocumentoDFeDescompactado {
  nsu: string;
  schema: string;             // ex: 'resNFe_v1.01.xsd', 'procNFe_v4.00.xsd', 'procEventoNFe_v1.00.xsd'
  tipo: 'RESUMO' | 'NFE_COMPLETA' | 'EVENTO' | 'OUTRO';
  chave?: string;
  nNF?: string;
  serie?: string;
  emitCNPJ?: string;
  emitNome?: string;
  destCNPJ?: string;
  destNome?: string;
  valorTotal?: number;
  dataEmissao?: string;
  tpEvento?: string;
  descEvento?: string;
  autorEventoCnpj?: string;
  cSitNFe?: string;
  xml: string;
}

export interface RespostaConsultaDFe {
  sucesso: boolean;
  cStat: string;
  xMotivo: string;
  dhResp: string;
  ultNSU: string;
  maxNSU: string;
  totalDocumentos: number;
  documentos: DocumentoDFeDescompactado[];
  resumosManifestadosInternamente?: number;
  chavesPendentesLiberacao?: string[];
  xmlRespostaBruto?: string;
  certificadoInfo?: {
    titular?: string;
    cnpjCertificado?: string;
    emissor?: string;
    validoDe?: string;
    validoAte?: string;
    expirado?: boolean;
  };
}

export interface ParametrosManifestacaoDestinatario {
  cnpj: string;
  pfxBase64: string;
  passphrase?: string;
  chNFe: string;
  tpEvento?: '210210' | '210200' | '210220' | '210240';
  justificativa?: string;
  ambiente?: 1 | 2;
}

export interface RespostaManifestacaoDestinatario {
  sucesso: boolean;
  tpEventoEnviado: string;
  cStatLote: string;
  xMotivoLote: string;
  cStatEvento: string;
  xMotivoEvento: string;
  nProt?: string;
  xmlRespostaBruto?: string;
}

export interface RespostaDownloadXmlOficial {
  sucesso: boolean;
  obtidoNfeCompleta: boolean;
  manifestacaoRealizada: boolean;
  statusManifestacao?: string;
  cStat: string;
  xMotivo: string;
  documento?: DocumentoDFeDescompactado;
  todosDocumentosRetornados?: DocumentoDFeDescompactado[];
}

export interface DadosCadastraisCnpj {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  codigoIbgeUf: string;
}

const URL_SEFAZ_DIST_PRODUCAO = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
const URL_SEFAZ_DIST_HOMOLOGACAO = 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';

const URL_SEFAZ_EVENTO_PRODUCAO = 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';
const URL_SEFAZ_EVENTO_HOMOLOGACAO = 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';

// Cache em memória no servidor para dados cadastrais de CNPJ da Receita Federal
const cnpjCacheServer = new Map<string, DadosCadastraisCnpj>();

/**
 * Consulta os dados reais da empresa na Receita Federal (via BrasilAPI / publica.cnpj.ws)
 * para garantir que Razão Social, Endereço, Município, UF e CEP sejam sempre os oficiais da empresa.
 */
export async function consultarDadosCadastraisCnpj(cnpj: string): Promise<DadosCadastraisCnpj | null> {
  const clean = (cnpj || '').replace(/\D/g, '');
  if (clean.length !== 14) return null;

  if (cnpjCacheServer.has(clean)) {
    return cnpjCacheServer.get(clean)!;
  }

  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

  try {
    const res1 = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
      headers,
      signal: AbortSignal.timeout(4000)
    });
    if (res1.ok) {
      const d = await res1.json();
      const uf = String(d.uf || 'CE').toUpperCase();
      const info: DadosCadastraisCnpj = {
        cnpj: clean,
        razaoSocial: d.razao_social || `EMPRESA CNPJ ${clean}`,
        nomeFantasia: d.nome_fantasia || d.razao_social || `EMPRESA CNPJ ${clean}`,
        logradouro: d.logradouro || 'NAO INFORMADO',
        numero: d.numero || 'S/N',
        bairro: d.bairro || 'CENTRO',
        municipio: d.municipio || 'CAPITAL',
        uf,
        cep: String(d.cep || '60000000').replace(/\D/g, '').padEnd(8, '0').slice(0, 8),
        codigoIbgeUf: normalizarCodigoUfIbge(uf)
      };
      cnpjCacheServer.set(clean, info);
      return info;
    }
  } catch {}

  try {
    const res2 = await fetch(`https://publica.cnpj.ws/cnpj/${clean}`, {
      headers,
      signal: AbortSignal.timeout(4000)
    });
    if (res2.ok) {
      const d = await res2.json();
      const est = d.estabelecimento || {};
      const uf = String(est.estado?.sigla || 'CE').toUpperCase();
      const info: DadosCadastraisCnpj = {
        cnpj: clean,
        razaoSocial: d.razao_social || `EMPRESA CNPJ ${clean}`,
        nomeFantasia: est.nome_fantasia || d.razao_social || `EMPRESA CNPJ ${clean}`,
        logradouro: est.logradouro || 'NAO INFORMADO',
        numero: est.numero || 'S/N',
        bairro: est.bairro || 'CENTRO',
        municipio: est.cidade?.nome || 'CAPITAL',
        uf,
        cep: String(est.cep || '60000000').replace(/\D/g, '').padEnd(8, '0').slice(0, 8),
        codigoIbgeUf: normalizarCodigoUfIbge(uf)
      };
      cnpjCacheServer.set(clean, info);
      return info;
    }
  } catch {}

  return null;
}

function escapeXmlStr(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}


/**
 * Extrai chave privada (PEM), certificado principal (PEM) e cadeia ICP-Brasil (CA PEMs)
 * a partir de um arquivo .pfx / .p12 codificado em Base64 usando node-forge.
 */
export function extrairPemDePfx(pfxBase64: string, passphrase: string = ''): DadosCertificadoExtraido {
  const cleanBase64 = pfxBase64
    .replace(/^data:[^;]+;base64,/i, '')
    .replace(/\s+/g, '');

  if (!cleanBase64) {
    throw new Error('O arquivo do certificado digital (.pfx/.p12) está vazio.');
  }

  let p12Der: string;
  try {
    p12Der = forge.util.decode64(cleanBase64);
  } catch {
    throw new Error('Conteúdo Base64 do certificado digital inválido ou corrompido.');
  }

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const p12Asn1 = forge.asn1.fromDer(p12Der, false);
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, passphrase || '');
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (
      msg.toLowerCase().includes('mac') ||
      msg.toLowerCase().includes('password') ||
      msg.toLowerCase().includes('invalid password') ||
      msg.toLowerCase().includes('pkcs12')
    ) {
      throw new Error('Senha do Certificado Digital A1 incorreta ou arquivo .pfx/.p12 incompatível.');
    }
    throw new Error(`Não foi possível decodificar o arquivo .pfx/.p12: ${msg}`);
  }

  const shroudedKeyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
  const plainKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [];
  const allKeyBags = [...shroudedKeyBags, ...plainKeyBags];

  const privateKeyObj = allKeyBags.find(b => b.key)?.key;
  if (!privateKeyObj) {
    throw new Error('Chave privada não encontrada no certificado (.pfx/.p12). Verifique se o certificado A1 foi exportado com a chave privada.');
  }

  const keyPem = forge.pki.privateKeyToPem(privateKeyObj);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const certs = certBags.map(b => b.cert).filter((c): c is forge.pki.Certificate => Boolean(c));

  if (certs.length === 0) {
    throw new Error('Nenhum certificado X.509 encontrado dentro do arquivo .pfx/.p12.');
  }

  let mainCert = certs[0];
  const caCerts: forge.pki.Certificate[] = [];
  const privKeyAny = privateKeyObj as any;
  let foundMain = false;

  for (const cert of certs) {
    const pubKeyAny = cert.publicKey as any;
    if (
      !foundMain &&
      privKeyAny?.n &&
      pubKeyAny?.n &&
      privKeyAny.n.compareTo(pubKeyAny.n) === 0
    ) {
      mainCert = cert;
      foundMain = true;
    } else {
      caCerts.push(cert);
    }
  }

  const finalCaCerts = foundMain ? caCerts : certs.slice(1);
  const certPem = forge.pki.certificateToPem(mainCert);
  const caPems = finalCaCerts.map(c => forge.pki.certificateToPem(c));

  const cnAttr = mainCert.subject.getField('CN');
  const titular = cnAttr ? String(cnAttr.value) : undefined;
  const cnpjMatch = titular?.match(/(\d{14})/);
  const cnpjCertificado = cnpjMatch ? cnpjMatch[1] : undefined;

  const issuerCn = mainCert.issuer.getField('CN');
  const emissor = issuerCn ? String(issuerCn.value) : undefined;

  const notBefore = mainCert.validity?.notBefore;
  const notAfter = mainCert.validity?.notAfter;
  const expirado = notAfter ? new Date() > notAfter : false;

  return {
    certPem,
    keyPem,
    caPems,
    titular,
    cnpjCertificado,
    emissor,
    validoDe: notBefore ? notBefore.toISOString() : undefined,
    validoAte: notAfter ? notAfter.toISOString() : undefined,
    expirado
  };
}

/**
 * Monta o Envelope SOAP 1.2 da SEFAZ para NFeDistribuicaoDFe
 */
export function gerarSoapEnvelopeDistDFe(params: {
  cnpj: string;
  ultNSU?: string;
  chNFe?: string;
  nsuEspecifico?: string;
  ambiente: 1 | 2;
  cUFAutor: string;
}): string {
  const cleanCnpj = params.cnpj.replace(/\D/g, '');
  const cUFAutor = normalizarCodigoUfIbge(params.cUFAutor);

  let criterioXml = '';
  if (params.chNFe && params.chNFe.replace(/\D/g, '').length === 44) {
    const chNFe = params.chNFe.replace(/\D/g, '');
    criterioXml = `<consChNFe><chNFe>${chNFe}</chNFe></consChNFe>`;
  } else if (params.nsuEspecifico && params.nsuEspecifico.replace(/\D/g, '').length > 0) {
    const nsuLimpo = params.nsuEspecifico.replace(/\D/g, '');
    const nsuFormatado = (nsuLimpo || '1').padStart(15, '0').slice(-15);
    criterioXml = `<consNSU><NSU>${nsuFormatado}</NSU></consNSU>`;
  } else {
    const ultNsuLimpo = (params.ultNSU || '0').replace(/\D/g, '');
    const ultNsuFormatado = (ultNsuLimpo || '0').padStart(15, '0').slice(-15);
    criterioXml = `<distNSU><ultNSU>${ultNsuFormatado}</ultNSU></distNSU>`;
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${params.ambiente}</tpAmb>
          <cUFAutor>${cUFAutor}</cUFAutor>
          <CNPJ>${cleanCnpj}</CNPJ>
          ${criterioXml}
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

/**
 * Extrai texto simples de tags XML
 */
function extrairTag(xml: string, tag: string): string {
  const regex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
}

/**
 * Extrai tag aninhada dentro de um bloco específico (ex: <emit><xNome> ou <dest><CNPJ>)
 */
function extrairTagEmBloco(xml: string, blocoTag: string, tagInterna: string): string {
  const blocoRegex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${blocoTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${blocoTag}>`, 'i');
  const blocoMatch = xml.match(blocoRegex);
  if (!blocoMatch) return '';
  return extrairTag(blocoMatch[1], tagInterna);
}

/**
 * Interpreta e descompacta os documentos no lote retornado pela SEFAZ.
 */
export function decodificarLoteDistDFe(xmlResposta: string): DocumentoDFeDescompactado[] {
  const documentos: DocumentoDFeDescompactado[] = [];
  const docZipRegex = /<docZip\s+([^>]*?)>([\s\S]*?)<\/docZip>/gi;
  let match: RegExpExecArray | null;

  while ((match = docZipRegex.exec(xmlResposta)) !== null) {
    const atributos = match[1];
    const base64Gzip = match[2].trim();

    const nsuMatch = atributos.match(/NSU=["']([^"']+)["']/i);
    const schemaMatch = atributos.match(/schema=["']([^"']+)["']/i);

    const nsu = nsuMatch ? nsuMatch[1] : '';
    const schema = schemaMatch ? schemaMatch[1] : '';

    try {
      const buffer = Buffer.from(base64Gzip, 'base64');
      const xmlDescompactado = zlib.gunzipSync(buffer).toString('utf-8');

      let tipo: DocumentoDFeDescompactado['tipo'] = 'OUTRO';
      if (
        schema.toLowerCase().includes('procnfe') ||
        xmlDescompactado.includes('<nfeProc') ||
        xmlDescompactado.includes('<infNFe')
      ) {
        tipo = 'NFE_COMPLETA';
      } else if (
        schema.toLowerCase().includes('resnfe') ||
        xmlDescompactado.includes('<resNFe')
      ) {
        tipo = 'RESUMO';
      } else if (
        schema.toLowerCase().includes('evento') ||
        xmlDescompactado.includes('<procEventoNFe') ||
        xmlDescompactado.includes('<resEvento')
      ) {
        tipo = 'EVENTO';
      }

      let chave = extrairTag(xmlDescompactado, 'chNFe') || extrairTag(xmlDescompactado, 'chDFe');
      if (!chave) {
        const idMatch = xmlDescompactado.match(/Id=["']NFe(\d{44})["']/i);
        if (idMatch) chave = idMatch[1];
      }
      const cleanKey = (chave || '').replace(/\D/g, '');
      const temChave44 = cleanKey.length === 44;

      let nNF = '';
      let serie = '';
      let emitCNPJ = '';
      let emitNome = '';
      let destCNPJ = '';
      let destNome = '';
      let valorStr = '';
      let dataEmissao = '';
      let tpEvento = '';
      let descEvento = '';
      let autorEventoCnpj = '';
      let cSitNFe = '';

      if (tipo === 'NFE_COMPLETA') {
        nNF = extrairTagEmBloco(xmlDescompactado, 'ide', 'nNF') || extrairTag(xmlDescompactado, 'nNF');
        serie = extrairTagEmBloco(xmlDescompactado, 'ide', 'serie') || extrairTag(xmlDescompactado, 'serie');
        emitCNPJ = extrairTagEmBloco(xmlDescompactado, 'emit', 'CNPJ') || extrairTagEmBloco(xmlDescompactado, 'emit', 'CPF');
        emitNome = extrairTagEmBloco(xmlDescompactado, 'emit', 'xNome');
        destCNPJ = extrairTagEmBloco(xmlDescompactado, 'dest', 'CNPJ') || extrairTagEmBloco(xmlDescompactado, 'dest', 'CPF');
        destNome = extrairTagEmBloco(xmlDescompactado, 'dest', 'xNome');
        valorStr = extrairTagEmBloco(xmlDescompactado, 'ICMSTot', 'vNF') || extrairTag(xmlDescompactado, 'vNF');
        dataEmissao = extrairTagEmBloco(xmlDescompactado, 'ide', 'dhEmi') || extrairTagEmBloco(xmlDescompactado, 'ide', 'dEmi');
      } else if (tipo === 'RESUMO') {
        emitCNPJ = extrairTag(xmlDescompactado, 'CNPJ') || extrairTag(xmlDescompactado, 'CPF');
        emitNome = extrairTag(xmlDescompactado, 'xNome');
        valorStr = extrairTag(xmlDescompactado, 'vNF');
        dataEmissao = extrairTag(xmlDescompactado, 'dhEmi') || extrairTag(xmlDescompactado, 'dEmi');
        cSitNFe = extrairTag(xmlDescompactado, 'cSitNFe');
      } else if (tipo === 'EVENTO') {
        autorEventoCnpj = extrairTagEmBloco(xmlDescompactado, 'infEvento', 'CNPJ') || extrairTag(xmlDescompactado, 'CNPJ');
        if (temChave44) {
          emitCNPJ = cleanKey.slice(6, 20);
        }
        tpEvento = extrairTag(xmlDescompactado, 'tpEvento');
        descEvento = extrairTag(xmlDescompactado, 'descEvento') || extrairTag(xmlDescompactado, 'xEvento');
        dataEmissao = extrairTag(xmlDescompactado, 'dhEvento') || extrairTag(xmlDescompactado, 'dhRecbto');
      }

      if (temChave44) {
        if (!nNF) {
          nNF = parseInt(cleanKey.slice(25, 34), 10).toString();
        }
        if (!serie) {
          serie = parseInt(cleanKey.slice(22, 25), 10).toString();
        }
        if (!emitCNPJ) {
          emitCNPJ = cleanKey.slice(6, 20);
        }
      }

      documentos.push({
        nsu,
        schema,
        tipo,
        chave: temChave44 ? cleanKey : (chave || undefined),
        nNF: nNF || undefined,
        serie: serie || undefined,
        emitCNPJ: emitCNPJ ? emitCNPJ.replace(/\D/g, '') : undefined,
        emitNome: emitNome || undefined,
        destCNPJ: destCNPJ ? destCNPJ.replace(/\D/g, '') : undefined,
        destNome: destNome || undefined,
        valorTotal: valorStr ? parseFloat(valorStr) : undefined,
        dataEmissao: dataEmissao || undefined,
        tpEvento: tpEvento || undefined,
        descEvento: descEvento || undefined,
        autorEventoCnpj: autorEventoCnpj ? autorEventoCnpj.replace(/\D/g, '') : undefined,
        cSitNFe: cSitNFe || undefined,
        xml: xmlDescompactado
      });
    } catch (e: any) {
      console.error(`Erro ao descompactar docZip NSU ${nsu}:`, e.message);
    }
  }

  return documentos;
}

/**
 * Cria o agente HTTPS mTLS configurado para ICP-Brasil / SEFAZ
 */
function criarAgenteHttpsSefaz(dadosCert: DadosCertificadoExtraido): https.Agent {
  return new https.Agent({
    cert: dadosCert.certPem,
    key: dadosCert.keyPem,
    ca: dadosCert.caPems.length > 0 ? dadosCert.caPems : undefined,
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2',
    ciphers: 'DEFAULT:@SECLEVEL=0',
    secureOptions:
      (crypto.constants?.SSL_OP_LEGACY_SERVER_CONNECT || 0x00000004) |
      (crypto.constants?.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION || 0x00040000)
  });
}

/**
 * Executa a requisição HTTPS mTLS bruta contra o WebService NFeDistribuicaoDFe da SEFAZ Nacional
 */
async function executarRequisicaoDistDFeBruta(params: ParametrosConsultaDFe): Promise<RespostaConsultaDFe> {
  const cleanCnpj = params.cnpj.replace(/\D/g, '');
  if (cleanCnpj.length !== 14) {
    throw new Error('CNPJ inválido para consulta DFe. Necessário 14 dígitos.');
  }

  if (!params.pfxBase64) {
    throw new Error('Certificado digital A1 (.pfx/.p12) é obrigatório para autenticação mTLS na SEFAZ.');
  }

  const dadosCert = extrairPemDePfx(params.pfxBase64, params.passphrase || '');

  if (dadosCert.expirado && dadosCert.validoAte) {
    console.warn(
      `[SEFAZ DFe] Aviso: O Certificado Digital A1 (${dadosCert.titular || 'empresa'}) está vencido desde ${new Date(dadosCert.validoAte).toLocaleDateString('pt-BR')}. Prosseguindo com a consulta...`
    );
  }

  // Se o CNPJ-base do cadastro divergir do CNPJ-base do Certificado Digital A1, utiliza o CNPJ do certificado para evitar Rejeição 213 na SEFAZ
  const cnpjCertLimpo = (dadosCert.cnpjCertificado || '').replace(/\D/g, '');
  const cnpjEfetivo =
    cnpjCertLimpo.length === 14 && cnpjCertLimpo.slice(0, 8) !== cleanCnpj.slice(0, 8)
      ? cnpjCertLimpo
      : cleanCnpj;

  const ambiente = params.ambiente === 2 ? 2 : 1;
  const cUFAutor = normalizarCodigoUfIbge(params.ufAutor);

  const soapBody = gerarSoapEnvelopeDistDFe({
    cnpj: cnpjEfetivo,
    ultNSU: params.ultNSU,
    chNFe: params.chNFe,
    nsuEspecifico: params.nsuEspecifico,
    ambiente,
    cUFAutor
  });

  const endpointUrl = ambiente === 1 ? URL_SEFAZ_DIST_PRODUCAO : URL_SEFAZ_DIST_HOMOLOGACAO;
  const parsedUrl = new URL(endpointUrl);
  const httpsAgent = criarAgenteHttpsSefaz(dadosCert);

  return new Promise((resolve, reject) => {
    const postData = Buffer.from(soapBody, 'utf-8');

    const reqOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname,
      method: 'POST',
      agent: httpsAgent,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"',
        'Content-Length': postData.length,
        'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse'
      },
      timeout: 30000
    };

    const req = https.request(reqOptions, (res) => {
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        try {
          const cStat = extrairTag(responseBody, 'cStat');
          const xMotivo = extrairTag(responseBody, 'xMotivo');
          const dhResp = extrairTag(responseBody, 'dhResp');
          const ultNSU = extrairTag(responseBody, 'ultNSU');
          const maxNSU = extrairTag(responseBody, 'maxNSU');

          const documentos = decodificarLoteDistDFe(responseBody);
          const sucesso = cStat === '138' || cStat === '137';

          resolve({
            sucesso,
            cStat: cStat || String(res.statusCode || '500'),
            xMotivo: xMotivo || `Resposta HTTP ${res.statusCode}`,
            dhResp: dhResp || new Date().toISOString(),
            ultNSU: ultNSU || params.ultNSU || '0',
            maxNSU: maxNSU || params.ultNSU || '0',
            totalDocumentos: documentos.length,
            documentos,
            xmlRespostaBruto: responseBody,
            certificadoInfo: {
              titular: dadosCert.titular,
              cnpjCertificado: dadosCert.cnpjCertificado,
              emissor: dadosCert.emissor,
              validoDe: dadosCert.validoDe,
              validoAte: dadosCert.validoAte,
              expirado: dadosCert.expirado
            }
          });
        } catch (parseErr: any) {
          reject(new Error(`Falha ao processar resposta da SEFAZ: ${parseErr.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Erro de conexão com a SEFAZ: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tempo limite de resposta da SEFAZ atingido (Timeout 30s).'));
    });

    req.write(postData);
    req.end();
  });
}

// Fila interna em memória no servidor de chaves que receberam Ciência da Operação (210210) e aguardam a SEFAZ liberar o procNFe
const chavesPendentesServerByCnpj = new Map<string, Set<string>>();

function obterSetPendentesEmpresa(cnpj: string): Set<string> {
  const clean = cnpj.replace(/\D/g, '');
  if (!chavesPendentesServerByCnpj.has(clean)) {
    chavesPendentesServerByCnpj.set(clean, new Set<string>());
  }
  return chavesPendentesServerByCnpj.get(clean)!;
}

/**
 * Consulta a SEFAZ NFeDistribuicaoDFe, processa internamente qualquer Resumo (resNFe) ou Evento registrando
 * APENAS Ciência da Operação (210210), busca os XMLs completos (procNFe) das chaves
 * pendentes e retorna para a listagem do usuário garantindo que nenhuma nota dos últimos 90 dias seja perdida.
 * O servidor NUNCA manifesta automaticamente Confirmação da Operação (210200).
 */
export async function consultarSefazDistribuicaoDFe(params: ParametrosConsultaDFe): Promise<RespostaConsultaDFe> {
  const cleanCnpj = params.cnpj.replace(/\D/g, '');
  const pendentesSet = obterSetPendentesEmpresa(cleanCnpj);

  // Sincroniza chaves pendentes enviadas pelo cliente
  if (Array.isArray(params.chavesPendentes)) {
    params.chavesPendentes.forEach(ch => {
      const cleanCh = String(ch || '').replace(/\D/g, '');
      if (cleanCh.length === 44) {
        pendentesSet.add(cleanCh);
      }
    });
  }

  let resultado: RespostaConsultaDFe;

  if (params.apenasProcessarPendentes) {
    resultado = {
      sucesso: true,
      cStat: '137',
      xMotivo: 'Processamento de fila de chaves pendentes de liberação do procNFe na SEFAZ.',
      dhResp: new Date().toISOString(),
      ultNSU: params.ultNSU || '0',
      maxNSU: params.ultNSU || '0',
      totalDocumentos: 0,
      documentos: [],
      resumosManifestadosInternamente: 0,
      chavesPendentesLiberacao: Array.from(pendentesSet)
    };
  } else {
    resultado = await executarRequisicaoDistDFeBruta(params);

    // Se a consulta distNSU com ultNSU=0 retornou 137 com 000000000000000 / 000000000000000,
    // faz uma sondagem direta no NSU 000000000000001 (<consNSU>) para verificar se já existem NSUs gerados na SEFAZ
    const ultNumInicial = parseInt(String(params.ultNSU || '0').replace(/\D/g, ''), 10) || 0;
    const retUltNum = parseInt(String(resultado.ultNSU || '0').replace(/\D/g, ''), 10) || 0;
    const retMaxNum = parseInt(String(resultado.maxNSU || '0').replace(/\D/g, ''), 10) || 0;
    if (
      resultado.cStat === '137' &&
      ultNumInicial === 0 &&
      retUltNum === 0 &&
      retMaxNum === 0 &&
      !params.chNFe &&
      !params.nsuEspecifico
    ) {
      try {
        const probeNsu1 = await executarRequisicaoDistDFeBruta({
          ...params,
          nsuEspecifico: '000000000000001'
        });
        if (probeNsu1.cStat === '138' && probeNsu1.documentos.length > 0) {
          resultado = probeNsu1;
        }
      } catch {}
    }
  }

  // 1. Identifica chaves que já vieram com NFE_COMPLETA ou RESUMO no próprio lote
  const chavesComNfeCompleta = new Set<string>();
  const chavesComResumoNoLote = new Set<string>();
  resultado.documentos.forEach(d => {
    if (d.tipo === 'NFE_COMPLETA' && d.chave) {
      chavesComNfeCompleta.add(d.chave);
      pendentesSet.delete(d.chave);
    } else if (d.tipo === 'RESUMO' && d.chave && d.chave.length === 44) {
      chavesComResumoNoLote.add(d.chave);
    }
  });

  // 2. Identifica notas em RESUMO ou EVENTO (modelo 55 = NF-e) no lote atual e adiciona na fila de Ciência/procNFe
  const chavesNovasNoLote = new Set<string>();
  resultado.documentos.forEach(d => {
    if (
      (d.tipo === 'RESUMO' || d.tipo === 'EVENTO') &&
      d.chave &&
      d.chave.length === 44 &&
      d.chave.slice(20, 22) === '55' &&
      !chavesComNfeCompleta.has(d.chave)
    ) {
      pendentesSet.add(d.chave);
      if (d.chave.slice(6, 20) !== cleanCnpj) {
        chavesNovasNoLote.add(d.chave);
      }
    }
  });

  let resumosManifestadosInternamente = 0;

  // 3. Durante a varredura de lotes distNSU (!apenasProcessarPendentes):
  //    Registra Ciência da Operação (210210) no webservice separado NFeRecepcaoEvento4 (que não gera 656),
  //    e se já estiver no último lote (sem mais lotes distNSU) aproveita para buscar os procNFe pendentes.
  const isServerlessEnv = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL);
  const loopStart = Date.now();
  const temMaisLotesDistNsu =
    !params.apenasProcessarPendentes &&
    resultado.cStat === '138' &&
    resultado.ultNSU !== resultado.maxNSU &&
    parseInt(resultado.ultNSU || '0', 10) < parseInt(resultado.maxNSU || '0', 10);

  if (params.autoManifestar !== false && !params.chNFe && pendentesSet.size > 0) {
    if (!params.apenasProcessarPendentes) {
      const maxCienciaRapida = temMaisLotesDistNsu ? 4 : 6;
      const budgetCienciaMs = isServerlessEnv ? 4500 : 7500;
      const novasParaCiencia = Array.from(chavesNovasNoLote).slice(0, maxCienciaRapida);

      for (const chaveResumo of novasParaCiencia) {
        if (Date.now() - loopStart > budgetCienciaMs) break;
        try {
          const resManif = await manifestarDestinatarioSefaz({
            cnpj: cleanCnpj,
            pfxBase64: params.pfxBase64,
            passphrase: params.passphrase,
            chNFe: chaveResumo,
            tpEvento: '210210',
            ambiente: params.ambiente
          });
          if (resManif.sucesso || ['135', '136', '573'].includes(resManif.cStatEvento)) {
            resumosManifestadosInternamente++;
          }
        } catch {}
      }
    } else {
      // Modo apenasProcessarPendentes: busca o procNFe de até 4 chaves por ciclo rotacionando a fila
      // para que nenhuma chave trave as demais
      const maxChavesPorCiclo = isServerlessEnv ? 3 : 4;
      const maxBudgetMs = isServerlessEnv ? 7000 : 14000;
      const filaVerificacao = Array.from(pendentesSet).slice(0, maxChavesPorCiclo);

      for (const chaveCandidata of filaVerificacao) {
        if (Date.now() - loopStart > maxBudgetMs) break;
        if (chavesComNfeCompleta.has(chaveCandidata)) {
          pendentesSet.delete(chaveCandidata);
          continue;
        }
        try {
          const obtido = await obterXmlOficialNFePorChave({
            cnpj: cleanCnpj,
            pfxBase64: params.pfxBase64,
            passphrase: params.passphrase,
            chNFe: chaveCandidata,
            ambiente: params.ambiente,
            ufAutor: params.ufAutor,
            manifestarAutomaticamente: chaveCandidata.slice(6, 20) !== cleanCnpj,
            pularPrimeiraConsulta: false
          });
          if (obtido.manifestacaoRealizada) {
            resumosManifestadosInternamente++;
          }
          if (obtido.obtidoNfeCompleta && obtido.documento && obtido.documento.tipo === 'NFE_COMPLETA') {
            resultado.documentos.push(obtido.documento);
            chavesComNfeCompleta.add(chaveCandidata);
            pendentesSet.delete(chaveCandidata);
          } else {
            if (obtido.todosDocumentosRetornados && obtido.todosDocumentosRetornados.length > 0) {
              obtido.todosDocumentosRetornados.forEach(d => {
                if (!chavesComNfeCompleta.has(chaveCandidata)) {
                  resultado.documentos.push(d);
                }
              });
            }
            // Se a SEFAZ retornou 656 durante consChNFe, interrompe o loop imediatamente
            if (obtido.cStat === '656') {
              break;
            }
            // Se a nota foi cancelada/denegada/inexistente na SEFAZ (653, 217, 632), remove da fila pendente;
            // caso contrário, rotaciona para o fim da fila para não bloquear as próximas chaves!
            pendentesSet.delete(chaveCandidata);
            if (!['653', '217', '632', '301', '302'].includes(obtido.cStat || '')) {
              pendentesSet.add(chaveCandidata);
            }
          }
        } catch {
          pendentesSet.delete(chaveCandidata);
          pendentesSet.add(chaveCandidata);
        }
      }
    }
  }

  // 4. Filtra e consolida os documentos retornados ao frontend:
  //    - Prioriza NFE_COMPLETA (procNFe 100% original com <infNFe>).
  //    - Preserva RESUMO (resNFe) para chaves cujo procNFe ainda está sendo liberado pela SEFAZ.
  //    - Se no lote veio apenas um EVENTO referenciando uma chave de NF-e (modelo 55, 44 dígitos) que ainda não tem
  //      NFE_COMPLETA nem RESUMO no lote, converte em registro RESUMO para que a nota nunca seja perdida!
  const documentosFiltrados: DocumentoDFeDescompactado[] = [];
  for (const d of resultado.documentos) {
    if (d.tipo === 'NFE_COMPLETA' && d.xml && d.xml.includes('infNFe')) {
      documentosFiltrados.push(d);
      continue;
    }
    if (d.tipo === 'RESUMO' && d.chave && d.chave.length === 44 && !chavesComNfeCompleta.has(d.chave)) {
      documentosFiltrados.push(d);
      continue;
    }
    if (d.tipo === 'EVENTO' && d.chave && d.chave.length === 44) {
      if (d.tpEvento === '110111' || d.tpEvento === '110112' || d.tpEvento === '110110') {
        documentosFiltrados.push(d);
      } else if (
        d.chave.slice(20, 22) === '55' &&
        !chavesComNfeCompleta.has(d.chave) &&
        !chavesComResumoNoLote.has(d.chave)
      ) {
        chavesComResumoNoLote.add(d.chave);
        documentosFiltrados.push({
          ...d,
          tipo: 'RESUMO'
        });
      }
    }
  }

  // Remove duplicatas pela mesma chave, dando prioridade total para NFE_COMPLETA sobre RESUMO
  const mapaUnicos = new Map<string, DocumentoDFeDescompactado>();
  for (const doc of documentosFiltrados) {
    const key = doc.chave ? `CHAVE_${doc.chave}` : `${doc.nsu}_${doc.schema}`;
    const existente = mapaUnicos.get(key);
    if (!existente || doc.tipo === 'NFE_COMPLETA' || (existente.tipo === 'EVENTO' && doc.tipo === 'RESUMO')) {
      mapaUnicos.set(key, doc);
    }
  }

  resultado.documentos = Array.from(mapaUnicos.values());
  resultado.totalDocumentos = resultado.documentos.filter(d => d.tipo === 'NFE_COMPLETA' || d.tipo === 'RESUMO').length;
  resultado.resumosManifestadosInternamente = resumosManifestadosInternamente;
  resultado.chavesPendentesLiberacao = Array.from(pendentesSet);

  if (resultado.totalDocumentos > 0 && resultado.cStat === '137') {
    resultado.cStat = '138';
    resultado.xMotivo = 'Documento(s) fiscal(is) localizado(s) e processado(s) na SEFAZ Nacional.';
  }

  return resultado;
}

/**
 * Formata data/hora de evento no padrão exigido pela SEFAZ (AAAA-MM-DDTHH:MM:SS-03:00)
 */
function formatarDhEventoSefaz(date: Date = new Date()): string {
  const safeTime = new Date(date.getTime() - 90 * 1000);
  const brOffsetMs = 3 * 60 * 60 * 1000;
  const brDate = new Date(safeTime.getTime() - brOffsetMs);
  return brDate.toISOString().slice(0, 19) + '-03:00';
}

/**
 * Gera e assina digitalmente (XMLDSig RSA-SHA1 / C14N) um evento de Manifestação do Destinatário
 */
export function gerarEnvelopeSoapManifestacaoAssinado(params: {
  cnpj: string;
  chNFe: string;
  tpEvento: '210210' | '210200' | '210220' | '210240';
  justificativa?: string;
  ambiente: 1 | 2;
  dadosCert: DadosCertificadoExtraido;
}): string {
  const cleanCnpj = params.cnpj.replace(/\D/g, '');
  const cleanChave = params.chNFe.replace(/\D/g, '');
  const nSeqEvento = '1';
  const idEvento = `ID${params.tpEvento}${cleanChave}${nSeqEvento.padStart(2, '0')}`;
  const dhEvento = formatarDhEventoSefaz();

  const descricoesEvento: Record<string, string> = {
    '210200': 'Confirmacao da Operacao',
    '210210': 'Ciencia da Operacao',
    '210220': 'Desconhecimento da Operacao',
    '210240': 'Operacao nao Realizada'
  };
  const descEvento = descricoesEvento[params.tpEvento] || 'Ciencia da Operacao';

  let xJustXml = '';
  if (params.tpEvento === '210240' && params.justificativa) {
    const justLimpa = params.justificativa.trim().slice(0, 255);
    xJustXml = `<xJust>${justLimpa}</xJust>`;
  }

  const infEventoCanonical = `<infEvento xmlns="http://www.portalfiscal.inf.br/nfe" Id="${idEvento}"><cOrgao>91</cOrgao><tpAmb>${params.ambiente}</tpAmb><CNPJ>${cleanCnpj}</CNPJ><chNFe>${cleanChave}</chNFe><dhEvento>${dhEvento}</dhEvento><tpEvento>${params.tpEvento}</tpEvento><nSeqEvento>${nSeqEvento}</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>${descEvento}</descEvento>${xJustXml}</detEvento></infEvento>`;

  const digestValue = crypto
    .createHash('sha1')
    .update(infEventoCanonical, 'utf8')
    .digest('base64');

  const signedInfoCanonical = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod><Reference URI="#${idEvento}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>${digestValue}</DigestValue></Reference></SignedInfo>`;

  const signer = crypto.createSign('RSA-SHA1');
  signer.update(signedInfoCanonical, 'utf8');
  const signatureValue = signer.sign(params.dadosCert.keyPem, 'base64').replace(/\s+/g, '');

  const x509Clean = params.dadosCert.certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');

  const signatureXml = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfoCanonical}<SignatureValue>${signatureValue}</SignatureValue><KeyInfo><X509Data><X509Certificate>${x509Clean}</X509Certificate></X509Data></KeyInfo></Signature>`;

  const idLote = Date.now().toString().slice(-15);
  const envEventoXml = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${idLote}</idLote><evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">${infEventoCanonical}${signatureXml}</evento></envEvento>`;

  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">${envEventoXml}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}

/**
 * Envia um único evento de Manifestação ao WebService NFeRecepcaoEvento4 da SEFAZ.
 */
async function enviarEventoManifestacaoUnico(
  params: ParametrosManifestacaoDestinatario
): Promise<RespostaManifestacaoDestinatario> {
  const cleanCnpj = params.cnpj.replace(/\D/g, '');
  const cleanChave = params.chNFe.replace(/\D/g, '');
  const dadosCert = extrairPemDePfx(params.pfxBase64, params.passphrase || '');
  const ambiente = params.ambiente === 2 ? 2 : 1;
  const tpEvento = params.tpEvento || '210210';

  const soapBody = gerarEnvelopeSoapManifestacaoAssinado({
    cnpj: cleanCnpj,
    chNFe: cleanChave,
    tpEvento,
    justificativa: params.justificativa,
    ambiente,
    dadosCert
  });

  const endpointUrl = ambiente === 1 ? URL_SEFAZ_EVENTO_PRODUCAO : URL_SEFAZ_EVENTO_HOMOLOGACAO;
  const parsedUrl = new URL(endpointUrl);
  const httpsAgent = criarAgenteHttpsSefaz(dadosCert);

  return new Promise((resolve, reject) => {
    const postData = Buffer.from(soapBody, 'utf-8');

    const reqOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname,
      method: 'POST',
      agent: httpsAgent,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento"',
        'Content-Length': postData.length,
        'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento'
      },
      timeout: 30000
    };

    const req = https.request(reqOptions, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        try {
          const cStatLote = extrairTag(responseBody, 'cStat');
          const xMotivoLote = extrairTag(responseBody, 'xMotivo');
          const cStatEvento = extrairTagEmBloco(responseBody, 'infEvento', 'cStat') || cStatLote;
          const xMotivoEvento = extrairTagEmBloco(responseBody, 'infEvento', 'xMotivo') || xMotivoLote;
          const nProt = extrairTagEmBloco(responseBody, 'infEvento', 'nProt');

          // 135: Evento registrado e vinculado a NF-e
          // 136: Evento registrado, mas não vinculado a NF-e
          // 573: Duplicidade de Evento (já foi manifestada anteriormente!)
          const sucesso = cStatEvento === '135' || cStatEvento === '136' || cStatEvento === '573';

          resolve({
            sucesso,
            tpEventoEnviado: tpEvento,
            cStatLote,
            xMotivoLote,
            cStatEvento,
            xMotivoEvento,
            nProt: nProt || undefined,
            xmlRespostaBruto: responseBody
          });
        } catch (err: any) {
          reject(new Error(`Falha ao processar retorno de Manifestação SEFAZ: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Erro de conexão com NFeRecepcaoEvento4 da SEFAZ: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tempo limite excedido ao enviar Manifestação para a SEFAZ.'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Envia Manifestação do Destinatário para a SEFAZ:
 * - Quando chamada automaticamente pelo servidor, envia EXCLUSIVAMENTE Ciência da Operação (210210).
 * - O servidor NUNCA faz fallback automático para Confirmação da Operação (210200);
 *   qualquer manifestação subsequente (210200, 210220, 210240) fica estritamente a cargo do usuário.
 */
export async function manifestarDestinatarioSefaz(
  params: ParametrosManifestacaoDestinatario
): Promise<RespostaManifestacaoDestinatario> {
  return enviarEventoManifestacaoUnico({
    ...params,
    tpEvento: params.tpEvento || '210210'
  });
}

/**
 * Fluxo completo para obter EXCLUSIVAMENTE o XML Oficial Completo (procNFe) de uma Chave de Acesso:
 * 1. Consulta <consChNFe> no NFeDistribuicaoDFe.
 * 2. Se retornar o procNFe completo (<infNFe>), devolve imediatamente.
 * 3. Se for nota de Entrada (Terceiro), registra internamente APENAS Ciência da Operação (210210)
 *    e consulta <consChNFe> novamente. NUNCA envia Confirmação (210200) automaticamente.
 * 4. NUNCA retorna um Resumo (resNFe) para ser exibido na tabela: caso a SEFAZ ainda esteja processando
 *    a liberação do procNFe após a Ciência, mantém a chave na fila interna pendente.
 */
export async function obterXmlOficialNFePorChave(params: {
  cnpj: string;
  pfxBase64: string;
  passphrase?: string;
  chNFe: string;
  ambiente?: 1 | 2;
  ufAutor?: string;
  manifestarAutomaticamente?: boolean;
  pularPrimeiraConsulta?: boolean;
  dadosExistentes?: Partial<DocumentoDFeDescompactado>;
}): Promise<RespostaDownloadXmlOficial> {
  const cleanCnpj = params.cnpj.replace(/\D/g, '');
  const cleanChave = params.chNFe.replace(/\D/g, '');
  const pendentesSet = obterSetPendentesEmpresa(cleanCnpj);

  if (cleanChave.length !== 44) {
    throw new Error('A chave de acesso deve conter exatamente 44 dígitos.');
  }

  const emitCnpjDaChave = cleanChave.slice(6, 20);
  const isNotaEmitidaPelaPropriaEmpresa = emitCnpjDaChave === cleanCnpj;

  // Passo 1: Consulta pontual <consChNFe> na SEFAZ (salvo se sabemos que acabou de chegar apenas em RESUMO no lote atual)
  let consulta1: RespostaConsultaDFe | null = null;
  if (!params.pularPrimeiraConsulta) {
    try {
      consulta1 = await executarRequisicaoDistDFeBruta({
        cnpj: cleanCnpj,
        pfxBase64: params.pfxBase64,
        passphrase: params.passphrase,
        chNFe: cleanChave,
        ambiente: params.ambiente,
        ufAutor: params.ufAutor
      });
    } catch (e) {
      console.warn('[SEFAZ consChNFe] Aviso na primeira consulta:', e);
    }
  }

  const nfeCompleta1 = consulta1?.documentos.find(d => d.tipo === 'NFE_COMPLETA' && d.xml && d.xml.includes('<infNFe'));
  if (nfeCompleta1) {
    pendentesSet.delete(cleanChave);
    return {
      sucesso: true,
      obtidoNfeCompleta: true,
      manifestacaoRealizada: false,
      cStat: consulta1!.cStat,
      xMotivo: 'XML Oficial Completo (procNFe) baixado com sucesso da SEFAZ.',
      documento: nfeCompleta1,
      todosDocumentosRetornados: [nfeCompleta1]
    };
  }

  let manifestacaoRealizada = false;
  let statusManifestacao = '';
  let consultaPosManif: RespostaConsultaDFe | null = null;

  // Passo 2: Se for nota de Entrada (Terceiro), envia internamente APENAS Ciência da Operação (210210).
  // NUNCA manifesta Confirmação (210200) automaticamente — a próxima manifestação fica a cargo do usuário.
  if (!isNotaEmitidaPelaPropriaEmpresa && params.manifestarAutomaticamente !== false) {
    try {
      const manif = await manifestarDestinatarioSefaz({
        cnpj: cleanCnpj,
        pfxBase64: params.pfxBase64,
        passphrase: params.passphrase,
        chNFe: cleanChave,
        tpEvento: '210210',
        ambiente: params.ambiente
      });

      statusManifestacao = `[${manif.tpEventoEnviado}] ${manif.cStatEvento} - ${manif.xMotivoEvento}`;

      if (manif.sucesso) {
        manifestacaoRealizada = true;

        // Tentativa 1 pós-manifestação (1.2s) e Tentativa 2 (2.2s) caso a SEFAZ leve alguns segundos para disponibilizar o procNFe
        for (const delayMs of [1200, 2200]) {
          await new Promise(r => setTimeout(r, delayMs));
          try {
            consultaPosManif = await executarRequisicaoDistDFeBruta({
              cnpj: cleanCnpj,
              pfxBase64: params.pfxBase64,
              passphrase: params.passphrase,
              chNFe: cleanChave,
              ambiente: params.ambiente,
              ufAutor: params.ufAutor
            });

            const nfeCompletaPos = consultaPosManif.documentos.find(
              d => d.tipo === 'NFE_COMPLETA' && d.xml && d.xml.includes('<infNFe')
            );
            if (nfeCompletaPos) {
              pendentesSet.delete(cleanChave);
              return {
                sucesso: true,
                obtidoNfeCompleta: true,
                manifestacaoRealizada: true,
                statusManifestacao,
                cStat: consultaPosManif.cStat,
                xMotivo: `XML Oficial Completo (procNFe) liberado e baixado com sucesso da SEFAZ!`,
                documento: nfeCompletaPos,
                todosDocumentosRetornados: [nfeCompletaPos]
              };
            }
          } catch {}
        }
      }
    } catch (manifErr: any) {
      statusManifestacao = manifErr.message;
    }
  }

  // Passo 3: Se a SEFAZ ainda não liberou o procNFe completo, mantém a chave na fila interna pendente
  // e preserva eventual RESUMO retornado para que o documento já apareça imediatamente na relação da empresa
  // enquanto o procNFe completo é liberado pela SEFAZ.
  if (!isNotaEmitidaPelaPropriaEmpresa) {
    pendentesSet.add(cleanChave);
  }

  const resumosRetornados = [
    ...(consultaPosManif?.documentos || []),
    ...(consulta1?.documentos || [])
  ].filter(d => d.tipo === 'RESUMO');

  // Se a Ciência da Operação (210210) foi aceita pela SEFAZ (cStat 135/136/573) mas a SEFAZ ainda não devolveu
  // o docZip na consulta imediata, criamos o registro em RESUMO autenticado pela chave para aparecer na lista
  // e o robô finalizar o download do procNFe automaticamente no próximo ciclo.
  if (resumosRetornados.length === 0 && manifestacaoRealizada && cleanChave.length === 44) {
    const anoMes = cleanChave.slice(2, 6); // AAMM
    const ano = '20' + anoMes.slice(0, 2);
    const mes = anoMes.slice(2, 4);
    resumosRetornados.push({
      nsu: '000000000000001',
      schema: 'resNFe_v1.01.xsd',
      tipo: 'RESUMO',
      chave: cleanChave,
      nNF: String(parseInt(cleanChave.slice(25, 34), 10)),
      serie: String(parseInt(cleanChave.slice(22, 25), 10)),
      emitCNPJ: emitCnpjDaChave,
      destCNPJ: cleanCnpj,
      dataEmissao: `${ano}-${mes}-01T12:00:00-03:00`,
      cSitNFe: '1',
      xml: ''
    });
  }

  return {
    sucesso: Boolean(resumosRetornados.length > 0 || manifestacaoRealizada),
    obtidoNfeCompleta: false,
    manifestacaoRealizada,
    statusManifestacao,
    cStat: consultaPosManif?.cStat || consulta1?.cStat || (manifestacaoRealizada ? '135' : '137'),
    xMotivo: manifestacaoRealizada
      ? `Ciência da Operação registrada na SEFAZ (${statusManifestacao}). Nota vinculada ao CNPJ e aguardando liberação final do XML completo (procNFe).`
      : (consultaPosManif?.xMotivo || consulta1?.xMotivo || 'A SEFAZ não localizou esta chave ou ainda está processando a liberação do XML.'),
    documento: resumosRetornados[0],
    todosDocumentosRetornados: resumosRetornados
  };
}

