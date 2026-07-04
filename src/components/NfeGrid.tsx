/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ArrowUpDown, 
  Download, 
  Search, 
  Filter, 
  X, 
  Check, 
  Edit2, 
  Settings, 
  Plus, 
  Trash2, 
  LayoutGrid,
  Percent,
  Coins,
  FileSpreadsheet,
  Info
} from 'lucide-react';
import { NFeItemRow, SortConfig, GridFilters } from '../types';
import { Company } from '../types_debits';
import importedCompaniesJson from '../data/imported_companies.json';

interface NFeGridProps {
  rows: NFeItemRow[];
  onRowUpdate: (updatedRow: NFeItemRow) => void;
  onExport: (exportedRows: NFeItemRow[], visibleColumns: string[], reportName: string) => void;
}

// Category definition for NFe columns
export interface ColumnDefinition {
  key: keyof NFeItemRow;
  label: string;
  category: 'Identificação' | 'Dados do Item' | 'ICMS / ICMS ST' | 'IPI' | 'PIS / COFINS' | 'IBS / CBS' | 'Informações Complementares';
}

const ALL_COLUMNS: ColumnDefinition[] = [
  // 1. Identificação
  { key: 'chNFe', label: 'Chave de Acesso', category: 'Identificação' },
  { key: 'nNF', label: 'Número NFe', category: 'Identificação' },
  { key: 'serie', label: 'Série', category: 'Identificação' },
  { key: 'modelo', label: 'Modelo', category: 'Identificação' },
  { key: 'dhEmi', label: 'Data Emissão', category: 'Identificação' },
  { key: 'emitCNPJ', label: 'CNPJ Emitente', category: 'Identificação' },
  { key: 'emitNome', label: 'Emitente Razão Social', category: 'Identificação' },
  { key: 'destCNPJ', label: 'CNPJ Destinatário', category: 'Identificação' },
  { key: 'destNome', label: 'Destinatário Razão Social', category: 'Identificação' },

  // 2. Dados do Item
  { key: 'nItem', label: 'Item Nº', category: 'Dados do Item' },
  { key: 'cProd', label: 'Código', category: 'Dados do Item' },
  { key: 'xProd', label: 'Descrição', category: 'Dados do Item' },
  { key: 'NCM', label: 'NCM', category: 'Dados do Item' },
  { key: 'CFOP', label: 'CFOP', category: 'Dados do Item' },
  { key: 'uCom', label: 'Unid', category: 'Dados do Item' },
  { key: 'qCom', label: 'Qtd', category: 'Dados do Item' },
  { key: 'vUnCom', label: 'Valor Unitário', category: 'Dados do Item' },
  { key: 'vProd', label: 'Valor Total Item', category: 'Dados do Item' },

  // 3. ICMS / ICMS ST
  { key: 'cstICMS', label: 'CST ICMS', category: 'ICMS / ICMS ST' },
  { key: 'vBC_ICMS', label: 'BC ICMS', category: 'ICMS / ICMS ST' },
  { key: 'pICMS', label: 'Alíquota ICMS %', category: 'ICMS / ICMS ST' },
  { key: 'vICMS', label: 'Valor ICMS', category: 'ICMS / ICMS ST' },
  { key: 'vBCST', label: 'BC ICMS ST', category: 'ICMS / ICMS ST' },
  { key: 'pICMSST', label: 'Alíquota ICMS ST %', category: 'ICMS / ICMS ST' },
  { key: 'vICMSST', label: 'Valor ICMS ST', category: 'ICMS / ICMS ST' },

  // 4. IPI
  { key: 'cstIPI', label: 'CST IPI', category: 'IPI' },
  { key: 'vBC_IPI', label: 'BC IPI', category: 'IPI' },
  { key: 'pIPI', label: 'Alíquota IPI %', category: 'IPI' },
  { key: 'vIPI', label: 'Valor IPI', category: 'IPI' },

  // 5. PIS / COFINS
  { key: 'cstPIS', label: 'CST PIS', category: 'PIS / COFINS' },
  { key: 'vBC_PIS', label: 'BC PIS', category: 'PIS / COFINS' },
  { key: 'pPIS', label: 'Alíquota PIS %', category: 'PIS / COFINS' },
  { key: 'vPIS', label: 'Valor PIS', category: 'PIS / COFINS' },
  { key: 'cstCOFINS', label: 'CST COFINS', category: 'PIS / COFINS' },
  { key: 'vBC_COFINS', label: 'BC COFINS', category: 'PIS / COFINS' },
  { key: 'pCOFINS', label: 'Alíquota COFINS %', category: 'PIS / COFINS' },
  { key: 'vCOFINS', label: 'Valor COFINS', category: 'PIS / COFINS' },

  // 6. IBS / CBS (Tax Reform)
  { key: 'cClassTrib', label: 'cClassTrib', category: 'IBS / CBS' },
  { key: 'cstIBS', label: 'CST IBS', category: 'IBS / CBS' },
  { key: 'vBC_IBS', label: 'BC IBS', category: 'IBS / CBS' },
  { key: 'pIBSUF', label: 'Alíquota IBS UF %', category: 'IBS / CBS' },
  { key: 'vIBSUF', label: 'Valor IBS UF', category: 'IBS / CBS' },
  { key: 'pIBSMun', label: 'Alíquota IBS Mun %', category: 'IBS / CBS' },
  { key: 'vIBSMun', label: 'Valor IBS Mun', category: 'IBS / CBS' },
  { key: 'pIBS', label: 'Alíquota IBS %', category: 'IBS / CBS' },
  { key: 'vIBS', label: 'Valor IBS', category: 'IBS / CBS' },
  { key: 'cstCBS', label: 'CST CBS', category: 'IBS / CBS' },
  { key: 'vBC_CBS', label: 'BC CBS', category: 'IBS / CBS' },
  { key: 'pCBS', label: 'Alíquota CBS %', category: 'IBS / CBS' },
  { key: 'vCBS', label: 'Valor CBS', category: 'IBS / CBS' },

  // 7. Informações Complementares
  { key: 'infAdic', label: 'Informações Complementares', category: 'Informações Complementares' },
  { key: 'infAdFisco', label: 'Informações de Interesse do Fisco', category: 'Informações Complementares' }
];

export interface ColumnPresetGroup {
  id: string;
  name: string;
  columns: (keyof NFeItemRow)[];
  isCustom?: boolean;
}

const DEFAULT_PRESETS: ColumnPresetGroup[] = [
  {
    id: 'padrao',
    name: 'Relatório Padrão',
    columns: [
      'nNF', 'serie', 'modelo', 'dhEmi', 'emitNome', 'destNome',
      'nItem', 'cProd', 'xProd', 'NCM', 'CFOP', 'uCom', 'qCom', 'vUnCom', 'vProd',
      'cstICMS', 'vBC_ICMS', 'pICMS', 'vICMS', 'cstPIS', 'vBC_PIS', 'pPIS', 'vPIS',
      'cstCOFINS', 'vBC_COFINS', 'pCOFINS', 'vCOFINS', 'infAdic', 'infAdFisco'
    ]
  },
  {
    id: 'ibscbs',
    name: 'Conferência IBS e CBS',
    columns: [
      'nNF', 'serie', 'modelo', 'dhEmi', 'emitNome',
      'nItem', 'cProd', 'xProd', 'NCM', 'CFOP', 'uCom', 'qCom', 'vUnCom', 'vProd',
      'cClassTrib', 'cstIBS', 'cstCBS', 'vBC_IBS', 'pIBSUF', 'vIBSUF', 'pIBSMun', 'vIBSMun', 'pIBS', 'vIBS',
      'vBC_CBS', 'pCBS', 'vCBS'
    ]
  },
  {
    id: 'icms_st',
    name: 'Conferência ICMS & ICMS ST',
    columns: [
      'nNF', 'serie', 'modelo', 'dhEmi', 'emitNome', 'xProd', 'CFOP', 'vProd',
      'cstICMS', 'vBC_ICMS', 'pICMS', 'vICMS', 'vBCST', 'pICMSST', 'vICMSST'
    ]
  },
  {
    id: 'tudo',
    name: 'Todos os Campos',
    columns: ALL_COLUMNS.map(c => c.key)
  }
];

const EDITABLE_FIELDS: Record<string, { type: 'text' | 'number'; step?: string }> = {
  cClassTrib: { type: 'text' },
  cstIBS: { type: 'text' },
  cstCBS: { type: 'text' },
  vBC_IBS: { type: 'number', step: '0.01' },
  pIBSUF: { type: 'number', step: '0.0001' },
  vIBSUF: { type: 'number', step: '0.01' },
  pIBSMun: { type: 'number', step: '0.0001' },
  vIBSMun: { type: 'number', step: '0.01' },
  pIBS: { type: 'number', step: '0.01' },
  vBC_CBS: { type: 'number', step: '0.01' },
  pCBS: { type: 'number', step: '0.01' },
};

export function NfeGrid({ rows, onRowUpdate, onExport }: NFeGridProps) {
  // Sorting state
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: null, direction: 'asc' });

  // Filtering state
  const [filters, setFilters] = useState<GridFilters>({
    search: '',
    nNF: '',
    emitNome: '',
    NCM: '',
    CFOP: '',
  });

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  const [registeredCompanies, setRegisteredCompanies] = useState<Company[]>([]);

  useEffect(() => {
    const importedList = (importedCompaniesJson as unknown) as Company[];
    const stored = localStorage.getItem('moreira_lima_companies');
    let mergedCompanies: Company[] = [...importedList];
    if (stored) {
      try {
        const parsed = (JSON.parse(stored) as Company[]).filter(c => !c.id.startsWith('demo-'));
        const existingCnpjs = new Set(parsed.map(c => c.cnpj.replace(/\D/g, '')));
        const newFromImport = importedList.filter(c => !existingCnpjs.has(c.cnpj.replace(/\D/g, '')));
        mergedCompanies = [...parsed, ...newFromImport];
      } catch (e) {
        console.error(e);
      }
    }
    mergedCompanies.sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '', 'pt-BR', { sensitivity: 'base' }));
    setRegisteredCompanies(mergedCompanies);
  }, []);

  // Column management states
  const [customPresets, setCustomPresets] = useState<ColumnPresetGroup[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>('ibscbs');
  const [newPresetName, setNewPresetName] = useState<string>('');
  
  const [visibleColumns, setVisibleColumns] = useState<(keyof NFeItemRow)[]>(() => {
    return DEFAULT_PRESETS[1].columns; // Default to 'ibscbs' columns as requested
  });

  // Cell editing state
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: keyof NFeItemRow } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Load custom configurations on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ml_custom_presets');
      if (stored) {
        setCustomPresets(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Erro ao ler presets customizados:', e);
    }
  }, []);

  // Save custom configurations when updated
  const saveCustomPresetsToStorage = (updated: ColumnPresetGroup[]) => {
    setCustomPresets(updated);
    try {
      localStorage.setItem('ml_custom_presets', JSON.stringify(updated));
    } catch (e) {
      console.error('Erro ao salvar presets customizados:', e);
    }
  };

  const handleHeaderDoubleClick = (column: keyof NFeItemRow) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.column === column && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ column, direction });
  };

  const handleFilterChange = (field: keyof GridFilters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      nNF: '',
      emitNome: '',
      NCM: '',
      CFOP: '',
    });
  };

  // Preset Selection Handler
  const handleApplyPreset = (preset: ColumnPresetGroup) => {
    setVisibleColumns(preset.columns);
    setActivePresetId(preset.id);
  };

  // Toggle single column visibility
  const handleToggleColumn = (colKey: keyof NFeItemRow) => {
    setVisibleColumns(prev => {
      const exists = prev.includes(colKey);
      const updated = exists 
        ? prev.filter(k => k !== colKey) 
        : [...prev, colKey];
      
      // Mark as personalized preset if it doesn't match a clean preset
      setActivePresetId('custom');
      return updated;
    });
  };

  // Save layout as a new named configuration group
  const handleCreateCustomPreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;

    const newPreset: ColumnPresetGroup = {
      id: `custom_${Date.now()}`,
      name: newPresetName.trim(),
      columns: [...visibleColumns],
      isCustom: true
    };

    const updated = [...customPresets, newPreset];
    saveCustomPresetsToStorage(updated);
    setActivePresetId(newPreset.id);
    setNewPresetName('');
  };

  const handleDeleteCustomPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPresets.filter(p => p.id !== id);
    saveCustomPresetsToStorage(updated);
    if (activePresetId === id) {
      setActivePresetId('ibscbs');
      setVisibleColumns(DEFAULT_PRESETS[1].columns);
    }
  };

  // Cell Edit Handlers
  const handleCellDoubleClick = (rowId: string, field: keyof NFeItemRow, currentValue: any) => {
    if (EDITABLE_FIELDS[field as string]) {
      setEditingCell({ rowId, field });
      setEditValue(currentValue?.toString() ?? '');
    }
  };

  const handleCellSave = (row: NFeItemRow) => {
    if (!editingCell) return;
    const { field } = editingCell;
    const updatedRow = { ...row };

    if (field === 'cClassTrib' || field === 'cstIBS' || field === 'cstCBS') {
      (updatedRow[field] as any) = editValue.trim();
    } else if (typeof updatedRow[field] === 'number') {
      const numVal = parseFloat(editValue) || 0;
      (updatedRow[field] as any) = numVal;

      // Recalculate IBS/CBS values on edits
      if (field === 'vBC_IBS' || field === 'pIBS' || field === 'pIBSUF' || field === 'pIBSMun') {
        updatedRow.vIBS = parseFloat(((updatedRow.vBC_IBS * updatedRow.pIBS) / 100).toFixed(2));
        updatedRow.pIBSUF = parseFloat((updatedRow.pIBS * 0.7).toFixed(4));
        updatedRow.pIBSMun = parseFloat((updatedRow.pIBS * 0.3).toFixed(4));
        updatedRow.vIBSUF = parseFloat(((updatedRow.vBC_IBS * updatedRow.pIBSUF) / 100).toFixed(2));
        updatedRow.vIBSMun = parseFloat(((updatedRow.vBC_IBS * updatedRow.pIBSMun) / 100).toFixed(2));
      }
      
      if (field === 'vBC_CBS' || field === 'pCBS') {
        updatedRow.vCBS = parseFloat(((updatedRow.vBC_CBS * updatedRow.pCBS) / 100).toFixed(2));
      }
    } else {
      (updatedRow[field] as any) = editValue.trim();
    }

    onRowUpdate(updatedRow);
    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, row: NFeItemRow) => {
    if (e.key === 'Enter') {
      handleCellSave(row);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // Filter & Search Logic
  const filteredRows = rows.filter(row => {
    const searchLower = filters.search.toLowerCase();
    
    // Global text search across multiple fields
    const matchesGlobal = !filters.search || 
      row.chNFe.toLowerCase().includes(searchLower) ||
      row.xProd.toLowerCase().includes(searchLower) ||
      row.emitNome.toLowerCase().includes(searchLower) ||
      (row.destNome && row.destNome.toLowerCase().includes(searchLower));

    const matchesNf = !filters.nNF || row.nNF.includes(filters.nNF);
    const matchesEmit = !filters.emitNome || 
      row.emitNome.toLowerCase().includes(filters.emitNome.toLowerCase()) || 
      row.emitCNPJ.includes(filters.emitNome);
    
    const matchesNcm = !filters.NCM || row.NCM.includes(filters.NCM);
    const matchesCfop = !filters.CFOP || row.CFOP.includes(filters.CFOP);

    return matchesGlobal && matchesNf && matchesEmit && matchesNcm && matchesCfop;
  });

  // Sort Logic
  const sortedRows = [...filteredRows].sort((a, b) => {
    const { column, direction } = sortConfig;
    const activeCol = column || 'nNF';
    const activeDir = column ? direction : 'asc';

    const valA = a[activeCol];
    const valB = b[activeCol];

    if (typeof valA === 'number' && typeof valB === 'number') {
      return activeDir === 'asc' ? valA - valB : valB - valA;
    }

    if (activeCol === 'nNF' || activeCol === 'serie' || activeCol === 'modelo' || activeCol === 'nItem') {
      const numA = parseInt((valA || '').toString().replace(/\D/g, ''), 10) || 0;
      const numB = parseInt((valB || '').toString().replace(/\D/g, ''), 10) || 0;
      return activeDir === 'asc' ? numA - numB : numB - numA;
    }

    const strA = (valA || '').toString().toLowerCase();
    const strB = (valB || '').toString().toLowerCase();

    if (strA < strB) return activeDir === 'asc' ? -1 : 1;
    if (strA > strB) return activeDir === 'asc' ? 1 : -1;
    return 0;
  });

  const hasActiveFilters = Object.values(filters).some(val => val !== '');

  const formatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  // Helper to render double-click sorting indicator on headers with premium category accents
  const renderHeader = (label: string, field: keyof NFeItemRow, category: string) => {
    const isSorted = sortConfig.column === field;
    
    // Determine category border/accent color and background tint (fully solid to prevent content shining through on scroll)
    let borderAccent = 'border-t-[3px] border-slate-300';
    let labelBg = 'bg-slate-100';
    let textColor = 'text-slate-700';
    
    if (category === 'IBS / CBS') {
      borderAccent = 'border-t-[3px] border-emerald-500';
      labelBg = 'bg-[#ecfdf5]'; // Emerald 50
      textColor = 'text-emerald-950 font-bold';
    } else if (category === 'ICMS / ICMS ST') {
      borderAccent = 'border-t-[3px] border-sky-500';
      labelBg = 'bg-[#f0f9ff]'; // Sky 50
      textColor = 'text-sky-950 font-bold';
    } else if (category === 'IPI') {
      borderAccent = 'border-t-[3px] border-purple-500';
      labelBg = 'bg-[#faf5ff]'; // Purple 50
      textColor = 'text-purple-950 font-bold';
    } else if (category === 'PIS / COFINS') {
      borderAccent = 'border-t-[3px] border-indigo-500';
      labelBg = 'bg-[#f5f3ff]'; // Indigo 50
      textColor = 'text-indigo-950 font-bold';
    } else if (category === 'Dados do Item') {
      borderAccent = 'border-t-[3px] border-slate-400';
      labelBg = 'bg-slate-100';
      textColor = 'text-slate-700';
    } else if (category === 'Informações Complementares') {
      borderAccent = 'border-t-[3px] border-amber-500';
      labelBg = 'bg-[#fffbeb]'; // Amber 50
      textColor = 'text-amber-950';
    }
    
    return (
      <th 
        key={field}
        onDoubleClick={() => handleHeaderDoubleClick(field)}
        className={`sticky top-0 z-20 px-4 py-3.5 text-left text-[11px] font-extrabold uppercase tracking-wider cursor-pointer select-none group transition-all duration-200 hover:brightness-95 shadow-[0_1px_0_rgba(0,0,0,0.08)] ${borderAccent} ${labelBg} ${textColor}`}
        title="Dê duplo clique para ordenar por esta coluna"
        id={`th-${field}`}
      >
        <div className="flex items-center space-x-2 justify-between">
          <span className="truncate">{label}</span>
          <ArrowUpDown className={`h-3 w-3 shrink-0 transition-opacity ${
            isSorted ? 'text-[#042838] opacity-100 font-extrabold' : 'text-slate-400 opacity-20 group-hover:opacity-80'
          }`} />
        </div>
      </th>
    );
  };

  const getCellClassName = (colKey: keyof NFeItemRow, category: string) => {
    const isLeft = ['emitNome', 'destNome', 'xProd', 'infAdic', 'infAdFisco'].includes(colKey);
    const isChave = colKey === 'chNFe';
    const isCenter = ['nNF', 'serie', 'modelo', 'cProd', 'NCM', 'CFOP', 'uCom', 'nItem', 'cClassTrib'].includes(colKey) || colKey.startsWith('cst');
    
    let alignClass = 'text-right font-mono text-xs';
    if (isLeft) alignClass = 'text-left truncate max-w-[280px] font-medium text-slate-800';
    else if (isChave) alignClass = 'text-left font-mono text-[10px] tracking-wide min-w-[340px] font-semibold text-slate-700 bg-slate-50/50';
    else if (isCenter) alignClass = 'text-center font-mono text-xs';
    
    let bgClass = 'bg-white';
    if (category === 'IBS / CBS') {
      bgClass = 'bg-emerald-50/[0.04] group-hover:bg-emerald-50/10';
    } else if (category === 'ICMS / ICMS ST') {
      bgClass = 'bg-sky-50/[0.04] group-hover:bg-sky-50/10';
    } else if (category === 'IPI') {
      bgClass = 'bg-purple-50/[0.04] group-hover:bg-purple-50/10';
    } else if (category === 'PIS / COFINS') {
      bgClass = 'bg-indigo-50/[0.04] group-hover:bg-indigo-50/10';
    }
    
    const isEditable = !!EDITABLE_FIELDS[colKey as string];
    const editableStyle = isEditable 
      ? 'relative border-b border-dashed border-emerald-300 hover:bg-emerald-50/20 cursor-pointer group/cell' 
      : '';
    
    return `px-4 py-3 border-b border-slate-100 transition-colors ${alignClass} ${bgClass} ${editableStyle}`;
  };

  const renderCellValue = (row: NFeItemRow, colKey: keyof NFeItemRow) => {
    const val = row[colKey];
    if (val === undefined || val === null || val === '') {
      return <span className="text-slate-300 font-sans font-normal">-</span>;
    }

    if (colKey === 'chNFe') {
      const rawStr = val.toString();
      // Format 44 digits nicely into chunks of 4 digits: "3521 1158 ..."
      const formatted = rawStr.replace(/(.{4})/g, '$1 ').trim();
      return (
        <span 
          className="font-mono font-bold tracking-wide text-slate-600 hover:text-slate-900 transition-colors"
          title="Chave de Acesso da NFe"
        >
          {formatted}
        </span>
      );
    }

    if (colKey === 'modelo') {
      const is65 = val.toString() === '65';
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-sans ${
          is65 
            ? 'bg-purple-100 text-purple-800 border border-purple-200' 
            : 'bg-blue-100 text-blue-800 border border-blue-200'
        }`}>
          {is65 ? 'NFC-e (65)' : 'NF-e (55)'}
        </span>
      );
    }

    if (colKey === 'nNF') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200/50">
          {val}
        </span>
      );
    }

    if (colKey === 'serie') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-50 text-slate-500 border border-slate-200/40">
          S.{val}
        </span>
      );
    }

    if (colKey === 'nItem') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-50 text-slate-500 border border-slate-150">
          #{val}
        </span>
      );
    }

    if (colKey === 'cProd') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-600 bg-slate-50 border border-slate-200/30">
          {val}
        </span>
      );
    }

    if (colKey === 'CFOP') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-50 text-sky-700 border border-sky-100/80">
          {val}
        </span>
      );
    }

    if (colKey === 'NCM') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200/60">
          {val}
        </span>
      );
    }

    if (colKey.startsWith('cst')) {
      let badgeTheme = 'bg-slate-50 text-slate-600 border-slate-200/60';
      if (colKey === 'cstIBS') {
        badgeTheme = 'bg-emerald-50 text-emerald-700 border-emerald-200/60';
      } else if (colKey === 'cstCBS') {
        badgeTheme = 'bg-teal-50 text-teal-700 border-teal-200/60';
      } else if (colKey === 'cstICMS') {
        badgeTheme = 'bg-sky-50 text-sky-700 border-sky-200/60';
      }
      return (
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${badgeTheme}`}>
          {val}
        </span>
      );
    }

    if (colKey === 'uCom') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-500">
          {val}
        </span>
      );
    }

    if (typeof val === 'number') {
      if (colKey.startsWith('p')) {
        const formattedPct = `${val.toFixed(4).replace(/\.?0+$/, '')}%`;
        if (val === 0) return <span className="text-slate-300 font-mono text-xs">0%</span>;
        return <span className="text-slate-700 font-mono text-xs font-semibold">{formattedPct}</span>;
      }
      
      if (colKey.includes('vBC') || colKey.startsWith('v') || colKey.endsWith('ST') || colKey === 'vIBSUF' || colKey === 'vIBSMun') {
        if (val === 0) {
          return <span className="text-slate-300 font-mono text-xs">-</span>;
        }
        
        let colorClass = 'text-slate-700 font-semibold';
        if (colKey === 'vIBS' || colKey === 'vCBS' || colKey === 'vIBSUF' || colKey === 'vIBSMun') {
          colorClass = 'text-emerald-700 font-bold';
        } else if (colKey === 'vICMS' || colKey === 'vICMSST') {
          colorClass = 'text-sky-700 font-bold';
        } else if (colKey === 'vProd') {
          colorClass = 'text-[#042838] font-bold text-[13px]';
        }
        return <span className={`${colorClass} font-mono`}>{formatter.format(val)}</span>;
      }
      
      if (colKey === 'qCom') {
        return <span className="text-slate-800 font-mono font-semibold">{val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
      }
      
      return <span className="text-slate-700">{val.toString()}</span>;
    }
    
    if (colKey === 'xProd') {
      return (
        <div className="font-semibold text-slate-900 text-xs tracking-tight truncate max-w-[240px]" title={val.toString()}>
          {val.toString()}
        </div>
      );
    }

    return <span>{val.toString()}</span>;
  };

  // Find active preset name for document title and downloads
  const allPresets = [...DEFAULT_PRESETS, ...customPresets];
  const activePreset = allPresets.find(p => p.id === activePresetId);
  const activePresetName = activePreset ? activePreset.name : 'Personalizado';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fadeIn" id="nfe-spreadsheet-grid">
      
      {/* Dynamic Header Section: Action and Filter controls */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50/50">
        
        {/* Search Input */}
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar emitente, descrição, chave..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#042838] bg-white transition-all"
            id="global-search"
          />
        </div>

        {/* Toolbar of buttons styled in Moreira & Lima colors */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          
          {/* 1. Escolher Colunas Button */}
          <button
            onClick={() => {
              setShowConfigPanel(!showConfigPanel);
              setShowFilterPanel(false);
            }}
            className={`flex items-center space-x-1.5 px-3.5 py-2.5 border rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer ${
              showConfigPanel
                ? 'border-[#dfb25e] bg-[#042838] text-[#dfb25e]'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-[#042838]'
            }`}
            id="btn-column-setup"
          >
            <Settings className="h-4 w-4" />
            <span>Colunas ({visibleColumns.length})</span>
          </button>

          {/* 2. Filtros Avançados Button */}
          <button
            onClick={() => {
              setShowFilterPanel(!showFilterPanel);
              setShowConfigPanel(false);
            }}
            className={`flex items-center space-x-1.5 px-3.5 py-2.5 border rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer ${
              showFilterPanel || hasActiveFilters
                ? 'border-[#dfb25e] bg-[#042838] text-[#dfb25e]'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-[#042838]'
            }`}
            id="btn-advanced-filters"
          >
            <Filter className="h-4 w-4" />
            <span>Filtros</span>
            {hasActiveFilters && (
              <span className="bg-[#dfb25e] text-[#042838] rounded-full h-4 w-4 flex items-center justify-center text-[9px] font-extrabold ml-1">
                {Object.values(filters).filter(f => f !== '').length}
              </span>
            )}
          </button>

          {/* Clear filters shortcut */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center space-x-1.5 px-2.5 py-2 border border-dashed border-red-200 rounded-xl text-xs text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
              id="btn-clear-filters"
            >
              <X className="h-3.5 w-3.5" />
              <span>Limpar</span>
            </button>
          )}

          {/* 3. Export to Excel Button with Brand Theme Colors */}
          <button
            onClick={() => onExport(sortedRows, visibleColumns as string[], activePresetName)}
            className="flex items-center space-x-2 px-4.5 py-2.5 bg-[#042838] border border-[#dfb25e]/30 hover:border-[#dfb25e]/65 text-[#dfb25e] hover:bg-[#02151D] hover:scale-[1.01] font-bold text-xs tracking-wider uppercase rounded-xl shadow-md shadow-[#02151D]/10 transition-all duration-300 cursor-pointer"
            id="btn-export-excel"
          >
            <Download className="h-4 w-4" />
            <span>Exportar Planilha Excel</span>
          </button>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      {showFilterPanel && (
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 animate-fadeIn">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Número da Nota (nNF)</label>
            <input
              type="text"
              placeholder="Ex: 000123"
              value={filters.nNF}
              onChange={(e) => handleFilterChange('nNF', e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#042838]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Razão Social / CNPJ Emitente</label>
            <div className="flex space-x-1">
              <input
                type="text"
                placeholder="Ex: Moreira ou CNPJ"
                value={filters.emitNome}
                onChange={(e) => handleFilterChange('emitNome', e.target.value)}
                list="registered-companies-list"
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#042838]"
              />
            </div>
            {registeredCompanies.length > 0 && (
              <datalist id="registered-companies-list">
                {registeredCompanies.map(c => (
                  <option key={c.id} value={c.razaoSocial}>
                    {c.cnpj} - {c.cidade}
                  </option>
                ))}
              </datalist>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">NCM</label>
            <input
              type="text"
              placeholder="Ex: 851762"
              value={filters.NCM}
              onChange={(e) => handleFilterChange('NCM', e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#042838]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">CFOP</label>
            <input
              type="text"
              placeholder="Ex: 5102"
              value={filters.CFOP}
              onChange={(e) => handleFilterChange('CFOP', e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#042838]"
            />
          </div>
        </div>
      )}

      {/* Dynamic Column Configuration & Saved Layout Groups Panel */}
      {showConfigPanel && (
        <div className="p-5 bg-slate-50 border-b border-slate-200 animate-fadeIn" id="column-selector-panel">
          
          <div className="flex flex-col lg:flex-row gap-6">
            
            {/* Presets and custom named groups management */}
            <div className="w-full lg:w-1/3 bg-white p-4 rounded-xl border border-slate-150 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-[#042838] uppercase tracking-wider border-b border-slate-100 pb-2 mb-3">
                  Grupos de Configurações
                </h3>
                
                {/* Available preset buttons */}
                <div className="space-y-1.5 mb-5">
                  {allPresets.map((preset) => {
                    const isActive = activePresetId === preset.id;
                    return (
                      <div 
                        key={preset.id}
                        onClick={() => handleApplyPreset(preset)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          isActive 
                            ? 'bg-[#042838] text-[#dfb25e] shadow-sm'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {preset.id === 'padrao' && <LayoutGrid className="h-3.5 w-3.5 shrink-0" />}
                          {preset.id === 'ibscbs' && <Percent className="h-3.5 w-3.5 shrink-0" />}
                          {preset.id === 'icms_st' && <Coins className="h-3.5 w-3.5 shrink-0" />}
                          {preset.id === 'tudo' && <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />}
                          {preset.isCustom && <div className="h-1.5 w-1.5 bg-[#dfb25e] rounded-full shrink-0" />}
                          <span className="truncate">{preset.name}</span>
                        </div>
                        
                        {preset.isCustom && (
                          <button
                            onClick={(e) => handleDeleteCustomPreset(preset.id, e)}
                            className={`p-1 rounded hover:bg-red-50 hover:text-red-600 transition-colors ${
                              isActive ? 'text-[#dfb25e]/70 hover:text-red-200' : 'text-slate-400'
                            }`}
                            title="Remover grupo de configuração"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Form to Save current setup as custom layout group */}
              <form onSubmit={handleCreateCustomPreset} className="border-t border-slate-100 pt-3">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Gravar layout atual como:
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    required
                    placeholder="Ex: Auditoria Entrada"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    className="flex-grow px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#042838]"
                  />
                  <button
                    type="submit"
                    className="px-3 bg-[#042838] text-[#dfb25e] font-bold text-xs rounded-lg border border-[#dfb25e]/35 hover:bg-[#02151D] transition-colors flex items-center justify-center shrink-0"
                    title="Gravar layout"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    <span>Gravar</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Individual Columns Checklist grouped by Tax Category */}
            <div className="w-full lg:w-2/3">
              <h3 className="text-xs font-bold text-[#042838] uppercase tracking-wider border-b border-slate-200 pb-2 mb-3">
                Seleção Manual de Colunas
              </h3>

              {/* Categories grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[300px] overflow-y-auto pr-1">
                {Array.from(new Set(ALL_COLUMNS.map(c => c.category))).map((category) => {
                  const categoryCols = ALL_COLUMNS.filter(c => c.category === category);
                  const allCategoryKeys = categoryCols.map(c => c.key);
                  const isAllChecked = categoryCols.every(c => visibleColumns.includes(c.key));

                  const toggleCategoryAll = () => {
                    if (isAllChecked) {
                      // Remove all
                      setVisibleColumns(prev => prev.filter(k => !allCategoryKeys.includes(k)));
                    } else {
                      // Add missing
                      setVisibleColumns(prev => {
                        const next = [...prev];
                        allCategoryKeys.forEach(k => {
                          if (!next.includes(k)) next.push(k);
                        });
                        return next;
                      });
                    }
                    setActivePresetId('custom');
                  };

                  return (
                    <div key={category} className="bg-white p-3 rounded-xl border border-slate-150">
                      <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-800">{category}</span>
                        <button
                          type="button"
                          onClick={toggleCategoryAll}
                          className="text-[10px] text-[#042838] hover:text-[#dfb25e] font-bold"
                        >
                          {isAllChecked ? 'Deselecionar' : 'Marcar Todos'}
                        </button>
                      </div>

                      <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                        {categoryCols.map((col) => {
                          const isChecked = visibleColumns.includes(col.key);
                          return (
                            <label 
                              key={col.key} 
                              className="flex items-start space-x-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer select-none"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleColumn(col.key)}
                                className="mt-0.5 rounded text-[#042838] focus:ring-[#042838] h-3.5 w-3.5"
                              />
                              <span>{col.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Auxiliary Quick Controls */}
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                <p className="text-[11px] text-slate-400 italic">
                  * Dica: Você pode reordenar as colunas clicando duas vezes nos títulos das tabelas abaixo.
                </p>
                <button
                  type="button"
                  onClick={() => setShowConfigPanel(false)}
                  className="px-4 py-2 bg-[#042838] text-[#dfb25e] hover:bg-[#02151D] text-xs font-bold rounded-lg border border-[#dfb25e]/30 transition-colors"
                >
                  Confirmar Visualização
                </button>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* Main Spreadsheet/Grid Canvas */}
      <div className="overflow-x-auto relative shadow-inner max-h-[600px] rounded-b-xl border-t border-slate-200 bg-slate-50/20">
        <table className="w-full border-collapse border-spacing-0" id="table-document-rows">
          <thead>
            <tr className="border-b border-slate-200 divide-y-0">
              
              {/* Dynamic Headers based on Visible Columns list */}
              {ALL_COLUMNS.map((col) => {
                if (!visibleColumns.includes(col.key)) return null;
                return renderHeader(col.label, col.key, col.category);
              })}

            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700 bg-white font-sans">
            {sortedRows.length === 0 ? (
              <tr>
                <td 
                  colSpan={visibleColumns.length} 
                  className="px-6 py-20 text-center text-slate-400 font-sans text-xs bg-white"
                >
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="p-4 bg-slate-50 text-slate-300 rounded-full border border-slate-100 shadow-inner">
                      <Info className="h-8 w-8 text-slate-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-700 text-sm">Nenhum registro encontrado</p>
                      <p className="text-slate-400 max-w-sm text-xs leading-relaxed">
                        Tente ajustar os critérios de filtragem ou pesquise por outros termos de identificação.
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              sortedRows.map((row, idx) => {
                const isOdd = idx % 2 === 1;
                return (
                  <tr 
                    key={row.id} 
                    className={`group transition-colors duration-150 ${isOdd ? 'bg-slate-50/20' : 'bg-white'} hover:bg-slate-50/80`}
                  >
                    
                    {/* Render active columns cells */}
                    {ALL_COLUMNS.map((col) => {
                      if (!visibleColumns.includes(col.key)) return null;

                      const isEditable = !!EDITABLE_FIELDS[col.key as string];
                      const cellClass = getCellClassName(col.key, col.category);

                      return (
                        <td 
                          key={col.key}
                          onDoubleClick={() => handleCellDoubleClick(row.id, col.key, row[col.key])}
                          className={`${cellClass}`}
                          title={isEditable ? 'Dê dois cliques para editar este valor' : undefined}
                        >
                          {editingCell?.rowId === row.id && editingCell?.field === col.key ? (
                            <div className="absolute inset-x-1 inset-y-1 z-30 p-1 bg-white flex items-center shadow-lg rounded-lg border border-emerald-500 ring-2 ring-emerald-500/20">
                              <input
                                type={EDITABLE_FIELDS[col.key as string].type}
                                step={EDITABLE_FIELDS[col.key as string].step}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleCellSave(row)}
                                onKeyDown={(e) => handleKeyDown(e, row)}
                                className="w-full h-full text-right px-2 py-1 bg-slate-50 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:bg-white rounded"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-1.5 min-h-[20px]">
                              <span className="truncate">{renderCellValue(row, col.key)}</span>
                              {isEditable && (
                                <Edit2 className="h-2.5 w-2.5 text-emerald-500 opacity-0 group-hover/cell:opacity-100 shrink-0 ml-1 transition-all duration-200 transform scale-90 group-hover/cell:scale-100" />
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Row counter and active preset badge in footer of the grid */}
      <div className="px-5 py-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 font-mono bg-slate-50/50 gap-3">
        <div className="flex items-center space-x-2">
          <span>Mostrando <strong className="text-slate-800 font-bold">{sortedRows.length}</strong> de <strong className="text-slate-800 font-bold">{rows.length}</strong> itens carregados</span>
          {rows.length > 0 && (
            <span className="bg-[#042838]/5 text-[#042838] border border-[#042838]/10 px-2.5 py-1 rounded-md text-[10px] font-bold">
              Layout: {activePresetName}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <span className="text-[10px] text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-200/50">Dica: Dê duplo clique na célula com borda pontilhada verde para editar</span>
        </div>
      </div>

    </div>
  );
}
