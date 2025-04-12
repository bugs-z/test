import { PluginID, pluginUrls, type PluginSummary } from '@/types/plugins';

export const availablePlugins: PluginSummary[] = [
  {
    id: 0,
    name: 'Standard Chat',
    value: PluginID.NONE,
    categories: [],
    isInstalled: false,
    isPremium: false,
    createdAt: '2023-01-01',
    starters: [
      // {
      //   title: "Explain How To",
      //   description: "identify and exploit XSS vulnerabilities",
      //   chatMessage: "Explain how to identify and exploit XSS vulnerabilities."
      // },
      // {
      //   title: "Explain How To",
      //   description: "identify information disclosure vulnerabilities",
      //   chatMessage:
      //     "Explain how to identify information disclosure vulnerabilities."
      // },
      // {
      //   title: "Provide General Methodology",
      //   description: "for file upload vulnerabilities",
      //   chatMessage:
      //     "Provide General Methodology for file upload vulnerabilities."
      // },
      // {
      //   title: "Provide Techniques",
      //   description: "to bypass rate limit",
      //   chatMessage: "Provide techniques to bypass rate limit."
      // }
    ],
  },
  {
    id: 1,
    name: 'Enhanced Search',
    value: PluginID.ENHANCED_SEARCH,
    categories: ['utils'],
    icon: 'https://cdn-icons-png.flaticon.com/128/11751/11751689.png',
    invertInDarkMode: true,
    description:
      'Enhances the model with curated PentestGPT knowledge, including popular guides, techniques, and tools related to pentesting, bug bounty, and cybersecurity (RAG)',
    githubRepoUrl: pluginUrls.PENTESTGPT,
    isInstalled: false,
    isPremium: false,
    createdAt: '2024-07-26',
    starters: [],
  },
  {
    id: 2,
    name: 'Terminal',
    value: PluginID.TERMINAL,
    categories: ['utils'],
    icon: 'https://cdn-icons-png.flaticon.com/128/5576/5576886.png',
    invertInDarkMode: true,
    description:
      'Execute Bash commands, install and configure tools, and perform advanced pentesting tasks',
    githubRepoUrl: pluginUrls.PENTESTGPT,
    isInstalled: false,
    isPremium: true,
    createdAt: '2024-10-04',
    starters: [],
  },
  // {
  //   id: 9,
  //   name: 'CVE Map',
  //   value: PluginID.CVE_MAP,
  //   categories: ['utils'],
  //   icon: 'https://cdn-icons-png.flaticon.com/128/4337/4337922.png',
  //   invertInDarkMode: true,
  //   description: 'Navigate the CVE jungle with ease',
  //   githubRepoUrl: pluginUrls.CVE_MAP,
  //   isInstalled: false,
  //   isPremium: false,
  //   createdAt: '2024-03-13',
  //   starters: [
  //     {
  //       title: 'Provide Me With',
  //       description: 'the latest CVEs with the severity of critical',
  //       chatMessage:
  //         'Provide me with the latest CVEs with the severity of critical.',
  //     },
  //     {
  //       title: 'Provide Information About',
  //       description: 'CVE-2024-23897 (critical LFI in Jenkins)',
  //       chatMessage:
  //         'Provide information about CVE-2024-23897 (critical LFI in Jenkins).',
  //     },
  //     {
  //       title: 'CVEMap Help',
  //       description: 'How does the CVEMap plugin work?',
  //       chatMessage: 'How does the CVEMap plugin work?',
  //     },
  //   ],
  // },
  // Recon tools id 10-19
  {
    id: 10,
    name: 'Subdomain Finder',
    categories: ['recon'],
    value: PluginID.SUBDOMAIN_FINDER,
    icon: 'https://cdn-icons-png.flaticon.com/128/3138/3138297.png',
    invertInDarkMode: true,
    description: 'Discover subdomains of a domain',
    githubRepoUrl: pluginUrls.SUBDOMAIN_FINDER,
    isInstalled: false,
    isPremium: false,
    createdAt: '2024-02-27',
    starters: [
      {
        title: 'Start Subdomain Discovery',
        description: 'for bugcrowd.com',
        chatMessage: 'Start subdomain discovery for bugcrowd.com',
      },
      {
        title: 'Scan For Active-Only',
        description: 'subdomains of hackthebox.com',
        chatMessage: 'Scan for active-only subdomains of hackthebox.com',
      },
      {
        title: 'Scan For Subdomains',
        description: 'of intigriti.com including their host IPs',
        chatMessage:
          'Scan for subdomains of intigriti.com including their host IPs.',
      },
      {
        title: 'Subfinder Help',
        description: 'How does the Subfinder plugin work?',
        chatMessage: 'How does the Subfinder plugin work?',
      },
    ],
  },
  {
    id: 11,
    name: 'Port Scanner',
    value: PluginID.PORT_SCANNER,
    categories: ['recon'],
    icon: 'https://cdn-icons-png.flaticon.com/128/7338/7338907.png',
    invertInDarkMode: true,
    description: 'Detect open ports and fingerprint services',
    githubRepoUrl: pluginUrls.PORT_SCANNER,
    isInstalled: false,
    isPremium: true,
    createdAt: '2024-06-29',
    starters: [
      {
        title: 'Perform Light Port Scan',
        description: 'on hackerone.com (top 100 ports)',
        chatMessage: 'Perform a light port scan on hackerone.com',
      },
      {
        title: 'Scan Specific Ports',
        description: '80, 443, 8080 on hackerone.com and subdomains',
        chatMessage:
          'Scan ports 80, 443, and 8080 on hackerone.com and its subdomains: api.hackerone.com, docs.hackerone.com, resources.hackerone.com, gslink.hackerone.com',
      },
      {
        title: 'Conduct Deep Port Scan',
        description: 'on hackerone.com (top 1000 ports)',
        chatMessage: 'Conduct a deep port scan on hackerone.com',
      },
      {
        title: 'Port Scanner Help',
        description: 'How does the Port Scanner plugin work?',
        chatMessage: 'How does the Port Scanner plugin work?',
      },
    ],
  },
  {
    id: 12,
    name: 'WAF Detector',
    value: PluginID.WAF_DETECTOR,
    categories: ['recon'],
    icon: 'https://cdn-icons-png.flaticon.com/128/6993/6993518.png',
    invertInDarkMode: true,
    description: 'Fingerprint the Web Application Firewall behind target app',
    githubRepoUrl: pluginUrls.WAF_DETECTOR,
    isInstalled: false,
    isPremium: false,
    createdAt: '2024-08-03',
    starters: [
      {
        title: 'Detect the WAF',
        description: 'used by hackerone.com',
        chatMessage: 'Detect the WAF used by hackerone.com',
      },
      {
        title: 'WAF Detector Help',
        description: 'How does the WAF Detector plugin work?',
        chatMessage: 'How does the WAF Detector plugin work?',
      },
    ],
  },
  {
    id: 13,
    name: 'Whois Lookup',
    categories: ['recon'],
    value: PluginID.WHOIS_LOOKUP,
    icon: 'https://cdn-icons-png.flaticon.com/128/15226/15226100.png',
    invertInDarkMode: true,
    description:
      'Retrieve ownership and registration details for domains and IP addresses',
    githubRepoUrl: pluginUrls.WHOIS_LOOKUP,
    isInstalled: false,
    isPremium: false,
    createdAt: '2024-07-28',
    starters: [
      {
        title: 'Domain Whois Lookup',
        description: 'for owasp.org',
        chatMessage: 'Perform a Whois lookup for owasp.org',
      },
      {
        title: 'Check Registration Info',
        description: 'of hackerone.com',
        chatMessage: 'Check the registration information for hackerone.com',
      },
      {
        title: 'IP Address Whois Lookup',
        description: 'for 8.8.8.8',
        chatMessage: 'Perform a Whois lookup for IP address 8.8.8.8',
      },
      {
        title: 'Whois Lookup Help',
        description: 'How does the Whois Lookup plugin work?',
        chatMessage: 'How does the Whois Lookup plugin work?',
      },
    ],
  },
  {
    id: 99,
    name: 'Plugins Store',
    categories: [],
    value: PluginID.PLUGINS_STORE,
    isInstalled: false,
    isPremium: false,
    createdAt: '2023-01-01',
    starters: [],
  },
];
