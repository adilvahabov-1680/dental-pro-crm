import { requireAuth } from "@/lib/auth";
import { buildNav } from "@/components/layout/nav";
import { Sidebar, MobileNav } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { ToastProvider } from "@/components/ui/Toaster";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth(); // второй слой защиты после middleware
  const items = buildNav(user); // пункты фильтруются по permissions на сервере

  return (
    <ToastProvider>
      <div className="min-h-screen">
        <Sidebar items={items} />
        <div className="lg:pl-64">
          <Topbar user={user} />
          <MobileNav items={items} />
          <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
