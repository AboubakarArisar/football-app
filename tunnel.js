#!/usr/bin/env node

/**
 * Standalone tunnel script
 * Run this separately if you want to start tunneling after the server is already running
 * Usage: node tunnel.js
 */

// Load environment variables
require('dotenv').config();

const localtunnel = require('localtunnel');
const PORT = process.env.PORT || 3000;
const SUBDOMAIN = process.env.TUNNEL_SUBDOMAIN;

function createTunnel() {
  const options = { port: PORT };
  if (SUBDOMAIN) {
    options.subdomain = SUBDOMAIN;
  }

  localtunnel(options)
    .then(tunnel => {
      console.log('\n╔═══════════════════════════════════════════════════════╗');
      console.log('║          🌐 Tunnel Created Successfully! 🌐          ║');
      console.log('╚═══════════════════════════════════════════════════════╝\n');
      console.log(`📍 Public URLs:`);
      console.log(`   Admin:  ${tunnel.url}/admin`);
      console.log(`   Client: ${tunnel.url}/\n`);
      console.log(`⚠️  Keep this process running to maintain the tunnel`);
      console.log(`   Press Ctrl+C to close the tunnel\n`);

      tunnel.on('close', () => {
        console.log('\n⚠️  Tunnel closed. Reconnecting in 2 seconds...\n');
        setTimeout(createTunnel, 2000);
      });

      tunnel.on('error', (err) => {
        console.error('❌ Tunnel error:', err.message);
      });
    })
    .catch(err => {
      console.error('❌ Failed to create tunnel:', err.message);
      if (SUBDOMAIN) {
        console.log('\n💡 Subdomain might be taken. Trying without subdomain...\n');
        // Retry without subdomain
        localtunnel({ port: PORT })
          .then(tunnel => {
            console.log(`🌐 Tunnel Active:`);
            console.log(`   Admin:  ${tunnel.url}/admin`);
            console.log(`   Client: ${tunnel.url}/\n`);
          })
          .catch(err => {
            console.error('❌ Tunnel failed:', err.message);
            process.exit(1);
          });
      } else {
        console.log('\n💡 Make sure the server is running on port', PORT);
        process.exit(1);
      }
    });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Closing tunnel...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Closing tunnel...');
  process.exit(0);
});

createTunnel();
