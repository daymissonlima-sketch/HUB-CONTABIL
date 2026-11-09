/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modal de Manifestação do Destinatário (Manual pelo Usuário)
 * O servidor realiza automaticamente apenas a Ciência da Operação (210210).
 * A manifestação conclusiva (210200 Confirmação, 210220 Desconhecimento ou 210240 Operação não Realizada)
 * fica integralmente a cargo do usuário neste painel.
 */

import React, { useState, useEffect } from 'react';
import { ShieldCheck, X, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Company } from '../../types_debits';
import { DocumentoFiscalArmazenado } from '../../types/sefazTypes';

export type TipoEventoManifestacao = '210200' | '210220' | '210240' | '210210';

interface ManifestacaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  documento: DocumentoFiscalArmazenado | null;
  empresa: Company | null;
  isSubmitting: boolean;
  onConfirmManifestacao: (params: {
    chNFe: string;
    tpEvento: TipoEventoManifestacao;
    justificativa?: string;
  }) => Promise<void>;
}

export const ManifestacaoModal: React.FC<ManifestacaoModalProps> = ({
  isOpen,
  onClose,
  documento,
  empresa,
  isSubmitting,
  onConfirmManifestacao
}) => {
  const [tpEvento, setTpEvento] = useState<TipoEventoManifestacao>('210200');
  const [chaveManual, setChaveManual] = useState<string>('');
  const [justificativa, setJustificativa] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setChaveManual(documento?.chave || '');
      setTpEvento('210200');
      setJustificativa('');
      setLocalError(null);
    }
  }, [isOpen, documento]);

  if (!isOpen) return null;

  const cleanChave = chaveManual.replace(/\D/g, '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (cleanChave.length !== 44) {
      setLocalError('A Chave de Acesso deve conter exatamente 44 dígitos numéricos.');
      return;
    }

    if (tpEvento === '210240' && justificativa.trim().length < 15) {
      setLocalError('Para "Operação não Realizada (210240)", a SEFAZ exige justificativa com no mínimo 15 caracteres.');
      return;
    }

    await onConfirmManifestacao({
      chNFe: cleanChave,
      tpEvento,
      justificativa: tpEvento === '210240' ? justificativa.trim() : undefined
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden">
        {/* Topo */}
        <div className="px-6 py-4 bg-[#04243b] text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-[#e4b35e] text-[#04243b]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                Manifestação do Destinatário (SEFAZ Nacional)
              </h3>
              <p className="text-xs text-slate-300">
                {empresa
                  ? `${empresa.razaoSocial} (${empresa.cnpj})`
                  : documento?.empresaRazaoSocial || 'Selecione o evento de manifestação'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {documento && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#04243b]">
                  NF {documento.nNF} (Série {documento.serie})
                </span>
                <span className="font-mono font-bold text-slate-800">
                  {documento.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <div className="text-slate-600 truncate">
                Emitente: <strong>{documento.emitenteNome}</strong> ({documento.emitenteCnpj})
              </div>
              <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 pt-0.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  Status atual:{' '}
                  {documento.manifestacao === 'CONFIRMADA'
                    ? 'Operação Confirmada (210200)'
                    : documento.manifestacao === 'DESCONHECIDA'
                      ? 'Operação Desconhecida (210220)'
                      : documento.manifestacao === 'NAO_REALIZADA'
                        ? 'Operação não Realizada (210240)'
                        : 'Ciência da Operação (210210)'}
                </span>
              </div>
            </div>
          )}

          {!documento && (
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Chave de Acesso da NF-e (44 dígitos):
              </label>
              <input
                type="text"
                value={chaveManual}
                onChange={(e) => setChaveManual(e.target.value)}
                maxLength={44}
                placeholder="Digite os 44 dígitos da chave de acesso..."
                className="w-full text-xs font-mono border border-slate-300 rounded-xl p-2.5 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#04243b]"
              />
            </div>
          )}

          <div>
            <label className="font-semibold text-slate-700 block mb-2">
              Escolha a Manifestação a ser enviada para a SEFAZ:
            </label>
            <div className="space-y-2">
              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                  tpEvento === '210200'
                    ? 'border-emerald-600 bg-emerald-50/70'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="tpEvento"
                  checked={tpEvento === '210200'}
                  onChange={() => setTpEvento('210200')}
                  className="mt-0.5 text-emerald-600"
                />
                <div>
                  <div className="font-bold text-slate-900">
                    210200 — Confirmação da Operação
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Confirma a ocorrência da operação e o recebimento da mercadoria (para as operações com circulação de mercadoria).
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                  tpEvento === '210220'
                    ? 'border-amber-600 bg-amber-50/70'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="tpEvento"
                  checked={tpEvento === '210220'}
                  onChange={() => setTpEvento('210220')}
                  className="mt-0.5 text-amber-600"
                />
                <div>
                  <div className="font-bold text-slate-900">
                    210220 — Desconhecimento da Operação
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Declara que a empresa destinatária desconhece a operação fiscal emitida contra o seu CNPJ.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                  tpEvento === '210240'
                    ? 'border-rose-600 bg-rose-50/70'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="tpEvento"
                  checked={tpEvento === '210240'}
                  onChange={() => setTpEvento('210240')}
                  className="mt-0.5 text-rose-600"
                />
                <div>
                  <div className="font-bold text-slate-900">
                    210240 — Operação não Realizada
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Declara que a operação não foi realizada (ex: recusa de recebimento de mercadoria, sinistro, etc.). Exige justificativa.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                  tpEvento === '210210'
                    ? 'border-blue-600 bg-blue-50/70'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="tpEvento"
                  checked={tpEvento === '210210'}
                  onChange={() => setTpEvento('210210')}
                  className="mt-0.5 text-blue-600"
                />
                <div>
                  <div className="font-bold text-slate-900">
                    210210 — Ciência da Operação
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Declara apenas ciência da existência da nota para download do XML completo, mantendo pendente a manifestação conclusiva.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {tpEvento === '210240' && (
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Justificativa da Operação não Realizada (mínimo 15 caracteres):
              </label>
              <textarea
                rows={3}
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                maxLength={255}
                placeholder="Informe o motivo pelo qual a operação não foi realizada..."
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#04243b]"
              />
              <div className="text-[10px] text-slate-500 text-right">
                {justificativa.trim().length} / 255 caracteres
              </div>
            </div>
          )}

          {localError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{localError}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-[#04243b] bg-[#e4b35e] hover:bg-[#d6a54f] rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>{isSubmitting ? 'Enviando à SEFAZ...' : 'Transmitir Manifestação'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
