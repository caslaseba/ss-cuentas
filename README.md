# SS Cuentas — PWA de finanzas personales

Next.js (App Router) + Supabase + Tailwind + Web Speech API.

## 1. Requisitos

- Node.js 20+
- Cuenta en [Supabase](https://supabase.com)
- Chrome o Edge para el dictado (Web Speech API)

## 2. Instalar

En la PC, el archivo `SS Cuentas.bat` baja o actualiza [caslaseba/ss-cuentas](https://github.com/caslaseba/ss-cuentas), instala dependencias y trae las claves desde Vercel. La carpeta para abrir en Cursor queda en el Escritorio: `ss-cuentas`.

A mano:

```bash
gh repo clone caslaseba/ss-cuentas
cd ss-cuentas
npm install
npx vercel link --project ss-cuentas --scope gallo-system --yes
npx vercel env pull .env.local --yes --scope gallo-system
```

Copiá las variables:

```bash
cp .env.example .env.local
```

Completá en `.env.local`:

| Variable | Dónde obtenerla |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Proyecto → Settings → API → **Project URL** (`https://xxxx.supabase.co`, sin `/rest/v1`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → `service_role` (secret, nunca en el cliente) |
| `ADMIN_EMAILS` | Emails que pueden abrir el gestor de usuarios, separados por coma |

## 3. Base de datos y RLS

1. En el dashboard de Supabase, abrí **SQL Editor**.
2. Pegá y ejecutá `supabase/migrations/001_init.sql`.
3. Después ejecutá `supabase/migrations/002_user_roles.sql` (roles admin/usuario).
4. Eso crea tablas, FKs, trigger de perfil, categorías semilla, cuentas iniciales y políticas RLS.

En **Authentication → Providers** dejá habilitado Email. Para desarrollo local podés desactivar “Confirm email”.

## 4. Correr en local

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000) e ingresá. En el celu, misma Wi‑Fi, usá la URL **Network** que muestra `npm run dev` (Chrome). El micrófono en el teléfono pide HTTPS; en localhost de la PC funciona.

## 5. Cómo se usa (Hoy y Más)

Solo hay dos pantallas:

- **Hoy**: cuánto te queda, micrófono, carga a mano (Cobré / Gasté / Con tarjeta), gastos por categoría, resumen de Visa y servicios a pagar.
- **Más**: alta de tarjeta (cierre/vencimiento), servicios fijos, ajustes. El gestor de usuarios está en Ajustes si tu email está en `ADMIN_EMAILS`.

Lógica de plata:

1. “Cobré 2 millones de pesos” → entra como sueldo.
2. “Compré 2 kgs de milanesa por 15 mil” → **Comida**, se descuenta del efectivo.
3. “Compré cigarrillos por 3000” → categoría Cigarrillos, otro descuento.
4. “Compré asado por 20 mil con la Visa” → **no toca el efectivo**; se suma al resumen hasta el día de cierre.
5. Los servicios se cargan en Más y en Hoy se marcan **Pagué** (también descuentan).

Si no hay Visa, al dictar “con la Visa” se crea sola. `NEXT_PUBLIC_SUPABASE_URL` es solo `https://xxxx.supabase.co` (sin `/rest/v1`).

Offline: se guarda en el celu/PC y se sube al reconectar.

## 6. PWA y offline

- El manifest está en `app/manifest.ts`.
- El service worker `public/sw.js` cachea el app shell.
- Si no hay red, `lib/offline/sync.ts` guarda transacciones en IndexedDB y las sube al reconectar.

En desktop, Chrome → Instalar app. En móvil, “Agregar a pantalla de inicio”. HTTPS (o localhost) es obligatorio para el SW y el micrófono.

## 7. Voz

El micrófono vive en `components/entry/voice-entry.tsx`. El parseo está en `lib/parsers/voice-parser.ts`. Tocá **Listo, guardar** en el modal.

Ejemplos:

- *Cobré 2 millones de pesos*
- *Compré 2 kgs de milanesa por 15 mil pesos*
- *Compré cigarrillos por 3000 pesos*
- *Compré 2 kgs de asado por 20 mil pesos con la Visa*

## 8. Contraseñas y usuarios

Las contraseñas **no se pueden ver**: Supabase las guarda hasheadas. Para recuperar acceso:

- En la app: **Olvidé mi contraseña** en `/login`, o **Ajustes → Cambiar mi contraseña**.
- En Supabase: **Authentication → Users** → el usuario → *Send password recovery*.

En **Authentication → URL Configuration** agregá `http://localhost:3000/recuperar` (y la URL de producción) en Redirect URLs.

El gestor de usuarios vive en `/usuarios` (solo admins). Permite listar cuentas, crear, asignar una clave nueva y eliminar. Configurá `ADMIN_EMAILS` y `SUPABASE_SERVICE_ROLE_KEY`.

## Estructura

```
ss-cuentas/
  app/                    # rutas App Router
    dashboard/            # Hoy
    mas/                  # tarjetas, fijos, ajustes
    usuarios/             # gestor (admin)
    configuracion/
    login/ register/ recuperar/
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
  supabase/migrations/002_user_roles.sql
  public/sw.js
```
