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
    
    // Get current session before refresh
    const { data: { session: beforeSession } } = await supabase.auth.getSession();
    console.log(`[authHelpers] [${timestamp}] Before refresh - hasSession: ${!!beforeSession}, tokenPrefix: ${beforeSession?.access_token?.slice(0, 20) || 'none'}...`);
    
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error) {
      console.error(`[authHelpers] [${timestamp}] Refresh failed:`, {
        message: error.message,
        status: error.status,
        name: error.name,
      });
      return { session: null, success: false };
    }
    
    if (!data.session) {
      console.error(`[authHelpers] [${timestamp}] Refresh returned no session`);
      return { session: null, success: false };
    }
    
    console.log(`[authHelpers] [${timestamp}] Session refreshed successfully`, {
      newTokenPrefix: data.session.access_token?.slice(0, 20) + '...',
      expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : 'unknown',
      userId: data.session.user?.id?.slice(0, 8) + '...' || 'none',
    });
    
    return { session: data.session, success: true };
  } catch (e: any) {
    console.error(`[authHelpers] [${new Date().toISOString()}] Refresh exception:`, {
      message: e?.message,
      stack: e?.stack?.slice(0, 200),
    });
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
  
  console.log(`[authHelpers] [${timestamp}] getSession result:`, {
    hasSession: !!session,
    hasError: !!error,
    errorMessage: error?.message || 'none',
    tokenPrefix: session?.access_token ? session.access_token.slice(0, 20) + '...' : 'none',
    expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'none',
    expiresIn: session?.expires_at ? Math.max(0, session.expires_at - Math.floor(Date.now() / 1000)) : 'unknown',
    userId: session?.user?.id?.slice(0, 8) + '...' || 'none',
  });
  
  if (error) {
    console.error(`[authHelpers] [${timestamp}] getSession error:`, error.message);
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
    console.log(`[authHelpers] [${timestamp}] Refresh successful, got new session`);
    return { session: refreshedSession, error: null };
  }
  
  console.error(`[authHelpers] [${timestamp}] Failed to get valid session`);
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
  const callId = crypto.randomUUID().slice(0, 8);
  const timestamp = new Date().toISOString();
  
  console.log(`[invokeWithAuth] [${timestamp}] [${callId}] Starting call to ${functionName}`, {
    hasBody: !!options?.body,
    bodyKeys: options?.body ? Object.keys(options.body) : [],
    customHeaders: options?.headers ? Object.keys(options.headers) : [],
  });

  // Get valid session with retries and validation
  const { session, error: sessionError } = await getValidSession();

  if (sessionError || !session?.access_token) {
    console.error(`[invokeWithAuth] [${timestamp}] [${callId}] No valid session`, {
      hasSessionError: !!sessionError,
      sessionErrorMessage: sessionError?.message || 'none',
      hasSession: !!session,
      hasAccessToken: !!session?.access_token,
    });
    const err: any = new Error("Please sign in to continue");
    err.backendCode = "SESSION_UNAVAILABLE";
    timer.error("No valid session after retries", err);
    return { data: null, error: err };
  }

  console.log(`[invokeWithAuth] [${timestamp}] [${callId}] Got session`, {
    tokenPrefix: session.access_token.slice(0, 30) + '...',
    tokenLength: session.access_token.length,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'none',
    userId: session.user?.id?.slice(0, 8) + '...' || 'none',
  });

  // Make the function call
  const makeCall = async (accessToken: string, attempt: number = 1) => {
    const tokenPrefix = accessToken.slice(0, 30) + '...';
    const supabaseUrl = (supabase as any).supabaseUrl || 'unknown';
    const attemptTimestamp = new Date().toISOString();
    
    console.log(`[invokeWithAuth] [${attemptTimestamp}] [${callId}] Making call (attempt ${attempt})`, {
      functionName,
      tokenPrefix,
      tokenLength: accessToken.length,
      url: `${supabaseUrl}/functions/v1/${functionName}`,
      method: 'POST',
      hasBody: !!options?.body,
    });
    
    const startTime = Date.now();
    const result = await supabase.functions.invoke<T>(functionName, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const duration = Date.now() - startTime;
    
    console.log(`[invokeWithAuth] [${attemptTimestamp}] [${callId}] Call completed in ${duration}ms`, {
      hasError: !!result.error,
      hasData: !!result.data,
      errorName: result.error?.name || 'none',
      errorMessage: result.error?.message?.slice(0, 200) || 'none',
      responseStatus: (result.response as Response)?.status || (result.error as any)?.context?.status || 'unknown',
    });
    
    return result;
  };

  let result = await makeCall(session.access_token, 1);

  // Handle 401 with one retry after refresh
  if (result.error) {
    const responseObj = result.response as Response | undefined;
    const errorContext = (result.error as any)?.context as Response | undefined;
    const status = responseObj?.status ?? errorContext?.status;
    
    console.log(`[invokeWithAuth] [${timestamp}] [${callId}] Error detected`, { 
      status: status || 'unknown',
      hasResponse: !!responseObj, 
      hasContext: !!errorContext,
      errorName: result.error?.name,
      errorMessage: result.error?.message?.slice(0, 200) || 'none',
      tokenUsed: session.access_token?.slice(0, 20) + '...',
      responseHeaders: responseObj?.headers ? Object.fromEntries(responseObj.headers.entries()) : 'none',
    });
    
    if (status === 401) {
      console.log(`[invokeWithAuth] [${timestamp}] [${callId}] Got 401, attempting token refresh...`);
      
      // Try to get response body for more details
      if (responseObj) {
        try {
          const cloned = responseObj.clone();
          const bodyText = await cloned.text();
          console.log(`[invokeWithAuth] [${timestamp}] [${callId}] 401 response body:`, bodyText.slice(0, 500));
        } catch (e) {
          console.log(`[invokeWithAuth] [${timestamp}] [${callId}] Could not read response body:`, e);
        }
      }
      
      // Refresh and get the NEW session directly from the refresh response
      const { session: refreshedSession, success } = await tryRefreshSession();
      
      if (success && refreshedSession) {
        console.log(`[invokeWithAuth] [${timestamp}] [${callId}] Token refreshed successfully, retrying call...`, {
          newTokenPrefix: refreshedSession.access_token?.slice(0, 30) + '...',
        });
        
        // Use the fresh token directly from refresh, not from getSession()
        result = await makeCall(refreshedSession.access_token, 2);
        
        if (result.error) {
          const retryResponseObj = result.response as Response | undefined;
          const retryStatus = retryResponseObj?.status ?? (result.error as any)?.context?.status;
          console.error(`[invokeWithAuth] [${timestamp}] [${callId}] Retry also failed`, {
            status: retryStatus || 'unknown',
            errorName: result.error?.name,
            errorMessage: result.error?.message?.slice(0, 200) || 'none',
          });
          
          // Try to get retry response body
          if (retryResponseObj) {
            try {
              const cloned = retryResponseObj.clone();
              const bodyText = await cloned.text();
              console.error(`[invokeWithAuth] [${timestamp}] [${callId}] Retry response body:`, bodyText.slice(0, 500));
            } catch (e) {
              console.log(`[invokeWithAuth] [${timestamp}] [${callId}] Could not read retry response body:`, e);
            }
          }
        } else {
          console.log(`[invokeWithAuth] [${timestamp}] [${callId}] Retry succeeded after token refresh!`);
        }
      } else {
        console.error(`[invokeWithAuth] [${timestamp}] [${callId}] Token refresh failed, cannot retry`);
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
    console.error(`[invokeWithAuth] [${timestamp}] [${callId}] Final error processing`, {
      functionName,
      httpStatus: (effectiveError as any)?.context?.status ?? (result.response as any)?.status,
      errorMessage: effectiveError?.message?.slice(0, 300) || 'none',
      backendCode: (effectiveError as any)?.backendCode || 'none',
      requestId: (effectiveError as any)?.requestId || timer.requestId || 'none',
    });
    
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

  console.log(`[invokeWithAuth] [${timestamp}] [${callId}] Call succeeded`, {
    hasData: !!result.data,
    dataType: result.data ? typeof result.data : "null",
  });

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
