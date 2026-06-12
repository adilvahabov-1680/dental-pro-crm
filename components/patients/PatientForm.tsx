"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import type { PatientFormState } from "@/lib/validation/patients";
import type { Dict } from "@/i18n/az";

interface DoctorOption {
  id: string;
  name: string;
}

interface InitialValues {
  id?: string;
  firstName?: string;
  lastName?: string;
  fatherName?: string | null;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null; // yyyy-mm-dd
  gender?: string | null;
  address?: string | null;
  notes?: string | null;
  allergies?: string | null;
  chronicDiseases?: string | null;
  anamnesis?: string | null;
  source?: string | null;
  primaryDoctorId?: string | null;
  status?: string;
  isChild?: boolean;
  guardianFullName?: string | null;
  guardianPhone?: string | null;
}

export function PatientForm({
  action,
  dict,
  doctors,
  initial = {},
}: {
  action: (
    prev: PatientFormState | undefined,
    formData: FormData,
  ) => Promise<PatientFormState>;
  dict: Dict["patients"];
  doctors: DoctorOption[];
  initial?: InitialValues;
}) {
  const [state, formAction, pending] = useActionState<PatientFormState | undefined, FormData>(
    action,
    undefined,
  );
  const [isChild, setIsChild] = useState(initial.isChild ?? false);
  const f = dict.form;
  const err = (key: string) =>
    state?.fieldErrors?.[key]
      ? dict.errors[state.fieldErrors[key] as keyof typeof dict.errors] ?? dict.errors.generic
      : undefined;

  const sectionCls = "rounded-2xl border border-border-subtle bg-bg-surface/80 p-5";
  const sectionTitleCls = "mb-4 text-sm font-semibold text-accent";

  return (
    <form action={formAction} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      {/* Əsas məlumat */}
      <div className={sectionCls}>
        <h2 className={sectionTitleCls}>{f.sectionMain}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input id="lastName" name="lastName" label={f.lastName} required defaultValue={initial.lastName ?? ""} error={err("lastName")} />
          <Input id="firstName" name="firstName" label={f.firstName} required defaultValue={initial.firstName ?? ""} error={err("firstName")} />
          <Input id="fatherName" name="fatherName" label={f.fatherName} defaultValue={initial.fatherName ?? ""} />
          <Input id="phone" name="phone" label={f.phone} placeholder="+994 50 000 00 00" defaultValue={initial.phone ?? ""} error={err("phone")} />
          <Input id="email" name="email" type="email" label={f.email} defaultValue={initial.email ?? ""} error={err("email")} />
          <Input id="birthDate" name="birthDate" type="date" label={f.birthDate} defaultValue={initial.birthDate ?? ""} error={err("birthDate")} />
          <Select id="gender" name="gender" label={f.gender} defaultValue={initial.gender ?? ""}>
            <option value="">{f.genderNone}</option>
            <option value="male">{dict.filters.male}</option>
            <option value="female">{dict.filters.female}</option>
          </Select>
          <div className="sm:col-span-2">
            <Input id="address" name="address" label={f.address} defaultValue={initial.address ?? ""} />
          </div>
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-text-primary">
          <input
            type="checkbox"
            name="isChild"
            checked={isChild}
            onChange={(e) => setIsChild(e.target.checked)}
            className="size-4 cursor-pointer accent-[#22d3ee]"
          />
          {f.isChild}
          <span className="text-xs text-text-secondary">— {f.isChildHint}</span>
        </label>
      </div>

      {/* Himayəçi — только для детского пациента */}
      {isChild && (
        <div className={`${sectionCls} border-info/30`}>
          <h2 className={sectionTitleCls}>{f.sectionGuardian}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="guardianFullName"
              name="guardianFullName"
              label={f.guardianFullName}
              defaultValue={initial.guardianFullName ?? ""}
              error={err("guardianFullName")}
            />
            <Input
              id="guardianPhone"
              name="guardianPhone"
              label={f.guardianPhone}
              placeholder="+994 50 000 00 00"
              defaultValue={initial.guardianPhone ?? ""}
            />
          </div>
          <p className="mt-3 text-xs text-text-secondary">{f.guardianHint}</p>
        </div>
      )}

      {/* Tibbi məlumat */}
      <div className={sectionCls}>
        <h2 className={sectionTitleCls}>{f.sectionMedical}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Textarea id="allergies" name="allergies" label={f.allergies} placeholder={f.allergiesHint} defaultValue={initial.allergies ?? ""} />
          <Textarea id="chronicDiseases" name="chronicDiseases" label={f.chronicDiseases} defaultValue={initial.chronicDiseases ?? ""} />
          <div className="sm:col-span-2">
            <Textarea id="anamnesis" name="anamnesis" label={f.anamnesis} defaultValue={initial.anamnesis ?? ""} />
          </div>
        </div>
      </div>

      {/* Klinika */}
      <div className={sectionCls}>
        <h2 className={sectionTitleCls}>{f.sectionCrm}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select id="primaryDoctorId" name="primaryDoctorId" label={f.doctor} defaultValue={initial.primaryDoctorId ?? ""}>
            <option value="">{f.doctorNone}</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Input id="source" name="source" label={f.source} defaultValue={initial.source ?? ""} />
          <Select id="status" name="status" label={f.status} defaultValue={initial.status ?? "active"}>
            <option value="active">{dict.filters.active}</option>
            <option value="archived">{dict.filters.archived}</option>
          </Select>
          <div className="sm:col-span-2 lg:col-span-3">
            <Textarea id="notes" name="notes" label={f.notes} defaultValue={initial.notes ?? ""} />
          </div>
        </div>
      </div>

      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {dict.errors.generic}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? f.saving : f.save}
        </Button>
        <Link
          href={initial.id ? `/patients/${initial.id}` : "/patients"}
          className="text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          {f.cancel}
        </Link>
      </div>
    </form>
  );
}
