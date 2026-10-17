#!/usr/bin/env node

const { AntigravityLatexPatcher } = require('../src/index');

function printHelp() {
  console.log(`
======================================================================
     ANTIGRAVITY LATEX / KATEX CHAT PATCHER CLI (v1.0.0)
======================================================================

Description:
  Automated tool to install and uninstall mathematical typesetting
  support (LaTeX / KaTeX) directly into the Antigravity IDE chat panel.

Usage:
  antigravity-latex <command> [options]
  node bin/cli.js <command> [options]

Commands:
  status       Check current patch and backup status
  install      Install LaTeX patch into Antigravity Workbench
  uninstall    Uninstall patch and restore 100% clean original files

Options:
  --path <dir> Specify custom Antigravity IDE installation directory
  --help, -h   Show help and usage information

Examples:
  node bin/cli.js status
  node bin/cli.js install
  node bin/cli.js uninstall
======================================================================
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let command = 'status';
  let customPath = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      return { command: 'help', customPath };
    }
    if (arg === '--path' && i + 1 < args.length) {
      customPath = args[++i];
    } else if (!arg.startsWith('-')) {
      command = arg;
    }
  }

  return { command, customPath };
}

function main() {
  const { command, customPath } = parseArgs();

  if (command === 'help') {
    printHelp();
    return;
  }

  const patcher = new AntigravityLatexPatcher(customPath);

  switch (command) {
    case 'status': {
      console.log('\n--- ANTIGRAVITY LATEX PATCH STATUS ---');
      const st = patcher.status();
      if (!st.found) {
        console.error('❌ ' + st.message);
        process.exit(1);
      }
      console.log('📁 IDE Location   :', st.paths.rootDir);
      console.log('📄 Workbench File :', st.paths.workbenchHtml);
      console.log('💾 Backup File    :', st.hasBackup ? 'Present (.bak)' : 'None');
      console.log('⚡ Patch State    :', st.message);
      console.log('--------------------------------------\n');
      break;
    }

    case 'install': {
      console.log('\n--- INSTALLING LATEX PATCH INTO WORKBENCH ---');
      try {
        const result = patcher.install(true);
        console.log('✓ ' + result.message);
        console.log('👉 Tip: Press Ctrl+Shift+P -> run "Developer: Reload Window" (or restart IDE).');
        console.log('---------------------------------------------\n');
      } catch (err) {
        console.error('❌ Error applying patch:', err.message);
        process.exit(1);
      }
      break;
    }

    case 'uninstall': {
      console.log('\n--- UNINSTALLING LATEX PATCH (RESTORING ORIGINAL) ---');
      try {
        const result = patcher.uninstall();
        console.log('✓ ' + result.message);
        console.log('👉 Tip: Reload Window to complete.');
        console.log('-----------------------------------------------------\n');
      } catch (err) {
        console.error('❌ Error removing patch:', err.message);
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Unknown command: "${command}"`);
      printHelp();
      process.exit(1);
  }
}

main();
