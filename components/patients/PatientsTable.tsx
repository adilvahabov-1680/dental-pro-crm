import Link from "next/link";
import { Eye, Pencil, TriangleAlert, Baby } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { calcAge, cn, formatDate, isChildPatient } from "@/lib/utils";
import type { PatientListItem } from "@/lib/patients";
import type { Dict } from "@/i18n/az";

export function ChildBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info">
      <Baby className="size-3" /> {label}
    </span>
  );
}

export function AllergyBadge({ label, title }: { label: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning"
    >
      <TriangleAlert className="size-3" /> {label}
    </span>
  );
}

export function PatientsTable({
  items,
  dict,
  canManage,
}: {
  items: PatientListItem[];
  dict: Dict["patients"];
  canManage: boolean;
}) {
  const t = dict.table;
  const genderLabel = { male: dict.filters.male, female: dict.filters.female };

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs text-text-secondary">
            <th className="px-4 py-3 font-medium">{t.name}</th>
            <th className="hidden px-4 py-3 font-medium md:table-cell">{t.phone}</th>
            <th className="hidden px-4 py-3 font-medium sm:table-cell">{t.age}</th>
            <th className="hidden px-4 py-3 font-medium lg:table-cell">{t.gender}</th>
            <th className="hidden px-4 py-3 font-medium lg:table-cell">{t.doctor}</th>
            <th className="hidden px-4 py-3 font-medium xl:table-cell">{t.lastVisit}</th>
            <th className="hidden px-4 py-3 font-medium xl:table-cell">{t.created}</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const age = calcAge(p.birthDate);
            const child = isChildPatient(p.birthDate, p.guardianId);
            return (
              <tr
                key={p.id}
                className="border-b border-border-subtle/60 transition-colors last:border-0 hover:bg-bg-elevated/50"
              >
                <td className="px-4 py-3">
                  <Link href={`/patients/${p.id}`} className="group flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "font-medium text-text-primary transition-colors group-hover:text-accent",
                          p.status === "archived" && "text-text-secondary line-through",
                        )}
                      >
                        {p.lastName} {p.firstName}
                      </span>
                      {child && <ChildBadge label={dict.badges.child} />}
                      {p.allergies && (
                        <AllergyBadge label={dict.badges.allergy} title={p.allergies} />
                      )}
                    </span>
                    <span className="text-xs text-text-secondary md:hidden">
                      {p.phone ?? p.guardian?.phone ?? "—"}
                    </span>
                  </Link>
                </td>
                <td className="hidden px-4 py-3 tabular-nums text-text-secondary md:table-cell">
                  {p.phone ?? p.guardian?.phone ?? "—"}
                </td>
                <td className="hidden px-4 py-3 tabular-nums text-text-secondary sm:table-cell">
                  {age !== null ? `${age} ${t.yearsOld}` : "—"}
                </td>
                <td className="hidden px-4 py-3 text-text-secondary lg:table-cell">
                  {p.gender ? genderLabel[p.gender] : "—"}
                </td>
                <td className="hidden px-4 py-3 text-text-secondary lg:table-cell">
                  {p.primaryDoctor?.user.fullName ?? "—"}
                </td>
                <td className="hidden px-4 py-3 tabular-nums text-text-secondary xl:table-cell">
                  {p.appointments[0] ? formatDate(p.appointments[0].startsAt) : "—"}
                </td>
                <td className="hidden px-4 py-3 tabular-nums text-text-secondary xl:table-cell">
                  {formatDate(p.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/patients/${p.id}`}
                      title={t.view}
                      className="flex size-8 items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-bg-elevated hover:text-accent"
                    >
                      <Eye className="size-4" />
                    </Link>
                    {canManage && (
                      <Link
                        href={`/patients/${p.id}/edit`}
                        title={t.edit}
                        className="flex size-8 items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-bg-elevated hover:text-accent"
                      >
                        <Pencil className="size-4" />
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
