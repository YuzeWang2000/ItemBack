import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const DAY_MS = 86_400_000;

function utcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

@Injectable()
export class CostService {
  calculate(
    valueAmount: Prisma.Decimal | string | null,
    acquiredDate: Date | null,
    endDate: Date | null,
    now = new Date(),
  ) {
    if (!acquiredDate) return { holdingDays: null, dailyCost: null };
    const through = endDate ?? now;
    const difference = Math.floor((utcDay(through) - utcDay(acquiredDate)) / DAY_MS);
    const holdingDays = Math.max(1, difference + 1);
    if (valueAmount == null) return { holdingDays, dailyCost: null };
    const dailyCost = new Prisma.Decimal(valueAmount).div(holdingDays).toDecimalPlaces(4);
    return { holdingDays, dailyCost: dailyCost.toFixed(4) };
  }
}
