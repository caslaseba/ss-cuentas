import { Suspense } from "react";
import { AuthFrame } from "@/components/auth/auth-frame";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error.slice(0, 240) : "";

  return (
    <AuthFrame title="Ingresar">
      {error ? <p className="mb-4 text-sm font-medium text-destructive">{error}</p> : null}
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  );
}
