import { Card } from "@/components/ui/Card";
import { ToothIcon } from "@/components/ui/ToothIcon";
import { LoginForm } from "@/components/auth/LoginForm";
import { getDict } from "@/lib/i18n";
import { DEMO_USERS, DEMO_PASSWORD } from "@/lib/constants";

export default function LoginPage() {
  const t = getDict();
  const mock = process.env.AUTH_MOCK === "true";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* мягкие световые пятна medical-tech фона */}
      <div className="pointer-events-none absolute -top-32 right-1/4 size-96 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/4 size-96 rounded-full bg-accent-deep/15 blur-3xl" />

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-accent to-accent-deep text-bg-base shadow-[0_8px_32px_rgb(34_211_238/0.35)]">
            <ToothIcon className="size-8" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Dental <span className="text-accent">Pro</span>
            </h1>
            <p className="mt-1 text-sm text-text-secondary">{t.app.tagline}</p>
          </div>
        </div>

        <Card className="p-6">
          <h2 className="mb-1 text-lg font-semibold">{t.auth.title}</h2>
          <p className="mb-5 text-sm text-text-secondary">{t.auth.subtitle}</p>
          <LoginForm
            labels={{
              email: t.auth.email,
              password: t.auth.password,
              submit: t.auth.submit,
              submitting: t.auth.submitting,
              error: t.auth.invalidCredentials,
            }}
          />
        </Card>

        {mock && (
          /* ВРЕМЕННО: подсказка demo-входов, пока AUTH_MOCK=true */
          <Card className="mt-4 p-4">
            <p className="mb-2 text-xs font-medium text-warning">{t.auth.demoTitle}</p>
            <ul className="space-y-1 text-xs text-text-secondary">
              {DEMO_USERS.map((u) => (
                <li key={u.email} className="flex justify-between gap-2">
                  <span>{u.email}</span>
                  <span className="text-text-secondary/60">{t.roles[u.role]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-text-secondary/60">
              {t.auth.password}: <span className="font-mono">{DEMO_PASSWORD}</span>
            </p>
          </Card>
        )}

        <p className="mt-6 text-center text-xs text-text-secondary/60">{t.app.by}</p>
      </div>
    </main>
  );
}
