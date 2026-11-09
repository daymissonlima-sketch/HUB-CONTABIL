/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Gerador e Visualizador Oficial de DANFE (Documento Auxiliar da Nota Fiscal Eletrônica)
 * Layout Retrato A4 no Padrão Nacional (Manual de Orientação do Contribuinte - MOC SEFAZ)
 * - Código de Barras Code-128C vetorial da Chave de Acesso (44 dígitos)
 * - Canhoto destacável, Emitente, Destinatário, Fatura/Duplicatas, Cálculo do Imposto,
 *   Transportador/Volumes, Dados dos Produtos/Serviços (com NCM, CST/CSOSN, CFOP, ICMS, IPI)
 *   e Dados Adicionais / Protocolo SEFAZ.
 * - Exportação direta em PDF A4 e Impressão dedicada limpa.
 */

import React, { useRef, useMemo, useState } from 'react';
import {
  X,
  Printer,
  Download,
  FileDown,
  FileCode,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';
import { DocumentoFiscalArmazenado } from '../../types/sefazTypes';
import { extrairDadosDanfeOficial, gerarBarrasCode128C } from '../../utils/danfeParser';

interface DanfeModalProps {
  isOpen: boolean;
  onClose: () => void;
  documento: DocumentoFiscalArmazenado | null;
  onDownloadXml: (doc: DocumentoFiscalArmazenado) => void;
  onRefreshXmlOficial?: (doc: DocumentoFiscalArmazenado) => Promise<void>;
}

function fmtMoeda(val: number, decimais = 2): string {
  return (val || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: decimais,
    maximumFractionDigits: decimais
  });
}

export function DanfeModal({
  isOpen,
  onClose,
  documento,
  onDownloadXml,
  onRefreshXmlOficial
}: DanfeModalProps) {
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [isRefreshingSefaz, setIsRefreshingSefaz] = useState<boolean>(false);
  const danfeSheetRef = useRef<HTMLDivElement>(null);

  const dados = useMemo(() => {
    if (!documento) return null;
    return extrairDadosDanfeOficial(documento);
  }, [documento]);

  const barcode = useMemo(() => {
    if (!dados?.chave) return { barras: [], larguraTotal: 300 };
    return gerarBarrasCode128C(dados.chave);
  }, [dados?.chave]);

  // Calcula a quantidade estimada de folhas no padrão SEFAZ caso a nota tenha muitos itens
  const totalFolhas = useMemo(() => {
    if (!dados?.itens || dados.itens.length <= 4) return 1;
    return 1 + Math.ceil((dados.itens.length - 4) / 18);
  }, [dados?.itens]);

  if (!isOpen || !documento || !dados) return null;

  const handleCopyKey = () => {
    if (dados.chave) {
      navigator.clipboard.writeText(dados.chave);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  /**
   * Imprime exclusivamente a folha A4 do DANFE utilizando um iframe invisível
   * para garantir fidelidade 100% ao padrão SEFAZ sem interferência do layout do sistema.
   */
  const handlePrintDanfeA4 = () => {
    if (!danfeSheetRef.current) return;
    const htmlContent = danfeSheetRef.current.innerHTML;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const docPrint = iframe.contentWindow?.document;
    if (!docPrint) return;

    docPrint.open();
    docPrint.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>DANFE_${dados.chave || dados.nNF}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 6mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: "Times New Roman", Times, Arial, sans-serif;
      color: #000;
      background: #fff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: auto;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`);
    docPrint.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 2000);
    }, 350);
  };

  /**
   * Gera e baixa o arquivo PDF (DANFE_<Chave>.pdf) diretamente para o computador
   */
  const handleDownloadPdfDanfe = async () => {
    if (!danfeSheetRef.current) return;
    setIsGeneratingPdf(true);
    try {
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = (html2pdfModule as any).default || html2pdfModule;
      const fileName = `DANFE_${dados.chave || `NF_${dados.nNF}`}.pdf`;

      const opt = {
        margin: [5, 5, 5, 5],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: 794
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait'
        },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      await html2pdf().set(opt).from(danfeSheetRef.current).save();
    } catch (err) {
      console.warn('Fallback para impressão de PDF:', err);
      handlePrintDanfeA4();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleRefreshXml = async () => {
    if (!onRefreshXmlOficial) return;
    setIsRefreshingSefaz(true);
    try {
      await onRefreshXmlOficial(documento);
    } finally {
      setIsRefreshingSefaz(false);
    }
  };

  const enderecoEmitenteFormatado = [
    dados.emitente.logradouro,
    dados.emitente.numero ? `, ${dados.emitente.numero}` : '',
    dados.emitente.complemento ? ` - ${dados.emitente.complemento}` : ''
  ].join('');

  const enderecoDestFormatado = [
    dados.destinatario.logradouro,
    dados.destinatario.numero ? `, ${dados.destinatario.numero}` : '',
    dados.destinatario.complemento ? ` - ${dados.destinatario.complemento}` : ''
  ].join('');

  // Estilos inline estritos de células do DANFE Nacional para funcionar perfeitamente tanto na tela quanto no PDF e Impressão
  const boxStyle: React.CSSProperties = {
    border: '1px solid #000',
    padding: '2px 4px',
    verticalAlign: 'top',
    position: 'relative',
    backgroundColor: '#ffffff'
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '6pt',
    fontFamily: 'Arial, Helvetica, sans-serif',
    textTransform: 'uppercase',
    color: '#111',
    lineHeight: '1.1',
    display: 'block',
    fontWeight: 600
  };
  const valStyle: React.CSSProperties = {
    fontSize: '8pt',
    fontFamily: '"Times New Roman", Times, serif',
    color: '#000',
    lineHeight: '1.2',
    display: 'block',
    fontWeight: 700,
    minHeight: '10pt'
  };
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '6.5pt',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontWeight: 800,
    textTransform: 'uppercase',
    color: '#000',
    margin: '4px 0 1px 0',
    letterSpacing: '0.2px'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
        
        {/* Barra de Controle Superior */}
        <div className="px-5 py-3.5 bg-[#04243b] text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-[#e4b35e] text-[#04243b]">
              <FileCode className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  DANFE Padrão Nacional SEFAZ (Retrato A4)
                </h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  dados.isCancelada
                    ? 'bg-rose-500 text-white'
                    : 'bg-emerald-500 text-white'
                }`}>
                  {dados.isCancelada
                    ? 'Cancelada'
                    : 'XML Original (procNFe)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-mono">
                NF-e Nº {dados.nNFFormatado} • Série {dados.serie} • Chave: {dados.chave}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyKey}
              className="px-3 py-1.5 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Copiar os 44 dígitos da Chave de Acesso"
            >
              {copiedKey ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedKey ? 'Chave Copiada' : 'Copiar Chave'}</span>
            </button>

            <button
              onClick={handlePrintDanfeA4}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>Imprimir DANFE (A4)</span>
            </button>

            <button
              onClick={handleDownloadPdfDanfe}
              disabled={isGeneratingPdf}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" />
              <span>{isGeneratingPdf ? 'Gerando PDF...' : 'Baixar PDF (DANFE)'}</span>
            </button>

            <button
              onClick={() => onDownloadXml(documento)}
              className="px-3.5 py-1.5 text-xs font-bold text-[#04243b] bg-[#e4b35e] hover:bg-[#d6a54f] rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>Baixar XML Original</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Área de Visualização da Folha A4 Oficial do DANFE */}
        <div className="p-4 sm:p-6 overflow-y-auto overflow-x-auto bg-slate-800 flex-1 min-h-0">
          
          {/* Folha A4 Branca Padrão SEFAZ (210mm = ~794px) */}
          <div
            ref={danfeSheetRef}
            className="mx-auto"
            style={{
              width: '794px',
              minHeight: '1120px',
              height: 'auto',
              backgroundColor: '#ffffff',
              color: '#000000',
              padding: '18px 20px 32px 20px',
              fontFamily: '"Times New Roman", Times, Arial, sans-serif',
              boxShadow: '0 10px 35px rgba(0,0,0,0.45)',
              position: 'relative',
              boxSizing: 'border-box'
            }}
          >
            {/* Marca d'água caso Cancelada */}
            {dados.isCancelada && (
              <div
                style={{
                  border: '2px solid #b91c1c',
                  backgroundColor: '#fef2f2',
                  color: '#991b1b',
                  textAlign: 'center',
                  fontWeight: 900,
                  fontSize: '11pt',
                  padding: '4px',
                  marginBottom: '6px',
                  fontFamily: 'Arial, sans-serif'
                }}
              >
                NOTA FISCAL ELETRÔNICA CANCELADA JUNTO À SEFAZ
              </div>
            )}

            {/* 1. CANHOTO DESTACÁVEL PADRÃO NACIONAL */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px', backgroundColor: '#ffffff' }}>
              <tbody>
                <tr>
                  <td colSpan={2} style={{ ...boxStyle, width: '80%' }}>
                    <span style={labelStyle}>
                      RECEBEMOS DE {dados.emitente.razaoSocial || 'EMITENTE'} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO. EMISSÃO: {dados.dataEmissao} - VALOR TOTAL: R$ {fmtMoeda(dados.impostos.vNF)} - DESTINATÁRIO: {dados.destinatario.razaoSocial}
                    </span>
                  </td>
                  <td rowSpan={2} style={{ ...boxStyle, width: '20%', textAlign: 'center', verticalAlign: 'middle' }}>
                    <div style={{ fontSize: '11pt', fontWeight: 900, fontFamily: 'Arial, sans-serif' }}>NF-e</div>
                    <div style={{ fontSize: '8.5pt', fontWeight: 800, marginTop: '2px' }}>Nº {dados.nNFFormatado}</div>
                    <div style={{ fontSize: '7.5pt', fontWeight: 700 }}>SÉRIE {dados.serie}</div>
                  </td>
                </tr>
                <tr>
                  <td style={{ ...boxStyle, width: '22%', height: '24px' }}>
                    <span style={labelStyle}>DATA DE RECEBIMENTO</span>
                  </td>
                  <td style={{ ...boxStyle, width: '58%', height: '24px' }}>
                    <span style={labelStyle}>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Linha tracejada de destaque do canhoto */}
            <div style={{ borderBottom: '1px dashed #000', margin: '5px 0 6px 0' }} />

            {/* 2. QUADRO PRINCIPAL: EMITENTE | DANFE | CÓDIGO DE BARRAS E CHAVE DE ACESSO */}
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#ffffff' }}>
              <tbody>
                <tr>
                  {/* Quadro Identificação do Emitente */}
                  <td rowSpan={3} style={{ ...boxStyle, width: '41%', textAlign: 'center', verticalAlign: 'middle', padding: '6px' }}>
                    <div style={{ fontSize: '6pt', fontFamily: 'Arial, sans-serif', color: '#333', textTransform: 'uppercase', marginBottom: '2px' }}>
                      IDENTIFICAÇÃO DO EMITENTE
                    </div>
                    <div style={{ fontSize: '9.5pt', fontWeight: 900, lineHeight: '1.15', textTransform: 'uppercase' }}>
                      {dados.emitente.razaoSocial}
                    </div>
                    {dados.emitente.nomeFantasia && dados.emitente.nomeFantasia !== dados.emitente.razaoSocial && (
                      <div style={{ fontSize: '7.5pt', fontWeight: 700, marginTop: '1px' }}>
                        {dados.emitente.nomeFantasia}
                      </div>
                    )}
                    <div style={{ fontSize: '7pt', marginTop: '4px', lineHeight: '1.25', fontFamily: 'Arial, sans-serif' }}>
                      {enderecoEmitenteFormatado && <div>{enderecoEmitenteFormatado}</div>}
                      {(dados.emitente.bairro || dados.emitente.cep) && (
                        <div>
                          {dados.emitente.bairro}
                          {dados.emitente.cep ? ` - CEP: ${dados.emitente.cep}` : ''}
                        </div>
                      )}
                      {(dados.emitente.municipio || dados.emitente.uf) && (
                        <div>
                          {dados.emitente.municipio}
                          {dados.emitente.uf ? ` / ${dados.emitente.uf}` : ''}
                          {dados.emitente.fone ? ` - Fone: ${dados.emitente.fone}` : ''}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Quadro Central DANFE */}
                  <td rowSpan={3} style={{ ...boxStyle, width: '16%', textAlign: 'center', verticalAlign: 'middle', padding: '4px' }}>
                    <div style={{ fontSize: '13pt', fontWeight: 900, fontFamily: 'Arial, sans-serif', letterSpacing: '0.5px' }}>
                      DANFE
                    </div>
                    <div style={{ fontSize: '6.2pt', fontFamily: 'Arial, sans-serif', lineHeight: '1.1', fontWeight: 600 }}>
                      DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', margin: '5px 0' }}>
                      <div style={{ textAlign: 'left', fontSize: '6.5pt', fontFamily: 'Arial, sans-serif', lineHeight: '1.25', fontWeight: 700 }}>
                        <div>0 - ENTRADA</div>
                        <div>1 - SAÍDA</div>
                      </div>
                      <div style={{ border: '1px solid #000', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9pt', fontWeight: 900 }}>
                        {dados.tpNF}
                      </div>
                    </div>

                    <div style={{ fontSize: '8pt', fontWeight: 900, fontFamily: 'Arial, sans-serif' }}>
                      Nº {dados.nNFFormatado}
                    </div>
                    <div style={{ fontSize: '7.5pt', fontWeight: 800, fontFamily: 'Arial, sans-serif' }}>
                      SÉRIE {dados.serie}
                    </div>
                    <div style={{ fontSize: '6.5pt', fontWeight: 700, marginTop: '2px' }}>
                      Folha 1/{totalFolhas}
                    </div>
                  </td>

                  {/* Código de Barras Code-128C */}
                  <td style={{ ...boxStyle, width: '43%', textAlign: 'center', padding: '4px 6px' }}>
                    <span style={{ ...labelStyle, textAlign: 'left' }}>CONTROLE DO FISCO</span>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2px 0' }}>
                      <svg
                        viewBox={`0 0 ${barcode.larguraTotal} 38`}
                        style={{ width: '100%', maxWidth: '310px', height: '36px', display: 'block' }}
                        preserveAspectRatio="none"
                      >
                        <rect width={barcode.larguraTotal} height="38" fill="#ffffff" />
                        {barcode.barras.map((b, i) => (
                          <rect key={i} x={b.x} y={2} width={b.w} height={34} fill="#000000" />
                        ))}
                      </svg>
                    </div>
                  </td>
                </tr>

                {/* Chave de Acesso de 44 dígitos */}
                <tr>
                  <td style={{ ...boxStyle, textAlign: 'center' }}>
                    <span style={{ ...labelStyle, textAlign: 'left' }}>CHAVE DE ACESSO</span>
                    <span style={{ fontSize: '7.5pt', fontFamily: '"Courier New", Courier, monospace', fontWeight: 900, letterSpacing: '0.3px', display: 'block', marginTop: '1px' }}>
                      {dados.chaveFormatada}
                    </span>
                  </td>
                </tr>

                {/* Mensagem de Autenticidade Portal Nacional */}
                <tr>
                  <td style={{ ...boxStyle, textAlign: 'center', verticalAlign: 'middle', padding: '3px 6px' }}>
                    <span style={{ fontSize: '6.3pt', fontFamily: 'Arial, sans-serif', fontWeight: 600, lineHeight: '1.2', display: 'block' }}>
                      Consulta de autenticidade no portal nacional da NF-e <strong>www.nfe.fazenda.gov.br/portal</strong> ou no site da Sefaz Autorizadora
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 3. NATUREZA DA OPERAÇÃO & PROTOCOLO DE AUTORIZAÇÃO */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '-1px' }}>
              <tbody>
                <tr>
                  <td style={{ ...boxStyle, width: '57%' }}>
                    <span style={labelStyle}>NATUREZA DA OPERAÇÃO</span>
                    <span style={valStyle}>{dados.natOp}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '43%' }}>
                    <span style={labelStyle}>PROTOCOLO DE AUTORIZAÇÃO DE USO</span>
                    <span style={{ ...valStyle, fontFamily: '"Courier New", Courier, monospace', fontSize: '7.5pt' }}>
                      {dados.protocolo}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 4. INSCRIÇÃO ESTADUAL | IE SUBST. TRIBUTÁRIO | CNPJ */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '-1px' }}>
              <tbody>
                <tr>
                  <td style={{ ...boxStyle, width: '33%' }}>
                    <span style={labelStyle}>INSCRIÇÃO ESTADUAL</span>
                    <span style={valStyle}>{dados.emitente.ie}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '33%' }}>
                    <span style={labelStyle}>INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.</span>
                    <span style={valStyle}>{dados.emitente.ieSt}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '34%' }}>
                    <span style={labelStyle}>CNPJ / CPF</span>
                    <span style={valStyle}>{dados.emitente.cnpjCpf}</span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 5. DESTINATÁRIO / REMETENTE */}
            <div style={sectionTitleStyle}>DESTINATÁRIO / REMETENTE</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ ...boxStyle, width: '60%' }}>
                    <span style={labelStyle}>NOME / RAZÃO SOCIAL</span>
                    <span style={valStyle}>{dados.destinatario.razaoSocial}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '25%' }}>
                    <span style={labelStyle}>CNPJ / CPF</span>
                    <span style={valStyle}>{dados.destinatario.cnpjCpf}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '15%' }}>
                    <span style={labelStyle}>DATA DA EMISSÃO</span>
                    <span style={{ ...valStyle, textAlign: 'center' }}>{dados.dataEmissao}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '-1px' }}>
              <tbody>
                <tr>
                  <td style={{ ...boxStyle, width: '46%' }}>
                    <span style={labelStyle}>ENDEREÇO</span>
                    <span style={valStyle}>{enderecoDestFormatado}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '25%' }}>
                    <span style={labelStyle}>BAIRRO / DISTRITO</span>
                    <span style={valStyle}>{dados.destinatario.bairro}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '14%' }}>
                    <span style={labelStyle}>CEP</span>
                    <span style={valStyle}>{dados.destinatario.cep}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '15%' }}>
                    <span style={labelStyle}>DATA DA SAÍDA/ENTRADA</span>
                    <span style={{ ...valStyle, textAlign: 'center' }}>{dados.dataSaidaEntrada}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '-1px' }}>
              <tbody>
                <tr>
                  <td style={{ ...boxStyle, width: '40%' }}>
                    <span style={labelStyle}>MUNICÍPIO</span>
                    <span style={valStyle}>{dados.destinatario.municipio}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '18%' }}>
                    <span style={labelStyle}>FONE / FAX</span>
                    <span style={valStyle}>{dados.destinatario.fone}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '6%' }}>
                    <span style={labelStyle}>UF</span>
                    <span style={{ ...valStyle, textAlign: 'center' }}>{dados.destinatario.uf}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '21%' }}>
                    <span style={labelStyle}>INSCRIÇÃO ESTADUAL</span>
                    <span style={valStyle}>{dados.destinatario.ie}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '15%' }}>
                    <span style={labelStyle}>HORA DA SAÍDA/ENTRADA</span>
                    <span style={{ ...valStyle, textAlign: 'center' }}>{dados.horaSaidaEntrada || dados.horaEmissao}</span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 6. FATURA / DUPLICATAS */}
            <div style={sectionTitleStyle}>FATURA / DUPLICATA</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={boxStyle}>
                    {dados.duplicatas.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '1px 0' }}>
                        {dados.duplicatas.map((d, idx) => (
                          <div
                            key={idx}
                            style={{
                              border: '1px solid #555',
                              padding: '1px 5px',
                              fontSize: '7pt',
                              fontFamily: '"Courier New", Courier, monospace',
                              fontWeight: 700
                            }}
                          >
                            Nº {d.nDup} | Venc: {d.dVenc} | R$ {fmtMoeda(d.vDup)}
                          </div>
                        ))}
                      </div>
                    ) : dados.fatura.nFat || dados.fatura.vLiq > 0 ? (
                      <span style={{ ...valStyle, fontSize: '7.5pt' }}>
                        Fatura Nº {dados.fatura.nFat || 'ÚNICA'} — Valor Original: R$ {fmtMoeda(dados.fatura.vOrig)} | Desconto: R$ {fmtMoeda(dados.fatura.vDesc)} | Valor Líquido: R$ {fmtMoeda(dados.fatura.vLiq)}
                      </span>
                    ) : (
                      <span style={{ ...valStyle, fontSize: '7.5pt' }}>
                        {dados.fatura.formaPagamento || 'PAGAMENTO CONFORME CONDIÇÕES COMERCIAIS DA NF-E'}
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 7. CÁLCULO DO IMPOSTO */}
            <div style={sectionTitleStyle}>CÁLCULO DO IMPOSTO</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ ...boxStyle, width: '14%' }}>
                    <span style={labelStyle}>BASE DE CÁLC. DO ICMS</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>{fmtMoeda(dados.impostos.vBC)}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '14%' }}>
                    <span style={labelStyle}>VALOR DO ICMS</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>{fmtMoeda(dados.impostos.vICMS)}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '14%' }}>
                    <span style={labelStyle}>BASE DE CÁLC. ICMS S.T.</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>{fmtMoeda(dados.impostos.vBCST)}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '14%' }}>
                    <span style={labelStyle}>VALOR DO ICMS SUBST.</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>{fmtMoeda(dados.impostos.vST)}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '14%' }}>
                    <span style={labelStyle}>V. IMP. IMPORTAÇÃO</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>{fmtMoeda(dados.impostos.vII)}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '14%' }}>
                    <span style={labelStyle}>VALOR DO PIS</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>{fmtMoeda(dados.impostos.vPIS)}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '16%' }}>
                    <span style={labelStyle}>VALOR TOTAL DOS PRODUTOS</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>{fmtMoeda(dados.impostos.vProd)}</span>
                  </td>
                </tr>
                <tr>
                  <td style={boxStyle}>
                    <span style={labelStyle}>VALOR DO FRETE</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>{fmtMoeda(dados.impostos.vFrete)}</span>
                  </td>
                  <td style={boxStyle}>
                    <span style={labelStyle}>VALOR DO SEGURO</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>{fmtMoeda(dados.impostos.vSeg)}</span>
                  </td>
                  <td style={boxStyle}>
                    <span style={labelStyle}>DESCONTO</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>{fmtMoeda(dados.impostos.vDesc)}</span>
                  </td>
                  <td style={boxStyle}>
                    <span style={labelStyle}>OUTRAS DESPESAS</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>{fmtMoeda(dados.impostos.vOutro)}</span>
                  </td>
                  <td style={boxStyle}>
                    <span style={labelStyle}>VALOR TOTAL DO IPI</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>{fmtMoeda(dados.impostos.vIPI)}</span>
                  </td>
                  <td style={boxStyle}>
                    <span style={labelStyle}>VALOR DA COFINS</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>{fmtMoeda(dados.impostos.vCOFINS)}</span>
                  </td>
                  <td style={{ ...boxStyle, backgroundColor: '#f3f4f6' }}>
                    <span style={labelStyle}>VALOR TOTAL DA NOTA</span>
                    <span style={{ ...valStyle, textAlign: 'right', fontSize: '9pt', fontWeight: 900 }}>
                      {fmtMoeda(dados.impostos.vNF)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 8. TRANSPORTADOR / VOLUMES TRANSPORTADOS */}
            <div style={sectionTitleStyle}>TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ ...boxStyle, width: '36%' }}>
                    <span style={labelStyle}>NOME / RAZÃO SOCIAL</span>
                    <span style={valStyle}>{dados.transporte.razaoSocial}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '18%' }}>
                    <span style={labelStyle}>FRETE POR CONTA</span>
                    <span style={{ ...valStyle, fontSize: '7pt' }}>{dados.transporte.modFreteDescricao}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '12%' }}>
                    <span style={labelStyle}>CÓDIGO ANTT</span>
                    <span style={valStyle}>{dados.transporte.rntc}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '12%' }}>
                    <span style={labelStyle}>PLACA DO VEÍCULO</span>
                    <span style={valStyle}>{dados.transporte.placa}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '5%' }}>
                    <span style={labelStyle}>UF</span>
                    <span style={{ ...valStyle, textAlign: 'center' }}>{dados.transporte.ufVeiculo}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '17%' }}>
                    <span style={labelStyle}>CNPJ / CPF</span>
                    <span style={valStyle}>{dados.transporte.cnpjCpf}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '-1px' }}>
              <tbody>
                <tr>
                  <td style={{ ...boxStyle, width: '46%' }}>
                    <span style={labelStyle}>ENDEREÇO</span>
                    <span style={valStyle}>{dados.transporte.endereco}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '32%' }}>
                    <span style={labelStyle}>MUNICÍPIO</span>
                    <span style={valStyle}>{dados.transporte.municipio}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '5%' }}>
                    <span style={labelStyle}>UF</span>
                    <span style={{ ...valStyle, textAlign: 'center' }}>{dados.transporte.uf}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '17%' }}>
                    <span style={labelStyle}>INSCRIÇÃO ESTADUAL</span>
                    <span style={valStyle}>{dados.transporte.ie}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '-1px' }}>
              <tbody>
                <tr>
                  <td style={{ ...boxStyle, width: '14%' }}>
                    <span style={labelStyle}>QUANTIDADE</span>
                    <span style={valStyle}>{dados.transporte.qVol}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '18%' }}>
                    <span style={labelStyle}>ESPÉCIE</span>
                    <span style={valStyle}>{dados.transporte.esp}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '18%' }}>
                    <span style={labelStyle}>MARCA</span>
                    <span style={valStyle}>{dados.transporte.marca}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '16%' }}>
                    <span style={labelStyle}>NUMERAÇÃO</span>
                    <span style={valStyle}>{dados.transporte.nVol}</span>
                  </td>
                  <td style={{ ...boxStyle, width: '17%' }}>
                    <span style={labelStyle}>PESO BRUTO</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>
                      {dados.transporte.pesoB > 0 ? fmtMoeda(dados.transporte.pesoB, 3) : ''}
                    </span>
                  </td>
                  <td style={{ ...boxStyle, width: '17%' }}>
                    <span style={labelStyle}>PESO LÍQUIDO</span>
                    <span style={{ ...valStyle, textAlign: 'right' }}>
                      {dados.transporte.pesoL > 0 ? fmtMoeda(dados.transporte.pesoL, 3) : ''}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 9. DADOS DOS PRODUTOS / SERVIÇOS */}
            <div style={sectionTitleStyle}>DADOS DOS PRODUTOS / SERVIÇOS</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minHeight: '120px', backgroundColor: '#ffffff' }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6', fontFamily: 'Arial, sans-serif', fontSize: '5.8pt', fontWeight: 800 }}>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'left', width: '8%', color: '#000000' }}>CÓDIGO</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'left', width: '28%', color: '#000000' }}>DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'center', width: '7%', color: '#000000' }}>NCM/SH</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'center', width: '5%', color: '#000000' }}>O/CST</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'center', width: '5%', color: '#000000' }}>CFOP</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'center', width: '4%', color: '#000000' }}>UN</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'right', width: '6%', color: '#000000' }}>QUANT.</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'right', width: '7%', color: '#000000' }}>V. UNIT.</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'right', width: '7%', color: '#000000' }}>V. TOTAL</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'right', width: '7%', color: '#000000' }}>B.C. ICMS</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'right', width: '5%', color: '#000000' }}>V. ICMS</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'right', width: '5%', color: '#000000' }}>V. IPI</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'right', width: '3%', color: '#000000' }}>%ICMS</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'right', width: '3%', color: '#000000' }}>%IPI</th>
                </tr>
              </thead>
              <tbody style={{ fontFamily: 'Arial, sans-serif', fontSize: '6.5pt', backgroundColor: '#ffffff', color: '#000000' }}>
                {dados.itens.length > 0 ? (
                  dados.itens.map((it, idx) => (
                    <tr key={idx} style={{ verticalAlign: 'top', backgroundColor: '#ffffff', color: '#000000' }}>
                      <td style={{ borderLeft: '1px solid #000', borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px 3px', backgroundColor: '#ffffff', color: '#000000' }}>
                        {it.cProd}
                      </td>
                      <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px 3px', backgroundColor: '#ffffff', color: '#000000' }}>
                        <div style={{ fontWeight: 700, color: '#000000' }}>{it.xProd}</div>
                        {it.infAdProd && (
                          <div style={{ fontSize: '5.8pt', color: '#333333', lineHeight: '1.2' }}>{it.infAdProd}</div>
                        )}
                      </td>
                      <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px', textAlign: 'center', backgroundColor: '#ffffff', color: '#000000' }}>
                        {it.ncm}
                      </td>
                      <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px', textAlign: 'center', backgroundColor: '#ffffff', color: '#000000' }}>
                        {it.cstCsosn}
                      </td>
                      <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px', textAlign: 'center', backgroundColor: '#ffffff', color: '#000000' }}>
                        {it.cfop}
                      </td>
                      <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px', textAlign: 'center', backgroundColor: '#ffffff', color: '#000000' }}>
                        {it.uCom}
                      </td>
                      <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px 3px', textAlign: 'right', backgroundColor: '#ffffff', color: '#000000' }}>
                        {fmtMoeda(it.qCom, 2)}
                      </td>
                      <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px 3px', textAlign: 'right', backgroundColor: '#ffffff', color: '#000000' }}>
                        {fmtMoeda(it.vUnCom, 2)}
                      </td>
                      <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px 3px', textAlign: 'right', fontWeight: 700, backgroundColor: '#ffffff', color: '#000000' }}>
                        {fmtMoeda(it.vProd, 2)}
                      </td>
                      <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px 3px', textAlign: 'right', backgroundColor: '#ffffff', color: '#000000' }}>
                        {fmtMoeda(it.vBC, 2)}
                      </td>
                      <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px 3px', textAlign: 'right', backgroundColor: '#ffffff', color: '#000000' }}>
                        {fmtMoeda(it.vICMS, 2)}
                      </td>
                      <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px 3px', textAlign: 'right', backgroundColor: '#ffffff', color: '#000000' }}>
                        {fmtMoeda(it.vIPI, 2)}
                      </td>
                      <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px', textAlign: 'right', backgroundColor: '#ffffff', color: '#000000' }}>
                        {fmtMoeda(it.pICMS, 1)}
                      </td>
                      <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #ccc', padding: '2px', textAlign: 'right', backgroundColor: '#ffffff', color: '#000000' }}>
                        {fmtMoeda(it.pIPI, 1)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr style={{ backgroundColor: '#ffffff' }}>
                    <td colSpan={14} style={{ border: '1px solid #000', padding: '24px', textAlign: 'center', fontSize: '8pt', color: '#444444', backgroundColor: '#ffffff' }}>
                      A SEFAZ disponibilizou até o momento apenas o Resumo Oficial (<code>resNFe</code>) para esta Chave de Acesso.
                      Assim que o arquivo completo (<code>procNFe</code>) for liberado pelo Ambiente Nacional da SEFAZ, todos os itens de produtos aparecerão aqui.
                    </td>
                  </tr>
                )}
                {/* Linha de fechamento da tabela de itens */}
                <tr style={{ backgroundColor: '#ffffff' }}>
                  <td colSpan={14} style={{ borderTop: '1px solid #000', height: '1px', padding: 0, backgroundColor: '#ffffff' }} />
                </tr>
              </tbody>
            </table>

            {/* 10. DADOS ADICIONAIS */}
            <div style={sectionTitleStyle}>DADOS ADICIONAIS</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#ffffff' }}>
              <tbody>
                <tr style={{ backgroundColor: '#ffffff' }}>
                  <td style={{ ...boxStyle, width: '65%', minHeight: '85px', height: 'auto', backgroundColor: '#ffffff' }}>
                    <span style={labelStyle}>INFORMAÇÕES COMPLEMENTARES</span>
                    <div style={{ fontSize: '6.8pt', fontFamily: 'Arial, sans-serif', marginTop: '2px', whiteSpace: 'pre-wrap', lineHeight: '1.25', color: '#000000' }}>
                      {dados.infCpl}
                      {dados.impostos.vTotTrib > 0 && (
                        <div style={{ marginTop: '3px', fontWeight: 700, color: '#000000' }}>
                          Valor Aproximado dos Tributos (Lei 12.741/2012): R$ {fmtMoeda(dados.impostos.vTotTrib)}
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ ...boxStyle, width: '35%', minHeight: '85px', height: 'auto', backgroundColor: '#ffffff' }}>
                    <span style={labelStyle}>RESERVADO AO FISCO</span>
                    <div style={{ fontSize: '6.8pt', fontFamily: 'Arial, sans-serif', marginTop: '2px', whiteSpace: 'pre-wrap', color: '#000000' }}>
                      {dados.infAdFisco}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

          </div>

        </div>

      </div>
    </div>
  );
}
