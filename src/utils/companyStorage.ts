import { Company } from '../types_debits';
import importedCompaniesJson from '../data/imported_companies.json';

export const COMPANIES_STORAGE_KEY = 'moreira_lima_companies';
export const COMPANIES_UPDATED_EVENT = 'moreira_lima_companies_updated';
export const COMPANIES_MIGRATION_VERSION_KEY = 'moreira_lima_faturamento_version';
export const CURRENT_FATURAMENTO_VERSION = 'v2_default_100_vista';

export function getCleanDocument(doc: string | undefined | null): string {
  return (doc || '').replace(/\D/g, '');
}

export function isBlacklistedCompany(_company?: { razaoSocial?: string; cnpj?: string }): boolean {
  return false;
}

/**
 * Relação oficial das 11 empresas com percentuais de faturamento excepcionais preservados:
 * - 10% à Vista / 90% a Prazo:
 *   - 10.599.113/0001-09: AR DISTRIBUIDORA DE PRODUTOS ALIMENTICIOS LTDA
 *   - 09.662.119/0001-02: CEARA DISTRIBUIDORA DE PRODUTOS ALIMENTICIOS LTDA
 *   - 09.662.119/0004-47: CEARA DISTRIBUIDORA DE PRODUTOS ALIMENTICIOS LTDA
 *   - 08.470.032/0005-96: MENDES E PARENTE LTDA
 *   - 08.470.032/0008-39: MENDES E PARENTE LTDA
 *   - 08.470.032/0001-62: MENDES E PARENTE LTDA ME
 *   - 36.647.797/0001-60: MENDES E PARENTE REPRESENTACAO COMERCIAL LTDA
 *   - 14.488.773/0001-73: MENDES PARENTE CONSULTORIA EMPRESARIAL LTDA
 * - 40% à Vista / 60% a Prazo:
 *   - 07.368.386/0003-08: SL DISTRIBUIDORA DE PRODUTOS ALIMENTICIOS LTDA
 *   - 07.368.386/0001-38: SL DISTRIBUIDORA DE PRODUTOS ALIMENTICIOS LTDA
 * - 100% à Vista / 0% a Prazo:
 *   - 09.447.072/0001-56: SERSIL EMPREENDIMENTOS IMOBILIARIOS LTDA
 * 
 * Todas as DEMAIS empresas do sistema possuem como padrão 100% à Vista e 0% a Prazo.
 */
export const CNPJ_EXCEPTIONS_FATURAMENTO: Record<string, { vista: number; prazo: number; razao: string }> = {
  '10599113000109': { vista: 10, prazo: 90, razao: 'AR DISTRIBUIDORA DE PRODUTOS ALIMENTICIOS LTDA' },
  '09662119000102': { vista: 10, prazo: 90, razao: 'CEARA DISTRIBUIDORA DE PRODUTOS ALIMENTICIOS LTDA' },
  '09662119000447': { vista: 10, prazo: 90, razao: 'CEARA DISTRIBUIDORA DE PRODUTOS ALIMENTICIOS LTDA' },
  '08470032000596': { vista: 10, prazo: 90, razao: 'MENDES E PARENTE LTDA' },
  '08470032000839': { vista: 10, prazo: 90, razao: 'MENDES E PARENTE LTDA' },
  '08470032000162': { vista: 10, prazo: 90, razao: 'MENDES E PARENTE LTDA ME' },
  '07368386000308': { vista: 40, prazo: 60, razao: 'SL DISTRIBUIDORA DE PRODUTOS ALIMENTICIOS LTDA' },
  '07368386000138': { vista: 40, prazo: 60, razao: 'SL DISTRIBUIDORA DE PRODUTOS ALIMENTICIOS LTDA' },
  '09447072000156': { vista: 100, prazo: 0, razao: 'SERSIL EMPREENDIMENTOS IMOBILIARIOS LTDA' },
  '36647797000160': { vista: 10, prazo: 90, razao: 'MENDES E PARENTE REPRESENTACAO COMERCIAL LTDA' },
  '14488773000173': { vista: 10, prazo: 90, razao: 'MENDES PARENTE CONSULTORIA EMPRESARIAL LTDA' },
};

export function isExceptionCompany(cleanDoc: string): boolean {
  return Boolean(CNPJ_EXCEPTIONS_FATURAMENTO[cleanDoc]);
}

/**
 * Retorna os percentuais padrão de faturamento de uma empresa:
 * - 100% à vista e 0% a prazo para a regra geral;
 * - Percentuais específicos preservados para as 11 empresas de exceção.
 */
export function getDefaultFaturamentoPercent(cleanDoc: string): { vista: number; prazo: number } {
  const exception = CNPJ_EXCEPTIONS_FATURAMENTO[cleanDoc];
  if (exception) {
    return { vista: exception.vista, prazo: exception.prazo };
  }
  return { vista: 100, prazo: 0 };
}

/**
 * Função de compatibilidade: por padrão, todas as empresas não excepcionadas são 100% à vista
 */
export function is100PercentVistaCompany(cleanDoc: string): boolean {
  return !isExceptionCompany(cleanDoc);
}

/**
 * Carrega a lista consolidada e sincronizada de empresas.
 * Garante que a base do sistema em todas as ferramentas tenha estritamente as empresas
 * da base oficial atualizada (imported_companies.json), aplicando o padrão 100% à vista
 * e 0% a prazo para todas as empresas, exceto as 11 exceções especificadas pelo usuário.
 */
export function loadStoredCompanies(): Company[] {
  const importedList = (importedCompaniesJson as unknown) as Company[];
  const stored = typeof window !== 'undefined' ? localStorage.getItem(COMPANIES_STORAGE_KEY) : null;
  const migrationDone = typeof window !== 'undefined'
    ? localStorage.getItem(COMPANIES_MIGRATION_VERSION_KEY) === CURRENT_FATURAMENTO_VERSION
    : false;

  let reconciledCompanies: Company[] = [];

  if (stored) {
    try {
      const parsed: Company[] = JSON.parse(stored);
      const parsedMap = new Map<string, Company>();

      parsed.forEach(p => {
        const clean = getCleanDocument(p.cnpj);
        if (clean) {
          parsedMap.set(clean, p);
        }
      });

      // Itera estritamente sobre a base oficial da planilha
      reconciledCompanies = importedList.map(official => {
        const clean = getCleanDocument(official.cnpj);
        const storedItem = parsedMap.get(clean);

        // Percentual padrão conforme regras: 100% à vista / 0% a prazo, exceto para as 11 exceções
        const defaultPercents = getDefaultFaturamentoPercent(clean);
        let resolvedVista = defaultPercents.vista;
        let resolvedPrazo = defaultPercents.prazo;

        if (storedItem) {
          if (!migrationDone) {
            // Durante a migração da nova regra: todas as empresas assumem o novo padrão (100%/0%),
            // exceto as 11 exceções preservadas exatamente com seus valores.
            resolvedVista = defaultPercents.vista;
            resolvedPrazo = defaultPercents.prazo;
          } else {
            // Após a migração, preserva alterações manuais realizadas pelo usuário
            const hasStoredVista = storedItem.vendaVistaPercent !== undefined && storedItem.vendaVistaPercent !== null && !isNaN(Number(storedItem.vendaVistaPercent));
            const hasStoredPrazo = storedItem.vendaPrazoPercent !== undefined && storedItem.vendaPrazoPercent !== null && !isNaN(Number(storedItem.vendaPrazoPercent));

            if (hasStoredVista) {
              resolvedVista = Math.min(100, Math.max(0, Number(storedItem.vendaVistaPercent)));
              resolvedPrazo = hasStoredPrazo ? Math.min(100, Math.max(0, Number(storedItem.vendaPrazoPercent))) : (100 - resolvedVista);
            }
          }

          return {
            ...official,
            ...storedItem,
            id: storedItem.id || official.id,
            razaoSocial: storedItem.razaoSocial || official.razaoSocial,
            cnpj: storedItem.cnpj || official.cnpj,
            regimeTributario: storedItem.regimeTributario || official.regimeTributario || 'SIMPLES_NACIONAL',
            vendaVistaPercent: resolvedVista,
            vendaPrazoPercent: resolvedPrazo,
            opcaoSimples: storedItem.opcaoSimples !== undefined ? storedItem.opcaoSimples : official.opcaoSimples ?? (official.regimeTributario === 'SIMPLES_NACIONAL'),
            dataOpcaoSimples: storedItem.dataOpcaoSimples || official.dataOpcaoSimples || '',
            dataExclusaoSimples: storedItem.dataExclusaoSimples || official.dataExclusaoSimples || '',
            motivoExclusaoSimples: storedItem.motivoExclusaoSimples || official.motivoExclusaoSimples || (storedItem.dataExclusaoSimples ? 'Ato Administrativo / Desenquadramento RFB' : ''),
            opcaoMei: storedItem.opcaoMei !== undefined ? storedItem.opcaoMei : official.opcaoMei || false,
            situacaoCadastral: storedItem.situacaoCadastral || official.situacaoCadastral || '',
            motivoSituacaoCadastral: storedItem.motivoSituacaoCadastral || official.motivoSituacaoCadastral || '',
            sociosDetalhados: storedItem.sociosDetalhados || official.sociosDetalhados || [],
            socioNome: storedItem.socioNome || official.socioNome || '',
            socioCpf: storedItem.socioCpf || official.socioCpf || '',
            socioQualificacao: storedItem.socioQualificacao || official.socioQualificacao || '',
            cnaePrincipalCodigo: storedItem.cnaePrincipalCodigo || official.cnaePrincipalCodigo || '',
            cnaePrincipalDescricao: storedItem.cnaePrincipalDescricao || official.cnaePrincipalDescricao || '',
            cnaesSecundarios: storedItem.cnaesSecundarios || official.cnaesSecundarios || [],
            naturezaJuridicaCodigo: storedItem.naturezaJuridicaCodigo || official.naturezaJuridicaCodigo || '',
            naturezaJuridicaDescricao: storedItem.naturezaJuridicaDescricao || official.naturezaJuridicaDescricao || '',
            porte: storedItem.porte || official.porte || '',
            logradouro: storedItem.logradouro || official.logradouro || '',
            numero: storedItem.numero || official.numero || '',
            complemento: storedItem.complemento || official.complemento || '',
            bairro: storedItem.bairro || official.bairro || '',
            cidade: storedItem.cidade || official.cidade || '',
            municipio: storedItem.municipio || official.municipio || '',
            estado: storedItem.estado || official.estado || '',
            uf: storedItem.uf || official.uf || 'CE',
            cep: storedItem.cep || official.cep || '',
            email: storedItem.email || official.email || '',
            telefone: storedItem.telefone || official.telefone || '',
            telefoneSecundario: storedItem.telefoneSecundario || official.telefoneSecundario || '',
            inscEst: storedItem.inscEst || official.inscEst || '',
            inscMun: storedItem.inscMun || official.inscMun || '',
            situacaoInscEst: storedItem.situacaoInscEst || official.situacaoInscEst || '',
            certificateFile: storedItem.certificateFile || official.certificateFile,
            certificatePassword: storedItem.certificatePassword || official.certificatePassword,
            certificateName: storedItem.certificateName || official.certificateName,
            certificateValidTo: storedItem.certificateValidTo || official.certificateValidTo,
            certificateIssuer: storedItem.certificateIssuer || official.certificateIssuer,
            certificateSerialNumber: storedItem.certificateSerialNumber || official.certificateSerialNumber,
          };
        }

        return {
          ...official,
          vendaVistaPercent: resolvedVista,
          vendaPrazoPercent: resolvedPrazo,
          opcaoSimples: official.opcaoSimples ?? (official.regimeTributario === 'SIMPLES_NACIONAL'),
          dataOpcaoSimples: official.dataOpcaoSimples || '',
          dataExclusaoSimples: official.dataExclusaoSimples || '',
          motivoExclusaoSimples: official.motivoExclusaoSimples || '',
          opcaoMei: official.opcaoMei || false
        };
      });

      // Inclui empresas cadastradas manualmente pelo usuário
      const officialCleanSet = new Set(importedList.map(o => getCleanDocument(o.cnpj)).filter(Boolean));
      const customCompanies = parsed.filter(p => {
        if (!p || (!p.razaoSocial && !p.cnpj)) return false;
        const clean = getCleanDocument(p.cnpj);
        if (clean) {
          return !officialCleanSet.has(clean);
        }
        return Boolean(p.id);
      });

      // Deduplica empresas customizadas por CNPJ limpo ou ID
      const seenCustomKeys = new Set<string>();
      customCompanies.forEach(c => {
        const key = getCleanDocument(c.cnpj) || c.id;
        if (key && !seenCustomKeys.has(key)) {
          seenCustomKeys.add(key);
          const clean = getCleanDocument(c.cnpj);
          const defaultPercents = getDefaultFaturamentoPercent(clean);
          let resolvedVista = defaultPercents.vista;
          let resolvedPrazo = defaultPercents.prazo;

          if (!migrationDone) {
            resolvedVista = defaultPercents.vista;
            resolvedPrazo = defaultPercents.prazo;
          } else {
            const hasStoredVista = c.vendaVistaPercent !== undefined && c.vendaVistaPercent !== null && !isNaN(Number(c.vendaVistaPercent));
            const hasStoredPrazo = c.vendaPrazoPercent !== undefined && c.vendaPrazoPercent !== null && !isNaN(Number(c.vendaPrazoPercent));
            if (hasStoredVista) {
              resolvedVista = Math.min(100, Math.max(0, Number(c.vendaVistaPercent)));
              resolvedPrazo = hasStoredPrazo ? Math.min(100, Math.max(0, Number(c.vendaPrazoPercent))) : (100 - resolvedVista);
            }
          }

          reconciledCompanies.push({
            ...c,
            vendaVistaPercent: resolvedVista,
            vendaPrazoPercent: resolvedPrazo
          });
        }
      });
    } catch (e) {
      console.error('Erro ao reconciliar empresas com a base oficial:', e);
      reconciledCompanies = [...importedList];
    }
  } else {
    reconciledCompanies = importedList.map(c => {
      const clean = getCleanDocument(c.cnpj);
      const defaultPercents = getDefaultFaturamentoPercent(clean);
      return {
        ...c,
        vendaVistaPercent: defaultPercents.vista,
        vendaPrazoPercent: defaultPercents.prazo,
        opcaoSimples: c.opcaoSimples ?? (c.regimeTributario === 'SIMPLES_NACIONAL'),
        dataOpcaoSimples: c.dataOpcaoSimples || '',
        dataExclusaoSimples: c.dataExclusaoSimples || '',
        motivoExclusaoSimples: c.motivoExclusaoSimples || '',
        opcaoMei: c.opcaoMei || false
      };
    });
  }

  // Filtragem de segurança e ordenação alfabética
  const cleanedList = reconciledCompanies
    .filter(c => c && (c.razaoSocial || c.cnpj))
    .sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || '', 'pt-BR', { sensitivity: 'base' }));

  // Atualiza no localStorage para garantir persistência e marca a migração
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(COMPANIES_STORAGE_KEY, JSON.stringify(cleanedList));
      localStorage.setItem(COMPANIES_MIGRATION_VERSION_KEY, CURRENT_FATURAMENTO_VERSION);
    } catch (e) {
      console.error('Erro ao persistir base reconciliada:', e);
    }
  }

  return cleanedList;
}

/**
 * Salva a lista de empresas e dispara evento global de sincronização
 */
export function saveStoredCompanies(list: Company[]): Company[] {
  // Deduplicar e filtrar empresas válidas
  const seenDocs = new Set<string>();
  const seenIds = new Set<string>();
  const filtered: Company[] = [];

  list.forEach(c => {
    if (!c) return;
    const clean = getCleanDocument(c.cnpj);
    if (!c.razaoSocial && !c.cnpj && !clean) return;
    if (c.id && c.id.startsWith('demo-')) return;

    if (clean) {
      if (seenDocs.has(clean)) return;
      seenDocs.add(clean);
    } else if (c.id) {
      if (seenIds.has(c.id)) return;
      seenIds.add(c.id);
    }

    filtered.push(c);
  });

  const sorted = [...filtered].sort((a, b) =>
    (a.razaoSocial || '').localeCompare(b.razaoSocial || '', 'pt-BR', { sensitivity: 'base' })
  );

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(COMPANIES_STORAGE_KEY, JSON.stringify(sorted));
      window.dispatchEvent(new Event(COMPANIES_UPDATED_EVENT));
    } catch (e) {
      console.error('Erro ao salvar empresas:', e);
    }
  }

  return sorted;
}

/**
 * Atualiza manualmente o percentual de faturamento (à vista e a prazo) de uma empresa
 * e persiste imediatamente no localStorage, disparando o evento global de sincronização.
 */
export function updateCompanyFaturamentoPercent(companyIdOrCnpj: string, vistaPercent: number): Company[] {
  const cleanTarget = getCleanDocument(companyIdOrCnpj);
  const safeVista = Math.min(100, Math.max(0, isNaN(Number(vistaPercent)) ? 100 : Number(vistaPercent)));
  const safePrazo = 100 - safeVista;

  const currentList = loadStoredCompanies();
  const updated = currentList.map(comp => {
    const compClean = getCleanDocument(comp.cnpj);
    if (comp.id === companyIdOrCnpj || (cleanTarget && compClean === cleanTarget)) {
      return {
        ...comp,
        vendaVistaPercent: safeVista,
        vendaPrazoPercent: safePrazo
      };
    }
    return comp;
  });

  return saveStoredCompanies(updated);
}
