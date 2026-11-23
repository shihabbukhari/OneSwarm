import { FakeGitHub } from './fake.js';
import { OffGitHub } from './off.js';
import { RealGitHub } from './real.js';

export function createGitHub(config) {
  if (config.githubMode === 'fake') return new FakeGitHub();
  if (config.githubMode === 'off') return new OffGitHub();
  return new RealGitHub(config);
}
