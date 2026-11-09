export function isValidCNPJ(cnpj: string): boolean {
  const clean = (cnpj || '').replace(/\D/g, '');
  if (clean.length !== 14 || /^(\d)\1+$/.test(clean)) return false;
  
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  
  let sum1 = 0;
  for (let i = 0; i < 12; i++) {
    sum1 += parseInt(clean.charAt(i), 10) * weights1[i];
  }
  const rest1 = sum1 % 11;
  const d1 = rest1 < 2 ? 0 : 11 - rest1;
  if (d1 !== parseInt(clean.charAt(12), 10)) return false;
  
  let sum2 = 0;
  for (let i = 0; i < 13; i++) {
    sum2 += parseInt(clean.charAt(i), 10) * weights2[i];
  }
  const rest2 = sum2 % 11;
  const d2 = rest2 < 2 ? 0 : 11 - rest2;
  return d2 === parseInt(clean.charAt(13), 10);
}

export function isCaepf(doc: string): boolean {
  const clean = (doc || '').replace(/\D/g, '');
  // CAEPF (Cadastro de Atividade Econômica da Pessoa Física) ou CPF de produtor rural com /001-xx
  return clean.length === 14 && !isValidCNPJ(clean);
}

export async function fetchCnpjSafe(cleanCnpj: string): Promise<any> {
  const clean = (cleanCnpj || '').replace(/\D/g, '');
  
  if (isCaepf(clean)) {
    throw new Error('O documento informado é um CAEPF / Pessoa Física (Produtor Rural). A consulta automatizada na Receita Federal é exclusiva para pessoas jurídicas (CNPJ).');
  }

  if (clean.length !== 14 || !isValidCNPJ(clean)) {
    throw new Error('CNPJ inválido. Verifique os dígitos do documento informado.');
  }

  // 1. Try internal / proxy endpoint first (/api/cnpj/:cnpj)
  try {
    const response = await fetch(`/api/cnpj/${clean}`);
    const text = await response.text();
    if (text && (text.trim().startsWith("{") || text.trim().startsWith("["))) {
      const data = JSON.parse(text);
      if (response.ok) {
        return data;
      }
    }
  } catch (err) {
    console.warn("Primary CNPJ endpoint unavailable, trying direct BrasilAPI fallback...", err);
  }

  // 2. Direct client-side fallback to BrasilAPI
  try {
    const brasilRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
    if (brasilRes.ok) {
      const bData = await brasilRes.json();
      return bData;
    }
  } catch (bErr) {
    console.warn("BrasilAPI direct fallback failed, trying publica.cnpj.ws...", bErr);
  }

  // 3. Direct client-side fallback to publica.cnpj.ws
  try {
    const fallbackRes = await fetch(`https://publica.cnpj.ws/cnpj/${clean}`);
    if (fallbackRes.ok) {
      const pubData = await fallbackRes.json();
      return pubData;
    }
  } catch (pubErr) {
    console.warn("publica.cnpj.ws fallback failed:", pubErr);
  }

  throw new Error("Não foi possível consultar os dados do CNPJ. Verifique sua conexão ou se o CNPJ é válido.");
}

export function parseCnpjResponseData(data: any) {
  const razaoSocial = data.razao_social || data.nome || 'Empresa Sem Nome';
  const est = data.estabelecimento || {};
  const logradouro = est.logradouro || data.logradouro || '';
  const numero = est.numero || data.numero || '';
  const complemento = est.complemento || data.complemento || '';
  const bairro = est.bairro || data.bairro || '';
  const enderecoFormatted = [logradouro, numero, bairro].filter(Boolean).join(', ');

  const cep = est.cep || data.cep || '';
  const municipioNome = est.cidade?.nome || est.municipio?.nome || data.municipio || '';
  const estadoSigla = est.estado?.sigla || data.uf || '';
  const estadoNome = est.estado?.nome || data.uf || '';
  const cidadeFormatted = municipioNome && estadoSigla ? `${municipioNome} (${estadoSigla})` : (municipioNome || estadoSigla || '');

  const isSimples = data.simples?.optante === 'Sim' || data.simples?.optante === true || data.opcao_pelo_simples === true;
  const regime = isSimples ? 'SIMPLES_NACIONAL' : 'LUCRO_PRESUMIDO';

  const sociosRaw = data.socios || data.qsa || [];
  const quadro = sociosRaw.map((s: any) => {
    const nome = s.nome || s.nome_socio || '';
    const desc = s.qualificacao_socio?.descricao || (typeof s.qualificacao_socio === 'string' ? s.qualificacao_socio : '') || '';
    return desc ? `${nome} (${desc})` : nome;
  }).filter(Boolean);

  const sociosDetalhados = sociosRaw.map((s: any) => ({
    nome: s.nome || s.nome_socio || '',
    documento: s.cpf_cnpj_socio || s.cnpj_cpf_do_socio || '',
    qualificacao: s.qualificacao_socio?.descricao || (typeof s.qualificacao_socio === 'string' ? s.qualificacao_socio : '') || ''
  })).filter((s: any) => Boolean(s.nome));

  const email = est.email || data.email || data.correio_eletronico || '';
  const telefone = est.telefone1 ? (est.ddd1 ? `(${est.ddd1}) ${est.telefone1}` : est.telefone1) : (data.ddd_telefone_1 || '');
  const telefoneSecundario = est.telefone2 ? (est.ddd2 ? `(${est.ddd2}) ${est.telefone2}` : est.telefone2) : (data.ddd_telefone_2 || '');

  const cnaePrincipalCodigo = String(est.atividade_principal?.id || data.cnae_fiscal || '');
  const cnaePrincipalDescricao = est.atividade_principal?.descricao || data.cnae_fiscal_descricao || '';
  const cnaesSecundariosRaw = est.atividades_secundarias || data.cnaes_secundarios || [];
  const cnaesSecundarios = cnaesSecundariosRaw.map((sec: any) => ({
    codigo: String(sec.id || sec.codigo || ''),
    descricao: sec.descricao || ''
  })).filter((sec: any) => Boolean(sec.codigo || sec.descricao));

  const naturezaJuridicaCodigo = String(data.natureza_juridica?.id || data.codigo_natureza_juridica || '');
  const naturezaJuridicaDescricao = typeof data.natureza_juridica === 'string' ? data.natureza_juridica : (data.natureza_juridica?.descricao || '');
  const porte = typeof data.porte === 'string' ? data.porte : (data.porte?.descricao || '');

  const situacaoCadastral = est.situacao_cadastral || data.descricao_situacao_cadastral || data.situacao_cadastral || '';
  const motivoSituacaoCadastral = String(est.motivo_situacao_cadastral || data.motivo_situacao_cadastral || '');

  const dataOpcaoSimples = data.simples?.data_opcao || data.data_opcao_pelo_simples || '';
  const dataExclusaoSimples = data.simples?.data_exclusao || data.data_exclusao_do_simples || '';
  const motivoExclusaoSimples = data.simples?.motivo_exclusao || data.motivo_exclusao_do_simples || (dataExclusaoSimples ? 'Ato Administrativo / Desenquadramento RFB' : '');
  const opcaoMei = data.mei?.optante === 'Sim' || data.mei?.optante === true || data.opcao_pelo_mei === true || data.opcao_pelo_mei === 'Sim';

  let inscEst = '';
  let situacaoInscEst = '';
  if (Array.isArray(est.inscricoes_estaduais) && est.inscricoes_estaduais.length > 0) {
    const ativa = est.inscricoes_estaduais.find((ie: any) => ie.ativo);
    const sel = ativa || est.inscricoes_estaduais[0];
    inscEst = sel.inscricao_estadual || '';
    situacaoInscEst = sel.ativo ? 'ATIVA' : 'INATIVA/BAIXADA';
  } else if (data.inscricao_estadual) {
    inscEst = data.inscricao_estadual;
  }
  const inscMun = est.inscricao_municipal || data.inscricao_municipal || '';

  // Verificação de Eventos Futuros IBS / CBS (se presente em futuras versões da API ou payloads estendidos)
  let eventosFuturosIbsCbs: Array<{ regime: string; descricao: string; dataEfeito: string }> = [];
  const rawEventos = data.eventos_futuros_ibs_cbs || data.eventos_futuros || data.ibs_cbs || data.eventosFuturosIbsCbs;
  if (Array.isArray(rawEventos) && rawEventos.length > 0) {
    eventosFuturosIbsCbs = rawEventos.map((ev: any) => ({
      regime: String(ev.regime || ev.tributo || '').toUpperCase(),
      descricao: String(ev.descricao || ev.evento || ev.descricao_evento || 'Opção pelo regime regular'),
      dataEfeito: String(ev.dataEfeito || ev.data_efeito || '01/01/2027')
    })).filter((ev: any) => Boolean(ev.regime));
  }

  return {
    razaoSocial,
    enderecoFormatted,
    cidadeFormatted,
    cep,
    regime,
    quadro,
    sociosDetalhados,
    municipioNome,
    estadoNome,
    estadoSigla,
    logradouro,
    numero,
    complemento,
    bairro,
    email,
    telefone,
    telefoneSecundario,
    cnaePrincipalCodigo,
    cnaePrincipalDescricao,
    cnaesSecundarios,
    naturezaJuridicaCodigo,
    naturezaJuridicaDescricao,
    porte,
    situacaoCadastral,
    motivoSituacaoCadastral,
    opcaoSimples: isSimples,
    dataOpcaoSimples,
    dataExclusaoSimples,
    motivoExclusaoSimples,
    opcaoMei,
    inscEst,
    situacaoInscEst,
    inscMun,
    eventosFuturosIbsCbs
  };
}

/**
 * Função para extrair dados a partir do texto ou comprovante copiado diretamente
 * do Portal Oficial do Simples Nacional (Receita Federal / e-CAC).
 * Captura a seção 'Eventos Futuros (Regime Regular IBS/CBS)' e dados do Simples.
 */
export function parsePortalSimplesText(text: string): {
  eventosFuturosIbsCbs: Array<{ regime: string; descricao: string; dataEfeito: string }>;
  dataOpcao?: string;
  dataExclusao?: string;
  isSimples?: boolean;
  isMei?: boolean;
} {
  const result: {
    eventosFuturosIbsCbs: Array<{ regime: string; descricao: string; dataEfeito: string }>;
    dataOpcao?: string;
    dataExclusao?: string;
    isSimples?: boolean;
    isMei?: boolean;
  } = {
    eventosFuturosIbsCbs: []
  };

  if (!text) return result;

  const normalized = text.replace(/\r\n/g, '\n');

  // 1. Detectar Eventos Futuros (Regime Regular IBS/CBS)
  // Padrão visual:
  // IBS   Opção pelo regime regular   01/01/2027
  // CBS   Opção pelo regime regular   01/01/2027
  const ibsMatch = normalized.match(/IBS\s+([^\n\d]+?)\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (ibsMatch) {
    result.eventosFuturosIbsCbs.push({
      regime: 'IBS',
      descricao: ibsMatch[1].trim() || 'Opção pelo regime regular',
      dataEfeito: ibsMatch[2].trim()
    });
  }

  const cbsMatch = normalized.match(/CBS\s+([^\n\d]+?)\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (cbsMatch) {
    result.eventosFuturosIbsCbs.push({
      regime: 'CBS',
      descricao: cbsMatch[1].trim() || 'Opção pelo regime regular',
      dataEfeito: cbsMatch[2].trim()
    });
  }

  // Se mencionou "Opção pelo regime regular" e "01/01/2027" mas os regex específicos falharam:
  if (result.eventosFuturosIbsCbs.length === 0 && /regime regular/i.test(normalized) && /2027/.test(normalized)) {
    result.eventosFuturosIbsCbs.push(
      { regime: 'IBS', descricao: 'Opção pelo regime regular', dataEfeito: '01/01/2027' },
      { regime: 'CBS', descricao: 'Opção pelo regime regular', dataEfeito: '01/01/2027' }
    );
  }

  // 2. Detectar Situação Simples Nacional
  if (/Optante pelo Simples Nacional:\s*Sim/i.test(normalized) || /Situação atual:\s*Optante pelo Simples Nacional/i.test(normalized)) {
    result.isSimples = true;
  } else if (/Optante pelo Simples Nacional:\s*Não/i.test(normalized) || /NÃO optante pelo Simples Nacional/i.test(normalized)) {
    result.isSimples = false;
  }

  // Data opção
  const opcaoMatch = normalized.match(/(?:desde|a partir de|data de opção:?)\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (opcaoMatch) {
    result.dataOpcao = opcaoMatch[1];
  }

  // Data exclusão
  const exclusaoMatch = normalized.match(/(?:exclu[íi]da? em|data de exclusão:?)\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (exclusaoMatch) {
    result.dataExclusao = exclusaoMatch[1];
  }

  // MEI
  if (/Optante pelo SIMEI:\s*Sim/i.test(normalized) || /Enquadrado no SIMEI/i.test(normalized)) {
    result.isMei = true;
  } else if (/Optante pelo SIMEI:\s*Não/i.test(normalized)) {
    result.isMei = false;
  }

  return result;
}

/**
 * Relação completa e categorizada de campos que a API pública da Receita Federal
 * (BrasilAPI / publica.cnpj.ws / Dados Abertos RFB) disponibiliza para download.
 */
export const API_AVAILABLE_FIELDS_CATALOG = [
  {
    categoria: 'Dados Cadastrais e Identificação',
    campos: [
      { campo: 'cnpj', descricao: 'Número de inscrição no Cadastro Nacional de Pessoa Jurídica' },
      { campo: 'razao_social / nome', descricao: 'Nome empresarial / Razão Social registrada na RFB' },
      { campo: 'nome_fantasia', descricao: 'Nome de fachada / Nome fantasia da empresa' },
      { campo: 'descricao_situacao_cadastral', descricao: 'Situação cadastral (ATIVA, BAIXADA, SUSPENSA, INAPTA)' },
      { campo: 'data_situacao_cadastral', descricao: 'Data em que ocorreu a última alteração de situação cadastral' },
      { campo: 'motivo_situacao_cadastral', descricao: 'Código e motivo da situação cadastral perante a Receita Federal' },
      { campo: 'data_inicio_atividade', descricao: 'Data de abertura / início das atividades' },
      { campo: 'natureza_juridica', descricao: 'Código e denominação da natureza jurídica (ex: 206-2 Sociedade Empresária Limitada)' },
      { campo: 'porte', descricao: 'Porte da empresa (ME - Microempresa, EPP, DEMAIS)' },
      { campo: 'capital_social', descricao: 'Valor do capital social subscrito e integralizado' }
    ]
  },
  {
    categoria: 'Localização e Contato',
    campos: [
      { campo: 'logradouro, numero, complemento', descricao: 'Endereço completo do estabelecimento (matriz ou filial)' },
      { campo: 'bairro', descricao: 'Bairro do estabelecimento' },
      { campo: 'cep', descricao: 'Código de Endereçamento Postal' },
      { campo: 'municipio / cidade', descricao: 'Nome do município e código IBGE' },
      { campo: 'uf / estado', descricao: 'Sigla da Unidade Federativa' },
      { campo: 'ddd_telefone_1 / ddd_telefone_2', descricao: 'Telefones comerciais cadastrados na RFB' },
      { campo: 'email / correio_eletronico', descricao: 'E-mail corporativo ou contábil informado no CNPJ' }
    ]
  },
  {
    categoria: 'Atividades Econômicas (CNAE)',
    campos: [
      { campo: 'cnae_fiscal / cnae_principal', descricao: 'Código e descrição da Atividade Econômica Principal' },
      { campo: 'cnaes_secundarios', descricao: 'Lista de códigos e descrições das Atividades Econômicas Secundárias' }
    ]
  },
  {
    categoria: 'Quadro de Sócios e Administradores (QSA)',
    campos: [
      { campo: 'nome_socio', descricao: 'Nome completo dos sócios e administradores' },
      { campo: 'cnpj_cpf_do_socio', descricao: 'Documento mascarado do sócio (ex: ***123456**)' },
      { campo: 'qualificacao_socio', descricao: 'Qualificação no contrato social (Sócio-Administrador, Sócio, Administrador)' },
      { campo: 'data_entrada_sociedade', descricao: 'Data em que o sócio ingressou no quadro societário' },
      { campo: 'faixa_etaria', descricao: 'Faixa etária declarada do sócio' }
    ]
  },
  {
    categoria: 'Simples Nacional e MEI (Campos Nativos da API)',
    campos: [
      { campo: 'opcao_pelo_simples', descricao: 'Indicador booleano (true/false ou Sim/Não) se é optante' },
      { campo: 'data_opcao_pelo_simples', descricao: 'Data de homologação da adesão ao Simples Nacional' },
      { campo: 'data_exclusao_do_simples', descricao: 'Data de exclusão ou desenquadramento do regime' },
      { campo: 'opcao_pelo_mei', descricao: 'Indicador booleano se a empresa é enquadrada no SIMEI' },
      { campo: 'data_opcao_pelo_mei / data_exclusao_do_mei', descricao: 'Histórico de enquadramento/desenquadramento no SIMEI' }
    ]
  },
  {
    categoria: 'Inscrições Tributárias Suplementares',
    campos: [
      { campo: 'inscricoes_estaduais', descricao: 'Número e status de Inscrição Estadual (disponível via publica.cnpj.ws / Sintegra)' },
      { campo: 'inscricao_municipal', descricao: 'Inscrição Municipal (quando informada)' }
    ]
  }
];

export const API_UNAVAILABLE_FIELDS = [
  {
    campo: 'Eventos Futuros (Regime Regular IBS/CBS para 2027)',
    motivo: 'Criado pela Emenda Constitucional nº 132/2023 (Reforma Tributária). Atualmente é exibido exclusivamente na tela de consulta interativa do Portal do Simples Nacional com proteção hCaptcha. As APIs públicas de CNPJ (BrasilAPI, ReceitaWS, CNPJ.ws, Dados Abertos RFB) ainda não possuem esse campo disponibilizado em seus bancos de dados.',
    solucao: 'O sistema permite importar automaticamente pelo comprovante copiado do Portal do Simples Nacional ou registrar manualmente/em lote com 1 clique para qualquer empresa.'
  }
];
