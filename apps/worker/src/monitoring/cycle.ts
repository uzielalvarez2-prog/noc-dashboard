import { db } from "../sync/incidents.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import { checkIp } from "./ping.js";
import { buildAlertMessage } from "./format.js";
import { sendWhatsappViaListener } from "./whatsapp.js";

/**
 * Ciclo de monitoreo de IP — independiente del sync de HPSM y de isPaused().
 * Debe seguir funcionando de noche (requisito de negocio). Si no hay ningún
 * IpMonitor activo, retorna de inmediato sin ninguna query (no despierta Neon
 * de noche si nadie activó monitoreo).
 */
export async function runIpMonitoringCycle(): Promise<void> {
  const active = await db.ipMonitor.findMany({
    where: { active: true },
    include: { monitoredIp: true },
  });
  if (active.length === 0) return;

  const now = new Date();

  // 1) Cerrar los que ya no están en OpenIncident (incidente resuelto).
  const incidentIds = [...new Set(active.map((m) => m.incidentId))];
  const stillOpen = new Set(
    (
      await db.openIncident.findMany({
        where: { incidentId: { in: incidentIds } },
        select: { incidentId: true },
      })
    ).map((r) => r.incidentId),
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

  // 2) Ping a los que siguen activos.
  for (const monitor of stillActive) {
    try {
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
      if (!statusChanged && !upSinceChanged && !shouldAlert) {
        continue;
      }

      // OJO: `alertedAt` NO se marca aquí. Es la condición que apaga shouldAlert,
      // así que marcarlo antes de enviar hace que un envío fallido (listener caído,
      // reiniciando, o mal configurado) se trague la alerta para siempre. Se marca
      // abajo, solo cuando ya no queda nada por entregar.
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

      if (!shouldAlert) continue;

      logger.info(`[ip-monitor] Racha sostenida de ${sustainedMs}ms — alertando`, {
        ip: monitor.monitoredIp.ip,
        company: monitor.company,
      });

      const { monitoredIp } = monitor;
      const text = buildAlertMessage({
        siglasIm: monitoredIp.siglasIm,
        incidentId: monitor.incidentId,
        serviceRef: monitoredIp.serviceRef,
        company: monitor.company || monitoredIp.company,
        latencyMs: result.latencyMs,
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

      // Si ningún envío salió, se deja `alertedAt` en null a propósito: el
      // siguiente ciclo (30s) reintenta en vez de perder la alerta.
      if (delivered) {
        await db.ipMonitor.update({ where: { id: monitor.id }, data: { alertedAt: now } });
      }
    } catch (err) {
      logger.error("[ip-monitor] Error chequeando IP", { ip: monitor.monitoredIp.ip, err });
    }
  }
}
