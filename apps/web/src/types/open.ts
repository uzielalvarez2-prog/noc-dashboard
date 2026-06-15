// Formas de datos que devuelven los endpoints de abiertos (lado cliente).

export interface OpenIncidentRow {
  id: string;
  incidentId: string;
  openTime: string;
  status: string;
  company: string;
  serviceId: string;
  state: string;
  district: string;
  assignee: string | null;
  group: string;
  uploadedAt: string;
  /** Nº de sitios que abarca el incidente (1 si es de un solo sitio). */
  siteCount: number;
}

export interface OpenListResponse {
  data: OpenIncidentRow[];
  meta: {
    total: number;
    totalSites: number;
    uniqueIncidents: number;
    page: number;
    limit: number;
    lastSync: string | null;
  };
}

export interface TopRow {
  name: string;
  sites: number;
  incidents: number;
}

export interface OpenStats {
  totalSites: number;
  totalIncidents: number;
  byGroup: { group: string; incidents: number }[];
  topByState: TopRow[];
  topByDistrict: TopRow[];
  /** Total de incidentes contado por la columna estado / distrito (todas las entradas). */
  stateTotal: number;
  districtTotal: number;
}
