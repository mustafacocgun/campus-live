import type { ApiResponse } from "@campus-live/contracts";

/** A failed API call: the Turkish message to show, plus the HTTP status and the API's error code. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null,
  ) {
    super(message);
  }
}

/**
 * One API call, unwrapped. Every failure is a Turkish message the apps can show as it is: never a
 * raw "Failed to fetch" or a JSON parse error from a proxy's HTML page.
 */
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiRequestError("API'ye ulaşılamadı.", null, null);
  }
  const unexpected = new ApiRequestError(
    `API beklenmeyen bir yanıt verdi (HTTP ${response.status}).`,
    response.status,
    null,
  );
  if (!response.headers.get("content-type")?.includes("application/json")) throw unexpected;
  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw unexpected;
  }
  if (!body.success) throw new ApiRequestError(body.error.message, response.status, body.error.code);
  return body.data;
}
