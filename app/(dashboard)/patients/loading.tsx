import { Card } from "@/components/ui/Card";

/** Skeleton списка пациентов (DESIGN.md §4: загрузка — skeleton, не спиннер). */
export default function PatientsLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-48 rounded-lg bg-bg-elevated" />
      <div className="mb-4 flex gap-2">
        <div className="h-9 flex-1 rounded-[10px] bg-bg-elevated" />
        <div className="h-9 w-28 rounded-[10px] bg-bg-elevated" />
        <div className="h-9 w-28 rounded-[10px] bg-bg-elevated" />
      </div>
      <Card className="space-y-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-[10px] bg-bg-elevated/70" />
        ))}
      </Card>
    </div>
  );
}
