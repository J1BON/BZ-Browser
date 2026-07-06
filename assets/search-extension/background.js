// MV2 background — ensures chrome_settings_overrides search provider registers on install.
chrome.runtime.onInstalled.addListener(() => {
  // no-op; overrides are applied from manifest
});
