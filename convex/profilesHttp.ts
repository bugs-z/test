import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Helper function to create response with consistent headers
const createResponse = (
  data: unknown,
  status: number,
  origin: string | null,
) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      Vary: 'Origin',
    },
  });
};

// Helper function to validate auth token and get user
const validateAuth = async (authHeader: string | null) => {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authHeader.split(' ')[1]);

  if (authError || !user) {
    throw new Error('Invalid token');
  }

  return user;
};

// Main HTTP action handler for all profile operations
export const handleProfilesHttp = httpAction(async (ctx, request) => {
  const origin = request.headers.get('Origin');

  // Only allow POST requests
  if (request.method !== 'POST') {
    return createResponse({ error: 'Method not allowed' }, 405, origin);
  }

  try {
    // Validate authentication
    const user = await validateAuth(request.headers.get('Authorization'));
    const userId = user.id;

    // Parse request body
    const body = await request.json();
    const { type, image_url, profile_context } = body;

    // Route based on operation type
    switch (type) {
      case 'getProfileByUserId': {
        const result = await ctx.runMutation(
          internal.profiles.getOrCreateProfile,
          {
            userId,
          },
        );

        return createResponse({ data: result }, 200, origin);
      }

      case 'updateProfile': {
        const result = await ctx.runMutation(internal.profiles.updateProfile, {
          userId,
          profile_context,
        });
        return createResponse({ data: result }, 200, origin);
      }

      case 'deleteProfile': {
        const result = await ctx.runMutation(
          internal.profileDeletion.deleteProfile,
          {
            userId,
            userEmail: user.email,
          },
        );
        return createResponse({ data: result }, 200, origin);
      }

      default:
        return createResponse({ error: 'Invalid operation type' }, 400, origin);
    }
  } catch (error) {
    console.error('Error handling profile request:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return createResponse({ error: 'Unauthorized' }, 401, origin);
      }
      if (error.message === 'Invalid token') {
        return createResponse({ error: 'Invalid token' }, 401, origin);
      }
      if (error.message === 'Profile already exists for this user') {
        return createResponse({ error: error.message }, 409, origin);
      }
      if (error.message === 'Profile not found') {
        return createResponse({ error: error.message }, 404, origin);
      }
    }
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
});
