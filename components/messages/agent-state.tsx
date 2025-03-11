/**
 * Represents the different states an agent can be in during execution
 */
export enum AgentActionState {
  THINKING = "message_notify_user",
  TERMINAL = "terminal"
}

/**
 * Human-readable descriptions for each agent state
 */
export const AgentActionStateLabels: Record<AgentActionState, string> = {
  [AgentActionState.THINKING]: "Thinking...",
  [AgentActionState.TERMINAL]: "Executing command..."
}

/**
 * Color configurations for different agent states
 */
const AgentStateColors: Record<
  AgentActionState,
  { ping: string; base: string }
> = {
  [AgentActionState.THINKING]: {
    ping: "bg-blue-400",
    base: "bg-blue-500"
  },
  [AgentActionState.TERMINAL]: {
    ping: "bg-amber-400",
    base: "bg-amber-500"
  }
}

/**
 * Helper function to check if a value is a valid AgentActionState
 */
export const isValidAgentState = (
  state: string | null
): state is AgentActionState => {
  if (!state) return false
  return Object.values(AgentActionState).includes(state as AgentActionState)
}

export const AgentState = ({ state }: { state: AgentActionState | null }) => {
  // If state is null or invalid, don't render anything
  if (!isValidAgentState(state)) {
    return null
  }

  const text = AgentActionStateLabels[state]
  const colors = AgentStateColors[state]

  return (
    <div className="mt-2 flex items-center space-x-3 text-sm">
      <div className="relative flex size-3">
        <span
          className={`absolute inline-flex size-full animate-ping rounded-full ${colors.ping} opacity-75`}
        ></span>
        <span
          className={`relative inline-flex size-3 rounded-full ${colors.base}`}
        ></span>
      </div>
      <div>{text}</div>
    </div>
  )
}
