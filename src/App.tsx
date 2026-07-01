/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { NfeXmlAuditor } from './components/NfeXmlAuditor';
import { DebtLevantamento } from './components/DebtLevantamento';
import { ParcelamentoSimulador } from './components/ParcelamentoSimulador';
import { FaturamentoGerador } from './components/FaturamentoGerador';
import { FileSpreadsheet, Briefcase, Menu, X, Calculator, Coins } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'xml_auditor' | 'debit_levantamento' | 'parcelamento_simulador' | 'faturamento_gerador'
  >('debit_levantamento');
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  return (
    <div 
      className="min-h-screen flex flex-col bg-slate-50 font-sans antialiased text-slate-800"
      style={{ zoom: '80%' }}
    >
      
      {/* 1. Corporate Header (Rodateto) */}
      <Header />

      {/* Main Body - Split into Left Sidebar and Right Main Panel */}
      <div className="flex-grow flex flex-col md:flex-row">
        
        {/* Left Navigation Sidebar */}
        {isSidebarVisible && (
          <aside className="w-full md:w-64 bg-[#04243b] text-slate-200 border-r border-[#e4b35e]/20 flex flex-col shrink-0 animate-fadeIn">
            
            {/* Header with three-bar icon inside the menu */}
            <div className="p-4 border-b border-[#e4b35e]/15 flex items-center justify-start">
              <button 
                onClick={() => setIsSidebarVisible(false)}
                className="p-1.5 rounded-lg hover:bg-[#031d30] text-slate-300 transition-colors cursor-pointer"
                title="Recolher Menu"
              >
                <Menu className="h-5 w-5 text-[#e4b35e]" />
              </button>
            </div>

            {/* Navigation Buttons list */}
            <nav className="p-3 space-y-1 flex flex-row md:flex-col items-center justify-around md:justify-start w-full md:space-y-1.5">
              
              {/* Button 1: XML Nfe Auditor (Existing module) */}
              <button
                onClick={() => setActiveTab('xml_auditor')}
                className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer ${
                  activeTab === 'xml_auditor'
                    ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                    : 'hover:bg-[#031d30] text-slate-300'
                }`}
                title="Auditor XML NFe 4.00"
              >
                <FileSpreadsheet className="h-4.5 w-4.5 shrink-0" />
                <span className="hidden sm:inline md:inline">Auditor XML NF-e</span>
              </button>

              {/* Button 2: Debt Levantamento (Existing module) */}
              <button
                onClick={() => setActiveTab('debit_levantamento')}
                className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer ${
                  activeTab === 'debit_levantamento'
                    ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                    : 'hover:bg-[#031d30] text-slate-300'
                }`}
                title="Levantamento de Débitos"
              >
                <Briefcase className="h-4.5 w-4.5 shrink-0" />
                <span className="hidden sm:inline md:inline">Levantamento de Débitos</span>
              </button>

              {/* Button 3: Simulação de Parcelamento (New module) */}
              <button
                onClick={() => setActiveTab('parcelamento_simulador')}
                className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer ${
                  activeTab === 'parcelamento_simulador'
                    ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                    : 'hover:bg-[#031d30] text-slate-300'
                }`}
                title="Simulação de Parcelamento de Débitos"
              >
                <Calculator className="h-4.5 w-4.5 shrink-0" />
                <span className="hidden sm:inline md:inline">Simular Parcelamento</span>
              </button>

              {/* Button 4: Geração de Faturamento (New module) */}
              <button
                onClick={() => setActiveTab('faturamento_gerador')}
                className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer ${
                  activeTab === 'faturamento_gerador'
                    ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                    : 'hover:bg-[#031d30] text-slate-300'
                }`}
                title="Geração de Faturamento de Empresas"
              >
                <Coins className="h-4.5 w-4.5 shrink-0" />
                <span className="hidden sm:inline md:inline">Geração de Faturamento</span>
              </button>

            </nav>



          </aside>
        )}

        {/* Right Main content stage */}
        <main className={`flex-grow w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 transition-all duration-300 ${
          isSidebarVisible ? 'max-w-7xl' : 'max-w-full'
        }`}>
          
          {/* Collapse/Expand Sidebar Controller */}
          <div className="mb-4 flex items-center justify-between">
            {!isSidebarVisible ? (
              <button
                onClick={() => setIsSidebarVisible(true)}
                className="flex items-center justify-center p-2 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] border border-[#e4b35e]/30 rounded-xl transition-all duration-200 shadow-sm cursor-pointer"
                title="Expandir Menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            ) : (
              <div /> // spacer
            )}

          </div>

          {activeTab === 'xml_auditor' ? (
            <NfeXmlAuditor />
          ) : activeTab === 'debit_levantamento' ? (
            <DebtLevantamento />
          ) : activeTab === 'parcelamento_simulador' ? (
            <ParcelamentoSimulador />
          ) : (
            <FaturamentoGerador />
          )}
        </main>

      </div>

      {/* 3. Footer (Rodapé) */}
      <Footer />

    </div>
  );
}
