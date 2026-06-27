# ADR-001: Adoptar la API de Control Center como fuente de incidentes de CARE

**Status:** Accepted (decisiones clave tomadas 2026-06-26; pendiente validar shape de abierto e implementar)
**Date:** 2026-06-26
**Deciders:** Uziel Álvarez (NOC)

---

## Context

Hoy el NOC Dashboard se alimenta de **HPSM** mediante un scraper Playwright (`apps/hpsm-scraper`)
que descarga CSVs de abiertos/cerrados y los sube al dashboard. Ese flujo:

- Depende de la **PC admin** (tareas programadas S4U) y de una sesión de navegador frágil
  (parpadeo/robo de foco, timeouts de descarga en cerrados).
- Entrega fechas como texto `DD/MM/YYYY HH:mm:ss` que hay que parsear.
- No tiene timeline/bitácora por ticket.

**Control Center (CNOC)** es la herramienta que dispara esos incidentes y expone una **API REST**
(Keycloak + TOTP). La pregunta es si migramos la torre **CARE** (la única que importa para este
dashboard) de scraper → API, y si esa migración rompe el modelo de Clientes TOP / War Room.

### Hallazgos verificados en vivo (2026-06-26)

- **Auth:** Keycloak `password` grant + **TOTP obligatorio** en cada login. Token dura **8h**.
  Full-auto exigiría guardar la semilla TOTP (riesgo MFA).
- **El endpoint `incidents` NO es histórico.** Filtrando por los 10 estados y por un rango de
  fechas amplio (feb→jul 2026) siempre devuelve la **misma foto del día** (abiertos + cerrados de hoy).
  Es un feed operativo en tiempo casi-real, no un almacén.
- **No hay catálogo de clientes** en la API. No se puede "contar clientes de CARE" desde el feed.
- **CARE viene llaveado por infraestructura, no por cliente:** `company` llega **null**;
  lo que se llena es `location_code` (ej. `CARE_BOLIVAR`), `hostname`, `affected_ci`,
  `affected_service`. Encaja con monitoreo **proactivo** (`opened_by: TOOLS NETCOOL`,
  grupo `CARE-PROACTIVIDAD`).
- **Grupos de CARE (catálogo real):** `CARE-PROACTIVIDAD`, `CARE_CIUDAD DE MEXICO`,
  `CARE_NUEVO LEON`, `N/A`.
- **Endpoint de bitácora nuevo:** `incidents/details?incidentId=<NUMBER>` devuelve el journal
  `[{datestamp, operator, type, description}]` (type: `Status Change`, `Solution`, `Closure`).
  Capacidad que el CSV no tiene.

### Impacto en Clientes TOP / War Room

`syncWarRoom` (`apps/web/src/lib/war-room.ts`) cruza cada abierto contra Clientes TOP por
**`company` O `serviceRef`** únicamente. Cruzado con CARE:

| Llave del match | Campo CC API | ¿Sirve en CARE? |
|---|---|---|
| `company` | `company` | ❌ null en CARE — mitad muerta |
| `serviceId` | `affected_service` (`CICARE…`) | ✅ si se puebla `serviceRef` con esos códigos |

→ La **tabla y el motor se reusan sin cambios de schema**, pero para CARE el match colapsa a
`serviceRef` y el contenido actual (centrado en empresa, para PEXA/CECOR) **no engancha CARE**
hasta sembrar filas con `serviceRef` = `affected_service` de CARE.

---

## Decision

Adoptar la API de Control Center como fuente de **CARE** bajo el patrón
**API como fuente fresca → Postgres como memoria**: un worker hace *snapshots* periódicos del feed
(`incidents` + `groups/open`) y los persiste en el mismo modelo `OpenIncident`/`ClosedIncident`,
exactamente como hoy hace el scraper, reusando el motor War Room.

**CARE CONVIVE con PEXA/CECOR (no reemplaza).** El scraper HPSM sigue alimentando PEXA/CECOR
(CECOR puede ser carga manual); CARE se **agrega** como fuente adicional. Por tanto **no se pierde
ningún dato actual**: las filas PEXA/CECOR conservan `company`/`state`/`district`; las filas CARE
llenan su subset.

La torre CARE se modela **infra-céntrica**: el match de Clientes TOP para CARE se hace por
`serviceRef` (= `affected_service`), no por `company`.

**Decisiones cerradas (2026-06-26):**
- TOTP: **full-auto** (Option C) — asumiendo el riesgo de guardar la semilla cifrada en el worker.
- Alcance: **conviven** PEXA/CECOR (scraper) + CARE (API).

### Punto de diseño que introduce la convivencia

Como CARE (infra) y PEXA/CECOR (geo/cliente) viven en la misma tabla, las columnas
`Estado`/`Distrito`/`Empresa` tienen **semántica distinta por fuente**. Solución mínima:
- Distinguir el origen de cada fila por **prefijo de `group`** (`CARE*`) o agregando un campo
  `source`/`networkCode` a `OpenIncident` (más explícito).
- Render por fuente: para filas CARE, las columnas `Estado`/`Distrito` muestran `Sitio`/`Host`
  (`location`/`hostname`) y `Empresa` queda vacía o con `location`. Sin tocar las filas PEXA/CECOR.
- Alternativa de UX: un **filtro/tab por torre** para no mezclar semánticas en pantalla.

---

## Options Considered

### Option A: Reemplazar el scraper de CARE por la API (complementar, no tirar HPSM)

| Dimensión | Evaluación |
|---|---|
| Complejidad | Media — cliente HTTP + worker de snapshot + mapeo de campos |
| Costo | Bajo (sin infra nueva; reusa Neon y el worker) |
| Escalabilidad | Alta — feed liviano, sin navegador |
| Familiaridad equipo | Media — Keycloak/TOTP nuevo; resto ya conocido |
| Riesgo | TOTP cada 8h; dependencia de disponibilidad de la API CC |

**Pros:** elimina Playwright para CARE, fechas en epoch, bitácora disponible, sin PC admin.
**Cons:** re-login TOTP cada 8h (no full-auto sin guardar semilla); `company` null obliga a
re-modelar el match de CARE.

### Option B: Mantener solo el scraper HPSM

| Dimensión | Evaluación |
|---|---|
| Complejidad | Baja (status quo) |
| Costo | Bajo monetario, alto operativo (frágil) |
| Escalabilidad | Baja — atado a la PC admin y al navegador |
| Familiaridad equipo | Alta |
| Riesgo | Parpadeo/timeouts ya conocidos |

**Pros:** cero cambios. **Cons:** arrastra toda la fragilidad actual; sin timeline.

### Option C: API full-auto (guardar semilla TOTP) — ✅ ELEGIDA (2026-06-26)

Igual que A pero sin intervención humana cada 8h. El worker genera el código TOTP a partir de la
**semilla** y renueva el token solo.
**Pros:** desatendido. **Cons / requisitos:**
- Requiere obtener la **semilla TOTP** (re-enrolar el autenticador en Keycloak y capturar el secreto base32).
- Guardar la semilla **equivale a anular el MFA** de la cuenta `ualvarez`: hay que cifrarla y tratarla
  como secreto del worker (Railway), nunca en `.env` plano ni en git.
- Generación del código con lib TOTP (ej. `otplib`) usando la semilla.

**Decisión:** se asume el riesgo a cambio de operación desatendida. Mitigación: semilla solo en secreto
cifrado del worker; idealmente cuenta de servicio dedicada en vez de la cuenta personal.

**Mecanismo concreto (acordado 2026-06-26):**
1. Re-enrolar TOTP en Keycloak y copiar la **clave de configuración base32** (la semilla), NO el código de 6 dígitos.
2. Guardarla como secreto en Railway: `CC_TOTP_SECRET` (cifrado; nunca en git ni `.env` versionado).
3. El worker genera el código con `otplib`: `authenticator.generate(CC_TOTP_SECRET)` → lo pasa como `totp` en el login.
4. Token de 8h se renueva solo (re-login programado o al recibir 401).
**Importante:** la semilla NO debe pegarse en chat ni en el repo; el usuario la coloca directo en Railway.

**Alternativa preferible si hay acceso admin:** cuenta de servicio Keycloak con grant `client_credentials`
(elimina el TOTP por completo). Requiere que un admin de CNOC cree un client confidencial con service
accounts. Documentado como mejora futura; no bloquea la implementación con semilla.

### NOTA sobre dependencia de máquina

Ingesta de CARE corre como **worker en la nube (Railway)** → **no requiere PC encendida** (a diferencia
del scraper HPSM con tareas S4U en la PC admin). PEXA/CECOR, al seguir por scraper, mantienen esa
dependencia; CARE queda independiente.

---

## Trade-off Analysis

El eje principal es **fragilidad operativa (HPSM)** vs **costo de re-modelar CARE + fricción TOTP (API)**.
La API gana en robustez y en datos nuevos (epoch, bitácora), pero impone dos trabajos:
(1) re-modelar el match de Clientes TOP para CARE (de `company` a `serviceRef`), y
(2) resolver el re-login TOTP cada 8h (semi-auto recomendado).

El `company: null` de CARE no es un bug a esperar que se arregle: CARE es proactivo/infra-céntrico
por diseño. Por eso la decisión incluye **modelar CARE por infraestructura**, no forzar el modelo
cliente-céntrico de PEXA/CECOR.

---

## Consequences

**Más fácil:**
- Ingesta de CARE sin navegador ni PC admin (adiós parpadeo/timeouts).
- Cálculo de SLA y tiempos con epoch (`open_time_e`), sin parsear texto.
- Timeline por ticket (`details`) → MTTR por fases, auditoría.

**Más difícil / a revisar:**
- Clientes TOP para CARE debe sembrarse por `serviceRef` (= `affected_service`); el contenido
  actual no aplica.
- Operación: alguien pega el TOTP cada ~8h (semi-auto).
- (Opcional) extender `syncWarRoom` para cruzar por `affected_ci`/`location_code`/`hostname`
  si se quiere match por sitio/host.

---

## Action Items

1. [x] **Decidir TOTP:** → full-auto (Option C).
2. [x] **Decidir alcance:** → conviven PEXA/CECOR + CARE.
3. [x] **Obtener semilla TOTP** → obtenida; en `apps/worker/.env` local (gitignored). **Pendiente deploy:** ponerla como secreto `CC_TOTP_SECRET` en Railway.
4. [x] **Full-auto validado en vivo** (2026-06-26): login automático con semilla → token 8h, sin intervención.
5. [x] Mapeo CC API → `OpenIncident`/`ClosedIncident` (`cc/normalizer.ts`): `affected_service`→serviceId, location→Sitio, SLA 4h, MTTR open→resolved.
6. [x] Cliente reusable `apps/worker/src/cc/client.ts` (`CcClient`) + ingestor `sync/care.ts`, cableado en `index.ts` (intervalo propio, guard `isCareConfigured`).
7. [x] Aislamiento DB: rama de Neon `care-dashboard` (clon de prod). Ingesta corrida ahí: 1 cerrado escrito, 0 abiertos (no había). Convivencia por prefijo `IMCARE` (no toca PEXA/CECOR).
8. [ ] **Confirmar shape de un abierto real** de CARE (watcher `cc-watch-open.ts`) — validar campos vacíos vs cerrado.
9. [ ] UI: distinguir torre (prefijo `IMCARE` o campo `source`) y render `Estado`/`Distrito` → `Sitio`/`Host` para filas CARE.
10. [ ] Preview de Vercel apuntando a la rama de Neon para comparar dashboards lado a lado.
11. [ ] Sembrar Clientes TOP de CARE con `serviceRef`=`affected_service` y conectar War Room (hoy diferido en el ingestor).
12. [ ] Deploy worker: `CC_TOTP_SECRET` en Railway + decidir si corre en su propio servicio o el existente.
13. [ ] (Opcional) Extender `syncWarRoom` con match por infraestructura (`affected_ci`/`location_code`/`hostname`).

---

## Notas / referencias

- API mapeada: ver memoria `noc-controlcenter-api`.
- Herramientas: `apps/hpsm-scraper/src/cc-explore.ts`, `cc-watch-open.ts` (gitignored: `.cc-token.json`).
- Modelo afectado: `apps/web/prisma/schema.prisma` (`ClienteTop`, `WarRoomIncident`).
- Motor de match: `apps/web/src/lib/war-room.ts`.
