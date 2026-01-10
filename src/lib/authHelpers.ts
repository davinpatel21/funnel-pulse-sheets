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
 * Attempts to refresh the session using the refresh token
 * Returns the new session if successful, null otherwise
 */
async function tryRefreshSession(): Promise<{ session: any; success: boolean }> {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[authHelpers] [${timestamp}] Attempting to refresh session...`);
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      console.log(`[authHelpers] [${timestamp}] Refresh failed:`, error.message);
      return { session: null, success: false };
    }
    if (!data.session) {
      console.log(`[authHelpers] [${timestamp}] Refresh returned no session`);
      return { session: null, success: false };
    }
    console.log(`[authHelpers] [${timestamp}] Session refreshed successfully, new token prefix: ${data.session.access_token?.slice(0, 20)}...`);
    return { session: data.session, success: true };
  } catch (e: any) {
    console.log(`[authHelpers] Refresh exception:`, e?.message);
    return { session: null, success: false };
  }
}

/**
 * Gets a valid session WITHOUT triggering unnecessary token refreshes.
 * SIMPLIFIED: We trust getSession() and only refresh on actual 401 errors.
 * This avoids the race condition caused by validateSession() calling getUser().
 */
async function getValidSession(): Promise<{ session: any; error: Error | null }> {
  const timestamp = new Date().toISOString();
  console.log(`[authHelpers] [${timestamp}] getValidSession called`);
  
  // Simply get the current session - don't validate with getUser() as it can trigger auto-refresh
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    console.log(`[authHelpers] [${timestamp}] getSession error:`, error.message);
    return { session: null, error: new Error("Failed to get auth session") };
  }
  
  if (session) {
    console.log(`[authHelpers] [${timestamp}] Found session, token prefix: ${session.access_token?.slice(0, 20)}...`);
    return { session, error: null };
  }
  
  // No session - try one explicit refresh
  console.log(`[authHelpers] [${timestamp}] No session found, attempting refresh...`);
  const { session: refreshedSession, success } = await tryRefreshSession();
  
  if (success && refreshedSession) {
    return { session: refreshedSession, error: null };
  }
  
  console.log(`[authHelpers] [${timestamp}] Failed to get valid session`);
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
    const responseObj = result.response as Response | undefined;
    const errorContext = (result.error as any)?.context as Response | undefined;
    const status = responseObj?.status ?? errorContext?.status;
    const timestamp = new Date().toISOString();
    
    console.log(`[invokeWithAuth] [${timestamp}] Error detected for ${functionName}, status=${status}`, { 
      hasResponse: !!responseObj, 
      hasContext: !!errorContext,
      errorName: result.error?.name,
      tokenUsed: session.access_token?.slice(0, 20) + '...'
    });
    
    if (status === 401) {
      console.log(`[invokeWithAuth] [${timestamp}] Got 401, attempting token refresh...`);
      
      // Refresh and get the NEW session directly from the refresh response
      const { session: refreshedSession, success } = await tryRefreshSession();
      
      if (success && refreshedSession) {
        console.log(`[invokeWithAuth] [${timestamp}] Token refreshed, new token prefix: ${refreshedSession.access_token?.slice(0, 20)}..., retrying call...`);
        
        // Use the fresh token directly from refresh, not from getSession()
        result = await makeCall(refreshedSession.access_token);
        
        if (result.error) {
          const retryStatus = (result.response as Response)?.status;
          console.log(`[invokeWithAuth] [${timestamp}] Retry failed: ${retryStatus ? `status ${retryStatus}` : 'error'}`);
        } else {
          console.log(`[invokeWithAuth] [${timestamp}] Retry succeeded after token refresh`);
        }
      } else {
        console.log(`[invokeWithAuth] [${timestamp}] Token refresh failed, cannot retry`);
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
