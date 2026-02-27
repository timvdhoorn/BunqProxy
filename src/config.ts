export type PermissionMode = "read-only" | "read-write" | "custom";

export interface EndpointRule {
  readonly method: string;
  readonly pattern: string;
}

export interface PermissionConfig {
  readonly mode: PermissionMode;
  readonly allowedEndpoints: readonly EndpointRule[];
  readonly blockedEndpoints: readonly EndpointRule[];
}

export const config: PermissionConfig = {
  mode: "read-only",

  allowedEndpoints: [],

  blockedEndpoints: [
    { method: "DELETE", pattern: "/v1/installation/*" },
    { method: "DELETE", pattern: "/v1/device-server/*" },
    { method: "DELETE", pattern: "/v1/session/*" },
  ],
};
