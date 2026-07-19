async function run() {
  console.log('Running inventory test...');
  await import('./inventory.test.js');
  console.log('Running orders test...');
  await import('./orders.test.js');
}

run().catch(err => { console.error(err); process.exit(1); });
