import type { BundledLanguage } from 'shiki/bundle/web';
export type AgentCodeBlockLang = BundledLanguage | 'text' | 'ansi';

export interface AgentSidebarItem {
  action: string;
  filePath: string;
  content: string;
  icon: React.ReactNode;
  lang?: AgentCodeBlockLang;
}

export interface AgentSidebarState {
  isOpen: boolean;
  item: AgentSidebarItem | null;
}
