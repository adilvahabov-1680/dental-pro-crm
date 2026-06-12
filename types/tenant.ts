/**
 * Tenant-фильтр для Prisma-запросов.
 * Пустой объект — только для super_admin (видит всё).
 */
export interface TenantFilter {
  clinicId?: string;
}
