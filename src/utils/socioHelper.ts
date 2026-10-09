import { Company } from '../types_debits';
import { loadStoredCompanies, saveStoredCompanies } from './companyStorage';

export interface ResolvedSocioAdmin {
  nome: string;
  cpf: string;
  qualificacao: string;
  hasSocio: boolean;
  isFemale: boolean;
  roleTitle: string;
}

export interface PartnerOption {
  nome: string;
  cpf: string;
  qualificacao: string;
  isFemale: boolean;
  roleTitle: string;
}

const FEMALE_EXCEPTIONS = new Set([
  'BEATRIZ', 'RAQUEL', 'ALICE', 'MIRIAM', 'ESTER', 'ESTHER', 'CARMEN', 'SIMONE',
  'DENISE', 'CRISTIANE', 'INÊS', 'INES', 'LILIAN', 'KAREN', 'NICOLE', 'ELLEN',
  'HELEN', 'SUELI', 'CLEIDE', 'IVONE', 'MARI', 'ISABEL', 'MARISE', 'GISLEINE',
  'FRANCIELE', 'DANIELE', 'MICHELE', 'EMANUELE', 'SOLANGE', 'DORIS', 'GLEICE',
  'LUZIA', 'MARLI', 'DIRCE', 'NEIDE', 'IRACI', 'IVETE', 'JANETE', 'ODETE',
  'ELIZABETH', 'MARGARETE', 'BERENICE', 'ARACI', 'JACY', 'SUELY', 'SHIRLEY',
  'EDITE', 'GLADIS', 'MONIQUE', 'JACQUELINE', 'ROSE', 'LIZ', 'MERCEDES',
  'LOURDES', 'ZENILDA', 'ZULEIDE', 'ROSICLER'
]);

const MALE_EXCEPTIONS_ENDING_IN_A = new Set([
  'LUCA', 'LUCAS', 'JOSHUA', 'JEAN', 'ALAN', 'IAN', 'ELIA', 'ELIAS', 'ISAIAS',
  'ISAÍAS', 'JEREMIAS', 'ZACARIAS', 'JONAS', 'BARNABÉ', 'MALAQUIAS', 'NICOLAU',
  'ALEXANDRE', 'ANDRÉ', 'ANDRE', 'FELIPE', 'GUILHERME', 'HENRIQUE', 'JORGE',
  'JOSÉ', 'JOSE', 'VICENTE', 'AYRTON', 'AIRTON', 'PABLO', 'SAULO'
]);

/**
 * Checks whether a given partner name or qualification represents a female person
 */
export function isFemalePartner(nome: string, qualificacao?: string): boolean {
  if (qualificacao) {
    const qUpper = qualificacao.toUpperCase();
    if (qUpper.includes('SÓCIA') || qUpper.includes('SOCIA') || qUpper.includes('ADMINISTRADORA') || qUpper.includes('DIRETORA')) {
      return true;
    }
  }

  if (!nome) return false;
  const rawFirst = nome.trim().toUpperCase().split(/\s+/)[0];
  const firstName = rawFirst.replace(/[^A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]/g, '');
  if (!firstName) return false;

  if (FEMALE_EXCEPTIONS.has(firstName)) {
    return true;
  }

  if (MALE_EXCEPTIONS_ENDING_IN_A.has(firstName)) {
    return false;
  }

  // Names ending in 'A' or 'AH' are almost universally female in Portuguese (e.g. Patricia, Maria, Ana, etc.)
  if (firstName.endsWith('A') || firstName.endsWith('AH')) {
    return true;
  }

  return false;
}

/**
 * Returns 'SÓCIA ADMINISTRADORA' or 'SÓCIO ADMINISTRADOR'
 */
export function getSocioRoleTitle(nome: string, qualificacao?: string, uppercase: boolean = true): string {
  const female = isFemalePartner(nome, qualificacao);
  if (uppercase) {
    return female ? 'SÓCIA ADMINISTRADORA' : 'SÓCIO ADMINISTRADOR';
  }
  return female ? 'Sócia Administradora' : 'Sócio Administrador';
}

/**
 * Formats a raw 11-digit CPF to 000.000.000-00, or returns the string if already formatted or masked
 */
export function formatCpf(val: string): string {
  if (!val) return '';
  const clean = val.replace(/\D/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
  }
  return val.trim();
}

/**
 * Extracts all known partners for a company from both sociosDetalhados and quadroSocietario
 */
export function getAllCompanyPartners(company?: Company | null): PartnerOption[] {
  if (!company) return [];
  const list: PartnerOption[] = [];
  const seenNames = new Set<string>();

  // 1. Check sociosDetalhados
  if (company.sociosDetalhados && company.sociosDetalhados.length > 0) {
    company.sociosDetalhados.forEach(s => {
      const name = (s.nome || '').trim().toUpperCase();
      if (name && !seenNames.has(name)) {
        seenNames.add(name);
        const female = isFemalePartner(name, s.qualificacao);
        list.push({
          nome: name,
          cpf: formatCpf(s.documento || ''),
          qualificacao: s.qualificacao || (female ? 'Sócia-Administradora' : 'Sócio-Administrador'),
          isFemale: female,
          roleTitle: female ? 'SÓCIA ADMINISTRADORA' : 'SÓCIO ADMINISTRADOR'
        });
      }
    });
  }

  // 2. Check quadroSocietario strings (e.g. "PATRICIA DE FREITAS SARAIVA MOREIRA (Sócio-Administrador)")
  if (company.quadroSocietario && company.quadroSocietario.length > 0) {
    company.quadroSocietario.forEach(str => {
      if (!str) return;
      const match = str.match(/^([^(]+)(?:\(([^)]+)\))?/);
      const name = match ? match[1].trim().toUpperCase() : str.trim().toUpperCase();
      const female = isFemalePartner(name, str);
      const qual = match && match[2] ? match[2].trim() : (female ? 'Sócia-Administradora' : 'Sócio-Administrador');
      if (name && !seenNames.has(name)) {
        seenNames.add(name);
        list.push({
          nome: name,
          cpf: '',
          qualificacao: qual,
          isFemale: female,
          roleTitle: female ? 'SÓCIA ADMINISTRADORA' : 'SÓCIO ADMINISTRADOR'
        });
      }
    });
  }

  return list;
}

/**
 * Resolves the Sócio/Sócia Administrador(a) for a company.
 * Priority:
 * 1. Explicitly configured socioNome / socioCpf on the company
 * 2. Partner with administrator qualification in sociosDetalhados
 * 3. First partner in sociosDetalhados
 * 4. Partner with administrator qualification in quadroSocietario
 * 5. First partner in quadroSocietario
 */
export function getResolvedSocioAdmin(company?: Company | null): ResolvedSocioAdmin {
  if (!company) {
    return {
      nome: '',
      cpf: '',
      qualificacao: 'Sócio-Administrador',
      hasSocio: false,
      isFemale: false,
      roleTitle: 'SÓCIO ADMINISTRADOR'
    };
  }

  // 1. Explicitly configured fields
  if (company.socioNome && company.socioNome.trim()) {
    const nome = company.socioNome.trim().toUpperCase();
    const isFemale = isFemalePartner(nome, company.socioQualificacao);
    const roleTitle = isFemale ? 'SÓCIA ADMINISTRADORA' : 'SÓCIO ADMINISTRADOR';
    const qual = company.socioQualificacao || (isFemale ? 'Sócia-Administradora' : 'Sócio-Administrador');
    return {
      nome,
      cpf: company.socioCpf ? formatCpf(company.socioCpf.trim()) : '',
      qualificacao: qual,
      hasSocio: true,
      isFemale,
      roleTitle
    };
  }

  // 2. Search in sociosDetalhados
  if (company.sociosDetalhados && company.sociosDetalhados.length > 0) {
    // Try to find one with administrator qualification
    const adminMatch = company.sociosDetalhados.find(s => 
      s.qualificacao && /administrador|admin|titular|diretor|gerente|empres[aá]rio/i.test(s.qualificacao)
    );
    const chosen = adminMatch || company.sociosDetalhados[0];
    if (chosen && chosen.nome && chosen.nome.trim()) {
      const nome = chosen.nome.trim().toUpperCase();
      const isFemale = isFemalePartner(nome, chosen.qualificacao);
      const roleTitle = isFemale ? 'SÓCIA ADMINISTRADORA' : 'SÓCIO ADMINISTRADOR';
      const qual = chosen.qualificacao || (isFemale ? 'Sócia-Administradora' : 'Sócio-Administrador');
      return {
        nome,
        cpf: chosen.documento ? formatCpf(chosen.documento.trim()) : '',
        qualificacao: qual,
        hasSocio: true,
        isFemale,
        roleTitle
      };
    }
  }

  // 3. Search in quadroSocietario strings
  if (company.quadroSocietario && company.quadroSocietario.length > 0) {
    const adminStr = company.quadroSocietario.find(s => 
      /administrador|admin|titular|diretor|gerente|empres[aá]rio/i.test(s)
    ) || company.quadroSocietario[0];

    if (adminStr) {
      const match = adminStr.match(/^([^(]+)(?:\(([^)]+)\))?/);
      const name = match ? match[1].trim().toUpperCase() : adminStr.trim().toUpperCase();
      const isFemale = isFemalePartner(name, adminStr);
      const roleTitle = isFemale ? 'SÓCIA ADMINISTRADORA' : 'SÓCIO ADMINISTRADOR';
      const qual = match && match[2] ? match[2].trim() : (isFemale ? 'Sócia-Administradora' : 'Sócio-Administrador');
      return {
        nome: name,
        cpf: '',
        qualificacao: qual,
        hasSocio: Boolean(name),
        isFemale,
        roleTitle
      };
    }
  }

  return {
    nome: '',
    cpf: '',
    qualificacao: 'Sócio-Administrador',
    hasSocio: false,
    isFemale: false,
    roleTitle: 'SÓCIO ADMINISTRADOR'
  };
}

/**
 * Updates the socio administrador info for a company in local storage
 */
export function updateCompanySocio(
  companyId: string,
  socioNome: string,
  socioCpf: string,
  socioQualificacao: string = 'Sócio-Administrador'
): Company[] {
  const companies = loadStoredCompanies();
  const updated = companies.map(c => {
    if (c.id === companyId) {
      return {
        ...c,
        socioNome: socioNome.trim().toUpperCase(),
        socioCpf: formatCpf(socioCpf),
        socioQualificacao: socioQualificacao.trim()
      };
    }
    return c;
  });
  return saveStoredCompanies(updated);
}
