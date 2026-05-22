// Mock HTTP interceptor (WU9).
//
// Produces the secret-free recorded detail of an HTTP request and a
// deterministic response — under `MockRuntimeAdapter` no real network call is
// ever made. A `SecretRef` header is recorded as its opaque handle, never as
// plaintext (DoD S1). The host owns the ordered side-effect log; this module
// only shapes the http detail.
//
// References: plan §4 WU9 row; ADR-0008 cat. 12 (headless parity).

import type {
  HeaderValue,
  HostHttpRequest,
  HostHttpResponse,
  JsonObject,
} from "../../types.js";

/**
 * Render a header value for recording. A plain string is kept verbatim; a
 * `SecretRef` becomes `<secret:{id}>` — the opaque handle, never the secret.
 */
export function redactHeaderValue(value: HeaderValue): string {
  return typeof value === "string" ? value : `<secret:${value.id}>`;
}

/** The secret-free recorded detail of an HTTP request. */
export function httpRequestDetail(request: HostHttpRequest): JsonObject {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    headers[name] = redactHeaderValue(value);
  }
  return request.body === undefined
    ? { method: request.method, url: request.url, headers }
    : { method: request.method, url: request.url, headers, body: request.body };
}

/** A deterministic mock HTTP response — no real network call is made. */
export function mockHttpResponse(request: HostHttpRequest): HostHttpResponse {
  return { status: 200, body: `mock:${request.method} ${request.url}` };
}
