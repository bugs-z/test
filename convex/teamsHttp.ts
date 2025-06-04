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

// Main HTTP action handler for all team operations
export const handleTeamsHttp = httpAction(async (ctx, request) => {
  const origin = request.headers.get('Origin');

  // Only allow POST requests
  if (request.method !== 'POST') {
    return createResponse({ error: 'Method not allowed' }, 405, origin);
  }

  try {
    // Validate authentication
    const user = await validateAuth(request.headers.get('Authorization'));
    const userEmail = user.email;
    const userId = user.id;

    // Parse request body
    const body = await request.json();
    const { type, teamId, memberEmail, inviteeEmail, invitationId } = body;

    // Route based on operation type
    switch (type) {
      case 'getTeamMembersByUserId': {
        // Use authenticated user's ID instead of requiring it from client
        const teamId = await ctx.runQuery(
          internal.teams.getTeamIdByUserOrEmail,
          {
            userId,
            userEmail,
          },
        );

        if (!teamId) {
          return createResponse({ data: [] }, 200, origin);
        }

        const result = await ctx.runQuery(internal.teams.getTeamMembers, {
          teamId,
        });
        return createResponse({ data: result }, 200, origin);
      }

      case 'removeUserFromTeam': {
        if (!teamId || !memberEmail) {
          return createResponse(
            { error: 'Missing teamId or memberEmail parameter' },
            400,
            origin,
          );
        }

        const result = await ctx.runMutation(
          internal.teams.removeUserFromTeam,
          {
            teamId,
            memberEmail,
            currentUserId: user.id,
          },
        );
        return createResponse({ data: result }, 200, origin);
      }

      case 'inviteUserToTeam': {
        if (!teamId || !inviteeEmail) {
          return createResponse(
            { error: 'Missing teamId or inviteeEmail parameter' },
            400,
            origin,
          );
        }

        const result = await ctx.runMutation(
          internal.invitations.inviteUserToTeam,
          {
            teamId,
            inviteeEmail,
            inviterId: user.id,
          },
        );
        return createResponse({ data: result }, 200, origin);
      }

      case 'acceptTeamInvitation': {
        if (!invitationId || !userEmail) {
          return createResponse(
            { error: 'Missing invitationId or userEmail parameter' },
            400,
            origin,
          );
        }

        const result = await ctx.runMutation(
          internal.invitations.acceptTeamInvitation,
          {
            invitationId,
            userId,
            userEmail,
          },
        );
        return createResponse({ data: result }, 200, origin);
      }

      case 'rejectTeamInvitation': {
        if (!invitationId || !userEmail) {
          return createResponse(
            { error: 'Missing invitationId or userEmail parameter' },
            400,
            origin,
          );
        }

        const result = await ctx.runMutation(
          internal.invitations.rejectTeamInvitation,
          {
            invitationId,
            userEmail,
          },
        );
        return createResponse({ data: result }, 200, origin);
      }

      default:
        return createResponse({ error: 'Invalid operation type' }, 400, origin);
    }
  } catch (error) {
    console.error('Error handling team request:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return createResponse({ error: 'Unauthorized' }, 401, origin);
      }
      if (error.message === 'Invalid token') {
        return createResponse({ error: 'Invalid token' }, 401, origin);
      }
      if (error.message === 'Unauthorized: User ID mismatch') {
        return createResponse(
          { error: 'Unauthorized: User ID mismatch' },
          403,
          origin,
        );
      }
      if (error.message.includes('Only team admins')) {
        return createResponse({ error: error.message }, 403, origin);
      }
      if (error.message.includes('already has a team')) {
        return createResponse({ error: error.message }, 409, origin);
      }
    }
    return createResponse({ error: 'Internal server error' }, 500, origin);
  }
});
