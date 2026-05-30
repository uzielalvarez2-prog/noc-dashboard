import { config } from "../config.js";
import { logger } from "../logger.js";

interface AlertEmailOptions {
  to: string[];
  incidentId: string;
  title: string;
  severity: string;
  status: string;
  slaDeadline: Date;
  trigger: string;
}

export async function sendAlertEmail(opts: AlertEmailOptions): Promise<boolean> {
  if (!config.resend.apiKey) {
    logger.warn("RESEND_API_KEY no configurado — email omitido");
    return false;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(config.resend.apiKey);

  const deadlineStr = opts.slaDeadline.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const triggerLabel: Record<string, string> = {
    CRITICAL_OPEN: "🔴 Incidente CRÍTICO abierto",
    CRITICAL_UNASSIGNED: "🔴 Incidente CRÍTICO sin asignar",
    SLA_RISK: "⚠️ SLA en riesgo",
    SLA_BREACHED: "🚨 SLA vencido",
  };

  const subject = `[NOC] ${triggerLabel[opts.trigger] ?? opts.trigger}: ${opts.incidentId}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0d1526;color:#e2e8f0;border-radius:8px;overflow:hidden;">
      <div style="background:#1e3048;padding:16px 24px;border-bottom:2px solid ${opts.severity === "CRITICAL" ? "#ef4444" : "#f59e0b"};">
        <h2 style="margin:0;color:${opts.severity === "CRITICAL" ? "#ef4444" : "#f59e0b"};">
          ${triggerLabel[opts.trigger] ?? opts.trigger}
        </h2>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#64748b;width:140px;">Incidente</td>
              <td style="font-family:monospace;color:#e2e8f0;font-weight:bold;">${opts.incidentId}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Título</td>
              <td style="color:#e2e8f0;">${opts.title}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Severidad</td>
              <td style="color:${opts.severity === "CRITICAL" ? "#ef4444" : "#f59e0b"};font-weight:bold;">${opts.severity}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Estado</td>
              <td style="color:#e2e8f0;">${opts.status}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">SLA Deadline</td>
              <td style="color:#f59e0b;font-family:monospace;">${deadlineStr}</td></tr>
        </table>
        <div style="margin-top:24px;">
          <a href="${config.hpsm.baseUrl}/sm/index.do"
             style="background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;">
            Ver en HPSM
          </a>
        </div>
      </div>
      <div style="background:#060d1a;padding:12px 24px;font-size:12px;color:#334155;">
        NOC Dashboard — Alerta automática. No responder a este correo.
      </div>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: config.resend.fromEmail,
      to: opts.to,
      subject,
      html,
    });

    if (error) {
      logger.error("Error enviando email de alerta", { error });
      return false;
    }

    logger.info(`Email de alerta enviado: ${subject} → ${opts.to.join(", ")}`);
    return true;
  } catch (err) {
    logger.error("Excepción enviando email", { err });
    return false;
  }
}
