export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const badRequest = (msg = 'Bad request', details?: unknown) => new ApiError(400, msg, 'BAD_REQUEST', details)
export const unauthorized = (msg = 'Authentication required') => new ApiError(401, msg, 'UNAUTHORIZED')
export const forbidden = (msg = 'You do not have permission to do this') => new ApiError(403, msg, 'FORBIDDEN')
export const notFound = (msg = 'Not found') => new ApiError(404, msg, 'NOT_FOUND')
export const conflict = (msg = 'Conflict', details?: unknown) => new ApiError(409, msg, 'CONFLICT', details)
