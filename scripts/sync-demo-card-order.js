#!/usr/bin/env node
/**
 * Sync DEMO_CARD_ORDER in WelcomePanel.tsx with the demo user's actual card order.
 * Run before build to ensure the placeholder matches production.
 *
 * Usage: node scripts/sync-demo-card-order.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_URL = 'https://lumna.co/api/preferences/demo-card-order';
const WELCOME_PANEL_PATH = path.join(__dirname, '../frontend/src/apps/investing/panels/WelcomePanel.tsx');

function fetchCardOrder() {
  return new Promise((resolve, reject) => {
    https.get(API_URL, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.order);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function formatCardOrder(order) {
  // Format as TypeScript array with 3 items per line
  const lines = [];
  for (let i = 0; i < order.length; i += 3) {
    const row = order.slice(i, i + 3).map(item =>
      item === null ? 'null' : `'${item}'`
    );
    lines.push('  ' + row.join(', '));
  }
  return '[\n' + lines.join(',\n') + '\n]';
}

async function main() {
  console.log('Fetching demo card order from production...');

  let order;
  try {
    order = await fetchCardOrder();
  } catch (e) {
    console.error(`Failed to fetch card order: ${e.message}`);
    console.log('Skipping sync (keeping existing DEMO_CARD_ORDER)');
    process.exit(0); // Don't fail the build
  }

  if (!order || !Array.isArray(order)) {
    console.error('Invalid card order received');
    process.exit(0);
  }

  console.log('Fetched order:', order);

  // Read the file
  let content = fs.readFileSync(WELCOME_PANEL_PATH, 'utf8');

  // Find and replace DEMO_CARD_ORDER
  const regex = /const DEMO_CARD_ORDER: GridSlot\[\] = \[[\s\S]*?\];/;
  const newValue = `const DEMO_CARD_ORDER: GridSlot[] = ${formatCardOrder(order)};`;

  if (!regex.test(content)) {
    console.error('Could not find DEMO_CARD_ORDER in WelcomePanel.tsx');
    process.exit(1);
  }

  const newContent = content.replace(regex, newValue);

  if (newContent === content) {
    console.log('DEMO_CARD_ORDER is already up to date');
  } else {
    fs.writeFileSync(WELCOME_PANEL_PATH, newContent);
    console.log('Updated DEMO_CARD_ORDER in WelcomePanel.tsx');
  }
}

main();
