import type { ApiResponse } from "@campus-live/contracts";

/**
 * One API call, unwrapped. Every failure is a Turkish message the apps can show as it is: never a
 * raw "Failed to fetch" or a JSON parse error from a proxy's HTML page.
 */
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("API'ye ulaşılamadı.");
  }
  const unexpected = new Error(`API beklenmeyen bir yanıt verdi (HTTP ${response.status}).`);
  if (!response.headers.get("content-type")?.includes("application/json")) throw unexpected;
  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw unexpected;
  }
  if (!body.success) throw new Error(body.error.message);
  return body.data;
}
