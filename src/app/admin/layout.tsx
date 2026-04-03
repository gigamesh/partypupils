import { verifyAdminSession } from "@/lib/admin-auth";
import { AdminLoginForm } from "./AdminLoginForm";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuthenticated = await verifyAdminSession();

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-sm px-4 py-20">
        <h1 className="text-2xl font-bold mb-6 text-center">Admin Login</h1>
        <AdminLoginForm />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <nav className="flex items-center gap-4 border-b border-border pb-4 mb-6">
        <Link href="/admin" className="font-semibold text-sm hover:underline">
          Products
        </Link>
        <Link
          href="/admin/orders"
          className="text-sm text-muted-foreground hover:underline"
        >
          Orders
        </Link>
      </nav>
      {children}
    </div>
  );
}
