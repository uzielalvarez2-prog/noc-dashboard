import { db } from "../sync/incidents.js";
import { sendAlertEmail } from "./email.js";
import { wasAlertSent, markAlertSent } from "./deduplication.js";
import { logger } from "../logger.js";

export async function evaluateAlerts(): Promise<void> {
  const rules = await db.alertRule.findMany({ where: { isActive: true } });
  if (rules.length === 0) return;

  const now = new Date();

  for (const rule of rules) {
    let incidents: Array<{
      id: string;
      title: string;
      severity: string;
      status: string;
      slaDeadline: Date;
      assignedTo: string | null;
    }> = [];

    switch (rule.trigger) {
      case "CRITICAL_OPEN":
        incidents = await db.incident.findMany({
          where: { severity: "CRITICAL", status: { in: ["OPEN", "IN_PROGRESS"] } },
          select: { id: true, title: true, severity: true, status: true, slaDeadline: true, assignedTo: true },
        });
        break;

      case "CRITICAL_UNASSIGNED":
        incidents = await db.incident.findMany({
          where: { severity: "CRITICAL", assignedTo: null, status: { in: ["OPEN"] } },
          select: { id: true, title: true, severity: true, status: true, slaDeadline: true, assignedTo: true },
        });
        break;

      case "SLA_RISK":
        incidents = await db.incident.findMany({
          where: {
            slaRiskAt: { lte: now },
            slaBreached: false,
            status: { notIn: ["RESOLVED", "CLOSED"] },
          },
          select: { id: true, title: true, severity: true, status: true, slaDeadline: true, assignedTo: true },
        });
        break;

      case "SLA_BREACHED":
        incidents = await db.incident.findMany({
          where: { slaBreached: true, status: { notIn: ["RESOLVED", "CLOSED"] } },
          select: { id: true, title: true, severity: true, status: true, slaDeadline: true, assignedTo: true },
        });
        break;
    }

    for (const incident of incidents) {
      const alreadySent = await wasAlertSent(rule.id, incident.id);
      if (alreadySent) continue;

      if (rule.channels.includes("email") && rule.recipients.length > 0) {
        const sent = await sendAlertEmail({
          to: rule.recipients,
          incidentId: incident.id,
          title: incident.title,
          severity: incident.severity,
          status: incident.status,
          slaDeadline: incident.slaDeadline,
          trigger: rule.trigger,
        });

        if (sent) {
          await markAlertSent(rule.id, incident.id);
          logger.info(`Alerta enviada: regla=${rule.name}, incidente=${incident.id}`);
        }
      }
    }
  }
}
