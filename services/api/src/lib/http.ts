import type { ApiSuccess } from "@campus-live/contracts";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}
