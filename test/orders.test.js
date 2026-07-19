// Simple integration test for orders
async function run() {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  const phone = '9000000000';
  const otpRes = await fetch(base + '/api/auth/verify-otp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, code: '123456', name: 'Test User' }) });
  const otpJson = await otpRes.json();
  const token = otpJson.token;

  // Create product
  const prod = { name: 'ORDER-PROD', slug: 'order-prod-' + Date.now(), base_price: 50, offer_price: 0, stock_count: 5, weight_grams: 200 };
  const createRes = await fetch(base + '/api/products', { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token }, body: JSON.stringify(prod) });
  const created = await createRes.json();
  const pid = created.product.id;
  console.log('Created product', pid);

  // Place order for 2 units
  const orderPayload = {
    items: [ { productId: pid, quantity: 2 } ],
    deliveryMethod: 'delivery',
    paymentMethod: 'cod'
  };

  const orderRes = await fetch(base + '/api/orders', { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token }, body: JSON.stringify(orderPayload) });
  const orderJson = await orderRes.json();
  console.log('Order result', orderJson);
}

run().catch(err => { console.error(err); process.exit(1); });
