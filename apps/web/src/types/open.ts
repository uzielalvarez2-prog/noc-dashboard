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
}

export interface OpenListResponse {
  data: OpenIncidentRow[];
  meta: {
    total: number;
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
}
