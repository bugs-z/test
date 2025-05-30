import { httpRouter } from 'convex/server';
import { getMessagesWithFilesHttp } from './messagesHttp';
import { httpAction } from './_generated/server';

const http = httpRouter();

// Route for getting messages with files
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

export default http;
