type DiagnosticReport = {
  target: string;
  dns?: {
    resolved?: boolean;
    ips?: string[];
    error?: string;
  };
  tcp?: {
    reachable?: boolean;
    latencyMs?: number;
  };
  tls?: {
    ok?: boolean;
    error?: string;
  };
  http?: {
    status?: number;
    bodySnippet?: string;
  };
  service?: {
    name?: string;
    active?: boolean;
    listening?: string;
    logs?: string[];
  };
  firewall?: {
    localOpen?: boolean;
    cloudOpen?: boolean;
  };
  resources?: {
    diskFull?: boolean;
    inodeFull?: boolean;
    oom?: boolean;
    loadRatio?: number;
  };
};

function hostFromTarget(target: string): string {
  const withoutScheme = target.replace(/^https?:\/\//, "");
  return withoutScheme.split("/")[0].split(":")[0];
}

function portFromTarget(target: string): string {
  const withoutScheme = target.replace(/^https?:\/\//, "");
  const hostPort = withoutScheme.split("/")[0];
  const match = hostPort.match(/:(\d+)$/);
  if (match) {
    return match[1];
  }
  return target.startsWith("http://") ? "80" : "443";
}

function makeDiagnosis(
  layer: string,
  diagnosis: string,
  confidence: number,
  nextCommands: string[],
  risk: string
): string {
  return JSON.stringify({
    incidentLayer: layer,
    diagnosis,
    confidence,
    nextCommands,
    risk
  });
}

export function diagnoseNetworkIncident(reportJson: string): string {
  const report = JSON.parse(reportJson) as DiagnosticReport;
  const target = report.target ?? "";
  const host = hostFromTarget(target);
  const port = portFromTarget(target);

  // TODO: implement the layered decision tree.
  // Priority should be:
  // DNS -> service listening address / firewall / network -> TLS -> HTTP/application -> resources -> healthy.
  return makeDiagnosis(
    "unknown",
    `No diagnosis implemented for ${host}:${port}.`,
    0,
    [],
    "unknown"
  );
}