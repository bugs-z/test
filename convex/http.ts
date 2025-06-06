import { httpRouter } from 'convex/server';
import { handleChatsHttp } from './chatsHttp';
import { getMessagesWithFilesHttp } from './messagesHttp';
import { handleTeamsHttp } from './teamsHttp';
import { handleSubscriptionsHttp } from './subscriptionsHttp';
import { handleProfilesHttp } from './profilesHttp';
import {
  uploadImageHttp,
  uploadFileHttp,
  getStorageUrlHttp,
  deleteStorageItemHttp,
} from './fileStorageHttp';
import { createOptionsHandler } from './httpUtils';

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

// Register image upload endpoint
http.route({
  path: '/api/upload-image',
  method: 'POST',
  handler: uploadImageHttp,
});

// Register file upload endpoint
http.route({
  path: '/api/upload-file',
  method: 'POST',
  handler: uploadFileHttp,
});

// Register unified storage URL endpoint (replaces both image and file URL endpoints)
http.route({
  path: '/api/get-storage-url',
  method: 'GET',
  handler: getStorageUrlHttp,
});

// Register delete storage item endpoint
http.route({
  path: '/api/delete-storage-item',
  method: 'POST',
  handler: deleteStorageItemHttp,
});

// Pre-flight requests using reusable handler
http.route({
  path: '/messages',
  method: 'OPTIONS',
  handler: createOptionsHandler(['GET', 'OPTIONS']),
});

http.route({
  path: '/api/chats',
  method: 'OPTIONS',
  handler: createOptionsHandler(['POST', 'OPTIONS']),
});

http.route({
  path: '/api/teams',
  method: 'OPTIONS',
  handler: createOptionsHandler(['POST', 'OPTIONS']),
});

http.route({
  path: '/api/profiles',
  method: 'OPTIONS',
  handler: createOptionsHandler(['POST', 'OPTIONS']),
});

http.route({
  path: '/api/subscriptions',
  method: 'OPTIONS',
  handler: createOptionsHandler(['POST', 'OPTIONS']),
});

http.route({
  path: '/api/upload-image',
  method: 'OPTIONS',
  handler: createOptionsHandler(['POST', 'OPTIONS']),
});

http.route({
  path: '/api/upload-file',
  method: 'OPTIONS',
  handler: createOptionsHandler(['POST', 'OPTIONS']),
});

http.route({
  path: '/api/get-storage-url',
  method: 'OPTIONS',
  handler: createOptionsHandler(['GET', 'OPTIONS']),
});

http.route({
  path: '/api/delete-storage-item',
  method: 'OPTIONS',
  handler: createOptionsHandler(['POST', 'OPTIONS']),
});

export default http;
