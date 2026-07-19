describe('backend validators', () => {
  let validators;

  beforeAll(async () => {
    validators = await import('../../server/validators.js');
  });

  test('accepts only 10-digit Indian mobile numbers', () => {
    expect(validators.normalizePhone('98765 43210')).toBe('9876543210');
    expect(validators.isValidIndianMobile('9876543210')).toBe(true);
    expect(validators.isValidIndianMobile('98765432101')).toBe(false);
    expect(validators.isValidIndianMobile('1234567890')).toBe(false);
  });

  test('returns clear auth phone validation errors', () => {
    expect(validators.validateAuthPhone({ phone: '9876543210' })).toEqual([]);
    expect(validators.validateAuthPhone({ phone: '98765432101' })).toContain(
      'Wrong phone number. Enter exactly 10 digits.'
    );
  });

  test('validates OTP verification input format', () => {
    expect(validators.validateOtpVerification({
      phone: '9876543210',
      code: '123456',
      name: 'Sahan Kumar'
    })).toEqual([]);

    const errors = validators.validateOtpVerification({
      phone: '9876543210',
      code: '12345',
      name: 'Sahan123'
    });

    expect(errors).toContain('Valid 6-digit verification code is required');
    expect(errors).toContain('Name must contain only letters, spaces, apostrophes, periods, or hyphens');
  });

  test('validates profile address phone and pincode', () => {
    const errors = validators.validateProfileUpdate({
      savedAddresses: [{
        flatAndHouse: '12',
        areaAndStreet: 'MG Road',
        landmark: 'Metro',
        state: 'Karnataka',
        district: 'Bengaluru',
        taluk: 'Bengaluru North',
        cityOrVillage: 'Bengaluru',
        pincode: '560001',
        pickupPersonPhone: '98765432101',
        pickupPersonName: 'Valid Name'
      }]
    });

    expect(errors).toContain('savedAddresses[0].phone: Wrong phone number. Enter exactly 10 digits.');
  });

  test('validates order customer name and item quantity', () => {
    const errors = validators.validateOrderPayload({
      customerPhone: '9876543210',
      customerName: 'Customer7',
      items: [{ productId: 'product-1', quantity: 0 }]
    });

    expect(errors).toContain('Name must contain only letters, spaces, apostrophes, periods, or hyphens');
    expect(errors).toContain('each item.quantity must be a positive integer');
  });
});
