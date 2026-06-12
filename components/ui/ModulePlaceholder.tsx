import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDict } from "@/lib/i18n";

/** Единый placeholder будущих модулей: заголовок + описание + пустое состояние. */
export function ModulePlaceholder({
  title,
  description,
  note,
  icon,
}: {
  title: string;
  description: string;
  /** Доп. пояснение внутри пустого состояния (напр. для Diş xəritəsi). */
  note?: string;
  icon: LucideIcon;
}) {
  const t = getDict();
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState
          icon={icon}
          title={t.common.comingSoon}
          description={note ?? t.common.comingSoonDesc}
        />
      </Card>
    </>
  );
}
