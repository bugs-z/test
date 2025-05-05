export interface AgentSidebarItem {
  action: string;
  filePath: string;
  content: string;
  icon: React.ReactNode;
}

export interface AgentSidebarState {
  isOpen: boolean;
  item: AgentSidebarItem | null;
}
