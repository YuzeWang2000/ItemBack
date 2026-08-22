import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { LocalFileStorage } from '../src/attachments/storage/local-file.storage';

describe('LocalFileStorage', () => {
  const storage = new LocalFileStorage({ get: () => './storage-test' } as unknown as ConfigService);

  it.each([
    '../secret',
    '2026/08/../../secret',
    'C:\\Windows\\secret',
    '2026/08/not-a-uuid.bin',
    '2026/08/00000000-0000-4000-8000-000000000001.svg',
  ])('rejects untrusted storage key %s', (key) => {
    expect(() => storage.resolve(key)).toThrow(BadRequestException);
  });

  it('resolves only server-generated keys beneath the storage root', () => {
    const resolved = storage.resolve('2026/08/00000000-0000-4000-8000-000000000001.bin');
    expect(resolved).toContain('storage-test');
    expect(resolved.endsWith('00000000-0000-4000-8000-000000000001.bin')).toBe(true);
  });
});
