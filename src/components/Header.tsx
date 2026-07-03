/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Logo } from './Logo';
import { ShieldCheck } from 'lucide-react';

export function Header() {
  return (
    <header className="bg-[#04243b] text-slate-100 border-b border-[#e4b35e]/30 shadow-md shrink-0">
      <div className="w-full px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3">
        
        {/* Logo alinhado à esquerda com subtítulo institucional corporativo */}
        <div className="flex items-center gap-4">
          <Logo origin="left center" />
          <div className="hidden md:flex flex-col border-l border-[#e4b35e]/25 pl-4 py-0.5">
            <span className="text-xs font-bold tracking-wide text-slate-200">
              Gestão Contábil &amp; Tributária
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              Auditoria Fiscal Inteligente
            </span>
          </div>
        </div>

        {/* Lado Direito: Badge profissional de segurança e status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#031d30]/80 border border-[#e4b35e]/20 text-xs text-slate-300 shadow-inner">
            <ShieldCheck className="h-4 w-4 text-[#e4b35e] shrink-0" />
            <span className="hidden sm:inline font-medium">Ambiente Fiscal Homologado</span>
            <span className="flex h-2 w-2 relative ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
        </div>

      </div>
    </header>
  );
}

