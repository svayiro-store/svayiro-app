// Simple integration test for inventory endpoints
async function run() {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  // 1. Authenticate (OTP)
  const phone = '9000000000';
  const otpRes = await fetch(base + '/api/auth/verify-otp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, code: '123456', name: 'Test User' }) });
  const otpJson = await otpRes.json();
  if (!otpJson.token) {
    console.error('Failed to get token', otpJson); process.exit(1);
  }
  const token = otpJson.token;

  // 2. Create a product
  const prod = { name: 'TEST-PROD', slug: 'test-prod-' + Date.now(), base_price: 100, offer_price: 0, stock_count: 0, weight_grams: 100 };
  const createRes = await fetch(base + '/api/products', { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token }, body: JSON.stringify(prod) });
  const created = await createRes.json();
  if (!created.product) { console.error('Create product failed', created); process.exit(1); }
  const pid = created.product.id;
  console.log('Created product', pid);

  // 3. Add stock +10
  const addRes = await fetch(base + '/api/inventory/adjust', { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token }, body: JSON.stringify({ productId: pid, delta: 10, reason: 'test restock' }) });
  const addJson = await addRes.json();
  console.log('Add stock result', addJson);

  // 4. Try subtracting too much
  const subRes = await fetch(base + '/api/inventory/adjust', { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token }, body: JSON.stringify({ productId: pid, delta: -20, reason: 'test oversell' }) });
  const subJson = await subRes.json();
  console.log('Subtract result (expect error)', subJson);
}

run().catch(err => { console.error(err); process.exit(1); });
