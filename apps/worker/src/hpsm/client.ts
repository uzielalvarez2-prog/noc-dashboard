import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * Campos que devuelve HPSM REST API por incidente.
 * Basado en el export CSV con columnas:
 * Incident ID, Open Time, Status, Company, Service Uniqueid,
 * Site Name State, Assignee, Site Name District, Assignment Group, Res Analyst Code
 */
export interface HpsmIncident {
  IncidentId: string;
  OpenTime: string;
  Status: string;
  Company: string;
  ServiceId?: string;
  SiteNameState?: string;
  Assignee?: string;
  SiteNameDistrict?: string;
  AssignmentGroup: string;
  ResAnalystCode?: string;
  // SLA fields
  SlaVoDate?: string;
  BrSlaStatus?: string;
  Priority?: string;
  Title?: string;
  Description?: string;
  // Raw para guardar en rawData
  [key: string]: unknown;
}

interface HpsmListResponse {
  "@totalcount": number;
  content: Array<{ Incident: HpsmIncident }>;
  next?: { href: string };
}

export class HpsmClient {
  private readonly base: string;
  private readonly authHeader: string;
  private readonly timeout: number;

  constructor() {
    const { baseUrl, user, password, apiPath } = config.hpsm;
    this.base = `${baseUrl}${apiPath}`;
    this.authHeader =
      "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
    this.timeout = config.poll.timeoutMs;
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.base}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HPSM API ${res.status} en ${url}: ${await res.text()}`);
      }

      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Obtiene incidentes abiertos filtrados por Assignment Group.
   * HPSM REST API usa query en formato: AssignmentGroup="PEXA"
   */
  async getIncidentsByGroup(group: string): Promise<HpsmIncident[]> {
    const query = encodeURIComponent(`AssignmentGroup="${group}"`);
    const fields = [
      "IncidentId", "OpenTime", "Status", "Company",
      "ServiceId", "SiteNameState", "Assignee", "SiteNameDistrict",
      "AssignmentGroup", "ResAnalystCode", "SlaVoDate", "BrSlaStatus",
      "Priority", "Title", "Description",
    ].join(",");

    const results: HpsmIncident[] = [];
    let start = 1;
    const count = config.hpsm.pageSize;
    let hasMore = true;

    while (hasMore) {
      const path = `/incidents?query=${query}&fields=${fields}&start=${start}&count=${count}&view=expand`;
      try {
        const page = await this.get<HpsmListResponse>(path);
        const items = page.content ?? [];
        results.push(...items.map((c) => c.Incident));

        const total = page["@totalcount"] ?? items.length;
        if (start + count > total || items.length < count) {
          hasMore = false;
        } else {
          start += count;
        }
      } catch (err) {
        logger.error(`Error obteniendo incidentes HPSM (grupo=${group}, start=${start})`, { err });
        hasMore = false;
      }
    }

    return results;
  }

  /** Verifica conectividad con HPSM (útil para health-check) */
  async ping(): Promise<boolean> {
    try {
      await this.get("/incidents?count=1");
      return true;
    } catch {
      return false;
    }
  }
}
