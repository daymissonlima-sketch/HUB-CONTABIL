/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Serviço de Repositório e Salvamento Automático de XMLs Fiscais por Empresa e Mês de Emissão
 * Estrutura de diretórios:
 *   <Pasta_Raiz_Escolhida> / <Nome_Empresa_CNPJ> / <AAAA-MM> / <Chave_44_Digitos>.xml
 * 
 * Suporta:
 * 1. Gravação direta na pasta física do computador do usuário via File System Access API (window.showDirectoryPicker)
 *    com persistência do DirectoryHandle no IndexedDB
 * 2. Sincronização opcional com o repositório temporário do servidor
 * 3. Exportação estruturada em pacote ZIP mantendo a árvore <Empresa>/<AAAA-MM>/<Chave>.xml
 */

import { DocumentoFiscalArmazenado } from '../types/sefazTypes';
import {
  salvarDirectoryHandleNoIndexedDb,
  obterDirectoryHandleDoIndexedDb,
  isXmlSinteticoInvalido
} from './sefazIndexedDb';

export interface ConfigRepositorioXml {
  caminhoPastaServidor: string;
  nomePastaLocalComputador?: string;
  salvarAutomaticamenteNoRepositorio: boolean;
  baixarAutomaticamenteNoNavegador: boolean;
  manifestarCienciaAutomaticamente: boolean;
}

const REPO_CONFIG_STORAGE_KEY = 'moreira_lima_sefaz_repo_config_v2';

export const DEFAULT_REPO_CONFIG: ConfigRepositorioXml = {
  caminhoPastaServidor: 'Repositorio_XMLs_SEFAZ',
  nomePastaLocalComputador: undefined,
  salvarAutomaticamenteNoRepositorio: true,
  baixarAutomaticamenteNoNavegador: false,
  manifestarCienciaAutomaticamente: true
};

// Referência em memória ao DirectoryHandle caso o usuário selecione uma pasta local via File System Access API
let localDirectoryHandle: any = null;

// Tenta restaurar o DirectoryHandle salvo no IndexedDB ao inicializar no navegador
if (typeof window !== 'undefined') {
  obterDirectoryHandleDoIndexedDb()
    .then((savedHandle) => {
      if (savedHandle && !localDirectoryHandle) {
        localDirectoryHandle = savedHandle;
      }
    })
    .catch(() => {});
}

export function getLocalDirectoryHandle(): any {
  return localDirectoryHandle;
}

export function setLocalDirectoryHandle(handle: any): void {
  localDirectoryHandle = handle;
  if (handle) {
    salvarDirectoryHandleNoIndexedDb(handle).catch(() => {});
  }
}

/**
 * Abre o seletor nativo de pastas do sistema operacional (Windows/macOS/Linux) via File System Access API
 */
export async function selecionarPastaFisicaNoComputador(): Promise<{
  ok: boolean;
  nomePasta?: string;
  motivo?: 'IFRAME_RESTRICAO' | 'NAVEGADOR_NAO_SUPORTADO' | 'CANCELADO' | 'ERRO';
  mensagem?: string;
}> {
  if (typeof window === 'undefined') {
    return { ok: false, motivo: 'NAVEGADOR_NAO_SUPORTADO', mensagem: 'Ambiente fora do navegador.' };
  }

  if (typeof (window as any).showDirectoryPicker !== 'function') {
    return {
      ok: false,
      motivo: 'NAVEGADOR_NAO_SUPORTADO',
      mensagem:
        'Seu navegador atual não suporta gravação direta em pastas locais (File System Access API). Use o Google Chrome ou Microsoft Edge em uma aba direta, ou utilize o botão "Baixar Pastas Organizadas (.ZIP)" abaixo.'
    };
  }

  try {
    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    setLocalDirectoryHandle(dirHandle);
    saveRepoConfig({
      nomePastaLocalComputador: dirHandle.name,
      caminhoPastaServidor: dirHandle.name
    });
    return {
      ok: true,
      nomePasta: dirHandle.name
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, motivo: 'CANCELADO' };
    }
    if (err?.name === 'SecurityError' || (err?.message && err.message.toLowerCase().includes('sub frame'))) {
      return {
        ok: false,
        motivo: 'IFRAME_RESTRICAO',
        mensagem:
          'Por segurança do Windows/Chrome, o seletor de pastas locais do computador só pode ser aberto quando o sistema está em uma aba própria (como no seu link do Netlify), e não dentro de um quadro de pré-visualização. Abra o sistema em uma Nova Guia ou clique em "Baixar Pastas Organizadas (.ZIP)"!'
      };
    }
    return {
      ok: false,
      motivo: 'ERRO',
      mensagem: err?.message || 'Não foi possível vincular a pasta local do computador.'
    };
  }
}

/**
 * Verifica ou solicita permissão de escrita na pasta local já vinculada
 */
export async function garantirPermissaoEscritaPastaLocal(): Promise<boolean> {
  if (!localDirectoryHandle) {
    const restored = await obterDirectoryHandleDoIndexedDb();
    if (restored) {
      localDirectoryHandle = restored;
    }
  }
  if (!localDirectoryHandle) return false;

  try {
    if (typeof localDirectoryHandle.queryPermission === 'function') {
      const perm = await localDirectoryHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') return true;
    }
    if (typeof localDirectoryHandle.requestPermission === 'function') {
      const req = await localDirectoryHandle.requestPermission({ mode: 'readwrite' });
      return req === 'granted';
    }
    return true;
  } catch {
    return false;
  }
}

export function loadRepoConfig(): ConfigRepositorioXml {
  if (typeof window === 'undefined') return DEFAULT_REPO_CONFIG;
  try {
    const raw = localStorage.getItem(REPO_CONFIG_STORAGE_KEY);
    return raw ? { ...DEFAULT_REPO_CONFIG, ...JSON.parse(raw) } : DEFAULT_REPO_CONFIG;
  } catch {
    return DEFAULT_REPO_CONFIG;
  }
}

export function saveRepoConfig(partial: Partial<ConfigRepositorioXml>): ConfigRepositorioXml {
  const current = loadRepoConfig();
  const updated = { ...current, ...partial };
  if (typeof window !== 'undefined') {
    localStorage.setItem(REPO_CONFIG_STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

/**
 * Sanitiza nome de empresa para uso seguro em nomes de pastas no Windows/Linux/macOS
 */
export function formatarNomePastaEmpresa(razaoSocial: string, cnpj: string): string {
  const cleanCnpj = (cnpj || '').replace(/\D/g, '');
  const nomeLimpo = (razaoSocial || 'EMPRESA')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase()
    .slice(0, 45);

  return cleanCnpj ? `${nomeLimpo}_${cleanCnpj}` : nomeLimpo;
}

/**
 * Extrai a pasta de mês/ano de emissão no formato AAAA-MM (ex: "2026-10")
 * A partir da Chave de Acesso (posições 2..6 AAMM), competência ("10/2026") ou dataEmissao ISO.
 */
export function extrairPastaMesEmissao(doc: Partial<DocumentoFiscalArmazenado>): string {
  const cleanChave = (doc.chave || '').replace(/\D/g, '');
  if (cleanChave.length === 44) {
    const aa = cleanChave.slice(2, 4);
    const mm = cleanChave.slice(4, 6);
    const mesNum = parseInt(mm, 10);
    if (mesNum >= 1 && mesNum <= 12) {
      return `20${aa}-${mm}`;
    }
  }

  if (doc.competencia && /^\d{2}\/\d{4}$/.test(doc.competencia)) {
    const [m, y] = doc.competencia.split('/');
    return `${y}-${m}`;
  }

  if (doc.dataEmissao && /^\d{4}-\d{2}/.test(doc.dataEmissao)) {
    return doc.dataEmissao.slice(0, 7);
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Monta o caminho relativo padronizado: <PastaEmpresa>/<AAAA-MM>/<Chave>.xml
 */
export function montarCaminhoRelativoXml(doc: Partial<DocumentoFiscalArmazenado>): {
  pastaEmpresa: string;
  pastaMes: string;
  nomeArquivo: string;
  caminhoCompletoRelativo: string;
} {
  const pastaEmpresa = formatarNomePastaEmpresa(
    doc.empresaRazaoSocial || 'EMPRESA',
    doc.empresaCnpj || ''
  );
  const pastaMes = extrairPastaMesEmissao(doc);
  const cleanChave = (doc.chave || '').replace(/\D/g, '');
  const nomeArquivo = `${cleanChave || doc.nsu || 'nfe'}.xml`;

  return {
    pastaEmpresa,
    pastaMes,
    nomeArquivo,
    caminhoCompletoRelativo: `${pastaEmpresa}/${pastaMes}/${nomeArquivo}`
  };
}

/**
 * Salva um arquivo XML diretamente na pasta local escolhida pelo usuário via File System Access API
 * criando automaticamente as subpastas <Empresa> e <AAAA-MM> no computador do usuário.
 */
export async function salvarXmlNaPastaLocalComputador(
  doc: Partial<DocumentoFiscalArmazenado>,
  xmlContent: string
): Promise<boolean> {
  if (!xmlContent || isXmlSinteticoInvalido(xmlContent)) return false;
  const temPermissao = await garantirPermissaoEscritaPastaLocal();
  if (!temPermissao || !localDirectoryHandle) return false;

  try {
    const { pastaEmpresa, pastaMes, nomeArquivo } = montarCaminhoRelativoXml(doc);
    const dirEmpresa = await localDirectoryHandle.getDirectoryHandle(pastaEmpresa, { create: true });
    const dirMes = await dirEmpresa.getDirectoryHandle(pastaMes, { create: true });
    const fileHandle = await dirMes.getFileHandle(nomeArquivo, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(xmlContent);
    await writable.close();
    return true;
  } catch (err) {
    console.warn('Aviso ao gravar na pasta local via File System Access API:', err);
    return false;
  }
}

/**
 * Salva um lote de documentos automaticamente:
 * 1. Na pasta local do computador (se vinculada via File System Access API)
 * 2. No Repositório do Servidor (/api/sefaz/repositorio/salvar) organizado por Empresa / Mês de Emissão
 */
export async function salvarDocumentosNoRepositorioAutomatico(
  docs: DocumentoFiscalArmazenado[]
): Promise<{ salvosServidor: number; salvosPastaLocal: number }> {
  if (!docs || docs.length === 0) return { salvosServidor: 0, salvosPastaLocal: 0 };

  const docsValidos = docs.filter(d => Boolean(d.xml && !isXmlSinteticoInvalido(d.xml)));
  if (docsValidos.length === 0) return { salvosServidor: 0, salvosPastaLocal: 0 };

  const config = loadRepoConfig();
  let salvosPastaLocal = 0;
  let salvosServidor = 0;

  // 1. Se houver pasta local selecionada no computador, grava cada arquivo em <Empresa>/<AAAA-MM>/<Chave>.xml
  if (localDirectoryHandle) {
    for (const d of docsValidos) {
      const ok = await salvarXmlNaPastaLocalComputador(d, d.xml);
      if (ok) salvosPastaLocal++;
    }
  }

  // 2. Envia para o Repositório do Servidor organizado por <Empresa>/<AAAA-MM>/<Chave>.xml
  if (config.salvarAutomaticamenteNoRepositorio) {
    try {
      const payload = docsValidos.map(d => {
        const { pastaEmpresa, pastaMes, nomeArquivo } = montarCaminhoRelativoXml(d);
        return {
          pastaEmpresa,
          pastaMes,
          nomeArquivo,
          chave: d.chave,
          xml: d.xml
        };
      });

      if (payload.length > 0) {
        const resp = await fetch('/api/sefaz/repositorio/salvar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caminhoBase: config.caminhoPastaServidor,
            arquivos: payload
          })
        });
        if (resp.ok) {
          const resData = await resp.json();
          salvosServidor = resData.salvos || payload.length;
        }
      }
    } catch {}
  }

  return { salvosServidor, salvosPastaLocal };
}
