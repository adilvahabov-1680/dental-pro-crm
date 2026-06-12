import { PrismaClient } from "@prisma/client";

/**
 * Singleton PrismaClient (защита от утечки соединений при hot-reload).
 * ВАЖНО: для бизнес-запросов использовать tenantClient() из lib/tenant.ts,
 * а не этот клиент напрямую — см. docs/DEVELOPMENT_RULES.md, правило 1.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
