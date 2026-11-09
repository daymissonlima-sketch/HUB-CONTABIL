import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Building2, 
  Search, 
  Upload, 
  Download, 
  Play, 
  Pause, 
  RotateCcw, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Clock, 
  FileSpreadsheet, 
  Copy, 
  ExternalLink, 
  HelpCircle, 
  ShieldCheck, 
  Sparkles, 
  ArrowUpDown, 
  FileText, 
  Printer, 
  X,
  RefreshCw,
  TrendingUp,
  Check,
  ChevronDown,
  Info,
  History,
  ChevronLeft,
  ChevronRight,
  Pencil
} from 'lucide-react';
import { 
  FornecedorReforma, 
  BatchProcessingState, 
  CsvImportPreviewItem, 
  RegimeTributarioFornecedor 
} from '../types_reforma';
import { Company } from '../types_debits';
import { 
  loadSavedFornecedores, 
  saveFornecedores, 
  parseFornecedoresCsvOrText, 
  consultarCnpjSimples, 
  formatCnpj, 
  cleanCnpj, 
  generateSampleCsv, 
  exportFornecedoresToExcel, 
  exportFornecedoresToCsv 
} from '../services/fornecedorSimplesService';
import { loadStoredCompanies } from '../utils/companyStorage';
import { isValidCNPJ } from '../utils/cnpjHelper';

interface HistoricoConsulta {
  id: string;
  timestamp: string;
  clienteCnpj: string;
  clienteRazao: string;
  totalFornecedores: number;
  regimeNormalCount: number;
  simplesCount: number;
  meiCount: number;
  fornecedoresSnapshot: FornecedorReforma[];
}

const HISTORICO_STORAGE_KEY = 'reforma_tributaria_historico_consultas';

export const FornecedoresSimplesAuditor: React.FC = () => {
  // State
  const [fornecedores, setFornecedores] = useState<FornecedorReforma[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRegime, setFilterRegime] = useState<'todos' | 'regime_normal' | 'simples_nacional' | 'mei' | 'pendentes'>('todos');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [sortBy, setSortBy] = useState<'razaoSocial' | 'cnpj' | 'regimeTributario'>('razaoSocial');

  // Pagination state (default 25 per page, options 25, 50, 100)
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Client (Cliente da Auditoria)
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedClientCnpj, setSelectedClientCnpj] = useState<string>('');

  // History state
  const [historico, setHistorico] = useState<HistoricoConsulta[]>([]);
  const [showHistoricoModal, setShowHistoricoModal] = useState(false);

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showAddSingleModal, setShowAddSingleModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Import preview
  const [importPreview, setImportPreview] = useState<CsvImportPreviewItem[]>([]);
  const [pasteRawText, setPasteRawText] = useState('');
  const [importFileName, setImportFileName] = useState('');

  // Add single state
  const [singleCnpj, setSingleCnpj] = useState('');
  const [singleRazao, setSingleRazao] = useState('');

  // Notification
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);

  // Batch queue state
  const [batchState, setBatchState] = useState<BatchProcessingState>({
    isRunning: false,
    isPaused: false,
    rateLimitedUntil: null,
    rateLimitCountdown: 0,
    currentIndex: 0,
    totalCount: 0,
    processedCount: 0,
    successCount: 0,
    errorCount: 0
  });

  // Delay pace setting (ms between requests to avoid bans)
  const [requestDelayMs, setRequestDelayMs] = useState<number>(1500);

  // References for async queue loop control
  const isCancelledRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Screen view state: 'list' (Tela Inicial - Lista de Empresas) | 'audit' (Tela de Resultados)
  const [currentScreen, setCurrentScreen] = useState<'list' | 'audit'>('list');
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);

  // New Audit creation modal state
  const [showNovaConsultaModal, setShowNovaConsultaModal] = useState(false);
  const [newAuditClientCnpj, setNewAuditClientCnpj] = useState<string>('');
  const [newAuditCustomRazao, setNewAuditCustomRazao] = useState<string>('');
  const [newAuditCustomCnpj, setNewAuditCustomCnpj] = useState<string>('');
  const [isCustomClient, setIsCustomClient] = useState<boolean>(false);
  const [newAuditRawText, setNewAuditRawText] = useState<string>('');
  const [newAuditPreview, setNewAuditPreview] = useState<CsvImportPreviewItem[]>([]);
  const newAuditFileInputRef = useRef<HTMLInputElement>(null);

  // Load companies and saved fornecedores & history on mount
  useEffect(() => {
    const compList = loadStoredCompanies();
    setCompanies(compList);
    if (compList.length > 0) {
      setNewAuditClientCnpj(compList[0].cnpj);
      setSelectedClientCnpj(compList[0].cnpj);
    }

    try {
      const histRaw = localStorage.getItem(HISTORICO_STORAGE_KEY);
      if (histRaw) {
        const parsedHist: HistoricoConsulta[] = JSON.parse(histRaw);
        setHistorico(parsedHist);
        if (parsedHist.length > 0) {
          setCurrentScreen('list');
        }
      } else {
        const savedForn = loadSavedFornecedores();
        if (savedForn.length > 0) {
          const clientObj = compList[0] || { razaoSocial: 'EMPRESA DEMO LTDA', cnpj: '55.787.112/0001-26' };
          const initialAudit: HistoricoConsulta = {
            id: `audit_${Date.now()}`,
            timestamp: new Date().toISOString(),
            clienteCnpj: clientObj.cnpj,
            clienteRazao: clientObj.razaoSocial,
            totalFornecedores: savedForn.length,
            regimeNormalCount: savedForn.filter(f => f.regimeTributario === 'REGIME_NORMAL').length,
            simplesCount: savedForn.filter(f => f.regimeTributario === 'SIMPLES_NACIONAL').length,
            meiCount: savedForn.filter(f => f.regimeTributario === 'MEI').length,
            fornecedoresSnapshot: savedForn
          };
          setHistorico([initialAudit]);
          localStorage.setItem(HISTORICO_STORAGE_KEY, JSON.stringify([initialAudit]));
          setFornecedores(savedForn);
          setActiveAuditId(initialAudit.id);
          setCurrentScreen('list');
        }
      }
    } catch {}
  }, []);

  // Selected client object
  const selectedClient = useMemo(() => {
    return companies.find(c => cleanCnpj(c.cnpj) === cleanCnpj(selectedClientCnpj)) || ({
      id: 'custom',
      cnpj: selectedClientCnpj || '00000000000100',
      razaoSocial: 'Empresa Cliente',
      regimeTributario: 'Lucro Presumido'
    } as unknown as Company);
  }, [companies, selectedClientCnpj]);

  // Sync fornecedores changes to active audit session & localStorage
  const updateFornecedores = (newList: FornecedorReforma[]) => {
    setFornecedores(newList);
    saveFornecedores(newList);

    if (activeAuditId) {
      setHistorico(prev => {
        const updated = prev.map(item => {
          if (item.id === activeAuditId) {
            return {
              ...item,
              timestamp: new Date().toISOString(),
              totalFornecedores: newList.length,
              regimeNormalCount: newList.filter(f => f.regimeTributario === 'REGIME_NORMAL').length,
              simplesCount: newList.filter(f => f.regimeTributario === 'SIMPLES_NACIONAL').length,
              meiCount: newList.filter(f => f.regimeTributario === 'MEI').length,
              fornecedoresSnapshot: newList
            };
          }
          return item;
        });
        try {
          localStorage.setItem(HISTORICO_STORAGE_KEY, JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }
  };

  const showToast = (message: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Save snapshot to history
  const salvarNoHistorico = (currentList: FornecedorReforma[]) => {
    if (currentList.length === 0) return;
    const normalCount = currentList.filter(f => f.regimeTributario === 'REGIME_NORMAL').length;
    const simplesCount = currentList.filter(f => f.regimeTributario === 'SIMPLES_NACIONAL').length;
    const meiCount = currentList.filter(f => f.regimeTributario === 'MEI').length;

    if (activeAuditId) {
      setHistorico(prev => {
        const updated = prev.map(item => {
          if (item.id === activeAuditId) {
            return {
              ...item,
              timestamp: new Date().toISOString(),
              totalFornecedores: currentList.length,
              regimeNormalCount: normalCount,
              simplesCount,
              meiCount,
              fornecedoresSnapshot: currentList
            };
          }
          return item;
        });
        try {
          localStorage.setItem(HISTORICO_STORAGE_KEY, JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }
  };

  // Open existing audit session (Tela 2)
  const handleOpenAuditSession = (session: HistoricoConsulta) => {
    setActiveAuditId(session.id);
    setSelectedClientCnpj(session.clienteCnpj);
    setFornecedores(session.fornecedoresSnapshot || []);
    saveFornecedores(session.fornecedoresSnapshot || []);
    setCurrentScreen('audit');
  };

  // Delete an audit session
  const handleDeleteAuditSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir esta consulta e seus fornecedores salvos?')) return;

    const updated = historico.filter(h => h.id !== id);
    setHistorico(updated);
    try {
      localStorage.setItem(HISTORICO_STORAGE_KEY, JSON.stringify(updated));
    } catch {}

    if (activeAuditId === id) {
      setActiveAuditId(null);
      setFornecedores([]);
      saveFornecedores([]);
      setCurrentScreen('list');
    }
    showToast('Consulta excluída do histórico com sucesso.', 'success');
  };

  // Change active company directly inside Screen 2 audit view & auto-save
  const handleClientSelectChange = (newCnpj: string) => {
    setSelectedClientCnpj(newCnpj);
    const found = companies.find(c => cleanCnpj(c.cnpj) === cleanCnpj(newCnpj));
    if (found && activeAuditId) {
      setHistorico(prev => {
        const updated = prev.map(item => {
          if (item.id === activeAuditId) {
            return {
              ...item,
              clienteCnpj: found.cnpj,
              clienteRazao: found.razaoSocial
            };
          }
          return item;
        });
        try {
          localStorage.setItem(HISTORICO_STORAGE_KEY, JSON.stringify(updated));
        } catch {}
        return updated;
      });
      showToast(`Empresa cliente alterada para "${found.razaoSocial}". Alteração salva automaticamente!`, 'success');
    }
  };

  // Process file for New Audit modal
  const handleNewAuditFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseFornecedoresCsvOrText(text);
      setNewAuditPreview(parsed);
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Process text paste for New Audit modal
  const handleNewAuditTextChange = (text: string) => {
    setNewAuditRawText(text);
    const parsed = parseFornecedoresCsvOrText(text);
    setNewAuditPreview(parsed);
  };

  // Create & Start New Audit
  const handleConfirmNewAudit = () => {
    let finalClientCnpj = newAuditClientCnpj;
    let finalClientRazao = '';

    if (isCustomClient) {
      if (!newAuditCustomRazao.trim()) {
        showToast('Por favor, informe a Razão Social da empresa.', 'warning');
        return;
      }
      finalClientRazao = newAuditCustomRazao.trim();
      finalClientCnpj = cleanCnpj(newAuditCustomCnpj) || '00000000000100';
    } else {
      const found = companies.find(c => cleanCnpj(c.cnpj) === cleanCnpj(newAuditClientCnpj));
      finalClientRazao = found ? found.razaoSocial : 'Empresa Cliente';
      finalClientCnpj = found ? found.cnpj : newAuditClientCnpj;
    }

    if (newAuditPreview.length === 0) {
      showToast('Nenhum fornecedor válido encontrado na planilha ou texto fornecido.', 'warning');
      return;
    }

    const newSuppliers: FornecedorReforma[] = newAuditPreview.map((item, idx) => ({
      id: `forn_${Date.now()}_${idx}`,
      razaoSocial: item.razaoSocial,
      cnpj: item.cnpj,
      cnpjFormatted: formatCnpj(item.cnpj),
      regimeTributario: 'DESCONHECIDO',
      statusConsulta: 'pendente',
      dataConsulta: null,
      historicoConsultaSimples: false,
      historicoMei: false,
      potencialCreditoIbsCbs: 'PENDENTE'
    }));

    const newAuditSession: HistoricoConsulta = {
      id: `audit_${Date.now()}`,
      timestamp: new Date().toISOString(),
      clienteCnpj: finalClientCnpj,
      clienteRazao: finalClientRazao,
      totalFornecedores: newSuppliers.length,
      regimeNormalCount: 0,
      simplesCount: 0,
      meiCount: 0,
      fornecedoresSnapshot: newSuppliers
    };

    const updatedHist = [newAuditSession, ...historico];
    setHistorico(updatedHist);
    try {
      localStorage.setItem(HISTORICO_STORAGE_KEY, JSON.stringify(updatedHist));
    } catch {}

    setActiveAuditId(newAuditSession.id);
    setSelectedClientCnpj(finalClientCnpj);
    setFornecedores(newSuppliers);
    saveFornecedores(newSuppliers);
    
    setShowNovaConsultaModal(false);
    setNewAuditPreview([]);
    setNewAuditRawText('');
    setNewAuditCustomRazao('');
    setNewAuditCustomCnpj('');
    setIsCustomClient(false);
    
    setCurrentScreen('audit');
    showToast(`Consulta criada com sucesso para ${finalClientRazao}! ${newSuppliers.length} fornecedores importados.`, 'success');
  };

  // Cooldown countdown timer when rate limited
  useEffect(() => {
    if (!batchState.rateLimitedUntil) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((batchState.rateLimitedUntil! - Date.now()) / 1000));
      setBatchState(prev => ({ ...prev, rateLimitCountdown: remaining }));

      if (remaining <= 0) {
        clearInterval(interval);
        setBatchState(prev => ({ ...prev, rateLimitedUntil: null, rateLimitCountdown: 0 }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [batchState.rateLimitedUntil]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = fornecedores.length;
    const regimeNormal = fornecedores.filter(f => f.regimeTributario === 'REGIME_NORMAL').length;
    const simplesNacional = fornecedores.filter(f => f.regimeTributario === 'SIMPLES_NACIONAL').length;
    const mei = fornecedores.filter(f => f.regimeTributario === 'MEI').length;
    const pendentes = fornecedores.filter(f => f.statusConsulta === 'pendente' || f.regimeTributario === 'DESCONHECIDO').length;
    const consultados = total - pendentes;
    const percRegimeNormal = consultados > 0 ? (regimeNormal / consultados) * 100 : 0;

    return {
      total,
      regimeNormal,
      simplesNacional,
      mei,
      pendentes,
      consultados,
      percRegimeNormal
    };
  }, [fornecedores]);

  // Filtered, Sorted and Paginated list
  const filteredAndSortedFornecedores = useMemo(() => {
    let list = [...fornecedores];

    if (filterRegime === 'regime_normal') {
      list = list.filter(f => f.regimeTributario === 'REGIME_NORMAL');
    } else if (filterRegime === 'simples_nacional') {
      list = list.filter(f => f.regimeTributario === 'SIMPLES_NACIONAL');
    } else if (filterRegime === 'mei') {
      list = list.filter(f => f.regimeTributario === 'MEI');
    } else if (filterRegime === 'pendentes') {
      list = list.filter(f => f.statusConsulta === 'pendente' || f.regimeTributario === 'DESCONHECIDO');
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const cleanQ = cleanCnpj(q);
      list = list.filter(f => 
        (f.razaoSocial || '').toLowerCase().includes(q) ||
        (f.nomeFantasia || '').toLowerCase().includes(q) ||
        (f.cnpj || '').includes(cleanQ) ||
        (f.uf || '').toLowerCase().includes(q) ||
        (f.municipio || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortBy === 'razaoSocial') {
        valA = (a.razaoSocial || '').toLowerCase();
        valB = (b.razaoSocial || '').toLowerCase();
      } else if (sortBy === 'cnpj') {
        valA = a.cnpj;
        valB = b.cnpj;
      } else if (sortBy === 'regimeTributario') {
        valA = a.regimeTributario;
        valB = b.regimeTributario;
      }

      const cmp = valA.localeCompare(valB, 'pt-BR');
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [fornecedores, filterRegime, searchTerm, sortBy, sortDirection]);

  // Paginated subset
  const totalPages = Math.ceil(filteredAndSortedFornecedores.length / pageSize) || 1;
  const paginatedFornecedores = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedFornecedores.slice(start, start + pageSize);
  }, [filteredAndSortedFornecedores, currentPage, pageSize]);

  // Reset to page 1 when filter/search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterRegime, searchTerm, pageSize]);

  // Handle CSV file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        const preview = parseFornecedoresCsvOrText(content);
        setImportPreview(preview);
        setShowImportModal(true);
      }
    };
    reader.readAsText(file, 'ISO-8859-1');
    e.target.value = '';
  };

  const confirmImport = () => {
    const validItems = importPreview.filter(p => p.valido);
    if (validItems.length === 0) {
      showToast('Nenhum fornecedor com CNPJ válido encontrado para importação.', 'warning');
      return;
    }

    const existingCnpjs = new Set(fornecedores.map(f => f.cnpj));
    const newSuppliers: FornecedorReforma[] = [];
    let updatedCount = 0;

    validItems.forEach(item => {
      if (existingCnpjs.has(item.cnpj)) {
        updatedCount++;
      } else {
        newSuppliers.push({
          id: `forn_${Date.now()}_${item.cnpj}`,
          cnpj: item.cnpj,
          cnpjFormatted: item.cnpjFormatted,
          razaoSocial: item.razaoSocial,
          optanteSimples: null,
          optanteMei: null,
          regimeTributario: 'DESCONHECIDO',
          potencialCreditoIbsCbs: 'PENDENTE',
          statusConsulta: 'pendente',
          origemImportacao: importFileName || 'Importação CSV'
        });
        existingCnpjs.add(item.cnpj);
      }
    });

    const merged = [...fornecedores, ...newSuppliers];
    updateFornecedores(merged);
    setShowImportModal(false);
    setImportPreview([]);
    setImportFileName('');

    showToast(
      `Importação concluída: ${newSuppliers.length} novos fornecedores adicionados${updatedCount > 0 ? ` (${updatedCount} já existiam na lista)` : ''}.`,
      'success'
    );
  };

  const handleDelete = (id: string) => {
    const updated = fornecedores.filter(f => f.id !== id);
    updateFornecedores(updated);
    showToast('Fornecedor removido da lista.', 'success');
  };

  const handleClearAll = () => {
    if (window.confirm('Tem certeza que deseja limpar toda a lista de fornecedores? Esta ação não pode ser desfeita.')) {
      updateFornecedores([]);
      showToast('Lista de fornecedores esvaziada.', 'success');
    }
  };

  const handleConsultarIndividual = async (id: string) => {
    const item = fornecedores.find(f => f.id === id);
    if (!item) return;

    const updatedLoading = fornecedores.map(f => f.id === id ? { ...f, statusConsulta: 'consultando' as const } : f);
    setFornecedores(updatedLoading);

    try {
      const res = await consultarCnpjSimples(item.cnpj);
      const updated = fornecedores.map(f => {
        if (f.id === id) {
          return {
            ...f,
            ...res,
            statusConsulta: 'concluido' as const,
            razaoSocial: res.razaoSocial || f.razaoSocial,
            mensagemErro: undefined
          };
        }
        return f;
      });
      updateFornecedores(updated);
      salvarNoHistorico(updated);
      showToast(`Consulta concluída: ${item.razaoSocial} é ${res.regimeTributario === 'REGIME_NORMAL' ? 'Regime Normal' : 'Simples Nacional'}.`, 'success');
    } catch (err: any) {
      const updated = fornecedores.map(f => {
        if (f.id === id) {
          return {
            ...f,
            statusConsulta: 'erro' as const,
            mensagemErro: err?.message || 'Falha na consulta'
          };
        }
        return f;
      });
      updateFornecedores(updated);
      showToast(`Erro ao consultar fornecedor: ${err?.message || 'Falha na conexão'}`, 'error');
    }
  };

  const startBatchProcess = async () => {
    const pendentes = fornecedores.filter(f => f.statusConsulta === 'pendente' || f.statusConsulta === 'erro' || f.regimeTributario === 'DESCONHECIDO');
    if (pendentes.length === 0) {
      showToast('Todos os fornecedores da lista já foram consultados!', 'warning');
      return;
    }

    isCancelledRef.current = false;
    isPausedRef.current = false;

    setBatchState({
      isRunning: true,
      isPaused: false,
      rateLimitedUntil: null,
      rateLimitCountdown: 0,
      currentIndex: 0,
      totalCount: pendentes.length,
      processedCount: 0,
      successCount: 0,
      errorCount: 0
    });

    let currentList = [...fornecedores];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < pendentes.length; i++) {
      if (isCancelledRef.current) break;

      while (isPausedRef.current && !isCancelledRef.current) {
        await new Promise(r => setTimeout(r, 400));
      }
      if (isCancelledRef.current) break;

      const target = pendentes[i];

      setBatchState(prev => ({
        ...prev,
        currentIndex: i + 1,
        processedCount: i,
        currentSupplierName: target.razaoSocial,
        currentCnpj: target.cnpjFormatted || formatCnpj(target.cnpj)
      }));

      currentList = currentList.map(f => f.id === target.id ? { ...f, statusConsulta: 'consultando' as const } : f);
      setFornecedores(currentList);

      let success = false;
      let attempt = 0;
      const maxAttempts = 2;

      while (!success && attempt < maxAttempts && !isCancelledRef.current) {
        attempt++;
        try {
          const res = await consultarCnpjSimples(target.cnpj);

          currentList = currentList.map(f => {
            if (f.id === target.id) {
              return {
                ...f,
                ...res,
                statusConsulta: 'concluido' as const,
                razaoSocial: res.razaoSocial || f.razaoSocial,
                mensagemErro: undefined
              };
            }
            return f;
          });
          updateFornecedores(currentList);
          successCount++;
          success = true;

          await new Promise(r => setTimeout(r, requestDelayMs));
        } catch (err: any) {
          if (err?.isRateLimit || err?.message === 'RATE_LIMIT_EXCEEDED') {
            console.warn('[Queue] Rate limit reached. Initiating automatic safety cooldown...');
            const cooldownSeconds = 45;
            const unlockTimestamp = Date.now() + cooldownSeconds * 1000;

            setBatchState(prev => ({
              ...prev,
              rateLimitedUntil: unlockTimestamp,
              rateLimitCountdown: cooldownSeconds
            }));

            while (Date.now() < unlockTimestamp && !isCancelledRef.current) {
              await new Promise(r => setTimeout(r, 1000));
            }

            continue;
          } else {
            console.error(`[Queue] Failed to query ${target.cnpj}:`, err);
            currentList = currentList.map(f => {
              if (f.id === target.id) {
                return {
                  ...f,
                  statusConsulta: 'erro' as const,
                  mensagemErro: err?.message || 'Erro na consulta'
                };
              }
              return f;
            });
            updateFornecedores(currentList);
            errorCount++;
            break;
          }
        }
      }

      setBatchState(prev => ({
        ...prev,
        processedCount: i + 1,
        successCount,
        errorCount
      }));
    }

    setBatchState(prev => ({
      ...prev,
      isRunning: false,
      isPaused: false,
      currentSupplierName: undefined,
      currentCnpj: undefined
    }));

    if (!isCancelledRef.current) {
      salvarNoHistorico(currentList);
      showToast(`Processamento em lote finalizado! ${successCount} atualizados com sucesso e salvos no histórico da empresa.`, 'success');
    }
  };

  const handlePauseBatch = () => {
    isPausedRef.current = true;
    setBatchState(prev => ({ ...prev, isPaused: true }));
  };

  const handleResumeBatch = () => {
    isPausedRef.current = false;
    setBatchState(prev => ({ ...prev, isPaused: false }));
  };

  const handleCancelBatch = () => {
    isCancelledRef.current = true;
    isPausedRef.current = false;
    setBatchState(prev => ({ ...prev, isRunning: false, isPaused: false }));
    showToast('Processamento em lote interrompido.', 'warning');
  };

  const handleCopyCnpj = (cnpjStr: string) => {
    navigator.clipboard.writeText(cnpjStr);
    showToast(`CNPJ ${cnpjStr} copiado!`, 'success');
  };

  // Render Screen 1 (Tela Inicial - Lista de Consultas)
  if (currentScreen === 'list') {
    return (
      <div className="space-y-6 animate-fadeIn">
        
        {/* Toast Notification */}
        {notification && (
          <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-fadeIn ${
            notification.type === 'success' 
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
              : notification.type === 'warning'
              ? 'bg-amber-50 text-amber-900 border-amber-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}>
            <div className="flex items-center gap-2.5">
              {notification.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
              {notification.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />}
              {notification.type === 'error' && <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />}
              <span>{notification.message}</span>
            </div>
            <button onClick={() => setNotification(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Compact Dashboard Top Banner */}
        <div className="bg-[#04243b] text-white px-5 py-4 sm:px-6 sm:py-4.5 rounded-2xl shadow-md border border-[#e4b35e]/30 relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-[#e4b35e]/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Building2 className="h-6 w-6 text-[#e4b35e] shrink-0" />
              <span>Painel de Consultas & Perfis Tributários</span>
            </h1>

            <button
              onClick={() => setShowNovaConsultaModal(true)}
              className="flex items-center justify-center gap-2 px-4.5 py-2.5 bg-[#e4b35e] hover:bg-[#d4a04d] text-[#04243b] font-extrabold rounded-xl text-xs shadow-sm transition-all cursor-pointer shrink-0 hover:scale-[1.01] active:scale-[0.99]"
            >
              <Plus className="h-4.5 w-4.5 font-bold" />
              <span>Nova Consulta / Pesquisa</span>
            </button>
          </div>
        </div>

        {/* Companies / Audit History List */}
        <div className="space-y-4">

          {historico.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-[#04243b]/5 text-[#04243b] rounded-2xl border border-[#e4b35e]/30 flex items-center justify-center mx-auto shadow-inner">
                <Building2 className="h-8 w-8 text-[#e4b35e]" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-lg font-bold text-[#04243b]">
                  Nenhuma Consulta Realizada Ainda
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Para começar, crie uma nova consulta selecionando a empresa e importando a planilha CSV com os dados dos fornecedores (Razão Social e CNPJ).
                </p>
              </div>
              <button
                onClick={() => setShowNovaConsultaModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                <Plus className="h-4 w-4" />
                Criar Minha Primeira Consulta
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#04243b] text-white select-none">
                    <tr>
                      <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]">
                        EMPRESA
                      </th>
                      <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]">
                        DATA / HORA
                      </th>
                      <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px] text-right">
                        AÇÃO
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {historico.map((h) => {
                      const dataFormatada = new Date(h.timestamp).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });

                      return (
                        <tr 
                          key={h.id}
                          onClick={() => handleOpenAuditSession(h)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                          title="Clique em qualquer lugar da linha para abrir os resultados da consulta"
                        >
                          {/* Company Name & CNPJ */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-[#04243b]/10 text-[#04243b] group-hover:bg-[#04243b] group-hover:text-[#e4b35e] flex items-center justify-center font-bold text-sm shrink-0 transition-colors">
                                <Building2 className="h-4.5 w-4.5" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 group-hover:text-[#04243b] transition-colors truncate text-sm">
                                  {h.clienteRazao}
                                </div>
                                <span className="text-[11px] text-slate-500 font-mono block">
                                  CNPJ: {formatCnpj(h.clienteCnpj)}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Date */}
                          <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                            <div className="flex items-center gap-1.5 font-medium text-xs">
                              <Clock className="h-3.5 w-3.5 text-[#e4b35e] shrink-0" />
                              <span>{dataFormatada}</span>
                            </div>
                          </td>

                          {/* Actions - Delete only */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => handleDeleteAuditSession(h.id, e)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Excluir consulta"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Nova Consulta Tributária */}
        {showNovaConsultaModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
              
              <div className="bg-[#04243b] text-white p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-[#e4b35e]" />
                  <h3 className="font-bold text-sm">Criar Nova Consulta Tributária</h3>
                </div>
                <button onClick={() => setShowNovaConsultaModal(false)} className="text-slate-400 hover:text-white p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto text-xs">
                
                {/* Step 1: Select Client */}
                <div className="space-y-2">
                  <label className="font-bold text-slate-800 text-xs block">
                    1. Selecione a Empresa Cliente em Auditoria:
                  </label>
                  
                  {!isCustomClient ? (
                    <div className="space-y-2">
                      <select
                        value={newAuditClientCnpj}
                        onChange={(e) => setNewAuditClientCnpj(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#04243b]"
                      >
                        {companies.map(c => (
                          <option key={c.id || c.cnpj} value={c.cnpj}>
                            {c.razaoSocial} ({formatCnpj(c.cnpj)})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setIsCustomClient(true)}
                        className="text-[11px] text-[#04243b] hover:underline font-bold"
                      >
                        + Digitar nova empresa não listada
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div>
                        <span className="text-[11px] font-bold text-slate-700">Razão Social do Cliente:</span>
                        <input
                          type="text"
                          value={newAuditCustomRazao}
                          onChange={(e) => setNewAuditCustomRazao(e.target.value)}
                          placeholder="Ex: SILVA & OLIVEIRA COMERCIO LTDA"
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 mt-1 focus:outline-none focus:ring-2 focus:ring-[#04243b]"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-700">CNPJ:</span>
                        <input
                          type="text"
                          value={newAuditCustomCnpj}
                          onChange={(e) => setNewAuditCustomCnpj(e.target.value)}
                          placeholder="00.000.000/0001-00"
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 mt-1 focus:outline-none focus:ring-2 focus:ring-[#04243b]"
                        />
                      </div>
                      <button
                        onClick={() => setIsCustomClient(false)}
                        className="text-[11px] text-slate-500 hover:underline"
                      >
                        Voltar para lista de empresas cadastradas
                      </button>
                    </div>
                  )}
                </div>

                {/* Step 2: Import CSV File */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800 text-xs">
                      2. Importar Planilha de Fornecedores (CSV ou Texto):
                    </label>
                    <button
                      onClick={generateSampleCsv}
                      className="text-[11px] text-[#04243b] hover:underline font-semibold flex items-center gap-1"
                    >
                      <Download className="h-3 w-3" />
                      Baixar Planilha Exemplo
                    </button>
                  </div>

                  <input
                    type="file"
                    ref={newAuditFileInputRef}
                    onChange={handleNewAuditFileSelected}
                    accept=".csv,.txt,.xlsx,.xls"
                    className="hidden"
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={() => newAuditFileInputRef.current?.click()}
                      className="flex-1 border-2 border-dashed border-slate-300 hover:border-[#04243b] bg-slate-50 hover:bg-slate-100/80 p-4 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-600 transition-all cursor-pointer"
                    >
                      <Upload className="h-6 w-6 text-[#e4b35e]" />
                      <span className="font-bold text-xs">Clique para Selecionar o Arquivo CSV</span>
                      <span className="text-[10px] text-slate-400">Suporta arquivos CSV com Razão Social e CNPJ</span>
                    </button>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600">Ou cole a lista diretamente:</span>
                    <textarea
                      rows={3}
                      value={newAuditRawText}
                      onChange={(e) => handleNewAuditTextChange(e.target.value)}
                      placeholder="Empresa Fornecedora A; 12.345.678/0001-90&#10;Empresa Fornecedora B; 98.765.432/0001-10"
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#04243b]"
                    />
                  </div>

                  {newAuditPreview.length > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-900 flex items-center justify-between font-bold">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>{newAuditPreview.length} fornecedores identificados com sucesso!</span>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowNovaConsultaModal(false)}
                  className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmNewAudit}
                  disabled={newAuditPreview.length === 0}
                  className="px-5 py-2 bg-[#04243b] text-[#e4b35e] rounded-xl text-xs font-bold hover:bg-[#031d30] cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Criar & Iniciar Consulta
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    );
  }

  // Render Screen 2 (Tela de Consulta e Resultados da Empresa)
  return (
    <div className="space-y-6">
      
      {/* 1. Header Banner - Clean, Unified & Executive */}
      <div className="bg-[#04243b] text-white p-5 rounded-2xl shadow-md border border-[#e4b35e]/30 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-[#e4b35e]/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Left: Back Link, Title, Icon & Subtitle */}
          <div className="space-y-2 min-w-0">
            <button
              onClick={() => setCurrentScreen('list')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#e4b35e] hover:text-[#f3cd85] transition-colors cursor-pointer group"
              title="Retornar para a lista de empresas"
            >
              <ChevronLeft className="h-4 w-4 text-[#e4b35e] group-hover:-translate-x-0.5 transition-transform" />
              <span>Voltar para Empresas</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#e4b35e]/25 to-[#e4b35e]/10 border border-[#e4b35e]/40 flex items-center justify-center shrink-0 shadow-sm">
                <Building2 className="h-5 w-5 text-[#e4b35e]" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white leading-tight">
                    Perfil Tributário - Clientes e Fornecedores
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#e4b35e]/15 text-[#e4b35e] border border-[#e4b35e]/30">
                    Reforma Tributária
                  </span>
                </div>
                <p className="text-slate-300 text-xs mt-0.5 leading-normal">
                  Auditoria de fornecedores (Simples Nacional vs. Regime Normal) para otimização do aproveitamento de créditos fiscais (IBS e CBS).
                </p>
              </div>
            </div>
          </div>

          {/* Right: Single Client Dropdown (Auto-Save) & Report Button */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-[#e4b35e]/15">
            
            {/* Single Client Dropdown - Unique Source of Client Selection */}
            <div className="bg-[#031d30] border border-[#e4b35e]/35 rounded-xl px-3 py-1.5 flex flex-col justify-center min-w-[240px] max-w-[300px] shadow-inner">
              <span className="text-[9px] font-bold text-[#e4b35e] uppercase tracking-wider leading-none">
                Empresa em Consulta
              </span>
              <select
                value={selectedClientCnpj}
                onChange={(e) => handleClientSelectChange(e.target.value)}
                className="bg-transparent text-white text-xs font-semibold focus:outline-none cursor-pointer mt-1 truncate"
                title="Selecione para alterar a empresa desta auditoria (salvo automaticamente)"
              >
                {companies.map(c => (
                  <option key={c.id || c.cnpj} value={c.cnpj} className="bg-[#031d30] text-white">
                    {c.razaoSocial} ({formatCnpj(c.cnpj)})
                  </option>
                ))}
              </select>
            </div>

            {/* Relatorio Executivo Button */}
            <button
              onClick={() => setShowPrintModal(true)}
              disabled={fornecedores.length === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-[#e4b35e] to-[#c99742] hover:from-[#d8a54c] hover:to-[#be8d38] text-[#04243b] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed h-[44px] shrink-0"
              title="Visualizar e Imprimir Relatório Executivo A4"
            >
              <Printer className="h-4 w-4 text-[#04243b] shrink-0" />
              <span>Relatório Executivo</span>
            </button>
          </div>

        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-fadeIn ${
          notification.type === 'success' 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
            : notification.type === 'warning'
            ? 'bg-amber-50 text-amber-900 border-amber-200'
            : 'bg-rose-50 text-rose-900 border-rose-200'
        }`}>
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
            {notification.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />}
            {notification.type === 'error' && <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 2. Statistical KPI Cards (Clickable for Filtering) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        <div 
          onClick={() => setFilterRegime('todos')}
          className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between cursor-pointer transition-all ${
            filterRegime === 'todos' 
              ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-900/30' 
              : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${filterRegime === 'todos' ? 'text-slate-300' : 'text-slate-500'}`}>
              Total Cadastrado
            </span>
            <Building2 className={`h-4 w-4 ${filterRegime === 'todos' ? 'text-[#e4b35e]' : 'text-slate-400'}`} />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono">
              {stats.total}
            </div>
            <span className={`text-[11px] ${filterRegime === 'todos' ? 'text-slate-300' : 'text-slate-500'}`}>
              {stats.consultados} consultados (Clique para ver)
            </span>
          </div>
        </div>

        <div 
          onClick={() => setFilterRegime('regime_normal')}
          className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between relative overflow-hidden cursor-pointer transition-all ${
            filterRegime === 'regime_normal'
              ? 'bg-emerald-900 text-white border-emerald-900 ring-2 ring-emerald-900/30'
              : 'bg-white text-slate-900 border-emerald-200 hover:border-emerald-300 hover:shadow-md'
          }`}
        >
          <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500" />
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${filterRegime === 'regime_normal' ? 'text-emerald-200' : 'text-emerald-800'}`}>
              Regime Normal
            </span>
            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${filterRegime === 'regime_normal' ? 'bg-emerald-800 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
              Crédito Pleno
            </span>
          </div>
          <div className="mt-2">
            <div className={`text-2xl font-bold font-mono ${filterRegime === 'regime_normal' ? 'text-white' : 'text-emerald-700'}`}>
              {stats.regimeNormal}
            </div>
            <span className={`text-[11px] font-medium ${filterRegime === 'regime_normal' ? 'text-emerald-200' : 'text-emerald-700'}`}>
              ~26,5% de crédito ({stats.percRegimeNormal.toFixed(1)}%)
            </span>
          </div>
        </div>

        <div 
          onClick={() => setFilterRegime('simples_nacional')}
          className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between relative overflow-hidden cursor-pointer transition-all ${
            filterRegime === 'simples_nacional'
              ? 'bg-amber-900 text-white border-amber-900 ring-2 ring-amber-900/30'
              : 'bg-white text-slate-900 border-amber-200 hover:border-amber-300 hover:shadow-md'
          }`}
        >
          <div className="absolute top-0 right-0 w-2 h-full bg-amber-500" />
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${filterRegime === 'simples_nacional' ? 'text-amber-200' : 'text-amber-800'}`}>
              Simples Nacional
            </span>
            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${filterRegime === 'simples_nacional' ? 'bg-amber-800 text-white' : 'bg-amber-100 text-amber-800'}`}>
              Crédito Menor
            </span>
          </div>
          <div className="mt-2">
            <div className={`text-2xl font-bold font-mono ${filterRegime === 'simples_nacional' ? 'text-white' : 'text-amber-700'}`}>
              {stats.simplesNacional}
            </div>
            <span className={`text-[11px] font-medium ${filterRegime === 'simples_nacional' ? 'text-amber-200' : 'text-amber-700'}`}>
              Repasse restrito / avaliar troca
            </span>
          </div>
        </div>

        <div 
          onClick={() => setFilterRegime('mei')}
          className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between cursor-pointer transition-all ${
            filterRegime === 'mei'
              ? 'bg-blue-900 text-white border-blue-900 ring-2 ring-blue-900/30'
              : 'bg-white text-slate-900 border-blue-200 hover:border-blue-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${filterRegime === 'mei' ? 'text-blue-200' : 'text-blue-800'}`}>
              Fornecedores MEI
            </span>
            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${filterRegime === 'mei' ? 'bg-blue-800 text-white' : 'bg-blue-100 text-blue-800'}`}>
              Zero Crédito
            </span>
          </div>
          <div className="mt-2">
            <div className={`text-2xl font-bold font-mono ${filterRegime === 'mei' ? 'text-white' : 'text-blue-700'}`}>
              {stats.mei}
            </div>
            <span className={`text-[11px] font-medium ${filterRegime === 'mei' ? 'text-blue-200' : 'text-blue-600'}`}>
              Sem crédito na Reforma
            </span>
          </div>
        </div>

        <div 
          onClick={() => setFilterRegime('pendentes')}
          className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between cursor-pointer transition-all ${
            filterRegime === 'pendentes'
              ? 'bg-slate-800 text-white border-slate-800 ring-2 ring-slate-800/30'
              : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${filterRegime === 'pendentes' ? 'text-slate-300' : 'text-slate-500'}`}>
              Aguardando Consulta
            </span>
            <Clock className={`h-4 w-4 ${filterRegime === 'pendentes' ? 'text-[#e4b35e]' : 'text-slate-400'}`} />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono">
              {stats.pendentes}
            </div>
            <span className={`text-[11px] ${filterRegime === 'pendentes' ? 'text-slate-300' : 'text-slate-500'}`}>
              Em fila para validação
            </span>
          </div>
        </div>

      </div>

      {/* Rate Limit Banner */}
      {batchState.rateLimitedUntil && (
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-4 rounded-xl shadow-md border border-amber-400 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg shrink-0">
              <Clock className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold flex items-center gap-2">
                <span>Trava de Segurança Anti-Bloqueio Ativada (Limite de Consultas por Minuto/Hora)</span>
                <span className="bg-black/30 text-white font-mono text-xs px-2 py-0.5 rounded">
                  {batchState.rateLimitCountdown}s restantes
                </span>
              </div>
              <p className="text-xs text-amber-100 mt-0.5">
                A API pública da Receita/Simples Nacional atingiu o teto temporário de requisições. O sistema está aguardando em segundo plano e retomará a fila automaticamente.
              </p>
            </div>
          </div>

          <button
            onClick={handleCancelBatch}
            className="px-3 py-1.5 bg-black/30 hover:bg-black/50 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            Interromper
          </button>
        </div>
      )}

      {/* Batch Progress Bar Panel */}
      {batchState.isRunning && (
        <div className="bg-white p-4 rounded-xl border border-[#04243b]/20 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-bold text-[#04243b]">
              <RefreshCw className="h-4 w-4 animate-spin text-[#e4b35e]" />
              <span>Processando Consultas em Segundo Plano...</span>
              {batchState.currentSupplierName && (
                <span className="text-slate-500 font-normal truncate max-w-sm">
                  ({batchState.currentSupplierName} - {batchState.currentCnpj})
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono text-slate-700 font-bold">
                {batchState.processedCount} de {batchState.totalCount} ({Math.round((batchState.processedCount / (batchState.totalCount || 1)) * 100)}%)
              </span>

              <div className="flex items-center gap-1.5">
                {!batchState.isPaused ? (
                  <button
                    onClick={handlePauseBatch}
                    className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    <Pause className="h-3 w-3" />
                    Pausar
                  </button>
                ) : (
                  <button
                    onClick={handleResumeBatch}
                    className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    <Play className="h-3 w-3" />
                    Retomar
                  </button>
                )}

                <button
                  onClick={handleCancelBatch}
                  className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  <X className="h-3 w-3" />
                  Cancelar
                </button>
              </div>
            </div>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-[#04243b] to-[#e4b35e] h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (batchState.processedCount / (batchState.totalCount || 1)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Action Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        
        <div className="flex flex-wrap items-center gap-2">
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,.txt,.xlsx,.xls"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#04243b] hover:bg-[#031d30] text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <Upload className="h-4 w-4 text-[#e4b35e]" />
            Importar Fornecedores (CSV)
          </button>

          <button
            onClick={startBatchProcess}
            disabled={batchState.isRunning || stats.pendentes === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#e4b35e] hover:bg-[#d4a04d] text-[#04243b] rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="h-4 w-4 fill-current" />
            Consultar em Lote ({stats.pendentes})
          </button>

          {fornecedores.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={batchState.isRunning}
              className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
              title="Limpar todos os fornecedores"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}

        </div>

        {/* Right: Export Menu */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={fornecedores.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4 text-[#e4b35e]" />
            Exportar Resultados
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          {showExportMenu && (
            <div 
              className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-30 animate-fadeIn divide-y divide-slate-100"
              onMouseLeave={() => setShowExportMenu(false)}
            >
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Opções de Exportação
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    exportFornecedoresToExcel(fornecedores, 'todos');
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                >
                  <span className="font-semibold">Exportar Todos (Excel .xlsx)</span>
                  <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{fornecedores.length}</span>
                </button>
                <button
                  onClick={() => {
                    exportFornecedoresToCsv(fornecedores, 'todos');
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                >
                  <span>Exportar Todos (CSV)</span>
                </button>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    const normalList = fornecedores.filter(f => f.regimeTributario === 'REGIME_NORMAL');
                    exportFornecedoresToExcel(normalList, 'regime_normal');
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-emerald-800 hover:bg-emerald-50 flex items-center justify-between cursor-pointer"
                >
                  <span className="font-semibold">Apenas Regime Normal (Crédito Alto)</span>
                  <span className="text-[10px] bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-800">{stats.regimeNormal}</span>
                </button>
                <button
                  onClick={() => {
                    const normalList = fornecedores.filter(f => f.regimeTributario === 'REGIME_NORMAL');
                    exportFornecedoresToCsv(normalList, 'regime_normal');
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 flex items-center justify-between cursor-pointer"
                >
                  <span>Apenas Regime Normal (CSV)</span>
                </button>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    const simplesList = fornecedores.filter(f => f.regimeTributario === 'SIMPLES_NACIONAL');
                    exportFornecedoresToExcel(simplesList, 'simples_nacional');
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-amber-800 hover:bg-amber-50 flex items-center justify-between cursor-pointer"
                >
                  <span className="font-semibold">Apenas Simples Nacional (Crédito Menor)</span>
                  <span className="text-[10px] bg-amber-100 px-1.5 py-0.5 rounded text-amber-800">{stats.simplesNacional}</span>
                </button>
                <button
                  onClick={() => {
                    const simplesList = fornecedores.filter(f => f.regimeTributario === 'SIMPLES_NACIONAL');
                    exportFornecedoresToCsv(simplesList, 'simples_nacional');
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-1.5 text-xs text-amber-700 hover:bg-amber-50 flex items-center justify-between cursor-pointer"
                >
                  <span>Apenas Simples Nacional (CSV)</span>
                </button>
              </div>

            </div>
          )}
        </div>

      </div>

      {/* Search & Sorting Controls */}
      <div className="flex items-center justify-between gap-3">
        {/* Active Filter Indicator (if filtered) */}
        <div className="flex items-center gap-2">
          {filterRegime !== 'todos' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#04243b] text-[#e4b35e] text-xs font-bold rounded-lg shadow-sm">
              <span>Filtro Ativo: <strong className="capitalize">{filterRegime.replace('_', ' ')}</strong></span>
              <button 
                onClick={() => setFilterRegime('todos')}
                className="hover:text-white p-0.5 cursor-pointer"
                title="Remover filtro"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>



        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar razão social..."
              className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#04243b]"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm shrink-0"
            title={`Ordenar em ordem ${sortDirection === 'asc' ? 'Decrescente (Z-A)' : 'Alfabética (A-Z)'}`}
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
            <span>{sortDirection === 'asc' ? 'A-Z' : 'Z-A'}</span>
          </button>
        </div>

      </div>

      {/* 7. Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        
        {paginatedFornecedores.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Building2 className="h-10 w-10 text-slate-300 mx-auto" />
            <div className="text-sm font-bold text-slate-700">
              {fornecedores.length === 0 
                ? 'Nenhum fornecedor cadastrado na lista.' 
                : 'Nenhum fornecedor encontrado para o filtro aplicado.'}
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {fornecedores.length === 0 
                ? 'Importe um arquivo CSV com Razão Social e CNPJ para iniciar a auditoria do Simples Nacional.'
                : 'Tente alterar os termos de busca ou selecione a aba "Todos".'}
            </p>
            {fornecedores.length === 0 && (
              <div className="pt-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#04243b] text-[#e4b35e] rounded-xl text-xs font-bold hover:bg-[#031d30] cursor-pointer"
                >
                  <Upload className="h-4 w-4" />
                  Importar Fornecedores Agora
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#04243b] text-white select-none">
                <tr>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px]">
                    Fornecedor / Razão Social
                  </th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px]">
                    CNPJ
                  </th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px]">
                    Regime Tributário
                  </th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px]">
                    Impacto no Crédito IBS/CBS (Reforma)
                  </th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px]">
                    Localidade
                  </th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-center">
                    Status
                  </th>
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-[11px] text-right">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {paginatedFornecedores.map((f, idx) => {
                  const isNormal = f.regimeTributario === 'REGIME_NORMAL';
                  const isSimples = f.regimeTributario === 'SIMPLES_NACIONAL';
                  const isMei = f.regimeTributario === 'MEI';
                  const isPending = f.statusConsulta === 'pendente' || f.regimeTributario === 'DESCONHECIDO';
                  const isQuerying = f.statusConsulta === 'consultando';
                  const isError = f.statusConsulta === 'erro';

                  return (
                    <tr 
                      key={f.id}
                      className={`hover:bg-slate-50/85 transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 leading-snug">
                          {f.razaoSocial}
                        </div>
                        {f.nomeFantasia && f.nomeFantasia !== f.razaoSocial && (
                          <div className="text-[11px] text-slate-500 font-normal">
                            {f.nomeFantasia}
                          </div>
                        )}
                        {f.situacaoCadastral && f.situacaoCadastral !== 'ATIVA' && (
                          <span className="inline-block mt-0.5 text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-rose-100 text-rose-800">
                            Situação: {f.situacaoCadastral}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-slate-700">
                          <span>{f.cnpjFormatted || formatCnpj(f.cnpj)}</span>
                          <button
                            onClick={() => handleCopyCnpj(f.cnpjFormatted || formatCnpj(f.cnpj))}
                            className="text-slate-400 hover:text-slate-600 p-0.5"
                            title="Copiar CNPJ"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            <Clock className="h-3 w-3" />
                            Não Consultado
                          </span>
                        ) : isNormal ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              Regime Normal
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              Lucro Real / Presumido
                            </span>
                          </div>
                        ) : isSimples ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="h-3 w-3 text-amber-600" />
                              Simples Nacional
                            </span>
                            {f.dataOpcaoSimples && (
                              <span className="text-[10px] text-slate-500 block">
                                Desde {f.dataOpcaoSimples}
                              </span>
                            )}
                          </div>
                        ) : isMei ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                              SIMEI (MEI)
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        {isNormal ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-emerald-700 flex items-center gap-1">
                              <TrendingUp className="h-3.5 w-3.5" />
                              Crédito Pleno (~26,5%)
                            </div>
                            <span className="text-[10px] text-slate-600 block leading-tight">
                              Gera o máximo aproveitamento de crédito na Reforma Tributária.
                            </span>
                          </div>
                        ) : isSimples ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-amber-700 flex items-center gap-1">
                              <AlertCircle className="h-3.5 w-3.5" />
                              Crédito Reduzido
                            </div>
                            <span className="text-[10px] text-slate-600 block leading-tight">
                              Gera crédito menor, limitado ao recolhimento no DAS.
                            </span>
                          </div>
                        ) : isMei ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-blue-700">
                              Sem Crédito Fiscal
                            </div>
                            <span className="text-[10px] text-slate-600 block leading-tight">
                              Não gera transferência de créditos na Reforma.
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Pendente de análise</span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                        {f.municipio ? (
                          <div>
                            <span className="font-semibold text-slate-800">{f.municipio}</span>
                            {f.uf && <span className="text-slate-500 font-mono"> / {f.uf}</span>}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isQuerying ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
                            Consultando...
                          </span>
                        ) : isError ? (
                          <span 
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full"
                            title={f.mensagemErro || 'Erro ao consultar'}
                          >
                            <AlertCircle className="h-3 w-3 text-rose-600" />
                            Falha
                          </span>
                        ) : isPending ? (
                          <span className="text-slate-400 font-medium text-[11px]">
                            Em Fila
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-bold text-[11px] flex items-center justify-center gap-1">
                            <Check className="h-3.5 w-3.5" />
                            Validado
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleConsultarIndividual(f.id)}
                            disabled={batchState.isRunning}
                            className="p-1.5 text-slate-500 hover:text-[#04243b] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Reconsultar na API"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${isQuerying ? 'animate-spin' : ''}`} />
                          </button>

                          <button
                            onClick={() => handleDelete(f.id)}
                            disabled={batchState.isRunning}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Excluir da lista"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer - Executive & Clean Layout */}
        {filteredAndSortedFornecedores.length > 0 && (
          <div className="bg-slate-50/90 px-5 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">
                Total de <strong className="text-slate-800 font-semibold">{filteredAndSortedFornecedores.length}</strong> fornecedores listados
              </span>
            </div>

            <div className="flex items-center gap-4">
              {/* Page Size Selector */}
              <div className="flex items-center gap-1.5 text-slate-500">
                <span>Exibir:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#04243b] cursor-pointer shadow-2xs"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-[11px] text-slate-400">linhas</span>
              </div>

              {/* Vertical divider */}
              <div className="h-4 w-px bg-slate-300 hidden sm:block" />

              {/* Pagination controls */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all shadow-2xs"
                  title="Página Anterior"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Anterior</span>
                </button>

                <span className="px-2 font-mono text-xs font-bold text-slate-700">
                  {currentPage} de {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all shadow-2xs"
                  title="Próxima Página"
                >
                  <span>Próxima</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Modals */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-[#04243b] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-[#e4b35e]" />
                <h3 className="font-bold text-sm">
                  Prévia de Importação de Fornecedores ({importFileName || 'Arquivo'})
                </h3>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="font-bold text-slate-900 block">
                    Registros Identificados: {importPreview.length}
                  </span>
                  <span className="text-slate-500">
                    Válidos para importação: <strong className="text-emerald-700">{importPreview.filter(p => p.valido).length}</strong> | Com inconsistências: <strong className="text-rose-700">{importPreview.filter(p => !p.valido).length}</strong>
                  </span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 font-bold text-slate-700 sticky top-0">
                    <tr>
                      <th className="p-2.5">Razão Social / Nome</th>
                      <th className="p-2.5">CNPJ</th>
                      <th className="p-2.5">Validação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.map((item) => (
                      <tr key={item.id} className={item.valido ? 'bg-white' : 'bg-rose-50/50'}>
                        <td className="p-2.5 font-medium text-slate-900">{item.razaoSocial}</td>
                        <td className="p-2.5 font-mono text-slate-700">{item.cnpjFormatted}</td>
                        <td className="p-2.5">
                          {item.valido ? (
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Válido
                            </span>
                          ) : (
                            <span className="text-rose-700 font-medium">
                              {item.erro || 'Inválido'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={confirmImport}
                disabled={importPreview.filter(p => p.valido).length === 0}
                className="px-4 py-2 bg-[#04243b] text-[#e4b35e] rounded-xl text-xs font-bold hover:bg-[#031d30] cursor-pointer disabled:opacity-50"
              >
                Confirmar e Adicionar {importPreview.filter(p => p.valido).length} Fornecedores
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Histórico Modal */}
      {showHistoricoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-[#04243b] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-[#e4b35e]" />
                <h3 className="font-bold text-sm">Histórico de Consultas Salvas por Empresa</h3>
              </div>
              <button onClick={() => setShowHistoricoModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 text-xs">
              {historico.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  Nenhum histórico de consulta salvo ainda. Execute consultas em lote para registrar o histórico automaticamente.
                </div>
              ) : (
                historico.map(h => (
                  <div key={h.id} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#04243b]">
                        {h.clienteRazao} ({formatCnpj(h.clienteCnpj)})
                      </div>
                      <div className="text-slate-500 text-[11px] mt-0.5">
                        Data: {new Date(h.timestamp).toLocaleString('pt-BR')} • Total: {h.totalFornecedores} fornecedores (Regime Normal: {h.regimeNormalCount}, Simples: {h.simplesCount})
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setFornecedores(h.fornecedoresSnapshot);
                        setShowHistoricoModal(false);
                        showToast('Histórico carregado com sucesso!', 'success');
                      }}
                      className="px-3 py-1.5 bg-[#04243b] text-[#e4b35e] rounded-lg text-xs font-bold hover:bg-[#031d30] cursor-pointer shrink-0"
                    >
                      Carregar
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-end">
              <button
                onClick={() => setShowHistoricoModal(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Relatório Executivo Timbrado (A4) com Dados do Cliente */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            
            <div className="bg-[#04243b] text-white p-4 flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-[#e4b35e]" />
                <h3 className="font-bold text-sm">
                  Visualização do Relatório Executivo (A4 Timbrado com Dados do Cliente)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#e4b35e] text-[#04243b] rounded-lg text-xs font-extrabold hover:bg-[#d4a04d] cursor-pointer"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir / Salvar PDF
                </button>
                <button onClick={() => setShowPrintModal(false)} className="text-slate-400 hover:text-white p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-8 overflow-y-auto space-y-6 text-slate-800 bg-white" id="printable-relatorio-fornecedores">
              
              {/* Corporate Header */}
              <div className="border-b-2 border-[#04243b] pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-[#04243b] tracking-tight">
                    MOREIRA & LIMA CONTADORES ASSOCIADOS
                  </h2>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    Departamento de Inteligência & Consultoria Tributária • Reforma Tributária (EC 132/23 & LC 214/24)
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500 font-mono">
                  <div>Data: {new Date().toLocaleDateString('pt-BR')}</div>
                  <div>Hora: {new Date().toLocaleTimeString('pt-BR')}</div>
                </div>
              </div>

              {/* Client Info Box */}
              {selectedClient && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1 text-xs">
                  <div className="text-[10px] font-bold text-[#04243b] uppercase tracking-wider">
                    Empresa Cliente em Auditoria:
                  </div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {selectedClient.razaoSocial}
                  </div>
                  <div className="text-slate-600 font-mono">
                    CNPJ: {formatCnpj(selectedClient.cnpj)} • Regime: {selectedClient.regimeTributario} {selectedClient.cidade ? `• ${selectedClient.cidade} / ${selectedClient.uf || selectedClient.estado || ''}` : ''}
                  </div>
                </div>
              )}

              {/* Title & Framing */}
              <div className="bg-[#04243b]/5 p-4 rounded-xl border border-[#04243b]/20 space-y-1">
                <h3 className="text-sm font-bold text-[#04243b] uppercase tracking-wide">
                  Relatório de Auditoria e Qualificação Tributária de Fornecedores
                </h3>
                <p className="text-xs text-slate-600">
                  Análise de enquadramento no Simples Nacional vs. Regime Normal para mensuração de potencial de crédito do IVA Dual (IBS & CBS).
                </p>
              </div>

              {/* Summary Stats Table */}
              <div className="grid grid-cols-4 gap-3 text-center text-xs">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Total Analisado</span>
                  <span className="text-lg font-bold font-mono text-slate-900">{stats.total}</span>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-emerald-900">
                  <span className="text-[10px] text-emerald-700 block uppercase font-bold">Regime Normal</span>
                  <span className="text-lg font-bold font-mono">{stats.regimeNormal} ({stats.percRegimeNormal.toFixed(1)}%)</span>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-900">
                  <span className="text-[10px] text-amber-700 block uppercase font-bold">Simples Nacional</span>
                  <span className="text-lg font-bold font-mono">{stats.simplesNacional}</span>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-blue-900">
                  <span className="text-[10px] text-blue-700 block uppercase font-bold">MEI</span>
                  <span className="text-lg font-bold font-mono">{stats.mei}</span>
                </div>
              </div>

              {/* Suppliers Table in Alphabetical Order */}
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 text-slate-900 border-b border-slate-300 font-bold">
                    <tr>
                      <th className="p-2">Razão Social</th>
                      <th className="p-2">CNPJ</th>
                      <th className="p-2">Regime Tributário</th>
                      <th className="p-2">Potencial de Crédito IBS/CBS</th>
                      <th className="p-2">UF/Cidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredAndSortedFornecedores.map(f => (
                      <tr key={f.id} className="leading-tight">
                        <td className="p-2 font-semibold text-slate-900">{f.razaoSocial}</td>
                        <td className="p-2 font-mono">{f.cnpjFormatted || formatCnpj(f.cnpj)}</td>
                        <td className="p-2">
                          {f.regimeTributario === 'REGIME_NORMAL' ? (
                            <span className="text-emerald-800 font-bold">Regime Normal</span>
                          ) : f.regimeTributario === 'SIMPLES_NACIONAL' ? (
                            <span className="text-amber-800 font-bold">Simples Nacional</span>
                          ) : f.regimeTributario === 'MEI' ? (
                            <span className="text-blue-800 font-bold">SIMEI (MEI)</span>
                          ) : (
                            <span className="text-slate-400">Pendente</span>
                          )}
                        </td>
                        <td className="p-2 font-medium">
                          {f.potencialCreditoIbsCbs === 'INTEGRAL' ? (
                            <strong className="text-emerald-700">Crédito Pleno (~26,5%)</strong>
                          ) : f.potencialCreditoIbsCbs === 'RESTRITO' ? (
                            <span className="text-amber-700">Crédito Restrito (DAS)</span>
                          ) : f.potencialCreditoIbsCbs === 'NENHUM' ? (
                            <span className="text-blue-700">Sem Crédito</span>
                          ) : (
                            <span className="text-slate-400">Pendente</span>
                          )}
                        </td>
                        <td className="p-2 text-slate-600">{f.municipio ? `${f.municipio}/${f.uf}` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Technical Footnote */}
              <div className="text-[10px] text-slate-500 border-t border-slate-200 pt-3 space-y-1">
                <p>
                  <strong>Fundamentação Legal:</strong> Emenda Constitucional nº 132/2023 e Lei Complementar nº 214/2024. A não-cumulatividade plena do Imposto sobre Bens e Serviços (IBS) e da Contribuição sobre Bens e Serviços (CBS) garante aproveitamento integral de créditos gerados em aquisições de pessoas jurídicas tributadas pelo regime regular.
                </p>
                <p>
                  Moreira & Lima Contadores Associados • Todos os direitos reservados.
                </p>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
};
