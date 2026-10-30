/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Workspace de Gestão e Consulta de NF-e na SEFAZ Nacional (DFe)
 * - Captura exclusivamente XMLs 100% originais da SEFAZ (procNFe_v4.00.xsd)
 * - Automaticamente manifesta APENAS Ciência da Operação (210210), ficando a próxima manifestação a cargo do usuário
 * - Salvamento direto na pasta local do computador (<Empresa>/<AAAA-MM>/<Chave>.xml)
 * - DANFE Padrão Nacional (Retrato A4 - MOC SEFAZ) com Código de Barras Code-128C
 * - Vínculo de Certificado Digital A1 centralizado no Cadastro de Clientes (Configurações Gerais)
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Building2, 
  RefreshCw, 
  Download, 
  CheckCircle2, 
  ShieldCheck, 
  FileCode, 
  Layers, 
  ChevronRight,
  ChevronDown,
  FileSpreadsheet,
  Check,
  Search,
  Archive,
  AlertTriangle,
  Printer,
  X,
  Calendar,
  RotateCcw,
  Filter,
  DollarSign,
  Hash,
  UserCheck,
  Bot,
  Settings
} from 'lucide-react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { Company } from '../types_debits';
import { loadStoredCompanies, COMPANIES_UPDATED_EVENT } from '../utils/companyStorage';
import type { 
  RespostaDownloadXmlOficial,
  RespostaManifestacaoDestinatario
} from '../services/sefazDfeService';
import { 
  DocumentoFiscalArmazenado, 
  normalizarCodigoUfIbge
} from '../types/sefazTypes';
import { 
  loadAllStoredDocuments, 
  upsertSefazDocuments, 
  converterDfeParaDocumentoArmazenado,
  carregarXmlAutenticoAsync,
  formatarCnpj,
  expurgarTodosDocumentosECacheSefaz,
  SEFAZ_DOCS_UPDATED_EVENT 
} from '../services/sefazStorage';
import { salvarXmlNoIndexedDb, isXmlNfeCompletaOficial } from '../services/sefazIndexedDb';
import {
  montarCaminhoRelativoXml,
  salvarDocumentosNoRepositorioAutomatico,
  salvarXmlNaPastaLocalComputador
} from '../services/sefazLocalFolderService';
import {
  useSefazRobot,
  capturarNotasNaSefazPorChaves,
  isEmpresaHabilitadaParaConsultaNfe
} from '../services/useSefazRobot';
import { RoboVarreduraModal } from './sefaz/RoboVarreduraModal';
import { DanfeModal } from './sefaz/DanfeModal';
import { RepositorioXmlModal } from './sefaz/RepositorioXmlModal';
import { XmlViewerModal } from './sefaz/XmlViewerModal';
import { NfeTabelaListagem } from './sefaz/NfeTabelaListagem';
import { ManifestacaoModal, TipoEventoManifestacao } from './sefaz/ManifestacaoModal';

function getData90DiasAtras(): string {
  const d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getUltimoDiaMesCorrente(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const monthStr = String(month).padStart(2, '0');
  const lastDayStr = String(lastDay).padStart(2, '0');
  return `${year}-${monthStr}-${lastDayStr}`;
}

function extrairDataYMD(doc: DocumentoFiscalArmazenado): string {
  if (doc.dataEmissao) {
    if (doc.dataEmissao.includes('-')) {
      return doc.dataEmissao.slice(0, 10);
    }
  }
  if (doc.dataGeracaoFormatada) {
    const dataPart = doc.dataGeracaoFormatada.split(' ')[0];
    const parts = dataPart.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return '';
}

interface ConsultaNfeWorkspaceProps {
  onNavigateToAuditor?: (xmlTexts: string[]) => void;
  onNavigateToConfig?: () => void;
}

export function ConsultaNfeWorkspace({ onNavigateToAuditor, onNavigateToConfig }: ConsultaNfeWorkspaceProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('TODAS');
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState<boolean>(false);
  const [companySearchQuery, setCompanySearchQuery] = useState<string>('');

  // Modais
  const [isRoboModalOpen, setIsRoboModalOpen] = useState<boolean>(false);
  const [isRepoModalOpen, setIsRepoModalOpen] = useState<boolean>(false);
  const [danfeDoc, setDanfeDoc] = useState<DocumentoFiscalArmazenado | null>(null);
  const [viewingXmlDoc, setViewingXmlDoc] = useState<DocumentoFiscalArmazenado | null>(null);
  const [isManifestacaoModalOpen, setIsManifestacaoModalOpen] = useState<boolean>(false);
  const [manifestandoDoc, setManifestandoDoc] = useState<DocumentoFiscalArmazenado | null>(null);
  const [isSubmittingManifestacao, setIsSubmittingManifestacao] = useState<boolean>(false);

  // Documentos Fiscais Armazenados
  const [allDocs, setAllDocs] = useState<DocumentoFiscalArmazenado[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  // Filtros de Visualização (Draft Inputs) — Padrão: últimos 90 dias até o fim do mês corrente
  const [filtroOperacao, setFiltroOperacao] = useState<'TODAS' | 'SAIDA' | 'ENTRADA'>('TODAS');
  const [filtroSituacao, setFiltroSituacao] = useState<'TODAS' | 'AUTORIZADA' | 'CANCELADA' | 'DENEGADA' | 'CARTA_CORRECAO'>('TODAS');
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>(getData90DiasAtras());
  const [filtroDataFim, setFiltroDataFim] = useState<string>(getUltimoDiaMesCorrente());
  const [filtroCompetencia, setFiltroCompetencia] = useState<string>('');
  const [filtroFornecedor, setFiltroFornecedor] = useState<string>('');
  const [filtroNumeroChave, setFiltroNumeroChave] = useState<string>('');
  const [filtroValor, setFiltroValor] = useState<string>('');

  // Filtros Aplicados na busca (Pesquisar)
  const [appliedFilters, setAppliedFilters] = useState({
    operacao: 'TODAS' as 'TODAS' | 'SAIDA' | 'ENTRADA',
    situacao: 'TODAS' as 'TODAS' | 'AUTORIZADA' | 'CANCELADA' | 'DENEGADA' | 'CARTA_CORRECAO',
    dataInicio: getData90DiasAtras(),
    dataFim: getUltimoDiaMesCorrente(),
    competencia: '',
    fornecedor: '',
    numeroChave: '',
    valor: ''
  });

  // Paginação
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  // Estados de Download / Processamento
  const [downloadingKeyId, setDownloadingKeyId] = useState<string | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);

  // Notificações e Feedback
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const resolvingCnpjsRef = useRef<Set<string>>(new Set());

  // Reseta para a primeira página ao alterar empresa ou filtros aplicados
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCompanyId, appliedFilters, itemsPerPage]);

  // Carrega empresas e documentos no início
  useEffect(() => {
    const syncCompanies = () => setCompanies(loadStoredCompanies());
    syncCompanies();
    setAllDocs(loadAllStoredDocuments());
    window.addEventListener(COMPANIES_UPDATED_EVENT, syncCompanies);
    return () => window.removeEventListener(COMPANIES_UPDATED_EVENT, syncCompanies);
  }, []);

  // Sincroniza documentos quando houver evento de atualização
  useEffect(() => {
    const handleDocsUpdate = () => {
      setAllDocs(loadAllStoredDocuments());
    };
    window.addEventListener(SEFAZ_DOCS_UPDATED_EVENT, handleDocsUpdate);
    return () => window.removeEventListener(SEFAZ_DOCS_UPDATED_EVENT, handleDocsUpdate);
  }, []);

  // Resolve automaticamente nomes de emitentes (Razão Social na Receita Federal) para documentos que só tinham o CNPJ
  useEffect(() => {
    const pendentesNome = allDocs.filter(
      d =>
        d.emitenteCnpj &&
        d.emitenteCnpj.replace(/\D/g, '').length === 14 &&
        (d.emitenteNome.includes('Aguardando') ||
          d.emitenteNome.toLowerCase().includes('não identificado') ||
          d.emitenteNome.startsWith('CNPJ ') ||
          d.emitenteNome.startsWith('Emitente CNPJ')) &&
        !resolvingCnpjsRef.current.has(d.emitenteCnpj.replace(/\D/g, ''))
    );

    if (pendentesNome.length === 0) return;

    const cnpjsUnicos = Array.from(new Set(pendentesNome.map(d => d.emitenteCnpj.replace(/\D/g, '')))).slice(0, 5);
    cnpjsUnicos.forEach(c => resolvingCnpjsRef.current.add(c));

    (async () => {
      let houveAtualizacao = false;
      const docsAtualizados: DocumentoFiscalArmazenado[] = [];

      for (const cnpj of cnpjsUnicos) {
        try {
          const resp = await fetch(`/api/cnpj/${cnpj}`);
          if (resp.ok) {
            const data = await resp.json();
            const razao = data.razao_social || data.nome_fantasia;
            if (razao) {
              allDocs
                .filter(d => d.emitenteCnpj.replace(/\D/g, '') === cnpj)
                .forEach(d => {
                  docsAtualizados.push({
                    ...d,
                    emitenteNome: razao
                  });
                  houveAtualizacao = true;
                });
            }
          }
        } catch {}
      }

      if (houveAtualizacao && docsAtualizados.length > 0) {
        upsertSefazDocuments(docsAtualizados);
        setAllDocs(loadAllStoredDocuments());
      }
    })();
  }, [allDocs]);

  // Fecha dropdown de empresas ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCompanyDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Hook do Robô de Varredura Automática
  const robot = useSefazRobot(
    companies,
    selectedCompanyId === 'TODAS' ? '' : selectedCompanyId,
    (updatedCompanies) => setCompanies(updatedCompanies)
  );

  // Empresa selecionada
  const activeCompany = useMemo(() => {
    if (selectedCompanyId === 'TODAS') return null;
    return companies.find(c => c.id === selectedCompanyId) || null;
  }, [companies, selectedCompanyId]);

  // Navega para o Cadastro de Clientes (Configurações Gerais), abrindo a empresa selecionada se houver
  const handleAbrirCadastroCertificado = () => {
    if (activeCompany) {
      localStorage.setItem('moreira_lima_open_company_cert', activeCompany.id);
    }
    if (onNavigateToConfig) {
      onNavigateToConfig();
    }
  };

  // Lista de Competências Únicas encontradas nos documentos
  const competenciasDisponiveis = useMemo(() => {
    const setComp = new Set<string>();
    allDocs.forEach(d => {
      if (d.competencia) setComp.add(d.competencia);
    });
    return Array.from(setComp).sort().reverse();
  }, [allDocs]);

  // Função para aplicar os filtros ao clicar no botão "Pesquisar"
  // Se o usuário digitar uma Chave de Acesso de 44 dígitos que ainda não está salva localmente,
  // busca e baixa automaticamente o XML na SEFAZ Nacional (manifestando Ciência 210210)!
  const handleAplicarFiltros = async () => {
    setAppliedFilters({
      operacao: filtroOperacao,
      situacao: filtroSituacao,
      dataInicio: filtroDataInicio,
      dataFim: filtroDataFim,
      competencia: filtroCompetencia,
      fornecedor: filtroFornecedor,
      numeroChave: filtroNumeroChave,
      valor: filtroValor
    });
    setCurrentPage(1);

    const cleanSearchKey = filtroNumeroChave.replace(/\D/g, '');
    if (cleanSearchKey.length === 44) {
      const jaExisteLocal = allDocs.some(d => (d.chave || '').replace(/\D/g, '') === cleanSearchKey);
      if (!jaExisteLocal) {
        const targetComp =
          activeCompany && isEmpresaHabilitadaParaConsultaNfe(activeCompany)
            ? activeCompany
            : companies.find(c => {
                const cnpj = (c.cnpj || '').replace(/\D/g, '');
                return isEmpresaHabilitadaParaConsultaNfe(c) && cnpj === cleanSearchKey.slice(6, 20);
              }) || companies.find(isEmpresaHabilitadaParaConsultaNfe);

        if (targetComp) {
          setSuccessMessage(`Consultando Chave de Acesso ${cleanSearchKey} diretamente na SEFAZ Nacional para ${targetComp.razaoSocial}...`);
          const res = await capturarNotasNaSefazPorChaves(targetComp, cleanSearchKey);
          setAllDocs(loadAllStoredDocuments());
          if (res.sucesso) {
            setSuccessMessage(`Nota fiscal capturada com sucesso na SEFAZ Nacional (${res.mensagens[0] || ''})!`);
          } else {
            setErrorMessage(res.mensagens[0] || 'Não foi possível localizar a chave na SEFAZ para a empresa selecionada.');
          }
          setTimeout(() => setSuccessMessage(null), 7000);
        }
      }
    }
  };

  // Função para limpar e restaurar os filtros aos valores padrão (últimos 90 dias)
  const handleLimparFiltros = () => {
    const defaultDataInicio = getData90DiasAtras();
    const defaultDataFim = getUltimoDiaMesCorrente();

    setFiltroDataInicio(defaultDataInicio);
    setFiltroDataFim(defaultDataFim);
    setFiltroCompetencia('');
    setFiltroFornecedor('');
    setFiltroNumeroChave('');
    setFiltroValor('');
    setFiltroSituacao('TODAS');
    setFiltroOperacao('TODAS');

    setAppliedFilters({
      operacao: 'TODAS',
      situacao: 'TODAS',
      dataInicio: defaultDataInicio,
      dataFim: defaultDataFim,
      competencia: '',
      fornecedor: '',
      numeroChave: '',
      valor: ''
    });
    setCurrentPage(1);
  };

  const isDefaultDataInicio = filtroDataInicio === getData90DiasAtras();
  const isDefaultDataFim = filtroDataFim === getUltimoDiaMesCorrente();
  const temFiltrosAtivos = !isDefaultDataInicio || !isDefaultDataFim || Boolean(filtroCompetencia) || Boolean(filtroFornecedor) || Boolean(filtroNumeroChave) || Boolean(filtroValor) || filtroSituacao !== 'TODAS' || filtroOperacao !== 'TODAS';

  // Filtragem dos documentos para a tabela com base nos Filtros Aplicados
  const filteredDocs = useMemo(() => {
    return allDocs.filter(doc => {
      // 1. Empresa Selecionada
      if (selectedCompanyId !== 'TODAS') {
        const cleanSelected = (activeCompany?.cnpj || '').replace(/\D/g, '');
        if (cleanSelected && doc.empresaCnpj !== cleanSelected) {
          return false;
        }
      }

      // 2. Operação (Entrada / Saída)
      if (appliedFilters.operacao !== 'TODAS') {
        const cleanKey = (doc.chave || '').replace(/\D/g, '');
        const emitDaChave = cleanKey.length === 44 ? cleanKey.slice(6, 20) : (doc.emitenteCnpj || '').replace(/\D/g, '');
        const cleanEmpDoc = (doc.empresaCnpj || '').replace(/\D/g, '');
        const isEmitidaPelaEmpresa = Boolean(cleanEmpDoc && emitDaChave === cleanEmpDoc);

        if (appliedFilters.operacao === 'SAIDA' && !isEmitidaPelaEmpresa) return false;
        if (appliedFilters.operacao === 'ENTRADA' && isEmitidaPelaEmpresa) return false;
      }

      // 3. Situação da Nota (Autorizadas, Canceladas, Denegadas, CC-e)
      if (appliedFilters.situacao !== 'TODAS') {
        if (doc.situacao !== appliedFilters.situacao) return false;
      }

      // 4. Data Inicial & Final (Data de Emissão)
      const docYMD = extrairDataYMD(doc);
      if (docYMD) {
        if (appliedFilters.dataInicio && docYMD < appliedFilters.dataInicio) return false;
        if (appliedFilters.dataFim && docYMD > appliedFilters.dataFim) return false;
      }

      // 5. Competência (Ex: "09/2026" ou "2026-09")
      if (appliedFilters.competencia.trim()) {
        const targetComp = appliedFilters.competencia.trim();
        let formattedTarget = targetComp;
        if (/^\d{4}-\d{2}$/.test(targetComp)) {
          const [y, m] = targetComp.split('-');
          formattedTarget = `${m}/${y}`;
        }
        if (doc.competencia !== formattedTarget && !doc.competencia.toLowerCase().includes(targetComp.toLowerCase())) {
          return false;
        }
      }

      // 6. Fornecedor / Emitente
      if (appliedFilters.fornecedor.trim()) {
        const q = appliedFilters.fornecedor.toLowerCase().trim();
        const cleanQ = q.replace(/\D/g, '');
        const matchNome = (doc.emitenteNome || '').toLowerCase().includes(q);
        const matchCnpj = cleanQ.length > 0 && (doc.emitenteCnpj || '').replace(/\D/g, '').includes(cleanQ);
        if (!matchNome && !matchCnpj) return false;
      }

      // 7. Número da Nota ou Chave de Acesso
      if (appliedFilters.numeroChave.trim()) {
        const q = appliedFilters.numeroChave.toLowerCase().trim();
        const cleanQ = q.replace(/\D/g, '');
        const matchNum = (doc.nNF || '').toLowerCase().includes(q);
        const matchChave = (doc.chave || '').toLowerCase().includes(q) || (cleanQ.length > 0 && (doc.chave || '').includes(cleanQ));
        if (!matchNum && !matchChave) return false;
      }

      // 8. Valor da NF
      if (appliedFilters.valor.trim()) {
        const rawValor = appliedFilters.valor.replace(',', '.').replace(/[^\d.]/g, '');
        const numValor = parseFloat(rawValor);
        if (!isNaN(numValor)) {
          const docVal = doc.valorTotal || 0;
          const docValStr = docVal.toFixed(2).replace('.', ',');
          const matchesValStr = docValStr.includes(appliedFilters.valor.trim()) || docVal.toString().includes(rawValor);
          const matchesValNum = Math.abs(docVal - numValor) < 0.01;
          if (!matchesValStr && !matchesValNum) return false;
        }
      }

      return true;
    });
  }, [
    allDocs, 
    selectedCompanyId, 
    activeCompany, 
    appliedFilters
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / itemsPerPage));

  const paginatedDocs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredDocs.slice(start, start + itemsPerPage);
  }, [filteredDocs, currentPage, itemsPerPage]);

  const valorTotalFiltrado = useMemo(() => {
    return filteredDocs.reduce((acc, d) => acc + (d.valorTotal || 0), 0);
  }, [filteredDocs]);

  const empresasUnicasNaLista = useMemo(() => {
    const s = new Set(filteredDocs.map(d => d.empresaCnpj));
    return s.size;
  }, [filteredDocs]);

  const handleToggleSelectAll = () => {
    if (selectedDocIds.size === filteredDocs.length && filteredDocs.length > 0) {
      setSelectedDocIds(new Set());
    } else {
      setSelectedDocIds(new Set(filteredDocs.map(d => d.id)));
    }
  };

  const handleToggleSelectDoc = (id: string) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const encontrarEmpresaDoDocumento = (doc: DocumentoFiscalArmazenado): Company | null => {
    const cleanEmp = (doc.empresaCnpj || '').replace(/\D/g, '');
    return companies.find(c => (c.cnpj || '').replace(/\D/g, '') === cleanEmp) || activeCompany || null;
  };

  const dispararDownloadArquivoBrowser = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /**
   * Obtém EXCLUSIVAMENTE o XML Oficial Autêntico da SEFAZ:
   * 1. Se já estiver no cache/IndexedDB como procNFe completo oficial (<nfeProc>), retorna imediatamente.
   * 2. Caso contrário, consulta /api/sefaz/baixar-xml-oficial (que registra APENAS Ciência da Operação 210210
   *    na SEFAZ e faz o download do XML original assinado pelo emitente).
   * 3. NUNCA manifesta Confirmação (210200) automaticamente — a próxima manifestação fica a cargo do usuário.
   */
  const garantirXmlCompletoParaDocumento = async (doc: DocumentoFiscalArmazenado): Promise<string> => {
    const xmlCache = await carregarXmlAutenticoAsync(doc);
    if (xmlCache && isXmlNfeCompletaOficial(xmlCache)) {
      return xmlCache;
    }

    const comp = encontrarEmpresaDoDocumento(doc);
    const cleanChave = (doc.chave || '').replace(/\D/g, '');

    if (comp && comp.certificateFile && cleanChave.length === 44) {
      try {
        const resp = await fetch('/api/sefaz/baixar-xml-oficial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cnpj: (comp.cnpj || '').replace(/\D/g, ''),
            pfxBase64: comp.certificateFile,
            passphrase: comp.certificatePassword,
            chNFe: cleanChave,
            ambiente: 1,
            ufAutor: normalizarCodigoUfIbge(comp.uf),
            manifestarAutomaticamente: true,
            dadosExistentes: {
              nsu: doc.nsu,
              nNF: doc.nNF,
              serie: doc.serie,
              emitCNPJ: doc.emitenteCnpj,
              emitNome: doc.emitenteNome,
              valorTotal: doc.valorTotal,
              dataEmissao: doc.dataEmissao
            }
          })
        });

        if (resp.ok) {
          const data: RespostaDownloadXmlOficial = await resp.json();
          if (data.todosDocumentosRetornados && data.todosDocumentosRetornados.length > 0) {
            const convertidos = data.todosDocumentosRetornados.map(raw => converterDfeParaDocumentoArmazenado(raw, comp));
            upsertSefazDocuments(convertidos);
            salvarDocumentosNoRepositorioAutomatico(convertidos).catch(() => {});
            setAllDocs(loadAllStoredDocuments());
          }
          if (data.documento?.xml) {
            await salvarXmlNoIndexedDb(cleanChave, data.documento.xml);
            const docAtualizado = converterDfeParaDocumentoArmazenado(data.documento, comp);
            upsertSefazDocuments([docAtualizado]);
            salvarDocumentosNoRepositorioAutomatico([docAtualizado]).catch(() => {});
            setAllDocs(loadAllStoredDocuments());
            return data.documento.xml;
          }
        }
      } catch (e) {
        console.warn('Erro ao consultar XML oficial na SEFAZ:', e);
      }
    }

    return xmlCache || '';
  };

  const handleViewDanfe = async (doc: DocumentoFiscalArmazenado) => {
    setDownloadingKeyId(doc.id);
    try {
      const xml = await garantirXmlCompletoParaDocumento(doc);
      setDanfeDoc({
        ...doc,
        xml,
        tipo: isXmlNfeCompletaOficial(xml) ? 'NFE_COMPLETA' : doc.tipo,
        schema: isXmlNfeCompletaOficial(xml) ? 'procNFe_v4.00.xsd' : doc.schema
      });
    } finally {
      setDownloadingKeyId(null);
    }
  };

  const handleViewXml = async (doc: DocumentoFiscalArmazenado) => {
    setDownloadingKeyId(doc.id);
    try {
      const xml = await garantirXmlCompletoParaDocumento(doc);
      setViewingXmlDoc({
        ...doc,
        xml,
        tipo: isXmlNfeCompletaOficial(xml) ? 'NFE_COMPLETA' : doc.tipo,
        schema: isXmlNfeCompletaOficial(xml) ? 'procNFe_v4.00.xsd' : doc.schema
      });
    } finally {
      setDownloadingKeyId(null);
    }
  };

  /**
   * Botão de Download de XML Individual:
   * Grava na pasta local do computador (<Empresa>/<AAAA-MM>/<Chave>.xml)
   * e dispara o download do arquivo original completo (procNFe)!
   */
  const handleDownloadXml = async (doc: DocumentoFiscalArmazenado) => {
    setErrorMessage(null);
    setDownloadingKeyId(doc.id);
    try {
      const xmlFinal = await garantirXmlCompletoParaDocumento(doc);
      if (!xmlFinal || !isXmlNfeCompletaOficial(xmlFinal)) {
        setErrorMessage('O XML completo (procNFe) desta nota ainda está sendo liberado pela SEFAZ. Tente novamente em instantes.');
        return;
      }

      const docParaSalvar: DocumentoFiscalArmazenado = {
        ...doc,
        xml: xmlFinal,
        tipo: 'NFE_COMPLETA',
        schema: 'procNFe_v4.00.xsd'
      };

      const { pastaEmpresa, pastaMes, nomeArquivo } = montarCaminhoRelativoXml(docParaSalvar);
      const salvoNaPastaLocal = await salvarXmlNaPastaLocalComputador(docParaSalvar, xmlFinal);
      dispararDownloadArquivoBrowser(nomeArquivo, xmlFinal);

      setSuccessMessage(
        salvoNaPastaLocal
          ? `XML Oficial Completo (procNFe) da NF ${doc.nNF} baixado e gravado diretamente na pasta do seu computador em "${pastaEmpresa}/${pastaMes}/${nomeArquivo}"!`
          : `XML Oficial Completo (procNFe) da NF ${doc.nNF} baixado para o seu computador!`
      );
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao baixar XML.');
    } finally {
      setDownloadingKeyId(null);
    }
  };

  /**
   * Download ZIP em Lote:
   * Organiza todos os arquivos automaticamente em pastas por Empresa e por Mês de Emissão:
   *   <Nome_Empresa_CNPJ> / <AAAA-MM> / <Chave_44_Digitos>.xml
   */
  const handleDownloadZip = async () => {
    const targetDocs = selectedDocIds.size > 0 
      ? filteredDocs.filter(d => selectedDocIds.has(d.id))
      : filteredDocs;

    if (targetDocs.length === 0) {
      setErrorMessage('Nenhum documento listado para exportar.');
      return;
    }

    setIsBatchProcessing(true);
    setErrorMessage(null);
    setSuccessMessage('Organizando XMLs originais (procNFe) em pastas por Empresa e Mês de Emissão...');

    try {
      const zip = new JSZip();
      let countCompletas = 0;

      for (const doc of targetDocs) {
        const xml = await garantirXmlCompletoParaDocumento(doc);
        if (!xml || !isXmlNfeCompletaOficial(xml)) continue;

        const { pastaEmpresa, pastaMes, nomeArquivo } = montarCaminhoRelativoXml(doc);
        zip.file(`${pastaEmpresa}/${pastaMes}/${nomeArquivo}`, xml);
        countCompletas++;
      }

      if (countCompletas === 0) {
        setErrorMessage('Não foi possível obter os arquivos XML completos (procNFe).');
        return;
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `XMLs_Oficiais_Por_Empresa_e_Mes_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccessMessage(
        `Pacote ZIP baixado com ${countCompletas} NF-e Completa(s) (procNFe) organizadas em pastas por Empresa e Mês (<Empresa>/<AAAA-MM>/<Chave>.xml)!`
      );
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (e: any) {
      setErrorMessage(`Erro ao gerar pacote ZIP: ${e.message}`);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Limpar TODOS os XMLs capturados e zerar cursores NSU
  const handleLimparTodosXmlsCapturados = async () => {
    await expurgarTodosDocumentosECacheSefaz();
    setCompanies(loadStoredCompanies());
    setAllDocs([]);
    setSelectedDocIds(new Set());
    setSuccessMessage('Todos os XMLs capturados anteriormente foram excluídos e os cursores NSU foram reiniciados para 0.');
    setTimeout(() => setSuccessMessage(null), 6000);
  };

  // Exportação Excel Simples
  const handleExportExcelSimples = () => {
    const targetDocs = selectedDocIds.size > 0 
      ? filteredDocs.filter(d => selectedDocIds.has(d.id))
      : filteredDocs;

    if (targetDocs.length === 0) {
      setErrorMessage('Nenhum documento para exportar.');
      return;
    }

    const rows = targetDocs.map(d => ({
      'Emissão': d.dataGeracaoFormatada.split(' ')[0],
      'Mês/Ano': d.competencia,
      'Nº NF': d.nNF,
      'Série': d.serie,
      'Operação': d.tipoOperacao === 'SAIDA' ? 'Emitida (Saída)' : 'Recebida (Entrada)',
      'Emitida Por (CNPJ)': formatarCnpj(d.emitenteCnpj),
      'Emitida Por (Razão Social)': d.emitenteNome,
      'Emitida Para (CNPJ)': formatarCnpj(d.destinatarioCnpj),
      'Emitida Para (Razão Social)': d.destinatarioNome,
      'Valor Total (R$)': d.valorTotal,
      'Situação': d.situacao,
      'Tipo XML': d.tipo === 'NFE_COMPLETA' ? 'procNFe Completo' : d.tipo,
      'Chave de Acesso': d.chave
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Documentos Fiscais');
    XLSX.writeFile(wb, `relacao_fiscal_simples_${new Date().toISOString().slice(0, 10)}.xlsx`);

    setSuccessMessage(`Planilha simples gerada com ${rows.length} registros!`);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Exportação Excel Completo
  const handleExportExcelCompleto = () => {
    const targetDocs = selectedDocIds.size > 0 
      ? filteredDocs.filter(d => selectedDocIds.has(d.id))
      : filteredDocs;

    if (targetDocs.length === 0) {
      setErrorMessage('Nenhum documento para exportar.');
      return;
    }

    const rows = targetDocs.map(d => {
      const { caminhoCompletoRelativo } = montarCaminhoRelativoXml(d);
      return {
        'Empresa Monitorada': d.empresaRazaoSocial,
        'CNPJ Empresa': formatarCnpj(d.empresaCnpj),
        'Data Emissão': d.dataGeracaoFormatada,
        'Competência': d.competencia,
        'Tipo de Operação': d.tipoOperacao === 'SAIDA' ? '1 - Saída (Emitida)' : '0 - Entrada (Recebida)',
        'Emitente CNPJ/CPF': formatarCnpj(d.emitenteCnpj),
        'Emitente Razão Social': d.emitenteNome,
        'Emitente Tipo': d.emitenteTipo === 'PROPRIA' ? 'P (Própria)' : 'T (Terceiro)',
        'Destinatário CNPJ/CPF': formatarCnpj(d.destinatarioCnpj),
        'Destinatário Razão Social': d.destinatarioNome,
        'Destinatário Tipo': d.destinatarioTipo === 'PROPRIA' ? 'P (Própria)' : 'T (Terceiro)',
        'Valor Total NF-e': d.valorTotal,
        'Situação SEFAZ': d.situacao,
        'Schema XML': d.schema,
        'Número NF-e': d.nNF,
        'Série': d.serie,
        'NSU': d.nsu,
        'Caminho no Repositório': caminhoCompletoRelativo,
        'Chave de Acesso': d.chave
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório Completo');
    XLSX.writeFile(wb, `relatorio_fiscal_completo_${new Date().toISOString().slice(0, 10)}.xlsx`);

    setSuccessMessage(`Planilha completa gerada com ${rows.length} registros detalhados!`);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleImprimirRelacaoPdf = () => {
    window.print();
  };

  // Enviar documentos selecionados para o Auditor XML (apenas XMLs oficiais procNFe)
  const handleEnviarAoAuditor = async () => {
    const targetDocs = selectedDocIds.size > 0 
      ? filteredDocs.filter(d => selectedDocIds.has(d.id))
      : filteredDocs;

    if (targetDocs.length === 0) {
      setErrorMessage('Nenhum documento listado para auditar.');
      return;
    }

    setIsBatchProcessing(true);
    try {
      const xmlList: string[] = [];
      for (const d of targetDocs) {
        const xml = await garantirXmlCompletoParaDocumento(d);
        if (xml && isXmlNfeCompletaOficial(xml)) {
          xmlList.push(xml);
        }
      }

      if (xmlList.length === 0) {
        setErrorMessage('Nenhum XML Oficial Completo (procNFe) disponível nos documentos selecionados.');
        return;
      }

      if (onNavigateToAuditor) {
        onNavigateToAuditor(xmlList);
      } else {
        setSuccessMessage(`${xmlList.length} XML(s) oficiais enviados para auditoria fiscal!`);
      }
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Manifestação do Destinatário Manual (210200 Confirmação, 210220 Desconhecimento, 210240 Operação não Realizada, 210210 Ciência)
  const handleAbrirManifestacaoDoc = (doc: DocumentoFiscalArmazenado) => {
    setManifestandoDoc(doc);
    setIsManifestacaoModalOpen(true);
  };

  const handleConfirmarManifestacaoManual = async (params: {
    chNFe: string;
    tpEvento: TipoEventoManifestacao;
    justificativa?: string;
  }) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const comp = manifestandoDoc ? encontrarEmpresaDoDocumento(manifestandoDoc) : activeCompany;
    if (!comp || !comp.certificateFile) {
      setErrorMessage('Selecione uma empresa com Certificado Digital A1 configurado para transmitir a manifestação.');
      return;
    }

    setIsSubmittingManifestacao(true);
    try {
      const resp = await fetch('/api/sefaz/manifestar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnpj: (comp.cnpj || '').replace(/\D/g, ''),
          pfxBase64: comp.certificateFile,
          passphrase: comp.certificatePassword,
          chNFe: params.chNFe,
          tpEvento: params.tpEvento,
          justificativa: params.justificativa,
          ambiente: 1
        })
      });

      const data: RespostaManifestacaoDestinatario = await resp.json();
      if (!resp.ok) {
        throw new Error((data as any).error || `Erro HTTP ${resp.status}`);
      }

      if (!data.sucesso) {
        throw new Error(`SEFAZ [${data.cStatEvento}]: ${data.xMotivoEvento}`);
      }

      const mapaStatus: Record<TipoEventoManifestacao, DocumentoFiscalArmazenado['manifestacao']> = {
        '210200': 'CONFIRMADA',
        '210210': 'CIENCIA',
        '210220': 'DESCONHECIDA',
        '210240': 'NAO_REALIZADA'
      };

      if (manifestandoDoc) {
        const docAtualizado: DocumentoFiscalArmazenado = {
          ...manifestandoDoc,
          manifestacao: mapaStatus[params.tpEvento],
          tipoEvento: params.tpEvento,
          descricaoEvento: data.xMotivoEvento
        };
        upsertSefazDocuments([docAtualizado]);
        setAllDocs(loadAllStoredDocuments());
      }

      setIsManifestacaoModalOpen(false);
      setManifestandoDoc(null);
      setSuccessMessage(
        `Manifestação [${params.tpEvento}] registrada com sucesso na SEFAZ (${data.cStatEvento} - ${data.xMotivoEvento})${
          data.nProt ? ` • Protocolo: ${data.nProt}` : ''
        }!`
      );
      setTimeout(() => setSuccessMessage(null), 7000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao registrar manifestação na SEFAZ.');
    } finally {
      setIsSubmittingManifestacao(false);
    }
  };

  const empresasHabilitadasConsulta = useMemo(() => {
    return companies.filter(
      c => Boolean(c.certificateFile && c.certificatePassword) && c.consultaNfeHabilitada !== false && c.autoPollEnabled !== false
    );
  }, [companies]);

  const empresasComCertificado = empresasHabilitadasConsulta;

  return (
    <div className="w-full max-w-none space-y-2.5">

      {/* Top Bar - Seletor de Empresa (Esquerda) & Ícones do Robô e Configurações (Direita) */}
      <div className="w-full bg-white rounded-xl border border-slate-200 shadow-xs px-3.5 py-1.5 flex flex-wrap items-center justify-between gap-3">
        
        {/* Lado Esquerdo: Seletor de Empresa (Razão Social Completa) */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-bold text-slate-700 whitespace-nowrap shrink-0">
            Empresa:
          </span>
          <div className="relative flex-1 max-w-2xl" ref={dropdownRef}>
            <button
              onClick={() => setIsCompanyDropdownOpen(!isCompanyDropdownOpen)}
              className="w-full px-3 py-1.5 bg-[#04243b] text-white hover:bg-[#031d30] rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all cursor-pointer justify-between border border-slate-700 min-w-[220px]"
              title="Clique para alterar a empresa ou selecionar Todas as Empresas"
            >
              <div className="flex items-center gap-2 truncate text-left min-w-0">
                <Building2 className="h-4 w-4 text-[#e4b35e] shrink-0" />
                <span className="truncate text-white font-extrabold text-xs">
                  {selectedCompanyId === 'TODAS' 
                    ? 'Todas as Empresas' 
                    : (activeCompany?.razaoSocial || 'Selecione uma empresa')}
                </span>
              </div>
              <ChevronDown className={`h-4 w-4 text-slate-300 shrink-0 transition-transform ${isCompanyDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isCompanyDropdownOpen && (
              <div className="absolute left-0 mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-2.5 border-b border-slate-100 bg-slate-50">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar empresa por Razão Social ou CNPJ..."
                      value={companySearchQuery}
                      onChange={(e) => setCompanySearchQuery(e.target.value)}
                      className="w-full text-xs pl-8 pr-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-[#04243b]"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-xs">
                  <button
                    onClick={() => {
                      setSelectedCompanyId('TODAS');
                      setIsCompanyDropdownOpen(false);
                    }}
                    className={`w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-center justify-between ${
                      selectedCompanyId === 'TODAS' ? 'bg-amber-50 font-bold text-[#04243b]' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-[#e4b35e]" />
                      <div>
                        <div className="font-bold">Todas as Empresas</div>
                        <div className="text-[10px] text-slate-500 font-normal">Visualizar todos os documentos</div>
                      </div>
                    </div>
                    {selectedCompanyId === 'TODAS' && <Check className="h-4 w-4 text-emerald-600" />}
                  </button>

                  {empresasHabilitadasConsulta.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 text-xs">
                      Nenhuma empresa com Certificado Digital A1 e Consulta NF-e Habilitada.
                    </div>
                  ) : (
                    empresasHabilitadasConsulta
                      .filter(c => {
                        if (!companySearchQuery) return true;
                        const q = companySearchQuery.toLowerCase();
                        return (c.razaoSocial || '').toLowerCase().includes(q) || (c.cnpj || '').includes(q);
                      })
                      .map(comp => {
                        const isSelected = comp.id === selectedCompanyId;

                        return (
                          <button
                            key={comp.id}
                            onClick={() => {
                              setSelectedCompanyId(comp.id);
                              setIsCompanyDropdownOpen(false);
                            }}
                            className={`w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${
                              isSelected ? 'bg-amber-50 font-bold text-[#04243b]' : 'text-slate-700'
                            }`}
                          >
                            <div className="truncate pr-2">
                              <div className="font-semibold truncate">{comp.razaoSocial}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{comp.cnpj || 'Sem CNPJ'}</div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                                Cert A1
                              </span>
                              {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                            </div>
                          </button>
                        );
                      })
                  )}
                </div>

                <div className="p-2 border-t border-slate-100 bg-slate-50 flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">{empresasHabilitadasConsulta.length} empresa(s) habilitada(s)</span>
                  <button
                    onClick={() => {
                      setIsCompanyDropdownOpen(false);
                      handleAbrirCadastroCertificado();
                    }}
                    className="text-[#04243b] hover:text-[#e4b35e] font-bold cursor-pointer"
                  >
                    Gerenciar no Cadastro →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito: Ícone Robô (Verde / Vermelho) | Ícone Configurações (Engrenagem) */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Botão Ícone do Robô: Verde = Ativo / Vermelho = Pausado */}
          <button
            onClick={robot.toggleAtivo}
            className={`p-1.5 rounded-xl transition-all shadow-xs flex items-center justify-center cursor-pointer relative border ${
              robot.config.ativo
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-300'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-300'
            }`}
            title={
              robot.config.ativo 
                ? 'Robô de Varredura Ativo (Clique para pausar)' 
                : 'Robô de Varredura Pausado (Clique para ativar)'
            }
          >
            {robot.config.ativo && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
            )}
            <Bot className="h-5 w-5" />
          </button>

          {/* Botão Ícone de Configurações (Engrenagem) */}
          <button
            onClick={() => setIsRoboModalOpen(true)}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-all shadow-xs flex items-center justify-center cursor-pointer"
            title="Configurações do Robô & SEFAZ"
          >
            <Settings className="h-5 w-5" />
          </button>

        </div>

      </div>

      {/* Notificações de Sucesso / Erro */}
      {successMessage && (
        <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-600 hover:text-rose-800 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* BARRA DE FILTROS REFORMULADA (RODATETO) - DESIGN COMPACTO COM METADE DA ALTURA */}
      <div className="w-full bg-white rounded-xl border border-slate-200 shadow-xs p-2.5 print:hidden space-y-2">
        
        {/* Linha 1: Período, Competência, Situação, Operação (4 Colunas) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs items-end">
          
          {/* Período: Data Inicial & Final (Default: Mês Corrente) */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-[#04243b]" />
              <span>Período de Emissão (De / Até)</span>
            </label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={filtroDataInicio}
                onChange={(e) => setFiltroDataInicio(e.target.value)}
                className="w-full px-2 py-1 border border-slate-300 rounded-lg bg-slate-50 text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#04243b]"
                title="Data inicial (padrão: início do mês corrente)"
              />
              <span className="text-slate-400 font-bold text-xs">à</span>
              <input
                type="date"
                value={filtroDataFim}
                onChange={(e) => setFiltroDataFim(e.target.value)}
                className="w-full px-2 py-1 border border-slate-300 rounded-lg bg-slate-50 text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#04243b]"
                title="Data final (padrão: fim do mês corrente)"
              />
            </div>
          </div>

          {/* Competência (Mês/Ano) - Default: sem informação */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-[#04243b]" />
              <span>Competência (Mês/Ano)</span>
            </label>
            <select
              value={filtroCompetencia}
              onChange={(e) => setFiltroCompetencia(e.target.value)}
              className="w-full px-2 py-1 border border-slate-300 rounded-lg bg-slate-50 text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#04243b]"
            >
              <option value="">Todas as Competências</option>
              {competenciasDisponiveis.map(comp => (
                <option key={comp} value={comp}>{comp}</option>
              ))}
            </select>
          </div>

          {/* Situação da Nota - Default: Todos os Status */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-[#04243b]" />
              <span>Situação da Nota</span>
            </label>
            <select
              value={filtroSituacao}
              onChange={(e) => setFiltroSituacao(e.target.value as any)}
              className="w-full px-2 py-1 border border-slate-300 rounded-lg bg-slate-50 text-xs font-bold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#04243b]"
            >
              <option value="TODAS">Todos os Status</option>
              <option value="AUTORIZADA">🟢 Autorizadas</option>
              <option value="CANCELADA">🔴 Canceladas</option>
              <option value="DENEGADA">🟠 Denegadas</option>
              <option value="CARTA_CORRECAO">🟡 Cartas de Correção</option>
            </select>
          </div>

          {/* Operação (Todas / Entrada / Saída) */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-[#04243b]" />
              <span>Tipo de Operação</span>
            </label>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setFiltroOperacao('TODAS')}
                className={`flex-1 py-0.5 px-2 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                  filtroOperacao === 'TODAS'
                    ? 'bg-[#04243b] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setFiltroOperacao('ENTRADA')}
                className={`flex-1 py-0.5 px-2 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                  filtroOperacao === 'ENTRADA'
                    ? 'bg-[#04243b] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Entrada
              </button>
              <button
                type="button"
                onClick={() => setFiltroOperacao('SAIDA')}
                className={`flex-1 py-0.5 px-2 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                  filtroOperacao === 'SAIDA'
                    ? 'bg-[#04243b] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Saída
              </button>
            </div>
          </div>

        </div>

        {/* Linha 2: Fornecedor, Número / Chave, Valor da NF, Botões Pesquisar e Limpar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs items-end pt-2 border-t border-slate-100">
          
          {/* Fornecedor / Emitente - Default: sem informação */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
              <UserCheck className="h-3.5 w-3.5 text-[#04243b]" />
              <span>Fornecedor / Emitente</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={filtroFornecedor}
                onChange={(e) => setFiltroFornecedor(e.target.value)}
                placeholder="Razão Social ou CNPJ do fornecedor..."
                className="w-full text-xs pl-8 pr-7 py-1 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#04243b]"
              />
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              {filtroFornecedor && (
                <button
                  type="button"
                  onClick={() => setFiltroFornecedor('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Número da Nota ou Chave de Acesso - Default: sem informação */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
              <Hash className="h-3.5 w-3.5 text-[#04243b]" />
              <span>Nº da Nota ou Chave de Acesso</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={filtroNumeroChave}
                onChange={(e) => setFiltroNumeroChave(e.target.value)}
                placeholder="Nº da nota ou Chave com 44 dígitos..."
                className="w-full text-xs pl-8 pr-7 py-1 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#04243b]"
              />
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              {filtroNumeroChave && (
                <button
                  type="button"
                  onClick={() => setFiltroNumeroChave('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Valor da NF - Default: sem informação */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5 text-[#04243b]" />
              <span>Valor da NF (R$)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={filtroValor}
                onChange={(e) => setFiltroValor(e.target.value)}
                placeholder="Ex: 1500,00"
                className="w-full text-xs pl-7 pr-6 py-1 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#04243b]"
              />
              <span className="text-slate-400 font-bold absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px]">R$</span>
              {filtroValor && (
                <button
                  type="button"
                  onClick={() => setFiltroValor('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Botões Ação: Pesquisar & Limpar Filtros */}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleAplicarFiltros}
              className="flex-1 py-1 px-3 rounded-lg bg-[#04243b] hover:bg-[#031d30] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              title="Pesquisar documentos fiscais com os filtros selecionados"
            >
              <Search className="h-3.5 w-3.5 text-[#e4b35e]" />
              <span>Pesquisar</span>
            </button>

            <button
              type="button"
              onClick={handleLimparFiltros}
              disabled={!temFiltrosAtivos}
              className="py-1 px-2.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shrink-0"
              title="Restaurar período do mês corrente e limpar todos os filtros"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              <span>Limpar</span>
            </button>
          </div>

        </div>

      </div>

      {/* TABELA DE DOCUMENTOS FISCAIS - LARGURA TOTAL */}
      <NfeTabelaListagem
        filteredDocs={filteredDocs}
        paginatedDocs={paginatedDocs}
        selectedDocIds={selectedDocIds}
        onToggleSelectAll={handleToggleSelectAll}
        onToggleSelectDoc={handleToggleSelectDoc}
        downloadingKeyId={downloadingKeyId}
        onViewDanfe={handleViewDanfe}
        onViewXml={handleViewXml}
        onDownloadXml={handleDownloadXml}
        onOpenManifestacao={handleAbrirManifestacaoDoc}
        selectedCompanyId={selectedCompanyId}
        activeCompany={activeCompany}
        onOpenManualModal={() => setIsRoboModalOpen(true)}
        onOpenCertModal={handleAbrirCadastroCertificado}
        currentPage={currentPage}
        totalPages={totalPages}
        itemsPerPage={itemsPerPage}
        onSetPage={setCurrentPage}
        onSetItemsPerPage={setItemsPerPage}
        formatarCnpj={formatarCnpj}
      />

      {/* BARRA INFERIOR DE STATUS E EXPORTAÇÃO */}
      <div className="w-full bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-xs">
        
        <div className="flex flex-wrap items-center gap-3 text-slate-600 font-medium">
          <span className="font-bold text-slate-800">
            {filteredDocs.length} registro(s) listado(s)
          </span>
          <span className="text-slate-300">•</span>
          <span>
            {empresasUnicasNaLista} empresa(s)
          </span>
          <span className="text-slate-300">•</span>
          <span>
            Total: <strong className="text-[#04243b] font-mono">{valorTotalFiltrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
          </span>
          {selectedDocIds.size > 0 && (
            <>
              <span className="text-slate-300">•</span>
              <span className="text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-md">
                {selectedDocIds.size} selecionado(s)
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          
          <button
            onClick={handleExportExcelSimples}
            disabled={filteredDocs.length === 0}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Excel Simples</span>
          </button>

          <button
            onClick={handleExportExcelCompleto}
            disabled={filteredDocs.length === 0}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
            <span>Excel Completo</span>
          </button>

          <button
            onClick={handleImprimirRelacaoPdf}
            disabled={filteredDocs.length === 0}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5 text-rose-600" />
            <span>Relação PDF</span>
          </button>

          <button
            onClick={async () => {
              if (filteredDocs.length > 0) {
                const firstSelected = selectedDocIds.size > 0 
                  ? filteredDocs.find(d => selectedDocIds.has(d.id)) 
                  : filteredDocs[0];
                const target = firstSelected || filteredDocs[0];
                await handleViewDanfe(target);
              }
            }}
            disabled={filteredDocs.length === 0 || isBatchProcessing}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            <FileCode className="h-3.5 w-3.5 text-blue-600" />
            <span>DANFE Padrão Nacional</span>
          </button>

          <button
            onClick={handleDownloadZip}
            disabled={filteredDocs.length === 0 || isBatchProcessing}
            className="px-4 py-2 bg-[#04243b] hover:bg-[#031d30] text-white font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            title="Baixa todos os XMLs organizados em pastas separadas por Empresa e por Mês de Emissão"
          >
            <Archive className="h-3.5 w-3.5 text-[#e4b35e]" />
            <span>{isBatchProcessing ? 'Preparando Pastas...' : 'Baixar Pastas ZIP (Empresa/Mês)'}</span>
          </button>

          {onNavigateToAuditor && (
            <button
              onClick={handleEnviarAoAuditor}
              disabled={filteredDocs.length === 0 || isBatchProcessing}
              className="px-3.5 py-2 bg-[#e4b35e] hover:bg-[#d6a54f] text-[#04243b] font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              title="Auditar XMLs na tela de Auditoria Fiscal"
            >
              <span>Auditar XMLs</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}

        </div>

      </div>

      {/* MODAL: VISUALIZADOR DE XML */}
      <XmlViewerModal
        doc={viewingXmlDoc}
        onClose={() => setViewingXmlDoc(null)}
        onDownloadXml={handleDownloadXml}
      />

      {/* MODAL: REPOSITÓRIO DE PASTAS POR EMPRESA E MÊS DE EMISSÃO */}
      <RepositorioXmlModal
        isOpen={isRepoModalOpen}
        onClose={() => setIsRepoModalOpen(false)}
        allDocs={allDocs}
        onEnsureXmlForDoc={garantirXmlCompletoParaDocumento}
        onPurgeAllDocs={handleLimparTodosXmlsCapturados}
      />

      {/* MODAL: ROBÔ DE VARREDURA AUTOMÁTICA EM SEGUNDO PLANO */}
      <RoboVarreduraModal
        isOpen={isRoboModalOpen}
        onClose={() => setIsRoboModalOpen(false)}
        config={robot.config}
        onUpdateConfig={robot.updateConfig}
        onToggleAtivo={robot.toggleAtivo}
        logs={robot.logs}
        onClearLogs={robot.clearLogs}
        isPollingNow={robot.isPollingNow}
        currentlyPollingCompany={robot.currentlyPollingCompany}
        secondsUntilNextSweep={robot.secondsUntilNextSweep}
        companies={companies}
        selectedCompanyId={selectedCompanyId === 'TODAS' ? (companies[0]?.id || '') : selectedCompanyId}
        onOpenCertModal={handleAbrirCadastroCertificado}
      />

      {/* MODAL: VISUALIZADOR DE DANFE PADRÃO NACIONAL */}
      <DanfeModal
        isOpen={Boolean(danfeDoc)}
        onClose={() => setDanfeDoc(null)}
        documento={danfeDoc}
        onDownloadXml={(doc) => handleDownloadXml(doc)}
      />

      {/* MODAL: MANIFESTAÇÃO MANUAL DO DESTINATÁRIO PELO USUÁRIO */}
      <ManifestacaoModal
        isOpen={isManifestacaoModalOpen}
        onClose={() => {
          setIsManifestacaoModalOpen(false);
          setManifestandoDoc(null);
        }}
        documento={manifestandoDoc}
        empresa={manifestandoDoc ? encontrarEmpresaDoDocumento(manifestandoDoc) : activeCompany}
        isSubmitting={isSubmittingManifestacao}
        onConfirmManifestacao={handleConfirmarManifestacaoManual}
      />

    </div>
  );
}
