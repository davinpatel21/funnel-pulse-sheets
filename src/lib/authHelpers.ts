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
export async function invokeWithAuth<T = any>(
  functionName: string,
  options?: { body?: any; headers?: Record<string, string> }
): Promise<{ data: T | null; error: Error | null }> {
  const timer = createTimedOperation("invokeWithAuth", functionName);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const err = new Error("Please sign in to continue");
    timer.error("No session", err);
    return { data: null, error: err };
  }

  try {
    const { data, error, response } = await supabase.functions.invoke<T>(functionName, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      let effectiveError: any = error;

      // Supabase returns FunctionsHttpError with `context` = Response (body not read).
      // Extract structured JSON from our backend functions (requestId, code, etc.).
      const isHttpError =
        error instanceof FunctionsHttpError ||
        (typeof (error as any)?.name === "string" && (error as any).name === "FunctionsHttpError");

      if (isHttpError && response) {
        const enhanced = await enhanceFunctionsHttpError(error, response as Response);
        if (enhanced) effectiveError = enhanced;
      }

      // Log detailed error info
      debugError("invokeWithAuth", `${functionName} failed`, effectiveError, {
        requestId: timer.requestId,
        functionName,
        httpStatus: (effectiveError as any)?.context?.status ?? (response as any)?.status,
        bodyKeys: options?.body ? Object.keys(options.body) : [],
      });

      // Transform auth errors to user-friendly messages
      const errorMessage = effectiveError?.message || "";
      const status = (effectiveError as any)?.context?.status;

      if (
        status === 401 ||
        errorMessage.includes("authorization") ||
        errorMessage.includes("AUTH_REQUIRED") ||
        errorMessage.includes("SESSION_EXPIRED") ||
        errorMessage.includes("401")
      ) {
        return {
          data: null,
          error: new Error("Please sign in to access your data"),
        };
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
      hasData: !!data,
      dataType: data ? typeof data : "null",
    });

    return { data, error: null };
  } catch (unexpectedError: any) {
    debugError("invokeWithAuth", `${functionName} threw exception`, unexpectedError, {
      requestId: timer.requestId,
    });
    return { data: null, error: unexpectedError };
  }
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
