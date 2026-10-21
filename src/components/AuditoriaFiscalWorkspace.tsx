/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx-js-style';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  RefreshCw, 
  FileText,
  ShieldAlert,
  FileCheck2,
  X,
  AlertCircle,
  Table,
  Database,
  Coins,
  Package,
  Info,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Combine,
  Trash2,
  ShieldCheck,
  Zap,
  Sliders
} from 'lucide-react';
import { 
  executeDataAudit, 
  exportAuditExcel, 
  AuditItem, 
  AuditSummary,
  InvoiceRow,
  parseSefazReportAsync,
  parseErpReportAsync,
  executeDataAuditAsync,
  parseSigaFullReport,
  parseSigaChannelFile,
  identifySigaDuplicates,
  exportSigaAuditExcel,
  formatCnpjCpf,
  splitProductCodeAndDesc
} from '../utils/auditHelper';
import {
  PisCofinsItem,
  PisCofinsMetadata,
  PisCofinsConsolidatedItem,
  parsePisCofinsReportAsync,
  consolidatePisCofinsRows,
  exportPisCofinsExcel,
  PisCofinsAuditError,
  auditPisCofinsReport
} from '../utils/pisCofinsHelper';
import { SAMPLE_RAW_REPORT } from '../data/sampleReport';
import { AuditService } from '../modules/audit/AuditService';
import { ErpIcmsReportItem } from '../modules/audit/erpIcms/ErpIcmsProcessor';

// Interface structures
export interface ReportItem {
  notaFiscal: string;
  data: string;
  cnpj: string;
  cfop: string;
  codigoProduto: string;
  nomeProduto: string;
  ncm: string;
  un: string;
  qtde: number;
  rUnit: number;
  rProduto: number;
  desconto: number;
  vlrContabil: number;
  cst: string;
  rBaseIcms: number;
  pIcms: number;
  rIcms: number;
  pIpi: number;
  rIpi: number;
}

export interface ReportMetadata {
  empresa: string;
  periodo: string;
  dataGeracao: string;
}

const BRAND_CONFIG = {
  COMPANY_NAME: 'MOREIRA & LIMA CONTADORES ASSOCIADOS',
  SUBTITLE: 'WORKSPACE COCKPIT FISCAL & DATA LAKE DE AUDITORIA',
} as const;

const CFOP_DESC: Record<string, string> = {
  '1-403': 'Compra p/ revenda sujeita a Substituição Tributária (ST)',
  '5-405': 'Venda de mercadoria c/ ST cobrado anteriormente',
  '5-910': 'Remessa em bonificação, doação ou brinde',
  '5-949': 'Outra saída de mercadoria ou prestação não especificada',
  '1403': 'Compra p/ revenda sujeita a Substituição Tributária (ST)',
  '5405': 'Venda de mercadoria c/ ST cobrado anteriormente',
  '5910': 'Remessa em bonificação, doação ou brinde',
  '5949': 'Outra saída de mercadoria ou prestação não especificada',
};

const CST_DESC: Record<string, string> = {
  '00': 'Tributada integralmente',
  '10': 'Tributada e com cobrança do ICMS por ST',
  '20': 'Com redução de base de cálculo',
  '30': 'Isenta ou não tributada e com cobrança do ICMS por ST',
  '40': 'Isenta',
  '41': 'Não tributada',
  '50': 'Suspensão',
  '51': 'Diferimento',
  '60': 'ICMS cobrado anteriormente por substituição tributária',
  '70': 'Com redução de base de cálculo e cobrança do ICMS por ST',
  '90': 'Outras',
  '260': 'Estrangeira - Adquirida no mercado interno c/ ICMS ST',
  '560': 'Nacional, com cobrança anterior de ICMS por ST (venda simples)'
};

// Pt-Br float parser helper
function parsePtBrFloat(val: string): number {
  if (!val) return 0;
  let clean = val.replace(/[R$\s]/g, '').trim();
  if (clean === '' || clean === '-') return 0;
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const num = parseFloat(clean);
  return Number.isNaN(num) ? 0 : num;
}

// Helpers for Document type and formatting
export function formatDocument(raw: string): string {
  if (!raw) return '';
  if (raw === 'DIVERSOS' || raw === 'DIVERSO') return 'DIVERSOS';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.substring(0, 3)}.${digits.substring(3, 6)}.${digits.substring(6, 9)}-${digits.substring(9, 11)}`;
  }
  if (digits.length === 14) {
    return `${digits.substring(0, 2)}.${digits.substring(2, 5)}.${digits.substring(5, 8)}/${digits.substring(8, 12)}-${digits.substring(12, 14)}`;
  }
  return raw;
}

export function getDocumentType(raw: string): 'PF' | 'PJ' | 'Outro' {
  if (!raw) return 'Outro';
  if (raw === 'DIVERSOS' || raw === 'DIVERSO') return 'Outro';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return 'PF';
  if (digits.length === 14) return 'PJ';
  return 'Outro';
}

// Helper to group and sum duplicate products by CFOP and CST
function aggregateDuplicates(items: ReportItem[]): ReportItem[] {
  const grouped: Record<string, { item: ReportItem; nfs: Set<string>; dates: Set<string>; cnpjs: Set<string> }> = {};

  items.forEach(item => {
    const key = `${item.codigoProduto || ''}_${item.nomeProduto}_${item.cfop}_${item.cst}`;

    if (!grouped[key]) {
      grouped[key] = {
        item: { ...item },
        nfs: new Set<string>([item.notaFiscal]),
        dates: new Set<string>([item.data]),
        cnpjs: new Set<string>([item.cnpj])
      };
    } else {
      const entry = grouped[key];
      entry.item.qtde += item.qtde;
      entry.item.rProduto += item.rProduto;
      entry.item.desconto += item.desconto;
      entry.item.vlrContabil += item.vlrContabil;
      entry.item.rBaseIcms += item.rBaseIcms;
      entry.item.rIcms += item.rIcms;
      entry.item.rIpi += item.rIpi;
      
      if (item.notaFiscal) entry.nfs.add(item.notaFiscal);
      if (item.data) entry.dates.add(item.data);
      if (item.cnpj) entry.cnpjs.add(item.cnpj);
    }
  });

  return Object.values(grouped).map(entry => {
    const { item, nfs, dates, cnpjs } = entry;
    
    const uniqueNfs = Array.from(nfs).filter(Boolean).sort();
    if (uniqueNfs.length === 0) {
      item.notaFiscal = '';
    } else if (uniqueNfs.length === 1) {
      item.notaFiscal = uniqueNfs[0];
    } else if (uniqueNfs.length <= 3) {
      item.notaFiscal = uniqueNfs.join(', ');
    } else {
      item.notaFiscal = `CONSOLIDADO (${uniqueNfs.length} NFs)`;
    }

    const uniqueDates = Array.from(dates).filter(Boolean).sort();
    if (uniqueDates.length === 1) {
      item.data = uniqueDates[0];
    } else {
      item.data = 'DIVERSAS';
    }

    const uniqueCnpjs = Array.from(cnpjs).filter(Boolean);
    if (uniqueCnpjs.length === 1) {
      item.cnpj = uniqueCnpjs[0];
    } else {
      item.cnpj = 'DIVERSOS';
    }

    if (item.qtde > 0) {
      item.rUnit = item.rProduto / item.qtde;
    } else {
      item.rUnit = 0;
    }

    return item;
  });
}

export interface ErpIcmsSummaryItem {
  cfop: string;
  codigoProduto?: string;
  descricaoProduto?: string;
  produto: string;
  ncm: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorProduto: number;
  desconto: number;
  valorContabil: number;
  cstIcms: string;
  baseCalculoIcms: number;
  aliquotaIcms: number;
  valorIcms: number;
  aliquotaIpi: number;
  valorIpi: number;
  icmsRecalculated: number;
  icmsDivergence: number;
  statusAudit: string;
  itemsCount: number;
}

export function aggregateIcmsItems(items: ErpIcmsReportItem[]): ErpIcmsSummaryItem[] {
  const map = new Map<string, ErpIcmsSummaryItem>();

  items.forEach(item => {
    const normProd = (item.produto || '').trim();
    const normCfop = (item.cfop || '').trim();
    const normCst = (item.cstIcms || '').trim();
    const { codigo: splitCod, descricao: splitDesc } = splitProductCodeAndDesc(normProd);
    const codigoProd = item.codigoProduto || splitCod || '';
    const descProd = item.descricaoProduto || splitDesc || normProd;

    const key = `${normProd}___${normCfop}___${normCst}`;

    if (!map.has(key)) {
      map.set(key, {
        cfop: normCfop,
        codigoProduto: codigoProd,
        descricaoProduto: descProd,
        produto: normProd,
        ncm: item.ncm || '',
        unidade: item.unidade || 'UN',
        quantidade: item.quantidade || 0,
        valorUnitario: 0,
        valorProduto: item.valorProduto || 0,
        desconto: item.desconto || 0,
        valorContabil: item.valorContabil || 0,
        cstIcms: normCst,
        baseCalculoIcms: item.baseCalculoIcms || 0,
        aliquotaIcms: item.aliquotaIcms || 0,
        valorIcms: item.valorIcms || 0,
        aliquotaIpi: item.aliquotaIpi || 0,
        valorIpi: item.valorIpi || 0,
        icmsRecalculated: item.icmsRecalculated || 0,
        icmsDivergence: item.icmsDivergence || 0,
        statusAudit: item.statusAudit || 'OK',
        itemsCount: 1
      });
    } else {
      const entry = map.get(key)!;
      entry.quantidade += (item.quantidade || 0);
      entry.valorProduto += (item.valorProduto || 0);
      entry.desconto += (item.desconto || 0);
      entry.valorContabil += (item.valorContabil || 0);
      entry.baseCalculoIcms += (item.baseCalculoIcms || 0);
      entry.valorIcms += (item.valorIcms || 0);
      entry.valorIpi += (item.valorIpi || 0);
      if (item.aliquotaIpi && !entry.aliquotaIpi) entry.aliquotaIpi = item.aliquotaIpi;
      if (item.aliquotaIcms && !entry.aliquotaIcms) entry.aliquotaIcms = item.aliquotaIcms;
      entry.icmsRecalculated += (item.icmsRecalculated || 0);
      entry.icmsDivergence += (item.icmsDivergence || 0);
      entry.itemsCount += 1;
      if (!entry.ncm && item.ncm) entry.ncm = item.ncm;
      if (!entry.codigoProduto && codigoProd) entry.codigoProduto = codigoProd;
      if (!entry.descricaoProduto && descProd) entry.descricaoProduto = descProd;
      if (item.statusAudit && item.statusAudit !== 'OK') entry.statusAudit = item.statusAudit;
    }
  });

  return Array.from(map.values())
    .map(entry => {
      const qtde = entry.quantidade;
      const vProd = entry.valorProduto;
      entry.valorUnitario = qtde > 0 ? Number((vProd / qtde).toFixed(4)) : 0;
      if (!entry.aliquotaIcms && entry.baseCalculoIcms > 0 && entry.valorIcms > 0) {
        const rawAliq = (entry.valorIcms / entry.baseCalculoIcms) * 100;
        const nearestInt = Math.round(rawAliq);
        if (Math.abs(rawAliq - nearestInt) < 0.08) {
          entry.aliquotaIcms = nearestInt;
        } else {
          entry.aliquotaIcms = Number(rawAliq.toFixed(2));
        }
      }
      return entry;
    })
    .sort((a, b) => {
      const descA = a.descricaoProduto || splitProductCodeAndDesc(a.produto).descricao || a.produto || '';
      const descB = b.descricaoProduto || splitProductCodeAndDesc(b.produto).descricao || b.produto || '';
      return descA.localeCompare(descB, 'pt-BR', { sensitivity: 'base' });
    });
}

function PisCofinsSummaryTableRows({ rows, isResumido }: { rows: PisCofinsConsolidatedItem[]; isResumido: boolean }) {
  const totalCols = isResumido ? 11 : 9;
  const labelColSpan = isResumido ? 4 : 2;

  const entradasRows = rows.filter(r => r.tipo === 'entrada');
  const saidasRows = rows.filter(r => r.tipo === 'saida');

  const eValProd = entradasRows.reduce((a, r) => a + (r.valorProduto || 0), 0);
  const eBasePis = entradasRows.reduce((a, r) => a + ((r.baseCalculoPis !== undefined ? r.baseCalculoPis : r.baseCalculo) || 0), 0);
  const eValPis = entradasRows.reduce((a, r) => a + (r.valorPis || 0), 0);
  const eBaseCofins = entradasRows.reduce((a, r) => a + ((r.baseCalculoCofins !== undefined ? r.baseCalculoCofins : r.baseCalculo) || 0), 0);
  const eValCofins = entradasRows.reduce((a, r) => a + (r.valorCofins || 0), 0);

  const sValProd = saidasRows.reduce((a, r) => a + (r.valorProduto || 0), 0);
  const sBasePis = saidasRows.reduce((a, r) => a + ((r.baseCalculoPis !== undefined ? r.baseCalculoPis : r.baseCalculo) || 0), 0);
  const sValPis = saidasRows.reduce((a, r) => a + (r.valorPis || 0), 0);
  const sBaseCofins = saidasRows.reduce((a, r) => a + ((r.baseCalculoCofins !== undefined ? r.baseCalculoCofins : r.baseCalculo) || 0), 0);
  const sValCofins = saidasRows.reduce((a, r) => a + (r.valorCofins || 0), 0);

  return (
    <>
      {/* ENTRADAS SECTION */}
      {entradasRows.length > 0 && (
        <>
          <tr className="bg-sky-100/80 text-sky-950 border-y-2 border-sky-300">
            <td colSpan={totalCols} className="py-2 px-3 font-black text-xs uppercase tracking-wider font-sans bg-sky-100/90 text-sky-950">
              <span className="inline-flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
                ENTRADAS / CRÉDITOS
              </span>
            </td>
          </tr>

          {entradasRows.map((r, idx) => (
            <tr key={`piscof-e-row-${idx}`} className="hover:bg-sky-50/50 bg-white border-b border-slate-100">
              {isResumido && (
                <>
                  <td className="py-2 px-3 text-slate-600 font-mono text-[10px] whitespace-nowrap">{r.codigoProduto || '-'}</td>
                  <td className="py-2 px-3 text-slate-700 font-sans max-w-xs truncate text-xs" title={r.nomeProduto}>{r.nomeProduto || '-'}</td>
                </>
              )}
              <td className="py-2 px-3 font-bold text-[#04243b] whitespace-nowrap">{r.cfop}</td>
              <td className="py-2 px-3 whitespace-nowrap">
                <span className="bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded font-sans text-[10px]">CST {r.cst}</span>
              </td>
              <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">R$ {r.valorProduto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">R$ {(r.baseCalculoPis !== undefined ? r.baseCalculoPis : r.baseCalculo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td className="py-2 px-3 text-center text-slate-500 font-sans whitespace-nowrap">{r.aliquotaPis.toFixed(2)}%</td>
              <td className="py-2 px-3 text-right text-emerald-700 font-bold whitespace-nowrap">R$ {r.valorPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">R$ {(r.baseCalculoCofins !== undefined ? r.baseCalculoCofins : r.baseCalculo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td className="py-2 px-3 text-center text-slate-500 font-sans whitespace-nowrap">{r.aliquotaCofins.toFixed(2)}%</td>
              <td className="py-2 px-3 text-right text-amber-700 font-bold whitespace-nowrap">R$ {r.valorCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}

          {/* TOTAL ENTRADAS */}
          <tr className="bg-sky-100/90 font-bold border-t-2 border-b-2 border-sky-300 text-xs text-sky-950">
            <td colSpan={labelColSpan} className="py-2.5 px-3 font-sans font-black uppercase text-sky-900 whitespace-nowrap">
              TOTAL ENTRADAS
            </td>
            <td className="py-2.5 px-3 text-right whitespace-nowrap font-black">R$ {eValProd.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td className="py-2.5 px-3 text-right whitespace-nowrap font-black">R$ {eBasePis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td className="py-2.5 px-3 text-center text-slate-400 font-sans">-</td>
            <td className="py-2.5 px-3 text-right text-emerald-800 font-black whitespace-nowrap">R$ {eValPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td className="py-2.5 px-3 text-right whitespace-nowrap font-black">R$ {eBaseCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td className="py-2.5 px-3 text-center text-slate-400 font-sans">-</td>
            <td className="py-2.5 px-3 text-right text-amber-800 font-black whitespace-nowrap">R$ {eValCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
          </tr>
        </>
      )}

      {/* SEPARATOR IF BOTH EXIST */}
      {entradasRows.length > 0 && saidasRows.length > 0 && (
        <tr className="bg-slate-200/80 h-3 border-y-2 border-slate-300">
          <td colSpan={totalCols} className="p-0"></td>
        </tr>
      )}

      {/* SAÍDAS SECTION */}
      {saidasRows.length > 0 && (
        <>
          <tr className="bg-amber-100/80 text-amber-950 border-y-2 border-amber-300">
            <td colSpan={totalCols} className="py-2 px-3 font-black text-xs uppercase tracking-wider font-sans bg-amber-100/90 text-amber-950">
              <span className="inline-flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                SAÍDAS / DÉBITOS
              </span>
            </td>
          </tr>

          {saidasRows.map((r, idx) => (
            <tr key={`piscof-s-row-${idx}`} className="hover:bg-amber-50/50 bg-white border-b border-slate-100">
              {isResumido && (
                <>
                  <td className="py-2 px-3 text-slate-600 font-mono text-[10px] whitespace-nowrap">{r.codigoProduto || '-'}</td>
                  <td className="py-2 px-3 text-slate-700 font-sans max-w-xs truncate text-xs" title={r.nomeProduto}>{r.nomeProduto || '-'}</td>
                </>
              )}
              <td className="py-2 px-3 font-bold text-[#04243b] whitespace-nowrap">{r.cfop}</td>
              <td className="py-2 px-3 whitespace-nowrap">
                <span className="bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded font-sans text-[10px]">CST {r.cst}</span>
              </td>
              <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">R$ {r.valorProduto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">R$ {(r.baseCalculoPis !== undefined ? r.baseCalculoPis : r.baseCalculo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td className="py-2 px-3 text-center text-slate-500 font-sans whitespace-nowrap">{r.aliquotaPis.toFixed(2)}%</td>
              <td className="py-2 px-3 text-right text-emerald-700 font-bold whitespace-nowrap">R$ {r.valorPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">R$ {(r.baseCalculoCofins !== undefined ? r.baseCalculoCofins : r.baseCalculo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td className="py-2 px-3 text-center text-slate-500 font-sans whitespace-nowrap">{r.aliquotaCofins.toFixed(2)}%</td>
              <td className="py-2 px-3 text-right text-amber-700 font-bold whitespace-nowrap">R$ {r.valorCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}

          {/* TOTAL SAÍDAS */}
          <tr className="bg-amber-100/90 font-bold border-t-2 border-b-2 border-amber-300 text-xs text-amber-950">
            <td colSpan={labelColSpan} className="py-2.5 px-3 font-sans font-black uppercase text-amber-900 whitespace-nowrap">
              TOTAL SAÍDAS
            </td>
            <td className="py-2.5 px-3 text-right whitespace-nowrap font-black">R$ {sValProd.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td className="py-2.5 px-3 text-right whitespace-nowrap font-black">R$ {sBasePis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td className="py-2.5 px-3 text-center text-slate-400 font-sans">-</td>
            <td className="py-2.5 px-3 text-right text-emerald-800 font-black whitespace-nowrap">R$ {sValPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td className="py-2.5 px-3 text-right whitespace-nowrap font-black">R$ {sBaseCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td className="py-2.5 px-3 text-center text-slate-400 font-sans">-</td>
            <td className="py-2.5 px-3 text-right text-amber-800 font-black whitespace-nowrap">R$ {sValCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
          </tr>
        </>
      )}
    </>
  );
}

export function AuditoriaFiscalWorkspace() {
  // Navigation tabs for the unified output views
  const [activeOutputTab, setActiveOutputTab] = useState<'confronto' | 'organizador' | 'auditoria_siga' | 'integridade' | 'pis_cofins'>('pis_cofins');

  // Audit SIGA specific state
  const [auditSigaSubTab, setAuditSigaSubTab] = useState<'saidas' | 'entradas'>('saidas');
  const [auditSigaFilter, setAuditSigaFilter] = useState<'all' | 'duplicates' | 'unique'>('duplicates');
  const [auditSigaSearch, setAuditSigaSearch] = useState<string>('');
  const [auditSigaPage, setAuditSigaPage] = useState<number>(1);

  // Sub-blocks subdivisions state
  const [activeMainModule, setActiveMainModule] = useState<'siga' | 'icms' | 'pis_cofins'>('pis_cofins');

  // Unified Data Lake loaded files state
  const [loadedFiles, setLoadedFiles] = useState<Array<{ name: string; size: number; type: 'sefaz' | 'erp' | 'siga_tax' | 'pis_cofins'; recordsCount: number }>>([]);

  // Master Data Lake Datasets
  const [sefazRows, setSefazRows] = useState<InvoiceRow[]>([]);
  const [rawSefazText, setRawSefazText] = useState<string>('');
  const [erpRowsText, setErpRowsText] = useState<string>('');
  const [sigaTaxText, setSigaTaxText] = useState<string>('');

  // ERP ICMS Specific State (Módulo 2)
  const [erpIcmsItems, setErpIcmsItems] = useState<ErpIcmsReportItem[]>([]);
  const [icmsMainTab, setIcmsMainTab] = useState<'relatorio' | 'auditoria'>('relatorio');
  const [icmsSearchTerm, setIcmsSearchTerm] = useState<string>('');
  const [icmsStatusFilter, setIcmsStatusFilter] = useState<string>('all');
  const [icmsActiveSubTab, setIcmsActiveSubTab] = useState<'entradas' | 'saidas'>('entradas');
  const [icmsCurrentPage, setIcmsCurrentPage] = useState<number>(1);
  const icmsItemsPerPage = 20;

  // Seleção de Produto(s) para Geração do Relatório ICMS (Módulo 2)
  const [selectedIcmsProductKeys, setSelectedIcmsProductKeys] = useState<string[]>([]);
  const [isIcmsProductSelectorOpen, setIsIcmsProductSelectorOpen] = useState<boolean>(false);
  const [icmsProductSearchQuery, setIcmsProductSearchQuery] = useState<string>('');

  const getProductKeyFromItem = (item: ErpIcmsReportItem): string => {
    const { codigo: splitCod, descricao: splitDesc } = splitProductCodeAndDesc(item.produto);
    const cod = (item.codigoProduto || splitCod || '').trim();
    const desc = (item.descricaoProduto || splitDesc || item.produto || '').trim();
    return cod ? `COD:${cod}` : `DESC:${desc}`;
  };

  const availableIcmsProducts = useMemo(() => {
    if (!erpIcmsItems || erpIcmsItems.length === 0) return [];
    const map = new Map<string, {
      key: string;
      codigo: string;
      descricao: string;
      displayName: string;
      totalItens: number;
      totalValor: number;
    }>();

    erpIcmsItems.forEach(item => {
      const { codigo: splitCod, descricao: splitDesc } = splitProductCodeAndDesc(item.produto);
      const cod = (item.codigoProduto || splitCod || '').trim();
      const desc = (item.descricaoProduto || splitDesc || item.produto || '').trim();
      const key = cod ? `COD:${cod}` : `DESC:${desc}`;

      const existing = map.get(key);
      if (!existing) {
        const displayName = cod && desc && !desc.startsWith(cod) ? `${cod} - ${desc}` : (desc || cod || 'Produto sem identificação');
        map.set(key, {
          key,
          codigo: cod,
          descricao: desc,
          displayName,
          totalItens: 1,
          totalValor: item.valorContabil || 0
        });
      } else {
        existing.totalItens += 1;
        existing.totalValor += (item.valorContabil || 0);
        if (!existing.descricao && desc) {
          existing.descricao = desc;
          existing.displayName = cod && desc && !desc.startsWith(cod) ? `${cod} - ${desc}` : desc;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.codigo && b.codigo) {
        return a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true });
      }
      return a.displayName.localeCompare(b.displayName, 'pt-BR', { sensitivity: 'base' });
    });
  }, [erpIcmsItems]);

  const filteredProductOptions = useMemo(() => {
    const query = icmsProductSearchQuery.toLowerCase().trim();
    if (!query) return availableIcmsProducts;
    return availableIcmsProducts.filter(p => 
      (p.codigo && p.codigo.toLowerCase().includes(query)) ||
      (p.descricao && p.descricao.toLowerCase().includes(query)) ||
      (p.displayName && p.displayName.toLowerCase().includes(query))
    );
  }, [availableIcmsProducts, icmsProductSearchQuery]);

  // Itens efetivos considerados para geração do relatório ICMS (filtrados pelos produtos selecionados ou todos)
  const effectiveIcmsItems = useMemo(() => {
    if (selectedIcmsProductKeys.length === 0) {
      return erpIcmsItems;
    }
    const keySet = new Set(selectedIcmsProductKeys);
    return erpIcmsItems.filter(item => {
      const key = getProductKeyFromItem(item);
      return keySet.has(key);
    });
  }, [erpIcmsItems, selectedIcmsProductKeys]);

  const icmsEntradasCompleto = useMemo(() => {
    return effectiveIcmsItems
      .filter(i => 
        i.tipoOperacao === 'ENTRADA' || 
        (i.cfop && (i.cfop.startsWith('1') || i.cfop.startsWith('2') || i.cfop.startsWith('3')))
      )
      .slice()
      .sort((a, b) => {
        const descA = a.descricaoProduto || splitProductCodeAndDesc(a.produto).descricao || a.produto || '';
        const descB = b.descricaoProduto || splitProductCodeAndDesc(b.produto).descricao || b.produto || '';
        return descA.localeCompare(descB, 'pt-BR', { sensitivity: 'base' });
      });
  }, [effectiveIcmsItems]);

  const icmsSaidasCompleto = useMemo(() => {
    return effectiveIcmsItems
      .filter(i => 
        i.tipoOperacao === 'SAIDA' || 
        (i.cfop && (i.cfop.startsWith('5') || i.cfop.startsWith('6') || i.cfop.startsWith('7')))
      )
      .slice()
      .sort((a, b) => {
        const descA = a.descricaoProduto || splitProductCodeAndDesc(a.produto).descricao || a.produto || '';
        const descB = b.descricaoProduto || splitProductCodeAndDesc(b.produto).descricao || b.produto || '';
        return descA.localeCompare(descB, 'pt-BR', { sensitivity: 'base' });
      });
  }, [effectiveIcmsItems]);

  const activeFilteredIcmsList = useMemo(() => {
    const term = icmsSearchTerm.toLowerCase().trim();
    const rawList = icmsActiveSubTab === 'entradas' ? icmsEntradasCompleto : icmsSaidasCompleto;

    if (!term) return rawList;

    return rawList.filter(item => {
      const { codigo: prodCod, descricao: prodDesc } = splitProductCodeAndDesc(item.produto);
      const codigoFinal = (item.codigoProduto || prodCod || '').toLowerCase();
      const descFinal = (item.descricaoProduto || prodDesc || item.produto || '').toLowerCase();
      return (item.notaFiscal && item.notaFiscal.toLowerCase().includes(term)) ||
        (item.produto && item.produto.toLowerCase().includes(term)) ||
        codigoFinal.includes(term) ||
        descFinal.includes(term) ||
        (item.cnpjEmitente && item.cnpjEmitente.toLowerCase().includes(term)) ||
        (item.cfop && item.cfop.toLowerCase().includes(term)) ||
        (item.cstIcms && item.cstIcms.toLowerCase().includes(term)) ||
        (item.ncm && item.ncm.toLowerCase().includes(term));
    });
  }, [icmsActiveSubTab, icmsEntradasCompleto, icmsSaidasCompleto, icmsSearchTerm]);

  const totalIcmsPages = Math.ceil(activeFilteredIcmsList.length / icmsItemsPerPage) || 1;

  const paginatedIcmsItems = useMemo(() => {
    const start = (icmsCurrentPage - 1) * icmsItemsPerPage;
    return activeFilteredIcmsList.slice(start, start + icmsItemsPerPage);
  }, [activeFilteredIcmsList, icmsCurrentPage]);

  // PIS/COFINS Report Specific State
  const [pisCofinsRows, setPisCofinsRows] = useState<PisCofinsItem[]>([]);
  const [pisCofinsMetadata, setPisCofinsMetadata] = useState<PisCofinsMetadata | null>(null);
  const [pisCofinsCriteria, setPisCofinsCriteria] = useState<'cfop_cst' | 'cfop_cst_product'>('cfop_cst');
  const [activePisCofinsSubTab, setActivePisCofinsSubTab] = useState<'entradas' | 'saidas' | 'consolidado' | 'todos' | 'auditoria'>('todos');
  const [pisCofinsViewMode, setPisCofinsViewMode] = useState<'original' | 'consolidated'>('original');
  const [pisCofinsOriginalFormat, setPisCofinsOriginalFormat] = useState<'completo' | 'resumido'>('completo');
  const [searchTermPisCofins, setSearchTermPisCofins] = useState<string>('');
  const [pisCofinsCurrentPage, setPisCofinsCurrentPage] = useState<number>(1);
  const pisCofinsItemsPerPage = 50;

  // PIS/COFINS Main Screen & Severity Filter (Módulo 3: RELATÓRIOS vs AUDITORIA)
  const [pisCofinsMainScreen, setPisCofinsMainScreen] = useState<'relatorios' | 'auditoria'>('relatorios');
  const [pisCofinsAuditType, setPisCofinsAuditType] = useState<'todas' | 'inconsistencias' | 'alertas'>('todas');

  // PIS/COFINS Audit state
  const [selectedPisCofinsAuditError, setSelectedPisCofinsAuditError] = useState<PisCofinsAuditError | null>(null);
  const [pisCofinsActiveAuditFilter, setPisCofinsActiveAuditFilter] = useState<'todos' | 'divergencia_bc' | 'erro_calculo_pis' | 'erro_calculo_cofins' | 'cst_incompativel' | 'aliquota_incoerente' | 'bc_maior_produto'>('todos');
  const [enablePisCofinsAlerts, setEnablePisCofinsAlerts] = useState<boolean>(true);

  const pisCofinsAuditErrors = useMemo(() => {
    if (!enablePisCofinsAlerts) return [];
    return auditPisCofinsReport(pisCofinsRows);
  }, [pisCofinsRows, enablePisCofinsAlerts]);

  // Siga/Organizador Relatorio specific state
  const [organizadorEntradas, setOrganizadorEntradas] = useState<ReportItem[]>([]);
  const [organizadorSaidas, setOrganizadorSaidas] = useState<ReportItem[]>([]);
  const [organizadorMetadata, setOrganizadorMetadata] = useState<ReportMetadata | null>(null);
  const [groupDuplicates, setGroupDuplicates] = useState<boolean>(false);
  const [orgSearchTerm, setOrgSearchTerm] = useState<string>('');
  const [orgCfopFilter, setOrgCfopFilter] = useState<string>('all');
  const [orgCstFilter, setOrgCstFilter] = useState<string>('all');
  const [orgCurrentPage, setOrgCurrentPage] = useState<number>(1);
  const [activeOrgSubTab, setActiveOrgSubTab] = useState<'entradas' | 'saidas' | 'auditoria'>('entradas');
  const itemsPerPage = 12;

  // NFC-e / SIGA access key analysis specific state
  const [searchTermNfce, setSearchTermNfce] = useState<string>('');
  const [filterStatusNfce, setFilterStatusNfce] = useState<'all' | 'valid' | 'invalid'>('all');

  // Bilateral Cross-Audit results
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [auditSearchTerm, setAuditSearchTerm] = useState<string>('');
  const [auditFilterStatus, setAuditFilterStatus] = useState<string>('all');

  // Auditoria Fiscal ICMS State & Logic: Confronto SEFAZ vs ICMS Sistema
  const sefazSaidasAuditFileInputRef = useRef<HTMLInputElement>(null);
  const sefazEntradasAuditFileInputRef = useRef<HTMLInputElement>(null);
  const sigaSefazAuditFileInputRef = useRef<HTMLInputElement>(null);

  const [sigaConfrontFilterStatus, setSigaConfrontFilterStatus] = useState<'all' | 'falta_sistema' | 'falta_sefaz' | 'divergencia' | 'conciliado'>('all');
  const [sigaConfrontTipoFilter, setSigaConfrontTipoFilter] = useState<'saida' | 'entrada'>('entrada');
  const [sigaConfrontSearch, setSigaConfrontSearch] = useState<string>('');
  const [sigaConfrontPage, setSigaConfrontPage] = useState<number>(1);
  const [showLoadedFilesModal, setShowLoadedFilesModal] = useState<boolean>(false);
  const sigaConfrontItemsPerPage = 25;

  const sigaSefazConfrontation = useMemo(() => {
    // 1. Collect SEFAZ records and group by distinct Invoice
    interface SefazGroup {
      numeroNota: string;
      numInt: number;
      serie: string;
      cleanSerie: string;
      modelo: string;
      chaveAcesso: string;
      dataEmissao: string;
      valorTotal: number;
      fornecedorOuCliente: string;
      tipoOperacao: 'ENTRADA' | 'SAIDA';
      cfop: string;
      rawRows: any[];
    }

    const sefazInvoiceMap = new Map<string, SefazGroup>();

    const processSefazItem = (
      numStr: string,
      serieStr: string,
      modeloStr: string,
      chaveStr: string,
      dataStr: string,
      valorNum: number,
      parceiroStr: string,
      tipoOp: 'ENTRADA' | 'SAIDA',
      cfopStr?: string,
      rawObj?: any
    ) => {
      let cleanNum = (numStr || '').toString().trim().replace(/\D/g, '');
      let cleanKey = (chaveStr || '').replace(/\D/g, '');

      // If cleanNum is empty but cleanKey is 44 digits, extract NF number from positions 26..34
      if (!cleanNum && cleanKey.length === 44) {
        cleanNum = parseInt(cleanKey.substring(25, 34), 10).toString();
      }

      const numInt = parseInt(cleanNum, 10);
      if (Number.isNaN(numInt) || numInt <= 0) return;

      const cleanSerie = (serieStr || '1').toString().trim().replace(/^0+/, '') || '1';

      // Group key for initial aggregation of items belonging to the same SEFAZ invoice
      let groupKey = '';
      if (cleanKey && cleanKey.length === 44) {
        groupKey = `CHV_${cleanKey}`;
      } else {
        // Look for an existing group that matches numInt, cleanSerie, tipoOp and does NOT conflict on date/partner/key
        const normDate = (dataStr || '').trim();
        const normParc = (parceiroStr || '').trim().replace(/\D/g, '') || (parceiroStr || '').trim().toUpperCase();

        for (const [existingKey, g] of sefazInvoiceMap.entries()) {
          if (g.numInt === numInt && g.cleanSerie === cleanSerie && g.tipoOperacao === tipoOp) {
            const gDate = (g.dataEmissao || '').trim();
            const gParc = (g.fornecedorOuCliente || '').trim().replace(/\D/g, '') || (g.fornecedorOuCliente || '').trim().toUpperCase();

            // Check if dates or partners conflict
            const dateConflict = normDate && normDate !== '-' && gDate && gDate !== '-' && normDate !== gDate;
            const parcConflict = normParc && gParc && gParc !== 'CLIENTE/FORNECEDOR SEFAZ' && normParc !== gParc;

            if (!dateConflict && !parcConflict) {
              groupKey = existingKey;
              break;
            }
          }
        }

        if (!groupKey) {
          const pSlug = normParc ? normParc.substring(0, 12) : 'PARC';
          const dSlug = normDate && normDate !== '-' ? normDate : 'NODT';
          groupKey = `NF_${numInt}_SER_${cleanSerie}_TP_${tipoOp}_DT_${dSlug}_PARC_${pSlug}`;
        }
      }

      if (!sefazInvoiceMap.has(groupKey)) {
        sefazInvoiceMap.set(groupKey, {
          numeroNota: numInt.toString(),
          numInt,
          serie: cleanSerie,
          cleanSerie,
          modelo: modeloStr || '55',
          chaveAcesso: cleanKey.length === 44 ? cleanKey : '',
          dataEmissao: dataStr || '-',
          valorTotal: Number((valorNum || 0).toFixed(2)),
          fornecedorOuCliente: parceiroStr || 'CLIENTE/FORNECEDOR SEFAZ',
          tipoOperacao: tipoOp,
          cfop: cfopStr || '',
          rawRows: rawObj ? [rawObj] : [],
          sourceArray: rawObj && sefazRows.includes(rawObj) ? 'sefazRows' : 'organizador'
        } as SefazGroup & { sourceArray?: string });
      } else {
        const item = sefazInvoiceMap.get(groupKey)!;
        if (cleanKey.length === 44 && !item.chaveAcesso) {
          item.chaveAcesso = cleanKey;
        }
        if (dataStr && dataStr !== '-' && (!item.dataEmissao || item.dataEmissao === '-')) {
          item.dataEmissao = dataStr;
        }
        if (parceiroStr && parceiroStr !== 'CLIENTE/FORNECEDOR SEFAZ' && item.fornecedorOuCliente === 'CLIENTE/FORNECEDOR SEFAZ') {
          item.fornecedorOuCliente = parceiroStr;
        }
        
        // Prevent double counting if invoice is already present directly from SEFAZ CSV report (sefazRows)
        const isFromOrganizador = rawObj && (organizadorEntradas.includes(rawObj) || organizadorSaidas.includes(rawObj));
        if (isFromOrganizador && (item as any).sourceArray === 'sefazRows') {
          // Invoice already registered from SEFAZ direct report. Keep primary SEFAZ values.
        } else {
          item.valorTotal = Number((item.valorTotal + (valorNum || 0)).toFixed(2));
        }
        if (rawObj) item.rawRows.push(rawObj);
      }
    };

    // A. Add sefazRows
    sefazRows.forEach(row => {
      const tipo: 'ENTRADA' | 'SAIDA' = (row as any).tipoOperacao === 'ENTRADA' ? 'ENTRADA' : 'SAIDA';
      processSefazItem(
        row.numeroNota,
        row.serie,
        row.modelo,
        row.chaveDeAcesso,
        row.dataEmissao,
        row.valorDecimal,
        row.nomeFornecedor || row.cnpjFornecedorFormatado || row.cnpjFormatado,
        tipo,
        undefined,
        row
      );
    });

    // B. Add organizadorEntradas (SEFAZ Entradas)
    organizadorEntradas.forEach(row => {
      processSefazItem(
        row.notaFiscal,
        row.serie,
        row.modelo,
        row.chaveDeAcesso || '',
        row.data,
        row.vlrContabil,
        row.cnpj || 'FORNECEDOR SEFAZ',
        'ENTRADA',
        row.cfop,
        row
      );
    });

    // C. Add organizadorSaidas (SEFAZ Saídas)
    organizadorSaidas.forEach(row => {
      processSefazItem(
        row.notaFiscal,
        row.serie,
        row.modelo,
        row.chaveDeAcesso || '',
        row.data,
        row.vlrContabil,
        row.cnpj || 'CLIENTE SEFAZ',
        'SAIDA',
        row.cfop,
        row
      );
    });

    // 2. Collect and group ICMS (Sistema/ERP) records by distinct Invoice
    interface IcmsGroup {
      numeroNota: string;
      numInt: number;
      serie: string;
      cleanSerie: string;
      modelo: string;
      chaveAcesso: string;
      dataEmissao: string;
      valorTotal: number;
      fornecedorOuCliente: string;
      tipoOperacao: 'ENTRADA' | 'SAIDA';
      cfop: string;
      itemsCount: number;
      rawItems: ErpIcmsReportItem[];
    }

    const icmsInvoiceMap = new Map<string, IcmsGroup>();

    erpIcmsItems.forEach(item => {
      let cleanNum = (item.notaFiscal || '').toString().trim().replace(/\D/g, '');
      let cleanKey = (item.chaveAcesso || '').replace(/\D/g, '');

      if (!cleanNum && cleanKey.length === 44) {
        cleanNum = parseInt(cleanKey.substring(25, 34), 10).toString();
      }

      const numInt = parseInt(cleanNum, 10);
      if (Number.isNaN(numInt) || numInt <= 0) return;

      const cleanSerie = (item.serie || '1').toString().trim().replace(/^0+/, '') || '1';

      const tipoOp: 'ENTRADA' | 'SAIDA' = (item.tipoOperacao === 'ENTRADA' || (item.cfop && ['1', '2', '3'].includes(item.cfop.charAt(0)))) 
        ? 'ENTRADA' 
        : 'SAIDA';

      let groupKey = '';
      if (cleanKey && cleanKey.length === 44) {
        groupKey = `CHV_${cleanKey}`;
      } else {
        const normDate = (item.dataEmissao || '').trim();
        const normParc = (item.cnpjEmitente || item.produto || '').trim().replace(/\D/g, '') || (item.cnpjEmitente || item.produto || '').trim().toUpperCase();

        for (const [existingKey, g] of icmsInvoiceMap.entries()) {
          if (g.numInt === numInt && g.cleanSerie === cleanSerie && g.tipoOperacao === tipoOp) {
            const gDate = (g.dataEmissao || '').trim();
            const gParc = (g.fornecedorOuCliente || '').trim().replace(/\D/g, '') || (g.fornecedorOuCliente || '').trim().toUpperCase();

            const dateConflict = normDate && normDate !== '-' && gDate && gDate !== '-' && normDate !== gDate;
            const parcConflict = normParc && gParc && gParc !== 'CLIENTE/FORNECEDOR SISTEMA' && normParc !== gParc;

            if (!dateConflict && !parcConflict) {
              groupKey = existingKey;
              break;
            }
          }
        }

        if (!groupKey) {
          const pSlug = normParc ? normParc.substring(0, 12) : 'PARC';
          const dSlug = normDate && normDate !== '-' ? normDate : 'NODT';
          groupKey = `NF_${numInt}_SER_${cleanSerie}_TP_${tipoOp}_DT_${dSlug}_PARC_${pSlug}`;
        }
      }

      if (!icmsInvoiceMap.has(groupKey)) {
        icmsInvoiceMap.set(groupKey, {
          numeroNota: numInt.toString(),
          numInt,
          serie: cleanSerie,
          cleanSerie,
          modelo: item.modelo || '55',
          chaveAcesso: cleanKey.length === 44 ? cleanKey : '',
          dataEmissao: item.dataEmissao || '-',
          valorTotal: Number((item.valorContabil || 0).toFixed(2)),
          fornecedorOuCliente: item.cnpjEmitente || item.produto || 'CLIENTE/FORNECEDOR SISTEMA',
          tipoOperacao: tipoOp,
          cfop: item.cfop || '',
          itemsCount: 1,
          rawItems: [item]
        });
      } else {
        const existing = icmsInvoiceMap.get(groupKey)!;
        if (cleanKey.length === 44 && !existing.chaveAcesso) {
          existing.chaveAcesso = cleanKey;
        }
        if (item.dataEmissao && item.dataEmissao !== '-' && (!existing.dataEmissao || existing.dataEmissao === '-')) {
          existing.dataEmissao = item.dataEmissao;
        }
        existing.valorTotal = Number((existing.valorTotal + (item.valorContabil || 0)).toFixed(2));
        existing.itemsCount += 1;
        existing.rawItems.push(item);
      }
    });

    const sefazList = Array.from(sefazInvoiceMap.values());
    const icmsList = Array.from(icmsInvoiceMap.values());

    // 3. Multi-Pass Matching Engine with Strict Key Anti-Collision
    const matchedSefazIndices = new Set<number>();
    const matchedIcmsIndices = new Set<number>();
    const matchedPairs = new Map<number, number>(); // sefazIdx -> icmsIdx

    const keysConflict = (key1: string, key2: string): boolean => {
      return Boolean(key1 && key1.length === 44 && key2 && key2.length === 44 && key1 !== key2);
    };

    // Pass 1: Match by 44-digit Chave de Acesso (100% Exact Match)
    sefazList.forEach((sItem, sIdx) => {
      if (sItem.chaveAcesso && sItem.chaveAcesso.length === 44) {
        const iIdx = icmsList.findIndex((iItem, idx) => 
          !matchedIcmsIndices.has(idx) && 
          iItem.chaveAcesso === sItem.chaveAcesso
        );
        if (iIdx !== -1) {
          matchedSefazIndices.add(sIdx);
          matchedIcmsIndices.add(iIdx);
          matchedPairs.set(sIdx, iIdx);
        }
      }
    });

    // Pass 2: Match by (numInt + cleanSerie + tipoOperacao + matching value within R$ 0.05) with NO key conflict
    sefazList.forEach((sItem, sIdx) => {
      if (!matchedSefazIndices.has(sIdx)) {
        const candidates = icmsList
          .map((iItem, idx) => ({ iItem, idx }))
          .filter(({ iItem, idx }) => 
            !matchedIcmsIndices.has(idx) && 
            iItem.numInt === sItem.numInt &&
            iItem.cleanSerie === sItem.cleanSerie &&
            iItem.tipoOperacao === sItem.tipoOperacao &&
            !keysConflict(sItem.chaveAcesso, iItem.chaveAcesso) &&
            Math.abs(sItem.valorTotal - iItem.valorTotal) <= 0.05
          );

        if (candidates.length > 0) {
          const best = candidates.find(c => 
            (sItem.dataEmissao !== '-' && c.iItem.dataEmissao === sItem.dataEmissao) ||
            (sItem.fornecedorOuCliente !== 'CLIENTE/FORNECEDOR SEFAZ' && c.iItem.fornecedorOuCliente === sItem.fornecedorOuCliente)
          ) || candidates[0];

          matchedSefazIndices.add(sIdx);
          matchedIcmsIndices.add(best.idx);
          matchedPairs.set(sIdx, best.idx);
        }
      }
    });

    // Pass 3: Match by (numInt + cleanSerie + tipoOperacao) with NO key conflict (closest value)
    sefazList.forEach((sItem, sIdx) => {
      if (!matchedSefazIndices.has(sIdx)) {
        const candidates = icmsList
          .map((iItem, idx) => ({ iItem, idx }))
          .filter(({ iItem, idx }) => 
            !matchedIcmsIndices.has(idx) && 
            iItem.numInt === sItem.numInt &&
            iItem.cleanSerie === sItem.cleanSerie &&
            iItem.tipoOperacao === sItem.tipoOperacao &&
            !keysConflict(sItem.chaveAcesso, iItem.chaveAcesso)
          );

        if (candidates.length > 0) {
          candidates.sort((a, b) => 
            Math.abs(a.iItem.valorTotal - sItem.valorTotal) - Math.abs(b.iItem.valorTotal - sItem.valorTotal)
          );
          const best = candidates[0];

          matchedSefazIndices.add(sIdx);
          matchedIcmsIndices.add(best.idx);
          matchedPairs.set(sIdx, best.idx);
        }
      }
    });

    // Pass 4: Fallback Match by (numInt + tipoOperacao) with NO key conflict (closest value)
    sefazList.forEach((sItem, sIdx) => {
      if (!matchedSefazIndices.has(sIdx)) {
        const candidates = icmsList
          .map((iItem, idx) => ({ iItem, idx }))
          .filter(({ iItem, idx }) => 
            !matchedIcmsIndices.has(idx) && 
            iItem.numInt === sItem.numInt &&
            iItem.tipoOperacao === sItem.tipoOperacao &&
            !keysConflict(sItem.chaveAcesso, iItem.chaveAcesso)
          );

        if (candidates.length > 0) {
          candidates.sort((a, b) => 
            Math.abs(a.iItem.valorTotal - sItem.valorTotal) - Math.abs(b.iItem.valorTotal - sItem.valorTotal)
          );
          const best = candidates[0];

          matchedSefazIndices.add(sIdx);
          matchedIcmsIndices.add(best.idx);
          matchedPairs.set(sIdx, best.idx);
        }
      }
    });

    // 4. Construct Final Confrontation List
    const confrontationList: Array<{
      id: string;
      key: string;
      numeroNota: string;
      serie: string;
      modelo: string;
      chaveAcesso: string;
      dataEmissao: string;
      fornecedorOuCliente: string;
      tipoOperacao: 'ENTRADA' | 'SAIDA';
      cfop: string;
      constaNaSefaz: boolean;
      constaNoSistema: boolean;
      valorSefaz: number;
      valorSistema: number;
      valorDivergencia: number;
      status: 'FALTA_SISTEMA' | 'FALTA_SEFAZ' | 'DIVERGENCIA_VALOR' | 'CONCILIADO';
      statusLabel: string;
      acaoRecomendada: string;
    }> = [];

    let totalSefazValor = 0;
    let totalSefazNotas = 0;
    let totalIcmsValor = 0;
    let totalIcmsNotas = 0;

    let qtdFaltaSistema = 0;
    let valorFaltaSistema = 0;

    let qtdFaltaSefaz = 0;
    let valorFaltaSefaz = 0;

    let qtdDivergencias = 0;
    let valorDivergenciaTotal = 0;

    let qtdConciliadas = 0;
    let valorConciliado = 0;

    // Process all matched pairs & unmatched SEFAZ invoices
    sefazList.forEach((sItem, sIdx) => {
      totalSefazNotas++;
      totalSefazValor += sItem.valorTotal;

      if (matchedSefazIndices.has(sIdx)) {
        const iIdx = matchedPairs.get(sIdx)!;
        const iItem = icmsList[iIdx];

        totalIcmsNotas++;
        totalIcmsValor += iItem.valorTotal;

        const numNota = sItem.numeroNota;
        const serie = sItem.serie || iItem.serie || '1';
        const modelo = sItem.modelo || iItem.modelo || '55';
        const chaveAcesso = sItem.chaveAcesso || iItem.chaveAcesso || '';
        const dataEmissao = sItem.dataEmissao !== '-' ? sItem.dataEmissao : iItem.dataEmissao;
        const fornecedorOuCliente = sItem.fornecedorOuCliente !== 'CLIENTE/FORNECEDOR SEFAZ' ? sItem.fornecedorOuCliente : iItem.fornecedorOuCliente;
        const tipoOperacao = sItem.tipoOperacao;
        const cfop = iItem.cfop || sItem.cfop || '-';

        const valorSefaz = sItem.valorTotal;
        const valorSistema = iItem.valorTotal;
        const diff = Number((valorSefaz - valorSistema).toFixed(2));

        let status: 'FALTA_SISTEMA' | 'FALTA_SEFAZ' | 'DIVERGENCIA_VALOR' | 'CONCILIADO' = 'CONCILIADO';
        let statusLabel = 'Conciliada / Batida';
        let acaoRecomendada = 'Nota confirmada em ambos os relatórios com mesmo valor.';

        if (Math.abs(diff) > 0.05) {
          status = 'DIVERGENCIA_VALOR';
          statusLabel = `Divergência de R$ ${Math.abs(diff).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
          acaoRecomendada = `Diferença de valor entre SEFAZ (R$ ${valorSefaz.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) e Sistema (R$ ${valorSistema.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}). Reavaliar itens.`;
          qtdDivergencias++;
          valorDivergenciaTotal += Math.abs(diff);
        } else {
          status = 'CONCILIADO';
          statusLabel = 'Conciliada / Batida';
          acaoRecomendada = 'Nota fiscal 100% conciliada e em conformidade.';
          qtdConciliadas++;
          valorConciliado += valorSefaz;
        }

        confrontationList.push({
          id: `conf-matched-${sIdx}-${iIdx}`,
          key: `NF_${numNota}_SER_${serie}`,
          numeroNota: numNota,
          serie,
          modelo,
          chaveAcesso,
          dataEmissao,
          fornecedorOuCliente,
          tipoOperacao,
          cfop,
          constaNaSefaz: true,
          constaNoSistema: true,
          valorSefaz,
          valorSistema,
          valorDivergencia: Math.abs(diff),
          status,
          statusLabel,
          acaoRecomendada
        });
      } else {
        // Unmatched SEFAZ (Falta no Sistema)
        const valorSefaz = sItem.valorTotal;
        qtdFaltaSistema++;
        valorFaltaSistema += valorSefaz;

        confrontationList.push({
          id: `conf-sefaz-only-${sIdx}`,
          key: `NF_${sItem.numeroNota}_SER_${sItem.serie}`,
          numeroNota: sItem.numeroNota,
          serie: sItem.serie,
          modelo: sItem.modelo,
          chaveAcesso: sItem.chaveAcesso,
          dataEmissao: sItem.dataEmissao,
          fornecedorOuCliente: sItem.fornecedorOuCliente,
          tipoOperacao: sItem.tipoOperacao,
          cfop: sItem.cfop || '-',
          constaNaSefaz: true,
          constaNoSistema: false,
          valorSefaz,
          valorSistema: 0,
          valorDivergencia: valorSefaz,
          status: 'FALTA_SISTEMA',
          statusLabel: 'Falta no Sistema (ERP)',
          acaoRecomendada: 'Nota consta no relatório da SEFAZ, mas ausente no relatório do sistema. Importar / escriturar no ERP.'
        });
      }
    });

    // Unmatched ICMS (Falta na SEFAZ)
    icmsList.forEach((iItem, iIdx) => {
      if (!matchedIcmsIndices.has(iIdx)) {
        totalIcmsNotas++;
        totalIcmsValor += iItem.valorTotal;

        const valorSistema = iItem.valorTotal;
        qtdFaltaSefaz++;
        valorFaltaSefaz += valorSistema;

        confrontationList.push({
          id: `conf-icms-only-${iIdx}`,
          key: `NF_${iItem.numeroNota}_SER_${iItem.serie}`,
          numeroNota: iItem.numeroNota,
          serie: iItem.serie,
          modelo: iItem.modelo,
          chaveAcesso: iItem.chaveAcesso,
          dataEmissao: iItem.dataEmissao,
          fornecedorOuCliente: iItem.fornecedorOuCliente,
          tipoOperacao: iItem.tipoOperacao,
          cfop: iItem.cfop || '-',
          constaNaSefaz: false,
          constaNoSistema: true,
          valorSefaz: 0,
          valorSistema,
          valorDivergencia: valorSistema,
          status: 'FALTA_SEFAZ',
          statusLabel: 'Falta na SEFAZ',
          acaoRecomendada: 'Nota lançada no sistema, mas ausente na SEFAZ. Verificar se a nota foi denegada, cancelada ou não transmitida.'
        });
      }
    });

    confrontationList.sort((a, b) => {
      const numA = parseInt(a.numeroNota, 10) || 0;
      const numB = parseInt(b.numeroNota, 10) || 0;
      return numA - numB;
    });

    const totalInconsistencias = qtdFaltaSistema + qtdFaltaSefaz + qtdDivergencias;
    const totalUniverso = confrontationList.length;
    const percentualConformidade = totalUniverso > 0 
      ? Number(((qtdConciliadas / totalUniverso) * 100).toFixed(2))
      : 100;

    return {
      items: confrontationList,
      totalUniverso,
      totalSefazNotas,
      totalSefazValor,
      totalIcmsNotas,
      totalIcmsValor,
      qtdFaltaSistema,
      valorFaltaSistema,
      qtdFaltaSefaz,
      valorFaltaSefaz,
      qtdDivergencias,
      valorDivergenciaTotal,
      qtdConciliadas,
      valorConciliado,
      totalInconsistencias,
      percentualConformidade
    };
  }, [sefazRows, erpIcmsItems, organizadorEntradas, organizadorSaidas]);

  const sigaConfrontStatusCounts = useMemo(() => {
    const items = sigaSefazConfrontation.items.filter(item => {
      if (sigaConfrontTipoFilter === 'entrada') return item.tipoOperacao === 'ENTRADA';
      if (sigaConfrontTipoFilter === 'saida') return item.tipoOperacao === 'SAIDA';
      return true;
    });

    return {
      faltaSistema: items.filter(i => i.status === 'FALTA_SISTEMA').length,
      faltaSefaz: items.filter(i => i.status === 'FALTA_SEFAZ').length,
      divergencia: items.filter(i => i.status === 'DIVERGENCIA_VALOR').length,
      conciliado: items.filter(i => i.status === 'CONCILIADO').length,
      total: items.length
    };
  }, [sigaSefazConfrontation.items, sigaConfrontTipoFilter]);

  const filteredSigaConfrontItems = useMemo(() => {
    return sigaSefazConfrontation.items.filter(item => {
      // 1. Status Filter
      if (sigaConfrontFilterStatus === 'falta_sistema' && item.status !== 'FALTA_SISTEMA') return false;
      if (sigaConfrontFilterStatus === 'falta_sefaz' && item.status !== 'FALTA_SEFAZ') return false;
      if (sigaConfrontFilterStatus === 'divergencia' && item.status !== 'DIVERGENCIA_VALOR') return false;
      if (sigaConfrontFilterStatus === 'conciliado' && item.status !== 'CONCILIADO') return false;

      // 2. Tipo Operação Filter
      if (sigaConfrontTipoFilter === 'saida' && item.tipoOperacao !== 'SAIDA') return false;
      if (sigaConfrontTipoFilter === 'entrada' && item.tipoOperacao !== 'ENTRADA') return false;

      // 3. Search Term
      if (!sigaConfrontSearch.trim()) return true;

      const term = sigaConfrontSearch.toLowerCase().trim();
      return (
        item.numeroNota.toLowerCase().includes(term) ||
        item.serie.toLowerCase().includes(term) ||
        item.chaveAcesso.toLowerCase().includes(term) ||
        item.fornecedorOuCliente.toLowerCase().includes(term) ||
        item.cfop.toLowerCase().includes(term) ||
        item.valorSefaz.toString().includes(term) ||
        item.valorSistema.toString().includes(term)
      );
    });
  }, [sigaSefazConfrontation.items, sigaConfrontFilterStatus, sigaConfrontTipoFilter, sigaConfrontSearch]);

  const totalSigaConfrontPages = Math.ceil(filteredSigaConfrontItems.length / sigaConfrontItemsPerPage) || 1;

  const paginatedSigaConfrontItems = useMemo(() => {
    const start = (sigaConfrontPage - 1) * sigaConfrontItemsPerPage;
    return filteredSigaConfrontItems.slice(start, start + sigaConfrontItemsPerPage);
  }, [filteredSigaConfrontItems, sigaConfrontPage]);

  const handleExportSigaConfrontationExcel = () => {
    if (!sigaSefazConfrontation || sigaSefazConfrontation.items.length === 0) return;

    const wb = XLSX.utils.book_new();

    // Sheet 1: Resumo do Confronto
    const summaryRows = [
      ['SISTEMA DE AUDITORIA FISCAL DA SEFAZ'],
      ['RELATÓRIO DE CONFRONTO FISCAL - RELATÓRIO SIGA / SEFAZ vs RELATÓRIO DE ICMS (SISTEMA)'],
      [`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`],
      [''],
      ['Indicador de Auditoria', 'Quantidade de Notas', 'Valor Total (R$)', 'Percentual (%)'],
      ['Total de Notas no Relatório SEFAZ', sigaSefazConfrontation.totalSefazNotas, sigaSefazConfrontation.totalSefazValor, '-'],
      ['Total de Notas no Relatório de ICMS (Sistema)', sigaSefazConfrontation.totalIcmsNotas, sigaSefazConfrontation.totalIcmsValor, '-'],
      ['Faltam no Sistema (Constam na SEFAZ)', sigaSefazConfrontation.qtdFaltaSistema, sigaSefazConfrontation.valorFaltaSistema, `${((sigaSefazConfrontation.qtdFaltaSistema / (sigaSefazConfrontation.totalUniverso || 1)) * 100).toFixed(2)}%`],
      ['Faltam na SEFAZ (Constam no Sistema)', sigaSefazConfrontation.qtdFaltaSefaz, sigaSefazConfrontation.valorFaltaSefaz, `${((sigaSefazConfrontation.qtdFaltaSefaz / (sigaSefazConfrontation.totalUniverso || 1)) * 100).toFixed(2)}%`],
      ['Divergências de Valor', sigaSefazConfrontation.qtdDivergencias, sigaSefazConfrontation.valorDivergenciaTotal, `${((sigaSefazConfrontation.qtdDivergencias / (sigaSefazConfrontation.totalUniverso || 1)) * 100).toFixed(2)}%`],
      ['Notas Conciliadas / Batidas', sigaSefazConfrontation.qtdConciliadas, sigaSefazConfrontation.valorConciliado, `${sigaSefazConfrontation.percentualConformidade}%`]
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 45 }, { wch: 20 }, { wch: 22 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo do Confronto');

    // Sheet 2: Inconsistências (Faltantes & Divergências)
    const detailHeaders = ['Status / Inconsistência', 'Nota Fiscal', 'Série', 'Modelo', 'Data Emissão', 'Cliente / Fornecedor', 'CFOP', 'Valor SEFAZ (R$)', 'Valor Sistema (R$)', 'Diferença (R$)', 'Chave de Acesso', 'Ação Recomendada'];
    const inconsistencyItems = sigaSefazConfrontation.items.filter(i => i.status !== 'CONCILIADO');

    const inconsistencyRows = [
      ['SISTEMA DE AUDITORIA FISCAL DA SEFAZ'],
      ['DETALHAMENTO DE INCONSISTÊNCIAS ENTRE SEFAZ E SISTEMA (ERP)'],
      [''],
      detailHeaders,
      ...inconsistencyItems.map(item => [
        item.statusLabel,
        item.numeroNota,
        item.serie,
        item.modelo,
        item.dataEmissao,
        item.fornecedorOuCliente,
        item.cfop,
        item.valorSefaz,
        item.valorSistema,
        item.valorDivergencia,
        item.chaveAcesso || '-',
        item.acaoRecomendada
      ])
    ];

    const wsInconsistencies = XLSX.utils.aoa_to_sheet(inconsistencyRows);
    wsInconsistencies['!cols'] = [
      { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 30 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 48 }, { wch: 50 }
    ];
    XLSX.utils.book_append_sheet(wb, wsInconsistencies, 'Inconsistências');

    // Sheet 3: Todas as Notas
    const allRows = [
      ['SISTEMA DE AUDITORIA FISCAL DA SEFAZ'],
      ['LISTAGEM COMPLETA DO CONFRONTO SEFAZ vs SISTEMA'],
      [''],
      detailHeaders,
      ...sigaSefazConfrontation.items.map(item => [
        item.statusLabel,
        item.numeroNota,
        item.serie,
        item.modelo,
        item.dataEmissao,
        item.fornecedorOuCliente,
        item.cfop,
        item.valorSefaz,
        item.valorSistema,
        item.valorDivergencia,
        item.chaveAcesso || '-',
        item.acaoRecomendada
      ])
    ];

    const wsAll = XLSX.utils.aoa_to_sheet(allRows);
    wsAll['!cols'] = [
      { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 30 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 48 }, { wch: 50 }
    ];
    XLSX.utils.book_append_sheet(wb, wsAll, 'Todas as Notas');

    XLSX.writeFile(wb, `Confronto_SEFAZ_vs_Sistema_ICMS_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Channel Drop States & Refs
  const [isDragOverCanalA, setIsDragOverCanalA] = useState<boolean>(false);
  const [isDragOverCanalB, setIsDragOverCanalB] = useState<boolean>(false);
  const [isDragOverDataLake, setIsDragOverDataLake] = useState<boolean>(false);
  const fileInputCanalARef = useRef<HTMLInputElement>(null);
  const fileInputCanalBRef = useRef<HTMLInputElement>(null);
  const dataLakeFileInputRef = useRef<HTMLInputElement>(null);

  // Prevent browser default drop action on window level so drag & drop works cleanly
  useEffect(() => {
    const preventDefaults = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('dragover', preventDefaults);
    window.addEventListener('drop', preventDefaults);
    return () => {
      window.removeEventListener('dragover', preventDefaults);
      window.removeEventListener('drop', preventDefaults);
    };
  }, []);

  const handleDataLakeDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsDragOverDataLake(true);
  };

  const handleDataLakeDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsDragOverDataLake(true);
  };

  const handleDataLakeDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverDataLake(false);
  };

  const handleDataLakeDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverDataLake(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleProcessMultipleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleCanalADragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsDragOverCanalA(true);
  };

  const handleCanalADragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsDragOverCanalA(true);
  };

  const handleCanalADragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverCanalA(false);
  };

  const handleCanalADrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverCanalA(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImportSigaChannelFile(e.dataTransfer.files[0], 'ENTRADA');
    }
  };

  const handleCanalBDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsDragOverCanalB(true);
  };

  const handleCanalBDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsDragOverCanalB(true);
  };

  const handleCanalBDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverCanalB(false);
  };

  const handleCanalBDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverCanalB(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImportSigaChannelFile(e.dataTransfer.files[0], 'SAIDA');
    }
  };

  const handleDeleteFile = (fileName: string, type: 'sefaz' | 'erp' | 'siga_tax' | 'pis_cofins') => {
    setLoadedFiles(prev => prev.filter(f => f.name !== fileName));
    if (type === 'sefaz') {
      setSefazRows([]);
      setRawSefazText('');
      setAuditItems([]);
      setAuditSummary(null);
    } else if (type === 'erp') {
      setErpRowsText('');
      setAuditItems([]);
      setAuditSummary(null);
    } else if (type === 'siga_tax') {
      setSigaTaxText('');
      setOrganizadorEntradas([]);
      setOrganizadorSaidas([]);
      setOrganizadorMetadata(null);
    } else if (type === 'pis_cofins') {
      setPisCofinsRows([]);
      setPisCofinsMetadata(null);
    }
  };

  const availableTabs = useMemo(() => {
    if (!loadedFiles || loadedFiles.length === 0) {
      return ['confronto', 'organizador', 'auditoria_siga', 'integridade', 'pis_cofins'] as const;
    }
    const hasSefaz = loadedFiles.some(f => f.type === 'sefaz');
    const hasErp = loadedFiles.some(f => f.type === 'erp' || f.type === 'siga_tax');
    const hasSiga = loadedFiles.some(f => f.type === 'siga_tax') || organizadorEntradas.length > 0 || organizadorSaidas.length > 0;
    const hasPisCofins = loadedFiles.some(f => f.type === 'pis_cofins');

    const tabs: Array<'confronto' | 'organizador' | 'auditoria_siga' | 'integridade' | 'pis_cofins'> = ['confronto'];
    if (hasSefaz || hasErp || hasSiga) {
      tabs.push('integridade');
    }
    if (hasSiga || hasSefaz) {
      tabs.push('organizador');
      tabs.push('auditoria_siga');
    }
    if (hasPisCofins || (!hasSefaz && !hasErp && !hasSiga)) {
      tabs.push('pis_cofins');
    }
    return tabs;
  }, [loadedFiles, organizadorEntradas, organizadorSaidas]);

  useEffect(() => {
    if (!availableTabs.includes(activeOutputTab)) {
      if (availableTabs.length > 0) {
        setActiveOutputTab(availableTabs[0]);
      }
    }
  }, [availableTabs, activeOutputTab]);

  // Background Async Processing State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingStage, setProcessingStage] = useState<string>('');

  // --------------------------------------------------------
  // Auto-Detect & Parse files uploaded to the Universal Data Lake
  // --------------------------------------------------------
  const handleProcessMultipleFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    setProcessingProgress(5);
    setProcessingStage('Analisando arquivos e indexando chaves no Data Lake...');

    // Process files sequentially or in parallel
    let lastProcessedModule: 'pis_cofins' | 'siga' | 'icms' | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string || '');
        reader.readAsText(file, 'utf-8');
      });

      const pctBase = Math.round((i / files.length) * 80);
      setProcessingProgress(5 + pctBase);

      if (!text.trim()) continue;

      // Automatic Detection via Strategy Factory Pattern
      const detectedReportType = AuditService.detectReportType(text, file.name);

      // Case 1: PIS/COFINS Report (Módulo 3)
      if (detectedReportType === 'ERP_PIS_COFINS' ||
        text.toLowerCase().includes('demonstração dos créditos do pis') ||
        text.toLowerCase().includes('crédito vinculado à receita') ||
        text.toLowerCase().includes('entradas sem direito a créditos') ||
        text.toLowerCase().includes('b. c. créd.') ||
        text.toLowerCase().includes('informações dos produtos nas notas de entrada') ||
        text.toLowerCase().includes('informações dos produtos nas notas de saída') ||
        text.toLowerCase().includes('informacoes dos produtos nas notas de entrada') ||
        text.toLowerCase().includes('informacoes dos produtos nas notas de saida') ||
        text.toLowerCase().includes('sped pis/cofins') ||
        text.toLowerCase().includes('notas fiscais de entradas - sped') ||
        text.toLowerCase().includes('notas fiscais de saídas - sped') ||
        text.toLowerCase().includes('notas fiscais de saidas - sped')
      ) {
        lastProcessedModule = 'pis_cofins';
        setProcessingStage(`Módulo 3 (ERP PIS/COFINS): Processando (${file.name})...`);
        
        // Execute Módulo 3 via AuditService Strategy
        await AuditService.processReport({ content: text, filename: file.name, forceType: 'ERP_PIS_COFINS' });

        const { items: parsedItems, metadata: parsedMetadata } = await parsePisCofinsReportAsync(text, (pct) => {
          setProcessingProgress(Math.min(95, 5 + pctBase + Math.round(pct * 0.1)));
        });
        setPisCofinsRows(prev => {
          const seen = new Set<string>();
          prev.forEach(item => {
            const key = `${item.tipo}_${item.numeroNota}_${item.codigoProduto}_${item.cfop}_${item.data}_${item.valorProduto}`;
            seen.add(key);
          });
          const uniqueNewItems = parsedItems.filter(item => {
            const key = `${item.tipo}_${item.numeroNota}_${item.codigoProduto}_${item.cfop}_${item.data}_${item.valorProduto}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return [...prev, ...uniqueNewItems];
        });
        setPisCofinsMetadata(parsedMetadata);
        updateDataLakeFilesList(file.name, file.size, 'pis_cofins', parsedItems.length);
      }
      // Case 2: ERP ICMS (Módulo 2) or SIGA (Módulo 1)
      else if (detectedReportType === 'ERP_ICMS') {
        lastProcessedModule = 'icms';
        setProcessingStage(`Módulo 2 (ERP ICMS): Processando (${file.name})...`);
        const icmsResult = await AuditService.processReport({ content: text, filename: file.name, forceType: 'ERP_ICMS' });
        if (icmsResult && icmsResult.items && icmsResult.items.length > 0) {
          setErpIcmsItems(prev => [...prev, ...(icmsResult.items as ErpIcmsReportItem[])]);
        }
        setErpRowsText(text);
        updateDataLakeFilesList(file.name, file.size, 'erp', icmsResult.items?.length || text.split('\n').length - 1);
      }
      else if (
        detectedReportType === 'SIGA' ||
        file.name.toLowerCase().includes('nfc') ||
        text.toLowerCase().includes('nfc-e') ||
        text.toLowerCase().includes('nfce') ||
        text.toLowerCase().includes('informações fiscais') ||
        text.toLowerCase().includes('informacoes fiscais') ||
        text.toLowerCase().includes('notas fiscais de entrada') || 
        text.toLowerCase().includes('notas fiscais de saída') ||
        text.toLowerCase().includes('notas fiscais de saida') ||
        (text.includes(';') && text.toLowerCase().includes('nota fiscal') && text.toLowerCase().includes('cfop') && text.toLowerCase().includes('cst'))
      ) {
        lastProcessedModule = 'siga';
        setProcessingStage(`Módulo 1 (SIGA): Processando (${file.name})...`);
        await AuditService.processReport({ content: text, filename: file.name, forceType: 'SIGA' });
        setSigaTaxText(text);
        setErpRowsText(text);
        parseSigaTaxReport(text);
        updateDataLakeFilesList(file.name, file.size, 'siga_tax', 1);
      }
      // Case 3: SEFAZ Access Keys
      else if (
        text.toLowerCase().includes('chave') || 
        text.toLowerCase().includes('chv_aces') ||
        text.toLowerCase().includes('indicadores selecionados') ||
        /\b\d{44}\b/.test(text)
      ) {
        lastProcessedModule = 'icms';
        setProcessingStage(`Identificado: Notas de Venda SEFAZ (${file.name})`);
        setRawSefazText(text);
        const parsedSefaz = await parseSefazReportAsync(text, (pct) => {
          setProcessingProgress(5 + pctBase + Math.round(pct * 0.1));
        });
        setSefazRows(parsedSefaz);
        updateDataLakeFilesList(file.name, file.size, 'sefaz', parsedSefaz.length);
      }
      // Case 4: ERP Records
      else {
        lastProcessedModule = 'icms';
        setProcessingStage(`Identificado: Lançamentos ERP Contábil (${file.name})`);
        setErpRowsText(text);
        updateDataLakeFilesList(file.name, file.size, 'erp', text.split('\n').length - 1);
      }
    }

    setProcessingProgress(90);
    setProcessingStage('Finalizando normalização e cruzando registros...');

    if (lastProcessedModule === 'pis_cofins' || (!lastProcessedModule && activeMainModule === 'pis_cofins')) {
      setActiveMainModule('pis_cofins');
      setActiveOutputTab('pis_cofins');
    } else if (lastProcessedModule === 'siga') {
      setActiveMainModule('siga');
      setActiveOutputTab('organizador');
    } else {
      setActiveMainModule('icms');
      setActiveOutputTab('confronto');
      setIcmsMainTab('auditoria');
    }

    setIsProcessing(false);

    setTimeout(() => {
      const element = document.getElementById('workspace-output-cockpit');
      element?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  const updateDataLakeFilesList = (name: string, size: number, type: 'sefaz' | 'erp' | 'siga_tax' | 'pis_cofins', count: number) => {
    setLoadedFiles(prev => {
      const filtered = prev.filter(f => f.name !== name);
      return [...filtered, { name, size, type, recordsCount: count }];
    });
  };

  // Siga/Organizador specific text parser using segregated reader functions
  const parseSigaTaxReport = (text: string) => {
    const { entradas, saidas, metadata } = parseSigaFullReport(text);

    setOrganizadorEntradas(entradas);
    setOrganizadorSaidas(saidas);
    setOrganizadorMetadata(metadata);

    setLoadedFiles(prev => {
      const idx = prev.findIndex(f => f.type === 'siga_tax');
      if (idx !== -1) {
        prev[idx].recordsCount = entradas.length + saidas.length;
      }
      return [...prev];
    });
  };

  // Channel Import Handlers (Canal A = Emitidos / Saídas, Canal B = Recebidos / Entradas)
  const handleImportSigaChannelFile = async (file: File, channel: 'SAIDA' | 'ENTRADA') => {
    if (!file) return;
    setIsProcessing(true);
    setProcessingProgress(20);
    setProcessingStage(
      channel === 'SAIDA' 
        ? `Importando Documentos Emitidos (Saídas): ${file.name}...` 
        : `Importando Documentos Recebidos (Entradas): ${file.name}...`
    );

    let text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string || '');
      reader.readAsText(file, 'utf-8');
    });

    setProcessingProgress(60);

    let parsed = parseSigaChannelFile(text, channel);

    // Fallback: Re-read with ISO-8859-1 encoding if UTF-8 yields no items
    if (!parsed.isValid || parsed.items.length === 0) {
      text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string || '');
        reader.readAsText(file, 'ISO-8859-1');
      });
      parsed = parseSigaChannelFile(text, channel);
    }

    const { items, metadata, isValid } = parsed;

    if (!isValid || items.length === 0) {
      setIsProcessing(false);
      alert(`⚠️ Arquivo "${file.name}" não pôde ser processado.\n\nFormato incompatível com o padrão de relatórios SIGA/SEFAZ. Certifique-se de carregar um arquivo texto/CSV delimitado contendo notas fiscais e valores.`);
      return;
    }

    if (channel === 'SAIDA') {
      setOrganizadorSaidas(prev => [...prev, ...items]);
    } else {
      setOrganizadorEntradas(prev => [...prev, ...items]);
    }

    setOrganizadorMetadata(prev => ({
      empresa: metadata.empresa || prev?.empresa || 'EMPRESA IDENTIFICADA NO RELATÓRIO',
      periodo: metadata.periodo || prev?.periodo || 'Período Auditado',
      dataGeracao: metadata.dataGeracao || prev?.dataGeracao || new Date().toLocaleDateString('pt-BR')
    }));

    updateDataLakeFilesList(file.name, file.size, 'siga_tax', items.length);

    setActiveMainModule('siga');
    setActiveOutputTab('organizador');

    setProcessingProgress(100);
    setIsProcessing(false);

    setTimeout(() => {
      const element = document.getElementById('workspace-output-cockpit');
      element?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  // Run Bilateral Strategic Reconciliation
  const handleTriggerStrategicConciliation = async () => {
    if (sefazRows.length === 0) {
      alert('Carregue pelo menos um relatório SEFAZ de Notas para cruzar!');
      return;
    }
    if (!erpRowsText.trim()) {
      alert('Carregue também um extrato ou relatório ERP para cruzar com a SEFAZ!');
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStage('Carregando extratos do ERP contábil...');

    try {
      const parsedErp = await parseErpReportAsync(erpRowsText, (pct) => {
        setProcessingProgress(Math.round(pct * 0.4));
      });

      setProcessingStage('Executando confronto bidirecional indexado...');
      const { items, summary } = await executeDataAuditAsync(sefazRows, parsedErp, (pct) => {
        setProcessingProgress(40 + Math.round(pct * 0.6));
      });

      setAuditItems(items);
      setAuditSummary(summary);
      setActiveMainModule('icms');
      setActiveOutputTab('confronto');
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveSefazDuplicates = () => {
    if (sefazRows.length === 0) return;
    const cleanSefazRows: InvoiceRow[] = [];
    const seenKeys = new Set<string>();
    sefazRows.forEach(row => {
      const key = row.chaveDeAcesso && row.chaveDeAcesso.trim() !== ''
        ? row.chaveDeAcesso.trim()
        : `NOTA_${row.numeroNota}_SERIE_${row.serie}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        cleanSefazRows.push(row);
      }
    });

    setSefazRows(cleanSefazRows);

    // Update loadedFiles recordCount for SEFAZ
    setLoadedFiles(prev => prev.map(f => {
      if (f.type === 'sefaz') {
        return { ...f, recordsCount: cleanSefazRows.length };
      }
      return f;
    }));

    // If an ERP file is also loaded, automatically re-run the strategic conciliation with the cleaned data!
    if (erpRowsText.trim()) {
      setIsProcessing(true);
      setProcessingProgress(0);
      setProcessingStage('Removendo duplicatas e reprocessando confronto...');
      setTimeout(async () => {
        try {
          const parsedErp = await parseErpReportAsync(erpRowsText, (pct) => {
            setProcessingProgress(Math.round(pct * 0.4));
          });
          const { items, summary } = await executeDataAuditAsync(cleanSefazRows, parsedErp, (pct) => {
            setProcessingProgress(40 + Math.round(pct * 0.6));
          });
          setAuditItems(items);
          setAuditSummary(summary);
        } catch (e) {
          console.error(e);
        } finally {
          setIsProcessing(false);
        }
      }, 300);
    }
  };

  // Load Preset Mock Database (for high-fidelity demo & testing)
  const handleLoadSampleDatabase = async () => {
    setIsProcessing(true);
    setProcessingProgress(15);
    setProcessingStage('Indexando base SEFAZ fictícia...');

    // Simulate database seeding
    setTimeout(() => {
      setProcessingProgress(45);
      setProcessingStage('Alocando registros ERP correspondentes...');

      // Build mock sefaz data
      const mockSefaz: InvoiceRow[] = Array.from({ length: 100 }, (_, index) => {
        const notaNum = 1832138 + index;
        const fakeCpfCnpj = index % 3 === 0 ? '17.503.644/0002-86' : '07.454.439/314';
        const rawKey = `352606${fakeCpfCnpj.replace(/\D/g, '')}55001${notaNum.toString().padStart(9, '0')}1999999991`;
        const valor = 50 + index * 12.5;

        // Simulate some canceled notes (canceled at indices divisible by 15)
        const isCanceled = index % 15 === 0;

        return {
          id: `fake-sefaz-${index}`,
          chaveDeAcesso: rawKey,
          dataEmissao: '01/06/2026',
          valorString: `R$ ${valor.toFixed(2)}`,
          valorDecimal: isCanceled ? 0 : valor,
          ufCodigo: '35',
          ufNome: 'São Paulo (SP)',
          anoMes: '06/2026',
          cnpj: fakeCpfCnpj.replace(/\D/g, ''),
          cnpjFormatado: fakeCpfCnpj,
          modelo: '55',
          serie: '1',
          numeroNota: notaNum.toString(),
          numeroNotaFormatado: notaNum.toString(),
          tipoEmissao: '1',
          tipoEmissaoFriendly: 'Normal',
          isValidChave: true
        };
      });

      // Build mock erp records
      // Simulate 1 missing in ERP, 1 value discrepancy
      const mockErpTextLines = ['Nota;Data Emissao;Série;Valor Total;Cliente'];
      mockSefaz.forEach((s, idx) => {
        const notaNum = parseInt(s.numeroNota, 10);
        
        // Skip 1832145 in ERP (FALTANTE_ERP)
        if (notaNum === 1832145) return;

        let val = s.valorDecimal;
        // Introduce value divergence on 1832150 (DIVERGENCIA_VALOR)
        if (notaNum === 1832150) {
          val += 150.00;
        }

        mockErpTextLines.push(`${notaNum};01/06/2026;1;${val.toFixed(2)};CLIENTE PARCEIRO LTDA`);
      });

      // Also add 1 record in ERP that is NOT in SEFAZ
      mockErpTextLines.push(`9999999;01/06/2026;1;1250.00;CLIENTE DESCONHECIDO SEFAZ`);

      const erpTextRaw = mockErpTextLines.join('\n');

      setSefazRows(mockSefaz);
      setErpRowsText(erpTextRaw);

      setProcessingProgress(75);
      setProcessingStage('Sincronizando Relatórios de Impostos SIGA (CSV)...');

      // Seed Siga Impostos
      setSigaTaxText(SAMPLE_RAW_REPORT);
      parseSigaTaxReport(SAMPLE_RAW_REPORT);

      // Seed PIS/COFINS mock rows
      const mockPisCofins: PisCofinsItem[] = [
        {
          id: 'pc-1',
          empresaId: '7',
          numeroNota: '1832138',
          data: '01/06/2026',
          modelo: 'NF-e',
          cfop: '1.403',
          codigoProduto: 'PROD001',
          nomeProduto: 'PRODUTO COM BASE DIVERGENTE PIS/COFINS',
          cst: '50',
          valorProduto: 1000,
          baseCalculo: 1000,
          baseCalculoPis: 1000,
          baseCalculoCofins: 800, // Divergent base
          aliquotaPis: 1.65,
          aliquotaCofins: 7.6,
          valorPis: 16.5,
          valorCofins: 60.8,
          valor: 1000,
          aliquota: 9.25,
          imposto: 77.3,
          tipo: 'entrada'
        },
        {
          id: 'pc-2',
          empresaId: '7',
          numeroNota: '1832139',
          data: '02/06/2026',
          modelo: 'NF-e',
          cfop: '1.403',
          codigoProduto: 'PROD002',
          nomeProduto: 'PRODUTO COM CALCULO PIS INCORRETO',
          cst: '50',
          valorProduto: 1000,
          baseCalculo: 1000,
          baseCalculoPis: 1000,
          baseCalculoCofins: 1000,
          aliquotaPis: 1.65,
          aliquotaCofins: 7.6,
          valorPis: 10.0, // Error: 1000 * 1.65% should be 16.5
          valorCofins: 76.0,
          valor: 1000,
          aliquota: 9.25,
          imposto: 86.0,
          tipo: 'entrada'
        },
        {
          id: 'pc-3',
          empresaId: '7',
          numeroNota: '1832140',
          data: '03/06/2026',
          modelo: 'NF-e',
          cfop: '1.403',
          codigoProduto: 'PROD003',
          nomeProduto: 'PRODUTO COM CST PIS/COFINS INCOMPATIVEL',
          cst: '01', // Outgoing CST for an incoming operation triggers CST incompatible!
          valorProduto: 1000,
          baseCalculo: 1000,
          baseCalculoPis: 1000,
          baseCalculoCofins: 1000,
          aliquotaPis: 1.65,
          aliquotaCofins: 7.6,
          valorPis: 16.5,
          valorCofins: 76.0,
          valor: 1000,
          aliquota: 9.25,
          imposto: 92.5,
          tipo: 'entrada'
        },
        {
          id: 'pc-4',
          empresaId: '7',
          numeroNota: '1832141',
          data: '04/06/2026',
          modelo: 'NF-e',
          cfop: '1.403',
          codigoProduto: 'PROD004',
          nomeProduto: 'PRODUTO CORRETO EXEMPLO',
          cst: '50',
          valorProduto: 500,
          baseCalculo: 500,
          baseCalculoPis: 500,
          baseCalculoCofins: 500,
          aliquotaPis: 1.65,
          aliquotaCofins: 7.6,
          valorPis: 8.25,
          valorCofins: 38.0,
          valor: 500,
          aliquota: 9.25,
          imposto: 46.25,
          tipo: 'entrada'
        }
      ];
      setPisCofinsRows(mockPisCofins);
      setPisCofinsMetadata({
        empresa: 'MOREIRA & LIMA CONTADORES ASSOCIADOS',
        periodo: '06/2026',
        dataGeracao: '21/06/2026 14:30:22'
      });

      // Setup list
      setLoadedFiles([
        { name: 'sefaz_automatico_m55_65.csv', size: 12540, type: 'sefaz', recordsCount: mockSefaz.length },
        { name: 'erp_faturamento_vendas.csv', size: 8430, type: 'erp', recordsCount: mockErpTextLines.length - 1 },
        { name: 'siga_movimentacao_entrada_saida.txt', size: 5688, type: 'siga_tax', recordsCount: 12 },
        { name: 'demonstrativo_pis_cofins_apurado.csv', size: 6120, type: 'pis_cofins', recordsCount: mockPisCofins.length }
      ]);

      // Calculate auto cross-audit immediately for high fidelity
      const mockErpRecords = mockSefaz.map(s => {
        const notaNum = parseInt(s.numeroNota, 10);
        if (notaNum === 1832145) return null;
        let val = s.valorDecimal;
        if (notaNum === 1832150) val += 150.00;
        return {
          nota: notaNum,
          dataEmissao: '01/06/2026',
          valor: val,
          serie: '1',
          cliente: 'CLIENTE PARCEIRO LTDA',
          linhaOriginal: ''
        };
      }).filter(Boolean);

      // Add the extra erp row
      mockErpRecords.push({
        nota: 9999999,
        dataEmissao: '01/06/2026',
        valor: 1250.00,
        serie: '1',
        cliente: 'CLIENTE DESCONHECIDO SEFAZ',
        linhaOriginal: ''
      });

      const { items, summary } = executeDataAudit(mockSefaz, erpTextRaw);

      // Generate sample erpIcmsItems for Módulo 2 ICMS
      const sampleIcmsList: ErpIcmsReportItem[] = mockSefaz.map((s, idx) => {
        const isDivergent = idx === 12;
        const vlrContabil = s.valorDecimal;
        const baseCalc = vlrContabil;
        const aliq = 18;
        const vlrIcmsDeclared = isDivergent ? baseCalc * (aliq / 100) - 50.00 : baseCalc * (aliq / 100);
        const vlrIcmsRecalc = baseCalc * (aliq / 100);

        const sampleCodes = ['15.221', '15.222', '10.104', '15.221', '22.090'];
        const sampleDescs = [
          'BEBIDA ISOTÔNICA CITRUS 500ML',
          'REFRIGERANTE COLA 2L',
          'BISCOITO CREAM CRACKER 400G',
          'BEBIDA ISOTÔNICA CITRUS 500ML',
          'AZEITE DE OLIVA EXTRA VIRGEM 500ML'
        ];
        const sCode = sampleCodes[idx % sampleCodes.length];
        const sDesc = sampleDescs[idx % sampleDescs.length];

        return {
          id: `sample-icms-${idx}`,
          tipoOperacao: 'SAIDA',
          notaFiscal: s.numeroNota,
          serie: s.serie || '1',
          modelo: s.modelo || '55',
          dataEmissao: s.dataEmissao,
          cnpjEmitente: s.cnpjFormatado || '17.503.644/0002-86',
          razaoSocialEmitente: 'SL DISTRIBUIDORA DE PRODUTOS ALIMENTICIO',
          uf: 'SP',
          cfop: '5.102',
          codigoProduto: sCode,
          descricaoProduto: sDesc,
          produto: `${sCode} - ${sDesc}`,
          ncm: '21069090',
          unidade: 'UN',
          quantidade: 10 + idx,
          valorUnitario: vlrContabil / (10 + idx),
          valorProduto: vlrContabil,
          desconto: 0,
          valorContabil: vlrContabil,
          cstIcms: '000',
          baseCalculoIcms: baseCalc,
          aliquotaIcms: aliq,
          valorIcms: vlrIcmsDeclared,
          aliquotaIpi: 0,
          valorIpi: 0,
          valorIsentoIcms: 0,
          valorOutrosIcms: 0,
          chaveDeAcesso: s.chaveDeAcesso,
          isValidChave: s.isValidChave,
          icmsRecalculated: vlrIcmsRecalc,
          icmsDivergence: Math.abs(vlrIcmsDeclared - vlrIcmsRecalc),
          hasDivergence: isDivergent,
          statusAudit: isDivergent ? 'DIVERGENCIA_CALCULO' : 'OK',
          deduplicationKey: `MOCK_ICMS_NF_${s.numeroNota}`,
          isDuplicate: false
        };
      });
      setErpIcmsItems(sampleIcmsList);

      setAuditItems(items);
      setAuditSummary(summary);

      setProcessingProgress(100);
      setIsProcessing(false);
    }, 1000);
  };

  const handleClearDataLake = () => {
    setLoadedFiles([]);
    setSefazRows([]);
    setRawSefazText('');
    setErpRowsText('');
    setSigaTaxText('');
    setOrganizadorEntradas([]);
    setOrganizadorSaidas([]);
    setOrganizadorMetadata(null);
    setAuditItems([]);
    setAuditSummary(null);
    setPisCofinsRows([]);
    setPisCofinsMetadata(null);
    setErpIcmsItems([]);
    setSelectedIcmsProductKeys([]);
    setIsIcmsProductSelectorOpen(false);
    setIcmsProductSearchQuery('');
  };

  // --------------------------------------------------------
  // Computations for Organizador / Tax tab
  // --------------------------------------------------------
  const currentTabItems = useMemo(() => {
    const baseItems = activeOrgSubTab === 'entradas' ? organizadorEntradas : organizadorSaidas;
    return groupDuplicates ? aggregateDuplicates(baseItems) : baseItems;
  }, [activeOrgSubTab, organizadorEntradas, organizadorSaidas, groupDuplicates]);

  const uniqueCfops = useMemo(() => {
    const cfops = new Set<string>();
    currentTabItems.forEach(item => {
      if (item.cfop) cfops.add(item.cfop);
    });
    return Array.from(cfops).sort();
  }, [currentTabItems]);

  const uniqueCsts = useMemo(() => {
    const csts = new Set<string>();
    currentTabItems.forEach(item => {
      if (item.cst) csts.add(item.cst);
    });
    return Array.from(csts).sort();
  }, [currentTabItems]);

  const filteredOrgItems = useMemo(() => {
    const filtered = currentTabItems.filter(item => {
      const matchSearch = !orgSearchTerm || 
        (item.notaFiscal && item.notaFiscal.toLowerCase().includes(orgSearchTerm.toLowerCase())) ||
        (item.nomeProduto && item.nomeProduto.toLowerCase().includes(orgSearchTerm.toLowerCase())) ||
        (item.razaoSocial && item.razaoSocial.toLowerCase().includes(orgSearchTerm.toLowerCase())) ||
        (item.cnpj && item.cnpj.toLowerCase().includes(orgSearchTerm.toLowerCase())) ||
        (item.chaveDeAcesso && item.chaveDeAcesso.toLowerCase().includes(orgSearchTerm.toLowerCase())) ||
        (item.uf && item.uf.toLowerCase().includes(orgSearchTerm.toLowerCase())) ||
        (item.situacaoNfe && item.situacaoNfe.toLowerCase().includes(orgSearchTerm.toLowerCase()));

      const matchCfop = orgCfopFilter === 'all' || item.cfop === orgCfopFilter;
      const matchCst = orgCstFilter === 'all' || item.cst === orgCstFilter;

      return matchSearch && matchCfop && matchCst;
    });
    return [...filtered].sort((a, b) => {
      const numA = parseInt((a.notaFiscal || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt((b.notaFiscal || '').replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });
  }, [currentTabItems, orgSearchTerm, orgCfopFilter, orgCstFilter]);

  const totalOrgPages = Math.ceil(filteredOrgItems.length / itemsPerPage);
  const paginatedOrgItems = useMemo(() => {
    const start = (orgCurrentPage - 1) * itemsPerPage;
    return filteredOrgItems.slice(start, start + itemsPerPage);
  }, [filteredOrgItems, orgCurrentPage]);

  // Organizador General Metrics block
  const orgStats = useMemo(() => {
    const calc = (items: ReportItem[]) => {
      let vContabil = 0;
      let vProduto = 0;
      let icms = 0;
      let ipi = 0;
      let desconto = 0;
      let qtde = 0;
      const products = new Set<string>();

      items.forEach(item => {
        const val = Number(item.vlrContabil || item.rProduto || item.rBaseIcms || (item as any).valor || 0);
        vContabil += val;
        vProduto += Number(item.rProduto || val);
        icms += Number(item.rIcms || 0);
        ipi += Number(item.rIpi || 0);
        desconto += Number(item.desconto || 0);
        qtde += Number(item.qtde || 1);
        if (item.codigoProduto) products.add(item.codigoProduto);
      });

      return {
        vContabil,
        vProduto,
        totalTaxes: icms + ipi,
        icms,
        ipi,
        desconto,
        qtde,
        uniqProdCount: products.size
      };
    };

    return {
      entradas: calc(organizadorEntradas),
      saidas: calc(organizadorSaidas)
    };
  }, [organizadorEntradas, organizadorSaidas]);

  // Tax CFOP & Product classifications compilation
  const auditReport = useMemo(() => {
    const compile = (items: ReportItem[]) => {
      const cfopSummary: Record<string, { 
        cfop: string; 
        count: number; 
        total: number; 
        rBaseIcms: number;
        pIcms: number;
        rIcms: number; 
        isentas: number;
        outras: number;
        rIpi: number;
      }> = {};
      const productSummary: Record<string, { code: string; name: string; un: string; qty: number; value: number }> = {};
      const ncmSummary: Record<string, { ncm: string; value: number }> = {};

      items.forEach(item => {
        // CFOP Grouping
        if (!cfopSummary[item.cfop]) {
          cfopSummary[item.cfop] = { 
            cfop: item.cfop, count: 0, total: 0, rBaseIcms: 0, pIcms: item.pIcms || 0,
            rIcms: 0, isentas: 0, outras: 0, rIpi: 0
          };
        }
        cfopSummary[item.cfop].count += 1;
        cfopSummary[item.cfop].total += item.vlrContabil;
        cfopSummary[item.cfop].rBaseIcms += item.rBaseIcms;
        cfopSummary[item.cfop].rIcms += item.rIcms;
        cfopSummary[item.cfop].rIpi += item.rIpi;
        if (item.pIcms > 0) {
          cfopSummary[item.cfop].pIcms = item.pIcms;
        }

        // Product Grouping
        if (!productSummary[item.codigoProduto]) {
          productSummary[item.codigoProduto] = { code: item.codigoProduto, name: item.nomeProduto, un: item.un, qty: 0, value: 0 };
        }
        productSummary[item.codigoProduto].qty += item.qtde;
        productSummary[item.codigoProduto].value += item.vlrContabil;

        // NCM Grouping
        if (!ncmSummary[item.ncm]) {
          ncmSummary[item.ncm] = { ncm: item.ncm, value: 0 };
        }
        ncmSummary[item.ncm].value += item.vlrContabil;
      });

      return {
        cfopList: Object.values(cfopSummary).sort((a, b) => b.total - a.total),
        productList: Object.values(productSummary).sort((a, b) => b.value - a.value),
        ncmList: Object.values(ncmSummary).sort((a, b) => b.value - a.value)
      };
    };

    return {
      entradas: compile(organizadorEntradas),
      saidas: compile(organizadorSaidas)
    };
  }, [organizadorEntradas, organizadorSaidas]);

  // PF vs PJ Vendas details
  const pfPjMetrics = useMemo(() => {
    let pfValue = 0, pfCount = 0;
    let pjValue = 0, pjCount = 0;
    let otherValue = 0, otherCount = 0;

    organizadorSaidas.forEach(item => {
      const type = getDocumentType(item.cnpj);
      if (type === 'PF') {
        pfValue += item.vlrContabil;
        pfCount++;
      } else if (type === 'PJ') {
        pjValue += item.vlrContabil;
        pjCount++;
      } else {
        otherValue += item.vlrContabil;
        otherCount++;
      }
    });

    const totalValue = pfValue + pjValue + otherValue || 1;
    const totalCount = pfCount + pjCount + otherCount || 1;

    return {
      pfValue, pfCount, pfPctValue: (pfValue / totalValue) * 100, pfPctCount: (pfCount / totalCount) * 100,
      pjValue, pjCount, pjPctValue: (pjValue / totalValue) * 100, pjPctCount: (pjCount / totalCount) * 100,
      otherValue, otherCount, otherPctValue: (otherValue / totalValue) * 100, otherPctCount: (otherCount / totalCount) * 100,
    };
  }, [organizadorSaidas]);

  // --------------------------------------------------------
  // NFC-e Access Key analysis stats
  // --------------------------------------------------------
  const nfceFilteredRows = useMemo(() => {
    return sefazRows.filter(r => {
      const matchesSearch = !searchTermNfce || 
        r.chaveDeAcesso.toLowerCase().includes(searchTermNfce.toLowerCase()) ||
        r.numeroNotaFormatado.includes(searchTermNfce) ||
        r.dataEmissao.includes(searchTermNfce) ||
        r.cnpjFormatado.includes(searchTermNfce);

      const matchesStatus = 
        filterStatusNfce === 'all' ||
        (filterStatusNfce === 'valid' && r.isValidChave) ||
        (filterStatusNfce === 'invalid' && !r.isValidChave);

      return matchesSearch && matchesStatus;
    });
  }, [sefazRows, searchTermNfce, filterStatusNfce]);

  const nfceStats = useMemo(() => {
    let totalValor = 0;
    let validKeysCount = 0;
    let count55 = 0;
    let count65 = 0;

    sefazRows.forEach(r => {
      totalValor += r.valorDecimal;
      if (r.isValidChave) validKeysCount++;
      if (r.modelo === '55') count55++;
      else if (r.modelo === '65') count65++;
    });

    return {
      totalCount: sefazRows.length,
      totalValor,
      validKeysCount,
      invalidKeysCount: sefazRows.length - validKeysCount,
      count55,
      count65,
    };
  }, [sefazRows]);

  // PIS/COFINS useMemo filtering & stats hooks
  // 1. Full original rows (filtered by subtab & search term)
  const filteredPisCofinsRows = useMemo(() => {
    let list = pisCofinsRows;
    
    // Filter by tab: entradas, saidas
    if (activePisCofinsSubTab === 'entradas') {
      list = list.filter(item => item.tipo === 'entrada');
    } else if (activePisCofinsSubTab === 'saidas') {
      list = list.filter(item => item.tipo === 'saida');
    }

    // Filter by search term
    if (searchTermPisCofins.trim()) {
      const term = searchTermPisCofins.toLowerCase();
      list = list.filter(item => 
        item.cfop.toLowerCase().includes(term) ||
        item.cst.toLowerCase().includes(term) ||
        item.codigoProduto.toLowerCase().includes(term) ||
        item.nomeProduto.toLowerCase().includes(term)
      );
    }

    // Sort alphabetically by product description (nomeProduto)
    const ptBrCollator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
    return [...list].sort((a, b) => {
      const nameA = a.nomeProduto || '';
      const nameB = b.nomeProduto || '';
      return ptBrCollator.compare(nameA, nameB);
    });
  }, [pisCofinsRows, activePisCofinsSubTab, searchTermPisCofins]);

  // 2. Product-consolidated rows (Resumido por Produto + CFOP + CST) for Screen "1. Relatório Original"
  const resumidoPisCofinsRows = useMemo(() => {
    let consolidated = consolidatePisCofinsRows(pisCofinsRows, 'cfop_cst_product');
    
    if (activePisCofinsSubTab === 'entradas') {
      consolidated = consolidated.filter(item => item.tipo === 'entrada');
    } else if (activePisCofinsSubTab === 'saidas') {
      consolidated = consolidated.filter(item => item.tipo === 'saida');
    }

    const term = searchTermPisCofins.toLowerCase().trim();
    if (term) {
      return consolidated.filter(item => 
        item.cfop.toLowerCase().includes(term) ||
        item.cst.toLowerCase().includes(term) ||
        item.codigoProduto?.toLowerCase().includes(term) ||
        item.nomeProduto?.toLowerCase().includes(term)
      );
    }
    
    return consolidated;
  }, [pisCofinsRows, activePisCofinsSubTab, searchTermPisCofins]);

  // 3. CFOP/CST-consolidated rows (Resumo por CFOP + CST) for Screen "2. Resumo"
  const resumoCfopCstPisCofinsRows = useMemo(() => {
    let consolidated = consolidatePisCofinsRows(pisCofinsRows, 'cfop_cst');
    
    if (activePisCofinsSubTab === 'entradas') {
      consolidated = consolidated.filter(item => item.tipo === 'entrada');
    } else if (activePisCofinsSubTab === 'saidas') {
      consolidated = consolidated.filter(item => item.tipo === 'saida');
    }

    const term = searchTermPisCofins.toLowerCase().trim();
    if (term) {
      return consolidated.filter(item => 
        item.cfop.toLowerCase().includes(term) ||
        item.cst.toLowerCase().includes(term)
      );
    }
    
    return consolidated;
  }, [pisCofinsRows, activePisCofinsSubTab, searchTermPisCofins]);

  // Active display rows based on view mode and format selection
  const activePisCofinsDisplayRows = useMemo(() => {
    if (pisCofinsViewMode === 'original') {
      return pisCofinsOriginalFormat === 'resumido' ? resumidoPisCofinsRows : filteredPisCofinsRows;
    }
    return resumoCfopCstPisCofinsRows;
  }, [pisCofinsViewMode, pisCofinsOriginalFormat, resumidoPisCofinsRows, filteredPisCofinsRows, resumoCfopCstPisCofinsRows]);

  const paginatedActivePisCofinsDisplayRows = useMemo(() => {
    const start = (pisCofinsCurrentPage - 1) * pisCofinsItemsPerPage;
    return activePisCofinsDisplayRows.slice(start, start + pisCofinsItemsPerPage);
  }, [activePisCofinsDisplayRows, pisCofinsCurrentPage]);

  const totalPisCofinsPages = useMemo(() => {
    return Math.ceil(activePisCofinsDisplayRows.length / pisCofinsItemsPerPage);
  }, [activePisCofinsDisplayRows]);

  const pisCofinsStats = useMemo(() => {
    let totalEntradas = 0;
    let totalSaidas = 0;
    let valorProdutoEntradas = 0;
    let valorProdutoSaidas = 0;
    let baseCalculoEntradas = 0;
    let baseCalculoSaidas = 0;
    let impostoTotal = 0;
    let pisTotal = 0;         // PIS Crédito (Entradas)
    let cofinstotal = 0;       // COFINS Crédito (Entradas)
    let pisDebitoTotal = 0;    // PIS Débito (Saídas)
    let cofinsDebitoTotal = 0; // COFINS Débito (Saídas)

    pisCofinsRows.forEach(row => {
      if (row.tipo === 'entrada') {
        totalEntradas++;
        valorProdutoEntradas += row.valorProduto;
        baseCalculoEntradas += row.baseCalculo;
        pisTotal += row.valorPis;
        cofinstotal += row.valorCofins;
      } else {
        totalSaidas++;
        valorProdutoSaidas += row.valorProduto;
        baseCalculoSaidas += row.baseCalculo;
        pisDebitoTotal += row.valorPis;
        cofinsDebitoTotal += row.valorCofins;
      }
      impostoTotal += row.valorPis + row.valorCofins;
    });

    return {
      totalEntradas,
      totalSaidas,
      valorProdutoEntradas,
      valorProdutoSaidas,
      baseCalculoEntradas,
      baseCalculoSaidas,
      impostoTotal,
      pisTotal,
      cofinstotal,
      pisDebitoTotal,
      cofinsDebitoTotal,
      saldoPis: pisTotal - pisDebitoTotal,
      saldoCofins: cofinstotal - cofinsDebitoTotal,
      totalCount: pisCofinsRows.length
    };
  }, [pisCofinsRows]);

  // --------------------------------------------------------
  // Bilateral Cross-Audit filters
  // --------------------------------------------------------
  const filteredAuditItems = useMemo(() => {
    return auditItems.filter(item => {
      const matchesSearch = !auditSearchTerm ||
        item.nota.toString().includes(auditSearchTerm) ||
        (item.chaveDeAcesso && item.chaveDeAcesso.toLowerCase().includes(auditSearchTerm.toLowerCase())) ||
        (item.cliente && item.cliente.toLowerCase().includes(auditSearchTerm.toLowerCase()));

      let matchesStatus = true;
      if (auditFilterStatus !== 'all') {
        matchesStatus = item.status === auditFilterStatus;
      }

      return matchesSearch && matchesStatus;
    });
  }, [auditItems, auditSearchTerm, auditFilterStatus]);

  const sefazDuplicates = useMemo(() => {
    if (!sefazRows || sefazRows.length === 0) return [];
    const counts = new Map<string, InvoiceRow[]>();
    sefazRows.forEach(row => {
      const key = row.chaveDeAcesso && row.chaveDeAcesso.trim() !== ''
        ? row.chaveDeAcesso.trim()
        : `NOTA_${row.numeroNota}_SERIE_${row.serie}`;
      if (!counts.has(key)) {
        counts.set(key, []);
      }
      counts.get(key)!.push(row);
    });

    const dupList: Array<{ key: string; numeroNota: string; serie: string; rows: InvoiceRow[]; count: number }> = [];
    counts.forEach((rows, key) => {
      if (rows.length > 1) {
        dupList.push({
          key,
          numeroNota: rows[0].numeroNota,
          serie: rows[0].serie,
          rows,
          count: rows.length
        });
      }
    });
    return dupList;
  }, [sefazRows]);

  // --------------------------------------------------------
  // Exporting functions
  // --------------------------------------------------------
  const handleExportAuditExcelUnified = () => {
    if (!auditSummary) return;
    exportAuditExcel(sefazRows, auditItems, auditSummary, 'Auditoria_DataLake_Moreira_Lima');
  };

  // Highly customized Siga Tax Sheet export containing the 10 requested fields
  const handleExportSigaTaxExcel = () => {
    if (organizadorEntradas.length === 0 && organizadorSaidas.length === 0) return;
    exportSigaAuditExcel({
      entradas: organizadorEntradas,
      saidas: organizadorSaidas,
      metadata: organizadorMetadata
    });
  };

  const generateIcmsItemsFromSefaz = (rows: InvoiceRow[]): ErpIcmsReportItem[] => {
    return rows.map((s, idx) => ({
      id: `sefaz-gen-${idx}`,
      tipoOperacao: 'SAIDA',
      notaFiscal: s.numeroNota,
      serie: s.serie || '1',
      modelo: s.modelo || '55',
      dataEmissao: s.dataEmissao,
      cnpjEmitente: s.cnpjFormatado || s.cnpjFornecedorFormatado || '',
      razaoSocialEmitente: s.nomeFornecedor || 'EMITENTE SEFAZ',
      uf: s.ufNome || 'SP',
      cfop: '5.102',
      produto: `NOTA FISCAL DE VENDA Nº ${s.numeroNota}`,
      ncm: '00000000',
      unidade: 'UN',
      quantidade: 1,
      valorUnitario: s.valorDecimal,
      valorProduto: s.valorDecimal,
      desconto: 0,
      valorContabil: s.valorDecimal,
      cstIcms: '000',
      baseCalculoIcms: s.valorDecimal,
      aliquotaIcms: 18,
      valorIcms: s.valorIcms || s.valorDecimal * 0.18,
      aliquotaIpi: 0,
      valorIpi: 0,
      valorIsentoIcms: 0,
      valorOutrosIcms: 0,
      chaveDeAcesso: s.chaveDeAcesso,
      isValidChave: s.isValidChave,
      icmsRecalculated: s.valorDecimal * 0.18,
      icmsDivergence: 0,
      hasDivergence: false,
      statusAudit: 'OK',
      deduplicationKey: `SEFAZ_GEN_${s.numeroNota}`,
      isDuplicate: false
    }));
  };

  const exportFormattedIcmsExcel = (itemsToExport: ErpIcmsReportItem[]) => {
    const list = itemsToExport && itemsToExport.length > 0 
      ? itemsToExport 
      : (effectiveIcmsItems.length > 0 ? effectiveIcmsItems : generateIcmsItemsFromSefaz(sefazRows));

    if (!list || list.length === 0) return;

    const wb = XLSX.utils.book_new();

    const productSubtitle = selectedIcmsProductKeys.length === 1
      ? ` - PRODUTO: ${availableIcmsProducts.find(p => p.key === selectedIcmsProductKeys[0])?.displayName || selectedIcmsProductKeys[0]}`
      : selectedIcmsProductKeys.length > 1
      ? ` - (${selectedIcmsProductKeys.length} PRODUTOS SELECIONADOS)`
      : '';

    const styleHeaderTitle = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 14, bold: true, color: { rgb: "E4B35E" } },
      alignment: { horizontal: "center", vertical: "center" }
    };
    const styleHeaderSub = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const styleTableHeader = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const getRowStyle = (isEven: boolean, align: 'left' | 'center' | 'right' = 'left') => ({
      fill: { fgColor: { rgb: isEven ? "FFFFFF" : "F8FAFC" } },
      font: { name: "Arial", sz: 9, color: { rgb: "1E293B" } },
      alignment: { horizontal: align, vertical: "center" },
      border: {
        bottom: { style: "thin", color: { rgb: "E2E8F0" } }
      }
    });

    const createCompletoSheet = (sheetTitle: string, items: ErpIcmsReportItem[]) => {
      const sortedItems = [...items].sort((a, b) => {
        const descA = a.descricaoProduto || splitProductCodeAndDesc(a.produto).descricao || a.produto || '';
        const descB = b.descricaoProduto || splitProductCodeAndDesc(b.produto).descricao || b.produto || '';
        return descA.localeCompare(descB, 'pt-BR', { sensitivity: 'base' });
      });

      const ws: any = {};
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 20 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 20 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 20 } }
      ];

      ws['A1'] = { v: BRAND_CONFIG.COMPANY_NAME, s: styleHeaderTitle };
      ws['A2'] = { v: `RELATÓRIO DE MOVIMENTAÇÃO DE ICMS POR PRODUTO - ${sheetTitle.toUpperCase()}${productSubtitle}`, s: styleHeaderSub };
      ws['A3'] = { v: `EXPORTADO EM: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`, s: styleHeaderSub };

      const headers = [
        'Tipo Op.',
        'Nota Fiscal',
        'Data Emissão',
        'CNPJ / CPF',
        'PF / PJ',
        'CFOP',
        'Código do Produto',
        'Descrição do Produto',
        'NCM',
        'UN',
        'Quantidade',
        'R$ Unitário',
        'R$ Produto',
        'Desconto R$',
        'Valor Contábil R$',
        'CST ICMS',
        'R$ Base ICMS',
        '% ICMS',
        'R$ ICMS Declarado',
        '% IPI',
        'R$ IPI'
      ];

      headers.forEach((h, colIdx) => {
        const cellRef = XLSX.utils.encode_cell({ r: 4, c: colIdx });
        ws[cellRef] = { v: h, s: styleTableHeader };
      });

      sortedItems.forEach((item, rowIdx) => {
        const r = 5 + rowIdx;
        const isEven = rowIdx % 2 === 0;

        const cleanDocDigits = (item.cnpjEmitente || '').replace(/\D/g, '');
        const tipoPessoa = cleanDocDigits.length === 11 ? 'PF' : cleanDocDigits.length === 14 ? 'PJ' : '';
        const { codigo: splitCod, descricao: splitDesc } = splitProductCodeAndDesc(item.produto);
        const codigoProd = item.codigoProduto || splitCod || '';
        const descProd = item.descricaoProduto || splitDesc || item.produto || '';

        ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: item.tipoOperacao || 'SAIDA', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: item.notaFiscal, s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 2 })] = { v: item.dataEmissao, s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 3 })] = { v: formatCnpjCpf(item.cnpjEmitente), s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: tipoPessoa, s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: item.cfop, s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 6 })] = { v: codigoProd, s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 7 })] = { v: descProd, s: getRowStyle(isEven, 'left') };
        ws[XLSX.utils.encode_cell({ r, c: 8 })] = { v: item.ncm, s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 9 })] = { v: item.unidade, s: getRowStyle(isEven, 'center') };
        
        ws[XLSX.utils.encode_cell({ r, c: 10 })] = { v: item.quantidade || 0, t: 'n', z: '#,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 11 })] = { v: item.valorUnitario || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 12 })] = { v: item.valorProduto || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 13 })] = { v: item.desconto || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 14 })] = { v: item.valorContabil || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 15 })] = { v: item.cstIcms || '', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 16 })] = { v: item.baseCalculoIcms || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 17 })] = { v: (item.aliquotaIcms || 0) / 100, t: 'n', z: '0.00%', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 18 })] = { v: item.valorIcms || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 19 })] = { v: (item.aliquotaIpi || 0) / 100, t: 'n', z: '0.00%', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 20 })] = { v: item.valorIpi || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
      });

      const maxRow = 5 + sortedItems.length;
      ws['!ref'] = `A1:U${maxRow}`;

      ws['!cols'] = [
        { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 45 },
        { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
        { wch: 18 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 10 },
        { wch: 18 }
      ];

      return ws;
    };

    const createResumoSheet = (sheetTitle: string, items: ErpIcmsReportItem[]) => {
      const aggregated = aggregateIcmsItems(items);
      const ws: any = {};
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 15 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 15 } }
      ];

      ws['A1'] = { v: BRAND_CONFIG.COMPANY_NAME, s: styleHeaderTitle };
      ws['A2'] = { v: `RESUMO DE ICMS POR PRODUTO, CFOP E CST - ${sheetTitle.toUpperCase()}${productSubtitle}`, s: styleHeaderSub };
      ws['A3'] = { v: `EXPORTADO EM: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`, s: styleHeaderSub };

      const headers = [
        'CFOP',
        'Código do Produto',
        'Descrição do Produto',
        'NCM',
        'UN',
        'Quantidade',
        'R$ Unitário',
        'R$ Produto',
        'Desconto R$',
        'Valor Contábil R$',
        'CST ICMS',
        'R$ Base ICMS',
        '% ICMS',
        'R$ ICMS Declarado',
        '% IPI',
        'R$ IPI'
      ];

      headers.forEach((h, colIdx) => {
        const cellRef = XLSX.utils.encode_cell({ r: 4, c: colIdx });
        ws[cellRef] = { v: h, s: styleTableHeader };
      });

      aggregated.forEach((item, rowIdx) => {
        const r = 5 + rowIdx;
        const isEven = rowIdx % 2 === 0;
        const { codigo: splitCod, descricao: splitDesc } = splitProductCodeAndDesc(item.produto);
        const codigoProd = item.codigoProduto || splitCod || '';
        const descProd = item.descricaoProduto || splitDesc || item.produto || '';

        ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: item.cfop, s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: codigoProd, s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 2 })] = { v: descProd, s: getRowStyle(isEven, 'left') };
        ws[XLSX.utils.encode_cell({ r, c: 3 })] = { v: item.ncm, s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: item.unidade, s: getRowStyle(isEven, 'center') };
        
        ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: item.quantidade || 0, t: 'n', z: '#,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 6 })] = { v: item.valorUnitario || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 7 })] = { v: item.valorProduto || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 8 })] = { v: item.desconto || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 9 })] = { v: item.valorContabil || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 10 })] = { v: item.cstIcms || '', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 11 })] = { v: item.baseCalculoIcms || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 12 })] = { v: (item.aliquotaIcms || 0) / 100, t: 'n', z: '0.00%', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 13 })] = { v: item.valorIcms || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 14 })] = { v: (item.aliquotaIpi || 0) / 100, t: 'n', z: '0.00%', s: getRowStyle(isEven, 'center') };
        ws[XLSX.utils.encode_cell({ r, c: 15 })] = { v: item.valorIpi || 0, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'center') };
      });

      const maxRow = 5 + aggregated.length;
      ws['!ref'] = `A1:P${maxRow}`;
      ws['!cols'] = [
        { wch: 10 }, { wch: 18 }, { wch: 48 }, { wch: 12 }, { wch: 8 }, { wch: 14 },
        { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 10 },
        { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 18 }
      ];

      return ws;
    };

    const entradas = list
      .filter(i => 
        i.tipoOperacao === 'ENTRADA' || 
        (i.cfop && (i.cfop.startsWith('1') || i.cfop.startsWith('2') || i.cfop.startsWith('3')))
      )
      .slice()
      .sort((a, b) => {
        const descA = a.descricaoProduto || splitProductCodeAndDesc(a.produto).descricao || a.produto || '';
        const descB = b.descricaoProduto || splitProductCodeAndDesc(b.produto).descricao || b.produto || '';
        return descA.localeCompare(descB, 'pt-BR', { sensitivity: 'base' });
      });

    const saidas = list
      .filter(i => 
        i.tipoOperacao === 'SAIDA' || 
        (i.cfop && (i.cfop.startsWith('5') || i.cfop.startsWith('6') || i.cfop.startsWith('7')))
      )
      .slice()
      .sort((a, b) => {
        const descA = a.descricaoProduto || splitProductCodeAndDesc(a.produto).descricao || a.produto || '';
        const descB = b.descricaoProduto || splitProductCodeAndDesc(b.produto).descricao || b.produto || '';
        return descA.localeCompare(descB, 'pt-BR', { sensitivity: 'base' });
      });

    // 1. Entradas completo
    XLSX.utils.book_append_sheet(wb, createCompletoSheet('Entradas Completo', entradas), 'Entradas completo');
    // 2. Entradas resumo
    XLSX.utils.book_append_sheet(wb, createResumoSheet('Entradas Resumo', entradas), 'Entradas resumo');
    // 3. Saídas completo
    XLSX.utils.book_append_sheet(wb, createCompletoSheet('Saídas Completo', saidas), 'Saídas completo');
    // 4. Saídas resumo
    XLSX.utils.book_append_sheet(wb, createResumoSheet('Saídas Resumo', saidas), 'Saídas resumo');
    let excelFileName = `Relatorio_ICMS_4_Abas_${Date.now()}.xlsx`;
    if (selectedIcmsProductKeys.length === 1) {
      const singleProd = availableIcmsProducts.find(p => p.key === selectedIcmsProductKeys[0]);
      const safeCodeOrDesc = (singleProd?.codigo || singleProd?.descricao || 'Produto').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
      excelFileName = `Relatorio_ICMS_Produto_${safeCodeOrDesc}_${Date.now()}.xlsx`;
    } else if (selectedIcmsProductKeys.length > 1) {
      excelFileName = `Relatorio_ICMS_${selectedIcmsProductKeys.length}_Produtos_${Date.now()}.xlsx`;
    }
    XLSX.writeFile(wb, excelFileName);
  };

  const exportIcmsAuditExcel = (list: ErpIcmsReportItem[]) => {
    if (!list || list.length === 0) return;

    const wb = XLSX.utils.book_new();

    const styleHeaderTitle = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 14, bold: true, color: { rgb: "E4B35E" } },
      alignment: { horizontal: "center", vertical: "center" }
    };
    const styleHeaderSub = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const styleTableHeader = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const getRowStyle = (isEven: boolean, align: 'left' | 'center' | 'right' = 'left', isError = false) => ({
      fill: { fgColor: { rgb: isError ? "FEE2E2" : (isEven ? "FFFFFF" : "F8FAFC") } },
      font: { name: "Arial", sz: 9, color: { rgb: isError ? "991B1B" : "1E293B" }, bold: isError },
      alignment: { horizontal: align, vertical: "center" },
      border: {
        bottom: { style: "thin", color: { rgb: "E2E8F0" } }
      }
    });

    const createAuditSheet = (title: string, items: ErpIcmsReportItem[]) => {
      const sortedItems = [...items].sort((a, b) => {
        const descA = a.descricaoProduto || splitProductCodeAndDesc(a.produto).descricao || a.produto || '';
        const descB = b.descricaoProduto || splitProductCodeAndDesc(b.produto).descricao || b.produto || '';
        return descA.localeCompare(descB, 'pt-BR', { sensitivity: 'base' });
      });

      const ws: any = {};
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 12 } }
      ];

      ws['A1'] = { v: BRAND_CONFIG.COMPANY_NAME, s: styleHeaderTitle };
      ws['A2'] = { v: `AUDITORIA FISCAL ICMS - ${title.toUpperCase()}`, s: styleHeaderSub };
      ws['A3'] = { v: `Data do Diagnóstico: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, s: styleHeaderSub };

      const headers = [
        'NF',
        'Data',
        'CNPJ / CPF Emitente',
        'CFOP',
        'Código do Produto',
        'Descrição do Produto',
        'R$ Contábil',
        'CST',
        'R$ Base ICMS',
        '% ICMS',
        'R$ ICMS Declarado',
        'Status Auditoria',
        'Diagnóstico / Inconsistência'
      ];

      headers.forEach((h, colIdx) => {
        const cellRef = XLSX.utils.encode_cell({ r: 4, c: colIdx });
        ws[cellRef] = { v: h, s: styleTableHeader };
      });

      sortedItems.forEach((item, rowIdx) => {
        const r = 5 + rowIdx;
        const isEven = rowIdx % 2 === 0;

        const expectedIcms = (item.baseCalculoIcms * (item.aliquotaIcms || 0)) / 100;
        const diff = Math.abs(item.valorIcms - expectedIcms);
        let status = 'CONFORME';
        let diag = 'Sem inconsistências detectadas';
        let isError = false;

        if (diff > 0.05) {
          status = 'DIVERGÊNCIA ICMS';
          diag = `ICMS Declarado (R$ ${item.valorIcms.toFixed(2)}) difere do Calculado (R$ ${expectedIcms.toFixed(2)})`;
          isError = true;
        } else if (item.baseCalculoIcms === 0 && item.valorIcms > 0) {
          status = 'BASE ZERADA COM ICMS';
          diag = 'Base de cálculo é R$ 0,00 porém há valor de ICMS destacado';
          isError = true;
        } else if (item.baseCalculoIcms > item.valorContabil && item.valorContabil > 0) {
          status = 'BASE MAIOR QUE CONTÁBIL';
          diag = 'Base de cálculo do ICMS é maior que o valor contábil do item';
          isError = true;
        }

        const { codigo: splitCod, descricao: splitDesc } = splitProductCodeAndDesc(item.produto);
        const codigoProd = item.codigoProduto || splitCod || '';
        const descProd = item.descricaoProduto || splitDesc || item.produto || '';

        ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: item.notaFiscal, s: getRowStyle(isEven, 'center', isError) };
        ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: item.dataEmissao, s: getRowStyle(isEven, 'center', isError) };
        ws[XLSX.utils.encode_cell({ r, c: 2 })] = { v: formatCnpjCpf(item.cnpjEmitente), s: getRowStyle(isEven, 'center', isError) };
        ws[XLSX.utils.encode_cell({ r, c: 3 })] = { v: item.cfop, s: getRowStyle(isEven, 'center', isError) };
        ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: codigoProd, s: getRowStyle(isEven, 'center', isError) };
        ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: descProd, s: getRowStyle(isEven, 'left', isError) };
        ws[XLSX.utils.encode_cell({ r, c: 6 })] = { v: item.valorContabil, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'right', isError) };
        ws[XLSX.utils.encode_cell({ r, c: 7 })] = { v: item.cstIcms, s: getRowStyle(isEven, 'center', isError) };
        ws[XLSX.utils.encode_cell({ r, c: 8 })] = { v: item.baseCalculoIcms, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'right', isError) };
        ws[XLSX.utils.encode_cell({ r, c: 9 })] = { v: (item.aliquotaIcms || 0) / 100, t: 'n', z: '0.00%', s: getRowStyle(isEven, 'right', isError) };
        ws[XLSX.utils.encode_cell({ r, c: 10 })] = { v: item.valorIcms, t: 'n', z: '"R$ " #,##0.00', s: getRowStyle(isEven, 'right', isError) };
        ws[XLSX.utils.encode_cell({ r, c: 11 })] = { v: status, s: getRowStyle(isEven, 'center', isError) };
        ws[XLSX.utils.encode_cell({ r, c: 12 })] = { v: diag, s: getRowStyle(isEven, 'left', isError) };
      });

      const maxRow = 5 + sortedItems.length;
      ws['!ref'] = `A1:M${maxRow}`;
      ws['!cols'] = [
        { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 45 },
        { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 16 },
        { wch: 22 }, { wch: 55 }
      ];

      return ws;
    };

    const entradas = list
      .filter(i => 
        i.tipoOperacao === 'ENTRADA' || 
        (i.cfop && (i.cfop.startsWith('1') || i.cfop.startsWith('2') || i.cfop.startsWith('3')))
      )
      .slice()
      .sort((a, b) => {
        const descA = a.descricaoProduto || splitProductCodeAndDesc(a.produto).descricao || a.produto || '';
        const descB = b.descricaoProduto || splitProductCodeAndDesc(b.produto).descricao || b.produto || '';
        return descA.localeCompare(descB, 'pt-BR', { sensitivity: 'base' });
      });

    const saidas = list
      .filter(i => 
        i.tipoOperacao === 'SAIDA' || 
        (i.cfop && (i.cfop.startsWith('5') || i.cfop.startsWith('6') || i.cfop.startsWith('7')))
      )
      .slice()
      .sort((a, b) => {
        const descA = a.descricaoProduto || splitProductCodeAndDesc(a.produto).descricao || a.produto || '';
        const descB = b.descricaoProduto || splitProductCodeAndDesc(b.produto).descricao || b.produto || '';
        return descA.localeCompare(descB, 'pt-BR', { sensitivity: 'base' });
      });

    XLSX.utils.book_append_sheet(wb, createAuditSheet('Auditoria Entradas', entradas), 'Auditoria Entradas');
    XLSX.utils.book_append_sheet(wb, createAuditSheet('Auditoria Saídas', saidas), 'Auditoria Saídas');

    XLSX.writeFile(wb, `Auditoria_ICMS_${Date.now()}.xlsx`);
  };

  const handleExportConversorExcel = () => {
    if (sefazRows.length === 0) return;

    const wb = XLSX.utils.book_new();

    // Style elements matching our brand identity (Navy Blue / Gold)
    const styleHeaderTitle = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 14, bold: true, color: { rgb: "E4B35E" } },
      alignment: { horizontal: "center", vertical: "center" }
    };
    const styleHeaderSub = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const styleTableHeader = {
      fill: { fgColor: { rgb: "04243B" } },
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const getRowStyle = (isEven: boolean, align: 'left' | 'center' | 'right' = 'left') => ({
      fill: { fgColor: { rgb: isEven ? "FFFFFF" : "F8FAFC" } },
      font: { name: "Arial", sz: 9, color: { rgb: "1E293B" } },
      alignment: { horizontal: align, vertical: "center" },
      border: {
        bottom: { style: "thin", color: { rgb: "E2E8F0" } }
      }
    });

    const ws: any = {};
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } }
    ];

    // Titles
    ws['A1'] = { v: BRAND_CONFIG.COMPANY_NAME, s: styleHeaderTitle };
    ws['A2'] = { v: `CONVERSOR DE CHAVES DE ACESSO - RELATÓRIO DE NOTAS FISCAIS`, s: styleHeaderSub };
    ws['A3'] = { v: `EXPORTADO EM: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`, s: styleHeaderSub };

    const headers = [
      'Chave de Acesso',
      'Número Nota',
      'Data da Emissão',
      'CPF/CNPJ Fornecedor',
      'Nome/Razão Social Fornecedor',
      'Série',
      'UF',
      'Valor da NF-e',
      'ICMS Destacado',
      'Situação NF-e'
    ];

    headers.forEach((h, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: 4, c: colIdx });
      ws[cellRef] = { v: h, s: styleTableHeader };
    });

    const rowsToExport = nfceFilteredRows.length > 0 ? nfceFilteredRows : sefazRows;

    rowsToExport.forEach((item, rowIdx) => {
      const r = 5 + rowIdx;
      const isEven = rowIdx % 2 === 0;

      // 1. Chave de Acesso
      ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: item.chaveDeAcesso, s: getRowStyle(isEven, 'left') };

      // 2. Número Nota
      ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: item.numeroNotaFormatado, s: getRowStyle(isEven, 'center') };

      // 3. Data da Emissão
      ws[XLSX.utils.encode_cell({ r, c: 2 })] = { v: item.dataEmissao, s: getRowStyle(isEven, 'center') };

      // 4. CPF/CNPJ Fornecedor
      ws[XLSX.utils.encode_cell({ r, c: 3 })] = { v: item.cnpjFornecedorFormatado || item.cnpjFormatado, s: getRowStyle(isEven, 'center') };

      // 5. Nome/Razão Social Fornecedor
      ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: item.nomeFornecedor || 'FORNECEDOR NÃO INFORMADO', s: getRowStyle(isEven, 'left') };

      // 6. Série
      ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: item.serie, s: getRowStyle(isEven, 'center') };

      // 7. UF
      const ufClean = item.ufNome.includes('(') 
        ? item.ufNome.substring(item.ufNome.indexOf('(') + 1, item.ufNome.indexOf(')')) 
        : item.ufNome;
      ws[XLSX.utils.encode_cell({ r, c: 6 })] = { v: ufClean, s: getRowStyle(isEven, 'center') };

      // 8. Valor da NF-e
      ws[XLSX.utils.encode_cell({ r, c: 7 })] = { 
        v: item.valorDecimal, 
        t: 'n', 
        z: '"R$ " #,##0.00', 
        s: getRowStyle(isEven, 'right') 
      };

      // 9. ICMS Destacado
      ws[XLSX.utils.encode_cell({ r, c: 8 })] = { 
        v: item.valorIcms || 0, 
        t: 'n', 
        z: '"R$ " #,##0.00', 
        s: getRowStyle(isEven, 'right') 
      };

      // 10. Situação NF-e
      ws[XLSX.utils.encode_cell({ r, c: 9 })] = { v: item.situacaoNfe || 'AUTORIZADA', s: getRowStyle(isEven, 'center') };
    });

    const maxRow = 5 + rowsToExport.length;
    ws['!ref'] = `A1:J${maxRow}`;
    
    // Auto-fit or professional column widths
    ws['!cols'] = [
      { wch: 48 }, // Chave de Acesso
      { wch: 15 }, // Número Nota
      { wch: 15 }, // Data da Emissão
      { wch: 22 }, // CPF/CNPJ Fornecedor
      { wch: 45 }, // Nome/Razão Social Fornecedor
      { wch: 10 }, // Série
      { wch: 10 }, // UF
      { wch: 18 }, // Valor da NF-e
      { wch: 18 }, // ICMS Destacado
      { wch: 18 }, // Situação NF-e
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Relatório Chaves');
    XLSX.writeFile(wb, `Chaves_Acesso_SEFAZ_Formatado_${Date.now()}.xlsx`);
  };

  const handleExportPisCofinsExcel = () => {
    if (pisCofinsRows.length === 0 || !pisCofinsMetadata) return;
    const consolidated = consolidatePisCofinsRows(pisCofinsRows, pisCofinsCriteria);
    exportPisCofinsExcel(pisCofinsRows, consolidated, pisCofinsMetadata, pisCofinsCriteria);
  };

  const sefazFile = loadedFiles.find(f => f.type === 'sefaz');
  const erpFile = loadedFiles.find(f => f.type === 'erp' || f.type === 'siga_tax');

  return (
    <div 
      className="space-y-3 relative min-h-[500px]" 
      id="auditoria-fiscal-workspace"
    >
      {/* 1. TOP TITLE BANNER */}
      <div className="bg-[#04243b] rounded-3xl p-6 text-white relative overflow-hidden shadow-md border border-[#e4b35e]/15 animate-fadeIn">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-gradient-to-br from-[#e4b35e]/10 to-transparent rounded-full blur-2xl" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white uppercase font-sans">
              Módulo de Auditoria e Gestão Fiscal
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleClearDataLake}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white font-extrabold text-xs tracking-wider uppercase transition-all border border-slate-700 cursor-pointer flex items-center gap-2"
              title="Limpar todos os dados carregados"
            >
              <RefreshCw className="w-4 h-4" />
              Limpar Tudo
            </button>
          </div>
        </div>
      </div>

      {/* 2. SUBDIVISIONS SUB-BLOCKS GRID ON INITIAL VIEW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Module 1: SIGA */}
        <button
          onClick={() => {
            setActiveMainModule('siga');
            setActiveOutputTab('organizador');
          }}
          className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3 cursor-pointer ${
            activeMainModule === 'siga'
              ? 'bg-gradient-to-br from-[#04243b] to-[#083454] border-[#e4b35e] text-white shadow-md ring-2 ring-[#e4b35e]/30'
              : 'bg-white border-slate-200 text-[#04243b] hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
          }`}
        >
          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 pointer-events-none">
            <FileSpreadsheet className="w-24 h-24 text-white" />
          </div>
          
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] uppercase font-black px-2.5 py-0.5 rounded-full ${
                activeMainModule === 'siga' ? 'bg-[#e4b35e]/10 text-[#e4b35e]' : 'bg-slate-100 text-slate-500'
              }`}>
                Módulo 1
              </span>
              <FileSpreadsheet className={`w-4.5 h-4.5 ${activeMainModule === 'siga' ? 'text-[#e4b35e]' : 'text-slate-400'}`} />
            </div>
            <h3 className="font-extrabold text-sm tracking-tight leading-snug">
              Módulo 1: Auditor de relatórios SIGA
            </h3>
          </div>

          <div className="border-t border-dashed border-slate-200/20 pt-2 w-full flex items-center justify-between text-[10px] font-bold">
            <span className={activeMainModule === 'siga' ? 'text-[#e4b35e]' : 'text-slate-500'}>
              {organizadorEntradas.length > 0 || organizadorSaidas.length > 0 ? '✓ Ativo & Analisado' : '⚡ Toque para carregar'}
            </span>
          </div>
        </button>

        {/* Module 2: ICMS */}
        <button
          onClick={() => {
            setActiveMainModule('icms');
            setActiveOutputTab('confronto');
          }}
          className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3 cursor-pointer ${
            activeMainModule === 'icms'
              ? 'bg-gradient-to-br from-[#04243b] to-[#083454] border-[#e4b35e] text-white shadow-md ring-2 ring-[#e4b35e]/30'
              : 'bg-white border-slate-200 text-[#04243b] hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
          }`}
        >
          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 pointer-events-none">
            <Table className="w-24 h-24 text-white" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] uppercase font-black px-2.5 py-0.5 rounded-full ${
                activeMainModule === 'icms' ? 'bg-[#e4b35e]/10 text-[#e4b35e]' : 'bg-slate-100 text-slate-500'
              }`}>
                Módulo 2
              </span>
              <Table className={`w-4.5 h-4.5 ${activeMainModule === 'icms' ? 'text-[#e4b35e]' : 'text-slate-400'}`} />
            </div>
            <h3 className="font-extrabold text-sm tracking-tight leading-snug">
              Módulo 2: Auditor de relatórios ICMS
            </h3>
          </div>

          <div className="border-t border-dashed border-slate-200/20 pt-2 w-full flex items-center justify-between text-[10px] font-bold">
            <span className={activeMainModule === 'icms' ? 'text-[#e4b35e]' : 'text-slate-500'}>
              {auditSummary ? '✓ Confronto executado' : '⚡ Toque para carregar'}
            </span>
          </div>
        </button>

        {/* Module 3: PIS & COFINS */}
        <button
          onClick={() => {
            setActiveMainModule('pis_cofins');
            setActiveOutputTab('pis_cofins');
          }}
          className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3 cursor-pointer ${
            activeMainModule === 'pis_cofins'
              ? 'bg-gradient-to-br from-[#04243b] to-[#083454] border-[#e4b35e] text-white shadow-md ring-2 ring-[#e4b35e]/30'
              : 'bg-white border-slate-200 text-[#04243b] hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
          }`}
        >
          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5 pointer-events-none">
            <Coins className="w-24 h-24 text-white" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] uppercase font-black px-2.5 py-0.5 rounded-full ${
                activeMainModule === 'pis_cofins' ? 'bg-[#e4b35e]/10 text-[#e4b35e]' : 'bg-slate-100 text-slate-500'
              }`}>
                Módulo 3
              </span>
              <Coins className={`w-4.5 h-4.5 ${activeMainModule === 'pis_cofins' ? 'text-[#e4b35e]' : 'text-slate-400'}`} />
            </div>
            <h3 className="font-extrabold text-sm tracking-tight leading-snug">
              Módulo 3: Auditor de relatórios PIS & COFINS
            </h3>
          </div>

          <div className="border-t border-dashed border-slate-200/20 pt-2 w-full flex items-center justify-between text-[10px] font-bold">
            <span className={activeMainModule === 'pis_cofins' ? 'text-[#e4b35e]' : 'text-slate-500'}>
              {pisCofinsRows.length > 0 ? '✓ Auditoria ativa' : '⚡ Toque para carregar'}
            </span>
          </div>
        </button>
      </div>

      {/* 3. THE INGESTION & COCKPIT SECTION (TAILORED PER MAIN MODULE) */}
      {activeMainModule === 'siga' ? (
        /* ======================================================== */
        /* MÓDULO 01: CANAIS DE IMPORTAÇÃO (ORIGEM COMO FILTRO)     */
        /* ======================================================== */
        <div className="space-y-6 animate-fadeIn">
          {/* 2 Canal Import Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* DOCUMENTOS RECEBIDOS (ENTRADAS) */}
            <div className="bg-white rounded-2xl p-5 border border-emerald-200/80 shadow-2xs space-y-4 flex flex-col justify-between hover:border-emerald-400 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-900 text-white rounded-xl shadow-xs">
                      <ArrowDownLeft className="w-5 h-5 text-emerald-300" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-[#04243b] uppercase tracking-tight">Documentos Recebidos (Entradas)</h3>
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => fileInputCanalARef.current?.click()}
                  onDragOver={handleCanalADragOver}
                  onDragEnter={handleCanalADragEnter}
                  onDragLeave={handleCanalADragLeave}
                  onDrop={handleCanalADrop}
                  className={`block border-2 border-dashed ${
                    isDragOverCanalA
                      ? 'border-emerald-600 bg-emerald-100/90 scale-[1.01] shadow-xs'
                      : 'border-emerald-200 hover:border-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/60'
                  } p-5 rounded-xl text-center cursor-pointer transition-all select-none`}
                >
                  <input
                    ref={fileInputCanalARef}
                    type="file"
                    accept=".txt,.csv,.tsv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportSigaChannelFile(file, 'ENTRADA');
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <div className="pointer-events-none">
                    <div className="w-9 h-9 rounded-xl bg-emerald-900 text-white flex items-center justify-center mx-auto mb-2 shadow-xs">
                      <Upload className="w-4.5 h-4.5 text-emerald-300" />
                    </div>
                    <span className="text-xs font-black text-[#04243b] uppercase block">Importar Arquivo de Recebidos (Entradas)</span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Clique ou arraste o relatório TXT/CSV (SIGA/SEFAZ)</span>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">Total de Entradas Ingestadas:</span>
                {organizadorEntradas.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-emerald-950 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
                      {organizadorEntradas.length} NFs (R$ {organizadorEntradas.reduce((acc, i) => acc + (i.vlrContabil || i.rProduto || i.rBaseIcms || (i as any).valor || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                    </span>
                    <button
                      onClick={() => setOrganizadorEntradas([])}
                      className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                      title="Limpar Entradas"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-slate-400 italic text-[11px]">Nenhum arquivo importado</span>
                )}
              </div>
            </div>

            {/* DOCUMENTOS EMITIDOS (SAÍDAS) */}
            <div className="bg-white rounded-2xl p-5 border border-blue-200/80 shadow-2xs space-y-4 flex flex-col justify-between hover:border-blue-400 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-blue-900 text-white rounded-xl shadow-xs">
                      <ArrowUpRight className="w-5 h-5 text-[#e4b35e]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-[#04243b] uppercase tracking-tight">Documentos Emitidos (Saídas)</h3>
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => fileInputCanalBRef.current?.click()}
                  onDragOver={handleCanalBDragOver}
                  onDragEnter={handleCanalBDragEnter}
                  onDragLeave={handleCanalBDragLeave}
                  onDrop={handleCanalBDrop}
                  className={`block border-2 border-dashed ${
                    isDragOverCanalB
                      ? 'border-blue-600 bg-blue-100/90 scale-[1.01] shadow-xs'
                      : 'border-blue-200 hover:border-blue-500 bg-blue-50/20 hover:bg-blue-50/60'
                  } p-5 rounded-xl text-center cursor-pointer transition-all select-none`}
                >
                  <input
                    ref={fileInputCanalBRef}
                    type="file"
                    accept=".txt,.csv,.tsv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportSigaChannelFile(file, 'SAIDA');
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <div className="pointer-events-none">
                    <div className="w-9 h-9 rounded-xl bg-blue-900 text-white flex items-center justify-center mx-auto mb-2 shadow-xs">
                      <Upload className="w-4.5 h-4.5 text-[#e4b35e]" />
                    </div>
                    <span className="text-xs font-black text-[#04243b] uppercase block">Importar Arquivo de Emitidos (Saídas)</span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Clique ou arraste o relatório TXT/CSV (SIGA/SEFAZ)</span>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">Total de Saídas Ingestadas:</span>
                {organizadorSaidas.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-blue-950 bg-blue-50 px-3 py-1 rounded-xl border border-blue-200">
                      {organizadorSaidas.length} NFs (R$ {organizadorSaidas.reduce((acc, i) => acc + (i.vlrContabil || i.rProduto || i.rBaseIcms || (i as any).valor || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                    </span>
                    <button
                      onClick={() => setOrganizadorSaidas([])}
                      className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                      title="Limpar Saídas"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-slate-400 italic text-[11px]">Nenhum arquivo importado</span>
                )}
              </div>
            </div>

          </div>

        </div>
      ) : (
        /* Data Lake Panel for ICMS and PIS/COFINS modules */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 animate-fadeIn">
          {/* Data Lake status & files panel */}
          <div 
            onDragOver={handleDataLakeDragOver}
            onDragEnter={handleDataLakeDragEnter}
            onDragLeave={handleDataLakeDragLeave}
            onDrop={handleDataLakeDrop}
            className={`bg-white p-3.5 px-4 rounded-2xl border transition-all duration-300 flex flex-col space-y-2.5 shadow-2xs relative lg:col-span-12 ${
              isDragOverDataLake
                ? 'border-2 border-dashed border-[#e4b35e] bg-amber-50/40 ring-4 ring-[#e4b35e]/20 scale-[1.005]'
                : 'border-slate-200'
            }`}
          >
            <input
              ref={dataLakeFileInputRef}
              type="file"
              multiple
              accept=".csv,.txt,.xlsx,.xls,.ret"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleProcessMultipleFiles(Array.from(e.target.files));
                  e.target.value = '';
                }
              }}
            />

            {activeMainModule === 'pis_cofins' ? (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-150 pb-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-[#e4b35e]" />
                    <h2 className="text-xs font-black text-[#04243b] uppercase tracking-tight font-sans">
                      Gestão de Dados & Relatórios PIS/COFINS
                    </h2>
                  </div>
                  <p className="text-[11px] text-slate-500 font-sans">
                    Gerencie os demonstrativos de apuração e acesse a central de auditoria de inconsistências.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => dataLakeFileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl bg-[#04243b] hover:bg-[#083454] text-[#e4b35e] text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Importar Arquivo</span>
                  </button>

                  {pisCofinsRows.length === 0 && (
                    <button
                      onClick={handleLoadSampleDatabase}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#04243b] font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      ⚡ Carregar Exemplo
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex-grow">
              {(() => {
                const filesToShow = loadedFiles.filter(f => {
                  if (activeMainModule === 'icms') return f.type === 'sefaz' || f.type === 'erp';
                  if (activeMainModule === 'pis_cofins') return f.type === 'pis_cofins';
                  return true;
                });

                if (filesToShow.length === 0) {
                  return (
                    <div 
                      onClick={() => dataLakeFileInputRef.current?.click()}
                      className={`flex flex-col items-center justify-center py-7 px-4 border-2 border-dashed rounded-2xl text-center transition-all cursor-pointer select-none ${
                        isDragOverDataLake
                          ? 'border-[#e4b35e] bg-amber-50/80 scale-[1.01] shadow-md'
                          : 'border-slate-200 hover:border-[#04243b] bg-slate-50/50 hover:bg-slate-100/50'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-2xl bg-[#04243b] text-[#e4b35e] flex items-center justify-center mb-2.5 shadow-xs">
                        <Upload className="w-5 h-5" />
                      </div>
                      {activeMainModule === 'icms' && (
                        <>
                          <h4 className="text-xs font-black text-[#04243b] uppercase tracking-wide font-sans">
                            Clique ou arraste os relatórios SEFAZ e ERP aqui
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-1 max-w-sm leading-relaxed font-sans">
                            Carregue a planilha SEFAZ (CSV/TXT) e o extrato do ERP (CSV/TXT) para realizar o confronto de notas.
                          </p>
                        </>
                      )}
                      {activeMainModule === 'pis_cofins' && (
                        <>
                          <h4 className="text-xs font-black text-[#04243b] uppercase tracking-wide font-sans">
                            Clique ou arraste os relatórios de PIS/COFINS aqui
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-1 max-w-sm leading-relaxed font-sans">
                            Importe o relatório de apuração de PIS/COFINS (CSV/TXT) para gerar os demonstrativos.
                          </p>
                        </>
                      )}
                      <span className="text-[10px] text-slate-400 mt-2 font-mono">Formatos aceitos: .csv, .txt, .xlsx, .xls</span>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                      {filesToShow.map((file, idx) => (
                        <div key={`file-dl-${idx}`} className="flex items-center justify-between p-1.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50/90 hover:bg-slate-100/80 transition-colors">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`p-1.5 rounded-md text-white font-extrabold shrink-0 ${
                              file.type === 'sefaz' ? 'bg-[#04243b]' : file.type === 'erp' ? 'bg-[#e4b35e]' : 'bg-indigo-600'
                            }`}>
                              <FileText className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-slate-700 text-[11px] block truncate" title={file.name}>
                                {file.name}
                              </span>
                              {file.type === 'pis_cofins' && pisCofinsMetadata?.empresa && (
                                <span className="text-[9px] text-indigo-700 font-bold block truncate">
                                  {pisCofinsMetadata.empresa} ({pisCofinsRows.length} reg)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {file.type === 'sefaz' && sefazDuplicates.length > 0 && (
                              <span className="text-[9px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse" title="Duplicidades detectadas no relatório">
                                <AlertTriangle className="w-2.5 h-2.5 text-red-600" />
                                DUPLICADO
                              </span>
                            )}
                            <button
                              onClick={() => handleDeleteFile(file.name, file.type)}
                              className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                              title="Remover arquivo"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 4. MULTI-MODULE OUTPUT AREA & TABS SELECTOR */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden" id="workspace-output-cockpit">
        
        {/* Quick Module-specific export actions header (if active) */}
        {(activeOutputTab === 'confronto' && auditSummary) ||
         (activeOutputTab === 'organizador' && (organizadorEntradas.length > 0 || organizadorSaidas.length > 0)) ||
         (activeOutputTab === 'auditoria_siga' && (organizadorEntradas.length > 0 || organizadorSaidas.length > 0)) ||
         (activeOutputTab === 'conversor_siga' && sefazRows.length > 0) ? (
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-end gap-3">
            <div className="flex gap-2">
              {activeOutputTab === 'confronto' && auditSummary && (
                <button
                  onClick={handleExportAuditExcelUnified}
                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-white" />
                  Exportar Confronto Excel
                </button>
              )}

              {activeOutputTab === 'organizador' && (organizadorEntradas.length > 0 || organizadorSaidas.length > 0) && (
                <button
                  onClick={handleExportSigaTaxExcel}
                  className="px-3.5 py-1.5 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-extrabold text-[11px] tracking-wide uppercase rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer border border-[#e4b35e]/30"
                >
                  <Download className="w-3.5 h-3.5 text-[#e4b35e]" />
                  Exportar Impostos Excel
                </button>
              )}

              {activeOutputTab === 'auditoria_siga' && (organizadorEntradas.length > 0 || organizadorSaidas.length > 0) && (
                <button
                  onClick={() => exportSigaAuditExcel({ entradas: organizadorEntradas, saidas: organizadorSaidas, metadata: organizadorMetadata })}
                  className="px-3.5 py-1.5 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-extrabold text-[11px] tracking-wide uppercase rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer border border-[#e4b35e]/30"
                >
                  <Download className="w-3.5 h-3.5 text-[#e4b35e]" />
                  Exportar Excel Sanitizado
                </button>
              )}

              {activeOutputTab === 'conversor_siga' && sefazRows.length > 0 && (
                <button
                  onClick={handleExportConversorExcel}
                  className="px-3.5 py-1.5 bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] font-extrabold text-[11px] tracking-wide uppercase rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer border border-[#e4b35e]/30"
                >
                  <Download className="w-3.5 h-3.5 text-[#e4b35e]" />
                  Exportar Notas Excel
                </button>
              )}
            </div>
          </div>
        ) : null}

        {/* Sub-Interface active views */}
        <div className="p-2 sm:p-3">
          
          {/* ======================================================== */}
          {/* MODULE 1: CONFRONTO BIDIRECIONAL SEFAZ vs ERP */}
          {/* ======================================================== */}
          {activeOutputTab === 'confronto' && (
            <div className="space-y-6">

              {/* Module 2 ICMS Navigation & Content Header */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-100 p-2 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIcmsMainTab('relatorio')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
                      icmsMainTab === 'relatorio'
                        ? 'bg-[#04243b] text-[#e4b35e] shadow-md'
                        : 'bg-white/60 text-slate-600 hover:bg-white hover:text-[#04243b]'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-[#e4b35e]" />
                    <span>1. Relatório</span>
                  </button>
                  <button
                    onClick={() => setIcmsMainTab('auditoria')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
                      icmsMainTab === 'auditoria'
                        ? 'bg-[#04243b] text-[#e4b35e] shadow-md'
                        : 'bg-white/60 text-slate-600 hover:bg-white hover:text-[#04243b]'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>2. Auditoria (Confronto SIGA / SEFAZ)</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 shrink-0 justify-end">
                  {icmsMainTab === 'relatorio' ? (
                    <button
                      onClick={() => exportFormattedIcmsExcel(effectiveIcmsItems)}
                      className="px-5 py-2.5 bg-[#e4b35e] hover:bg-[#d8a34a] text-[#04243b] font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer"
                      title={
                        selectedIcmsProductKeys.length === 1
                          ? `Exportar Relatório Excel exclusivo do produto selecionado`
                          : selectedIcmsProductKeys.length > 1
                          ? `Exportar Relatório Excel dos ${selectedIcmsProductKeys.length} produtos selecionados`
                          : "Exportar Relatório Formatado Excel (Todos os Produtos)"
                      }
                    >
                      <Download className="w-4 h-4" />
                      <span>
                        {selectedIcmsProductKeys.length === 1
                          ? `Exportar Excel (${availableIcmsProducts.find(p => p.key === selectedIcmsProductKeys[0])?.codigo || 'Produto'})`
                          : selectedIcmsProductKeys.length > 1
                          ? `Exportar Excel (${selectedIcmsProductKeys.length} Produtos)`
                          : 'Exportar Relatório Excel'}
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={handleExportSigaConfrontationExcel}
                      disabled={sigaSefazConfrontation.items.length === 0}
                      className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer border border-emerald-500/30"
                      title="Exportar Confronto SIGA / SEFAZ vs Sistema"
                    >
                      <Download className="w-4 h-4" />
                      <span>Exportar Inconsistências (Excel)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* VIEW 1: RELATÓRIO */}
              {erpIcmsItems.length > 0 && icmsMainTab === 'relatorio' && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs space-y-4 p-4">
                  {/* SELETOR DE PRODUTOS PARA GERAÇÃO DO RELATÓRIO */}
                  <div className="bg-slate-50/90 rounded-2xl border border-slate-200 p-3.5 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#04243b] text-[#e4b35e] flex items-center justify-center shrink-0 shadow-2xs">
                          <Package className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs font-black uppercase text-[#04243b] tracking-wider">
                              Seleção de Produto para o Relatório
                            </h4>
                            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                              selectedIcmsProductKeys.length === 0
                                ? 'bg-slate-200/80 text-slate-700 border-slate-300'
                                : 'bg-[#e4b35e]/25 text-[#04243b] border-[#e4b35e]'
                            }`}>
                              {selectedIcmsProductKeys.length === 0
                                ? `Todos os produtos (${availableIcmsProducts.length})`
                                : `${selectedIcmsProductKeys.length} produto(s) selecionado(s)`}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 font-sans">
                            Filtre por um ou mais produtos para gerar o relatório (ex: produto 15.221).
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setIsIcmsProductSelectorOpen(prev => !prev)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-2xs ${
                            isIcmsProductSelectorOpen
                              ? 'bg-[#04243b] text-[#e4b35e] ring-2 ring-[#e4b35e]/40'
                              : selectedIcmsProductKeys.length > 0
                              ? 'bg-[#04243b] text-white hover:bg-[#083454]'
                              : 'bg-white hover:bg-slate-100 text-[#04243b] border border-slate-200'
                          }`}
                        >
                          <Sliders className="w-3.5 h-3.5 text-[#e4b35e]" />
                          <span>{selectedIcmsProductKeys.length === 0 ? 'Selecionar Produto(s)' : `Alterar Seleção (${selectedIcmsProductKeys.length})`}</span>
                        </button>

                        {selectedIcmsProductKeys.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedIcmsProductKeys([]);
                              setIcmsCurrentPage(1);
                            }}
                            className="px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-red-50 text-slate-600 hover:text-red-700 border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="Gerar relatório com todos os produtos"
                          >
                            <X className="w-3.5 h-3.5 text-red-500" />
                            <span>Gerar Todos</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Chips com os produtos selecionados ativos */}
                    {selectedIcmsProductKeys.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/70">
                        <span className="text-[11px] font-bold text-slate-500 mr-1">Produtos no relatório:</span>
                        {selectedIcmsProductKeys.map(key => {
                          const prod = availableIcmsProducts.find(p => p.key === key);
                          return (
                            <span
                              key={key}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100/90 text-[#04243b] border border-amber-300 text-[11px] font-bold shadow-2xs"
                            >
                              {prod?.codigo ? (
                                <span className="font-mono bg-[#04243b] text-[#e4b35e] px-1.5 py-0.5 rounded text-[10px]">
                                  {prod.codigo}
                                </span>
                              ) : null}
                              <span className="max-w-[220px] truncate" title={prod?.displayName}>
                                {prod?.descricao || prod?.displayName || key}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedIcmsProductKeys(prev => prev.filter(k => k !== key));
                                  setIcmsCurrentPage(1);
                                }}
                                className="hover:text-red-600 rounded p-0.5 cursor-pointer"
                                title="Remover este produto do relatório"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Dropdown Box interativo para seleção de produtos */}
                    {isIcmsProductSelectorOpen && (
                      <div className="mt-2 p-3.5 bg-white rounded-xl border border-slate-200 shadow-md space-y-3">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pb-2 border-b border-slate-150">
                          <div className="relative flex-grow">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={icmsProductSearchQuery}
                              onChange={(e) => setIcmsProductSearchQuery(e.target.value)}
                              placeholder="Pesquisar produto pelo código (ex.: 15.221) ou descrição..."
                              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#04243b]"
                              autoFocus
                            />
                            {icmsProductSearchQuery && (
                              <button
                                type="button"
                                onClick={() => setIcmsProductSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedIcmsProductKeys(availableIcmsProducts.map(p => p.key));
                                setIcmsCurrentPage(1);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                            >
                              Selecionar Todos
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedIcmsProductKeys([]);
                                setIcmsCurrentPage(1);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                            >
                              Desmarcar Todos
                            </button>
                          </div>
                        </div>

                        {/* Lista rolável de produtos disponíveis */}
                        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-150 rounded-xl pr-1">
                          {filteredProductOptions.length === 0 ? (
                            <div className="p-6 text-center text-xs text-slate-400">
                              Nenhum produto localizado para a busca "{icmsProductSearchQuery}".
                            </div>
                          ) : (
                            filteredProductOptions.map(p => {
                              const isSelected = selectedIcmsProductKeys.includes(p.key);
                              return (
                                <div
                                  key={p.key}
                                  onClick={() => {
                                    setSelectedIcmsProductKeys(prev => 
                                      prev.includes(p.key) ? prev.filter(k => k !== p.key) : [...prev, p.key]
                                    );
                                    setIcmsCurrentPage(1);
                                  }}
                                  className={`flex items-center justify-between p-2.5 hover:bg-slate-50 transition-colors cursor-pointer select-none ${
                                    isSelected ? 'bg-amber-50/70' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {}}
                                      className="w-4 h-4 rounded text-[#04243b] focus:ring-[#04243b] cursor-pointer"
                                    />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {p.codigo && (
                                          <span className="font-mono font-bold text-[11px] bg-[#04243b] text-[#e4b35e] px-2 py-0.5 rounded">
                                            {p.codigo}
                                          </span>
                                        )}
                                        <span className="text-xs font-bold text-slate-800 truncate" title={p.displayName}>
                                          {p.descricao || p.displayName}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 ml-3">
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      {p.totalItens} {p.totalItens === 1 ? 'item' : 'itens'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedIcmsProductKeys([p.key]);
                                        setIsIcmsProductSelectorOpen(false);
                                        setIcmsCurrentPage(1);
                                      }}
                                      className="px-2 py-1 text-[10px] font-black uppercase rounded bg-slate-100 hover:bg-[#e4b35e] hover:text-[#04243b] text-slate-700 transition-colors cursor-pointer border border-slate-200"
                                      title={`Gerar relatório somente para o produto ${p.codigo || p.descricao}`}
                                    >
                                      Gerar Somente Este
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Barra inferior */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-150">
                          <span className="text-[11px] text-slate-600 font-bold">
                            {selectedIcmsProductKeys.length === 0
                              ? 'Todos os produtos incluídos no relatório.'
                              : `${selectedIcmsProductKeys.length} de ${availableIcmsProducts.length} produtos selecionados (${effectiveIcmsItems.length} registros).`}
                          </span>

                          <button
                            type="button"
                            onClick={() => setIsIcmsProductSelectorOpen(false)}
                            className="w-full sm:w-auto px-4 py-1.5 bg-[#04243b] hover:bg-[#083454] text-[#e4b35e] text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-2xs cursor-pointer"
                          >
                            Confirmar & Gerar Relatório
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sub-tabs selector for ICMS (Entradas / Saídas) */}
                  <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-3 border-b border-slate-150 pb-3">
                    <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl">
                      <button
                        onClick={() => {
                          setIcmsActiveSubTab('entradas');
                          setIcmsCurrentPage(1);
                        }}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                          icmsActiveSubTab === 'entradas'
                            ? 'bg-[#04243b] text-[#e4b35e] shadow-xs'
                            : 'text-slate-600 hover:text-[#04243b] hover:bg-slate-200/60'
                        }`}
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Entradas</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                          icmsActiveSubTab === 'entradas' ? 'bg-[#e4b35e] text-[#04243b]' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {icmsEntradasCompleto.length}
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          setIcmsActiveSubTab('saidas');
                          setIcmsCurrentPage(1);
                        }}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                          icmsActiveSubTab === 'saidas'
                            ? 'bg-[#04243b] text-[#e4b35e] shadow-xs'
                            : 'text-slate-600 hover:text-[#04243b] hover:bg-slate-200/60'
                        }`}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5 text-blue-500" />
                        <span>Saídas</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                          icmsActiveSubTab === 'saidas' ? 'bg-[#e4b35e] text-[#04243b]' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {icmsSaidasCompleto.length}
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="relative w-full sm:w-72">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={icmsSearchTerm}
                          onChange={(e) => {
                            setIcmsSearchTerm(e.target.value);
                            setIcmsCurrentPage(1);
                          }}
                          placeholder="Buscar por produto, CFOP, CST..."
                          className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#04243b]"
                        />
                      </div>
                      <div className="text-xs text-slate-500 font-bold whitespace-nowrap">
                        Exibindo {paginatedIcmsItems.length} de {activeFilteredIcmsList.length} registros
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-[#04243b] text-[#e4b35e] font-bold uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">NF</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">Data</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">
                            {icmsActiveSubTab === 'saidas' ? 'CNPJ / CPF Destinatário' : 'CNPJ / CPF Emitente'}
                          </th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">PF / PJ</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">CFOP</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">Código</th>
                          <th className="py-2.5 px-3 text-left whitespace-nowrap min-w-[200px]">Descrição do Produto</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">NCM</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">UN</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">Quantidade</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">R$ Unitário</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">R$ Produto</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">Desconto R$</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">Valor Contábil R$</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">CST ICMS</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">R$ Base ICMS</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">% ICMS</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">R$ ICMS Declarado</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">% IPI</th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap">R$ IPI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {(paginatedIcmsItems as ErpIcmsReportItem[]).map((item, idx) => {
                          const cleanDocDigits = (item.cnpjEmitente || '').replace(/\D/g, '');
                          const tipoPessoa = cleanDocDigits.length === 11 ? 'PF' : cleanDocDigits.length === 14 ? 'PJ' : '-';
                          const { codigo: prodCod, descricao: prodDesc } = splitProductCodeAndDesc(item.produto);
                          const codigoFinal = item.codigoProduto || prodCod || '-';
                          const descFinal = item.descricaoProduto || prodDesc || item.produto;

                          return (
                            <tr key={item.id || `icms-${idx}`} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2 px-3 text-center font-bold text-[#04243b] whitespace-nowrap">{item.notaFiscal}</td>
                              <td className="py-2 px-3 text-center text-slate-600 whitespace-nowrap">{item.dataEmissao}</td>
                              <td className="py-2 px-3 text-center text-slate-600 whitespace-nowrap">{formatCnpjCpf(item.cnpjEmitente)}</td>
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  tipoPessoa === 'PF' 
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                                    : tipoPessoa === 'PJ' 
                                    ? 'bg-blue-100 text-blue-800 border border-blue-300' 
                                    : 'text-slate-400'
                                }`}>
                                  {tipoPessoa}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center text-slate-700 font-bold whitespace-nowrap">{item.cfop}</td>
                              <td className="py-2 px-3 text-center text-slate-700 font-mono font-medium whitespace-nowrap">{codigoFinal}</td>
                              <td className="py-2 px-3 text-left font-sans text-slate-800 max-w-xs truncate" title={descFinal}>
                                {descFinal}
                              </td>
                              <td className="py-2 px-3 text-center text-slate-600 whitespace-nowrap">{item.ncm || '-'}</td>
                              <td className="py-2 px-3 text-center text-slate-600 whitespace-nowrap">{item.unidade || 'UN'}</td>
                              <td className="py-2 px-3 text-center font-bold text-slate-800 whitespace-nowrap">
                                {(item.quantidade || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-3 text-center text-slate-700 whitespace-nowrap">
                                R$ {(item.valorUnitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                              </td>
                              <td className="py-2 px-3 text-center text-slate-700 whitespace-nowrap">
                                R$ {(item.valorProduto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-3 text-center text-slate-700 whitespace-nowrap">
                                R$ {(item.desconto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-3 text-center font-bold text-slate-800 whitespace-nowrap">
                                R$ {(item.valorContabil || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-3 text-center text-slate-600 whitespace-nowrap">{item.cstIcms || '-'}</td>
                              <td className="py-2 px-3 text-center text-slate-700 whitespace-nowrap">
                                R$ {(item.baseCalculoIcms || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-3 text-center text-slate-700 whitespace-nowrap">{item.aliquotaIcms || 0}%</td>
                              <td className="py-2 px-3 text-center font-bold text-emerald-700 whitespace-nowrap">
                                R$ {(item.valorIcms || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-3 text-center text-slate-700 whitespace-nowrap">{item.aliquotaIpi || 0}%</td>
                              <td className="py-2 px-3 text-center text-slate-700 whitespace-nowrap">
                                R$ {(item.valorIpi || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {totalIcmsPages > 1 && (
                    <div className="flex justify-between items-center pt-2 text-xs">
                      <button
                        disabled={icmsCurrentPage === 1}
                        onClick={() => setIcmsCurrentPage(p => Math.max(1, p - 1))}
                        className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50 cursor-pointer"
                      >
                        Anterior
                      </button>
                      <span className="font-bold text-slate-600">
                        Página {icmsCurrentPage} de {totalIcmsPages}
                      </span>
                      <button
                        disabled={icmsCurrentPage === totalIcmsPages}
                        onClick={() => setIcmsCurrentPage(p => Math.min(totalIcmsPages, p + 1))}
                        className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50 cursor-pointer"
                      >
                        Próxima
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* EMPTY STATE PARA RELATÓRIO ICMS */}
              {erpIcmsItems.length === 0 && icmsMainTab === 'relatorio' && (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center space-y-3">
                  <FileSpreadsheet className="w-10 h-10 text-[#04243b] mx-auto opacity-30" />
                  <h4 className="font-extrabold text-slate-800 text-sm">Nenhum Relatório ICMS Carregado</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto font-sans">
                    Importe um arquivo de movimentação ICMS do ERP (CSV/TXT) no painel acima para auditar, selecionar produtos e gerar os relatórios.
                  </p>
                  <button
                    onClick={handleLoadSampleDatabase}
                    className="px-4 py-1.5 bg-[#04243b] text-[#e4b35e] font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-xs hover:bg-[#083454] cursor-pointer inline-flex items-center gap-2"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Carregar Dados de Exemplo</span>
                  </button>
                </div>
              )}

              {/* VIEW 2: AUDITORIA — CONFRONTO COM RELATÓRIO SIGA SEFAZ */}
              {icmsMainTab === 'auditoria' && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs space-y-6 p-6">
                  
                  {/* Hidden File Inputs for Import Buttons */}
                  <input
                    type="file"
                    ref={sefazSaidasAuditFileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleImportSigaChannelFile(e.target.files[0], 'SAIDA');
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                    accept=".txt,.csv,.xlsx,.xls"
                  />
                  <input
                    type="file"
                    ref={sefazEntradasAuditFileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleImportSigaChannelFile(e.target.files[0], 'ENTRADA');
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                    accept=".txt,.csv,.xlsx,.xls"
                  />
                  <input
                    type="file"
                    ref={sigaSefazAuditFileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleProcessMultipleFiles(Array.from(e.target.files));
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                    accept=".txt,.csv,.xlsx,.xls"
                    multiple
                  />

                  {/* Main Actions Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 pb-4 border-b border-slate-200">
                    {/* Action Buttons & File Status Badge */}
                    <div className="flex items-center gap-2.5 shrink-0 flex-wrap w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={() => sefazEntradasAuditFileInputRef.current?.click()}
                        className="px-3.5 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold transition-all flex items-center gap-2 border border-sky-200 cursor-pointer shadow-2xs"
                        title="Importar relatório de Entradas/Compras da SEFAZ"
                      >
                        <Upload className="w-3.5 h-3.5 text-sky-600" />
                        <span>Importar SEFAZ (Entradas)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => sefazSaidasAuditFileInputRef.current?.click()}
                        className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold transition-all flex items-center gap-2 border border-amber-200 cursor-pointer shadow-2xs"
                        title="Importar relatório de Saídas/Vendas da SEFAZ"
                      >
                        <Upload className="w-3.5 h-3.5 text-amber-600" />
                        <span>Importar SEFAZ (Saídas)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowLoadedFilesModal(true)}
                        className="flex items-center gap-2 text-xs bg-slate-800 hover:bg-slate-900 text-white rounded-xl px-3.5 py-2 font-bold shadow-2xs transition-all cursor-pointer border border-slate-700"
                        title="Clique para ver os relatórios importados"
                      >
                        <FileText className="w-4 h-4 text-[#e4b35e]" />
                        <span>Relatórios ({loadedFiles.length})</span>
                      </button>
                    </div>
                  </div>

                  {/* Clean Structured Filter Toolbar */}
                  <div className="bg-slate-50/90 p-3 rounded-2xl border border-slate-200 flex flex-col gap-3 shadow-2xs">
                    {/* Top Row: Operation Mode Switch & Search Input */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      {/* Entradas / Saídas Segmented Switch */}
                      <div className="flex items-center bg-slate-200/80 p-1 rounded-xl text-xs font-bold shrink-0">
                        <button
                          type="button"
                          onClick={() => { setSigaConfrontTipoFilter('entrada'); setSigaConfrontPage(1); }}
                          className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                            sigaConfrontTipoFilter === 'entrada'
                              ? 'bg-sky-700 text-white shadow-2xs font-extrabold'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/40'
                          }`}
                        >
                          <ArrowDownLeft className="w-4 h-4 text-sky-200" />
                          <span>Entradas (Compras)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => { setSigaConfrontTipoFilter('saida'); setSigaConfrontPage(1); }}
                          className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                            sigaConfrontTipoFilter === 'saida'
                              ? 'bg-amber-700 text-white shadow-2xs font-extrabold'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/40'
                          }`}
                        >
                          <ArrowUpRight className="w-4 h-4 text-amber-200" />
                          <span>Saídas (Vendas)</span>
                        </button>
                      </div>

                      {/* Search Input Box */}
                      <div className="relative w-full sm:w-80">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={sigaConfrontSearch}
                          onChange={(e) => { setSigaConfrontSearch(e.target.value); setSigaConfrontPage(1); }}
                          placeholder="Buscar por nota, CNPJ, cliente ou chave..."
                          className="w-full pl-8 pr-8 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#04243b]"
                        />
                        {sigaConfrontSearch && (
                          <button 
                            type="button"
                            onClick={() => setSigaConfrontSearch('')}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bottom Row: Status Filter Chips */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/70 text-xs">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
                        Inconsistências:
                      </span>

                      <button
                        type="button"
                        onClick={() => { setSigaConfrontFilterStatus('all'); setSigaConfrontPage(1); }}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          sigaConfrontFilterStatus === 'all'
                            ? 'bg-[#04243b] text-white shadow-2xs font-extrabold'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        Todas ({sigaConfrontStatusCounts.total})
                      </button>

                      <button
                        type="button"
                        onClick={() => { setSigaConfrontFilterStatus('falta_sistema'); setSigaConfrontPage(1); }}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          sigaConfrontFilterStatus === 'falta_sistema'
                            ? 'bg-red-600 text-white shadow-2xs'
                            : 'bg-white text-red-700 hover:bg-red-50 border border-red-200'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                        <span>Faltam no Sistema ({sigaConfrontStatusCounts.faltaSistema})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setSigaConfrontFilterStatus('falta_sefaz'); setSigaConfrontPage(1); }}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          sigaConfrontFilterStatus === 'falta_sefaz'
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-200'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <span>Faltam na SEFAZ ({sigaConfrontStatusCounts.faltaSefaz})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setSigaConfrontFilterStatus('divergencia'); setSigaConfrontPage(1); }}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          sigaConfrontFilterStatus === 'divergencia'
                            ? 'bg-yellow-600 text-white shadow-2xs'
                            : 'bg-white text-yellow-800 hover:bg-yellow-50 border border-yellow-200'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                        <span>Divergência de Valor ({sigaConfrontStatusCounts.divergencia})</span>
                      </button>
                    </div>
                  </div>

                  {/* Table of Inconsistencies & Concordances */}
                  {filteredSigaConfrontItems.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-2">
                      <Info className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-600">Nenhuma nota fiscal encontrada para o filtro selecionado.</p>
                      <p className="text-[11px] text-slate-400">Importe os relatórios SIGA/SEFAZ ou ICMS (Sistema) para ver os dados.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100/90 text-slate-700 uppercase font-extrabold text-[10px] border-b border-slate-200">
                            <tr>
                              <th className="py-3 px-3">Status / Inconsistência</th>
                              <th className="py-3 px-3">Nota Fiscal</th>
                              <th className="py-3 px-3 text-center">Série</th>
                              <th className="py-3 px-3">Data Emissão</th>
                              <th className="py-3 px-3">Cliente / Fornecedor</th>
                              <th className="py-3 px-3 text-right">Valor SEFAZ</th>
                              <th className="py-3 px-3 text-right">Valor Sistema</th>
                              <th className="py-3 px-3 text-right">Diferença</th>
                              <th className="py-3 px-3">Diagnóstico / Ação Recomendada</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 font-sans">
                            {paginatedSigaConfrontItems.map((item) => {
                              let badgeBg = 'bg-emerald-100 text-emerald-900 border-emerald-200';
                              if (item.status === 'FALTA_SISTEMA') badgeBg = 'bg-red-100 text-red-900 border-red-200 font-bold';
                              if (item.status === 'FALTA_SEFAZ') badgeBg = 'bg-amber-100 text-amber-900 border-amber-200 font-bold';
                              if (item.status === 'DIVERGENCIA_VALOR') badgeBg = 'bg-yellow-100 text-yellow-900 border-yellow-200 font-bold';

                              return (
                                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border ${badgeBg}`}>
                                      {item.status === 'FALTA_SISTEMA' && <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                                      {item.status === 'FALTA_SEFAZ' && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                                      {item.status === 'DIVERGENCIA_VALOR' && <Coins className="w-3.5 h-3.5 text-yellow-600 shrink-0" />}
                                      {item.status === 'CONCILIADO' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                                      <span>{item.statusLabel}</span>
                                    </span>
                                  </td>

                                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                    {item.numeroNota}
                                  </td>

                                  <td className="py-2.5 px-3 text-center font-mono text-slate-700 whitespace-nowrap">
                                    {item.serie}
                                  </td>

                                  <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                                    {item.dataEmissao}
                                  </td>

                                  <td className="py-2.5 px-3 text-slate-800 font-medium max-w-[200px] truncate" title={item.fornecedorOuCliente}>
                                    {item.fornecedorOuCliente}
                                  </td>

                                  <td className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${
                                    item.constaNaSefaz ? 'text-slate-900' : 'text-slate-300'
                                  }`}>
                                    {item.constaNaSefaz 
                                      ? `R$ ${item.valorSefaz.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
                                      : '-'
                                    }
                                  </td>

                                  <td className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${
                                    item.constaNoSistema ? 'text-slate-900' : 'text-slate-300'
                                  }`}>
                                    {item.constaNoSistema 
                                      ? `R$ ${item.valorSistema.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
                                      : '-'
                                    }
                                  </td>

                                  <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                                    {item.valorDivergencia > 0 ? (
                                      <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                                        R$ {item.valorDivergencia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                    ) : (
                                      <span className="text-emerald-600">R$ 0,00</span>
                                    )}
                                  </td>

                                  <td className="py-2.5 px-3 text-slate-600 text-[11px] leading-snug">
                                    {item.acaoRecomendada}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Controls */}
                      {totalSigaConfrontPages > 1 && (
                        <div className="flex justify-between items-center pt-2 text-xs">
                          <button
                            disabled={sigaConfrontPage === 1}
                            onClick={() => setSigaConfrontPage(p => Math.max(1, p - 1))}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 cursor-pointer font-bold text-slate-700 flex items-center gap-1"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span>Anterior</span>
                          </button>
                          <span className="font-extrabold text-slate-600">
                            Página {sigaConfrontPage} de {totalSigaConfrontPages} ({filteredSigaConfrontItems.length} registros)
                          </span>
                          <button
                            disabled={sigaConfrontPage === totalSigaConfrontPages}
                            onClick={() => setSigaConfrontPage(p => Math.min(totalSigaConfrontPages, p + 1))}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 cursor-pointer font-bold text-slate-700 flex items-center gap-1"
                          >
                            <span>Próxima</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {sefazDuplicates.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-900 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center shadow-xs animate-fadeIn">
                  <div className="flex gap-3 min-w-0">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-extrabold uppercase tracking-tight text-red-800">
                        Alerta de Duplicidade no Relatório SEFAZ
                      </h4>
                      <p className="text-xs text-red-700 leading-normal font-sans">
                        Identificamos {sefazDuplicates.length} {sefazDuplicates.length === 1 ? 'chave' : 'chaves'} de acesso duplicada(s) ou repetida(s) no arquivo da SEFAZ. Isto pode provocar divergências falsas e duplicar valores contábeis no confronto.
                      </p>
                      <div className="mt-2 space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                        {sefazDuplicates.map((dup, idx) => (
                          <div key={`dup-${idx}`} className="text-xs font-mono bg-red-100/50 p-2 rounded-lg border border-red-150 flex flex-col sm:flex-row sm:justify-between gap-1">
                            <span className="font-bold text-red-900">Nota #{dup.numeroNota} {dup.serie ? `(Série ${dup.serie})` : ''}</span>
                            <span className="text-[10px] text-red-800 truncate sm:max-w-md" title={dup.key}>Chave: {dup.key}</span>
                            <span className="text-[10px] bg-red-200 px-2 py-0.5 rounded-full font-bold text-red-950 shrink-0 self-start sm:self-center">{dup.count}x no relatório</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                    <button
                      onClick={handleRemoveSefazDuplicates}
                      className="w-full md:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
                    >
                      ⚡ Corrigir & Remover Duplicados
                    </button>
                  </div>
                </div>
              )}

              {!auditSummary ? null : (
                <div className="space-y-6 animate-fadeIn">
                  
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-slate-400 font-sans block">Total SEFAZ</span>
                      <span className="text-xl font-black text-[#04243b] block mt-1 font-mono">{auditSummary.totalSefaz}</span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-slate-400 font-sans block">Total ERP</span>
                      <span className="text-xl font-black text-[#04243b] block mt-1 font-mono">{auditSummary.totalErp}</span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl text-emerald-800">
                      <span className="text-[10px] uppercase font-bold text-emerald-600 font-sans block">Conciliadas (OK)</span>
                      <span className="text-xl font-black block mt-1 font-mono">{auditSummary.sincronizadas}</span>
                    </div>
                    <div className="bg-red-50 border border-red-100 p-4 rounded-2xl text-red-800" title="Presente no relatório da SEFAZ, mas ausente nos registros do ERP">
                      <span className="text-[10px] uppercase font-bold text-red-600 font-sans block">Faltantes no ERP</span>
                      <span className="text-xl font-black block mt-1 font-mono">{auditSummary.faltantesErp}</span>
                      <span className="text-[8.5px] text-red-500 font-sans mt-0.5 block">Só constam na SEFAZ</span>
                    </div>
                    <div className="bg-purple-50 border border-purple-100 p-4 rounded-2xl text-purple-800" title="Presente nos registros do ERP, mas ausente no relatório da SEFAZ">
                      <span className="text-[10px] uppercase font-bold text-purple-600 font-sans block">Não Constam SEFAZ</span>
                      <span className="text-xl font-black block mt-1 font-mono">{auditSummary.naoConstamSefaz}</span>
                      <span className="text-[8.5px] text-purple-500 font-sans mt-0.5 block">Só constam no ERP</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-amber-800" title="Registros com número igual mas divergência nos valores monetários">
                      <span className="text-[10px] uppercase font-bold text-amber-600 font-sans block">Divergências Valor</span>
                      <span className="text-xl font-black block mt-1 font-mono">{auditSummary.divergenciasValor}</span>
                      <span className="text-[8.5px] text-amber-600 font-sans mt-0.5 block">Divergência de valores</span>
                    </div>
                  </div>

                  {/* Filter / Search controls */}
                  <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                    <div className="relative w-full md:w-80">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={auditSearchTerm}
                        onChange={(e) => setAuditSearchTerm(e.target.value)}
                        placeholder="Buscar por número da Nota, chave ou cliente..."
                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#04243b]"
                      />
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>Status de Confronto:</span>
                      <select
                        value={auditFilterStatus}
                        onChange={(e) => setAuditFilterStatus(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-bold"
                      >
                        <option value="all">Todos os Registros ({auditItems.length})</option>
                        <option value="OK">Sincronizado / OK</option>
                        <option value="FALTANTE_ERP">Omitido no ERP</option>
                        <option value="NAO_CONSTA_SEFAZ">Não consta na SEFAZ</option>
                        <option value="DIVERGENCIA_VALOR">Divergência de Valores</option>
                      </select>
                    </div>
                  </div>

                  {/* Table results list */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100">
                        <tr>
                          <th className="py-2.5 px-4">Nota</th>
                          <th className="py-2.5 px-4 text-center">Status</th>
                          <th className="py-2.5 px-4 text-right">R$ SEFAZ</th>
                          <th className="py-2.5 px-4 text-right">R$ ERP</th>
                          <th className="py-2.5 px-4 text-center">Diferença</th>
                          <th className="py-2.5 px-4">Cliente / Emitente</th>
                          <th className="py-2.5 px-4">Chave de Acesso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-mono">
                        {filteredAuditItems.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-10 text-slate-400 font-sans">
                              Nenhum registro encontrado correspondente aos filtros atuais.
                            </td>
                          </tr>
                        ) : (
                          filteredAuditItems.map((item, idx) => {
                            const diff = Math.abs((item.sefazValue || 0) - (item.erpValue || 0));
                            return (
                              <tr key={`audit-row-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-2.5 px-4 font-bold text-[#04243b]">{item.nota}</td>
                                <td className="py-2.5 px-4 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                    item.status === 'OK' ? 'bg-emerald-50 text-emerald-700' :
                                    item.status === 'FALTANTE_ERP' ? 'bg-red-50 text-red-700 font-bold' :
                                    item.status === 'NAO_CONSTA_SEFAZ' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'
                                  }`}>
                                    {item.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-right text-slate-700 font-bold">
                                  R$ {item.sefazValue !== undefined && item.sefazValue !== null ? item.sefazValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}
                                </td>
                                <td className="py-2.5 px-4 text-right text-slate-700 font-bold">
                                  R$ {item.erpValue !== undefined && item.erpValue !== null ? item.erpValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  {diff > 0.01 ? (
                                    <span className="text-red-600 font-bold">
                                      R$ {(diff ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                  ) : '-'}
                                </td>
                                <td className="py-2.5 px-4 font-sans text-slate-600 truncate max-w-[200px]" title={item.cliente}>
                                  {item.cliente || '-'}
                                </td>
                                <td className="py-2.5 px-4 text-[10px] text-slate-400 select-all tracking-tight font-mono">{item.chaveDeAcesso || '-'}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* ======================================================== */}
          {/* MODULE 2: ORGANIZADOR DE RELATÓRIO E IMPOSTOS */}
          {/* ======================================================== */}
          {activeOutputTab === 'organizador' && (
            <div className="space-y-6">
              {organizadorEntradas.length === 0 && organizadorSaidas.length === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-2">
                  <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-600 font-sans">Sem Relatório SIGA Carregado</h3>
                </div>
              ) : (
                <div className="space-y-6 animate-fadeIn font-sans">
                  
                  {/* Top Stats of Organizador */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold text-emerald-800">Total de Entradas</span>
                      <span className="text-xl font-black text-emerald-950 font-mono mt-1">
                        R$ {(orgStats?.entradas?.vlrContabil ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1">{organizadorEntradas.length} lançamentos fiscais</span>
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold text-blue-800">Total de Saídas</span>
                      <span className="text-xl font-black text-blue-950 font-mono mt-1">
                        R$ {(orgStats?.saidas?.vlrContabil ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1">{organizadorSaidas.length} lançamentos fiscais</span>
                    </div>
                  </div>

                  {/* Sub-tab selection for Entrada, Saída, and Consolidado summaries */}
                  <div className="border-b border-slate-200 flex flex-wrap gap-2 pt-2">
                    <button
                      onClick={() => { setActiveOrgSubTab('entradas'); setOrgCurrentPage(1); }}
                      className={`px-4 py-2 border-b-2 text-xs font-bold transition-all cursor-pointer ${
                        activeOrgSubTab === 'entradas' ? 'border-[#04243b] text-[#04243b]' : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Entradas (📥 {organizadorEntradas.length} NFs)
                    </button>
                    <button
                      onClick={() => { setActiveOrgSubTab('saidas'); setOrgCurrentPage(1); }}
                      className={`px-4 py-2 border-b-2 text-xs font-bold transition-all cursor-pointer ${
                        activeOrgSubTab === 'saidas' ? 'border-[#04243b] text-[#04243b]' : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Saídas (📤 {organizadorSaidas.length} NFs)
                    </button>
                  </div>

                  {/* Standard Search, Pagination and Rows display when viewing Entradas / Saídas list */}
                  <div className="space-y-4">
                    
                    {/* Controls toolbar */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150 flex flex-col md:flex-row gap-3 items-center justify-between">
                      <div className="relative w-full md:w-80">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={orgSearchTerm}
                          onChange={(e) => { setOrgSearchTerm(e.target.value); setOrgCurrentPage(1); }}
                          placeholder="Buscar nota, produto, CNPJ, NCM..."
                          className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#04243b]"
                        />
                      </div>
                    </div>

                      {/* Rows Grid Table */}
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-2xs">
                        <table className="w-full text-left border-collapse min-w-[1200px]">
                          <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100">
                            <tr>
                              <th className="py-2.5 px-3">Nota Fiscal</th>
                              <th className="py-2.5 px-3 text-center">Modelo</th>
                              <th className="py-2.5 px-3 text-center">Série</th>
                              <th className="py-2.5 px-3">Data Emissão</th>
                              <th className="py-2.5 px-3 text-right">Valor R$</th>
                              <th className="py-2.5 px-3">CNPJ Emitente</th>
                              <th className="py-2.5 px-3">Razão Social Emitente</th>
                              <th className="py-2.5 px-3 text-center">UF</th>
                              <th className="py-2.5 px-3 font-mono">Chave de Acesso</th>
                              <th className="py-2.5 px-3 text-center">Situação NF-e</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-[11px] font-mono">
                            {paginatedOrgItems.length === 0 ? (
                              <tr>
                                <td colSpan={10} className="text-center py-10 text-slate-400 font-sans">
                                  Nenhum registro encontrado correspondente aos filtros aplicados.
                                </td>
                              </tr>
                            ) : (
                              paginatedOrgItems.map((item, idx) => (
                                <tr key={`item-org-row-${idx}`} className={`hover:bg-slate-50/50 ${item.situacaoNfe === 'CANCELADA' ? 'bg-red-50/20' : ''}`}>
                                  <td className="py-2.5 px-3 font-bold text-[#04243b]">{item.notaFiscal}</td>
                                  <td className="py-2.5 px-3 text-center font-bold text-slate-600">{item.modelo || '55'}</td>
                                  <td className="py-2.5 px-3 text-center text-slate-600">{item.serie || '1'}</td>
                                  <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">{item.data}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                                    R$ {(item.vlrContabil ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="py-2.5 px-3 text-[10px] text-slate-500 font-mono whitespace-nowrap">
                                    {(item.modelo === '65' || item.modelo === 'NFCe' || item.modelo === 'NFCE') ? '-' : (item.cnpj || '-')}
                                  </td>
                                  <td className="py-2.5 px-3 font-sans max-w-[220px] truncate" title={(item.modelo === '65' || item.modelo === 'NFCe' || item.modelo === 'NFCE') ? '-' : (item.razaoSocial || item.nomeProduto || '-')}>
                                    <span className="font-bold text-slate-700 block truncate text-[11px]">
                                      {(item.modelo === '65' || item.modelo === 'NFCe' || item.modelo === 'NFCE') ? '-' : (item.razaoSocial || item.nomeProduto || '-')}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-bold text-slate-600">{item.uf || 'CE'}</td>
                                  <td className="py-2.5 px-3 text-slate-400 select-all font-mono tracking-tight text-[10px] whitespace-nowrap" title={item.chaveDeAcesso}>
                                    {item.chaveDeAcesso || '-'}
                                  </td>
                                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                    {item.situacaoNfe === 'CANCELADA' ? (
                                      <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-md text-[9px] uppercase font-extrabold font-sans">
                                        CANCELADA
                                      </span>
                                    ) : item.situacaoNfe === 'DENEGADA' ? (
                                      <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md text-[9px] uppercase font-extrabold font-sans">
                                        DENEGADA
                                      </span>
                                    ) : (
                                      <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md text-[9px] uppercase font-extrabold font-sans">
                                        AUTORIZADA
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Controls */}
                      {totalOrgPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-xs text-slate-400 font-sans">Página <strong>{orgCurrentPage}</strong> de {totalOrgPages}</span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setOrgCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={orgCurrentPage === 1}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setOrgCurrentPage(prev => Math.min(totalOrgPages, prev + 1))}
                              disabled={orgCurrentPage === totalOrgPages}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                    </div>

                </div>
              )}

            </div>
          )}

          {/* ======================================================== */}
          {/* MÓDULO 01 - TELA DE AUDITORIA FISCAL INDEPENDENTE SIGA */}
          {/* ======================================================== */}
          {activeOutputTab === 'auditoria_siga' && (() => {
            const entAudit = identifySigaDuplicates(organizadorEntradas);
            const saiAudit = identifySigaDuplicates(organizadorSaidas);
            const totalDups = entAudit.summary.duplicateCount + saiAudit.summary.duplicateCount;
            const totalDupVal = entAudit.summary.duplicatedValue + saiAudit.summary.duplicatedValue;

            const activeDataset = auditSigaSubTab === 'entradas' ? entAudit.itemsWithStatus : saiAudit.itemsWithStatus;

            const filteredAuditList = activeDataset.filter(item => {
              if (auditSigaFilter === 'duplicates' && !item.isDuplicate) return false;
              if (auditSigaFilter === 'unique' && item.isDuplicate) return false;
              if (auditSigaSearch.trim()) {
                const term = auditSigaSearch.toLowerCase();
                const matchNota = (item.notaFiscal || '').toLowerCase().includes(term);
                const matchProd = (item.nomeProduto || '').toLowerCase().includes(term);
                const matchCnpj = (item.cnpj || '').toLowerCase().includes(term);
                const matchCfop = (item.cfop || '').toLowerCase().includes(term);
                const matchChave = (item.chaveDeAcesso || '').toLowerCase().includes(term);
                return matchNota || matchProd || matchCnpj || matchCfop || matchChave;
              }
              return true;
            });

            const auditItemsPerPage = 15;
            const totalAuditPages = Math.ceil(filteredAuditList.length / auditItemsPerPage) || 1;
            const paginatedAuditList = filteredAuditList.slice((auditSigaPage - 1) * auditItemsPerPage, auditSigaPage * auditItemsPerPage);

            const handleDeleteSingleDuplicate = (itemId: string, type: 'entradas' | 'saidas') => {
              if (type === 'entradas') {
                setOrganizadorEntradas(prev => prev.filter(item => item.id !== itemId));
              } else {
                setOrganizadorSaidas(prev => prev.filter(item => item.id !== itemId));
              }
            };

            const handleSanitizeAllDuplicates = () => {
              const cleanEntradas = entAudit.itemsWithStatus.filter(i => !i.isDuplicate);
              const cleanSaidas = saiAudit.itemsWithStatus.filter(i => !i.isDuplicate);

              const remEnt = organizadorEntradas.length - cleanEntradas.length;
              const remSai = organizadorSaidas.length - cleanSaidas.length;
              const totalRem = remEnt + remSai;

              if (totalRem === 0) {
                alert('Nenhuma duplicidade encontrada para remover no relatório SIGA!');
                return;
              }

              setOrganizadorEntradas(cleanEntradas);
              setOrganizadorSaidas(cleanSaidas);

              alert(`⚡ SANEAMENTO CONCLUÍDO COM SUCESSO!\n\nForam eliminadas ${totalRem} duplicidades do relatório SIGA:\n- Entradas sanitizadas: ${remEnt} removidas\n- Saídas sanitizadas: ${remSai} removidas\n\nSeu relatório agora reflete os valores reais de faturamento e compras sem as distorções do SIGA.`);
            };

            return (
              <div className="space-y-6 animate-fadeIn font-sans">
                {/* Header Banner with Action Buttons */}
                <div className="bg-[#04243b] text-white p-4 rounded-2xl shadow-md border-b-4 border-[#e4b35e] flex flex-wrap items-center justify-end gap-3">
                  <button
                    onClick={handleSanitizeAllDuplicates}
                    disabled={totalDups === 0}
                    className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm ${
                      totalDups > 0
                        ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer hover:shadow-md'
                        : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <Zap className="w-4 h-4 fill-white" />
                    Saneamento Automático ({totalDups} Duplicatas)
                  </button>

                  <button
                    onClick={() => exportSigaAuditExcel({ entradas: organizadorEntradas, saidas: organizadorSaidas, metadata: organizadorMetadata })}
                    className="px-4 py-2.5 bg-[#e4b35e] hover:bg-[#d6a24c] text-[#04243b] font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Exportar Excel Sanitizado
                  </button>
                </div>

                {/* Checklist de Auditoria Fiscal */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3 font-sans">
                  <div className="flex items-center justify-between border-b border-slate-150 pb-2.5">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-[#04243b]" />
                      <h3 className="text-sm font-black text-[#04243b] uppercase tracking-tight">
                        Checklist de Auditoria Fiscal & Conformidade
                      </h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 text-xs">
                    {/* Item 1 */}
                    <div 
                      onClick={() => {
                        setAuditSigaFilter('duplicates');
                        setAuditSigaPage(1);
                        if (auditSigaSubTab === 'saidas' && saiAudit.summary.duplicateCount === 0 && entAudit.summary.duplicateCount > 0) {
                          setAuditSigaSubTab('entradas');
                        } else if (auditSigaSubTab === 'entradas' && entAudit.summary.duplicateCount === 0 && saiAudit.summary.duplicateCount > 0) {
                          setAuditSigaSubTab('saidas');
                        }
                      }}
                      className={`p-3 rounded-xl border cursor-pointer transition-all hover:shadow-sm ${totalDups > 0 ? 'bg-red-50/60 border-red-200 hover:bg-red-100/60' : 'bg-emerald-50/60 border-emerald-200 hover:bg-emerald-100/60'} space-y-1`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-slate-800 text-[11px]">1. Deduplicação de Notas</span>
                        {totalDups > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAuditSigaFilter('duplicates');
                              setAuditSigaPage(1);
                              if (auditSigaSubTab === 'saidas' && saiAudit.summary.duplicateCount === 0 && entAudit.summary.duplicateCount > 0) {
                                setAuditSigaSubTab('entradas');
                              } else if (auditSigaSubTab === 'entradas' && entAudit.summary.duplicateCount === 0 && saiAudit.summary.duplicateCount > 0) {
                                setAuditSigaSubTab('saidas');
                              }
                            }}
                            className="text-[9px] font-black uppercase px-2.5 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white cursor-pointer shadow-xs transition-transform active:scale-95 flex items-center gap-1"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            {totalDups} INCONSISTÊNCIAS
                          </button>
                        ) : (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                            OK (0 Dups)
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Cruzamento exato: <strong>Chave + N° NF + Valor Total</strong>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tabs & Controls */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-2xs">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-3 border-b border-slate-150">
                    {/* Operation Subtabs */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setAuditSigaSubTab('saidas'); setAuditSigaPage(1); }}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                          auditSigaSubTab === 'saidas'
                            ? 'bg-blue-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        📤 Saídas / Faturamento ({organizadorSaidas.length} NFs - {saiAudit.summary.duplicateCount} dups)
                      </button>

                      <button
                        onClick={() => { setAuditSigaSubTab('entradas'); setAuditSigaPage(1); }}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                          auditSigaSubTab === 'entradas'
                            ? 'bg-emerald-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        📥 Entradas / Compras ({organizadorEntradas.length} NFs - {entAudit.summary.duplicateCount} dups)
                      </button>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                      <div className="relative flex-1 md:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={auditSigaSearch}
                          onChange={e => { setAuditSigaSearch(e.target.value); setAuditSigaPage(1); }}
                          placeholder="Buscar por NF, Produto, CNPJ, Chave..."
                          className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#04243b]"
                        />
                      </div>

                      <select
                        value={auditSigaFilter}
                        onChange={e => { setAuditSigaFilter(e.target.value as any); setAuditSigaPage(1); }}
                        className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 font-bold focus:outline-none focus:border-[#04243b]"
                      >
                        <option value="all">Exibir Todos os Registros</option>
                        <option value="duplicates">🚨 Apenas Duplicidades (Alertas)</option>
                        <option value="unique">✅ Apenas Registros Únicos (Saneados)</option>
                      </select>
                    </div>
                  </div>

                  {/* Audit Interactive Conference Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-[#04243b] text-white uppercase text-[10px] font-bold">
                        <tr>
                          <th className="py-2.5 px-3">Status / Alerta</th>
                          <th className="py-2.5 px-3">NF-e</th>
                          <th className="py-2.5 px-3">Data</th>
                          <th className="py-2.5 px-3">CNPJ/CPF</th>
                          <th className="py-2.5 px-3">CFOP</th>
                          <th className="py-2.5 px-3">Produto / Descrição</th>
                          <th className="py-2.5 px-3 text-right">Valor Contábil</th>
                          <th className="py-2.5 px-3">Chave de Acesso</th>
                          <th className="py-2.5 px-3 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {paginatedAuditList.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-8 text-center text-slate-400 font-sans text-xs">
                              Nenhum registro encontrado para os filtros selecionados.
                            </td>
                          </tr>
                        ) : (
                          paginatedAuditList.map(item => {
                            const isDup = Boolean(item.isDuplicate);
                            return (
                              <tr
                                key={item.id}
                                className={`transition-colors ${
                                  isDup ? 'bg-red-50/80 hover:bg-red-100/80 text-red-950 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <td className="py-2 px-3 font-sans">
                                  {isDup ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-600 text-white shadow-2xs">
                                      <AlertTriangle className="w-3 h-3" />
                                      DUPLICIDADE DETECTADA
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      REGISTRO ÚNICO
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-bold">{item.notaFiscal}</td>
                                <td className="py-2 px-3 text-slate-500">{item.data}</td>
                                <td className="py-2 px-3 text-slate-600">{item.cnpj}</td>
                                <td className="py-2 px-3 font-bold text-slate-700">{item.cfop}</td>
                                <td className="py-2 px-3 font-sans font-medium text-slate-800 max-w-xs truncate" title={item.nomeProduto}>
                                  {item.nomeProduto}
                                </td>
                                <td className={`py-2 px-3 text-right font-bold ${isDup ? 'text-red-700' : 'text-slate-900'}`}>
                                  R$ {item.vlrContabil.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="py-2 px-3 text-[10px] text-slate-500 max-w-[140px] truncate" title={item.chaveDeAcesso || 'SIGA'}>
                                  {item.chaveDeAcesso || 'SEFAZ/SIGA-TXT'}
                                </td>
                                <td className="py-2 px-3 text-center font-sans">
                                  {isDup ? (
                                    <button
                                      onClick={() => handleDeleteSingleDuplicate(item.id!, auditSigaSubTab)}
                                      className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs flex items-center gap-1 mx-auto"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      Excluir Duplicata
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-medium">Mantida</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2 text-xs text-slate-500">
                    <span>
                      Exibindo <strong>{paginatedAuditList.length}</strong> de <strong>{filteredAuditList.length}</strong> lançamentos auditados
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAuditSigaPage(p => Math.max(p - 1, 1))}
                        disabled={auditSigaPage === 1}
                        className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 font-bold transition-all cursor-pointer disabled:cursor-not-allowed"
                      >
                        Anterior
                      </button>
                      <span className="text-xs font-bold text-slate-700">
                        Página {auditSigaPage} de {totalAuditPages}
                      </span>
                      <button
                        onClick={() => setAuditSigaPage(p => Math.min(p + 1, totalAuditPages))}
                        disabled={auditSigaPage >= totalAuditPages}
                        className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 font-bold transition-all cursor-pointer disabled:cursor-not-allowed"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ======================================================== */}
          {/* MODULE 3: INTEGRIDADE & SEQUENCIA */}
          {/* ======================================================== */}
          {activeOutputTab === 'integridade' && (
            <div className="space-y-6">
              {sefazDuplicates.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-900 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center shadow-xs animate-fadeIn">
                  <div className="flex gap-3 min-w-0">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-extrabold uppercase tracking-tight text-red-800">
                        Alerta de Duplicidade no Relatório SEFAZ
                      </h4>
                      <p className="text-xs text-red-700 leading-normal font-sans">
                        Identificamos {sefazDuplicates.length} {sefazDuplicates.length === 1 ? 'chave' : 'chaves'} de acesso duplicada(s) ou repetida(s) no arquivo da SEFAZ. Isto pode provocar divergências falsas e duplicar valores contábeis no confronto.
                      </p>
                      <div className="mt-2 space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                        {sefazDuplicates.map((dup, idx) => (
                          <div key={`dup-${idx}`} className="text-xs font-mono bg-red-100/50 p-2 rounded-lg border border-red-150 flex flex-col sm:flex-row sm:justify-between gap-1">
                            <span className="font-bold text-red-900">Nota #{dup.numeroNota} {dup.serie ? `(Série ${dup.serie})` : ''}</span>
                            <span className="text-[10px] text-red-800 truncate sm:max-w-md" title={dup.key}>Chave: {dup.key}</span>
                            <span className="text-[10px] bg-red-200 px-2 py-0.5 rounded-full font-bold text-red-950 shrink-0 self-start sm:self-center">{dup.count}x no relatório</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                    <button
                      onClick={handleRemoveSefazDuplicates}
                      className="w-full md:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
                    >
                      ⚡ Corrigir & Remover Duplicados
                    </button>
                  </div>
                </div>
              )}

              {!auditSummary ? (
                <div className="text-center py-16 text-slate-400 space-y-4">
                  <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-600 font-sans">Sem Estatísticas de Sequência Calculadas</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto font-sans">
                      Execute a conciliação estratégica no Data Lake acima para calcular saltos de numeração e quebra de sequencial.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-fadeIn font-sans">
                  
                  {/* Sequence header block */}
                  <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h3 className="text-sm font-black text-[#04243b] uppercase">Resumo de Sequencial de Notas (Gaps)</h3>
                      <p className="text-xs text-slate-400 mt-1">Análise de sequência de nota {auditSummary.minNota} até {auditSummary.maxNota}</p>
                    </div>
                    <div className="bg-[#04243b] text-[#e4b35e] px-4 py-2 rounded-xl text-xs font-mono font-bold">
                      SALTOS ENCONTRADOS: {auditSummary.saltosSequencia}
                    </div>
                  </div>

                  {/* Canceled/Inutilizadas logs and gaps table list */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Gaps found log */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        <h4 className="text-xs font-black text-[#04243b] uppercase">Gaps Identificados na SEFAZ</h4>
                      </div>

                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {auditItems.filter(i => i.status === 'SALTO_SEQUENCIA').length === 0 ? (
                          <div className="text-center py-10 text-slate-400 text-xs">
                            Nenhum salto sequencial detectado na faixa processada. Integridade 100% OK!
                          </div>
                        ) : (
                          auditItems.filter(i => i.status === 'SALTO_SEQUENCIA').map((gap, idx) => (
                            <div key={`gap-${idx}`} className="flex items-center justify-between p-3 rounded-xl bg-amber-50/50 border border-amber-100 font-mono text-xs">
                              <span className="font-bold text-amber-800">Nota Faltante: #{gap.nota}</span>
                              <span className="text-[10px] text-slate-400">Status SEFAZ: Inutilizada / Não Emitida</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* General Invoices Status audit check */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-3">
                        <FileCheck2 className="w-5 h-5 text-emerald-600" />
                        <h4 className="text-xs font-black text-[#04243b] uppercase">Validação de Integridade Geral</h4>
                      </div>

                      <div className="space-y-4 text-xs text-slate-600">
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span>Primeira nota fiscal emitida:</span>
                          <span className="font-mono font-bold text-[#04243b]">#{auditSummary.minNota}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span>Última nota fiscal emitida:</span>
                          <span className="font-mono font-bold text-[#04243b]">#{auditSummary.maxNota}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                          <span>Percentual de Consistência Geral:</span>
                          <span className="font-mono font-bold text-emerald-600">
                            {((auditSummary.sincronizadas / (auditSummary.totalSefaz || 1)) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex gap-2">
                          <Info className="w-4 h-4 text-slate-400 shrink-0" />
                          <p className="text-[10px] text-slate-400 leading-normal">
                            Documentos cancelados na base da SEFAZ são ignorados dos cálculos de diferenças monetárias mas são contabilizados na integridade de numeração.
                          </p>
                        </div>
                      </div>
                    </div>

                  </div>

                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* MODULE 4: CONVERSOR NFC-E SIGA (ACCESS KEYS) */}
          {/* ======================================================== */}
          {activeOutputTab === 'conversor_siga' && (
            <div className="space-y-6 animate-fadeIn font-sans">
              
              {sefazRows.length === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-4">
                  <Database className="w-12 h-12 text-slate-300 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-600 font-sans">Sem Chaves de Notas Indexadas</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto font-sans">
                      Faça o upload do relatório com Chaves de Acesso SEFAZ (NF-e/NFC-e) no Data Lake para carregar a lista.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* Stats of NF-e / NFC-e loaded */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Total Indexado</span>
                      <span className="text-xl font-black text-[#04243b] block mt-1 font-mono">{nfceStats.totalCount} NFs</span>
                      <div className="text-[10px] text-slate-500 mt-1 flex gap-2">
                        <span>Model 55: <strong>{nfceStats.count55}</strong></span>
                        <span>Model 65: <strong>{nfceStats.count65}</strong></span>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Valor Acumulado</span>
                      <span className="text-xl font-black text-slate-800 block mt-1 font-mono">
                        R$ {(nfceStats?.totalValor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-1">Confrontável com extrato ERP</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl text-emerald-800">
                      <span className="text-[10px] uppercase font-bold text-emerald-600">Chaves Válidas</span>
                      <span className="text-xl font-black block mt-1 font-mono">{nfceStats.validKeysCount}</span>
                      <div className="text-[10px] text-emerald-600 mt-1">Comprimento de 44 dígitos</div>
                    </div>
                    <div className="bg-red-50 border border-red-100 p-4 rounded-2xl text-red-800">
                      <span className="text-[10px] uppercase font-bold text-red-600">Chaves Inválidas</span>
                      <span className="text-xl font-black block mt-1 font-mono">{nfceStats.invalidKeysCount}</span>
                      <div className="text-[10px] text-red-600 mt-1">Erros de estrutura</div>
                    </div>
                  </div>

                  {/* Filters / Search controls */}
                  <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                    <div className="relative w-full md:w-80">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchTermNfce}
                        onChange={(e) => setSearchTermNfce(e.target.value)}
                        placeholder="Buscar por Nota, Série, CNPJ..."
                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#04243b]"
                      />
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>Validação do Registro:</span>
                      <select
                        value={filterStatusNfce}
                        onChange={(e) => setFilterStatusNfce(e.target.value as any)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-bold"
                      >
                        <option value="all">Todas as notas ({sefazRows.length})</option>
                        <option value="valid">Apenas Válidas</option>
                        <option value="invalid">Apenas Inválidas</option>
                      </select>
                    </div>
                  </div>

                  {/* List grid list */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100">
                        <tr>
                          <th className="py-2.5 px-3">Chave de Acesso</th>
                          <th className="py-2.5 px-3">Número</th>
                          <th className="py-2.5 px-3">Data Emissão</th>
                          <th className="py-2.5 px-3">CNPJ/CPF Fornecedor</th>
                          <th className="py-2.5 px-3">Nome Fornecedor</th>
                          <th className="py-2.5 px-3">Série</th>
                          <th className="py-2.5 px-3">UF</th>
                          <th className="py-2.5 px-3 text-right">Valor</th>
                          <th className="py-2.5 px-3 text-center">Situação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px] font-mono">
                        {nfceFilteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="text-center py-10 text-slate-400 font-sans">
                              Nenhuma nota fiscal encontrada no filtro selecionado.
                            </td>
                          </tr>
                        ) : (
                          nfceFilteredRows.map((r, idx) => {
                            const ufClean = r.ufNome.includes('(') 
                              ? r.ufNome.substring(r.ufNome.indexOf('(') + 1, r.ufNome.indexOf(')')) 
                              : r.ufNome;
                            return (
                              <tr key={`nfce-row-${idx}`} className="hover:bg-slate-50/50">
                                <td className="py-2 px-3 text-slate-400 select-all font-mono tracking-tight text-[10px]">{r.chaveDeAcesso}</td>
                                <td className="py-2 px-3 font-bold text-[#04243b]">{r.numeroNotaFormatado}</td>
                                <td className="py-2 px-3">{r.dataEmissao}</td>
                                <td className="py-2 px-3 text-slate-500">{r.cnpjFornecedorFormatado || r.cnpjFormatado}</td>
                                <td className="py-2 px-3 font-sans text-slate-700 max-w-xs truncate" title={r.nomeFornecedor}>{r.nomeFornecedor || 'FORNECEDOR NÃO INFORMADO'}</td>
                                <td className="py-2 px-3">{r.serie}</td>
                                <td className="py-2 px-3 font-sans text-slate-600">{ufClean}</td>
                                <td className="py-2 px-3 text-right font-bold text-slate-700">
                                  R$ {(r?.valorDecimal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  {r.situacaoNfe === 'CANCELADA' ? (
                                    <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-md text-[9px] uppercase tracking-wider font-extrabold font-sans">
                                      CANCELADA
                                    </span>
                                  ) : r.situacaoNfe === 'DENEGADA' ? (
                                    <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md text-[9px] uppercase tracking-wider font-extrabold font-sans">
                                      DENEGADA
                                    </span>
                                  ) : (
                                    <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md text-[9px] uppercase tracking-wider font-extrabold font-sans">
                                      AUTORIZADA
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* ======================================================== */}
          {/* MODULE 5: PIS/COFINS MAPPER */}
          {/* ======================================================== */}
          {activeOutputTab === 'pis_cofins' && (
            <div className="space-y-6 animate-fadeIn font-sans">
              
              {pisCofinsRows.length === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-4">
                  <Coins className="w-12 h-12 text-slate-300 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-600 font-sans">Sem Dados de PIS/COFINS Indexados</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto font-sans">
                      Carregue o Demonstrativo de Créditos PIS/COFINS no Data Lake para analisar os itens de Entradas e Saídas mapeados por CFOP e CST.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 font-sans">
                  
                  {/* Compact Consolidated Metadata & Stats Panel */}
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 shadow-2xs space-y-2">
                    {/* Top Row: Company Metadata Bar */}
                    {pisCofinsMetadata && (
                      <div className="bg-[#04243b] text-white px-3 py-1.5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="text-[#e4b35e] text-[9px] font-black uppercase tracking-wider bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700/80 shrink-0">
                            Demonstrativo
                          </span>
                          <h3 className="font-extrabold text-white text-xs truncate max-w-xs md:max-w-md">
                            {pisCofinsMetadata.empresa || 'Empresa não identificada'}
                          </h3>
                          {pisCofinsMetadata.cnpj && (
                            <span className="text-slate-300 text-[11px] font-mono">
                              CNPJ: <strong className="text-white">{pisCofinsMetadata.cnpj}</strong>
                            </span>
                          )}
                          {pisCofinsMetadata.periodo && (
                            <span className="text-slate-300 text-[11px]">
                              Período: <strong className="text-white">{pisCofinsMetadata.periodo}</strong>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-300 font-medium shrink-0">
                          Regime: <span className="text-[#e4b35e] font-extrabold uppercase bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">{pisCofinsMetadata.regime || 'Lucro Real'}</span>
                        </div>
                      </div>
                    )}

                    {/* Bottom Row: Compact 4-Column Metric Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      {/* CRÉDITOS */}
                      <div className="bg-emerald-50/70 border border-emerald-100/80 px-3 py-1.5 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1">
                            <ArrowUpRight className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span className="text-[9px] uppercase font-bold text-emerald-700 block">Créditos (Entradas)</span>
                          </div>
                          <span className="text-xs font-black font-mono text-emerald-900 block mt-0.5">
                            R$ {(pisCofinsStats.pisTotal + pisCofinsStats.cofinstotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="text-[8px] text-right text-emerald-800 font-mono leading-tight space-y-0.5">
                          <div>PIS: R$ {pisCofinsStats.pisTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          <div>COF: R$ {pisCofinsStats.cofinstotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        </div>
                      </div>

                      {/* DÉBITOS */}
                      <div className="bg-rose-50/70 border border-rose-100/80 px-3 py-1.5 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1">
                            <ArrowDownLeft className="w-3 h-3 text-rose-600 shrink-0" />
                            <span className="text-[9px] uppercase font-bold text-rose-700 block">Débitos (Saídas)</span>
                          </div>
                          <span className="text-xs font-black font-mono text-rose-900 block mt-0.5">
                            R$ {(pisCofinsStats.pisDebitoTotal + pisCofinsStats.cofinsDebitoTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="text-[8px] text-right text-rose-800 font-mono leading-tight space-y-0.5">
                          <div>PIS: R$ {pisCofinsStats.pisDebitoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          <div>COF: R$ {pisCofinsStats.cofinsDebitoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        </div>
                      </div>

                      {/* APURAÇÃO PIS */}
                      <div className="bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-500 block">Apuração Líquida PIS</span>
                          <span className={`text-xs font-black font-mono mt-0.5 block ${pisCofinsStats.saldoPis >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            R$ {pisCofinsStats.saldoPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <span className="text-[8px] font-bold uppercase tracking-wide">
                          {pisCofinsStats.saldoPis >= 0 ? (
                            <span className="text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">Crédito</span>
                          ) : (
                            <span className="text-rose-700 bg-rose-100/80 px-1.5 py-0.5 rounded">A Recolher</span>
                          )}
                        </span>
                      </div>

                      {/* APURAÇÃO COFINS */}
                      <div className="bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-500 block">Apuração Líquida COFINS</span>
                          <span className={`text-xs font-black font-mono mt-0.5 block ${pisCofinsStats.saldoCofins >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            R$ {pisCofinsStats.saldoCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <span className="text-[8px] font-bold uppercase tracking-wide">
                          {pisCofinsStats.saldoCofins >= 0 ? (
                            <span className="text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">Crédito</span>
                          ) : (
                            <span className="text-rose-700 bg-rose-100/80 px-1.5 py-0.5 rounded">A Recolher</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ======================================================== */}
                  {/* MAIN NAVIGATION SWITCHER FOR MODULE 3 (RELATÓRIOS vs AUDITORIA) */}
                  {/* ======================================================== */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-1.5 bg-slate-100/90 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center gap-1.5 w-full sm:w-auto">
                      <button
                        onClick={() => setPisCofinsMainScreen('relatorios')}
                        className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          pisCofinsMainScreen === 'relatorios'
                            ? 'bg-[#04243b] text-[#e4b35e] shadow-2xs'
                            : 'bg-white/80 text-slate-600 hover:bg-white hover:text-slate-900 border border-slate-200'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>RELATÓRIOS</span>
                      </button>

                      <button
                        onClick={() => setPisCofinsMainScreen('auditoria')}
                        className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          pisCofinsMainScreen === 'auditoria'
                            ? 'bg-rose-700 text-white shadow-2xs'
                            : 'bg-white/80 text-slate-600 hover:bg-white hover:text-slate-900 border border-slate-200'
                        }`}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>AUDITORIA</span>
                        {pisCofinsAuditErrors.length > 0 && (
                          <span className="bg-white text-rose-700 font-mono text-[9px] font-black rounded-full px-1.5 py-0.2 ml-0.5">
                            {pisCofinsAuditErrors.length}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Export Action Button (Visible on Relatórios screen) */}
                    {pisCofinsMainScreen === 'relatorios' && pisCofinsRows.length > 0 && (
                      <button
                        onClick={handleExportPisCofinsExcel}
                        className="w-full sm:w-auto px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs tracking-wide uppercase rounded-lg shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-white" />
                        Exportar PIS/COFINS Excel
                      </button>
                    )}
                  </div>

                  {/* ======================================================== */}
                  {/* SCREEN 1: RELATÓRIOS */}
                  {/* ======================================================== */}
                  {pisCofinsMainScreen === 'relatorios' && (
                    <div className="space-y-4">
                      {/* Sub-tabs bar for Relatórios with the 5 required options - No line break */}
                      <div className="flex flex-col xl:flex-row gap-3 items-stretch xl:items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-100 p-1.5 rounded-2xl overflow-x-auto max-w-full flex-nowrap scrollbar-none" id="piscofins-main-tabs">
                          {/* 1. Entradas Completo */}
                          <button
                            onClick={() => {
                              setActivePisCofinsSubTab('entradas');
                              setPisCofinsViewMode('original');
                              setPisCofinsOriginalFormat('completo');
                              setPisCofinsCurrentPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                              activePisCofinsSubTab === 'entradas' && pisCofinsViewMode === 'original' && pisCofinsOriginalFormat === 'completo'
                                ? 'bg-[#04243b] text-[#e4b35e] shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 bg-white/60 hover:bg-white'
                            }`}
                          >
                            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="whitespace-nowrap">Entradas Completo</span>
                            <span className="text-[10px] opacity-75 font-mono font-bold">
                              ({pisCofinsRows.filter(i => i.tipo === 'entrada').length})
                            </span>
                          </button>

                          {/* 2. Entradas Resumido */}
                          <button
                            onClick={() => {
                              setActivePisCofinsSubTab('entradas');
                              setPisCofinsViewMode('original');
                              setPisCofinsOriginalFormat('resumido');
                              setPisCofinsCurrentPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                              activePisCofinsSubTab === 'entradas' && pisCofinsViewMode === 'original' && pisCofinsOriginalFormat === 'resumido'
                                ? 'bg-[#04243b] text-[#e4b35e] shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 bg-white/60 hover:bg-white'
                            }`}
                          >
                            <Package className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="whitespace-nowrap">Entradas Resumido</span>
                            <span className="text-[10px] opacity-75 font-mono font-bold">
                              ({consolidatePisCofinsRows(pisCofinsRows, 'cfop_cst_product').filter(i => i.tipo === 'entrada').length})
                            </span>
                          </button>

                          {/* 3. Saídas Completo */}
                          <button
                            onClick={() => {
                              setActivePisCofinsSubTab('saidas');
                              setPisCofinsViewMode('original');
                              setPisCofinsOriginalFormat('completo');
                              setPisCofinsCurrentPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                              activePisCofinsSubTab === 'saidas' && pisCofinsViewMode === 'original' && pisCofinsOriginalFormat === 'completo'
                                ? 'bg-[#04243b] text-[#e4b35e] shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 bg-white/60 hover:bg-white'
                            }`}
                          >
                            <ArrowDownLeft className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span className="whitespace-nowrap">Saídas Completo</span>
                            <span className="text-[10px] opacity-75 font-mono font-bold">
                              ({pisCofinsRows.filter(i => i.tipo === 'saida').length})
                            </span>
                          </button>

                          {/* 4. Saídas Resumido */}
                          <button
                            onClick={() => {
                              setActivePisCofinsSubTab('saidas');
                              setPisCofinsViewMode('original');
                              setPisCofinsOriginalFormat('resumido');
                              setPisCofinsCurrentPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                              activePisCofinsSubTab === 'saidas' && pisCofinsViewMode === 'original' && pisCofinsOriginalFormat === 'resumido'
                                ? 'bg-[#04243b] text-[#e4b35e] shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 bg-white/60 hover:bg-white'
                            }`}
                          >
                            <Package className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span className="whitespace-nowrap">Saídas Resumido</span>
                            <span className="text-[10px] opacity-75 font-mono font-bold">
                              ({consolidatePisCofinsRows(pisCofinsRows, 'cfop_cst_product').filter(i => i.tipo === 'saida').length})
                            </span>
                          </button>

                          {/* 5. Resumo CFOP/CST */}
                          <button
                            onClick={() => {
                              setActivePisCofinsSubTab('todos');
                              setPisCofinsViewMode('consolidated');
                              setPisCofinsCurrentPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                              pisCofinsViewMode === 'consolidated'
                                ? 'bg-[#04243b] text-[#e4b35e] shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 bg-white/60 hover:bg-white'
                            }`}
                          >
                            <Combine className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                            <span className="whitespace-nowrap">Resumo CFOP/CST</span>
                            <span className="text-[10px] opacity-75 font-mono font-bold">
                              ({consolidatePisCofinsRows(pisCofinsRows, 'cfop_cst').length})
                            </span>
                          </button>
                        </div>

                        {/* Search bar */}
                        <div className="relative w-full xl:w-72 shrink-0">
                          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={searchTermPisCofins}
                            onChange={(e) => {
                              setSearchTermPisCofins(e.target.value);
                              setPisCofinsCurrentPage(1);
                            }}
                            placeholder="Buscar por CFOP, CST, Produto..."
                            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#04243b] bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ======================================================== */}
                  {/* SCREEN 2: AUDITORIA */}
                  {/* ======================================================== */}
                  {pisCofinsMainScreen === 'auditoria' && (
                    <div className="space-y-6 animate-fadeIn">
                      {/* Sub-navigation for AUDITORIA (Inconsistências vs Alertas) */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl overflow-x-auto max-w-full flex-nowrap scrollbar-none">
                          <button
                            onClick={() => setPisCofinsAuditType('todas')}
                            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                              pisCofinsAuditType === 'todas'
                                ? 'bg-[#04243b] text-[#e4b35e] shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 bg-white/60 hover:bg-white'
                            }`}
                          >
                            <ShieldAlert className="w-4 h-4 shrink-0" />
                            <span className="whitespace-nowrap">Todas ({pisCofinsAuditErrors.length})</span>
                          </button>

                          <button
                            onClick={() => setPisCofinsAuditType('inconsistencias')}
                            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                              pisCofinsAuditType === 'inconsistencias'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-rose-700 bg-white/60 hover:bg-white'
                            }`}
                          >
                            <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                            <span className="whitespace-nowrap">Inconsistências (Críticas)</span>
                            <span className="bg-rose-100 text-rose-700 font-mono text-[10px] font-black rounded-full px-2 py-0.5">
                              {pisCofinsAuditErrors.filter(e => e.severidade === 'critico').length}
                            </span>
                          </button>

                          <button
                            onClick={() => setPisCofinsAuditType('alertas')}
                            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                              pisCofinsAuditType === 'alertas'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-amber-700 bg-white/60 hover:bg-white'
                            }`}
                          >
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            <span>Alertas (Avisos)</span>
                            <span className="bg-amber-100 text-amber-800 font-mono text-[10px] font-black rounded-full px-2 py-0.5">
                              {pisCofinsAuditErrors.filter(e => e.severidade === 'aviso').length}
                            </span>
                          </button>
                        </div>

                        <div className="text-xs text-slate-500 font-medium">
                          Filtro ativo: <strong className="text-slate-800 uppercase">{pisCofinsAuditType}</strong>
                        </div>
                      </div>

                      {/* Summary statistics bar for audits */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl flex items-center gap-4">
                          <div className="p-3.5 bg-rose-100 text-rose-700 rounded-xl">
                            <ShieldAlert className="w-6 h-6" />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-black text-rose-500 block">Inconsistências (Críticas)</span>
                            <span className="text-2xl font-black text-rose-800 font-mono block mt-0.5">
                              {pisCofinsAuditErrors.filter(e => e.severidade === 'critico').length}
                            </span>
                            <span className="text-[9px] text-rose-600 font-sans block">Erros que travam o envio do SPED</span>
                          </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl flex items-center gap-4">
                          <div className="p-3.5 bg-amber-100 text-amber-700 rounded-xl">
                            <AlertTriangle className="w-6 h-6" />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-black text-amber-500 block">Alertas Fiscais</span>
                            <span className="text-2xl font-black text-amber-800 font-mono block mt-0.5">
                              {pisCofinsAuditErrors.filter(e => e.severidade === 'aviso').length}
                            </span>
                            <span className="text-[9px] text-amber-600 font-sans block">Alíquotas e bases atípicas</span>
                          </div>
                        </div>

                        <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl flex items-center gap-4">
                          <div className="p-3.5 bg-emerald-100 text-emerald-700 rounded-xl">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-black text-emerald-500 block">Taxa de Integridade</span>
                            <span className="text-2xl font-black text-emerald-800 font-mono block mt-0.5">
                              {pisCofinsRows.length > 0 
                                ? `${Math.max(0, Math.round((1 - pisCofinsAuditErrors.length / pisCofinsRows.length) * 100))}%`
                                : '100%'
                              }
                            </span>
                            <span className="text-[9px] text-emerald-600 font-sans block">Dos registros sem inconsistências</span>
                          </div>
                        </div>
                      </div>

                      {/* Filter pills for PIS/COFINS errors */}
                      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-50 border border-slate-100 rounded-2xl">
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('todos')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'todos'
                              ? 'bg-[#04243b] text-[#e4b35e]'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          Todos ({pisCofinsAuditErrors.length})
                        </button>
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('divergencia_bc')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'divergencia_bc'
                              ? 'bg-rose-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          BC Divergente ({pisCofinsAuditErrors.filter(e => e.tipoErro === 'divergencia_bc').length})
                        </button>
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('erro_calculo_pis')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'erro_calculo_pis'
                              ? 'bg-rose-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          Erro Cálculo PIS ({pisCofinsAuditErrors.filter(e => e.tipoErro === 'erro_calculo_pis').length})
                        </button>
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('erro_calculo_cofins')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'erro_calculo_cofins'
                              ? 'bg-rose-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          Erro Cálculo COFINS ({pisCofinsAuditErrors.filter(e => e.tipoErro === 'erro_calculo_cofins').length})
                        </button>
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('cst_incompativel')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'cst_incompativel'
                              ? 'bg-rose-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          CST Incompatível ({pisCofinsAuditErrors.filter(e => e.tipoErro === 'cst_incompativel').length})
                        </button>
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('aliquota_incoerente')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'aliquota_incoerente'
                              ? 'bg-amber-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          Alíquota Incoerente ({pisCofinsAuditErrors.filter(e => e.tipoErro === 'aliquota_incoerente').length})
                        </button>
                        <button
                          onClick={() => setPisCofinsActiveAuditFilter('bc_maior_produto')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            pisCofinsActiveAuditFilter === 'bc_maior_produto'
                              ? 'bg-amber-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          BC &gt; Produto ({pisCofinsAuditErrors.filter(e => e.tipoErro === 'bc_maior_produto').length})
                        </button>
                      </div>

                      {/* Error listing */}
                      <div className="space-y-4">
                        {pisCofinsAuditErrors
                          .filter(e => pisCofinsAuditType === 'todas' || (pisCofinsAuditType === 'inconsistencias' && e.severidade === 'critico') || (pisCofinsAuditType === 'alertas' && e.severidade === 'aviso'))
                          .filter(e => pisCofinsActiveAuditFilter === 'todos' || e.tipoErro === pisCofinsActiveAuditFilter).length === 0 ? (
                          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-8 text-center space-y-3">
                            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                            <h4 className="text-emerald-900 font-bold text-sm">Nenhum erro encontrado!</h4>
                            <p className="text-xs text-emerald-700 max-w-md mx-auto">
                              O filtro selecionado não apresenta inconsistências. Os dados de PIS/COFINS estão em conformidade com as regras de integridade do SPED Contribuições.
                            </p>
                          </div>
                        ) : (
                          pisCofinsAuditErrors
                            .filter(e => pisCofinsAuditType === 'todas' || (pisCofinsAuditType === 'inconsistencias' && e.severidade === 'critico') || (pisCofinsAuditType === 'alertas' && e.severidade === 'aviso'))
                            .filter(e => pisCofinsActiveAuditFilter === 'todos' || e.tipoErro === pisCofinsActiveAuditFilter)
                            .map((err) => (
                              <div
                                key={err.id}
                                className={`border rounded-2xl p-5 bg-white transition-all shadow-2xs hover:shadow-xs flex flex-col md:flex-row gap-4 items-start ${
                                  err.severidade === 'critico' ? 'border-l-4 border-l-rose-500 border-slate-200' : 'border-l-4 border-l-amber-500 border-slate-200'
                                }`}
                              >
                                <div className="flex-1 space-y-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`text-[9px] font-black tracking-wide uppercase px-2 py-0.5 rounded-full ${
                                      err.severidade === 'critico' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                                    }`}>
                                      {err.severidade === 'critico' ? 'Inconsistência Crítica' : 'Alerta Fiscal'}
                                    </span>
                                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                      {err.item.tipo === 'entrada' ? 'ENTRADA (CRÉDITO)' : 'SAÍDA (DÉBITO)'}
                                    </span>
                                    <span className="text-xs font-bold text-[#04243b]">
                                      Nota Fiscal: {err.item.numeroNota}
                                    </span>
                                    <span className="text-[11px] text-slate-500 font-mono">
                                      {err.item.data}
                                    </span>
                                  </div>

                                  <div className="space-y-1">
                                    <h4 className="text-slate-800 font-extrabold text-sm flex items-center gap-1.5">
                                      {err.severidade === 'critico' ? (
                                        <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                                      ) : (
                                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                      )}
                                      {err.titulo}
                                    </h4>
                                    <p className="text-xs text-slate-600 font-sans leading-relaxed">
                                      {err.descricao}
                                    </p>
                                  </div>

                                  {/* Original details box */}
                                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-[11px] font-mono grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600">
                                    <div>
                                      <span className="text-[9px] text-slate-400 font-sans block">Produto:</span>
                                      <span className="font-bold font-sans text-slate-700 truncate block" title={err.item.nomeProduto}>
                                        {err.item.nomeProduto}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-slate-400 font-sans block">CFOP / CST:</span>
                                      <span className="font-bold text-slate-700">
                                        {err.item.cfop} / CST {err.item.cst}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-slate-400 font-sans block">Base PIS/COFINS:</span>
                                      <span className="font-bold text-slate-700 block">
                                        R$ {err.item.baseCalculoPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {err.item.baseCalculoCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-slate-400 font-sans block">Imposto Declarado:</span>
                                      <span className="font-bold text-emerald-700 block">
                                        PIS: R$ {err.item.valorPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / COF: R$ {err.item.valorCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Detailed context/reasons and SPED impacts */}
                                  <div className="text-xs font-sans text-slate-500 bg-slate-50 border-l-2 border-slate-300 p-2.5 rounded-r-xl">
                                    <span className="font-bold block text-slate-700 mb-0.5">Diagnóstico Fiscal:</span>
                                    {err.detalhe}
                                    <span className="font-bold block text-slate-700 mt-2 mb-0.5">Como corrigir no ERP ou SPED:</span>
                                    <span className="text-slate-600 block leading-relaxed">
                                      {err.tipoErro === 'divergencia_bc' && 'Acesse a escrituração do documento fiscal no ERP, verifique o cadastro de tributação do item para corrigir as bases. Elas devem coincidir com o valor bruto da operação deduzido de possíveis exclusões legais.'}
                                      {err.tipoErro === 'erro_calculo_pis' && 'Corrija o arredondamento ou recalcule as alíquotas no sistema contábil. Uma diferença maior que R$ 0.05 causará o erro de soma inválida no validador do SPED Contribuições.'}
                                      {err.tipoErro === 'erro_calculo_cofins' && 'Corrija o arredondamento ou recalcule as alíquotas no sistema contábil. Uma diferença maior que R$ 0.05 causará o erro de soma inválida no validador do SPED Contribuições.'}
                                      {err.tipoErro === 'cst_incompativel' && 'Configure o CST do item com a faixa correspondente para evitar rejeições cadastrais imediatas durante a importação do arquivo no PVA.'}
                                      {err.tipoErro === 'aliquota_incoerente' && 'Verifique se o produto está cadastrado como Monofásico, Alíquota Zero ou Isento. Itens nestas condições devem ter alíquotas zeradas. Itens tributados normalmente devem possuir alíquotas cheias.'}
                                      {err.tipoErro === 'bc_maior_produto' && 'Verifique se não houve digitação errada de casas decimais na Base de Cálculo do produto ou se outros valores não-operacionais foram somados incorretamente à base.'}
                                    </span>
                                  </div>
                                </div>

                                <div className="shrink-0 w-full md:w-auto md:self-stretch flex flex-row md:flex-col justify-end gap-2 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4">
                                  <button
                                    onClick={() => {
                                      setPisCofinsMainScreen('relatorios');
                                      setPisCofinsViewMode('original');
                                      setPisCofinsOriginalFormat('completo');
                                      setActivePisCofinsSubTab('todos');
                                      setSearchTermPisCofins(err.item.numeroNota);
                                      setPisCofinsCurrentPage(1);
                                      const element = document.getElementById('piscofins-main-tabs');
                                      if (element) {
                                        element.scrollIntoView({ behavior: 'smooth' });
                                      }
                                    }}
                                    className="flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all cursor-pointer whitespace-nowrap"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    Ver no Relatório
                                  </button>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Render Table in RELATÓRIOS Screen */}
                  {pisCofinsMainScreen === 'relatorios' && (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100">
                            {pisCofinsViewMode === 'consolidated' ? (
                              <tr>
                                <th className="py-2.5 px-3 whitespace-nowrap font-bold min-w-[75px]">CFOP</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">CST PIS/COF</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">Valor Produto Total</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">Base de Cálculo PIS</th>
                                <th className="py-2.5 px-3 text-center whitespace-nowrap">Alíquota PIS</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">PIS Total</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">Base de Cálculo COFINS</th>
                                <th className="py-2.5 px-3 text-center whitespace-nowrap">Alíquota COFINS</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">COFINS Total</th>
                              </tr>
                            ) : pisCofinsOriginalFormat === 'resumido' ? (
                              <tr>
                                <th className="py-2.5 px-3">Cód Produto</th>
                                <th className="py-2.5 px-3">Descrição Produto</th>
                                <th className="py-2.5 px-3 whitespace-nowrap font-bold min-w-[75px]">CFOP</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">CST PIS/COF</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">Valor Produto Total</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">Base de Cálculo PIS</th>
                                <th className="py-2.5 px-3 text-center whitespace-nowrap">Alíquota PIS</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">PIS Total</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">Base de Cálculo COFINS</th>
                                <th className="py-2.5 px-3 text-center whitespace-nowrap">Alíquota COFINS</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">COFINS Total</th>
                              </tr>
                            ) : (
                              <>
                                <tr>
                                  <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-center">Data Entrada</th>
                                  <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-center">Documento</th>
                                  <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-center">Acumulador</th>
                                  <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-center">Produto</th>
                                  <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap min-w-[200px]">Descrição Produto</th>
                                  <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap text-center">NCM</th>
                                  <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 text-right whitespace-nowrap">Valor Produto</th>
                                  <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 text-right whitespace-nowrap">Valor Contábil</th>
                                  <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap min-w-[75px]">CFOP</th>
                                  <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 text-center whitespace-nowrap">Base Crédito</th>
                                  <th colSpan={5} className="py-1.5 px-3 text-center bg-sky-900 text-sky-100 font-bold border-r border-slate-200">PIS</th>
                                  <th colSpan={5} className="py-1.5 px-3 text-center bg-indigo-900 text-indigo-100 font-bold">COFINS</th>
                                </tr>
                                <tr className="bg-slate-100 text-[9px] text-slate-600 border-t border-slate-200">
                                  <th className="py-1.5 px-2 border-r border-slate-200 text-center">CST PIS</th>
                                  <th className="py-1.5 px-2 border-r border-slate-200 text-center">Vínculo Crédito</th>
                                  <th className="py-1.5 px-2.5 border-r border-slate-200 text-right">Base Cálculo / Qtd</th>
                                  <th className="py-1.5 px-2 border-r border-slate-200 text-center">Alíquota / Unid</th>
                                  <th className="py-1.5 px-2.5 border-r border-slate-200 text-right">Valor PIS</th>
                                  <th className="py-1.5 px-2 border-r border-slate-200 text-center">CST COFINS</th>
                                  <th className="py-1.5 px-2 border-r border-slate-200 text-center">Vínculo Crédito</th>
                                  <th className="py-1.5 px-2.5 border-r border-slate-200 text-right">Base Cálculo / Qtd</th>
                                  <th className="py-1.5 px-2 border-r border-slate-200 text-center">Alíquota / Unid</th>
                                  <th className="py-1.5 px-2.5 text-right">Valor COFINS</th>
                                </tr>
                              </>
                            )}
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-[11px] font-mono">
                            {activePisCofinsDisplayRows.length === 0 ? (
                              <tr>
                                <td colSpan={20} className="text-center py-10 text-slate-400 font-sans">
                                  Nenhum item encontrado para os filtros selecionados.
                                </td>
                              </tr>
                            ) : pisCofinsViewMode === 'consolidated' || pisCofinsOriginalFormat === 'resumido' ? (
                              <PisCofinsSummaryTableRows
                                rows={paginatedActivePisCofinsDisplayRows}
                                isResumido={pisCofinsOriginalFormat === 'resumido' && pisCofinsViewMode === 'original'}
                              />
                            ) : (
                              paginatedActivePisCofinsDisplayRows.map((r, idx) => (
                                <tr key={`piscof-row-f-${idx}`} className={`hover:bg-slate-50/80 transition-colors ${r.isCreditReduction ? 'bg-amber-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                                  <td className="py-2 px-2.5 font-sans text-slate-600 whitespace-nowrap text-center">{r.data}</td>
                                  <td className="py-2 px-2.5 text-slate-700 font-bold whitespace-nowrap text-center">{r.numeroNota}</td>
                                  <td className="py-2 px-2.5 text-slate-600 text-center">{r.acum || '-'}</td>
                                  <td className="py-2 px-2.5 text-slate-700 font-bold text-center">{r.codigoProduto || '-'}</td>
                                  <td className="py-2 px-3 font-sans text-slate-800 font-medium max-w-xs truncate" title={r.nomeProduto}>{r.nomeProduto}</td>
                                  <td className="py-2 px-2.5 text-slate-600 text-center">{r.ncm || '-'}</td>
                                  <td className="py-2 px-2.5 text-right font-semibold text-slate-700 whitespace-nowrap">
                                    R$ {r.valorProduto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="py-2 px-2.5 text-right font-semibold text-slate-700 whitespace-nowrap">
                                    R$ {(r.valorContabil ?? r.valorProduto).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="py-2 px-2.5 text-center font-bold text-[#04243b] whitespace-nowrap">{r.cfop}</td>
                                  <td className="py-2 px-2.5 text-center text-slate-600">{r.baseCred || r.vincCredProd || '-'}</td>
                                  
                                  {/* PIS Block */}
                                  <td className="py-2 px-2 text-center bg-sky-50/40 border-l border-sky-100">
                                    <span className="bg-sky-100 text-sky-800 font-bold px-1.5 py-0.5 rounded text-[10px] font-sans">
                                      {r.cstPis || r.cst || '-'}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-center bg-sky-50/40 text-slate-600">
                                    {r.vincCredPis || r.vincCredProd || '01'}
                                  </td>
                                  <td className="py-2 px-2.5 text-right bg-sky-50/40 text-slate-700 whitespace-nowrap">
                                    R$ {(r.baseCalculoPis !== undefined ? r.baseCalculoPis : r.baseCalculo).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="py-2 px-2 text-center bg-sky-50/40 text-slate-600 font-sans">
                                    {r.aliquotaPis.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%
                                  </td>
                                  <td className="py-2 px-2.5 text-right bg-sky-100/50 text-sky-900 font-bold whitespace-nowrap border-r border-sky-200">
                                    R$ {r.valorPis.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>

                                  {/* COFINS Block */}
                                  <td className="py-2 px-2 text-center bg-indigo-50/40 border-l border-indigo-100">
                                    <span className="bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded text-[10px] font-sans">
                                      {r.cstCofins || r.cst || '-'}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-center bg-indigo-50/40 text-slate-600">
                                    {r.vincCredCofins || r.vincCredProd || '01'}
                                  </td>
                                  <td className="py-2 px-2.5 text-right bg-indigo-50/40 text-slate-700 whitespace-nowrap">
                                    R$ {(r.baseCalculoCofins !== undefined ? r.baseCalculoCofins : r.baseCalculo).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="py-2 px-2 text-center bg-indigo-50/40 text-slate-600 font-sans">
                                    {r.aliquotaCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%
                                  </td>
                                  <td className="py-2 px-2.5 text-right bg-indigo-100/50 text-indigo-900 font-bold whitespace-nowrap">
                                    R$ {r.valorCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {totalPisCofinsPages > 1 && (
                        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 bg-[#04243b]/5">
                          <span className="text-xs text-slate-500 font-sans">
                            Página <strong>{pisCofinsCurrentPage}</strong> de {totalPisCofinsPages} (Exibindo {pisCofinsCurrentPage * pisCofinsItemsPerPage - pisCofinsItemsPerPage + 1} - {Math.min(pisCofinsCurrentPage * pisCofinsItemsPerPage, activePisCofinsDisplayRows.length)} de {activePisCofinsDisplayRows.length} itens)
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setPisCofinsCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={pisCofinsCurrentPage === 1}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition-all cursor-pointer"
                            >
                              Anterior
                            </button>
                            <button
                              onClick={() => setPisCofinsCurrentPage(prev => Math.min(totalPisCofinsPages, prev + 1))}
                              disabled={pisCofinsCurrentPage === totalPisCofinsPages}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition-all cursor-pointer"
                            >
                              Próxima
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}

            </div>
          )}

        </div>
      </div>

      {/* MODAL DE RELATÓRIOS IMPORTADOS */}
      {showLoadedFilesModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-[#04243b] text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#e4b35e]/20 text-[#e4b35e] rounded-xl font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold tracking-tight">
                    Relatórios Importados no Sistema
                  </h3>
                  <p className="text-[11px] text-slate-300 font-medium">
                    Lista de relatórios SEFAZ (SIGA) e ICMS/ERP carregados para auditoria
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowLoadedFilesModal(false)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
              {loadedFiles.length === 0 ? (
                <div className="text-center py-10 text-slate-500 space-y-2">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">Nenhum relatório foi importado ainda</p>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    Utilize os botões de importação para carregar o arquivo da SEFAZ (Entradas/Saídas) ou o relatório de ICMS do seu Sistema/ERP.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1">
                    <span>{loadedFiles.length} {loadedFiles.length === 1 ? 'arquivo importado' : 'arquivos importados'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Tem certeza que deseja limpar todos os relatórios importados?')) {
                          setLoadedFiles([]);
                          setSefazRows([]);
                          setErpIcmsItems([]);
                          setSelectedIcmsProductKeys([]);
                          setIsIcmsProductSelectorOpen(false);
                          setIcmsProductSearchQuery('');
                          setOrganizadorEntradas([]);
                          setOrganizadorSaidas([]);
                          setPisCofinsRows([]);
                          setRawSefazText('');
                          setErpRowsText('');
                          setSigaTaxText('');
                        }
                      }}
                      className="text-xs text-red-600 hover:text-red-800 font-bold hover:underline cursor-pointer"
                    >
                      Limpar todos
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                    {loadedFiles.map((file, idx) => (
                      <div key={idx} className="p-3.5 bg-white hover:bg-slate-50/80 flex items-center justify-between gap-3 transition-all">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2.5 rounded-xl shrink-0 font-bold ${
                            file.type === 'sefaz' ? 'bg-amber-100 text-amber-800' :
                            file.type === 'erp' ? 'bg-sky-100 text-sky-800' :
                            file.type === 'siga_tax' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            <FileText className="w-4 h-4" />
                          </div>

                          <div className="min-w-0">
                            <h4 className="text-xs font-extrabold text-slate-800 truncate" title={file.name}>
                              {file.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                              <span className={`px-2 py-0.5 rounded-md font-extrabold uppercase text-[9px] ${
                                file.type === 'sefaz' ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                                file.type === 'erp' ? 'bg-sky-100 text-sky-900 border border-sky-200' :
                                file.type === 'siga_tax' ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' : 'bg-purple-100 text-purple-900 border border-purple-200'
                              }`}>
                                {file.type === 'sefaz' ? 'SEFAZ / SIGA' : file.type === 'erp' ? 'SISTEMA / ICMS' : file.type.toUpperCase()}
                              </span>
                              <span>•</span>
                              <span className="font-mono font-bold text-slate-700">
                                {file.recordsCount > 0 
                                  ? `${file.recordsCount.toLocaleString('pt-BR')} registros` 
                                  : `${(file.size / 1024).toFixed(1)} KB`
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-3.5 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowLoadedFilesModal(false)}
                className="px-4 py-2 rounded-xl bg-[#04243b] hover:bg-[#083454] text-white text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. PROCESS MONITORING MODAL SPINNER */}
      {isProcessing && (
        <div className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fadeIn" id="workspace-processing-overlay">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 max-w-md w-full shadow-2xl text-center space-y-6">
            <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  className="stroke-[#04243b] stroke-[5] fill-none transition-all duration-300"
                  strokeDasharray={251.2}
                  strokeDashoffset={251.2 - (251.2 * processingProgress) / 100}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-base font-black text-[#04243b] font-mono">{processingProgress}%</span>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-extrabold text-[#04243b] font-sans">
                Processando Documentos Fiscais
              </h3>
              <p className="text-xs text-[#e4b35e] font-extrabold font-sans tracking-wide">
                {processingStage}
              </p>
            </div>

            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-[#e4b35e] h-full rounded-full transition-all duration-300"
                style={{ width: `${processingProgress}%` }}
              ></div>
            </div>

            <p className="text-[10px] text-slate-400 font-sans leading-normal">
              Otimizado para processar arquivos extremamente grandes sem congelar o navegador. Aguarde alguns instantes...
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
