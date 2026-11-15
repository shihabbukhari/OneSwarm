export const REWARD_NOTICE =
  'Rewards are promises by the poster, not guaranteed by OneSwarm. OneSwarm never holds or sends money.';

export const DEFAULT_PROTECTED = [
  'mission.yaml',
  '.github/**',
  'checker/**',
  'tests/**',
  'src/index.js',
  'src/html.js',
  'package.json',
  'README.md',
  'LICENSE',
];

export const LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MPL-2.0',
  '0BSD',
  'Unlicense',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
];

export const TIP_FIELDS = [
  { key: 'tip_patreon', hosts: ['patreon.com', 'www.patreon.com'] },
  { key: 'tip_github', hosts: ['github.com', 'www.github.com'], sponsors: true },
  { key: 'tip_kofi', hosts: ['ko-fi.com', 'www.ko-fi.com'] },
  { key: 'tip_bmc', hosts: ['buymeacoffee.com', 'www.buymeacoffee.com'] },
];
