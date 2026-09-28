import { logout } from "@/app/actions/auth";
import { Nav } from "@/components/Nav";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
      <aside className="border-b border-line bg-surface px-4 py-3 md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0 md:py-6">
        <div className="mb-3 flex items-center justify-between md:mb-6 md:block">
          <div className="text-lg font-semibold">Nakit Akış</div>
          <div className="truncate text-xs text-muted md:mt-1">{user.email}</div>
        </div>
        <Nav />
        <form action={logout} className="mt-3 md:mt-6">
          <button className="text-sm text-muted hover:text-fg">Çıkış yap</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
