export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface StoredFile {
  storageKey: string;
  absolutePath: string;
}

export interface FileStorage {
  save(data: Buffer): Promise<StoredFile>;
  resolve(storageKey: string): string;
  remove(storageKey: string): Promise<void>;
}
