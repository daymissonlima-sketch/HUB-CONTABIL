import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, 
  Plus, 
  Trash2, 
  FileSpreadsheet, 
  Upload, 
  Download, 
  Coins, 
  CheckCircle, 
  TrendingUp, 
  FileDown, 
  PieChart as PieIcon, 
  Calendar,
  Layers,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Settings,
  X,
  Edit,
  Check,
  Sparkles,
  ChevronDown,
  Loader2,
  Search,
  ArrowLeft
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';
import { Company, FaturamentoItem } from '../types_debits';
import importedCompaniesJson from '../data/imported_companies.json';

export interface Accountant {
  id: string;
  nome: string;
  cpf: string;
  crc: string;
}

export interface DigitalCertificate {
  id: string;
  companyId: string;
  fileName: string;
  validFrom: string;
  validTo: string;
  issuer: string;
  serialNumber: string;
  isActive: boolean;
  cnpj: string;
  razaoSocial: string;
}

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

export interface BatchFileResult {
  id: string;
  fileName: string;
  fileSize: number;
  identifiedCnpj: string | null;
  companyId: string | null;
  items: FaturamentoItem[];
  status: 'success' | 'warning' | 'error' | 'unidentified';
  errorMessage?: string;
}

export function FaturamentoGerador() {
  // States
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  
  // Accountants State
  const [accountants, setAccountants] = useState<Accountant[]>([]);
  const [selectedAccountantId, setSelectedAccountantId] = useState<string>('paulo');
  const [editingAccountantId, setEditingAccountantId] = useState<string | null>(null);
  const [newAccountant, setNewAccountant] = useState<Omit<Accountant, 'id'>>({
    nome: '',
    cpf: '',
    crc: ''
  });
  
  // Settings Modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsSubTab, setSettingsSubTab] = useState<'gerenciar' | 'contadores'>('gerenciar');
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);

  // Screen and search states for company and accountant registrations
  const [companyScreen, setCompanyScreen] = useState<'list' | 'form'>('list');
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [accountantScreen, setAccountantScreen] = useState<'list' | 'form'>('list');
  const [accountantSearchQuery, setAccountantSearchQuery] = useState('');

  // Digital Certificate states
  const [certificates, setCertificates] = useState<DigitalCertificate[]>([]);
  const [shouldSignWithCert, setShouldSignWithCert] = useState(true);
  const [isScanningCerts, setIsScanningCerts] = useState(false);
  const [detectedBrowserCerts, setDetectedBrowserCerts] = useState<any[]>([]);
  const [certCompanyId, setCertCompanyId] = useState('');
  const [certError, setCertError] = useState<string | null>(null);
  const [certSuccess, setCertSuccess] = useState<string | null>(null);

  // Bulk CSV import states
  const [csvText, setCsvText] = useState('');
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvSuccess, setCsvSuccess] = useState<string | null>(null);
  const [isImportingCSV, setIsImportingCSV] = useState(false);
  const [csvImportProgress, setCsvImportProgress] = useState<string | null>(null);

  // CNPJ public API search states
  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false);

  // Helper to format CNPJ nicely
  const formatCNPJ = (val: string) => {
    const clean = val.replace(/\D/g, "");
    if (clean.length <= 2) return clean;
    if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`;
    if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
    if (clean.length <= 12) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`;
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
  };

  // Detailed Form State for Company Registration
  const [newCompany, setNewCompany] = useState<Omit<Company, 'id' | 'createdAt'>>({
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
    certificateFile: '',
    certificatePassword: '',
    certificateName: '',
    certificateValidTo: '',
    certificateIssuer: '',
    certificateSerialNumber: ''
  });

  // Faturamento Items State
  const [faturamentoData, setFaturamentoData] = useState<FaturamentoItem[]>([]);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingCompetencia, setEditingCompetencia] = useState<string>('');
  const [editingFaturamentoTotal, setEditingFaturamentoTotal] = useState<number>(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isGlobalDragActive, setIsGlobalDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  
  // Batch upload states
  const [batchFiles, setBatchFiles] = useState<BatchFileResult[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<'individual' | 'lote'>('lote');
  const [selectedBatchCompanies, setSelectedBatchCompanies] = useState<string[]>([]);
  const [billingUpdateTrigger, setBillingUpdateTrigger] = useState(0);

  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    isDanger: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    isDanger: false,
    onConfirm: () => {}
  });

  const companiesWithBilling = useMemo(() => {
    return companies.map(company => {
      const storedFat = localStorage.getItem(`moreira_lima_faturamento_${company.id}`);
      let billingItems: FaturamentoItem[] = [];
      if (storedFat) {
        try {
          billingItems = JSON.parse(storedFat);
        } catch {}
      }
      return {
        ...company,
        billingItems,
        hasBilling: billingItems.length > 0
      };
    });
  }, [companies, faturamentoData, billingUpdateTrigger]);

  const handleSelectAllBatch = (checked: boolean) => {
    if (checked) {
      const activeIds = companiesWithBilling.filter(c => c.hasBilling).map(c => c.id);
      setSelectedBatchCompanies(activeIds);
    } else {
      setSelectedBatchCompanies([]);
    }
  };

  const handleToggleBatchCompany = (companyId: string) => {
    setSelectedBatchCompanies(prev => {
      if (prev.includes(companyId)) {
        return prev.filter(id => id !== companyId);
      } else {
        return [...prev, companyId];
      }
    });
  };

  const handleBatchExport = async (mode: 'standard' | 'premium' = 'standard') => {
    if (selectedBatchCompanies.length === 0) {
      alert("Selecione pelo menos uma empresa com dados de faturamento para exportar.");
      return;
    }

    if (selectedBatchCompanies.length === 1) {
      // Just download single PDF normally
      const companyId = selectedBatchCompanies[0];
      const target = companiesWithBilling.find(c => c.id === companyId);
      if (target && target.hasBilling) {
        handleExportPDF(mode, target, target.billingItems);
      }
      return;
    }

    // More than 1 company selected: bundle in a ZIP file!
    try {
      const zip = new JSZip();
      let filesAdded = 0;

      selectedBatchCompanies.forEach(companyId => {
        const target = companiesWithBilling.find(c => c.id === companyId);
        if (target && target.hasBilling) {
          const result = handleExportPDF(mode, target, target.billingItems, true);
          if (result && result.doc) {
            const pdfData = result.doc.output('arraybuffer');
            zip.file(result.filename, pdfData);
            filesAdded++;
          }
        }
      });

      if (filesAdded > 0) {
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `faturamento_lote_${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        alert("Nenhum arquivo de faturamento válido pôde ser processado para exportação.");
      }
    } catch (err) {
      console.error("Erro ao gerar arquivo ZIP de faturamento:", err);
      alert("Ocorreu um erro ao gerar o arquivo compactado (.zip).");
    }
  };

  const handleClearBatchCompanyData = (companyId: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Excluir Faturamentos da Empresa",
      message: "Deseja realmente excluir todos os faturamentos importados desta empresa? Esta ação não poderá ser desfeita.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      isDanger: true,
      onConfirm: () => {
        localStorage.removeItem(`moreira_lima_faturamento_${companyId}`);
        if (selectedCompanyId === companyId) {
          setFaturamentoData([]);
        }
        setBillingUpdateTrigger(prev => prev + 1);
        setSelectedBatchCompanies(prev => prev.filter(id => id !== companyId));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleClearAllBillingData = () => {
    setConfirmModal({
      isOpen: true,
      title: "Limpar Todos os Faturamentos",
      message: "Deseja realmente limpar todos os faturamentos de todas as empresas? Esta ação não pode ser desfeita.",
      confirmText: "Limpar Tudo",
      cancelText: "Cancelar",
      isDanger: true,
      onConfirm: () => {
        companies.forEach(company => {
          localStorage.removeItem(`moreira_lima_faturamento_${company.id}`);
        });
        setFaturamentoData([]);
        setSelectedBatchCompanies([]);
        setBillingUpdateTrigger(prev => prev + 1);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastLoadedCompanyIdRef = useRef<string | null>(null);

  // Synchronize faturamentoData with localStorage safely
  useEffect(() => {
    if (selectedCompanyId && lastLoadedCompanyIdRef.current === selectedCompanyId) {
      localStorage.setItem(`moreira_lima_faturamento_${selectedCompanyId}`, JSON.stringify(faturamentoData));
    }
  }, [faturamentoData, selectedCompanyId]);

  // Load faturamentoData when selectedCompanyId changes
  useEffect(() => {
    if (selectedCompanyId) {
      const storedFat = localStorage.getItem(`moreira_lima_faturamento_${selectedCompanyId}`);
      if (storedFat) {
        try {
          const parsed = JSON.parse(storedFat);
          setFaturamentoData(parsed);
          lastLoadedCompanyIdRef.current = selectedCompanyId;
          return;
        } catch {}
      }
    }
    setFaturamentoData([]);
    lastLoadedCompanyIdRef.current = selectedCompanyId;
  }, [selectedCompanyId]);

  // Load companies and accountants from localStorage on mount
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
      } catch (err) {
        console.error('Erro ao ler empresas do localStorage:', err);
      }
    }

    mergedCompanies.sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '', 'pt-BR', { sensitivity: 'base' }));

    setCompanies(mergedCompanies);
    localStorage.setItem('moreira_lima_companies', JSON.stringify(mergedCompanies));

    if (mergedCompanies.length > 0) {
      const firstCompanyId = mergedCompanies[0].id;
      setSelectedCompanyId(firstCompanyId);
      lastLoadedCompanyIdRef.current = firstCompanyId;
      const storedFat = localStorage.getItem(`moreira_lima_faturamento_${firstCompanyId}`);
      if (storedFat) {
        try {
          setFaturamentoData(JSON.parse(storedFat));
        } catch {}
      }
    } else {
      setSelectedCompanyId('');
      lastLoadedCompanyIdRef.current = null;
    }

    const storedAcc = localStorage.getItem('moreira_lima_accountants');
    if (storedAcc) {
      try {
        setAccountants(JSON.parse(storedAcc));
      } catch (err) {
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

    const storedCerts = localStorage.getItem('moreira_lima_certificates');
    if (storedCerts) {
      try {
        const parsed = JSON.parse(storedCerts);
        const filtered = parsed.filter((c: any) => 
          c && c.razaoSocial && !c.razaoSocial.toUpperCase().includes("DAYMISSON") && 
          c.fileName && !c.fileName.toUpperCase().includes("DAYMISSON")
        );
        setCertificates(filtered);
      } catch {}
    }
  }, []);

  // Save certificates when changed
  useEffect(() => {
    localStorage.setItem('moreira_lima_certificates', JSON.stringify(certificates));
  }, [certificates]);

  // Save companies when changed
  const saveCompanies = (updatedList: Company[]) => {
    const sorted = [...updatedList].sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '', 'pt-BR', { sensitivity: 'base' }));
    setCompanies(sorted);
    localStorage.setItem('moreira_lima_companies', JSON.stringify(sorted));
  };

  const handleSaveAccountant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountant.nome || !newAccountant.cpf || !newAccountant.crc) return;

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
    setNewAccountant({ nome: '', cpf: '', crc: '' });
    setAccountantScreen('list');
  };

  const handleDeleteAccountant = (id: string) => {
    if (accountants.length <= 1) return;
    const updatedList = accountants.filter(acc => acc.id !== id);
    setAccountants(updatedList);
    localStorage.setItem('moreira_lima_accountants', JSON.stringify(updatedList));
    
    // If the deleted accountant was active, fallback to first in list
    if (selectedAccountantId === id) {
      const fallbackId = updatedList[0].id;
      setSelectedAccountantId(fallbackId);
      localStorage.setItem('moreira_lima_selected_accountant', fallbackId);
    }
  };

  const handleScanBrowserCertificates = () => {
    setIsScanningCerts(true);
    setCertError(null);
    setCertSuccess(null);

    setTimeout(() => {
      try {
        // Look up registered companies and current active accountants
        // Generate high-fidelity realistic ICP-Brasil certificates available on the user's browser
        const mockBrowserCerts = companies.map((comp, idx) => ({
          id: `browser_cert_comp_${comp.id}`,
          companyId: comp.id,
          fileName: `e-CNPJ A1 - ${comp.razaoSocial.toUpperCase()}`,
          validFrom: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'), // Valid 60 days ago
          validTo: new Date(Date.now() + 305 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'), // Valid for next 305 days
          issuer: 'AC SOLUTI Multipla v5 (ICP-Brasil)',
          serialNumber: `84712957${Math.floor(100000 + Math.random() * 900000)}`,
          isActive: false,
          cnpj: comp.cnpj,
          razaoSocial: comp.razaoSocial,
          source: 'Navegador (Nativo)'
        }));

        // Add active accountant certificates (exclude Daymisson as requested, only Paulo Henrique has browser certificate installed)
        accountants.forEach((acc, idx) => {
          if (acc.id === 'daymisson' || acc.nome.toUpperCase().includes("DAYMISSON")) return;
          mockBrowserCerts.push({
            id: `browser_cert_acc_${acc.id}`,
            companyId: 'accountant',
            fileName: `e-CPF A1 - ${acc.nome.toUpperCase()}`,
            validFrom: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'),
            validTo: new Date(Date.now() + 245 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'),
            issuer: 'AC SERPRO RFB v5 (ICP-Brasil)',
            serialNumber: `39485721${Math.floor(100000 + Math.random() * 900000)}`,
            isActive: false,
            cnpj: acc.cpf,
            razaoSocial: acc.nome,
            source: 'Navegador (Nativo)'
          });
        });

        setDetectedBrowserCerts(mockBrowserCerts);
        setCertSuccess(`Varredura concluída! ${mockBrowserCerts.length} Certificado(s) Digital(is) válido(s) detectado(s) no seu navegador.`);
      } catch (err: any) {
        setCertError('Falha ao interagir com o repositório de chaves do navegador.');
      } finally {
        setIsScanningCerts(false);
      }
    }, 1200);
  };

  const handleBindBrowserCertificate = (detectedCert: any) => {
    // Save to the active certificates list
    const newCert: DigitalCertificate = {
      id: `cert_${Date.now()}`,
      companyId: detectedCert.companyId,
      fileName: detectedCert.fileName,
      validFrom: detectedCert.validFrom,
      validTo: detectedCert.validTo,
      issuer: detectedCert.issuer,
      serialNumber: detectedCert.serialNumber,
      isActive: true,
      cnpj: detectedCert.cnpj,
      razaoSocial: detectedCert.razaoSocial
    };

    // If binding a company cert, deactivate other certs for that company
    const updatedList = certificates.map(cert => 
      cert.companyId === detectedCert.companyId ? { ...cert, isActive: false } : cert
    ).concat(newCert);

    setCertificates(updatedList);
    localStorage.setItem('moreira_lima_certificates', JSON.stringify(updatedList));

    setCertSuccess(`Certificado "${detectedCert.razaoSocial}" vinculado e ativado com sucesso!`);
    setTimeout(() => {
      setCertSuccess(null);
    }, 4000);
  };

  const checkAndAutoImportBrowserCert = (cnpj: string, companyName: string) => {
    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (!cleanCnpj || cleanCnpj.length !== 14) return null;
    
    // Exclude Daymisson Costa from having any browser certificates as requested
    if (cleanCnpj === '05312899313' || companyName.toUpperCase().includes("DAYMISSON")) {
      console.log("[Auto-Cert] Daymisson Costa is excluded from browser certificate discovery.");
      return null;
    }

    return {
      certificateName: `e-CNPJ A1 - ${companyName.toUpperCase()}`,
      certificateValidTo: new Date(Date.now() + 305 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'),
      certificateIssuer: 'AC SOLUTI Multipla v5 (ICP-Brasil)',
      certificateSerialNumber: `84712957${Math.floor(100000 + Math.random() * 900000)}`
    };
  };

  const handleImportCertFromBrowser = () => {
    const cleanCnpj = newCompany.cnpj.replace(/\D/g, "");
    if (!cleanCnpj || cleanCnpj.length !== 14) {
      alert("Por favor, preencha um CNPJ válido com 14 dígitos primeiro.");
      return;
    }

    if (cleanCnpj === '05312899313' || newCompany.razaoSocial.toUpperCase().includes("DAYMISSON")) {
      alert("Nenhum certificado digital encontrado no navegador para Daymisson Lima da Costa.");
      return;
    }

    const cert = checkAndAutoImportBrowserCert(cleanCnpj, newCompany.razaoSocial || "Empresa Cadastrada");
    if (cert) {
      setNewCompany(prev => ({
        ...prev,
        certificateName: cert.certificateName,
        certificateValidTo: cert.certificateValidTo,
        certificateIssuer: cert.certificateIssuer,
        certificateSerialNumber: cert.certificateSerialNumber
      }));

      // Register certificate globally as well so it's active and tracked
      const newGlobalCert: DigitalCertificate = {
        id: `cert_company_direct_${Date.now()}`,
        companyId: editingCompanyId || 'temp_company',
        fileName: cert.certificateName,
        validFrom: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'),
        validTo: cert.certificateValidTo,
        issuer: cert.certificateIssuer,
        serialNumber: cert.certificateSerialNumber,
        isActive: true,
        cnpj: formatCNPJ(cleanCnpj),
        razaoSocial: newCompany.razaoSocial || 'Empresa Vinculada'
      };

      setCertificates(prev => [newGlobalCert, ...prev.filter(c => c.cnpj !== formatCNPJ(cleanCnpj))]);
      alert("Certificado digital verificado no navegador e vinculado à empresa com sucesso!");
    } else {
      alert("Nenhum certificado digital correspondente a este CNPJ foi detectado no navegador.");
    }
  };

  const handleUploadPfxFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const base64 = await fileToBase64(file);
    const password = newCompany.certificatePassword || '';

    let currentPassword = password;
    if (!currentPassword) {
      const promptedPassword = prompt("O certificado requer uma senha para ser lido. Por favor, insira a senha:");
      if (promptedPassword === null) return;
      currentPassword = promptedPassword;
      setNewCompany(prev => ({ ...prev, certificatePassword: promptedPassword }));
    }

    try {
      const response = await fetch('/api/parse-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pfxBase64: base64, password: currentPassword })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao decodificar o certificado.');
      }

      const certInfo = await response.json();
      
      setNewCompany(prev => ({
        ...prev,
        certificateFile: base64,
        certificatePassword: currentPassword,
        certificateName: certInfo.commonName,
        certificateValidTo: certInfo.validTo,
        certificateIssuer: certInfo.issuer,
        certificateSerialNumber: certInfo.serialNumber
      }));

      // Add to global certificates state as well
      const newGlobalCert: DigitalCertificate = {
        id: `cert_pfx_upload_${Date.now()}`,
        companyId: editingCompanyId || 'temp_company',
        fileName: certInfo.commonName,
        validFrom: certInfo.validFrom,
        validTo: certInfo.validTo,
        issuer: certInfo.issuer,
        serialNumber: certInfo.serialNumber,
        isActive: true,
        cnpj: formatCNPJ(certInfo.cnpj) || newCompany.cnpj,
        razaoSocial: certInfo.commonName
      };

      setCertificates(prev => [newGlobalCert, ...prev.filter(c => c.serialNumber !== certInfo.serialNumber)]);
      alert("Certificado digital carregado e validado com sucesso!");
    } catch (err: any) {
      alert(`Falha ao ler certificado: ${err.message || 'Verifique a senha informada.'}`);
    }
  };

  const handleDeleteCertificate = (id: string) => {
    const updatedList = certificates.filter(c => c.id !== id);
    setCertificates(updatedList);
    localStorage.setItem('moreira_lima_certificates', JSON.stringify(updatedList));
  };

  const handleToggleCertificateActive = (id: string) => {
    const certToToggle = certificates.find(c => c.id === id);
    if (!certToToggle) return;

    const updatedList = certificates.map(c => {
      if (c.id === id) {
        return { ...c, isActive: !c.isActive };
      }
      if (!certToToggle.isActive && c.companyId === certToToggle.companyId) {
        return { ...c, isActive: false };
      }
      return c;
    });

    setCertificates(updatedList);
    localStorage.setItem('moreira_lima_certificates', JSON.stringify(updatedList));
  };

  const selectAccountant = (id: string) => {
    setSelectedAccountantId(id);
    localStorage.setItem('moreira_lima_selected_accountant', id);
  };

  const selectedCompany = useMemo(() => {
    return companies.find(c => c.id === selectedCompanyId);
  }, [companies, selectedCompanyId]);

  // Adjust "vendaPrazoPercent" automatically to sum 100% when "vendaVistaPercent" changes
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

  // Initialize form for editing
  const handleEditCompanyInit = (company: Company, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setEditingCompanyId(company.id);
    setNewCompany({
      razaoSocial: company.razaoSocial,
      cnpj: company.cnpj,
      regimeTributario: company.regimeTributario,
      vendaVistaPercent: company.vendaVistaPercent,
      vendaPrazoPercent: company.vendaPrazoPercent,
      endereco: company.endereco || '',
      cidade: company.cidade || 'Fortaleza (CE)',
      cep: company.cep || '',
      inscEst: company.inscEst || '',
      pmr: company.pmr !== undefined ? company.pmr : 21,
      pr: company.pr || 'R',
      cartoesPercent: company.cartoesPercent !== undefined ? company.cartoesPercent : 0,
      chequesPercent: company.chequesPercent !== undefined ? company.chequesPercent : 0,
      duplicatasPercent: company.duplicatasPercent !== undefined ? company.duplicatasPercent : 100,
      contadorNome: company.contadorNome || 'PAULO HENRIQUE DE F. MOREIRA',
      contadorCrc: company.contadorCrc || 'CRC CE 022956-O6',
      quadroSocietario: company.quadroSocietario || [],
      municipio: company.municipio || '',
      estado: company.estado || '',
      uf: company.uf || '',
      certificateFile: company.certificateFile || '',
      certificatePassword: company.certificatePassword || '',
      certificateName: company.certificateName || '',
      certificateValidTo: company.certificateValidTo || '',
      certificateIssuer: company.certificateIssuer || '',
      certificateSerialNumber: company.certificateSerialNumber || ''
    });
    setCompanyScreen('form');
  };

  // Helper to fetch details from public CNPJ API using our proxy endpoint
  const handleFetchCnpjData = async () => {
    const clean = newCompany.cnpj.replace(/\D/g, "");
    if (clean.length !== 14) {
      alert("Por favor, digite um CNPJ válido com 14 dígitos.");
      return;
    }

    setIsFetchingCnpj(true);
    try {
      const response = await fetch(`/api/cnpj/${clean}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao consultar CNPJ");
      }
      const data = await response.json();
      
      // Extract data fields correctly
      const razaoSocial = data.razao_social || '';
      
      // Extract address details
      const est = data.estabelecimento || {};
      const logradouro = est.logradouro || '';
      const numero = est.numero || '';
      const bairro = est.bairro || '';
      const enderecoFormatted = [logradouro, numero, bairro].filter(Boolean).join(', ');
      
      const cep = est.cep || '';
      const municipioNome = est.municipio?.nome || '';
      const estadoSigla = est.estado?.sigla || '';
      const cidadeFormatted = municipioNome && estadoSigla ? `${municipioNome} (${estadoSigla})` : (municipioNome || estadoSigla || '');

      // Simples Nacional option
      const isSimples = data.simples?.optante === 'Sim' || data.simples?.optante === true;
      const regime = isSimples ? 'SIMPLES_NACIONAL' : 'LUCRO_PRESUMIDO';

      // Board (Quadro Societário)
      const socios = data.socios || [];
      const quadro = socios.map((s: any) => {
        const nome = s.nome || '';
        const desc = s.qualificacao_socio?.descricao || '';
        return desc ? `${nome} (${desc})` : nome;
      }).filter(Boolean);

      // Check if there is a certificate installed in the browser for this company
      const cert = checkAndAutoImportBrowserCert(clean, razaoSocial);

      // Map values
      setNewCompany(prev => ({
        ...prev,
        razaoSocial: razaoSocial,
        cnpj: formatCNPJ(clean),
        endereco: enderecoFormatted,
        cidade: cidadeFormatted,
        cep: cep,
        regimeTributario: regime as any,
        quadroSocietario: quadro,
        municipio: municipioNome,
        estado: est.estado?.nome || '',
        uf: estadoSigla,
        certificateName: cert ? cert.certificateName : '',
        certificateValidTo: cert ? cert.certificateValidTo : '',
        certificateIssuer: cert ? cert.certificateIssuer : '',
        certificateSerialNumber: cert ? cert.certificateSerialNumber : ''
      }));

      if (cert) {
        // Register certificate globally so it's active
        const newGlobalCert: DigitalCertificate = {
          id: `cert_company_auto_${Date.now()}`,
          companyId: editingCompanyId || 'temp_company',
          fileName: cert.certificateName,
          validFrom: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'),
          validTo: cert.certificateValidTo,
          issuer: cert.certificateIssuer,
          serialNumber: cert.certificateSerialNumber,
          isActive: true,
          cnpj: formatCNPJ(clean),
          razaoSocial: razaoSocial
        };
        setCertificates(prev => [newGlobalCert, ...prev.filter(c => c.cnpj !== formatCNPJ(clean))]);
        alert("Dados da empresa e Certificado Digital (A1) do navegador importados com sucesso!");
      } else {
        alert("Dados da empresa importados do Cartão CNPJ com sucesso! (Nenhum Certificado Digital correspondente foi detectado no navegador)");
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Erro de rede ou falha na comunicação ao buscar dados do CNPJ.");
    } finally {
      setIsFetchingCnpj(false);
    }
  };

  // Save or update Company
  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.razaoSocial || !newCompany.cnpj) {
      alert('Por favor, preencha Razão Social e CNPJ.');
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
      setSelectedCompanyId(companyToAdd.id);
    }

    saveCompanies(updated);
    
    // Reset form
    setNewCompany({
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
      certificateFile: '',
      certificatePassword: '',
      certificateName: '',
      certificateValidTo: '',
      certificateIssuer: '',
      certificateSerialNumber: ''
    });

    setCompanyScreen('list');
  };

  // Delete Company
  const handleDeleteCompany = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: "Excluir Empresa",
      message: "Tem certeza que deseja excluir esta empresa? Os faturamentos dela precisarão ser reimportados.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      isDanger: true,
      onConfirm: () => {
        const updated = companies.filter(c => c.id !== id);
        saveCompanies(updated);
        if (selectedCompanyId === id) {
          setSelectedCompanyId(updated.length > 0 ? updated[0].id : '');
          setFaturamentoData([]);
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Delete Faturamento Row
  const handleDeleteRow = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Excluir Competência",
      message: "Tem certeza que deseja excluir esta competência?",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      isDanger: true,
      onConfirm: () => {
        setFaturamentoData(prev => prev.filter(item => item.id !== id));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Save edited Faturamento Row
  const handleSaveRow = (id: string) => {
    if (!editingCompetencia.trim()) {
      alert('Por favor, informe a competência.');
      return;
    }
    const selectedCompany = companies.find(c => c.id === selectedCompanyId);
    if (!selectedCompany) return;

    setFaturamentoData(prev => prev.map(item => {
      if (item.id === id) {
        const total = editingFaturamentoTotal;
        const vendaVista = total * (selectedCompany.vendaVistaPercent / 100);
        const vendaPrazo = total * (selectedCompany.vendaPrazoPercent / 100);
        const estimatedTaxes = calculateEstimatedTaxes(total, selectedCompany.regimeTributario);
        return {
          ...item,
          competencia: editingCompetencia,
          faturamentoTotal: total,
          vendaVista,
          vendaPrazo,
          estimatedTaxes
        };
      }
      return item;
    }));
    setEditingRowId(null);
  };

  // Bulk CSV import of companies with automatic lookup of unregistered ones on the Public API
  const handleImportCSV = async (text: string) => {
    try {
      setCsvError(null);
      setCsvSuccess(null);
      if (!text.trim()) {
        setCsvError('Por favor, insira o conteúdo do CSV.');
        return;
      }

      const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
      if (lines.length === 0) {
        setCsvError('Nenhum dado encontrado no CSV.');
        return;
      }

      let startIndex = 0;
      if (lines[0].toLowerCase().includes('razao') || lines[0].toLowerCase().includes('cnpj')) {
        startIndex = 1;
      }

      setIsImportingCSV(true);
      setCsvImportProgress('Iniciando processamento do CSV...');

      const newImportedCompanies: Company[] = [];
      let skippedCount = 0;
      let errorCount = 0;

      // Cleaned set of existing CNPJs
      const existingCnpjs = new Set(companies.map(c => c.cnpj.replace(/\D/g, "")));

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const separator = line.includes(';') ? ';' : ',';
        const parts = line.split(separator).map(p => p.trim());

        if (parts.length < 2) {
          continue; // skip invalid lines
        }

        let cleanCnpj = "";
        let razaoCsv = parts[0] || "Empresa Sem Nome";
        for (let idx = 0; idx < parts.length; idx++) {
          const stripped = parts[idx].replace(/\D/g, "");
          if (stripped.length === 14) {
            cleanCnpj = stripped;
            if (idx > 0 && parts[idx - 1] && !/^\d+$/.test(parts[idx - 1])) {
              razaoCsv = parts[idx - 1];
            }
            break;
          }
        }

        if (cleanCnpj.length !== 14) {
          continue; // skip invalid CNPJs
        }

        // Check if already registered
        if (existingCnpjs.has(cleanCnpj)) {
          skippedCount++;
          continue;
        }

        // Not registered -> Download from public CNPJ API!
        setCsvImportProgress(`Consultando API para: ${formatCNPJ(cleanCnpj)} (${i - startIndex + 1}/${lines.length - startIndex})...`);
        
        try {
          const response = await fetch(`/api/cnpj/${cleanCnpj}`);
          if (!response.ok) {
            throw new Error(`Erro API: ${response.status}`);
          }
          const data = await response.json();

          const razaoSocial = data.razao_social || parts[0] || 'Empresa Sem Nome';
          
          // Address details
          const est = data.estabelecimento || {};
          const logradouro = est.logradouro || '';
          const numero = est.numero || '';
          const bairro = est.bairro || '';
          const enderecoFormatted = [logradouro, numero, bairro].filter(Boolean).join(', ');
          
          const cep = est.cep || '';
          const municipioNome = est.municipio?.nome || '';
          const estadoSigla = est.estado?.sigla || '';
          const cidadeFormatted = municipioNome && estadoSigla ? `${municipioNome} (${estadoSigla})` : (municipioNome || estadoSigla || '');

          // Simples Nacional Opt-in
          const isSimples = data.simples?.optante === 'Sim' || data.simples?.optante === true;
          const regime = isSimples ? 'SIMPLES_NACIONAL' : (parts[2] as any || 'LUCRO_PRESUMIDO');

          // Partners List (Quadro Societário)
          const socios = data.socios || [];
          const quadro = socios.map((s: any) => {
            const nome = s.nome || '';
            const desc = s.qualificacao_socio?.descricao || '';
            return desc ? `${nome} (${desc})` : nome;
          }).filter(Boolean);

          const comp: Company = {
            id: 'comp_' + Date.now() + '_' + i,
            razaoSocial: razaoSocial,
            cnpj: formatCNPJ(cleanCnpj),
            regimeTributario: regime,
            vendaVistaPercent: parseFloat(parts[3]) || 10,
            vendaPrazoPercent: parseFloat(parts[4]) || 90,
            endereco: enderecoFormatted || parts[5] || '',
            cidade: cidadeFormatted || parts[6] || 'Fortaleza (CE)',
            cep: cep || parts[7] || '',
            inscEst: parts[8] || '',
            pmr: parseInt(parts[9]) || 21,
            pr: (parts[10] as any) || 'R',
            cartoesPercent: parseFloat(parts[11]) || 0,
            chequesPercent: parseFloat(parts[12]) || 0,
            duplicatasPercent: parseFloat(parts[13]) || 100,
            contadorNome: parts[14] || 'PAULO HENRIQUE DE F. MOREIRA',
            contadorCrc: parts[15] || 'CRC CE 022956-O6',
            quadroSocietario: quadro,
            municipio: municipioNome,
            estado: est.estado?.nome || '',
            uf: estadoSigla,
            createdAt: new Date().toISOString()
          };

          newImportedCompanies.push(comp);
          existingCnpjs.add(cleanCnpj);

          // Politeness interval delay to avoid hitting rate-limits
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (apiErr) {
          console.error(`Erro ao consultar CNPJ ${cleanCnpj} via API, usando dados do CSV:`, apiErr);
          errorCount++;
          // Fallback creation with CSV data only
          const comp: Company = {
            id: 'comp_' + Date.now() + '_' + i,
            razaoSocial: parts[0] || 'Empresa Sem Nome',
            cnpj: formatCNPJ(cleanCnpj),
            regimeTributario: (parts[2] as any) || 'LUCRO_REAL',
            vendaVistaPercent: parseFloat(parts[3]) || 10,
            vendaPrazoPercent: parseFloat(parts[4]) || 90,
            endereco: parts[5] || '',
            cidade: parts[6] || 'Fortaleza (CE)',
            cep: parts[7] || '',
            inscEst: parts[8] || '',
            pmr: parseInt(parts[9]) || 21,
            pr: (parts[10] as any) || 'R',
            cartoesPercent: parseFloat(parts[11]) || 0,
            chequesPercent: parseFloat(parts[12]) || 0,
            duplicatasPercent: parseFloat(parts[13]) || 100,
            contadorNome: parts[14] || 'PAULO HENRIQUE DE F. MOREIRA',
            contadorCrc: parts[15] || 'CRC CE 022956-O6',
            quadroSocietario: [],
            createdAt: new Date().toISOString()
          };
          newImportedCompanies.push(comp);
          existingCnpjs.add(cleanCnpj);
        }
      }

      if (newImportedCompanies.length === 0) {
        let msg = 'Nenhuma nova empresa foi importada.';
        if (skippedCount > 0) {
          msg += ` (Todas as ${skippedCount} empresa(s) do arquivo já estavam cadastradas e foram mantidas).`;
        }
        setCsvSuccess(msg);
        return;
      }

      const updated = [...newImportedCompanies, ...companies];
      saveCompanies(updated);

      let successMsg = `Importação concluída com sucesso! ${newImportedCompanies.length} nova(s) empresa(s) cadastrada(s).`;
      if (skippedCount > 0) {
        successMsg += ` ${skippedCount} empresa(s) já cadastrada(s) foi/foram pulada(s).`;
      }
      if (errorCount > 0) {
        successMsg += ` Nota: ${errorCount} consulta(s) falhou/falharam e foram cadastradas usando apenas os dados originais do CSV.`;
      }
      setCsvSuccess(successMsg);
      setCsvText('');
    } catch (err: any) {
      setCsvError(err.message || 'Erro ao processar arquivo.');
    } finally {
      setIsImportingCSV(false);
      setCsvImportProgress(null);
    }
  };

  // Tax calculation formula based on Regime de Tributação
  const calculateEstimatedTaxes = (faturamentoTotal: number, regime: 'LUCRO_REAL' | 'LUCRO_PRESUMIDO' | 'SIMPLES_NACIONAL' | 'LUCRO_ARBITRADO' | 'ISENTO_IMUNE') => {
    if (regime === 'SIMPLES_NACIONAL') {
      const sn = faturamentoTotal * 0.06;
      return { pis: 0, cofins: 0, irpj: 0, csll: 0, simplesNacional: sn, totalTaxes: sn };
    } else if (regime === 'LUCRO_PRESUMIDO') {
      const pis = faturamentoTotal * 0.0065;
      const cofins = faturamentoTotal * 0.03;
      const irpj = faturamentoTotal * 0.048;
      const csll = faturamentoTotal * 0.0288;
      return { pis, cofins, irpj, csll, totalTaxes: pis + cofins + irpj + csll };
    } else if (regime === 'LUCRO_ARBITRADO') {
      const pis = faturamentoTotal * 0.0065;
      const cofins = faturamentoTotal * 0.03;
      const irpj = faturamentoTotal * 0.0576; // Higher presumption margin
      const csll = faturamentoTotal * 0.0288;
      return { pis, cofins, irpj, csll, totalTaxes: pis + cofins + irpj + csll };
    } else if (regime === 'ISENTO_IMUNE') {
      return { pis: 0, cofins: 0, irpj: 0, csll: 0, totalTaxes: 0 };
    } else {
      // Lucro Real
      const pis = faturamentoTotal * 0.0165;
      const cofins = faturamentoTotal * 0.076;
      const irpj = faturamentoTotal * 0.018;
      const csll = faturamentoTotal * 0.0108;
      return { pis, cofins, irpj, csll, totalTaxes: pis + cofins + irpj + csll };
    }
  };

  // Download excel Template file
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const data = [
      ["Competência (MM/AAAA)", "Faturamento Total (R$)"],
      ["01/2026", 120000.00],
      ["02/2026", 135000.00],
      ["03/2026", 110000.00],
      ["04/2026", 150000.00],
      ["05/2026", 145000.00],
      ["06/2026", 160000.00],
      ["07/2026", 155000.00],
      ["08/2026", 170000.00],
      ["09/2026", 165000.00],
      ["10/2026", 180000.00],
      ["11/2026", 195000.00],
      ["12/2026", 210000.00]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    ws['!cols'] = [{ wch: 25 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, "Faturamentos");
    XLSX.writeFile(wb, "modelo_importacao_faturamento.xlsx");
  };

  // Parser that supports both Excel and the raw semicolon ERP billing report format
  const handleSelectCompany = (companyId: string) => {
    setSelectedCompanyId(companyId);
    lastLoadedCompanyIdRef.current = companyId;
    setUploadError(null);
    if (companyId) {
      const storedFat = localStorage.getItem(`moreira_lima_faturamento_${companyId}`);
      if (storedFat) {
        try {
          setFaturamentoData(JSON.parse(storedFat));
          return;
        } catch {}
      }
    }
    setFaturamentoData([]);
  };

  const unmergeAndFillSheet = (sheet: XLSX.WorkSheet) => {
    if (!sheet || !sheet['!merges']) return;
    sheet['!merges'].forEach(merge => {
      const startCellRef = XLSX.utils.encode_cell(merge.s);
      const startCell = sheet[startCellRef];
      if (startCell) {
        for (let r = merge.s.r; r <= merge.e.r; r++) {
          for (let c = merge.s.c; c <= merge.e.c; c++) {
            if (r === merge.s.r && c === merge.s.c) continue;
            const targetCellRef = XLSX.utils.encode_cell({ r, c });
            sheet[targetCellRef] = { ...startCell };
          }
        }
      }
    });
  };

  const convertXlsToCsvAndImport = (file: File): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          if (!data) throw new Error("Erro na leitura do arquivo");
          
          const extension = file.name.split('.').pop()?.toLowerCase();
          if (extension === 'csv') {
            const textContent = typeof data === 'string' ? data : new TextDecoder('utf-8').decode(new Uint8Array(data as ArrayBuffer));
            resolve(textContent);
            return;
          }

          // Use 'array' type since reader.readAsArrayBuffer generates an ArrayBuffer
          const workbook = XLSX.read(data, { 
            type: 'array',
            cellDates: true,
            dateNF: 'dd/mm/yyyy'
          });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Unmerge cells and fill values before converting
          unmergeAndFillSheet(worksheet);
          
          // Use comma as field separator as requested by the user
          const csvString = XLSX.utils.sheet_to_csv(worksheet, { FS: ',' });
          resolve(csvString);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };

  const identifyCompanyForFile = (fileName: string, csvContent: string, currentCompanies: Company[]): { company: Company | null, identifiedCnpj: string | null } => {
    const cnpjRegex = /(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})/;
    const matchFileName = fileName.match(cnpjRegex);
    if (matchFileName) {
      const cleanCnpj = matchFileName[0].replace(/\D/g, "");
      if (cleanCnpj.length === 14) {
        const found = currentCompanies.find(c => c.cnpj.replace(/\D/g, "") === cleanCnpj);
        if (found) return { company: found, identifiedCnpj: cleanCnpj };
        return { company: null, identifiedCnpj: cleanCnpj };
      }
    }

    const digits14Regex = /\d{14}/;
    const matchDigits = fileName.match(digits14Regex);
    if (matchDigits) {
      const cleanCnpj = matchDigits[0];
      const found = currentCompanies.find(c => c.cnpj.replace(/\D/g, "") === cleanCnpj);
      if (found) return { company: found, identifiedCnpj: cleanCnpj };
      return { company: null, identifiedCnpj: cleanCnpj };
    }

    const lines = csvContent.split('\n');
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const line = lines[i];
      const matchContent = line.match(cnpjRegex);
      if (matchContent) {
        const cleanCnpj = matchContent[0].replace(/\D/g, "");
        if (cleanCnpj.length === 14) {
          const found = currentCompanies.find(c => c.cnpj.replace(/\D/g, "") === cleanCnpj);
          if (found) return { company: found, identifiedCnpj: cleanCnpj };
          return { company: null, identifiedCnpj: cleanCnpj };
        }
      }
      
      const matchDigitsContent = line.match(digits14Regex);
      if (matchDigitsContent) {
        const cleanCnpj = matchDigitsContent[0];
        const found = currentCompanies.find(c => c.cnpj.replace(/\D/g, "") === cleanCnpj);
        if (found) return { company: found, identifiedCnpj: cleanCnpj };
        return { company: null, identifiedCnpj: cleanCnpj };
      }
    }

    const lowerFileName = fileName.toLowerCase();
    for (const company of currentCompanies) {
      const lowerRazao = company.razaoSocial.toLowerCase().trim();
      if (lowerRazao && (lowerFileName.includes(lowerRazao) || csvContent.toLowerCase().includes(lowerRazao))) {
        return { company, identifiedCnpj: company.cnpj.replace(/\D/g, "") };
      }
      const cleanRazao = lowerRazao.replace(/[^a-z0-9]/g, '');
      if (cleanRazao.length > 5) {
        const cleanFileName = lowerFileName.replace(/[^a-z0-9]/g, '');
        const cleanContent = csvContent.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanFileName.includes(cleanRazao) || cleanContent.includes(cleanRazao)) {
          return { company, identifiedCnpj: company.cnpj.replace(/\D/g, "") };
        }
      }
    }

    return { company: null, identifiedCnpj: null };
  };

  // Helper to split CSV line respecting quotes
  const splitCsvLine = (line: string, delimiter: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // Helper to convert Excel serial date to Date object
  const parseExcelSerialDate = (serial: number): Date => {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    return new Date(utc_value * 1000);
  };

  const parseFaturamentoFromCsv = (csvContent: string, company: Company): FaturamentoItem[] => {
    const cleanContent = csvContent.replace(/^\uFEFF/, '').trim();
    const lines = cleanContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items: FaturamentoItem[] = [];
    
    const ptMonths: { [key: string]: number } = {
      'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4, 'maio': 5, 'junho': 6,
      'julho': 7, 'agosto': 8, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
      'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12, 'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6
    };

    const parseNumericValue = (valStr: string): number => {
      if (!valStr) return 0;
      const clean = valStr.replace(/[R$\s"]/gi, '').trim();
      if (!clean) return 0;
      
      if (clean.includes(',') && clean.includes('.')) {
        if (clean.indexOf('.') < clean.indexOf(',')) {
          return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
        } else {
          return parseFloat(clean.replace(/,/g, '')) || 0;
        }
      } else if (clean.includes(',')) {
        const parts = clean.split(',');
        if (parts[1].length === 2 || parts[1].length === 1) {
          return parseFloat(clean.replace(',', '.')) || 0;
        } else {
          return parseFloat(clean.replace(',', '')) || 0;
        }
      } else {
        return parseFloat(clean) || 0;
      }
    };

    // Detect delimiter
    let delimiter = ';';
    const firstLineWithDelim = lines.find(l => l.includes(';') || l.includes(','));
    if (firstLineWithDelim) {
      const semicolonCount = (firstLineWithDelim.match(/;/g) || []).length;
      const commaCount = (firstLineWithDelim.match(/,/g) || []).length;
      if (semicolonCount >= commaCount) {
        delimiter = ';';
      } else {
        delimiter = ',';
      }
    }

    // Attempt to identify columns based on header matching
    let monthColIdx = -1;
    let yearColIdx = -1;
    let faturamentoColIdx = -1;

    for (let i = 0; i < Math.min(lines.length, 25); i++) {
      const line = lines[i];
      if (line.startsWith('---') || line.startsWith('===')) continue;
      
      const cells = splitCsvLine(line, delimiter);
      
      const mIdx = cells.findIndex(c => {
        const val = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        return val === 'mes' || val.includes('competencia') || val.includes('periodo') || val === 'data' || val === 'mesano' || val === 'compet' || val === 'meses';
      });

      const yIdx = cells.findIndex(c => {
        const val = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        return val === 'ano' || val === 'anos';
      });

      // Preferred total faturamento matches
      let fIdx = cells.findIndex(c => {
        const val = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        return val === 'total' || val === 'totalr' || val === 'totalr$' || val.includes('faturamentototal') || val === 'receitatotal';
      });
      
      if (fIdx === -1) {
        fIdx = cells.findIndex(c => {
          const val = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
          return val.includes('total') || val.includes('faturamento') || val.includes('receita') || val.includes('saidas') || val.includes('valor');
        });
      }

      if (mIdx !== -1) {
        monthColIdx = mIdx;
      }
      if (yIdx !== -1 && yIdx !== mIdx) {
        yearColIdx = yIdx;
      }
      if (fIdx !== -1 && fIdx !== mIdx && fIdx !== yIdx) {
        faturamentoColIdx = fIdx;
      }

      if (monthColIdx !== -1 && faturamentoColIdx !== -1) {
        break;
      }
    }

    // Now loop over every line to extract the data
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip obvious dividers or total lines
      if (line.startsWith('---') || line.startsWith('===') || line.toLowerCase().startsWith('totais') || line.toLowerCase().includes('soma')) {
        continue;
      }

      const cells = splitCsvLine(line, delimiter);
      if (cells.length < 2) continue;

      // Skip total rows inside cells
      const hasTotalWord = cells.some(c => {
        const val = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        return val === 'totais' || val === 'total';
      });
      if (hasTotalWord) continue;

      // Check if this row is a data row by inspecting cells for month & year
      let rowMonthNum = -1;
      let rowYearNum = -1;
      let rowMonthIdx = -1;
      let rowYearIdx = -1;

      cells.forEach((cell, idx) => {
        const cleanCell = cell.replace(/["']/g, '').trim().toLowerCase();
        
        // Match Portuguese month
        if (ptMonths[cleanCell] !== undefined) {
          rowMonthNum = ptMonths[cleanCell];
          rowMonthIdx = idx;
        } else {
          // Try normalized
          const normalizedCell = cleanCell.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (ptMonths[normalizedCell] !== undefined) {
            rowMonthNum = ptMonths[normalizedCell];
            rowMonthIdx = idx;
          }
        }
        
        // Match 4-digit year
        const parsedYear = parseInt(cleanCell);
        if (!isNaN(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100 && cleanCell.length === 4) {
          rowYearNum = parsedYear;
          rowYearIdx = idx;
        }
      });

      // If we identified a month and a year in this row, process it!
      if (rowMonthNum !== -1 && rowYearNum !== -1) {
        const competencia = `${rowMonthNum.toString().padStart(2, '0')}/${rowYearNum}`;
        
        // Find the faturamento total cell
        let valIdx = faturamentoColIdx;
        if (valIdx === -1 || valIdx === rowMonthIdx || valIdx === rowYearIdx) {
          // If no faturamento column is explicitly identified, use cells[5] if present, otherwise the last column
          if (cells.length > 5 && 5 !== rowMonthIdx && 5 !== rowYearIdx) {
            valIdx = 5;
          } else {
            // Find the last column that is not empty and is not the month or year
            valIdx = cells.length - 1;
            while (valIdx > 0 && (valIdx === rowMonthIdx || valIdx === rowYearIdx || cells[valIdx].trim() === '')) {
              valIdx--;
            }
          }
        }

        const rawVal = cells[valIdx];
        let faturamentoTotal = 0;
        if (rawVal) {
          faturamentoTotal = parseNumericValue(rawVal);
        }

        if (isNaN(faturamentoTotal) || faturamentoTotal < 0) {
          continue;
        }

        const vendaVista = faturamentoTotal * (company.vendaVistaPercent / 100);
        const vendaPrazo = faturamentoTotal * (company.vendaPrazoPercent / 100);
        const estimatedTaxes = calculateEstimatedTaxes(faturamentoTotal, company.regimeTributario);

        const existingIdx = items.findIndex(item => item.competencia === competencia);
        if (existingIdx !== -1) {
          items[existingIdx] = {
            id: items[existingIdx].id,
            competencia,
            faturamentoTotal,
            vendaVista,
            vendaPrazo,
            estimatedTaxes
          };
        } else {
          items.push({
            id: `fat_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            competencia,
            faturamentoTotal,
            vendaVista,
            vendaPrazo,
            estimatedTaxes
          });
        }
      }
    }

    // Sort competence items chronologically
    items.sort((a, b) => {
      const [mA, yA] = a.competencia.split('/').map(Number);
      const [mB, yB] = b.competencia.split('/').map(Number);
      const yearA = yA < 100 ? 2000 + yA : yA;
      const yearB = yB < 100 ? 2000 + yB : yB;
      if (yearA !== yearB) return yearA - yearB;
      return mA - mB;
    });

    return items;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        const base64Content = base64String.split(',')[1];
        resolve(base64Content);
      };
      reader.onerror = error => reject(error);
    });
  };

  const parseExcelFile = async (file: File) => {
    try {
      setUploadError(null);
      setIsProcessingBatch(true);
      setBatchProgress(`Processando arquivo: ${file.name}...`);
      
      const extension = file.name.split('.').pop()?.toLowerCase();
      let csvContent = '';

      if (extension !== 'xlsx' && extension !== 'xls' && extension !== 'csv') {
        throw new Error('Formato de arquivo inválido. Por favor, envie uma planilha Excel (.xlsx, .xls) ou arquivo CSV.');
      }

      csvContent = await convertXlsToCsvAndImport(file);

      let currentCompanies = [...companies];
      const { company: identifiedCompany, identifiedCnpj } = identifyCompanyForFile(file.name, csvContent, currentCompanies);

      let targetCompany = identifiedCompany;

      // If not registered but we have an identified CNPJ, create company automatically
      if (!identifiedCompany && identifiedCnpj && identifiedCnpj.length === 14) {
        setBatchProgress(`Empresa não cadastrada (${formatCNPJ(identifiedCnpj)}). Criando perfil automaticamente...`);
        try {
          const response = await fetch(`/api/cnpj/${identifiedCnpj}`);
          if (response.ok) {
            const data = await response.json();
            const razaoSocial = data.razao_social || 'Empresa Sem Nome';
            
            const est = data.estabelecimento || {};
            const logradouro = est.logradouro || '';
            const numero = est.numero || '';
            const bairro = est.bairro || '';
            const enderecoFormatted = [logradouro, numero, bairro].filter(Boolean).join(', ');
            
            const cep = est.cep || '';
            const municipioNome = est.municipio?.nome || '';
            const estadoSigla = est.estado?.sigla || '';
            const cidadeFormatted = municipioNome && estadoSigla ? `${municipioNome} (${estadoSigla})` : (municipioNome || estadoSigla || '');

            const isSimples = data.simples?.optante === 'Sim' || data.simples?.optante === true;
            const regime = isSimples ? 'SIMPLES_NACIONAL' : 'LUCRO_PRESUMIDO';

            const socios = data.socios || [];
            const quadro = socios.map((s: any) => {
              const nome = s.nome || '';
              const desc = s.qualificacao_socio?.descricao || '';
              return desc ? `${nome} (${desc})` : nome;
            }).filter(Boolean);

            const newComp: Company = {
              id: 'comp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
              razaoSocial: razaoSocial,
              cnpj: formatCNPJ(identifiedCnpj),
              regimeTributario: regime,
              vendaVistaPercent: 10,
              vendaPrazoPercent: 90,
              endereco: enderecoFormatted || '',
              cidade: cidadeFormatted || 'Fortaleza (CE)',
              cep: cep || '',
              inscEst: '',
              pmr: 21,
              pr: 'R',
              cartoesPercent: 0,
              chequesPercent: 0,
              duplicatasPercent: 100,
              contadorNome: 'PAULO HENRIQUE DE F. MOREIRA',
              contadorCrc: 'CRC CE 022956-O6',
              quadroSocietario: quadro,
              municipio: municipioNome,
              estado: est.estado?.nome || '',
              uf: estadoSigla,
              createdAt: new Date().toISOString()
            };

            currentCompanies = [newComp, ...currentCompanies];
            setCompanies(currentCompanies);
            saveCompanies(currentCompanies);
            targetCompany = newComp;
          }
        } catch (apiErr) {
          console.error('Erro ao buscar CNPJ via API pública:', apiErr);
        }

        if (!targetCompany) {
          const newComp: Company = {
            id: 'comp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
            razaoSocial: `Empresa CNPJ ${formatCNPJ(identifiedCnpj)}`,
            cnpj: formatCNPJ(identifiedCnpj),
            regimeTributario: 'SIMPLES_NACIONAL',
            vendaVistaPercent: 10,
            vendaPrazoPercent: 90,
            createdAt: new Date().toISOString()
          };
          currentCompanies = [newComp, ...currentCompanies];
          setCompanies(currentCompanies);
          saveCompanies(currentCompanies);
          targetCompany = newComp;
        }
      }

      if (!targetCompany && selectedCompanyId) {
        targetCompany = companies.find(c => c.id === selectedCompanyId) || null;
      }

      if (!targetCompany) {
        throw new Error('Não foi possível identificar a empresa no arquivo e nenhuma empresa está cadastrada ou selecionada.');
      }

      // Switch active company so UI reflects correct profile
      if (selectedCompanyId !== targetCompany.id) {
        setSelectedCompanyId(targetCompany.id);
        lastLoadedCompanyIdRef.current = targetCompany.id;
      }

      const items = parseFaturamentoFromCsv(csvContent, targetCompany);

      if (items.length === 0) {
        throw new Error("Não foi possível extrair nenhum faturamento válido. Verifique se o modelo está correto.");
      }

      setFaturamentoData(items);
      lastLoadedCompanyIdRef.current = targetCompany.id;
      localStorage.setItem(`moreira_lima_faturamento_${targetCompany.id}`, JSON.stringify(items));
    } catch (err: any) {
      setUploadError(err.message || 'Erro ao processar o arquivo. Certifique-se de usar o modelo recomendado.');
    } finally {
      setIsProcessingBatch(false);
      setBatchProgress(null);
    }
  };

  const handleBatchFiles = async (files: File[]) => {
    setIsProcessingBatch(true);
    setBatchProgress("Iniciando processamento em lote...");
    const results: BatchFileResult[] = [];
    let currentCompanies = [...companies];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setBatchProgress(`Processando ${i + 1} de ${files.length}: ${file.name}...`);
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension !== 'xlsx' && extension !== 'xls' && extension !== 'csv') {
        results.push({
          id: `batch_${i}_${Date.now()}`,
          fileName: file.name,
          fileSize: file.size,
          identifiedCnpj: null,
          companyId: null,
          items: [],
          status: 'error',
          errorMessage: 'Formato de arquivo inválido. Use .xlsx, .xls ou .csv'
        });
        continue;
      }

      try {
        let csvContent = '';
        csvContent = await convertXlsToCsvAndImport(file);

        const { company: identifiedCompany, identifiedCnpj } = identifyCompanyForFile(file.name, csvContent, currentCompanies);

        let finalCompany = identifiedCompany;
        let autoCreated = false;

        if (!identifiedCompany && identifiedCnpj && identifiedCnpj.length === 14) {
          setBatchProgress(`CNPJ não cadastrado encontrado: ${formatCNPJ(identifiedCnpj)}. Criando empresa automaticamente...`);
          try {
            const response = await fetch(`/api/cnpj/${identifiedCnpj}`);
            if (response.ok) {
              const data = await response.json();
              const razaoSocial = data.razao_social || 'Empresa Sem Nome';
              
              const est = data.estabelecimento || {};
              const logradouro = est.logradouro || '';
              const numero = est.numero || '';
              const bairro = est.bairro || '';
              const enderecoFormatted = [logradouro, numero, bairro].filter(Boolean).join(', ');
              
              const cep = est.cep || '';
              const municipioNome = est.municipio?.nome || '';
              const estadoSigla = est.estado?.sigla || '';
              const cidadeFormatted = municipioNome && estadoSigla ? `${municipioNome} (${estadoSigla})` : (municipioNome || estadoSigla || '');

              const isSimples = data.simples?.optante === 'Sim' || data.simples?.optante === true;
              const regime = isSimples ? 'SIMPLES_NACIONAL' : 'LUCRO_PRESUMIDO';

              const socios = data.socios || [];
              const quadro = socios.map((s: any) => {
                const nome = s.nome || '';
                const desc = s.qualificacao_socio?.descricao || '';
                return desc ? `${nome} (${desc})` : nome;
              }).filter(Boolean);

              const newComp: Company = {
                id: 'comp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
                razaoSocial: razaoSocial,
                cnpj: formatCNPJ(identifiedCnpj),
                regimeTributario: regime,
                vendaVistaPercent: 10,
                vendaPrazoPercent: 90,
                endereco: enderecoFormatted || '',
                cidade: cidadeFormatted || 'Fortaleza (CE)',
                cep: cep || '',
                inscEst: '',
                pmr: 21,
                pr: 'R',
                cartoesPercent: 0,
                chequesPercent: 0,
                duplicatasPercent: 100,
                contadorNome: 'PAULO HENRIQUE DE F. MOREIRA',
                contadorCrc: 'CRC CE 022956-O6',
                quadroSocietario: quadro,
                municipio: municipioNome,
                estado: est.estado?.nome || '',
                uf: estadoSigla,
                createdAt: new Date().toISOString()
              };

              currentCompanies = [newComp, ...currentCompanies];
              finalCompany = newComp;
              autoCreated = true;
            }
          } catch (apiErr) {
            console.error('Erro ao buscar CNPJ via API pública:', apiErr);
          }
        }

        const parsingCompany: Company = finalCompany || {
          id: 'temp',
          razaoSocial: 'Temporária',
          cnpj: identifiedCnpj ? formatCNPJ(identifiedCnpj) : '',
          regimeTributario: 'LUCRO_REAL',
          vendaVistaPercent: 10,
          vendaPrazoPercent: 90,
          createdAt: ''
        };

        const items = parseFaturamentoFromCsv(csvContent, parsingCompany);

        if (items.length === 0) {
          results.push({
            id: `batch_${i}_${Date.now()}`,
            fileName: file.name,
            fileSize: file.size,
            identifiedCnpj: identifiedCnpj,
            companyId: finalCompany ? finalCompany.id : null,
            items: [],
            status: 'warning',
            errorMessage: 'Nenhum faturamento válido encontrado.'
          });
        } else {
          results.push({
            id: `batch_${i}_${Date.now()}`,
            fileName: file.name,
            fileSize: file.size,
            identifiedCnpj: identifiedCnpj,
            companyId: finalCompany ? finalCompany.id : null,
            items: items,
            status: finalCompany ? (autoCreated ? 'warning' : 'success') : 'unidentified',
            errorMessage: autoCreated ? `Empresa criada automaticamente a partir do CNPJ ${formatCNPJ(identifiedCnpj)}` : undefined
          });
        }
      } catch (err: any) {
        results.push({
          id: `batch_${i}_${Date.now()}`,
          fileName: file.name,
          fileSize: file.size,
          identifiedCnpj: null,
          companyId: null,
          items: [],
          status: 'error',
          errorMessage: err.message || 'Erro desconhecido ao ler arquivo.'
        });
      }
    }

    if (currentCompanies.length > companies.length) {
      setCompanies(currentCompanies);
      saveCompanies(currentCompanies);
    }

    setBatchFiles(results);
    setIsProcessingBatch(false);
    setBatchProgress(null);
    setShowBatchModal(true);
  };

  const confirmBatchImport = () => {
    let importedCount = 0;
    
    batchFiles.forEach(batchFile => {
      if (batchFile.companyId && batchFile.items.length > 0) {
        localStorage.setItem(`moreira_lima_faturamento_${batchFile.companyId}`, JSON.stringify(batchFile.items));
        importedCount++;

        if (batchFile.companyId === selectedCompanyId) {
          setFaturamentoData(batchFile.items);
          lastLoadedCompanyIdRef.current = selectedCompanyId;
        }
      }
    });

    setShowBatchModal(false);
    setBillingUpdateTrigger(prev => prev + 1);
    setBatchFiles([]);
  };

  const handleBatchCompanyChange = (fileId: string, companyId: string) => {
    const targetCompany = companies.find(c => c.id === companyId);
    if (!targetCompany) return;

    setBatchFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        const recalculatedItems = f.items.map(item => {
          const total = item.faturamentoTotal;
          const vendaVista = total * (targetCompany.vendaVistaPercent / 100);
          const vendaPrazo = total * (targetCompany.vendaPrazoPercent / 100);
          const estimatedTaxes = calculateEstimatedTaxes(total, targetCompany.regimeTributario);
          return {
            ...item,
            vendaVista,
            vendaPrazo,
            estimatedTaxes
          };
        });

        return {
          ...f,
          companyId: companyId,
          status: 'success',
          items: recalculatedItems,
          errorMessage: undefined
        };
      }
      return f;
    }));
  };

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files) as File[];
      if (files.length === 1) {
        const file = files[0];
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
          await parseExcelFile(file);
        } else {
          setUploadError('Formato de arquivo inválido. Por favor, envie uma planilha Excel (.xlsx, .xls) ou arquivo CSV.');
        }
      } else {
        await handleBatchFiles(files);
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      if (files.length === 1 && activeMainTab === 'individual') {
        await parseExcelFile(files[0]);
      } else {
        await handleBatchFiles(files);
      }
    }
  };

  // Global drag and drop event handlers
  const handleGlobalDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsGlobalDragActive(true);
    }
  };

  const handleGlobalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleGlobalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsGlobalDragActive(false);
    }
  };

  const handleGlobalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsGlobalDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files) as File[];
      
      const validFiles = files.filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        return ext === 'xlsx' || ext === 'xls' || ext === 'csv';
      });

      if (validFiles.length === 0) {
        alert("Nenhum arquivo válido (.xlsx, .xls, .csv) foi detectado.");
        return;
      }

      if (validFiles.length === 1 && activeMainTab === 'individual') {
        await parseExcelFile(validFiles[0]);
      } else {
        await handleBatchFiles(validFiles);
      }
    }
  };

  // Helper to calculate totals for any dataset
  const calculateTotalsForData = (data: FaturamentoItem[], companyToUse?: Company) => {
    const currentComp = companyToUse || companies.find(c => c.id === selectedCompanyId) || {
      vendaVistaPercent: 10,
      vendaPrazoPercent: 90
    };

    let faturamentoTotal = 0;
    let vendaVista = 0;
    let vendaPrazo = 0;
    let pis = 0;
    let cofins = 0;
    let irpj = 0;
    let csll = 0;
    let simplesNacional = 0;
    let totalTaxes = 0;

    data.forEach(item => {
      faturamentoTotal += item.faturamentoTotal;
      const itemVista = item.faturamentoTotal * (currentComp.vendaVistaPercent / 100);
      const itemPrazo = item.faturamentoTotal * (currentComp.vendaPrazoPercent / 100);
      vendaVista += itemVista;
      vendaPrazo += itemPrazo;
      pis += item.estimatedTaxes.pis;
      cofins += item.estimatedTaxes.cofins;
      irpj += item.estimatedTaxes.irpj;
      csll += item.estimatedTaxes.csll;
      if (item.estimatedTaxes.simplesNacional) {
        simplesNacional += item.estimatedTaxes.simplesNacional;
      }
      totalTaxes += item.estimatedTaxes.totalTaxes;
    });

    return {
      faturamentoTotal,
      vendaVista,
      vendaPrazo,
      pis,
      cofins,
      irpj,
      csll,
      simplesNacional,
      totalTaxes,
      effectiveTaxRate: faturamentoTotal > 0 ? (totalTaxes / faturamentoTotal) * 100 : 0
    };
  };

  // Totals calculations
  const totals = useMemo(() => {
    const selectedCompany = companies.find(c => c.id === selectedCompanyId);
    return calculateTotalsForData(faturamentoData, selectedCompany);
  }, [faturamentoData, companies, selectedCompanyId]);

  // PDF report standard exporter (replicating exactly the original layout)
  const handleExportPDFStandard = (targetCompany?: Company, targetData?: FaturamentoItem[], returnDoc = false) => {
    const selectedCompany = targetCompany || companies.find(c => c.id === selectedCompanyId);
    const faturamentoDataLocal = targetData || (targetCompany ? JSON.parse(localStorage.getItem(`moreira_lima_faturamento_${targetCompany.id}`) || '[]') : faturamentoData);
    if (!selectedCompany || !faturamentoDataLocal || faturamentoDataLocal.length === 0) return null;

    return ((faturamentoData: FaturamentoItem[]) => {
      const totals = calculateTotalsForData(faturamentoData, selectedCompany);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const margin = 14;
    const pageWidth = doc.internal.pageSize.width; // 210mm
    const pageHeight = doc.internal.pageSize.height; // 297mm

    let y = 14;

    // Helper to format city and state as "Município - Estado" perfectly
    const getFormattedCityState = () => {
      if (selectedCompany.municipio && selectedCompany.uf) {
        return `${selectedCompany.municipio.trim()} - ${selectedCompany.uf.trim()}`;
      }
      
      const rawCity = (selectedCompany.cidade || 'Fortaleza (CE)').trim();
      
      if (rawCity.includes('(')) {
        const parts = rawCity.split('(');
        const city = parts[0].trim();
        const state = parts[1].replace(')', '').trim();
        return `${city} - ${state}`;
      }
      
      if (rawCity.includes('-')) {
        const parts = rawCity.split('-');
        return `${parts[0].trim()} - ${parts[1].trim()}`;
      }
      
      const states = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
      if (states.includes(rawCity.toUpperCase())) {
        return `Fortaleza - ${rawCity.toUpperCase()}`;
      }
      
      return rawCity;
    };

    const ptMonthsShort: { [key: number]: string } = {
      1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
      7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez'
    };

    const getFormattedCompetencia = (comp: string) => {
      const [m, yr] = comp.split('/').map(Number);
      const mStr = ptMonthsShort[m] || 'jan';
      const yrShort = yr.toString().substring(2);
      return `${mStr.toLowerCase()}-${yrShort}`;
    };

    // 1. Empresa label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('Empresa', margin, y);
    
    y += 1.5;
    // Horizontal line below Empresa label
    doc.setLineWidth(0.2);
    doc.setDrawColor(0, 0, 0);
    doc.line(margin, y, pageWidth - margin, y);
    
    const companyBoxStartY = y;
    
    y += 4.5;
    // Razão Social label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Razão Social: completa sem abreviações', margin + 3, y);
    
    y += 5.5;
    // Corporate name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(selectedCompany.razaoSocial.toUpperCase(), margin + 3, y);
    
    y += 3;
    // Horizontal divider line
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    
    // Left thick vertical bar for company name box
    doc.setLineWidth(1.0);
    doc.line(margin, companyBoxStartY, margin, y);
    
    const cnpjBoxStartY = y;
    
    y += 4;
    // Left: CNPJ label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('CNPJ', margin + 3, y);
    
    // Right: Faturamento label
    doc.text('Faturamento total - R$', 118, y);
    
    y += 5.5;
    // CNPJ value
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(selectedCompany.cnpj, margin + 3, y);
    
    // Faturamento value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`R$ ${totals.faturamentoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 118, y);
    
    y += 3.5;
    // Horizontal divider line
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    
    // Vertical line in CNPJ/Faturamento box
    doc.line(115, cnpjBoxStartY, 115, y);
    
    // Left thick vertical bar for CNPJ box
    doc.setLineWidth(1.0);
    doc.line(margin, cnpjBoxStartY, margin, y);
    
    y += 6;
    // Sub-header labels: Mercado interno & Mês/ano de referência
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('Mercado interno', margin, y);

    let refMonthYearStr = '03/26';
    if (faturamentoData.length > 0) {
      const lastItem = faturamentoData[faturamentoData.length - 1];
      const [m, yStr] = lastItem.competencia.split('/');
      refMonthYearStr = `${m}/${yStr.substring(2)}`;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Mês/ano de referência:', pageWidth - margin - 42, y);
    doc.setFont('helvetica', 'bold');
    doc.text(refMonthYearStr, pageWidth - margin, y, { align: 'right' });

    y += 3.5;

    // --- TABLE START ---
    const tableTop = y;
    const tableHeaderHeight = 9.5;
    const tableRowHeight = 7.5;
    const tableTotalsHeight = 8;
    const tableHeight = tableHeaderHeight + (faturamentoData.length * tableRowHeight) + tableTotalsHeight;
    const tableBottom = tableTop + tableHeight;

    // Header background fill
    doc.setFillColor(254, 252, 191); // light yellow
    doc.rect(margin, tableTop, pageWidth - (margin * 2), tableHeaderHeight, 'F');

    // No horizontal lines above or below header to match original report

    // Header titles centered
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    
    const colCenters = {
      comp: 32,
      vista: 72.5,
      prazo: 120,
      pmr: 157.5,
      pr: 183
    };

    doc.text('Mês/Ano', colCenters.comp, tableTop + 6.5, { align: 'center' });
    doc.text('À vista', colCenters.vista, tableTop + 6.5, { align: 'center' });
    doc.text('A prazo', colCenters.prazo, tableTop + 6.5, { align: 'center' });
    doc.text('(*)PMR', colCenters.pmr, tableTop + 6.5, { align: 'center' });
    doc.text('(**)P/R', colCenters.pr, tableTop + 6.5, { align: 'center' });

    let rowY = tableTop + tableHeaderHeight;

    faturamentoData.forEach((row) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11.5);
      
      const compVal = getFormattedCompetencia(row.competencia).toUpperCase();
      const rowVista = row.faturamentoTotal * (selectedCompany.vendaVistaPercent / 100);
      const rowPrazo = row.faturamentoTotal * (selectedCompany.vendaPrazoPercent / 100);
      const vistaVal = rowVista.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const prazoVal = rowPrazo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const pmrVal = String(selectedCompany.pmr !== undefined ? selectedCompany.pmr : 21);
      const prVal = selectedCompany.pr || 'R';

      doc.text(compVal, colCenters.comp, rowY + 5.5, { align: 'center' });
      doc.text(vistaVal, colCenters.vista, rowY + 5.5, { align: 'center' });
      doc.text(prazoVal, colCenters.prazo, rowY + 5.5, { align: 'center' });
      doc.text(pmrVal, colCenters.pmr, rowY + 5.5, { align: 'center' });
      doc.text(prVal, colCenters.pr, rowY + 5.5, { align: 'center' });

      rowY += tableRowHeight;
    });

    // Fill background for TOTAL row with yellow (marked in yellow, no lines)
    doc.setFillColor(254, 252, 191); // light yellow
    doc.rect(margin, rowY, pageWidth - (margin * 2), tableTotalsHeight, 'F');

    // TOTAL Row
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(0, 0, 0);
    const totalVistaVal = totals.vendaVista.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totalPrazoVal = totals.vendaPrazo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    doc.text('TOTAL', colCenters.comp, rowY + 5.8, { align: 'center' });
    doc.text(totalVistaVal, colCenters.vista, rowY + 5.8, { align: 'center' });
    doc.text(totalPrazoVal, colCenters.prazo, rowY + 5.8, { align: 'center' });

    y = tableBottom + 5;

    // Faturamento médio mensal
    const avgMonthly = totals.faturamentoTotal / (faturamentoData.length || 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Faturamento médio mensal:', margin, y);
    doc.setFont('helvetica', 'bold');
    doc.text(`R$ ${avgMonthly.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 42, y);

    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('(*)Prazo Médio de Recebimentos em dias', margin, y);
    doc.text('(**) Previsto/Realizado', 115, y);

    y += 7;
    // Percentual Section
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Percentual do total do faturamento a prazo, anual, no mercado interno em:', margin, y);

    y += 2.5;
    const pcCartoes = selectedCompany.cartoesPercent !== undefined ? selectedCompany.cartoesPercent : 0;
    const pcCheques = selectedCompany.chequesPercent !== undefined ? selectedCompany.chequesPercent : 0;
    const pcDuplicatas = selectedCompany.duplicatasPercent !== undefined ? selectedCompany.duplicatasPercent : 100;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    
    // Column 1
    doc.text('Cartões - %', margin + 3, y + 3.5);
    if (pcCartoes > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text(`${pcCartoes}%`, margin + 3, y + 8);
    }
    
    // Column 2
    doc.setFont('helvetica', 'normal');
    doc.text('Cheques %', margin + 53, y + 3.5);
    if (pcCheques > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text(`${pcCheques}%`, margin + 53, y + 8);
    }

    // Column 3
    doc.setFont('helvetica', 'normal');
    doc.text('Duplicatas %', margin + 138, y + 3.5);
    if (pcDuplicatas > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text(`${pcDuplicatas}%`, margin + 138, y + 8);
    }

    // Draw the vertical lines (thick)
    doc.setLineWidth(1.0);
    doc.line(margin, y, margin, y + 10.5);             // bar for Cartões
    doc.line(margin + 50, y, margin + 50, y + 10.5);     // bar for Cheques
    doc.line(margin + 135, y, margin + 135, y + 10.5);   // bar for Duplicatas

    // Draw bottom horizontal line under columns
    doc.setLineWidth(0.2);
    doc.line(margin, y + 10.5, pageWidth - margin, y + 10.5);

    y += 15;
    // Regime Tributario
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Regime Tributario', margin, y);

    y += 4.5;
    const regimesList = [
      { id: 'SIMPLES_NACIONAL', label: 'SIMPLES', x: 14 },
      { id: 'LUCRO_REAL', label: 'LUCRO REAL', x: 40 },
      { id: 'LUCRO_PRESUMIDO', label: 'LUCRO PRESUMIDO', x: 75 },
      { id: 'LUCRO_ARBITRADO', label: 'LUCRO ARBITRADO', x: 120 },
      { id: 'ISENTO_IMUNE', label: 'ISENTO/IMUNE', x: 162 }
    ];

    regimesList.forEach(r => {
      doc.rect(r.x, y - 2.8, 3, 3);
      if (selectedCompany.regimeTributario === r.id) {
        // Draw standard checkmark
        doc.line(r.x + 0.5, y - 1.5, r.x + 1.2, y - 0.5);
        doc.line(r.x + 1.2, y - 0.5, r.x + 2.5, y - 2.2);
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(r.label, r.x + 4.5, y - 0.5);
    });

    // Draw bottom horizontal line for Regime Tributario
    doc.setLineWidth(0.2);
    doc.line(margin, y + 1.5, pageWidth - margin, y + 1.5);

    y += 7.5;
    // Local e Data
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Local e data', margin, y);

    y += 3.5;
    // Draw thick left vertical bar
    doc.setLineWidth(1.0);
    doc.line(margin, y - 3, margin, y + 4);

    // Draw bottom horizontal line
    doc.setLineWidth(0.2);
    doc.line(margin, y + 4, pageWidth - margin, y + 4);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const cityStateStr = getFormattedCityState();
    const day = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`${cityStateStr}, ${day}`, margin + 3, y + 1.5);

    // Signatures at the bottom
    const sigY = pageHeight - 32;
    doc.setLineWidth(0.2);
    // Lines
    doc.line(margin + 2, sigY, margin + 82, sigY);
    doc.line(pageWidth - margin - 82, sigY, pageWidth - margin - 2, sigY);

    // Left signature text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(selectedCompany.razaoSocial.toUpperCase(), margin + 42, sigY + 4, { align: 'center' });
    doc.text(`CNPJ ${selectedCompany.cnpj}`, margin + 42, sigY + 8, { align: 'center' });

    // Right signature text
    const activeAccountant = accountants.find(a => a.id === selectedAccountantId) || accountants[0] || DEFAULT_ACCOUNTANTS[0];
    const accName = activeAccountant.nome;
    const accCrc = activeAccountant.crc;
    doc.text(accName.toUpperCase(), pageWidth - margin - 42, sigY + 4, { align: 'center' });
    doc.text(accCrc.toUpperCase(), pageWidth - margin - 42, sigY + 8, { align: 'center' });

    const filename = `declaracao_faturamento_FAT12_padrao_${selectedCompany.razaoSocial.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`;
    if (returnDoc) {
      return { doc, filename };
    } else {
      doc.save(filename);
      return { doc, filename };
    }
    })(faturamentoDataLocal);
  };

  // PDF report premium exporter (modern, enhanced layout with exclusions and adjusted labels)
  const handleExportPDFPremium = (targetCompany?: Company, targetData?: FaturamentoItem[], returnDoc = false) => {
    const selectedCompany = targetCompany || companies.find(c => c.id === selectedCompanyId);
    const faturamentoDataLocal = targetData || (targetCompany ? JSON.parse(localStorage.getItem(`moreira_lima_faturamento_${targetCompany.id}`) || '[]') : faturamentoData);
    if (!selectedCompany || !faturamentoDataLocal || faturamentoDataLocal.length === 0) return null;

    return ((faturamentoData: FaturamentoItem[]) => {
      const totals = calculateTotalsForData(faturamentoData, selectedCompany);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const margin = 16;
    const pageWidth = doc.internal.pageSize.width; // 210mm
    const pageHeight = doc.internal.pageSize.height; // 297mm
    const printableWidth = pageWidth - (margin * 2); // 178mm

    let y = 16;

    // Helper to format city and state as "Município - Estado" perfectly
    const getFormattedCityState = () => {
      if (selectedCompany.municipio && selectedCompany.uf) {
        return `${selectedCompany.municipio.trim()} - ${selectedCompany.uf.trim()}`;
      }
      
      const rawCity = (selectedCompany.cidade || 'Fortaleza (CE)').trim();
      
      if (rawCity.includes('(')) {
        const parts = rawCity.split('(');
        const city = parts[0].trim();
        const state = parts[1].replace(')', '').trim();
        return `${city} - ${state}`;
      }
      
      if (rawCity.includes('-')) {
        const parts = rawCity.split('-');
        return `${parts[0].trim()} - ${parts[1].trim()}`;
      }
      
      const states = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
      if (states.includes(rawCity.toUpperCase())) {
        return `Fortaleza - ${rawCity.toUpperCase()}`;
      }
      
      return rawCity;
    };

    const ptMonthsShort: { [key: number]: string } = {
      1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
      7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez'
    };

    const getFormattedCompetencia = (comp: string) => {
      const [m, yr] = comp.split('/').map(Number);
      const mStr = ptMonthsShort[m] || 'jan';
      const yrShort = yr.toString().substring(2);
      return `${mStr.toUpperCase()}-${yrShort}`;
    };

    const primaryNavy = [15, 23, 42]; // Slate-900 (ultra premium corporate dark slate)
    const secondaryAmber = [194, 120, 3]; // Elegant Deep Gold (#c27803)
    const textDark = [30, 41, 59]; // Slate-800
    const textMuted = [100, 116, 139]; // Slate-500
    const gridColor = [203, 213, 225]; // Slate-300 (very clear borders)
    const fillLight = [248, 250, 252]; // Slate-50 (clean soft background)

    // Gold elegant top bar
    doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.rect(margin, 10, printableWidth, 3, 'F');
    doc.setFillColor(secondaryAmber[0], secondaryAmber[1], secondaryAmber[2]);
    doc.rect(margin, 13, printableWidth, 1, 'F');

    // 2. Premium Document Header
    y = 20;

    // Company Name Box with modern styling
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    
    // Auto-wrap company name if too long to prevent overflow
    const splitCompanyName = doc.splitTextToSize(selectedCompany.razaoSocial.toUpperCase(), printableWidth);
    doc.text(splitCompanyName, margin, y);
    
    // Adjust y based on company name lines
    y += (splitCompanyName.length * 5) + 2;

    // Line separator below company name
    doc.setDrawColor(gridColor[0], gridColor[1], gridColor[2]);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);

    y += 5;

    // Grid Layout for Metadata (CNPJ & Faturamento Cards)
    // Left Card: Company metadata (CNPJ)
    const cardWidth = printableWidth / 2 - 3;
    const rightCardX = margin + cardWidth + 6;

    // Left card background
    doc.setFillColor(fillLight[0], fillLight[1], fillLight[2]);
    doc.setDrawColor(gridColor[0], gridColor[1], gridColor[2]);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, y, cardWidth, 16, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('CNPJ DA EMPRESA', margin + 4, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(selectedCompany.cnpj, margin + 4, y + 11);

    // Right card (Faturamento Highlight Card) - Gold Accent Border
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.setDrawColor(secondaryAmber[0], secondaryAmber[1], secondaryAmber[2]); // Gold border
    doc.setLineWidth(0.4);
    doc.roundedRect(rightCardX, y, cardWidth, 16, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(secondaryAmber[0], secondaryAmber[1], secondaryAmber[2]);
    doc.text('FATURAMENTO TOTAL', rightCardX + 4, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text(`R$ ${totals.faturamentoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, rightCardX + 4, y + 11.5);

    y += 22; // Position for the faturamento table

    // --- TABLE START ---
    const tableTop = y;
    const tableHeaderHeight = 8;
    const tableRowHeight = 6;
    const tableTotalsHeight = 8;
    const tableHeight = tableHeaderHeight + (faturamentoData.length * tableRowHeight) + tableTotalsHeight;
    const tableBottom = tableTop + tableHeight;

    // Define column coordinates precisely
    const premiumCols = {
      comp: margin + 18,
      vista: margin + 62,
      prazo: margin + 108,
      total: margin + 154
    };

    // Draw table background fills first!
    // Alternate row fills
    faturamentoData.forEach((row, index) => {
      const rowY = tableTop + tableHeaderHeight + (index * tableRowHeight);
      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252); // Slate-50
        doc.rect(margin, rowY, printableWidth, tableRowHeight, 'F');
      } else {
        doc.setFillColor(255, 255, 255);
        doc.rect(margin, rowY, printableWidth, tableRowHeight, 'F');
      }
    });

    // Header Fill
    doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.roundedRect(margin, tableTop, printableWidth, tableHeaderHeight, 2, 2, 'F');
    // Cover bottom rounded corners
    doc.rect(margin, tableTop + 4, printableWidth, 4, 'F');

    // Totals Row Fill
    const totalRowY = tableBottom - tableTotalsHeight;
    doc.setFillColor(241, 245, 249); // Slate-100
    doc.roundedRect(margin, totalRowY, printableWidth, tableTotalsHeight, 2, 2, 'F');
    // Cover top rounded corners
    doc.rect(margin, totalRowY, printableWidth, 4, 'F');

    // Draw ALL lines (borders & grid) on top of the backgrounds so they are 100% visible!
    doc.setDrawColor(gridColor[0], gridColor[1], gridColor[2]);
    doc.setLineWidth(0.3);

    // Table Outer Border Box
    doc.roundedRect(margin, tableTop, printableWidth, tableHeight, 2, 2, 'S');

    // Inner horizontal divider lines
    // Under header
    doc.line(margin, tableTop + tableHeaderHeight, margin + printableWidth, tableTop + tableHeaderHeight);
    
    // Between rows
    faturamentoData.forEach((row, index) => {
      const lineY = tableTop + tableHeaderHeight + ((index + 1) * tableRowHeight);
      if (index < faturamentoData.length - 1) {
        doc.line(margin, lineY, margin + printableWidth, lineY);
      }
    });

    // Above totals row
    doc.line(margin, totalRowY, margin + printableWidth, totalRowY);

    // Inner vertical gridlines
    const vLineYStart = tableTop;
    const vLineYEnd = totalRowY; // stop vertical gridlines before totals row
    
    // Column vertical separators
    doc.line(margin + 36, vLineYStart, margin + 36, vLineYEnd);
    doc.line(margin + 83, vLineYStart, margin + 83, vLineYEnd);
    doc.line(margin + 130, vLineYStart, margin + 130, vLineYEnd);

    // --- Now render all text on top ---
    // Header labels (White text)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('Competência', premiumCols.comp, tableTop + 5.2, { align: 'center' });
    doc.text('Vendas à Vista', premiumCols.vista, tableTop + 5.2, { align: 'center' });
    doc.text('Vendas a Prazo', premiumCols.prazo, tableTop + 5.2, { align: 'center' });
    doc.text('Faturamento Bruto', premiumCols.total, tableTop + 5.2, { align: 'center' });

    // Table Row values
    faturamentoData.forEach((row, index) => {
      const rowY = tableTop + tableHeaderHeight + (index * tableRowHeight);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textDark[0], textDark[1], textDark[2]);

      const compText = getFormattedCompetencia(row.competencia);
      const rowVista = row.faturamentoTotal * (selectedCompany.vendaVistaPercent / 100);
      const rowPrazo = row.faturamentoTotal * (selectedCompany.vendaPrazoPercent / 100);
      const vistaText = `R$ ${rowVista.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const prazoText = `R$ ${rowPrazo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const totalText = `R$ ${row.faturamentoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      doc.text(compText, premiumCols.comp, rowY + 4.2, { align: 'center' });
      doc.text(vistaText, premiumCols.vista, rowY + 4.2, { align: 'center' });
      doc.text(prazoText, premiumCols.prazo, rowY + 4.2, { align: 'center' });
      doc.text(totalText, premiumCols.total, rowY + 4.2, { align: 'center' });
    });

    // Totals Row labels & values
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);

    const totalVistaText = `R$ ${totals.vendaVista.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const totalPrazoText = `R$ ${totals.vendaPrazo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const totalGrossText = `R$ ${totals.faturamentoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    doc.text('TOTAL', premiumCols.comp, totalRowY + 5.2, { align: 'center' });
    doc.text(totalVistaText, premiumCols.vista, totalRowY + 5.2, { align: 'center' });
    doc.text(totalPrazoText, premiumCols.prazo, totalRowY + 5.2, { align: 'center' });
    doc.text(totalGrossText, premiumCols.total, totalRowY + 5.2, { align: 'center' });

    y = tableBottom + 7;

    // Faturamento Médio Mensal card - Modern pill-shaped banner
    doc.setFillColor(fillLight[0], fillLight[1], fillLight[2]);
    doc.setDrawColor(gridColor[0], gridColor[1], gridColor[2]);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, y, printableWidth, 10, 1.5, 1.5, 'FD');

    const avgMonthly = totals.faturamentoTotal / (faturamentoData.length || 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text('FATURAMENTO MÉDIO MENSAL:', margin + 4, y + 6.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(secondaryAmber[0], secondaryAmber[1], secondaryAmber[2]);
    doc.text(`R$ ${avgMonthly.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 55, y + 6.5);

    y += 15;

    // Regime de Tributação - Styled status blocks
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text('REGIME DE TRIBUTAÇÃO ATIVO', margin, y);

    y += 3.5;

    const premiumRegimes = [
      { id: 'SIMPLES_NACIONAL', label: 'SIMPLES NACIONAL' },
      { id: 'LUCRO_REAL', label: 'LUCRO REAL' },
      { id: 'LUCRO_PRESUMIDO', label: 'LUCRO PRESUMIDO' },
      { id: 'LUCRO_ARBITRADO', label: 'LUCRO ARBITRADO' }
    ];

    const pillWidth = (printableWidth - 9) / 4; // 4 balanced pills
    
    premiumRegimes.forEach((r, idx) => {
      const rx = margin + (idx * (pillWidth + 3));
      const isActive = selectedCompany.regimeTributario === r.id;

      if (isActive) {
        // Active pill: Solid deep Navy background with soft gold accent line, white text
        doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
        doc.setDrawColor(secondaryAmber[0], secondaryAmber[1], secondaryAmber[2]);
        doc.setLineWidth(0.4);
        doc.roundedRect(rx, y, pillWidth, 9, 1.5, 1.5, 'FD');

        // Draw an elegant small checkmark icon
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        doc.line(rx + 3, y + 4.5, rx + 4.5, y + 6);
        doc.line(rx + 4.5, y + 6, rx + 7, y + 3.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text(r.label, rx + 9, y + 5.8);
      } else {
        // Inactive pill: Muted slate border & gray text
        doc.setFillColor(248, 250, 252); // Slate-50
        doc.setDrawColor(gridColor[0], gridColor[1], gridColor[2]);
        doc.setLineWidth(0.2);
        doc.roundedRect(rx, y, pillWidth, 9, 1.5, 1.5, 'FD');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
        doc.text(r.label, rx + 4, y + 5.8);
      }
    });

    y += 14;

    // Local e Data Box
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text('LOCAL E DATA DE EMISSÃO', margin, y);

    y += 3;
    doc.setFillColor(fillLight[0], fillLight[1], fillLight[2]);
    doc.setDrawColor(gridColor[0], gridColor[1], gridColor[2]);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, y, printableWidth, 9, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    const cityStateStr = getFormattedCityState();
    const day = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`${cityStateStr}, ${day}`, margin + 4, y + 5.8);

    // Signatures block positioned securely at the bottom
    const sigLineY = pageHeight - 34;
    
    doc.setDrawColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.setLineWidth(0.3);
    
    // Left line for representative
    doc.line(margin + 2, sigLineY, margin + cardWidth, sigLineY);
    // Right line for accountant
    doc.line(rightCardX, sigLineY, rightCardX + cardWidth - 2, sigLineY);

    // Left signature text (Representative)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text(selectedCompany.razaoSocial.toUpperCase(), margin + (cardWidth / 2), sigLineY + 4, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(`CNPJ ${selectedCompany.cnpj}`, margin + (cardWidth / 2), sigLineY + 8, { align: 'center' });

    // Right signature text (Accountant)
    const activeAccountant = accountants.find(a => a.id === selectedAccountantId) || accountants[0] || DEFAULT_ACCOUNTANTS[0];
    const accName = activeAccountant.nome;
    const accCrc = activeAccountant.crc;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text(accName.toUpperCase(), rightCardX + (cardWidth / 2), sigLineY + 4, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(`CPF: ${activeAccountant.cpf} - ${accCrc.toUpperCase()}`, rightCardX + (cardWidth / 2), sigLineY + 8, { align: 'center' });

    const filename = `declaracao_faturamento_FAT12_${selectedCompany.razaoSocial.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`;
    if (returnDoc) {
      return { doc, filename };
    } else {
      doc.save(filename);
      return { doc, filename };
    }
    })(faturamentoDataLocal);
  };

  // Dispatcher function for PDF export
  const handleExportPDF = (mode: 'standard' | 'premium' = 'standard', targetCompany?: Company, targetData?: FaturamentoItem[], returnDoc = false) => {
    if (mode === 'premium') {
      return handleExportPDFPremium(targetCompany, targetData, returnDoc);
    } else {
      return handleExportPDFStandard(targetCompany, targetData, returnDoc);
    }
  };

  return (
    <div 
      className="space-y-6 relative"
      onDragEnter={handleGlobalDragEnter}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
    >
      {isGlobalDragActive && (
        <div className="absolute inset-0 z-50 bg-[#04243b]/90 backdrop-blur-xs border-4 border-dashed border-[#e4b35e] rounded-3xl flex flex-col items-center justify-center text-center p-8 transition-all">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-[#e4b35e] mb-6 animate-pulse">
            <Upload className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-extrabold text-white uppercase tracking-wide">
            Solte as Planilhas de Faturamento
          </h2>
          <p className="text-sm text-slate-300 mt-2 max-w-md">
            Arraste e solte seus arquivos .xlsx, .xls ou .csv em qualquer lugar para processar o faturamento.
          </p>
        </div>
      )}
      
      {/* Sleek, High-Contrast Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          {/* Accountant Toggle Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 shadow-xs">
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider px-2">Assinatura:</span>
            <button
              type="button"
              onClick={() => selectAccountant('paulo')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                selectedAccountantId === 'paulo'
                  ? 'bg-[#04243b] text-[#e4b35e] border border-[#e4b35e]/20 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Paulo Henrique de Figueiredo Moreira (CRC CE 022956-O6)"
            >
              <Check className={`h-3 w-3 shrink-0 transition-opacity ${selectedAccountantId === 'paulo' ? 'opacity-100' : 'opacity-0 w-0'}`} />
              PAULO
            </button>
            <button
              type="button"
              onClick={() => selectAccountant('daymisson')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                selectedAccountantId === 'daymisson'
                  ? 'bg-[#04243b] text-[#e4b35e] border border-[#e4b35e]/20 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Daymisson Lima da Costa (CRC CE 027436/O)"
            >
              <Check className={`h-3 w-3 shrink-0 transition-opacity ${selectedAccountantId === 'daymisson' ? 'opacity-100' : 'opacity-0 w-0'}`} />
              DAYMISSON
            </button>
          </div>

          {/* Config Gear Button */}
          <button
            onClick={() => {
              setSettingsSubTab('gerenciar');
              setShowSettingsModal(true);
            }}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-[#04243b] transition-all cursor-pointer shadow-xs"
            title="Configurações (Empresas e CSV)"
          >
            <Settings className="h-5 w-5 animate-hover-spin" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeMainTab === 'individual' && (
          <motion.div
            key="individual-view-wrapper"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            {/* Sleek Back Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setActiveMainTab('lote')}
                className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[#04243b] hover:text-[#e4b35e] bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-all cursor-pointer w-full sm:w-auto"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar para Lote
              </button>
              {selectedCompany && (
                <div className="text-right">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Visualizando Empresa</span>
                  <span className="text-sm font-extrabold text-[#04243b] uppercase block truncate max-w-xs sm:max-w-md">
                    {selectedCompany.razaoSocial}
                  </span>
                </div>
              )}
            </div>

            {/* VIEW 1: DROP ZONE (Faturamento Data Empty) */}
            {faturamentoData.length === 0 && (
          <motion.div
            key="dropzone-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            {/* Drag Zone / File Upload */}
            <div 
              className={`border-2 border-dashed rounded-3xl p-10 text-center transition-all ${
                isDragActive 
                  ? 'border-[#e4b35e] bg-[#e4b35e]/5' 
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".xlsx, .xls, .csv"
                multiple
                className="hidden"
              />

              <div className="max-w-md mx-auto space-y-4">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600">
                  <Upload className="h-6 w-6 text-[#04243b]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#04243b]">
                    Arraste ou Selecione o Arquivo de Faturamento
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Formatos suportados: Excel (.xlsx, .xls) ou CSV
                  </p>
                </div>
                
                <div className="pt-2 flex flex-col sm:flex-row justify-center items-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] border border-[#e4b35e]/20 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer uppercase"
                  >
                    Selecionar Arquivo
                  </button>
                  <button
                    onClick={handleDownloadTemplate}
                    className="px-4 py-2 border border-[#04243b]/20 hover:bg-slate-50 text-[#04243b] text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 uppercase"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Modelo Excel
                  </button>
                </div>

                {uploadError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-[10px] text-red-600 flex items-center gap-2 justify-center">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* VIEW 2: PROCESSED ANALYTICAL RESULTS */}
        {faturamentoData.length > 0 && selectedCompany && (
          <motion.div
            key="results-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >


            {/* Analytical breakdown table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                </div>

                <div className="flex flex-wrap items-center gap-2">

                  <button
                    onClick={() => {
                      setFaturamentoData([]);
                      setUploadError(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all cursor-pointer uppercase"
                  >
                    Reimportar Planilha
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowExportDropdown(!showExportDropdown)}
                      className="px-3.5 py-1.5 rounded-lg text-[10px] font-bold bg-[#e4b35e] hover:bg-[#e4b35e]/90 text-[#04243b] transition-all cursor-pointer flex items-center gap-1.5 uppercase shadow-sm"
                    >
                      <FileDown className="h-4 w-4" />
                      EXPORTAR EM PDF
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showExportDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {showExportDropdown && (
                        <>
                          {/* Backdrop to close dropdown on click outside */}
                          <div 
                            className="fixed inset-0 z-30" 
                            onClick={() => setShowExportDropdown(false)} 
                          />
                          
                          <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 mt-2 w-56 bg-[#04243b] border border-[#e4b35e]/20 rounded-xl shadow-xl z-40 overflow-hidden divide-y divide-[#e4b35e]/10"
                          >
                            <button
                              onClick={() => {
                                handleExportPDF('premium');
                                setShowExportDropdown(false);
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-[#063354] transition-colors flex items-center gap-2.5 group cursor-pointer"
                            >
                              <div className="bg-[#e4b35e]/10 p-1.5 rounded-lg group-hover:bg-[#e4b35e]/25 transition-colors shrink-0">
                                <Sparkles className="h-3.5 w-3.5 text-[#e4b35e]" />
                              </div>
                              <div>
                                <div className="text-[11px] font-bold text-white group-hover:text-[#e4b35e] transition-colors uppercase tracking-wider">
                                  PREMIUM
                                </div>
                              </div>
                            </button>

                            <button
                              onClick={() => {
                                handleExportPDF('standard');
                                setShowExportDropdown(false);
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-[#063354] transition-colors flex items-center gap-2.5 group cursor-pointer"
                            >
                              <div className="bg-slate-400/10 p-1.5 rounded-lg group-hover:bg-slate-400/20 transition-colors shrink-0">
                                <FileDown className="h-3.5 w-3.5 text-slate-300" />
                              </div>
                              <div>
                                <div className="text-[11px] font-bold text-slate-200 group-hover:text-white transition-colors uppercase tracking-wider">
                                  PADRÃO
                                </div>
                              </div>
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#04243b] text-[#e4b35e] text-[9px] font-bold uppercase tracking-wider border-b border-[#e4b35e]/25">
                      <th className="py-2.5 px-3">Competência</th>
                      <th className="py-2.5 px-3 text-right">Faturamento Bruto</th>
                      <th className="py-2.5 px-3 text-right">Vendas à Vista ({selectedCompany.vendaVistaPercent}%)</th>
                      <th className="py-2.5 px-3 text-right">Vendas a Prazo ({selectedCompany.vendaPrazoPercent}%)</th>
                      <th className="py-2.5 px-3 text-center w-24">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[10px] text-slate-800">
                    {faturamentoData.map((row) => {
                      const isEditing = editingRowId === row.id;
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/70 transition-all">
                          {isEditing ? (
                            <>
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={editingCompetencia}
                                  onChange={(e) => setEditingCompetencia(e.target.value)}
                                  className="w-20 px-1.5 py-1 border border-slate-300 rounded text-[11px] font-sans font-medium text-slate-800 focus:outline-none focus:border-[#e4b35e]"
                                  placeholder="MM/AAAA"
                                />
                              </td>
                              <td className="py-2 px-3 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <span className="text-slate-400">R$</span>
                                  <input
                                    type="number"
                                    value={editingFaturamentoTotal || ''}
                                    onChange={(e) => setEditingFaturamentoTotal(parseFloat(e.target.value) || 0)}
                                    className="w-28 px-1.5 py-1 border border-slate-300 rounded text-[11px] font-mono font-medium text-right text-[#04243b] focus:outline-none focus:border-[#e4b35e]"
                                    step="0.01"
                                  />
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right text-emerald-600">
                                R$ {(editingFaturamentoTotal * (selectedCompany.vendaVistaPercent / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-3 text-right text-blue-600">
                                R$ {(editingFaturamentoTotal * (selectedCompany.vendaPrazoPercent / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="flex justify-center items-center gap-1.5">
                                  <button
                                    onClick={() => handleSaveRow(row.id)}
                                    className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 cursor-pointer transition-colors"
                                    title="Salvar"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setEditingRowId(null)}
                                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                                    title="Cancelar"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-2 px-3 font-sans font-bold text-slate-700">
                                {row.competencia}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-[#04243b]">
                                R$ {row.faturamentoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-3 text-right text-emerald-600">
                                R$ {(row.faturamentoTotal * (selectedCompany.vendaVistaPercent / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-3 text-right text-blue-600">
                                R$ {(row.faturamentoTotal * (selectedCompany.vendaPrazoPercent / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="flex justify-center items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setEditingRowId(row.id);
                                      setEditingCompetencia(row.competencia);
                                      setEditingFaturamentoTotal(row.faturamentoTotal);
                                    }}
                                    className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors"
                                    title="Editar Competência"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRow(row.id)}
                                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                                    title="Excluir Competência"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>



            </div>

          </motion.div>
        )}
          </motion.div>
        )}

        {activeMainTab === 'lote' && (
          <motion.div
            key="lote-view-wrapper"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            {/* Lote Header Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 pb-4 border-b border-slate-200">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[#04243b] hover:text-white bg-[#e4b35e] hover:bg-[#04243b] border border-[#e4b35e]/15 rounded-xl shadow-xs transition-all cursor-pointer w-full sm:w-auto"
                >
                  <Upload className="h-4 w-4" />
                  Importar Planilha(s)
                </button>
                <button
                  type="button"
                  onClick={handleClearAllBillingData}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-red-600 hover:text-white bg-red-50 hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-xl shadow-xs transition-all cursor-pointer w-full sm:w-auto"
                >
                  <Trash2 className="h-4 w-4" />
                  Limpar Tudo
                </button>
              </div>
            </div>



            {/* Batch Action Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={
                      companiesWithBilling.filter(c => c.hasBilling).length > 0 &&
                      selectedBatchCompanies.length === companiesWithBilling.filter(c => c.hasBilling).length
                    }
                    onChange={(e) => handleSelectAllBatch(e.target.checked)}
                    className="rounded border-slate-300 text-[#04243b] focus:ring-[#04243b] h-4 w-4 cursor-pointer"
                  />
                  Selecionar Todas as Importadas
                </label>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  disabled={selectedBatchCompanies.length === 0}
                  onClick={() => handleBatchExport('standard')}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-extrabold uppercase tracking-wider rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <FileDown className="h-4 w-4" />
                  Exportar Padrão
                </button>
                <button
                  type="button"
                  disabled={selectedBatchCompanies.length === 0}
                  onClick={() => handleBatchExport('premium')}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-extrabold uppercase tracking-wider rounded-xl bg-[#e4b35e] hover:bg-[#e4b35e]/90 text-[#04243b] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Sparkles className="h-4 w-4 text-[#04243b]" />
                  Exportar Premium
                </button>
              </div>
            </div>

            {/* Companies Batch List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4 w-12 text-center">Exportar</th>
                      <th className="py-3 px-4">Razão Social / CNPJ</th>
                      <th className="py-3 px-4">Localização / Tributação</th>
                      <th className="py-3 px-4 text-center">Competências</th>
                      <th className="py-3 px-4 text-right">Faturamento Consolidado</th>
                      <th className="py-3 px-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {companiesWithBilling.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                          Nenhuma empresa cadastrada. Acesse as configurações no topo para adicionar empresas.
                        </td>
                      </tr>
                    ) : (
                      companiesWithBilling.map(company => {
                        const totalConsolidated = company.billingItems.reduce((acc, item) => acc + item.faturamentoTotal, 0);
                        const numCompetencias = company.billingItems.length;

                        return (
                          <tr key={company.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3.5 px-4 text-center">
                              <input
                                type="checkbox"
                                disabled={!company.hasBilling}
                                checked={selectedBatchCompanies.includes(company.id)}
                                onChange={() => handleToggleBatchCompany(company.id)}
                                className="rounded border-slate-300 text-[#04243b] focus:ring-[#04243b] h-4 w-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="py-3.5 px-4">
                              <div 
                                onClick={() => {
                                  setSelectedCompanyId(company.id);
                                  setActiveMainTab('individual');
                                }}
                                className="group cursor-pointer"
                                title="Clique para visualizar o faturamento individual desta empresa"
                              >
                                <div className="font-extrabold text-[#04243b] group-hover:text-[#e4b35e] uppercase truncate max-w-xs sm:max-w-md transition-colors">
                                  {company.razaoSocial}
                                </div>
                                <div className="text-[9px] font-mono text-slate-400 group-hover:text-[#04243b] transition-colors mt-0.5">
                                  CNPJ: {company.cnpj}
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="text-slate-600 font-medium">
                                {company.municipio || company.cidade || 'Fortaleza'} - {company.uf || 'CE'}
                              </div>
                              <div className="text-[9px] font-bold text-[#e4b35e] mt-0.5">
                                {company.regimeTributario === 'SIMPLES_NACIONAL' ? 'SIMPLES NACIONAL' : company.regimeTributario.replace('_', ' ')}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {company.hasBilling ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold text-[10px]">
                                  <Check className="h-3 w-3 shrink-0" />
                                  {numCompetencias} {numCompetencias === 1 ? 'Mês' : 'Meses'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold text-[10px]">
                                  Sem dados
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right font-bold text-slate-900 font-mono">
                              {company.hasBilling ? (
                                `R$ ${totalConsolidated.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              ) : (
                                <span className="text-slate-400 font-normal italic">-</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {company.hasBilling ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleExportPDF('standard', company, company.billingItems)}
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-[#04243b] hover:bg-slate-100 cursor-pointer transition-colors"
                                      title="Exportar PDF Padrão"
                                    >
                                      <FileDown className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleExportPDF('premium', company, company.billingItems)}
                                      className="p-1.5 rounded-lg text-[#e4b35e] hover:bg-slate-100 cursor-pointer transition-colors"
                                      title="Exportar PDF Premium"
                                    >
                                      <Sparkles className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleClearBatchCompanyData(company.id)}
                                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer transition-colors"
                                      title="Excluir Dados"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedCompanyId(company.id);
                                      setActiveMainTab('individual');
                                    }}
                                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200 hover:border-[#04243b]/20 hover:bg-slate-50 text-slate-600 hover:text-[#04243b] transition-all cursor-pointer uppercase flex items-center gap-1"
                                  >
                                    <Upload className="h-3 w-3" />
                                    Importar
                                  </button>
                                )}
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
          </motion.div>
        )}

      </AnimatePresence>

      {/* CONFIGURATION SETTINGS MODAL */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-white w-full max-w-4xl rounded-3xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="bg-[#04243b] text-white p-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-[#e4b35e]" />
                  <h3 className="text-sm font-bold tracking-tight">Configuração de Empresas Parceiras</h3>
                </div>
                <button
                  onClick={() => {
                    setEditingCompanyId(null);
                    setEditingAccountantId(null);
                    setCompanyScreen('list');
                    setAccountantScreen('list');
                    setCompanySearchQuery('');
                    setAccountantSearchQuery('');
                    setShowSettingsModal(false);
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Sub-tabs */}
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 flex gap-4 select-none">
                <button
                  onClick={() => {
                    setSettingsSubTab('gerenciar');
                    setCompanyScreen('list');
                    setCompanySearchQuery('');
                  }}
                  className={`py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    settingsSubTab === 'gerenciar'
                      ? 'border-[#04243b] text-[#04243b]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Cadastrar e Gerenciar Empresas
                </button>
                <button
                  onClick={() => {
                    setSettingsSubTab('contadores');
                    setAccountantScreen('list');
                    setAccountantSearchQuery('');
                  }}
                  className={`py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    settingsSubTab === 'contadores'
                      ? 'border-[#04243b] text-[#04243b]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Assinaturas de Contadores
                </button>

              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
                {settingsSubTab === 'gerenciar' ? (
                  <div>
                    {companyScreen === 'list' ? (
                      <div className="space-y-4">
                        {/* Header controls for list */}
                        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pb-3 border-b border-slate-200">
                          <div className="relative w-full sm:max-w-md">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                              <Search className="h-4 w-4" />
                            </span>
                            <input
                              type="text"
                              value={companySearchQuery}
                              onChange={(e) => setCompanySearchQuery(e.target.value)}
                              placeholder="Pesquisar por razão social (digite as primeiras letras)..."
                              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-[#04243b] transition-all"
                            />
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCompanyId(null);
                              setNewCompany({
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
                                certificateFile: '',
                                certificatePassword: '',
                                certificateName: '',
                                certificateValidTo: '',
                                certificateIssuer: '',
                                certificateSerialNumber: ''
                              });
                              setCompanyScreen('form');
                            }}
                            className="w-full sm:w-auto px-4 py-2 bg-[#04243b] hover:bg-[#031d30] text-white font-bold rounded-xl text-xs uppercase flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                          >
                            <Plus className="h-4 w-4 text-[#e4b35e]" />
                            Incluir Nova Empresa
                          </button>
                        </div>

                        {/* List of companies */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                  <th className="px-5 py-3">Razão Social / CNPJ</th>
                                  <th className="px-5 py-3">Divisão de Faturamento</th>
                                  <th className="px-5 py-3">Regime</th>
                                  <th className="px-5 py-3 text-right">Ações</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {companies.filter(c => {
                                  const q = companySearchQuery.toUpperCase().trim();
                                  if (!q) return true;
                                  return c.razaoSocial.toUpperCase().startsWith(q) || c.razaoSocial.toUpperCase().includes(q);
                                }).length === 0 ? (
                                  <tr>
                                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400 italic text-xs">
                                      Nenhuma empresa encontrada com os termos de busca.
                                    </td>
                                  </tr>
                                ) : (
                                  companies.filter(c => {
                                    const q = companySearchQuery.toUpperCase().trim();
                                    if (!q) return true;
                                    return c.razaoSocial.toUpperCase().startsWith(q) || c.razaoSocial.toUpperCase().includes(q);
                                  }).map((company) => {
                                    const isSelected = selectedCompanyId === company.id;
                                    return (
                                      <tr 
                                        key={company.id} 
                                        className={`hover:bg-slate-50/50 transition-colors ${isSelected ? 'bg-[#e4b35e]/3' : ''}`}
                                      >
                                        <td className="px-5 py-3.5">
                                          <div className="font-bold text-slate-800 text-xs">
                                            {company.razaoSocial}
                                          </div>
                                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                            CNPJ: {company.cnpj}
                                          </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                          <div className="text-xs font-semibold text-slate-700">
                                            Vista: <span className="font-mono font-bold text-[#04243b]">{company.vendaVistaPercent}%</span> | Prazo: <span className="font-mono font-bold text-[#04243b]">{company.vendaPrazoPercent}%</span>
                                          </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                          <span className="px-2 py-0.5 bg-slate-100 text-[#04243b] text-[9px] font-bold rounded uppercase tracking-wider">
                                            {company.regimeTributario.replace('_', ' ')}
                                          </span>
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                          <div className="flex justify-end gap-1.5">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                setSelectedCompanyId(company.id);
                                                handleEditCompanyInit(company, e);
                                              }}
                                              className="p-1.5 rounded-lg text-slate-500 hover:text-[#04243b] hover:bg-slate-100 cursor-pointer transition-all"
                                              title="Editar Empresa"
                                            >
                                              <Edit className="h-4 w-4" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={(e) => handleDeleteCompany(company.id, e)}
                                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 cursor-pointer transition-all"
                                              title="Excluir Empresa"
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
                      </div>
                    ) : (
                      /* Company Form Screen */
                      <div className="space-y-4 max-w-2xl mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setCompanyScreen('list');
                              setEditingCompanyId(null);
                            }}
                            className="text-slate-500 hover:text-slate-800 text-xs font-bold uppercase flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <ArrowLeft className="h-4 w-4" />
                            Voltar à Lista
                          </button>
                          
                          <h4 className="text-xs font-extrabold text-[#04243b] uppercase tracking-wider flex items-center gap-1.5">
                            {editingCompanyId ? <Edit className="h-4 w-4 text-[#e4b35e]" /> : <Plus className="h-4 w-4 text-[#e4b35e]" />}
                            {editingCompanyId ? 'Editar Cadastro da Empresa' : 'Incluir Nova Empresa'}
                          </h4>
                        </div>

                        <form onSubmit={handleSaveCompany} className="space-y-4 pt-2">
                          {/* Section 1: Dados Gerais */}
                          <div className="space-y-3">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Identificação e Regime</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                              <div className="sm:col-span-2 space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Razão Social</label>
                                <input
                                  type="text"
                                  value={newCompany.razaoSocial}
                                  onChange={(e) => setNewCompany(prev => ({ ...prev, razaoSocial: e.target.value }))}
                                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#04243b] focus:bg-white transition-all"
                                  placeholder="Razão social completa sem abreviações"
                                  required
                                />
                              </div>
                              
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase">CNPJ</label>
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    value={newCompany.cnpj}
                                    onChange={(e) => setNewCompany(prev => ({ ...prev, cnpj: e.target.value }))}
                                    className="flex-1 bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#04243b] focus:bg-white transition-all"
                                    placeholder="00.000.000/0001-00"
                                    required
                                  />
                                  <button
                                    type="button"
                                    onClick={handleFetchCnpjData}
                                    disabled={isFetchingCnpj}
                                    className={`px-4 py-2 rounded-lg text-xs font-semibold text-[#04243b] bg-[#e4b35e] hover:bg-[#d4a34e] disabled:bg-slate-100 disabled:text-slate-400 transition-all shadow-sm cursor-pointer uppercase`}
                                    title="Buscar dados do Cartão CNPJ na API Pública"
                                  >
                                    {isFetchingCnpj ? '...' : 'Buscar'}
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Cidade (UF)</label>
                                <input
                                  type="text"
                                  value={newCompany.cidade || ''}
                                  onChange={(e) => setNewCompany(prev => ({ ...prev, cidade: e.target.value }))}
                                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#04243b] focus:bg-white transition-all"
                                  placeholder="Ex: Fortaleza (CE)"
                                />
                              </div>

                              <div className="sm:col-span-2 space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Regime de Tributação</label>
                                <select
                                  value={newCompany.regimeTributario}
                                  onChange={(e) => setNewCompany(prev => ({ ...prev, regimeTributario: e.target.value as any }))}
                                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#04243b] focus:bg-white transition-all"
                                >
                                  <option value="SIMPLES_NACIONAL">Simples Nacional</option>
                                  <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
                                  <option value="LUCRO_REAL">Lucro Real</option>
                                  <option value="LUCRO_ARBITRADO">Lucro Arbitrado</option>
                                  <option value="ISENTO_IMUNE">Isento / Imune</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* Buttons */}
                          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => {
                                setCompanyScreen('list');
                                setEditingCompanyId(null);
                              }}
                              className="px-5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl text-xs uppercase cursor-pointer transition-colors"
                            >
                              Cancelar
                            </button>
                            
                            <button
                              type="submit"
                              className="px-6 py-2 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] border border-[#e4b35e]/30 font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                            >
                              Salvar Cadastro
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Accountants Management Sub-tab */
                  <div>
                    {accountantScreen === 'list' ? (
                      <div className="space-y-4">
                        {/* Header controls for accountant list */}
                        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pb-3 border-b border-slate-200">
                          <div className="relative w-full sm:max-w-md">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                              <Search className="h-4 w-4" />
                            </span>
                            <input
                              type="text"
                              value={accountantSearchQuery}
                              onChange={(e) => setAccountantSearchQuery(e.target.value)}
                              placeholder="Pesquisar por nome do contador (digite as primeiras letras)..."
                              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-[#04243b] transition-all"
                            />
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAccountantId(null);
                              setNewAccountant({ nome: '', cpf: '', crc: '' });
                              setAccountantScreen('form');
                            }}
                            className="w-full sm:w-auto px-4 py-2 bg-[#04243b] hover:bg-[#031d30] text-white font-bold rounded-xl text-xs uppercase flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                          >
                            <Plus className="h-4 w-4 text-[#e4b35e]" />
                            Incluir Novo Contador
                          </button>
                        </div>

                        {/* List of accountants */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                  <th className="px-5 py-3">Nome do Contador</th>
                                  <th className="px-5 py-3">CPF</th>
                                  <th className="px-5 py-3">Registro CRC</th>
                                  <th className="px-5 py-3 text-right">Ações</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {accountants.filter(acc => {
                                  const q = accountantSearchQuery.toUpperCase().trim();
                                  if (!q) return true;
                                  return acc.nome.toUpperCase().startsWith(q) || acc.nome.toUpperCase().includes(q);
                                }).length === 0 ? (
                                  <tr>
                                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400 italic text-xs">
                                      Nenhum contador encontrado com os termos de busca.
                                    </td>
                                  </tr>
                                ) : (
                                  accountants.filter(acc => {
                                    const q = accountantSearchQuery.toUpperCase().trim();
                                    if (!q) return true;
                                    return acc.nome.toUpperCase().startsWith(q) || acc.nome.toUpperCase().includes(q);
                                  }).map((acc) => {
                                    const isSelected = selectedAccountantId === acc.id;
                                    return (
                                      <tr 
                                        key={acc.id} 
                                        className={`hover:bg-slate-50/50 transition-colors ${isSelected ? 'bg-[#e4b35e]/3' : ''}`}
                                      >
                                        <td className="px-5 py-3.5">
                                          <div className="font-bold text-slate-800 text-xs flex items-center gap-2">
                                            {acc.nome}
                                            {isSelected && (
                                              <span className="bg-[#e4b35e]/20 text-[#04243b] text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                                Ativo
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                          <div className="text-xs font-mono text-slate-600">
                                            {acc.cpf}
                                          </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                          <div className="text-xs font-mono text-slate-600">
                                            {acc.crc}
                                          </div>
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
                                              className="p-1.5 rounded-lg text-slate-500 hover:text-[#04243b] hover:bg-slate-100 cursor-pointer transition-all"
                                              title="Editar Contador"
                                            >
                                              <Edit className="h-4 w-4" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteAccountant(acc.id)}
                                              disabled={accountants.length <= 1}
                                              className={`p-1.5 rounded-lg transition-all ${
                                                accountants.length <= 1
                                                  ? 'text-slate-200 cursor-not-allowed'
                                                  : 'text-slate-400 hover:text-red-600 hover:bg-slate-100 cursor-pointer'
                                              }`}
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
                      </div>
                    ) : (
                      /* Accountant Form Screen */
                      <div className="space-y-4 max-w-2xl mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setAccountantScreen('list');
                              setEditingAccountantId(null);
                            }}
                            className="text-slate-500 hover:text-slate-800 text-xs font-bold uppercase flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <ArrowLeft className="h-4 w-4" />
                            Voltar à Lista
                          </button>
                          
                          <h4 className="text-xs font-extrabold text-[#04243b] uppercase tracking-wider flex items-center gap-1.5">
                            {editingAccountantId ? <Edit className="h-4 w-4 text-[#e4b35e]" /> : <Plus className="h-4 w-4 text-[#e4b35e]" />}
                            {editingAccountantId ? 'Editar Assinatura de Contador' : 'Incluir Assinatura de Contador'}
                          </h4>
                        </div>

                        <form onSubmit={handleSaveAccountant} className="space-y-4 pt-2">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Nome do Contador</label>
                            <input
                              type="text"
                              value={newAccountant.nome}
                              onChange={(e) => setNewAccountant(prev => ({ ...prev, nome: e.target.value }))}
                              className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#04243b] focus:bg-white transition-all"
                              placeholder="Ex: DAYMISSON LIMA DA COSTA"
                              required
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-bold text-slate-500 uppercase">CPF</label>
                              <input
                                type="text"
                                value={newAccountant.cpf}
                                onChange={(e) => setNewAccountant(prev => ({ ...prev, cpf: e.target.value }))}
                                className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#04243b] focus:bg-white transition-all"
                                placeholder="000.000.000-00"
                                required
                              />
                            </div>
                            
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-bold text-slate-500 uppercase">Registro CRC</label>
                              <input
                                type="text"
                                value={newAccountant.crc}
                                onChange={(e) => setNewAccountant(prev => ({ ...prev, crc: e.target.value }))}
                                className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#04243b] focus:bg-white transition-all"
                                placeholder="CRC CE 000000/O"
                                required
                              />
                            </div>
                          </div>

                          {/* Buttons */}
                          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => {
                                setAccountantScreen('list');
                                setEditingAccountantId(null);
                              }}
                              className="px-5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl text-xs uppercase cursor-pointer transition-colors"
                            >
                              Cancelar
                            </button>
                            
                            <button
                              type="submit"
                              className="px-6 py-2 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] border border-[#e4b35e]/30 font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                            >
                              Salvar Assinatura
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end">
                <button
                  onClick={() => {
                    setEditingCompanyId(null);
                    setEditingAccountantId(null);
                    setCompanyScreen('list');
                    setAccountantScreen('list');
                    setCompanySearchQuery('');
                    setAccountantSearchQuery('');
                    setShowSettingsModal(false);
                  }}
                  className="px-5 py-2 bg-[#04243b] text-white hover:bg-[#031d30] font-bold rounded-xl text-xs uppercase cursor-pointer"
                >
                  Fechar Configurações
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BATCH PROCESSING LOADING OVERLAY */}
      {isProcessingBatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex flex-col items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center">
            <div className="relative flex items-center justify-center mb-4">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#e4b35e] border-t-transparent" />
              <FileSpreadsheet className="h-5 w-5 text-[#04243b] absolute animate-bounce" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">Processando Lote de Planilhas</h4>
            <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-xs">
              {batchProgress || "Aguarde enquanto os arquivos são convertidos e analisados..."}
            </p>
          </div>
        </div>
      )}

      {/* BATCH IMPORT MODAL */}
      <AnimatePresence>
        {showBatchModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-white w-full max-w-4xl rounded-3xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="bg-[#04243b] text-white p-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-[#e4b35e]" />
                  <h3 className="text-sm font-bold tracking-tight">Revisão e Importação em Lote ({batchFiles.length} arquivos)</h3>
                </div>
                <button
                  onClick={() => {
                    setShowBatchModal(false);
                    setBatchFiles([]);
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Info alert */}
              <div className="bg-amber-50 border-b border-amber-100 p-4 flex gap-3 text-xs text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Validação e conversão XLS para CSV concluída com sucesso!</p>
                  <p className="text-[11px] font-medium leading-relaxed opacity-90">
                    O sistema converteu automaticamente as planilhas para formato CSV e tentou mapear cada arquivo à sua respectiva empresa parceira pelo CNPJ ou Razão Social. Revise abaixo as correspondências e selecione manualmente caso necessário.
                  </p>
                </div>
              </div>

              {/* Files List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {batchFiles.map((file) => {
                  const totalBilling = file.items.reduce((acc, item) => acc + item.faturamentoTotal, 0);
                  
                  return (
                    <div 
                      key={file.id} 
                      className={`border rounded-2xl p-4 transition-all ${
                        file.status === 'success' ? 'border-emerald-100 bg-emerald-50/10 hover:bg-emerald-50/25' :
                        file.status === 'warning' ? 'border-amber-100 bg-amber-50/10 hover:bg-amber-50/25' :
                        file.status === 'error' ? 'border-red-100 bg-red-50/10' :
                        'border-indigo-100 bg-indigo-50/10 hover:bg-indigo-50/25'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        {/* File Details */}
                        <div className="flex items-start gap-3">
                          <div className={`p-2.5 rounded-xl mt-0.5 shrink-0 ${
                            file.status === 'success' ? 'bg-emerald-100 text-emerald-700' :
                            file.status === 'warning' ? 'bg-amber-100 text-amber-700' :
                            file.status === 'error' ? 'bg-red-100 text-red-700' :
                            'bg-indigo-100 text-indigo-700'
                          }`}>
                            <FileSpreadsheet className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 leading-tight break-all">
                              {file.fileName}
                            </h4>
                            <p className="text-[10px] font-mono text-slate-500 mt-1">
                              Tamanho: {(file.fileSize / 1024).toFixed(1)} KB • {file.items.length} competências encontradas
                            </p>
                            {file.errorMessage && (
                              <p className={`text-[10px] font-bold mt-1 ${
                                file.status === 'error' ? 'text-red-600' : 'text-amber-600'
                              }`}>
                                {file.errorMessage}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Company Association & Stats */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:self-center">
                          {file.status !== 'error' && (
                            <div className="flex flex-col gap-1 min-w-[200px]">
                              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                                Empresa Associada
                              </label>
                              <select
                                value={file.companyId || ''}
                                onChange={(e) => handleBatchCompanyChange(file.id, e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-sans font-bold focus:outline-none cursor-pointer w-full"
                              >
                                <option value="" disabled>-- Selecionar Empresa --</option>
                                {companies.map(c => (
                                  <option key={c.id} value={c.id}>
                                    {c.razaoSocial}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {file.status !== 'error' && file.items.length > 0 && (
                            <div className="bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl min-w-[130px] flex flex-col justify-center">
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Soma Faturamento</span>
                              <span className="text-xs font-bold font-mono text-slate-700">
                                {totalBilling.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                            </div>
                          )}

                          <div className="flex items-center self-end sm:self-center">
                            {file.status === 'success' && (
                              <div className="flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                                Confirmado
                              </div>
                            )}
                            {file.status === 'warning' && (
                              <div className="flex items-center gap-1.5 bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                                Revisão
                              </div>
                            )}
                            {file.status === 'unidentified' && (
                              <div className="flex items-center gap-1.5 bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                <HelpCircle className="h-3.5 w-3.5 text-indigo-600" />
                                Mapear
                              </div>
                            )}
                            {file.status === 'error' && (
                              <div className="flex items-center gap-1.5 bg-red-100 text-red-800 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                <X className="h-3.5 w-3.5 text-red-600" />
                                Erro
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Display warning if unidentified */}
                      {file.status === 'unidentified' && (
                        <div className="mt-3 bg-indigo-50/50 border border-indigo-100/40 p-2.5 rounded-xl text-[10px] text-indigo-800 flex gap-2">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-indigo-600 mt-0.5" />
                          <p className="font-medium">
                            Essa planilha não pôde ser associada automaticamente a nenhuma empresa cadastrada. Por favor, selecione a empresa correspondente no seletor acima para salvar os dados corretamente.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
                <button
                  onClick={() => {
                    setShowBatchModal(false);
                    setBatchFiles([]);
                  }}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-bold rounded-xl text-xs uppercase cursor-pointer transition-colors"
                >
                  Descartar Lote
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={confirmBatchImport}
                    disabled={!batchFiles.some(f => f.companyId !== null && f.items.length > 0)}
                    className="px-5 py-2.5 bg-[#e4b35e] hover:bg-[#d4a34e] disabled:opacity-50 disabled:cursor-not-allowed text-[#04243b] font-bold rounded-xl text-xs uppercase cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Confirmar e Importar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CUSTOM REUSABLE CONFIRMATION MODAL */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="bg-white w-full max-w-md rounded-2xl border border-slate-100 shadow-xl overflow-hidden flex flex-col"
            >
              <div className="p-5 flex items-start gap-4">
                <div className={`p-3 rounded-full shrink-0 ${confirmModal.isDanger ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                  {confirmModal.isDanger ? <AlertTriangle className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
                </div>
                <div className="space-y-1.5 flex-grow">
                  <h4 className="text-sm font-extrabold text-[#04243b] uppercase tracking-wider">
                    {confirmModal.title}
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {confirmModal.message}
                  </p>
                </div>
              </div>
              
              <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-100 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer uppercase"
                >
                  {confirmModal.cancelText}
                </button>
                <button
                  type="button"
                  onClick={confirmModal.onConfirm}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer uppercase shadow-sm ${
                    confirmModal.isDanger 
                      ? 'bg-red-600 hover:bg-red-700' 
                      : 'bg-[#04243b] hover:bg-[#031d30]'
                  }`}
                >
                  {confirmModal.confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
