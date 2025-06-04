import { httpRouter } from 'convex/server';
import { handleChatsHttp } from './chatsHttp';
import { getMessagesWithFilesHttp } from './messagesHttp';
import { handleTeamsHttp } from './teamsHttp';
import { handleSubscriptionsHttp } from './subscriptionsHttp';
import { handleProfilesHttp } from './profilesHttp';
import { httpAction } from './_generated/server';

const http = httpRouter();

// Register chat endpoint
http.route({
  path: '/api/chats',
  method: 'POST',
  handler: handleChatsHttp,
});

// Register teams endpoint
http.route({
  path: '/api/teams',
  method: 'POST',
  handler: handleTeamsHttp,
});

// Register profiles endpoint
http.route({
  path: '/api/profiles',
  method: 'POST',
  handler: handleProfilesHttp,
});

// Register subscriptions endpoint
http.route({
  path: '/api/subscriptions',
  method: 'POST',
  handler: handleSubscriptionsHttp,
});

// Register messages endpoint
http.route({
  path: '/messages',
  method: 'GET',
  handler: getMessagesWithFilesHttp,
});

// Pre-flight request for /messages
http.route({
  path: '/messages',
  method: 'OPTIONS',
  handler: httpAction(async (_, request) => {
    return new Response(null, {
      status: 204, // No content for OPTIONS
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }),
});

// Pre-flight request for /chats
http.route({
  path: '/api/chats',
  method: 'OPTIONS',
  handler: httpAction(async (_, request) => {
    return new Response(null, {
      status: 204, // No content for OPTIONS
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }),
});

// Pre-flight request for /teams
http.route({
  path: '/api/teams',
  method: 'OPTIONS',
  handler: httpAction(async (_, request) => {
    return new Response(null, {
      status: 204, // No content for OPTIONS
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }),
});

// Pre-flight request for /profiles
http.route({
  path: '/api/profiles',
  method: 'OPTIONS',
  handler: httpAction(async (_, request) => {
    return new Response(null, {
      status: 204, // No content for OPTIONS
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }),
});

// Pre-flight request for /subscriptions
http.route({
  path: '/api/subscriptions',
  method: 'OPTIONS',
  handler: httpAction(async (_, request) => {
    return new Response(null, {
      status: 204, // No content for OPTIONS
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }),
});

export default http;
