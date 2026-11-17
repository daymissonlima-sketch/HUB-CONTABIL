/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Building2,
  Copy, 
  Check, 
  Trash2, 
  AlertCircle, 
  CheckCircle2 
} from 'lucide-react';
import { cleanAccessKey, isAccessKeyValid, sanitizeCnpjDigits, isCnpjValidLength } from '../utils/sanitizer';

export function ChaveSanitizer() {
  // Ferramenta 1: Saneador de Chave de Acesso
  const [inputValue, setInputValue] = useState('');
  const [sanitizedValue, setSanitizedValue] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ferramenta 2: Saneador de CNPJ (retirar ., / e -)
  const [cnpjInput, setCnpjInput] = useState('');
  const [sanitizedCnpj, setSanitizedCnpj] = useState('');
  const [copiedCnpj, setCopiedCnpj] = useState(false);
  const cnpjInputRef = useRef<HTMLInputElement>(null);

  // Toast compartilhado
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Sync state and perform cleanup snoop/paste synchronously (Chave)
  const handleProcess = (value: string) => {
    setInputValue(value);
    const cleaned = cleanAccessKey(value);
    setSanitizedValue(cleaned);
  };

  const handleClear = () => {
    setInputValue('');
    setSanitizedValue('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleCopy = async () => {
    if (!sanitizedValue) return;
    try {
      await navigator.clipboard.writeText(sanitizedValue);
      setCopied(true);
      triggerToast('Chave de acesso copiada para a área de transferência!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  // Sync state and perform cleanup synchronously (CNPJ)
  const handleProcessCnpj = (value: string) => {
    setCnpjInput(value);
    const cleaned = sanitizeCnpjDigits(value);
    setSanitizedCnpj(cleaned);
  };

  const handleClearCnpj = () => {
    setCnpjInput('');
    setSanitizedCnpj('');
    if (cnpjInputRef.current) {
      cnpjInputRef.current.focus();
    }
  };

  const handleCopyCnpj = async () => {
    if (!sanitizedCnpj) return;
    try {
      await navigator.clipboard.writeText(sanitizedCnpj);
      setCopiedCnpj(true);
      triggerToast('CNPJ limpo copiado para a área de transferência!');
      setTimeout(() => setCopiedCnpj(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar CNPJ:', err);
    }
  };

  const isKeyValid = isAccessKeyValid(sanitizedValue);
  const charLength = sanitizedValue.length;

  let borderHighlightClass = "border-slate-200 focus-within:border-[#001F3F]/50 focus-within:ring-2 focus-within:ring-[#001F3F]/10";
  let countBadgeClass = "bg-slate-100 text-slate-500 border-slate-200";

  if (charLength > 0) {
    if (isKeyValid) {
      borderHighlightClass = "border-[#C5A059] focus-within:border-[#C5A059] ring-2 ring-[#C5A059]/10 bg-emerald-50/5";
      countBadgeClass = "bg-emerald-100 text-emerald-800 border-emerald-300";
    } else {
      borderHighlightClass = "border-amber-300 focus-within:border-amber-500 ring-2 ring-amber-500/10 bg-amber-50/5";
      countBadgeClass = "bg-amber-100 text-amber-800 border-amber-300";
    }
  }

  const isCnpjValid = isCnpjValidLength(sanitizedCnpj);
  const cnpjLength = sanitizedCnpj.length;

  let cnpjBorderHighlightClass = "border-slate-200 focus-within:border-[#001F3F]/50 focus-within:ring-2 focus-within:ring-[#001F3F]/10";
  let cnpjCountBadgeClass = "bg-slate-100 text-slate-500 border-slate-200";

  if (cnpjLength > 0) {
    if (isCnpjValid) {
      cnpjBorderHighlightClass = "border-[#C5A059] focus-within:border-[#C5A059] ring-2 ring-[#C5A059]/10 bg-emerald-50/5";
      cnpjCountBadgeClass = "bg-emerald-100 text-emerald-800 border-emerald-300";
    } else {
      cnpjBorderHighlightClass = "border-amber-300 focus-within:border-amber-500 ring-2 ring-amber-500/10 bg-amber-50/5";
      cnpjCountBadgeClass = "bg-amber-100 text-amber-800 border-amber-300";
    }
  }

  return (
    <div className="min-h-full py-2 animate-fadeIn bg-[#F4F5F7] space-y-6">
      
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-[#001F3F] font-sans flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#C5A059]" />
            SANEADOR DE CHAVES DE ACESSO & CNPJ
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ferramentas rápidas para remoção de pontuação (`.`, `/` e `-`) de Chaves de Acesso NF-e/NFC-e e de CNPJ.
          </p>
        </div>
      </div>

      {/* Main Tool Layout */}
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* FERRAMENTA 1: Card de Sanitização de Chave de Acesso */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="bg-[#001F3F] px-6 py-3.5 border-b border-[#C5A059]/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#C5A059]" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
                1. Saneador de Chave de Acesso (44 Dígitos)
              </h3>
            </div>
            <span className="text-[10px] font-bold text-[#C5A059] bg-white/10 px-2.5 py-0.5 rounded-full">
              Modelos 55 / 65
            </span>
          </div>

          <div className="p-6 space-y-5">
            
            {/* Area 1: Input Text */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Entrada de Chave Bruta
                </label>
                {inputValue && (
                  <button 
                    onClick={handleClear}
                    className="text-[10px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    Limpar
                  </button>
                )}
              </div>
              
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  className="w-full bg-slate-50 hover:bg-slate-50/70 focus:bg-white text-slate-800 font-mono text-[11px] sm:text-xs md:text-sm px-4 py-3.5 rounded-2xl border border-slate-200 focus:border-[#001F3F]/50 focus:ring-2 focus:ring-[#001F3F]/10 outline-none transition-all leading-normal shadow-3xs"
                  placeholder="Cole aqui a chave bruta com pontos, traços ou espaços..."
                  value={inputValue}
                  onChange={(e) => handleProcess(e.target.value)}
                />
              </div>
            </div>

            {/* Area 2: Output and Controls */}
            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                Chave Sanitizada (Somente Números)
              </label>

              <div className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col gap-4 ${borderHighlightClass} shadow-3xs bg-slate-50/50`}>
                
                {/* Clean, non-wrapping scrollable display for the key */}
                <div className="font-mono text-xs sm:text-sm md:text-base font-extrabold text-[#001F3F] whitespace-nowrap overflow-x-auto tracking-wide pb-3 border-b border-slate-100 select-all scrollbar-thin">
                  {sanitizedValue ? (
                    sanitizedValue
                  ) : (
                    <span className="text-slate-400 font-normal italic text-xs font-sans">
                      Aguardando entrada de dados...
                    </span>
                  )}
                </div>

                {/* Sub-row containing length badges and copy controls */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    {charLength > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${countBadgeClass}`}>
                          {charLength} Dígitos
                        </span>
                        {isKeyValid ? (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Válido
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Incompleto (Esperado: 44)
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Status: Vazio
                      </span>
                    )}
                  </div>

                  {sanitizedValue && (
                    <button
                      onClick={handleCopy}
                      className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 bg-[#001F3F] hover:bg-[#031d30] text-white hover:text-[#C5A059] rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer border border-[#C5A059]/15"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 text-[#C5A059]" />
                          Copiar Chave
                        </>
                      )}
                    </button>
                  )}
                </div>

              </div>
            </div>

          </div>
        </div>

        {/* FERRAMENTA 2: Card de Sanitização de CNPJ (Retirar ., / e -) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="bg-[#001F3F] px-6 py-3.5 border-b border-[#C5A059]/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#C5A059]" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
                2. Saneador de CNPJ
              </h3>
            </div>
            <span className="text-[10px] font-bold text-[#C5A059] bg-white/10 px-2.5 py-0.5 rounded-full">
              14 Dígitos
            </span>
          </div>

          <div className="p-6 space-y-5">
            
            {/* Area 1: Input CNPJ */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Entrada de CNPJ com Pontuação
                </label>
                {cnpjInput && (
                  <button 
                    onClick={handleClearCnpj}
                    className="text-[10px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    Limpar
                  </button>
                )}
              </div>
              
              <div className="relative">
                <input
                  ref={cnpjInputRef}
                  type="text"
                  className="w-full bg-slate-50 hover:bg-slate-50/70 focus:bg-white text-slate-800 font-mono text-[11px] sm:text-xs md:text-sm px-4 py-3.5 rounded-2xl border border-slate-200 focus:border-[#001F3F]/50 focus:ring-2 focus:ring-[#001F3F]/10 outline-none transition-all leading-normal shadow-3xs"
                  placeholder="Cole aqui o CNPJ (ex: 00.000.000/0001-00)..."
                  value={cnpjInput}
                  onChange={(e) => handleProcessCnpj(e.target.value)}
                />
              </div>
            </div>

            {/* Area 2: Output CNPJ Sanitizado */}
            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                CNPJ Sanitizado
              </label>

              <div className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col gap-4 ${cnpjBorderHighlightClass} shadow-3xs bg-slate-50/50`}>
                
                {/* Clean, non-wrapping scrollable display for the CNPJ */}
                <div className="font-mono text-xs sm:text-sm md:text-base font-extrabold text-[#001F3F] whitespace-nowrap overflow-x-auto tracking-wide pb-3 border-b border-slate-100 select-all scrollbar-thin">
                  {sanitizedCnpj ? (
                    sanitizedCnpj
                  ) : (
                    <span className="text-slate-400 font-normal italic text-xs font-sans">
                      Aguardando entrada do CNPJ...
                    </span>
                  )}
                </div>

                {/* Sub-row containing length badges and copy controls */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    {cnpjLength > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cnpjCountBadgeClass}`}>
                          {cnpjLength} Dígitos
                        </span>
                        {isCnpjValid ? (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            CNPJ Válido (14 dígitos)
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Incompleto (Esperado: 14)
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Status: Vazio
                      </span>
                    )}
                  </div>

                  {sanitizedCnpj && (
                    <button
                      onClick={handleCopyCnpj}
                      className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 bg-[#001F3F] hover:bg-[#031d30] text-white hover:text-[#C5A059] rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer border border-[#C5A059]/15"
                    >
                      {copiedCnpj ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 text-[#C5A059]" />
                          Copiar CNPJ
                        </>
                      )}
                    </button>
                  )}
                </div>

              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Floating Notification/Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50 bg-[#001F3F] text-slate-100 border border-[#C5A059]/30 px-4 py-3 rounded-2xl shadow-lg flex items-center gap-2.5 font-sans"
          >
            <CheckCircle2 className="h-5 w-5 text-[#C5A059]" />
            <span className="text-xs font-bold">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

