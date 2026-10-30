/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Upload, FileCode, AlertCircle, Sparkles, FileUp } from 'lucide-react';
import { motion } from 'motion/react';

interface UploadZoneProps {
  onFilesParsed: (xmlTexts: string[]) => void;
  isLoading: boolean;
  onLoadExampleData: () => void;
}

export function UploadZone({ onFilesParsed, isLoading, onLoadExampleData }: UploadZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const processFiles = async (files: FileList) => {
    setErrorMessage(null);
    const xmlFiles = Array.from(files).filter(file => file.name.endsWith('.xml') || file.type === 'text/xml');
    
    if (xmlFiles.length === 0) {
      setErrorMessage('Nenhum arquivo XML válido foi selecionado. Por favor, envie arquivos com extensão .xml.');
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
      onFilesParsed(results);
    } catch (err: any) {
      setErrorMessage(err.message || 'Ocorreu um erro ao ler os arquivos XML.');
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(e.target.files);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
      <div className="text-center max-w-xl mx-auto mb-6">
        <h2 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight font-sans">
          Envie seus documentos fiscais (XML)
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Arraste e solte múltiplos arquivos XML de notas fiscais eletrônicas (NFe) ou clique para selecioná-los no seu computador.
        </p>
      </div>

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
        className={`relative group cursor-pointer border-2 border-dashed rounded-xl p-8 sm:p-12 transition-all duration-300 flex flex-col items-center justify-center ${
          isDragActive
            ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
            : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50/50'
        }`}
        id="xml-dropzone"
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".xml"
          onChange={handleChange}
        />

        <motion.div
          animate={{ y: isDragActive ? -4 : 0 }}
          className={`p-4 rounded-full mb-4 transition-colors duration-300 ${
            isDragActive ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-500'
          }`}
        >
          {isDragActive ? (
            <FileUp className="h-8 w-8 animate-bounce" />
          ) : (
            <Upload className="h-8 w-8" />
          )}
        </motion.div>

        <p className="text-sm font-semibold text-slate-700">
          {isDragActive ? 'Solte os arquivos XML aqui!' : 'Arraste e solte os arquivos XML aqui'}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          ou clique para procurar no seu dispositivo
        </p>
      </div>

      {errorMessage && (
        <div className="mt-4 flex items-center space-x-2 bg-red-50 border border-red-200 p-3.5 rounded-lg text-xs text-red-700 font-sans">
          <AlertCircle className="h-4.5 w-4.5 text-red-500 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Auxiliary testing triggers */}
      <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
          <span>Não possui arquivos XML de teste à disposição no momento?</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLoadExampleData();
          }}
          className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-[#042838] hover:bg-[#031d29] text-white hover:text-[#dfb25e] font-bold text-xs py-2.5 px-4 rounded-lg border border-[#dfb25e]/25 shadow-sm transition-all duration-300 font-sans cursor-pointer shrink-0"
        >
          <FileCode className="h-4 w-4 text-[#dfb25e]" />
          <span>Carregar Notas Fiscais de Exemplo</span>
        </button>
      </div>
    </div>
  );
}
