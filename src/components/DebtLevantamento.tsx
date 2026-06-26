/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Edit2, 
  Download, 
  Upload, 
  FileSpreadsheet, 
  Briefcase, 
  Settings, 
  AlertCircle,
  TrendingDown,
  Percent,
  CheckCircle,
  FileCheck2,
  FileUp,
  X,
  RefreshCw,
  FolderSync,
  Layers,
  ShieldAlert,
  Sliders,
  ChevronRight,
  Info,
  Sparkles,
  Search,
  ArrowLeft,
  Check
} from 'lucide-react';
import { DebtItem, ClientInfo, DebtCategory } from '../types_debits';
import { 
  parseSituationFiscalText, 
  SAMPLE_RECEITA_FEDERAL, 
  SAMPLE_SEFAZ, 
  SAMPLE_SEFIN 
} from '../utils/debtParser';
import { exportDebtsToPDF } from '../utils/pdfExporter';
import { exportDebtsToExcel } from '../utils/excelExporter';
import { extractTextFromPdf } from '../utils/pdfExtractor';

const formatCurrencyString = (value: string | number): string => {
  const clean = typeof value === 'number' ? value.toFixed(2).replace(/\D/g, '') : value.toString().replace(/\D/g, '');
  if (!clean || clean === '0' || clean === '00') return 'R$ 0,00';
  const cents = parseInt(clean, 10);
  const realValue = cents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(realValue);
};

const parseCurrencyToNumber = (formattedStr: string): number => {
  if (!formattedStr) return 0;
  const digits = formattedStr.toString().replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
};

const INITIAL_CATEGORIES: DebtCategory[] = [
  {
    id: 'cat-previdenciarios',
    categoryType: 'PARCELAMENTO',
    origin: 'FEDERAL',
    documentType: 'DARF',
    title: 'PARCELAMENTOS PREVIDENCIÁRIOS',
    scope: 'ADMINISTRATIVO',
    code: ''
  },
  {
    id: 'cat-previdenciario-tributo',
    categoryType: 'TRIBUTO',
    origin: 'FEDERAL',
    documentType: 'DARF',
    title: 'PREVIDENCIÁRIO',
    scope: 'ADMINISTRATIVO'
  },
  {
    id: 'cat-simples-nacional',
    categoryType: 'TRIBUTO',
    origin: 'FEDERAL',
    documentType: 'DAS',
    title: 'DAS SIMPLES NACIONAL',
    scope: 'ADMINISTRATIVO'
  },
  {
    id: 'cat-mei',
    categoryType: 'PARCELAMENTO',
    origin: 'FEDERAL',
    documentType: 'DAS',
    title: 'PARCELAMENTO MEI',
    scope: 'ADMINISTRATIVO'
  },
  {
    id: 'cat-pis',
    categoryType: 'TRIBUTO',
    origin: 'FEDERAL',
    documentType: 'DARF',
    title: 'PIS',
    scope: 'ADMINISTRATIVO'
  },
  {
    id: 'cat-cofins',
    categoryType: 'TRIBUTO',
    origin: 'FEDERAL',
    documentType: 'DARF',
    title: 'COFINS',
    scope: 'ADMINISTRATIVO'
  },
  {
    id: 'cat-irpj',
    categoryType: 'TRIBUTO',
    origin: 'FEDERAL',
    documentType: 'DARF',
    title: 'IRPJ',
    scope: 'ADMINISTRATIVO'
  },
  {
    id: 'cat-csll',
    categoryType: 'TRIBUTO',
    origin: 'FEDERAL',
    documentType: 'DARF',
    title: 'CSLL',
    scope: 'ADMINISTRATIVO'
  },
  {
    id: 'cat-icms',
    categoryType: 'TRIBUTO',
    origin: 'ESTADUAL',
    documentType: 'DAE',
    title: 'ICMS',
    scope: 'ADMINISTRATIVO'
  },
  {
    id: 'cat-iss',
    categoryType: 'TRIBUTO',
    origin: 'MUNICIPAL',
    documentType: 'DAM',
    title: 'ISS',
    scope: 'ADMINISTRATIVO'
  },
  {
    id: 'cat-simples-nacional-parc',
    categoryType: 'PARCELAMENTO',
    origin: 'FEDERAL',
    documentType: 'DAS',
    title: 'PARCELAMENTOS SIMPLES NACIONAL',
    scope: 'ADMINISTRATIVO'
  },
  {
    id: 'cat-icms-pge',
    categoryType: 'TRIBUTO',
    origin: 'ESTADUAL',
    documentType: 'DAE',
    title: 'ICMS DÍVIDA ATIVA (PGE)',
    scope: 'DIVIDA_ATIVA'
  },
  {
    id: 'cat-darf-pgfn',
    categoryType: 'MULTAS',
    origin: 'FEDERAL',
    documentType: 'DARF',
    title: 'MULTA FEDERAL INSCRITA EM DÍVIDA ATIVA',
    scope: 'DIVIDA_ATIVA'
  },
  {
    id: 'cat-multa-maed',
    categoryType: 'MULTAS',
    origin: 'FEDERAL',
    documentType: 'DAS',
    title: 'MULTA MAED - PGDAS-D',
    scope: 'ADMINISTRATIVO',
    code: '4406-01'
  },
  {
    id: 'cat-multa-dctfweb',
    categoryType: 'MULTAS',
    origin: 'FEDERAL',
    documentType: 'DARF',
    title: 'MULTA MAED - DCTFWEB',
    scope: 'ADMINISTRATIVO',
    code: '5440-01'
  }
];

interface SearchableCategorySelectProps {
  value: string;
  categories: DebtCategory[];
  onChange: (value: string) => void;
}

const SearchableCategorySelect: React.FC<SearchableCategorySelectProps> = ({ value, categories, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filteredCategories = categories.filter(cat => 
    cat.title.toLowerCase().includes(search.toLowerCase())
  );

  const showFallback = value && !categories.some(c => c.title.toUpperCase() === value.toUpperCase());

  return (
    <div className="relative" ref={dropdownRef}>
      <div 
        onClick={() => {
          setIsOpen(!isOpen);
          setSearch('');
        }}
        className="w-full p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#e4b35e] cursor-pointer flex items-center justify-between min-h-[32px] transition-all"
      >
        <span className="truncate text-slate-800 uppercase max-w-[140px] block">{value || 'Selecione a Categoria'}</span>
        <span className="text-slate-400 text-[9px] ml-1 shrink-0">▼</span>
      </div>

      {isOpen && (
        <div className="absolute left-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 space-y-2 animate-fadeIn max-h-60 flex flex-col">
          <div className="relative shrink-0">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Digitar para buscar..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#e4b35e] focus:bg-white transition-all"
            />
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100 pr-0.5">
            {filteredCategories.length === 0 ? (
              <div className="py-3 px-2 text-center text-[11px] text-slate-400 font-bold">
                Nenhuma categoria encontrada
              </div>
            ) : (
              filteredCategories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    onChange(cat.title);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 text-xs font-semibold rounded-md flex items-center justify-between transition-colors hover:bg-slate-50 cursor-pointer ${value.toUpperCase() === cat.title.toUpperCase() ? 'bg-amber-50 text-[#04243b]' : 'text-slate-700'}`}
                >
                  <span className="truncate uppercase">{cat.title}</span>
                  {value.toUpperCase() === cat.title.toUpperCase() && (
                    <Check className="h-3 w-3 text-[#e4b35e] shrink-0 ml-1" />
                  )}
                </button>
              ))
            )}
            
            {showFallback && search === '' && (
              <button
                type="button"
                onClick={() => {
                  onChange(value);
                  setIsOpen(false);
                }}
                className="w-full text-left px-2.5 py-2 text-xs font-semibold rounded-md flex items-center justify-between text-[#04243b] bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <span className="truncate uppercase">{value}</span>
                <Check className="h-3 w-3 text-[#e4b35e]" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export function getAdministrationOrgan(origin: 'FEDERAL' | 'ESTADUAL' | 'MUNICIPAL', scope: 'ADMINISTRATIVO' | 'DIVIDA_ATIVA'): string {
  if (origin === 'FEDERAL') {
    return scope === 'ADMINISTRATIVO' ? 'RFB' : 'PGFN';
  } else if (origin === 'ESTADUAL') {
    return scope === 'ADMINISTRATIVO' ? 'SEFAZ' : 'PGE';
  } else {
    return scope === 'ADMINISTRATIVO' ? 'SEFIN' : 'PGM';
  }
}

export function DebtLevantamento() {
  // Client Info State
  const [clientInfo, setClientInfo] = useState<ClientInfo>(() => {
    const saved = localStorage.getItem('debt_client_info');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return {
      cnpj: '',
      name: ''
    };
  });

  // Structured Categories State
  const [categories, setCategories] = useState<DebtCategory[]>(() => {
    const saved = localStorage.getItem('debt_categories');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_CATEGORIES;
  });

  // Filter for origins
  const [originFilter, setOriginFilter] = useState<'TODOS' | 'FEDERAL' | 'ESTADUAL' | 'MUNICIPAL'>('TODOS');

  // Debt Items List
  const [debts, setDebts] = useState<DebtItem[]>(() => {
    const saved = localStorage.getItem('debt_items');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  // State for visual zoom level of the tool (80% default means 20% reduction)
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    const saved = localStorage.getItem('debt_tool_zoom');
    return saved ? Number(saved) : 80;
  });

  useEffect(() => {
    localStorage.setItem('debt_tool_zoom', String(zoomLevel));
  }, [zoomLevel]);

  // Synchronize to localStorage
  useEffect(() => {
    localStorage.setItem('debt_client_info', JSON.stringify(clientInfo));
  }, [clientInfo]);

  useEffect(() => {
    localStorage.setItem('debt_categories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem('debt_items', JSON.stringify(debts));
  }, [debts]);

  // Settings Panel and Modal states
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'tributos' | 'parcelamento' | 'multas'>('tributos');
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState<boolean>(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  // Category Form Fields
  const [categoryTitle, setCategoryTitle] = useState<string>('');
  const [categoryCode, setCategoryCode] = useState<string>('');
  const [categoryType, setCategoryType] = useState<'TRIBUTO' | 'PARCELAMENTO' | 'MULTAS'>('TRIBUTO');
  const [categoryOrigin, setCategoryOrigin] = useState<'FEDERAL' | 'ESTADUAL' | 'MUNICIPAL'>('FEDERAL');
  const [categoryDocType, setCategoryDocType] = useState<'DARF' | 'DAS' | 'DAE' | 'DAM'>('DARF');
  const [categoryScope, setCategoryScope] = useState<'ADMINISTRATIVO' | 'DIVIDA_ATIVA'>('ADMINISTRATIVO');

  // UI state for manual debt add
  const [isAddingDebt, setIsAddingDebt] = useState<boolean>(false);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);

  // New Debt Form State
  const [formCategoryTitle, setFormCategoryTitle] = useState<string>('');
  const [formPeriod, setFormPeriod] = useState<string>('');
  const [formPrincipal, setFormPrincipal] = useState<string>('');
  const [formTotal, setFormTotal] = useState<string>('');
  const [formStatus, setFormStatus] = useState<string>('DEVEDOR');
  const periodInputRef = useRef<HTMLInputElement>(null);

  // Import Modal & Process states
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isCsvImportModalOpen, setIsCsvImportModalOpen] = useState<boolean>(false);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processedFileName, setProcessedFileName] = useState<string>('');
  const [pasteText, setPasteText] = useState<string>('');
  const [importNotification, setImportNotification] = useState<string | null>(null);

  // States for interactive data preview & review
  const [tempParsedDebts, setTempParsedDebts] = useState<any[]>([]);
  const [tempClientInfo, setTempClientInfo] = useState<{ cnpj: string; name: string }>({ cnpj: '', name: '' });
  const [isPreviewingImport, setIsPreviewingImport] = useState<boolean>(false);
  const [activeImportTab, setActiveImportTab] = useState<'upload' | 'paste' | 'manual'>('upload');

  // Multi-step category-based wizard states
  const [selectedCategory, setSelectedCategory] = useState<DebtCategory | null>(null);
  const [importStep, setImportStep] = useState<'select-category' | 'choose-method' | 'validate-debts' | 'success'>('select-category');
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');
  const [isCreatingCategoryInWizard, setIsCreatingCategoryInWizard] = useState<boolean>(false);
  const [newCatTitle, setNewCatTitle] = useState<string>('');
  const [newCatOrigin, setNewCatOrigin] = useState<'FEDERAL' | 'ESTADUAL' | 'MUNICIPAL'>('FEDERAL');

  // Quick manual input state inside the wizard
  const [manualPeriod, setManualPeriod] = useState<string>('');
  const [manualPrincipal, setManualPrincipal] = useState<string>('');
  const [manualPenalty, setManualPenalty] = useState<string>('');
  const [manualInterest, setManualInterest] = useState<string>('');
  const [manualStatus, setManualStatus] = useState<string>('DEVEDOR');

  // Global Drag State
  const [isGlobalDragActive, setIsGlobalDragActive] = useState<boolean>(false);
  const dragCounter = useRef<number>(0);

  // Safe confirmation/alert state (replacing native alert/confirm for sandbox)
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: ''
  });

  const showAlert = (title: string, message: string) => {
    setModalState({
      isOpen: true,
      type: 'alert',
      title,
      message
    });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalState({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      onConfirm
    });
  };

  // Spreadsheet template modal state

  const downloadCsvTemplate = () => {
    const headers = 'CATEGORIA;CODIGO;COMPETENCIA;VALOR_ORIGINAL;VALOR_ATUALIZADO;SITUACAO\n';
    const rows = [
      'DAS SIMPLES NACIONAL;1099;03/2026;298,84;364,78;DEVEDOR',
      'ICMS;2031;04/2026;1250,00;1400,00;DEVEDOR',
      'ISS;3050;05/2026;900,00;1008,00;DEVEDOR',
      'PARCELAMENTO MEI;4002;05/2026;1589,34;1589,34;EM PARCELAMENTO'
    ].join('\n');
    
    // Add UTF-8 BOM so Excel opens it with correct Portuguese accents/characters
    const csvContent = '\uFEFF' + headers + rows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'modelo_importacao_debitos.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showTempNotification('Planilha modelo CSV baixada com sucesso!');
  };

  // Helper to format currency in Real (BRL)
  const formatBrl = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Helper to resolve category structured attributes safely
  const getCategoryByTitle = (title: string): DebtCategory => {
    const found = categories.find(c => c.title.toLowerCase() === title.toLowerCase());
    if (found) return found;
    return {
      id: `fallback-${title}`,
      title: title,
      categoryType: 'TRIBUTO',
      origin: 'FEDERAL',
      documentType: 'DARF',
      scope: 'ADMINISTRATIVO'
    };
  };

  const showTempNotification = (msg: string) => {
    setImportNotification(msg);
    setTimeout(() => {
      setImportNotification(null);
    }, 5000);
  };

  // Save or Create structured Category
  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = categoryTitle.trim().toUpperCase();
    if (!trimmedTitle) {
      showAlert('Campo Obrigatório', 'Por favor, preencha a descrição do débito no campo Título.');
      return;
    }

    if (editingCategoryId) {
      // Editing category
      const oldCategory = categories.find(c => c.id === editingCategoryId);
      if (!oldCategory) return;

      // Check duplicate title among OTHER categories
      if (categories.some(c => c.id !== editingCategoryId && c.title.toUpperCase() === trimmedTitle)) {
        showAlert('Título Duplicado', 'Já existe uma categoria cadastrada com este título!');
        return;
      }

      setCategories(prev => prev.map(c => {
        if (c.id === editingCategoryId) {
          return {
            id: editingCategoryId,
            title: trimmedTitle,
            categoryType,
            origin: categoryOrigin,
            documentType: categoryDocType,
            scope: categoryScope,
            code: categoryCode.trim() || undefined
          };
        }
        return c;
      }));

      // Update any associated debts
      setDebts(prev => prev.map(d => {
        if (d.category.toUpperCase() === oldCategory.title.toUpperCase()) {
          return { ...d, category: trimmedTitle };
        }
        return d;
      }));

      showTempNotification(`Categoria "${trimmedTitle}" atualizada com sucesso!`);
    } else {
      // Creating new category
      if (categories.some(c => c.title.toUpperCase() === trimmedTitle)) {
        showAlert('Título Duplicado', 'Já existe uma categoria cadastrada com este título!');
        return;
      }

      const newCat: DebtCategory = {
        id: `cat-${Math.random().toString(36).substr(2, 9)}`,
        title: trimmedTitle,
        categoryType,
        origin: categoryOrigin,
        documentType: categoryDocType,
        scope: categoryScope,
        code: categoryCode.trim() || undefined
      };

      setCategories(prev => [...prev, newCat]);
      showTempNotification(`Categoria de débito "${trimmedTitle}" cadastrada com sucesso!`);
    }

    // Reset Form
    setCategoryTitle('');
    setCategoryCode('');
    setEditingCategoryId(null);
    setIsCategoryFormOpen(false);
  };

  // Trigger editing a category
  const startEditCategory = (cat: DebtCategory) => {
    setEditingCategoryId(cat.id);
    setCategoryTitle(cat.title);
    setCategoryCode(cat.code || '');
    setCategoryType(cat.categoryType);
    setCategoryOrigin(cat.origin);
    setCategoryDocType(cat.documentType);
    setCategoryScope(cat.scope);
    setIsCategoryFormOpen(true);
  };

  // Delete category
  const handleDeleteCategory = (cat: DebtCategory) => {
    const associatedCount = debts.filter(d => d.category.toLowerCase() === cat.title.toLowerCase()).length;
    if (associatedCount > 0) {
      showConfirm(
        'Excluir Categoria',
        `Esta categoria possui ${associatedCount} débito(s) associado(s). Deseja realmente excluí-la? Os débitos continuarão, mas você precisará reclassificá-los.`,
        () => {
          setCategories(prev => prev.filter(c => c.id !== cat.id));
          showTempNotification(`Categoria "${cat.title}" excluída.`);
        }
      );
    } else {
      showConfirm(
        'Excluir Categoria',
        `Deseja realmente excluir a categoria "${cat.title}"?`,
        () => {
          setCategories(prev => prev.filter(c => c.id !== cat.id));
          showTempNotification(`Categoria "${cat.title}" excluída.`);
        }
      );
    }
  };

  // Add or Update Debt Item
  const handleSaveDebt = (e: React.FormEvent) => {
    e.preventDefault();
    
    const principalNum = parseCurrencyToNumber(formPrincipal);
    let totalNum = parseCurrencyToNumber(formTotal);
    if (totalNum === 0) {
      totalNum = principalNum;
    }

    if (!formPeriod) {
      showAlert('Competência Requerida', 'Favor preencher a competência (ex: 05/2026)');
      return;
    }

    const finalCategory = formCategoryTitle || (categories[0]?.title || 'DAS SIMPLES NACIONAL');

    if (editingDebtId) {
      // Editing Mode
      setDebts(prev => prev.map(item => {
        if (item.id === editingDebtId) {
          return {
            ...item,
            category: finalCategory,
            period: formPeriod,
            principal: principalNum,
            penalty: 0,
            interest: 0,
            total: totalNum,
            status: formStatus
          };
        }
        return item;
      }));
      setEditingDebtId(null);
      showTempNotification('Débito updated with success!');
      
      // Reset Form and close Modal for editing mode
      setIsAddingDebt(false);
      setFormPeriod('');
      setFormPrincipal('');
      setFormTotal('');
    } else {
      // Add Mode
      const newDebt: DebtItem = {
        id: Math.random().toString(36).substr(2, 9),
        category: finalCategory,
        period: formPeriod,
        principal: principalNum,
        penalty: 0,
        interest: 0,
        total: totalNum,
        status: formStatus
      };
      setDebts(prev => [...prev, newDebt]);
      showTempNotification('Débito cadastrado com sucesso!');
      
      // KEEP the modal open, only clear inputs for the next entry
      setFormPeriod('');
      setFormPrincipal('');
      setFormTotal('');
      
      // Auto-focus the Period input field so the user can immediately type the next one
      setTimeout(() => {
        if (periodInputRef.current) {
          periodInputRef.current.focus();
        }
      }, 50);
    }
  };

  // Edit triggers form loading
  const startEditDebt = (debt: DebtItem) => {
    setEditingDebtId(debt.id);
    setFormCategoryTitle(debt.category);
    setFormPeriod(debt.period);
    setFormPrincipal(formatCurrencyString(debt.principal));
    setFormTotal(formatCurrencyString(debt.total));
    setFormStatus(debt.status || 'DEVEDOR');
    setIsAddingDebt(true);
  };

  // Delete Debt Item
  const handleDeleteDebt = (id: string) => {
    showConfirm(
      'Excluir Débito',
      'Deseja realmente excluir este débito do levantamento?',
      () => {
        setDebts(prev => prev.filter(item => item.id !== id));
        showTempNotification('Débito removido com sucesso.');
      }
    );
  };

  // Load sample plain text for instant testing
  const loadSampleText = (type: 'rfb' | 'sefaz' | 'sefin') => {
    if (type === 'rfb') {
      setPasteText(SAMPLE_RECEITA_FEDERAL);
    } else if (type === 'sefaz') {
      setPasteText(SAMPLE_SEFAZ);
    } else if (type === 'sefin') {
      setPasteText(SAMPLE_SEFIN);
    }
    showTempNotification('Amostra de texto carregada no campo. Clique em Sincronizar Relatório!');
  };

  // Find the best category matching a title or code
  const findBestCategoryMatch = (rawName: string, code?: string) => {
    const normRaw = (rawName || '').toLowerCase();
    const normCode = (code || '').toLowerCase();
    
    // Try exact match with category code
    if (normCode) {
      const found = categories.find(c => c.code && c.code.toLowerCase() === normCode);
      if (found) return found.title;
    }
    
    // Try partial match with code
    if (normCode) {
      const found = categories.find(c => c.code && (c.code.toLowerCase().includes(normCode) || normCode.includes(c.code.toLowerCase())));
      if (found) return found.title;
    }

    // Try match with category title
    const foundByTitle = categories.find(c => c.title.toLowerCase() === normRaw);
    if (foundByTitle) return foundByTitle.title;

    // SIEF / RFB common keywords matching
    if (normRaw.includes('simples') || normRaw.includes('das') || normRaw.includes('pgdas')) {
      const found = categories.find(c => c.title.includes('SIMPLES NACIONAL') || c.title.includes('DAS'));
      if (found) return found.title;
      return 'DAS SIMPLES NACIONAL';
    }
    if (normRaw.includes('previdenci') || normRaw.includes('cp-segur') || normRaw.includes('inss') || normRaw.includes('prev')) {
      const found = categories.find(c => c.title.includes('PREVIDENCIÁRIO') || c.title.includes('INSS'));
      if (found) return found.title;
      return 'PARCELAMENTO PREVIDENCIÁRIO';
    }
    if (normRaw.includes('mei') || normRaw.includes('simei')) {
      const found = categories.find(c => c.title.includes('MEI') || c.title.includes('DAS-MEI'));
      if (found) return found.title;
    }
    if (normRaw.includes('multa')) {
      const found = categories.find(c => c.title.includes('MULTA'));
      if (found) return found.title;
    }
    
    // If nothing matched, look for similar prefix or return first category as fallback or keep raw text
    const matched = categories.find(c => normRaw.includes(c.title.toLowerCase()) || c.title.toLowerCase().includes(normRaw));
    if (matched) return matched.title;

    return rawName.toUpperCase(); // Fallback to raw uppercase text
  };

  // Process pasted Situação Fiscal Text with optional Gemini assist
  const handleImportText = async () => {
    if (!pasteText.trim()) {
      showAlert('Campo Vazio', 'Por favor, cole o texto do relatório fiscal ou use as amostras rápidas.');
      return;
    }

    setProcessedFileName('Texto Copiado');
    setIsProcessingFile(true);
    setProcessingProgress(25);

    const interval = setInterval(() => {
      setProcessingProgress(prev => {
        if (prev >= 85) return 85;
        return prev + 10;
      });
    }, 150);

    try {
      // Always try Gemini AI for pasted text
      const response = await fetch("/api/gemini/parse-debt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: pasteText,
          category: selectedCategory?.title
        })
      });

      clearInterval(interval);
      setProcessingProgress(100);

      if (!response.ok) {
        throw new Error("Erro de resposta do servidor backend");
      }

      const data = await response.json();
      if (data && data.debts) {
        if (data.clientInfo && (data.clientInfo.cnpj || data.clientInfo.name)) {
          setTempClientInfo(data.clientInfo);
        }
        
        const mappedDebts = data.debts.map((d: any, index: number) => ({
          id: `temp-${index}-${Date.now()}`,
          category: selectedCategory?.title || findBestCategoryMatch(d.categoryRaw, d.code),
          period: d.period || '',
          principal: Number(d.principal) || 0,
          penalty: Number(d.penalty) || 0,
          interest: Number(d.interest) || 0,
          total: Number(d.total) || (Number(d.principal) || 0) + (Number(d.penalty) || 0) + (Number(d.interest) || 0),
          status: d.status || 'DEVEDOR'
        }));

        setTempParsedDebts(mappedDebts);
        setIsPreviewingImport(true);
        setImportStep('validate-debts');
        showTempNotification("Leitura inteligente realizada com sucesso via IA Gemini!");
      } else {
        throw new Error("Resposta inválida da IA");
      }
    } catch (err) {
      clearInterval(interval);
      setProcessingProgress(100);
      console.warn("Fallback to regex parsing on paste:", err);

      // Local Regex Parser Fallback
      const { clientInfo: parsedClient, debts: parsedDebts } = parseSituationFiscalText(pasteText, categories);
      if (parsedClient.cnpj || parsedClient.name) {
        setTempClientInfo(parsedClient);
      }
      
      const mappedDebts = parsedDebts.map((d: any, index: number) => ({
        ...d,
        id: `temp-${index}-${Date.now()}`,
        category: selectedCategory?.title || findBestCategoryMatch(d.category, '')
      }));

      setTempParsedDebts(mappedDebts);
      setIsPreviewingImport(true);
      setImportStep('validate-debts');
      showTempNotification("Leitura padrão concluída. Verifique os dados abaixo.");
    } finally {
      setIsProcessingFile(false);
    }
  };

  // Process any uploaded file (PDF, Excel, txt) with progress animation
  const handleProcessFile = (file: File) => {
    setProcessedFileName(file.name);
    setIsProcessingFile(true);
    setProcessingProgress(15);
    
    const interval = setInterval(() => {
      setProcessingProgress(prev => {
        if (prev >= 90) {
          return 90; // stay at 90% until done
        }
        return prev + 15;
      });
    }, 150);

    const onTextExtracted = async (textContent: string) => {
      try {
        setProcessingProgress(60);
        // Call backend to parse using server-side Gemini
        const response = await fetch("/api/gemini/parse-debt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            text: textContent,
            category: selectedCategory?.title
          })
        });

        clearInterval(interval);
        setProcessingProgress(100);

        if (!response.ok) {
          throw new Error("Erro na chamada da IA");
        }

        const data = await response.json();
        if (data && data.debts) {
          if (data.clientInfo && (data.clientInfo.cnpj || data.clientInfo.name)) {
            setTempClientInfo(data.clientInfo);
          }
          
          const mappedDebts = data.debts.map((d: any, index: number) => ({
            id: `temp-${index}-${Date.now()}`,
            category: selectedCategory?.title || findBestCategoryMatch(d.categoryRaw, d.code),
            period: d.period || '',
            principal: Number(d.principal) || 0,
            penalty: Number(d.penalty) || 0,
            interest: Number(d.interest) || 0,
            total: Number(d.total) || (Number(d.principal) || 0) + (Number(d.penalty) || 0) + (Number(d.interest) || 0),
            status: d.status || 'DEVEDOR'
          }));

          setTempParsedDebts(mappedDebts);
          setIsPreviewingImport(true);
          setImportStep('validate-debts');
          showTempNotification(`Leitura de "${file.name}" feita com sucesso via IA Gemini!`);
        } else {
          throw new Error("Dados inválidos");
        }

      } catch (err) {
        clearInterval(interval);
        setProcessingProgress(100);
        console.warn("Falling back to local regex parser:", err);

        // Fallback to local regex-based parsing
        const { clientInfo: parsedClient, debts: parsedDebts } = parseSituationFiscalText(textContent || file.name, categories);
        
        if (parsedClient.cnpj || parsedClient.name) {
          setTempClientInfo(parsedClient);
        }
        const mappedDebts = parsedDebts.map((d: any, index: number) => ({
          ...d,
          id: `temp-${index}-${Date.now()}`,
          category: selectedCategory?.title || findBestCategoryMatch(d.category, '')
        }));

        setTempParsedDebts(mappedDebts);
        setIsPreviewingImport(true);
        setImportStep('validate-debts');
        showTempNotification(`Leitura de "${file.name}" concluída. Por favor, revise as informações.`);
      } finally {
        setIsProcessingFile(false);
      }
    };

    const reader = new FileReader();
    if (file.name.toLowerCase().endsWith('.csv')) {
      reader.onload = (e) => {
        try {
          const csvText = e.target?.result as string || '';
          const lines = csvText.split(/\r?\n/);
          if (lines.length === 0) throw new Error("A planilha está vazia.");
          
          let headersIndex = -1;
          let headers: string[] = [];
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const upper = line.toUpperCase();
            if (upper.includes('CATEGORIA') || upper.includes('COMPETENCIA') || upper.includes('SITUACAO') || upper.includes('CODIGO') || upper.includes('COMPETÊNCIA') || upper.includes('SITUAÇÃO')) {
              headersIndex = i;
              const separator = line.includes(';') ? ';' : ',';
              headers = line.split(separator).map(h => h.trim().toUpperCase().replace(/^["']|["']$/g, ''));
              break;
            }
          }
          
          if (headersIndex === -1) {
            headers = ['CATEGORIA', 'CODIGO', 'COMPETENCIA', 'VALOR_ORIGINAL', 'VALOR_ATUALIZADO', 'SITUACAO'];
            headersIndex = -1;
          }
          
          const parsedDebts: any[] = [];
          const startRow = headersIndex + 1;
          
          const colIndex = (name: string) => headers.findIndex(h => h.includes(name));
          
          const idxCat = colIndex('CATEGORIA') !== -1 ? colIndex('CATEGORIA') : colIndex('CATEGORY');
          const idxCode = colIndex('CODIGO') !== -1 ? colIndex('CODIGO') : colIndex('CODE');
          const idxPeriod = colIndex('COMPETENCIA') !== -1 ? colIndex('COMPETENCIA') : (colIndex('COMPETÊNCIA') !== -1 ? colIndex('COMPETÊNCIA') : colIndex('COMPETENCE'));
          const idxPrincipal = colIndex('VALOR_ORIGINAL') !== -1 ? colIndex('VALOR_ORIGINAL') : (colIndex('VALOR') !== -1 ? colIndex('VALOR') : colIndex('VALUE'));
          const idxPenalty = colIndex('MULTA') !== -1 ? colIndex('MULTA') : colIndex('PENALTY');
          const idxInterest = colIndex('JUROS') !== -1 ? colIndex('JUROS') : colIndex('INTEREST');
          const idxTotal = colIndex('VALOR_ATUALIZADO') !== -1 ? colIndex('VALOR_ATUALIZADO') : (colIndex('TOTAL') !== -1 ? colIndex('TOTAL') : -1);
          const idxStatus = colIndex('SITUACAO') !== -1 ? colIndex('SITUACAO') : (colIndex('SITUAÇÃO') !== -1 ? colIndex('SITUAÇÃO') : colIndex('SITUATION'));
          
          const parsePortugueseNumber = (valStr: string): number => {
            if (!valStr) return 0;
            let clean = valStr.trim().replace(/[R$\s"']/g, '');
            if (!clean) return 0;
            if (clean.includes(',') && clean.includes('.')) {
              if (clean.indexOf('.') < clean.indexOf(',')) {
                clean = clean.replace(/\./g, '').replace(/,/g, '.');
              } else {
                clean = clean.replace(/,/g, '');
              }
            } else if (clean.includes(',')) {
              clean = clean.replace(/,/g, '.');
            }
            const num = Number(clean);
            return isNaN(num) ? 0 : num;
          };

          for (let i = startRow; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const separator = line.includes(';') ? ';' : ',';
            const cols = line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ''));
            if (cols.length < 2) continue;
            
            const cat = idxCat !== -1 && cols[idxCat] ? cols[idxCat] : (selectedCategory?.title || 'DAS SIMPLES NACIONAL');
            const code = idxCode !== -1 && cols[idxCode] ? cols[idxCode] : '';
            const period = idxPeriod !== -1 && cols[idxPeriod] ? cols[idxPeriod] : '';
            const principal = idxPrincipal !== -1 && cols[idxPrincipal] ? parsePortugueseNumber(cols[idxPrincipal]) : 0;
            const penalty = idxPenalty !== -1 && cols[idxPenalty] ? parsePortugueseNumber(cols[idxPenalty]) : 0;
            const interest = idxInterest !== -1 && cols[idxInterest] ? parsePortugueseNumber(cols[idxInterest]) : 0;
            
            let total = idxTotal !== -1 && cols[idxTotal] ? parsePortugueseNumber(cols[idxTotal]) : 0;
            if (total === 0) {
              total = principal + penalty + interest;
            }
            
            let status = idxStatus !== -1 && cols[idxStatus] ? cols[idxStatus].toUpperCase() : 'DEVEDOR';
            if (status.includes('SUSP')) status = 'SUSPENSO';
            else if (status.includes('AMIG') || status.includes('COB')) status = 'COBRANÇA AMIGÁVEL';
            else if (status.includes('EXEC') || status.includes('FISC')) status = 'EXECUÇÃO FISCAL';
            else if (status.includes('PARC')) status = 'EM PARCELAMENTO';
            else status = 'DEVEDOR';
            
            parsedDebts.push({
              id: `temp-${i}-${Date.now()}`,
              category: selectedCategory?.title || findBestCategoryMatch(cat, code),
              period,
              principal,
              penalty,
              interest,
              total,
              status
            });
          }
          
          clearInterval(interval);
          setProcessingProgress(100);
          setTempParsedDebts(parsedDebts);
          setIsPreviewingImport(true);
          setImportStep('validate-debts');
          showTempNotification(`Planilha "${file.name}" importada com sucesso (${parsedDebts.length} débitos)!`);
          setIsProcessingFile(false);
        } catch (err: any) {
          clearInterval(interval);
          setIsProcessingFile(false);
          setProcessingProgress(100);
          console.error(err);
          showTempNotification(`Erro ao importar planilha: ${err.message || err}`);
        }
      };
      reader.readAsText(file);
    } else if (file.name.toLowerCase().endsWith('.pdf')) {
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          const textContent = await extractTextFromPdf(buffer);
          onTextExtracted(textContent);
        } catch (error) {
          clearInterval(interval);
          setIsProcessingFile(false);
          console.error(error);
          showTempNotification('Erro ao processar o PDF. Verifique se o arquivo não está corrompido.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => {
        const textContent = e.target?.result as string || '';
        onTextExtracted(textContent);
      };
      reader.readAsText(file);
    }
  };

  // Helper actions for interactive review/edit table
  const updateTempDebtField = (id: string, field: string, value: any) => {
    setTempParsedDebts(prev => prev.map(d => {
      if (d.id === id) {
        const updated = { ...d, [field]: value };
        // Recalculate total if principal changed
        if (field === 'principal') {
          if (Number(d.total) === Number(d.principal) || Number(d.total) === 0) {
            updated.total = Number(value) || 0;
          }
        }
        return updated;
      }
      return d;
    }));
  };

  const deleteTempDebt = (id: string) => {
    setTempParsedDebts(prev => prev.filter(d => d.id !== id));
  };

  const addTempDebtRow = () => {
    const newRow = {
      id: `temp-manual-${Date.now()}`,
      category: selectedCategory?.title || categories[0]?.title || 'DAS SIMPLES NACIONAL',
      period: '',
      principal: 0,
      penalty: 0,
      interest: 0,
      total: 0,
      status: 'DEVEDOR'
    };
    setTempParsedDebts(prev => [...prev, newRow]);
  };

  const handleConfirmImport = () => {
    // 1. Update client info
    if (tempClientInfo.cnpj.trim() || tempClientInfo.name.trim()) {
      setClientInfo({
        cnpj: tempClientInfo.cnpj.trim(),
        name: tempClientInfo.name.trim() || clientInfo.name
      });
    }

    // 2. Generate and add missing categories
    const categoriesToCreate: DebtCategory[] = [];
    tempParsedDebts.forEach(tempDebt => {
      const existing = categories.some(c => c.title.toUpperCase() === tempDebt.category.toUpperCase());
      const alreadyPlanningToCreate = categoriesToCreate.some(c => c.title.toUpperCase() === tempDebt.category.toUpperCase());
      
      if (!existing && !alreadyPlanningToCreate && tempDebt.category) {
        categoriesToCreate.push({
          id: `cat-${Math.random().toString(36).substr(2, 9)}`,
          title: tempDebt.category.toUpperCase(),
          categoryType: 'TRIBUTO',
          origin: 'FEDERAL',
          documentType: 'DARF',
          scope: 'ADMINISTRATIVO'
        });
      }
    });

    if (categoriesToCreate.length > 0) {
      setCategories(prev => [...prev, ...categoriesToCreate]);
    }

    // 3. Map temporary debts to final DebtItem structure
    const finalDebtsToAdd: DebtItem[] = tempParsedDebts.map(d => ({
      id: `debt-${Math.random().toString(36).substr(2, 9)}`,
      category: d.category.toUpperCase(),
      period: d.period || '01/2026',
      principal: Number(d.principal) || 0,
      penalty: Number(d.penalty) || 0,
      interest: Number(d.interest) || 0,
      total: Number(d.total) || 0,
      status: d.status || 'DEVEDOR'
    }));

    // 4. Merge into final debts avoiding exact duplicate combinations
    setDebts(prev => {
      const existingKeys = new Set(prev.map(d => `${d.category.toLowerCase()}_${d.period.toLowerCase()}_${d.total.toFixed(2)}`));
      const nonDuplicates = finalDebtsToAdd.filter(d => !existingKeys.has(`${d.category.toLowerCase()}_${d.period.toLowerCase()}_${d.total.toFixed(2)}`));
      return [...prev, ...nonDuplicates];
    });

    showTempNotification(`Sucesso! ${finalDebtsToAdd.length} débitos consolidados.`);
    
    // Transition to the success screen
    setImportStep('success');
  };

  const handleAddManualDebtToTemp = (e: React.FormEvent) => {
    e.preventDefault();
    const principalNum = parseFloat(manualPrincipal.replace(/\s/g, '').replace(',', '.')) || 0;
    const penaltyNum = parseFloat(manualPenalty.replace(/\s/g, '').replace(',', '.')) || 0;
    const interestNum = parseFloat(manualInterest.replace(/\s/g, '').replace(',', '.')) || 0;
    const totalNum = principalNum + penaltyNum + interestNum;

    if (!manualPeriod) {
      showAlert('Competência Requerida', 'Por favor preencha a competência (ex: 05/2026)');
      return;
    }

    const newRow = {
      id: `temp-manual-${Date.now()}`,
      category: selectedCategory?.title || categories[0]?.title || 'DAS SIMPLES NACIONAL',
      period: manualPeriod,
      principal: principalNum,
      penalty: penaltyNum,
      interest: interestNum,
      total: totalNum,
      status: manualStatus || 'DEVEDOR'
    };

    setTempParsedDebts(prev => [...prev, newRow]);
    
    // Clear manual inputs
    setManualPeriod('');
    setManualPrincipal('');
    setManualPenalty('');
    setManualInterest('');
    setManualStatus('DEVEDOR');

    // Move to validation screen so they can review it!
    setImportStep('validate-debts');
    setIsPreviewingImport(true);
    showTempNotification('Débito manual adicionado à tabela de validação.');
  };

  // Screen wide Drag and drop triggers
  const handleGlobalDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const isFile = Array.from(e.dataTransfer.items).some((item: any) => item.kind === 'file');
      if (!isFile) return;
    }

    dragCounter.current++;
    setIsGlobalDragActive(true);
  };

  const handleGlobalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setIsGlobalDragActive(false);
    }
  };

  const handleGlobalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleGlobalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsGlobalDragActive(false);
    dragCounter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      setIsImportModalOpen(true);
      handleProcessFile(file);
    }
  };

  // Export dynamically to PDF
  const handlePdfExport = () => {
    const getCategorySortOrder = (categoryTitle: string): number => {
      const cat = getCategoryByTitle(categoryTitle);
      const organ = getAdministrationOrgan(cat.origin, cat.scope);
      const scoring: Record<string, number> = {
        'RFB': 1,
        'PGFN': 2,
        'SEFAZ': 3,
        'PGE': 4,
        'SEFIN': 5,
        'PGM': 6
      };
      return scoring[organ] || 99;
    };

    const sortedCategoryTitles = [...categories]
      .map(c => c.title)
      .sort((a, b) => getCategorySortOrder(a) - getCategorySortOrder(b));

    const sortedDebts = [...debts].sort((a, b) => getCategorySortOrder(a.category) - getCategorySortOrder(b.category));

    exportDebtsToPDF(clientInfo, sortedDebts, sortedCategoryTitles);
  };

  // Calculations for consolidated highlights
  const filteredDebts = debts.filter(d => {
    if (originFilter === 'TODOS') return true;
    const cat = getCategoryByTitle(d.category);
    return cat.origin === originFilter;
  });

  const totalPrincipal = filteredDebts.reduce((sum, item) => sum + item.principal, 0);
  const totalPenalty = filteredDebts.reduce((sum, item) => sum + item.penalty, 0);
  const totalInterest = filteredDebts.reduce((sum, item) => sum + item.interest, 0);
  const grandTotal = filteredDebts.reduce((sum, item) => sum + item.total, 0);

  return (
    <div 
      onDragEnter={handleGlobalDragEnter}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
      className="space-y-6 min-h-[600px] relative max-w-5xl mx-auto w-full px-2 sm:px-4 transition-all duration-300 origin-top"
      style={{ zoom: `${zoomLevel}%` }}
    >
      
      {/* Top action header bar - With Action Panel Header and Zoom controls */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-2.5">
          <span className="text-[11px] font-bold text-[#04243b] uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="h-4 w-4 text-[#e4b35e]" /> Painel de Ações do Levantamento
          </span>
          {/* Zoom Selector */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-500 font-medium">Zoom do Sistema:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {[80, 90, 100].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setZoomLevel(level)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    zoomLevel === level
                      ? 'bg-[#04243b] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {level}%
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 w-full">
          {/* Configurações Button - Opens System Config table modal */}
          <button
            onClick={() => {
              setIsSettingsOpen(true);
              setActiveSettingsTab('tributos');
            }}
            className="flex items-center justify-center space-x-1.5 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 text-[#04243b] border border-slate-200 rounded-xl text-[11px] sm:text-xs font-bold transition-all duration-200 shadow-sm cursor-pointer w-full"
            id="btn-open-settings"
            title="Configurações de Categorias de Débito"
          >
            <Settings className="h-4 w-4 text-[#04243b]/70 shrink-0" />
            <span>Configurações</span>
          </button>

          {/* Lançar Débito button - opens clean multi-step category upload modal */}
          <button
            onClick={() => {
              setPasteText('');
              setSelectedCategory(null);
              setImportStep('select-category');
              setIsPreviewingImport(false);
              setTempParsedDebts([]);
              setIsImportModalOpen(true);
            }}
            className="flex items-center justify-center space-x-1.5 px-3 py-2.5 bg-[#e4b35e] hover:bg-[#d1a250] text-[#04243b] rounded-xl text-[11px] sm:text-xs font-black transition-all duration-200 shadow-sm cursor-pointer w-full"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Lançar Débito</span>
          </button>

          {/* Importar CSV button - opens beautiful template & upload modal */}
          <button
            onClick={() => {
              setIsCsvImportModalOpen(true);
            }}
            className="flex items-center justify-center space-x-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] sm:text-xs font-black transition-all duration-200 shadow-sm cursor-pointer w-full"
            title="Importar planilha de débitos formato CSV de 8 colunas com planilha modelo"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" />
            <span>Importar CSV</span>
          </button>

          {/* Exportar PDF */}
          <button
            onClick={handlePdfExport}
            disabled={debts.length === 0}
            className={`flex items-center justify-center space-x-1.5 px-3 py-2.5 bg-[#04243b] hover:bg-[#031d30] border border-[#e4b35e]/30 text-white rounded-xl text-[11px] sm:text-xs font-bold transition-all duration-200 shadow-sm cursor-pointer w-full ${debts.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Download className="h-4 w-4 text-[#e4b35e] shrink-0" />
            <span>Exportar PDF</span>
          </button>

          {/* Exportar Excel */}
          <button
            onClick={() => {
              const getCategorySortOrder = (categoryTitle: string): number => {
                const cat = getCategoryByTitle(categoryTitle);
                const organ = getAdministrationOrgan(cat.origin, cat.scope);
                const scoring: Record<string, number> = {
                  'RFB': 1,
                  'PGFN': 2,
                  'SEFAZ': 3,
                  'PGE': 4,
                  'SEFIN': 5,
                  'PGM': 6
                };
                return scoring[organ] || 99;
              };
              const sortedDebts = [...debts].sort((a, b) => getCategorySortOrder(a.category) - getCategorySortOrder(b.category));
              exportDebtsToExcel(clientInfo, sortedDebts);
            }}
            disabled={debts.length === 0}
            className={`flex items-center justify-center space-x-1.5 px-3 py-2.5 bg-sky-900 hover:bg-sky-950 border border-[#e4b35e]/30 text-white rounded-xl text-[11px] sm:text-xs font-bold transition-all duration-200 shadow-sm cursor-pointer w-full ${debts.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Exportar planilha de débitos para formato Excel (.xlsx)"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#e4b35e] shrink-0" />
            <span>Exportar Excel</span>
          </button>

          {/* Limpar Dados Button */}
          <button
            onClick={() => {
              showConfirm(
                'Limpar Levantamento',
                'Deseja realmente limpar todos os débitos e os dados do contribuinte para iniciar um novo levantamento? Esta ação não pode ser desfeita.',
                () => {
                  setDebts([]);
                  setClientInfo({ cnpj: '', name: '' });
                  setOriginFilter('TODOS');
                  showTempNotification('Todos os dados foram limpos. Inicie um novo levantamento!');
                }
              );
            }}
            className="flex items-center justify-center space-x-1.5 px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-[11px] sm:text-xs font-bold transition-all duration-200 shadow-sm cursor-pointer w-full"
            title="Limpar Levantamento"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span>Limpar Dados</span>
          </button>
        </div>
      </div>

      {/* Temporary Notification Banner */}
      {importNotification && (
        <div className="flex items-center space-x-2 bg-slate-900 text-white border-l-4 border-[#e4b35e] px-4 py-3 rounded-xl shadow-lg text-xs sm:text-sm animate-fadeIn">
          <FileCheck2 className="h-5 w-5 text-[#e4b35e] shrink-0" />
          <span>{importNotification}</span>
        </div>
      )}

      {/* Dashboard KPI Summary Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fadeIn">
        
        {/* Widget 1: Original */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Valor Original
            </span>
            <span className="block text-sm sm:text-base font-bold text-slate-800 mt-1">
              {formatBrl(totalPrincipal)}
            </span>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-xl text-slate-500">
            <FileText className="h-5 w-5" />
          </div>
        </div>

        {/* Widget 2: Total Atualizado */}
        <div className="bg-[#04243b] p-4 rounded-2xl border border-[#e4b35e]/35 shadow-md flex items-center justify-between">
          <div>
            <span className="block text-[10px] font-bold text-[#e4b35e]/80 uppercase tracking-wider">
              Valor Atualizado
            </span>
            <span className="block text-sm sm:text-base font-black text-white mt-1">
              {formatBrl(grandTotal)}
            </span>
          </div>
          <div className="p-2 bg-[#04243b] border border-[#e4b35e]/40 rounded-xl text-[#e4b35e]">
            <CheckCircle className="h-5 w-5" />
          </div>
        </div>

      </div>

      {/* Contribuinte under audit block */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[#04243b]/5 text-[#e4b35e] rounded-xl border border-[#e4b35e]/15">
              <FolderSync className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black text-[#04243b] uppercase tracking-wider">
                Contribuinte
              </h3>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-grow md:max-w-xl lg:max-w-2xl w-full">
            <div className="w-full">
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Nome do Cliente / Razão Social
              </label>
              <input
                type="text"
                value={clientInfo.name}
                onChange={(e) => setClientInfo(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-250 rounded-lg text-xs text-slate-800 font-sans font-semibold focus:outline-none focus:border-[#e4b35e] transition-all"
                placeholder="Ex: Razão Social"
              />
            </div>
            <div className="w-full">
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                CNPJ / CPF do Contribuinte
              </label>
              <input
                type="text"
                value={clientInfo.cnpj}
                onChange={(e) => setClientInfo(prev => ({ ...prev, cnpj: e.target.value }))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-250 rounded-lg text-xs text-slate-800 font-mono focus:outline-none focus:border-[#e4b35e] transition-all"
                placeholder="00.000.000/0000-00"
              />
            </div>
          </div>
        </div>
      </div>

      {/* FILTRO DE COMPETÊNCIA DO ENTE TRIBUTÁRIO */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
          {(['TODOS', 'FEDERAL', 'ESTADUAL', 'MUNICIPAL'] as const).map((origin) => {
            const count = debts.filter(d => {
              if (origin === 'TODOS') return true;
              const cat = getCategoryByTitle(d.category);
              return cat.origin === origin;
            }).length;

            const isActive = originFilter === origin;
            return (
              <button
                key={origin}
                type="button"
                onClick={() => setOriginFilter(origin)}
                className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer border ${
                  isActive
                    ? 'bg-[#04243b] text-white border-[#04243b] shadow-sm'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{origin === 'TODOS' ? 'TODOS' : origin}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-[#e4b35e] text-[#04243b]' : 'bg-slate-200 text-slate-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* DETALHAMENTO DE DÉBITOS SEPARADOS POR ÂMBITOS */}
      <div className="flex flex-col gap-8 items-stretch">
        {(() => {
          const SCOPES_CONFIG = [
            {
              id: 'FEDERAL' as const,
              title: 'Âmbito Federal',
              description: 'Tributos e parcelamentos sob a competência da União',
              headerBg: 'bg-[#04243b] border-b-2 border-[#e4b35e]',
              icon: Layers,
              organBadgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
              organs: [
                { id: 'RFB', title: 'Receita Federal do Brasil (RFB)', scope: 'ADMINISTRATIVO' as const },
                { id: 'PGFN', title: 'Procuradoria-Geral da Fazenda Nacional (PGFN)', scope: 'DIVIDA_ATIVA' as const }
              ]
            },
            {
              id: 'ESTADUAL' as const,
              title: 'Âmbito Estadual',
              description: 'Tributos e parcelamentos sob a competência do Estado',
              headerBg: 'bg-slate-800 border-b-2 border-amber-500',
              icon: Briefcase,
              organBadgeClass: 'bg-blue-50 text-blue-700 border border-blue-200',
              organs: [
                { id: 'SEFAZ', title: 'Secretaria de Estado da Fazenda (SEFAZ)', scope: 'ADMINISTRATIVO' as const },
                { id: 'PGE', title: 'Procuradoria-Geral do Estado (PGE)', scope: 'DIVIDA_ATIVA' as const }
              ]
            },
            {
              id: 'MUNICIPAL' as const,
              title: 'Âmbito Municipal',
              description: 'Tributos e parcelamentos sob a competência do Município',
              headerBg: 'bg-zinc-800 border-b-2 border-indigo-500',
              icon: FolderSync,
              organBadgeClass: 'bg-purple-50 text-purple-700 border border-purple-200',
              organs: [
                { id: 'SEFIN', title: 'Secretaria Municipal de Finanças (SEFIN)', scope: 'ADMINISTRATIVO' as const },
                { id: 'PGM', title: 'Procuradoria-Geral do Município (PGM)', scope: 'DIVIDA_ATIVA' as const }
              ]
            }
          ];

          const scopesToRender = SCOPES_CONFIG.filter(
            scope => originFilter === 'TODOS' || originFilter === scope.id
          );

          return scopesToRender.map(scope => {
            const scopeDebts = filteredDebts.filter(d => {
              const cat = getCategoryByTitle(d.category);
              return cat.origin === scope.id;
            });

            const totalScope = scopeDebts.reduce((sum, item) => sum + item.total, 0);

            return (
              <div key={scope.id} className="space-y-4">
                {/* Scope Header Banner */}
                <div className={`p-4 rounded-2xl text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${scope.headerBg}`}>
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-white/10 rounded-xl">
                      <scope.icon className="h-5 w-5 text-[#e4b35e]" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-black uppercase tracking-wider">
                        {scope.title}
                      </h3>
                      <p className="text-[10px] text-slate-300 font-medium leading-tight">
                        {scope.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-start">
                    <span className="text-[10px] font-mono font-bold px-2 py-1 bg-white/10 rounded">
                      {scopeDebts.length} débito(s)
                    </span>
                    <span className="text-xs font-black text-[#e4b35e] bg-slate-950/40 border border-[#e4b35e]/30 px-3 py-1 rounded-xl font-mono">
                      {formatBrl(totalScope)}
                    </span>
                  </div>
                </div>

                {/* Empty state or Organs list */}
                {scopeDebts.length === 0 ? (
                  <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-1 shadow-sm">
                    <CheckCircle className="h-8 w-8 text-emerald-500 mb-1" />
                    <span className="font-bold text-slate-700 text-xs">Situação Regularizada</span>
                    <span className="text-[10px] text-slate-400">Nenhum débito em aberto cadastrado no {scope.title.toLowerCase()}.</span>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {scope.organs.map(organ => {
                      const organDebts = scopeDebts.filter(d => {
                        const cat = getCategoryByTitle(d.category);
                        return getAdministrationOrgan(cat.origin, cat.scope) === organ.id;
                      });

                      if (organDebts.length === 0) return null;

                      const organTotal = organDebts.reduce((sum, item) => sum + item.total, 0);
                      const organCategories = Array.from(new Set(organDebts.map(d => d.category))) as string[];

                      return (
                        <div key={organ.id} className="space-y-3.5 pl-2 sm:pl-3 border-l-2 border-slate-200">
                          {/* Organ ribbon */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-slate-50 border border-slate-150 p-2 rounded-xl">
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-0.5 ${scope.organBadgeClass} rounded-md text-[10px] font-black tracking-wider`}>
                                {organ.id}
                              </span>
                              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                                {organ.title}
                              </span>
                            </div>
                            <span className="text-[11px] font-bold text-slate-500 font-mono self-start sm:self-auto pl-1 sm:pl-0">
                              Total {organ.id}: <span className="text-[#04243b] font-black">{formatBrl(organTotal)}</span>
                            </span>
                          </div>

                          {/* Categories Grid (2 columns to prevent stretching on wide screens) */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {organCategories.map(categoryTitle => {
                              const categoryDebts = organDebts.filter(d => d.category === categoryTitle);
                              const catInfo = getCategoryByTitle(categoryTitle);

                              const catPrincipal = categoryDebts.reduce((sum, item) => sum + item.principal, 0);
                              const catTotal = categoryDebts.reduce((sum, item) => sum + item.total, 0);

                              return (
                                <div key={categoryTitle} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fadeIn flex flex-col justify-between">
                                  <div>
                                    {/* Header Ribbon */}
                                    <div className="bg-slate-50/75 border-b border-slate-150 px-3.5 py-2.5 flex items-center justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <span className="text-[11px] font-black text-[#04243b] tracking-wider uppercase block truncate">
                                          {categoryTitle}
                                        </span>
                                        <span className="text-[9px] text-slate-400 font-medium">
                                          Tipo: {catInfo.documentType} • {catInfo.categoryType} {catInfo.code ? `• Cód. ${catInfo.code}` : ''}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          onClick={() => {
                                            setEditingDebtId(null);
                                            setFormCategoryTitle(categoryTitle);
                                            setFormPeriod('');
                                            setFormPrincipal('');
                                            setFormTotal('');
                                            setFormStatus('DEVEDOR');
                                            setIsAddingDebt(true);
                                          }}
                                          className="px-2 py-1 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] hover:text-white border border-[#e4b35e]/30 rounded-md text-[9px] font-extrabold uppercase transition-all flex items-center gap-1 cursor-pointer"
                                          title={`Lançar novo débito de ${categoryTitle}`}
                                        >
                                          <Plus className="h-2.5 w-2.5" />
                                          <span>Lançar</span>
                                        </button>
                                        <span className="text-[10px] font-bold text-[#e4b35e] bg-[#04243b] border border-[#e4b35e]/30 px-2 py-0.5 rounded font-mono shrink-0">
                                          {formatBrl(catTotal)}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Table */}
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left text-xs table-fixed">
                                        <colgroup>
                                          <col className="w-[30%]" />
                                          <col className="w-[30%]" />
                                          <col className="w-[30%]" />
                                          <col className="w-[10%]" />
                                        </colgroup>
                                        <thead>
                                          <tr className="bg-slate-50/20 border-b border-slate-100 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                            <th className="p-2 pl-3">Competência</th>
                                            <th className="p-2">Original</th>
                                            <th className="p-2 text-right pr-3">Atualizado</th>
                                            <th className="p-2 text-center">Ações</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-medium text-slate-600 text-[11px]">
                                          {categoryDebts.map(debt => (
                                            <tr key={debt.id} className="hover:bg-slate-50/30 transition-colors">
                                              <td className="p-2 pl-3 text-slate-800 font-bold">{debt.period}</td>
                                              <td className="p-2 text-slate-500 font-semibold">{formatBrl(debt.principal)}</td>
                                              <td className="p-2 text-slate-800 font-black text-right pr-3">{formatBrl(debt.total)}</td>
                                              <td className="p-2 flex items-center justify-center gap-0.5">
                                                <button
                                                  onClick={() => startEditDebt(debt)}
                                                  className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded transition-all"
                                                  title="Editar débito"
                                                >
                                                  <Edit2 className="h-3 w-3" />
                                                </button>
                                                <button
                                                  onClick={() => handleDeleteDebt(debt.id)}
                                                  className="p-1 hover:bg-red-50 text-red-500 hover:text-red-700 rounded transition-all"
                                                  title="Remover débito"
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>

                                  {/* Footer */}
                                  <div className="bg-slate-50/35 border-t border-slate-150 px-3 py-2 font-bold text-[#04243b] text-[10px] flex items-center justify-between">
                                    <span>Subtotal</span>
                                    <div className="flex items-center space-x-3">
                                      <span className="font-normal text-slate-500">{formatBrl(catPrincipal)}</span>
                                      <span className="text-[#e4b35e] font-black text-[11px]">{formatBrl(catTotal)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

                     {/* MODAL 1: SYSTEM SETTINGS TABLE MODAL ("CONFIGURAÇÕES") */}
      {isSettingsOpen && (() => {
        const currentType: 'TRIBUTO' | 'PARCELAMENTO' | 'MULTAS' = 
          activeSettingsTab === 'tributos' ? 'TRIBUTO' : 
          activeSettingsTab === 'parcelamento' ? 'PARCELAMENTO' : 'MULTAS';

        const currentTypeLabel = 
          activeSettingsTab === 'tributos' ? 'TRIBUTOS' : 
          activeSettingsTab === 'parcelamento' ? 'PARCELAMENTO' : 'MULTAS';

        const filteredCategories = categories.filter(c => c.categoryType === currentType);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl border border-slate-100 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scaleUp">
              
              {/* Settings Header */}
              <div className="bg-[#04243b] border-b border-[#e4b35e]/30 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2 text-[#e4b35e]">
                  <Settings className="h-5 w-5" />
                  <h4 className="text-sm font-black uppercase tracking-wider">
                    Configurações Gerais do Sistema
                  </h4>
                </div>
                <button
                  onClick={() => {
                    setIsSettingsOpen(false);
                    setIsCategoryFormOpen(false);
                    setEditingCategoryId(null);
                  }}
                  className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all font-bold cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Settings Content Container */}
              <div className="flex flex-col md:flex-row flex-grow min-h-0 overflow-hidden">
                
                {/* Settings Menu Sidebar Options */}
                <div className="w-full md:w-64 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-4 shrink-0 flex flex-col space-y-1 overflow-y-auto">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#04243b] px-2.5 mb-1.5 block">
                    Gerenciar Categorias
                  </span>
                  
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSettingsTab('tributos');
                      setIsCategoryFormOpen(false);
                      setEditingCategoryId(null);
                    }}
                    className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold text-left transition-all cursor-pointer ${
                      activeSettingsTab === 'tributos'
                        ? 'bg-[#04243b] text-[#e4b35e] shadow-md'
                        : 'hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="flex items-center space-x-2.5">
                      <Layers className="h-4 w-4" />
                      <span>Tributos</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 opacity-65" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveSettingsTab('parcelamento');
                      setIsCategoryFormOpen(false);
                      setEditingCategoryId(null);
                    }}
                    className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold text-left transition-all cursor-pointer ${
                      activeSettingsTab === 'parcelamento'
                        ? 'bg-[#04243b] text-[#e4b35e] shadow-md'
                        : 'hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="flex items-center space-x-2.5">
                      <FileSpreadsheet className="h-4 w-4" />
                      <span>Parcelamento</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 opacity-65" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveSettingsTab('multas');
                      setIsCategoryFormOpen(false);
                      setEditingCategoryId(null);
                    }}
                    className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold text-left transition-all cursor-pointer ${
                      activeSettingsTab === 'multas'
                        ? 'bg-[#04243b] text-[#e4b35e] shadow-md'
                        : 'hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="flex items-center space-x-2.5">
                      <ShieldAlert className="h-4 w-4" />
                      <span>Multas</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 opacity-65" />
                  </button>
                  
                  <div className="hidden md:block mt-auto bg-[#04243b]/5 rounded-xl p-3.5 border border-[#e4b35e]/15 text-[10px] text-slate-500">
                    <p className="font-semibold text-slate-700 uppercase tracking-wide">Categorias Organizadas</p>
                    <p className="mt-1 leading-relaxed">Cada categoria de débito possui enquadramentos e órgãos arrecadadores específicos configurados em seu cadastro.</p>
                  </div>
                </div>

                {/* Settings Main Detail Area */}
                <div className="flex-grow p-6 overflow-y-auto flex flex-col bg-white">
                  <div className="flex-grow flex flex-col space-y-4">
                    
                    {/* Header bar within categories tab */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="text-sm font-black text-[#04243b] uppercase flex items-center gap-1.5">
                          {activeSettingsTab === 'tributos' && <Layers className="h-4 w-4 text-[#e4b35e]" />}
                          {activeSettingsTab === 'parcelamento' && <FileSpreadsheet className="h-4 w-4 text-[#e4b35e]" />}
                          {activeSettingsTab === 'multas' && <ShieldAlert className="h-4 w-4 text-[#e4b35e]" />}
                          <span>Cadastro de {currentTypeLabel}</span>
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          {activeSettingsTab === 'tributos' && "Gerencie impostos, contribuições e taxas recorrentes ou eventuais."}
                          {activeSettingsTab === 'parcelamento' && "Controle os parcelamentos de débitos do Simples, MEI ou previdenciários."}
                          {activeSettingsTab === 'multas' && "Cadastre infrações e penalidades administrativas ou inscritas em dívida ativa."}
                        </p>
                      </div>
                      
                      {!isCategoryFormOpen && (
                        <button
                          onClick={() => {
                            setCategoryTitle('');
                            setCategoryType(currentType);
                            setCategoryOrigin('FEDERAL');
                            setCategoryDocType('DARF');
                            setCategoryScope('ADMINISTRATIVO');
                            setEditingCategoryId(null);
                            setIsCategoryFormOpen(true);
                          }}
                          className="flex items-center space-x-1.5 px-3.5 py-2.5 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Adicionar à {currentTypeLabel}</span>
                        </button>
                      )}
                    </div>

                    {/* Category Creation / Edit Inline Form */}
                    {isCategoryFormOpen ? (
                      <form onSubmit={handleSaveCategory} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4 animate-scaleUp">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <span className="text-xs font-black text-[#04243b] uppercase tracking-wider flex items-center gap-1">
                            <Sliders className="h-4 w-4 text-[#e4b35e]" />
                            {editingCategoryId ? 'Editar Cadastro' : `Novo Cadastro de ${currentTypeLabel}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCategoryFormOpen(false);
                              setEditingCategoryId(null);
                            }}
                            className="text-xs text-slate-400 hover:text-slate-600 font-bold transition-colors cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          {/* Título do Débito */}
                          <div className="sm:col-span-1">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              TÍTULO DA CATEGORIA (Descrição do Débito) *
                            </label>
                            <input
                              type="text"
                              required
                              value={categoryTitle}
                              onChange={(e) => setCategoryTitle(e.target.value.toUpperCase())}
                              placeholder="Ex: IPI SOBRE IMPORTAÇÃO, PARCELAMENTO PREVIDENCIÁRIO, etc."
                              className="w-full px-3 py-2 bg-white border border-slate-350 rounded-xl focus:outline-none focus:border-[#e4b35e] uppercase font-semibold text-slate-800"
                            />
                          </div>

                          {/* Código de Identificação */}
                          <div className="sm:col-span-1">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              CÓDIGO DE IDENTIFICAÇÃO (Para classificação automática)
                            </label>
                            <input
                              type="text"
                              value={categoryCode}
                              onChange={(e) => setCategoryCode(e.target.value)}
                              placeholder="Ex: 1099-01, 4406-01 (ou parte dele)"
                              className="w-full px-3 py-2 bg-white border border-slate-350 rounded-xl focus:outline-none focus:border-[#e4b35e] uppercase font-semibold text-slate-800"
                            />
                            <p className="text-[9px] text-slate-400 mt-0.5">Associa o código da receita ao classificar ao importar relatórios.</p>
                          </div>

                          {/* Campo CATEGORIA (Locked to current tab context) */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              CATEGORIA DO GRUPO
                            </label>
                            <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-bold text-[#04243b] uppercase text-xs">
                              {currentTypeLabel}
                            </div>
                          </div>

                          {/* Campo ORIGEM */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              ORIGEM DO DÉBITO
                            </label>
                            <select
                              value={categoryOrigin}
                              onChange={(e) => {
                                const newOrigin = e.target.value as any;
                                setCategoryOrigin(newOrigin);
                                // Smart default document types based on origin
                                if (newOrigin === 'FEDERAL') setCategoryDocType('DARF');
                                else if (newOrigin === 'ESTADUAL') setCategoryDocType('DAE');
                                else setCategoryDocType('DAM');
                              }}
                              className="w-full px-3 py-2 bg-white border border-slate-350 rounded-xl font-medium focus:outline-none focus:border-[#e4b35e] cursor-pointer"
                            >
                              <option value="FEDERAL">FEDERAL</option>
                              <option value="ESTADUAL">ESTADUAL</option>
                              <option value="MUNICIPAL">MUNICIPAL</option>
                            </select>
                          </div>

                          {/* Campo TIPO DE DOCUMENTO */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              TIPO DE GUIA (Arrecadação)
                            </label>
                            <select
                              value={categoryDocType}
                              onChange={(e) => setCategoryDocType(e.target.value as any)}
                              className="w-full px-3 py-2 bg-white border border-slate-350 rounded-xl font-medium focus:outline-none focus:border-[#e4b35e] cursor-pointer"
                            >
                              <option value="DARF">DARF</option>
                              <option value="DAS">DAS</option>
                              <option value="DAE">DAE</option>
                              <option value="DAM">DAM</option>
                            </select>
                          </div>

                          {/* Campo ÂMBITO */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              ÂMBITO DO DÉBITO (Fase)
                            </label>
                            <select
                              value={categoryScope}
                              onChange={(e) => setCategoryScope(e.target.value as any)}
                              className="w-full px-3 py-2 bg-white border border-slate-350 rounded-xl font-medium focus:outline-none focus:border-[#e4b35e] cursor-pointer"
                            >
                              <option value="ADMINISTRATIVO">ADMINISTRATIVO</option>
                              <option value="DIVIDA_ATIVA">DÍVIDA ATIVA</option>
                            </select>
                          </div>
                        </div>

                        {/* Live Administration Organ Feedback */}
                        <div className="bg-[#04243b]/5 rounded-xl p-3 border border-[#e4b35e]/15 flex items-center space-x-2.5">
                          <Info className="h-4.5 w-4.5 text-[#e4b35e] shrink-0" />
                          <div className="text-[11px] text-slate-600">
                            <span>Órgão Fiscalizador Responsável: </span>
                            <strong className="text-[#04243b] uppercase">
                              {getAdministrationOrgan(categoryOrigin, categoryScope)} ({categoryScope === 'ADMINISTRATIVO' ? 'Fase Administrativa' : 'Fase Judicial / Executória'})
                            </strong>
                          </div>
                        </div>

                        <div className="flex justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsCategoryFormOpen(false);
                              setEditingCategoryId(null);
                            }}
                            className="px-4 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-1.5 bg-[#04243b] text-[#e4b35e] font-bold hover:bg-[#031d30] rounded-lg text-xs cursor-pointer"
                          >
                            Salvar Categoria
                          </button>
                        </div>
                      </form>
                    ) : (
                      /* Table view listing categories */
                      <div className="border border-slate-200 rounded-2xl overflow-hidden flex-grow max-h-[300px] md:max-h-[320px] overflow-y-auto shadow-sm">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              <th className="p-3 pl-4">Código</th>
                              <th className="p-3">Título / Descrição</th>
                              <th className="p-3">Origem</th>
                              <th className="p-3">Tipo de Guia</th>
                              <th className="p-3">Âmbito</th>
                              <th className="p-3">Órgão</th>
                              <th className="p-3 text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                            {filteredCategories.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-12 text-center text-slate-400 font-semibold italic">
                                  Nenhuma categoria cadastrada em {currentTypeLabel.toLowerCase()}.
                                </td>
                              </tr>
                            ) : (
                              filteredCategories.map((cat) => (
                                <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="p-3 pl-4 font-mono font-bold text-slate-600">
                                    {cat.code ? (
                                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-semibold">
                                        {cat.code}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 italic text-[11px] font-sans font-normal">—</span>
                                    )}
                                  </td>
                                  <td className="p-3 font-bold text-slate-900">{cat.title}</td>
                                  <td className="p-3 text-slate-500">{cat.origin}</td>
                                  <td className="p-3">
                                    <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-600">
                                      {cat.documentType}
                                    </span>
                                  </td>
                                  <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                      cat.scope === 'ADMINISTRATIVO' 
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                        : 'bg-red-50 text-red-700 border border-red-200'
                                    }`}>
                                      {cat.scope === 'ADMINISTRATIVO' ? 'ADM' : 'DÍVIDA ATIVA'}
                                    </span>
                                  </td>
                                  <td className="p-3 font-bold text-[#04243b]">{getAdministrationOrgan(cat.origin, cat.scope)}</td>
                                  <td className="p-3 flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => startEditCategory(cat)}
                                      className="p-1.5 text-slate-400 hover:text-[#04243b] hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                                      title="Editar categoria"
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCategory(cat)}
                                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                                      title="Excluir categoria"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                  </div>
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 2: STREAMLINED STEP-BY-STEP CATEGORY WIZARD */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className={`bg-white rounded-3xl border border-slate-100 w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-scaleUp transition-all duration-300 ${importStep === 'validate-debts' ? 'max-w-5xl' : 'max-w-2xl'}`}>
            
            {/* Modal header */}
            <div className="bg-[#04243b] border-b border-[#e4b35e]/30 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2 text-[#e4b35e]">
                <Plus className="h-5 w-5" />
                <h4 className="text-sm font-black uppercase tracking-wider">
                  {importStep === 'select-category' && 'Lançar Débito: Escolher Tributo / Categoria'}
                  {importStep === 'validate-debts' && `Lançar Débito: Lançamento Manual para ${selectedCategory?.title || 'Tributo'}`}
                  {importStep === 'success' && 'Lançamento Concluído!'}
                </h4>
              </div>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setIsPreviewingImport(false);
                  setSelectedCategory(null);
                  setImportStep('select-category');
                }}
                className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all font-bold"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Step Wizard Progress Indicator */}
            <div className="bg-slate-50 border-b border-slate-150 px-6 py-3 flex items-center justify-between text-[11px] font-bold text-slate-500 shrink-0">
              <div className="flex items-center space-x-2 md:space-x-4 w-full justify-around md:justify-start">
                <span className={`flex items-center space-x-1.5 ${importStep === 'select-category' ? 'text-[#04243b]' : 'text-emerald-600'}`}>
                  <span className={`h-4.5 w-4.5 rounded-full flex items-center justify-center text-[10px] ${importStep === 'select-category' ? 'bg-[#04243b] text-white' : 'bg-emerald-100 text-emerald-800'}`}>1</span>
                  <span className="hidden sm:inline">Tributo</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-300 hidden sm:inline" />
                
                <span className={`flex items-center space-x-1.5 ${importStep === 'validate-debts' ? 'text-[#04243b]' : importStep === 'success' ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <span className={`h-4.5 w-4.5 rounded-full flex items-center justify-center text-[10px] ${importStep === 'validate-debts' ? 'bg-[#04243b] text-white' : importStep === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'}`}>2</span>
                  <span className="hidden sm:inline">Lançamento</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-300 hidden sm:inline" />
                
                <span className={`flex items-center space-x-1.5 ${importStep === 'success' ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <span className={`h-4.5 w-4.5 rounded-full flex items-center justify-center text-[10px] ${importStep === 'success' ? 'bg-[#e4b35e] text-[#04243b]' : 'bg-slate-200 text-slate-500'}`}>3</span>
                  <span className="hidden sm:inline">Fim</span>
                </span>
              </div>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-5 flex-grow overflow-y-auto bg-slate-50/30 min-h-0">
              
              {isProcessingFile ? (
                /* Processing/Extracting State animation */
                <div className="py-12 text-center space-y-4 animate-fadeIn">
                  <RefreshCw className="h-10 w-10 text-[#e4b35e] mx-auto animate-spin" />
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold text-[#04243b]">
                      Analisando & Extraindo Dados...
                    </p>
                    <p className="text-xs text-slate-500">
                      A IA está interpretando e organizando as competências para o tributo "{selectedCategory?.title}"
                    </p>
                  </div>
                  <div className="max-w-xs mx-auto bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-[#e4b35e] h-full transition-all duration-300"
                      style={{ width: `${processingProgress}%` }}
                    />
                  </div>
                </div>
              ) : importStep === 'select-category' ? (
                /* STEP 1: SELECT CATEGORY FOR DEBT LAUNCH */
                <div className="space-y-4 animate-fadeIn">
                  <div className="bg-slate-100/80 p-3.5 rounded-2xl border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-600 leading-relaxed">
                      Selecione abaixo a qual **Tributo / Obrigação** pertencem os débitos que você deseja lançar. Você poderá fazer o upload de planilha, texto ou digitar os dados de forma simplificada.
                    </p>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={categorySearchQuery}
                      onChange={(e) => setCategorySearchQuery(e.target.value)}
                      placeholder="Pesquisar tributo (ex: Simples Nacional, IRPJ, FGTS...)"
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#e4b35e] focus:ring-1 focus:ring-[#e4b35e] transition-all shadow-sm"
                    />
                    {categorySearchQuery && (
                      <button
                        onClick={() => setCategorySearchQuery('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                      >
                        Limpar
                      </button>
                    )}
                  </div>

                  {/* Category Grid or Creation Form */}
                  {isCreatingCategoryInWizard ? (
                    /* In-wizard category creator */
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-4 animate-fadeIn">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h5 className="text-xs font-black text-[#04243b] uppercase">Criar Nova Categoria de Débito</h5>
                        <button 
                          onClick={() => setIsCreatingCategoryInWizard(false)}
                          className="text-xs text-slate-500 hover:text-slate-800 underline font-semibold cursor-pointer"
                        >
                          Voltar à Busca
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 text-xs">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Nome do Tributo (Categoria)</label>
                          <input
                            type="text"
                            value={newCatTitle}
                            onChange={(e) => setNewCatTitle(e.target.value)}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold uppercase focus:outline-none focus:border-[#e4b35e]"
                            placeholder="Ex: TAXA DE FISCALIZAÇÃO MUNICIPAL"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Esfera / Origem</label>
                          <select
                            value={newCatOrigin}
                            onChange={(e: any) => setNewCatOrigin(e.target.value)}
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:outline-none focus:border-[#e4b35e]"
                          >
                            <option value="FEDERAL">FEDERAL (União)</option>
                            <option value="ESTADUAL">ESTADUAL (Sefaz)</option>
                            <option value="MUNICIPAL">MUNICIPAL (Prefeitura)</option>
                          </select>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (!newCatTitle.trim()) {
                            showAlert('Nome Obrigatório', 'Por favor, informe o nome do tributo.');
                            return;
                          }
                          
                          const newCategory: DebtCategory = {
                            id: `cat-${Math.random().toString(36).substr(2, 9)}`,
                            title: newCatTitle.toUpperCase().trim(),
                            categoryType: 'TRIBUTO',
                            origin: newCatOrigin,
                            documentType: newCatOrigin === 'FEDERAL' ? 'DARF' : newCatOrigin === 'ESTADUAL' ? 'DAE' : 'DAM',
                            scope: 'ADMINISTRATIVO'
                          };

                          setCategories(prev => [...prev, newCategory]);
                          setSelectedCategory(newCategory);
                          setIsCreatingCategoryInWizard(false);
                          setNewCatTitle('');
                          setCategorySearchQuery('');
                          setTempParsedDebts([{
                            id: `temp-manual-${Date.now()}`,
                            category: newCategory.title,
                            period: '',
                            principal: 0,
                            penalty: 0,
                            interest: 0,
                            total: 0,
                            status: 'DEVEDOR'
                          }]);
                          setImportStep('validate-debts');
                          showTempNotification(`Categoria "${newCategory.title}" criada e selecionada!`);
                        }}
                        className="w-full py-2 bg-[#04243b] text-[#e4b35e] font-black uppercase rounded-xl hover:text-white transition-all text-xs cursor-pointer"
                      >
                        Salvar e Selecionar Tributo
                      </button>
                    </div>
                  ) : (
                    /* Standard Filtered Category List */
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[35vh] overflow-y-auto pr-1">
                        {categories
                          .filter(c => c.title.toLowerCase().includes(categorySearchQuery.toLowerCase()))
                          .map(cat => (
                            <div
                              key={cat.id}
                              onClick={() => {
                                setSelectedCategory(cat);
                                setTempParsedDebts([{
                                  id: `temp-manual-${Date.now()}`,
                                  category: cat.title,
                                  period: '',
                                  principal: 0,
                                  penalty: 0,
                                  interest: 0,
                                  total: 0,
                                  status: 'DEVEDOR'
                                }]);
                                setImportStep('validate-debts');
                              }}
                              className="bg-white hover:bg-slate-50 p-3 rounded-xl border border-slate-200 hover:border-[#e4b35e] cursor-pointer transition-all duration-200 shadow-xs flex flex-col justify-between"
                            >
                              <div>
                                <p className="text-xs font-bold text-[#04243b] leading-tight uppercase">{cat.title}</p>
                                {cat.code && <p className="text-[10px] text-slate-400 mt-0.5">Código: {cat.code}</p>}
                              </div>
                              <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-100 text-[9px] font-bold">
                                <span className={`px-1.5 py-0.2 rounded uppercase ${cat.origin === 'FEDERAL' ? 'bg-blue-50 text-blue-700' : cat.origin === 'ESTADUAL' ? 'bg-indigo-50 text-indigo-700' : 'bg-violet-50 text-violet-700'}`}>
                                  {cat.origin}
                                </span>
                                <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded uppercase">
                                  {cat.documentType}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>

                      {/* Fallback option when search fails or user wants custom */}
                      <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-dashed border-slate-300">
                        <div className="text-left">
                          <p className="text-[11px] font-bold text-slate-800">Não encontrou o tributo acima?</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">Crie uma nova categoria personalizada em segundos para fazer o lançamento.</p>
                        </div>
                        <button
                          onClick={() => {
                            setNewCatTitle(categorySearchQuery);
                            setIsCreatingCategoryInWizard(true);
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#04243b] rounded-xl text-xs font-black transition-all cursor-pointer"
                        >
                          Criar Novo Tributo +
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : importStep === 'validate-debts' ? (
                /* STEP 2: HORIZONTAL INTERACTIVE DEBT VALIDATION GRID */
                <div className="space-y-4 animate-fadeIn">
                  <div className="bg-[#04243b]/5 border-l-4 border-[#e4b35e] p-3.5 rounded-r-xl text-left">
                    <p className="text-xs font-bold text-[#04243b]">
                      Tabela de Validação de Lançamentos
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5 leading-relaxed">
                      Verifique os campos preenchidos conforme as informações enviadas. Você pode alterar valores e competências diretamente digitando nas células. Entendendo que está tudo correto, salve e inclua no sistema.
                    </p>
                  </div>

                  {/* Client / Contribuinte identification inside validation if extracted */}
                  {(tempClientInfo.cnpj || tempClientInfo.name) && (
                    <div className="bg-white p-3 rounded-2xl border border-slate-150 flex flex-col md:flex-row gap-3 justify-between items-start md:items-center text-xs">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase">Nome Identificado</p>
                        <p className="font-extrabold text-[#04243b]">{tempClientInfo.name || 'Não identificado'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase">CNPJ Identificado</p>
                        <p className="font-mono font-bold text-slate-700">{tempClientInfo.cnpj || 'Não identificado'}</p>
                      </div>
                      <div className="border-t md:border-t-0 md:border-l border-slate-200 pt-2 md:pt-0 md:pl-4">
                        <button
                          type="button"
                          onClick={() => {
                            setTempClientInfo({ cnpj: '', name: '' });
                            showTempNotification('Dados do contribuinte descartados da importação.');
                          }}
                          className="text-red-500 hover:text-red-700 font-bold hover:underline"
                        >
                          Desconsiderar estes dados
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Grouped Editable Tables by Category */}
                  {tempParsedDebts.length === 0 ? (
                    <div className="border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 font-extrabold bg-white">
                      Nenhum lançamento adicionado nesta sessão. Clique no botão abaixo para adicionar uma linha.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {Object.entries(
                        tempParsedDebts.reduce<Record<string, typeof tempParsedDebts>>((acc, debt) => {
                          const cat = debt.category || 'OUTROS';
                          if (!acc[cat]) acc[cat] = [];
                          acc[cat].push(debt);
                          return acc;
                        }, {})
                      ).map(([categoryName, rawItems]) => {
                        const items = rawItems as typeof tempParsedDebts;
                        const categoryTotalPrincipal = items.reduce((s, d) => s + (Number(d.principal) || 0), 0);
                        const categoryTotalPenalty = items.reduce((s, d) => s + (Number(d.penalty) || 0), 0);
                        const categoryTotalInterest = items.reduce((s, d) => s + (Number(d.interest) || 0), 0);
                        const categoryTotalSum = items.reduce((s, d) => s + (Number(d.total) || 0), 0);
                        
                        const categoryDetails = getCategoryByTitle(categoryName);
                        
                        return (
                          <div key={categoryName} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs space-y-3 p-4">
                            {/* Group Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                              <div className="flex items-center space-x-2">
                                <div className="p-1.5 bg-[#04243b]/5 text-[#04243b] rounded-lg border border-[#04243b]/10">
                                  <Layers className="h-4 w-4 text-[#e4b35e]" />
                                </div>
                                <div>
                                  <h5 className="text-xs sm:text-sm font-black text-[#04243b] uppercase tracking-wide">
                                    {categoryName}
                                  </h5>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-md uppercase tracking-wider">
                                      {categoryDetails.origin}
                                    </span>
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-[#e4b35e]/15 text-[#04243b] rounded-md uppercase tracking-wider">
                                      {categoryDetails.categoryType}
                                    </span>
                                    <span className="text-[9px] text-slate-400 font-semibold">
                                      {items.length} {items.length === 1 ? 'débito' : 'débitos'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Category Total Badge */}
                              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-1 text-right">
                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Total Categoria</span>
                                <span className="text-xs font-black text-emerald-800">
                                  R$ {categoryTotalSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>

                            {/* Table inside group card */}
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-xs text-left">
                                <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                  <tr>
                                    <th className="py-2 px-3">Tributo / Categoria</th>
                                    <th className="py-2 px-3 w-32">Competência (PA)</th>
                                    <th className="py-2 px-3 w-28">Valor Original (R$)</th>
                                    <th className="py-2 px-3 w-32">Valor Atualizado (R$)</th>
                                    <th className="py-2 px-3 w-36">Situação</th>
                                    <th className="py-2 px-3 text-center w-12">Excluir</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {items.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="py-2 px-2">
                                        <SearchableCategorySelect
                                          value={item.category}
                                          categories={categories}
                                          onChange={(newCat) => updateTempDebtField(item.id, 'category', newCat)}
                                        />
                                      </td>
                                      <td className="py-2 px-2">
                                        <input
                                          type="text"
                                          value={item.period}
                                          onChange={(e) => updateTempDebtField(item.id, 'period', e.target.value)}
                                          className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-center font-black focus:outline-none focus:border-[#e4b35e]"
                                          placeholder="MM/AAAA"
                                        />
                                      </td>
                                      <td className="py-2 px-2">
                                        <input
                                          type="number"
                                          value={item.principal}
                                          onChange={(e) => updateTempDebtField(item.id, 'principal', parseFloat(e.target.value) || 0)}
                                          className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-right font-semibold focus:outline-none focus:border-[#e4b35e]"
                                          step="0.01"
                                        />
                                      </td>
                                      <td className="py-2 px-2">
                                        <input
                                          type="number"
                                          value={item.total}
                                          onChange={(e) => updateTempDebtField(item.id, 'total', parseFloat(e.target.value) || 0)}
                                          className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-right font-semibold focus:outline-none focus:border-[#e4b35e]"
                                          step="0.01"
                                        />
                                      </td>
                                      <td className="py-2 px-2">
                                        <select
                                          value={item.status}
                                          onChange={(e) => updateTempDebtField(item.id, 'status', e.target.value)}
                                          className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#e4b35e]"
                                        >
                                          <option value="DEVEDOR">DEVEDOR</option>
                                          <option value="SUSPENSO">SUSPENSO</option>
                                          <option value="COBRANÇA AMIGÁVEL">COBRANÇA AMIGÁVEL</option>
                                          <option value="EXECUÇÃO FISCAL">EXECUÇÃO FISCAL</option>
                                          <option value="EM PARCELAMENTO">EM PARCELAMENTO</option>
                                        </select>
                                      </td>
                                      <td className="py-2 px-2 text-center">
                                        <button
                                          type="button"
                                          onClick={() => deleteTempDebt(item.id)}
                                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer inline-flex"
                                          title="Excluir"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-[11px] text-[#04243b]">
                                  <tr>
                                    <td colSpan={2} className="py-2 px-3 uppercase text-[9px] text-slate-500 tracking-wider">Subtotais Categoria</td>
                                    <td className="py-2 px-3 text-right">
                                      R$ {categoryTotalPrincipal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-2 px-3 text-right text-emerald-800 font-extrabold" colSpan={3}>
                                      R$ {categoryTotalSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        );
                      })}

                      {/* Summary Grand Totals Box */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                        <div className="text-left">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Resumo do Lançamento</span>
                          <p className="text-[#04243b] font-extrabold text-sm uppercase mt-0.5">
                            TOTAIS GERAIS DESTA SESSÃO ({tempParsedDebts.length} {tempParsedDebts.length === 1 ? 'débito' : 'débitos'})
                          </p>
                        </div>
                        <div className="grid grid-cols-2 sm:flex sm:items-center gap-4 text-right">
                          <div className="border-r border-slate-200 pr-4 hidden sm:block">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Valor Original</span>
                            <span className="font-bold text-slate-700">
                              R$ {tempParsedDebts.reduce((s, d) => s + (Number(d.principal) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="bg-[#04243b] text-white rounded-xl px-4 py-2 flex flex-col justify-center">
                            <span className="text-[8px] font-black uppercase text-[#e4b35e] tracking-widest block text-center sm:text-right">Soma Total Geral</span>
                            <span className="text-sm font-black text-[#e4b35e] text-center sm:text-right">
                              R$ {tempParsedDebts.reduce((s, d) => s + (Number(d.total) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions footer for Validation step */}
                  <div className="flex flex-col sm:flex-row justify-between items-center pt-2 gap-3">
                    <button
                      type="button"
                      onClick={addTempDebtRow}
                      className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-250 text-[#04243b] rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar Linha em Branco
                    </button>

                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setTempParsedDebts([]);
                          setImportStep('select-category');
                        }}
                        className="w-1/3 sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Voltar / Reiniciar
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmImport}
                        disabled={tempParsedDebts.length === 0}
                        className="w-2/3 sm:w-auto px-6 py-2 bg-emerald-600 disabled:opacity-50 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
                      >
                        Salvar e Incluir no Sistema ({tempParsedDebts.length})
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* STEP 4: SUCCESS CONFIRMATION WITH SMART NEXT TRANSITION */
                <div className="text-center py-8 space-y-5 animate-fadeIn">
                  <div className="h-16 w-16 bg-emerald-100 border border-emerald-300 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
                    <Check className="h-8 w-8 stroke-[3]" />
                  </div>

                  <div className="space-y-2">
                    <h5 className="text-base font-black text-[#04243b] uppercase">Lançamento Realizado com Sucesso!</h5>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                      As informações do tributo **{selectedCategory?.title}** foram salvas e consolidadas em nossa base de levantamentos.
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl max-w-sm mx-auto space-y-1.5 text-xs text-left">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tributo:</span>
                      <span className="font-extrabold text-[#04243b] uppercase">{selectedCategory?.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Registros Incluídos:</span>
                      <span className="font-bold text-slate-800">{tempParsedDebts.length} competências</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold">
                      <span className="text-slate-500">Valor Total:</span>
                      <span className="text-emerald-700">
                        R$ {tempParsedDebts.reduce((s, d) => s + (Number(d.total) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Smart routing buttons */}
                  <div className="flex flex-col sm:flex-row justify-center gap-2 max-w-md mx-auto pt-4 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        // Reset wizard to launch next category directly
                        setTempParsedDebts([]);
                        setTempClientInfo({ cnpj: '', name: '' });
                        setSelectedCategory(null);
                        setImportStep('select-category');
                        setCategorySearchQuery('');
                      }}
                      className="px-5 py-2.5 bg-[#e4b35e] hover:bg-[#d1a250] text-[#04243b] font-black uppercase rounded-xl text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Plus className="h-4 w-4" /> Lançar Outro Tributo / Categoria
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Reset everything and close
                        setIsImportModalOpen(false);
                        setIsPreviewingImport(false);
                        setTempParsedDebts([]);
                        setTempClientInfo({ cnpj: '', name: '' });
                        setSelectedCategory(null);
                        setImportStep('select-category');
                        setCategorySearchQuery('');
                        setPasteText('');
                      }}
                      className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                    >
                      Concluir e Fechar Janela
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: MANUAL DEBT DIALOG MODAL */}
      {isAddingDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-100 max-w-md w-full p-6 shadow-xl space-y-4 animate-scaleUp max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-black text-[#04243b] uppercase tracking-wider">
                {editingDebtId ? 'Editar Débito em Aberto' : 'Lançar Novo Débito em Aberto'}
              </h4>
              <button
                onClick={() => setIsAddingDebt(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveDebt} className="space-y-3 text-xs">
              
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Categoria do Tributo
                </label>
                <select
                  value={formCategoryTitle}
                  onChange={(e) => setFormCategoryTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#e4b35e]"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.title}>{cat.title} ({getAdministrationOrgan(cat.origin, cat.scope)})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Competência / Período
                  </label>
                  <input
                    ref={periodInputRef}
                    type="text"
                    value={formPeriod}
                    onChange={(e) => setFormPeriod(e.target.value)}
                    placeholder="Ex: 05/2026"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#e4b35e]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Situação / Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#e4b35e]"
                  >
                    <option value="DEVEDOR">DEVEDOR</option>
                    <option value="EM ATRASO">EM ATRASO</option>
                    <option value="ATRASO CRÍTICO">ATRASO CRÍTICO</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Valor Original (R$)
                </label>
                <input
                  type="text"
                  value={formPrincipal}
                  onChange={(e) => setFormPrincipal(formatCurrencyString(e.target.value))}
                  placeholder="R$ 0,00"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#e4b35e] font-bold text-[#04243b]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Valor Atualizado (R$)
                </label>
                <input
                  type="text"
                  value={formTotal}
                  onChange={(e) => setFormTotal(formatCurrencyString(e.target.value))}
                  placeholder="R$ 0,00"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#e4b35e] font-bold text-[#04243b]"
                />
              </div>

              <div className="pt-4 flex items-center justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddingDebt(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#04243b] text-[#e4b35e] hover:bg-[#031d30] rounded-xl text-xs font-bold tracking-wide transition-all cursor-pointer shadow-sm"
                >
                  Salvar Registro
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* GLOBAL SCREEN WIDE FILE DRAG & DROP OVERLAY */}
      {isGlobalDragActive && (
        <div 
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter.current = 0;
            setIsGlobalDragActive(false);
          }}
          onDrop={handleGlobalDrop}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-[#04243b]/90 backdrop-blur-md transition-all duration-300"
        >
          <div className="max-w-md w-full border-2 border-dashed border-[#e4b35e] rounded-3xl bg-slate-900/90 p-8 sm:p-10 flex flex-col items-center justify-center text-center space-y-6 shadow-2xl animate-scaleUp">
            <div className="p-5 bg-[#e4b35e]/10 border border-[#e4b35e]/30 text-[#e4b35e] rounded-full animate-bounce">
              <FileUp className="h-12 w-12" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                Arraste e Solte seu Relatório de Pendências!
              </h3>
              <p className="text-xs sm:text-sm text-[#e4b35e] font-black">
                Sincronizando juros, multas e obrigações tributárias
              </p>
              <p className="text-[11px] sm:text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                Arraste e solte seu arquivo PDF, EXCEL ou TEXTO aqui para importar os dados analíticos de forma automática.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: INTEGRATED CSV TEMPLATE & IMPORT MODAL */}
      {isCsvImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-150 max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-scaleUp">
            
            {/* Header with user colors #04243b and #e4b35e */}
            <div className="bg-[#04243b] text-white px-6 py-4 flex items-center justify-between border-b border-[#e4b35e]">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="h-5 w-5 text-[#e4b35e]" />
                <h4 className="text-sm font-extrabold uppercase tracking-wider text-white">
                  Importar Planilha de Débitos (.CSV)
                </h4>
              </div>
              <button
                onClick={() => setIsCsvImportModalOpen(false)}
                className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all font-bold cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content preview */}
            <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 flex items-start gap-2.5">
                <Info className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Como importar múltiplos débitos?</p>
                  <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                    Baixe a <strong>Planilha Modelo</strong> abaixo, preencha os dados de acordo com as colunas especificadas, salve em formato <strong>CSV delimitado por ponto e vírgula (;)</strong> e faça o upload abaixo.
                  </p>
                </div>
              </div>

              {/* Grid representation */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Estrutura Obrigatória de Colunas (6 colunas):
                </span>
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left text-slate-700">
                      <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-[#04243b] border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 bg-[#04243b]/5">Category</th>
                          <th className="px-3 py-2">Code</th>
                          <th className="px-3 py-2">Competence</th>
                          <th className="px-3 py-2 text-right">Value (Original)</th>
                          <th className="px-3 py-2 text-right">Total updated value</th>
                          <th className="px-3 py-2">Situation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 font-medium">
                        <tr>
                          <td className="px-3 py-1.5 font-bold text-[#04243b] bg-slate-50/50">DAS SIMPLES NACIONAL</td>
                          <td className="px-3 py-1.5 font-mono">1099</td>
                          <td className="px-3 py-1.5">03/2026</td>
                          <td className="px-3 py-1.5 text-right font-mono text-slate-600">298,84</td>
                          <td className="px-3 py-1.5 text-right font-mono text-slate-600">364,78</td>
                          <td className="px-3 py-1.5">
                            <span className="px-1.5 py-0.2 bg-red-100 text-red-700 font-bold text-[8px] rounded uppercase">DEVEDOR</span>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-1.5 font-bold text-[#04243b] bg-slate-50/50">ICMS</td>
                          <td className="px-3 py-1.5 font-mono">2031</td>
                          <td className="px-3 py-1.5">04/2026</td>
                          <td className="px-3 py-1.5 text-right font-mono text-slate-600">1250,00</td>
                          <td className="px-3 py-1.5 text-right font-mono text-slate-600">1400,00</td>
                          <td className="px-3 py-1.5">
                            <span className="px-1.5 py-0.2 bg-red-100 text-red-700 font-bold text-[8px] rounded uppercase">DEVEDOR</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Action row to Download template */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
                <div className="text-left">
                  <p className="text-xs font-bold text-[#04243b]">Planilha Modelo do Sistema</p>
                  <p className="text-[10px] text-slate-500">Contém todas as colunas exatas exigidas para importação direta.</p>
                </div>
                <button
                  type="button"
                  onClick={downloadCsvTemplate}
                  className="px-4 py-2 bg-[#04243b] text-[#e4b35e] hover:bg-[#031d30] hover:text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center justify-center space-x-1.5 self-start sm:self-auto shrink-0"
                >
                  <Download className="h-4 w-4" />
                  <span>Baixar Planilha Modelo (.CSV)</span>
                </button>
              </div>

              {/* Drag and Drop zone for Import */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Enviar Arquivo CSV Preenchido:
                </span>
                <div 
                  onClick={() => {
                    document.getElementById('modal-csv-file-input')?.click();
                  }}
                  className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/10 hover:bg-emerald-50/25 rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 space-y-2 group shadow-xs"
                >
                  <input 
                    type="file" 
                    id="modal-csv-file-input" 
                    className="hidden" 
                    accept=".csv"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        setIsCsvImportModalOpen(false); // Close this modal
                        setPasteText('');
                        setSelectedCategory(null);
                        setIsImportModalOpen(true); // Open the validation wizard
                        handleProcessFile(file);
                        // Clear input value to allow selecting same file again
                        e.target.value = '';
                      }
                    }}
                  />
                  <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-full inline-block group-hover:scale-110 transition-transform">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#04243b] leading-tight">
                      Selecione ou Arraste o arquivo CSV preenchido
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      O sistema fará a leitura automática de todas as linhas e colunas.
                    </p>
                  </div>
                </div>
              </div>

            </div>

            {/* Modal actions footer with matching color styles */}
            <div className="bg-slate-50 px-6 py-4 flex items-center justify-end border-t border-slate-150">
              <button
                type="button"
                onClick={() => setIsCsvImportModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* SAFE MODAL FOR DIALOGS (REPLACING NATIVE WINDOW.ALERT/WINDOW.CONFIRM) */}
      {modalState.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-100 max-w-md w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
            
            <div className="flex items-center space-x-2.5 text-[#04243b] border-b border-slate-100 pb-3">
              <div className="p-1.5 bg-[#e4b35e]/10 text-[#e4b35e] rounded-xl">
                <Info className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-extrabold uppercase tracking-wider">
                {modalState.title}
              </h4>
            </div>

            <p className="text-xs text-slate-650 leading-relaxed font-semibold">
              {modalState.message}
            </p>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              {modalState.type === 'confirm' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                    className="px-4 py-2 border border-slate-250 rounded-xl text-xs font-bold text-slate-500 bg-white hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    Não, Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalState(prev => ({ ...prev, isOpen: false }));
                      if (modalState.onConfirm) modalState.onConfirm();
                    }}
                    className="px-4 py-2 bg-[#04243b] text-[#e4b35e] hover:bg-red-650 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                  >
                    Sim, Confirmar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                  className="px-5 py-2 bg-[#04243b] text-[#e4b35e] rounded-xl text-xs font-extrabold hover:bg-[#031d30] transition-all cursor-pointer shadow-sm"
                >
                  Entendi
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
