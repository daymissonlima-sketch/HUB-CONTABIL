export async function fetchCnpjSafe(cleanCnpj: string): Promise<any> {
  const response = await fetch(`/api/cnpj/${cleanCnpj}`);
  const text = await response.text();

  if (!text || text.trim().startsWith("<") || !text.trim().startsWith("{")) {
    throw new Error("A API retornou HTML em vez de JSON. Verifique a conexão com a API de CNPJ.");
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("A resposta recebida não está no formato JSON válido.");
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || `Erro ao consultar CNPJ (Status: ${response.status})`);
  }

  return data;
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
    inscMun
  };
}
