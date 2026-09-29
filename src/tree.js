// The sidebar tree: one row per profile, clicking a row switches to it.

const vscode = require('vscode');
const { t } = require('./i18n');
const { SELF } = require('./constants');
const { getProfiles, activeProfileIndex, getCodexProfiles } = require('./profiles');
const { badgeTextPrefix, profileTooltip } = require('./badges');
const { healthOf, healthLabel, healthColor } = require('./health');
const { getPinnedId } = require('./pinning');
const { codexActiveId, codexTooltip, describe, getPinnedCodexId } = require('./codex');

class ProfilesProvider {
  constructor() {
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
  }
  refresh() { this._emitter.fire(); }
  getTreeItem(item) { return item; }
  getChildren() {
    const profiles = getProfiles();
    const active = activeProfileIndex();
    const pinnedId = getPinnedId();
    return profiles.map((p, i) => {
      const env = p.env || {};
      const isPinned = p.id && p.id === pinnedId;
      // Tree has a single icon slot — logos don't render here, only emoji
      // badges (text prefix) and the active/inactive marker.
      const status = healthOf(p);
      const it = new vscode.TreeItem(`${badgeTextPrefix(p.color)}${p.name}`);
      it.id = String(i);
      it.contextValue = 'claudeProfile';
      it.description = (isPinned ? '📌 ' : '') + (env.ANTHROPIC_BASE_URL || t('nativeSubscriptionPlain'));
      // shape marks active/inactive; color (when known) marks health
      it.iconPath = new vscode.ThemeIcon(
        i === active ? 'pass-filled' : 'circle-large-outline',
        healthColor(status)
      );
      const extra = [];
      if (isPinned) extra.push('', t('tip_pinned'));
      if (status !== 'unknown') extra.push('', t('tip_status', { status: healthLabel(status) }));
      it.tooltip = profileTooltip(p, extra.length ? extra : undefined);
      // Clicking the row switches to this provider (with fallback when enabled),
      // same as the old inline ▶ button. The circle marks the active one.
      it.command = { command: `${SELF}.switchTo`, title: 'Switch to this provider', arguments: [i] };
      return it;
    });
  }
}

// The Codex view: one row per Codex profile; clicking a row switches Codex
// (config.toml) to it. The filled circle marks the provider config.toml uses.
class CodexProfilesProvider {
  constructor() {
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
  }
  refresh() { this._emitter.fire(); }
  getTreeItem(item) { return item; }
  getChildren() {
    const active = codexActiveId();
    return getCodexProfiles().map((p) => {
      const it = new vscode.TreeItem(`${badgeTextPrefix(p.color)}${p.name}`);
      it.id = `codex-${p.id}`;
      it.profileId = p.id; // command argument (see findCodex)
      it.contextValue = 'codexProfile';
      const pinned = p.id === getPinnedCodexId();
      it.description = (pinned ? '📌 ' : '') + describe(p);
      // shape marks active/inactive; color (when checked) marks health
      it.iconPath = new vscode.ThemeIcon(p.id === active ? 'pass-filled' : 'circle-large-outline', healthColor(healthOf(p)));
      it.tooltip = codexTooltip(p, [
        ...(pinned ? ['', t('tip_pinned')] : []),
        '',
        p.id === active ? t('tip_codexRestart') : t('tip_clickToSwitch'),
      ]);
      it.command = { command: `${SELF}.switchCodexTo`, title: 'Switch Codex to this provider', arguments: [p.id] };
      return it;
    });
  }
}

module.exports = { ProfilesProvider, CodexProfilesProvider };
