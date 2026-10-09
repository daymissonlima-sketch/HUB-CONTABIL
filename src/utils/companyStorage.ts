import { Company } from '../types_debits';
import importedCompaniesJson from '../data/imported_companies.json';

export const COMPANIES_STORAGE_KEY = 'moreira_lima_companies';
export const COMPANIES_UPDATED_EVENT = 'moreira_lima_companies_updated';

export function getCleanDocument(doc: string | undefined | null): string {
  return (doc || '').replace(/\D/g, '');
}

export function isBlacklistedCompany(_company?: { razaoSocial?: string; cnpj?: string }): boolean {
  return false;
}

/**
 * Identifica empresas cujo padrão é 100% à vista e 0% a prazo
 * (Ex: MARAPONGA POINT e NG SERVIÇOS)
 */
export function is100PercentVistaCompany(cleanDoc: string, name?: string): boolean {
  const n = (name || '').toUpperCase();
  return (
    cleanDoc === '15760237000148' || // MARAPONGA POINT COMERCIO DE ALIMENTOS LTDA
    cleanDoc === '24986737000193' || // NG SERVICOS DE APOIO ADMINISTRATIVO LTDA
    n.includes('MARAPONGA POINT') ||
    n.includes('NG SERVICOS') ||
    n.includes('NG SERVIÇOS')
  );
}

/**
 * Carrega a lista consolidada e sincronizada de empresas.
 * Garante que a base do sistema em todas as ferramentas (Opção do Simples Nacional,
 * Configurações Gerais, Levantamento de Débitos, Gerador de Faturamento, etc.)
 * tenha estritamente as empresas da planilha oficial atualizada (imported_companies.json),
 * eliminando cadastros excluídos e incorporando novos, ao mesmo tempo em que preserva
 * dados enriquecidos (consultas de situação, histórico do Simples, regimes personalizados, etc.).
 */
export function loadStoredCompanies(): Company[] {
  const importedList = (importedCompaniesJson as unknown) as Company[];
  const stored = typeof window !== 'undefined' ? localStorage.getItem(COMPANIES_STORAGE_KEY) : null;

  // Mapa de empresas oficiais da planilha indexadas pelo CNPJ limpo
  const officialMap = new Map<string, Company>();
  importedList.forEach(c => {
    const clean = getCleanDocument(c.cnpj);
    if (clean) {
      officialMap.set(clean, c);
    }
  });

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

      // Itera estritamente sobre a base oficial da planilha:
      // Remove qualquer empresa excluída da planilha e adiciona as novas
      reconciledCompanies = importedList.map(official => {
        const clean = getCleanDocument(official.cnpj);
        const storedItem = parsedMap.get(clean);

        // Define percentual padrão com base na regra de negócio
        const isSpecial100 = is100PercentVistaCompany(clean, official.razaoSocial);
        let resolvedVista = isSpecial100 ? 100 : (official.vendaVistaPercent ?? 10);
        let resolvedPrazo = isSpecial100 ? 0 : (official.vendaPrazoPercent ?? 90);

        if (storedItem) {
          const hasStoredVista = storedItem.vendaVistaPercent !== undefined && storedItem.vendaVistaPercent !== null && !isNaN(Number(storedItem.vendaVistaPercent));
          const hasStoredPrazo = storedItem.vendaPrazoPercent !== undefined && storedItem.vendaPrazoPercent !== null && !isNaN(Number(storedItem.vendaPrazoPercent));

          if (hasStoredVista) {
            const sVista = Math.min(100, Math.max(0, Number(storedItem.vendaVistaPercent)));
            const sPrazo = hasStoredPrazo ? Math.min(100, Math.max(0, Number(storedItem.vendaPrazoPercent))) : (100 - sVista);

            // Se for empresa de regra 100% mas estava com o padrão genérico anterior de 10%/90%, atualiza para 100%/0%
            if (isSpecial100 && sVista === 10 && sPrazo === 90) {
              resolvedVista = 100;
              resolvedPrazo = 0;
            } else {
              resolvedVista = sVista;
              resolvedPrazo = sPrazo;
            }
          }

          return {
            ...official,
            ...storedItem,
            id: storedItem.id || official.id,
            razaoSocial: storedItem.razaoSocial || official.razaoSocial,
            cnpj: storedItem.cnpj || official.cnpj,
            // Preserva dados enriquecidos pelo usuário ou pela API da Receita Federal
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

      // Inclui empresas cadastradas manualmente que não estejam na planilha oficial
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
          reconciledCompanies.push(c);
        }
      });
    } catch (e) {
      console.error('Erro ao reconciliar empresas com a base oficial:', e);
      reconciledCompanies = [...importedList];
    }
  } else {
    reconciledCompanies = importedList.map(c => {
      const clean = getCleanDocument(c.cnpj);
      const isSpecial100 = is100PercentVistaCompany(clean, c.razaoSocial);
      return {
        ...c,
        vendaVistaPercent: isSpecial100 ? 100 : (c.vendaVistaPercent ?? 10),
        vendaPrazoPercent: isSpecial100 ? 0 : (c.vendaPrazoPercent ?? 90),
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

  // Atualiza no localStorage para garantir consistência imediata
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(COMPANIES_STORAGE_KEY, JSON.stringify(cleanedList));
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
 * Atualiza rapidamente o percentual de faturamento (à vista e a prazo) de uma empresa
 * e persiste imediatamente no localStorage, disparando o evento global de sincronização.
 */
export function updateCompanyFaturamentoPercent(companyIdOrCnpj: string, vistaPercent: number): Company[] {
  const cleanTarget = getCleanDocument(companyIdOrCnpj);
  const safeVista = Math.min(100, Math.max(0, isNaN(Number(vistaPercent)) ? 10 : Number(vistaPercent)));
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

