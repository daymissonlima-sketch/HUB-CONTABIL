/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Upload, 
  Trash2, 
  Image as ImageIcon, 
  CheckCircle, 
  AlertCircle, 
  RotateCcw, 
  Building2, 
  Save, 
  FileText,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  Sliders
} from 'lucide-react';
import { Logo } from './Logo';
import { getAppLogoPath, setAppLogoPath, resetAppLogoPath, DEFAULT_LOGO_PATH, getAppLogoScale, setAppLogoScale } from '../utils/logoHelper';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export function ConfiguracoesGerais() {
  const [currentPath, setCurrentPath] = useState<string>(getAppLogoPath());
  const [inputPath, setInputPath] = useState<string>(getAppLogoPath());
  const [logoScale, setLogoScaleState] = useState<number>(getAppLogoScale());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Office Corporate Data stored in localStorage
  const [officeName, setOfficeName] = useState(() => localStorage.getItem('cfg_office_name') || 'Moreira & Lima Contadores Associados');
  const [officeCnpj, setOfficeCnpj] = useState(() => localStorage.getItem('cfg_office_cnpj') || '12.345.678/0001-90');
  const [officePhone, setOfficePhone] = useState(() => localStorage.getItem('cfg_office_phone') || '(85) 3000-0000');
  const [officeCity, setOfficeCity] = useState(() => localStorage.getItem('cfg_office_city') || 'Fortaleza - CE');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setSuccessMsg(null);
    } else {
      setSuccessMsg(msg);
      setErrorMsg(null);
    }
    setTimeout(() => {
      setErrorMsg(null);
      setSuccessMsg(null);
    }, 5000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      showNotification(`O arquivo selecionado (${(file.size / 1024 / 1024).toFixed(2)} MB) excede o limite máximo permitido de 5 MB.`, true);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      showNotification('Por favor, selecione um arquivo de imagem válido (PNG, JPG, SVG ou WEBP).', true);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setAppLogoPath(reader.result);
        setCurrentPath(reader.result);
        setInputPath(reader.result.startsWith('data:') ? 'Imagem carregada (Base64 < 5MB)' : reader.result);
        showNotification('Logotipo importado e salvo com sucesso! Todas as barras e relatórios foram atualizados.');
      }
    };
    reader.onerror = () => {
      showNotification('Erro ao processar a imagem do logotipo.', true);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveManualPath = () => {
    if (!inputPath || inputPath.trim() === '') {
      showNotification('Por favor, informe um caminho de arquivo válido.', true);
      return;
    }
    setAppLogoPath(inputPath.trim());
    setCurrentPath(inputPath.trim());
    showNotification(`Caminho do logotipo alterado para: ${inputPath.trim()}`);
  };

  const handleResetDefault = () => {
    resetAppLogoPath();
    setCurrentPath(DEFAULT_LOGO_PATH);
    setInputPath(DEFAULT_LOGO_PATH);
    setLogoScaleState(1.0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    showNotification('Logotipo restaurado para o padrão físico do sistema (./assets/logo.png).');
  };

  const handleScaleChange = (val: number) => {
    const clamped = parseFloat(Math.min(2.0, Math.max(0.5, val)).toFixed(2));
    setLogoScaleState(clamped);
    setAppLogoScale(clamped);
  };

  const handleSaveOfficeData = () => {
    try {
      localStorage.setItem('cfg_office_name', officeName);
      localStorage.setItem('cfg_office_cnpj', officeCnpj);
      localStorage.setItem('cfg_office_phone', officePhone);
      localStorage.setItem('cfg_office_city', officeCity);
    } catch (e) {
      console.warn('Falha ao salvar no localStorage:', e);
    }
    showNotification('Dados corporativos do escritório salvos para padronização de relatórios.');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Header Banner */}
      <div className="bg-[#04243b] text-slate-100 p-6 rounded-2xl border border-[#e4b35e]/30 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-[#e4b35e]" />
            Configurações Gerais e Padronização Visual
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Gerencie a identidade visual externa do sistema, o caminho físico de arquivos do logotipo (&lt;img&gt;) e as informações corporativas unificadas para relatórios impressos e PDFs.
          </p>
        </div>
        <div className="shrink-0">
          <Logo origin="right center" />
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3 text-xs font-medium">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </motion.div>
      )}

      {successMsg && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3 text-xs font-medium">
          <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </motion.div>
      )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Card 1: Logo Management */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#e4b35e]/15 text-[#04243b]">
                <ImageIcon className="h-5 w-5 text-[#04243b]" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Logotipo do Sistema (&lt;img&gt; Asset)</h2>
                <p className="text-[11px] text-slate-500">Substituição externa e gerenciamento visual (limite 5 MB)</p>
              </div>
            </div>
          </div>

          {/* Current Preview Box (Fundo Transparente herdado) */}
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center gap-4 text-center shadow-inner">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preview Ativo no Topo e Relatórios</span>
            <div
              className="p-4 rounded-xl border border-dashed border-slate-700/60 flex items-center justify-center min-h-[90px] w-full"
              style={{ backgroundColor: 'transparent' }}
            >
              <Logo origin="center" />
            </div>
          </div>

          {/* Zoom Control Slider (Escala Dinâmica) */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <Sliders className="h-4 w-4 text-[#04243b]" />
                Zoom do Logotipo (Escala Dinâmica)
              </span>
              <span className="font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md font-bold">
                {(logoScale * 100).toFixed(0)}%
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleScaleChange(logoScale - 0.1)}
                className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                title="Diminuir Zoom"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={logoScale}
                onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                className="w-full accent-[#04243b] cursor-pointer"
              />
              
              <button
                type="button"
                onClick={() => handleScaleChange(logoScale + 0.1)}
                className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                title="Aumentar Zoom"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              Ajusta o tamanho visual dinâmico em todo o sistema (navbar e relatórios) mantendo transparência.
            </p>
          </div>

          {/* File Upload Zone */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-700">
              Incluir ou Alterar Logotipo (Arquivo de Imagem até 5 MB)
            </label>
            
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center hover:border-[#e4b35e] hover:bg-slate-50/50 transition-all cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="h-8 w-8 text-[#e4b35e] mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-700">Clique para enviar um arquivo do computador</p>
              <p className="text-[10px] text-slate-500 mt-1">Suporta PNG, JPG, WEBP e SVG • Tamanho máximo permitido: 5.00 MB</p>
            </div>
          </div>

          {/* Manual Asset Path Setting */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700">
              Ou definir Caminho de Arquivo Físico / Relativo
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputPath.startsWith('data:') ? '' : inputPath}
                placeholder="Ex: ./assets/logo.png"
                onChange={(e) => setInputPath(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#e4b35e]/40 font-mono"
              />
              <button
                onClick={handleSaveManualPath}
                className="px-4 py-2 rounded-xl bg-[#04243b] text-[#e4b35e] text-xs font-bold hover:bg-[#031d30] transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Save className="h-3.5 w-3.5" />
                Aplicar
              </button>
            </div>
            <p className="text-[10px] text-slate-400">
              Referência direta a arquivos estáticos na pasta de assets do servidor web.
            </p>
          </div>

          {/* Reset Button */}
          <div className="pt-2 flex justify-end">
            <button
              onClick={handleResetDefault}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              Restaurar Padrão do Sistema (./assets/logo.png)
            </button>
          </div>
        </div>

        {/* Card 2: Corporate Office Configuration */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#04243b]/10 text-[#04243b]">
                <Building2 className="h-5 w-5 text-[#04243b]" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Padronização de Relatórios</h2>
                <p className="text-[11px] text-slate-500">Dados padronizados exibidos no cabeçalho de planilhas e PDFs</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Razão Social do Escritório Contábil</label>
              <input
                type="text"
                value={officeName}
                onChange={(e) => setOfficeName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#04243b]/40"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">CNPJ do Escritório</label>
                <input
                  type="text"
                  value={officeCnpj}
                  onChange={(e) => setOfficeCnpj(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#04243b]/40 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Telefone / Contato</label>
                <input
                  type="text"
                  value={officePhone}
                  onChange={(e) => setOfficePhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#04243b]/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Cidade / Estado Sede</label>
              <input
                type="text"
                value={officeCity}
                onChange={(e) => setOfficeCity(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#04243b]/40"
              />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <p className="font-bold text-slate-700">Nota de Arquitetura de Software:</p>
              <p className="text-[11px]">
                A eliminação do código gráfico hardcoded reduz a complexidade estrutural do front-end e garante a consistência visual em todas as impressões e exportações PDF/XLSX da empresa.
              </p>
            </div>

            <button
              onClick={handleSaveOfficeData}
              className="w-full py-3 rounded-xl bg-[#04243b] text-[#e4b35e] font-bold text-xs hover:bg-[#031d30] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <Save className="h-4 w-4" />
              Salvar Padronização de Relatórios
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
