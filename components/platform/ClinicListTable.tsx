"use client";

import Link from "next/link";
import type { ClinicRow } from "@/lib/platform";
import type { Dict } from "@/i18n/az";

type Labels = Dict["platform"]["clinics"]["table"];
type StatusLabels = Dict["platform"]["clinics"]["statuses"];
type TypeLabels = Dict["platform"]["clinics"]["types"];

const STATUS_COLORS: Record<string, string> = {
  trial: "border-warning/30 bg-warning/10 text-warning",
  active: "border-success/30 bg-success/10 text-success",
  suspended: "border-danger/30 bg-danger/10 text-danger",
};

export function ClinicListTable({
  clinics,
  labels,
  statusLabels,
  typeLabels,
}: {
  clinics: ClinicRow[];
  labels: Labels;
  statusLabels: StatusLabels;
  typeLabels: TypeLabels;
}) {
  if (clinics.length === 0) {
    return (
      <p className="rounded-[12px] border border-border-subtle bg-bg-surface p-6 text-center text-sm text-text-secondary">
        Hələ klinika yoxdur.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[14px] border border-border-subtle bg-bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle">
            {[labels.name, labels.phone, labels.email, labels.type, labels.status, labels.users, labels.created, ""].map(
              (h, i) => (
                <th
                  key={i}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-tertiary"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle/50">
          {clinics.map((c) => (
            <tr key={c.id} className="hover:bg-bg-elevated/40 transition-colors">
              <td className="px-4 py-3 font-medium text-text-primary">{c.name}</td>
              <td className="px-4 py-3 text-text-secondary">{c.phone ?? "—"}</td>
              <td className="px-4 py-3 text-text-secondary">{c.email ?? "—"}</td>
              <td className="px-4 py-3 text-text-secondary">{typeLabels[c.clinicType]}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status] ?? ""}`}>
                  {statusLabels[c.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-text-secondary">{c.userCount}</td>
              <td className="px-4 py-3 text-text-secondary">
                {c.createdAt.toLocaleDateString("az-Latn-AZ")}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/platform/clinics/${c.id}`}
                  className="rounded-[8px] border border-border-subtle bg-bg-elevated px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-surface"
                >
                  {labels.manage}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
