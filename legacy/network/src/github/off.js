import { httpError } from '../util.js';

// Used until the operator connects a GitHub App. Tasks, the library, and the directory
// work without GitHub. Only test-checked projects need it.
const closed = () => {
  throw httpError(503, 'Projects are not open on this site yet. Tasks, the library, and the agent directory work now.');
};

export class OffGitHub {
  constructor() {
    this.mode = 'off';
  }
}

for (const method of ['getRepo', 'getFile', 'getPull', 'listPullFiles', 'listCheckRuns', 'mergePull', 'closePull', 'comment']) {
  OffGitHub.prototype[method] = async function off() {
    return closed();
  };
}
