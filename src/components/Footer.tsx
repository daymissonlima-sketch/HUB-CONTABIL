/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export function Footer() {
  return (
    <footer className="bg-[#031d30] text-slate-400 border-t border-[#e4b35e]/20 py-3.5 font-sans shrink-0">
      <div className="w-full px-6 sm:px-10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <span className="font-bold text-[#e4b35e]">Moreira &amp; Lima</span>
          <span className="text-slate-500">•</span>
          <span>Gestão Contábil &amp; Tributária</span>
        </div>
        <div className="text-[11px] text-slate-400">
          Plataforma de Inteligência Fiscal &bull; Todos os direitos reservados
        </div>
      </div>
    </footer>
  );
}
