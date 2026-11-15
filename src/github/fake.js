import { randomHex, httpError } from '../util.js';

export class FakeGitHub {
  constructor() {
    this.mode = 'fake';
    this.repos = new Map();
    this.users = new Map();
  }

  key(owner, repo) {
    return `${String(owner).toLowerCase()}/${String(repo).toLowerCase()}`;
  }

  must(owner, repo) {
    const record = this.repos.get(this.key(owner, repo));
    if (!record) throw httpError(400, 'GitHub repo not found.');
    return record;
  }

  seedRepo({ owner, repo, files, isPrivate = false }) {
    const tree = {};
    for (const [file, content] of Object.entries(files)) tree[file] = content;
    const record = {
      owner: owner.toLowerCase(),
      repo: repo.toLowerCase(),
      private: isPrivate,
      defaultBranch: 'main',
      tree,
      pulls: [],
      checks: [],
      comments: [],
    };
    this.repos.set(this.key(owner, repo), record);
    return record;
  }

  tree(owner, repo) {
    return { ...this.must(owner, repo).tree };
  }

  async getRepo(owner, repo) {
    const record = this.must(owner, repo);
    return {
      owner: record.owner,
      repo: record.repo,
      private: record.private,
      defaultBranch: record.defaultBranch,
    };
  }

  async getFile(owner, repo, filePath) {
    const record = this.must(owner, repo);
    if (record.private) throw httpError(400, 'The repository is private.');
    if (!Object.prototype.hasOwnProperty.call(record.tree, filePath)) {
      throw httpError(400, 'File not found.');
    }
    return { path: filePath, content: record.tree[filePath] };
  }

  async openPullRequest({ owner, repo, title, files }) {
    const record = this.must(owner, repo);
    const changed = [];
    for (const file of files) {
      const before = record.tree[file.filename];
      if (before === file.content) continue;
      changed.push({
        filename: file.filename,
        previous_filename: '',
        status: before === undefined ? 'added' : 'modified',
        content: file.content,
      });
    }
    const number = record.pulls.length + 1;
    const pull = {
      number,
      title: title || `Piece update ${number}`,
      headSha: randomHex(20),
      merged: false,
      state: 'open',
      files: changed,
      url: `https://github.com/${record.owner}/${record.repo}/pull/${number}`,
    };
    record.pulls.push(pull);
    return { number: pull.number, headSha: pull.headSha, url: pull.url, merged: false, state: 'open' };
  }

  pull(owner, repo, number) {
    const record = this.must(owner, repo);
    const found = record.pulls.find((item) => item.number === Number(number));
    if (!found) throw httpError(400, 'Pull request not found.');
    return found;
  }

  async getPull(owner, repo, number) {
    const pull = this.pull(owner, repo, number);
    return {
      number: pull.number,
      headSha: pull.headSha,
      merged: pull.merged,
      state: pull.state,
      url: pull.url,
    };
  }

  async listPullFiles(owner, repo, number) {
    return this.pull(owner, repo, number).files.map((file) => ({
      filename: file.filename,
      status: file.status,
      previous_filename: file.previous_filename || '',
    }));
  }

  async updatePullFiles({ owner, repo, number, files }) {
    const pull = this.pull(owner, repo, number);
    if (pull.merged) throw httpError(400, 'Pull request is already merged.');
    pull.files = files.map((file) => ({
      filename: file.filename,
      status: file.status || 'modified',
      previous_filename: file.previous_filename || '',
      content: file.content ?? '',
    }));
    pull.headSha = randomHex(20);
    return { number: pull.number, headSha: pull.headSha, url: pull.url };
  }

  async setCheck({ owner, repo, sha, name, path, conclusion, summary }) {
    const record = this.must(owner, repo);
    record.checks.push({
      sha,
      name,
      path,
      conclusion,
      summary: summary || '',
    });
  }

  async listCheckRuns(owner, repo, sha) {
    const record = this.must(owner, repo);
    return record.checks
      .filter((check) => check.sha === sha)
      .map((check) => ({
        name: check.name,
        path: check.path,
        conclusion: check.conclusion,
        headSha: check.sha,
        summary: check.summary,
      }));
  }

  async mergePull({ owner, repo, number, sha }) {
    const record = this.must(owner, repo);
    const pull = this.pull(owner, repo, number);
    if (pull.merged) return { merged: true, already: true };
    if (sha && pull.headSha !== sha) throw httpError(409, 'Pull request head changed.');
    for (const file of pull.files) {
      if (file.status === 'removed') delete record.tree[file.filename];
      else record.tree[file.filename] = file.content;
    }
    pull.merged = true;
    pull.state = 'closed';
    return { merged: true, already: false };
  }

  async closePull({ owner, repo, number }) {
    const pull = this.pull(owner, repo, number);
    pull.state = 'closed';
  }

  async comment({ owner, repo, number, body }) {
    const record = this.must(owner, repo);
    record.comments.push({ number: Number(number), body });
  }
}
