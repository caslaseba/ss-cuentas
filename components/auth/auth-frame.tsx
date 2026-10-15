import type { ReactNode } from "react";

export function AuthFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground">SS CUENTAS</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
