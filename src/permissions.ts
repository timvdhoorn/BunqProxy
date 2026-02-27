import { config, type EndpointRule } from "./config";

interface PermissionResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

function matchPattern(pattern: string, path: string): boolean {
  const patternSegments = pattern.split("/");
  const pathSegments = path.split("/");

  if (patternSegments.length !== pathSegments.length) {
    return false;
  }

  return patternSegments.every(
    (seg, i) => seg === "*" || seg === pathSegments[i]
  );
}

function matchesRule(rule: EndpointRule, method: string, path: string): boolean {
  const methodMatch =
    rule.method === "*" || rule.method.toUpperCase() === method.toUpperCase();
  return methodMatch && matchPattern(rule.pattern, path);
}

export function isAllowed(method: string, path: string): PermissionResult {
  const upperMethod = method.toUpperCase();

  const blocked = config.blockedEndpoints.find((rule) =>
    matchesRule(rule, upperMethod, path)
  );
  if (blocked) {
    return {
      allowed: false,
      reason: `Blocked by rule: ${blocked.method} ${blocked.pattern}`,
    };
  }

  switch (config.mode) {
    case "read-only": {
      if (upperMethod !== "GET") {
        return {
          allowed: false,
          reason: `Read-only mode: ${upperMethod} not allowed`,
        };
      }
      return { allowed: true };
    }

    case "read-write": {
      return { allowed: true };
    }

    case "custom": {
      const matched = config.allowedEndpoints.some((rule) =>
        matchesRule(rule, upperMethod, path)
      );
      if (!matched) {
        return {
          allowed: false,
          reason: `Custom mode: no matching allow rule for ${upperMethod} ${path}`,
        };
      }
      return { allowed: true };
    }
  }
}
