/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, Building2 } from 'lucide-react';

export function Header() {
  return (
    <header className="bg-[#031d30] text-slate-100 border-b border-[#e4b35e]/30 shadow-lg shrink-0">
      <div className="w-full px-6 sm:px-10 py-3.5 flex items-center justify-between min-h-[64px]">
        {/* Identidade Corporativa Sofisticada e Tipográfica */}
        <div className="flex items-center gap-4 select-none">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#e4b35e] to-[#c99542] flex items-center justify-center text-[#031d30] shadow-md border border-[#e4b35e]/40 shrink-0">
            <Building2 className="h-5 w-5 font-bold" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5">
              <span className="text-base sm:text-lg font-extrabold tracking-tight text-white">
                Moreira &amp; Lima
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.18em] bg-[#e4b35e]/15 text-[#e4b35e] border border-[#e4b35e]/30">
                My Hub
              </span>
            </div>
            <span className="text-[11px] font-medium text-[#e4b35e]/90 tracking-wider uppercase mt-0.5">
              Gestão Contábil &amp; Tributária
            </span>
          </div>
        </div>

        {/* Indicador de Ambiente Corporativo */}
        <div className="hidden md:flex items-center gap-3 text-right">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5 text-slate-200 text-[11px] font-bold">
              <ShieldCheck className="h-4 w-4 text-[#e4b35e]" />
              <span>Plataforma Fiscal Integrada</span>
            </div>
            <span className="text-[10px] text-slate-400 tracking-wide mt-0.5">
              Auditoria Avançada • DFe SEFAZ • Inteligência Tributária
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
