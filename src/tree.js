// The sidebar tree: one row per profile, clicking a row switches to it.

const vscode = require('vscode');
const { t } = require('./i18n');
const { SELF } = require('./constants');
const { getProfiles, activeProfileIndex } = require('./profiles');
const { badgeTextPrefix, profileTooltip } = require('./badges');
const { healthOf, healthLabel, healthColor } = require('./health');
const { getPinnedId } = require('./pinning');

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

module.exports = { ProfilesProvider };
