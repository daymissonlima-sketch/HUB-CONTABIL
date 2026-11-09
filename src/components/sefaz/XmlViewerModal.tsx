/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Modal modular de Visualização de Arquivo XML da NF-e
 */

import React, { useState } from 'react';
import { FileCode, Download, X, Copy, Check } from 'lucide-react';
import { DocumentoFiscalArmazenado } from '../../types/sefazTypes';
import { montarCaminhoRelativoXml } from '../../services/sefazLocalFolderService';

interface XmlViewerModalProps {
  doc: DocumentoFiscalArmazenado | null;
  onClose: () => void;
  onDownloadXml: (doc: DocumentoFiscalArmazenado) => void;
}

export const XmlViewerModal: React.FC<XmlViewerModalProps> = ({
  doc,
  onClose,
  onDownloadXml
}) => {
  const [copied, setCopied] = useState(false);

  if (!doc) return null;

  const { caminhoCompletoRelativo } = montarCaminhoRelativoXml(doc);

  const handleCopy = () => {
    if (doc.xml) {
      navigator.clipboard.writeText(doc.xml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
        
        {/* Topo */}
        <div className="px-6 py-4 bg-[#04243b] text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-[#e4b35e] text-[#04243b]">
              <FileCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                Arquivo XML da NF-e Nº {doc.nNF}
              </h3>
              <p className="text-xs text-slate-300 font-mono">
                Chave: {doc.chave || 'S/N'} • Pasta: {caminhoCompletoRelativo}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Copiar XML para a área de transferência"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copiado!' : 'Copiar XML'}</span>
            </button>

            <button
              onClick={() => onDownloadXml(doc)}
              className="px-3.5 py-1.5 text-xs font-bold bg-[#e4b35e] hover:bg-[#d6a54f] text-[#04243b] rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" /> Baixar XML
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Visualizador de Código com proteção XSS (React texto puro) */}
        <div className="p-4 overflow-y-auto flex-1 bg-slate-900 text-slate-100 font-mono text-xs select-all whitespace-pre-wrap break-all">
          {doc.xml || '<!-- Conteúdo XML não disponível ou em carregamento -->'}
        </div>

      </div>
    </div>
  );
};
