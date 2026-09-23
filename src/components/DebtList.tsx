/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DebtList.tsx
 * Componente modular de listagem de débitos fiscais com simulação de parcelamento integrada.
 * Mantém exatamente as informações e o formato original da função de simulação de parcelamento.
 * Sem botões de prazo fixo (12x, 24x, 36x), sem cronograma mensal e sem Selic.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calculator, 
  TrendingUp, 
  CheckCircle, 
  Plus, 
  Edit2, 
  Trash2, 
  Briefcase, 
  FolderSync, 
  Check, 
  X, 
  Info,
  Layers,
  Sparkles
} from 'lucide-react';
import { DebtItem, DebtCategory, Company, DebtSimulationLink, DebtCustomGroup } from '../types_debits';
import { 
  getSimulationResults, 
  formatCurrency, 
  SimulationCalculationResult 
} from '../services/InstallmentService';
import { sortDebtsByCompetencia } from '../utils/debtParser';
import { getAdministrationOrgan } from './DebtLevantamento';
import { GroupDebtsModal } from './GroupDebtsModal';

interface FormattedCurrencyInputProps {
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
}

export const FormattedCurrencyInput: React.FC<FormattedCurrencyInputProps> = ({
  value,
  onChange,
  placeholder = "R$ 0,00",
  className
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [localStr, setLocalStr] = useState('');

  useEffect(() => {
    if (!isFocused) {
      if (!value || value === 0 || isNaN(value)) {
        setLocalStr('');
      } else {
        setLocalStr(value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
      }
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    if (!value || value === 0 || isNaN(value)) {
      setLocalStr('');
    } else {
      const hasDecimals = value % 1 !== 0;
      setLocalStr(value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: 2
      }));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (!value || value === 0 || isNaN(value)) {
      setLocalStr('');
    } else {
      setLocalStr(value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    let cleaned = raw.replace(/[^\d,]/g, '');
    const parts = cleaned.split(',');
    if (parts.length > 2) {
      cleaned = parts[0] + ',' + parts.slice(1).join('');
    }

    if (cleaned !== '') {
      const intPart = parts[0].replace(/\D/g, '');
      const formattedInt = intPart ? parseInt(intPart, 10).toLocaleString('pt-BR') : '';
      if (parts.length > 1) {
        const decPart = parts[1].replace(/\D/g, '').slice(0, 2);
        setLocalStr(`R$ ${formattedInt || '0'},${decPart}`);
      } else {
        setLocalStr(`R$ ${formattedInt || '0'}`);
      }
    } else {
      setLocalStr('');
    }

    let numericVal = 0;
    if (parts.length > 1) {
      const intVal = parts[0].replace(/\D/g, '') || '0';
      const decVal = parts[1].replace(/\D/g, '');
      numericVal = parseFloat(`${intVal}.${decVal}`);
    } else {
      numericVal = parseFloat(parts[0].replace(/\D/g, '')) || 0;
    }
    onChange(numericVal);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localStr}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
    />
  );
};

interface DebtListProps {
  debts: DebtItem[];
  categories: DebtCategory[];
  company: Company | null;
  originFilter: 'TODOS' | 'FEDERAL' | 'ESTADUAL' | 'MUNICIPAL';
  searchQuery: string;
  onAddDebt: (categoryTitle: string) => void;
  onEditDebt: (debt: DebtItem) => void;
  onDeleteDebt: (debtId: string) => void;
  linkedSimulations: Record<string, DebtSimulationLink>;
  onSaveSimulation: (sim: DebtSimulationLink) => Promise<void>;
  onDeleteSimulation: (targetId: string) => Promise<void>;
  customGroups?: DebtCustomGroup[];
  onSaveCustomGroup?: (group: DebtCustomGroup) => void;
  onDeleteCustomGroup?: (groupId: string) => void;
}

export const DebtList: React.FC<DebtListProps> = ({
  debts,
  categories,
  company,
  originFilter,
  searchQuery,
  onAddDebt,
  onEditDebt,
  onDeleteDebt,
  linkedSimulations,
  onSaveSimulation,
  onDeleteSimulation,
  customGroups = [],
  onSaveCustomGroup,
  onDeleteCustomGroup,
}) => {
  // Target currently open for inline simulation
  const [activeSimulationTarget, setActiveSimulationTarget] = useState<string | null>(null);

  // Group modal state
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<DebtCustomGroup | null>(null);
  const [initialSelectedCategory, setInitialSelectedCategory] = useState<string | undefined>(undefined);

  // Checkbox selection state for creating groups directly from list
  const [selectedCategoriesForGroup, setSelectedCategoriesForGroup] = useState<string[]>([]);
  const [newGroupNameInput, setNewGroupNameInput] = useState<string>('');

  // Active form state for the inline simulation
  const [simForm, setSimForm] = useState<{
    targetId: string;
    targetType: 'DEBT_ITEM' | 'CATEGORY_GROUP';
    title: string;
    period?: string;
    category: string;
    totalDebt: number;
    downPayment: number;
    isDownPaymentInstallment: boolean;
    downPaymentInstallmentsCount: number;
    downPaymentInstallmentValue: number;
    installmentsCount: number;
    installmentValue: number;
    parcelamentoType: string;
  } | null>(null);

  // Helper to find category info by title
  const getCategoryByTitle = (title: string): DebtCategory => {
    const found = categories.find(c => c.title.toLowerCase() === title.toLowerCase());
    return found || {
      id: 'default',
      categoryType: 'TRIBUTO',
      origin: 'FEDERAL',
      documentType: 'DARF',
      title,
      scope: 'ADMINISTRATIVO'
    };
  };

  // Filter debts by search query
  const filteredDebts = useMemo(() => {
    if (!searchQuery.trim()) return debts;
    const q = searchQuery.toLowerCase();
    return debts.filter(d => 
      d.period.toLowerCase().includes(q) || 
      d.category.toLowerCase().includes(q) ||
      (d.status && d.status.toLowerCase().includes(q))
    );
  }, [debts, searchQuery]);

  // Executive KPI totals
  const biMetrics = useMemo(() => {
    const totalPrincipal = debts.reduce((sum, d) => sum + d.principal, 0);
    const grandTotal = debts.reduce((sum, d) => sum + d.total, 0);
    const totalSimulatedCount = Object.keys(linkedSimulations).length;
    
    let projectedMonthlySum = 0;
    let totalFinancedSum = 0;
    Object.values(linkedSimulations).forEach((sim: DebtSimulationLink) => {
      projectedMonthlySum += sim.avgInstallment;
      totalFinancedSum += sim.totalPaid;
    });

    return {
      totalPrincipal,
      grandTotal,
      debtsCount: debts.length,
      totalSimulatedCount,
      projectedMonthlySum,
      totalFinancedSum
    };
  }, [debts, linkedSimulations]);

  // Default parcelamento types list
  const availableParcelamentoTypes = useMemo(() => {
    const customTypes = categories
      .filter(c => c.categoryType === 'PARCELAMENTO')
      .map(c => c.title);

    const defaults = [
      'PARCELAMENTO SIMPLES NACIONAL',
      'PARCELAMENTO MEI',
      'PARCELAMENTO PREVIDENCIÁRIO',
      'PARCELAMENTO SEFAZ / ICMS',
      'PARCELAMENTO SEFIN / ISS'
    ];

    return Array.from(new Set([...customTypes, ...defaults]));
  }, [categories]);

  // Handler to open inline simulation for a specific debt item
  const handleOpenDebtSimulation = (debt: DebtItem) => {
    if (activeSimulationTarget === debt.id) {
      setActiveSimulationTarget(null);
      setSimForm(null);
      return;
    }

    const existing = linkedSimulations[debt.id];
    const cat = getCategoryByTitle(debt.category);
    const defaultType = cat.categoryType === 'PARCELAMENTO' 
      ? cat.title 
      : (debt.category.toUpperCase().includes('SIMPLES') ? 'PARCELAMENTO SIMPLES NACIONAL' : (debt.category.toUpperCase().includes('MEI') ? 'PARCELAMENTO MEI' : 'PARCELAMENTO PREVIDENCIÁRIO'));

    setActiveSimulationTarget(debt.id);
    setSimForm({
      targetId: debt.id,
      targetType: 'DEBT_ITEM',
      title: `${debt.category} - Comp. ${debt.period}`,
      period: debt.period,
      category: debt.category,
      totalDebt: debt.total,
      downPayment: existing?.downPayment || 0,
      isDownPaymentInstallment: !!existing?.isDownPaymentInstallment,
      downPaymentInstallmentsCount: existing?.downPaymentInstallmentsCount || 12,
      downPaymentInstallmentValue: existing?.downPaymentInstallmentValue || 0,
      installmentsCount: existing?.installmentsCount || 60,
      installmentValue: existing?.installmentValue || 0,
      parcelamentoType: existing?.parcelamentoType || defaultType
    });
  };

  // Handler to open inline simulation for a whole Category Group subtotal
  const handleOpenCategorySimulation = (categoryTitle: string, categoryTotal: number) => {
    const targetKey = `group:${categoryTitle}`;
    if (activeSimulationTarget === targetKey) {
      setActiveSimulationTarget(null);
      setSimForm(null);
      return;
    }

    const existing = linkedSimulations[targetKey];
    const cat = getCategoryByTitle(categoryTitle);
    const defaultType = categoryTitle.toUpperCase().includes('SIMPLES') 
      ? 'PARCELAMENTO SIMPLES NACIONAL' 
      : (cat.origin === 'ESTADUAL' ? 'PARCELAMENTO SEFAZ / ICMS' : (cat.origin === 'MUNICIPAL' ? 'PARCELAMENTO SEFIN / ISS' : 'PARCELAMENTO PREVIDENCIÁRIO'));

    setActiveSimulationTarget(targetKey);
    setSimForm({
      targetId: targetKey,
      targetType: 'CATEGORY_GROUP',
      title: `Subtotal do Grupo: ${categoryTitle}`,
      category: categoryTitle,
      totalDebt: categoryTotal,
      downPayment: existing?.downPayment || 0,
      isDownPaymentInstallment: !!existing?.isDownPaymentInstallment,
      downPaymentInstallmentsCount: existing?.downPaymentInstallmentsCount || 12,
      downPaymentInstallmentValue: existing?.downPaymentInstallmentValue || 0,
      installmentsCount: existing?.installmentsCount || 60,
      installmentValue: existing?.installmentValue || 0,
      parcelamentoType: existing?.parcelamentoType || defaultType
    });
  };

  // Handler to open inline simulation for a Custom Consolidated Group
  const handleOpenGroupSimulation = (group: DebtCustomGroup, groupTotal: number) => {
    const targetKey = `custom_group:${group.id}`;
    if (activeSimulationTarget === targetKey) {
      setActiveSimulationTarget(null);
      setSimForm(null);
      return;
    }

    const existing = linkedSimulations[targetKey];
    const defaultType = group.name.toUpperCase().includes('SIMPLES')
      ? 'PARCELAMENTO SIMPLES NACIONAL'
      : (group.name.toUpperCase().includes('MEI') ? 'PARCELAMENTO MEI' : 'PARCELAMENTO PREVIDENCIÁRIO');

    setActiveSimulationTarget(targetKey);
    setSimForm({
      targetId: targetKey,
      targetType: 'CATEGORY_GROUP',
      title: `Grupo Consolidado: ${group.name}`,
      category: group.name,
      totalDebt: groupTotal,
      downPayment: existing?.downPayment || 0,
      isDownPaymentInstallment: !!existing?.isDownPaymentInstallment,
      downPaymentInstallmentsCount: existing?.downPaymentInstallmentsCount || 12,
      downPaymentInstallmentValue: existing?.downPaymentInstallmentValue || 0,
      installmentsCount: existing?.installmentsCount || 60,
      installmentValue: existing?.installmentValue || 0,
      parcelamentoType: existing?.parcelamentoType || defaultType
    });
  };

  // Group modal triggers
  const handleOpenCreateGroup = (preselectedCategory?: string) => {
    setEditingGroup(null);
    setInitialSelectedCategory(preselectedCategory);
    setIsGroupModalOpen(true);
  };

  const handleEditCustomGroup = (group: DebtCustomGroup) => {
    setEditingGroup(group);
    setInitialSelectedCategory(undefined);
    setIsGroupModalOpen(true);
  };

  // Opportunity detection for Simples Nacional unification (DAS + Parcelamento)
  const simplesNacionalOpportunity = useMemo(() => {
    const existingGroupHasBoth = (customGroups || []).some(g => {
      const cats = g.categories.map(c => c.toUpperCase());
      const hasDas = cats.some(c => c.includes('SIMPLES') && !c.includes('PARCEL'));
      const hasParcel = cats.some(c => c.includes('SIMPLES') && c.includes('PARCEL'));
      return hasDas && hasParcel;
    });

    if (existingGroupHasBoth) return null;

    const dasSimplesCats = Array.from(new Set(
      debts.map(d => d.category).filter(c => c.toUpperCase().includes('SIMPLES') && !c.toUpperCase().includes('PARCEL'))
    ));
    const parcelSimplesCats = Array.from(new Set(
      debts.map(d => d.category).filter(c => c.toUpperCase().includes('SIMPLES') && c.toUpperCase().includes('PARCEL'))
    ));

    if (dasSimplesCats.length > 0 && parcelSimplesCats.length > 0) {
      const allToMerge = Array.from(new Set([...dasSimplesCats, ...parcelSimplesCats]));
      const totalAmount = debts
        .filter(d => allToMerge.includes(d.category))
        .reduce((sum, d) => sum + d.total, 0);

      const dasCount = debts.filter(d => dasSimplesCats.includes(d.category)).length;
      const parcelCount = debts.filter(d => parcelSimplesCats.includes(d.category)).length;

      return {
        categories: allToMerge,
        dasCount,
        parcelCount,
        totalAmount
      };
    }

    return null;
  }, [debts, customGroups]);

  const handleQuickGroupSimplesNacional = () => {
    if (!simplesNacionalOpportunity || !onSaveCustomGroup) return;
    const newGroup: DebtCustomGroup = {
      id: 'grp_simples_' + Date.now(),
      name: 'SIMPLES NACIONAL (DAS + PARCELAMENTOS)',
      categories: simplesNacionalOpportunity.categories,
      origin: 'FEDERAL',
      organId: 'RFB',
      createdAt: new Date().toISOString()
    };
    onSaveCustomGroup(newGroup);
  };

  // Save current simulation linked to the debt or category
  const handleSaveCurrentSimulation = async () => {
    if (!simForm) return;

    if (simForm.totalDebt <= 0) {
      alert("Por favor, informe o valor total atualizado do débito.");
      return;
    }

    let calculatedDown = simForm.downPayment;
    let calculatedDownVal = simForm.downPaymentInstallmentValue;

    if (simForm.isDownPaymentInstallment) {
      if (!simForm.downPaymentInstallmentsCount || simForm.downPaymentInstallmentsCount <= 0) {
        alert("Por favor, informe a quantidade de parcelas da entrada (ex: 12x).");
        return;
      }
      if (!simForm.downPaymentInstallmentValue || simForm.downPaymentInstallmentValue <= 0) {
        if (simForm.downPayment > 0 && simForm.downPaymentInstallmentsCount > 0) {
          calculatedDownVal = simForm.downPayment / simForm.downPaymentInstallmentsCount;
        } else {
          alert("Por favor, informe o valor da parcela da entrada.");
          return;
        }
      } else {
        calculatedDown = (simForm.downPaymentInstallmentValue || 0) * (simForm.downPaymentInstallmentsCount || 12);
      }
    }

    if (simForm.installmentsCount <= 0) {
      alert("Por favor, informe o número de parcelas.");
      return;
    }

    const results = getSimulationResults({
      ...simForm,
      downPayment: calculatedDown,
      downPaymentInstallmentValue: calculatedDownVal
    });

    const payload: DebtSimulationLink = {
      id: 'sim_' + Date.now(),
      targetId: simForm.targetId,
      targetType: simForm.targetType,
      debtPeriod: simForm.period,
      debtCategory: simForm.category,
      totalDebt: simForm.totalDebt,
      downPayment: results.totalDown,
      isDownPaymentInstallment: simForm.isDownPaymentInstallment,
      downPaymentInstallmentsCount: simForm.downPaymentInstallmentsCount,
      downPaymentInstallmentValue: calculatedDownVal,
      installmentsCount: simForm.installmentsCount,
      installmentValue: results.avgInstallment,
      parcelamentoType: simForm.parcelamentoType,
      totalPaid: results.totalPaid,
      avgInstallment: results.avgInstallment,
      totalDown: results.totalDown,
      financedAmount: results.financedAmount,
      isViable: true,
      savedAt: new Date().toISOString()
    };

    await onSaveSimulation(payload);
    setActiveSimulationTarget(null);
    setSimForm(null);
  };

  // Scopes configuration for Federal / Estadual / Municipal
  const SCOPES_CONFIG = [
    {
      id: 'FEDERAL' as const,
      title: 'Âmbito Federal',
      description: 'Tributos sob competência da Receita Federal (RFB) e PGFN',
      icon: Briefcase,
      badgeBg: 'bg-[#001D3B] text-white',
      organs: [
        { id: 'RFB', title: 'Receita Federal do Brasil (RFB)', scope: 'ADMINISTRATIVO' as const },
        { id: 'PGFN', title: 'Procuradoria-Geral da Fazenda Nacional (PGFN)', scope: 'DIVIDA_ATIVA' as const }
      ]
    },
    {
      id: 'ESTADUAL' as const,
      title: 'Âmbito Estadual',
      description: 'Tributos e parcelamentos sob a competência do Estado (SEFAZ e PGE)',
      icon: Briefcase,
      badgeBg: 'bg-slate-800 text-white',
      organs: [
        { id: 'SEFAZ', title: 'Secretaria de Estado da Fazenda (SEFAZ)', scope: 'ADMINISTRATIVO' as const },
        { id: 'PGE', title: 'Procuradoria-Geral do Estado (PGE)', scope: 'DIVIDA_ATIVA' as const }
      ]
    },
    {
      id: 'MUNICIPAL' as const,
      title: 'Âmbito Municipal',
      description: 'Tributos sob a competência do Município (SEFIN e PGM)',
      icon: FolderSync,
      badgeBg: 'bg-zinc-800 text-white',
      organs: [
        { id: 'SEFIN', title: 'Secretaria Municipal de Finanças (SEFIN)', scope: 'ADMINISTRATIVO' as const },
        { id: 'PGM', title: 'Procuradoria-Geral do Município (PGM)', scope: 'DIVIDA_ATIVA' as const }
      ]
    }
  ];

  // Unique categories in all registered debts
  const allUniqueCategoriesInDebts = useMemo(() => {
    return Array.from(new Set(debts.map(d => d.category))) as string[];
  }, [debts]);

  // Categories already assigned to any custom group
  const allGroupedCategoriesSet = useMemo(() => {
    return new Set((customGroups || []).flatMap(g => g.categories.map(c => c.toLowerCase())));
  }, [customGroups]);

  // Categories available to be grouped (not in any group yet)
  const availableUngroupedCategories = useMemo(() => {
    return allUniqueCategoriesInDebts.filter(c => !allGroupedCategoriesSet.has(c.toLowerCase()));
  }, [allUniqueCategoriesInDebts, allGroupedCategoriesSet]);

  const toggleCategorySelection = (catTitle: string) => {
    setSelectedCategoriesForGroup(prev => {
      const exists = prev.includes(catTitle);
      const next = exists ? prev.filter(c => c !== catTitle) : [...prev, catTitle];
      if (!newGroupNameInput.trim() && next.length > 0) {
        if (next.some(c => c.toUpperCase().includes('PREVIDENCI'))) {
          setNewGroupNameInput('GRUPO PREVIDENCIÁRIO');
        } else if (next.some(c => c.toUpperCase().includes('SIMPLES'))) {
          setNewGroupNameInput('GRUPO SIMPLES NACIONAL');
        } else {
          setNewGroupNameInput(`GRUPO CONSOLIDADO (${next.length} CATEGORIAS)`);
        }
      }
      return next;
    });
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCategoriesForGroup(availableUngroupedCategories);
      if (!newGroupNameInput.trim()) {
        if (availableUngroupedCategories.some(c => c.toUpperCase().includes('PREVIDENCI'))) {
          setNewGroupNameInput('GRUPO PREVIDENCIÁRIO');
        } else if (availableUngroupedCategories.some(c => c.toUpperCase().includes('SIMPLES'))) {
          setNewGroupNameInput('GRUPO SIMPLES NACIONAL');
        } else {
          setNewGroupNameInput('GRUPO CONSOLIDADO GERAL');
        }
      }
    } else {
      setSelectedCategoriesForGroup([]);
    }
  };

  const handleCreateGroupFromSelection = () => {
    if (selectedCategoriesForGroup.length === 0) return;
    const name = newGroupNameInput.trim() || `GRUPO CONSOLIDADO (${selectedCategoriesForGroup.length} CATEGORIAS)`;
    const newGroup: DebtCustomGroup = {
      id: 'grp_' + Date.now(),
      name: name.toUpperCase(),
      categories: [...selectedCategoriesForGroup],
      createdAt: new Date().toISOString()
    };
    if (onSaveCustomGroup) {
      onSaveCustomGroup(newGroup);
    }
    setSelectedCategoriesForGroup([]);
    setNewGroupNameInput('');
  };

  const selectedMetricsForGroup = useMemo(() => {
    const includedDebts = debts.filter(d => 
      selectedCategoriesForGroup.some(c => c.toLowerCase() === d.category.toLowerCase())
    );
    return {
      count: includedDebts.length,
      total: includedDebts.reduce((sum, d) => sum + d.total, 0)
    };
  }, [debts, selectedCategoriesForGroup]);

  // Standard category card renderer (used for both separate ungrouped cards and cards inside a group)
  const renderCategoryCard = (
    categoryTitle: string,
    categoryDebts: DebtItem[],
    isInGroup: boolean = false,
    parentGroupId?: string
  ) => {
    const catInfo = getCategoryByTitle(categoryTitle);
    const catPrincipal = categoryDebts.reduce((sum, item) => sum + item.principal, 0);
    const catTotal = categoryDebts.reduce((sum, item) => sum + item.total, 0);
    const groupTargetKey = `group:${categoryTitle}`;
    const groupSim = linkedSimulations[groupTargetKey];
    const isAnySimActiveInCategory = activeSimulationTarget === groupTargetKey || 
      categoryDebts.some(d => activeSimulationTarget === d.id);
    const isSelected = selectedCategoriesForGroup.includes(categoryTitle);

    return (
      <div 
        key={categoryTitle} 
        className={`bg-white rounded-2xl border ${
          isInGroup ? 'border-slate-300' : 'border-slate-200'
        } shadow-sm overflow-hidden flex flex-col justify-between transition-all hover:border-slate-300 ${
          isAnySimActiveInCategory || (groupSim && !isInGroup) ? 'lg:col-span-2 shadow-md ring-1 ring-[#001D3B]/10' : ''
        }`}
      >
        <div>
          {/* Card Header Ribbon */}
          <div className="bg-slate-50 border-b border-slate-200 p-3 flex flex-col gap-2">
            {/* Top row: Checkbox + Full Category Title + Subtotal Badge */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start space-x-2.5 min-w-0 flex-1">
                {!isInGroup && (
                  <label 
                    className="cursor-pointer flex items-center justify-center p-0.5 mt-0.5 rounded hover:bg-slate-200 transition-colors shrink-0"
                    title="Marcar para criar grupo consolidado"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleCategorySelection(categoryTitle);
                      }}
                      className="w-4 h-4 rounded text-[#3EA049] accent-[#3EA049] cursor-pointer"
                    />
                  </label>
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs sm:text-[13px] font-black text-[#001D3B] tracking-wide uppercase leading-snug break-words">
                    {categoryTitle}
                  </h4>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
                      {catInfo.documentType}
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">
                      {catInfo.categoryType}
                    </span>
                    {catInfo.code && (
                      <span className="text-[9px] font-mono font-bold text-slate-600 bg-slate-200/70 px-1.5 py-0.5 rounded">
                        Cód. {catInfo.code}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Subtotal da Categoria */}
              <div className="text-right shrink-0">
                <span className="text-xs font-black text-[#001D3B] bg-white border border-slate-200 px-2.5 py-1 rounded-lg font-mono block shadow-2xs">
                  {formatCurrency(catTotal)}
                </span>
                <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">
                  {categoryDebts.length} lançamento{categoryDebts.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {/* Bottom action row for this category */}
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Contextual Action: Simular Categoria (APENAS se NÃO estiver dentro de um grupo) */}
                {!isInGroup && (
                  <button
                    onClick={() => handleOpenCategorySimulation(categoryTitle, catTotal)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                      groupSim
                        ? 'bg-emerald-50 text-[#3EA049] border border-[#3EA049]/40 hover:bg-emerald-100'
                        : 'bg-[#F1F5F9] text-[#001D3B] hover:bg-slate-200 border border-slate-300'
                    }`}
                    title={groupSim ? 'Simulação Salva - Clique para Editar' : 'Simular parcelamento desta categoria'}
                  >
                    <TrendingUp className="h-3 w-3 text-[#3EA049]" />
                    <span>{groupSim ? `${groupSim.installmentsCount}x de ${formatCurrency(groupSim.avgInstallment)}` : 'Simular Parcelamento'}</span>
                  </button>
                )}

                {/* Contextual Action: Agrupar com outros débitos (apenas se fora de grupo) */}
                {!isInGroup && (
                  <button
                    onClick={() => handleOpenCreateGroup(categoryTitle)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-[10px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                    title="Agrupar esta categoria com outras para simulação unificada"
                  >
                    <Layers className="h-3 w-3 text-[#3EA049]" />
                    <span>Agrupar</span>
                  </button>
                )}
              </div>

              {/* Lançar */}
              <button
                onClick={() => onAddDebt(categoryTitle)}
                className="px-2.5 py-1 bg-[#001D3B] hover:bg-[#04243b] text-white rounded-md text-[10px] font-extrabold uppercase transition-all flex items-center gap-1 cursor-pointer shadow-xs ml-auto"
                title={`Lançar novo débito de ${categoryTitle}`}
              >
                <Plus className="h-3 w-3" />
                <span>+ Lançar</span>
              </button>
            </div>
          </div>

          {/* Inline Category Group Simulation */}
          <AnimatePresence>
            {activeSimulationTarget === groupTargetKey && simForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-slate-50 border-b border-slate-200 p-3.5 overflow-hidden"
              >
                <InlineSimulationEditor
                  simForm={simForm}
                  setSimForm={setSimForm}
                  availableTypes={availableParcelamentoTypes}
                  onSave={handleSaveCurrentSimulation}
                  onCancel={() => {
                    setActiveSimulationTarget(null);
                    setSimForm(null);
                  }}
                  onDelete={() => {
                    onDeleteSimulation(groupTargetKey);
                    setActiveSimulationTarget(null);
                    setSimForm(null);
                  }}
                  hasExistingSimulation={!!groupSim}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Table of Debts */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs table-fixed">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[30%]" />
                <col className="w-[30%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-2.5 pl-3 pr-2 text-left">Comp.</th>
                  <th className="py-2.5 px-2.5 text-right">Original</th>
                  <th className="py-2.5 px-2.5 text-right">Atualizado</th>
                  <th className="py-2.5 px-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-600 text-[11px]">
                {categoryDebts.map(debt => (
                  <tr key={debt.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="py-2 pl-3 pr-2 text-[#001D3B] font-bold whitespace-nowrap">{debt.period}</td>
                    <td className="py-2 px-2.5 text-slate-500 font-medium font-mono text-right whitespace-nowrap">{formatCurrency(debt.principal)}</td>
                    <td className="py-2 px-2.5 text-[#001D3B] font-black font-mono text-right whitespace-nowrap">{formatCurrency(debt.total)}</td>

                    {/* Actions */}
                    <td className="py-1.5 px-2 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => onEditDebt(debt)}
                          className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded transition-all cursor-pointer"
                          title="Editar débito"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => onDeleteDebt(debt.id)}
                          className="p-1 hover:bg-red-50 text-red-500 hover:text-red-700 rounded transition-all cursor-pointer"
                          title="Remover débito"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50/90 border-t-2 border-slate-200">
                <tr>
                  <td className="py-2.5 pl-3 pr-2 text-left font-black text-slate-700 uppercase text-[10px] tracking-wider whitespace-nowrap">
                    Subtotal
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-bold text-slate-500 font-mono text-[11px] whitespace-nowrap">
                    {formatCurrency(catPrincipal)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-black text-[#001D3B] font-mono text-[12px] whitespace-nowrap">
                    {formatCurrency(catTotal)}
                  </td>
                  <td className="py-2.5 px-2 text-center"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Proposta de Parcelamento Integrada para Categoria Isolada */}
        {!isInGroup && groupSim && (
          <div className="p-3 sm:p-3.5 bg-slate-50/70 border-t border-slate-200">
            <SimulationProposalCard
              title={`Simulação de Parcelamento • ${groupSim.parcelamentoType || categoryTitle}`}
              sim={groupSim}
              onEdit={() => handleOpenCategorySimulation(categoryTitle, catTotal)}
              onDelete={() => {
                onDeleteSimulation(groupTargetKey);
                if (activeSimulationTarget === groupTargetKey) {
                  setActiveSimulationTarget(null);
                  setSimForm(null);
                }
              }}
            />
          </div>
        )}
      </div>
    );
  };

  const scopesToRender = SCOPES_CONFIG.filter(
    scope => originFilter === 'TODOS' || originFilter === scope.id
  );

  return (
    <div className="space-y-6">
      
      {/* 1. EXECUTIVE KPI METRICS PANEL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1: Total Atualizado */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#001D3B]" />
          <div>
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              <span>Total Atualizado</span>
              <span className="bg-[#F1F5F9] text-[#001D3B] border border-slate-200 px-1.5 py-0.5 rounded text-[9px] font-mono">
                {biMetrics.debtsCount} débitos
              </span>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-black text-[#001D3B] tracking-tight">
              {formatCurrency(biMetrics.grandTotal)}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-medium">
            <span>Valor Original</span>
            <span className="font-semibold">{formatCurrency(biMetrics.totalPrincipal)}</span>
          </div>
        </div>

        {/* Metric 2: Simulações Ativas */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#3EA049]" />
          <div>
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              <span>Simulações Vinculadas</span>
              <span className="bg-emerald-50 text-[#3EA049] px-1.5 py-0.5 rounded text-[9px] font-bold">
                {biMetrics.totalSimulatedCount} ativas
              </span>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-black text-[#3EA049] tracking-tight">
              {biMetrics.totalSimulatedCount} Proposta(s)
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-medium">
            <span>Status</span>
            <span className="text-[#3EA049] font-bold">Vinculado ao Débito</span>
          </div>
        </div>

        {/* Metric 3: Parcela Mensal Consolidada */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#F1F5F9] border-r border-slate-300" />
          <div>
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              <span>Parcela Mensal Estimada</span>
              <Calculator className="h-3.5 w-3.5 text-[#001D3B]" />
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-black text-[#001D3B] tracking-tight">
              {formatCurrency(biMetrics.projectedMonthlySum)}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-medium">
            <span>Fluxo Mensal</span>
            <span className="font-semibold text-slate-700">Estimado p/ Mês</span>
          </div>
        </div>

        {/* Metric 4: Total Financiado a Pagar */}
        <div className="bg-[#001D3B] text-white rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[#F1F5F9] text-[10px] font-bold uppercase tracking-wider">
              <span>Total a Liquidar</span>
              <span className="bg-[#3EA049] text-white px-1.5 py-0.5 rounded text-[9px] font-bold">
                Acordo
              </span>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-black text-[#F1F5F9] tracking-tight">
              {formatCurrency(biMetrics.totalFinancedSum || biMetrics.grandTotal)}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-300 font-medium">
            <span>Condição</span>
            <span className="text-emerald-300 font-bold">Parcelamento Sugerido</span>
          </div>
        </div>
      </div>

      {/* SMART OPPORTUNITY BANNER: SIMPLES NACIONAL UNIFICATION */}
      {simplesNacionalOpportunity && onSaveCustomGroup && (
        <div className="bg-gradient-to-r from-emerald-950 via-[#001D3B] to-slate-900 text-white rounded-2xl p-4 sm:p-5 border-2 border-[#3EA049] shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 bg-[#3EA049] text-white rounded-xl shrink-0 shadow-md">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 bg-[#3EA049] text-white rounded text-[9px] font-black uppercase tracking-wider">
                  Unificação Recomendada
                </span>
                <h4 className="text-sm font-black text-white uppercase tracking-wide">
                  Agrupar Débitos do Simples Nacional em Simulação Única
                </h4>
              </div>
              <p className="text-xs text-[#F1F5F9]/90 font-medium leading-relaxed max-w-2xl">
                Identificamos <strong>{simplesNacionalOpportunity.dasCount} débito(s) de DAS</strong> e{' '}
                <strong>{simplesNacionalOpportunity.parcelCount} parcela(s) em aberto de parcelamento</strong>. Como se referem à mesma obrigação tributária, unifique-os para visualização e simulação consolidada de <strong>{formatCurrency(simplesNacionalOpportunity.totalAmount)}</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch md:self-auto shrink-0 justify-end">
            <button
              onClick={handleQuickGroupSimplesNacional}
              className="w-full md:w-auto px-4 py-2.5 bg-[#3EA049] hover:bg-[#34883e] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Layers className="h-4 w-4" />
              <span>Agrupar Simples Nacional Agora</span>
            </button>
          </div>
        </div>
      )}

      {/* ACTION BAR: CUSTOM GROUP MANAGEMENT WITH QUICK-SELECT CHECKBOXES */}
      <div className="bg-slate-50 border border-slate-200 p-3 sm:p-4 rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-[#001D3B] text-white rounded-lg">
              <Layers className="h-4 w-4 text-[#F1F5F9]" />
            </div>
            <div>
              <span className="text-xs font-black text-[#001D3B] uppercase tracking-wide">
                Grupos Personalizados de Simulação ({customGroups.length} ativo{customGroups.length === 1 ? '' : 's'})
              </span>
              <span className="text-[10px] text-slate-500 font-medium block">
                {customGroups.length === 0
                  ? 'Você pode marcar débitos e criar grupos para simulação unificada (ex: Grupo Previdenciário, Grupo Simples Nacional).'
                  : `${customGroups.length} grupo(s) consolidado(s) criado(s). Crie quantos grupos forem necessários para simular separadamente.`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Master Checkbox: Marcar todos os débitos para grupo */}
            {availableUngroupedCategories.length > 0 && (
              <label className="inline-flex items-center space-x-2 cursor-pointer bg-white hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 transition-colors shadow-xs">
                <input
                  type="checkbox"
                  checked={availableUngroupedCategories.length > 0 && 
                    availableUngroupedCategories.every(c => selectedCategoriesForGroup.includes(c))}
                  onChange={(e) => handleToggleSelectAll(e.target.checked)}
                  className="w-4 h-4 rounded text-[#3EA049] accent-[#3EA049] cursor-pointer"
                />
                <span className="text-[11px] font-black uppercase text-[#001D3B]">
                  Marcar todos ({availableUngroupedCategories.length})
                </span>
              </label>
            )}

            {/* Botão Novo Grupo (abre modal com lista completa) */}
            <button
              onClick={() => handleOpenCreateGroup()}
              className="px-3.5 py-1.5 bg-[#001D3B] hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 text-[#3EA049]" />
              <span>Criar Grupo</span>
            </button>
          </div>
        </div>

        {/* Floating/Inline Creation Banner when categories are checked via checkboxes */}
        {selectedCategoriesForGroup.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 p-3 rounded-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 animate-in fade-in duration-150">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="p-1 bg-amber-400 text-slate-900 rounded-md shrink-0">
                <Layers className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-amber-950 uppercase">
                    {selectedCategoriesForGroup.length} categoria(s) selecionada(s)
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-amber-200/80 text-amber-950 px-2 py-0.5 rounded">
                    {selectedMetricsForGroup.count} débitos • {formatCurrency(selectedMetricsForGroup.total)}
                  </span>
                </div>
                <div className="text-[10px] text-amber-800 font-medium truncate">
                  {selectedCategoriesForGroup.join(' + ')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <input
                type="text"
                value={newGroupNameInput}
                onChange={(e) => setNewGroupNameInput(e.target.value)}
                placeholder="Nome do grupo (ex: Grupo Previdenciário)"
                className="px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs font-bold text-slate-800 uppercase placeholder:normal-case placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3EA049] flex-1 sm:w-64"
              />
              <button
                onClick={handleCreateGroupFromSelection}
                className="px-3.5 py-1.5 bg-[#3EA049] hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer shrink-0 shadow-xs"
              >
                Criar Grupo Agora
              </button>
              <button
                onClick={() => {
                  setSelectedCategoriesForGroup([]);
                  setNewGroupNameInput('');
                }}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer border border-amber-300 shrink-0"
              >
                Limpar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. MAIN DEBT LISTING WITH CONTEXTUAL SIMULATION */}
      <div className="space-y-6">
        {scopesToRender.map(scope => {
          const scopeDebts = filteredDebts.filter(d => {
            const cat = getCategoryByTitle(d.category);
            return cat.origin === scope.id;
          });

          const totalScope = scopeDebts.reduce((sum, item) => sum + item.total, 0);

          return (
            <div key={scope.id} className="space-y-4">
              
              {/* Scope Header Ribbon */}
              <div className="p-3.5 rounded-2xl bg-[#001D3B] text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-l-4 border-[#3EA049]">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-white/10 rounded-xl">
                    <scope.icon className="h-5 w-5 text-[#F1F5F9]" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
                      {scope.title}
                    </h3>
                    <p className="text-[10px] text-[#F1F5F9]/80 font-medium leading-tight">
                      {scope.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-start">
                  <span className="text-[10px] font-mono font-bold px-2 py-1 bg-white/10 rounded text-slate-200">
                    {scopeDebts.length} débito(s)
                  </span>
                  <span className="text-xs font-black text-[#F1F5F9] bg-black/30 border border-[#F1F5F9]/20 px-3 py-1 rounded-xl font-mono">
                    {formatCurrency(totalScope)}
                  </span>
                </div>
              </div>

              {/* Empty state or Organs list */}
              {scopeDebts.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-1 shadow-sm">
                  <CheckCircle className="h-8 w-8 text-[#3EA049] mb-1" />
                  <span className="font-bold text-slate-700 text-xs">Situação Fiscal Regularizada</span>
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

                    // Find which custom groups have debts in this organ
                    const organCustomGroups = (customGroups || []).filter(g =>
                      organDebts.some(d => g.categories.some(c => c.toLowerCase() === d.category.toLowerCase()))
                    );

                    // Collect all category titles (lowercase) that are inside custom groups
                    const groupedCategoryTitles = new Set(
                      organCustomGroups.flatMap(g => g.categories.map(c => c.toLowerCase()))
                    );

                    // Ungrouped categories to render as individual cards
                    const ungroupedCategories = organCategories.filter(
                      catTitle => !groupedCategoryTitles.has(catTitle.toLowerCase())
                    );

                    return (
                      <div key={organ.id} className="space-y-3.5 pl-2 sm:pl-3 border-l-2 border-slate-200">
                        
                        {/* Organ Sub-Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-slate-100/80 border border-slate-200 p-2.5 rounded-xl">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 bg-[#F1F5F9] text-[#001D3B] border border-slate-300 rounded-md text-[10px] font-black tracking-wider">
                              {organ.id}
                            </span>
                            <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                              {organ.title}
                            </span>
                          </div>
                          <span className="text-[11px] font-bold text-slate-500 font-mono self-start sm:self-auto pl-1 sm:pl-0">
                            Total {organ.id}: <strong className="text-[#001D3B]">{formatCurrency(organTotal)}</strong>
                          </span>
                        </div>

                        {/* Categories Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* 1. CONSOLIDATED CUSTOM GROUPS FIRST */}
                          {organCustomGroups.map(customGroup => {
                            const groupDebts = sortDebtsByCompetencia<DebtItem>(
                              organDebts.filter(d => customGroup.categories.some(c => c.toLowerCase() === d.category.toLowerCase()))
                            );
                            if (groupDebts.length === 0) return null;

                            const groupTotal = groupDebts.reduce((sum, item) => sum + item.total, 0);
                            const groupTargetKey = `custom_group:${customGroup.id}`;
                            const groupSim = linkedSimulations[groupTargetKey];
                            const isAnySimActiveInCustomGroup = activeSimulationTarget === groupTargetKey;

                            return (
                              <div 
                                key={customGroup.id} 
                                className={`bg-slate-50/70 rounded-3xl border-2 border-amber-300 shadow-md p-3.5 sm:p-4 space-y-4 lg:col-span-2 transition-all hover:border-amber-400 ${
                                  isAnySimActiveInCustomGroup ? 'ring-2 ring-amber-400/50' : ''
                                }`}
                              >
                                {/* 1. TOP BANNER WITH YELLOW/AMBER HIGHLIGHT MATCHING SPREADSHEET MOCKUP */}
                                <div className="bg-amber-300 text-slate-900 px-4 py-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs border border-amber-400">
                                  <div className="flex items-center space-x-2.5 min-w-0">
                                    <div className="p-1.5 bg-slate-900 text-amber-300 rounded-xl shrink-0">
                                      <Layers className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className="text-sm sm:text-base font-black uppercase tracking-wider truncate text-slate-950">
                                        {customGroup.name.toUpperCase().startsWith('GRUPO') ? `${customGroup.name}:` : `Grupo ${customGroup.name}:`}
                                      </h4>
                                      <div className="text-[10px] text-slate-800 font-bold flex items-center gap-1.5 flex-wrap">
                                        <span>Classificações agrupadas:</span>
                                        {customGroup.categories.map((c, i) => (
                                          <span key={i} className="px-1.5 py-0.5 bg-amber-400/80 rounded text-slate-900 text-[9px] font-black uppercase">
                                            {c}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between sm:justify-end shrink-0">
                                    {/* Botão Simular Parcelamento do Grupo */}
                                    <button
                                      onClick={() => handleOpenGroupSimulation(customGroup, groupTotal)}
                                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                                        groupSim
                                          ? 'bg-slate-900 text-white hover:bg-slate-800'
                                          : 'bg-white text-slate-900 hover:bg-slate-100 border border-slate-300'
                                      }`}
                                      title={groupSim ? 'Simulação de Grupo Salva - Clique para Editar' : 'Simular parcelamento unificado deste grupo'}
                                    >
                                      <TrendingUp className="h-3.5 w-3.5 text-[#3EA049]" />
                                      <span>{groupSim ? `${groupSim.installmentsCount}x de ${formatCurrency(groupSim.avgInstallment)}` : 'Simular Parcelamento'}</span>
                                    </button>

                                    {/* Editar Categorias do Grupo */}
                                    <button
                                      onClick={() => handleEditCustomGroup(customGroup)}
                                      className="p-1.5 bg-white/80 hover:bg-white text-slate-800 rounded-xl transition-colors cursor-pointer border border-amber-400/60"
                                      title="Editar categorias do grupo"
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </button>

                                    {/* Desagrupar */}
                                    {onDeleteCustomGroup && (
                                      <button
                                        onClick={() => {
                                          if (confirm(`Deseja desagrupar "${customGroup.name}"? As categorias voltarão a ser exibidas separadamente.`)) {
                                            onDeleteCustomGroup(customGroup.id);
                                          }
                                        }}
                                        className="p-1.5 bg-white/80 hover:bg-rose-50 text-rose-600 rounded-xl transition-colors cursor-pointer border border-amber-400/60"
                                        title="Desagrupar categorias"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}

                                    {/* Total Grupo */}
                                    <span className="text-xs sm:text-sm font-black text-white bg-slate-900 px-3 py-1.5 rounded-xl font-mono shrink-0 shadow-sm">
                                      Total: {formatCurrency(groupTotal)}
                                    </span>
                                  </div>
                                </div>

                                {/* 2. SEPARATE CLASSIFICATION CARDS INSIDE THE GROUP (EXACTLY AS THE USER REQUESTED IN SPREADSHEET!) */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  {customGroup.categories.map(categoryTitle => {
                                    const categoryDebts = sortDebtsByCompetencia<DebtItem>(
                                      organDebts.filter(d => d.category.toLowerCase() === categoryTitle.toLowerCase())
                                    );
                                    if (categoryDebts.length === 0) return null;
                                    return renderCategoryCard(categoryTitle, categoryDebts, true, customGroup.id);
                                  })}
                                </div>

                                {/* 3. SIMULAÇÃO DE PARCELAMENTO BOX - Só aparece quando o usuário iniciar ou possuir uma simulação */}
                                {(groupSim || (activeSimulationTarget === groupTargetKey && simForm)) && (
                                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 animate-in fade-in duration-150">
                                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-3 flex-wrap gap-2">
                                      <div className="flex items-center space-x-2">
                                        <div className="p-1 bg-[#001D3B] text-white rounded-md">
                                          <Calculator className="h-3.5 w-3.5 text-[#F1F5F9]" />
                                        </div>
                                        <h5 className="text-xs font-black text-[#001D3B] uppercase tracking-wider">
                                          Simulação de Parcelamento • {customGroup.name}
                                        </h5>
                                      </div>

                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={() => handleOpenGroupSimulation(customGroup, groupTotal)}
                                          className="text-[10px] font-black text-[#001D3B] bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 uppercase"
                                          title="Ajustar parâmetros da simulação"
                                        >
                                          <Edit2 className="h-3 w-3" />
                                          <span>Ajustar Simulação</span>
                                        </button>

                                        {groupSim && (
                                          <button
                                            onClick={() => {
                                              onDeleteSimulation(groupTargetKey);
                                              if (activeSimulationTarget === groupTargetKey) {
                                                setActiveSimulationTarget(null);
                                                setSimForm(null);
                                              }
                                            }}
                                            className="text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 uppercase"
                                            title="Excluir simulação deste grupo"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                            <span>Excluir</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* If inline simulation editor is open for this custom group */}
                                    {activeSimulationTarget === groupTargetKey && simForm ? (
                                      <div className="pt-1 pb-2">
                                        <InlineSimulationEditor
                                          simForm={simForm}
                                          setSimForm={setSimForm}
                                          availableTypes={availableParcelamentoTypes}
                                          onSave={handleSaveCurrentSimulation}
                                          onCancel={() => {
                                            setActiveSimulationTarget(null);
                                            setSimForm(null);
                                          }}
                                          onDelete={() => {
                                            onDeleteSimulation(groupTargetKey);
                                            setActiveSimulationTarget(null);
                                            setSimForm(null);
                                          }}
                                          hasExistingSimulation={!!groupSim}
                                        />
                                      </div>
                                    ) : groupSim ? (
                                      <SimulationProposalCard
                                        title={`Simulação de Parcelamento • ${customGroup.name}`}
                                        sim={groupSim}
                                        onEdit={() => handleOpenGroupSimulation(customGroup, groupTotal)}
                                        onDelete={() => {
                                          onDeleteSimulation(groupTargetKey);
                                          if (activeSimulationTarget === groupTargetKey) {
                                            setActiveSimulationTarget(null);
                                            setSimForm(null);
                                          }
                                        }}
                                        hideTopHeader={true}
                                      />
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* 2. UNGROUPED STANDARD CATEGORIES */}
                          {ungroupedCategories.map(categoryTitle => {
                            const categoryDebts = sortDebtsByCompetencia<DebtItem>(
                              organDebts.filter(d => d.category.toLowerCase() === categoryTitle.toLowerCase())
                            );
                            if (categoryDebts.length === 0) return null;
                            return renderCategoryCard(categoryTitle, categoryDebts, false);
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* GROUP DEBTS MODAL */}
      <GroupDebtsModal
        isOpen={isGroupModalOpen}
        onClose={() => {
          setIsGroupModalOpen(false);
          setEditingGroup(null);
          setInitialSelectedCategory(undefined);
        }}
        onSave={(group) => {
          if (onSaveCustomGroup) {
            onSaveCustomGroup(group);
          }
        }}
        onDelete={(groupId) => {
          if (onDeleteCustomGroup) {
            onDeleteCustomGroup(groupId);
          }
        }}
        editingGroup={editingGroup}
        initialSelectedCategory={initialSelectedCategory}
        debts={debts}
        categories={categories}
        existingGroups={customGroups}
      />

    </div>
  );
};

/**
 * Card visual de Simulação de Parcelamento
 * Utiliza a mesma estrutura do relatório PDF gerado:
 * - Forma de pagamento | Quantidade | Valor
 * - Entrada: 1x (À vista) ou parcelada | R$ ...
 * - Parcela: Nx | R$ ...
 * - Total: R$ ...
 */
interface SimulationProposalCardProps {
  title: string;
  sim: DebtSimulationLink;
  onEdit: () => void;
  onDelete: () => void;
  hideTopHeader?: boolean;
}

const SimulationProposalCard: React.FC<SimulationProposalCardProps> = ({
  title,
  sim,
  onEdit,
  onDelete,
  hideTopHeader = false
}) => {
  const totalDown = sim.totalDown ?? sim.downPayment ?? 0;
  const qtdEntrada = sim.isDownPaymentInstallment
    ? `${sim.downPaymentInstallmentsCount || 12}x (Parcelada)`
    : (totalDown > 0 ? '1x (À vista)' : '0x (Sem Entrada)');

  const valEntrada = sim.isDownPaymentInstallment
    ? formatCurrency(sim.downPaymentInstallmentValue || (totalDown / (sim.downPaymentInstallmentsCount || 12)))
    : formatCurrency(totalDown);

  const totalCalculated = sim.totalPaid || (totalDown + (sim.installmentsCount * (sim.avgInstallment || 0)));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col border-l-4 border-l-[#3EA049]">
      {/* Header com Título e Botões de Ação */}
      {!hideTopHeader && (
        <div className="px-3.5 py-2.5 sm:px-4 flex items-center justify-between gap-2 bg-slate-50/90 border-b border-slate-200 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1 bg-[#001D3B] text-white rounded-md shrink-0">
              <Calculator className="h-3.5 w-3.5" />
            </div>
            <h5 className="text-xs font-black text-[#001D3B] uppercase tracking-wide truncate">
              {title}
            </h5>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onEdit}
              className="text-[10px] font-black text-[#001D3B] bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 uppercase shadow-2xs"
              title="Ajustar simulação"
            >
              <Edit2 className="h-3 w-3 text-slate-500" />
              <span>Ajustar Simulação</span>
            </button>
            <button
              onClick={onDelete}
              className="text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 uppercase"
              title="Excluir simulação"
            >
              <Trash2 className="h-3 w-3" />
              <span>Excluir</span>
            </button>
          </div>
        </div>
      )}

      {/* Mini-Tabela Estruturada igual ao PDF */}
      <div className="p-3 sm:p-4 bg-white">
        <div className="rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#04243b] text-white text-[10px] uppercase font-bold tracking-wider">
                <th className="py-2.5 px-3.5 text-left">Forma de pagamento</th>
                <th className="py-2.5 px-3.5 text-center sm:text-left">Quantidade</th>
                <th className="py-2.5 px-3.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white font-medium">
              <tr className="hover:bg-slate-50/60 transition-colors">
                <td className="py-2.5 px-3.5 font-bold text-[#001D3B] whitespace-nowrap">Entrada</td>
                <td className="py-2.5 px-3.5 text-center sm:text-left text-slate-700 whitespace-nowrap">
                  {qtdEntrada}
                </td>
                <td className="py-2.5 px-3.5 text-right font-black text-[#001D3B] font-mono whitespace-nowrap">
                  {valEntrada}
                </td>
              </tr>
              <tr className="hover:bg-slate-50/60 transition-colors">
                <td className="py-2.5 px-3.5 font-bold text-[#001D3B] whitespace-nowrap">Parcela</td>
                <td className="py-2.5 px-3.5 text-center sm:text-left text-slate-700 whitespace-nowrap">
                  {sim.installmentsCount}x
                </td>
                <td className="py-2.5 px-3.5 text-right font-black text-[#001D3B] font-mono whitespace-nowrap">
                  {formatCurrency(sim.avgInstallment)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Rodapé com Total em destaque à direita */}
        <div className="mt-2.5 pt-2 flex items-center justify-end gap-2 text-right">
          <span className="text-xs sm:text-sm font-black text-[#001D3B]">Total:</span>
          <span className="text-sm sm:text-base font-black text-[#001D3B] font-mono">
            {formatCurrency(totalCalculated)}
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * Editor inline integrado de simulação de parcelamento
 * Mantém exatamente as informações e formulários existentes anteriormente na função original de simulação:
 * - Tributo / Modalidade
 * - Valor Total Atualizado
 * - Forma de Pagamento da Entrada (À Vista ou Parcelada)
 * - Parcelamento do Saldo (Parcela)
 * - Tabela com Forma de pagamento, Quantidade e Valor
 * Sem prazos 12x/24x/36x, sem cronograma mensal e sem Selic.
 */
interface InlineSimulationEditorProps {
  simForm: any;
  setSimForm: React.Dispatch<React.SetStateAction<any>>;
  availableTypes: string[];
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  hasExistingSimulation: boolean;
}

const InlineSimulationEditor: React.FC<InlineSimulationEditorProps> = ({
  simForm,
  setSimForm,
  availableTypes,
  onSave,
  onCancel,
  onDelete,
  hasExistingSimulation
}) => {
  // Executa o cálculo com os dados atuais do formulário
  const results = useMemo(() => {
    return getSimulationResults(simForm);
  }, [
    simForm.totalDebt,
    simForm.downPayment,
    simForm.isDownPaymentInstallment,
    simForm.downPaymentInstallmentsCount,
    simForm.downPaymentInstallmentValue,
    simForm.installmentsCount,
    simForm.installmentValue
  ]);

  return (
    <div className="bg-white border-2 border-[#04243b]/20 rounded-2xl p-4 shadow-md space-y-4">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-[#04243b] text-[#e4b35e] rounded-lg">
            <Calculator className="h-4 w-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm text-[#04243b] uppercase tracking-wide">
              {simForm.title}
            </h4>
            <p className="text-[10px] text-slate-500 font-medium">
              Simulação de parcelamento vinculada diretamente a este item
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
            Débito: {formatCurrency(simForm.totalDebt)}
          </span>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            title="Fechar simulação sem salvar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid Inputs & Results Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left: Input Parameters (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Modalidade / Tributo Selector */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
              Tributo / Modalidade do Parcelamento
            </label>
            <select
              value={simForm.parcelamentoType}
              onChange={(e) => setSimForm((prev: any) => ({ ...prev, parcelamentoType: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-[#001D3B] focus:outline-none focus:ring-1 focus:ring-[#e4b35e] cursor-pointer"
            >
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Valor Total Atualizado */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
              Valor Total Atualizado (R$)
            </label>
            <FormattedCurrencyInput
              value={simForm.totalDebt}
              onChange={(val) => setSimForm((prev: any) => ({ ...prev, totalDebt: Math.max(0, val) }))}
              placeholder="Ex: R$ 34.250,25"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#001D3B] focus:outline-none focus:ring-1 focus:ring-[#e4b35e]"
            />
          </div>

          {/* Down Payment (Forma de Pagamento da Entrada) */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <label className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider block">
              Forma de Pagamento da Entrada
            </label>
            
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setSimForm((prev: any) => ({ ...prev, isDownPaymentInstallment: false }))}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  !simForm.isDownPaymentInstallment 
                    ? 'bg-white text-[#001D3B] shadow-xs' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                À Vista (1x)
              </button>
              <button
                type="button"
                onClick={() => setSimForm((prev: any) => ({ 
                  ...prev, 
                  isDownPaymentInstallment: true,
                  downPaymentInstallmentsCount: prev.downPaymentInstallmentsCount || 12 
                }))}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  simForm.isDownPaymentInstallment 
                    ? 'bg-[#001D3B] text-[#F1F5F9] shadow-xs' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Entrada Parcelada
              </button>
            </div>

            {!simForm.isDownPaymentInstallment ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Valor da Entrada À Vista (R$)
                </label>
                <FormattedCurrencyInput
                  value={simForm.downPayment}
                  onChange={(val) => setSimForm((prev: any) => ({ ...prev, downPayment: Math.max(0, val) }))}
                  placeholder="Ex: R$ 3.000,00"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-700 focus:outline-none focus:ring-1 focus:ring-[#e4b35e]"
                />
              </div>
            ) : (
              <div className="space-y-2 bg-amber-50/50 p-3 rounded-xl border border-amber-200/70">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1 whitespace-nowrap">
                      Nº Parcelas Entrada
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={simForm.downPaymentInstallmentsCount ? simForm.downPaymentInstallmentsCount : ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        const count = raw ? parseInt(raw, 10) : 1;
                        setSimForm((prev: any) => ({
                          ...prev,
                          downPaymentInstallmentsCount: count,
                          downPayment: (prev.downPaymentInstallmentValue || 0) * count
                        }));
                      }}
                      placeholder="Ex: 12"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#001D3B] focus:outline-none focus:ring-1 focus:ring-[#e4b35e]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1 whitespace-nowrap">
                      Valor Parcela Entrada
                    </label>
                    <FormattedCurrencyInput
                      value={simForm.downPaymentInstallmentValue || 0}
                      onChange={(val) => setSimForm((prev: any) => ({
                        ...prev,
                        downPaymentInstallmentValue: val,
                        downPayment: val * (prev.downPaymentInstallmentsCount || 12)
                      }))}
                      placeholder="Ex: R$ 260,50"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-700 focus:outline-none focus:ring-1 focus:ring-[#e4b35e]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Installments (Parcelamento do Saldo - Parcela) */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <label className="text-[11px] font-black text-[#001D3B] uppercase tracking-wider block">
              Parcelamento do Saldo (Parcela)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1 whitespace-nowrap">
                  Nº de Parcelas
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={simForm.installmentsCount ? simForm.installmentsCount : ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    const val = raw ? parseInt(raw, 10) : 0;
                    setSimForm((prev: any) => ({ ...prev, installmentsCount: Math.min(240, val) }));
                  }}
                  placeholder="Ex: 60"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#001D3B] focus:outline-none focus:ring-1 focus:ring-[#e4b35e]"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1 whitespace-nowrap">
                  Valor da Parcela
                </label>
                <FormattedCurrencyInput
                  value={simForm.installmentValue || 0}
                  onChange={(val) => setSimForm((prev: any) => ({ ...prev, installmentValue: Math.max(0, val) }))}
                  placeholder="Ex: R$ 236,25"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#001D3B] focus:outline-none focus:ring-1 focus:ring-[#e4b35e]"
                />
              </div>
            </div>
          </div>

        </div>

        {/* Right: Breakdown Table & Projections (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4 bg-slate-50 border border-slate-200 rounded-2xl p-4.5">
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
              <Layers className="h-4 w-4 text-[#3EA049]" />
              <h5 className="text-[11px] font-black text-[#001D3B] uppercase tracking-wider">
                Resultado da Projeção
              </h5>
            </div>

            {/* Exact Breakdown Table from Previous Simulator */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 text-[10px] uppercase tracking-wider font-extrabold">
                    <th className="py-2.5 px-3 text-left whitespace-nowrap">Forma de pagamento</th>
                    <th className="py-2.5 px-3 text-center whitespace-nowrap">Quantidade</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-700 whitespace-nowrap">Entrada</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-600 font-bold whitespace-nowrap">
                      {results.isParcelada ? `${results.entradaQtd}x` : '1x (À vista)'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-bold whitespace-nowrap">
                      {formatCurrency(results.entradaVal)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-700 whitespace-nowrap">Parcela</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-600 font-bold whitespace-nowrap">
                      {simForm.installmentsCount || 0}x
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#001D3B] font-bold whitespace-nowrap">
                      {formatCurrency(results.avgInstallment)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Total projection box */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="text-slate-600 font-medium whitespace-nowrap">Saldo Amortizado:</span>
                <span className="font-mono font-bold text-slate-800 text-xs sm:text-sm whitespace-nowrap">
                  {formatCurrency(results.financedAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-xs pt-2.5 border-t border-slate-100">
                <span className="text-[#001D3B] font-black text-xs sm:text-sm whitespace-nowrap">Total:</span>
                <span className="font-mono font-black text-[#001D3B] text-sm sm:text-base whitespace-nowrap">
                  {formatCurrency(results.totalPaid)}
                </span>
              </div>
              {results.isParcelada && (
                <div className="text-[10px] text-slate-500 text-right pt-0.5 whitespace-nowrap font-medium">
                  (Total Entrada: {formatCurrency(results.totalDown)})
                </div>
              )}
            </div>

            <div className="bg-[#001D3B]/5 p-3 rounded-xl border border-[#001D3B]/10 text-[10px] text-[#001D3B] leading-relaxed flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-[#3EA049] shrink-0 mt-0.5" />
              <div>
                Simulação mantida no padrão original, associando os parâmetros deste débito para composição dos relatórios executivos.
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Action Buttons */}
      <div className="pt-3 border-t border-slate-150 flex flex-wrap items-center justify-end gap-2">
        {hasExistingSimulation && (
          <button
            type="button"
            onClick={onDelete}
            className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-all cursor-pointer mr-auto border border-red-200"
            title="Desvincular simulação deste débito"
          >
            <Trash2 className="h-3.5 w-3.5 inline mr-1" />
            Desvincular
          </button>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
        >
          Cancelar
        </button>

        <button
          type="button"
          onClick={onSave}
          className="px-4 py-2 bg-[#3EA049] hover:bg-[#32853c] text-white rounded-xl text-xs font-black shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <Check className="h-3.5 w-3.5" />
          <span>Salvar Vinculado ao Débito</span>
        </button>
      </div>

    </div>
  );
};
