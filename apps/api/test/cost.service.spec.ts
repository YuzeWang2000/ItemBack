import { Prisma } from '@prisma/client';
import { CostService } from '../src/nodes/cost.service';

describe('CostService', () => {
  const service = new CostService();
  const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

  it('counts the acquisition day inclusively and never uses fewer than one day', () => {
    expect(
      service.calculate(new Prisma.Decimal('600'), date('2026-08-21'), null, date('2026-08-21')),
    ).toEqual({ holdingDays: 1, dailyCost: '600.0000' });
  });

  it('uses inclusive natural days across a date boundary', () => {
    expect(
      service.calculate(new Prisma.Decimal('600'), date('2026-06-23'), null, date('2026-08-21')),
    ).toEqual({ holdingDays: 60, dailyCost: '10.0000' });
  });

  it('uses endDate instead of today when ownership has ended', () => {
    expect(
      service.calculate(
        new Prisma.Decimal('100'),
        date('2026-01-01'),
        date('2026-01-10'),
        date('2026-08-21'),
      ),
    ).toEqual({ holdingDays: 10, dailyCost: '10.0000' });
  });

  it('distinguishes missing value from zero', () => {
    expect(service.calculate(null, date('2026-08-20'), null, date('2026-08-21'))).toEqual({
      holdingDays: 2,
      dailyCost: null,
    });
    expect(
      service.calculate(new Prisma.Decimal(0), date('2026-08-20'), null, date('2026-08-21')),
    ).toEqual({ holdingDays: 2, dailyCost: '0.0000' });
  });

  it('cannot calculate holding days without an acquisition date', () => {
    expect(service.calculate(new Prisma.Decimal('600'), null, null, date('2026-08-21'))).toEqual({
      holdingDays: null,
      dailyCost: null,
    });
  });
});
