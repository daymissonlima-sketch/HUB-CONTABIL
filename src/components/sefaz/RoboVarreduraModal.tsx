/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Painel do Robô de Varredura (SEFAZ Nacional)
 * - Opera automaticamente em segundo plano por trás do sistema
 * - Exibe todas as empresas habilitadas no robô, identifica 1ª Ativação SEFAZ (NSU 0/0 sem retroatividade pela NT 2014.002)
 *   e permite capturar notas anteriores diretamente pela Chave de Acesso (44 dígitos).
 */

import React, { useState } from 'react';
import {
  X,
  Cpu,
  Play,
  Pause,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Volume2,
  VolumeX,
  Trash2,
  Activity,
  Building2,
  KeyRound,
  Download
} from 'lucide-react';
import { Company } from '../../types_debits';
import { RoboLogItem, RoboVarreduraConfig } from '../../types/sefazTypes';
import {
  isEmpresaHabilitadaParaConsultaNfe,
  isEmpresaComNsuZeradoNaSefaz,
  analisarDocumentosArmazenadosEmpresa,
  capturarNotasNaSefazPorChaves,
  reiniciarVarreduraCompleta90DiasEmpresa,
  obterTimestampDesbloqueio656,
  SEFAZ_656_UNLOCK_AVG_MINUTES
} from '../../services/useSefazRobot';
import { loadAllStoredDocuments } from '../../services/sefazStorage';

export interface RoboVarreduraModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: RoboVarreduraConfig;
  onUpdateConfig: (cfg: Partial<RoboVarreduraConfig>) => void;
  onToggleAtivo: () => void;
  logs: RoboLogItem[];
  onClearLogs: () => void;
  isPollingNow: boolean;
  currentlyPollingCompany: string | null;
  secondsUntilNextSweep: number;
  companies: Company[];
  selectedCompanyId: string;
  onOpenCertModal: () => void;
  initialTab?: 'robo' | 'logs';
}

export function RoboVarreduraModal({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  onToggleAtivo,
  logs,
  onClearLogs,
  isPollingNow,
  currentlyPollingCompany,
  secondsUntilNextSweep,
  companies
}: RoboVarreduraModalProps) {
  const [logFilter, setLogFilter] = useState<'ALL' | 'SUCESSO' | 'ERRO'>('ALL');
  const [resgateCompanyId, setResgateCompanyId] = useState<string | null>(null);
  const [chavesInput, setChavesInput] = useState<string>('');
  const [isCapturingKeys, setIsCapturingKeys] = useState<boolean>(false);
  const [captureFeedback, setCaptureFeedback] = useState<{ ok: boolean; messages: string[] } | null>(null);

  if (!isOpen) return null;

  const allDocs = loadAllStoredDocuments();
  const empresasHabilitadas = companies.filter(isEmpresaHabilitadaParaConsultaNfe);
  const cnpjsHabilitados = new Set(
    empresasHabilitadas.map(c => (c.cnpj || '').replace(/\D/g, '')).filter(Boolean)
  );

  const formatTimer = (seconds: number) => {
    if (seconds <= 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const filteredLogs = logs.filter(log => {
    const cleanLogCnpj = (log.empresaCnpj || '').replace(/\D/g, '');
    if (cleanLogCnpj && !cnpjsHabilitados.has(cleanLogCnpj)) {
      return false;
    }
    if (logFilter === 'SUCESSO') return log.status === 'SUCESSO' || log.status === 'SEM_NOVOS';
    if (logFilter === 'ERRO') return log.status === 'ERRO' || log.status === 'BLOQUEIO_SEFAZ';
    return true;
  });

  const handleCapturarPorChaves = async (comp: Company) => {
    if (!chavesInput.trim()) return;
    setIsCapturingKeys(true);
    setCaptureFeedback(null);
    try {
      const res = await capturarNotasNaSefazPorChaves(comp, chavesInput);
      setCaptureFeedback({
        ok: res.sucesso,
        messages: res.mensagens
      });
      if (res.sucesso) {
        setChavesInput('');
      }
    } finally {
      setIsCapturingKeys(false);
    }
  };

  const now = Date.now();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden">
        
        {/* Header Superior */}
        <div className="px-5 py-3 bg-[#04243b] text-white flex items-center justify-between border-b border-slate-700 shrink-0">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-xl ${config.ativo ? 'bg-emerald-500 text-white animate-pulse' : 'bg-slate-700 text-slate-300'}`}>
              <Cpu className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-base font-bold text-white tracking-tight">
                Robô SEFAZ
              </h2>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                config.ativo
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
              }`}>
                {config.ativo ? 'ROBÔ ATIVO' : 'ROBÔ PAUSADO'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                {empresasHabilitadas.length} {empresasHabilitadas.length === 1 ? 'empresa habilitada' : 'empresas habilitadas'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Barra de Abas */}
        <div className="bg-slate-100 border-b border-slate-200 px-5 pt-2 flex items-center justify-between shrink-0 overflow-x-auto">
          <div className="flex space-x-1">
            <div className="px-4 py-2 text-xs font-bold rounded-t-xl bg-white text-[#04243b] border-t-2 border-[#04243b] shadow-xs flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-blue-600" />
              <span>Histórico</span>
            </div>
          </div>

          <div className="pb-1 hidden sm:flex items-center gap-2">
            <button
              onClick={() => onUpdateConfig({ somNotificacao: !config.somNotificacao })}
              title={config.somNotificacao ? 'Desativar som de novos documentos' : 'Ativar som de novos documentos'}
              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 text-xs flex items-center gap-1 cursor-pointer"
            >
              {config.somNotificacao ? (
                <>
                  <Volume2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-[11px] font-semibold text-slate-700">Som Ligado</span>
                </>
              ) : (
                <>
                  <VolumeX className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-[11px] text-slate-500">Som Mudo</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Barra de Status do Robô */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onToggleAtivo}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer ${
                config.ativo
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
              title={config.ativo ? 'Clique para pausar o robô' : 'Clique para ativar o robô'}
            >
              {config.ativo ? (
                <>
                  <Pause className="h-3.5 w-3.5" /> Pausar Robô
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" /> Ativar Robô
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-3">
            {isPollingNow ? (
              <div className="flex items-center gap-2 text-indigo-700 font-bold bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl animate-pulse">
                <RefreshCw className="h-3 w-3 animate-spin text-indigo-600" />
                <span>Varrendo: {currentlyPollingCompany || 'SEFAZ Nacional'}</span>
              </div>
            ) : config.ativo ? (
              <div className="flex items-center gap-2 text-slate-700 font-medium bg-white border border-slate-200 px-3 py-1 rounded-xl">
                <Clock className="h-3 w-3 text-emerald-600" />
                <span>Próxima verificação:</span>
                <span className="font-mono font-bold text-emerald-700 text-xs">
                  {formatTimer(secondsUntilNextSweep)}
                </span>
              </div>
            ) : (
              <div className="text-amber-800 font-bold bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl flex items-center gap-1.5">
                <Pause className="h-3 w-3 text-amber-600" />
                <span>Robô Pausado</span>
              </div>
            )}
          </div>
        </div>

        {/* Conteúdo: Empresas Habilitadas no Robô + Histórico */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          
          {/* Lista de Todas as Empresas Habilitadas no Robô */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#04243b]" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Empresas Habilitadas no Robô ({empresasHabilitadas.length})
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">
                Desbloqueio médio SEFAZ [656]: ~{SEFAZ_656_UNLOCK_AVG_MINUTES} min • Varredura diária: a cada 8h (3x/dia)
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-100 bg-slate-50/50">
              {empresasHabilitadas.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  Nenhuma empresa com Certificado A1 e Consulta NF-e habilitada no momento.
                </div>
              ) : (
                empresasHabilitadas.map(comp => {
                  const cleanCnpj = (comp.cnpj || '').replace(/\D/g, '');
                  const docStats = analisarDocumentosArmazenadosEmpresa(cleanCnpj, allDocs);
                  const lock656Until = obterTimestampDesbloqueio656(cleanCnpj, comp);
                  const isBlocked656 = lock656Until > now;
                  const isCurrentlyScanning = isPollingNow && currentlyPollingCompany === comp.razaoSocial;
                  const isZeroNsuSefaz = isEmpresaComNsuZeradoNaSefaz(comp, docStats.docsCount);
                  const isTrulySynchronized = Boolean(comp.varredura90DiasConcluida && !isZeroNsuSefaz);

                  const ultNsu = comp.ultimoNSU || '0';
                  const maxNsu = comp.maxNSU || '0';
                  const unlockTimeStr = isBlocked656
                    ? new Date(lock656Until).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : '';
                  const remainingMin656 = isBlocked656 ? Math.max(1, Math.ceil((lock656Until - now) / 60000)) : 0;
                  const isExpandedResgate = resgateCompanyId === comp.id;

                  return (
                    <div key={comp.id} className="bg-white transition-colors">
                      <div className="px-3.5 py-2 hover:bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              isCurrentlyScanning
                                ? 'bg-indigo-600 animate-ping'
                                : isBlocked656 || isZeroNsuSefaz
                                  ? 'bg-amber-500'
                                  : isTrulySynchronized
                                    ? 'bg-emerald-500'
                                    : 'bg-blue-500'
                            }`}
                          />
                          <span className="font-bold text-slate-800 truncate">{comp.razaoSocial}</span>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">{comp.cnpj}</span>
                          {docStats.docsCount > 0 && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                              {docStats.docsCount} NF-e
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            NSU: {ultNsu}{maxNsu && maxNsu !== '0' ? ` / ${maxNsu}` : ''}
                          </span>
                          {isCurrentlyScanning ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-800">
                              Varrendo agora...
                            </span>
                          ) : isBlocked656 ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800">
                              SEFAZ [656] • Desbloqueia às {unlockTimeStr} (~{remainingMin656} min)
                            </span>
                          ) : isZeroNsuSefaz ? (
                            <span
                              className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300"
                              title="Pela NT 2014.002, a SEFAZ Nacional não gera NSU retroativo antes da 1ª consulta do CNPJ no NFeDistribuicaoDFe. Use Capturar por Chave para notas anteriores."
                            >
                              1ª Ativação SEFAZ (Sem NSU retroativo na SEFAZ)
                            </span>
                          ) : isTrulySynchronized ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Sincronizada (3x/dia)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800">
                              Na fila (Varredura 90 dias)
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => reiniciarVarreduraCompleta90DiasEmpresa(comp.id)}
                            disabled={isCurrentlyScanning}
                            className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                            title="Reiniciar varredura completa dos últimos 90 dias a partir do NSU 000000000000000"
                          >
                            <RefreshCw className={`h-3 w-3 ${isCurrentlyScanning ? 'animate-spin' : ''}`} />
                            <span>Refazer 90d</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setResgateCompanyId(isExpandedResgate ? null : comp.id);
                              setCaptureFeedback(null);
                            }}
                            className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#04243b] text-[#e4b35e] hover:bg-[#031d30] flex items-center gap-1 cursor-pointer"
                            title="Capturar e baixar XML diretamente pela Chave de Acesso de 44 dígitos na SEFAZ"
                          >
                            <KeyRound className="h-3 w-3" />
                            <span>Capturar por Chave</span>
                          </button>
                        </div>
                      </div>

                      {isExpandedResgate && (
                        <div className="px-4 py-3 bg-amber-50/70 border-t border-amber-200 space-y-2">
                          <div className="text-[11px] text-amber-900 leading-relaxed">
                            <strong>Por que a SEFAZ retornou NSU 000000000000000 / 000000000000000?</strong> Pela regra oficial da{' '}
                            <strong>Nota Técnica 2014.002 da SEFAZ Nacional (Seção 3.6)</strong>, quando um CNPJ consulta o{' '}
                            <code className="font-mono">NFeDistribuicaoDFe</code> pela <strong>primeira vez</strong> (ou após 60 dias sem consultar), a SEFAZ{' '}
                            <strong>ativa a caixa postal daquele momento em diante e não gera NSUs retroativos na fila</strong> para notas emitidas antes da 1ª ativação.
                            Para baixar imediatamente notas de <strong>Setembro/Outubro (últimos 90 dias)</strong>, cole abaixo a(s){' '}
                            <strong>Chave(s) de Acesso de 44 dígitos</strong>:
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={chavesInput}
                              onChange={e => setChavesInput(e.target.value)}
                              placeholder="Cole aqui uma ou mais Chaves de Acesso (44 dígitos) separadas por espaço ou vírgula..."
                              className="flex-1 bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#04243b]/30"
                            />
                            <button
                              type="button"
                              disabled={isCapturingKeys || !chavesInput.trim()}
                              onClick={() => handleCapturarPorChaves(comp)}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>{isCapturingKeys ? 'Consultando SEFAZ...' : 'Manifestar Ciência e Baixar XML'}</span>
                            </button>
                          </div>

                          {captureFeedback && (
                            <div
                              className={`p-2 rounded-lg text-[11px] font-medium space-y-0.5 ${
                                captureFeedback.ok
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : 'bg-rose-100 text-rose-900 border border-rose-300'
                              }`}
                            >
                              {captureFeedback.messages.map((m, idx) => (
                                <div key={idx}>{m}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Seção de Histórico */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#04243b]" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Histórico
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
                  <button
                    onClick={() => setLogFilter('ALL')}
                    className={`px-2 py-0.5 rounded-md transition-colors ${logFilter === 'ALL' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setLogFilter('SUCESSO')}
                    className={`px-2 py-0.5 rounded-md transition-colors ${logFilter === 'SUCESSO' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'}`}
                  >
                    Sucesso
                  </button>
                  <button
                    onClick={() => setLogFilter('ERRO')}
                    className={`px-2 py-0.5 rounded-md transition-colors ${logFilter === 'ERRO' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-500'}`}
                  >
                    Alertas/Erros
                  </button>
                </div>

                {logs.length > 0 && (
                  <button
                    onClick={onClearLogs}
                    className="text-[11px] text-slate-400 hover:text-rose-600 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 cursor-pointer"
                    title="Limpar histórico"
                  >
                    <Trash2 className="h-3 w-3" /> Limpar
                  </button>
                )}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              {filteredLogs.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Nenhum registro no momento. O robô executa automaticamente em segundo plano.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {filteredLogs.map(log => {
                    const horaFormatada = new Date(log.timestamp).toLocaleTimeString('pt-BR');
                    const isOk = log.status === 'SUCESSO' || log.status === 'SEM_NOVOS';
                    const isBlocked = log.status === 'BLOQUEIO_SEFAZ';

                    return (
                      <div key={log.id} className="p-3 hover:bg-slate-50 flex items-start justify-between gap-3 transition-colors">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5">
                            {isBlocked ? (
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            ) : isOk ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-rose-500" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-800">{log.empresaNome}</span>
                              <span className="text-[10px] font-mono text-slate-400">{log.empresaCnpj}</span>
                              {log.cStat && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isBlocked
                                    ? 'bg-amber-100 text-amber-800'
                                    : log.documentosBaixados > 0
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-slate-100 text-slate-600'
                                }`}>
                                  cStat {log.cStat}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-600 mt-0.5">{log.mensagem}</p>
                            <div className="text-[10px] text-slate-400 font-mono mt-1">
                              NSU: {log.nsuInicial} → {log.nsuFinal} (Max: {log.maxNsu})
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-mono text-slate-400">{horaFormatada}</span>
                          {log.documentosBaixados > 0 && (
                            <div className="mt-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              +{log.documentosBaixados} XML(s)
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#04243b] hover:bg-[#031d30] text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Fechar Painel
          </button>
        </div>

      </div>
    </div>
  );
}
