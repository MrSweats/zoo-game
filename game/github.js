'use strict';

// Minimal GitHub REST helpers — no dependencies, Node 18+ global fetch.

const API = process.env.GITHUB_API_URL || 'https://api.github.com';
const REPO = process.env.GITHUB_REPOSITORY; // "owner/repo"
const TOKEN = process.env.GITHUB_TOKEN;

async function gh(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function postComment(issueNumber, body) {
  return gh('POST', `/repos/${REPO}/issues/${issueNumber}/comments`, { body });
}

async function createIssue(title, body) {
  return gh('POST', `/repos/${REPO}/issues`, { title, body });
}

module.exports = { postComment, createIssue };
