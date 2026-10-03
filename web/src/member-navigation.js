import { esc } from './ui.js';

export function memberShell(content, { title } = {}) {
  const heading = title === undefined || title === null || title === '' ? '' : '<h1 class="member-shell-title">' + esc(title) + '</h1>';
  return '<div class="member-shell"><div class="member-shell-content">' + heading + String(content ?? '') + '</div></div>';
}
