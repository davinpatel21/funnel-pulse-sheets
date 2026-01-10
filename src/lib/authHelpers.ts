import { supabase } from "@/integrations/supabase/client";

/**
 * Invokes a Supabase edge function with guaranteed Authorization header.
 * Ensures auth-related errors are user-friendly.
 */
export async function invokeWithAuth<T = any>(
  functionName: string,
  options?: { body?: any; headers?: Record<string, string> }
): Promise<{ data: T | null; error: Error | null }> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      data: null,
      error: new Error('Please sign in to continue'),
    };
  }

  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  // Transform auth errors to user-friendly messages
  if (error) {
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
  }

  return { data, error };
}

/**
 * Invokes an edge function path (e.g., 'google-sheets-oauth/initiate') with auth.
 */
export async function invokePathWithAuth<T = any>(
  functionPath: string,
  options?: { body?: any; headers?: Record<string, string> }
): Promise<{ data: T | null; error: Error | null }> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      data: null,
      error: new Error('Please sign in to continue'),
    };
  }

  const { data, error } = await supabase.functions.invoke<T>(functionPath, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
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
  }

  return { data, error };
}
