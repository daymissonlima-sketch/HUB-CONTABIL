/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header, Footer } from './shared/components';
import {
  AuditoriaFiscalWorkspace,
  CalculadoraWorkspace,
  NfeXmlAuditor,
  ConsultaNfeWorkspace,
  DebtLevantamento,
  FaturamentoGerador,
  Comunicados,
  OpcaoSimplesNacional,
  ConfiguracoesGerais,
  ChaveSanitizer,
  LoginScreen,
  EmployeeManagerModal,
  clearUnlockedSession
} from './features';
import { 
  FileSpreadsheet, 
  Briefcase, 
  Menu, 
  Coins, 
  Settings, 
  Table, 
  FileText, 
  ShieldCheck, 
  Sparkles, 
  Calculator, 
  DownloadCloud, 
  Users, 
  LogOut 
} from 'lucide-react';
import { loadStoredCompanies } from './shared/utils';
import {
  getFirebaseSyncStatus,
  FIREBASE_SYNC_STATUS_EVENT,
  isMasterAdminEmail,
  useSefazRobot
} from './services';
import { signOutFirebase } from './firebase';

// Synchronously ensure companies storage is reconciled with the official database
try {
  loadStoredCompanies();
} catch (e) {}

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'auditoria_fiscal' | 'calculadora' | 'xml_auditor' | 'consulta_nfe' | 'debit_levantamento' | 'faturamento_gerador' | 'configuracoes_gerais' | 'comunicados' | 'opcao_simples_nacional' | 'chave_sanitizer'
  >('auditoria_fiscal');
  const [importedXmlsForAuditor, setImportedXmlsForAuditor] = useState<string[]>([]);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [syncStatus, setSyncStatus] = useState(() => getFirebaseSyncStatus());
  const [isSessionUnlocked, setIsSessionUnlocked] = useState(false);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);

  // Mantém o robô SEFAZ em execução contínua em segundo plano em todas as abas do sistema
  useSefazRobot(loadStoredCompanies(), '');

  useEffect(() => {
    const handleSyncChange = () => {
      const next = getFirebaseSyncStatus();
      setSyncStatus(next);
      if (!next.user) {
        setIsSessionUnlocked(false);
      }
    };
    window.addEventListener(FIREBASE_SYNC_STATUS_EVENT, handleSyncChange);
    return () => window.removeEventListener(FIREBASE_SYNC_STATUS_EVENT, handleSyncChange);
  }, []);

  const isUserAdmin =
    isMasterAdminEmail(syncStatus.user?.email) ||
    syncStatus.officeProfile?.cargo === 'ADMIN';

  if (!syncStatus.user || !isSessionUnlocked) {
    return (
      <LoginScreen
        syncStatus={syncStatus}
        onAuthenticated={() => setIsSessionUnlocked(true)}
      />
    );
  }

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

              {/* Button: Calculadora Fiscal (DIFAL Ceará & Tributos) */}
              <button
                onClick={() => setActiveTab('calculadora')}
                className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer ${
                  activeTab === 'calculadora'
                    ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                    : 'hover:bg-[#031d30] text-slate-300'
                }`}
                title="Módulo Calculadora de Tributos (Diferencial de Alíquota - DIFAL Ceará)"
              >
                <Calculator className={`h-4.5 w-4.5 shrink-0 ${activeTab === 'calculadora' ? 'text-[#04243b]' : 'text-[#e4b35e]'}`} />
                <span className="hidden sm:inline md:inline">Calculadora</span>
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

              {/* Button: Consulta NF-e (Módulo Exclusivo SEFAZ DFe) */}
              <button
                onClick={() => setActiveTab('consulta_nfe')}
                className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer ${
                  activeTab === 'consulta_nfe'
                    ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                    : 'hover:bg-[#031d30] text-slate-300'
                }`}
                title="Consulta e Download de NF-e na SEFAZ Nacional (DFe / PyNFe)"
              >
                <DownloadCloud className="h-4.5 w-4.5 shrink-0" />
                <span className="hidden sm:inline md:inline">Consulta NF-e</span>
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

              {/* Button 3: Débitos & Parcelamento (Módulo Consolidado Unificado) */}
              <button
                onClick={() => setActiveTab('debit_levantamento')}
                className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer ${
                  activeTab === 'debit_levantamento'
                    ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                    : 'hover:bg-[#031d30] text-slate-300'
                }`}
                title="Módulo Unificado de Levantamento de Débitos e Simulação de Parcelamento"
              >
                <Briefcase className="h-4.5 w-4.5 shrink-0" />
                <span className="hidden sm:inline md:inline">Débitos & Parcelamento</span>
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

              {/* Button 6: Configurações Gerais */}
              <button
                onClick={() => setActiveTab('configuracoes_gerais')}
                className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer mt-2 border-t border-[#e4b35e]/20 pt-2.5 ${
                  activeTab === 'configuracoes_gerais'
                    ? 'bg-[#e4b35e] text-[#04243b] shadow-sm'
                    : 'hover:bg-[#031d30] text-slate-300'
                }`}
                title="Configurações Gerais (Empresas e Assinaturas)"
              >
                <Settings className="h-4.5 w-4.5 shrink-0" />
                <span className="hidden sm:inline md:inline">Configurações Gerais</span>
              </button>

              {/* Botão Exclusivo Admin: Gestão de Funcionários */}
              {isUserAdmin && (
                <button
                  onClick={() => setIsEmployeeModalOpen(true)}
                  className="flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold w-full transition-all cursor-pointer hover:bg-[#031d30] text-[#e4b35e]"
                  title="Criar e Gerenciar Usuários dos Funcionários (Administrador)"
                >
                  <Users className="h-4.5 w-4.5 shrink-0 text-[#e4b35e]" />
                  <span className="hidden sm:inline md:inline">Usuários / Funcionários</span>
                </button>
              )}

            </nav>

            {/* Rodapé do Menu Lateral: Usuário Logado + Sair */}
            <div className="mt-auto p-3 border-t border-[#e4b35e]/20 bg-[#031d30]/70 space-y-2">
              <div className="px-1">
                <p className="text-[11px] font-bold text-white truncate">
                  {syncStatus.officeProfile?.nome || syncStatus.user?.displayName || 'Usuário'}
                </p>
                <p className="text-[10px] text-[#e4b35e] truncate">
                  {isUserAdmin ? 'Administrador' : 'Funcionário'} • {syncStatus.user?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  clearUnlockedSession();
                  setIsSessionUnlocked(false);
                  signOutFirebase();
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-400/25 text-[11px] font-bold transition-colors cursor-pointer"
                title="Encerrar sessão no sistema"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sair da Conta</span>
              </button>
            </div>

          </aside>
        )}

        {/* Right Main content stage - Full Width */}
        <main className="flex-1 min-w-0 w-full max-w-none px-2 sm:px-3 py-2.5 transition-all duration-300">
          
          {/* Collapse/Expand Sidebar Controller (only shown when sidebar is collapsed) */}
          {!isSidebarVisible && (
            <div className="mb-2.5 flex items-center justify-between">
              <button
                onClick={() => setIsSidebarVisible(true)}
                className="flex items-center justify-center p-2 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] border border-[#e4b35e]/30 rounded-xl transition-all duration-200 shadow-sm cursor-pointer"
                title="Expandir Menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          )}

          {activeTab === 'auditoria_fiscal' ? (
            <AuditoriaFiscalWorkspace />
          ) : activeTab === 'calculadora' ? (
            <CalculadoraWorkspace />
          ) : activeTab === 'xml_auditor' ? (
            <NfeXmlAuditor initialXmls={importedXmlsForAuditor} />
          ) : activeTab === 'consulta_nfe' ? (
            <ConsultaNfeWorkspace 
              onNavigateToAuditor={(xmls) => {
                setImportedXmlsForAuditor(xmls);
                setActiveTab('xml_auditor');
              }}
              onNavigateToConfig={() => setActiveTab('configuracoes_gerais')}
            />
          ) : activeTab === 'debit_levantamento' ? (
            <DebtLevantamento />
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

      {/* Modal de Gestão de Funcionários (Administrador) */}
      <EmployeeManagerModal
        isOpen={isEmployeeModalOpen}
        onClose={() => setIsEmployeeModalOpen(false)}
        currentUserEmail={syncStatus.user?.email}
      />

    </div>
  );
}
