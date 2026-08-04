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

      // Reclamo ATÓMICO de la alerta antes de enviar nada. Entregar a los chatIds
      // puede tardar más que el intervalo del ciclo (cada POST al listener espera
      // hasta 20s), así que el siguiente ciclo entraba mientras este seguía
      // enviando, releía alertedAt=null y mandaba el mismo mensaje otra vez: el
      // 2026-08-04 salieron 4 copias por incidente. El `where alertedAt: null`
      // hace que solo un ciclo se lleve la fila; los demás ven count=0 y siguen.
      const claimed = await db.ipMonitor.updateMany({
        where: { id: monitor.id, alertedAt: null },
        data: { alertedAt: now },
      });
      if (claimed.count === 0) continue; // otro ciclo ya está entregando esta alerta

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
    } catch (err) {
      logger.error("[ip-monitor] Error chequeando IP", { ip: monitor.monitoredIp.ip, err });
    }
  }
}
