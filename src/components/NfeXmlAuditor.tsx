/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { UploadZone } from './UploadZone';
import { StatsBanner } from './StatsBanner';
import { NfeGrid } from './NfeGrid';
import { NFeItemRow } from '../types';
import { parseNfeXml } from '../utils/xmlParser';
import { exportToExcel } from '../utils/excelExporter';
import { MOCK_NFES } from '../utils/mockNfes';
import { 
  FileCheck2, 
  Trash2, 
  AlertTriangle,
  FileUp
} from 'lucide-react';

export function NfeXmlAuditor() {
  const [parsedRows, setParsedRows] = useState<NFeItemRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isGlobalDragActive, setIsGlobalDragActive] = useState<boolean>(false);
  const dragCounter = useRef<number>(0);

  // Default simulation rates to use for new parses
  const ibsRate = 17.7;
  const cbsRate = 8.8;

  const triggerSuccessNotification = (msg: string) => {
    setSuccessMessage(msg);
    setErrorMessage(null);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 5000);
  };

  const triggerErrorNotification = (msg: string) => {
    setErrorMessage(msg);
    setSuccessMessage(null);
    setTimeout(() => {
      setErrorMessage(null);
    }, 6000);
  };

  // Process a batch of XML text content
  const handleFilesParsed = async (xmlTexts: string[]) => {
    setIsLoading(true);
    try {
      const allRows: NFeItemRow[] = [];
      for (const xml of xmlTexts) {
        const rows = await parseNfeXml(xml, true, ibsRate, cbsRate);
        allRows.push(...rows);
      }
      
      setParsedRows(prev => {
        // Prevent duplicate rows by checking ID (chNFe + item number)
        const existingIds = new Set(prev.map(r => r.id));
        const nonDuplicates = allRows.filter(r => !existingIds.has(r.id));
        return [...prev, ...nonDuplicates];
      });

      triggerSuccessNotification(`${xmlTexts.length} arquivo(s) XML processado(s) com sucesso!`);
    } catch (err: any) {
      triggerErrorNotification(err.message || 'Erro ao processar um ou mais arquivos XML.');
    } finally {
      setIsLoading(false);
    }
  };

  // Load sample XMLs for immediate visual demonstration
  const handleLoadExampleData = async () => {
    setIsLoading(true);
    try {
      const allRows: NFeItemRow[] = [];
      for (const xml of MOCK_NFES) {
        const rows = await parseNfeXml(xml, true, ibsRate, cbsRate);
        allRows.push(...rows);
      }
      setParsedRows(allRows);
      triggerSuccessNotification('Notas Fiscais de exemplo carregadas com sucesso!');
    } catch (err: any) {
      triggerErrorNotification('Erro ao carregar notas de exemplo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRowUpdate = (updatedRow: NFeItemRow) => {
    setParsedRows(prev => prev.map(row => row.id === updatedRow.id ? updatedRow : row));
  };

  const handleExport = (rowsToExport: NFeItemRow[], visibleColumns: string[], reportName: string) => {
    exportToExcel(rowsToExport, visibleColumns, reportName);
    triggerSuccessNotification(`Planilha Excel "${reportName}" gerada com sucesso!`);
  };

  const handleClearAll = () => {
    setShowClearConfirm(true);
  };

  const confirmClearAll = () => {
    setParsedRows([]);
    setShowClearConfirm(false);
    triggerSuccessNotification('Todos os dados foram limpos com sucesso.');
  };

  const processFilesBatch = async (files: FileList) => {
    const xmlFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.xml') || file.type === 'text/xml');
    
    if (xmlFiles.length === 0) {
      triggerErrorNotification('Nenhum arquivo XML válido foi arrastado. Por favor, envie arquivos com extensão .xml.');
      return;
    }

    const promises = xmlFiles.map(file => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            resolve(e.target.result as string);
          } else {
            reject(new Error(`Erro ao ler arquivo ${file.name}`));
          }
        };
        reader.onerror = () => reject(new Error(`Erro de leitura no arquivo ${file.name}`));
        reader.readAsText(file);
      });
    });

    try {
      const results = await Promise.all(promises);
      await handleFilesParsed(results);
    } catch (err: any) {
      triggerErrorNotification(err.message || 'Ocorreu um erro ao ler os arquivos XML.');
    }
  };

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
      await processFilesBatch(e.dataTransfer.files);
    }
  };

  return (
    <div 
      onDragEnter={handleGlobalDragEnter}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
      className="flex-grow flex flex-col relative"
    >
      {/* Success Banner Notification */}
      {successMessage && (
        <div className="mb-6 flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl shadow-sm text-xs sm:text-sm animate-fadeIn">
          <div className="flex items-center space-x-2">
            <FileCheck2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {/* Error Banner Notification */}
      {errorMessage && (
        <div className="mb-6 flex items-center justify-between bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl shadow-sm text-xs sm:text-sm animate-fadeIn">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {parsedRows.length === 0 ? (
        /* Empty state - Upload Zone */
        <div className="space-y-6">
          <UploadZone 
            onFilesParsed={handleFilesParsed} 
            isLoading={isLoading} 
            onLoadExampleData={handleLoadExampleData} 
          />
        </div>
      ) : (
        /* Active State - Dashboard, Stats and Grid */
        <div className="space-y-6 animate-fadeIn">
          
          {/* Quick action bar */}
          <div className="flex items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-[#042838] tracking-tight">
                Painel de Documentos Fiscais Carregados
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Visualize, filtre e edite informações antes de gerar sua planilha Excel personalizada.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleClearAll}
                className="flex items-center space-x-1.5 px-4 py-2 bg-[#042838]/5 border border-red-200 hover:bg-red-50 text-red-600 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer"
                id="btn-clear-all-data"
                title="Limpar todos os dados importados"
              >
                <Trash2 className="h-4 w-4" />
                <span>Limpar Tudo</span>
              </button>
            </div>
          </div>

          {/* Stats Consolidated rows */}
          <StatsBanner rows={parsedRows} />

          {/* Interactive Data grid */}
          <NfeGrid 
            rows={parsedRows} 
            onRowUpdate={handleRowUpdate} 
            onExport={handleExport}
          />

        </div>
      )}

      {/* Custom Confirmation Modal for Clear All */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-100 max-w-md w-full p-6 shadow-xl">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-red-50 text-red-600 rounded-full shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1 flex-grow">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Limpar todos os dados?
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                  Esta ação irá remover permanentemente todos os documentos fiscais carregados do painel e redefinir a visualização atual. Você não poderá desfazer essa operação.
                </p>
              </div>
            </div>
            
            <div className="mt-6 flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={confirmClearAll}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs sm:text-sm font-bold tracking-wide shadow-sm transition-colors cursor-pointer"
              >
                Confirmar e Limpar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Drag and Drop Overlay */}
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
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-6 bg-[#042838]/85 backdrop-blur-md transition-all duration-300"
        >
          <div className="max-w-md w-full border-2 border-dashed border-emerald-400 rounded-3xl bg-slate-900/90 p-8 sm:p-10 flex flex-col items-center justify-center text-center space-y-6 shadow-2xl">
            <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full animate-bounce">
              <FileUp className="h-12 w-12" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                Solte seus arquivos XML aqui!
              </h3>
              <p className="text-xs sm:text-sm text-emerald-400 font-semibold">
                Importando notas fiscais eletrônicas (NF-e ou NFC-e)
              </p>
              <p className="text-[11px] sm:text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                Arraste e solte múltiplos arquivos XML de NF-e (Modelo 55) ou NFC-e (Modelo 65) em qualquer lugar para carregar na planilha.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
