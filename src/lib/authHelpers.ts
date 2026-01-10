import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  createTimedOperation,
  debugError,
  extractBackendErrorDetails,
  formatErrorForDisplay,
} from "@/lib/debugLogger";

async function enhanceFunctionsHttpError(error: any, response: Response): Promise<Error | null> {
  try {
    const res = response.clone();
    const text = await res.text();

    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // not JSON
    }

    const context = {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: text,
    };

    // Build a temp error that our debugLogger can understand
    const temp: any = new Error(parsed?.error || parsed?.message || error?.message || "Request failed");
    temp.context = context;

    const requestId = parsed?.requestId || response.headers.get("x-request-id") || undefined;
    if (requestId) temp.requestId = requestId;
    if (parsed?.code) temp.backendCode = parsed.code;
    if (parsed?.details) temp.backendDetails = parsed.details;

    const display = formatErrorForDisplay(temp);

    const finalErr: any = new Error(display);
    finalErr.context = context;
    finalErr.requestId = temp.requestId;
    finalErr.backendCode = temp.backendCode;
    finalErr.backendDetails = temp.backendDetails;

    return finalErr;
  } catch {
    return null;
  }
}

/**
 * Invokes a backend function with guaranteed Authorization header.
 * Ensures auth-related errors are user-friendly.
 * Includes detailed debug logging when enabled.
 */
/**
 * Validates the current session by calling getUser()
 */
async function validateSession(): Promise<boolean> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    return !!user && !error;
  } catch {
    return false;
  }
}

/**
 * Attempts to refresh the session using the refresh token
 */
async function tryRefreshSession(): Promise<boolean> {
  try {
    console.log(`[authHelpers] Attempting to refresh session...`);
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      console.log(`[authHelpers] Refresh failed:`, error.message);
      return false;
    }
    if (!data.session) {
      console.log(`[authHelpers] Refresh returned no session`);
      return false;
    }
    console.log(`[authHelpers] Session refreshed successfully`);
    return true;
  } catch (e: any) {
    console.log(`[authHelpers] Refresh exception:`, e?.message);
    return false;
  }
}

/**
 * Gets a valid session, with retry and refresh logic
 */
async function getValidSession(maxRetries = 3, retryDelayMs = 500): Promise<{ session: any; error: Error | null }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      // Validate the session is actually usable
      const isValid = await validateSession();
      if (isValid) {
        return { session, error: null };
      }
      
      // Session exists but invalid - try refresh
      console.log(`[authHelpers] Session invalid on attempt ${attempt + 1}, attempting refresh...`);
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        const { data: { session: newSession } } = await supabase.auth.getSession();
        if (newSession) {
          return { session: newSession, error: null };
        }
      }
    }
    
    // Wait before retry (except on last attempt)
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }
  
  return { session: null, error: new Error("Unable to establish valid auth session") };
}

/**
 * Invokes a backend function with guaranteed Authorization header.
 * Includes session validation, automatic token refresh, and retry on 401.
 */
export async function invokeWithAuth<T = any>(
  functionName: string,
  options?: { body?: any; headers?: Record<string, string> }
): Promise<{ data: T | null; error: Error | null }> {
  const timer = createTimedOperation("invokeWithAuth", functionName);

  // Get valid session with retries and validation
  const { session, error: sessionError } = await getValidSession();

  if (sessionError || !session?.access_token) {
    const err: any = new Error("Please sign in to continue");
    err.backendCode = "SESSION_UNAVAILABLE";
    timer.error("No valid session after retries", err);
    return { data: null, error: err };
  }

  // Make the function call
  const makeCall = async (accessToken: string) => {
    return await supabase.functions.invoke<T>(functionName, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  };

  let result = await makeCall(session.access_token);

  // Handle 401 with one retry after refresh
  if (result.error) {
    // FunctionsHttpError stores Response in context, and result.response is the same
    // We need to check the actual Response object's status property
    const responseObj = result.response as Response | undefined;
    const errorContext = (result.error as any)?.context as Response | undefined;
    const status = responseObj?.status ?? errorContext?.status;
    
    console.log(`[invokeWithAuth] Error detected, status=${status}`, { 
      hasResponse: !!responseObj, 
      hasContext: !!errorContext,
      errorName: result.error?.name 
    });
    
    if (status === 401) {
      console.log(`[invokeWithAuth] Got 401, attempting token refresh...`);
      
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        const { data: { session: newSession } } = await supabase.auth.getSession();
        if (newSession) {
          console.log(`[invokeWithAuth] Token refreshed successfully, retrying call...`);
          result = await makeCall(newSession.access_token);
          
          // Check if retry also failed
          if (result.error) {
            const retryStatus = (result.response as Response)?.status;
            console.log(`[invokeWithAuth] Retry result: ${retryStatus ? `status ${retryStatus}` : 'error'}`);
          }
        } else {
          console.log(`[invokeWithAuth] Session refresh succeeded but no new session available`);
        }
      } else {
        console.log(`[invokeWithAuth] Token refresh failed`);
      }
    }
  }

  // Handle final error
  if (result.error) {
    let effectiveError: any = result.error;

    // Supabase returns FunctionsHttpError with `context` = Response (body not read).
    const isHttpError =
      result.error instanceof FunctionsHttpError ||
      (typeof (result.error as any)?.name === "string" && (result.error as any).name === "FunctionsHttpError");

    if (isHttpError && result.response) {
      const enhanced = await enhanceFunctionsHttpError(result.error, result.response as Response);
      if (enhanced) effectiveError = enhanced;
    }

    // Log detailed error info
    debugError("invokeWithAuth", `${functionName} failed`, effectiveError, {
      requestId: timer.requestId,
      functionName,
      httpStatus: (effectiveError as any)?.context?.status ?? (result.response as any)?.status,
      bodyKeys: options?.body ? Object.keys(options.body) : [],
    });

    // Transform auth errors to user-friendly messages but preserve metadata
    const errorMessage = effectiveError?.message || "";
    const httpStatus = (effectiveError as any)?.context?.status;

    if (
      httpStatus === 401 ||
      errorMessage.includes("authorization") ||
      errorMessage.includes("AUTH_REQUIRED") ||
      errorMessage.includes("SESSION_EXPIRED") ||
      errorMessage.includes("401")
    ) {
      const authErr: any = new Error("Please sign in to access your data");
      authErr.requestId = (effectiveError as any)?.requestId;
      authErr.backendCode = (effectiveError as any)?.backendCode || "AUTH_REQUIRED";
      authErr.backendDetails = (effectiveError as any)?.backendDetails;
      authErr.httpStatus = httpStatus;
      return { data: null, error: authErr };
    }

    // Enhance error with backend details (requestId, code)
    const backendDetails = extractBackendErrorDetails(effectiveError);
    if (backendDetails?.requestId) {
      const enhancedError: any = new Error(formatErrorForDisplay(effectiveError));
      enhancedError.requestId = backendDetails.requestId;
      enhancedError.backendCode = backendDetails.code;
      return { data: null, error: enhancedError };
    }

    return { data: null, error: effectiveError };
  }

  timer.success("OK", {
    hasData: !!result.data,
    dataType: result.data ? typeof result.data : "null",
  });

  return { data: result.data, error: null };
}

/**
 * Invokes a backend function path (e.g., 'google-sheets-oauth/initiate') with auth.
 */
export async function invokePathWithAuth<T = any>(
  functionPath: string,
  options?: { body?: any; headers?: Record<string, string> }
): Promise<{ data: T | null; error: Error | null }> {
  return invokeWithAuth<T>(functionPath, options);
}
