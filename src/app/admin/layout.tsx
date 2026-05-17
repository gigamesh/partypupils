import { verifyAdminSession } from "@/lib/admin-auth";
import { AdminLoginForm } from "./AdminLoginForm";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuthenticated = await verifyAdminSession();

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-sm px-4 py-20">
        <h1 className="text-center">Admin Login</h1>
        <AdminLoginForm />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <AdminNav />
      {children}
    </div>
  );
}
