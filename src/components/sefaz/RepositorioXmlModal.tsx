/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Modal de Gestão do Repositório de XMLs Fiscais Organizados por Empresa e Mês de Emissão
 * Estrutura automática:
 *   📁 <Pasta Raiz Escolhida>
 *     └── 📁 <RAZAO_SOCIAL_CNPJ>
 *           └── 📁 <AAAA-MM> (Mês de Emissão)
 *                 └── 📄 <CHAVE_44_DIGITOS>.xml
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderOpen,
  FolderCheck,
  FolderKanban,
  Download,
  RefreshCw,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  X,
  HardDrive,
  Archive,
  ExternalLink,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import JSZip from 'jszip';
import { DocumentoFiscalArmazenado } from '../../types/sefazTypes';
import {
  ConfigRepositorioXml,
  loadRepoConfig,
  saveRepoConfig,
  getLocalDirectoryHandle,
  selecionarPastaFisicaNoComputador,
  garantirPermissaoEscritaPastaLocal,
  salvarXmlNaPastaLocalComputador,
  montarCaminhoRelativoXml
} from '../../services/sefazLocalFolderService';
import { isXmlNfeCompletaOficial } from '../../services/sefazIndexedDb';

interface RepositorioXmlModalProps {
  isOpen: boolean;
  onClose: () => void;
  allDocs: DocumentoFiscalArmazenado[];
  onEnsureXmlForDoc: (doc: DocumentoFiscalArmazenado) => Promise<string>;
  onPurgeAllDocs?: () => Promise<void>;
}

const NOMES_MESES: Record<string, string> = {
  '01': 'Janeiro',
  '02': 'Fevereiro',
  '03': 'Março',
  '04': 'Abril',
  '05': 'Maio',
  '06': 'Junho',
  '07': 'Julho',
  '08': 'Agosto',
  '09': 'Setembro',
  '10': 'Outubro',
  '11': 'Novembro',
  '12': 'Dezembro'
};

export function RepositorioXmlModal({
  isOpen,
  onClose,
  allDocs,
  onEnsureXmlForDoc,
  onPurgeAllDocs
}: RepositorioXmlModalProps) {
  const [config, setConfig] = useState<ConfigRepositorioXml>(loadRepoConfig());
  const [hasLocalHandle, setHasLocalHandle] = useState<boolean>(Boolean(getLocalDirectoryHandle()));
  const [expandedEmpresas, setExpandedEmpresas] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setConfig(loadRepoConfig());
      setHasLocalHandle(Boolean(getLocalDirectoryHandle()));
      try {
        setIsInIframe(window.self !== window.top);
      } catch {
        setIsInIframe(true);
      }
    }
  }, [isOpen]);

  // Agrupa todos os documentos fiscais por Pasta da Empresa -> Pasta Mês de Emissão (AAAA-MM)
  const arvorePastas = useMemo(() => {
    const mapaEmpresas = new Map<
      string,
      {
        pastaEmpresa: string;
        razaoSocial: string;
        cnpj: string;
        meses: Map<string, DocumentoFiscalArmazenado[]>;
      }
    >();

    allDocs.forEach(doc => {
      const { pastaEmpresa, pastaMes } = montarCaminhoRelativoXml(doc);
      if (!mapaEmpresas.has(pastaEmpresa)) {
        mapaEmpresas.set(pastaEmpresa, {
          pastaEmpresa,
          razaoSocial: doc.empresaRazaoSocial || pastaEmpresa,
          cnpj: doc.empresaCnpj || '',
          meses: new Map()
        });
      }
      const empEntry = mapaEmpresas.get(pastaEmpresa)!;
      if (!empEntry.meses.has(pastaMes)) {
        empEntry.meses.set(pastaMes, []);
      }
      empEntry.meses.get(pastaMes)!.push(doc);
    });

    return Array.from(mapaEmpresas.values()).map(emp => {
      const listaMeses = Array.from(emp.meses.entries())
        .map(([mesAno, docs]) => {
          const [ano, mes] = mesAno.split('-');
          const nomeMes = mes && NOMES_MESES[mes] ? `${NOMES_MESES[mes]}/${ano}` : mesAno;
          return {
            mesAno,
            nomeMes,
            docs
          };
        })
        .sort((a, b) => b.mesAno.localeCompare(a.mesAno));

      const totalDocs = listaMeses.reduce((acc, m) => acc + m.docs.length, 0);
      return {
        ...emp,
        listaMeses,
        totalDocs
      };
    });
  }, [allDocs]);

  useEffect(() => {
    if (arvorePastas.length > 0 && expandedEmpresas.size === 0) {
      setExpandedEmpresas(new Set([arvorePastas[0].pastaEmpresa]));
    }
  }, [arvorePastas, expandedEmpresas.size]);

  if (!isOpen) return null;

  const handleUpdateConfig = (partial: Partial<ConfigRepositorioXml>) => {
    const updated = saveRepoConfig(partial);
    setConfig(updated);
  };

  // Selecionar pasta física do computador via File System Access API
  const handleSelecionarPastaComputador = async () => {
    setErrorMsg(null);
    setFeedbackMsg(null);

    const res = await selecionarPastaFisicaNoComputador();
    if (res.ok && res.nomePasta) {
      setHasLocalHandle(true);
      setConfig(loadRepoConfig());
      setFeedbackMsg(
        `Pasta local "${res.nomePasta}" conectada com sucesso no seu computador! Clique em "Gravar XMLs na Pasta do Computador Agora" para criar automaticamente as subpastas <Empresa>/<AAAA-MM>/<Chave>.xml.`
      );
    } else if (res.motivo && res.motivo !== 'CANCELADO') {
      setErrorMsg(res.mensagem || 'Não foi possível selecionar a pasta local.');
    }
  };

  // Grava diretamente no disco local do computador (<Pasta Escolhida>/<Empresa>/<AAAA-MM>/<Chave>.xml)
  const handleGravarDiretoNaPastaLocal = async () => {
    setIsSyncing(true);
    setErrorMsg(null);
    setFeedbackMsg(null);

    try {
      let temPerm = await garantirPermissaoEscritaPastaLocal();
      if (!temPerm) {
        const sel = await selecionarPastaFisicaNoComputador();
        if (!sel.ok) {
          if (sel.mensagem) setErrorMsg(sel.mensagem);
          return;
        }
        setHasLocalHandle(true);
        setConfig(loadRepoConfig());
        temPerm = true;
      }

      let gravados = 0;
      let pendentesLiberacao = 0;

      for (const doc of allDocs) {
        const xml = await onEnsureXmlForDoc(doc);
        if (xml && isXmlNfeCompletaOficial(xml)) {
          const ok = await salvarXmlNaPastaLocalComputador(doc, xml);
          if (ok) gravados++;
        } else {
          pendentesLiberacao++;
        }
      }

      if (gravados > 0) {
        setFeedbackMsg(
          `Sucesso! ${gravados} arquivo(s) XML originais (procNFe) foram gravados diretamente na pasta "${config.nomePastaLocalComputador || 'escolhida'}" do seu computador em subpastas <Empresa>/<AAAA-MM>/<Chave>.xml!${
            pendentesLiberacao > 0 ? ` (${pendentesLiberacao} nota(s) ainda estão em Resumo aguardando liberação do procNFe pela SEFAZ).` : ''
          }`
        );
      } else {
        setErrorMsg(
          pendentesLiberacao > 0
            ? 'Os documentos listados ainda estão apenas como Resumo/Evento na SEFAZ (aguardando liberação do XML completo procNFe).'
            : 'Nenhum XML completo disponível para gravar.'
        );
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao gravar arquivos na pasta local.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Baixa para o computador a estrutura completa de pastas (<Empresa>/<AAAA-MM>/<Chave>.xml) em ZIP
  const handleBaixarEstruturaPastasZip = async (filtroEmpresa?: string, filtroMes?: string) => {
    setIsSyncing(true);
    setErrorMsg(null);
    setFeedbackMsg(null);

    try {
      const zip = new JSZip();
      let countCompletos = 0;
      let countResumos = 0;

      for (const doc of allDocs) {
        const { pastaEmpresa, pastaMes, caminhoCompletoRelativo } = montarCaminhoRelativoXml(doc);
        if (filtroEmpresa && pastaEmpresa !== filtroEmpresa) continue;
        if (filtroMes && pastaMes !== filtroMes) continue;

        const xml = await onEnsureXmlForDoc(doc);
        if (xml && isXmlNfeCompletaOficial(xml)) {
          zip.file(caminhoCompletoRelativo, xml);
          countCompletos++;
        } else {
          countResumos++;
        }
      }

      if (countCompletos === 0) {
        setErrorMsg(
          countResumos > 0
            ? `As ${countResumos} nota(s) desta seleção ainda estão apenas com Resumo (resNFe) ou Evento na SEFAZ. Aguarde a SEFAZ liberar o XML completo (procNFe) após a Ciência da Operação.`
            : 'Nenhum XML completo (procNFe) encontrado para esta pasta.'
        );
        return;
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const sufixo = filtroEmpresa
        ? filtroMes
          ? `${filtroEmpresa}_${filtroMes}`
          : filtroEmpresa
        : `Empresas_Por_Mes_${new Date().toISOString().slice(0, 10)}`;
      link.download = `XMLs_Oficiais_${sufixo}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setFeedbackMsg(
        `Download concluído! ${countCompletos} arquivo(s) XML originais (procNFe) baixados na estrutura de pastas <Empresa>/<AAAA-MM>/<Chave>.xml${
          countResumos > 0 ? ` (${countResumos} resumo(s) ignorado(s) para garantir apenas XMLs completos oficiais).` : '!'
        }`
      );
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao baixar pastas.');
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleExpandEmpresa = (pastaEmpresa: string) => {
    setExpandedEmpresas(prev => {
      const next = new Set(prev);
      if (next.has(pastaEmpresa)) next.delete(pastaEmpresa);
      else next.add(pastaEmpresa);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#04243b] text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-[#e4b35e] text-[#04243b]">
              <FolderKanban className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Repositório de XMLs no Computador (Separado por Empresa e Mês de Emissão)
              </h2>
              <p className="text-xs text-slate-300">
                Estrutura automática: <code className="text-[#e4b35e] font-mono">Pasta Escolhida / Nome_Empresa_CNPJ / AAAA-MM / Chave_44_Digitos.xml</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          
          {feedbackMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{feedbackMsg}</span>
              </div>
              <button onClick={() => setFeedbackMsg(null)} className="text-emerald-600 hover:text-emerald-800">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 font-medium flex items-center justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
              <button onClick={() => setErrorMsg(null)} className="text-rose-600 hover:text-rose-800 shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Explicação técnica transparente sobre gravação em pasta local no navegador */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div className="space-y-1">
                <div className="font-bold text-[#04243b] text-sm flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-[#e4b35e]" />
                  <span>Como Salvar nas Pastas do Seu Computador (2 Formas Disponíveis)</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  <strong>Forma 1 (Gravação Direta no Disco — Chrome / Edge em Aba Direta ou Netlify):</strong> Clique em <em>"Escolher Pasta no Computador"</em>. O sistema criará automaticamente as subpastas <code className="font-mono bg-white px-1 rounded border">Empresa / AAAA-MM / Chave.xml</code> dentro da pasta escolhida.<br />
                  <strong>Forma 2 (Universal — Pacote ZIP já com todas as Pastas):</strong> Clique em <em>"Baixar Todas as Pastas (.ZIP)"</em>. Ao extrair o arquivo no seu computador, todas as pastas de empresas e meses já vêm prontas e separadas.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {isInIframe && (
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                    title="Em janelas de pré-visualização (iframe), o navegador bloqueia o seletor de pastas do Windows. Abra em uma nova guia para liberar a gravação direta no disco!"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Abrir em Nova Guia (Liberar Pasta Local)</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={handleSelecionarPastaComputador}
                  className="px-4 py-2 bg-[#04243b] hover:bg-[#031d30] text-white font-bold rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  <FolderOpen className="h-4 w-4 text-[#e4b35e]" />
                  <span>
                    {hasLocalHandle && config.nomePastaLocalComputador
                      ? `Pasta Conectada: ${config.nomePastaLocalComputador} (Alterar)`
                      : 'Escolher Pasta no Computador'}
                  </span>
                </button>
              </div>
            </div>

            {hasLocalHandle && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
                <div className="text-emerald-900">
                  <span className="font-bold">✓ Pasta física vinculada:</span>{' '}
                  <code className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-emerald-200">
                    {config.nomePastaLocalComputador || 'Pasta Local'} / &lt;Empresa&gt; / &lt;AAAA-MM&gt; / &lt;Chave&gt;.xml
                  </code>
                </div>
                <button
                  type="button"
                  onClick={handleGravarDiretoNaPastaLocal}
                  disabled={isSyncing || allDocs.length === 0}
                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Gravar XMLs na Pasta do Computador Agora</span>
                </button>
              </div>
            )}

            {/* Opções de Automação */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-slate-300">
                <input
                  type="checkbox"
                  checked={config.manifestarCienciaAutomaticamente}
                  onChange={(e) => handleUpdateConfig({ manifestarCienciaAutomaticamente: e.target.checked })}
                  className="mt-0.5 rounded text-[#04243b]"
                />
                <div>
                  <span className="font-bold text-slate-800 block">Ciência da Operação Automática (210210)</span>
                  <span className="text-[11px] text-slate-500">
                    Manifesta apenas Ciência da Operação (210210) automaticamente ao buscar o XML. A próxima manifestação fica a cargo do usuário.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-slate-300">
                <input
                  type="checkbox"
                  checked={config.salvarAutomaticamenteNoRepositorio}
                  onChange={(e) => handleUpdateConfig({ salvarAutomaticamenteNoRepositorio: e.target.checked })}
                  className="mt-0.5 rounded text-[#04243b]"
                />
                <div>
                  <span className="font-bold text-slate-800 block">Separar por Empresa e Mês</span>
                  <span className="text-[11px] text-slate-500">
                    Organiza automaticamente cada XML na estrutura <code className="font-mono">Empresa / AAAA-MM / Chave.xml</code>.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-slate-300">
                <input
                  type="checkbox"
                  checked={config.baixarAutomaticamenteNoNavegador}
                  onChange={(e) => handleUpdateConfig({ baixarAutomaticamenteNoNavegador: e.target.checked })}
                  className="mt-0.5 rounded text-[#04243b]"
                />
                <div>
                  <span className="font-bold text-slate-800 block">Download Individual no Navegador</span>
                  <span className="text-[11px] text-slate-500">
                    Dispara o download imediato para a pasta Downloads do navegador a cada XML completo capturado.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Bloco 2: Explorador das Pastas Organizadas por Empresa e por Mês de Emissão */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <FolderCheck className="h-4 w-4 text-emerald-600" />
                  <span>Pastas Organizadas por Empresa e Mês de Emissão ({allDocs.length} documento(s))</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Clique em qualquer empresa ou mês abaixo para baixar a pasta já organizada para o seu computador.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleBaixarEstruturaPastasZip()}
                  disabled={isSyncing || allDocs.length === 0}
                  className="px-4 py-2 bg-[#e4b35e] hover:bg-[#d6a54f] text-[#04243b] font-bold rounded-xl shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Archive className="h-4 w-4" />
                  <span>{isSyncing ? 'Preparando Pastas...' : 'Baixar Todas as Pastas (.ZIP: Empresa / Mês)'}</span>
                </button>
              </div>
            </div>

            {arvorePastas.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500">
                Nenhum documento capturado no momento. Execute uma consulta na SEFAZ para capturar os XMLs originais e organizá-los automaticamente por Empresa e Mês de Emissão.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl divide-y divide-slate-200 overflow-hidden bg-white">
                {arvorePastas.map(emp => {
                  const isExpanded = expandedEmpresas.has(emp.pastaEmpresa);
                  return (
                    <div key={emp.pastaEmpresa}>
                      {/* Linha da Pasta da Empresa */}
                      <div className="p-3.5 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between transition-colors">
                        <button
                          type="button"
                          onClick={() => toggleExpandEmpresa(emp.pastaEmpresa)}
                          className="flex items-center gap-2.5 text-left flex-1 cursor-pointer"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-slate-500" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-slate-500" />
                          )}
                          <FolderOpen className="h-5 w-5 text-[#e4b35e] shrink-0" />
                          <div>
                            <div className="font-bold text-[#04243b] text-xs">
                              📁 {emp.pastaEmpresa}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {emp.razaoSocial} • {emp.listaMeses.length} pasta(s) de mês • {emp.totalDocs} registro(s)
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleBaixarEstruturaPastasZip(emp.pastaEmpresa)}
                          disabled={isSyncing}
                          className="px-3 py-1.5 bg-white hover:bg-slate-50 text-[#04243b] border border-slate-300 rounded-lg font-bold text-[11px] flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Baixar Pasta da Empresa (.ZIP)</span>
                        </button>
                      </div>

                      {/* Subpastas por Mês de Emissão (AAAA-MM) */}
                      {isExpanded && (
                        <div className="pl-8 pr-4 py-2.5 bg-white divide-y divide-slate-100">
                          {emp.listaMeses.map(m => (
                            <div
                              key={m.mesAno}
                              className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg"
                            >
                              <div className="flex items-center gap-2.5">
                                <FolderCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                                <div>
                                  <span className="font-mono font-bold text-slate-800">
                                    📁 {m.mesAno}
                                  </span>
                                  <span className="ml-2 text-slate-500">
                                    ({m.nomeMes})
                                  </span>
                                  <span className="ml-2 px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded-full text-[10px] border border-emerald-200">
                                    {m.docs.length} documento(s)
                                  </span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleBaixarEstruturaPastasZip(emp.pastaEmpresa, m.mesAno)}
                                disabled={isSyncing}
                                className="px-2.5 py-1 bg-[#04243b] hover:bg-[#031d30] text-white rounded-lg font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                              >
                                <Download className="h-3 w-3 text-[#e4b35e]" />
                                <span>Baixar Mês ({m.mesAno})</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            {onPurgeAllDocs && allDocs.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await onPurgeAllDocs();
                  setFeedbackMsg('Todos os XMLs capturados foram excluídos e os cursores NSU foram zerados.');
                }}
                className="px-3 py-1.5 text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Excluir Todos os XMLs Capturados</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#04243b] text-white font-bold rounded-xl hover:bg-[#031d30] cursor-pointer"
          >
            Concluir
          </button>
        </div>

      </div>
    </div>
  );
}
