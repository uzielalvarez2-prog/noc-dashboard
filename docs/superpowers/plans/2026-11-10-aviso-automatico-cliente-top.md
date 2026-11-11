# Aviso Automático Cliente TOP — con grupo por cliente · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el aviso automático de estatus Cliente TOP (cron 09:00/20:00) funcione con 68+ clientes, enviando a cada cliente marcado su reporte a su propio grupo de WhatsApp.

**Architecture:** Cada `ClienteTop` guarda opcionalmente un grupo destino (`notificarChatId`). El cron ya no manda un solo `clienteTopId`: el dashboard reúne a **todos** los clientes con grupo asignado, junta los IMs de todos en **una sola** consulta al scraper (que sigue siendo un passthrough genérico), y al terminar el callback arma y envía **un mensaje por cliente a su grupo**. El botón manual sigue operando sobre el cliente seleccionado. El builder de mensaje por-cliente (`buildClienteTopMessage`) NO cambia: lo nuevo es la capa de orquestación multi-cliente.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Prisma 7 (Neon, `prisma db push`), scraper Node (apps/hpsm-scraper), WhatsApp vía listener. Vitest se introduce mínimamente en apps/web para el único helper puro nuevo.

**Spec:** Diseño aprobado en conversación (2026-11-10). Resumen: campo `notificarChatId`/`notificarChatName` por cliente; UI ADMIN con `GroupPicker` por cliente; cron reúne marcados; una pasada a HPSM; un mensaje por cliente a su grupo; se conserva la red de seguridad de >30 IMs/cliente y el botón manual por cliente.

## Global Constraints

- TypeScript strict, cero `any` — usar `unknown` + narrowing (regla no negociable del repo).
- Un componente por archivo, máximo 300 líneas.
- Nunca consultar HPSM desde el frontend: el scraper hace la consulta, el dashboard solo dispara y envía.
- Nunca hardcodear credenciales ni chatIds: el grupo vive en DB (`notificarChatId`), no en env.
- Schema se aplica con `cd apps/web && pnpm prisma db push` (el repo NO usa migraciones; además se deja constancia en `apps/web/prisma/sql/`).
- Verificación primaria de cada tarea: `pnpm lint` (ESLint + TypeScript check del repo). No existe runner de tests salvo el que agrega la Task 5 para el helper puro.
- Tope de IMs por consulta al scraper: `MAX_IMS = 50` (de `@/lib/imEstatus`). Red de seguridad por cliente: `> 30` IMs ⇒ se excluye ese cliente (no aborta a los demás en modo multi-cliente).
- `MAX_IMS` es el tope de la UNIÓN de todos los clientes marcados; si se excede, se recorta la lista.

## Review Focus

- **Un cliente marcado con >30 IMs en modo cron:** debe excluirse ese cliente y seguir con los demás (en manual sí aborta, como hoy). — cubierto en Task 5 (`construirTargets`) y Task 2-run.
- **La unión de IMs de varios clientes supera `MAX_IMS=50`:** se recorta a 50 sin romper; los clientes cuyos IMs quedaron fuera reciben "Estatus: sin datos (no se consultó)" por IM (comportamiento ya existente de `lineaEstatus`). — cubierto por test de `unirIms` en Task 5.
- **Un IM pertenece a dos clientes marcados (match solapado):** el IM se consulta una vez (dedup en la unión) pero aparece en el mensaje de cada cliente que lo matchea. — cubierto por test de `unirIms` (dedup) en Task 5.
- **Cliente marcado sin IMs abiertos y `enviarSiVacio=true`:** recibe su mensaje "0 en gestión" a su grupo, sin pasar por el scraper. — cubierto en Task 6 (route) + Task 5 (run).
- **`notificarChatId` apunta a un grupo que el listener ya no conoce:** el envío falla solo para ese cliente; los demás se envían igual y el error se registra. — cubierto en Task 5 (`enviarMensajesClienteTop` acumula resultados por cliente).

---

### Task 1: Campo `notificarChatId` / `notificarChatName` en `ClienteTop`

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (model `ClienteTop`)
- Create: `apps/web/prisma/sql/2026-11-aviso-cliente-top.sql` (constancia del cambio, estilo de los otros archivos de ese dir)

**Interfaces:**
- Produces: columnas `notificarChatId String?` y `notificarChatName String?` en `ClienteTop`; tipo Prisma regenerado con esos campos nullable.

- [ ] **Step 1:** En `schema.prisma`, dentro de `model ClienteTop`, añadir tras `note String?`:

```prisma
  notificarChatId   String? // Grupo WhatsApp destino del aviso automático; null = sin aviso
  notificarChatName String? // Nombre del grupo (para mostrar en la UI sin resolverlo)
```

- [ ] **Step 2:** Crear `apps/web/prisma/sql/2026-11-aviso-cliente-top.sql` con el `ALTER TABLE` equivalente:

```sql
ALTER TABLE "ClienteTop" ADD COLUMN IF NOT EXISTS "notificarChatId" TEXT;
ALTER TABLE "ClienteTop" ADD COLUMN IF NOT EXISTS "notificarChatName" TEXT;
```

- [ ] **Step 3:** Aplicar a Neon y regenerar tipos. Run: `cd apps/web && pnpm prisma db push && pnpm prisma generate`
  Expected: "Your database is now in sync with your Prisma schema" y "Generated Prisma Client".

- [ ] **Step 4:** Verificar que el tipo quedó. Run: `cd apps/web && pnpm lint`
  Expected: PASS (sin errores de tipo nuevos).

- [ ] **Step 5:** Commit.

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/sql/2026-11-aviso-cliente-top.sql
git commit -m "feat(cliente-top): campo grupo destino de aviso automatico (notificarChatId)"
```

---

### Task 2: Persistir y exponer el grupo (PUT + stats)

**Files:**
- Modify: `apps/web/src/app/api/clientes-top/[id]/route.ts` (handler `PUT`)
- Modify: `apps/web/src/app/api/clientes-top/stats/route.ts` (objeto `stats`)
- Modify: `apps/web/src/components/open/cliente-top/clienteTopUtils.ts` (`interface ClienteTopStat`)

**Interfaces:**
- Consumes: campos de Task 1.
- Produces:
  - `PUT /api/clientes-top/[id]` acepta en el body opcional `notificarChatId?: string | null` y `notificarChatName?: string | null` y los persiste (cadena vacía ⇒ `null`).
  - `/api/clientes-top/stats` devuelve `notificarChatId: string | null` y `notificarChatName: string | null` por cliente.
  - `ClienteTopStat` gana `notificarChatId: string | null` y `notificarChatName: string | null`.

- [ ] **Step 1:** En `PUT` de `[id]/route.ts`, ampliar el tipo del body con `notificarChatId?: string | null; notificarChatName?: string | null;` y, en `data` de `db.clienteTop.update`, añadir (solo si la clave viene presente en el body, para no pisar el grupo en un rename que no lo manda):

```ts
...(("notificarChatId" in body) ? { notificarChatId: (body.notificarChatId ?? "").toString().trim() || null } : {}),
...(("notificarChatName" in body) ? { notificarChatName: (body.notificarChatName ?? "").toString().trim() || null } : {}),
```

  Nota: la validación actual "al menos siglas/company/serviceRef" se conserva; la mutación de grupo (Task 3) manda esos tres igual que el rename.

- [ ] **Step 2:** En `stats/route.ts`, en el objeto que arma `stats.map`, añadir `notificarChatId: c.notificarChatId, notificarChatName: c.notificarChatName,`.

- [ ] **Step 3:** En `clienteTopUtils.ts`, añadir a `interface ClienteTopStat`: `notificarChatId: string | null;` y `notificarChatName: string | null;`.

- [ ] **Step 4:** Verificar. Run: `pnpm lint`
  Expected: PASS.

- [ ] **Step 5:** Commit.

```bash
git add apps/web/src/app/api/clientes-top/[id]/route.ts apps/web/src/app/api/clientes-top/stats/route.ts apps/web/src/components/open/cliente-top/clienteTopUtils.ts
git commit -m "feat(cliente-top): persistir y exponer grupo de aviso por cliente"
```

---

### Task 3: UI ADMIN — selector de grupo por cliente

**Files:**
- Create: `apps/web/src/components/open/cliente-top/AvisoAutomaticoControl.tsx`
- Modify: `apps/web/src/components/open/cliente-top/ClienteTopDetail.tsx` (insertar el control en la ficha)

**Interfaces:**
- Consumes: `ClienteTopStat` (Task 2) con `notificarChatId`/`notificarChatName`; `GroupPicker` + `WhatsappGroup` de `@/components/monitoring/GroupPicker`; `/api/whatsapp/groups`; `/api/auth/me` (rol); `PUT /api/clientes-top/[id]`.
- Produces: componente `AvisoAutomaticoControl({ cliente }: { cliente: ClienteTopStat })` que, para ADMIN, muestra el grupo actual y permite cambiarlo/quitarlo; invalida `["clientes-top-stats"]` al guardar. Para no-ADMIN: `null`.

- [ ] **Step 1:** Crear `AvisoAutomaticoControl.tsx` (`"use client"`). Patrón de carga de rol y grupos idéntico a `EnviarEstatusButton` (`fetch("/api/auth/me")` → `isAdmin`; `fetch("/api/whatsapp/groups")` → `groups`). Muestra:
  - Si `cliente.notificarChatId`: línea "Aviso automático → *{notificarChatName ?? notificarChatId}*" con botón "Cambiar" y "Quitar".
  - Si no: botón "Activar aviso automático" que abre el `GroupPicker`.
  - Al elegir un grupo (chatId único, `value.slice(-1)`), llamar `guardar(chatId, chatName)`; "Quitar" llama `guardar(null, null)`.
  - `guardar` hace `PUT /api/clientes-top/${cliente.id}` con `company/siglasIm/serviceRef` del `cliente` (como el rename) + `notificarChatId`/`notificarChatName`, y al éxito `qc.invalidateQueries({ queryKey: ["clientes-top-stats"] })`.
  - El `chatName` sale del grupo elegido en `groups` (por `chatId`).
  - Usa tokens del design system (`text-text-muted`, `border-border`, `bg-surface`, `text-accent`). Mantener el archivo < 300 líneas.

- [ ] **Step 2:** En `ClienteTopDetail.tsx`, importar y renderizar `<AvisoAutomaticoControl cliente={cliente} />` en un lugar visible de la ficha (junto a los controles de la cabecera / debajo del nombre). No cambiar la firma de props del detalle.

- [ ] **Step 3:** Verificar. Run: `pnpm lint`
  Expected: PASS. (Verificación visual real en Task 7.)

- [ ] **Step 4:** Commit.

```bash
git add apps/web/src/components/open/cliente-top/AvisoAutomaticoControl.tsx apps/web/src/components/open/cliente-top/ClienteTopDetail.tsx
git commit -m "feat(cliente-top): UI ADMIN para asignar grupo de aviso por cliente"
```

---

### Task 4: Scraper — passthrough de `grupos` en la consulta

**Files:**
- Modify: `apps/hpsm-scraper/src/server.ts` (tipo `TareaClienteTop`, endpoint `POST /cliente-top-estatus`, función `correrClienteTop`)

**Interfaces:**
- Consumes: nada nuevo del dashboard aún (contrato se define aquí).
- Produces: el scraper acepta en el body de `/cliente-top-estatus` un campo opcional `grupos: unknown[]` y lo **reenvía intacto** en el callback a `/api/cliente-top/enviar` (además de `resultados`). El scraper NO interpreta `grupos`: es passthrough. Se mantiene `ims` como unión de IMs a consultar.

- [ ] **Step 1:** En `TareaClienteTop`, añadir `grupos: unknown[];` (passthrough). Mantener `chatId/prefijo/etiqueta/items/enviarSiVacio` por compatibilidad con el camino actual, pero el nuevo callback usará `grupos`.

- [ ] **Step 2:** En el handler `POST /cliente-top-estatus`, al construir `tarea`, añadir `grupos: Array.isArray(b.grupos) ? b.grupos : []` (declarar `grupos?: unknown` en el cast de `b`).

- [ ] **Step 3:** En `correrClienteTop`, en el `body` del `fetch` al callback `/api/cliente-top/enviar`, añadir `grupos: tarea.grupos` junto a `resultados`.

- [ ] **Step 4:** Verificar compilación del scraper. Run: `cd apps/hpsm-scraper && pnpm lint` (o `pnpm build` si no hay lint)
  Expected: PASS.

- [ ] **Step 5:** Commit.

```bash
git add apps/hpsm-scraper/src/server.ts
git commit -m "feat(cliente-top): el scraper reenvia 'grupos' passthrough en el callback"
```

---

### Task 5: Orquestación multi-cliente en el dashboard (`cliente-top-run.ts`)

**Files:**
- Modify: `apps/web/src/lib/cliente-top-run.ts`
- Create: `apps/web/src/lib/cliente-top-run.test.ts`
- Create: `apps/web/vitest.config.ts`
- Modify: `apps/web/package.json` (devDep `vitest`, script `"test": "vitest run"`)

**Interfaces:**
- Consumes: `obtenerItems`/`matcheaCliente` (existentes), `MAX_IMS`, `ClienteTopItem`, `buildClienteTopMessage`, `sendWhatsappViaListener`, scraper `grupos` passthrough (Task 4), campos de Task 1.
- Produces:
  - Tipo `GrupoEnvio = { chatId: string; etiqueta: string; prefijo: string; items: ClienteTopItem[] }`.
  - `unirIms(grupos: GrupoEnvio[]): string[]` — pura: junta todos los `incidentId`, `trim().toUpperCase()`, dedup, recorta a `MAX_IMS`.
  - `dispararEstatusClienteTop(opts)` refactor: `opts = { clienteTopId?: string; chatId?: string; enviarSiVacio: boolean }`. Si `clienteTopId` ⇒ modo manual (1 target con `chatId` dado; aborta si >30 IMs). Si no ⇒ modo cron (todos los `ClienteTop` con `notificarChatId` no vacío; cada uno su `chatId`; cliente con >30 IMs se **excluye**, no aborta). Devuelve `DispararResult` con `targets: number` e `ims: number`.
  - `enviarMensajesClienteTop(grupos: GrupoEnvio[], resultados: ImEstatusResult[]): Promise<{ ok: boolean; enviados: number; fallidos: number }>` — por cada grupo arma el mensaje con `buildClienteTopMessage` y lo envía a `grupo.chatId`; acumula ok/fallos (un fallo no detiene a los demás).

- [ ] **Step 1 (test primero):** Crear `apps/web/vitest.config.ts` mínimo (entorno node, alias `@` → `./src`) y en `package.json` añadir `"test": "vitest run"` y `vitest` en devDependencies. Luego crear `cliente-top-run.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { unirIms, type GrupoEnvio } from "./cliente-top-run";

const g = (ids: string[]): GrupoEnvio => ({ chatId: "x@g.us", etiqueta: "C", prefijo: "C", items: ids.map((id) => ({ incidentId: id, ref: "", siteName: "", status: "" })) });

describe("unirIms", () => {
  it("dedup y normaliza a mayúsculas", () => {
    expect(unirIms([g(["imlatb1", "imlatb1"]), g(["imlatb2"])])).toEqual(["IMLATB1", "IMLATB2"]);
  });
  it("recorta a MAX_IMS (50)", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `IM${i}`);
    expect(unirIms([g(ids)])).toHaveLength(50);
  });
});
```

- [ ] **Step 2:** Run: `cd apps/web && pnpm test`
  Expected: FAIL ("unirIms is not a function" / import error).

- [ ] **Step 3:** Implementar en `cliente-top-run.ts`: el tipo `GrupoEnvio`, `unirIms`, el refactor de `dispararEstatusClienteTop` a multi-target, y `enviarMensajesClienteTop`. Detalle del refactor:
  - **Construir `targets: GrupoEnvio[]`.** Manual (`clienteTopId` presente): `resolverCliente(clienteTopId)` + `obtenerItems` → 1 target con el `chatId` dado; si ese cliente tiene >30 IMs ⇒ devolver error (abortar, como hoy). Cron (sin `clienteTopId`): `db.clienteTop.findMany({ where: { NOT: { notificarChatId: null } } })`, filtrar además `notificarChatId.trim() !== ""`; por cada uno `obtenerItems` con SU `notificarChatId` como `chatId`; un cliente con >30 IMs se **excluye** (log) y sigue con los demás. `etiqueta`/`prefijo` de cada target = `company` del cliente (misma regla que hoy).
  - **Unión y envío.** `ims = unirIms(targets)`. Si `ims.length === 0`: si `enviarSiVacio` ⇒ `await enviarMensajesClienteTop(targets, [])` (manda directo cada "0 en gestión", sin scraper) y devolver ok; si no ⇒ no enviar nada. Si `ims.length > 0`: `POST ${SCRAPER_URL}/cliente-top-estatus` con body `{ ims, grupos: targets, enviarSiVacio }` (ya no se mandan `chatId/prefijo/etiqueta/items` sueltos) y devolver `{ ok, iniciado: true, targets: targets.length, ims: ims.length }`. Conservar el check `SCRAPER_URL`/`INTERNAL_API_KEY` y el `AbortSignal.timeout`.
  - **`enviarMensajesClienteTop`.** Reemplaza a `enviarMensajeClienteTop` (singular) y sus 2 usos. Quitar el import no usado `isResolvedStatus` de este archivo.

- [ ] **Step 4:** Run: `cd apps/web && pnpm test`
  Expected: PASS (2 tests).

- [ ] **Step 5:** Run: `pnpm lint`
  Expected: PASS.

- [ ] **Step 6:** Commit.

```bash
git add apps/web/src/lib/cliente-top-run.ts apps/web/src/lib/cliente-top-run.test.ts apps/web/vitest.config.ts apps/web/package.json
git commit -m "feat(cliente-top): orquestacion multi-cliente (un job HPSM, mensaje por grupo)"
```

---

### Task 6: Rutas del dashboard (`estatus-whatsapp` + `enviar`)

**Files:**
- Modify: `apps/web/src/app/api/cliente-top/estatus-whatsapp/route.ts`
- Modify: `apps/web/src/app/api/cliente-top/enviar/route.ts`

**Interfaces:**
- Consumes: `dispararEstatusClienteTop(opts)` y `enviarMensajesClienteTop` de Task 5; scraper `grupos` de Task 4.
- Produces:
  - `POST /api/cliente-top/estatus-whatsapp`: body `{ clienteTopId?, chatId?, enviarSiVacio? }`. `chatId` ya **no** es obligatorio global; el modo cron (sin `clienteTopId`) usa los grupos de cada cliente. El modo manual (con `clienteTopId`) exige `chatId`.
  - `POST /api/cliente-top/enviar`: parsea `grupos` (array de `GrupoEnvio`) + `resultados` y llama `enviarMensajesClienteTop`.

- [ ] **Step 1:** En `estatus-whatsapp/route.ts`, quitar la obligatoriedad de `chatId`/`CLIENTE_TOP_CHAT_ID` a nivel global. Pasar a `dispararEstatusClienteTop` `{ clienteTopId, chatId: body.chatId, enviarSiVacio }`. Validar: si viene `clienteTopId` pero no `chatId` ⇒ 400 "Falta grupo destino para el envío manual". Conservar la autorización (internal key o ADMIN) tal cual.

- [ ] **Step 2:** En `enviar/route.ts`, reemplazar el parseo `items`/`prefijo`/`etiqueta`/`chatId` sueltos por un parseo de `grupos: GrupoEnvio[]` (validar que cada grupo tenga `chatId` string y `items` array; `parseResultados` se conserva). Llamar `enviarMensajesClienteTop(grupos, resultados)` y responder `{ ok, enviados, fallidos }`.

- [ ] **Step 3:** Verificar. Run: `pnpm lint`
  Expected: PASS.

- [ ] **Step 4:** Commit.

```bash
git add apps/web/src/app/api/cliente-top/estatus-whatsapp/route.ts apps/web/src/app/api/cliente-top/enviar/route.ts
git commit -m "feat(cliente-top): rutas disparar/enviar en modo multi-cliente por grupo"
```

---

### Task 7: Conectar el botón manual al grupo guardado + verificación end-to-end

**Files:**
- Modify: `apps/web/src/components/open/cliente-top/EnviarEstatusButton.tsx` (default del grupo = grupo guardado del cliente)
- Modify: `apps/web/src/components/open/ClienteTopView.tsx:164` (pasar el grupo guardado del cliente activo al botón)

**Interfaces:**
- Consumes: `ClienteTopStat.notificarChatId`/`notificarChatName` (Task 2).
- Produces: el botón ✈ pre-selecciona el `notificarChatId` del cliente activo (editable para una prueba puntual). Sin romper el flujo si el cliente no tiene grupo.

- [ ] **Step 1:** Añadir props opcionales `defaultChatId?: string | null` a `EnviarEstatusButton`; inicializar `chatId` con `defaultChatId ? [defaultChatId] : []` al abrir el panel.

- [ ] **Step 2:** En `ClienteTopView.tsx`, pasar `defaultChatId={active?.notificarChatId}` al `<EnviarEstatusButton .../>`.

- [ ] **Step 3:** Verificar build/lint. Run: `pnpm lint && pnpm build`
  Expected: PASS.

- [ ] **Step 4 (verificación real, manual):** Levantar la app (`pnpm web:dev`), entrar como ADMIN a Cliente TOP – PEXA, asignar a **SMART FIT** su grupo (ej. Supervisión PEXA) con el control de Task 3, y usar ✈ "Enviar estatus" para confirmar que llega el mensaje al grupo correcto. Confirmar que un cliente sin grupo no aparece en el envío automático.

- [ ] **Step 5:** Commit.

```bash
git add apps/web/src/components/open/cliente-top/EnviarEstatusButton.tsx apps/web/src/components/open/ClienteTopView.tsx
git commit -m "feat(cliente-top): el boton manual preselecciona el grupo guardado del cliente"
```

---

## Notas de cierre

- **Scheduler sin cambios:** `apps/hpsm-scraper/src/scheduler.ts` ya dispara `POST /api/cliente-top/estatus-whatsapp` con `{ enviarSiVacio: true }` y **sin** `clienteTopId` — que es justo lo que activa el modo cron multi-cliente. No se toca.
- **Compatibilidad del passthrough:** mientras el scraper desplegado no tenga Task 4, el callback no traería `grupos`; por eso Task 6 debe desplegarse junto con el scraper de Task 4. Orden de despliegue: scraper (Task 4) + web (Tasks 5–6) en la misma tanda.
- **Deploy del schema:** Task 1 toca Neon directo (`db push`), así que aplica a prod en cuanto corre; el código que lo usa (Tasks 2–7) debe ir después.
