import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Estás sin conexión</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        La app sigue disponible con la última versión en caché. Los movimientos se encolan y se
        suben a Supabase cuando vuelva internet.
      </p>
      <Link href="/dashboard" className="text-sm text-primary underline">
        Volver al dashboard
      </Link>
    </div>
  );
}
