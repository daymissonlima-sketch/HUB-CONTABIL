/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Componente Modular de Tabela e Paginação para Documentos Fiscais SEFAZ (NF-e)
 * - Tabela com 100% de largura
 * - Exibição completa de Chave de Acesso (44 dígitos), Número da NF, Emitente, Destinatário, Valor, Situação e Status do XML
 * - Ações diretas: Visualizar DANFE Padrão Nacional, Visualizar Código XML e Baixar XML Original
 */

import React, { useState } from 'react';
import { 
  Inbox, 
  Eye, 
  Download, 
  RefreshCw, 
  Copy, 
  Check,
  Settings,
  FileCheck,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  FileEdit
} from 'lucide-react';
import { Company } from '../../types_debits';
import { DocumentoFiscalArmazenado } from '../../types/sefazTypes';
import { isXmlNfeCompletaOficial } from '../../services/sefazIndexedDb';
import { obterXmlAutencticoDocumento } from '../../services/sefazStorage';

interface NfeTabelaListagemProps {
  filteredDocs: DocumentoFiscalArmazenado[];
  paginatedDocs: DocumentoFiscalArmazenado[];
  selectedDocIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleSelectDoc: (id: string) => void;
  downloadingKeyId: string | null;
  onViewDanfe: (doc: DocumentoFiscalArmazenado) => void;
  onViewXml: (doc: DocumentoFiscalArmazenado) => void;
  onDownloadXml: (doc: DocumentoFiscalArmazenado) => void;
  onOpenManifestacao?: (doc: DocumentoFiscalArmazenado) => void;
  selectedCompanyId: string;
  activeCompany: Company | null;
  onOpenManualModal: () => void;
  onOpenCertModal: () => void;
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  onSetPage: (page: number | ((prev: number) => number)) => void;
  onSetItemsPerPage: (count: number) => void;
  formatarCnpj: (cnpj: string) => string;
}

export const NfeTabelaListagem: React.FC<NfeTabelaListagemProps> = ({
  filteredDocs,
  paginatedDocs,
  selectedDocIds,
  onToggleSelectAll,
  onToggleSelectDoc,
  downloadingKeyId,
  onViewDanfe,
  onViewXml,
  onDownloadXml,
  onOpenManifestacao,
  selectedCompanyId,
  activeCompany,
  onOpenManualModal,
  onOpenCertModal,
  currentPage,
  totalPages,
  itemsPerPage,
  onSetPage,
  onSetItemsPerPage,
  formatarCnpj
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyKey = (chave: string) => {
    navigator.clipboard.writeText(chave);
    setCopiedKey(chave);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      
      {/* Table Container - Encaixe sem Barra de Rolagem */}
      <div className="w-full overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          
          <thead className="bg-[#04243b] text-slate-200 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-700">
            <tr>
              <th className="py-1.5 px-1.5 text-center w-7">
                <input
                  type="checkbox"
                  checked={filteredDocs.length > 0 && selectedDocIds.size === filteredDocs.length}
                  onChange={onToggleSelectAll}
                  className="rounded text-[#e4b35e] focus:ring-[#e4b35e] cursor-pointer"
                />
              </th>
              <th className="py-1.5 px-1.5 whitespace-nowrap">Emissão</th>
              <th className="py-1.5 px-1.5 whitespace-nowrap">Número</th>
              <th className="py-1.5 px-1.5">Emitida por</th>
              <th className="py-1.5 px-1.5">Emitida para</th>
              <th className="py-1.5 px-1.5 text-right whitespace-nowrap">Valor Total</th>
              <th className="py-1.5 px-1.5 text-center whitespace-nowrap">Situação</th>
              <th className="py-1.5 px-1.5 whitespace-nowrap">Chave de Acesso (44 Dígitos)</th>
              <th className="py-1.5 px-1.5 text-center whitespace-nowrap print:hidden">Ações</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-xs">
            {filteredDocs.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-slate-400">
                  <div className="max-w-md mx-auto space-y-2.5">
                    <Inbox className="h-8 w-8 mx-auto text-slate-300" />
                    <div className="font-bold text-slate-700 text-xs">
                      Nenhum documento fiscal na listagem
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {selectedCompanyId === 'TODAS' 
                        ? 'O robô SEFAZ realiza a varredura automática em segundo plano dos últimos 90 dias para todas as empresas com certificado digital habilitado no cadastro.' 
                        : `Não há notas listadas para ${activeCompany?.razaoSocial || 'esta empresa'} com os filtros atuais.`}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        onClick={onOpenManualModal}
                        className="px-3 py-1.5 bg-[#04243b] text-white rounded-lg font-bold text-xs hover:bg-[#031d30] shadow-xs cursor-pointer flex items-center gap-1.5"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-[#e4b35e]" />
                        <span>Status do Robô em 2º Plano</span>
                      </button>
                      <button
                        onClick={onOpenCertModal}
                        className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-bold text-xs hover:bg-slate-200 cursor-pointer flex items-center gap-1.5"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        <span>Cadastro de Clientes / Certificados</span>
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedDocs.map(doc => {
                const isSelected = selectedDocIds.has(doc.id);
                const isCancelada = doc.situacao === 'CANCELADA';
                const isDenegada = doc.situacao === 'DENEGADA';
                const isCce = doc.situacao === 'CARTA_CORRECAO';
                const isEntrada = doc.tipoOperacao === 'ENTRADA';
                const isDownloadingThis = downloadingKeyId === doc.id;

                const dataApenasData = doc.dataGeracaoFormatada
                  ? doc.dataGeracaoFormatada.split(' ')[0]
                  : (doc.dataEmissao || '').split('T')[0].split('-').reverse().join('/');

                return (
                  <tr 
                    key={doc.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isSelected ? 'bg-amber-50/60' : ''
                    } ${isCancelada ? 'bg-rose-50/30' : ''}`}
                  >
                    {/* Checkbox */}
                    <td className="py-1 px-1.5 text-center w-7">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelectDoc(doc.id)}
                        className="rounded text-[#e4b35e] focus:ring-[#e4b35e] cursor-pointer"
                      />
                    </td>

                    {/* Emissão */}
                    <td className="py-1 px-1.5 font-mono font-semibold text-slate-800 whitespace-nowrap text-[11px]">
                      {dataApenasData}
                    </td>

                    {/* Número */}
                    <td className="py-1 px-1.5 whitespace-nowrap font-mono font-black text-slate-900 text-xs">
                      {doc.nNF && doc.nNF !== 'S/N' ? doc.nNF : '-'}
                    </td>

                    {/* Emitida por */}
                    <td className="py-1 px-1.5 max-w-[150px]">
                      <span className="font-semibold text-slate-800 block truncate text-xs" title={doc.emitenteNome}>
                        {doc.emitenteNome}
                      </span>
                    </td>

                    {/* Emitida para */}
                    <td className="py-1 px-1.5 max-w-[140px]">
                      <span className="font-semibold text-slate-800 block truncate text-xs" title={doc.destinatarioNome}>
                        {doc.destinatarioNome || 'Destinatário conforme NF-e'}
                      </span>
                    </td>

                    {/* Valor Total */}
                    <td className="py-1 px-1.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap text-xs">
                      {doc.valorTotal ? doc.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'}
                    </td>

                    {/* Situação (Ícone Verde para Autorizada, Ícone Red X para Cancelada, Orange Alert para Denegada) */}
                    <td className="py-1 px-1.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        {isCancelada ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800" title="Nota Cancelada na SEFAZ">
                            <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                            <span>Cancelada</span>
                          </span>
                        ) : isDenegada ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900" title="Uso Denegado pela SEFAZ">
                            <AlertOctagon className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span>Denegada</span>
                          </span>
                        ) : isCce ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800" title="Carta de Correção Eletrônica (CC-e)">
                            <FileEdit className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span>CC-e</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800" title="Nota Autorizada na SEFAZ">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span>Autorizada</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Chave de Acesso Completa (44 dígitos) */}
                    <td className="py-1 px-1.5 whitespace-nowrap">
                      {doc.chave ? (
                        <div className="flex items-center justify-between gap-2 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 w-full">
                          <span 
                            className="font-mono text-xs font-bold text-slate-800 tracking-tight select-all" 
                            title={`Chave de Acesso Completa (${doc.chave.length} dígitos): ${doc.chave}`}
                          >
                            {doc.chave}
                          </span>
                          <button
                            onClick={() => handleCopyKey(doc.chave)}
                            className="p-0.5 text-slate-400 hover:text-[#04243b] hover:bg-slate-200 rounded transition-colors cursor-pointer shrink-0"
                            title={`Copiar Chave Completa (${doc.chave})`}
                          >
                            {copiedKey === doc.chave ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-slate-500">NSU {doc.nsu}</span>
                      )}
                    </td>

                    {/* Ações Rápidas (EXCLUSIVAMENTE ÍCONES COM TOOLTIPS) */}
                    <td className="py-1 px-2 text-center whitespace-nowrap print:hidden">
                      <div className="flex items-center justify-center gap-1">
                        
                        {/* Ícone Olho (Visualizar DANFE Padrão Nacional) */}
                        <button
                          onClick={() => onViewDanfe(doc)}
                          disabled={isDownloadingThis}
                          className="p-1 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-[#04243b] transition-colors cursor-pointer border border-slate-200"
                          title="Visualizar DANFE Padrão Nacional"
                        >
                          <Eye className="h-4 w-4 text-[#04243b]" />
                        </button>

                        {/* Ícone Baixar XML (Fundo normal, ícone em azul) */}
                        <button
                          onClick={() => onDownloadXml(doc)}
                          disabled={isDownloadingThis}
                          className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                          title="Baixar XML Oficial da NF-e para o computador"
                        >
                          {isDownloadingThis ? (
                            <RefreshCw className="h-4 w-4 animate-spin text-[#04243b]" />
                          ) : (
                            <Download className="h-4 w-4 text-[#04243b]" />
                          )}
                        </button>

                        {/* Ícone Manifestar Destinatário (Novo ícone FileCheck) */}
                        {isEntrada && onOpenManifestacao && (
                          <button
                            onClick={() => onOpenManifestacao(doc)}
                            disabled={isDownloadingThis}
                            className="p-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer"
                            title="Manifestar Destinatário na SEFAZ (Confirmação, Desconhecimento ou Operação não Realizada)"
                          >
                            <FileCheck className="h-4 w-4 text-amber-700" />
                          </button>
                        )}

                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Controles de Paginação */}
      {filteredDocs.length > 0 && (
        <div className="px-3 py-2 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <span>Exibir</span>
            <select
              value={itemsPerPage}
              onChange={(e) => onSetItemsPerPage(Number(e.target.value))}
              className="px-2 py-0.5 border border-slate-300 rounded-md bg-slate-50 font-bold text-slate-800 focus:outline-hidden focus:bg-white cursor-pointer"
            >
              <option value={10}>10 itens por página</option>
              <option value={25}>25 itens por página</option>
              <option value={50}>50 itens por página</option>
              <option value={100}>100 itens por página</option>
            </select>
            <span className="hidden sm:inline text-slate-500 font-medium">
              • Mostrando {Math.min((currentPage - 1) * itemsPerPage + 1, filteredDocs.length)} a {Math.min(currentPage * itemsPerPage, filteredDocs.length)} de {filteredDocs.length}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onSetPage(1)}
              disabled={currentPage === 1}
              className="px-2 py-0.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              &laquo;
            </button>
            <button
              onClick={() => onSetPage(prev => Math.max(1, (prev as number) - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-0.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Anterior
            </button>

            <div className="px-2.5 py-0.5 font-bold text-slate-800 bg-slate-100 rounded-md border border-slate-200 text-[11px]">
              Página {currentPage} de {totalPages}
            </div>

            <button
              onClick={() => onSetPage(prev => Math.min(totalPages, (prev as number) + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-0.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Próxima
            </button>
            <button
              onClick={() => onSetPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2 py-0.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              &raquo;
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

