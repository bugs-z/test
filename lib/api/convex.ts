import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

// Helper function to get authenticated session
export const getAuthenticatedSession = async () => {
  const supabase = createClient();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('Session error:', sessionError);
    toast.error('Error getting session. Please try again.');
    return null;
  }

  if (!session?.access_token) {
    toast.error('No active session. Please log in again.');
    return null;
  }

  return session;
};

// Helper function to make authenticated HTTP requests
export const makeAuthenticatedRequest = async (
  endpoint: string,
  method: 'GET' | 'POST',
  data?: unknown,
) => {
  const session = await getAuthenticatedSession();
  if (!session) return null;

  const requestOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
  };

  if (data) {
    requestOptions.body = JSON.stringify(data);
  }

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_CONVEX_HTTP_ACTIONS_URL}${endpoint}`,
    requestOptions,
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.error || `Failed to ${method.toLowerCase()} request`,
    );
  }

  return response.json();
};
