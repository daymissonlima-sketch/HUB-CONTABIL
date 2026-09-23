/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * GroupDebtsModal.tsx
 * Modal para agrupar conjuntos de débitos fiscais (ex: DAS Simples Nacional + Parcelamento Simples Nacional)
 * em uma única entidade consolidada para visualização agrupada e simulação única de parcelamento.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Layers, 
  Check, 
  AlertCircle, 
  Trash2, 
  Calculator,
  ShieldCheck,
  TrendingUp
} from 'lucide-react';
import { DebtItem, DebtCategory, DebtCustomGroup } from '../types_debits';
import { formatCurrency } from '../services/InstallmentService';

interface GroupDebtsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (group: DebtCustomGroup) => void;
  onDelete?: (groupId: string) => void;
  editingGroup?: DebtCustomGroup | null;
  initialSelectedCategory?: string;
  debts: DebtItem[];
  categories: DebtCategory[];
  existingGroups?: DebtCustomGroup[];
}

export const GroupDebtsModal: React.FC<GroupDebtsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  editingGroup,
  initialSelectedCategory,
  debts,
  categories,
  existingGroups = []
}) => {
  const [groupName, setGroupName] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Group unique categories available in the current debts list
  const availableCategories = useMemo(() => {
    const uniqueTitles = Array.from(new Set(debts.map(d => d.category))) as string[];
    return uniqueTitles.map(title => {
      const catDebts = debts.filter(d => d.category.toLowerCase() === title.toLowerCase());
      const catTotal = catDebts.reduce((sum, d) => sum + d.total, 0);
      const catPrincipal = catDebts.reduce((sum, d) => sum + d.principal, 0);
      const foundCat = categories.find(c => c.title.toLowerCase() === title.toLowerCase());
      const assignedGroup = existingGroups.find(g => 
        g.id !== editingGroup?.id && g.categories.some(c => c.toLowerCase() === title.toLowerCase())
      );

      return {
        title,
        debtsCount: catDebts.length,
        total: catTotal,
        principal: catPrincipal,
        origin: foundCat?.origin || 'FEDERAL',
        documentType: foundCat?.documentType || 'DARF',
        categoryType: foundCat?.categoryType || 'TRIBUTO',
        assignedToOtherGroup: assignedGroup?.name
      };
    });
  }, [debts, categories, existingGroups, editingGroup]);

  // Sync state when modal opens or editingGroup changes
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);

    if (editingGroup) {
      setGroupName(editingGroup.name);
      setSelectedCategories([...editingGroup.categories]);
    } else {
      if (initialSelectedCategory) {
        setSelectedCategories([initialSelectedCategory]);
        // Suggest automatic name based on category
        const upper = initialSelectedCategory.toUpperCase();
        if (upper.includes('PREVIDENCIÁR') || upper.includes('PREVIDENCIAR')) {
          setGroupName('GRUPO PREVIDENCIÁRIO');
          const related = availableCategories.find(c =>
            c.title.toUpperCase().includes('PREVIDENCI') && c.title !== initialSelectedCategory && !c.assignedToOtherGroup
          );
          if (related) {
            setSelectedCategories([initialSelectedCategory, related.title]);
          }
        } else if (upper.includes('SIMPLES')) {
          setGroupName('GRUPO SIMPLES NACIONAL');
          const relatedParcel = availableCategories.find(c => 
            c.title.toUpperCase().includes('SIMPLES') && 
            c.title.toUpperCase().includes('PARCEL') &&
            c.title !== initialSelectedCategory &&
            !c.assignedToOtherGroup
          );
          if (relatedParcel) {
            setSelectedCategories([initialSelectedCategory, relatedParcel.title]);
          }
        } else {
          setGroupName(`GRUPO: ${initialSelectedCategory}`);
        }
      } else {
        // Default: unselected, ready for user choice
        setSelectedCategories([]);
        setGroupName('');
      }
    }
  }, [isOpen, editingGroup, initialSelectedCategory, availableCategories]);

  // Calculated metrics for selected categories
  const selectedMetrics = useMemo(() => {
    const includedDebts = debts.filter(d => 
      selectedCategories.some(c => c.toLowerCase() === d.category.toLowerCase())
    );
    const totalAmount = includedDebts.reduce((sum, d) => sum + d.total, 0);
    const principalAmount = includedDebts.reduce((sum, d) => sum + d.principal, 0);

    return {
      debtsCount: includedDebts.length,
      totalAmount,
      principalAmount
    };
  }, [debts, selectedCategories]);

  if (!isOpen) return null;

  const toggleCategory = (title: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(title)) {
        return prev.filter(c => c !== title);
      } else {
        const next = [...prev, title];
        // Auto-generate name if empty
        if (!groupName.trim()) {
          if (next.some(c => c.toUpperCase().includes('SIMPLES'))) {
            setGroupName('SIMPLES NACIONAL CONSOLIDADO (DAS + PARCELAMENTOS)');
          } else {
            setGroupName(`GRUPO CONSOLIDADO (${next.length} CATEGORIAS)`);
          }
        }
        return next;
      }
    });
  };

  const handleSave = () => {
    if (!groupName.trim()) {
      setErrorMsg('Informe um nome descritivo para o grupo consolidado.');
      return;
    }
    if (selectedCategories.length < 2) {
      setErrorMsg('Selecione pelo menos 2 categorias para formar um grupo consolidado.');
      return;
    }

    const payload: DebtCustomGroup = {
      id: editingGroup ? editingGroup.id : ('grp_' + Date.now()),
      name: groupName.trim().toUpperCase(),
      categories: selectedCategories,
      createdAt: editingGroup?.createdAt || new Date().toISOString()
    };

    onSave(payload);
    onClose();
  };

  const handleDelete = () => {
    if (!editingGroup || !onDelete) return;
    if (confirm(`Deseja realmente desagrupar "${editingGroup.name}"? As categorias voltarão a ser exibidas separadamente.`)) {
      onDelete(editingGroup.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Ribbon */}
        <div className="bg-[#001D3B] text-white p-4 sm:p-5 flex items-center justify-between border-b-4 border-[#3EA049]">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[#3EA049] text-white rounded-2xl shadow-sm">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight text-white uppercase">
                {editingGroup ? 'Editar Grupo Consolidado' : 'Agrupar Débitos para Simulação Unificada'}
              </h3>
              <p className="text-xs text-[#F1F5F9]/90 font-medium">
                Una diferentes origens fiscais (ex: DAS declarados + parcelas não pagas) em uma só simulação
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Group Name Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
              Nome do Grupo Consolidado <span className="text-rose-500">*</span>
            </label>
            <input 
              type="text"
              value={groupName}
              onChange={(e) => {
                setGroupName(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="Ex: SIMPLES NACIONAL CONSOLIDADO (DAS + PARCELAMENTOS)"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-[#001D3B] uppercase placeholder:normal-case placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3EA049] focus:bg-white transition-all"
            />
            <p className="text-[10px] text-slate-400 font-medium">
              Este nome identificará o bloco unificado na lista e no relatório em PDF exportado.
            </p>
          </div>

          {/* Categories Multi-Select List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                Categorias a Incluir no Grupo <span className="text-rose-500">*</span>
              </label>

              {/* Master Checkbox: Marcar todos os débitos */}
              {availableCategories.length > 0 && (
                <label className="inline-flex items-center space-x-2 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors">
                  <input 
                    type="checkbox"
                    checked={availableCategories.filter(c => !c.assignedToOtherGroup).length > 0 && 
                      availableCategories.filter(c => !c.assignedToOtherGroup).every(c => selectedCategories.includes(c.title))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const selectable = availableCategories
                          .filter(c => !c.assignedToOtherGroup)
                          .map(c => c.title);
                        setSelectedCategories(selectable);
                        if (!groupName.trim()) {
                          setGroupName(`GRUPO CONSOLIDADO (${selectable.length} CATEGORIAS)`);
                        }
                      } else {
                        setSelectedCategories([]);
                      }
                      if (errorMsg) setErrorMsg(null);
                    }}
                    className="w-4 h-4 rounded text-[#3EA049] accent-[#3EA049] cursor-pointer"
                  />
                  <span className="text-[11px] font-black text-[#001D3B] uppercase tracking-wide">
                    Marcar todos os débitos ({availableCategories.filter(c => !c.assignedToOtherGroup).length})
                  </span>
                </label>
              )}

              <span className="text-[11px] font-bold text-slate-500 font-mono">
                {selectedCategories.length} selecionada(s)
              </span>
            </div>

            <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-64 overflow-y-auto bg-slate-50/50">
              {availableCategories.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 font-medium">
                  Nenhuma categoria com débitos em aberto encontrada.
                </div>
              ) : (
                availableCategories.map(cat => {
                  const isSelected = selectedCategories.includes(cat.title);
                  const isOtherGroup = !!cat.assignedToOtherGroup;

                  return (
                    <div 
                      key={cat.title}
                      onClick={() => toggleCategory(cat.title)}
                      className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-emerald-50/80 hover:bg-emerald-50' 
                          : isOtherGroup
                          ? 'bg-slate-50/50 hover:bg-slate-100/70'
                          : 'hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                          isSelected 
                            ? 'bg-[#3EA049] border-[#3EA049] text-white shadow-xs' 
                            : 'bg-white border-slate-300'
                        }`}>
                          {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-black uppercase tracking-wide block truncate ${
                              isSelected ? 'text-[#001D3B]' : 'text-slate-700'
                            }`}>
                              {cat.title}
                            </span>
                            {isOtherGroup && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[8px] font-black uppercase">
                                Em: {cat.assignedToOtherGroup}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {cat.debtsCount} débito(s) • {cat.origin} ({cat.documentType})
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`text-xs font-black font-mono block ${
                          isSelected ? 'text-[#3EA049]' : 'text-slate-700'
                        }`}>
                          {formatCurrency(cat.total)}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          Orig: {formatCurrency(cat.principal)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Consolidated Group Preview Card */}
          <div className="bg-gradient-to-br from-slate-900 to-[#001D3B] text-white p-4 rounded-2xl shadow-sm border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[#F1F5F9] text-[10px] font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5 text-[#3EA049]" />
                Impacto da Simulação Unificada
              </span>
              <span className="bg-[#3EA049] text-white px-2 py-0.5 rounded text-[9px] font-black">
                {selectedMetrics.debtsCount} débitos consolidados
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div>
                <span className="text-[10px] text-slate-300 block">Total Consolidado para Simulação</span>
                <span className="text-xl sm:text-2xl font-black text-[#F1F5F9] font-mono">
                  {formatCurrency(selectedMetrics.totalAmount)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-300 block">Valor Original Acumulado</span>
                <span className="text-xs font-bold text-slate-200 font-mono">
                  {formatCurrency(selectedMetrics.principalAmount)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-white/10 text-[10px] text-[#F1F5F9]/80 flex items-center justify-between">
              <span>Categorias: <strong>{selectedCategories.length}</strong></span>
              <span className="text-emerald-300 font-medium">✓ Permite proposta e parcelamento únicos</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div>
            {editingGroup && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>Desagrupar</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-200/70 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2.5 bg-[#3EA049] hover:bg-[#34883e] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            >
              <Check className="h-4 w-4 stroke-[3]" />
              <span>Salvar Grupo Consolidado</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
