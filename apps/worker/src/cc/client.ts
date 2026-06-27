import { config } from "../config.js";
import { logger } from "../logger.js";
import { generateTotp } from "./totp.js";

/**
 * Incidente tal como lo devuelve la API de Control Center (torre CARE).
 * Campos verificados en vivo (2026-06-26). CARE es infra-céntrico:
 * `company` suele venir null; la llave real es location_code / affected_ci.
 */
export interface CcIncident {
  _id: string;
  number: string;
  brief_description: string;
  group: string;
  location: string | null;
  location_code: string | null;
  network_code: string;
  priority_code: string | null;
  problem_status: string | null;
  open_time: string | null;
  open_time_e: number | null;
  close_time: string | null;
  resolved_time: string | null;
  closure_code: string | null;
  resolution: string | null;
  resolution_code: string | null;
  opened_by: string | null;
  operator: string | null;
  responsable: string | null;
  reference_num: string | null;
  service_type: string | null;
  hostname: string | null;
  depend: string | null;
  affected_service: string | null;
  affected_ci: string | null;
  company: string | null;
  escalation_manager: string | null;
  [key: string]: unknown;
}

/** Entrada de bitácora de incidents/details. */
export interface CcJournalEntry {
  datestamp: string;
  operator: string;
  type: string; // "Status Change" | "Solution" | "Closure" | ...
  description: string;
}

interface CcEnvelope<T> {
  status: string;
  data: T;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

export class CcClient {
  private readonly base: string;
  private readonly timeout: number;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0; // epoch ms

  constructor() {
    this.base = `${config.cc.apiBase}/api`;
    this.timeout = config.poll.timeoutMs;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /** Código TOTP: desde la semilla (full-auto) o el código manual (pruebas). */
  private currentTotp(): string {
    if (config.cc.totpSecret) return generateTotp(config.cc.totpSecret);
    if (config.cc.totpCode) return config.cc.totpCode;
    throw new Error("Falta CC_TOTP_SECRET (full-auto) o CC_TOTP (manual) para el login.");
  }

  private async login(): Promise<void> {
    const { tokenUrl, clientId, user, password } = config.cc;
    if (!user || !password) throw new Error("Faltan CC_USER / CC_PASSWORD.");

    const body = new URLSearchParams({
      grant_type: "password",
      client_id: clientId,
      username: user,
      password,
      scope: "openid",
      totp: this.currentTotp(),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => null)) as (TokenResponse & { error_description?: string }) | null;
      if (!res.ok || !json?.access_token) {
        throw new Error(`Login CC ${res.status}: ${json?.error_description ?? "sin access_token"}`);
      }
      this.accessToken = json.access_token;
      // Renovar 60s antes de expirar.
      this.tokenExpiresAt = Date.now() + (json.expires_in - 60) * 1000;
      logger.info(`Token CC obtenido (válido ~${Math.round(json.expires_in / 60)} min).`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) return this.accessToken;
    await this.login();
    return this.accessToken!;
  }

  // ── HTTP ──────────────────────────────────────────────────────────────────

  private async get<T>(path: string, retryOn401 = true): Promise<T> {
    const token = await this.getToken();
    const url = `${this.base}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          source: config.cc.source,
          apikey: config.cc.apikey,
        },
        signal: controller.signal,
      });

      // Token revocado/expirado antes de tiempo → re-login una vez.
      if (res.status === 401 && retryOn401) {
        this.accessToken = null;
        return this.get<T>(path, false);
      }
      if (!res.ok) {
        throw new Error(`CC API ${res.status} en ${url}: ${await res.text()}`);
      }

      const json = (await res.json()) as CcEnvelope<T>;
      return json.data;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Endpoints (verificados) ────────────────────────────────────────────────

  private get net(): string {
    return config.cc.networkCode;
  }

  /** Feed operativo del día (abiertos + cerrados de hoy). NO es histórico. */
  async getIncidents(): Promise<CcIncident[]> {
    return this.get<CcIncident[]>(`/incidents?network_code=${this.net}`);
  }

  /** Conteo del feed operativo. */
  async getTotalCount(): Promise<number> {
    return this.get<number>(`/incidents/x-total-count?network_code=${this.net}`);
  }

  /** Catálogo de estados posibles. */
  async getStatuses(): Promise<(string | null)[]> {
    return this.get<(string | null)[]>(`/incidents/statuses`);
  }

  /** Catálogo de grupos de la torre. */
  async getGroups(): Promise<string[]> {
    return this.get<string[]>(`/incidents/groups?network_code=${this.net}`);
  }

  /** Incidentes ESTRICTAMENTE abiertos de un grupo. */
  async getOpenByGroup(group: string): Promise<CcIncident[]> {
    return this.get<CcIncident[]>(
      `/incidents/groups/open?network_code=${this.net}&group=${encodeURIComponent(group)}`
    );
  }

  /** Bitácora/journal de un incidente. OJO: usa el `number` (IMCARE...), no el `_id`. */
  async getDetails(incidentNumber: string): Promise<CcJournalEntry[]> {
    return this.get<CcJournalEntry[]>(
      `/incidents/details?network_code=${this.net}&incidentId=${encodeURIComponent(incidentNumber)}`
    );
  }

  /** Todos los abiertos de la torre = unión de groups/open por cada grupo. */
  async getAllOpen(): Promise<CcIncident[]> {
    const groups = await this.getGroups();
    const byNumber = new Map<string, CcIncident>();
    for (const group of groups) {
      try {
        const open = await this.getOpenByGroup(group);
        for (const inc of open) byNumber.set(inc.number, inc);
      } catch (err) {
        logger.error(`Error obteniendo abiertos CARE (grupo=${group})`, { err });
      }
    }
    return [...byNumber.values()];
  }

  /** Health-check: login + un GET barato. */
  async ping(): Promise<boolean> {
    try {
      await this.getTotalCount();
      return true;
    } catch {
      return false;
    }
  }
}
