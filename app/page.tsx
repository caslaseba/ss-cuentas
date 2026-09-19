import Link from "next/link";
import { Mic, CreditCard, WifiOff, Smartphone } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-6">
        <span className="text-lg font-semibold">SS Cuentas</span>
        <div className="flex gap-2">
          <Link href="/login" className="rounded-xl px-4 py-2 text-sm hover:bg-muted">
            Ingresar
          </Link>
          <Link href="/register" className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">
            Empezar
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8">
        <p className="text-sm font-medium text-primary">Tu plata, en dos pantallas</p>
        <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Dictá “cobré 2 millones” y listo. Cada gasto se descuenta solo.
        </h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Comida, cigarrillos, servicios y Visa del mes. Funciona en el celular, también sin señal, y se
          actualiza cuando volvés a tener internet.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/register" className="rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground">
            Crear cuenta
          </Link>
          <Link href="/login" className="rounded-xl border border-border px-5 py-3 text-sm">
            Ya tengo cuenta
          </Link>
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Mic, title: "Voz o a mano", body: "Ingreso o milanesa por 15 mil." },
            { icon: CreditCard, title: "Visa del mes", body: "Lo de tarjeta se suma al resumen." },
            { icon: Smartphone, title: "En el celu", body: "Cargar, resumen y Más." },
            { icon: WifiOff, title: "Offline", body: "Cargás igual; sincroniza al reconectar." },
          ].map((item) => (
            <li key={item.title} className="rounded-2xl border border-border bg-card p-4">
              <item.icon className="mb-3 h-5 w-5 text-primary" />
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
