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
    const origin = request.headers.get('Origin');

    // Make sure the necessary headers are present for a valid pre-flight request
    if (
      request.headers.get('Origin') !== null &&
      request.headers.get('Access-Control-Request-Method') !== null &&
      request.headers.get('Access-Control-Request-Headers') !== null
    ) {
      // Use CLIENT_ORIGIN from environment variables, fallback to origin if it matches
      const corsOrigin =
        origin === process.env.CLIENT_ORIGIN
          ? origin
          : process.env.CLIENT_ORIGIN!;

      return new Response(null, {
        status: 204, // No content for OPTIONS
        headers: {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      });
    }

    return new Response(null, { status: 400 });
  }),
});

export default http;
