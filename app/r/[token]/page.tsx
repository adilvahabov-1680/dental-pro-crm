import { CalendarClock, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ToothIcon } from "@/components/ui/ToothIcon";
import { PatientResponseForm } from "@/components/patient-response/PatientResponseForm";
import { RescheduleOptionsSelectionForm } from "@/components/patient-response/RescheduleOptionsSelectionForm";
import { FeedbackForm } from "@/components/patient-response/FeedbackForm";
import { getPublicResponseLinkState } from "@/lib/patient-response";
import { getDict } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";

/**
 * Public route — без сессии, без middleware-редиректа (см. middleware.ts).
 * Доступ только по уникальному token; никаких internal id, медицинских/
 * финансовых данных не показывается.
 */
export default async function PatientResponsePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = getDict().patientResponse;
  const tr = getDict().rescheduleOptions.public;
  const tf = getDict().patientFeedback.public;
  const state = await getPublicResponseLinkState(token);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -top-32 right-1/4 size-96 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/4 size-96 rounded-full bg-accent-deep/15 blur-3xl" />

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-accent to-accent-deep text-bg-base shadow-[0_8px_32px_rgb(34_211_238/0.35)]">
            <ToothIcon className="size-8" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {state.kind === "active" && state.purpose === "reschedule_offer"
              ? tr.title
              : state.kind === "active" && state.purpose === "feedback"
                ? tf.title
                : t.title}
          </h1>
        </div>

        <Card className="p-6" data-e2e-marker="patient-response-card">
          {state.kind === "active" && (
            <>
              <p className="mb-1 text-sm text-text-secondary">
                {t.greeting} {state.patientName}
              </p>
              {(state.startsAt || state.doctorName || state.serviceName) && (
                <div className="my-4 space-y-2 rounded-[10px] bg-bg-base/50 px-4 py-3">
                  {state.startsAt && (
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarClock className="size-4 text-accent" />
                      <span className="text-text-secondary">{t.appointmentTime}:</span>
                      <span className="font-medium text-text-primary">
                        {formatDate(state.startsAt)}{" "}
                        {new Date(state.startsAt).toLocaleTimeString("az-AZ", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                  {state.doctorName && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-text-secondary">{t.doctor}:</span>
                      <span className="font-medium text-text-primary">{state.doctorName}</span>
                    </div>
                  )}
                  {state.purpose === "feedback" && state.serviceName && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-text-secondary">{tf.serviceLabel}:</span>
                      <span className="font-medium text-text-primary">{state.serviceName}</span>
                    </div>
                  )}
                </div>
              )}
              <p className="mb-3 text-xs text-text-secondary">{state.clinicName}</p>

              {state.purpose === "reschedule_offer" ? (
                <RescheduleOptionsSelectionForm
                  token={state.token}
                  options={state.options ?? []}
                  labels={{
                    chooseOption: tr.chooseOption,
                    note: tr.note,
                    select: tr.select,
                    submitting: tr.submitting,
                    thankYou: tr.thankYou,
                    errors: t.errors,
                  }}
                />
              ) : state.purpose === "feedback" ? (
                <FeedbackForm
                  token={state.token}
                  labels={{
                    ratingLabel: tf.ratingLabel,
                    commentLabel: tf.commentLabel,
                    commentPlaceholder: tf.commentPlaceholder,
                    submit: tf.submit,
                    submitting: tf.submitting,
                    thankYou: tf.thankYou,
                    errors: tf.errors,
                  }}
                />
              ) : (
                <PatientResponseForm
                  token={state.token}
                  labels={{
                    chooseAnswer: t.chooseAnswer,
                    options: t.options,
                    lateWarning: t.lateWarning,
                    commentLabel: t.commentLabel,
                    commentPlaceholder: t.commentPlaceholder,
                    submitting: t.submitting,
                    thankYou: t.thankYou,
                    errors: t.errors,
                  }}
                />
              )}
            </>
          )}

          {state.kind === "used" && (
            <div
              className="flex flex-col items-center gap-3 py-4 text-center"
              data-e2e-marker="link-used"
            >
              <CheckCircle2 className="size-8 text-success" />
              <p className="text-sm font-medium text-text-primary">
                {state.purpose === "feedback" ? tf.alreadySubmitted : t.linkUsed}
              </p>
            </div>
          )}

          {(state.kind === "expired" || state.kind === "not_found") && (
            <div
              className="flex flex-col items-center gap-3 py-4 text-center"
              data-e2e-marker="link-expired"
            >
              <ShieldAlert className="size-8 text-text-secondary" />
              <p className="text-sm font-medium text-text-primary">{t.linkExpired}</p>
            </div>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-text-secondary/60">{getDict().app.by}</p>
      </div>
    </main>
  );
}
