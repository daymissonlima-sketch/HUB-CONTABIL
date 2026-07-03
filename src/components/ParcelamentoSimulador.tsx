import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Calculator, 
  FileDown, 
  Calendar, 
  Layers, 
  TrendingUp, 
  Info,
  RotateCcw,
  Plus,
  Trash2,
  Building2,
  Pencil,
  Check
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { ParcelamentoInput, InstallmentRow, Company } from '../types_debits';
import importedCompaniesJson from '../data/imported_companies.json';
import { getPdfLogoData, getAppLogoScale } from '../utils/logoHelper';

interface FormattedCurrencyInputProps {
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
}

const FormattedCurrencyInput: React.FC<FormattedCurrencyInputProps> = ({
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

export function ParcelamentoSimulador() {
  // Retrieve custom parcelamento templates/types from the configurations stored in localStorage
  const parcelamentoTypes = useMemo(() => {
    const saved = localStorage.getItem('debt_categories');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const filtered = parsed.filter((c: any) => c.categoryType === 'PARCELAMENTO');
        if (filtered.length > 0) {
          return filtered.map((c: any) => c.title);
        }
      } catch (e) {
        console.error('Erro ao ler categorias de parcelamento:', e);
      }
    }
    // Default fallback templates
    return [
      'PARCELAMENTOS SIMPLES NACIONAL',
      'PARCELAMENTO MEI',
      'PARCELAMENTOS PREVIDENCIÁRIOS'
    ];
  }, []);

  const [input, setInput] = useState<ParcelamentoInput>({
    totalDebt: 0,
    downPayment: 0,
    installmentsCount: 0,
    installmentValue: 0,
    interestRate: 0,
    penaltyRate: 0,
    firstDueDate: '',
    parcelamentoType: parcelamentoTypes[0] || 'PARCELAMENTOS SIMPLES NACIONAL'
  });

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [simulations, setSimulations] = useState<Array<ParcelamentoInput & { id: string }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Load companies
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
        console.error('Erro ao ler empresas:', e);
      }
    }

    mergedCompanies.sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '', 'pt-BR', { sensitivity: 'base' }));

    setCompanies(mergedCompanies);
    localStorage.setItem('moreira_lima_companies', JSON.stringify(mergedCompanies));
    if (mergedCompanies.length > 0 && !selectedCompanyId) {
      setSelectedCompanyId(mergedCompanies[0].id);
    }
  }, []);

  // Load simulations when company changes
  useEffect(() => {
    const key = selectedCompanyId ? `moreira_lima_simulations_${selectedCompanyId}` : 'moreira_lima_simulations_general';
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const sanitized = parsed.map((sim: any) => ({
          ...sim,
          id: sim.id || Math.random().toString(36).substring(2, 9)
        }));
        setSimulations(sanitized);
      } catch (e) {
        console.error('Erro ao ler simulações:', e);
        setSimulations([]);
      }
    } else {
      setSimulations([]);
    }
    setEditingId(null); // Reset edit state when company changes
  }, [selectedCompanyId]);

  const saveSimulations = (updated: Array<ParcelamentoInput & { id: string }>) => {
    setSimulations(updated);
    const key = selectedCompanyId ? `moreira_lima_simulations_${selectedCompanyId}` : 'moreira_lima_simulations_general';
    localStorage.setItem(key, JSON.stringify(updated));
  };

  const selectedCompany = useMemo(() => {
    return companies.find(c => c.id === selectedCompanyId) || null;
  }, [companies, selectedCompanyId]);

  // Keep type selection in sync
  useEffect(() => {
    if (parcelamentoTypes.length > 0 && !parcelamentoTypes.includes(input.parcelamentoType)) {
      setInput(prev => ({
        ...prev,
        parcelamentoType: parcelamentoTypes[0]
      }));
    }
  }, [parcelamentoTypes]);

  // Run calculation logic (simple linear amortization where entry is installment #1) for current input
  const simulationResults = useMemo(() => {
    if (input.installmentsCount <= 0) {
      return { rows: [] as InstallmentRow[], totalPaid: 0, avgInstallment: 0 };
    }

    const rows: InstallmentRow[] = [];
    const totalN = input.installmentsCount;
    const remainingN = totalN > 1 ? totalN - 1 : 0;
    const principalToFinance = Math.max(0, input.totalDebt - input.downPayment);
    const pmt = input.installmentValue && input.installmentValue > 0
      ? input.installmentValue
      : (remainingN > 0 ? principalToFinance / remainingN : 0);

    const baseDate = new Date();
    if (input.firstDueDate) {
      const parts = input.firstDueDate.split('-');
      if (parts.length === 3) {
        baseDate.setFullYear(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      }
    }

    // Parcela 1: Entrada (Down payment)
    rows.push({
      number: 1,
      dueDate: baseDate.toLocaleDateString('pt-BR'),
      previousBalance: input.totalDebt,
      amortization: input.downPayment,
      interest: 0,
      penalty: 0,
      total: input.downPayment,
      currentBalance: principalToFinance
    });

    // Parcela 2 a N: Saldo restante dividido em (N-1) parcelas
    let runningBalance = principalToFinance;
    for (let i = 2; i <= totalN; i++) {
      const previousBalance = runningBalance;
      runningBalance = Math.max(0, runningBalance - pmt);

      const dueDate = new Date(baseDate);
      dueDate.setMonth(baseDate.getMonth() + (i - 1));

      rows.push({
        number: i,
        dueDate: dueDate.toLocaleDateString('pt-BR'),
        previousBalance,
        amortization: pmt,
        interest: 0,
        penalty: 0,
        total: pmt,
        currentBalance: runningBalance
      });
    }

    const totalPaid = input.totalDebt;

    return {
      rows,
      totalPaid,
      avgInstallment: pmt
    };
  }, [input.totalDebt, input.downPayment, input.installmentsCount, input.installmentValue, input.firstDueDate]);

  // Consolidated totals for ALL simulations
  const consolidatedTotals = useMemo(() => {
    let totalDebtSum = 0;
    let downPaymentSum = 0;
    let totalFinancedSum = 0;
    let totalAvgInstallmentSum = 0;
    let totalInstallmentsSum = 0;

    simulations.forEach(sim => {
      totalDebtSum += sim.totalDebt;
      downPaymentSum += sim.downPayment;
      const financed = Math.max(0, sim.totalDebt - sim.downPayment);
      totalFinancedSum += financed;
      totalInstallmentsSum += sim.installmentsCount;
      const remainingN = sim.installmentsCount > 1 ? sim.installmentsCount - 1 : 0;
      if (sim.installmentValue && sim.installmentValue > 0) {
        totalAvgInstallmentSum += sim.installmentValue;
      } else if (remainingN > 0) {
        totalAvgInstallmentSum += (financed / remainingN);
      }
    });

    return {
      totalDebtSum,
      downPaymentSum,
      totalFinancedSum,
      totalAvgInstallmentSum,
      totalInstallmentsSum
    };
  }, [simulations]);

  const handleAddSimulation = () => {
    if (input.totalDebt <= 0) {
      alert("Por favor, informe o valor total atualizado do débito.");
      return;
    }
    if (input.installmentsCount <= 0) {
      alert("Por favor, informe o número de parcelas.");
      return;
    }
    if (!input.installmentValue || input.installmentValue <= 0) {
      alert("Por favor, informe o valor da parcela mensal.");
      return;
    }

    if (editingId) {
      // Editing mode
      const updated = simulations.map(s => s.id === editingId ? { ...s, ...input } : s);
      saveSimulations(updated);
      setEditingId(null);
    } else {
      // Creation mode
      const newSim = {
        ...input,
        id: Math.random().toString(36).substring(2, 9)
      };
      const updated = [...simulations, newSim];
      saveSimulations(updated);
    }

    // Reset current inputs for ease of entering next simulation
    setInput(prev => ({
      ...prev,
      totalDebt: 0,
      downPayment: 0,
      installmentsCount: 0,
      installmentValue: 0
    }));
  };

  const handleEditSimulation = (sim: ParcelamentoInput & { id: string }, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setEditingId(sim.id);
    const financed = Math.max(0, sim.totalDebt - sim.downPayment);
    const fallbackVal = sim.installmentsCount > 1 ? financed / (sim.installmentsCount - 1) : 0;
    setInput({
      totalDebt: sim.totalDebt,
      downPayment: sim.downPayment,
      installmentsCount: sim.installmentsCount,
      installmentValue: sim.installmentValue !== undefined ? sim.installmentValue : fallbackVal,
      interestRate: sim.interestRate || 0,
      penaltyRate: sim.penaltyRate || 0,
      firstDueDate: sim.firstDueDate || '',
      parcelamentoType: sim.parcelamentoType
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    handleReset();
  };

  const handleRemoveSimulation = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const updated = simulations.filter(s => s.id !== id);
    saveSimulations(updated);
    if (editingId === id) {
      setEditingId(null);
      handleReset();
    }
  };

  const handleClearAllSimulations = () => {
    if (confirm("Deseja realmente excluir todas as simulações cadastradas para esta empresa?")) {
      saveSimulations([]);
      setEditingId(null);
      handleReset();
    }
  };

  const handleReset = () => {
    setInput({
      totalDebt: 0,
      downPayment: 0,
      installmentsCount: 0,
      installmentValue: 0,
      interestRate: 0,
      penaltyRate: 0,
      firstDueDate: '',
      parcelamentoType: parcelamentoTypes[0] || 'PARCELAMENTOS SIMPLES NACIONAL'
    });
    setEditingId(null);
  };

  // Helper to run simple calculation for a specific simulation item
  const getSimulationResults = (sim: ParcelamentoInput) => {
    const principalToFinance = Math.max(0, sim.totalDebt - sim.downPayment);
    if (sim.installmentsCount <= 0) {
      return { totalPaid: 0, avgInstallment: 0 };
    }
    const remainingN = sim.installmentsCount > 1 ? sim.installmentsCount - 1 : 0;
    const pmt = remainingN > 0 ? principalToFinance / remainingN : 0;
    return {
      totalPaid: sim.totalDebt,
      avgInstallment: pmt
    };
  };

  // Generate Report in PDF with corporate identity containing ALL simulations for the active company
  const handleGeneratePDF = () => {
    const doc = new jsPDF();
    const margin = 14;
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
 
    // Corporate Color Scheme
    const primaryColor = { r: 4, g: 36, b: 59 };    // #04243b (Deep Blue)
    const accentColor = { r: 228, g: 179, b: 94 };  // #e4b35e (Gold)
    const grayBg = { r: 248, g: 250, b: 252 };       // #f8fafc (Slate 50)
    const borderGray = { r: 226, g: 232, b: 240 };   // #e2e8f0 (Slate 200)

    let totalPages = 1;
 
    // Helper to draw Footer
    const drawFooter = (pageNum: number) => {
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - margin, pageHeight - 9, { align: 'right' });
    };

    const drawCompactHeader = () => {
      doc.setFillColor(primaryColor.r, primaryColor.g, primaryColor.b);
      doc.rect(0, 0, pageWidth, 16, 'F');
      doc.setFillColor(accentColor.r, accentColor.g, accentColor.b);
      doc.rect(0, 16, pageWidth, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text('MOREIRA & LIMA CONTADORES ASSOCIADOS', margin, 10.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(210, 220, 230);
      doc.text('Simulações de Parcelamento', pageWidth - margin, 10.5, { align: 'right' });
    };

    // Header Block (First page) with dark blue background
    doc.setFillColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.rect(0, 0, pageWidth, 30, 'F');

    doc.setFillColor(accentColor.r, accentColor.g, accentColor.b);
    doc.rect(0, 30, pageWidth, 1.5, 'F');

    const pdfLogo = getPdfLogoData();
    const logoScale = getAppLogoScale();
    let hasDrawnLogo = false;
    if (pdfLogo && pdfLogo.dataUrl) {
      try {
        const imgProps = doc.getImageProperties(pdfLogo.dataUrl);
        const aspect = (imgProps.width && imgProps.height) ? (imgProps.width / imgProps.height) : 1.54;
        let targetH = Math.min(17, 14 * logoScale);
        let targetW = targetH * aspect;
        if (targetW > 52) {
          targetW = 52;
          targetH = targetW / aspect;
        }
        const offsetY = Math.max(4, (30 - targetH) / 2);
        doc.addImage(pdfLogo.dataUrl, pdfLogo.format || 'PNG', margin, offsetY, targetW, targetH);
        hasDrawnLogo = true;
      } catch (e) {
        doc.addImage(pdfLogo.dataUrl, pdfLogo.format || 'PNG', margin, 7, 30, 16);
        hasDrawnLogo = true;
      }
    }

    if (!hasDrawnLogo) {
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('MOREIRA & LIMA CONTADORES', margin, 17);
    }
  
    // Document Title & Metadata centered in the middle of the sheet
    const titleCenterX = pageWidth / 2;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.text('SIMULAÇÕES DE PARCELAMENTO', titleCenterX, 13.5, { align: 'center' });
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(210, 220, 230);
    doc.text(`Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, titleCenterX, 19.5, { align: 'center' });

    // Active Company Box (Y: 36 to Y: 52)
    let currentY = 36;
    doc.setFillColor(grayBg.r, grayBg.g, grayBg.b);
    doc.rect(margin, currentY, pageWidth - (margin * 2), 16, 'F');
    doc.setDrawColor(borderGray.r, borderGray.g, borderGray.b);
    doc.setLineWidth(0.5);
    doc.rect(margin, currentY, pageWidth - (margin * 2), 16, 'S');
    doc.setFillColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.rect(margin, currentY, 1.5, 16, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.text('EMPRESA CONTRIBUINTE', margin + 6, currentY + 6);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(70, 80, 95);
    const companyLabel = selectedCompany 
      ? `${selectedCompany.razaoSocial} | CNPJ: ${selectedCompany.cnpj}`
      : 'Cliente Geral / Moreira & Lima';
    doc.text(companyLabel, margin + 6, currentY + 11);

    // Simulations list
    currentY = 58;

    const listToPrint = simulations.length > 0 ? simulations : [
      {
        id: 'fallback',
        ...input
      }
    ];

    listToPrint.forEach((sim, idx) => {
      const results = getSimulationResults(sim);

      // Check for page overflow before rendering next simulation panel (height is 32)
      if (currentY + 38 > pageHeight - 35) {
        drawFooter(totalPages);
        doc.addPage();
        totalPages++;
        
        drawCompactHeader();
        currentY = 22;
      }

      // Draw simulation box
      doc.setFillColor(grayBg.r, grayBg.g, grayBg.b);
      doc.rect(margin, currentY, pageWidth - (margin * 2), 32, 'F');
      doc.setDrawColor(borderGray.r, borderGray.g, borderGray.b);
      doc.rect(margin, currentY, pageWidth - (margin * 2), 32, 'S');
      
      // Left vertical accent
      doc.setFillColor(accentColor.r, accentColor.g, accentColor.b);
      doc.rect(margin, currentY, 1.5, 32, 'F');

      // Title & Index
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
      doc.text(`SIMULAÇÃO #${idx + 1}: ${sim.parcelamentoType.toUpperCase()}`, margin + 5, currentY + 6);

      // Line 1: Valor Atualizado
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 90, 105);
      doc.text('Valor Atualizado:', margin + 6, currentY + 14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 30, 45);
      doc.text(`R$ ${sim.totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 38, currentY + 14);

      // Line 2: Entrada
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 90, 105);
      doc.text('Entrada:', margin + 6, currentY + 20.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 30, 45);
      doc.text(`R$ ${sim.downPayment.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 38, currentY + 20.5);

      // Line 3: N Parcelas
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 90, 105);
      doc.text(`${sim.installmentsCount} Parcelas:`, margin + 6, currentY + 27);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
      doc.text(`R$ ${results.avgInstallment.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 38, currentY + 27);

      currentY += 37;
    });

    // Check overflow for Consolidated totals and final blocks
    if (currentY + 35 > pageHeight - 35) {
      drawFooter(totalPages);
      doc.addPage();
      totalPages++;
      
      drawCompactHeader();
      currentY = 22;
    }

    // Consolidated box (if more than 1 simulation)
    if (listToPrint.length > 1) {
      doc.setFillColor(primaryColor.r, primaryColor.g, primaryColor.b);
      doc.rect(margin, currentY, pageWidth - (margin * 2), 24, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(accentColor.r, accentColor.g, accentColor.b);
      doc.text('CONSOLIDADO TOTAL DE SIMULAÇÕES', margin + 6, currentY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(230, 240, 255);
      doc.text(`Total de Débito Consolidado:`, margin + 6, currentY + 14);
      doc.text(`Total de Entrada Consolidada:`, pageWidth / 3 + 10, currentY + 14);
      doc.text(`Valor das Parcelas Somadas:`, (pageWidth / 3) * 2 + 10, currentY + 14);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(`R$ ${consolidatedTotals.totalDebtSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 6, currentY + 20);
      doc.text(`R$ ${consolidatedTotals.downPaymentSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth / 3 + 10, currentY + 20);
      doc.setTextColor(accentColor.r, accentColor.g, accentColor.b);
      doc.text(`R$ ${consolidatedTotals.totalAvgInstallmentSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, (pageWidth / 3) * 2 + 10, currentY + 20);

      currentY += 28;
    }

    // Draw final page footer
    drawFooter(totalPages);

    // Save File
    const compNameClean = (selectedCompany ? selectedCompany.razaoSocial : 'geral').toLowerCase().replace(/[^a-z0-9]/g, '_');
    doc.save(`simulacao_parcelamento_consolidado_${compNameClean}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-[#04243b] text-slate-100 p-6 rounded-2xl border border-[#e4b35e]/30 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-[#e4b35e] rounded-xl text-[#04243b]">
              <Calculator className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-1.5">
                Simulador de Parcelamento de Débitos
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Resetar Campos
            </button>
            <button
              onClick={handleGeneratePDF}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#e4b35e] hover:bg-[#e4b35e]/90 text-[#04243b] shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              disabled={simulations.length === 0 && input.totalDebt <= 0}
            >
              <FileDown className="h-3.5 w-3.5" />
              Exportar Relatório Consolidado
            </button>
          </div>
        </div>
      </div>

      {/* Company Selector */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-100 rounded-xl text-[#04243b]">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#04243b] uppercase tracking-wide">
              Empresa Relacionada
            </h3>
            <p className="text-[11px] text-slate-400">
              Selecione a empresa contribuinte para gerenciar, adicionar e exportar múltiplas simulações de parcelamento.
            </p>
          </div>
        </div>
        <div className="w-full sm:w-80">
          {companies.length === 0 ? (
            <div className="text-xs text-amber-600 font-semibold italic p-2.5 bg-amber-50 border border-amber-100 rounded-xl text-center">
              Nenhuma empresa cadastrada no sistema.
            </div>
          ) : (
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 font-sans font-bold focus:outline-none focus:ring-1 focus:ring-[#e4b35e] cursor-pointer"
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.razaoSocial} ({c.cnpj})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column: Setup Form */}
        <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-[#04243b] uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
            <Layers className="h-4 w-4 text-[#e4b35e]" />
            {editingId ? "Editar Simulação" : "Nova Simulação"}
          </h3>

          {/* Quick template selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Tributo / Modalidade do Parcelamento
            </label>
            <select
              value={input.parcelamentoType}
              onChange={(e) => setInput(prev => ({ ...prev, parcelamentoType: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#e4b35e] transition-all font-sans font-bold"
            >
              {parcelamentoTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Inputs */}
          <div className="space-y-3.5 pt-1">
            
            {/* Debt Total */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Valor Total Atualizado (R$)
              </label>
              <FormattedCurrencyInput
                value={input.totalDebt}
                onChange={(val) => setInput(prev => ({ ...prev, totalDebt: Math.max(0, val) }))}
                placeholder="Ex: R$ 15.000,00"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#04243b] focus:outline-none focus:ring-1 focus:ring-[#e4b35e]"
              />
            </div>

            {/* Down Payment */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Entrada / Sinal (R$)
              </label>
              <FormattedCurrencyInput
                value={input.downPayment}
                onChange={(val) => setInput(prev => ({ ...prev, downPayment: Math.max(0, val) }))}
                placeholder="Ex: R$ 1.500,00"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-700 focus:outline-none focus:ring-1 focus:ring-[#e4b35e]"
              />
              <span className="text-[9px] text-slate-500 block">
                Saldo a parcelar: <strong className="text-slate-700 font-mono">R$ {Math.max(0, input.totalDebt - input.downPayment).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </span>
            </div>

            {/* Installments Count */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Número de Parcelas
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={input.installmentsCount ? input.installmentsCount : ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  const val = raw ? parseInt(raw, 10) : 0;
                  setInput(prev => ({ ...prev, installmentsCount: Math.min(120, val) }));
                }}
                placeholder="Ex: 24"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#04243b] focus:outline-none focus:ring-1 focus:ring-[#e4b35e]"
              />
            </div>

            {/* Monthly Installment value (valor da parcela mensal) */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Valor da Parcela Mensal (R$)
              </label>
              <FormattedCurrencyInput
                value={input.installmentValue || 0}
                onChange={(val) => setInput(prev => ({ ...prev, installmentValue: Math.max(0, val) }))}
                placeholder="R$ 0,00"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#04243b] focus:outline-none focus:ring-1 focus:ring-[#e4b35e]"
              />
            </div>

            {/* Add / Save button */}
            <button
              onClick={handleAddSimulation}
              className={`w-full py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 mt-2 ${
                editingId ? "bg-amber-500 hover:bg-amber-650 text-[#04243b]" : "bg-[#04243b] hover:bg-[#04243b]/90 text-white"
              }`}
            >
              {editingId ? (
                <>
                  <Check className="h-4 w-4" />
                  Salvar Alterações
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 text-[#e4b35e]" />
                  Adicionar ao Relatório
                </>
              )}
            </button>

            {editingId && (
              <button
                onClick={handleCancelEdit}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer flex items-center justify-center gap-1.5 mt-1"
              >
                Cancelar Edição
              </button>
            )}

          </div>

          <div className="bg-[#04243b]/5 p-3 rounded-xl border border-[#04243b]/10 text-[10px] text-[#04243b] leading-relaxed flex items-start gap-2 pt-2">
            <Info className="h-4 w-4 text-[#e4b35e] shrink-0 mt-0.5" />
            <div>
              <strong className="block mb-0.5">Como Funciona:</strong>
              Insira os parâmetros do débito ao lado e clique em "Adicionar ao Relatório". Você pode adicionar várias simulações para a mesma empresa e exportar todas juntas em um único PDF unificado.
            </div>
          </div>

        </div>

        {/* Right column: Results & Table */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Active simulations header & clear all */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-xs font-bold text-[#04243b] uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-[#e4b35e]" />
              Simulações Lançadas ({simulations.length})
            </h3>
            {simulations.length > 0 && (
              <button
                onClick={handleClearAllSimulations}
                className="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar Todas
              </button>
            )}
          </div>

          {simulations.length === 0 ? (
            <div className="space-y-6">
              {/* Empty state list */}
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-500 bg-slate-50/50">
                <Calculator className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-700">Nenhuma simulação lançada ainda</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                  Insira os valores do tributo na coluna de configuração à esquerda e clique em <strong>"Adicionar ao Relatório"</strong> para começar a compor o relatório consolidado desta empresa.
                </p>
              </div>

              {/* Show preview card with active unsaved inputs */}
              {input.totalDebt > 0 && (
                <div className="space-y-4">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Prévia da Simulação Ativa (Não salva)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Débito Atualizado</span>
                      <span className="text-sm font-extrabold text-[#04243b] font-mono mt-1 block">
                        R$ {input.totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Entrada</span>
                      <span className="text-sm font-extrabold text-emerald-600 font-mono mt-1 block">
                        R$ {input.downPayment.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="bg-white p-3.5 rounded-2xl border border-[#e4b35e]/20 shadow-xs bg-[#e4b35e]/3">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">A Parcelar</span>
                      <span className="text-sm font-extrabold text-[#04243b] font-mono mt-1 block">
                        R$ {Math.max(0, input.totalDebt - input.downPayment).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Parcela Estimada</span>
                      <span className="text-sm font-extrabold text-[#04243b] font-mono mt-1 block">
                        R$ {simulationResults.avgInstallment.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#04243b] text-slate-100 p-6 rounded-2xl border border-[#e4b35e]/30 shadow-md">
                    <h4 className="text-xs font-bold text-[#e4b35e] uppercase tracking-wider flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Resumo da Projeção Ativa
                    </h4>
                    <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                      Esta é a projeção atual da simulação sob a modalidade <strong className="text-white font-sans">{input.parcelamentoType}</strong>:
                    </p>
                    <ul className="text-xs text-slate-300 mt-3 space-y-1.5 list-disc pl-4">
                      <li>Saldo a amortizar: <strong className="text-white">R$ {Math.max(0, input.totalDebt - input.downPayment).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></li>
                      <li>Quitado em <strong className="text-white">{input.installmentsCount} parcelas fixas</strong> de <strong className="text-[#e4b35e]">R$ {simulationResults.avgInstallment.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Consolidated Totals Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Débito Total Somado</span>
                  <span className="text-sm font-extrabold text-[#04243b] font-mono mt-1 block">
                    R$ {consolidatedTotals.totalDebtSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[8px] text-slate-500 block mt-0.5">Soma de todas as dívidas</span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Entrada Total Somada</span>
                  <span className="text-sm font-extrabold text-emerald-600 font-mono mt-1 block">
                    R$ {consolidatedTotals.downPaymentSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[8px] text-slate-500 block mt-0.5">Total de sinal deduzido</span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-[#e4b35e]/20 shadow-xs bg-[#e4b35e]/3">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Total Líquido Financiado</span>
                  <span className="text-sm font-extrabold text-[#04243b] font-mono mt-1 block">
                    R$ {consolidatedTotals.totalFinancedSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[8px] text-slate-500 block mt-0.5">Saldo restante somado</span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Parcela Mensal Somada</span>
                  <span className="text-sm font-extrabold text-[#04243b] font-mono mt-1 block">
                    R$ {consolidatedTotals.totalAvgInstallmentSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[8px] text-slate-500 block mt-0.5">Custo mensal consolidado</span>
                </div>
              </div>

              {/* List of active simulations */}
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {simulations.map((sim, index) => {
                  const itemResults = getSimulationResults(sim);
                  const financed = Math.max(0, sim.totalDebt - sim.downPayment);
                  return (
                    <motion.div 
                      key={sim.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between gap-4 hover:border-[#e4b35e]/30 transition-all shadow-xs"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-block px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-500">
                            #{index + 1}
                          </span>
                          <span className="text-xs font-extrabold text-[#04243b] uppercase truncate">
                            {sim.parcelamentoType}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
                          <div>
                            <span className="text-slate-500 font-normal">Valor Atualizado: </span>
                            <span className="font-mono font-bold text-[#04243b]">R$ {sim.totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-normal">Entrada: </span>
                            <span className="font-mono font-bold text-emerald-600">R$ {sim.downPayment.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-normal">{sim.installmentsCount} Parcelas: </span>
                            <span className="font-mono font-bold text-[#04243b]">R$ {itemResults.avgInstallment.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleEditSimulation(sim, e)}
                          className={`p-2 rounded-lg transition-all cursor-pointer ${
                            editingId === sim.id 
                              ? "bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300" 
                              : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                          }`}
                          title="Editar simulação"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleRemoveSimulation(sim.id, e)}
                          className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-all cursor-pointer border border-red-100"
                          title="Excluir simulação"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
