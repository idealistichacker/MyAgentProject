```ts
type StatusClasses = {
  "1xx": number;
  "2xx": number;
  "3xx": number;
  "4xx": number;
  "5xx": number;
};

type SlowestRequest = {
  ip: string;
  path: string;
  status: number;
  responseMs: number;
};

export type LogSummary = {
  totalLines: number;
  parsedLines: number;
  invalidLines: number;
  statusCodes: Record<string, number>;
  statusClasses: StatusClasses;
  errorCount: number;
  warningCount: number;
  topIP: string | null;
  topPath: string | null;
  averageResponseMs: number | null;
  p95ResponseMs: number | null;
  slowestRequests: SlowestRequest[];
};

const ACCESS_LOG_RE = /^(\S+)\s+\S+\s+\S+\s+\[[^\]]+\]\s+"([A-Z]+)\s+(\S+)\s+HTTP\/\d(?:\.\d)?"\s+(\d{3})\s+(\S+)\s+"[^"]*"\s+"[^"]*"\s+(\d+(?:\.\d+)?)$/;

export function analyzeAccessLog(lines: string[]): LogSummary {
  // TODO: implement a pure log analyzer.
  // 1. Parse each line with ACCESS_LOG_RE.
  // 2. Count statuses, classes, errors, warnings, IPs, paths, and response times.
  // 3. Preserve invariants and tie-breaking rules from the exercise description.
  return {
    totalLines: 0,
    parsedLines: 0,
    invalidLines: 0,
    statusCodes: {},
    statusClasses: { "1xx": 0, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
    errorCount: 0,
    warningCount: 0,
    topIP: null,
    topPath: null,
    averageResponseMs: null,
    p95ResponseMs: null,
    slowestRequests: []
  };
}
```