/**
 * Debug logging utilities for Google Sheets integration
 * Enable by setting localStorage.debug_google_sheets = "1"
 */

const STORAGE_KEY = 'debug_google_sheets';

export function isDebugEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDebugEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage not available
  }
}

export function debugLog(scope: string, message: string, data?: any): void {
  if (!isDebugEnabled()) return;
  
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${scope}] ${message}`, data !== undefined ? data : '');
}

export function debugError(scope: string, message: string, error: any, data?: any): void {
  // Always log errors, but with extra detail if debug is enabled
  const timestamp = new Date().toISOString();
  const serialized = serializeError(error);
  
  console.error(`[${timestamp}] [${scope}] ${message}`, serialized);
  
  if (data !== undefined) {
    console.error('Error Details:', data);
  }
  
  if (isDebugEnabled()) {
    console.error('Context:', {
      requestId: data?.requestId,
      duration: data?.duration,
      backendDetails: extractBackendErrorDetails(error),
      serialized,
    });
  }
}

/**
 * Serialize error objects including non-enumerable properties
 */
export function serializeError(error: any): Record<string, any> {
  if (!error) return { message: 'Unknown error' };
  
  if (typeof error === 'string') return { message: error };
  
  const result: Record<string, any> = {};
  
  // Standard error properties
  if (error.name) result.name = error.name;
  if (error.message) result.message = error.message;
  if (error.stack) result.stack = error.stack;
  
  // Supabase FunctionsHttpError context
  if (error.context) {
    result.context = {};
    if (error.context.status !== undefined) {
      result.context.status = error.context.status;
    }
    if (error.context.statusText !== undefined) {
      result.context.statusText = error.context.statusText;
    }
    // Try to get response body
    if (error.context.body) {
      result.context.body = truncate(error.context.body, 1000);
    }
  }
  
  // Copy enumerable properties
  Object.keys(error).forEach(key => {
    if (!(key in result)) {
      try {
        const value = error[key];
        if (typeof value !== 'function') {
          result[key] = value;
        }
      } catch {
        // Skip non-serializable properties
      }
    }
  });
  
  return result;
}

/**
 * Extract backend error details from Supabase function responses
 */
export function extractBackendErrorDetails(error: any): {
  status?: number;
  requestId?: string;
  code?: string;
  message?: string;
  details?: string;
} | null {
  if (!error) return null;
  
  const result: any = {};
  
  // Try to get HTTP status
  if (error.context?.status) {
    result.status = error.context.status;
  }
  
  // Try to parse JSON body from backend
  try {
    let body = error.context?.body;
    if (typeof body === 'string') {
      const parsed = JSON.parse(body);
      if (parsed.requestId) result.requestId = parsed.requestId;
      if (parsed.code) result.code = parsed.code;
      if (parsed.error) result.message = parsed.error;
      if (parsed.details) result.details = truncate(parsed.details, 500);
    }
  } catch {
    // Body not JSON
  }
  
  // Check for x-request-id header
  if (error.context?.headers) {
    const reqId = error.context.headers.get?.('x-request-id');
    if (reqId) result.requestId = reqId;
  }
  
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Format error for user display
 */
export function formatErrorForDisplay(error: any): string {
  const details = extractBackendErrorDetails(error);
  const message = error?.message || 'An unknown error occurred';
  
  let display = message;
  
  if (details?.requestId) {
    display += ` (Request: ${details.requestId.slice(0, 8)})`;
  }
  
  if (details?.code) {
    display = `[${details.code}] ${display}`;
  }
  
  return display;
}

/**
 * Create a timed operation logger
 */
export function createTimedOperation(scope: string, operation: string) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  debugLog(scope, `Starting: ${operation}`, { requestId });
  
  return {
    requestId,
    success: (message: string, data?: any) => {
      const duration = Date.now() - startTime;
      debugLog(scope, `✓ ${operation}: ${message} (${duration}ms)`, { requestId, duration, ...data });
    },
    error: (message: string, error: any, data?: any) => {
      const duration = Date.now() - startTime;
      debugError(scope, `✗ ${operation}: ${message}`, error, { requestId, duration, ...data });
    },
  };
}

function truncate(str: string, maxLength: number): string {
  if (!str || str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '... [truncated]';
}
