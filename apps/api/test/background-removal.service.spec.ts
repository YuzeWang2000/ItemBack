import { BadRequestException } from '@nestjs/common';
import { BackgroundRemovalService } from '../src/attachments/background-removal.service';
import { BACKGROUND_ALGORITHM_VERSION } from '../src/attachments/background-removal.runner';

describe('BackgroundRemovalService requests', () => {
  const source = {
    id: 'source-id',
    itemId: 'item-id',
    mimeType: 'image/jpeg',
    checksum: 'a'.repeat(64),
  };

  function createService(overrides: Record<string, unknown> = {}) {
    const prisma = {
      attachment: { findFirst: jest.fn().mockResolvedValue({ ...source, ...overrides }) },
      backgroundRemovalJob: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'job-id', ...data })),
        update: jest.fn(),
      },
    };
    const runner = { isConfigured: jest.fn().mockReturnValue(false) };
    const storage = {};
    return {
      prisma,
      service: new BackgroundRemovalService(prisma as never, runner as never, storage as never),
    };
  }

  it('records an explicit unavailable status instead of falling back to a cloud service', async () => {
    const { prisma, service } = createService();
    const job = await service.request(source.id);
    expect(job).toMatchObject({
      status: 'UNAVAILABLE',
      errorCode: 'BACKGROUND_REMOVAL_UNAVAILABLE',
      sourceChecksum: source.checksum,
      algorithmVersion: BACKGROUND_ALGORITHM_VERSION,
    });
    expect(prisma.backgroundRemovalJob.create).toHaveBeenCalledTimes(1);
  });

  it('rejects non-image attachments before creating a job', async () => {
    const { prisma, service } = createService({ mimeType: 'application/pdf' });
    await expect(service.request(source.id)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.backgroundRemovalJob.create).not.toHaveBeenCalled();
  });
});
