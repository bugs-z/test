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
    id: 2,
    name: 'Terminal',
    value: PluginID.TERMINAL,
    categories: ['utils'],
    icon: 'https://cdn-icons-png.flaticon.com/128/5576/5576886.png',
    invertInDarkMode: true,
    description:
      'Execute terminal commands, install and configure tools, and perform advanced pentesting tasks',
    githubRepoUrl: pluginUrls.PENTESTGPT,
    isInstalled: false,
    isPremium: true,
    createdAt: '2024-10-04',
    starters: [],
  },
];
