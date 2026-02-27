export interface RequestLogEntry {
  readonly timestamp: string;
  readonly method: string;
  readonly path: string;
  readonly allowed: boolean;
  readonly reason?: string;
  readonly bunqStatus?: number;
}

export function logRequest(entry: RequestLogEntry): void {
  console.log(JSON.stringify(entry));
}
