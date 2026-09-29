#!/usr/bin/env node
// Terminal front-end of Claude Provider Switcher — see cli/main.js.
require('../cli/main')
  .main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
