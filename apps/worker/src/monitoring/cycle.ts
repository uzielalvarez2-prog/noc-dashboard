import { db } from "../sync/incidents.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import { checkIp } from "./ping.js";
import { buildAlertMessage } from "./format.js";
import { sendWhatsappViaListener } from "./whatsapp.js";

type ActiveMonitor = Awaited<ReturnType<typeof loadActiveMonitors>>[number];

function loadActiveMonitors() {
  return db.ipMonitor.findMany({ where: { active: true }, include: { monitoredIp: true } });
}

/** Mismo criterio que isResolvedStatus() en web/src/lib/war-room.ts. */
function isResolvedStatus(status: string): boolean {
  return /resolv|resuelt/i.test(status);
}

/**
 * Reclamo ATÓMICO de la alerta antes de enviar nada. Entregar a los chatIds puede
 * tardar más que el intervalo del ciclo (cada POST al listener espera hasta 20s),
 * así que el siguiente ciclo entraba mientras este seguía enviando, releía
 * alertedAt=null y mandaba el mismo mensaje otra vez: el 2026-08-04 salieron 4
 * copias por incidente. El `where alertedAt: null` hace que solo un ciclo se
 * lleve la fila; los demás ven count=0 y siguen de largo.
 */
async function claimAlert(monitorId: string, now: Date): Promise<boolean> {
  const claimed = await db.ipMonitor.updateMany({
    where: { id: monitorId, alertedAt: null },
    data: { alertedAt: now },
  });
  return claimed.count > 0;
}

/** Entrega la alerta ya reclamada; libera el reclamo si no salió ningún envío. */
async function sendAlert(monitor: ActiveMonitor): Promise<void> {
  const { monitoredIp } = monitor;
  const text = buildAlertMessage({
    siglasIm: monitoredIp.siglasIm,
    incidentId: monitor.incidentId,
    serviceRef: monitoredIp.serviceRef,
    company: monitor.company || monitoredIp.company,
  });

  // Sin destinos configurados no hay nada que entregar: se da por atendida
  // para no repetir el intento cada ciclo.
  let delivered = !monitoredIp.notifyEnabled || monitoredIp.notifyChatIds.length === 0;

  for (const chatId of monitoredIp.notifyChatIds) {
    if (!monitoredIp.notifyEnabled) break;
    const sent = await sendWhatsappViaListener(chatId, text);
    if (sent.ok) {
      delivered = true;
    } else {
      logger.error("[ip-monitor] Falló envío de alerta WhatsApp", { chatId, error: sent.error });
    }
  }

  // Si NINGÚN envío salió se libera el reclamo, para que el siguiente ciclo
  // reintente en vez de perder la alerta (listener caído o reiniciando). Con
  // al menos una entrega buena se conserva marcada: repetir a los demás
  // grupos molestaría más de lo que ayuda.
  if (!delivered) {
    await db.ipMonitor.update({ where: { id: monitor.id }, data: { alertedAt: null } });
    logger.warn("[ip-monitor] Alerta no entregada; se reintentará en el próximo ciclo", {
      ip: monitoredIp.ip,
    });
  }
}

/**
 * Ciclo de monitoreo de IP — independiente del sync de HPSM y de isPaused().
 * Debe seguir funcionando de noche (requisito de negocio). Si no hay ningún
 * IpMonitor activo, retorna de inmediato sin ninguna query (no despierta Neon
 * de noche si nadie activó monitoreo).
 */
export async function runIpMonitoringCycle(): Promise<void> {
  const active = await loadActiveMonitors();
  if (active.length === 0) return;

  const now = new Date();

  // 1) Cerrar los que ya no están en OpenIncident (incidente resuelto).
  const incidentIds = [...new Set(active.map((m) => m.incidentId))];
  const openRows = await db.openIncident.findMany({
    where: { incidentId: { in: incidentIds } },
    select: { incidentId: true, status: true },
  });

  const stillOpen = new Set(openRows.map((r) => r.incidentId));
  // Un incidente puede tener varias filas (una por sitio); basta que alguna
  // esté en RESOLV para darlo por recuperado.
  const resolved = new Set(
    openRows.filter((r) => isResolvedStatus(r.status)).map((r) => r.incidentId),
  );

  const toClose = active.filter((m) => !stillOpen.has(m.incidentId));
  if (toClose.length > 0) {
    await db.ipMonitor.updateMany({
      where: { id: { in: toClose.map((m) => m.id) } },
      data: { active: false, deactivatedAt: now, deactivatedReason: "incident_closed" },
    });
    logger.info(`[ip-monitor] ${toClose.length} monitoreo(s) desactivado(s) (incidente cerrado)`);
  }

  const stillActive = active.filter((m) => stillOpen.has(m.incidentId));

  for (const monitor of stillActive) {
    try {
      if (monitor.monitoredIp.kind === "VPN") {
        await checkVpnMonitor(monitor, resolved, now);
      } else {
        await checkPingMonitor(monitor, now);
      }
    } catch (err) {
      logger.error("[ip-monitor] Error chequeando IP", { ip: monitor.monitoredIp.ip, err });
    }
  }
}

/**
 * IP de VPN: no es alcanzable desde internet, así que no se pinguea. La señal de
 * "servicio arriba" es que el incidente pasó a RESOLV en HPSM. Si el incidente
 * desaparece de OpenIncident sin que hayamos visto ese status, no se avisa nada
 * — solo se desactiva el monitor (decisión de negocio: no inventar el UP).
 */
async function checkVpnMonitor(
  monitor: ActiveMonitor,
  resolved: Set<string>,
  now: Date,
): Promise<void> {
  if (monitor.alertedAt !== null || !resolved.has(monitor.incidentId)) return;
  if (!(await claimAlert(monitor.id, now))) return;

  logger.info("[ip-monitor] Incidente en RESOLV (VPN) — alertando", {
    ip: monitor.monitoredIp.ip,
    company: monitor.company,
    incidentId: monitor.incidentId,
  });

  await db.ipMonitor.update({
    where: { id: monitor.id },
    data: { lastCheckedAt: now, lastUp: true, upSince: now },
  });

  await sendAlert(monitor);
}

/** IP alcanzable: alerta cuando el ping responde sostenido `sustainedUpMs`. */
async function checkPingMonitor(monitor: ActiveMonitor, now: Date): Promise<void> {
  const result = await checkIp(monitor.monitoredIp.ip);

  const upSince = result.up ? (monitor.upSince ?? now) : null;
  const sustainedMs = upSince ? now.getTime() - upSince.getTime() : 0;
  const shouldAlert =
    upSince !== null &&
    sustainedMs >= config.monitoring.sustainedUpMs &&
    monitor.alertedAt === null;

  // Evita updates innecesarios si nada relevante cambió (mitiga despertar Neon de noche).
  const statusChanged = monitor.lastUp !== result.up;
  const upSinceChanged = (monitor.upSince?.getTime() ?? null) !== (upSince?.getTime() ?? null);
  if (!statusChanged && !upSinceChanged && !shouldAlert) return;

  await db.ipMonitor.update({
    where: { id: monitor.id },
    data: {
      lastCheckedAt: now,
      lastUp: result.up,
      upSince,
      lastLatencyMs: result.latencyMs,
      lastMethod: result.method,
    },
  });

  if (!shouldAlert) return;
  if (!(await claimAlert(monitor.id, now))) return;

  logger.info(`[ip-monitor] Racha sostenida de ${sustainedMs}ms — alertando`, {
    ip: monitor.monitoredIp.ip,
    company: monitor.company,
  });

  await sendAlert(monitor);
}
