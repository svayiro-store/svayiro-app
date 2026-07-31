import { z } from 'zod';

export const REGEX = {
  indianMobile: /^[6-9]\d{9}$/,
  email: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
  gmail: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i,
  name: /^[A-Za-z][A-Za-z .'-]{1,79}$/,
  otp: /^\d{6}$/,
  pincode: /^[1-9]\d{5}$/,
  upiId: /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{2,64}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
};

export function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

export function isPositiveInteger(v) {
  return Number.isInteger(v) && v > 0;
}

export function normalizePhone(phone) {
  if (typeof phone !== 'string') return '';
  return phone.replace(/\D/g, '');
}

const phoneSchema = z
  .string()
  .transform((value) => normalizePhone(value))
  .superRefine((digits, ctx) => {
    if (digits.length !== 10) {
      ctx.addIssue({
        code: 'custom',
        message: 'Wrong phone number. Enter exactly 10 digits.'
      });
      return;
    }
    if (!REGEX.indianMobile.test(digits)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Wrong phone number. Indian mobile numbers must start with 6, 7, 8, or 9.'
      });
    }
  });

const optionalNameSchema = z
  .string()
  .trim()
  .max(80, 'Name must be 80 characters or fewer')
  .refine((name) => name === '' || REGEX.name.test(name), {
    message: 'Name must contain only letters, spaces, apostrophes, periods, or hyphens'
  })
  .optional();

const requiredNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name must be 80 characters or fewer')
  .regex(REGEX.name, 'Name must contain only letters, spaces, apostrophes, periods, or hyphens');

function zodErrors(result) {
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.message);
}

export function isValidIndianMobile(phone) {
  return phoneSchema.safeParse(String(phone ?? '')).success;
}

export function isValidOtp(code) {
  return typeof code === 'string' && REGEX.otp.test(code.trim());
}

export function isValidEmail(email) {
  return typeof email === 'string' && REGEX.email.test(email.trim());
}

export function isValidPincode(pincode) {
  return typeof pincode === 'string' && REGEX.pincode.test(pincode.trim());
}

export function isValidUpiId(upiId) {
  return typeof upiId === 'string' && REGEX.upiId.test(upiId.trim());
}

export function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function trimmedString(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function validateAuthPhone(body) {
  return zodErrors(z.object({ phone: phoneSchema }).safeParse(body));
}

export function validateOtpVerification(body) {
  return zodErrors(z.object({
    phone: phoneSchema,
    code: z.string().trim().regex(REGEX.otp, 'Valid 6-digit verification code is required'),
    name: optionalNameSchema
  }).safeParse(body));
}

export function validateAddress(address, prefix = 'address') {
  const errors = [];
  if (!address || typeof address !== 'object') return [`${prefix} is required`];

  const requiredTextFields = [
    ['flatAndHouse', 'flat/house/building'],
    ['areaAndStreet', 'area/street'],
    ['landmark', 'landmark'],
    ['state', 'state'],
    ['district', 'district'],
    ['taluk', 'taluk'],
    ['cityOrVillage', 'city/village']
  ];

  for (const [field, label] of requiredTextFields) {
    const value = trimmedString(address[field], 120);
    if (!value) errors.push(`${prefix}.${label} is required`);
  }

  if (!isValidPincode(address.pincode)) errors.push(`${prefix}.pincode must be a valid 6-digit Indian pincode`);

  const contactPhone = address.pickupPersonPhone || address.phone;
  const phoneResult = phoneSchema.safeParse(String(contactPhone ?? ''));
  if (!phoneResult.success) errors.push(`${prefix}.phone: ${phoneResult.error.issues[0].message}`);

  const contactName = address.pickupPersonName || address.name || '';
  const nameResult = optionalNameSchema.safeParse(contactName);
  if (!nameResult.success) errors.push(`${prefix}.contact name: ${nameResult.error.issues[0].message}`);

  return errors;
}

export function validateProfileUpdate(body) {
  const errors = [];
  if (body.name !== undefined) {
    errors.push(...zodErrors(optionalNameSchema.safeParse(body.name)));
  }
  if (body.email !== undefined && body.email !== '' && !isValidEmail(body.email)) errors.push('Email address is invalid');

  const addresses = body.savedAddresses !== undefined ? body.savedAddresses : body.addresses;
  if (addresses !== undefined) {
    if (!Array.isArray(addresses)) {
      errors.push('savedAddresses must be an array');
    } else {
      addresses.forEach((address, index) => errors.push(...validateAddress(address, `savedAddresses[${index}]`)));
    }
  }

  return errors;
}

export function validateShopProfileUpdate(body) {
  const errors = [];
  if (body.name !== undefined && !trimmedString(body.name, 120)) errors.push('Shop name is required');
  if (body.email !== undefined && body.email !== '' && !isValidEmail(body.email)) errors.push('Contact email is invalid');
  for (const field of ['personalPhoneNumber', 'supportPhoneNumber', 'contactNumber', 'whatsAppNumber', 'phone', 'whatsapp']) {
    if (body[field] !== undefined && body[field] !== '') {
      const result = phoneSchema.safeParse(String(body[field]));
      if (!result.success) errors.push(`${field}: ${result.error.issues[0].message}`);
    }
  }
  if (body.upiId !== undefined && body.upiId !== '' && !isValidUpiId(body.upiId)) errors.push('UPI ID format is invalid');
  if (body.is_open !== undefined && typeof body.is_open !== 'boolean') errors.push('Store open status must be true or false');
  if (body.holiday_mode !== undefined && typeof body.holiday_mode !== 'boolean') errors.push('Holiday advisory status must be true or false');
  for (const field of ['delivery_radius_km', 'free_delivery_radius_km', 'base_delivery_charge', 'delivery_charge_per_km']) {
    if (body[field] !== undefined && Number(body[field]) < 0) errors.push(`${field} cannot be negative`);
  }
  if (body.delivery_radius_km !== undefined && body.free_delivery_radius_km !== undefined && Number(body.free_delivery_radius_km) > Number(body.delivery_radius_km)) {
    errors.push('Free delivery radius cannot exceed maximum delivery radius');
  }
  if (body.operational_timings !== undefined && trimmedString(body.operational_timings, 120).length < 5) {
    errors.push('Operational store timings are required');
  }
  if (body.announcement !== undefined && String(body.announcement).length > 300) errors.push('Broadcast alert text must be 300 characters or fewer');
  if (body.holiday_message !== undefined && String(body.holiday_message).length > 300) errors.push('Shop closed broadcast message must be 300 characters or fewer');
  if (body.delivery_slots !== undefined) {
    if (!Array.isArray(body.delivery_slots)) {
      errors.push('Delivery slots must be an array');
    } else if (body.delivery_slots.some((slot) => typeof slot !== 'string' || !slot.trim() || slot.length > 80)) {
      errors.push('Every delivery slot must be a non-empty text value under 80 characters');
    }
  }
  if (body.social_links !== undefined) {
    if (!Array.isArray(body.social_links)) {
      errors.push('Social links must be an array');
    } else if (body.social_links.some((link) => !link || typeof link.label !== 'string' || typeof link.url !== 'string' || !link.label.trim() || !/^https?:\/\/\S+$/i.test(link.url.trim()))) {
      errors.push('Every social link needs a label and a valid http/https URL');
    }
  }
  return errors;
}

export function validateInventoryAdjust(body) {
  const errors = [];
  if (!isNonEmptyString(body.productId)) errors.push('productId is required');
  if (typeof body.delta !== 'number') errors.push('delta must be a number');
  if (body.reason && body.reason.length > 200) errors.push('reason too long');
  return errors;
}

export function validateOrderPayload(body) {
  const errors = [];
  const phoneResult = phoneSchema.safeParse(String(body.customerPhone ?? ''));
  if (!phoneResult.success) errors.push(`customerPhone: ${phoneResult.error.issues[0].message}`);
  if (body.customerName !== undefined) errors.push(...zodErrors(requiredNameSchema.safeParse(body.customerName)));
  if (!Array.isArray(body.items) || body.items.length === 0) errors.push('items must be a non-empty array');
  else {
    for (const it of body.items) {
      if (!isNonEmptyString(it.productId)) errors.push('each item.productId is required');
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) errors.push('each item.quantity must be a positive integer');
    }
  }
  if (body.deliveryMethod && !['pickup', 'delivery'].includes(body.deliveryMethod)) errors.push('invalid deliveryMethod');
  if (body.deliveryMethod === 'delivery') errors.push(...validateAddress(body.deliveryAddress, 'deliveryAddress'));
  if (body.paymentMethod && !['cod', 'upi'].includes(body.paymentMethod)) errors.push('invalid paymentMethod');
  if (body.paymentStatus && !['pending', 'paid', 'failed', 'submitted'].includes(body.paymentStatus)) errors.push('invalid paymentStatus');
  if (body.paymentMethod === 'upi' && body.paymentStatus === 'paid' && !isNonEmptyString(body.upiReference)) errors.push('upiReference is required for confirmed UPI payments');
  return errors;
}

export function validateCategoryPayload(body, isUpdate = false) {
  const errors = [];
  if (!isUpdate && !trimmedString(body.name, 120)) errors.push('Category name is required');
  if (body.name !== undefined && !trimmedString(body.name, 120)) errors.push('Category name is required');
  if (body.slug !== undefined && body.slug !== '' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) errors.push('Category slug must be lowercase words separated by hyphens');
  return errors;
}

export function validateProductPayload(body, isUpdate = false) {
  const errors = [];
  if (!isUpdate && !trimmedString(body.name, 160)) errors.push('Product name is required');
  if (!isUpdate && !isNonEmptyString(body.categoryId)) errors.push('Category ID is required');
  if (!isUpdate && (body.purchasePrice === undefined || Number(body.purchasePrice) <= 0)) errors.push('Real item cost / purchase price is required and must be greater than zero');
  if (body.purchasePrice !== undefined && Number(body.purchasePrice) <= 0) errors.push('Real item cost / purchase price must be greater than zero');
  if (body.basePrice !== undefined && Number(body.basePrice) < 0) errors.push('Base price cannot be negative');
  if (body.offerPrice !== undefined && Number(body.offerPrice) < 0) errors.push('Offer price cannot be negative');
  if (body.basePrice !== undefined && body.purchasePrice !== undefined && Number(body.basePrice) < Number(body.purchasePrice)) errors.push('Selling price cannot be below real item cost');
  if (body.offerPrice !== undefined && Number(body.offerPrice) > 0 && body.purchasePrice !== undefined && Number(body.offerPrice) < Number(body.purchasePrice)) errors.push('Offer price cannot be below real item cost');
  if (body.stockCount !== undefined && (!Number.isInteger(Number(body.stockCount)) || Number(body.stockCount) < 0)) errors.push('Stock count must be a whole number');
  if (body.weight !== undefined && Number(body.weight) <= 0) errors.push('Weight must be greater than zero');
  if (body.packageQuantity !== undefined && Number(body.packageQuantity) <= 0) errors.push('Package quantity/size must be greater than zero');
  if (body.unit !== undefined && !['kg', 'g', 'liter', 'ml', 'piece', 'packet', 'box', 'dozen', 'custom'].includes(String(body.unit))) errors.push('Product unit is invalid');
  if (body.unit === 'custom' && !trimmedString(body.customUnit, 30)) errors.push('Custom unit label is required');
  if (body.slug !== undefined && body.slug !== '' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) errors.push('Product slug must be lowercase words separated by hyphens');
  if (body.sku !== undefined && body.sku !== '' && !/^[A-Z0-9_-]{3,40}$/.test(String(body.sku).trim().toUpperCase())) errors.push('Product code/SKU must be 3-40 letters, numbers, hyphens, or underscores');
  return errors;
}

export function validateCouponPayload(body) {
  const errors = [];
  const discountType = body.discountType || body.discount_type || 'flat';
  const discountValue = body.discountValue ?? body.discount_value;
  const minOrderValue = body.minOrderValue ?? body.min_order_value ?? 0;
  const usageLimit = body.usageLimit ?? body.maxUses ?? body.max_uses;
  const expiryDate = body.expiryDate || body.expiresAt || body.expires_at;
  if (!/^[A-Z0-9_-]{3,30}$/.test(String(body.code || '').trim().toUpperCase())) errors.push('Coupon code must be 3-30 letters, numbers, underscores, or hyphens');
  if (!['flat', 'percentage'].includes(discountType)) errors.push('Invalid discount type');
  if (Number(discountValue) <= 0) errors.push('Discount value must be greater than zero');
  if (discountType === 'percentage' && Number(discountValue) > 100) errors.push('Percentage discount cannot exceed 100');
  if (Number(minOrderValue) < 0) errors.push('Minimum order value cannot be negative');
  if (usageLimit !== undefined && usageLimit !== null && usageLimit !== '' && (!Number.isInteger(Number(usageLimit)) || Number(usageLimit) < 1)) errors.push('Usage limit must be a positive whole number or blank');
  if (expiryDate && !isValidDateString(expiryDate)) errors.push('Expiry date must use YYYY-MM-DD format');
  return errors;
}

export function validateAdvanceRequestPayload(body) {
  const errors = [];
  const phoneResult = phoneSchema.safeParse(String(body.customerPhone ?? ''));
  if (!phoneResult.success) errors.push(`Customer phone: ${phoneResult.error.issues[0].message}`);
  if (!trimmedString(body.productName, 160)) errors.push('Product name is required');
  if (!Number.isInteger(Number(body.quantity)) || Number(body.quantity) <= 0) errors.push('Quantity must be a positive whole number');
  if (!isValidDateString(body.targetDate)) errors.push('Target date must use YYYY-MM-DD format');
  else if (body.targetDate < new Date().toISOString().slice(0, 10)) errors.push('Target date cannot be in the past');
  return errors;
}
