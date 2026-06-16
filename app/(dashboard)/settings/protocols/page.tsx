import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { listProtocols } from "@/lib/protocols";
import { listServicesWithPrice } from "@/lib/treatments";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProtocolList } from "@/components/protocols/ProtocolList";
import { ProtocolCreateForm } from "@/components/protocols/ProtocolCreateForm";

export default async function ProtocolsPage() {
  const user = await requirePermission("settings.view");
  const t = getDict(user.locale);
  const ts = t.settings;
  const canManage = hasPermission(user, "settings.manage");

  const [protocols, services] = await Promise.all([
    listProtocols(user),
    listServicesWithPrice(user),
  ]);

  return (
    <>
      <PageHeader
        title={ts.protocols.title}
        description={ts.protocols.desc}
        actions={
          <Link
            href="/settings"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <ArrowLeft className="size-4" /> {ts.protocols.backToSettings}
          </Link>
        }
      />

      {!canManage && (
        <p className="mb-4 rounded-[10px] border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          {ts.readOnly}
        </p>
      )}

      {canManage && (
        <div className="mb-6">
          <ProtocolCreateForm
            labels={{
              new: ts.protocols.new,
              nameLabel: ts.protocols.nameLabel,
              descLabel: ts.protocols.descLabel,
              create: ts.protocols.create,
              creating: ts.protocols.creating,
              error: ts.errors.generic,
            }}
          />
        </div>
      )}

      <ProtocolList
        protocols={protocols}
        services={services}
        canManage={canManage}
        labels={{
          steps: ts.protocols.steps,
          stepsTitle: ts.protocols.stepsTitle,
          addStep: ts.protocols.addStep,
          stepService: ts.protocols.stepService,
          stepOrder: ts.protocols.stepOrder,
          stepDuration: ts.protocols.stepDuration,
          stepInterval: ts.protocols.stepInterval,
          stepNotes: ts.protocols.stepNotes,
          stepAdd: ts.protocols.stepAdd,
          stepDelete: ts.protocols.stepDelete,
          active: ts.protocols.active,
          inactive: ts.protocols.inactive,
          toggle: ts.protocols.toggle,
          delete: ts.protocols.delete,
          empty: ts.protocols.empty,
          serviceNone: t.treatments.form.serviceNone,
          saved: ts.saved,
          error: ts.errors.generic,
          serviceRequired: ts.errors.nameRequired,
        }}
      />
    </>
  );
}
