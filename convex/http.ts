import { httpRouter } from 'convex/server';
import { handleChatsHttp } from './chatsHttp';
import { getMessagesWithFilesHttp, searchMessagesHttp } from './messagesHttp';
import { handleTeamsHttp } from './teamsHttp';
import { handleSubscriptionsHttp } from './subscriptionsHttp';
import { handleProfilesHttp } from './profilesHttp';
import { handleFeedbackHttp } from './feedbackHttp';
import {
  uploadImageHttp,
  uploadFileHttp,
  getStorageUrlHttp,
  getBatchStorageUrlsHttp,
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

// Register feedback endpoint
http.route({
  path: '/api/feedback',
  method: 'POST',
  handler: handleFeedbackHttp,
});

// Register messages endpoint
http.route({
  path: '/messages',
  method: 'GET',
  handler: getMessagesWithFilesHttp,
});

// Register search messages endpoint
http.route({
  path: '/conversations/search',
  method: 'GET',
  handler: searchMessagesHttp,
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
  method: 'POST',
  handler: getStorageUrlHttp,
});

// Register batch storage URLs endpoint
http.route({
  path: '/api/get-batch-storage-urls',
  method: 'POST',
  handler: getBatchStorageUrlsHttp,
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
  path: '/conversations/search',
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
  path: '/api/feedback',
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
  handler: createOptionsHandler(['POST', 'OPTIONS']),
});

http.route({
  path: '/api/get-batch-storage-urls',
  method: 'OPTIONS',
  handler: createOptionsHandler(['POST', 'OPTIONS']),
});

http.route({
  path: '/api/delete-storage-item',
  method: 'OPTIONS',
  handler: createOptionsHandler(['POST', 'OPTIONS']),
});

export default http;
