import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
  useEffect,
} from 'react';
import type { AgentSidebarState } from '@/types/agent';

interface AgentSidebarContextType {
  agentSidebar: AgentSidebarState;
  setAgentSidebar: React.Dispatch<React.SetStateAction<AgentSidebarState>>;
  resetAgentSidebar: () => void;
}

const AgentSidebarContext = createContext<AgentSidebarContextType | undefined>(
  undefined,
);

export const AgentSidebarProvider = ({ children }: { children: ReactNode }) => {
  const [agentSidebar, setAgentSidebar] = useState<AgentSidebarState>({
    isOpen: false,
    item: null,
  });

  const resetAgentSidebar = () => {
    setAgentSidebar({ isOpen: false, item: null });
  };

  return (
    <AgentSidebarContext.Provider
      value={{ agentSidebar, setAgentSidebar, resetAgentSidebar }}
    >
      {children}
    </AgentSidebarContext.Provider>
  );
};

export const useAgentSidebar = () => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const context = useContext(AgentSidebarContext);

  // If we're on the server or context is not available, return fallback
  if (!isClient || !context) {
    return {
      agentSidebar: { isOpen: false, item: null },
      setAgentSidebar: () => {},
      resetAgentSidebar: () => {},
    };
  }

  return context;
};
