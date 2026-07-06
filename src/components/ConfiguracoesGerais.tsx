/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Trash2, 
  Image as ImageIcon,
  CheckCircle, 
  AlertCircle, 
  Building2, 
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  Sliders,
  Users,
  Plus,
  Edit,
  Search,
  ArrowLeft,
  Check,
  Briefcase,
  RefreshCw,
  Eye,
  MapPin,
  FileText,
  Clock,
  Play,
  X
} from 'lucide-react';
import { Logo } from './Logo';
import { setAppLogoPath, resetAppLogoPath, getAppLogoScale, setAppLogoScale } from '../utils/logoHelper';
import { Company, Accountant } from '../types_debits';
import importedCompaniesJson from '../data/imported_companies.json';
import { fetchCnpjSafe, parseCnpjResponseData } from '../utils/cnpjHelper';

interface BatchUpdateItemStatus {
  id: string;
  cnpj: string;
  razaoSocial: string;
  status: 'waiting' | 'updating' | 'success' | 'error';
  message?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const DEFAULT_NEW_COMPANY: Omit<Company, 'id' | 'createdAt'> = {
  razaoSocial: '',
  cnpj: '',
  regimeTributario: 'LUCRO_REAL',
  vendaVistaPercent: 10,
  vendaPrazoPercent: 90,
  endereco: '',
  cidade: 'Fortaleza (CE)',
  cep: '',
  inscEst: '',
  pmr: 21,
  pr: 'R',
  cartoesPercent: 0,
  chequesPercent: 0,
  duplicatasPercent: 100,
  contadorNome: 'PAULO HENRIQUE DE F. MOREIRA',
  contadorCrc: 'CRC CE 022956-O6',
  quadroSocietario: [],
  municipio: '',
  estado: '',
  uf: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  email: '',
  telefone: '',
  telefoneSecundario: '',
  cnaePrincipalCodigo: '',
  cnaePrincipalDescricao: '',
  cnaesSecundarios: [],
  naturezaJuridicaCodigo: '',
  naturezaJuridicaDescricao: '',
  porte: '',
  situacaoCadastral: '',
  motivoSituacaoCadastral: '',
  sociosDetalhados: [],
  opcaoSimples: false,
  dataOpcaoSimples: '',
  dataExclusaoSimples: '',
  opcaoMei: false,
  situacaoInscEst: '',
  inscMun: ''
};

const DEFAULT_ACCOUNTANTS: Accountant[] = [
  {
    id: 'paulo',
    nome: 'PAULO HENRIQUE DE FIGUEIREDO MOREIRA',
    cpf: '667.001.673-53',
    crc: 'CRC CE 022956-O6'
  },
  {
    id: 'daymisson',
    nome: 'DAYMISSON LIMA DA COSTA',
    cpf: '053.128.993-13',
    crc: 'CRC CE 027436/O'
  }
];

export function ConfiguracoesGerais() {
  const [activeTab, setActiveTab] = useState<'empresas' | 'assinaturas' | 'identidade'>('empresas');

  // Identidade Visual & Logo states
  const [logoScale, setLogoScaleState] = useState<number>(getAppLogoScale());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Empresas state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyScreen, setCompanyScreen] = useState<'list' | 'form'>('list');
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false);
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; success: number; errors: number; currentName?: string } | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchItemsStatus, setBatchItemsStatus] = useState<BatchUpdateItemStatus[]>([]);
  const [batchFinished, setBatchFinished] = useState(false);
  const [viewingCompanyDetails, setViewingCompanyDetails] = useState<Company | null>(null);
  const [newCompany, setNewCompany] = useState<Omit<Company, 'id' | 'createdAt'>>({ ...DEFAULT_NEW_COMPANY });

  // Assinaturas / Contadores state
  const [accountants, setAccountants] = useState<Accountant[]>([]);
  const [selectedAccountantId, setSelectedAccountantId] = useState<string>('paulo');
  const [accountantScreen, setAccountantScreen] = useState<'list' | 'form'>('list');
  const [accountantSearchQuery, setAccountantSearchQuery] = useState('');
  const [editingAccountantId, setEditingAccountantId] = useState<string | null>(null);
  const [newAccountant, setNewAccountant] = useState<Omit<Accountant, 'id'>>({
    nome: '',
    cpf: '',
    crc: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carregar dados iniciais de Empresas e Assinaturas
  useEffect(() => {
    const importedList = (importedCompaniesJson as unknown) as Company[];
    const storedComp = localStorage.getItem('moreira_lima_companies');
    let mergedCompanies: Company[] = [...importedList];

    if (storedComp) {
      try {
        const parsed = (JSON.parse(storedComp) as Company[]).filter(c => !c.id.startsWith('demo-'));
        const existingCnpjs = new Set(parsed.map(c => c.cnpj.replace(/\D/g, '')));
        const newFromImport = importedList.filter(c => !existingCnpjs.has(c.cnpj.replace(/\D/g, '')));
        mergedCompanies = [...parsed, ...newFromImport];
      } catch (err) {
        console.error('Erro ao ler empresas do localStorage:', err);
      }
    }

    mergedCompanies.sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '', 'pt-BR', { sensitivity: 'base' }));
    setCompanies(mergedCompanies);

    const storedAcc = localStorage.getItem('moreira_lima_accountants');
    if (storedAcc) {
      try {
        setAccountants(JSON.parse(storedAcc));
      } catch {
        setAccountants(DEFAULT_ACCOUNTANTS);
      }
    } else {
      setAccountants(DEFAULT_ACCOUNTANTS);
      localStorage.setItem('moreira_lima_accountants', JSON.stringify(DEFAULT_ACCOUNTANTS));
    }

    const storedSel = localStorage.getItem('moreira_lima_selected_accountant');
    if (storedSel) {
      setSelectedAccountantId(storedSel);
    } else {
      setSelectedAccountantId('paulo');
    }
  }, []);

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setSuccessMsg(null);
    } else {
      setSuccessMsg(msg);
      setErrorMsg(null);
    }
    setTimeout(() => {
      setErrorMsg(null);
      setSuccessMsg(null);
    }, 5000);
  };

  const formatCNPJ = (val: string) => {
    const clean = val.replace(/\D/g, "");
    if (clean.length <= 2) return clean;
    if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`;
    if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
    if (clean.length <= 12) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`;
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
  };

  // Funções de Gestão de Empresas
  const saveCompaniesToStorage = (updatedList: Company[]) => {
    const sorted = [...updatedList].sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '', 'pt-BR', { sensitivity: 'base' }));
    setCompanies(sorted);
    localStorage.setItem('moreira_lima_companies', JSON.stringify(sorted));
    window.dispatchEvent(new Event('moreira_lima_companies_updated'));
  };

  const handleVistaChange = (val: number) => {
    const vista = Math.min(100, Math.max(0, val));
    const prazo = 100 - vista;
    setNewCompany(prev => ({
      ...prev,
      vendaVistaPercent: vista,
      vendaPrazoPercent: prazo
    }));
  };

  const handlePrazoChange = (val: number) => {
    const prazo = Math.min(100, Math.max(0, val));
    const vista = 100 - prazo;
    setNewCompany(prev => ({
      ...prev,
      vendaVistaPercent: vista,
      vendaPrazoPercent: prazo
    }));
  };

  const handleFetchCnpjData = async () => {
    const clean = newCompany.cnpj.replace(/\D/g, "");
    if (clean.length !== 14) {
      showNotification("Por favor, digite um CNPJ válido com 14 dígitos.", true);
      return;
    }

    setIsFetchingCnpj(true);
    try {
      const data = await fetchCnpjSafe(clean);
      const parsed = parseCnpjResponseData(data);
      
      setNewCompany(prev => ({
        ...prev,
        razaoSocial: parsed.razaoSocial,
        cnpj: formatCNPJ(clean),
        endereco: parsed.enderecoFormatted,
        cidade: parsed.cidadeFormatted,
        cep: parsed.cep,
        regimeTributario: parsed.regime as any,
        quadroSocietario: parsed.quadro,
        municipio: parsed.municipioNome,
        estado: parsed.estadoNome,
        uf: parsed.estadoSigla,
        logradouro: parsed.logradouro,
        numero: parsed.numero,
        complemento: parsed.complemento,
        bairro: parsed.bairro,
        email: parsed.email,
        telefone: parsed.telefone,
        telefoneSecundario: parsed.telefoneSecundario,
        cnaePrincipalCodigo: parsed.cnaePrincipalCodigo,
        cnaePrincipalDescricao: parsed.cnaePrincipalDescricao,
        cnaesSecundarios: parsed.cnaesSecundarios,
        naturezaJuridicaCodigo: parsed.naturezaJuridicaCodigo,
        naturezaJuridicaDescricao: parsed.naturezaJuridicaDescricao,
        porte: parsed.porte,
        situacaoCadastral: parsed.situacaoCadastral,
        motivoSituacaoCadastral: parsed.motivoSituacaoCadastral,
        sociosDetalhados: parsed.sociosDetalhados,
        opcaoSimples: parsed.opcaoSimples,
        dataOpcaoSimples: parsed.dataOpcaoSimples,
        dataExclusaoSimples: parsed.dataExclusaoSimples,
        opcaoMei: parsed.opcaoMei,
        inscEst: parsed.inscEst || prev.inscEst,
        situacaoInscEst: parsed.situacaoInscEst,
        inscMun: parsed.inscMun || prev.inscMun
      }));

      showNotification("Dados do CNPJ importados com todos os campos complementares preenchidos!");
    } catch (err: any) {
      console.error(err);
      showNotification(err.message || "Falha na comunicação ao buscar dados do CNPJ.", true);
    } finally {
      setIsFetchingCnpj(false);
    }
  };

  const handleOpenBatchModal = () => {
    if (companies.length === 0) {
      showNotification("Nenhuma empresa cadastrada para atualizar.", true);
      return;
    }
    const initialList: BatchUpdateItemStatus[] = companies.map(c => ({
      id: c.id,
      cnpj: c.cnpj,
      razaoSocial: c.razaoSocial || c.cnpj,
      status: 'waiting',
      message: 'Aguardando consulta na RFB'
    }));
    setBatchItemsStatus(initialList);
    setBatchProgress(null);
    setBatchFinished(false);
    setShowBatchModal(true);
  };

  const startBatchUpdateAll = async () => {
    setIsBatchUpdating(true);
    setBatchFinished(false);
    let successCount = 0;
    let errorCount = 0;
    const updatedCompanies = [...companies];

    for (let i = 0; i < updatedCompanies.length; i++) {
      const company = updatedCompanies[i];
      
      setBatchItemsStatus(prev => prev.map(item => 
        item.id === company.id ? { ...item, status: 'updating', message: 'Consultando API da Receita Federal...' } : item
      ));

      setBatchProgress({
        current: i + 1,
        total: updatedCompanies.length,
        success: successCount,
        errors: errorCount,
        currentName: company.razaoSocial || company.cnpj
      });

      const cleanCnpj = company.cnpj.replace(/\D/g, "");
      if (cleanCnpj.length === 14) {
        try {
          const data = await fetchCnpjSafe(cleanCnpj);
          const parsed = parseCnpjResponseData(data);

          updatedCompanies[i] = {
            ...company,
            razaoSocial: parsed.razaoSocial || company.razaoSocial,
            endereco: parsed.enderecoFormatted || company.endereco,
            cidade: parsed.cidadeFormatted || company.cidade,
            cep: parsed.cep || company.cep,
            regimeTributario: (parsed.regime as any) || company.regimeTributario,
            quadroSocietario: parsed.quadro?.length ? parsed.quadro : company.quadroSocietario,
            municipio: parsed.municipioNome || company.municipio,
            estado: parsed.estadoNome || company.estado,
            uf: parsed.estadoSigla || company.uf,
            logradouro: parsed.logradouro || company.logradouro,
            numero: parsed.numero || company.numero,
            complemento: parsed.complemento || company.complemento,
            bairro: parsed.bairro || company.bairro,
            email: parsed.email || company.email,
            telefone: parsed.telefone || company.telefone,
            telefoneSecundario: parsed.telefoneSecundario || company.telefoneSecundario,
            cnaePrincipalCodigo: parsed.cnaePrincipalCodigo || company.cnaePrincipalCodigo,
            cnaePrincipalDescricao: parsed.cnaePrincipalDescricao || company.cnaePrincipalDescricao,
            cnaesSecundarios: parsed.cnaesSecundarios?.length ? parsed.cnaesSecundarios : company.cnaesSecundarios,
            naturezaJuridicaCodigo: parsed.naturezaJuridicaCodigo || company.naturezaJuridicaCodigo,
            naturezaJuridicaDescricao: parsed.naturezaJuridicaDescricao || company.naturezaJuridicaDescricao,
            porte: parsed.porte || company.porte,
            situacaoCadastral: parsed.situacaoCadastral || company.situacaoCadastral,
            motivoSituacaoCadastral: parsed.motivoSituacaoCadastral || company.motivoSituacaoCadastral,
            sociosDetalhados: parsed.sociosDetalhados?.length ? parsed.sociosDetalhados : company.sociosDetalhados,
            opcaoSimples: parsed.opcaoSimples ?? company.opcaoSimples,
            dataOpcaoSimples: parsed.dataOpcaoSimples || company.dataOpcaoSimples,
            dataExclusaoSimples: parsed.dataExclusaoSimples || company.dataExclusaoSimples,
            opcaoMei: parsed.opcaoMei ?? company.opcaoMei,
            inscEst: parsed.inscEst || company.inscEst,
            situacaoInscEst: parsed.situacaoInscEst || company.situacaoInscEst,
            inscMun: parsed.inscMun || company.inscMun
          };
          successCount++;
          setBatchItemsStatus(prev => prev.map(item => 
            item.id === company.id ? { ...item, status: 'success', razaoSocial: parsed.razaoSocial || company.razaoSocial, message: 'Cadastros e CNAEs atualizados com sucesso' } : item
          ));
        } catch (err: any) {
          console.error(`Falha ao atualizar ${company.cnpj}:`, err);
          errorCount++;
          setBatchItemsStatus(prev => prev.map(item => 
            item.id === company.id ? { ...item, status: 'error', message: err.message || 'Erro na consulta do CNPJ' } : item
          ));
        }
        await new Promise(resolve => setTimeout(resolve, 350));
      } else {
        errorCount++;
        setBatchItemsStatus(prev => prev.map(item => 
          item.id === company.id ? { ...item, status: 'error', message: 'CNPJ inválido (14 dígitos requeridos)' } : item
        ));
      }

      setBatchProgress({
        current: i + 1,
        total: updatedCompanies.length,
        success: successCount,
        errors: errorCount,
        currentName: company.razaoSocial || company.cnpj
      });
    }

    saveCompaniesToStorage(updatedCompanies);
    setCompanies(updatedCompanies);
    setIsBatchUpdating(false);
    setBatchFinished(true);
    showNotification(`Atualização em lote concluída! ${successCount} atualizadas com sucesso${errorCount > 0 ? `, ${errorCount} com erro` : ''}.`);
  };

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.razaoSocial || !newCompany.cnpj) {
      showNotification('Por favor, preencha Razão Social e CNPJ.', true);
      return;
    }

    let updated: Company[];
    if (editingCompanyId) {
      updated = companies.map(c => c.id === editingCompanyId ? {
        ...newCompany,
        id: c.id,
        createdAt: c.createdAt
      } as Company : c);
      setEditingCompanyId(null);
    } else {
      const companyToAdd: Company = {
        ...newCompany,
        id: 'comp_' + Date.now(),
        createdAt: new Date().toISOString()
      };
      updated = [companyToAdd, ...companies];
    }

    saveCompaniesToStorage(updated);
    setNewCompany({ ...DEFAULT_NEW_COMPANY });
    setCompanyScreen('list');
    showNotification('Empresa salva com sucesso!');
  };

  const handleDeleteCompany = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Deseja realmente excluir esta empresa do cadastro central do sistema?')) return;
    const updated = companies.filter(c => c.id !== id);
    saveCompaniesToStorage(updated);
    showNotification('Empresa excluída com sucesso.');
  };

  // Funções de Gestão de Assinaturas / Contadores
  const handleSaveAccountant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountant.nome || !newAccountant.cpf || !newAccountant.crc) {
      showNotification('Preencha Nome, CPF e CRC.', true);
      return;
    }

    let updatedList: Accountant[];
    if (editingAccountantId) {
      updatedList = accountants.map(acc => 
        acc.id === editingAccountantId 
          ? { ...acc, nome: newAccountant.nome.toUpperCase(), cpf: newAccountant.cpf, crc: newAccountant.crc.toUpperCase() }
          : acc
      );
      setEditingAccountantId(null);
    } else {
      const newId = `acc_${Date.now()}`;
      updatedList = [
        ...accountants,
        {
          id: newId,
          nome: newAccountant.nome.toUpperCase(),
          cpf: newAccountant.cpf,
          crc: newAccountant.crc.toUpperCase()
        }
      ];
    }

    setAccountants(updatedList);
    localStorage.setItem('moreira_lima_accountants', JSON.stringify(updatedList));
    window.dispatchEvent(new Event('moreira_lima_accountants_updated'));
    setNewAccountant({ nome: '', cpf: '', crc: '' });
    setAccountantScreen('list');
    showNotification('Assinatura do contador atualizada com sucesso!');
  };

  const handleDeleteAccountant = (id: string) => {
    if (accountants.length <= 1) {
      showNotification('O sistema deve manter pelo menos um contador cadastrado.', true);
      return;
    }
    if (!confirm('Deseja realmente excluir esta assinatura técnica?')) return;
    const updatedList = accountants.filter(acc => acc.id !== id);
    setAccountants(updatedList);
    localStorage.setItem('moreira_lima_accountants', JSON.stringify(updatedList));
    window.dispatchEvent(new Event('moreira_lima_accountants_updated'));
    if (selectedAccountantId === id) {
      const fallbackId = updatedList[0].id;
      setSelectedAccountantId(fallbackId);
      localStorage.setItem('moreira_lima_selected_accountant', fallbackId);
    }
    showNotification('Contador excluído com sucesso.');
  };

  const selectAccountant = (id: string) => {
    setSelectedAccountantId(id);
    localStorage.setItem('moreira_lima_selected_accountant', id);
    window.dispatchEvent(new Event('moreira_lima_accountants_updated'));
    showNotification('Responsável técnico ativo selecionado.');
  };

  // Funções de Gestão de Identidade Visual / Logotipo
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      showNotification(`O arquivo selecionado (${(file.size / 1024 / 1024).toFixed(2)} MB) excede o limite máximo permitido de 5 MB.`, true);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      showNotification('Por favor, selecione um arquivo de imagem válido (PNG, JPG, SVG ou WEBP).', true);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setAppLogoPath(reader.result);
        showNotification('Logotipo importado e salvo com sucesso! Todas as barras e relatórios foram atualizados.');
      }
    };
    reader.onerror = () => {
      showNotification('Erro ao processar a imagem do logotipo.', true);
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = () => {
    resetAppLogoPath();
    showNotification('Logotipo restaurado para o padrão do escritório Moreira & Lima.');
  };

  const handleScaleChange = (val: number) => {
    const clamped = parseFloat(Math.min(2.0, Math.max(0.5, val)).toFixed(2));
    setLogoScaleState(clamped);
    setAppLogoScale(clamped);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Header Banner */}
      <div className="bg-[#04243b] text-slate-100 p-6 rounded-2xl border border-[#e4b35e]/30 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-[#e4b35e]" />
            Configurações Gerais e Cadastros Centralizados
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Centralize os cadastros de Empresas Clientes, Assinaturas Técnicas de Contadores e a Identidade Visual corporativa para todo o sistema.
          </p>
        </div>
        <div className="shrink-0">
          <Logo origin="right center" />
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3 text-xs font-medium">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </motion.div>
      )}

      {successMsg && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3 text-xs font-medium">
          <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </motion.div>
      )}

      {/* Tabs de Navegação Central */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => { setActiveTab('empresas'); setCompanyScreen('list'); }}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'empresas'
              ? 'bg-[#04243b] text-[#e4b35e] shadow-md'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <Briefcase className="h-4 w-4" />
          Cadastro de Empresas ({companies.length})
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('assinaturas'); setAccountantScreen('list'); }}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'assinaturas'
              ? 'bg-[#04243b] text-[#e4b35e] shadow-md'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <Users className="h-4 w-4" />
          Assinaturas de Contadores ({accountants.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('identidade')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'identidade'
              ? 'bg-[#04243b] text-[#e4b35e] shadow-md'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          Logotipo & Padronização de Relatórios
        </button>
      </div>

      {/* ABA 1: GESTÃO DE EMPRESAS */}
      {activeTab === 'empresas' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          {companyScreen === 'list' ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pb-4 border-b border-slate-200">
                <div className="relative w-full sm:max-w-md">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={companySearchQuery}
                    onChange={(e) => setCompanySearchQuery(e.target.value)}
                    placeholder="Pesquisar por razão social ou CNPJ..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-[#04243b] focus:bg-white transition-all"
                  />
                </div>
                
                <div className="flex items-center gap-2.5 flex-wrap justify-end">
                  <button
                    type="button"
                    onClick={handleOpenBatchModal}
                    disabled={isBatchUpdating}
                    className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs uppercase flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer shrink-0"
                    title="Atualiza todos os cadastros na API de CNPJ e visualiza progresso"
                  >
                    <RefreshCw className={`h-4 w-4 text-white ${isBatchUpdating ? 'animate-spin' : ''}`} />
                    {isBatchUpdating ? 'Atualização em Andamento (Ver Progresso)' : 'Atualizar Cadastros em Lote'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCompanyId(null);
                      setNewCompany({ ...DEFAULT_NEW_COMPANY });
                      setCompanyScreen('form');
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 bg-[#04243b] hover:bg-[#031d30] text-white font-bold rounded-xl text-xs uppercase flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer shrink-0"
                  >
                    <Plus className="h-4 w-4 text-[#e4b35e]" />
                    Incluir Nova Empresa
                  </button>
                </div>
              </div>

              {batchProgress && (
                <div 
                  onClick={() => setShowBatchModal(true)}
                  className="mb-4 bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-emerald-900 shadow-sm cursor-pointer hover:bg-emerald-100/70 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <RefreshCw className="h-5 w-5 text-emerald-600 animate-spin shrink-0" />
                    <div>
                      <p className="font-bold">Atualização em lote via consulta CNPJ em andamento... (Clique para ver detalhes)</p>
                      <p className="text-emerald-700">Empresa atual: <span className="font-semibold">{batchProgress.currentName}</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-bold bg-white px-3 py-1 rounded-lg border border-emerald-300 shadow-2xs">
                      {batchProgress.current} / {batchProgress.total} ({Math.round((batchProgress.current / batchProgress.total) * 100)}%)
                    </span>
                    <span className="text-emerald-800 font-bold bg-emerald-200/60 px-2.5 py-1 rounded-lg">
                      Sucesso: {batchProgress.success} | Erros: {batchProgress.errors}
                    </span>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-5 py-3">Razão Social / CNPJ</th>
                      <th className="px-5 py-3">Divisão de Vendas</th>
                      <th className="px-5 py-3">Regime Tributário</th>
                      <th className="px-5 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {companies.filter(c => {
                      const q = companySearchQuery.toUpperCase().trim();
                      if (!q) return true;
                      return c.razaoSocial.toUpperCase().includes(q) || c.cnpj.includes(q);
                    }).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-10 text-center text-slate-400 italic">
                          Nenhuma empresa encontrada na busca.
                        </td>
                      </tr>
                    ) : (
                      companies.filter(c => {
                        const q = companySearchQuery.toUpperCase().trim();
                        if (!q) return true;
                        return c.razaoSocial.toUpperCase().includes(q) || c.cnpj.includes(q);
                      }).map((company) => (
                        <tr key={company.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="font-bold text-slate-800">{company.razaoSocial}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">CNPJ: {company.cnpj}</div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-semibold text-slate-700">Vista: <strong className="text-emerald-700">{company.vendaVistaPercent}%</strong></span>
                            <span className="mx-2 text-slate-300">|</span>
                            <span className="font-semibold text-slate-700">Prazo: <strong className="text-blue-700">{company.vendaPrazoPercent}%</strong></span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="px-2 py-1 bg-slate-100 text-[#04243b] text-[10px] font-bold rounded uppercase">
                              {company.regimeTributario.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewingCompanyDetails(company)}
                                className="p-2 rounded-lg text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 transition-all cursor-pointer"
                                title="Ver Detalhes Importados via API"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCompanyId(company.id);
                                  setNewCompany({ ...DEFAULT_NEW_COMPANY, ...company });
                                  setCompanyScreen('form');
                                }}
                                className="p-2 rounded-lg text-slate-500 hover:text-[#04243b] hover:bg-slate-100 transition-all cursor-pointer"
                                title="Editar Cadastro"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteCompany(company.id, e)}
                                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 transition-all cursor-pointer"
                                title="Excluir Empresa"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Formulário de Empresa */
            <div className="space-y-6 max-w-2xl mx-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => { setCompanyScreen('list'); setEditingCompanyId(null); }}
                  className="text-slate-500 hover:text-slate-800 text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar à Lista de Empresas
                </button>
                <h3 className="text-sm font-extrabold text-[#04243b] uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[#e4b35e]" />
                  {editingCompanyId ? 'Editar Cadastro de Empresa' : 'Cadastrar Nova Empresa'}
                </h3>
              </div>

              <form onSubmit={handleSaveCompany} className="space-y-6">
                {/* 1. Identificação Principal e Tributação */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                  <h4 className="text-xs font-extrabold text-[#04243b] uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Building2 className="h-4 w-4 text-[#e4b35e]" />
                    1. Identificação Principal e Tributação
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Razão Social</label>
                      <input
                        type="text"
                        value={newCompany.razaoSocial}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, razaoSocial: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#04243b]/30"
                        placeholder="Razão social completa"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">CNPJ</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCompany.cnpj}
                          onChange={(e) => setNewCompany(prev => ({ ...prev, cnpj: e.target.value }))}
                          className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#04243b]/30"
                          placeholder="00.000.000/0001-00"
                          required
                        />
                        <button
                          type="button"
                          onClick={handleFetchCnpjData}
                          disabled={isFetchingCnpj}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-[#04243b] bg-[#e4b35e] hover:bg-[#d4a34e] disabled:opacity-50 transition-all cursor-pointer uppercase shadow-xs flex items-center gap-1.5"
                        >
                          {isFetchingCnpj ? 'Consultando...' : 'Consultar RFB'}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Regime de Tributação</label>
                      <select
                        value={newCompany.regimeTributario}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, regimeTributario: e.target.value as any }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#04243b]/30"
                      >
                        <option value="SIMPLES_NACIONAL">Simples Nacional</option>
                        <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
                        <option value="LUCRO_REAL">Lucro Real</option>
                        <option value="LUCRO_ARBITRADO">Lucro Arbitrado</option>
                        <option value="ISENTO_IMUNE">Isento / Imune</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Vendas à Vista (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          value={newCompany.vendaVistaPercent}
                          onChange={(e) => handleVistaChange(Number(e.target.value))}
                          className="w-full bg-white border border-slate-300 rounded-xl pl-3 pr-8 py-2 text-xs font-mono font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-[#04243b]/30"
                          required
                        />
                        <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 font-mono text-xs">%</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Vendas a Prazo (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          value={newCompany.vendaPrazoPercent}
                          onChange={(e) => handlePrazoChange(Number(e.target.value))}
                          className="w-full bg-white border border-slate-300 rounded-xl pl-3 pr-8 py-2 text-xs font-mono font-bold text-blue-700 focus:outline-none focus:ring-2 focus:ring-[#04243b]/30"
                          required
                        />
                        <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 font-mono text-xs">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Endereço e Contato */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                  <h4 className="text-xs font-extrabold text-[#04243b] uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                    <MapPin className="h-4 w-4 text-[#e4b35e]" />
                    2. Endereço e Contatos (Importados via API)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">CEP</label>
                      <input
                        type="text"
                        value={newCompany.cep || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, cep: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                        placeholder="00000-000"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Logradouro (Rua, Av., etc.)</label>
                      <input
                        type="text"
                        value={newCompany.logradouro || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, logradouro: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        placeholder="Rua / Avenida"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Número</label>
                      <input
                        type="text"
                        value={newCompany.numero || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, numero: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        placeholder="Número"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Complemento</label>
                      <input
                        type="text"
                        value={newCompany.complemento || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, complemento: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        placeholder="Sala, Andar, etc."
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Bairro</label>
                      <input
                        type="text"
                        value={newCompany.bairro || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, bairro: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        placeholder="Bairro"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Município e UF</label>
                      <input
                        type="text"
                        value={newCompany.cidade || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, cidade: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        placeholder="Fortaleza (CE)"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">E-mail</label>
                      <input
                        type="email"
                        value={newCompany.email || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        placeholder="contato@empresa.com.br"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Telefone Principal</label>
                      <input
                        type="text"
                        value={newCompany.telefone || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, telefone: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                        placeholder="(00) 0000-0000"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Telefone Secundário</label>
                      <input
                        type="text"
                        value={newCompany.telefoneSecundario || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, telefoneSecundario: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Atividade e Classificação (CNAE, Natureza, Porte) */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                  <h4 className="text-xs font-extrabold text-[#04243b] uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Briefcase className="h-4 w-4 text-[#e4b35e]" />
                    3. Atividade Econômica e Classificação
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Código CNAE Principal</label>
                      <input
                        type="text"
                        value={newCompany.cnaePrincipalCodigo || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, cnaePrincipalCodigo: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                        placeholder="Código CNAE"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Descrição CNAE Principal</label>
                      <input
                        type="text"
                        value={newCompany.cnaePrincipalDescricao || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, cnaePrincipalDescricao: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        placeholder="Atividade Principal"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Cód. Natureza Jurídica</label>
                      <input
                        type="text"
                        value={newCompany.naturezaJuridicaCodigo || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, naturezaJuridicaCodigo: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                        placeholder="Código Natureza"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Descrição Natureza Jurídica</label>
                      <input
                        type="text"
                        value={newCompany.naturezaJuridicaDescricao || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, naturezaJuridicaDescricao: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        placeholder="Natureza Jurídica"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Porte da Empresa</label>
                      <input
                        type="text"
                        value={newCompany.porte || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, porte: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        placeholder="ME, EPP, Demais"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-700">CNAEs Secundários</label>
                      <div className="bg-white border border-slate-300 rounded-xl p-2.5 max-h-24 overflow-y-auto text-[11px] text-slate-600 space-y-1">
                        {newCompany.cnaesSecundarios && newCompany.cnaesSecundarios.length > 0 ? (
                          newCompany.cnaesSecundarios.map((sec, idx) => (
                            <div key={idx} className="flex gap-2">
                              <span className="font-mono font-bold text-slate-800">{sec.codigo}:</span>
                              <span className="truncate">{sec.descricao}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">Nenhum CNAE secundário importado.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Situação Cadastral e Inscrições */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                  <h4 className="text-xs font-extrabold text-[#04243b] uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                    <FileText className="h-4 w-4 text-[#e4b35e]" />
                    4. Situação Cadastral e Inscrições Fiscais
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Situação Cadastral</label>
                      <input
                        type="text"
                        value={newCompany.situacaoCadastral || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, situacaoCadastral: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none"
                        placeholder="ATIVA"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Motivo Situação Cadastral</label>
                      <input
                        type="text"
                        value={newCompany.motivoSituacaoCadastral || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, motivoSituacaoCadastral: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        placeholder="SEM MOTIVO"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Inscrição Estadual (IE)</label>
                      <input
                        type="text"
                        value={newCompany.inscEst || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, inscEst: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                        placeholder="IE da empresa"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Situação da IE</label>
                      <input
                        type="text"
                        value={newCompany.situacaoInscEst || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, situacaoInscEst: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        placeholder="ATIVA / INATIVA"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Inscrição Municipal</label>
                      <input
                        type="text"
                        value={newCompany.inscMun || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, inscMun: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                        placeholder="IM da empresa"
                      />
                    </div>
                    <div className="space-y-1 flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        checked={Boolean(newCompany.opcaoSimples)}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, opcaoSimples: e.target.checked }))}
                        id="checkSimples"
                        className="h-4 w-4 text-[#04243b] rounded"
                      />
                      <label htmlFor="checkSimples" className="text-xs font-bold text-slate-700 cursor-pointer">Opção Simples Nacional</label>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Data Opção Simples</label>
                      <input
                        type="text"
                        value={newCompany.dataOpcaoSimples || ''}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, dataOpcaoSimples: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                        placeholder="AAAA-MM-DD"
                      />
                    </div>
                    <div className="space-y-1 flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        checked={Boolean(newCompany.opcaoMei)}
                        onChange={(e) => setNewCompany(prev => ({ ...prev, opcaoMei: e.target.checked }))}
                        id="checkMei"
                        className="h-4 w-4 text-[#04243b] rounded"
                      />
                      <label htmlFor="checkMei" className="text-xs font-bold text-slate-700 cursor-pointer">Opção pelo MEI</label>
                    </div>
                  </div>
                </div>

                {/* 5. Quadro Societário (QSA) */}
                <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-200/80 space-y-4">
                  <h4 className="text-xs font-extrabold text-[#04243b] uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Users className="h-4 w-4 text-[#e4b35e]" />
                    5. Quadro de Sócios e Administradores (QSA)
                  </h4>
                  <div className="space-y-2">
                    {newCompany.sociosDetalhados && newCompany.sociosDetalhados.length > 0 ? (
                      <div className="space-y-2">
                        {newCompany.sociosDetalhados.map((socio, idx) => (
                          <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <p className="font-bold text-slate-800">{socio.nome}</p>
                              <p className="text-[10px] text-slate-500">{socio.qualificacao || 'Sócio / Administrador'}</p>
                            </div>
                            {socio.documento && (
                              <span className="font-mono text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-600">
                                Doc: {socio.documento}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : newCompany.quadroSocietario && newCompany.quadroSocietario.length > 0 ? (
                      <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                        {newCompany.quadroSocietario.map((socio, idx) => (
                          <div key={idx} className="text-slate-700 font-medium">• {socio}</div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">Nenhum sócio ou administrador retornado pela API ou cadastrado.</p>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => { setCompanyScreen('list'); setEditingCompanyId(null); }}
                    className="px-5 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs uppercase cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                  >
                    Salvar Empresa no Cadastro Central
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Modal de Detalhes da API */}
          {viewingCompanyDetails && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-5 bg-[#04243b] text-white flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-[#e4b35e]">Detalhes Completos via API CNPJ</h3>
                    <p className="text-xs text-slate-300">{viewingCompanyDetails.razaoSocial}</p>
                  </div>
                  <button
                    onClick={() => setViewingCompanyDetails(null)}
                    className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div><span className="font-bold text-slate-500 block text-[10px] uppercase">CNPJ</span><span className="font-mono font-bold">{viewingCompanyDetails.cnpj}</span></div>
                    <div><span className="font-bold text-slate-500 block text-[10px] uppercase">Regime</span><span className="font-bold text-emerald-700">{viewingCompanyDetails.regimeTributario}</span></div>
                    <div><span className="font-bold text-slate-500 block text-[10px] uppercase">Situação</span><span className="font-bold">{viewingCompanyDetails.situacaoCadastral || 'N/D'}</span></div>
                    <div><span className="font-bold text-slate-500 block text-[10px] uppercase">Porte</span><span>{viewingCompanyDetails.porte || 'N/D'}</span></div>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-1 mb-2">Endereço & Contato</h4>
                    <p><strong>Logradouro:</strong> {viewingCompanyDetails.logradouro || viewingCompanyDetails.endereco || 'N/D'}, {viewingCompanyDetails.numero || 'S/N'} {viewingCompanyDetails.complemento ? `(${viewingCompanyDetails.complemento})` : ''}</p>
                    <p><strong>Bairro:</strong> {viewingCompanyDetails.bairro || 'N/D'} | <strong>CEP:</strong> {viewingCompanyDetails.cep || 'N/D'}</p>
                    <p><strong>Cidade/UF:</strong> {viewingCompanyDetails.cidade || `${viewingCompanyDetails.municipio || ''} - ${viewingCompanyDetails.uf || ''}`}</p>
                    <p><strong>E-mail:</strong> {viewingCompanyDetails.email || 'N/D'}</p>
                    <p><strong>Telefone:</strong> {viewingCompanyDetails.telefone || 'N/D'} {viewingCompanyDetails.telefoneSecundario ? `/ ${viewingCompanyDetails.telefoneSecundario}` : ''}</p>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-1 mb-2">Classificação CNAE & Natureza Jurídica</h4>
                    <p><strong>CNAE Principal:</strong> {viewingCompanyDetails.cnaePrincipalCodigo || 'N/D'} - {viewingCompanyDetails.cnaePrincipalDescricao || ''}</p>
                    <p><strong>Natureza Jurídica:</strong> {viewingCompanyDetails.naturezaJuridicaCodigo || 'N/D'} - {viewingCompanyDetails.naturezaJuridicaDescricao || ''}</p>
                    {viewingCompanyDetails.cnaesSecundarios && viewingCompanyDetails.cnaesSecundarios.length > 0 && (
                      <div className="mt-2">
                        <span className="font-bold text-[10px] text-slate-500 uppercase block">CNAEs Secundários ({viewingCompanyDetails.cnaesSecundarios.length}):</span>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px] max-h-20 overflow-y-auto mt-1">
                          {viewingCompanyDetails.cnaesSecundarios.map((s, i) => (
                            <li key={i}>{s.codigo}: {s.descricao}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-1 mb-2">Inscrições & Opções Fiscais</h4>
                    <p><strong>Inscrição Estadual (IE):</strong> {viewingCompanyDetails.inscEst || 'N/D'} ({viewingCompanyDetails.situacaoInscEst || 'N/D'})</p>
                    <p><strong>Inscrição Municipal (IM):</strong> {viewingCompanyDetails.inscMun || 'N/D'}</p>
                    <p><strong>Opção Simples Nacional:</strong> {viewingCompanyDetails.opcaoSimples ? `SIM (Opção: ${viewingCompanyDetails.dataOpcaoSimples || 'N/D'})` : 'NÃO'}</p>
                    <p><strong>Opção MEI:</strong> {viewingCompanyDetails.opcaoMei ? 'SIM' : 'NÃO'}</p>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-1 mb-2">Quadro de Sócios (QSA)</h4>
                    {viewingCompanyDetails.sociosDetalhados && viewingCompanyDetails.sociosDetalhados.length > 0 ? (
                      <ul className="space-y-1">
                        {viewingCompanyDetails.sociosDetalhados.map((s, idx) => (
                          <li key={idx} className="bg-slate-50 p-2 rounded border border-slate-200 flex justify-between">
                            <span><strong>{s.nome}</strong> ({s.qualificacao})</span>
                            <span className="font-mono text-slate-500">{s.documento}</span>
                          </li>
                        ))}
                      </ul>
                    ) : viewingCompanyDetails.quadroSocietario && viewingCompanyDetails.quadroSocietario.length > 0 ? (
                      <ul className="list-disc pl-4">
                        {viewingCompanyDetails.quadroSocietario.map((s, idx) => <li key={idx}>{s}</li>)}
                      </ul>
                    ) : (
                      <p className="text-slate-400 italic">Nenhum sócio registrado.</p>
                    )}
                  </div>
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={() => {
                      setEditingCompanyId(viewingCompanyDetails.id);
                      setNewCompany({ ...DEFAULT_NEW_COMPANY, ...viewingCompanyDetails });
                      setViewingCompanyDetails(null);
                      setCompanyScreen('form');
                    }}
                    className="px-4 py-2 bg-[#04243b] text-[#e4b35e] font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer mr-2"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Editar Este Cadastro
                  </button>
                  <button
                    onClick={() => setViewingCompanyDetails(null)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 2: ASSINATURAS DE CONTADORES */}
      {activeTab === 'assinaturas' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          {accountantScreen === 'list' ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pb-4 border-b border-slate-200">
                <div className="relative w-full sm:max-w-md">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={accountantSearchQuery}
                    onChange={(e) => setAccountantSearchQuery(e.target.value)}
                    placeholder="Pesquisar por nome do contador..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-[#04243b] focus:bg-white transition-all"
                  />
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    setEditingAccountantId(null);
                    setNewAccountant({ nome: '', cpf: '', crc: '' });
                    setAccountantScreen('form');
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 bg-[#04243b] hover:bg-[#031d30] text-white font-bold rounded-xl text-xs uppercase flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer shrink-0"
                >
                  <Plus className="h-4 w-4 text-[#e4b35e]" />
                  Incluir Novo Contador
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-5 py-3">Responsável Técnico / Assinatura</th>
                      <th className="px-5 py-3">CPF</th>
                      <th className="px-5 py-3">CRC</th>
                      <th className="px-5 py-3 text-center">Assinatura Ativa</th>
                      <th className="px-5 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {accountants.filter(acc => {
                      const q = accountantSearchQuery.toUpperCase().trim();
                      if (!q) return true;
                      return acc.nome.toUpperCase().includes(q) || acc.crc.toUpperCase().includes(q);
                    }).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-10 text-center text-slate-400 italic">
                          Nenhum contador encontrado na busca.
                        </td>
                      </tr>
                    ) : (
                      accountants.filter(acc => {
                        const q = accountantSearchQuery.toUpperCase().trim();
                        if (!q) return true;
                        return acc.nome.toUpperCase().includes(q) || acc.crc.toUpperCase().includes(q);
                      }).map((acc) => {
                        const isSelected = selectedAccountantId === acc.id;
                        return (
                          <tr key={acc.id} className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-amber-50/30' : ''}`}>
                            <td className="px-5 py-3.5 font-bold text-slate-800">
                              {acc.nome}
                            </td>
                            <td className="px-5 py-3.5 font-mono text-slate-600">
                              {acc.cpf}
                            </td>
                            <td className="px-5 py-3.5 font-mono text-slate-700 font-semibold">
                              {acc.crc}
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <button
                                type="button"
                                onClick={() => selectAccountant(acc.id)}
                                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all cursor-pointer inline-flex items-center gap-1 ${
                                  isSelected 
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}
                              >
                                {isSelected ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-600" />
                                    Padrão Ativo
                                  </>
                                ) : 'Tornar Padrão'}
                              </button>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingAccountantId(acc.id);
                                    setNewAccountant({ nome: acc.nome, cpf: acc.cpf, crc: acc.crc });
                                    setAccountantScreen('form');
                                  }}
                                  className="p-2 rounded-lg text-slate-500 hover:text-[#04243b] hover:bg-slate-100 transition-all cursor-pointer"
                                  title="Editar Contador"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAccountant(acc.id)}
                                  className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 transition-all cursor-pointer"
                                  title="Excluir Contador"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Formulário de Contador */
            <div className="space-y-6 max-w-xl mx-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => { setAccountantScreen('list'); setEditingAccountantId(null); }}
                  className="text-slate-500 hover:text-slate-800 text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar à Lista de Assinaturas
                </button>
                <h3 className="text-sm font-extrabold text-[#04243b] uppercase tracking-wider flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#e4b35e]" />
                  {editingAccountantId ? 'Editar Assinatura de Contador' : 'Incluir Assinatura de Contador'}
                </h3>
              </div>

              <form onSubmit={handleSaveAccountant} className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Nome Completo do Contador</label>
                    <input
                      type="text"
                      value={newAccountant.nome}
                      onChange={(e) => setNewAccountant({ ...newAccountant, nome: e.target.value })}
                      placeholder="NOME DO PROFISSIONAL RESPONSÁVEL"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs uppercase focus:outline-none focus:ring-2 focus:ring-[#04243b]/30 focus:bg-white"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">CPF</label>
                      <input
                        type="text"
                        value={newAccountant.cpf}
                        onChange={(e) => setNewAccountant({ ...newAccountant, cpf: e.target.value })}
                        placeholder="000.000.000-00"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#04243b]/30 focus:bg-white"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Registro CRC</label>
                      <input
                        type="text"
                        value={newAccountant.crc}
                        onChange={(e) => setNewAccountant({ ...newAccountant, crc: e.target.value })}
                        placeholder="CRC CE 000000/O"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#04243b]/30 focus:bg-white"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => { setAccountantScreen('list'); setEditingAccountantId(null); }}
                    className="px-5 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs uppercase cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                  >
                    Salvar Assinatura
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ABA 3: LOGOTIPO E DADOS CORPORATIVOS DO ESCRITÓRIO */}
      {activeTab === 'identidade' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Card 1: Logo Management */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#e4b35e]/15 text-[#04243b]">
                  <ImageIcon className="h-5 w-5 text-[#04243b]" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Logotipo do Sistema.</h2>
                  <p className="text-[11px] text-slate-500">Substituição externa e gerenciamento visual (limite 5 MB)</p>
                </div>
              </div>
            </div>

            {/* Current Preview Box */}
            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center gap-4 text-center shadow-inner">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preview Ativo no Topo e Relatórios</span>
              <div
                className="p-4 rounded-xl border border-dashed border-slate-700/60 flex items-center justify-center min-h-[90px] w-full"
                style={{ backgroundColor: 'transparent' }}
              >
                <Logo origin="center" />
              </div>
            </div>

            {/* Zoom Control Slider */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Sliders className="h-4 w-4 text-[#04243b]" />
                  Zoom do Logotipo (Escala Dinâmica)
                </span>
                <span className="font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md font-bold">
                  {(logoScale * 100).toFixed(0)}%
                </span>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleScaleChange(logoScale - 0.1)}
                  className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={logoScale}
                  onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                  className="w-full accent-[#04243b] cursor-pointer"
                />
                
                <button
                  type="button"
                  onClick={() => handleScaleChange(logoScale + 0.1)}
                  className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                Ajusta o tamanho visual dinâmico em todo o sistema (navbar e relatórios) mantendo transparência.
              </p>
            </div>

            {/* File Upload Zone */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">
                Incluir ou Alterar Logotipo (Arquivo de Imagem até 5 MB)
              </label>
              
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center hover:border-[#e4b35e] hover:bg-slate-50/50 transition-all cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Upload className="h-8 w-8 text-[#e4b35e] mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">Clique para enviar um arquivo do computador</p>
                <p className="text-[10px] text-slate-500 mt-1">Suporta PNG, JPG, WEBP e SVG • Tamanho máximo permitido: 5.00 MB</p>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleResetLogo}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                >
                  Restaurar Logotipo Padrão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ATUALIZAÇÃO EM LOTE COM PROGRESSO DETALHADO */}
      <AnimatePresence>
        {showBatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="bg-[#04243b] px-6 py-4 flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl">
                    <RefreshCw className={`h-5 w-5 text-[#e4b35e] ${isBatchUpdating ? 'animate-spin' : ''}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base">Painel de Atualização em Lote (API CNPJ / RFB)</h3>
                    <p className="text-[11px] text-slate-300">Sincronização automatizada da carteira de clientes</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  disabled={isBatchUpdating && !batchFinished}
                  className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 cursor-pointer transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                {!isBatchUpdating && !batchFinished ? (
                  /* TELA DE CONFIRMAÇÃO DO LOTE */
                  <div className="space-y-5">
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 space-y-2">
                      <p className="font-bold text-sm">Resumo da Execução:</p>
                      <p className="text-xs leading-relaxed">
                        O sistema irá se conectar em tempo real à base pública de dados da Receita Federal para consultar o status atualizado de todas as <strong className="font-bold text-[#04243b]">{companies.length} empresas</strong> cadastradas na sua carteira contábil.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Total de Cadastros</span>
                        <p className="text-lg font-bold text-slate-800 mt-0.5">{companies.length} empresas</p>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Tempo Estimado</span>
                        <p className="text-lg font-bold text-slate-800 mt-0.5">~{(companies.length * 0.45).toFixed(0)} segundos</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-slate-600">
                      <p className="font-bold text-slate-700">Campos sincronizados por empresa:</p>
                      <ul className="list-disc list-inside space-y-1 text-[11px]">
                        <li>Razão Social e Situação Cadastral atualizada</li>
                        <li>Endereço completo (Logradouro, Bairro, CEP e Município)</li>
                        <li>CNAE Principal e CNAEs Secundários</li>
                        <li>Quadro de Sócios e Administradores (QSA) e Regime Tributário</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  /* TELA DE PROGRESSO E RESULTADO */
                  <div className="space-y-5">
                    {/* Barra de Progresso */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                        <span>
                          {batchFinished ? 'Sincronização Concluída!' : 'Processando fila de consultas...'}
                        </span>
                        <span className="font-mono text-sm text-[#04243b]">
                          {batchProgress ? Math.round((batchProgress.current / batchProgress.total) * 100) : 100}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${
                            batchFinished ? 'bg-emerald-600' : 'bg-[#04243b]'
                          }`}
                          style={{
                            width: `${batchProgress ? Math.round((batchProgress.current / batchProgress.total) * 100) : 100}%`
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {batchProgress && !batchFinished
                          ? `Consultando empresa ${batchProgress.current} de ${batchProgress.total}: ${batchProgress.currentName}`
                          : `Todas as ${companies.length} empresas foram verificadas.`}
                      </p>
                    </div>

                    {/* Resumo Estatístico */}
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Processados</span>
                        <p className="text-base font-bold text-slate-800 mt-0.5">
                          {batchProgress?.current || companies.length} / {companies.length}
                        </p>
                      </div>
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase">Atualizados</span>
                        <p className="text-base font-bold text-emerald-800 mt-0.5">
                          {batchProgress?.success || 0}
                        </p>
                      </div>
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                        <span className="text-[10px] font-bold text-rose-700 uppercase">Divergências / Erro</span>
                        <p className="text-base font-bold text-rose-800 mt-0.5">
                          {batchProgress?.errors || 0}
                        </p>
                      </div>
                    </div>

                    {batchFinished && (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-3 text-emerald-900">
                        <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                        <div>
                          <p className="font-bold text-xs">Todos os dados cadastrais foram atualizados e salvos!</p>
                          <p className="text-[11px] text-emerald-700">As listagens e relatórios contábeis já refletem os novos dados.</p>
                        </div>
                      </div>
                    )}

                    {/* Lista Detalhada em Tempo Real */}
                    <div className="space-y-2">
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        Histórico do Lote em Tempo Real
                      </label>
                      <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100 bg-slate-50/50 p-1.5 space-y-1">
                        {batchItemsStatus.map((item) => (
                          <div
                            key={item.id}
                            className={`p-2.5 rounded-lg flex items-center justify-between gap-3 text-xs ${
                              item.status === 'updating'
                                ? 'bg-blue-50 border border-blue-200 shadow-2xs'
                                : item.status === 'success'
                                ? 'bg-white'
                                : item.status === 'error'
                                ? 'bg-rose-50/70'
                                : 'bg-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              {item.status === 'updating' && (
                                <RefreshCw className="h-4 w-4 text-blue-600 animate-spin shrink-0" />
                              )}
                              {item.status === 'success' && (
                                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                              )}
                              {item.status === 'error' && (
                                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                              )}
                              {item.status === 'waiting' && (
                                <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                              )}
                              <div className="truncate">
                                <p className="font-bold text-slate-800 truncate">{item.razaoSocial}</p>
                                <p className="text-[10px] text-slate-500 font-mono">{item.cnpj}</p>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-md shrink-0 ${
                                item.status === 'updating'
                                  ? 'bg-blue-100 text-blue-800'
                                  : item.status === 'success'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.status === 'error'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {item.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
                {!isBatchUpdating && !batchFinished ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowBatchModal(false)}
                      className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={startBatchUpdateAll}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
                    >
                      <Play className="h-4 w-4" />
                      Iniciar Atualização em Lote ({companies.length} empresas)
                    </button>
                  </>
                ) : isBatchUpdating ? (
                  <button
                    type="button"
                    onClick={() => setShowBatchModal(false)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer text-xs"
                  >
                    Minimizar Janela (Acompanhar em segundo plano)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowBatchModal(false)}
                    className="px-6 py-2.5 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-bold rounded-xl transition-colors shadow-sm cursor-pointer"
                  >
                    Concluir e Fechar Painel
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
