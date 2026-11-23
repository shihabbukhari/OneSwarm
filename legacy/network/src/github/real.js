import crypto from 'node:crypto';
import { httpError } from '../util.js';

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function appJwt(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const data = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  const signature = signer.sign(privateKey).toString('base64url');
  return `${data}.${signature}`;
}

export class RealGitHub {
  constructor(config) {
    this.mode = 'real';
    this.config = config;
    this.tokens = new Map();
  }

  async request(url, { token, method = 'GET', body, accept } = {}) {
    const headers = {
      Accept: accept || 'application/vnd.github+json',
      'User-Agent': 'OneSwarm',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!response.ok) {
      const message = json?.message || `GitHub request failed (${response.status})`;
      throw httpError(response.status === 404 ? 400 : 502, message);
    }
    return json;
  }

  async installationToken(installationId) {
    if (!installationId) throw httpError(400, 'Install the OneSwarm GitHub App on this repo.');
    const cached = this.tokens.get(String(installationId));
    if (cached && cached.exp > Date.now() + 60_000) return cached.token;
    if (!this.config.githubAppId || !this.config.githubPrivateKey) {
      throw httpError(500, 'The GitHub App is not configured.');
    }
    const jwt = appJwt(this.config.githubAppId, this.config.githubPrivateKey);
    const json = await this.request(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      { token: jwt, method: 'POST' },
    );
    const exp = Date.parse(json.expires_at || '') || Date.now() + 300_000;
    this.tokens.set(String(installationId), { token: json.token, exp });
    return json.token;
  }

  async getRepo(owner, repo, installationId) {
    const token = installationId ? await this.installationToken(installationId) : '';
    const json = await this.request(`https://api.github.com/repos/${owner}/${repo}`, { token });
    return {
      owner: json.owner.login.toLowerCase(),
      repo: json.name.toLowerCase(),
      private: Boolean(json.private),
      defaultBranch: json.default_branch || 'main',
    };
  }

  async getFile(owner, repo, filePath, ref = '', installationId = '') {
    const token = installationId ? await this.installationToken(installationId) : '';
    const url = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`);
    if (ref) url.searchParams.set('ref', ref);
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.raw',
        'User-Agent': 'OneSwarm',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw httpError(400, 'File not found.');
    return { path: filePath, content: await response.text() };
  }

  async getPull(owner, repo, number, installationId) {
    const token = await this.installationToken(installationId);
    const json = await this.request(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, { token });
    return {
      number: json.number,
      headSha: json.head.sha,
      merged: Boolean(json.merged),
      state: json.state,
      url: json.html_url,
    };
  }

  async listPullFiles(owner, repo, number, installationId) {
    const token = await this.installationToken(installationId);
    const files = [];
    for (let page = 1; page <= 3; page += 1) {
      const batch = await this.request(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
        { token },
      );
      for (const file of batch) {
        files.push({
          filename: file.filename,
          status: file.status,
          previous_filename: file.previous_filename || '',
        });
      }
      if (!Array.isArray(batch) || batch.length < 100) break;
      if (page === 3 && batch.length === 100) {
        throw httpError(400, 'Pull request changes too many files.');
      }
    }
    return files;
  }

  async listCheckRuns(owner, repo, sha, installationId) {
    const token = await this.installationToken(installationId);
    const json = await this.request(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`,
      { token },
    );
    return (json.check_runs || []).map((run) => ({
      name: run.name,
      path: '',
      conclusion: run.conclusion || '',
      headSha: sha,
      summary: run.output?.summary || '',
    }));
  }

  async mergePull({ owner, repo, number, sha, installationId, title }) {
    const token = await this.installationToken(installationId);
    const json = await this.request(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}/merge`, {
      token,
      method: 'PUT',
      body: { sha, merge_method: 'squash', commit_title: title || 'OneSwarm checked piece' },
    });
    return { merged: Boolean(json.merged), already: false };
  }

  async closePull({ owner, repo, number, installationId }) {
    const token = await this.installationToken(installationId);
    await this.request(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, {
      token,
      method: 'PATCH',
      body: { state: 'closed' },
    });
  }

  async comment({ owner, repo, number, body, installationId }) {
    const token = await this.installationToken(installationId);
    await this.request(`https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`, {
      token,
      method: 'POST',
      body: { body },
    });
  }

  async exchangeOAuth(code) {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'OneSwarm' },
      body: JSON.stringify({
        client_id: this.config.githubClientId,
        client_secret: this.config.githubClientSecret,
        code,
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.access_token) throw httpError(401, 'GitHub login failed.');
    return json.access_token;
  }

  async getUser(accessToken) {
    const json = await this.request('https://api.github.com/user', { token: accessToken });
    return {
      id: String(json.id),
      login: json.login,
      name: json.name || json.login,
      avatar: json.avatar_url || '',
    };
  }
}
