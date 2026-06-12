import { ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

/** Платформенная админ-панель — только super_admin. */
export default async function AdminPage() {
  const user = await requireRole("super_admin");
  const t = getDict(user.locale);
  return (
    <ModulePlaceholder
      title={t.modules.admin.title}
      description={t.modules.admin.desc}
      icon={ShieldCheck}
    />
  );
}
