/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Data Mapper Architecture Module
 * Abstrai a camada de persistência de dados. Atualmente utiliza LocalStorage para desempenho
 * local ultra-rápido, estruturado com interface assíncrona/promessas pronto para plugar bancos
 * SQL/NoSQL (Cloud SQL, Supabase, Firebase) sem alterar a lógica de negócios das ferramentas.
 */

export interface Repository<T> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  save(item: T): Promise<void>;
  saveAll(items: T[]): Promise<void>;
  delete(id: string): Promise<void>;
}

export class LocalStorageDataMapper<T extends { id: string }> implements Repository<T> {
  private storageKey: string;

  constructor(storageKey: string) {
    this.storageKey = storageKey;
  }

  async getAll(): Promise<T[]> {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      return JSON.parse(raw) as T[];
    } catch (err) {
      console.error(`[DataMapper] Erro ao ler key ${this.storageKey}:`, err);
      return [];
    }
  }

  async getById(id: string): Promise<T | null> {
    const items = await this.getAll();
    return items.find(item => item.id === id) || null;
  }

  async save(item: T): Promise<void> {
    const items = await this.getAll();
    const index = items.findIndex(i => i.id === item.id);
    if (index >= 0) {
      items[index] = item;
    } else {
      items.unshift(item);
    }
    localStorage.setItem(this.storageKey, JSON.stringify(items));
  }

  async saveAll(items: T[]): Promise<void> {
    localStorage.setItem(this.storageKey, JSON.stringify(items));
  }

  async delete(id: string): Promise<void> {
    const items = await this.getAll();
    const filtered = items.filter(i => i.id !== id);
    localStorage.setItem(this.storageKey, JSON.stringify(filtered));
  }
}
