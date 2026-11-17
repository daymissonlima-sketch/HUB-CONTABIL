/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Secure Error Handling Utility
 * Centraliza o tratamento de erros sem expor detalhes internos da arquitetura,
 * caminhos de arquivos, credenciais ou estruturas do banco de dados ao usuário final.
 */

export interface SafeAppError {
  userMessage: string;
  code?: string;
  timestamp: string;
}

/**
 * Sanitiza mensagens de erro capturadas de serviços, APIs ou bancos de dados,
 * convertendo mensagens de baixo nível / stack traces em mensagens claras e amigáveis ao usuário.
 */
export function getSafeUserErrorMessage(error: unknown, fallbackMessage = 'Ocorreu uma falha no processamento da solicitação.'): string {
  if (!error) return fallbackMessage;

  const raw = error instanceof Error ? error.message : String(error);

  // 1. Quota ou Limite de requisições excedido
  if (raw.includes('resource-exhausted') || raw.includes('Quota exceeded') || raw.includes('429')) {
    return 'Limite de requisições do servidor atingido temporariamente. O sistema continuará operando com segurança em modo local offline.';
  }

  // 2. Erros de rede ou conexão offline
  if (raw.includes('offline') || raw.includes('network') || raw.includes('Failed to fetch') || raw.includes('ECONNREFUSED')) {
    return 'Sem conexão com o servidor. Seus dados continuam disponíveis localmente no navegador.';
  }

  // 3. Erros de Permissão / Autenticação
  if (raw.includes('permission-denied') || raw.includes('unauthenticated') || raw.includes('Unauthorized')) {
    return 'Acesso não autorizado ou sessão expirada. Por favor, verifique suas permissões.';
  }

  // 4. Se a mensagem contiver termos técnicos do Firestore/Firebase/DB ou caminhos do sistema, não exponha ao usuário
  if (
    raw.includes('firestore') ||
    raw.includes('firebase') ||
    raw.includes('collection(') ||
    raw.includes('documentId') ||
    raw.includes('SQL') ||
    raw.includes('syntax error') ||
    raw.includes('at ') ||
    raw.includes('eval') ||
    raw.includes('src/')
  ) {
    // Log interno em console sem quebrar a UI
    console.error('[Internal Secure Error Trace]:', raw);
    return fallbackMessage;
  }

  // Se a mensagem for limpa e amigável (ex: "Chave de acesso inválida"), exibe com limite de caracteres
  return raw.slice(0, 180);
}

/**
 * Encapsula uma operação assíncrona com captura segura de erros.
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallbackValue: T,
  onError?: (safeMessage: string) => void
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const safeMsg = getSafeUserErrorMessage(err);
    console.error('[safeAsync Captured Error]:', err);
    if (onError) onError(safeMsg);
    return fallbackValue;
  }
}
