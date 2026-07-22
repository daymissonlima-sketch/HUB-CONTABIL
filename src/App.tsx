/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { NfeXmlAuditor } from './components/NfeXmlAuditor';
import { DebtLevantamento } from './components/DebtLevantamento';
import { ParcelamentoSimulador } from './components/ParcelamentoSimulador';
import { FaturamentoGerador } from './components/FaturamentoGerador';
import { ConfiguracoesGerais } from './components/ConfiguracoesGerais';
import { AuditoriaFiscalWorkspace } from './components/AuditoriaFiscalWorkspace';
import { Comunicados } from './components/Comunicados';
import { OpcaoSimplesNacional } from './components/OpcaoSimplesNacional';
import { ChaveSanitizer } from './components/ChaveSanitizer';
import { FileSpreadsheet, Briefcase, Menu, Calculator, Coins, Settings, Table, FileText, ShieldCheck, Sparkles } from 'lucide-react';

// Synchronously purge all records referencing MODULUS or CNPJ 37.345.284/0001-68
try {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const val = localStorage.getItem(key);
      if (val) {
        const upperVal = val.toUpperCase();
        const hasModulus = upperVal.includes('MODULUS') || val.includes('37345284') || val.includes('37.345.284');
        if (hasModulus) {
          if (key === 'moreira_lima_companies') {
            try {
              const list = JSON.parse(val);
              if (Array.isArray(list)) {
                const filtered = list.filter((c: any) => {
                  const name = (c.razaoSocial || '').toUpperCase();
                  const cnpj = (c.cnpj || '').replace(/\D/g, '');
                  return !name.includes('MODULUS') && !cnpj.includes('37345284');
                });
                localStorage.setItem('moreira_lima_companies', JSON.stringify(filtered));
              }
            } catch {
              localStorage.removeItem('moreira_lima_companies');
            }
          } else if (key === 'debt_client_info') {
            localStorage.removeItem('debt_client_info');
          } else if (key === 'debt_items') {
            localStorage.removeItem('debt_items');
          } else {
            localStorage.removeItem(key);
          }
        }
      }
    }
  }
} catch (e) {}

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'auditoria_fiscal' | 'xml_auditor' | 'debit_levantamento' | 'parcelamento_simulador' | 'faturamento_gerador' | 'configuracoes_gerais' | 'comunicados' | 'opcao_simples_nacional' | 'chave_sanitizer'
  >('auditoria_fiscal');
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
            <div className="px-4 py-2.5 border-b border-[#e4b35e]/15 flex items-center justify-between bg-[#031d30]/50">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#e4b35e]">
                Módulos
              </span>
              <button 
                onClick={() => setIsSidebarVisible(false)}
                className="p-1.5 rounded-lg hover:bg-[#04243b] text-slate-300 transition-colors cursor-pointer"
                title="Recolher Menu"
              >
                <Menu className="h-4 w-4 text-[#e4b35e]" />
              </button>
            </div>

            {/* Navigation Buttons list */}
            <nav className="p-3 space-y-1 flex flex-row md:flex-col items-center justify-around md:justify-start w-full md:space-y-1.5">
              
              {/* Button: Auditoria Fiscal (Unified Cockpit) */}
              <button
                onClick={() => setActiveTab('auditoria_fiscal')}
                className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer ${
                  activeTab === 'auditoria_fiscal'
                    ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                    : 'hover:bg-[#031d30] text-slate-300'
                }`}
                title="Cockpit de Auditoria Fiscal & Data Lake"
              >
                <Table className={`h-4.5 w-4.5 shrink-0 ${activeTab === 'auditoria_fiscal' ? 'text-[#04243b]' : 'text-[#e4b35e]'}`} />
                <span className="hidden sm:inline md:inline">Auditoria Fiscal</span>
              </button>

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

              {/* Button: Saneador de Chaves */}
              <button
                onClick={() => setActiveTab('chave_sanitizer')}
                className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer ${
                  activeTab === 'chave_sanitizer'
                    ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                    : 'hover:bg-[#031d30] text-slate-300'
                }`}
                title="Saneador de Chaves de Acesso (Modelos 55 e 65)"
              >
                <Sparkles className="h-4.5 w-4.5 shrink-0" />
                <span className="hidden sm:inline md:inline">Saneador de Chaves</span>
              </button>

              {/* Button 3: Debt Levantamento (Existing module) */}
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

              {/* Button 4: Simulação de Parcelamento (New module) */}
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

              {/* Button 5: Geração de Faturamento (New module) */}
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

              {/* Button 6: Comunicados Institucionais */}
              <button
                onClick={() => setActiveTab('comunicados')}
                className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer ${
                  activeTab === 'comunicados'
                    ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                    : 'hover:bg-[#031d30] text-slate-300'
                }`}
                title="Comunicados Institucionais (A4 Timbrado)"
              >
                <FileText className="h-4.5 w-4.5 shrink-0" />
                <span className="hidden sm:inline md:inline">Comunicados</span>
              </button>

              {/* Button 7: Opção Simples Nacional */}
              <button
                onClick={() => setActiveTab('opcao_simples_nacional')}
                className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer ${
                  activeTab === 'opcao_simples_nacional'
                    ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                    : 'hover:bg-[#031d30] text-slate-300'
                }`}
                title="Consulta e Relatório de Opção pelo Simples Nacional (API Pública)"
              >
                <ShieldCheck className="h-4.5 w-4.5 shrink-0" />
                <span className="hidden sm:inline md:inline">Opção Simples</span>
              </button>

              {/* Button 6: Configurações Gerais (Logotipo up to 5MB and Reports) */}
              <button
                onClick={() => setActiveTab('configuracoes_gerais')}
                className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer mt-2 border-t border-[#e4b35e]/20 pt-2.5 ${
                  activeTab === 'configuracoes_gerais'
                    ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                    : 'hover:bg-[#031d30] text-slate-300'
                }`}
                title="Configurações Gerais e Logotipo"
              >
                <Settings className="h-4.5 w-4.5 shrink-0" />
                <span className="hidden sm:inline md:inline">Configurações Gerais</span>
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

          {activeTab === 'auditoria_fiscal' ? (
            <AuditoriaFiscalWorkspace />
          ) : activeTab === 'xml_auditor' ? (
            <NfeXmlAuditor />
          ) : activeTab === 'debit_levantamento' ? (
            <DebtLevantamento />
          ) : activeTab === 'parcelamento_simulador' ? (
            <ParcelamentoSimulador />
          ) : activeTab === 'chave_sanitizer' ? (
            <ChaveSanitizer />
          ) : activeTab === 'comunicados' ? (
            <Comunicados />
          ) : activeTab === 'opcao_simples_nacional' ? (
            <OpcaoSimplesNacional />
          ) : activeTab === 'configuracoes_gerais' ? (
            <ConfiguracoesGerais />
          ) : (
            <FaturamentoGerador onNavigateToConfig={() => setActiveTab('configuracoes_gerais')} />
          )}
        </main>

      </div>

      {/* 3. Footer (Rodapé) */}
      <Footer />

    </div>
  );
}
