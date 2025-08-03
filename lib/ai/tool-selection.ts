import { PluginID } from '@/types';

export interface ToolSelectionConfig {
  isPremiumUser: boolean;
  isLargeModel: boolean;
}

export interface ToolSelectionModelParams {
  isTemporaryChat: boolean;
}

/**
 * Determines which tools to use based on the selected plugin and user configuration
 */
export const getToolsForPlugin = (
  selectedPlugin: PluginID,
  config: ToolSelectionConfig,
  modelParams: ToolSelectionModelParams,
): string[] => {
  // Handle specific plugin selections first
  if (selectedPlugin === PluginID.IMAGE_GEN) {
    return ['image_gen'];
  }

  if (selectedPlugin === PluginID.TERMINAL) {
    return ['run_terminal_cmd', 'get_terminal_files'];
  }

  // Handle non-temporary chat (excluding web search plugin)
  if (!modelParams.isTemporaryChat && selectedPlugin !== PluginID.WEB_SEARCH) {
    const tools = ['webSearch', 'browser'];

    // Add image generation for premium users
    if (config.isPremiumUser) {
      tools.push('image_gen');
    }

    // Add terminal tools for large models
    // if (config.isLargeModel) {
    tools.push('run_terminal_cmd', 'get_terminal_files');
    // }

    return tools;
  }

  // Default tools for other cases
  return ['webSearch', 'browser'];
};
