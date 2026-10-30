/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tipos para gestão de Documentos Fiscais (NF-e/DFe), Certificados por Empresa e Robô SEFAZ
 */

export type SituacaoFiscal = 
  | 'AUTORIZADA'       // Documento ativo / Autorizado (cStat 100 / schema procNFe / resNFe ativo)
  | 'CANCELADA'        // Cancelamento homologado (tpEvento 110111 / procEventoNFe ou retEvento 101)
  | 'CARTA_CORRECAO'   // Carta de Correção Eletrônica (tpEvento 110110)
  | 'RESUMO'           // Resumo da NF-e (resNFe - aguardando manifestação do destinatário)
  | 'DENEGADA'         // Uso Denegado (cStat 110, 301, 302)
  | 'INUTILIZADA';     // Numeração inutilizada

export type TipoOperacaoFiscal = 'ENTRADA' | 'SAIDA';

export interface DocumentoFiscalArmazenado {
  id: string; // ${empresaCnpj}_${chave}_${nsu}
  empresaId: string;
  empresaCnpj: string;
  empresaRazaoSocial: string;
  
  // Dados de rastreio SEFAZ
  nsu: string;
  schema: string;
  tipo: 'NFE_COMPLETA' | 'RESUMO' | 'EVENTO' | 'OUTRO';
  situacao: SituacaoFiscal;
  
  // Identificação do documento
  chave: string;
  nNF: string;
  serie: string;
  tipoOperacao: TipoOperacaoFiscal; // 0 = Entrada, 1 = Saída
  
  // Datas
  dataEmissao: string;     // ISO ou DD/MM/AAAA HH:mm:ss
  dataGeracaoFormatada: string; // Ex: 24/10/2026 14:32:10
  competencia: string;     // Ex: 10/2026
  
  // Partes envolvidas
  emitenteCnpj: string;
  emitenteNome: string;
  emitenteTipo: 'PROPRIA' | 'TERCEIRO'; // 'P' ou 'T'
  
  destinatarioCnpj: string;
  destinatarioNome: string;
  destinatarioTipo: 'PROPRIA' | 'TERCEIRO'; // 'P' ou 'T'
  
  // Valores
  valorTotal: number;
  valorLiquido?: number;
  
  // Eventos e Manifestação
  descricaoEvento?: string;
  tipoEvento?: string;
  motivoStatus?: string;
  manifestacao?: 'CIENCIA' | 'CONFIRMADA' | 'DESCONHECIDA' | 'NAO_REALIZADA' | 'PENDENTE';
  
  // XML e Armazenamento
  xml: string;
  baixadoEm: string;
}

export interface RoboVarreduraConfig {
  ativo: boolean;
  intervaloMinutos: number; // Padrão SEFAZ: 60 minutos quando atualizado
  apenasEmpresaSelecionada: boolean; // false = varre todas as empresas com certificado configurado
  somNotificacao: boolean;
}

export interface RoboLogItem {
  id: string;
  timestamp: string; // ISO
  empresaNome: string;
  empresaCnpj: string;
  nsuInicial: string;
  nsuFinal: string;
  maxNsu: string;
  documentosBaixados: number;
  status: 'SUCESSO' | 'SEM_NOVOS' | 'AGUARDANDO_COOLDOWN' | 'ERRO' | 'BLOQUEIO_SEFAZ';
  cStat?: string;
  mensagem: string;
}

export interface CertificadoDetalhado {
  valido: boolean;
  titular?: string;
  cnpjCertificado?: string;
  emissor?: string;
  validoDe?: string;
  validoAte?: string;
  expirado?: boolean;
  diasRestantes?: number;
}

// Tabela Oficial de Códigos IBGE das UFs Brasileiras
export const CODIGOS_UF_IBGE: Record<string, string> = {
  'RO': '11', 'AC': '12', 'AM': '13', 'RR': '14', 'PA': '15', 'AP': '16', 'TO': '17',
  'MA': '21', 'PI': '22', 'CE': '23', 'RN': '24', 'PB': '25', 'PE': '26', 'AL': '27',
  'SE': '28', 'BA': '29', 'MG': '31', 'ES': '32', 'RJ': '33', 'SP': '35', 'PR': '41',
  'SC': '42', 'RS': '43', 'MS': '50', 'MT': '51', 'GO': '52', 'DF': '53'
};

/**
 * Normaliza qualquer sigla de UF ('CE', 'SP', etc.) ou código para o código numérico IBGE de 2 dígitos exigido pelo schema da SEFAZ
 */
export function normalizarCodigoUfIbge(ufOuCodigo?: string): string {
  if (!ufOuCodigo) return '23'; // Padrão Ceará (23)
  const clean = ufOuCodigo.trim().toUpperCase();
  if (/^\d{2}$/.test(clean)) {
    return clean;
  }
  return CODIGOS_UF_IBGE[clean] || '23';
}

export const CODIGOS_IBGE_PARA_UF: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR',
  '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF'
};

