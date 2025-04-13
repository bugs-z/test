import { PluginID } from '@/types/plugins';

export const getPluginPrompt = (pluginID: PluginID): string => {
  switch (pluginID) {
    case PluginID.WAF_DETECTOR:
      return `
The user has selected the WAF Detector plugin, which uses the wafw00f tool in the terminal. This tool fingerprints Web Application Firewalls (WAFs) behind target applications. Remember:
1. Focus on identifying and fingerprinting WAFs protecting the target web application.
2. Provide wafw00f-specific options and explanations for effective WAF detection.
`;
    case PluginID.WHOIS_LOOKUP:
      return `
The user has selected the WHOIS Lookup plugin, which uses the whois tool in the terminal. This tool retrieves domain registration information and network details. Remember:
1. Focus on gathering domain ownership, registration dates, name servers, and other relevant information.
2. Provide whois-specific options and explanations for effective domain information retrieval.
`;
    case PluginID.SUBDOMAIN_FINDER:
      return `
The user has selected the Subdomain Finder plugin, which uses the subfinder tool in the terminal. This tool discovers subdomains of a given domain. Remember:
1. Focus on efficiently enumerating subdomains of the target domain.
2. Provide subfinder-specific options and explanations for effective subdomain discovery.
`;
    case PluginID.CVE_MAP:
      return `
The user has selected the CVEMap plugin, which uses the cvemap tool in the terminal. This tool helps navigate and analyze Common Vulnerabilities and Exposures (CVEs). Remember:
1. Focus on efficiently searching, filtering, and analyzing CVEs.
2. Provide cvemap-specific options and explanations for effective CVE exploration.
3. Always use the '-json' flag by default to provide more detailed information about CVEs
4. Selective Flag Use: Carefully select flags that are directly pertinent to the task. Available flags:
- -id string[]: Specify CVE ID(s) for targeted searching. (e.g., "CVE-2023-0001")
- -cwe-id string[]: Filter CVEs by CWE ID(s) for category-specific searching. (e.g., "CWE-79")
- -vendor string[]: List CVEs associated with specific vendor(s). (e.g., "microsoft")
- -product string[]: Specify product(s) to filter CVEs accordingly. (e.g., "windows 10")
- -severity string[]: Filter CVEs by given severity level(s). Options: "low", "medium", "high", "critical"
- -cvss-score string[]: Filter CVEs by given CVSS score range. (e.g., "> 7")
- -cpe string: Specify a CPE URI to filter CVEs related to a particular product and version. (e.g., "cpe:/a:microsoft:windows_10")
- -epss-score string: Filter CVEs by EPSS score. (e.g., ">=0.01")
- -epss-percentile string[]: Filter CVEs by given EPSS percentile. (e.g., "> 90")
- -age string: Filter CVEs published within a specified age in days. (e.g., "> 365", "360")
- -assignee string[]: List CVEs for a given publisher assignee. (e.g., "cve@mitre.org")
- -vstatus value: Filter CVEs by given vulnerability status in CLI output. Supported values: new, confirmed, unconfirmed, modified, rejected, unknown (e.g., "confirmed")
- -limit int: Limit the number of results to display (specify a different number as needed).
5. Do not use the search flag.
6. Always limit the number of results to 10 by default.
`;

    default:
      return '';
  }
};
