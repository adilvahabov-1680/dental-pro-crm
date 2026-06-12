"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createTreatmentItem } from "@/lib/actions/treatments";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import type { TreatmentFormState } from "@/lib/validation/treatments";
import type { Dict } from "@/i18n/az";

interface Option {
  id: string;
  name: string;
}

export function TreatmentForm({
  dict,
  patients,
  patientLocked,
  doctors,
  doctorLocked,
  services,
  plans,
  appointments,
  toothNumbers,
  statusOptions,
  defaults,
  cancelHref,
}: {
  dict: Dict["treatments"];
  patients: Option[];
  /** пациент зафиксирован (создание из карточки пациента/карты/приёма) */
  patientLocked: boolean;
  doctors: Option[];
  doctorLocked: boolean;
  /** price: qəpik | null (нет в прайсе → ручной ввод) */
  services: Array<{ id: string; name: string; price: number | null }>;
  plans: Array<{ id: string; title: string }>;
  appointments: Array<{ id: string; label: string }>;
  toothNumbers: number[];
  statusOptions: Array<{ value: string; label: string }>;
  defaults: {
    patientId?: string;
    doctorId?: string;
    toothNumber?: number;
    appointmentId?: string;
  };
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<TreatmentFormState | undefined, FormData>(
    createTreatmentItem,
    undefined,
  );
  const [price, setPrice] = useState("");
  const f = dict.form;
  const err = (key: string) =>
    state?.fieldErrors?.[key]
      ? dict.errors[state.fieldErrors[key] as keyof typeof dict.errors] ?? dict.errors.generic
      : undefined;

  function onServiceChange(serviceId: string) {
    const s = services.find((x) => x.id === serviceId);
    // автоподстановка из прайса; нет цены → оставить ручной ввод
    if (s?.price != null) setPrice((s.price / 100).toFixed(2));
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-border-subtle bg-bg-surface/80 p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          {patientLocked ? (
            <>
              <input type="hidden" name="patientId" value={defaults.patientId ?? ""} />
              <Input
                label={f.patient}
                value={patients.find((p) => p.id === defaults.patientId)?.name ?? "—"}
                disabled
              />
            </>
          ) : (
            <Select
              id="patientId"
              name="patientId"
              label={f.patient}
              required
              defaultValue={defaults.patientId ?? ""}
              error={err("patientId")}
            >
              <option value="">{f.patientNone}</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        {doctorLocked ? (
          <>
            <input type="hidden" name="doctorId" value={defaults.doctorId ?? ""} />
            <Input
              label={f.doctor}
              value={doctors.find((d) => d.id === defaults.doctorId)?.name ?? "—"}
              disabled
            />
          </>
        ) : (
          <Select
            id="doctorId"
            name="doctorId"
            label={f.doctor}
            required
            defaultValue={defaults.doctorId ?? ""}
            error={err("doctorId")}
          >
            <option value="">—</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}

        <Select
          id="serviceId"
          name="serviceId"
          label={f.service}
          required
          defaultValue=""
          error={err("serviceId")}
          onChange={(e) => onServiceChange(e.target.value)}
        >
          <option value="">{f.serviceNone}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.price != null ? ` · ${(s.price / 100).toFixed(2)} ₼` : ""}
            </option>
          ))}
        </Select>

        <Select
          id="toothNumber"
          name="toothNumber"
          label={f.tooth}
          defaultValue={defaults.toothNumber ? String(defaults.toothNumber) : ""}
          error={err("toothNumber")}
        >
          <option value="">{f.toothNone}</option>
          {toothNumbers.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>

        <Select id="treatmentPlanId" name="treatmentPlanId" label={f.plan} defaultValue="">
          <option value="">{f.planNone}</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>

        <Select
          id="appointmentId"
          name="appointmentId"
          label={f.appointment}
          defaultValue={defaults.appointmentId ?? ""}
        >
          <option value="">{f.appointmentNone}</option>
          {appointments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>

        <Select id="status" name="status" label={f.status} defaultValue="planned">
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        <div>
          <Input
            id="price"
            name="price"
            label={f.price}
            required
            inputMode="decimal"
            placeholder="80.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={err("price")}
          />
          <p className="mt-1 text-[11px] text-text-secondary/70">{f.priceHint}</p>
        </div>

        <Input
          id="discount"
          name="discount"
          label={f.discount}
          inputMode="decimal"
          placeholder="0"
          error={err("discount")}
        />

        <div>
          <Input id="performedAt" name="performedAt" type="date" label={f.performedAt} />
          <p className="mt-1 text-[11px] text-text-secondary/70">{f.performedAtHint}</p>
        </div>

        <div className="sm:col-span-2">
          <Textarea id="notes" name="notes" label={f.notes} />
        </div>
      </div>

      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? f.saving : f.save}
        </Button>
        <Link
          href={cancelHref}
          className="text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          {f.cancel}
        </Link>
      </div>
    </form>
  );
}
