/**
 * Визуальная карта статусов зуба (DENTAL_CHART.md §2).
 * Только токены дизайн-системы (вкл. status-orange/status-violet из globals.css).
 * icon — цвет силуэта зуба; pill — бейдж статуса; dot — точка легенды.
 */
export interface ToothStatusStyle {
  icon: string;
  pill: string;
  dot: string;
  /** доп. стиль кнопки зуба (напр. «погашенный» удалённый зуб) */
  btn?: string;
}

export const TOOTH_STATUS_STYLES: Record<string, ToothStatusStyle> = {
  healthy: {
    icon: "text-text-secondary/60",
    pill: "bg-bg-elevated text-text-secondary",
    dot: "bg-text-secondary/60",
  },
  needs_treatment: {
    icon: "text-warning",
    pill: "bg-warning/10 text-warning",
    dot: "bg-warning",
  },
  in_treatment: {
    icon: "text-accent",
    pill: "bg-accent/10 text-accent",
    dot: "bg-accent",
  },
  completed: {
    icon: "text-success",
    pill: "bg-success/10 text-success",
    dot: "bg-success",
  },
  implant: {
    icon: "text-info",
    pill: "bg-info/10 text-info",
    dot: "bg-info",
  },
  extracted: {
    icon: "text-text-secondary/30",
    pill: "bg-bg-elevated text-text-secondary/60",
    dot: "bg-text-secondary/30",
    btn: "opacity-50",
  },
  root_canal: {
    icon: "text-status-orange",
    pill: "bg-status-orange/10 text-status-orange",
    dot: "bg-status-orange",
  },
  filling: {
    icon: "text-accent-deep",
    pill: "bg-accent-deep/15 text-accent",
    dot: "bg-accent-deep",
  },
  crown: {
    icon: "text-status-violet",
    pill: "bg-status-violet/10 text-status-violet",
    dot: "bg-status-violet",
  },
  observation: {
    icon: "text-secondary",
    pill: "bg-secondary/10 text-secondary",
    dot: "bg-secondary",
  },
  temporary_filling: {
    icon: "text-warning/70",
    pill: "bg-warning/10 text-warning/80",
    dot: "bg-warning/60",
  },
  crown_needed: {
    icon: "text-status-violet/70",
    pill: "bg-status-violet/10 text-status-violet/80",
    dot: "bg-status-violet/60",
  },
  extraction_planned: {
    icon: "text-danger",
    pill: "bg-danger/10 text-danger",
    dot: "bg-danger",
  },
};

export function toothStyle(status: string): ToothStatusStyle {
  return TOOTH_STATUS_STYLES[status] ?? TOOTH_STATUS_STYLES.healthy;
}
