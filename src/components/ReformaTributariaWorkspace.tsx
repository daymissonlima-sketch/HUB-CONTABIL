import React, { useState } from 'react';
import { Users, Calculator } from 'lucide-react';
import { FornecedoresSimplesAuditor } from './FornecedoresSimplesAuditor';
import { SimuladorImpactoProdutos } from './SimuladorImpactoProdutos';

export const ReformaTributariaWorkspace: React.FC = () => {
  const [activeTool, setActiveTool] = useState<'fornecedores_simples' | 'impacto_produtos'>('fornecedores_simples');

  return (
    <div className="space-y-6">
      
      {/* Module Top Navigation / Tools Selector */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Tool 1: Perfil Tributário */}
          <button
            onClick={() => setActiveTool('fornecedores_simples')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTool === 'fornecedores_simples'
                ? 'bg-[#04243b] text-[#e4b35e] shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="h-4 w-4" />
            Perfil tributário
          </button>

          {/* Tool 2: Simulador de Impacto nos Produtos (IBS, CBS & IS) */}
          <button
            onClick={() => setActiveTool('impacto_produtos')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTool === 'impacto_produtos'
                ? 'bg-[#04243b] text-[#e4b35e] shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Calculator className="h-4 w-4" />
            Impacto nos Produtos (IBS, CBS & IS)
          </button>

        </div>
      </div>

      {/* Render Active Tool */}
      {activeTool === 'fornecedores_simples' ? (
        <FornecedoresSimplesAuditor />
      ) : (
        <SimuladorImpactoProdutos />
      )}

    </div>
  );
};

