import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground">SS CUENTAS</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Entrá</h1>
      <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/login"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-foreground"
        >
          Ingresar
        </Link>
        <Link href="/register" className="py-2 text-sm text-muted-foreground">
          Crear cuenta
        </Link>
      </div>
    </div>
  );
}
