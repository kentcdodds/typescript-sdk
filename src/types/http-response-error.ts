/**
 * Type definition for HTTP response errors thrown by the MCP client
 * when tools throw Response objects.
 * 
 * This extends the standard Error with HTTP response details,
 * allowing clients to access status codes, headers, and body content.
 */
export interface HttpResponseError extends Error {
  /** The original Response object thrown by the tool */
  response: Response;
  /** HTTP status code */
  status: number;
  /** HTTP status text */
  statusText: string;
  /** Response headers */
  headers: Headers;
  /** Response body as text */
  body: string | null;
}

/**
 * Type guard to check if an error is an HTTP response error
 */
export function isHttpResponseError(error: unknown): error is HttpResponseError {
  return (
    error instanceof Error &&
    typeof error === 'object' &&
    'status' in error &&
    'response' in error &&
    'headers' in error
  );
}

/**
 * Utility function to extract structured error information
 */
export function extractHttpErrorInfo(error: unknown): {
  type: 'http_response' | 'other_error';
  status?: number;
  statusText?: string;
  body?: string | null;
  headers?: Record<string, string>;
  response?: Response;
  error?: unknown;
} {
  if (isHttpResponseError(error)) {
    return {
      type: 'http_response',
      status: error.status,
      statusText: error.statusText,
      body: error.body,
      headers: Object.fromEntries(error.headers.entries()),
      response: error.response
    };
  }
  
  return {
    type: 'other_error',
    error: error
  };
}
