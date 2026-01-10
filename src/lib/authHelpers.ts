import { supabase } from "@/integrations/supabase/client";
import { createTimedOperation, debugError, serializeError, extractBackendErrorDetails, formatErrorForDisplay } from "@/lib/debugLogger";

/**
 * Invokes a Supabase edge function with guaranteed Authorization header.
 * Ensures auth-related errors are user-friendly.
 * Includes detailed debug logging when enabled.
 */
export async function invokeWithAuth<T = any>(
  functionName: string,
  options?: { body?: any; headers?: Record<string, string> }
): Promise<{ data: T | null; error: Error | null }> {
  const timer = createTimedOperation('invokeWithAuth', functionName);
  
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const error = new Error('Please sign in to continue');
    timer.error('No session', error);
    return { data: null, error };
  }

  try {
    const { data, error } = await supabase.functions.invoke<T>(functionName, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      // Log detailed error info
      debugError('invokeWithAuth', `${functionName} failed`, error, {
        requestId: timer.requestId,
        functionName,
        bodyKeys: options?.body ? Object.keys(options.body) : [],
      });

      // Transform auth errors to user-friendly messages
      const errorMessage = error.message || '';
      if (
        errorMessage.includes('authorization') ||
        errorMessage.includes('AUTH_REQUIRED') ||
        errorMessage.includes('SESSION_EXPIRED') ||
        errorMessage.includes('401')
      ) {
        return {
          data: null,
          error: new Error('Please sign in to access your data'),
        };
      }

      // Enhance error with backend details
      const backendDetails = extractBackendErrorDetails(error);
      if (backendDetails?.requestId) {
        const enhancedError = new Error(formatErrorForDisplay(error));
        (enhancedError as any).requestId = backendDetails.requestId;
        (enhancedError as any).backendCode = backendDetails.code;
        return { data: null, error: enhancedError };
      }

      return { data: null, error };
    }

    timer.success('OK', { 
      hasData: !!data,
      dataType: data ? typeof data : 'null',
    });
    return { data, error: null };
  } catch (unexpectedError: any) {
    debugError('invokeWithAuth', `${functionName} threw exception`, unexpectedError, {
      requestId: timer.requestId,
    });
    return { data: null, error: unexpectedError };
  }
}

/**
 * Invokes an edge function path (e.g., 'google-sheets-oauth/initiate') with auth.
 */
export async function invokePathWithAuth<T = any>(
  functionPath: string,
  options?: { body?: any; headers?: Record<string, string> }
): Promise<{ data: T | null; error: Error | null }> {
  // Reuse invokeWithAuth since it handles paths the same way
  return invokeWithAuth<T>(functionPath, options);
}
