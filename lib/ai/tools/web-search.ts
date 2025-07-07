import { tool } from 'ai';
import { z } from 'zod';
import Exa from 'exa-js';
import { truncateContentByTokens } from '../terminal-utils';
import PostHogClient from '@/app/posthog';

interface ExaSearchOptions {
  numResults?: number;
  contents: {
    text: boolean;
  };
  startPublishedDate?: string;
  endPublishedDate?: string;
}

/**
 * Web search tool using Exa API
 * Searches the web and returns results with content
 */
export const createWebSearchTool = (profile: any, dataStream: any) => {
  return tool({
    description: `Use the webSearch tool to access up-to-date information from the web \
or when responding to the user requires information about their location. \
Some examples of when to use the webSearch tool include:

- Local Information: Use the \`webSearch\` tool to respond to questions that require information \
about the user's location, such as the weather, local businesses, or events.
- Freshness: If up-to-date information on a topic could potentially change or enhance the answer, \
call the \`webSearch\` tool any time you would otherwise refuse to answer a question because your \
knowledge might be out of date.
- Niche Information: If the answer would benefit from detailed information not widely known or understood \
(which might be found on the internet), such as details about a small neighborhood, a less well-known \
company, or arcane regulations, use web sources directly rather than relying on the distilled knowledge \
from pretraining.
- Accuracy: If the cost of a small mistake or outdated information is high (e.g., using an outdated \
version of a software library or not knowing the date of the next game for a sports team), then use the \
\`webSearch\` tool.`,
    parameters: z.object({
      query: z.string().describe('Search query to find relevant web content'),
      numResults: z
        .number()
        .min(1)
        .max(25)
        .nullable()
        .describe('Number of search results to return (Default: 10)'),
      startPublishedDate: z
        .string()
        .datetime()
        .nullable()
        .describe(
          'Start date for published content (ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ)',
        ),
      endPublishedDate: z
        .string()
        .datetime()
        .nullable()
        .describe(
          'End date for published content (ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ)',
        ),
    }),
    execute: async ({
      query,
      numResults = 10,
      startPublishedDate,
      endPublishedDate,
    }) => {
      try {
        if (!process.env.EXA_API_KEY) {
          throw new Error('EXA_API_KEY environment variable is not set');
        }

        // Track web search usage with PostHog
        const posthog = PostHogClient();
        if (posthog) {
          posthog.capture({
            distinctId: profile.user_id,
            event: 'web_search_executed',
          });
        }

        // Prepare search options
        const searchOptions: ExaSearchOptions = {
          contents: {
            text: true,
          },
        };

        // Add numResults if specified
        if (numResults !== null) {
          searchOptions.numResults = numResults;
        }

        // Add date filters if specified
        if (startPublishedDate) {
          searchOptions.startPublishedDate = startPublishedDate;
        }
        if (endPublishedDate) {
          searchOptions.endPublishedDate = endPublishedDate;
        }

        // Perform the search
        const exa = new Exa(process.env.EXA_API_KEY);
        const result = await exa.searchAndContents(query, searchOptions);

        // Truncate text content to max 2048 tokens for each result
        const truncatedResults = result.results.map((item: any) => ({
          ...item,
          text: item.text
            ? truncateContentByTokens(item.text, 2048)
            : item.text,
        }));

        const searchCitations = truncatedResults
          .map((item: any) => item.url)
          .filter((url: string) => url);

        if (searchCitations.length > 0) {
          dataStream.writeData({ citations: searchCitations });
        }

        return truncatedResults;
      } catch (error) {
        console.error('Exa web search error:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        return `Error performing web search: ${errorMessage}`;
      }
    },
  });
};
