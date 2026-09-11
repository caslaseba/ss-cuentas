# SS Cuentas — PWA de finanzas personales

Next.js (App Router) + Supabase + Tailwind + Web Speech API.

## 1. Requisitos

- Node.js 20+
- Cuenta en [Supabase](https://supabase.com)
- Chrome o Edge para el dictado (Web Speech API)

## 2. Instalar

```bash
cd ss-cuentas
npm install
```

Copiá las variables:

```bash
cp .env.example .env.local
```

Completá en `.env.local`:

| Variable | Dónde obtenerla |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Proyecto → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → `anon` `public` |

## 3. Base de datos y RLS

1. En el dashboard de Supabase, abrí **SQL Editor**.
2. Pegá y ejecutá `supabase/migrations/001_init.sql`.
3. Eso crea tablas, FKs, trigger de perfil, categorías semilla, cuentas iniciales y políticas RLS.

En **Authentication → Providers** dejá habilitado Email. Para desarrollo local podés desactivar “Confirm email”.

## 4. Correr en local

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000), registrate y cargá una tarjeta en **Tarjetas** para poder dictar compras con crédito.

## 5. PWA y offline

- El manifest está en `app/manifest.ts`.
- El service worker `public/sw.js` cachea el app shell.
- Si no hay red, `lib/offline/sync.ts` guarda transacciones en IndexedDB y las sube al reconectar.

En desktop, Chrome → Instalar app. En móvil, “Agregar a pantalla de inicio”. HTTPS (o localhost) es obligatorio para el SW y el micrófono.

## 6. Voz

El micrófono vive en `components/entry/voice-entry.tsx`. El parseo está en `lib/parsers/voice-parser.ts`.

Ejemplos:

- *Compré carne, gasté 20 mil pesos*
- *Compré en 6 cuotas de 15 mil en la tarjeta*
- *Gasté 50 dólares con la tarjeta extensión*

Revisá siempre el modal de confirmación antes de guardar.

## Estructura

```
ss-cuentas/
  app/                    # rutas App Router
    dashboard/
    transacciones/        # carga manual + voz
    historial/            # filtros + CSV
    tarjetas/
    cuentas/
    presupuestos/
    fijos/
    configuracion/
    login/ register/
  components/
    entry/voice-entry.tsx
    ui/                   # botones, cards, dialog (estilo Shadcn)
    layout/app-shell.tsx
  lib/
    parsers/voice-parser.ts
    finance/settlement.ts # cierre de tarjeta, cuotas, USD
    supabase/
    offline/sync.ts
  supabase/migrations/001_init.sql
  public/sw.js
```
