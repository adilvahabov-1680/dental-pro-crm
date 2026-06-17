import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreateSupplierForm } from "@/components/suppliers/CreateSupplierForm";

export default async function NewSupplierPage() {
  const user = await requirePermission("inventory.manage");
  const t = getDict(user.locale);
  const ts = t.suppliers;

  return (
    <>
      <PageHeader
        title={ts.form.title}
        actions={
          <Link
            href="/inventory/suppliers"
            className="inline-flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="size-4" /> {ts.backToList}
          </Link>
        }
      />
      <div className="max-w-2xl">
        <CreateSupplierForm dict={ts} />
      </div>
    </>
  );
}
