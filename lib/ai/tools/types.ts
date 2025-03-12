import { Sandbox } from "@e2b/code-interpreter"
import { PluginID } from "@/types/plugins"

/**
 * Interface for tools that need access to the data stream
 */
export interface ToolContext {
  dataStream: any
  sandbox?: Sandbox | null
  userID: string
  persistentSandbox?: boolean
  selectedPlugin?: PluginID
  terminalTemplate?: string
  setSandbox?: (sandbox: Sandbox) => void
  setPersistentSandbox?: (isPersistent: boolean) => void
}

// Constants for sandbox creation
export const TEMPORARY_SANDBOX_TEMPLATE = "temporary-sandbox"
export const PERSISTENT_SANDBOX_TEMPLATE = "persistent-sandbox"
export const BASH_SANDBOX_TIMEOUT = 15 * 60 * 1000

// Plugin command mapping
export const PLUGIN_COMMAND_MAP: Partial<Record<PluginID, string>> = {
  [PluginID.SQLI_EXPLOITER]: "sqlmap",
  [PluginID.SSL_SCANNER]: "testssl.sh",
  [PluginID.DNS_SCANNER]: "dnsrecon",
  [PluginID.PORT_SCANNER]: "naabu",
  [PluginID.WAF_DETECTOR]: "wafw00f",
  [PluginID.WHOIS_LOOKUP]: "whois",
  [PluginID.SUBDOMAIN_FINDER]: "subfinder",
  [PluginID.CVE_MAP]: "cvemap",
  [PluginID.WORDPRESS_SCANNER]: "wpscan",
  [PluginID.XSS_EXPLOITER]: "dalfox"
}
