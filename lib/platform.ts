/**
 * Platform-level data functions — только super_admin.
 * Работает через prisma напрямую (не tenantClient): super_admin видит все клиники.
 */
import { prisma } from "@/lib/prisma";
import type { RoleKey } from "@/types/auth";

export interface ClinicRow {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: "trial" | "active" | "suspended";
  clinicType: "clinic" | "solo_doctor";
  userCount: number;
  createdAt: Date;
}

export interface ClinicUserRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  roleKey: RoleKey;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface ClinicDetail {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  timezone: string;
  currency: string;
  defaultLocale: "az" | "ru" | "en";
  status: "trial" | "active" | "suspended";
  clinicType: "clinic" | "solo_doctor";
  plan: string | null;
  createdAt: Date;
  users: ClinicUserRow[];
}

export async function listClinics(): Promise<ClinicRow[]> {
  const clinics = await prisma.clinic.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { users: { where: { deletedAt: null, isActive: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return clinics.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    phone: c.phone,
    email: c.email,
    address: c.address,
    status: c.status as ClinicRow["status"],
    clinicType: c.clinicType as ClinicRow["clinicType"],
    userCount: c._count.users,
    createdAt: c.createdAt,
  }));
}

export async function getClinicDetail(clinicId: string): Promise<ClinicDetail | null> {
  const clinic = await prisma.clinic.findFirst({
    where: { id: clinicId, deletedAt: null },
    include: {
      users: {
        where: { deletedAt: null },
        include: { role: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!clinic) return null;
  return {
    id: clinic.id,
    name: clinic.name,
    slug: clinic.slug,
    phone: clinic.phone,
    email: clinic.email,
    address: clinic.address,
    timezone: clinic.timezone,
    currency: clinic.currency,
    defaultLocale: clinic.defaultLocale as ClinicDetail["defaultLocale"],
    status: clinic.status as ClinicDetail["status"],
    clinicType: clinic.clinicType as ClinicDetail["clinicType"],
    plan: clinic.plan,
    createdAt: clinic.createdAt,
    users: clinic.users
      .filter((u) => u.role.key !== "super_admin")
      .map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        roleKey: u.role.key as RoleKey,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      })),
  };
}
