import { FakeGitHub } from './fake.js';
import { RealGitHub } from './real.js';

export function createGitHub(config) {
  if (config.githubMode === 'fake') return new FakeGitHub();
  return new RealGitHub(config);
}
