/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import * as webPush from 'web-push';
import path from 'path';
import jwt from 'jsonwebtoken';
import net from 'net';
import tls from 'tls';
import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import { createServer as createViteServer } from 'vite';
import { query as pgQuery, runTransaction } from './server/db-pg.js';
import {
  REGEX,
  isValidIndianMobile,
  normalizePhone as normalizeInputPhone,
  validateAdvanceRequestPayload,
  validateCategoryPayload,
  validateCouponPayload,
  validateInventoryAdjust,
  validateOrderPayload,
  validateOtpVerification,
  validateProductPayload,
  validateProfileUpdate,
  validateShopProfileUpdate
} from './server/validators.js';
import type { CheckoutBagInfo } from './src/types';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression());

const isProduction = process.env.NODE_ENV === 'production';

function securityHeaders(req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  return next();
}

app.use(securityHeaders);

type RateLimitRecord = {
  resetAt: number;
  count: number;
};

const rateLimitBuckets = new Map<string, RateLimitRecord>();

function getClientIp(req: express.Request) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwardedFor || req.ip || req.socket.remoteAddress || 'unknown';
}

function rateLimit(options: { name: string; windowMs: number; max: number; message?: string }) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    const key = `${options.name}:${getClientIp(req)}`;
    const existing = rateLimitBuckets.get(key);
    if (!existing || existing.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    existing.count += 1;
    if (existing.count > options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: options.message || 'Too many requests. Please wait and try again.',
        retryAfterSeconds
      });
    }

    return next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitBuckets.entries()) {
    if (record.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

function configuredCorsOrigins() {
  const productionDefaults = [
    process.env.APP_PUBLIC_URL,
    process.env.PUBLIC_APP_URL,
    process.env.VITE_PUBLIC_APP_URL,
    process.env.VITE_ADMIN_APP_URL
  ];
  const developmentDefaults = [
    ...productionDefaults,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173'
  ];
  const explicit = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const defaults = isProduction ? productionDefaults : developmentDefaults;
  return new Set([...defaults, ...explicit].filter(Boolean).map((origin) => String(origin).replace(/\/$/, '')));
}

app.use((req, res, next) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.replace(/\/$/, '') : '';
  const allowedOrigins = configuredCorsOrigins();
  if (origin && (allowedOrigins.has(origin) || (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin)))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.post('/api/payments/cashfree/webhook', express.raw({ type: 'application/json', limit: '2mb' }), cashfreeWebhookHandler);

app.use(express.json({ limit: '10mb' }));

const authLimiter = rateLimit({
  name: 'auth',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX || 25),
  message: 'Too many login or OTP attempts. Please wait before trying again.'
});

const publicFormLimiter = rateLimit({
  name: 'public-form',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PUBLIC_FORM_MAX || 30),
  message: 'Too many form submissions. Please wait before trying again.'
});

const orderLimiter = rateLimit({
  name: 'order',
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_ORDER_MAX || 20),
  message: 'Too many order attempts. Please wait before placing another order.'
});

const searchLimiter = rateLimit({
  name: 'search',
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_SEARCH_MAX || 120),
  message: 'Too many searches. Please slow down.'
});

app.use('/api/auth', authLimiter);
app.use('/api/orders', orderLimiter);
app.use('/api/products', searchLimiter);
app.use('/api/customer-feedback', publicFormLimiter);
app.use('/api/complaints', publicFormLimiter);
app.use('/api/advance-requests', publicFormLimiter);
app.use('/api/reviews', publicFormLimiter);

type CacheEntry<T = any> = {
  expiresAt: number;
  value: T;
};

const publicCache = new Map<string, CacheEntry>();

function getPublicCache<T>(key: string): T | null {
  const entry = publicCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    publicCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setPublicCache<T>(key: string, value: T, ttlMs: number) {
  publicCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function invalidatePublicCache(prefix?: string) {
  if (!prefix) {
    publicCache.clear();
    return;
  }
  for (const key of publicCache.keys()) {
    if (key.startsWith(prefix)) publicCache.delete(key);
  }
}

function sendCacheableJson(res: express.Response, value: any, maxAgeSeconds = 60) {
  res.set('Cache-Control', `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds}`);
  return res.json(value);
}

const ALLOWED_ROLE_CODES = ['admin', 'inventory_manager', 'delivery_partner', 'customer_care', 'customer'] as const;
const STAFF_ROLE_CODES = ['inventory_manager', 'delivery_partner', 'customer_care'] as const;
const STAFF_ROLE_PREFIX: Record<string, string> = {
  inventory_manager: 'INV',
  delivery_partner: 'DEL',
  customer_care: 'CARE'
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanUuidList(value: any, limit = 500) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim())
        .filter((item) => UUID_REGEX.test(item))
    )
  ).slice(0, limit);
}

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || process.env.APP_PUBLIC_URL || 'mailto:support@svayiro.co.in').trim();
const isWebPushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (isWebPushConfigured) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

type PushAudience = 'customer' | 'admin';

function normalizePushAudience(value: any): PushAudience {
  return String(value || '').toLowerCase() === 'admin' ? 'admin' : 'customer';
}

function buildPushPayload(input: { title: string; body: string; type?: string; url?: string; tag?: string; data?: Record<string, any> }) {
  return {
    title: input.title,
    body: input.body,
    type: input.type || 'system',
    url: input.url || '/',
    tag: input.tag || `svayiro-${input.type || 'notice'}`,
    data: input.data || {},
    sentAt: new Date().toISOString()
  };
}

async function sendPushToWhere(whereSql: string, params: any[], payload: ReturnType<typeof buildPushPayload>) {
  if (!isWebPushConfigured) return;
  const { rows } = await pgQuery(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE ${whereSql}`,
    params
  );
  await Promise.allSettled(rows.map(async (subscription) => {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        },
        JSON.stringify(payload)
      );
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await pgQuery('DELETE FROM push_subscriptions WHERE id = $1', [subscription.id]);
      } else {
        console.error('Web push send failed', err?.message || err);
      }
    }
  }));
}

function notifyPushAudience(audience: PushAudience, input: Parameters<typeof buildPushPayload>[0]) {
  const payload = buildPushPayload(input);
  void sendPushToWhere('audience = $1', [audience], payload).catch((err) => {
    console.error('Web push audience notification failed', err);
  });
}

function notifyPushUser(userId: string | null | undefined, input: Parameters<typeof buildPushPayload>[0]) {
  if (!userId) return;
  const payload = buildPushPayload(input);
  void sendPushToWhere('user_id = $1', [userId], payload).catch((err) => {
    console.error('Web push user notification failed', err);
  });
}

// health check for test and deployment readiness
app.get('/api/health', (req, res) => {
  return res.json({ ok: true });
});

// -------------------------
// Orders (transactional placement)
// -------------------------

function normalizeOrder(order: any) {
  if (!order) return null;
  const rawItems = normalizeJsonArray(order.items);
  const items = rawItems.map((item: any) => {
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unit_price ?? item.unitPrice ?? item.price ?? 0);
    const totalPrice = Number(item.total_price ?? item.totalPrice ?? unitPrice * quantity);
    return {
      productId: item.product_id || item.productId || null,
      productName: item.name || item.product_name || item.productName || 'Item',
      quantity,
      price: totalPrice,
      weightGrams: item.weight_grams ?? item.weightGrams ?? 0,
      sku: item.sku || item.SKU || null,
      unitPrice,
      totalPrice
    };
  });

  const createdAt = order.created_at ? (typeof order.created_at === 'string' ? order.created_at : order.created_at.toISOString()) : order.createdAt;
  const updatedAt = order.updated_at ? (typeof order.updated_at === 'string' ? order.updated_at : order.updated_at.toISOString()) : order.updatedAt;

  return {
    id: order.id,
    orderRef: order.order_ref || order.orderRef,
    userId: order.user_id || order.userId,
    customerName: order.customer_name || order.customerName || null,
    customerPhone: order.customer_phone || order.customerPhone || null,
    status: order.status,
    paymentMethod: order.payment_method || order.paymentMethod,
    paymentStatus: order.payment_status || order.paymentStatus,
    paymentRef: order.payment_ref || order.paymentRef || null,
    deliveryMethod: order.delivery_method || order.deliveryMethod,
    deliveryAddress: order.delivery_address || order.deliveryAddress || null,
    selectedSlot: order.selected_slot || order.selectedSlot || null,
    bagOption: order.bag_option || order.bagOption,
    items,
    amountTotal: Number(order.amount_total ?? order.amountTotal ?? 0),
    deliveryCharge: Number(order.delivery_charge ?? order.deliveryCharge ?? 0),
    bagCharge: Number(order.bag_charge ?? order.bagCharge ?? 0),
    discountAmount: Number(order.discount_amount ?? order.discountAmount ?? 0),
    finalAmount: Number(order.final_amount ?? order.finalAmount ?? 0),
    productTotal: Number(order.amount_total ?? order.amountTotal ?? order.productTotal ?? 0),
    deliveryCost: Number(order.delivery_charge ?? order.deliveryCharge ?? order.deliveryCost ?? 0),
    bagCost: Number(order.bag_charge ?? order.bagCharge ?? order.bagCost ?? 0),
    discount: Number(order.discount_amount ?? order.discountAmount ?? order.discount ?? 0),
    finalTotal: Number(order.final_amount ?? order.finalAmount ?? order.finalTotal ?? 0),
    couponCode: order.meta?.couponCode || order.coupon_code || order.couponCode || null,
    extendedDelivery: order.meta?.extendedDelivery || order.extendedDelivery || undefined,
    cashfree: order.meta?.cashfree || order.cashfree || undefined,
    invoiceQueue: order.invoiceQueue || order.invoice_queue || undefined,
    invoiceType: order.delivery_method === 'pickup' && order.selected_slot === 'In-store Direct Purchase' ? 'offline_pos' : 'online_order',
    adminArchivedAt: order.admin_archived_at || order.adminArchivedAt || null,
    paymentDetails: {
      method: order.payment_method || order.paymentMethod,
      status: order.payment_status || order.paymentStatus,
      upiReference: order.payment_ref || order.paymentRef || null
    },
    createdAt,
    updatedAt,
    raw: order
  };
}

function normalizeUser(user: any) {
  if (!user) return null;
  return {
    ...user,
    phone: user.phone || '',
    staffLoginId: user.staff_login_id || user.staffLoginId || user.metadata?.staffLoginId || '',
    dateOfBirth: user.date_of_birth ? formatDobForDisplay(user.date_of_birth) : formatDobForDisplay(user.dateOfBirth),
    savedAddresses: Array.isArray(user.saved_addresses)
      ? user.saved_addresses
      : Array.isArray(user.savedAddresses)
        ? user.savedAddresses
        : [],
    savedForLater: Array.isArray(user.saved_for_later)
      ? user.saved_for_later
      : Array.isArray(user.savedForLater)
        ? user.savedForLater
        : [],
    wishlist: Array.isArray(user.wishlist) ? user.wishlist : [],
    roles: Array.isArray(user.roles) ? user.roles : [],
    isActive: user.is_active !== undefined ? Boolean(user.is_active) : true
  };
}

function normalizeAdminAlert(alert: any) {
  if (!alert) return null;
  const createdAt = alert.created_at
    ? (typeof alert.created_at === 'string' ? alert.created_at : alert.created_at.toISOString())
    : alert.createdAt;
  const updatedAt = alert.updated_at
    ? (typeof alert.updated_at === 'string' ? alert.updated_at : alert.updated_at.toISOString())
    : alert.updatedAt;
  return {
    id: alert.id,
    title: alert.title,
    message: alert.body || alert.message || '',
    type: alert.type || 'system',
    source: alert.source || '',
    severity: alert.severity || 'info',
    status: alert.status || 'unread',
    payload: alert.payload || {},
    createdAt,
    updatedAt,
    date: createdAt
  };
}

async function createAdminAlertRecord(
  runner: { query: (sql: string, params?: any[]) => Promise<any> } | null,
  input: {
    title: string;
    body: string;
    type?: string;
    source?: string;
    severity?: 'info' | 'warning' | 'critical';
    status?: 'unread' | 'read' | 'archived';
    payload?: Record<string, any>;
  }
) {
  const db = runner || { query: pgQuery };
  const result = await db.query(
    `INSERT INTO admin_alerts(title, body, type, source, severity, status, payload, created_at, updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,now(),now())
     RETURNING *`,
    [
      input.title,
      input.body,
      input.type || 'system',
      input.source || null,
      input.severity || 'info',
      input.status || 'unread',
      input.payload || {}
    ]
  );
  const alert = result.rows[0];
  if (alert) {
    notifyPushAudience('admin', {
      title: alert.title,
      body: alert.body,
      type: alert.type,
      tag: `admin-alert-${alert.id}`,
      url: '/',
      data: { alertId: alert.id, source: alert.source || null, severity: alert.severity || 'info' }
    });
  }
  return result;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 210000, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$210000$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = Buffer.from(parts[3], 'hex');
  const actual = pbkdf2Sync(password, salt, iterations, expected.length, 'sha256');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function validatePasswordInput(password: any) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain letters and numbers.';
  return '';
}

function validateDobInput(dateOfBirth: any) {
  const parsed = normalizeDobForDb(dateOfBirth);
  if (!parsed) return 'Date of birth is required in dd-mm-yyyy format.';
  const date = new Date(`${parsed}T00:00:00Z`);
  if (date.getTime() > Date.now()) return 'Date of birth cannot be in the future.';
  return '';
}

function normalizeDobForDb(dateOfBirth: any) {
  if (typeof dateOfBirth !== 'string') return '';
  const value = dateOfBirth.trim();
  let normalized = '';
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const displayMatch = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (isoMatch) {
    normalized = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  } else if (displayMatch) {
    normalized = `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}`;
  } else {
    return '';
  }
  const date = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized ? '' : normalized;
}

function formatDobForDisplay(dateOfBirth: any) {
  if (dateOfBirth instanceof Date && !Number.isNaN(dateOfBirth.getTime())) {
    const day = String(dateOfBirth.getDate()).padStart(2, '0');
    const month = String(dateOfBirth.getMonth() + 1).padStart(2, '0');
    const year = dateOfBirth.getFullYear();
    return `${day}-${month}-${year}`;
  }
  const normalized = normalizeDobForDb(
    typeof dateOfBirth === 'string'
        ? dateOfBirth.slice(0, 10)
        : ''
  );
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-');
  return `${day}-${month}-${year}`;
}

function dbDateString(dateOfBirth: any) {
  if (!dateOfBirth) return '';
  if (dateOfBirth instanceof Date && !Number.isNaN(dateOfBirth.getTime())) {
    return `${dateOfBirth.getFullYear()}-${String(dateOfBirth.getMonth() + 1).padStart(2, '0')}-${String(dateOfBirth.getDate()).padStart(2, '0')}`;
  }
  return normalizeDobForDb(String(dateOfBirth).slice(0, 10));
}

function assertDobChangeAllowed(existingDob: any, requestedDob: string) {
  const existing = dbDateString(existingDob);
  const requested = normalizeDobForDb(requestedDob);
  if (existing && requested && existing !== requested) {
    throw new Error('Date of birth is already saved for this account and cannot be changed.');
  }
}

function getIndiaTodayParts() {
  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  return {
    year: Number(nowParts.find((part) => part.type === 'year')?.value),
    month: Number(nowParts.find((part) => part.type === 'month')?.value),
    day: Number(nowParts.find((part) => part.type === 'day')?.value)
  };
}

function indiaDateAtOffset(offsetDays = 0) {
  const parts = getIndiaTodayParts();
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return {
    date,
    iso: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`,
    display: `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`
  };
}

function parseSlotTimeMinutes(value: string) {
  const match = String(value || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function parseOrderSlotPriority(order: any) {
  const slotText = String(order.selected_slot || order.selectedSlot || '').trim();
  const today = indiaDateAtOffset(0);
  const tomorrow = indiaDateAtOffset(1);
  const now = new Date();
  const nowIndiaParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const nowMinutes =
    Number(nowIndiaParts.find((part) => part.type === 'hour')?.value || 0) * 60
    + Number(nowIndiaParts.find((part) => part.type === 'minute')?.value || 0);

  const dateMatch = slotText.match(/(\d{2})-(\d{2})-(\d{4})/);
  const displayDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;
  const isoDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null;
  const timePart = slotText.includes(' - ')
    ? slotText.split(' - ').slice(-1)[0]
    : slotText.replace(/^(Today|Tomorrow)\s*(\([^)]+\))?\s*-?\s*/i, '').trim();
  const timeMatches = timePart.match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM)/gi) || [];
  const slotStartMinutes = timeMatches[0] ? parseSlotTimeMinutes(timeMatches[0]) : null;
  const slotEndMinutes = timeMatches[1] ? parseSlotTimeMinutes(timeMatches[1]) : slotStartMinutes;

  let scheduledDay: 'today' | 'tomorrow' | 'later' | 'unknown' = 'unknown';
  if (isoDate === today.iso || /^today/i.test(slotText)) scheduledDay = 'today';
  else if (isoDate === tomorrow.iso || /^tomorrow/i.test(slotText)) scheduledDay = 'tomorrow';
  else if (isoDate && isoDate > tomorrow.iso) scheduledDay = 'later';

  const paymentStatus = order.payment_status || order.paymentStatus || 'pending';
  const status = order.status || 'pending';
  const isTerminal = status === 'delivered' || status === 'cancelled';
  const isDelayed = scheduledDay === 'today' && slotEndMinutes !== null && slotEndMinutes < nowMinutes && !isTerminal;
  const isDueSoon = scheduledDay === 'today' && slotStartMinutes !== null && slotStartMinutes >= nowMinutes && slotStartMinutes - nowMinutes <= 90 && !isTerminal;
  const paymentRank = paymentStatus === 'paid' ? 0 : paymentStatus === 'submitted' ? 1 : 2;
  const dayRank = scheduledDay === 'today' ? 0 : scheduledDay === 'tomorrow' ? 1 : scheduledDay === 'later' ? 2 : 3;
  const statusRank: Record<string, number> = { pending: 0, accepted: 1, packed: 2, out_for_delivery: 3, delivered: 9, cancelled: 10 };
  const priorityRank = (isDelayed ? -10000 : 0)
    + dayRank * 10000
    + (slotStartMinutes ?? 9999)
    + paymentRank * 100
    + (statusRank[status] ?? 5);

  return {
    scheduledDate: isoDate,
    scheduledDateDisplay: displayDate,
    scheduledDay,
    slotLabel: timePart || slotText || null,
    slotStartMinutes,
    slotEndMinutes,
    priorityLabel: isDelayed ? 'Delayed' : isDueSoon ? 'Due Soon' : scheduledDay === 'today' ? 'Today' : scheduledDay === 'tomorrow' ? 'Tomorrow' : 'Later',
    priorityRank,
    isDueSoon,
    isDelayed
  };
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function birthdayDateForYear(year: number, birthMonth: number, birthDay: number) {
  if (birthMonth === 2 && birthDay === 29 && !isLeapYear(year)) {
    return { month: 3, day: 1 };
  }
  return { month: birthMonth, day: birthDay };
}

function getBirthdayParts(dateOfBirth: any) {
  const dobText = dbDateString(dateOfBirth);
  const parts = dobText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return null;
  return {
    year: Number(parts[1]),
    month: Number(parts[2]),
    day: Number(parts[3])
  };
}

function isBirthdayCoupon(coupon: any, couponCode?: string) {
  const metadata = coupon?.metadata || {};
  const type = String(metadata.couponType || metadata.type || '').toLowerCase();
  const code = String(couponCode || coupon?.code || '').toUpperCase();
  return type === 'birthday' || metadata.birthdayOnly === true || /(BDAY|BIRTHDAY|BIRTH|HBD)/i.test(code);
}

function isReferralCoupon(coupon: any, couponCode?: string) {
  const metadata = coupon?.metadata || {};
  const type = String(metadata.couponType || metadata.type || '').toLowerCase();
  const code = String(couponCode || coupon?.code || '').toUpperCase();
  return type === 'referral' || metadata.referralOnly === true || /(REFER|REFERRAL|FRIEND)/i.test(code);
}

function isWelcomeCoupon(coupon: any, couponCode?: string) {
  const metadata = coupon?.metadata || {};
  const type = String(metadata.couponType || metadata.type || '').toLowerCase();
  const code = String(couponCode || coupon?.code || '').toUpperCase();
  return type === 'welcome' || metadata.welcomeOnly === true || /(WELCOME|FIRSTORDER|FIRST_ORDER|NEWUSER|NEW_USER)/i.test(code);
}

function dateOnlyValue(value: any) {
  const raw = String(value || '').trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const displayMatch = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (displayMatch) return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}`;
  return '';
}

function productMatchesCampaignEligibility(product: any, eligibleProductIds: Set<string>, eligibleCategoryIds: Set<string>) {
  if (!product) return false;
  if (eligibleProductIds.has(String(product.id))) return true;
  const categoryIds = [
    product.category_id,
    product.categoryId,
    product.subcategory_id,
    product.subcategoryId,
    ...(Array.isArray(product.category_ids) ? product.category_ids : []),
    ...(Array.isArray(product.categoryIds) ? product.categoryIds : [])
  ].filter(Boolean).map((id) => String(id));
  return categoryIds.some((categoryId) => eligibleCategoryIds.has(categoryId));
}

async function loadActiveCouponCampaignEligibility(client: any, couponId: string | null, couponCode: string) {
  if (!couponId && !couponCode) return null;
  const params: any[] = [];
  const whereParts: string[] = ['c.is_active = true', 'current_date BETWEEN c.start_date AND c.end_date'];
  if (couponId) {
    params.push(couponId);
    whereParts.push(`c.coupon_id = $${params.length}`);
  } else {
    params.push(couponCode);
    whereParts.push(`upper(coupon.code) = upper($${params.length})`);
  }
  const { rows } = await client.query(
    `SELECT
       c.id,
       c.title,
       c.coupon_id,
       coupon.code AS coupon_code,
       COALESCE(array_remove(array_agg(DISTINCT cp.product_id), NULL), ARRAY[]::uuid[]) AS product_ids,
       COALESCE(array_remove(array_agg(DISTINCT cc.category_id), NULL), ARRAY[]::uuid[]) AS category_ids
     FROM campaigns c
     LEFT JOIN coupons coupon ON coupon.id = c.coupon_id
     LEFT JOIN campaign_products cp ON cp.campaign_id = c.id
     LEFT JOIN campaign_categories cc ON cc.campaign_id = c.id
     WHERE ${whereParts.join(' AND ')}
     GROUP BY c.id, coupon.code
     ORDER BY c.priority DESC, c.created_at DESC
     LIMIT 1`,
    params
  );
  if (!rows.length) return null;
  return {
    campaignId: rows[0].id,
    campaignTitle: rows[0].title,
    couponCode: rows[0].coupon_code,
    productIds: Array.isArray(rows[0].product_ids) ? rows[0].product_ids.map(String) : [],
    categoryIds: Array.isArray(rows[0].category_ids) ? rows[0].category_ids.map(String) : []
  };
}

async function couponHasCampaignBinding(client: any, couponId: string | null, couponCode: string) {
  if (!couponId && !couponCode) return false;
  const params: any[] = [];
  const whereParts: string[] = [];
  if (couponId) {
    params.push(couponId);
    whereParts.push(`c.coupon_id = $${params.length}`);
  }
  if (couponCode) {
    params.push(couponCode);
    whereParts.push(`upper(coupon.code) = upper($${params.length})`);
  }
  if (whereParts.length === 0) return false;
  const { rowCount } = await client.query(
    `SELECT c.id
     FROM campaigns c
     LEFT JOIN coupons coupon ON coupon.id = c.coupon_id
     WHERE ${whereParts.join(' OR ')}
     LIMIT 1`,
    params
  );
  return rowCount > 0;
}

const LOYALTY_EARN_AMOUNT = 200;
const LOYALTY_REDEEM_BLOCK_POINTS = 10;
const LOYALTY_REDEEM_BLOCK_VALUE = 20;
const REFERRAL_MIN_ORDER_VALUE = 100;
const REFERRAL_REWARD_POINTS = 5;

function maskPhoneForDisplay(phone: any) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length <= 4) return digits ? `${digits[0] || ''}***${digits.slice(-1)}` : '';
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return `${local.slice(0, 2)}******${local.slice(-2)}`;
}

function makeReferralCode(user: any) {
  const phoneTail = String(user?.phone || '').replace(/\D/g, '').slice(-4) || '0000';
  const idTail = String(user?.id || randomBytes(3).toString('hex')).replace(/-/g, '').slice(0, 6).toUpperCase();
  return `SVY${phoneTail}${idTail}`;
}

async function ensureReferralCode(client: any, user: any) {
  if (!user?.id) return '';
  const current = user.metadata?.referralCode || user.metadata?.referral_code;
  if (current) return String(current).toUpperCase();
  const code = makeReferralCode(user);
  const metadata = { ...(user.metadata || {}), referralCode: code };
  await client.query('UPDATE users SET metadata = $1, updated_at = now() WHERE id = $2', [metadata, user.id]);
  return code;
}

async function getLoyaltySummary(client: any, userId: string) {
  const tx = await client.query(
    `SELECT
       COALESCE(SUM(points), 0)::int AS points,
       COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0)::int AS earned_points,
       ABS(COALESCE(SUM(CASE WHEN points < 0 THEN points ELSE 0 END), 0))::int AS redeemed_points,
       COALESCE(SUM(CASE WHEN type = 'earn_order' THEN amount_value ELSE 0 END), 0)::numeric AS qualifying_spend
     FROM loyalty_transactions
     WHERE user_id = $1`,
    [userId]
  );
  const row = tx.rows[0] || {};
  return {
    points: Number(row.points || 0),
    earnedPoints: Number(row.earned_points || 0),
    redeemedPoints: Number(row.redeemed_points || 0),
    totalSpend: Number(row.qualifying_spend || 0),
    totalOrders: 0,
    earnRateAmount: LOYALTY_EARN_AMOUNT,
    redeemBlockPoints: LOYALTY_REDEEM_BLOCK_POINTS,
    redeemBlockValue: LOYALTY_REDEEM_BLOCK_VALUE,
    nextRewardAt: LOYALTY_REDEEM_BLOCK_POINTS
  };
}

async function backfillMissingLoyaltyForUser(client: any, user: any) {
  if (!user?.id) return;
  const normalizedUserPhone = normalizePhone(user.phone || '');
  const paidOrders = await client.query(
    `SELECT *
     FROM orders
     WHERE payment_method = 'upi'
       AND payment_status = 'paid'
       AND status != 'cancelled'
       AND (
         user_id = $1
         OR ($2 <> '' AND regexp_replace(COALESCE(customer_phone, ''), '\\D', '', 'g') IN ($2, $3))
       )
       AND NOT EXISTS (
         SELECT 1
         FROM loyalty_transactions lt
         WHERE lt.user_id = $1
           AND lt.order_id = orders.id
           AND lt.type = 'earn_order'
       )
     ORDER BY created_at ASC`,
    [user.id, normalizedUserPhone, normalizedUserPhone ? `91${normalizedUserPhone}` : '']
  );

  for (const order of paidOrders.rows) {
    const orderForReward = { ...order, user_id: user.id };
    await awardLoyaltyForOrder(client, orderForReward);
    if (!order.user_id) {
      await client.query('UPDATE orders SET user_id = $1, updated_at = now() WHERE id = $2 AND user_id IS NULL', [user.id, order.id]);
    }
  }
}

async function computeLoyaltyRedemption(client: any, userId: string, requestedPoints: any, discountCap: number) {
  const requested = Math.floor(Number(requestedPoints || 0));
  if (!requested) return { points: 0, discount: 0 };
  if (!Number.isInteger(requested) || requested < 0) {
    throw new Error('Savings Points redemption must be a positive whole number.');
  }
  const summary = await getLoyaltySummary(client, userId);
  const redeemablePoints = Math.floor(Math.min(requested, summary.points) / LOYALTY_REDEEM_BLOCK_POINTS) * LOYALTY_REDEEM_BLOCK_POINTS;
  if (redeemablePoints <= 0) return { points: 0, discount: 0 };
  const discount = Math.min(Math.max(0, discountCap), (redeemablePoints / LOYALTY_REDEEM_BLOCK_POINTS) * LOYALTY_REDEEM_BLOCK_VALUE);
  if (discount <= 0) return { points: 0, discount: 0 };
  return { points: redeemablePoints, discount };
}

async function addLoyaltyTransaction(client: any, data: any) {
  await client.query(
    `INSERT INTO loyalty_transactions(user_id, order_id, type, points, amount_value, metadata, created_at)
     SELECT $1::uuid,$2::uuid,$3::text,$4::int,$5::numeric,$6::jsonb,now()
     WHERE NOT EXISTS (
       SELECT 1 FROM loyalty_transactions
       WHERE user_id = $1::uuid
         AND COALESCE(order_id::text, '') = COALESCE($2::uuid::text, '')
         AND type = $3::text
     )`,
    [data.userId, data.orderId || null, data.type, data.points, data.amountValue || 0, data.metadata || {}]
  );
}

async function awardLoyaltyForOrder(client: any, order: any) {
  if (!order?.user_id || order.status === 'cancelled') return;
  const amount = Number(order.final_amount || 0);
  const points = Math.floor(amount / LOYALTY_EARN_AMOUNT);
  if (points <= 0) return;
  await addLoyaltyTransaction(client, {
    userId: order.user_id,
    orderId: order.id,
    type: 'earn_order',
    points,
    amountValue: amount,
    metadata: { orderRef: order.order_ref || null, rate: `Rs ${LOYALTY_EARN_AMOUNT} = 1 point` }
  });
}

async function qualifyReferralForOrder(client: any, order: any) {
  if (!order?.user_id || order.status === 'cancelled') return;
  const amount = Number(order.final_amount || 0);
  if (amount < REFERRAL_MIN_ORDER_VALUE) return;
  const ref = await client.query(
    `SELECT * FROM referrals
     WHERE referred_user_id = $1 AND status = 'pending'
     FOR UPDATE`,
    [order.user_id]
  );
  if (ref.rowCount === 0) return;
  const referral = ref.rows[0];
  await client.query(
    `UPDATE referrals
     SET status = 'qualified',
         qualifying_order_id = $1,
         qualifying_amount = $2,
         reward_points = $3,
         qualified_at = now()
     WHERE id = $4`,
    [order.id, amount, REFERRAL_REWARD_POINTS, referral.id]
  );
  await addLoyaltyTransaction(client, {
    userId: referral.referrer_user_id,
    orderId: order.id,
    type: 'earn_referral',
    points: REFERRAL_REWARD_POINTS,
    amountValue: amount,
    metadata: { referralId: referral.id, referredUserId: order.user_id, minOrderValue: REFERRAL_MIN_ORDER_VALUE }
  });
}

async function applyOrderRewards(client: any, order: any) {
  if (!order || order.status === 'cancelled') return;
  if (['upi', 'cashfree'].includes(order.payment_method) && order.payment_status === 'paid') {
    await awardLoyaltyForOrder(client, order);
    await qualifyReferralForOrder(client, order);
  }
}

async function applyOrderRewardsBestEffort(client: any, order: any) {
  try {
    await applyOrderRewards(client, order);
    return '';
  } catch (err: any) {
    console.error('Order rewards failed:', err);
    return err?.message || 'Savings Points update failed';
  }
}

async function assertOrderItemsInStock(client: any, orderId: string) {
  const itemsRes = await client.query(
    `SELECT oi.product_id, oi.quantity, p.name, p.stock_count
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     FOR UPDATE OF p`,
    [orderId]
  );
  for (const item of itemsRes.rows) {
    const requested = Number(item.quantity || 0);
    const available = Number(item.stock_count || 0);
    if (requested > available) {
      throw new HttpError(409, `${item.name || 'Product'} has only ${available} unit(s) left. Cannot verify this order as paid.`);
    }
  }
}

async function finalizePaidOrderEffects(client: any, order: any) {
  if (!order?.id || order.status === 'cancelled') return;

  const alreadyStocked = await client.query(
    "SELECT 1 FROM inventory_logs WHERE reference_id = $1 AND reason = 'order-placement' LIMIT 1",
    [order.id]
  );
  if (alreadyStocked.rowCount === 0) {
    const itemsRes = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [order.id]);
    for (const item of itemsRes.rows) {
      const updated = await client.query(
        'UPDATE products SET stock_count = stock_count - $1, updated_at = now() WHERE id = $2 AND stock_count >= $1 RETURNING stock_count',
        [item.quantity, item.product_id]
      );
      if (updated.rowCount === 0) {
        throw new HttpError(409, 'Insufficient product stock. Refresh orders and check inventory before accepting this payment.');
      }
      await client.query(
        'INSERT INTO inventory_logs(product_id, delta, reason, source, reference_id, metadata) VALUES($1,$2,$3,$4,$5,$6)',
        [item.product_id, -item.quantity, 'order-placement', 'order', order.id, { orderId: order.id, orderRef: order.order_ref || null }]
      );
    }
  }

  const meta = order.meta || {};
  const couponCode = meta.couponCode || meta.coupon_code || null;
  if (couponCode && !meta.couponUsageApplied) {
    await client.query(
      `UPDATE coupons
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
         'currentUsage',
         COALESCE(
           CASE WHEN (metadata->>'currentUsage') ~ '^[0-9]+$' THEN (metadata->>'currentUsage')::int END,
           CASE WHEN (metadata->>'current_usage') ~ '^[0-9]+$' THEN (metadata->>'current_usage')::int END,
           0
         ) + 1,
         'current_usage',
         COALESCE(
           CASE WHEN (metadata->>'currentUsage') ~ '^[0-9]+$' THEN (metadata->>'currentUsage')::int END,
           CASE WHEN (metadata->>'current_usage') ~ '^[0-9]+$' THEN (metadata->>'current_usage')::int END,
           0
         ) + 1
       ),
       updated_at = now()
       WHERE code = $1`,
      [couponCode]
    );
    meta.couponUsageApplied = true;
  }

  const loyaltyRedeemPoints = Number(meta.loyaltyRedeemPoints || 0);
  const loyaltyDiscount = Number(meta.loyaltyDiscount || 0);
  if (order.user_id && loyaltyRedeemPoints > 0 && loyaltyDiscount > 0 && !meta.loyaltyRedemptionApplied) {
    await addLoyaltyTransaction(client, {
      userId: order.user_id,
      orderId: order.id,
      type: 'redeem_order',
      points: -loyaltyRedeemPoints,
      amountValue: loyaltyDiscount,
      metadata: { orderRef: order.order_ref || null, value: loyaltyDiscount }
    });
    meta.loyaltyRedemptionApplied = true;
  }

  await client.query('UPDATE orders SET meta = $1::jsonb, updated_at = now() WHERE id = $2', [meta, order.id]);
  await createInvoiceRecord(client, { ...order, meta }, 'online_order');
  await applyOrderRewards(client, { ...order, meta });
}

function isBirthdayToday(dateOfBirth: any) {
  const dob = getBirthdayParts(dateOfBirth);
  if (!dob) return false;
  const today = getIndiaTodayParts();
  const effective = birthdayDateForYear(today.year, dob.month, dob.day);
  return today.month === effective.month && today.day === effective.day;
}

async function getOptionalCurrentUser(req: any) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.*)$/i);
  if (!match) return null;
  try {
    const payload = jwt.verify(match[1], JWT_SECRET) as any;
    const ures = await pgQuery('SELECT * FROM users WHERE id = $1', [payload.id]);
    return ures.rows[0] || null;
  } catch {
    return null;
  }
}

async function validateBirthdayCouponUse(client: any, user: any, coupon: any, couponCode: string, customerPhone: string) {
  if (!isBirthdayCoupon(coupon, couponCode)) return;
  if (!user?.id) throw new Error('Birthday coupon requires a logged-in customer account.');
  if (!user.date_of_birth) throw new Error('Add your date of birth to use birthday coupon.');
  if (!isBirthdayToday(user.date_of_birth)) throw new Error('Birthday coupon is valid only on your birthday.');

  const used = await client.query(
    `SELECT id
     FROM orders
     WHERE status != 'cancelled'
       AND created_at >= date_trunc('year', now())
       AND (user_id = $1 OR customer_phone = $2)
       AND COALESCE(meta->>'couponCode', '') ~* '(BDAY|BIRTHDAY|BIRTH|HBD)'
     LIMIT 1`,
    [user.id, customerPhone]
  );
  if (used.rowCount > 0) throw new Error('Birthday coupon can be used only once per year for this account.');
}

async function validateWelcomeCouponUse(client: any, user: any, coupon: any, couponCode: string, customerPhone: string) {
  if (!isWelcomeCoupon(coupon, couponCode)) return;
  if (!user?.id) throw new Error('Welcome coupon requires a logged-in customer account.');

  const used = await client.query(
    `SELECT id
     FROM orders
     WHERE status != 'cancelled'
       AND (user_id = $1 OR customer_phone = $2)
       AND upper(COALESCE(meta->>'couponCode', '')) = upper($3)
     LIMIT 1`,
    [user.id, customerPhone, couponCode]
  );
  if (used.rowCount > 0) throw new Error('Welcome coupon can be used only once per customer account.');
}

async function validateReferralCouponUse(client: any, user: any, coupon: any, couponCode: string) {
  if (!isReferralCoupon(coupon, couponCode)) return;
  if (!user?.id) throw new Error('Referral coupon requires a logged-in customer account.');
  const qualified = await client.query(
    `SELECT id FROM referrals
     WHERE referrer_user_id = $1 AND status = 'qualified'
     LIMIT 1`,
    [user.id]
  );
  if (qualified.rowCount === 0) throw new Error('Referral coupon unlocks after your referred customer completes a qualifying order.');
}

function buildUpcomingBirthdayRows(users: any[]) {
  const todayParts = getIndiaTodayParts();
  const todayYear = todayParts.year;
  const todayMonth = todayParts.month;
  const todayDay = todayParts.day;
  const today = new Date(todayYear, todayMonth - 1, todayDay);
  return users
    .map((user) => {
      const rawDob = user.date_of_birth;
      if (!rawDob) return null;
      const dobText = rawDob instanceof Date
        ? `${rawDob.getFullYear()}-${String(rawDob.getMonth() + 1).padStart(2, '0')}-${String(rawDob.getDate()).padStart(2, '0')}`
        : String(rawDob).slice(0, 10);
      const parts = dobText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!parts) return null;
      const birthYear = Number(parts[1]);
      const birthMonth = Number(parts[2]);
      const birthDay = Number(parts[3]);
      const effectiveThisYear = birthdayDateForYear(todayYear, birthMonth, birthDay);
      let nextBirthday = new Date(todayYear, effectiveThisYear.month - 1, effectiveThisYear.day);
      if (nextBirthday < today) {
        const effectiveNextYear = birthdayDateForYear(todayYear + 1, birthMonth, birthDay);
        nextBirthday = new Date(todayYear + 1, effectiveNextYear.month - 1, effectiveNextYear.day);
      }
      const daysUntil = Math.round((nextBirthday.getTime() - today.getTime()) / 86400000);
      return {
        id: user.id,
        name: user.name || 'Customer',
        phone: user.phone || '',
        email: user.email || '',
        roles: Array.isArray(user.roles) ? user.roles : [],
        roleLabel: Array.isArray(user.roles) && user.roles.length
          ? user.roles.map((role: string) => role.replace(/_/g, ' ')).join(', ')
          : 'customer',
        dateOfBirth: `${String(birthDay).padStart(2, '0')}-${String(birthMonth).padStart(2, '0')}-${birthYear}`,
        birthdayDayMonth: `${String(birthDay).padStart(2, '0')}-${String(birthMonth).padStart(2, '0')}`,
        nextBirthday: nextBirthday.toISOString().slice(0, 10),
        daysUntil,
        isToday: daysUntil === 0
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.daysUntil - b.daysUntil);
}

function normalizeJsonArray(value: any) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeBoolean(value: any, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  if (typeof value === 'number') return value === 1;
  return fallback;
}

function normalizeWhatsAppRecipient(phone: any) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  return '';
}

function isWhatsAppConfigured() {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

function money(value: any) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function formatDateTimeDDMMYYYY(value?: any) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const time = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${day}-${month}-${year} ${time}`;
}

function orderAddressText(address: any) {
  if (!address) return 'Store pickup / walk-in billing';
  if (typeof address === 'string') return address;
  return [
    address.flatAndHouse,
    address.areaAndStreet,
    address.landmark,
    address.cityOrVillage,
    address.taluk,
    address.district,
    address.state,
    address.pincode
  ].filter(Boolean).join(', ') || 'Address set';
}

function buildOrderInvoiceMessage(order: any) {
  const normalized = normalizeOrder(order);
  if (!normalized) {
    return [
      'SVAYIRO Invoice',
      'Invoice: N/A',
      'Order ID: N/A',
      'Order Ref: -',
      'Type: Online Order',
      'Date: -',
      '',
      'Customer: Walk-In Customer',
      'Phone: -',
      'Fulfillment: Store Pickup / POS',
      'Slot: No slot',
      'Address: Store pickup / walk-in billing',
      '',
      'Items:',
      'No items found',
      '',
      'Product subtotal: Rs. 0.00',
      'Delivery charge: Rs. 0.00',
      'Bag charge: Rs. 0.00',
      'Discount: -Rs. 0.00',
      'Grand total: Rs. 0.00',
      '',
      'Payment: cod (pending)',
      'Reference: -',
      '',
      'Thank you for shopping with SVAYIRO.'
    ].join('\n');
  }

  const lines = (normalized.items || []).map((item: any, index: number) => {
    const qty = Number(item.quantity || 1);
    const fallbackUnit = Number(item.totalPrice || item.price || 0) / qty;
    const unit = Number(item.unitPrice ?? item.unit_price ?? fallbackUnit ?? 0);
    const total = Number(item.totalPrice ?? item.price ?? 0);
    return `${index + 1}. ${item.productName || 'Item'} x ${qty} @ ${money(unit)} = ${money(total)}`;
  });

  return [
    'SVAYIRO Invoice',
    `Invoice: ${normalized.orderRef || normalized.id}`,
    `Order ID: ${normalized.id}`,
    `Order Ref: ${normalized.orderRef || '-'}`,
    `Type: ${normalized.invoiceType === 'offline_pos' ? 'POS Bill' : 'Online Order'}`,
    `Date: ${formatDateTimeDDMMYYYY(normalized.createdAt || new Date())}`,
    '',
    `Customer: ${normalized.customerName || 'Walk-In Customer'}`,
    `Phone: ${normalized.customerPhone || '-'}`,
    `Fulfillment: ${normalized.deliveryMethod === 'delivery' ? 'Home Delivery' : 'Store Pickup / POS'}`,
    `Slot: ${normalized.selectedSlot || 'No slot'}`,
    `Address: ${orderAddressText(normalized.deliveryAddress)}`,
    '',
    'Items:',
    ...(lines.length ? lines : ['No items found']),
    '',
    `Product subtotal: ${money(normalized.amountTotal)}`,
    `Delivery charge: ${money(normalized.deliveryCharge)}`,
    `Bag charge: ${money(normalized.bagCharge)}`,
    `Discount: -${money(normalized.discountAmount)}`,
    `Grand total: ${money(normalized.finalAmount)}`,
    '',
    `Payment: ${normalized.paymentMethod || 'cod'} (${normalized.paymentStatus || 'pending'})`,
    `Reference: ${normalized.paymentRef || '-'}`,
    '',
    'Thank you for shopping with SVAYIRO.'
  ].join('\n');
}

function buildOrderInvoiceMessageWithLink(order: any, invoiceUrl: string) {
  const normalized = normalizeOrder(order);
  const websiteUrl = getPublicBaseUrl();
  if (!normalized) {
    return [
      'Namaste,',
      'Your SVAYIRO bill is ready.',
      '',
      'View / print bill:',
      invoiceUrl,
      '',
      'Shop again:',
      websiteUrl,
      '',
      'SVAYIRO',
      'Trust In Every Choice.'
    ].join('\n');
  }

  const status = String(normalized.status || 'pending').replace(/_/g, ' ').toUpperCase();
  const payment = `${normalized.paymentMethod || 'cod'} (${normalized.paymentStatus || 'pending'})`;
  const deliveredLine = normalized.status === 'delivered'
    ? 'Your order has been delivered successfully. We hope everything reached you safely and fresh.'
    : 'Your SVAYIRO order update and bill are ready.';

  return [
    `Namaste *${normalized.customerName || 'Customer'}*,`,
    deliveredLine,
    '',
    `*Order:* ${normalized.orderRef || normalized.id}`,
    `*Status:* ${status}`,
    `*Amount:* ${money(normalized.finalAmount)}`,
    `*Payment:* ${payment}`,
    '',
    '*View / print bill:*',
    invoiceUrl,
    '',
    '*Shop again:*',
    websiteUrl,
    '',
    'For support, reply to this message with your order number.',
    '*SVAYIRO*',
    '_Trust In Every Choice._'
  ].join('\n');
}

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeJsonArray(value: any) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function renderPublicInvoiceHtml(invoice: any, order: any) {
  const items = safeJsonArray(invoice.line_items || order.items);
  const status = String(order.status || 'pending').replace(/_/g, ' ');
  const paymentStatus = invoice.payment_status || order.payment_status || 'pending';
  const itemRows = items.map((item: any, index: number) => {
    const qty = Number(item.quantity || 1);
    const fallbackUnit = Number(item.totalPrice || item.price || 0) / qty;
    const unit = Number(item.unitPrice ?? item.unit_price ?? fallbackUnit ?? 0);
    const total = Number(item.totalPrice ?? item.total_price ?? item.price ?? 0);
    return `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(item.productName || item.name || 'Item')}</strong>${item.sku ? `<br><small>SKU: ${escapeHtml(item.sku)}</small>` : ''}</td>
        <td class="right">${qty}</td>
        <td class="right">${money(unit)}</td>
        <td class="right">${money(total)}</td>
      </tr>
    `;
  }).join('');

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>SVAYIRO Invoice ${escapeHtml(invoice.invoice_no)}</title>
      <style>
        body{margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif}
        .wrap{max-width:860px;margin:0 auto;padding:18px}
        .bill{background:#fff;border:1px solid #dbe3ef;border-radius:18px;padding:22px;box-shadow:0 20px 45px rgba(15,23,42,.08)}
        .top{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #0f172a;padding-bottom:14px}
        h1{margin:0;font-size:26px;letter-spacing:.08em}.muted{color:#64748b;font-size:12px;line-height:1.55}
        .badge{display:inline-flex;border-radius:999px;padding:6px 12px;font-size:11px;font-weight:900;text-transform:uppercase;background:#eef2ff;color:#1d1a8a}
        .status{background:${order.status === 'cancelled' ? '#ffe4e6' : order.status === 'delivered' ? '#dcfce7' : '#fef3c7'};color:${order.status === 'cancelled' ? '#be123c' : order.status === 'delivered' ? '#166534' : '#92400e'}}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}.box{border:1px solid #dbe3ef;padding:13px;border-radius:12px}
        .label{font-size:10px;text-transform:uppercase;font-weight:900;color:#64748b;margin-bottom:5px}
        table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border-bottom:1px solid #e2e8f0;padding:10px 7px;font-size:12px;text-align:left;vertical-align:top}
        th{background:#f8fafc;text-transform:uppercase;font-size:10px;letter-spacing:.06em}.right{text-align:right}.totals{margin-left:auto;margin-top:14px;max-width:330px}
        .total-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:13px}.grand{font-size:18px;font-weight:900;border-bottom:2px solid #0f172a}
        .actions{display:flex;justify-content:flex-end;margin-bottom:12px}.print{border:0;border-radius:12px;background:#12109b;color:#fff;font-weight:900;padding:10px 16px;cursor:pointer}
        @media(max-width:640px){.top,.grid{grid-template-columns:1fr;display:grid}.right{text-align:left}.bill{padding:16px}.wrap{padding:10px}table{font-size:11px}.totals{max-width:none}}
        @media print{body{background:#fff}.wrap{padding:0}.actions{display:none}.bill{box-shadow:none;border:0;border-radius:0}}
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="actions"><button class="print" onclick="window.print()">Print / Save PDF</button></div>
        <div class="bill">
          <div class="top">
            <div>
              <h1>SVAYIRO</h1>
              <div class="muted">Trust In Every Choice<br>Premium groceries, natural staples, and daily essentials</div>
            </div>
            <div class="right">
              <div class="badge">${escapeHtml(invoice.invoice_type === 'offline_pos' ? 'POS Bill' : 'Tax Invoice')}</div>
              <div class="badge status" style="margin-left:6px">${escapeHtml(status)}</div>
              <div class="muted" style="margin-top:8px">
                Invoice: <strong>${escapeHtml(invoice.invoice_no)}</strong><br>
                Order ID: <strong>${escapeHtml(order.id)}</strong><br>
                Order Ref: <strong>${escapeHtml(order.order_ref || '-')}</strong><br>
                Date: ${formatDateTimeDDMMYYYY(invoice.issued_at || order.created_at)}
              </div>
            </div>
          </div>
          <div class="grid">
            <div class="box"><div class="label">Customer</div><strong>${escapeHtml(invoice.customer_name || order.customer_name || 'Customer')}</strong><br><span class="muted">Phone: ${escapeHtml(invoice.customer_phone || order.customer_phone || '-')}</span></div>
            <div class="box"><div class="label">Fulfillment</div><strong>${order.delivery_method === 'delivery' ? 'Home Delivery' : 'Store Pickup / POS'}</strong><br><span class="muted">${escapeHtml(order.selected_slot || 'No slot')}<br>${escapeHtml(orderAddressText(invoice.billing_address || order.delivery_address))}</span></div>
          </div>
          <table><thead><tr><th>#</th><th>Item</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Line Total</th></tr></thead><tbody>${itemRows || '<tr><td colspan="5">No items found</td></tr>'}</tbody></table>
          <div class="totals">
            <div class="total-row"><span>Product subtotal</span><strong>${money(invoice.subtotal)}</strong></div>
            <div class="total-row"><span>Delivery charge</span><strong>${money(invoice.delivery_charge)}</strong></div>
            <div class="total-row"><span>Bag charge</span><strong>${money(invoice.bag_charge)}</strong></div>
            <div class="total-row"><span>Discount</span><strong>- ${money(invoice.discount_amount)}</strong></div>
            <div class="total-row grand"><span>Grand Total</span><span>${money(invoice.total_amount)}</span></div>
          </div>
          <div class="grid">
            <div class="box"><div class="label">Payment</div><strong>${escapeHtml(order.payment_method || 'cod')}</strong> <span class="muted">(${escapeHtml(paymentStatus)})</span><br><span class="muted">Reference: ${escapeHtml(order.payment_ref || '-')}</span></div>
            <div class="box"><div class="label">Invoice Status</div><strong>${escapeHtml(status)}</strong><br><span class="muted">This link is protected by a private invoice token.</span></div>
          </div>
        </div>
      </div>
    </body>
  </html>`;
}

async function sendWhatsAppText(toPhone: string, body: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_GRAPH_VERSION || 'v20.0';

  if (!phoneNumberId || !accessToken) {
    const err: any = new Error('WhatsApp Business API is not configured. Add WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env.');
    err.statusCode = 503;
    throw err;
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhone,
      type: 'text',
      text: {
        preview_url: false,
        body
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err: any = new Error(data?.error?.message || 'WhatsApp API failed to send the invoice.');
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }
  return data;
}

const DEFAULT_SHOP_PROFILE = {
  name: 'SVAYIRO',
  description: '',
  tagline: '',
  logo_url: '',
  banner_url: '',
  phone: '',
  whatsapp: '',
  personal_phone: '',
  support_phone: '',
  email: '',
  address: '',
  addresses: [],
  google_maps_link: '',
  delivery_radius_km: 10,
  base_delivery_charge: 30,
  delivery_charge_per_km: 12,
  operational_timings: '07:00 AM - 09:00 PM',
  holiday_timings: '',
  is_open: true,
  holiday_mode: false,
  announcement: '',
  holiday_message: '',
  upi_id: '',
  payment_qr_code_url: '',
  delivery_slots: [],
  social_links: [],
  allow_extended_delivery: false,
  extended_delivery_message: 'Your address is outside our regular delivery area. You can choose Store Pickup or request extended delivery for owner approval.',
  extended_delivery_note: '',
  barcode_label_print_settings: { labelWidthMm: 50, labelHeightMm: 25, columnsPerRow: 2, horizontalGapMm: 0, verticalGapMm: 0 }
};

function normalizeBarcodeLabelPrintSettings(value: any) {
  const source = value && typeof value === 'object' ? value : {};
  const positive = (input: any, fallback: number) => Number.isFinite(Number(input)) && Number(input) > 0 ? Number(input) : fallback;
  const gap = (input: any, fallback: number) => Number.isFinite(Number(input)) && Number(input) >= 0 ? Number(input) : fallback;
  return {
    labelWidthMm: positive(source.labelWidthMm ?? source.label_width_mm, 50),
    labelHeightMm: positive(source.labelHeightMm ?? source.label_height_mm, 25),
    columnsPerRow: Math.max(1, Math.round(positive(source.columnsPerRow ?? source.columns_per_row, 2))),
    horizontalGapMm: gap(source.horizontalGapMm ?? source.horizontal_gap_mm, 0),
    verticalGapMm: gap(source.verticalGapMm ?? source.vertical_gap_mm, 0)
  };
}

function normalizeShopProfile(profile: any) {
  if (!profile) profile = DEFAULT_SHOP_PROFILE;
  const addressValue = profile.address;
  const addressText = typeof addressValue === 'string'
    ? addressValue
    : addressValue?.physicalAddress || addressValue?.text || '';

  return {
    ...profile,
    logoUrl: profile.logo_url || profile.logoUrl || '',
    bannerUrl: profile.banner_url || profile.bannerUrl || '',
    contactNumber: profile.phone || profile.contactNumber || '',
    whatsAppNumber: profile.whatsapp || profile.whatsAppNumber || '',
    personalPhoneNumber: profile.personal_phone || profile.personalPhoneNumber || '',
    supportPhoneNumber: profile.support_phone || profile.supportPhoneNumber || '',
    googleMapsLink: profile.google_maps_link || profile.googleMapsLink || '',
    deliveryRadius: Number(profile.delivery_radius_km ?? profile.deliveryRadius ?? 10),
    freeDeliveryRadiusKm: Number(profile.free_delivery_radius_km ?? profile.freeDeliveryRadiusKm ?? 0),
    baseDeliveryCharge: Number(profile.base_delivery_charge ?? profile.baseDeliveryCharge ?? 30),
    deliveryChargePerKm: Number(profile.delivery_charge_per_km ?? profile.deliveryChargePerKm ?? 12),
    workingHours: profile.operational_timings || profile.workingHours || '07:00 AM - 09:00 PM',
    holidayTimings: profile.holiday_timings || profile.holidayTimings || '',
    isOpen: normalizeBoolean(profile.is_open ?? profile.isOpen, true),
    isHolidayMode: normalizeBoolean(profile.holiday_mode ?? profile.isHolidayMode, false),
    announcement: profile.announcement || profile.announcements?.[0]?.message || profile.announcement_text || '',
    holidayMessage: profile.holiday_message || profile.holidayMessage || '',
    upiId: profile.upi_id || profile.upiId || '',
    paymentQrCodeUrl: profile.payment_qr_code_url || profile.paymentQrCodeUrl || '',
    deliverySlots: normalizeJsonArray(profile.delivery_slots || profile.deliverySlots),
    socialLinks: normalizeJsonArray(profile.social_links || profile.socialLinks),
    addresses: normalizeJsonArray(profile.addresses || addressValue?.branches),
    allowExtendedDelivery: normalizeBoolean(profile.allow_extended_delivery ?? profile.allowExtendedDelivery, false),
    extendedDeliveryMessage: profile.extended_delivery_message || profile.extendedDeliveryMessage || DEFAULT_SHOP_PROFILE.extended_delivery_message,
    extendedDeliveryNote: profile.extended_delivery_note || profile.extendedDeliveryNote || '',
    barcodeLabelPrintSettings: normalizeBarcodeLabelPrintSettings(profile.barcode_label_print_settings || profile.barcodeLabelPrintSettings),
    address: addressText
  };
}

function normalizeProduct(product: any, imageRows: any[] = []) {
  if (!product) return null;
  const metadata = product.metadata || {};
  const rawImages = Array.isArray(product.images) ? product.images : imageRows;
  const images = rawImages
    .map((image: any) => typeof image === 'string' ? image : image?.url)
    .filter((url: any) => typeof url === 'string' && url.trim());
  const categoryIds = Array.isArray(product.category_ids)
    ? product.category_ids.filter((id: any) => typeof id === 'string' && id.trim())
    : Array.isArray(product.categoryIds)
      ? product.categoryIds.filter((id: any) => typeof id === 'string' && id.trim())
      : [product.category_id || product.categoryId, product.subcategory_id || product.subcategoryId].filter(Boolean);

  return {
    ...product,
    name: product.name || '',
    description: product.description || '',
    sku: product.sku || '',
    categoryId: product.category_id || product.categoryId || '',
    subcategoryId: product.subcategory_id || product.subcategoryId || undefined,
    categoryIds: Array.from(new Set(categoryIds)),
    basePrice: Number(product.base_price ?? product.basePrice ?? 0),
    offerPrice: Number(product.offer_price ?? product.offerPrice ?? 0),
    stockCount: Number(product.stock_count ?? product.stockCount ?? 0),
    weight: Number(product.weight_grams ?? product.weight ?? 0),
    unit: metadata.unit || product.unit || 'g',
    packageQuantity: Number(metadata.packageQuantity ?? product.packageQuantity ?? 0),
    packageLabel: metadata.packageLabel || product.packageLabel || '',
    isEnabled: product.is_enabled !== undefined ? Boolean(product.is_enabled) : product.isEnabled !== undefined ? Boolean(product.isEnabled) : true,
    lowStockAlertThreshold: Number(product.low_stock_threshold ?? product.lowStockAlertThreshold ?? 5),
    purchasePrice: Number(metadata.purchasePrice ?? product.purchasePrice ?? 0),
    isDailyEssential: Boolean(metadata.isDailyEssential ?? product.isDailyEssential ?? false),
    isFeatured: Boolean(metadata.isFeatured ?? product.isFeatured ?? false),
    isLooseItem: Boolean(metadata.isLooseItem ?? product.isLooseItem ?? false),
    looseSection: metadata.looseSection || product.looseSection || '',
    pluCode: metadata.pluCode || product.pluCode || '',
    stockUnit: metadata.stockUnit || product.stockUnit || 'g',
    sellingUnit: metadata.sellingUnit || product.sellingUnit || metadata.unit || product.unit || 'kg',
    ratingAverage: Number(metadata.rating_average ?? metadata.ratingAverage ?? product.ratingAverage ?? 0),
    ratingCount: Number(metadata.rating_count ?? metadata.ratingCount ?? product.ratingCount ?? 0),
    images,
    createdAt: product.created_at || product.createdAt,
    updatedAt: product.updated_at || product.updatedAt
  };
}

function normalizeProductSummary(product: any) {
  const normalized = normalizeProduct(product, product.first_image_url ? [{ url: product.first_image_url }] : []);
  if (!normalized) return null;
  const metadata = { ...(normalized.metadata || {}) };
  if (product.recommendation_score !== undefined) {
    metadata.recommendationScore = Number(product.recommendation_score || 0);
  }
  if (product.recommendation_reason) {
    metadata.recommendationReason = product.recommendation_reason;
  }
  return {
    id: normalized.id,
    categoryId: normalized.categoryId,
    categoryIds: normalized.categoryIds,
    subcategoryId: normalized.subcategoryId,
    sku: normalized.sku,
    name: normalized.name,
    slug: normalized.slug || '',
    description: normalized.description,
    basePrice: normalized.basePrice,
    offerPrice: normalized.offerPrice,
    stockCount: normalized.stockCount,
    weight: normalized.weight,
    unit: normalized.unit,
    packageQuantity: normalized.packageQuantity,
    packageLabel: normalized.packageLabel,
    isEnabled: normalized.isEnabled,
    lowStockAlertThreshold: normalized.lowStockAlertThreshold,
    metadata,
    images: normalized.images?.slice(0, 1) || [],
    ratingAverage: normalized.ratingAverage,
    ratingCount: normalized.ratingCount,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    purchasePrice: normalized.purchasePrice,
    isDailyEssential: normalized.isDailyEssential,
    isFeatured: normalized.isFeatured,
    isLooseItem: normalized.isLooseItem,
    looseSection: normalized.looseSection,
    pluCode: normalized.pluCode,
    stockUnit: normalized.stockUnit,
    sellingUnit: normalized.sellingUnit
  };
}

function normalizeBarcodeValue(value: any) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase().slice(0, 100);
}

// Product labels are rendered as UPC-A. Keep the exact printed 12-digit value
// in the database too, so scanners can resolve SVAYIRO's own labels as well as
// externally supplied package barcodes.
function generatedProductUpcValue(value: any) {
  const source = String(value || '').replace(/\D/g, '');
  let digits = source.length >= 11 ? source.slice(0, 11) : '';
  if (!digits) {
    const label = String(value || '');
    const seed = [...label].reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 100000000000, 0);
    digits = String(seed).padStart(11, '0');
  }
  const checksum = [...digits].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return `${digits}${(10 - (checksum % 10)) % 10}`;
}

async function syncGeneratedProductBarcode(client: any, productId: string, sku: any) {
  const barcode = generatedProductUpcValue(sku);
  await client.query(
    `INSERT INTO product_barcodes(product_id, barcode_value, barcode_type, is_primary, created_at)
     VALUES($1,$2,'SVAYIRO',true,now())
     ON CONFLICT (barcode_value) DO NOTHING`,
    [productId, barcode]
  );
}

function normalizeExternalBarcodes(input: any) {
  const rows = Array.isArray(input) ? input : [];
  const values = rows
    .map((row) => typeof row === 'string' ? row : row?.barcodeValue || row?.barcode_value || row?.value)
    .map(normalizeBarcodeValue)
    .filter((value) => /^[A-Z0-9-]{4,100}$/.test(value));
  return Array.from(new Set(values));
}

function normalizeProductBarcode(row: any) {
  return {
    id: row.id,
    productId: row.product_id || row.productId,
    barcodeValue: row.barcode_value || row.barcodeValue,
    barcodeType: row.barcode_type || row.barcodeType || 'EAN/UPC',
    isPrimary: Boolean(row.is_primary ?? row.isPrimary ?? false),
    createdAt: row.created_at || row.createdAt
  };
}

async function syncProductBarcodes(client: any, productId: string, barcodes: any) {
  const unique = normalizeExternalBarcodes(barcodes);
  await client.query('DELETE FROM product_barcodes WHERE product_id = $1', [productId]);
  for (let i = 0; i < unique.length; i++) {
    await client.query(
      'INSERT INTO product_barcodes(product_id, barcode_value, barcode_type, is_primary, created_at) VALUES($1,$2,$3,$4,now())',
      [productId, unique[i], 'EAN/UPC', i === 0]
    );
  }
}

function normalizeCategory(category: any) {
  if (!category) return null;
  return {
    ...category,
    parentId: category.parent_id || category.parentId || undefined,
    imageUrl: category.image_url || category.imageUrl || '',
    isEnabled: category.is_enabled !== undefined ? Boolean(category.is_enabled) : category.isEnabled !== undefined ? Boolean(category.isEnabled) : true,
    order: Number(category.position ?? category.order ?? 0),
    createdAt: category.created_at || category.createdAt,
    updatedAt: category.updated_at || category.updatedAt
  };
}

function uniqueCategoryIds(input: any, fallbackCategoryId?: string | null, fallbackSubcategoryId?: string | null) {
  const raw = Array.isArray(input) ? input : [];
  return Array.from(new Set([...raw, fallbackCategoryId, fallbackSubcategoryId]
    .map((id) => typeof id === 'string' ? id.trim() : '')
    .filter(Boolean)));
}

async function syncProductCategories(client: any, productId: string, categoryIds: string[], primaryCategoryId?: string | null) {
  await client.query('DELETE FROM product_categories WHERE product_id = $1', [productId]);
  for (const categoryId of categoryIds) {
    await client.query(
      'INSERT INTO product_categories(product_id, category_id, is_primary, created_at) VALUES($1,$2,$3,now()) ON CONFLICT (product_id, category_id) DO UPDATE SET is_primary = EXCLUDED.is_primary',
      [productId, categoryId, categoryId === primaryCategoryId]
    );
  }
}

function normalizeBanner(banner: any) {
  if (!banner) return null;
  const linkValue = banner.link || banner.link_id || banner.linkId || '';
  const inferredType = /^https?:\/\//i.test(String(linkValue)) ? 'url' : (linkValue ? 'category' : 'none');
  const linkType = banner.link_type || banner.linkType || inferredType;
  return {
    ...banner,
    imageUrl: banner.image_url || banner.imageUrl || '',
    linkType,
    linkId: linkValue,
    position: Number(banner.position ?? 0),
    isEnabled: banner.is_enabled !== undefined ? Boolean(banner.is_enabled) : banner.isEnabled !== undefined ? Boolean(banner.isEnabled) : true,
    createdAt: banner.created_at || banner.createdAt
  };
}

function normalizeCoupon(coupon: any) {
  if (!coupon) return null;
  const metadata = coupon.metadata || {};
  const usageLimit = coupon.usageLimit ?? coupon.max_uses ?? coupon.maxUses ?? null;
  const expiryValue = coupon.expiryDate ?? coupon.expires_at ?? coupon.expiresAt ?? '';
  return {
    ...coupon,
    discountType: coupon.discount_type || coupon.discountType || 'flat',
    discountValue: Number(coupon.discount_value ?? coupon.discountValue ?? 0),
    minOrderValue: Number(coupon.min_order_value ?? coupon.minOrderValue ?? 0),
    maxUses: usageLimit,
    usageLimit,
    currentUsage: Number(metadata.currentUsage ?? metadata.current_usage ?? coupon.currentUsage ?? 0),
    expiryDate: expiryValue ? (typeof expiryValue === 'string' ? expiryValue.slice(0, 10) : expiryValue.toISOString().slice(0, 10)) : '',
    createdAt: coupon.created_at || coupon.createdAt,
    updatedAt: coupon.updated_at || coupon.updatedAt
  };
}

function normalizeCampaign(campaign: any) {
  if (!campaign) return null;
  return {
    ...campaign,
    id: campaign.id,
    name: campaign.name || '',
    occasion: campaign.occasion || 'custom',
    audience: campaign.audience || 'all',
    title: campaign.title || campaign.name || '',
    subtitle: campaign.subtitle || '',
    startDate: dateOnlyValue(campaign.start_date || campaign.startDate),
    endDate: dateOnlyValue(campaign.end_date || campaign.endDate),
    bannerImageUrl: campaign.banner_image_url || campaign.bannerImageUrl || '',
    couponId: campaign.coupon_id || campaign.couponId || null,
    couponCode: campaign.coupon_code || campaign.couponCode || '',
    priority: Number(campaign.priority || 0),
    isActive: campaign.is_active !== undefined ? Boolean(campaign.is_active) : campaign.isActive !== undefined ? Boolean(campaign.isActive) : true,
    productIds: Array.isArray(campaign.product_ids) ? campaign.product_ids : Array.isArray(campaign.productIds) ? campaign.productIds : [],
    categoryIds: Array.isArray(campaign.category_ids) ? campaign.category_ids : Array.isArray(campaign.categoryIds) ? campaign.categoryIds : [],
    products: Array.isArray(campaign.products) ? campaign.products : [],
    metadata: campaign.metadata || {},
    createdAt: campaign.created_at || campaign.createdAt,
    updatedAt: campaign.updated_at || campaign.updatedAt
  };
}

function normalizeAdvanceRequest(request: any) {
  if (!request) return null;
  return {
    ...request,
    userId: request.user_id || request.userId || null,
    customerName: request.customer_name || request.customerName || 'Guest',
    customerPhone: request.customer_phone || request.customerPhone || '',
    productName: request.product_name || request.productName || '',
    quantity: Number(request.quantity || 1),
    targetDate: request.target_date
      ? (typeof request.target_date === 'string' ? request.target_date.slice(0, 10) : request.target_date.toISOString().slice(0, 10))
      : request.targetDate,
    orderId: request.order_id || request.orderId || null,
    createdAt: request.created_at || request.createdAt,
    updatedAt: request.updated_at || request.updatedAt
  };
}

function normalizeBag(bag: any, index = 0) {
  if (!bag) return null;
  return {
    ...bag,
    size: bag.size || bag.size_label || `Bag ${index + 1}`,
    capacityGrams: Number(bag.capacityGrams ?? bag.capacity_grams ?? 0),
    price: Number(bag.price ?? 0),
    isEnabled: bag.is_enabled !== undefined ? Boolean(bag.is_enabled) : bag.isEnabled !== undefined ? Boolean(bag.isEnabled) : true,
    position: Number(bag.position ?? index),
    createdAt: bag.created_at || bag.createdAt,
    updatedAt: bag.updated_at || bag.updatedAt
  };
}

function shouldDeferOrderEffects(paymentMethod: string, paymentStatus: string, orderStatus: string) {
  if (orderStatus === 'pending_delivery_approval' || orderStatus === 'delivery_rejected') return true;
  if (['upi', 'cashfree'].includes(String(paymentMethod || '').toLowerCase()) && paymentStatus !== 'paid') return true;
  return false;
}

app.post('/api/orders', authMiddleware, async (req, res) => {
  const payload = req.body;
  const uid = (req as any).user?.id;
  if (!uid) return res.status(401).json({ error: 'Not authenticated' });

  const errors = validateOrderPayload(payload);
  if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

  try {
    const deliveryMethodValue = payload.deliveryMethod || 'delivery';
    let deliveryChargeValue = 0;
    let deliveryRouteMeta: any = null;
    let selectedShopBranch: any = null;
    let isOutOfRangeDelivery = false;
    let normalizedShopProfile: any = null;

    if (deliveryMethodValue === 'delivery') {
      const address = payload.deliveryAddress || {};
      const destLat = Number(address.lat);
      const destLng = Number(address.lng);
      if (!Number.isFinite(destLat) || !Number.isFinite(destLng) || Math.abs(destLat) > 90 || Math.abs(destLng) > 180) {
        throw new Error('Pinned delivery location is required before placing a delivery order.');
      }

      const shopRes = await pgQuery('SELECT * FROM shop_profile ORDER BY created_at DESC LIMIT 1');
      const shopProfile = normalizeShopProfile(shopRes.rows?.[0] || null);
      normalizedShopProfile = shopProfile;
      const branches = Array.isArray(shopProfile.addresses) ? shopProfile.addresses : [];
      selectedShopBranch = branches.find((branch: any) => branch.id && branch.id === payload.shopBranchId)
        || branches.find((branch: any) => branch.isDefault)
        || branches[0];

      const originLat = Number(selectedShopBranch?.lat);
      const originLng = Number(selectedShopBranch?.lng);
      if (!selectedShopBranch || !Number.isFinite(originLat) || !Number.isFinite(originLng) || Math.abs(originLat) > 90 || Math.abs(originLng) > 180) {
        throw new Error('Pinned shop branch location is required before placing a delivery order.');
      }

      let route: any;
      if (hasGoogleMapsKey()) {
        try {
          route = await getGoogleRouteDistance(originLat, originLng, destLat, destLng);
        } catch (err: any) {
          route = estimateByPinnedCoordinates(originLat, originLng, destLat, destLng);
          if (!route) throw err;
          route.isEstimate = true;
          route.warning = err.message || 'Google Maps route calculation failed; using free coordinate estimate.';
        }
      } else {
        route = estimateByPinnedCoordinates(originLat, originLng, destLat, destLng);
        if (!route) {
          throw new Error('Pinned shop and customer coordinates are required before placing a delivery order.');
        }
        route.isEstimate = true;
        route.warning = 'Google Maps is not configured. Delivery distance is estimated using pinned coordinates.';
      }
      const maxDeliveryRadius = Number(shopProfile.deliveryRadius || 10);
      if (route.distanceKm > maxDeliveryRadius) {
        isOutOfRangeDelivery = true;
        if (!shopProfile.allowExtendedDelivery || !payload.extendedDeliveryRequested) {
          throw new Error(shopProfile.extendedDeliveryMessage || `Selected delivery address (${route.distanceKm} km) exceeds the maximum delivery radius of ${maxDeliveryRadius} km. Choose Store Pickup or request extended delivery approval.`);
        }
      }

      const freeRadius = Math.max(0, Number(shopProfile.freeDeliveryRadiusKm || 0));
      const billableDistanceKm = isOutOfRangeDelivery ? 0 : Math.max(0, route.distanceKm - freeRadius);
      deliveryChargeValue = billableDistanceKm > 0
        ? Math.round(Number(shopProfile.baseDeliveryCharge || 30) + (billableDistanceKm * Number(shopProfile.deliveryChargePerKm || 12)))
        : 0;
      deliveryRouteMeta = {
        shopBranchId: selectedShopBranch.id || null,
        shopBranchName: selectedShopBranch.branchName || null,
        distanceKm: route.distanceKm,
        distanceText: route.distanceText,
        durationText: route.durationText,
        source: route.source,
        isEstimate: Boolean(route.isEstimate),
        warning: route.warning || null,
        freeRadiusKm: freeRadius,
        billableDistanceKm,
        maxRadiusKm: maxDeliveryRadius,
        outsideCoverage: isOutOfRangeDelivery,
        extendedDeliveryRequested: Boolean(payload.extendedDeliveryRequested),
        deliveryApprovalRequired: isOutOfRangeDelivery,
        extendedDeliveryNote: isOutOfRangeDelivery ? (shopProfile.extendedDeliveryNote || null) : null
      };
    }

    const result = await runTransaction(async (client) => {
      // Lock all product rows involved
      const ids = payload.items.map(i => i.productId);
      const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(',');
      const prodQ = await client.query(`SELECT * FROM products WHERE id IN (${placeholders}) FOR UPDATE`, ids);
      if (prodQ.rowCount !== ids.length) throw new Error('One or more products not found');
      const categoryRows = await client.query(
        'SELECT product_id, array_agg(category_id ORDER BY is_primary DESC, created_at ASC) AS category_ids FROM product_categories WHERE product_id = ANY($1::uuid[]) GROUP BY product_id',
        [ids]
      );
      const categoryMap = new Map<string, string[]>();
      for (const row of categoryRows.rows) {
        categoryMap.set(String(row.product_id), Array.isArray(row.category_ids) ? row.category_ids.map(String) : []);
      }

      // Map products
      const prodMap = new Map<string, any>();
      for (const r of prodQ.rows) prodMap.set(r.id, { ...r, category_ids: categoryMap.get(String(r.id)) || [] });

      // Validate stock and compute totals
      let productTotal = 0;
      const orderItems: Array<{ product_id: string | null; name: string; sku: string | null; quantity: number; unit_price: number; base_unit_price: number; purchase_unit_cost: number; total_price: number; total_base_price: number; item_discount: number; weight_grams: number; stock_quantity?: number; displayQuantityLabel?: string; isLooseItem?: boolean }> = [];
      for (const it of payload.items) {
        const p = prodMap.get(it.productId);
        if (!p) throw new Error(`Product ${it.productId} not found`);
        const productMetadata = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
        const isLooseItem = Boolean(productMetadata.isLooseItem || it.isLooseLabel);
        const stockQuantity = isLooseItem ? nonNegativeInteger(it.stockQuantity ?? it.quantity, 0) : nonNegativeInteger(it.quantity, 0);
        const lineQuantity = isLooseItem ? looseQuantityFactor(productMetadata, stockQuantity) : stockQuantity;
        if (stockQuantity <= 0 || lineQuantity <= 0) throw new Error(`Invalid quantity for ${p.name}`);
        if (p.stock_count < stockQuantity) throw new Error(`Insufficient stock for ${p.name}`);
        const baseUnitPrice = Number(p.base_price || 0);
        const unitPrice = (p.offer_price && Number(p.offer_price) > 0) ? Number(p.offer_price) : baseUnitPrice;
        const totalPrice = unitPrice * lineQuantity;
        const totalBasePrice = baseUnitPrice * lineQuantity;
        const itemDiscount = Math.max(0, totalBasePrice - totalPrice);
        productTotal += totalPrice;
        const purchaseUnitCost = Number(productMetadata.purchasePrice || 0);
        if (purchaseUnitCost <= 0) throw new Error(`Real item cost is missing for ${p.name}. Update product purchase price first.`);
        const displayQuantityLabel = isLooseItem ? (it.displayQuantityLabel || looseQuantityLabel(stockQuantity, normalizeLooseStockUnit(productMetadata.stockUnit))) : undefined;
        orderItems.push({
          product_id: p.id,
          name: displayQuantityLabel ? `${p.name} (${displayQuantityLabel})` : p.name,
          sku: p.sku,
          quantity: isLooseItem ? stockQuantity : lineQuantity,
          unit_price: isLooseItem ? (stockQuantity > 0 ? totalPrice / stockQuantity : unitPrice) : unitPrice,
          base_unit_price: isLooseItem ? (stockQuantity > 0 ? totalBasePrice / stockQuantity : baseUnitPrice) : baseUnitPrice,
          purchase_unit_cost: purchaseUnitCost,
          total_price: totalPrice,
          total_base_price: totalBasePrice,
          item_discount: itemDiscount,
          weight_grams: isLooseItem
            ? (normalizeLooseStockUnit(productMetadata.stockUnit) === 'g' ? stockQuantity : normalizeLooseStockUnit(productMetadata.stockUnit) === 'ml' ? Math.round(stockQuantity * 0.95) : Number(p.weight_grams || 0) * stockQuantity)
            : Number(p.weight_grams || 0),
          stock_quantity: stockQuantity,
          displayQuantityLabel,
          isLooseItem
        });
      }

      const paymentMethod = ['cod', 'upi', 'cashfree'].includes(String(payload.paymentMethod || '').toLowerCase())
        ? String(payload.paymentMethod).toLowerCase()
        : 'cod';
      const paymentStatus = ['pending', 'paid', 'failed', 'submitted', 'user_dropped'].includes(String(payload.paymentStatus || '').toLowerCase())
        ? String(payload.paymentStatus).toLowerCase()
        : 'pending';
      const orderStatus = isOutOfRangeDelivery ? 'pending_delivery_approval' : 'pending';
      const paymentRef = ['upi', 'cashfree'].includes(paymentMethod) ? (payload.upiReference || payload.paymentRef || null) : null;
      let bagChargeValue = 0;
      if ((payload.bagOption || 'need') === 'need') {
        const bagRows = await client.query('SELECT * FROM bags WHERE is_enabled = true ORDER BY position ASC');
        const totalBagWeightGrams = orderItems.reduce((sum: number, item: any) => sum + Number(item.weight_grams || 0) * Number(item.quantity || 0), 0);
        const calculatedBags = computeSmartBags(totalBagWeightGrams, bagRows.rows);
        bagChargeValue = calculatedBags.reduce((sum: number, bag: any) => sum + Number(bag.cost || 0), 0);
      }
      let discountAmountValue = 0;
      const customerPhone = normalizePhone(payload.customerPhone);
      if (!isValidIndianMobile(customerPhone)) throw new Error('Valid 10-digit customer phone number is required');
      if (deliveryMethodValue === 'delivery') {
        const address = payload.deliveryAddress || {};
        const lat = Number(address.lat);
        const lng = Number(address.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          throw new Error('Pinned delivery location is required before placing a delivery order.');
        }
      }
      const couponCode = payload.couponCode ? String(payload.couponCode).toUpperCase().trim() : '';
      if (couponCode) {
        const couponRes = await client.query('SELECT * FROM coupons WHERE code = $1 FOR UPDATE', [couponCode]);
        if (couponRes.rowCount === 0) throw new Error('Coupon code is invalid');
        const coupon = couponRes.rows[0];
        const now = new Date();
        const birthdayCoupon = isBirthdayCoupon(coupon, couponCode);
        const welcomeCoupon = isWelcomeCoupon(coupon, couponCode);
        if (!birthdayCoupon && !welcomeCoupon && coupon.expires_at && new Date(coupon.expires_at) < now) throw new Error('Coupon code has expired');
        const metadata = coupon.metadata || {};
        const currentUsage = Number(metadata.currentUsage ?? metadata.current_usage ?? 0);
        if (!birthdayCoupon && !welcomeCoupon && coupon.max_uses !== null && coupon.max_uses !== undefined && Number(coupon.max_uses) > 0 && currentUsage >= Number(coupon.max_uses)) {
          throw new Error('Coupon code limit reached');
        }
        await validateBirthdayCouponUse(client, (req as any).currentUser, coupon, couponCode, customerPhone);
        await validateWelcomeCouponUse(client, (req as any).currentUser, coupon, couponCode, customerPhone);
        await validateReferralCouponUse(client, (req as any).currentUser, coupon, couponCode);
        const campaignEligibility = await loadActiveCouponCampaignEligibility(client, coupon.id, couponCode);
        const campaignBoundCoupon = Boolean(campaignEligibility) || await couponHasCampaignBinding(client, coupon.id, couponCode);
        if (campaignBoundCoupon && !campaignEligibility) {
          throw new Error('This special-offer coupon is not active right now.');
        }
        let couponDiscountBase = productTotal;
        let couponCampaignMeta: any = null;
        if (campaignEligibility) {
          const eligibleProductIds = new Set<string>(campaignEligibility.productIds);
          const eligibleCategoryIds = new Set<string>(campaignEligibility.categoryIds);
          if (eligibleProductIds.size === 0 && eligibleCategoryIds.size === 0) {
            throw new Error('This campaign coupon has no eligible products configured.');
          }
          couponDiscountBase = orderItems.reduce((sum, item) => {
            const product = prodMap.get(item.product_id || '');
            return productMatchesCampaignEligibility(product, eligibleProductIds, eligibleCategoryIds)
              ? sum + Number(item.total_price || 0)
              : sum;
          }, 0);
          if (couponDiscountBase <= 0) throw new Error('This coupon is valid only for selected special offer products.');
          couponCampaignMeta = {
            campaignId: campaignEligibility.campaignId,
            campaignTitle: campaignEligibility.campaignTitle,
            eligibleProductSubtotal: couponDiscountBase
          };
        }
        if (couponDiscountBase < Number(coupon.min_order_value || 0)) throw new Error(`Minimum eligible order value for this coupon is Rs ${coupon.min_order_value}`);
        const rawDiscount = coupon.discount_type === 'percentage'
          ? Math.round((couponDiscountBase * Number(coupon.discount_value || 0)) / 100)
          : Number(coupon.discount_value || 0);
        discountAmountValue = Math.min(couponDiscountBase, Math.max(0, rawDiscount));
        (payload as any).__couponCampaignMeta = couponCampaignMeta;
      }
      const itemDiscountValue = orderItems.reduce((sum, item) => sum + Number(item.item_discount || 0), 0);
      const baseProductSubtotal = orderItems.reduce((sum, item) => sum + Number(item.total_base_price || item.total_price || 0), 0);
      const totalBeforeLoyalty = Math.max(0, productTotal + deliveryChargeValue + bagChargeValue - discountAmountValue);
      const loyaltyRedemption = await computeLoyaltyRedemption(client, uid, payload.loyaltyRedeemPoints, totalBeforeLoyalty);
      const orderRef = generateId('ord');
      const totalDiscount = itemDiscountValue + discountAmountValue + loyaltyRedemption.discount;
      const finalAmountValue = Math.max(0, baseProductSubtotal + deliveryChargeValue + bagChargeValue - totalDiscount);
      const orderRes = await client.query(`INSERT INTO orders(user_id, order_ref, customer_name, customer_phone, status, payment_method, payment_status, payment_ref, delivery_method, delivery_address, selected_slot, bag_option, items, amount_total, delivery_charge, bag_charge, discount_amount, final_amount, meta, created_at, updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now(),now()) RETURNING *`, [uid, orderRef, payload.customerName || null, customerPhone, orderStatus, paymentMethod, paymentStatus, paymentRef, deliveryMethodValue, payload.deliveryAddress || null, payload.selectedSlot || null, payload.bagOption || 'need', JSON.stringify(orderItems), baseProductSubtotal, deliveryChargeValue, bagChargeValue, totalDiscount, finalAmountValue, { couponCode: couponCode || null, itemDiscount: itemDiscountValue, couponDiscount: discountAmountValue, couponCampaign: (payload as any).__couponCampaignMeta || null, loyaltyRedeemPoints: loyaltyRedemption.points, loyaltyDiscount: loyaltyRedemption.discount, productSellingSubtotal: productTotal, deliveryRoute: deliveryRouteMeta, extendedDelivery: isOutOfRangeDelivery ? { requested: true, message: normalizedShopProfile?.extendedDeliveryMessage || null, note: normalizedShopProfile?.extendedDeliveryNote || null } : null }]);

      const orderId = orderRes.rows[0].id;
      const shouldApplyOrderEffectsNow = !shouldDeferOrderEffects(paymentMethod, paymentStatus, orderStatus);
      if (shouldApplyOrderEffectsNow && loyaltyRedemption.points > 0) {
        await addLoyaltyTransaction(client, {
          userId: uid,
          orderId,
          type: 'redeem_order',
          points: -loyaltyRedemption.points,
          amountValue: loyaltyRedemption.discount,
          metadata: { orderRef, value: loyaltyRedemption.discount }
        });
      }

      // Insert order_items and decrement stock + inventory logs
      for (const oi of orderItems) {
        await client.query('INSERT INTO order_items(order_id, product_id, name, sku, quantity, unit_price, purchase_unit_cost, total_price) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [orderId, oi.product_id, oi.name, oi.sku, oi.quantity, oi.unit_price, oi.purchase_unit_cost, oi.total_price]);
        if (shouldApplyOrderEffectsNow) {
          const p = prodMap.get(oi.product_id || '');
          if (!p) throw new Error(`Product ${oi.product_id} not found`);
        const stockDelta = Number(oi.stock_quantity ?? oi.quantity);
        const newStock = Number(p.stock_count) - stockDelta;
        await client.query('UPDATE products SET stock_count = $1, updated_at = now() WHERE id = $2', [newStock, oi.product_id]);
          await client.query('INSERT INTO inventory_logs(product_id, delta, reason, source, reference_id, metadata) VALUES($1,$2,$3,$4,$5,$6)', [oi.product_id, -stockDelta, oi.isLooseItem ? 'loose-online-order' : 'order-placement', 'order', orderId, { orderId, orderRef, displayQuantityLabel: oi.displayQuantityLabel || null }]);
        }
      }
      if (shouldApplyOrderEffectsNow && couponCode) {
        await client.query(
          `UPDATE coupons
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
             'currentUsage',
             COALESCE((metadata->>'currentUsage')::int, (metadata->>'current_usage')::int, 0) + 1,
             'current_usage',
             COALESCE((metadata->>'currentUsage')::int, (metadata->>'current_usage')::int, 0) + 1
           ),
           updated_at = now()
           WHERE code = $1`,
          [couponCode]
        );
      }
      await createPaymentRecord(client, orderRes.rows[0], {
        provider: paymentMethod === 'cashfree' ? 'cashfree' : paymentMethod === 'upi' ? 'upi' : 'manual',
        method: paymentMethod
      });
      if (shouldApplyOrderEffectsNow) {
        await createInvoiceRecord(client, orderRes.rows[0], 'online_order');
        await applyOrderRewards(client, orderRes.rows[0]);
      }

      return { order: orderRes.rows[0] };
    });

    const normalizedOrder = normalizeOrder(result.order);
    // A Cashfree row is only a payment attempt until the gateway reports PAID.
    // Do not expose or notify it as a placed order before that verification.
    if (!(normalizedOrder.paymentMethod === 'cashfree' && normalizedOrder.paymentStatus !== 'paid')) {
      await createAdminAlertRecord(null, {
        title: 'New Order Placed',
        body: `Order #${normalizedOrder.orderRef || normalizedOrder.id} placed by ${normalizedOrder.customerName || 'Customer'} for Rs ${normalizedOrder.finalAmount}.`,
        type: 'order',
        source: 'order_checkout',
        severity: normalizedOrder.status === 'pending_delivery_approval' || (['upi', 'cashfree'].includes(normalizedOrder.paymentMethod) && normalizedOrder.paymentStatus !== 'paid') ? 'warning' : 'info',
        payload: { orderId: normalizedOrder.id, orderRef: normalizedOrder.orderRef || null, customerPhone: normalizedOrder.customerPhone || null, paymentMethod: normalizedOrder.paymentMethod, paymentStatus: normalizedOrder.paymentStatus }
      });
      notifyPushUser(result.order.user_id, {
        title: 'Order received', body: `Your order #${normalizedOrder.orderRef || normalizedOrder.id} is ${normalizedOrder.status}.`, type: 'order', tag: `order-${normalizedOrder.id}`, url: '/',
        data: { orderId: normalizedOrder.id, orderRef: normalizedOrder.orderRef || null, status: normalizedOrder.status }
      });
    }
    return res.json({ success: true, order: normalizedOrder });
  } catch (err: any) {
    console.error('POST /api/orders error', err);
    return res.status(400).json({ error: err.message || 'Order placement failed' });
  }
});

// --------------------------------------------------------
// WEB PLATFORM INTEGRATION HELPER
// --------------------------------------------------------

// Simple unique ID generator
function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
}

function productCodePrefix(name: any) {
  const compact = String(name || 'ITEM').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return (compact || 'ITEM').slice(0, 4).padEnd(4, 'X');
}

async function generateUniqueProductSku(client: any, productName: string) {
  const prefix = productCodePrefix(productName);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    const sku = `SVY-${prefix}-${suffix}`;
    const exists = await client.query('SELECT 1 FROM products WHERE sku = $1 LIMIT 1', [sku]);
    if (exists.rowCount === 0) return sku;
  }
  return `SVY-${prefix}-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

const LOOSE_PLU_SECTIONS: Record<string, { label: string; start: number; end: number }> = {
  vegetables: { label: 'Vegetables', start: 101, end: 199 },
  fruits: { label: 'Fruits', start: 201, end: 299 },
  grains: { label: 'Grains', start: 301, end: 399 },
  flours: { label: 'Flours', start: 401, end: 499 },
  spices: { label: 'Spices', start: 501, end: 599 },
  dry_fruits: { label: 'Dry Fruits', start: 601, end: 699 },
  dairy: { label: 'Dairy', start: 701, end: 799 },
  other: { label: 'Other Loose Items', start: 801, end: 899 }
};

function nonNegativeNumber(value: any, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, next) : fallback;
}

function nonNegativeInteger(value: any, fallback = 0) {
  return Math.max(0, Math.floor(nonNegativeNumber(value, fallback)));
}

function normalizeLooseSection(value: any) {
  const section = String(value || 'other').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  return LOOSE_PLU_SECTIONS[section] ? section : 'other';
}

function normalizeLooseStockUnit(value: any) {
  const unit = String(value || 'g').trim().toLowerCase();
  return ['g', 'ml', 'piece'].includes(unit) ? unit : 'g';
}

function normalizeLooseSellingUnit(value: any, fallback = 'kg') {
  const unit = String(value || fallback || 'kg').trim().toLowerCase();
  return ['kg', 'g', 'liter', 'ml', 'piece'].includes(unit) ? unit : 'kg';
}

function looseQuantityLabel(baseQuantity: number, stockUnit: string) {
  if (stockUnit === 'g' && baseQuantity >= 1000) return `${Number((baseQuantity / 1000).toFixed(3))} kg`;
  if (stockUnit === 'ml' && baseQuantity >= 1000) return `${Number((baseQuantity / 1000).toFixed(3))} liter`;
  return `${Number(baseQuantity.toFixed(2)).toString().replace(/\.0+$/, '')} ${stockUnit === 'piece' && baseQuantity !== 1 ? 'pieces' : stockUnit}`;
}

function looseQuantityFactor(metadata: any, baseQuantity: number) {
  const stockUnit = normalizeLooseStockUnit(metadata?.stockUnit);
  const sellingUnit = normalizeLooseSellingUnit(metadata?.sellingUnit || metadata?.unit, metadata?.unit || 'kg');
  const packageQuantity = nonNegativeNumber(metadata?.packageQuantity, 1) || 1;
  let sellingQuantity = baseQuantity;
  if (stockUnit === 'g' && sellingUnit === 'kg') sellingQuantity = baseQuantity / 1000;
  else if (stockUnit === 'ml' && sellingUnit === 'liter') sellingQuantity = baseQuantity / 1000;
  return sellingQuantity / packageQuantity;
}

async function assertUniquePluCode(client: any, pluCode: string, excludeProductId?: string) {
  if (!pluCode) return;
  const params = [pluCode];
  let sql = "SELECT id FROM products WHERE metadata->>'pluCode' = $1";
  if (excludeProductId) {
    params.push(excludeProductId);
    sql += ' AND id <> $2';
  }
  sql += ' LIMIT 1';
  const exists = await client.query(sql, params);
  if (exists.rowCount > 0) throw new HttpError(409, `PLU ${pluCode} is already assigned to another product.`);
}

async function generateUniquePluCode(client: any, sectionValue: string) {
  const section = normalizeLooseSection(sectionValue);
  const range = LOOSE_PLU_SECTIONS[section] || LOOSE_PLU_SECTIONS.other;
  const usedRes = await client.query(
    "SELECT metadata->>'pluCode' AS plu_code FROM products WHERE metadata->>'looseSection' = $1",
    [section]
  );
  const used = new Set(usedRes.rows.map((row: any) => String(row.plu_code || '').trim()).filter(Boolean));
  for (let code = range.start; code <= range.end; code += 1) {
    if (!used.has(String(code))) return String(code);
  }
  throw new HttpError(409, `${range.label} PLU range is full.`);
}

function parseLooseLabelBarcode(value: any) {
  const raw = String(value || '').trim().replace(/\s+/g, '').toUpperCase();
  const parts = raw.split('|');
  if (parts.length !== 5 || parts[0] !== 'SVL') return null;
  const [, pluCode, quantityRaw, amountPaiseRaw, dateRaw] = parts;
  if (!/^\d{2,4}$/.test(pluCode) || !/^\d{8}$/.test(dateRaw)) return null;
  const baseQuantity = nonNegativeNumber(quantityRaw, 0);
  const amount = Math.round(nonNegativeNumber(amountPaiseRaw, 0)) / 100;
  if (baseQuantity <= 0 || amount < 0) return null;
  return {
    barcodeValue: raw,
    pluCode,
    baseQuantity,
    amount,
    packedDate: `${dateRaw.slice(6, 8)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(0, 4)}`
  };
}

function generateInvoiceNo(orderRef?: string | null) {
  const suffix = (orderRef || generateId('ord')).replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase();
  return `INV-${suffix || Date.now()}`;
}

function generateInvoiceToken() {
  return randomBytes(24).toString('hex');
}

function getPublicBaseUrl(req?: any) {
  const configured = process.env.APP_PUBLIC_URL || process.env.PUBLIC_APP_URL || process.env.APP_URL;
  if (configured && configured !== 'MY_APP_URL' && configured !== 'MY_PUBLIC_WEBSITE_URL') {
    return configured.replace(/\/+$/, '');
  }
  if (req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) return `${protocol}://${host}`;
  }
  return 'http://localhost:3000';
}

function getApiBaseUrl(req?: any) {
  const configured = process.env.API_PUBLIC_URL || process.env.APP_URL;
  if (configured && configured !== 'MY_API_URL') return configured.replace(/\/+$/, '');
  if (req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) return `${protocol}://${host}`;
  }
  return 'http://localhost:3000';
}

const CASHFREE_APP_ID = String(process.env.CASHFREE_APP_ID || '').trim();
const CASHFREE_SECRET_KEY = String(process.env.CASHFREE_SECRET_KEY || '').trim();
const CASHFREE_ENV = String(process.env.CASHFREE_ENV || 'production').trim().toLowerCase();
const CASHFREE_API_VERSION = String(process.env.CASHFREE_API_VERSION || '2025-01-01').trim();

function isCashfreeConfigured() {
  return Boolean(CASHFREE_APP_ID && CASHFREE_SECRET_KEY);
}

function cashfreeMode() {
  return 'production';
}

function assertLiveCashfreeMode() {
  if (!['production', 'prod'].includes(CASHFREE_ENV)) {
    throw new HttpError(503, 'Live Cashfree checkout is required. Set CASHFREE_ENV=production; sandbox payments are disabled.');
  }
}

function cashfreeBaseUrl() {
  return cashfreeMode() === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

function validateCashfreePublicUrl(value: string, name: string, mustIncludeOrderId = false) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(503, `${name} must be a valid public HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:' || /^(localhost|127\.0\.0\.1|::1)$/i.test(parsed.hostname)) {
    throw new HttpError(503, `${name} must use the deployed public HTTPS domain, not localhost.`);
  }
  if (mustIncludeOrderId && !value.includes('{order_id}')) {
    throw new HttpError(503, `${name} must include {order_id} so the return can be verified.`);
  }
  return value;
}

function normalizeCashfreeStatus(value: any, eventType?: any) {
  const raw = String(value || eventType || '').toUpperCase();
  if (raw.includes('SUCCESS') || raw === 'PAID') return 'paid';
  if (raw.includes('USER_DROPPED') || raw.includes('DROPPED') || raw.includes('CANCEL')) return 'user_dropped';
  if (raw.includes('FAIL')) return 'failed';
  if (raw.includes('REFUND')) return 'refunded';
  return 'pending';
}

function buildCashfreeOrderId(order: any) {
  const ref = String(order.order_ref || order.orderRef || order.id || randomBytes(8).toString('hex')).replace(/[^a-zA-Z0-9_-]/g, '');
  return `SVY_${ref.slice(0, 36)}`;
}

async function cashfreeApiRequest(pathname: string, init: RequestInit = {}) {
  assertLiveCashfreeMode();
  if (!isCashfreeConfigured()) {
    throw new HttpError(503, 'Cashfree payment gateway is not configured. Add CASHFREE_APP_ID and CASHFREE_SECRET_KEY in environment variables.');
  }
  const response = await fetch(`${cashfreeBaseUrl()}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': CASHFREE_APP_ID,
      'x-client-secret': CASHFREE_SECRET_KEY,
      'x-api-version': CASHFREE_API_VERSION,
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new HttpError(response.status, data?.message || data?.error || 'Cashfree request failed');
  }
  return data;
}

function verifyCashfreeWebhookSignature(rawBody: Buffer, signature: string, timestamp: string) {
  if (!isCashfreeConfigured()) return false;
  if (!signature || !timestamp) return false;
  // Cashfree signs the exact raw body as "timestamp.payload". Do not parse or
  // re-serialize the body before this check.
  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', CASHFREE_SECRET_KEY).update(signedPayload).digest('base64');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handleCashfreePaymentStatus(cashfreeOrderId: string, status: string, providerRef: string | null, payload: any) {
  if (!cashfreeOrderId) throw new HttpError(400, 'Cashfree order id missing');
  return runTransaction(async (client) => {
    const orderRes = await client.query(
      `SELECT o.*
       FROM orders o
       LEFT JOIN payment_records pr ON pr.order_id = o.id
       WHERE (pr.provider = 'cashfree' AND pr.provider_ref = $1)
          OR (o.meta->'cashfree'->>'orderId' = $1)
       ORDER BY o.created_at DESC
       LIMIT 1
       FOR UPDATE OF o`,
      [cashfreeOrderId]
    );
    if (orderRes.rowCount === 0) throw new HttpError(404, 'Linked SVAYIRO order not found');
    const order = orderRes.rows[0];
    await client.query(
      `UPDATE payment_records
       SET status = $1,
           provider_ref = COALESCE(provider_ref, $2),
           paid_at = CASE WHEN $1 = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END,
           payload = COALESCE(payload, '{}'::jsonb) || $3::jsonb,
           updated_at = now()
       WHERE order_id = $4 AND provider = 'cashfree'`,
      [status, cashfreeOrderId, JSON.stringify({ latest: payload, providerRef }), order.id]
    );
    await client.query(
      `UPDATE orders
       SET payment_status = $1,
           payment_ref = COALESCE($2, payment_ref),
           meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
             'cashfree', COALESCE(meta->'cashfree', '{}'::jsonb) || jsonb_build_object(
               'orderId', $3::text,
               'paymentId', $2::text,
               'status', $1::text,
               'lastPayload', $4::jsonb
             )
           ),
           updated_at = now()
       WHERE id = $5`,
      [status, providerRef, cashfreeOrderId, JSON.stringify(payload || {}), order.id]
    );
    const fresh = await client.query('SELECT * FROM orders WHERE id = $1', [order.id]);
    const current = fresh.rows[0];
    if (status === 'paid' && current.status !== 'pending_delivery_approval' && current.status !== 'delivery_rejected') {
      await finalizePaidOrderEffects(client, current);
    }
    return current;
  });
}

// A Cashfree checkout creates a payment attempt first.  It is deliberately not
// announced as an order until Cashfree has verified it as paid server-side.
async function announceVerifiedCashfreeOrder(order: any) {
  if (!order?.id || order.payment_status !== 'paid') return;
  const shouldAnnounce = await runTransaction(async (client) => {
    const result = await client.query('SELECT meta FROM orders WHERE id = $1 FOR UPDATE', [order.id]);
    if (result.rowCount === 0 || result.rows[0]?.meta?.cashfreeOrderAnnounced) return false;
    await client.query(
      `UPDATE orders
       SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('cashfreeOrderAnnounced', true, 'cashfreeOrderAnnouncedAt', now()::text),
           updated_at = now()
       WHERE id = $1`,
      [order.id]
    );
    return true;
  });
  if (!shouldAnnounce) return;

  const normalized = normalizeOrder(order);
  await createAdminAlertRecord(null, {
    title: 'Paid Cashfree Order Received',
    body: `Order #${normalized.orderRef || normalized.id} was verified as paid by Cashfree for Rs ${normalized.finalAmount}.`,
    type: 'order',
    source: 'cashfree_payment_verified',
    severity: 'info',
    payload: { orderId: normalized.id, orderRef: normalized.orderRef || null, paymentMethod: 'cashfree', paymentStatus: 'paid' }
  });
  notifyPushUser(order.user_id, {
    title: 'Payment verified — order placed',
    body: `Your payment for order #${normalized.orderRef || normalized.id} was verified successfully.`,
    type: 'order',
    tag: `order-${normalized.id}`,
    url: '/',
    data: { orderId: normalized.id, orderRef: normalized.orderRef || null, status: normalized.status }
  });
}

async function cashfreeWebhookHandler(req: any, res: any) {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    const signature = String(req.headers['x-webhook-signature'] || '');
    const timestamp = String(req.headers['x-webhook-timestamp'] || '');
    if (!verifyCashfreeWebhookSignature(rawBody, signature, timestamp)) {
      return res.status(401).json({ error: 'Invalid Cashfree webhook signature' });
    }
    const event = JSON.parse(rawBody.toString('utf8') || '{}');
    const data = event?.data || {};
    const cashfreeOrderId = data?.order?.order_id || event?.order_id || data?.order_id || '';
    const payment = data?.payment || {};
    const status = normalizeCashfreeStatus(payment?.payment_status || data?.payment_status, event?.type);
    const providerRef = payment?.cf_payment_id || payment?.bank_reference || event?.cf_payment_id || null;
    const order = await handleCashfreePaymentStatus(cashfreeOrderId, status, providerRef ? String(providerRef) : null, event);
    await announceVerifiedCashfreeOrder(order);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('POST /api/payments/cashfree/webhook error', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Cashfree webhook failed' });
  }
}

async function ensureInvoicePublicToken(client: any, invoice: any) {
  if (invoice?.public_token) return invoice;
  const token = generateInvoiceToken();
  const result = await client.query(
    'UPDATE invoices SET public_token = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [token, invoice.id]
  );
  return result.rows[0] || { ...invoice, public_token: token };
}

function invoicePublicUrl(req: any, invoice: any) {
  // Invoices are served by this API. The customer storefront can be in
  // "Coming Soon" mode while POS billing still needs to remain available.
  return `${getApiBaseUrl(req)}/invoice/${encodeURIComponent(invoice.invoice_no)}?token=${encodeURIComponent(invoice.public_token)}`;
}

async function createInvoiceRecord(client: any, order: any, invoiceType = 'online_order') {
  const normalized = normalizeOrder(order);
  if (!normalized) return null;
  const existing = await client.query('SELECT * FROM invoices WHERE order_id = $1 LIMIT 1', [normalized.id]);
  if (existing.rowCount > 0) return ensureInvoicePublicToken(client, existing.rows[0]);
  const invoiceText = buildOrderInvoiceMessage(normalized);
  const invoiceNo = generateInvoiceNo(normalized.orderRef || normalized.id);
  const publicToken = generateInvoiceToken();
  try {
    const result = await client.query(
      `INSERT INTO invoices(
        order_id, invoice_no, invoice_type, customer_name, customer_phone, billing_address,
        line_items, subtotal, delivery_charge, bag_charge, discount_amount, total_amount,
        payment_status, invoice_text, metadata, public_token, issued_at, created_at, updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now(),now())
      RETURNING *`,
      [
        normalized.id,
        invoiceNo,
        invoiceType,
        normalized.customerName || null,
        normalized.customerPhone || null,
        normalized.deliveryAddress || null,
        JSON.stringify(normalized.items || []),
        normalized.amountTotal || 0,
        normalized.deliveryCharge || 0,
        normalized.bagCharge || 0,
        normalized.discountAmount || 0,
        normalized.finalAmount || 0,
        normalized.paymentStatus || 'pending',
        invoiceText,
        { orderId: normalized.id, orderRef: normalized.orderRef || null },
        publicToken
      ]
    );
    return result.rows[0] || null;
  } catch (err: any) {
    if (err?.code === '23505') {
      const fallback = await client.query('SELECT * FROM invoices WHERE order_id = $1 OR invoice_no = $2 LIMIT 1', [normalized.id, invoiceNo]);
      return fallback.rows[0] ? ensureInvoicePublicToken(client, fallback.rows[0]) : null;
    }
    throw err;
  }
}

async function createPaymentRecord(client: any, order: any, overrides: any = {}) {
  const normalized = normalizeOrder(order);
  if (!normalized) return null;
  const result = await client.query(
    `INSERT INTO payment_records(
      order_id, user_id, provider, provider_ref, method, amount, currency, status, paid_at, payload, created_at, updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())
    RETURNING *`,
    [
      normalized.id,
      normalized.userId || null,
      overrides.provider || (normalized.paymentMethod === 'upi' ? 'upi' : normalized.paymentMethod === 'cashfree' ? 'cashfree' : 'manual'),
      overrides.providerRef ?? normalized.paymentRef ?? null,
      overrides.method || normalized.paymentMethod || 'cod',
      overrides.amount ?? normalized.finalAmount ?? 0,
      overrides.currency || 'INR',
      overrides.status || normalized.paymentStatus || 'pending',
      overrides.paidAt || (normalized.paymentStatus === 'paid' ? new Date() : null),
      overrides.payload || {}
    ]
  );
  return result.rows[0] || null;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';

// Simple auth middleware for protected endpoints
async function authMiddleware(req: any, res: any, next: any) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.*)$/i);
  if (!match) return res.status(401).json({ error: 'Missing token' });
  const token = match[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = payload;
    // attach DB user from Postgres for convenience
    try {
      const ures = await pgQuery('SELECT * FROM users WHERE id = $1', [payload.id]);
      if (ures.rowCount > 0) req.currentUser = ures.rows[0];
    } catch (err) {
      console.error('Error attaching currentUser in authMiddleware', err);
    }
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Attach full user object from DB to `req.currentUser` when authenticated
async function attachUserMiddleware(req: any, res: any, next: any) {
  const uid = (req as any).user?.id;
  if (!uid) return next();
  try {
    const ures = await pgQuery('SELECT * FROM users WHERE id = $1', [uid]);
    if (ures.rowCount > 0) req.currentUser = ures.rows[0];
  } catch (err) {
    console.error('attachUserMiddleware error', err);
  }
  return next();
}

function isAdminMiddleware(req: any, res: any, next: any) {
  const user = req.currentUser || null;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  const roles = (user.roles && Array.isArray(user.roles)) ? user.roles : (typeof user.roles === 'string' ? JSON.parse(user.roles || '[]') : []);
  if (!roles.includes('admin')) return res.status(403).json({ error: 'Admin role required' });
  return next();
}

function getRequestRoles(req: any): string[] {
  const user = req.currentUser || null;
  const source = user?.roles ?? req.user?.roles ?? [];
  if (Array.isArray(source)) return source.map(String);
  if (typeof source === 'string') {
    try {
      const parsed = JSON.parse(source || '[]');
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'],
  inventory_manager: [
    'dashboard:view',
    'pos:use',
    'products:manage',
    'categories:manage',
    'inventory:manage',
    'bags:manage',
    'orders:read'
  ],
  delivery_partner: [
    'orders:read',
    'orders:delivery_read',
    'orders:delivery_update',
    'payments:collect_cod',
    'invoices:send_delivered'
  ],
  customer_care: [
    'orders:read',
    'orders:support_update',
    'complaints:manage',
    'reviews:read',
    'reviews:moderate',
    'invoices:send'
  ],
  customer: []
};

function hasPermission(req: any, permission: string) {
  const roles = getRequestRoles(req);
  return roles.some((role) => {
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes('*') || permissions.includes(permission);
  });
}

function requirePermission(permission: string) {
  return (req: any, res: any, next: any) => {
    if (!req.currentUser) return res.status(401).json({ error: 'Not authenticated' });
    if (!hasPermission(req, permission)) return res.status(403).json({ error: 'Permission denied', permission });
    return next();
  };
}

async function attachOptionalUserFromBearer(req: any) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.*)$/i);
  if (!match) return null;
  try {
    const payload = jwt.verify(match[1], JWT_SECRET) as any;
    const ures = await pgQuery('SELECT * FROM users WHERE id = $1', [payload.id]);
    if (ures.rowCount === 0) return null;
    req.user = payload;
    req.currentUser = ures.rows[0];
    return ures.rows[0];
  } catch {
    return null;
  }
}

function hasAnyRole(req: any, roles: string[]) {
  const currentRoles = getRequestRoles(req);
  return roles.some((role) => currentRoles.includes(role));
}

app.get('/api/push/public-key', (req, res) => {
  return res.json({ enabled: isWebPushConfigured, publicKey: isWebPushConfigured ? VAPID_PUBLIC_KEY : '' });
});

app.post('/api/push/subscribe', authMiddleware, async (req: any, res) => {
  if (!isWebPushConfigured) {
    return res.status(503).json({ error: 'Browser push is not configured. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.' });
  }
  const currentUser = req.currentUser;
  const subscription = req.body?.subscription || req.body;
  const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint.trim() : '';
  const p256dh = typeof subscription?.keys?.p256dh === 'string' ? subscription.keys.p256dh.trim() : '';
  const auth = typeof subscription?.keys?.auth === 'string' ? subscription.keys.auth.trim() : '';
  if (!currentUser?.id || !endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'A valid push subscription is required.' });
  }
  const requestedAudience = normalizePushAudience(req.body?.audience);
  const roles = Array.isArray(currentUser.roles) ? currentUser.roles : [];
  const canUseAdminAudience = roles.some((role: string) => ['admin', 'inventory_manager', 'delivery_partner', 'customer_care'].includes(role));
  const audience: PushAudience = requestedAudience === 'admin' && canUseAdminAudience ? 'admin' : 'customer';
  const primaryRole = audience === 'admin' ? (roles.find((role: string) => role !== 'customer') || 'admin') : 'customer';
  try {
    await pgQuery(
      `INSERT INTO push_subscriptions(user_id, role, audience, endpoint, p256dh, auth, user_agent, created_at, updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,now(),now())
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         role = EXCLUDED.role,
         audience = EXCLUDED.audience,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         updated_at = now()`,
      [currentUser.id, primaryRole, audience, endpoint, p256dh, auth, req.headers['user-agent'] || null]
    );
    return res.json({ success: true, audience });
  } catch (err) {
    console.error('POST /api/push/subscribe error', err);
    return res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

app.post('/api/push/unsubscribe', authMiddleware, async (req: any, res) => {
  const currentUser = req.currentUser;
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';
  if (!currentUser?.id || !endpoint) return res.status(400).json({ error: 'Subscription endpoint is required.' });
  try {
    await pgQuery('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [currentUser.id, endpoint]);
    return res.json({ success: true });
  } catch (err) {
    console.error('POST /api/push/unsubscribe error', err);
    return res.status(500).json({ error: 'Failed to remove push subscription' });
  }
});

const CLOUDINARY_FOLDERS: Record<string, string> = {
  products: 'svayiro/products',
  categories: 'svayiro/categories',
  banners: 'svayiro/banners',
  logo: 'svayiro/logo'
};

function canUploadImageForFolder(req: any, folderKey: string) {
  if (hasPermission(req, '*')) return true;
  if (folderKey === 'products') return hasPermission(req, 'products:manage');
  if (folderKey === 'categories') return hasPermission(req, 'categories:manage');
  return hasAnyRole(req, ['admin']);
}

function isSupportedDataImage(value: string) {
  return /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(value || '');
}

async function uploadDataImageToCloudinary(dataUrl: string, folderKey: string) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new HttpError(503, 'Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }
  const folder = CLOUDINARY_FOLDERS[folderKey] || CLOUDINARY_FOLDERS.products;
  const timestamp = Math.floor(Date.now() / 1000);
  const uniqueFilename = 'true';
  const signaturePayload = `folder=${folder}&timestamp=${timestamp}&unique_filename=${uniqueFilename}${apiSecret}`;
  const signature = createHash('sha1').update(signaturePayload).digest('hex');
  const form = new FormData();
  form.append('file', dataUrl);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('unique_filename', uniqueFilename);
  form.append('signature', signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form as any
  });
  const payload = await response.json() as any;
  if (!response.ok) {
    throw new HttpError(response.status, payload?.error?.message || 'Cloudinary upload failed.');
  }
  return {
    secureUrl: payload.secure_url,
    publicId: payload.public_id,
    width: payload.width,
    height: payload.height,
    bytes: payload.bytes,
    format: payload.format
  };
}

app.post('/api/admin/uploads/image', authMiddleware, attachUserMiddleware, async (req: any, res) => {
  const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
  const folderKey = typeof req.body?.folder === 'string' ? req.body.folder : 'products';
  try {
    if (!req.currentUser) return res.status(401).json({ error: 'Not authenticated' });
    if (!CLOUDINARY_FOLDERS[folderKey]) return res.status(400).json({ error: 'Invalid upload folder.' });
    if (!canUploadImageForFolder(req, folderKey)) return res.status(403).json({ error: 'Permission denied for image upload.' });
    if (!isSupportedDataImage(dataUrl)) return res.status(400).json({ error: 'Upload must be a compressed JPEG, PNG, or WEBP data image.' });
    const base64Bytes = Math.ceil((dataUrl.split(',')[1]?.length || 0) * 0.75);
    if (base64Bytes > 2_500_000) return res.status(400).json({ error: 'Compressed image is too large. Please use a smaller image.' });
    const upload = await uploadDataImageToCloudinary(dataUrl, folderKey);
    return res.json({ success: true, ...upload, url: upload.secureUrl });
  } catch (err: any) {
    console.error('POST /api/admin/uploads/image error', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Image upload failed.' });
  }
});

function normalizeRoleList(input: any, allowedRoles: readonly string[]) {
  const roles = Array.isArray(input) ? input : [input];
  return [...new Set(roles.map((role) => String(role || '').trim()).filter((role) => allowedRoles.includes(role)))];
}

async function generateStaffLoginId(client: any, role: string) {
  const prefix = STAFF_ROLE_PREFIX[role] || 'STAFF';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const seq = await client.query(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(staff_login_id, '\\D', '', 'g'), '')::int), 0) + 1 + $2::int AS next_no
       FROM users
       WHERE staff_login_id LIKE $1`,
      [`${prefix}-%`, attempt]
    );
    const staffLoginId = `${prefix}-${String(Number(seq.rows[0]?.next_no || 1)).padStart(4, '0')}`;
    const exists = await client.query('SELECT 1 FROM users WHERE staff_login_id = $1', [staffLoginId]);
    if (exists.rowCount === 0) return staffLoginId;
  }
  throw new Error('Unable to generate a staff ID. Try again.');
}

function primaryStaffRole(roles: string[]) {
  return roles.find((role) => (STAFF_ROLE_CODES as readonly string[]).includes(role)) || '';
}

async function syncUserRoles(client: any, userId: string, roles: string[], assignedBy?: string | null) {
  await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
  for (const roleCode of roles) {
    await client.query(
      `INSERT INTO user_roles(user_id, role_id, assigned_by)
       SELECT $1, id, $2 FROM roles WHERE code = $3
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, assignedBy || null, roleCode]
    );
  }
}

app.get('/api/admin/roles', authMiddleware, attachUserMiddleware, isAdminMiddleware, async (req, res) => {
  try {
    const { rows } = await pgQuery('SELECT * FROM roles ORDER BY code ASC');
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/admin/roles error', err);
    return res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

app.get('/api/admin/staff', authMiddleware, attachUserMiddleware, isAdminMiddleware, async (req, res) => {
  try {
    const { rows } = await pgQuery(
      `SELECT id, phone, staff_login_id, name, email, is_phone_verified, is_active, roles, metadata, created_at, updated_at
       FROM users
       WHERE roles && ARRAY['inventory_manager','delivery_partner','customer_care']::text[]
         AND NOT (roles @> ARRAY['admin']::text[])
       ORDER BY created_at DESC`
    );
    return res.json(rows.map(normalizeUser));
  } catch (err) {
    console.error('GET /api/admin/staff error', err);
    return res.status(500).json({ error: 'Failed to fetch staff users' });
  }
});

app.post('/api/admin/staff', authMiddleware, attachUserMiddleware, isAdminMiddleware, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const role = String(req.body.role || '').trim();
  const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : true;
  const roles = normalizeRoleList(role || req.body.roles, STAFF_ROLE_CODES);
  if (!REGEX.name.test(name)) return res.status(400).json({ error: 'Valid staff name is required' });
  const passwordError = validatePasswordInput(password);
  if (passwordError) return res.status(400).json({ error: passwordError });
  if (roles.length !== 1) return res.status(400).json({ error: 'Select exactly one staff role' });
  try {
    const staffUser = await runTransaction(async (client) => {
      const staffLoginId = await generateStaffLoginId(client, roles[0]);
      const metadataPatch = {
        staffRegisteredBy: (req as any).currentUser?.id || null,
        staffRegisteredAt: new Date().toISOString(),
        authProvider: 'staff_password',
        staffLoginId
      };
      const passwordHash = hashPassword(password);
      const ins = await client.query(
        `INSERT INTO users(phone, staff_login_id, name, email, password_hash, date_of_birth, is_phone_verified, is_active, roles, metadata, created_at, updated_at)
         VALUES(NULL,$1,$2,NULL,$3,NULL,true,$4,$5,$6,now(),now())
         RETURNING *`,
        [staffLoginId, name, passwordHash, isActive, roles, metadataPatch]
      );
      const user = ins.rows[0];
      await syncUserRoles(client, user.id, user.roles, (req as any).currentUser?.id || null);
      return user;
    });
    return res.json({ success: true, user: normalizeUser(staffUser) });
  } catch (err: any) {
    console.error('POST /api/admin/staff error', err);
    return res.status(400).json({ error: err.message || 'Failed to register staff user' });
  }
});

app.put('/api/admin/staff/:id/roles', authMiddleware, attachUserMiddleware, isAdminMiddleware, async (req, res) => {
  const roles = normalizeRoleList(req.body.roles, STAFF_ROLE_CODES);
  const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : true;
  if (roles.length !== 1) return res.status(400).json({ error: 'Select exactly one worker role' });
  try {
    const user = await runTransaction(async (client) => {
      const current = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (current.rowCount === 0) throw new Error('Staff user not found');
      const currentRoles = Array.isArray(current.rows[0].roles) ? current.rows[0].roles : [];
      if (currentRoles.includes('admin')) throw new Error('Owner/admin account is not a staff account.');
      const nextRoles = [...new Set(roles)];
      const currentStaffLoginId = current.rows[0].staff_login_id || '';
      const currentPrefix = currentStaffLoginId.split('-')[0];
      const expectedPrefix = STAFF_ROLE_PREFIX[nextRoles[0]];
      const nextStaffLoginId = currentStaffLoginId && currentPrefix === expectedPrefix
        ? currentStaffLoginId
        : await generateStaffLoginId(client, nextRoles[0]);
      const metadata = { ...(current.rows[0].metadata || {}), staffLoginId: nextStaffLoginId };
      const upd = await client.query(
        'UPDATE users SET roles = $1, is_active = $2, staff_login_id = $3, metadata = $4, updated_at = now() WHERE id = $5 RETURNING *',
        [nextRoles, isActive, nextStaffLoginId, metadata, req.params.id]
      );
      await syncUserRoles(client, req.params.id, nextRoles, (req as any).currentUser?.id || null);
      return upd.rows[0];
    });
    return res.json({ success: true, user: normalizeUser(user) });
  } catch (err: any) {
    console.error('PUT /api/admin/staff/:id/roles error', err);
    return res.status(400).json({ error: err.message || 'Failed to update staff roles' });
  }
});

app.put('/api/admin/staff/:id', authMiddleware, attachUserMiddleware, isAdminMiddleware, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const role = String(req.body.role || '').trim();
  const roles = normalizeRoleList(role || req.body.roles, STAFF_ROLE_CODES);
  const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : true;
  if (!REGEX.name.test(name)) return res.status(400).json({ error: 'Valid staff name is required' });
  if (password) {
    const passwordError = validatePasswordInput(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
  }
  if (roles.length !== 1) return res.status(400).json({ error: 'Select exactly one staff role' });
  try {
    const user = await runTransaction(async (client) => {
      const current = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (current.rowCount === 0) throw new Error('Staff user not found');
      const currentRoles = Array.isArray(current.rows[0].roles) ? current.rows[0].roles : [];
      if (currentRoles.includes('admin')) throw new Error('Owner/admin account is not a staff account.');
      if (!currentRoles.some((role: string) => (STAFF_ROLE_CODES as readonly string[]).includes(role))) {
        throw new Error('Only staff role accounts can be edited here.');
      }
      const nextRoles = [...new Set(roles)];
      const currentStaffLoginId = current.rows[0].staff_login_id || '';
      const currentPrefix = currentStaffLoginId.split('-')[0];
      const expectedPrefix = STAFF_ROLE_PREFIX[nextRoles[0]];
      const nextStaffLoginId = currentStaffLoginId && currentPrefix === expectedPrefix
        ? currentStaffLoginId
        : await generateStaffLoginId(client, nextRoles[0]);
      const metadata = {
        ...(current.rows[0].metadata || {}),
        staffLoginId: nextStaffLoginId,
        staffUpdatedBy: (req as any).currentUser?.id || null,
        staffUpdatedAt: new Date().toISOString()
      };
      const params: any[] = [name, isActive, nextRoles, metadata, nextStaffLoginId, req.params.id];
      const passwordSql = password ? ', password_hash = $7' : '';
      if (password) params.push(hashPassword(password));
      const upd = await client.query(
        `UPDATE users
         SET name = $1, is_active = $2, roles = $3, metadata = $4, staff_login_id = $5, updated_at = now()${passwordSql}
         WHERE id = $6
         RETURNING *`,
        params
      );
      await syncUserRoles(client, req.params.id, nextRoles, (req as any).currentUser?.id || null);
      return upd.rows[0];
    });
    return res.json({ success: true, user: normalizeUser(user) });
  } catch (err: any) {
    console.error('PUT /api/admin/staff/:id error', err);
    return res.status(400).json({ error: err.message || 'Failed to update staff user' });
  }
});

app.delete('/api/admin/staff/:id', authMiddleware, attachUserMiddleware, isAdminMiddleware, async (req, res) => {
  try {
    await runTransaction(async (client) => {
      const current = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (current.rowCount === 0) throw new Error('Staff user not found');
      const roles = Array.isArray(current.rows[0].roles) ? current.rows[0].roles : [];
      if (roles.includes('admin')) throw new Error('Admin owner accounts cannot be deleted from staff settings.');
      if (!roles.some((role: string) => (STAFF_ROLE_CODES as readonly string[]).includes(role))) throw new Error('Only staff role accounts can be deleted here.');
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [req.params.id]);
      await client.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    });
    return res.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/admin/staff/:id error', err);
    return res.status(400).json({ error: err.message || 'Failed to delete staff user' });
  }
});

// --------------------------------------------------------
// CLIENT AUTH / OTP SIMULATION ENDPOINTS
// --------------------------------------------------------

const OTP_EXPIRES_IN_MS = 5 * 60 * 1000;
const OTP_RESEND_AFTER_SECONDS = 2 * 60;
const otpStore: Record<string, { code: string; expiresAt: number }> = {};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizePhone(phone: any) {
  return normalizeInputPhone(phone);
}

function maskEmail(email: string) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return 'registered email';
  const visible = local.length <= 2 ? `${local[0] || '*'}*` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  return `${visible}@${domain}`;
}

function normalizeGmail(value: any) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidGmailAddress(value: any) {
  return REGEX.gmail.test(normalizeGmail(value));
}

function duplicateCustomerAccountMessage(field: 'email' | 'phone', value: string) {
  const label = field === 'email' ? 'Gmail address' : 'phone number';
  return `This ${label} (${value}) is already used for a SVAYIRO customer account. If this is your account and you forgot the password, click "Forgot password? Reset using email OTP" on the login screen.`;
}

function otpKey(scope: 'register' | 'reset', email: string) {
  return `${scope}:${normalizeGmail(email)}`;
}

function encodeMailHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function buildEmailMessage(options: { fromEmail: string; fromName: string; toEmail: string; subject: string; text: string }) {
  const fromName = encodeMailHeader(options.fromName);
  const subject = encodeMailHeader(options.subject);
  const date = new Date().toUTCString();
  return [
    `From: ${fromName} <${options.fromEmail}>`,
    `To: <${options.toEmail}>`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    options.text
  ].join('\r\n');
}

async function sendGmailSmtpMail(options: { toEmail: string; subject: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const fromEmail = process.env.MAIL_FROM_EMAIL || 'onboarding@resend.dev';
  const fromName = process.env.MAIL_FROM_NAME || 'SVAYIRO';

  if (!apiKey) {
    throw new HttpError(503, 'Resend is not configured. Add RESEND_API_KEY in .env.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [options.toEmail],
      subject: options.subject,
      text: options.text
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Resend API error (${response.status}): ${errorBody}`);
  }
}

app.post('/api/auth/send-registration-otp', async (req, res) => {
  const email = normalizeGmail(req.body?.email);
  const normalizedPhone = normalizePhone(req.body?.phone);
  if (!isValidGmailAddress(email)) {
    return res.status(400).json({ error: 'Enter a valid Gmail address ending with @gmail.com.' });
  }
  if (normalizedPhone && !isValidIndianMobile(normalizedPhone)) {
    return res.status(400).json({ error: 'Valid 10-digit Indian mobile number is required.' });
  }

  try {
    const existing = await pgQuery(
      "SELECT id, phone, email FROM users WHERE roles @> ARRAY['customer']::text[] AND (lower(email) = lower($1) OR ($2::varchar <> '' AND phone = $2::varchar)) LIMIT 1",
      [email, normalizedPhone || '']
    );
    if (existing.rowCount > 0) {
      const current = existing.rows[0];
      if (String(current.email || '').toLowerCase() === email) {
        return res.status(409).json({ error: duplicateCustomerAccountMessage('email', email) });
      }
      if (normalizedPhone && String(current.phone || '') === normalizedPhone) {
        return res.status(409).json({ error: duplicateCustomerAccountMessage('phone', `+91 ${normalizedPhone}`) });
      }
      return res.status(409).json({ error: 'This account information is already registered. Use login or forgot password.' });
    }

    const otp = generateOtp();
    otpStore[otpKey('register', email)] = { code: otp, expiresAt: Date.now() + OTP_EXPIRES_IN_MS };
    const text = [
      'Hello,',
      '',
      `Your SVAYIRO customer registration OTP is ${otp}.`,
      `It is valid for ${Math.floor(OTP_EXPIRES_IN_MS / 60000)} minutes.`,
      '',
      'Use this code only if you are creating a SVAYIRO account.',
      '',
      'SVAYIRO'
    ].join('\n');

    const gmailConfigured = Boolean(process.env.RESEND_API_KEY);
    if (gmailConfigured) {
      await sendGmailSmtpMail({
        toEmail: email,
        subject: 'SVAYIRO customer registration OTP',
        text
      });
    } else {
      if (process.env.NODE_ENV === 'production') {
        throw new HttpError(503, 'Gmail SMTP is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD in .env.');
      }
      console.info(`[EMAIL OTP DEV] registration requested for email=${email}, code=${otp}`);
    }

    const response: any = {
      success: true,
      message: `Registration OTP sent to ${maskEmail(email)}. It is valid for 5 minutes.`,
      expiresInSeconds: OTP_EXPIRES_IN_MS / 1000,
      resendAfterSeconds: OTP_RESEND_AFTER_SECONDS
    };
    if (process.env.NODE_ENV !== 'production') response.devOtp = otp;
    return res.json(response);
  } catch (err: any) {
    console.error('POST /api/auth/send-registration-otp error', err);
    return res.status(err?.statusCode || 500).json({ error: err?.message || 'Failed to send registration OTP' });
  }
});

// Send password reset OTP to the registered customer email.
app.post('/api/auth/send-otp', async (req, res) => {
  const requestedEmail = normalizeGmail(req.body?.email);
  if (!requestedEmail) {
    const phone = normalizePhone(req.body.phone);
    if (!isValidIndianMobile(phone)) {
      return res.status(400).json({ error: 'Valid 10-digit Indian mobile number is required' });
    }

    const otp = generateOtp();
    otpStore[phone] = { code: otp, expiresAt: Date.now() + OTP_EXPIRES_IN_MS };
    console.info(`[OTP] requested for +91${phone}, code=${otp}`);

    const response: any = {
      success: true,
      message: `OTP sent successfully to +91${phone}. It is valid for 5 minutes.`,
      expiresInSeconds: OTP_EXPIRES_IN_MS / 1000,
      resendAfterSeconds: OTP_RESEND_AFTER_SECONDS
    };
    if (process.env.NODE_ENV !== 'production') response.devOtp = otp;
    return res.json(response);
  }
  if (!isValidGmailAddress(requestedEmail)) return res.status(400).json({ error: 'Valid registered Gmail address is required.' });

  try {
    const userResult = await pgQuery(
      `SELECT id, name, email, phone, roles, is_active
       FROM users
       WHERE lower(email) = lower($1) AND roles @> ARRAY['customer']::text[]
       LIMIT 1`,
      [requestedEmail]
    );
    if (userResult.rowCount === 0) return res.status(404).json({ error: 'No customer account found for this email address.' });
    const user = userResult.rows[0];
    if (user.is_active === false) return res.status(403).json({ error: 'This account is inactive. Contact the shop owner.' });
    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    if (!isValidGmailAddress(email)) {
      return res.status(400).json({ error: 'This account does not have a valid registered Gmail address. Contact the shop owner.' });
    }

    const otp = generateOtp();
    otpStore[otpKey('reset', email)] = { code: otp, expiresAt: Date.now() + OTP_EXPIRES_IN_MS };
    const text = [
      `Hello ${user.name || 'SVAYIRO customer'},`,
      '',
      `Your SVAYIRO password reset OTP is ${otp}.`,
      `It is valid for ${Math.floor(OTP_EXPIRES_IN_MS / 60000)} minutes.`,
      '',
      'If you did not request this, ignore this email and do not share the code with anyone.',
      '',
      'SVAYIRO'
    ].join('\n');

    const gmailConfigured = Boolean(process.env.RESEND_API_KEY);
    if (gmailConfigured) {
      await sendGmailSmtpMail({
        toEmail: email,
        subject: 'SVAYIRO password reset OTP',
        text
      });
    } else {
      if (process.env.NODE_ENV === 'production') {
        throw new HttpError(503, 'Gmail SMTP is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD in .env.');
      }
      console.info(`[EMAIL OTP DEV] password reset requested for email=${email}, code=${otp}`);
    }

    const response: any = {
      success: true,
      message: `Password reset OTP sent to ${maskEmail(email)}. It is valid for 5 minutes.`,
      expiresInSeconds: OTP_EXPIRES_IN_MS / 1000,
      resendAfterSeconds: OTP_RESEND_AFTER_SECONDS
    };
    if (process.env.NODE_ENV !== 'production') response.devOtp = otp;
    return res.json(response);
  } catch (err: any) {
    console.error('POST /api/auth/send-otp error', err);
    return res.status(err?.statusCode || 500).json({ error: err?.message || 'Failed to send password reset OTP' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const normalizedPhone = normalizePhone(req.body?.phone);
  const normalizedCode = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = normalizeGmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const dateOfBirth = typeof req.body?.dateOfBirth === 'string' ? req.body.dateOfBirth : '';
  const termsAccepted = req.body?.termsAccepted === true;
  const errors: string[] = [];
  if (!REGEX.name.test(name)) errors.push('Name must contain only letters, spaces, apostrophes, periods, or hyphens.');
  if (!isValidGmailAddress(email)) errors.push('Enter a valid Gmail address ending with @gmail.com.');
  if (!isValidIndianMobile(normalizedPhone)) errors.push('Valid 10-digit Indian mobile number is required.');
  const passwordError = validatePasswordInput(password);
  if (passwordError) errors.push(passwordError);
  const dobError = validateDobInput(dateOfBirth);
  if (dobError) errors.push(dobError);
  if (!termsAccepted) errors.push('Terms & Conditions must be accepted before registration.');
  if (!REGEX.otp.test(normalizedCode)) errors.push('Valid 6-digit Gmail verification code is required.');
  const normalizedDob = normalizeDobForDb(dateOfBirth);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const storedRegistrationOtp = otpStore[otpKey('register', email)];
  if (!storedRegistrationOtp || storedRegistrationOtp.expiresAt < Date.now()) return res.status(400).json({ error: 'Gmail verification OTP expired or not requested.' });
  if (storedRegistrationOtp.code !== normalizedCode) return res.status(400).json({ error: 'Invalid Gmail verification code.' });

  try {
    const refreshToken = generateId('rtk');
    const passwordHash = hashPassword(password);
    const user = await runTransaction(async (client) => {
      const existing = await client.query('SELECT * FROM users WHERE phone = $1 OR lower(email) = lower($2) LIMIT 1 FOR UPDATE', [normalizedPhone, email]);
      if (existing.rowCount > 0) {
        const current = existing.rows[0];
        const currentRoles = Array.isArray(current.roles) && current.roles.length ? current.roles : ['customer'];
        if (currentRoles.some((role: string) => ['admin', 'inventory_manager', 'delivery_partner', 'customer_care'].includes(role))) {
          throw new Error('This phone/email belongs to an owner or worker console account. Register customer access with a separate customer account.');
        }
        if (String(current.email || '').toLowerCase() === email) {
          throw new HttpError(409, duplicateCustomerAccountMessage('email', email));
        }
        if (String(current.phone || '') === normalizedPhone) {
          throw new HttpError(409, duplicateCustomerAccountMessage('phone', `+91 ${normalizedPhone}`));
        }
        throw new HttpError(409, 'This account information is already registered. Use login or forgot password.');
      }
      const metadata = { authProvider: 'password', termsAcceptedAt: new Date().toISOString(), termsVersion: 'customer_terms_current', refreshToken };
      const ins = await client.query(
        `INSERT INTO users(phone, name, email, password_hash, date_of_birth, is_phone_verified, is_active, roles, metadata, created_at, updated_at)
         VALUES($1,$2,$3,$4,$5,true,true,$6,$7,now(),now())
         RETURNING *`,
        [normalizedPhone, name, email, passwordHash, normalizedDob, ['customer'], metadata]
      );
      await syncUserRoles(client, ins.rows[0].id, ['customer'], null);
      return ins.rows[0];
    });
    const token = jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });
    delete otpStore[otpKey('register', email)];
    return res.json({ success: true, user: normalizeUser(user), token, refreshToken });
  } catch (err: any) {
    console.error('POST /api/auth/register error', err);
    if (err?.code === '23505') return res.status(409).json({ error: 'Phone number or email is already registered.' });
    return res.status(err?.statusCode || 500).json({ error: err.message || 'Failed to register customer' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeGmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!isValidGmailAddress(email)) return res.status(400).json({ error: 'Valid registered Gmail address is required.' });
  if (!password) return res.status(400).json({ error: 'Password is required.' });
  try {
    const ures = await pgQuery("SELECT * FROM users WHERE lower(email) = lower($1) AND roles @> ARRAY['customer']::text[]", [email]);
    if (ures.rowCount === 0) return res.status(401).json({ error: 'Invalid email or password.' });
    let user = ures.rows[0];
    if (user.is_active === false) return res.status(403).json({ error: 'This account is inactive. Contact the shop owner.' });
    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (roles.some((role: string) => ['admin', 'inventory_manager', 'delivery_partner', 'customer_care'].includes(role))) {
      return res.status(403).json({ error: 'Owner and worker console accounts must use Admin Console login. Register a separate customer account to shop.' });
    }
    if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const refreshToken = generateId('rtk');
    const metadata = { ...(user.metadata || {}), authProvider: 'password', refreshToken };
    await pgQuery('UPDATE users SET metadata = $1, updated_at = now() WHERE id = $2', [metadata, user.id]);
    const fres = await pgQuery('SELECT * FROM users WHERE id = $1', [user.id]);
    user = fres.rows[0];
    const token = jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ success: true, user: normalizeUser(user), token, refreshToken });
  } catch (err: any) {
    console.error('POST /api/auth/login error', err);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

app.post('/api/auth/staff-login', async (req, res) => {
  const loginId = String(req.body?.loginId || req.body?.phone || '').trim();
  const normalizedPhone = normalizePhone(loginId);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const isOwnerPhoneLogin = /^[6-9]\d{9}$/.test(normalizedPhone) && normalizedPhone === loginId.replace(/\D/g, '');
  const normalizedStaffId = loginId.toUpperCase();
  if (!isOwnerPhoneLogin && !/^[A-Z]{2,6}-\d{4,6}$/.test(normalizedStaffId)) {
    return res.status(400).json({ error: 'Enter owner phone or worker ID, for example 9876543210 or INV-0001.' });
  }
  if (!password) return res.status(400).json({ error: 'Password is required.' });
  try {
    const ures = isOwnerPhoneLogin
      ? await pgQuery("SELECT * FROM users WHERE phone = $1 AND roles @> ARRAY['admin']::text[]", [normalizedPhone])
      : await pgQuery('SELECT * FROM users WHERE upper(staff_login_id) = $1', [normalizedStaffId]);
    if (ures.rowCount === 0) return res.status(401).json({ error: 'Invalid owner/worker ID or password.' });
    let user = ures.rows[0];
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const isConsoleAccount = roles.some((role: string) => ['admin', 'inventory_manager', 'delivery_partner', 'customer_care'].includes(role));
    if (!isConsoleAccount) return res.status(403).json({ error: 'This account is not registered for Admin Console access.' });
    if (user.is_active === false) return res.status(403).json({ error: 'This console account is inactive. Contact the owner.' });
    if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid owner/worker ID or password.' });
    }
    const refreshToken = generateId('rtk');
    const metadata = { ...(user.metadata || {}), authProvider: 'staff_password', refreshToken };
    await pgQuery('UPDATE users SET metadata = $1, updated_at = now() WHERE id = $2', [metadata, user.id]);
    const fres = await pgQuery('SELECT * FROM users WHERE id = $1', [user.id]);
    user = fres.rows[0];
    const token = jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ success: true, user: normalizeUser(user), token, refreshToken });
  } catch (err: any) {
    console.error('POST /api/auth/staff-login error', err);
    return res.status(500).json({ error: 'Failed to login to Admin Console' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const email = normalizeGmail(req.body?.email);
  const normalizedCode = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const errors: string[] = [];
  if (!isValidGmailAddress(email)) errors.push('Valid registered Gmail address is required.');
  if (!REGEX.otp.test(normalizedCode)) errors.push('Valid 6-digit verification code is required.');
  const passwordError = validatePasswordInput(password);
  if (passwordError) errors.push(passwordError);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const stored = otpStore[otpKey('reset', email)];
  if (!stored || stored.expiresAt < Date.now()) return res.status(400).json({ error: 'OTP expired or not requested' });
  if (stored.code !== normalizedCode) return res.status(400).json({ error: 'Invalid verification code' });

  try {
    const passwordHash = hashPassword(password);
    const result = await pgQuery(
      "UPDATE users SET password_hash = $1, metadata = COALESCE(metadata, $2::jsonb) || $3::jsonb, updated_at = now() WHERE lower(email) = lower($4) AND roles @> ARRAY['customer']::text[] RETURNING id",
      [passwordHash, {}, { authProvider: 'password', passwordResetAt: new Date().toISOString() }, email]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'No customer account exists for this email address.' });
    delete otpStore[otpKey('reset', email)];
    return res.json({ success: true });
  } catch (err: any) {
    console.error('POST /api/auth/reset-password error', err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Verify OTP simulation
app.post('/api/auth/verify-otp', async (req, res) => {
  const { phone, code, name } = req.body;
  const normalizedPhone = normalizePhone(phone);
  const normalizedCode = typeof code === 'string' ? code.trim() : '';

  const validationErrors = validateOtpVerification({ phone: normalizedPhone, code: normalizedCode, name });
  if (validationErrors.length > 0) return res.status(400).json({ error: validationErrors.join('; ') });

  const stored = otpStore[normalizedPhone];
  if (!stored || stored.expiresAt < Date.now()) {
    console.warn(`[OTP] verification failed for +91${normalizedPhone}: expired or not requested`);
    return res.status(400).json({ error: 'OTP expired or not requested' });
  }
  if (stored.code !== normalizedCode) {
    console.warn(`[OTP] verification failed for +91${normalizedPhone}: invalid code ${normalizedCode}`);
    return res.status(400).json({ error: 'Invalid verification code' });
  }

  console.info(`[OTP] verification success for +91${normalizedPhone}`);
  const refreshToken = generateId('rtk');
  try {
    // find existing user
    let ures = await pgQuery('SELECT * FROM users WHERE phone = $1', [normalizedPhone]);
    let user;
    if (ures.rowCount === 0) {
      const displayName = typeof name === 'string' && name.trim() ? name.trim() : 'Valued Customer';
      const ins = await pgQuery('INSERT INTO users(phone, name, email, is_phone_verified, roles, metadata, created_at, updated_at) VALUES($1,$2,$3,$4,$5,$6,now(),now()) RETURNING *', [normalizedPhone, displayName, '', true, ['customer'], {}]);
      user = ins.rows[0];
    } else {
      user = ures.rows[0];
    }
    const existingRoles = Array.isArray(user.roles) ? user.roles : [];
    if (existingRoles.some((role: string) => ['admin', 'inventory_manager', 'delivery_partner', 'customer_care'].includes(role))) {
      return res.status(403).json({ error: 'Owner and worker console accounts must use Admin Console password login.' });
    }
    if (user.is_active === false) {
      return res.status(403).json({ error: 'This account is inactive. Contact the shop owner.' });
    }

    // store/rotate refresh token in metadata JSONB
    const metadata = user.metadata || {};
    metadata.refreshToken = refreshToken;
    await pgQuery('UPDATE users SET metadata = $1, updated_at = now() WHERE id = $2', [metadata, user.id]);
    const fres = await pgQuery('SELECT * FROM users WHERE id = $1', [user.id]);
    user = fres.rows[0];

    const token = jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });
    delete otpStore[normalizedPhone];
    return res.json({ success: true, user: normalizeUser(user), token, refreshToken });
  } catch (err: any) {
    console.error('POST /api/auth/verify-otp error', err);
    if (err?.code === '42P01') {
      return res.status(503).json({ error: 'Database schema is not initialized. Run npm run db:init, then restart the server.' });
    }
    if (err?.code === '42703') {
      return res.status(503).json({ error: 'Database schema is out of date. Apply db/schema.sql or recreate the local database volume.' });
    }
    if (err?.code === '28P01') {
      return res.status(503).json({ error: 'Database login failed. Check DATABASE_URL in .env.' });
    }
    if (err?.code === '3D000') {
      return res.status(503).json({ error: 'Database does not exist. Create it first, then run npm run db:init.' });
    }
    if (err?.code === '22001') {
      return res.status(400).json({ error: 'One login field is too long. Enter a 10-digit mobile number without extra text.' });
    }
    return res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// Get user profile
app.get('/api/auth/user/:phone', async (req, res) => {
  try {
    const phone = normalizePhone(req.params.phone);
    if (!isValidIndianMobile(phone)) return res.status(400).json({ error: 'Valid 10-digit Indian mobile number is required' });
    const ures = await pgQuery('SELECT * FROM users WHERE phone = $1', [phone]);
    if (ures.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    return res.json(normalizeUser(ures.rows[0]));
  } catch (err) {
    console.error('GET /api/auth/user/:phone error', err);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Get current authenticated user
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = (req as any).currentUser || null;
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ success: true, user: normalizeUser(user) });
});

app.delete('/api/auth/me', authMiddleware, async (req, res) => {
  const user = (req as any).currentUser || null;
  const confirmation = typeof req.body?.confirmation === 'string' ? req.body.confirmation.trim().toLowerCase() : '';
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (confirmation !== 'delete') return res.status(400).json({ error: 'Type delete to confirm account deletion.' });
  if (Array.isArray(user.roles) && user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Admin accounts cannot be deleted from the customer profile.' });
  }
  try {
    await runTransaction(async (client) => {
      const phone = normalizePhone(user.phone || '');
      const orderRows = await client.query(
        'SELECT id FROM orders WHERE user_id = $1 OR customer_phone = $2',
        [user.id, phone]
      );
      const orderIds = orderRows.rows.map((row: any) => row.id);

      const complaintRows = await client.query(
        'SELECT id FROM complaints WHERE user_id = $1 OR customer_phone = $2',
        [user.id, phone]
      );
      const complaintIds = complaintRows.rows.map((row: any) => row.id);

      const advanceRows = await client.query(
        'SELECT id FROM advance_requests WHERE user_id = $1 OR customer_phone = $2',
        [user.id, phone]
      );
      const advanceIds = advanceRows.rows.map((row: any) => row.id);

      if (orderIds.length > 0) {
        await client.query('DELETE FROM payment_records WHERE order_id = ANY($1::uuid[]) OR user_id = $2', [orderIds, user.id]);
        await client.query('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orderIds]);
        await client.query('DELETE FROM invoices WHERE order_id = ANY($1::uuid[])', [orderIds]);
        await client.query('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [orderIds]);
        await client.query('DELETE FROM orders WHERE id = ANY($1::uuid[])', [orderIds]);
      } else {
        await client.query('DELETE FROM payment_records WHERE user_id = $1', [user.id]);
      }

      if (complaintIds.length > 0) {
        await client.query("DELETE FROM notifications WHERE payload->>'complaintId' = ANY($1::text[])", [complaintIds]);
      }
      if (phone) {
        await client.query('DELETE FROM notifications WHERE body ILIKE $1', [`%${phone}%`]);
      }

      await client.query('DELETE FROM complaints WHERE id = ANY($1::uuid[])', [complaintIds]);
      await client.query('DELETE FROM advance_requests WHERE id = ANY($1::uuid[])', [advanceIds]);
      await client.query('DELETE FROM reviews WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM customer_search_history WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM wishlists WHERE user_id = $1', [user.id]);
      await client.query('UPDATE user_roles SET assigned_by = NULL WHERE assigned_by = $1', [user.id]);
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM users WHERE id = $1', [user.id]);
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/auth/me error', err);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Refresh JWT using refresh token (rotating)
app.post('/api/auth/refresh', async (req, res) => {
  const { phone, refreshToken } = req.body;
  const normalizedPhone = normalizePhone(phone);
  if (!isValidIndianMobile(normalizedPhone) || typeof refreshToken !== 'string' || !refreshToken.trim()) return res.status(400).json({ error: 'Valid phone and refreshToken required' });
  try {
    const ures = await pgQuery('SELECT * FROM users WHERE phone = $1', [normalizedPhone]);
    if (ures.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    const user = ures.rows[0];
    const meta = user.metadata || {};
    if (meta.refreshToken !== refreshToken) return res.status(401).json({ error: 'Invalid refresh token' });

    const newRefresh = generateId('rtk');
    meta.refreshToken = newRefresh;
    await pgQuery('UPDATE users SET metadata = $1, updated_at = now() WHERE id = $2', [meta, user.id]);
    const fres = await pgQuery('SELECT * FROM users WHERE id = $1', [user.id]);
    const updated = fres.rows[0];
    const token = jwt.sign({ id: updated.id, phone: updated.phone }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ success: true, token, refreshToken: newRefresh, user: normalizeUser(updated) });
  } catch (err) {
    console.error('POST /api/auth/refresh error', err);
    return res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Update Profile details and Address
app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  const { name, addresses, savedAddresses, dateOfBirth } = req.body;
  const uid = (req as any).user?.id;
  if (!uid) return res.status(401).json({ error: 'Not authenticated' });
  const validationErrors = validateProfileUpdate(req.body);
  if (validationErrors.length > 0) return res.status(400).json({ error: validationErrors.join('; ') });
  try {
    const fres = await pgQuery('SELECT * FROM users WHERE id = $1', [uid]);
    if (fres.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    const currentUser = fres.rows[0];
    const nextSavedAddresses = savedAddresses !== undefined ? savedAddresses : (addresses !== undefined ? addresses : currentUser.saved_addresses || []);
    const cleanSavedAddresses = Array.isArray(nextSavedAddresses) ? nextSavedAddresses : [];
    const currentDob = currentUser.date_of_birth ? (currentUser.date_of_birth.toISOString?.().slice(0, 10) || currentUser.date_of_birth) : null;
    const nextDob = dateOfBirth !== undefined ? normalizeDobForDb(dateOfBirth) : currentDob;
    if (dateOfBirth !== undefined) {
      const dobError = validateDobInput(dateOfBirth);
      if (dobError) return res.status(400).json({ error: dobError });
      try {
        assertDobChangeAllowed(currentUser.date_of_birth, nextDob);
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }
    }
    const updatedRes = await pgQuery(
      'UPDATE users SET name = $1, date_of_birth = $2, saved_addresses = $3::jsonb, updated_at = now() WHERE id = $4 RETURNING *',
      [name !== undefined ? name : currentUser.name, nextDob || null, JSON.stringify(cleanSavedAddresses), uid]
    );
    return res.json({ success: true, user: normalizeUser(updatedRes.rows[0]) });
  } catch (err: any) {
    console.error('[API UPDATE PROFILE] Error updating profile:', err);
    return res.status(500).json({ error: err.message || 'Error updating user profile' });
  }
});

// Update wishlist
app.put('/api/auth/wishlist', authMiddleware, attachUserMiddleware, async (req, res) => {
  const { wishlist } = req.body;
  const currentUser = (req as any).currentUser;
  if (!currentUser) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const requestedWishlist = cleanUuidList(wishlist);
    const updated = await runTransaction(async (client) => {
      let validWishlist = requestedWishlist;
      if (requestedWishlist.length > 0) {
        const existingProducts = await client.query(
          'SELECT id FROM products WHERE id = ANY($1::uuid[])',
          [requestedWishlist]
        );
        const existingIds = new Set(existingProducts.rows.map((row: any) => String(row.id)));
        validWishlist = requestedWishlist.filter((productId) => existingIds.has(productId));
      }

      const res = await client.query(
        'UPDATE users SET wishlist = $1::uuid[], updated_at = now() WHERE id = $2 RETURNING *',
        [validWishlist, currentUser.id]
      );
      await client.query('DELETE FROM wishlists WHERE user_id = $1', [currentUser.id]);
      for (const productId of validWishlist) {
        await client.query('INSERT INTO wishlists(user_id, product_id) VALUES($1,$2) ON CONFLICT (user_id, product_id) DO NOTHING', [currentUser.id, productId]);
      }
      return res;
    });
    return res.json({ success: true, user: normalizeUser(updated.rows[0]) });
  } catch (err) {
    console.error('PUT /api/auth/wishlist error', err);
    return res.status(500).json({ error: 'Failed to update wishlist' });
  }
});

app.get('/api/wishlist/products', authMiddleware, attachUserMiddleware, async (req, res) => {
  const currentUser = (req as any).currentUser;
  if (!currentUser) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const wishlistIds = cleanUuidList(currentUser.wishlist);
    if (wishlistIds.length === 0) return res.json([]);

    const { rows } = await pgQuery(`
      SELECT
        p.id,
        p.category_id,
        p.subcategory_id,
        p.sku,
        p.name,
        p.slug,
        p.description,
        p.base_price,
        p.offer_price,
        p.stock_count,
        p.weight_grams,
        p.is_enabled,
        p.low_stock_threshold,
        p.metadata,
        p.created_at,
        p.updated_at,
        wanted.sort_order,
        COALESCE(array_remove(array_agg(pc.category_id ORDER BY pc.is_primary DESC, pc.created_at ASC), NULL), ARRAY[]::uuid[]) AS category_ids
      FROM unnest($1::uuid[]) WITH ORDINALITY AS wanted(product_id, sort_order)
      JOIN products p ON p.id = wanted.product_id
      LEFT JOIN product_categories pc ON pc.product_id = p.id
      WHERE p.is_enabled = true
      GROUP BY p.id, wanted.sort_order
      ORDER BY wanted.sort_order ASC
    `, [wishlistIds]);

    if (rows.length === 0) return res.json([]);

    const productIds = rows.map((row: any) => row.id);
    const imgs = await pgQuery('SELECT product_id, url, position FROM product_images WHERE product_id = ANY($1::uuid[]) ORDER BY position ASC', [productIds]);
    const imagesByProduct = new Map<string, any[]>();
    for (const image of imgs.rows) {
      const list = imagesByProduct.get(image.product_id) || [];
      list.push(image);
      imagesByProduct.set(image.product_id, list);
    }

    return res.json(rows.map((row: any) => normalizeProduct(row, imagesByProduct.get(row.id) || [])));
  } catch (err) {
    console.error('GET /api/wishlist/products error', err);
    return res.status(500).json({ error: 'Failed to load wishlist products' });
  }
});

// Update Save For later
app.put('/api/auth/save-later', authMiddleware, attachUserMiddleware, async (req, res) => {
  const { savedForLater } = req.body;
  const currentUser = (req as any).currentUser;
  if (!currentUser) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const cleanSavedForLater = Array.isArray(savedForLater)
      ? savedForLater
          .map((item) => ({
            productId: String(item?.productId || item?.product_id || '').trim(),
            quantity: Math.max(1, Number(item?.quantity || 1))
          }))
          .filter((item) => item.productId)
      : [];
    const updated = await pgQuery('UPDATE users SET saved_for_later = $1::jsonb, updated_at = now() WHERE id = $2 RETURNING *', [JSON.stringify(cleanSavedForLater), currentUser.id]);
    return res.json({ success: true, user: normalizeUser(updated.rows[0]) });
  } catch (err) {
    console.error('PUT /api/auth/save-later error', err);
    return res.status(500).json({ error: 'Failed to update saved items' });
  }
});


// --------------------------------------------------------
// SHOP PROFILE APIs
// --------------------------------------------------------

app.get('/api/shop-profile', async (req, res) => {
  try {
    const cacheKey = 'shop-profile';
    const cached = getPublicCache(cacheKey);
    if (cached) return sendCacheableJson(res, cached, 300);
    const s = await pgQuery('SELECT * FROM shop_profile ORDER BY created_at DESC LIMIT 1');
    const profile = s.rowCount === 0 ? normalizeShopProfile(DEFAULT_SHOP_PROFILE) : normalizeShopProfile(s.rows[0]);
    setPublicCache(cacheKey, profile, 300_000);
    return sendCacheableJson(res, profile, 300);
  } catch (err) {
    console.error('GET /api/shop-profile error', err);
    return res.status(500).json({ error: 'Failed to fetch shop profile' });
  }
});

app.put('/api/shop-profile', authMiddleware, isAdminMiddleware, async (req, res) => {
  const firstDefined = (...values: any[]) => values.find((value) => value !== undefined);
  const firstArray = (...values: any[]) => values.find((value) => Array.isArray(value));
  const rawAddress = firstDefined(req.body?.physicalAddress, req.body?.address);
  const addressText = typeof rawAddress === 'string'
    ? rawAddress
    : rawAddress?.physicalAddress || rawAddress?.text || '';
  const addresses = firstArray(req.body?.addresses, rawAddress?.branches) || [];
  const requestedIsOpen = req.body?.is_open ?? req.body?.isOpen;
  const requestedHolidayMode = req.body?.holiday_mode ?? req.body?.isHolidayMode;
  const requestedDeliverySlots = firstArray(req.body?.deliverySlots, req.body?.delivery_slots);
  const requestedSocialLinks = firstArray(req.body?.socialLinks, req.body?.social_links);
  const barcodeLabelPrintSettings = req.body?.barcodeLabelPrintSettings ?? req.body?.barcode_label_print_settings;
  const profileDetails = {
    ...(req.body || {}),
    phone: firstDefined(req.body?.contactNumber, req.body?.phone, req.body?.personalPhoneNumber),
    whatsapp: firstDefined(req.body?.whatsAppNumber, req.body?.whatsapp, req.body?.supportPhoneNumber),
    personal_phone: firstDefined(req.body?.personalPhoneNumber, req.body?.personal_phone),
    support_phone: firstDefined(req.body?.supportPhoneNumber, req.body?.support_phone),
    logo_url: firstDefined(req.body?.logoUrl, req.body?.logo_url),
    banner_url: firstDefined(req.body?.bannerUrl, req.body?.banner_url),
    google_maps_link: firstDefined(req.body?.googleMapsLink, req.body?.google_maps_link),
    upi_id: firstDefined(req.body?.upiId, req.body?.upi_id),
    payment_qr_code_url: firstDefined(req.body?.paymentQrCodeUrl, req.body?.payment_qr_code_url),
    delivery_radius_km: firstDefined(req.body?.deliveryRadius, req.body?.delivery_radius_km),
    free_delivery_radius_km: firstDefined(req.body?.freeDeliveryRadiusKm, req.body?.free_delivery_radius_km),
    base_delivery_charge: firstDefined(req.body?.baseDeliveryCharge, req.body?.base_delivery_charge),
    delivery_charge_per_km: firstDefined(req.body?.deliveryChargePerKm, req.body?.delivery_charge_per_km),
    is_open: requestedIsOpen === undefined ? undefined : normalizeBoolean(requestedIsOpen, true),
    holiday_mode: requestedHolidayMode === undefined ? undefined : normalizeBoolean(requestedHolidayMode, false),
    operational_timings: firstDefined(req.body?.workingHours, req.body?.operational_timings),
    announcement: req.body?.announcement,
    holiday_message: firstDefined(req.body?.holidayMessage, req.body?.holiday_message),
    delivery_slots: requestedDeliverySlots,
    social_links: requestedSocialLinks,
    allow_extended_delivery: firstDefined(req.body?.allowExtendedDelivery, req.body?.allow_extended_delivery),
    extended_delivery_message: firstDefined(req.body?.extendedDeliveryMessage, req.body?.extended_delivery_message),
    extended_delivery_note: firstDefined(req.body?.extendedDeliveryNote, req.body?.extended_delivery_note),
    barcode_label_print_settings: barcodeLabelPrintSettings,
    addresses,
    address: {
      physicalAddress: addressText,
      branches: addresses
    }
  };
  const validationErrors = validateShopProfileUpdate(profileDetails);
  if (validationErrors.length > 0) return res.status(400).json({ error: validationErrors.join('; ') });
  if (profileDetails.barcode_label_print_settings !== undefined) {
    profileDetails.barcode_label_print_settings = normalizeBarcodeLabelPrintSettings(profileDetails.barcode_label_print_settings);
  }
  const addressJson = JSON.stringify(profileDetails.address || {});
  const addressesJson = JSON.stringify(profileDetails.addresses || []);
  const deliverySlotsJson = profileDetails.delivery_slots === undefined ? null : JSON.stringify(profileDetails.delivery_slots || []);
  const socialLinksJson = profileDetails.social_links === undefined ? null : JSON.stringify(profileDetails.social_links || []);
  const barcodeLabelPrintSettingsJson = profileDetails.barcode_label_print_settings === undefined ? null : JSON.stringify(profileDetails.barcode_label_print_settings);
  try {
    // try to update the first shop_profile row; if none exists insert
    const existing = await pgQuery('SELECT id FROM shop_profile ORDER BY created_at DESC LIMIT 1');
    if (existing.rowCount === 0) {
      const ins = await pgQuery(
        `INSERT INTO shop_profile(
          name, tagline, description, logo_url, banner_url, phone, whatsapp, personal_phone, support_phone, email,
          address, addresses, google_maps_link, delivery_radius_km, free_delivery_radius_km, base_delivery_charge, delivery_charge_per_km,
          is_open, holiday_mode, operational_timings, announcement, holiday_message, delivery_slots,
          upi_id, payment_qr_code_url, social_links, allow_extended_delivery, extended_delivery_message, extended_delivery_note, barcode_label_print_settings,
          created_at, updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24,$25,$26::jsonb,$27::boolean,$28,$29,$30::jsonb,now(),now()) RETURNING *`,
        [
          profileDetails.name || 'SVAYIRO',
          profileDetails.tagline || null,
          profileDetails.description || null,
          profileDetails.logo_url || null,
          profileDetails.banner_url || null,
          profileDetails.phone || null,
          profileDetails.whatsapp || null,
          profileDetails.personal_phone || null,
          profileDetails.support_phone || null,
          profileDetails.email || null,
          addressJson,
          addressesJson,
          profileDetails.google_maps_link || null,
          profileDetails.delivery_radius_km ?? 10,
          profileDetails.free_delivery_radius_km ?? 0,
          profileDetails.base_delivery_charge ?? 30,
          profileDetails.delivery_charge_per_km ?? 12,
          profileDetails.is_open ?? true,
          profileDetails.holiday_mode ?? false,
          profileDetails.operational_timings || null,
          profileDetails.announcement || null,
          profileDetails.holiday_message || null,
          deliverySlotsJson,
          profileDetails.upi_id || null,
          profileDetails.payment_qr_code_url || null,
          socialLinksJson || '[]',
          profileDetails.allow_extended_delivery === undefined ? false : normalizeBoolean(profileDetails.allow_extended_delivery, false),
          profileDetails.extended_delivery_message || DEFAULT_SHOP_PROFILE.extended_delivery_message,
          profileDetails.extended_delivery_note || null,
          barcodeLabelPrintSettingsJson || JSON.stringify(DEFAULT_SHOP_PROFILE.barcode_label_print_settings)
        ]
      );
      invalidatePublicCache('shop-profile');
      return res.json({ success: true, data: normalizeShopProfile(ins.rows[0]) });
    }
    const id = existing.rows[0].id;
    const upd = await pgQuery(
      `UPDATE shop_profile SET
        name = COALESCE($1,name),
        tagline = COALESCE($2,tagline),
        description = COALESCE($3,description),
        logo_url = COALESCE($4,logo_url),
        banner_url = COALESCE($5,banner_url),
        phone = COALESCE($6,phone),
        whatsapp = COALESCE($7,whatsapp),
        personal_phone = COALESCE($8,personal_phone),
        support_phone = COALESCE($9,support_phone),
        email = COALESCE($10,email),
        address = COALESCE($11::jsonb,address),
        addresses = COALESCE($12::jsonb,addresses),
        google_maps_link = COALESCE($13,google_maps_link),
        delivery_radius_km = COALESCE($14,delivery_radius_km),
        free_delivery_radius_km = COALESCE($15,free_delivery_radius_km),
        base_delivery_charge = COALESCE($16,base_delivery_charge),
        delivery_charge_per_km = COALESCE($17,delivery_charge_per_km),
        is_open = COALESCE($18::boolean,is_open),
        holiday_mode = COALESCE($19::boolean,holiday_mode),
        operational_timings = COALESCE($20,operational_timings),
        announcement = COALESCE($21,announcement),
        holiday_message = COALESCE($22,holiday_message),
        delivery_slots = COALESCE($23::jsonb,delivery_slots),
        upi_id = COALESCE($24,upi_id),
        payment_qr_code_url = COALESCE($25,payment_qr_code_url),
        social_links = COALESCE($26::jsonb,social_links),
        allow_extended_delivery = COALESCE($27::boolean,allow_extended_delivery),
        extended_delivery_message = COALESCE($28,extended_delivery_message),
        extended_delivery_note = COALESCE($29,extended_delivery_note),
        barcode_label_print_settings = COALESCE($30::jsonb,barcode_label_print_settings),
        updated_at = now()
      WHERE id = $31 RETURNING *`,
      [
        profileDetails.name,
        profileDetails.tagline,
        profileDetails.description,
        profileDetails.logo_url,
        profileDetails.banner_url,
        profileDetails.phone,
        profileDetails.whatsapp,
        profileDetails.personal_phone,
        profileDetails.support_phone,
        profileDetails.email,
        addressJson,
        addressesJson,
        profileDetails.google_maps_link,
        profileDetails.delivery_radius_km,
        profileDetails.free_delivery_radius_km,
        profileDetails.base_delivery_charge,
        profileDetails.delivery_charge_per_km,
        profileDetails.is_open,
        profileDetails.holiday_mode,
        profileDetails.operational_timings,
        profileDetails.announcement,
        profileDetails.holiday_message,
        deliverySlotsJson,
        profileDetails.upi_id,
        profileDetails.payment_qr_code_url,
        socialLinksJson,
        profileDetails.allow_extended_delivery === undefined ? undefined : normalizeBoolean(profileDetails.allow_extended_delivery, false),
        profileDetails.extended_delivery_message,
        profileDetails.extended_delivery_note,
        barcodeLabelPrintSettingsJson,
        id
      ]
    );
    invalidatePublicCache('shop-profile');
    return res.json({ success: true, data: normalizeShopProfile(upd.rows[0]) });
  } catch (err) {
    console.error('PUT /api/shop-profile error', err);
    return res.status(500).json({ error: 'Failed to update shop profile' });
  }
});

// -------------------------
// Inventory management
// -------------------------

// Adjust stock atomically and create an inventory_log entry
app.post('/api/inventory/adjust', authMiddleware, requirePermission('inventory:manage'), async (req, res) => {
  const { productId, delta, reason, source, referenceId, metadata } = req.body;
  const errors = validateInventoryAdjust(req.body);
  if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

  try {
    const result = await runTransaction(async (client) => {
      // lock the product row
      const p = await client.query('SELECT id, stock_count FROM products WHERE id = $1 FOR UPDATE', [productId]);
      if (p.rowCount === 0) throw new Error('Product not found');
      const current = p.rows[0];
      const newStock = Number(current.stock_count) + Number(delta);
      if (newStock < 0) throw new Error('Insufficient stock');
      await client.query('UPDATE products SET stock_count = $1, updated_at = now() WHERE id = $2', [newStock, productId]);
      const logRes = await client.query('INSERT INTO inventory_logs(product_id, delta, reason, source, reference_id, metadata) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [productId, delta, reason || null, source || null, referenceId || null, metadata || {}]);
      return { product: { id: productId, stock_count: newStock }, log: logRes.rows[0] };
    });

    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('POST /api/inventory/adjust error', err);
    return res.status(400).json({ error: err.message || 'Inventory update failed' });
  }
});

// Get inventory logs (optionally filter by product)
app.get('/api/inventory/logs', authMiddleware, requirePermission('inventory:manage'), async (req, res) => {
  const { productId } = req.query;
  try {
    let q = 'SELECT * FROM inventory_logs';
    const params: Array<string | number | boolean | null> = [];
    const productIdValue = typeof productId === 'string' ? productId : Array.isArray(productId) ? String(productId[0] ?? '') : '';
    if (productIdValue) {
      q += ' WHERE product_id = $1';
      params.push(productIdValue);
    }
    q += ' ORDER BY created_at DESC LIMIT 200';
    const { rows } = await pgQuery(q, params);
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/inventory/logs error', err);
    return res.status(500).json({ error: 'DB error' });
  }
});

// Get low stock products
app.get('/api/products/low-stock', authMiddleware, requirePermission('inventory:manage'), async (req, res) => {
  try {
    const { rows } = await pgQuery('SELECT id, name, stock_count, low_stock_threshold FROM products WHERE stock_count <= low_stock_threshold ORDER BY stock_count ASC');
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/products/low-stock error', err);
    return res.status(500).json({ error: 'DB error' });
  }
});

// --------------------------------------------------------
// MAP GEOCODING: Google primary, OpenStreetMap/Nominatim fallback
// --------------------------------------------------------
function hasGoogleMapsKey() {
  const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
  return Boolean(apiKey && apiKey !== 'YOUR_API_KEY' && apiKey.trim() !== '');
}

function nominatimHeaders() {
  const appUrl = process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || process.env.APP_URL || 'https://svayiro.local';
  const userAgent = process.env.NOMINATIM_USER_AGENT || `SVAYIRO/1.0 (${appUrl})`;
  return {
    'User-Agent': userAgent,
    'Accept-Language': 'en-IN,en;q=0.8'
  };
}

function normalizeNominatimAddress(raw: any) {
  const address = raw?.address || {};
  return {
    formattedAddress: raw?.display_name || '',
    state: address.state || '',
    district: address.state_district || address.county || address.city_district || '',
    city: address.city || address.town || address.village || address.suburb || address.hamlet || '',
    pincode: address.postcode || ''
  };
}

async function geocodeWithNominatim(address: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=in&q=${encodeURIComponent(address)}`;
  const response = await fetch(url, { headers: nominatimHeaders() as any });
  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    const err: any = new Error('Address not found by OpenStreetMap');
    err.statusCode = 404;
    throw err;
  }
  const results = data
    .map((item: any) => {
      const normalized = normalizeNominatimAddress(item);
      return {
        success: true,
        lat: Number(item.lat),
        lng: Number(item.lon),
        ...normalized,
        source: 'openstreetmap',
        placeType: item.type || item.class || ''
      };
    })
    .filter((item: any) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
  if (!results.length) {
    const err: any = new Error('OpenStreetMap returned no valid coordinates');
    err.statusCode = 404;
    throw err;
  }
  return { ...results[0], results };
}

async function reverseGeocodeWithNominatim(lat: number, lng: number) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`;
  const response = await fetch(url, { headers: nominatimHeaders() as any });
  const data = await response.json();
  if (!data || data.error) {
    const err: any = new Error('Pinned location not found by OpenStreetMap');
    err.statusCode = 404;
    throw err;
  }
  return {
    success: true,
    lat,
    lng,
    ...normalizeNominatimAddress(data),
    source: 'openstreetmap'
  };
}

app.post('/api/geocode', async (req, res) => {
  const { address } = req.body;
  if (!address || typeof address !== 'string') return res.status(400).json({ error: 'Address is required' });

  const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
  if (!hasGoogleMapsKey()) {
    try {
      return res.json(await geocodeWithNominatim(address));
    } catch (err: any) {
      console.error('POST /api/geocode OSM fallback error', err);
      return res.status(err.statusCode || 500).json({ error: err.message || 'OpenStreetMap geocoding failed' });
    }
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      const loc = result.geometry.location;
      const components = result.address_components || [];
      const getComponent = (types: string[]) => components.find((c: any) => types.some(t => c.types.includes(t)));
      const stateComp = getComponent(['administrative_area_level_1']);
      const districtComp = getComponent(['administrative_area_level_2', 'locality']);
      const cityComp = getComponent(['locality', 'administrative_area_level_3']);
      const pincodeComp = getComponent(['postal_code']);

      return res.json({
        success: true,
        lat: loc.lat,
        lng: loc.lng,
        formattedAddress: result.formatted_address,
        state: stateComp?.long_name || '',
        district: districtComp?.long_name || '',
        city: cityComp?.long_name || '',
        pincode: pincodeComp?.long_name || '',
        source: 'google-maps'
      });
    } else {
      return res.status(404).json({ error: 'Address not found by Google Maps', details: data.status });
    }
  } catch (err: any) {
    console.error('POST /api/geocode error', err);
    try {
      return res.json(await geocodeWithNominatim(address));
    } catch (fallbackErr: any) {
      console.error('POST /api/geocode fallback error', fallbackErr);
      return res.status(fallbackErr.statusCode || 500).json({ error: fallbackErr.message || err.message || 'Geocoding failed' });
    }
  }
});

app.post('/api/reverse-geocode', async (req, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'Valid latitude and longitude are required' });
  }

  const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
  if (!hasGoogleMapsKey()) {
    try {
      return res.json(await reverseGeocodeWithNominatim(lat, lng));
    } catch (err: any) {
      console.error('POST /api/reverse-geocode OSM fallback error', err);
      return res.status(err.statusCode || 500).json({ error: err.message || 'OpenStreetMap reverse geocoding failed' });
    }
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${lat},${lng}`)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      const components = result.address_components || [];
      const getComponent = (types: string[]) => components.find((c: any) => types.some(t => c.types.includes(t)));
      const stateComp = getComponent(['administrative_area_level_1']);
      const districtComp = getComponent(['administrative_area_level_3', 'administrative_area_level_2', 'locality']);
      const cityComp = getComponent(['locality', 'sublocality', 'administrative_area_level_4', 'postal_town']);
      const pincodeComp = getComponent(['postal_code']);

      return res.json({
        success: true,
        lat,
        lng,
        formattedAddress: result.formatted_address,
        state: stateComp?.long_name || '',
        district: districtComp?.long_name || '',
        city: cityComp?.long_name || '',
        pincode: pincodeComp?.long_name || '',
        source: 'google-maps'
      });
    }
    return res.status(404).json({ error: 'Pinned location not found by Google Maps', details: data.status });
  } catch (err: any) {
    console.error('POST /api/reverse-geocode error', err);
    try {
      return res.json(await reverseGeocodeWithNominatim(lat, lng));
    } catch (fallbackErr: any) {
      console.error('POST /api/reverse-geocode fallback error', fallbackErr);
      return res.status(fallbackErr.statusCode || 500).json({ error: fallbackErr.message || err.message || 'Reverse geocoding failed' });
    }
  }
});


// --------------------------------------------------------
// GOOGLE MAPS BIKE/DRIVE ROUTING DISTANCE CALCULATION
// --------------------------------------------------------

// Helper to extract pincodes and estimate distance realistically when API fails or is not configured
function estimateByPincode(origin: string, destination: string): { distanceKm: number; distanceText: string; durationText: string } {
  const originLower = origin.toLowerCase();
  const destLower = destination.toLowerCase();

  // 1. Check for explicit distance pattern in destination address (e.g. "300m", "300 meters", "0.3 km")
  const mMatch = destLower.match(/\b(\d+)\s*(?:m|meters|metres|mtrs|mtr)\b/);
  if (mMatch) {
    const meters = parseFloat(mMatch[1]);
    if (meters > 0 && meters < 5000) {
      const km = Math.round((meters / 1000) * 10) / 10;
      const mins = Math.max(1, Math.round(km * 4));
      return {
        distanceKm: km,
        distanceText: `${meters} m`,
        durationText: `${mins} min${mins > 1 ? 's' : ''}`
      };
    }
  }

  const kmMatch = destLower.match(/\b(\d+(?:\.\d+)?)\s*(?:km|kms|kilometers|kilometres)\b/);
  if (kmMatch) {
    const km = parseFloat(kmMatch[1]);
    if (km > 0 && km < 50) {
      const mins = Math.max(1, Math.round(km * 4));
      return {
        distanceKm: km,
        distanceText: `${km} km`,
        durationText: `${mins} min${mins > 1 ? 's' : ''}`
      };
    }
  }

  // 2. Check for layout or street match (e.g. "maruti" / "maruthi" layout)
  // Let's normalize common layout terms and check for matching names
  const normalizeWord = (w: string) => w.replace(/[^a-z0-9]/g, '');
  const stopWords = new Set(['and', 'the', 'near', 'opposite', 'behind', 'beside', 'layout', 'cross', 'road', 'street', 'bengaluru', 'bangalore', 'karnataka', 'india', 'flat', 'house', 'floor', 'block', 'pincode', 'main', 'first', 'second', 'third', '1st', '2nd', '3rd', 'enterprises', 'shop', 'branch']);

  const getSignificantWords = (text: string) => {
    return text.toLowerCase()
      .split(/[\s,]+/)
      .map(normalizeWord)
      .filter(w => w.length > 2 && !stopWords.has(w));
  };

  const originWords = getSignificantWords(originLower);
  const destWords = getSignificantWords(destLower);

  const cleanWordForMatching = (w: string) => {
    return w.replace(/th/g, 't').replace(/sh/g, 's').replace(/ph/g, 'f');
  };

  const originWordsClean = originWords.map(cleanWordForMatching);
  const destWordsClean = destWords.map(cleanWordForMatching);

  // Find intersection of significant words
  const matches = destWordsClean.filter(w => originWordsClean.includes(w));

  if (matches.length > 0) {
    // There is a matching local neighborhood / layout!
    console.log(`[Smart Distance Fallback] Local match found: "${matches.join(', ')}". Setting very close distance.`);
    return {
      distanceKm: 0.3, // 300 meters!
      distanceText: '300 m',
      durationText: '2 mins'
    };
  }

  // 3. Fallback to pincode checking
  const pinRegex = /\b\d{6}\b/;
  const originPin = origin.match(pinRegex)?.[0];
  const destPin = destination.match(pinRegex)?.[0];

  if (originPin && destPin) {
    if (originPin === destPin) {
      // Same local delivery zone
      return {
        distanceKm: 1.2,
        distanceText: '1.2 km',
        durationText: '5 mins'
      };
    }

    const op = parseInt(originPin, 10);
    const dp = parseInt(destPin, 10);

    // Both in Bengaluru (560xxx)
    if (originPin.startsWith('560') && destPin.startsWith('560')) {
      const diff = Math.abs(op - dp);
      // Map the difference to a realistic km range (e.g. 1.5km to 15km)
      const estKm = Math.min(25, Math.max(1.5, 1.5 + (diff % 10) * 1.2));
      const distanceKm = Math.round(estKm * 10) / 10;
      return {
        distanceKm,
        distanceText: `${distanceKm} km`,
        durationText: `${Math.round(distanceKm * 3.5)} mins`
      };
    }
  }

  // 4. Haversine-based pincode distance with known city lat/lng mappings
  const PINCODE_COORDS: Record<number, { lat: number; lng: number }> = {
    560001: { lat: 12.9767, lng: 77.5713 }, 560002: { lat: 12.984, lng: 77.58 }, 560003: { lat: 12.99, lng: 77.55 },
    560008: { lat: 13.02, lng: 77.55 }, 560025: { lat: 13.06, lng: 77.58 }, 560035: { lat: 13.05, lng: 77.65 },
    560038: { lat: 12.97, lng: 77.61 }, 560043: { lat: 12.94, lng: 77.52 }, 560048: { lat: 12.97, lng: 77.75 },
    560049: { lat: 13.06, lng: 77.52 }, 560061: { lat: 13.1, lng: 77.58 }, 560064: { lat: 13.0, lng: 77.68 },
    560067: { lat: 13.0, lng: 77.64 }, 560068: { lat: 13.02, lng: 77.66 }, 560070: { lat: 12.88, lng: 77.54 },
    560075: { lat: 13.03, lng: 77.57 }, 560076: { lat: 13.0, lng: 77.6 }, 560078: { lat: 12.94, lng: 77.72 },
    560086: { lat: 13.0, lng: 77.75 }, 560091: { lat: 13.08, lng: 77.65 }, 560092: { lat: 13.08, lng: 77.56 },
    560094: { lat: 13.1, lng: 77.6 }, 560095: { lat: 13.06, lng: 77.67 }, 560097: { lat: 12.92, lng: 77.63 },
    560098: { lat: 13.0, lng: 77.72 }, 560099: { lat: 13.0, lng: 77.78 }, 560100: { lat: 12.98, lng: 77.6 },
    500001: { lat: 17.385, lng: 78.4867 }, 500003: { lat: 17.42, lng: 78.45 }, 500007: { lat: 17.41, lng: 78.48 },
    500011: { lat: 17.36, lng: 78.48 }, 500016: { lat: 17.44, lng: 78.39 }, 500018: { lat: 17.46, lng: 78.5 },
    500019: { lat: 17.38, lng: 78.4 }, 500033: { lat: 17.44, lng: 78.5 }, 500034: { lat: 17.38, lng: 78.52 },
    500036: { lat: 17.49, lng: 78.4 }, 500038: { lat: 17.46, lng: 78.53 }, 500044: { lat: 17.38, lng: 78.55 },
    500045: { lat: 17.36, lng: 78.53 }, 500048: { lat: 17.42, lng: 78.55 }, 500054: { lat: 17.44, lng: 78.58 },
    500060: { lat: 17.47, lng: 78.58 }, 500063: { lat: 17.39, lng: 78.57 }, 500072: { lat: 17.32, lng: 78.58 },
    500081: { lat: 17.35, lng: 78.62 }, 500082: { lat: 17.4, lng: 78.47 }, 500084: { lat: 17.46, lng: 78.61 },
    500089: { lat: 17.35, lng: 78.54 }, 500090: { lat: 17.52, lng: 78.32 }, 500091: { lat: 17.52, lng: 78.44 },
    400001: { lat: 18.94, lng: 72.83 }, 400002: { lat: 18.94, lng: 72.84 }, 400005: { lat: 18.97, lng: 72.82 },
    400006: { lat: 19.0, lng: 72.83 }, 400007: { lat: 18.98, lng: 72.81 }, 400012: { lat: 19.01, lng: 72.87 },
    400014: { lat: 18.98, lng: 72.85 }, 400016: { lat: 18.99, lng: 72.8 }, 400017: { lat: 19.02, lng: 72.84 },
    400018: { lat: 19.02, lng: 72.87 }, 400019: { lat: 18.98, lng: 72.88 }, 400020: { lat: 18.97, lng: 72.88 },
    400021: { lat: 19.0, lng: 72.89 }, 400022: { lat: 19.03, lng: 72.87 }, 400025: { lat: 18.96, lng: 72.82 },
    400026: { lat: 19.02, lng: 72.88 }, 400028: { lat: 19.02, lng: 72.91 }, 400029: { lat: 19.05, lng: 72.9 },
    400035: { lat: 18.96, lng: 72.81 }, 400037: { lat: 19.06, lng: 72.93 }, 400042: { lat: 19.08, lng: 72.88 },
    400043: { lat: 19.06, lng: 72.89 }, 400049: { lat: 19.1, lng: 72.89 }, 400050: { lat: 19.1, lng: 72.87 },
    400051: { lat: 19.1, lng: 72.86 }, 400053: { lat: 19.08, lng: 72.92 }, 400054: { lat: 19.11, lng: 72.89 },
    400055: { lat: 19.07, lng: 72.92 }, 400056: { lat: 19.1, lng: 72.93 }, 400058: { lat: 19.13, lng: 72.9 },
    400059: { lat: 19.11, lng: 72.93 }, 400060: { lat: 19.12, lng: 72.9 }, 400061: { lat: 19.13, lng: 72.92 },
    400063: { lat: 19.11, lng: 72.96 }, 400064: { lat: 19.07, lng: 72.96 }, 400065: { lat: 19.1, lng: 72.98 },
    400066: { lat: 19.13, lng: 72.95 }, 400067: { lat: 19.15, lng: 72.97 }, 400068: { lat: 19.14, lng: 72.99 },
    400069: { lat: 19.09, lng: 73.0 }, 400070: { lat: 19.11, lng: 72.99 }, 400071: { lat: 19.13, lng: 73.02 },
    400072: { lat: 19.16, lng: 73.0 }, 400074: { lat: 19.08, lng: 72.98 }, 400075: { lat: 19.09, lng: 72.96 },
    400076: { lat: 19.12, lng: 72.97 }, 400077: { lat: 19.15, lng: 72.95 }, 400078: { lat: 19.18, lng: 72.96 },
    400079: { lat: 19.09, lng: 73.05 }, 400080: { lat: 19.13, lng: 73.04 }, 400081: { lat: 19.14, lng: 73.06 },
    400082: { lat: 19.16, lng: 73.06 }, 400083: { lat: 19.13, lng: 73.09 }, 400084: { lat: 19.15, lng: 73.1 },
    400085: { lat: 19.18, lng: 73.06 }, 400086: { lat: 19.15, lng: 73.15 }, 400087: { lat: 19.2, lng: 73.1 },
    400088: { lat: 19.19, lng: 73.08 }, 400089: { lat: 19.23, lng: 73.1 }, 400091: { lat: 19.24, lng: 73.13 },
    400092: { lat: 19.21, lng: 73.16 }, 400093: { lat: 19.24, lng: 73.16 }, 400094: { lat: 19.22, lng: 73.18 },
    400095: { lat: 19.26, lng: 73.16 }, 400096: { lat: 19.27, lng: 73.2 }, 400098: { lat: 19.26, lng: 73.23 },
    400099: { lat: 19.23, lng: 73.25 }, 400101: { lat: 19.2, lng: 72.98 }, 400102: { lat: 19.15, lng: 73.12 },
    400103: { lat: 19.18, lng: 73.14 }, 400104: { lat: 19.06, lng: 73.07 }, 400601: { lat: 19.23, lng: 72.98 },
    400602: { lat: 19.26, lng: 72.97 }, 400603: { lat: 19.29, lng: 72.99 }, 400604: { lat: 19.27, lng: 73.07 },
    400605: { lat: 19.33, lng: 73.03 }, 400606: { lat: 19.36, lng: 73.09 }, 400607: { lat: 19.27, lng: 73.13 },
    400608: { lat: 19.29, lng: 73.16 }, 400609: { lat: 19.3, lng: 73.21 }, 400610: { lat: 19.36, lng: 73.26 },
    400611: { lat: 19.39, lng: 73.22 }, 400612: { lat: 19.37, lng: 73.29 }, 400613: { lat: 19.36, lng: 73.35 },
    400614: { lat: 19.42, lng: 73.32 }, 400615: { lat: 19.46, lng: 73.36 }, 400616: { lat: 19.48, lng: 73.4 },
    400617: { lat: 19.5, lng: 73.42 }, 400618: { lat: 19.48, lng: 73.49 }, 400619: { lat: 19.53, lng: 73.46 },
    400620: { lat: 19.56, lng: 73.51 }, 400701: { lat: 19.02, lng: 73.0 }, 400702: { lat: 19.05, lng: 73.02 }
  };
  const CITY_CLUSTER: Record<string, { lat: number; lng: number }> = {
    bengaluru: { lat: 12.9716, lng: 77.5946 }, bangalore: { lat: 12.9716, lng: 77.5946 },
    hyderabad: { lat: 17.385, lng: 78.4867 }, mumbai: { lat: 18.94, lng: 72.83 }, delhi: { lat: 28.6139, lng: 77.209 },
    chennai: { lat: 13.0827, lng: 80.2707 }, pune: { lat: 18.5204, lng: 73.8567 }, kolkata: { lat: 22.5726, lng: 88.3639 },
    coimbatore: { lat: 11.0168, lng: 76.9558 }, udaipur: { lat: 24.5854, lng: 73.7165 }, kochi: { lat: 9.9312, lng: 76.2673 },
    goa: { lat: 15.2993, lng: 74.124 }, chandigarh: { lat: 30.7333, lng: 76.7794 }
  };

  function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const getCoordsFromPincode = (pin: string) => {
    const numeric = parseInt(pin, 10);
    const exact = PINCODE_COORDS[numeric];
    if (exact) return exact;
    return CITY_CLUSTER[pin.slice(0, 2)] || CITY_CLUSTER[pin.slice(0, 3)] || null;
  };

  if (originPin && destPin) {
    const oCoord = getCoordsFromPincode(originPin);
    const dCoord = getCoordsFromPincode(destPin);
    if (oCoord && dCoord) {
      const km = Math.round(haversine(oCoord.lat, oCoord.lng, dCoord.lat, dCoord.lng) * 10) / 10;
      if (km > 0) {
        return {
          distanceKm: km,
          distanceText: `${km} km`,
          durationText: `${Math.max(2, Math.round(km * 3.5))} mins`
        };
      }
    }
  }

  // 5. City cluster heuristic when pincode lookup fails
  const originCity = Object.entries(CITY_CLUSTER).find(([k]) => originLower.includes(k));
  const destCity = Object.entries(CITY_CLUSTER).find(([k]) => destLower.includes(k));
  if (originCity && destCity) {
    if (originCity[0] === destCity[0]) {
      return { distanceKm: 3.5, distanceText: '~3.5 km', durationText: '12 mins' };
    }
    const km = Math.round(haversine(originCity[1].lat, originCity[1].lng, destCity[1].lat, destCity[1].lng) * 10) / 10;
    return {
      distanceKm: km,
      distanceText: `${km} km`,
      durationText: `${Math.max(10, Math.round(km * 3.5))} mins`
    };
  }

  // Default fallback based on string lengths if no pincodes match or different regions
  const hash = (origin.length * 3 + destination.length * 7) % 15;
  const distanceKm = Math.round((2.5 + hash * 0.8) * 10) / 10;
  return {
    distanceKm,
    distanceText: `${distanceKm} km`,
    durationText: `${Math.round(distanceKm * 4)} mins`
  };
}

// Helper to simplify highly specific addresses (e.g. stripping flat/building info to assist geocoding)
function simplifyAddressString(address: string): string {
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length > 2) {
    const firstPart = parts[0].toLowerCase();
    const hasSpecificIdentifiers =
      /\b(flat|house|door|no|floor|room|suite|villa|building|apartment|apt|bldg|block|site|plot|shop|opp|near|beside|behind)\b/.test(firstPart) ||
      /\d+/.test(firstPart);

    if (hasSpecificIdentifiers) {
      let simplified = parts.slice(1).join(', ');
      const secondPart = parts[1].toLowerCase();
      if (parts.length > 3 && (
        /\b(floor|block|phase|wing|apartment|villa|building|complex)\b/.test(secondPart) ||
        /\d+/.test(secondPart)
      )) {
        simplified = parts.slice(2).join(', ');
      }
      return simplified;
    }
  }
  return address;
}

function estimateByPinnedCoordinates(originLat: number, originLng: number, destLat: number, destLng: number) {
  const hasCoords = [originLat, originLng, destLat, destLng].every((value) => Number.isFinite(Number(value)));
  if (!hasCoords) return null;
  const R = 6371;
  const dLat = ((destLat - originLat) * Math.PI) / 180;
  const dLng = ((destLng - originLng) * Math.PI) / 180;
  const lat1 = (originLat * Math.PI) / 180;
  const lat2 = (destLat * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const straightKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const adjustedKm = Math.round(Math.max(0.3, straightKm * 1.35) * 10) / 10;
  return {
    distanceKm: adjustedKm,
    distanceText: `~${adjustedKm} km`,
    durationText: `${Math.max(3, Math.round(adjustedKm * 4))} mins`,
    source: 'free-coordinate-estimate'
  };
}

async function getGoogleRouteDistance(originLat: number, originLng: number, destLat: number, destLng: number) {
  const hasCoords = [originLat, originLng, destLat, destLng].every((value) => Number.isFinite(Number(value)));
  if (!hasCoords) {
    const err: any = new Error('Pinned shop and customer coordinates are required for accurate delivery distance.');
    err.statusCode = 400;
    throw err;
  }

  const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
  if (!apiKey || apiKey === 'YOUR_API_KEY' || apiKey.trim() === '') {
    const err: any = new Error('Google Maps API key is required for accurate delivery distance.');
    err.statusCode = 503;
    throw err;
  }

  const originCoords = `${Number(originLat)},${Number(originLng)}`;
  const destCoords = `${Number(destLat)},${Number(destLng)}`;
  const tryFetchDirections = async (mode: 'driving' | 'walking' = 'driving') => {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(originCoords)}&destination=${encodeURIComponent(destCoords)}&mode=${mode}&key=${apiKey}`;
    const response = await fetch(url);
    return await response.json();
  };

  let data = await tryFetchDirections('driving');
  if (data.status === 'ZERO_RESULTS') {
    data = await tryFetchDirections('walking');
  }
  if (data.status === 'OK' && data.routes && data.routes.length > 0) {
    const leg = data.routes[0].legs[0];
    const distanceKm = Math.round((leg.distance.value / 1000) * 10) / 10;
    return { distanceKm, distanceText: leg.distance.text, durationText: leg.duration.text, source: 'google-maps' };
  }
  const err: any = new Error('Google Maps could not calculate a route for these pinned locations.');
  err.statusCode = 422;
  err.details = data.status;
  throw err;
}

app.post('/api/calculate-distance', async (req, res) => {
  const { origin, destination, originLat, originLng, destLat, destLng } = req.body;
  if (!origin || !destination) return res.status(400).json({ error: 'Origin and destination are required' });

  const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
  if (!apiKey || apiKey === 'YOUR_API_KEY' || apiKey.trim() === '') {
    const coordinateEstimate = estimateByPinnedCoordinates(Number(originLat), Number(originLng), Number(destLat), Number(destLng));
    const fallback = coordinateEstimate || { ...estimateByPincode(String(origin), String(destination)), source: 'free-address-estimate' };
    return res.json({
      success: true,
      ...fallback,
      isEstimate: true,
      warning: 'Google Maps is not configured. Delivery distance is estimated using free coordinate/address fallback.'
    });
  }

  try {
    const route = await getGoogleRouteDistance(Number(originLat), Number(originLng), Number(destLat), Number(destLng));
    return res.json({ success: true, ...route });
  } catch (err: any) {
    const coordinateEstimate = estimateByPinnedCoordinates(Number(originLat), Number(originLng), Number(destLat), Number(destLng));
    const fallback = coordinateEstimate || { ...estimateByPincode(String(origin), String(destination)), source: 'free-address-estimate' };
    return res.json({
      success: true,
      ...fallback,
      isEstimate: true,
      warning: err.message || 'Google Maps route calculation failed; using free fallback estimate.',
      details: err.details
    });
  }
});


// --------------------------------------------------------
// CATEGORY APIs
// --------------------------------------------------------
app.get('/api/categories', async (req, res) => {
  try {
    const cacheKey = 'categories';
    const cached = getPublicCache(cacheKey);
    if (cached) return sendCacheableJson(res, cached, 300);
    const { rows } = await pgQuery('SELECT *, parent_id AS "parentId" FROM categories ORDER BY position ASC, created_at DESC');
    const categories = rows.map(normalizeCategory);
    setPublicCache(cacheKey, categories, 300_000);
    return sendCacheableJson(res, categories, 300);
  } catch (err) {
    console.error('GET /api/categories error', err);
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.get('/api/categories/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const p = await pgQuery('SELECT *, parent_id AS "parentId" FROM categories WHERE id = $1', [id]);
    if (p.rowCount === 0) return res.status(404).json({ error: 'Category not found' });
    return res.json(normalizeCategory(p.rows[0]));
  } catch (err) {
    console.error('GET /api/categories/:id error', err);
    return res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// Admin: get ALL categories (including disabled)
app.get('/api/admin/categories', authMiddleware, requirePermission('categories:manage'), async (req, res) => {
  try {
    const { rows } = await pgQuery('SELECT *, parent_id AS "parentId" FROM categories ORDER BY position ASC, created_at DESC');
    return res.json(rows.map(normalizeCategory));
  } catch (err) {
    console.error('GET /api/admin/categories error', err);
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/categories', authMiddleware, requirePermission('categories:manage'), async (req, res) => {
  const category = req.body;
  const validationErrors = validateCategoryPayload(category);
  if (validationErrors.length > 0) return res.status(400).json({ error: validationErrors.join('; ') });
  try {
    const ins = await pgQuery('INSERT INTO categories(name, slug, description, image_url, parent_id, is_enabled, position, metadata, created_at, updated_at) VALUES($1,$2,$3,$4,$5,true,$6,$7,now(),now()) RETURNING *', [category.name, category.slug || category.name.toLowerCase().replace(/\s+/g, '-'), category.description || null, category.imageUrl || null, category.parentId || null, category.order || 0, category.metadata || {}]);
    invalidatePublicCache('categories');
    invalidatePublicCache('products:');
    return res.json({ success: true, data: normalizeCategory(ins.rows[0]) });
  } catch (err) {
    console.error('POST /api/categories error', err);
    return res.status(500).json({ error: 'Failed to create category' });
  }
});

// Get subcategories for a given parent category (customer-facing, only enabled ones)
app.get('/api/categories/:id/subcategories', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pgQuery(
      'SELECT *, parent_id AS "parentId" FROM categories WHERE parent_id = $1 AND is_enabled = true ORDER BY position ASC, created_at DESC',
      [id]
    );
    return res.json(rows.map(normalizeCategory));
  } catch (err) {
    console.error('GET /api/categories/:id/subcategories error', err);
    return res.status(500).json({ error: 'Failed to fetch subcategories' });
  }
});

app.put('/api/categories/:id', authMiddleware, requirePermission('categories:manage'), async (req, res) => {
  const { id } = req.params;
  const categoryData = req.body;
  const validationErrors = validateCategoryPayload(categoryData, true);
  if (validationErrors.length > 0) return res.status(400).json({ error: validationErrors.join('; ') });
  try {
    const upd = await pgQuery(
      `UPDATE categories SET
        name = COALESCE($1::varchar, name),
        slug = COALESCE($2::varchar, slug),
        description = COALESCE($3::text, description),
        image_url = COALESCE($4::text, image_url),
        parent_id = $5::uuid,
        is_enabled = true,
        position = COALESCE($6::integer, position),
        metadata = COALESCE($7::jsonb, metadata),
        updated_at = now()
      WHERE id = $8::uuid
      RETURNING *`,
      [
        categoryData.name ?? null,
        categoryData.slug ?? null,
        categoryData.description ?? null,
        categoryData.imageUrl ?? null,
        categoryData.parentId ?? null,
        categoryData.order ?? null,
        categoryData.metadata ?? null,
        id
      ]
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: 'Category not found' });
    invalidatePublicCache('categories');
    invalidatePublicCache('products:');
    return res.json({ success: true, data: normalizeCategory(upd.rows[0]) });
  } catch (err) {
    console.error('PUT /api/categories/:id error', err);
    return res.status(500).json({ error: 'Failed to update category' });
  }
});

app.delete('/api/categories/:id', authMiddleware, requirePermission('categories:manage'), async (req, res) => {
  const { id } = req.params;
  try {
    await pgQuery('DELETE FROM categories WHERE id = $1', [id]);
    invalidatePublicCache('categories');
    invalidatePublicCache('products:');
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/categories/:id error', err);
    return res.status(500).json({ error: 'Failed to delete category' });
  }
});


// --------------------------------------------------------
// PRODUCT APIs (Postgres-backed)
// --------------------------------------------------------

app.get('/api/search-config', (req, res) => {
  const rawDelayMs = Number(process.env.SEARCH_DELAY_MS || 450);
  return res.json({
    useDelay: process.env.SEARCH_USE_DELAY !== 'false',
    delayMs: Number.isFinite(rawDelayMs) ? Math.min(Math.max(rawDelayMs, 0), 1500) : 450
  });
});

app.get('/api/products', async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId.trim() : '';
    const sortMode = typeof req.query.sort === 'string' ? req.query.sort.trim() : '';
    const summaryMode = req.query.summary === 'true';
    const includeTotal = req.query.includeTotal === 'true';
    const wantsDisabledProducts = req.query.includeDisabled === 'true';
    let includeDisabledProducts = false;
    if (wantsDisabledProducts) {
      await attachOptionalUserFromBearer(req);
      if (!(req as any).currentUser || !hasPermission(req, 'products:manage')) {
        return res.status(403).json({ error: 'Permission denied', permission: 'products:manage' });
      }
      includeDisabledProducts = true;
    }
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 50) : 120;
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
    const cacheKey = `products:${req.originalUrl}`;
    if (summaryMode) {
      const cached = getPublicCache(cacheKey);
      if (cached) return sendCacheableJson(res, cached, 30);
    }
    const params: any[] = [];
    const where = includeDisabledProducts ? ['TRUE'] : ['p.is_enabled = true'];

    if (categoryId) {
      params.push(categoryId);
      where.push(`EXISTS (
        SELECT 1
        FROM product_categories pc_filter
        WHERE pc_filter.product_id = p.id
          AND pc_filter.category_id IN (
        WITH RECURSIVE category_tree AS (
          SELECT id FROM categories WHERE id = $${params.length}::uuid
          UNION ALL
          SELECT c.id FROM categories c
          INNER JOIN category_tree ct ON c.parent_id = ct.id
        )
        SELECT id FROM category_tree
          )
      )`);
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      const param = `$${params.length}`;
      where.push(`(lower(coalesce(p.name, '')) LIKE ${param} OR lower(coalesce(p.description, '')) LIKE ${param} OR lower(coalesce(p.sku, '')) LIKE ${param})`);
    }

    let orderBy = 'p.created_at DESC';
    if (sortMode === 'featured') {
      where.push(`COALESCE((p.metadata->>'isFeatured')::boolean, false) = true`);
      orderBy = 'COALESCE((p.metadata->>\'isDailyEssential\')::boolean, false) DESC, p.updated_at DESC, p.created_at DESC';
    } else if (sortMode === 'offers') {
      where.push('p.offer_price > 0 AND p.base_price > p.offer_price');
      orderBy = '((p.base_price - p.offer_price) / NULLIF(p.base_price, 0)) DESC, p.updated_at DESC';
    } else if (sortMode === 'recommended') {
      where.push(`(
        COALESCE((p.metadata->>'isFeatured')::boolean, false) = true
        OR COALESCE((p.metadata->>'isDailyEssential')::boolean, false) = true
        OR (p.offer_price > 0 AND p.base_price > p.offer_price)
        OR COALESCE((p.metadata->>'ratingAverage')::numeric, (p.metadata->>'rating_average')::numeric, 0) > 0
      )`);
      orderBy = `
        (
          COALESCE((p.metadata->>'ratingAverage')::numeric, (p.metadata->>'rating_average')::numeric, 0) * 2
          + COALESCE((p.metadata->>'ratingCount')::numeric, (p.metadata->>'rating_count')::numeric, 0) * 0.1
          + CASE WHEN COALESCE((p.metadata->>'isFeatured')::boolean, false) THEN 4 ELSE 0 END
          + CASE WHEN COALESCE((p.metadata->>'isDailyEssential')::boolean, false) THEN 3 ELSE 0 END
          + CASE WHEN p.offer_price > 0 AND p.base_price > p.offer_price THEN 2 ELSE 0 END
          + CASE WHEN p.stock_count > 0 THEN 1 ELSE 0 END
        ) DESC,
        p.updated_at DESC
      `;
    }

    const countParams = [...params];
    params.push(limit);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const sql = summaryMode
      ? `
        SELECT
          p.id,
          p.category_id,
          p.subcategory_id,
          p.sku,
          p.name,
          p.slug,
          p.description,
          p.base_price,
          p.offer_price,
          p.stock_count,
          p.weight_grams,
          p.is_enabled,
          p.low_stock_threshold,
          p.metadata,
          p.created_at,
          p.updated_at,
          first_image.url AS first_image_url,
          COALESCE(array_remove(array_agg(pc.category_id ORDER BY pc.is_primary DESC, pc.created_at ASC), NULL), ARRAY[]::uuid[]) AS category_ids
        FROM products p
        LEFT JOIN product_categories pc ON pc.product_id = p.id
        LEFT JOIN LATERAL (
          SELECT url
          FROM product_images
          WHERE product_id = p.id
          ORDER BY position ASC
          LIMIT 1
        ) first_image ON true
        WHERE ${where.join(' AND ')}
        GROUP BY p.id, first_image.url
        ORDER BY ${orderBy}
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `
      : `
        SELECT
          p.id,
          p.category_id,
          p.subcategory_id,
          p.sku,
          p.name,
          p.slug,
          p.description,
          p.base_price,
          p.offer_price,
          p.stock_count,
          p.weight_grams,
          p.is_enabled,
          p.low_stock_threshold,
          p.metadata,
          p.created_at,
          p.updated_at,
          COALESCE(array_remove(array_agg(pc.category_id ORDER BY pc.is_primary DESC, pc.created_at ASC), NULL), ARRAY[]::uuid[]) AS category_ids
        FROM products p
        LEFT JOIN product_categories pc ON pc.product_id = p.id
        WHERE ${where.join(' AND ')}
        GROUP BY p.id
        ORDER BY ${orderBy}
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `;
    const { rows } = await pgQuery(sql, params);
    let total = 0;
    if (includeTotal) {
      const totalRes = await pgQuery(`SELECT COUNT(*)::int AS total FROM products p WHERE ${where.join(' AND ')}`, countParams);
      total = Number(totalRes.rows[0]?.total || 0);
    }
    if (rows.length === 0) {
      const emptyPayload = includeTotal ? { items: [], total, limit, offset } : [];
      return res.json(emptyPayload);
    }
    if (summaryMode) {
      const products = rows.map((row: any) => normalizeProductSummary(row)).filter(Boolean);
      const payload = includeTotal ? { items: products, total, limit, offset } : products;
      setPublicCache(cacheKey, payload, 30_000);
      return sendCacheableJson(res, payload, 30);
    }
    const productIds = rows.map((row: any) => row.id);
    const imgs = await pgQuery('SELECT product_id, url, position FROM product_images WHERE product_id = ANY($1::uuid[]) ORDER BY position ASC', [productIds]);
    const imagesByProduct = new Map<string, any[]>();
    for (const image of imgs.rows) {
      const list = imagesByProduct.get(image.product_id) || [];
      list.push(image);
      imagesByProduct.set(image.product_id, list);
    }
    const products = rows.map((row: any) => normalizeProduct(row, imagesByProduct.get(row.id) || []));
    return res.json(includeTotal ? { items: products, total, limit, offset } : products);
  } catch (err) {
    console.error('GET /api/products error', err);
    return res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/products/recommended', authMiddleware, async (req: any, res) => {
  try {
    const user = req.currentUser || req.user;
    if (!user?.id) return res.status(401).json({ error: 'Not authenticated' });
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 20) : 8;
    const phoneDigits = String(user.phone || '').replace(/\D/g, '').slice(-10);
    const searchTerms = typeof req.query.searchTerms === 'string'
      ? req.query.searchTerms
        .split(',')
        .map((term: string) => term.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8)
      : [];
    const searchPatterns = searchTerms.map((term: string) => `%${term}%`);

    const { rows } = await pgQuery(`
      WITH wishlist_product_ids AS (
        SELECT unnest(COALESCE(u.wishlist, ARRAY[]::uuid[])) AS product_id
        FROM users u
        WHERE u.id = $1::uuid
        UNION
        SELECT w.product_id
        FROM wishlists w
        WHERE w.user_id = $1::uuid
      ),
      customer_orders AS (
        SELECT o.id
        FROM orders o
        WHERE o.status <> 'cancelled'
          AND (
            o.user_id = $1::uuid
            OR ($2::text <> '' AND RIGHT(regexp_replace(COALESCE(o.customer_phone, ''), '\\D', '', 'g'), 10) = $2::text)
          )
      ),
      ordered_product_ids AS (
        SELECT DISTINCT oi.product_id
        FROM order_items oi
        INNER JOIN customer_orders co ON co.id = oi.order_id
        WHERE oi.product_id IS NOT NULL
      ),
      ordered_product_stats AS (
        SELECT
          oi.product_id,
          COUNT(*)::numeric AS order_count
        FROM order_items oi
        INNER JOIN customer_orders co ON co.id = oi.order_id
        WHERE oi.product_id IS NOT NULL
        GROUP BY oi.product_id
      ),
      ordered_category_ids AS (
        SELECT DISTINCT pc.category_id
        FROM ordered_product_ids op
        INNER JOIN product_categories pc ON pc.product_id = op.product_id
        UNION
        SELECT DISTINCT p.category_id
        FROM ordered_product_ids op
        INNER JOIN products p ON p.id = op.product_id
        WHERE p.category_id IS NOT NULL
      ),
      wishlist_category_ids AS (
        SELECT DISTINCT pc.category_id
        FROM wishlist_product_ids wp
        INNER JOIN product_categories pc ON pc.product_id = wp.product_id
        UNION
        SELECT DISTINCT p.category_id
        FROM wishlist_product_ids wp
        INNER JOIN products p ON p.id = wp.product_id
        WHERE p.category_id IS NOT NULL
      ),
      recent_search_patterns AS (
        SELECT '%' || lower(term) || '%' AS term
        FROM customer_search_history
        WHERE user_id = $1::uuid
        ORDER BY searched_at DESC
        LIMIT 12
      ),
      search_patterns AS (
        SELECT DISTINCT term
        FROM (
          SELECT unnest($3::text[]) AS term
          UNION ALL
          SELECT term FROM recent_search_patterns
        ) source_terms
        WHERE term IS NOT NULL AND term <> ''
      ),
      popular_product_stats AS (
        SELECT
          oi.product_id,
          COUNT(*)::numeric AS global_order_count
        FROM order_items oi
        INNER JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id IS NOT NULL
          AND o.status <> 'cancelled'
        GROUP BY oi.product_id
      )
      SELECT
        p.id,
        p.category_id,
        p.subcategory_id,
        p.sku,
        p.name,
        p.slug,
        p.description,
        p.base_price,
        p.offer_price,
        p.stock_count,
        p.weight_grams,
        p.is_enabled,
        p.low_stock_threshold,
        p.metadata,
        p.created_at,
        p.updated_at,
        first_image.url AS first_image_url,
        COALESCE(pc_summary.category_ids, ARRAY[]::uuid[]) AS category_ids,
        (
          CASE WHEN EXISTS (SELECT 1 FROM wishlist_product_ids wp WHERE wp.product_id = p.id) THEN 12 ELSE 0 END
          + CASE WHEN EXISTS (SELECT 1 FROM ordered_product_ids op WHERE op.product_id = p.id) THEN 9 ELSE 0 END
          + CASE WHEN EXISTS (
              SELECT 1
              FROM product_categories pc_match
              WHERE pc_match.product_id = p.id
                AND pc_match.category_id IN (SELECT category_id FROM ordered_category_ids)
            ) OR p.category_id IN (SELECT category_id FROM ordered_category_ids) THEN 6 ELSE 0 END
          + CASE WHEN EXISTS (
              SELECT 1
              FROM product_categories pc_match
              WHERE pc_match.product_id = p.id
                AND pc_match.category_id IN (SELECT category_id FROM wishlist_category_ids)
            ) OR p.category_id IN (SELECT category_id FROM wishlist_category_ids) THEN 5 ELSE 0 END
          + CASE WHEN EXISTS (
              SELECT 1 FROM search_patterns sp
              WHERE lower(COALESCE(p.name, '')) LIKE sp.term
                 OR lower(COALESCE(p.description, '')) LIKE sp.term
                 OR lower(COALESCE(p.sku, '')) LIKE sp.term
            ) THEN 6 ELSE 0 END
          + LEAST(COALESCE(ops.order_count, 0), 5) * 1.5
          + LEAST(COALESCE(pps.global_order_count, 0), 20) * 0.2
          + CASE WHEN p.offer_price > 0 AND p.base_price > p.offer_price THEN 3 ELSE 0 END
          + CASE WHEN COALESCE((p.metadata->>'isDailyEssential')::boolean, false) THEN 1.5 ELSE 0 END
          + CASE WHEN COALESCE((p.metadata->>'isFeatured')::boolean, false) THEN 1 ELSE 0 END
          + COALESCE((p.metadata->>'ratingAverage')::numeric, (p.metadata->>'rating_average')::numeric, 0) * 1.2
          + LEAST(COALESCE((p.metadata->>'ratingCount')::numeric, (p.metadata->>'rating_count')::numeric, 0), 50) * 0.05
        ) AS recommendation_score,
        CASE
          WHEN EXISTS (SELECT 1 FROM wishlist_product_ids wp WHERE wp.product_id = p.id) THEN 'From your wishlist'
          WHEN EXISTS (SELECT 1 FROM ordered_product_ids op WHERE op.product_id = p.id) THEN 'Buy again'
          WHEN EXISTS (
            SELECT 1
            FROM product_categories pc_match
            WHERE pc_match.product_id = p.id
              AND pc_match.category_id IN (SELECT category_id FROM ordered_category_ids)
          ) OR p.category_id IN (SELECT category_id FROM ordered_category_ids) THEN 'Similar to your orders'
          WHEN EXISTS (
            SELECT 1 FROM search_patterns sp
            WHERE lower(COALESCE(p.name, '')) LIKE sp.term
               OR lower(COALESCE(p.description, '')) LIKE sp.term
               OR lower(COALESCE(p.sku, '')) LIKE sp.term
          ) THEN 'Based on your searches'
          WHEN p.offer_price > 0 AND p.base_price > p.offer_price THEN 'Good offer'
          WHEN COALESCE(pps.global_order_count, 0) > 0 THEN 'Popular with customers'
          ELSE 'Recommended pick'
        END AS recommendation_reason
      FROM products p
      LEFT JOIN ordered_product_stats ops ON ops.product_id = p.id
      LEFT JOIN popular_product_stats pps ON pps.product_id = p.id
      LEFT JOIN LATERAL (
        SELECT COALESCE(array_remove(array_agg(pc.category_id ORDER BY pc.is_primary DESC, pc.created_at ASC), NULL), ARRAY[]::uuid[]) AS category_ids
        FROM product_categories pc
        WHERE pc.product_id = p.id
      ) pc_summary ON true
      LEFT JOIN LATERAL (
        SELECT url
        FROM product_images
        WHERE product_id = p.id
        ORDER BY position ASC
        LIMIT 1
      ) first_image ON true
      WHERE p.is_enabled = true
        AND p.stock_count > 0
        AND COALESCE((p.metadata->>'isLooseItem')::boolean, false) = false
      ORDER BY recommendation_score DESC, p.updated_at DESC, p.created_at DESC
      LIMIT $4::int
    `, [user.id, phoneDigits, searchPatterns, limit]);

    res.set('Cache-Control', 'private, max-age=30');
    return res.json({
      items: rows.map((row: any) => normalizeProductSummary(row)).filter(Boolean),
      limit
    });
  } catch (err) {
    console.error('GET /api/products/recommended error', err);
    return res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/products/lookup-by-barcode/:barcode', authMiddleware, requirePermission('pos:use'), async (req, res) => {
  const rawBarcode = String(req.params.barcode || '').trim();
  const looseLabel = parseLooseLabelBarcode(rawBarcode);
  const barcode = looseLabel ? looseLabel.barcodeValue : normalizeBarcodeValue(rawBarcode);
  if (!barcode) return res.status(400).json({ error: 'Barcode is required' });
  try {
    if (looseLabel) {
      const p = await pgQuery(`
        SELECT
          p.id,
          p.category_id,
          p.subcategory_id,
          p.sku,
          p.name,
          p.slug,
          p.description,
          p.base_price,
          p.offer_price,
          p.stock_count,
          p.weight_grams,
          p.is_enabled,
          p.low_stock_threshold,
          p.metadata,
          p.created_at,
          p.updated_at,
          COALESCE(array_remove(array_agg(pc.category_id ORDER BY pc.is_primary DESC, pc.created_at ASC), NULL), ARRAY[]::uuid[]) AS category_ids
        FROM products p
        LEFT JOIN product_categories pc ON pc.product_id = p.id
        WHERE p.metadata->>'pluCode' = $1
          AND p.metadata @> '{"isLooseItem": true}'::jsonb
        GROUP BY p.id
        LIMIT 1
      `, [looseLabel.pluCode]);
      if (p.rowCount === 0) return res.status(404).json({ error: 'Loose label PLU is not linked to any product.' });
      const row = p.rows[0];
      if (Number(row.stock_count || 0) < looseLabel.baseQuantity) return res.status(409).json({ error: `Insufficient stock for ${row.name}.` });
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const stockUnit = normalizeLooseStockUnit(metadata.stockUnit);
      const product = normalizeProduct({
        ...row,
        metadata: {
          ...metadata,
          looseScan: {
            ...looseLabel,
            stockQuantity: looseLabel.baseQuantity,
            quantityLabel: looseQuantityLabel(looseLabel.baseQuantity, stockUnit),
            stockUnit
          }
        }
      }, []);
      return res.json({ success: true, product, barcode, looseLabel: product?.metadata?.looseScan });
    }

    const p = await pgQuery(`
      SELECT
        p.id,
        p.category_id,
        p.subcategory_id,
        p.sku,
        p.name,
        p.slug,
        p.description,
        p.base_price,
        p.offer_price,
        p.stock_count,
        p.weight_grams,
        p.is_enabled,
        p.low_stock_threshold,
        p.metadata,
        p.created_at,
        p.updated_at,
        COALESCE(array_remove(array_agg(pc.category_id ORDER BY pc.is_primary DESC, pc.created_at ASC), NULL), ARRAY[]::uuid[]) AS category_ids
      FROM products p
      LEFT JOIN product_categories pc ON pc.product_id = p.id
      WHERE p.sku = $1
         OR EXISTS (
          SELECT 1 FROM product_barcodes pb
          WHERE pb.product_id = p.id AND pb.barcode_value = $1
         )
      GROUP BY p.id
      LIMIT 1
    `, [barcode]);
    if (p.rowCount === 0) return res.status(404).json({ error: 'Barcode not linked to any product.' });
    const product = normalizeProduct(p.rows[0], []);
    return res.json({ success: true, product, barcode });
  } catch (err) {
    console.error('GET /api/products/lookup-by-barcode/:barcode error', err);
    return res.status(500).json({ error: 'Failed to lookup barcode' });
  }
});

app.get('/api/products/:id/barcodes', authMiddleware, requirePermission('products:manage'), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pgQuery('SELECT * FROM product_barcodes WHERE product_id = $1 ORDER BY is_primary DESC, created_at ASC', [id]);
    return res.json(rows.map(normalizeProductBarcode));
  } catch (err) {
    console.error('GET /api/products/:id/barcodes error', err);
    return res.status(500).json({ error: 'Failed to fetch product barcodes' });
  }
});

app.post('/api/products/:id/barcodes', authMiddleware, requirePermission('products:manage'), async (req, res) => {
  const { id } = req.params;
  const barcode = normalizeBarcodeValue(req.body?.barcodeValue || req.body?.barcode);
  if (!/^[A-Z0-9-]{4,100}$/.test(barcode)) return res.status(400).json({ error: 'Enter a valid barcode value.' });
  try {
    const result = await pgQuery(
      'INSERT INTO product_barcodes(product_id, barcode_value, barcode_type, is_primary, created_at) VALUES($1,$2,$3,false,now()) RETURNING *',
      [id, barcode, req.body?.barcodeType || 'EAN/UPC']
    );
    return res.json({ success: true, data: normalizeProductBarcode(result.rows[0]) });
  } catch (err: any) {
    console.error('POST /api/products/:id/barcodes error', err);
    if (err.code === '23505') return res.status(409).json({ error: 'This barcode is already linked to another product.' });
    return res.status(500).json({ error: 'Failed to save barcode' });
  }
});

app.delete('/api/products/:id/barcodes/:barcodeId', authMiddleware, requirePermission('products:manage'), async (req, res) => {
  const { id, barcodeId } = req.params;
  try {
    await pgQuery('DELETE FROM product_barcodes WHERE id = $1 AND product_id = $2', [barcodeId, id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/products/:id/barcodes/:barcodeId error', err);
    return res.status(500).json({ error: 'Failed to delete barcode' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const p = await pgQuery(`
      SELECT
        p.id,
        p.category_id,
        p.subcategory_id,
        p.sku,
        p.name,
        p.slug,
        p.description,
        p.base_price,
        p.offer_price,
        p.stock_count,
        p.weight_grams,
        p.is_enabled,
        p.low_stock_threshold,
        p.metadata,
        p.created_at,
        p.updated_at,
        COALESCE(array_remove(array_agg(pc.category_id ORDER BY pc.is_primary DESC, pc.created_at ASC), NULL), ARRAY[]::uuid[]) AS category_ids
      FROM products p
      LEFT JOIN product_categories pc ON pc.product_id = p.id
      WHERE p.id = $1
      GROUP BY p.id
    `, [id]);
    if (p.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    const imgs = await pgQuery('SELECT id, url, position FROM product_images WHERE product_id = $1 ORDER BY position ASC', [id]);
    const prod = p.rows[0];
    return res.json(normalizeProduct(prod, imgs.rows));
  } catch (err) {
    console.error('GET /api/products/:id error', err);
    return res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/public/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pgQuery(
      `
      SELECT
        id,
        order_ref,
        customer_name,
        customer_phone,
        status,
        payment_method,
        payment_status,
        payment_ref,
        delivery_method,
        delivery_address,
        selected_slot,
        bag_option,
        items,
        amount_total,
        delivery_charge,
        bag_charge,
        discount_amount,
        final_amount,
        created_at,
        updated_at
      FROM orders
      WHERE id = $1
         OR order_ref = $1
      LIMIT 1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Invoice not found'
      });
    }

    const row = result.rows[0];

    res.json({
      id: row.id,
      orderRef: row.order_ref,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      status: row.status,
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      paymentRef: row.payment_ref,
      deliveryMethod: row.delivery_method,
      deliveryAddress: row.delivery_address,
      selectedSlot: row.selected_slot,
      bagOption: row.bag_option,
      items: row.items || [],
      amountTotal: Number(row.amount_total),
      deliveryCharge: Number(row.delivery_charge),
      bagCharge: Number(row.bag_charge),
      discountAmount: Number(row.discount_amount),
      finalAmount: Number(row.final_amount),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error('Public invoice error:', err);

    res.status(500).json({
      error: 'Failed to fetch public invoice'
    });
  }
});

app.post('/api/products', authMiddleware, requirePermission('products:manage'), async (req, res) => {
  const productData = { ...req.body, sku: undefined };
  const validationErrors = validateProductPayload(productData);
  if (validationErrors.length > 0) return res.status(400).json({ error: validationErrors.join('; ') });
  try {
    const result = await runTransaction(async (client) => {
      const isLooseItem = Boolean(productData.isLooseItem);
      const looseSection = normalizeLooseSection(productData.looseSection);
      const stockUnit = normalizeLooseStockUnit(productData.stockUnit);
      const sellingUnit = normalizeLooseSellingUnit(productData.sellingUnit || productData.unit, productData.unit || 'kg');
      const manualPlu = String(productData.pluCode || '').trim();
      if (manualPlu && !/^\d{2,4}$/.test(manualPlu)) throw new HttpError(400, 'PLU code must be 2 to 4 digits.');
      const pluCode = isLooseItem ? (manualPlu || await generateUniquePluCode(client, looseSection)) : '';
      await assertUniquePluCode(client, pluCode);
      const purchasePrice = nonNegativeNumber(productData.purchasePrice, 0);
      const basePrice = nonNegativeNumber(productData.basePrice, 0);
      const offerPrice = nonNegativeNumber(productData.offerPrice, 0);
      const stockCount = nonNegativeInteger(productData.stockCount, 0);
      const packageQuantity = nonNegativeNumber(productData.packageQuantity, 0);
      const weightGrams = nonNegativeNumber(productData.weight, 0);
      const lowStockThreshold = nonNegativeInteger(productData.lowStockAlertThreshold, 5);
      const metadata = {
        ...(productData.metadata || {}),
        isDailyEssential: Boolean(productData.isDailyEssential),
        isFeatured: Boolean(productData.isFeatured),
        purchasePrice,
        packageQuantity,
        unit: productData.unit || 'g',
        customUnit: productData.customUnit || '',
        packageLabel: productData.packageLabel || '',
        isLooseItem,
        looseSection: isLooseItem ? looseSection : '',
        pluCode,
        stockUnit: isLooseItem ? stockUnit : '',
        sellingUnit: isLooseItem ? sellingUnit : ''
      };
      const generatedSku = await generateUniqueProductSku(client, productData.name);
      const baseSlug = String(productData.slug || productData.name)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || `product-${Date.now()}`;
      let slug = baseSlug;
      let slugNumber = 2;
      while ((await client.query('SELECT 1 FROM products WHERE slug = $1 LIMIT 1', [slug])).rowCount > 0) {
        slug = `${baseSlug}-${slugNumber++}`;
      }
      const ins = await client.query('INSERT INTO products(category_id, subcategory_id, sku, name, slug, description, base_price, offer_price, stock_count, weight_grams, is_enabled, low_stock_threshold, metadata, created_at, updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now()) RETURNING *', [productData.categoryId, productData.subcategoryId || null, generatedSku, productData.name, slug, productData.description || null, basePrice, offerPrice, stockCount, weightGrams, productData.isEnabled !== undefined ? productData.isEnabled : true, lowStockThreshold, metadata]);
       const prod = ins.rows[0];
       await syncProductCategories(client, prod.id, uniqueCategoryIds(productData.categoryIds, productData.categoryId, productData.subcategoryId), productData.categoryId);
       await syncProductBarcodes(client, prod.id, productData.externalBarcodes || []);
       await syncGeneratedProductBarcode(client, prod.id, prod.sku);
      // insert images
      if (Array.isArray(productData.images) && productData.images.length > 0) {
        for (let i = 0; i < productData.images.length; i++) {
          await client.query('INSERT INTO product_images(product_id, url, position, created_at) VALUES($1,$2,$3,now())', [prod.id, productData.images[i], i]);
        }
      }
      // create inventory log if stock > 0
      if (stockCount > 0) {
        await client.query('INSERT INTO inventory_logs(product_id, delta, reason, source, reference_id, metadata, created_at) VALUES($1,$2,$3,$4,$5,$6,now())', [prod.id, stockCount, 'initial', 'product_create', null, {}]);
      }
      const imgs = await client.query('SELECT id, url, position FROM product_images WHERE product_id = $1 ORDER BY position ASC', [prod.id]);
      invalidatePublicCache('products:');
      return normalizeProduct(prod, imgs.rows);
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('POST /api/products error', err);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message || 'Failed to create product' });
    if (err.code === '23505') return res.status(409).json({ error: 'Product code/SKU already exists. Use a unique product code.' });
    return res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/products/:id', authMiddleware, requirePermission('products:manage'), async (req, res) => {
  const { id } = req.params;
  const productData = { ...req.body, sku: undefined };
  const validationErrors = validateProductPayload(productData, true);
  if (validationErrors.length > 0) return res.status(400).json({ error: validationErrors.join('; ') });
  try {
    const result = await runTransaction(async (client) => {
      const pRes = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [id]);
      if (pRes.rowCount === 0) throw new Error('Product not found');
      const current = pRes.rows[0];
      const currentMetadata = current.metadata && typeof current.metadata === 'object' ? current.metadata : {};
      const newStock = productData.stockCount !== undefined ? nonNegativeInteger(productData.stockCount, 0) : nonNegativeInteger(current.stock_count, 0);
      const metadata = {
        ...currentMetadata,
        ...(productData.metadata || {})
      };
      if (productData.isDailyEssential !== undefined) metadata.isDailyEssential = Boolean(productData.isDailyEssential);
      if (productData.isFeatured !== undefined) metadata.isFeatured = Boolean(productData.isFeatured);
      if (productData.purchasePrice !== undefined) metadata.purchasePrice = nonNegativeNumber(productData.purchasePrice, 0);
      if (productData.packageQuantity !== undefined) metadata.packageQuantity = nonNegativeNumber(productData.packageQuantity, 0);
      if (productData.unit !== undefined) metadata.unit = productData.unit || 'g';
      if (productData.customUnit !== undefined) metadata.customUnit = productData.customUnit || '';
      if (productData.packageLabel !== undefined) metadata.packageLabel = productData.packageLabel || '';
      if (productData.isLooseItem !== undefined) {
        metadata.isLooseItem = Boolean(productData.isLooseItem);
      }
      if (metadata.isLooseItem) {
        metadata.looseSection = normalizeLooseSection(productData.looseSection ?? metadata.looseSection);
        metadata.stockUnit = normalizeLooseStockUnit(productData.stockUnit ?? metadata.stockUnit);
        metadata.sellingUnit = normalizeLooseSellingUnit(productData.sellingUnit ?? metadata.sellingUnit ?? metadata.unit, metadata.unit || 'kg');
        const requestedPlu = String(productData.pluCode ?? metadata.pluCode ?? '').trim();
        if (requestedPlu && !/^\d{2,4}$/.test(requestedPlu)) throw new HttpError(400, 'PLU code must be 2 to 4 digits.');
        metadata.pluCode = requestedPlu || await generateUniquePluCode(client, metadata.looseSection);
        await assertUniquePluCode(client, metadata.pluCode, id);
      } else if (productData.isLooseItem !== undefined) {
        metadata.looseSection = '';
        metadata.stockUnit = '';
        metadata.sellingUnit = '';
      }
      let slug = current.slug;
      if (productData.slug !== undefined || productData.name !== undefined) {
        const baseSlug = String(productData.slug || productData.name || current.name)
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || `product-${Date.now()}`;
        slug = baseSlug;
        let slugNumber = 2;
        while ((await client.query('SELECT 1 FROM products WHERE slug = $1 AND id <> $2 LIMIT 1', [slug, id])).rowCount > 0) {
          slug = `${baseSlug}-${slugNumber++}`;
        }
      }
      // update product
      const upd = await client.query('UPDATE products SET category_id = COALESCE($1,category_id), subcategory_id = $2, sku = COALESCE($3,sku), name = COALESCE($4,name), slug = $5, description = COALESCE($6,description), base_price = COALESCE($7,base_price), offer_price = COALESCE($8,offer_price), stock_count = $9, weight_grams = COALESCE($10,weight_grams), is_enabled = COALESCE($11,is_enabled), low_stock_threshold = COALESCE($12,low_stock_threshold), metadata = COALESCE($13,metadata), updated_at = now() WHERE id = $14 RETURNING *', [productData.categoryId, productData.subcategoryId || null, productData.sku, productData.name, slug, productData.description, productData.basePrice !== undefined ? nonNegativeNumber(productData.basePrice, 0) : null, productData.offerPrice !== undefined ? nonNegativeNumber(productData.offerPrice, 0) : null, newStock, productData.weight !== undefined ? nonNegativeNumber(productData.weight, 0) : null, productData.isEnabled, productData.lowStockAlertThreshold !== undefined ? nonNegativeInteger(productData.lowStockAlertThreshold, 0) : null, metadata, id]);
      const prod = upd.rows[0];
      await syncProductCategories(client, prod.id, uniqueCategoryIds(productData.categoryIds, prod.category_id, prod.subcategory_id), prod.category_id);
       if (Array.isArray(productData.externalBarcodes)) {
         await syncProductBarcodes(client, prod.id, productData.externalBarcodes);
         await syncGeneratedProductBarcode(client, prod.id, prod.sku);
       }
      // handle images replacement
      if (Array.isArray(productData.images)) {
        await client.query('DELETE FROM product_images WHERE product_id = $1', [id]);
        for (let i = 0; i < productData.images.length; i++) {
          await client.query('INSERT INTO product_images(product_id, url, position, created_at) VALUES($1,$2,$3,now())', [id, productData.images[i], i]);
        }
      }
      // inventory log for stock change
      const prevStock = Number(current.stock_count || 0);
      if (newStock !== prevStock) {
        const diff = newStock - prevStock;
        await client.query('INSERT INTO inventory_logs(product_id, delta, reason, source, reference_id, metadata, created_at) VALUES($1,$2,$3,$4,$5,$6,now())', [id, diff, 'manual_adjust', 'admin', null, { note: productData.logNote || null }]);
      }
      const imgs = await client.query('SELECT id, url, position FROM product_images WHERE product_id = $1 ORDER BY position ASC', [id]);
      invalidatePublicCache('products:');
      return normalizeProduct(prod, imgs.rows);
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('PUT /api/products/:id error', err);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message || 'Failed to update product' });
    if (err.code === '23505') return res.status(409).json({ error: 'Product code/SKU already exists. Use a unique product code.' });
    return res.status(500).json({ error: err.message || 'Failed to update product' });
  }
});

app.delete('/api/products/:id', authMiddleware, requirePermission('products:manage'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pgQuery('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    invalidatePublicCache('products:');
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/products/:id error', err);
    return res.status(500).json({ error: 'Failed to delete product' });
  }
});


// --------------------------------------------------------
// SMART BAG SYSTEM CONFIG APIs
// --------------------------------------------------------
app.get('/api/bags', async (req, res) => {
  try {
    const { rows } = await pgQuery('SELECT * FROM bags WHERE is_enabled = true ORDER BY position ASC');
    return res.json(rows.map((row: any, index: number) => normalizeBag(row, index)));
  } catch (err) {
    console.error('GET /api/bags error', err);
    return res.status(500).json({ error: 'Failed to fetch bags' });
  }
});

app.put('/api/bags', authMiddleware, requirePermission('bags:manage'), async (req, res) => {
  const { bags } = req.body;
  if (!Array.isArray(bags)) return res.status(400).json({ error: 'Bags must be an array' });
  try {
    await runTransaction(async (client) => {
      await client.query('DELETE FROM bags');
      for (let i = 0; i < bags.length; i++) {
        const b = bags[i];
        await client.query(
          'INSERT INTO bags(id, size_label, capacity_grams, price, is_enabled, position, created_at) VALUES(gen_random_uuid(), $1,$2,$3,$4,$5,now())',
          [
            b.size || b.size_label || `Bag ${i + 1}`,
            Number(b.capacityGrams ?? b.capacity_grams ?? 0),
            Number(b.price ?? 0),
            b.isEnabled !== undefined ? Boolean(b.isEnabled) : b.is_enabled !== undefined ? Boolean(b.is_enabled) : true,
            Number(b.position ?? i)
          ]
        );
      }
    });
    const { rows } = await pgQuery('SELECT * FROM bags ORDER BY position ASC');
    return res.json({ success: true, data: rows.map((row: any, index: number) => normalizeBag(row, index)) });
  } catch (err) {
    console.error('PUT /api/bags error', err);
    return res.status(500).json({ error: 'Failed to update bags' });
  }
});

// --------------------------------------------------------
// DIRECT UPI & PAYMENT SYSTEM APIs
// --------------------------------------------------------

app.get('/api/coupons', async (req, res) => {
  try {
    const { rows } = await pgQuery('SELECT * FROM coupons ORDER BY created_at DESC');
    return res.json(rows.map(normalizeCoupon));
  } catch (err) {
    console.error('GET /api/coupons error', err);
    return res.status(500).json({ error: 'Failed to fetch coupons' });
  }
});

app.post('/api/coupons', authMiddleware, isAdminMiddleware, async (req, res) => {
  const couponData = req.body;
  const validationErrors = validateCouponPayload(couponData);
  if (validationErrors.length > 0) return res.status(400).json({ error: validationErrors.join('; ') });
  try {
    const discountType = couponData.discountType || couponData.discount_type || 'flat';
    const discountValue = Number(couponData.discountValue ?? couponData.discount_value);
    const minOrderValue = Number(couponData.minOrderValue ?? couponData.min_order_value ?? 0);
    const usageLimit = couponData.usageLimit ?? couponData.maxUses ?? couponData.max_uses ?? null;
    const expiryDate = couponData.expiryDate || couponData.expiresAt || couponData.expires_at || null;
    const metadata = { ...(couponData.metadata || {}), currentUsage: Number(couponData.currentUsage || 0) };
    const ins = await pgQuery('INSERT INTO coupons(code, description, discount_type, discount_value, min_order_value, max_uses, expires_at, metadata, created_at, updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) RETURNING *', [couponData.code.toUpperCase().trim(), couponData.description || null, discountType, discountValue, minOrderValue, usageLimit === '' ? null : usageLimit, expiryDate || null, metadata]);
    return res.json({ success: true, data: normalizeCoupon(ins.rows[0]) });
  } catch (err) {
    console.error('POST /api/coupons error', err);
    return res.status(500).json({ error: 'Failed to create coupon' });
  }
});

// UPI Payment helper endpoints
app.post('/api/payments/upi/create', authMiddleware, async (req, res) => {
  const { orderId, amount } = req.body;
  if (!orderId || Number(amount) <= 0) return res.status(400).json({ error: 'orderId and a positive amount are required' });
  try {
    const ordRes = await pgQuery('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (ordRes.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
    const order = ordRes.rows[0];
    const currentUser = (req as any).currentUser;
    if (!currentUser) return res.status(401).json({ error: 'Not authenticated' });
    const roles = Array.isArray(currentUser.roles) ? currentUser.roles : (typeof currentUser.roles === 'string' ? JSON.parse(currentUser.roles || '[]') : []);
    if (order.user_id !== currentUser.id && !roles.includes('admin')) {
      return res.status(403).json({ error: 'Not allowed to create payment for this order' });
    }
    if (order.payment_method !== 'upi') {
      return res.status(400).json({ error: 'Order is not configured for UPI payment' });
    }
    if (order.payment_status !== 'pending') {
      return res.status(400).json({ error: 'Payment already initiated or completed for this order' });
    }

    const paymentAmount = Number(amount) || Number(order.final_amount || order.finalAmount || 0);
    const payment = await runTransaction(async (client) => {
      const ins = await client.query('INSERT INTO payments(order_id, provider, provider_ref, amount, status, payload) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [orderId, 'upi', null, paymentAmount, 'pending', {}]);
      await createPaymentRecord(client, order, { provider: 'upi', method: 'upi', amount: paymentAmount, status: 'pending', payload: { paymentId: ins.rows[0].id } });
      return ins.rows[0];
    });

    const shopRes = await pgQuery('SELECT upi_id, name FROM shop_profile LIMIT 1');
    const upiId = shopRes.rows[0]?.upi_id || 'svayiro.essentials@upi';
    const shopName = (shopRes.rows[0]?.name || 'SVAYIRO').replace(/[^a-zA-Z0-9]/g, '');
    const tr = payment.id.replace(/-/g, '').slice(0, 12);
    const amountFormatted = Number(paymentAmount).toFixed(2);
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shopName)}&am=${amountFormatted}&cu=INR&tn=OrderPayment&tr=${tr}`;
    return res.json({ success: true, payment, upiUrl });
  } catch (err) {
    console.error('POST /api/payments/upi/create error', err);
    return res.status(500).json({ error: 'Failed to create UPI payment' });
  }
});

app.post('/api/payments/upi/confirm', authMiddleware, async (req, res) => {
  const { paymentId, providerRef } = req.body;
  if (!paymentId || typeof providerRef !== 'string' || !/^[A-Za-z0-9-]{8,30}$/.test(providerRef.trim())) return res.status(400).json({ error: 'paymentId and a valid UPI reference are required' });
  try {
    const pRes = await pgQuery('SELECT * FROM payments WHERE id = $1', [paymentId]);
    if (pRes.rowCount === 0) return res.status(404).json({ error: 'Payment not found' });
    const payment = pRes.rows[0];

    const ordRes = await pgQuery('SELECT * FROM orders WHERE id = $1', [payment.order_id]);
    if (ordRes.rowCount === 0) return res.status(404).json({ error: 'Linked order not found' });
    const order = ordRes.rows[0];
    const currentUser = (req as any).currentUser;
    if (!currentUser) return res.status(401).json({ error: 'Not authenticated' });
    const roles = Array.isArray(currentUser.roles) ? currentUser.roles : (typeof currentUser.roles === 'string' ? JSON.parse(currentUser.roles || '[]') : []);
    if (order.user_id !== currentUser.id && !roles.includes('admin')) {
      return res.status(403).json({ error: 'Not allowed to confirm this payment' });
    }

    const cleanProviderRef = providerRef.trim();
    await runTransaction(async (client) => {
      await client.query('UPDATE payments SET provider_ref = $1, status = $2 WHERE id = $3', [cleanProviderRef, 'pending', paymentId]);
      await client.query(
        `UPDATE orders
         SET payment_ref = $1,
             payment_status = 'pending',
             status = 'pending',
             meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('upiReferenceSubmitted', true, 'upiReferenceSubmittedAt', now()),
             updated_at = now()
         WHERE id = $2`,
        [cleanProviderRef, payment.order_id]
      );
      await client.query(
        `UPDATE payment_records
         SET provider_ref = $1,
             status = 'pending',
             payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('requiresOwnerVerification', true),
             updated_at = now()
         WHERE order_id = $2 AND provider = 'upi' AND status = 'pending'`,
        [cleanProviderRef, payment.order_id]
      );
    });
    return res.json({ success: true, requiresOwnerVerification: true });
  } catch (err) {
    console.error('POST /api/payments/upi/confirm error', err);
    return res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

app.post('/api/payments/cashfree/create-order', authMiddleware, async (req, res) => {
  const { orderId } = req.body || {};
  const uid = (req as any).user?.id;
  if (!uid || !orderId) return res.status(400).json({ error: 'orderId is required' });
  try {
    const orderRes = await pgQuery('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [orderId, uid]);
    if (orderRes.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderRes.rows[0];
    if (order.payment_method !== 'cashfree') return res.status(400).json({ error: 'Order is not a Cashfree payment order' });
    if (order.status === 'pending_delivery_approval') {
      return res.status(409).json({ error: 'This order is waiting for owner delivery approval before online payment.' });
    }
    const amount = Number(order.final_amount || 0);
    if (amount <= 0) return res.status(400).json({ error: 'Invalid order amount for Cashfree payment' });
    const cashfreeOrderId = order.meta?.cashfree?.orderId || buildCashfreeOrderId(order);
    const customerPhone = normalizePhone(order.customer_phone);
    const customerRes = await pgQuery('SELECT email, name FROM users WHERE id = $1', [uid]);
    const customer = customerRes.rows?.[0] || {};
    const returnUrl = validateCashfreePublicUrl(
      process.env.CASHFREE_RETURN_URL || `${getPublicBaseUrl(req)}/?payment=return&order_id={order_id}`,
      'CASHFREE_RETURN_URL',
      true
    );
    const notifyUrl = validateCashfreePublicUrl(
      process.env.CASHFREE_NOTIFY_URL || `${getApiBaseUrl(req)}/api/payments/cashfree/webhook`,
      'CASHFREE_NOTIFY_URL'
    );
    const cashfreeOrder = await cashfreeApiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        order_id: cashfreeOrderId,
        order_amount: Number(amount.toFixed(2)),
        order_currency: 'INR',
        customer_details: {
          customer_id: String(uid),
          customer_name: order.customer_name || customer.name || 'SVAYIRO Customer',
          customer_email: customer.email || `customer-${uid}@svayiro.local`,
          customer_phone: customerPhone
        },
        order_meta: {
          return_url: returnUrl,
          notify_url: notifyUrl
        },
        order_note: `SVAYIRO order ${order.order_ref || order.id}`
      })
    });
    const paymentSessionId = cashfreeOrder.payment_session_id || cashfreeOrder.paymentSessionId || null;
    const paymentLink = cashfreeOrder.payment_link || cashfreeOrder.paymentLink || cashfreeOrder?.payments?.url || null;
    await runTransaction(async (client) => {
      await client.query(
        `UPDATE orders
         SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
           'cashfree', COALESCE(meta->'cashfree', '{}'::jsonb) || jsonb_build_object(
             'orderId', $1::text,
             'paymentSessionId', $2::text,
             'mode', $3::text,
             'createdAt', now()::text
           )
         ),
         updated_at = now()
         WHERE id = $4`,
        [cashfreeOrderId, paymentSessionId, cashfreeMode(), order.id]
      );
      await client.query(
        `UPDATE payment_records
         SET provider = 'cashfree',
             provider_ref = $1,
             method = 'cashfree',
             status = 'pending',
             amount = $2,
             payload = COALESCE(payload, '{}'::jsonb) || $3::jsonb,
             updated_at = now()
         WHERE order_id = $4`,
        [cashfreeOrderId, amount, JSON.stringify({ createOrder: cashfreeOrder }), order.id]
      );
    });
    return res.json({
      success: true,
      orderId: order.id,
      cashfreeOrderId,
      paymentSessionId,
      paymentLink,
      mode: cashfreeMode()
    });
  } catch (err: any) {
    console.error('POST /api/payments/cashfree/create-order error', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create Cashfree payment order' });
  }
});

app.get('/api/payments/cashfree/order/:orderId/status', authMiddleware, async (req, res) => {
  const { orderId } = req.params;
  const uid = (req as any).user?.id;
  try {
    // Cashfree returns its own order_id to the return URL. Accept either that
    // identifier or the internal UUID, while always scoping it to the user.
    const orderRes = await pgQuery(
      `SELECT * FROM orders
       WHERE user_id = $2
         AND (id::text = $1 OR meta->'cashfree'->>'orderId' = $1)
       LIMIT 1`,
      [orderId, uid]
    );
    if (orderRes.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
    const cashfreeOrderId = orderRes.rows[0].meta?.cashfree?.orderId;
    if (!cashfreeOrderId) return res.status(404).json({ error: 'Cashfree order was not created yet' });
    const statusRes = await cashfreeApiRequest(`/orders/${encodeURIComponent(cashfreeOrderId)}`, { method: 'GET' });
    const status = normalizeCashfreeStatus(statusRes.order_status || statusRes.payment_status);
    const updated = await handleCashfreePaymentStatus(cashfreeOrderId, status, statusRes.cf_payment_id || null, statusRes);
    await announceVerifiedCashfreeOrder(updated);
    return res.json({ success: true, order: normalizeOrder(updated), cashfree: statusRes });
  } catch (err: any) {
    console.error('GET /api/payments/cashfree/order/:orderId/status error', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Failed to refresh Cashfree payment status' });
  }
});

app.post('/api/admin/orders/:id/refresh-cashfree', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const orderRes = await pgQuery('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderRes.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderRes.rows[0];
    if (order.payment_method !== 'cashfree') return res.status(400).json({ error: 'Order is not a Cashfree payment order' });
    const cashfreeOrderId = order.meta?.cashfree?.orderId;
    if (!cashfreeOrderId) return res.status(404).json({ error: 'Cashfree order was not created yet' });
    const statusRes = await cashfreeApiRequest(`/orders/${encodeURIComponent(cashfreeOrderId)}`, { method: 'GET' });
    const status = normalizeCashfreeStatus(statusRes.order_status || statusRes.payment_status);
    const updated = await handleCashfreePaymentStatus(cashfreeOrderId, status, statusRes.cf_payment_id || null, statusRes);
    await announceVerifiedCashfreeOrder(updated);
    return res.json({ success: true, order: normalizeOrder(updated), cashfree: statusRes });
  } catch (err: any) {
    console.error('POST /api/admin/orders/:id/refresh-cashfree error', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Failed to refresh Cashfree payment status' });
  }
});

app.get('/api/loyalty/summary', authMiddleware, attachUserMiddleware, async (req, res) => {
  const user = (req as any).currentUser;
  if (!user?.id) return res.status(401).json({ error: 'Not authenticated' });
  try {
    await backfillMissingLoyaltyForUser({ query: pgQuery }, user);
    const summary = await getLoyaltySummary({ query: pgQuery }, user.id);
    const userPhone = normalizePhone(user.phone || '');
    const orders = await pgQuery(
      `SELECT COUNT(*)::int AS total_orders
       FROM orders
       WHERE status != 'cancelled'
         AND (
           user_id = $1
           OR ($2 <> '' AND regexp_replace(COALESCE(customer_phone, ''), '\\D', '', 'g') IN ($2, $3))
         )`,
      [user.id, userPhone, userPhone ? `91${userPhone}` : '']
    );
    return res.json({
      ...summary,
      totalOrders: Number(orders.rows[0]?.total_orders || 0)
    });
  } catch (err) {
    console.error('GET /api/loyalty/summary error', err);
    return res.status(500).json({ error: 'Failed to load loyalty summary' });
  }
});

app.get('/api/referrals/me', authMiddleware, attachUserMiddleware, async (req, res) => {
  const user = (req as any).currentUser;
  if (!user?.id) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const result = await runTransaction(async (client) => {
      const code = await ensureReferralCode(client, user);
      const rows = await client.query(
        `SELECT r.*, u.name AS referred_name, u.phone AS referred_phone, u.email AS referred_email
         FROM referrals r
         LEFT JOIN users u ON u.id = r.referred_user_id
         WHERE r.referrer_user_id = $1
         ORDER BY r.created_at DESC`,
        [user.id]
      );
      const leaderboard = await client.query(
        `SELECT u.id, u.name, u.phone, COUNT(*)::int AS qualified_referrals
         FROM referrals r
         JOIN users u ON u.id = r.referrer_user_id
         WHERE r.status = 'qualified'
           AND r.qualified_at >= date_trunc('year', now())
         GROUP BY u.id, u.name, u.phone
         ORDER BY qualified_referrals DESC, u.name ASC
         LIMIT 3`
      );
      const received = await client.query(
        `SELECT r.*, u.name AS referrer_name, u.phone AS referrer_phone
         FROM referrals r
         LEFT JOIN users u ON u.id = r.referrer_user_id
         WHERE r.referred_user_id = $1
         LIMIT 1`,
        [user.id]
      );
      const maskedReferrals = rows.rows.map((row: any) => ({
        ...row,
        referred_phone_masked: maskPhoneForDisplay(row.referred_phone),
        referred_phone: maskPhoneForDisplay(row.referred_phone)
      }));
      const maskedLeaderboard = leaderboard.rows.map((row: any) => ({
        ...row,
        phone_masked: maskPhoneForDisplay(row.phone),
        phone: maskPhoneForDisplay(row.phone)
      }));
      const receivedReferral = received.rows[0]
        ? {
            ...received.rows[0],
            referrer_phone_masked: maskPhoneForDisplay(received.rows[0].referrer_phone),
            referrer_phone: maskPhoneForDisplay(received.rows[0].referrer_phone)
          }
        : null;
      return { code, referrals: maskedReferrals, leaderboard: maskedLeaderboard, receivedReferral };
    });
    return res.json(result);
  } catch (err) {
    console.error('GET /api/referrals/me error', err);
    return res.status(500).json({ error: 'Failed to load referral details' });
  }
});

app.post('/api/referrals/apply', authMiddleware, attachUserMiddleware, async (req, res) => {
  const user = (req as any).currentUser;
  const referralCode = String(req.body?.referralCode || '').trim().toUpperCase();
  if (!user?.id) return res.status(401).json({ error: 'Not authenticated' });
  if (!/^[A-Z0-9]{6,30}$/.test(referralCode)) return res.status(400).json({ error: 'Enter a valid referral code.' });
  try {
    const result = await runTransaction(async (client) => {
      const referrer = await client.query(
        `SELECT * FROM users
         WHERE upper(metadata->>'referralCode') = $1
         FOR UPDATE`,
        [referralCode]
      );
      if (referrer.rowCount === 0) throw new Error('Referral code not found.');
      const referrerUser = referrer.rows[0];
      if (referrerUser.id === user.id) throw new Error('You cannot use your own referral code.');
      const existing = await client.query('SELECT id FROM referrals WHERE referred_user_id = $1', [user.id]);
      if (existing.rowCount > 0) throw new Error('A referral is already attached to this account.');
      const ins = await client.query(
        `INSERT INTO referrals(referrer_user_id, referred_user_id, referral_code, status, created_at)
         VALUES($1,$2,$3,'pending',now())
         RETURNING *`,
        [referrerUser.id, user.id, referralCode]
      );
      return ins.rows[0];
    });
    return res.json({ success: true, referral: result });
  } catch (err: any) {
    console.error('POST /api/referrals/apply error', err);
    return res.status(400).json({ error: err.message || 'Failed to apply referral code' });
  }
});

app.get('/api/admin/referrals', authMiddleware, attachUserMiddleware, isAdminMiddleware, async (req, res) => {
  try {
    const leaderboard = await pgQuery(
      `SELECT u.id, u.name, u.phone, u.email, COUNT(*)::int AS qualified_referrals,
              COALESCE(SUM(r.qualifying_amount), 0)::numeric AS referred_sales
       FROM referrals r
       JOIN users u ON u.id = r.referrer_user_id
       WHERE r.status = 'qualified'
         AND r.qualified_at >= date_trunc('year', now())
       GROUP BY u.id, u.name, u.phone, u.email
       ORDER BY qualified_referrals DESC, referred_sales DESC, u.name ASC
       LIMIT 10`
    );
    const rows = await pgQuery(
      `SELECT r.*, 
              referrer.name AS referrer_name, referrer.phone AS referrer_phone, referrer.email AS referrer_email,
              referred.name AS referred_name, referred.phone AS referred_phone, referred.email AS referred_email
       FROM referrals r
       JOIN users referrer ON referrer.id = r.referrer_user_id
       JOIN users referred ON referred.id = r.referred_user_id
       ORDER BY r.created_at DESC
       LIMIT 100`
    );
    return res.json({
      leaderboard: leaderboard.rows.map((row: any) => ({
        ...row,
        phone_masked: maskPhoneForDisplay(row.phone),
        phone: maskPhoneForDisplay(row.phone)
      })),
      referrals: rows.rows.map((row: any) => ({
        ...row,
        referrer_phone_masked: maskPhoneForDisplay(row.referrer_phone),
        referred_phone_masked: maskPhoneForDisplay(row.referred_phone),
        referrer_phone: maskPhoneForDisplay(row.referrer_phone),
        referred_phone: maskPhoneForDisplay(row.referred_phone)
      }))
    });
  } catch (err) {
    console.error('GET /api/admin/referrals error', err);
    return res.status(500).json({ error: 'Failed to load referral report' });
  }
});

app.delete('/api/coupons/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pgQuery('DELETE FROM coupons WHERE id = $1', [id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/coupons/:id error', err);
    return res.status(500).json({ error: 'Failed to delete coupon' });
  }
});

app.get('/api/coupons/validate/:code', async (req, res) => {
  const { code } = req.params;
  const { orderValue } = req.query;
  try {
    const cres = await pgQuery('SELECT * FROM coupons WHERE code = $1', [code.toUpperCase().trim()]);
    if (cres.rowCount === 0) return res.status(404).json({ valid: false, error: 'Coupon code not found' });
    const coupon = cres.rows[0];
    const now = new Date();
    const birthdayCoupon = isBirthdayCoupon(coupon, code);
    const welcomeCoupon = isWelcomeCoupon(coupon, code);
    if (!birthdayCoupon && !welcomeCoupon && coupon.expires_at && new Date(coupon.expires_at) < now) return res.status(400).json({ valid: false, error: 'Coupon code has expired' });
    if (!birthdayCoupon && !welcomeCoupon && coupon.max_uses !== null && coupon.max_uses !== undefined) {
      const meta = coupon.metadata || {};
      const currentUsage = Number(meta.currentUsage ?? meta.current_usage ?? 0);
      if (coupon.max_uses > 0 && currentUsage >= coupon.max_uses) return res.status(400).json({ valid: false, error: 'Coupon code limit reached' });
    }
    if (birthdayCoupon) {
      const user = await getOptionalCurrentUser(req);
      if (!user?.id) return res.status(401).json({ valid: false, error: 'Birthday coupon requires login.' });
      if (!user.date_of_birth) return res.status(400).json({ valid: false, error: 'Add your date of birth to use birthday coupon.' });
      if (!isBirthdayToday(user.date_of_birth)) return res.status(400).json({ valid: false, error: 'Birthday coupon is valid only on your birthday.' });
      const userPhone = normalizePhone(user.phone);
      const used = await pgQuery(
        `SELECT id
         FROM orders
         WHERE status != 'cancelled'
           AND created_at >= date_trunc('year', now())
           AND (user_id = $1 OR customer_phone = $2)
           AND COALESCE(meta->>'couponCode', '') ~* '(BDAY|BIRTHDAY|BIRTH|HBD)'
         LIMIT 1`,
        [user.id, userPhone]
      );
      if (used.rowCount > 0) return res.status(400).json({ valid: false, error: 'Birthday coupon can be used only once per year for this account.' });
    }
    if (welcomeCoupon) {
      const user = await getOptionalCurrentUser(req);
      if (!user?.id) return res.status(401).json({ valid: false, error: 'Welcome coupon requires login.' });
      const userPhone = normalizePhone(user.phone);
      const used = await pgQuery(
        `SELECT id
         FROM orders
         WHERE status != 'cancelled'
           AND (user_id = $1 OR customer_phone = $2)
           AND upper(COALESCE(meta->>'couponCode', '')) = upper($3)
         LIMIT 1`,
        [user.id, userPhone, code.toUpperCase().trim()]
      );
      if (used.rowCount > 0) return res.status(400).json({ valid: false, error: 'Welcome coupon can be used only once per customer account.' });
    }
    if (isReferralCoupon(coupon, code)) {
      const user = await getOptionalCurrentUser(req);
      if (!user?.id) return res.status(401).json({ valid: false, error: 'Referral coupon requires login.' });
      const qualified = await pgQuery(
        `SELECT id FROM referrals
         WHERE referrer_user_id = $1 AND status = 'qualified'
         LIMIT 1`,
        [user.id]
      );
      if (qualified.rowCount === 0) return res.status(400).json({ valid: false, error: 'Referral coupon unlocks after your referred customer completes a qualifying order.' });
    }
    const parsedOrderValue = Number(orderValue) || 0;
    if (parsedOrderValue < (coupon.min_order_value || 0)) return res.status(400).json({ valid: false, error: `Minimum order value for this coupon is ₹${coupon.min_order_value}` });
    const campaignEligibility = await loadActiveCouponCampaignEligibility({ query: pgQuery }, coupon.id, code.toUpperCase().trim());
    const campaignBoundCoupon = Boolean(campaignEligibility) || await couponHasCampaignBinding({ query: pgQuery }, coupon.id, code.toUpperCase().trim());
    if (campaignBoundCoupon && !campaignEligibility) {
      return res.status(400).json({ valid: false, error: 'This special-offer coupon is not active right now.' });
    }
    return res.json({
      valid: true,
      coupon: normalizeCoupon({
        ...coupon,
        metadata: {
          ...(coupon.metadata || {}),
          campaignEligibility
        }
      })
    });
  } catch (err) {
    console.error('GET /api/coupons/validate error', err);
    return res.status(500).json({ valid: false, error: 'Failed to validate coupon' });
  }
});


// --------------------------------------------------------
// HOMEPAGE BANNER APIs
// --------------------------------------------------------

app.get('/api/banners', async (req, res) => {
  try {
    const cacheKey = 'banners';
    const cached = getPublicCache(cacheKey);
    if (cached) return sendCacheableJson(res, cached, 300);
    const { rows } = await pgQuery('SELECT * FROM banners WHERE is_enabled = true ORDER BY position ASC');
    const banners = rows.map(normalizeBanner);
    setPublicCache(cacheKey, banners, 300_000);
    return sendCacheableJson(res, banners, 300);
  } catch (err) {
    console.error('GET /api/banners error', err);
    return res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

app.post('/api/banners', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { imageUrl, title, linkType, linkId, position } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'Banner image URL is required' });
  const normalizedLinkType = ['none', 'category', 'product', 'url'].includes(linkType) ? linkType : 'none';
  const normalizedLinkId = normalizedLinkType === 'none' ? null : String(linkId || '').trim();
  if (normalizedLinkType !== 'none' && !normalizedLinkId) {
    return res.status(400).json({ error: 'Banner link target is required' });
  }
  if (normalizedLinkType === 'url' && !/^https?:\/\/\S+$/i.test(normalizedLinkId || '')) {
    return res.status(400).json({ error: 'Banner URL must start with http:// or https://' });
  }
  try {
    const ins = await pgQuery(
      'INSERT INTO banners(title, image_url, link, link_type, position, is_enabled, created_at) VALUES($1,$2,$3,$4,$5,$6,now()) RETURNING *',
      [title || null, imageUrl, normalizedLinkId, normalizedLinkType, position || 0, true]
    );
    invalidatePublicCache('banners');
    return res.json({ success: true, data: normalizeBanner(ins.rows[0]) });
  } catch (err) {
    console.error('POST /api/banners error', err);
    return res.status(500).json({ error: 'Failed to create banner' });
  }
});

app.delete('/api/banners/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pgQuery('DELETE FROM banners WHERE id = $1', [id]);
    invalidatePublicCache('banners');
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/banners/:id error', err);
    return res.status(500).json({ error: 'Failed to delete banner' });
  }
});

async function loadCampaignRows(whereSql = 'TRUE', params: any[] = []) {
  const { rows } = await pgQuery(`
    SELECT
      c.*,
      coupon.code AS coupon_code,
      COALESCE(array_remove(array_agg(DISTINCT cp.product_id), NULL), ARRAY[]::uuid[]) AS product_ids,
      COALESCE(array_remove(array_agg(DISTINCT cc.category_id), NULL), ARRAY[]::uuid[]) AS category_ids
    FROM campaigns c
    LEFT JOIN coupons coupon ON coupon.id = c.coupon_id
    LEFT JOIN campaign_products cp ON cp.campaign_id = c.id
    LEFT JOIN campaign_categories cc ON cc.campaign_id = c.id
    WHERE ${whereSql}
    GROUP BY c.id, coupon.code
    ORDER BY c.priority DESC, c.start_date ASC, c.created_at DESC
  `, params);
  return rows.map(normalizeCampaign);
}

async function attachCampaignProducts(campaigns: any[], productLimitPerCampaign = 80) {
  const normalizedCampaigns = campaigns.filter(Boolean);
  if (normalizedCampaigns.length === 0) return normalizedCampaigns;

  const explicitProductIds = Array.from(new Set(normalizedCampaigns.flatMap((campaign) => campaign.productIds || [])));
  const categoryIds = Array.from(new Set(normalizedCampaigns.flatMap((campaign) => campaign.categoryIds || [])));
  if (explicitProductIds.length === 0 && categoryIds.length === 0) {
    return normalizedCampaigns.map((campaign) => ({ ...campaign, products: [] }));
  }

  const { rows } = await pgQuery(`
    SELECT
      p.id,
      p.category_id,
      p.subcategory_id,
      p.sku,
      p.name,
      p.slug,
      p.description,
      p.base_price,
      p.offer_price,
      p.stock_count,
      p.weight_grams,
      p.is_enabled,
      p.low_stock_threshold,
      p.metadata,
      p.created_at,
      p.updated_at,
      first_image.url AS first_image_url,
      COALESCE(array_remove(array_agg(pc.category_id ORDER BY pc.is_primary DESC, pc.created_at ASC), NULL), ARRAY[]::uuid[]) AS category_ids
    FROM products p
    LEFT JOIN product_categories pc ON pc.product_id = p.id
    LEFT JOIN LATERAL (
      SELECT url
      FROM product_images
      WHERE product_id = p.id
      ORDER BY position ASC
      LIMIT 1
    ) first_image ON true
    WHERE p.is_enabled = true
      AND COALESCE((p.metadata->>'isLooseItem')::boolean, false) = false
      AND (
        p.id = ANY($1::uuid[])
        OR p.category_id = ANY($2::uuid[])
        OR p.subcategory_id = ANY($2::uuid[])
        OR EXISTS (
          SELECT 1 FROM product_categories pc_match
          WHERE pc_match.product_id = p.id
            AND pc_match.category_id = ANY($2::uuid[])
        )
      )
    GROUP BY p.id, first_image.url
    ORDER BY
      CASE WHEN p.offer_price > 0 AND p.base_price > p.offer_price THEN 0 ELSE 1 END,
      p.updated_at DESC,
      p.name ASC
  `, [explicitProductIds, categoryIds]);

  const products = rows.map((row: any) => normalizeProductSummary(row)).filter(Boolean);
  return normalizedCampaigns.map((campaign) => {
    const campaignProductIds = new Set(campaign.productIds || []);
    const campaignCategoryIds = new Set(campaign.categoryIds || []);
    const matchedProducts = products.filter((product: any) => {
      if (campaignProductIds.has(product.id)) return true;
      const allCategoryIds = [
        product.categoryId,
        product.subcategoryId,
        ...(Array.isArray(product.categoryIds) ? product.categoryIds : [])
      ].filter(Boolean);
      return allCategoryIds.some((categoryId) => campaignCategoryIds.has(categoryId));
    });
    return { ...campaign, products: matchedProducts.slice(0, productLimitPerCampaign) };
  });
}

app.get('/api/campaigns/active', async (req, res) => {
  try {
    const cacheKey = 'campaigns:active';
    const cached = getPublicCache(cacheKey);
    if (cached) return sendCacheableJson(res, cached, 120);
    const campaigns = await loadCampaignRows(
      `c.is_active = true
       AND c.start_date <= CURRENT_DATE
       AND c.end_date >= CURRENT_DATE`,
      []
    );
    const campaignsWithProducts = await attachCampaignProducts(campaigns);
    setPublicCache(cacheKey, campaignsWithProducts, 120_000);
    return sendCacheableJson(res, campaignsWithProducts, 120);
  } catch (err) {
    console.error('GET /api/campaigns/active error', err);
    return res.status(500).json({ error: 'Failed to load active campaigns' });
  }
});

app.get('/api/campaigns', authMiddleware, isAdminMiddleware, async (req, res) => {
  try {
    const campaigns = await loadCampaignRows();
    return res.json(campaigns);
  } catch (err) {
    console.error('GET /api/campaigns error', err);
    return res.status(500).json({ error: 'Failed to load campaigns' });
  }
});

async function saveCampaignLinks(client: any, campaignId: string, productIds: string[], categoryIds: string[]) {
  await client.query('DELETE FROM campaign_products WHERE campaign_id = $1', [campaignId]);
  await client.query('DELETE FROM campaign_categories WHERE campaign_id = $1', [campaignId]);
  for (const productId of cleanUuidList(productIds, 200)) {
    await client.query('INSERT INTO campaign_products(campaign_id, product_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [campaignId, productId]);
  }
  for (const categoryId of cleanUuidList(categoryIds, 200)) {
    await client.query('INSERT INTO campaign_categories(campaign_id, category_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [campaignId, categoryId]);
  }
}

function normalizeCampaignPayload(body: any) {
  const name = String(body?.name || '').trim();
  const title = String(body?.title || name).trim();
  const occasion = ['festival', 'weekend', 'fresh_stock', 'clearance', 'free_delivery', 'own_brand', 'custom'].includes(body?.occasion) ? body.occasion : 'custom';
  const audience = ['all', 'new_customers', 'birthday_customers', 'returning_customers'].includes(body?.audience) ? body.audience : 'all';
  const startDate = dateOnlyValue(body?.startDate || body?.start_date);
  const endDate = dateOnlyValue(body?.endDate || body?.end_date);
  const couponId = String(body?.couponId || body?.coupon_id || '').trim();
  const productIds = cleanUuidList(body?.productIds || body?.product_ids, 200);
  const categoryIds = cleanUuidList(body?.categoryIds || body?.category_ids, 200);
  if (!name || !title) throw new HttpError(400, 'Campaign name and title are required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new HttpError(400, 'Campaign start and end dates are required.');
  }
  if (endDate < startDate) throw new HttpError(400, 'Campaign end date cannot be before start date.');
  return {
    name,
    title,
    occasion,
    audience,
    subtitle: String(body?.subtitle || '').trim(),
    startDate,
    endDate,
    bannerImageUrl: String(body?.bannerImageUrl || body?.banner_image_url || '').trim(),
    couponId: UUID_REGEX.test(couponId) ? couponId : null,
    priority: Math.max(0, Math.floor(Number(body?.priority || 0))),
    isActive: body?.isActive !== undefined ? Boolean(body.isActive) : body?.is_active !== undefined ? Boolean(body.is_active) : true,
    metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    productIds,
    categoryIds
  };
}

app.post('/api/campaigns', authMiddleware, isAdminMiddleware, async (req, res) => {
  try {
    const payload = normalizeCampaignPayload(req.body);
    const campaign = await runTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO campaigns(name, occasion, audience, title, subtitle, start_date, end_date, banner_image_url, coupon_id, priority, is_active, metadata, created_at, updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,now(),now())
         RETURNING *`,
        [payload.name, payload.occasion, payload.audience, payload.title, payload.subtitle || null, payload.startDate, payload.endDate, payload.bannerImageUrl || null, payload.couponId, payload.priority, payload.isActive, JSON.stringify(payload.metadata)]
      );
      await saveCampaignLinks(client, inserted.rows[0].id, payload.productIds, payload.categoryIds);
      return inserted.rows[0];
    });
    invalidatePublicCache('campaigns');
    const [normalized] = await loadCampaignRows('c.id = $1', [campaign.id]);
    return res.json({ success: true, data: normalized });
  } catch (err: any) {
    console.error('POST /api/campaigns error', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create campaign' });
  }
});

app.put('/api/campaigns/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const id = req.params.id;
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'Invalid campaign id' });
  try {
    const payload = normalizeCampaignPayload(req.body);
    await runTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE campaigns
         SET name=$1, occasion=$2, audience=$3, title=$4, subtitle=$5, start_date=$6, end_date=$7,
             banner_image_url=$8, coupon_id=$9, priority=$10, is_active=$11, metadata=$12::jsonb, updated_at=now()
         WHERE id=$13
         RETURNING *`,
        [payload.name, payload.occasion, payload.audience, payload.title, payload.subtitle || null, payload.startDate, payload.endDate, payload.bannerImageUrl || null, payload.couponId, payload.priority, payload.isActive, JSON.stringify(payload.metadata), id]
      );
      if (updated.rowCount === 0) throw new HttpError(404, 'Campaign not found.');
      await saveCampaignLinks(client, id, payload.productIds, payload.categoryIds);
    });
    invalidatePublicCache('campaigns');
    const [normalized] = await loadCampaignRows('c.id = $1', [id]);
    return res.json({ success: true, data: normalized });
  } catch (err: any) {
    console.error('PUT /api/campaigns/:id error', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update campaign' });
  }
});

app.delete('/api/campaigns/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const id = req.params.id;
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'Invalid campaign id' });
  try {
    await pgQuery('DELETE FROM campaigns WHERE id = $1', [id]);
    invalidatePublicCache('campaigns');
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/campaigns/:id error', err);
    return res.status(500).json({ error: 'Failed to delete campaign' });
  }
});


// --------------------------------------------------------
// PRODUCT REVIEWS AND RATINGS APIS
// --------------------------------------------------------

app.get('/api/reviews', async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 100;
    const { rows } = await pgQuery(`
      SELECT
        r.*,
        rr.owner_reply,
        p.name AS product_name,
        p.sku AS product_sku,
        COALESCE(r.customer_name, u.name) AS customer_name,
        COALESCE(r.customer_phone, u.phone) AS customer_phone,
        u.email AS customer_email
      FROM reviews r
      LEFT JOIN products p ON p.id = r.product_id
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN review_replies rr ON rr.review_id = r.id
      ORDER BY r.created_at DESC
      LIMIT $1
    `, [limit]);
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/reviews error', err);
    return res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

app.post('/api/reviews', authMiddleware, async (req: any, res) => {
  const { productId, customerName, customerPhone, rating, comment } = req.body;
  if (!productId || !rating) return res.status(400).json({ error: 'Product ID and rating are required' });
  if (Number(rating) < 1 || Number(rating) > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  try {
    const user = req.currentUser || {};
    const normalizedPhone = normalizePhone(customerPhone || user.phone || '');
    const reviewerName = String(customerName || user.name || 'Customer').trim().slice(0, 200);
    const cleanComment = typeof comment === 'string' ? comment.trim().slice(0, 2000) : '';
    const existing = await pgQuery('SELECT * FROM reviews WHERE product_id = $1 AND user_id = $2 LIMIT 1', [productId, user.id]);
    const saved = existing.rowCount > 0
      ? await pgQuery(
        'UPDATE reviews SET customer_name = $1, customer_phone = $2, rating = $3, comment = $4, is_hidden = false, created_at = now() WHERE id = $5 RETURNING *',
        [reviewerName, normalizedPhone || null, Number(rating), cleanComment || null, existing.rows[0].id]
      )
      : await pgQuery(
        'INSERT INTO reviews(product_id, user_id, customer_name, customer_phone, rating, comment, is_hidden, created_at) VALUES($1,$2,$3,$4,$5,$6,false,now()) RETURNING *',
        [productId, user.id, reviewerName, normalizedPhone || null, Number(rating), cleanComment || null]
      );
    // Recalculate rating summary and store in product metadata
    const agg = await pgQuery('SELECT COUNT(*)::int AS cnt, COALESCE(ROUND(AVG(rating)::numeric,1),0) AS avg FROM reviews WHERE product_id = $1 AND NOT COALESCE(is_hidden,false)', [productId]);
    const cnt = agg.rows[0].cnt;
    const avg = Number(agg.rows[0].avg) || 0;
    await pgQuery("UPDATE products SET metadata = COALESCE(metadata, '{}'::jsonb) || $1 WHERE id = $2", [JSON.stringify({ rating_count: cnt, rating_average: avg }), productId]);
    const enriched = await pgQuery(`
      SELECT r.*, p.name AS product_name, p.sku AS product_sku, u.email AS customer_email
      FROM reviews r
      LEFT JOIN products p ON p.id = r.product_id
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.id = $1
    `, [saved.rows[0].id]);
    const reviewRow = enriched.rows[0] || saved.rows[0];
    await createAdminAlertRecord(null, {
      title: existing.rowCount > 0 ? 'Product Review Updated' : 'New Product Rating',
      body: `${reviewerName} rated ${reviewRow.product_name || 'a product'} ${Number(rating)}/5${cleanComment ? `: ${cleanComment}` : '.'}`,
      type: 'review',
      source: 'product_review',
      severity: Number(rating) <= 2 ? 'warning' : 'info',
      payload: {
        reviewId: reviewRow.id,
        productId,
        productName: reviewRow.product_name || '',
        customerPhone: normalizedPhone || null,
        rating: Number(rating)
      }
    });
    return res.json({ success: true, data: reviewRow });
  } catch (err) {
    console.error('POST /api/reviews error', err);
    return res.status(500).json({ error: 'Failed to create review' });
  }
});

app.post('/api/reviews/:id/reply', authMiddleware, requirePermission('reviews:moderate'), async (req, res) => {
  const { id } = req.params;
  const { reply } = req.body;
  try {
    // Upsert into review_replies
    const exists = await pgQuery('SELECT * FROM review_replies WHERE review_id = $1', [id]);
    if (exists.rowCount === 0) {
      const ins = await pgQuery('INSERT INTO review_replies(review_id, owner_reply, created_at) VALUES($1,$2,now()) RETURNING *', [id, reply || null]);
      return res.json({ success: true, data: ins.rows[0] });
    } else {
      const upd = await pgQuery('UPDATE review_replies SET owner_reply = $1 WHERE review_id = $2 RETURNING *', [reply || null, id]);
      return res.json({ success: true, data: upd.rows[0] });
    }
  } catch (err) {
    console.error('POST /api/reviews/:id/reply error', err);
    return res.status(500).json({ error: 'Failed to reply to review' });
  }
});

app.put('/api/reviews/:id/toggle-hide', authMiddleware, requirePermission('reviews:moderate'), async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pgQuery('SELECT * FROM reviews WHERE id = $1', [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Review not found' });
    const currentHidden = r.rows[0].is_hidden || false;
    const upd = await pgQuery('UPDATE reviews SET is_hidden = $1 WHERE id = $2 RETURNING *', [!currentHidden, id]);
    // Recalculate product rating summary
    const productId = r.rows[0].product_id;
    const agg = await pgQuery('SELECT COUNT(*)::int AS cnt, COALESCE(ROUND(AVG(rating)::numeric,1),0) AS avg FROM reviews WHERE product_id = $1 AND NOT COALESCE(is_hidden,false)', [productId]);
    const cnt = agg.rows[0].cnt;
    const avg = Number(agg.rows[0].avg) || 0;
    await pgQuery("UPDATE products SET metadata = COALESCE(metadata, '{}'::jsonb) || $1 WHERE id = $2", [JSON.stringify({ rating_count: cnt, rating_average: avg }), productId]);
    return res.json({ success: true, data: upd.rows[0] });
  } catch (err) {
    console.error('PUT /api/reviews/:id/toggle-hide error', err);
    return res.status(500).json({ error: 'Failed to toggle review visibility' });
  }
});


// --------------------------------------------------------
// NOTIFICATION SYSTEM APIs
// --------------------------------------------------------

app.get('/api/notifications', async (req, res) => {
  try {
    const cacheKey = 'notifications';
    const cached = getPublicCache(cacheKey);
    if (cached) return sendCacheableJson(res, cached, 60);
    const { rows } = await pgQuery("SELECT * FROM notifications WHERE is_active = true AND COALESCE(audience, 'customer') = 'customer' ORDER BY created_at DESC LIMIT 20");
    setPublicCache(cacheKey, rows, 60_000);
    return sendCacheableJson(res, rows, 60);
  } catch (err) {
    console.error('GET /api/notifications error', err);
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.post('/api/notifications', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { title, message, type } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Notification title and message are required' });
  try {
    const ins = await pgQuery(
      'INSERT INTO notifications(title, body, type, payload, audience, is_active, created_at) VALUES($1,$2,$3,$4,$5,$6,now()) RETURNING *',
      [title, message, type || 'announcement', { audience: 'customer', publishedBy: 'admin' }, 'customer', true]
    );
    invalidatePublicCache('notifications');
    notifyPushAudience('customer', {
      title,
      body: message,
      type: type || 'announcement',
      tag: `customer-notification-${ins.rows[0].id}`,
      url: '/',
      data: { notificationId: ins.rows[0].id }
    });
    return res.json({ success: true, data: ins.rows[0] });
  } catch (err) {
    console.error('POST /api/notifications error', err);
    return res.status(500).json({ error: 'Failed to create notification' });
  }
});

app.put('/api/notifications/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { title, message, type } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Notification title and message are required' });
  try {
    const upd = await pgQuery('UPDATE notifications SET title = $1, body = $2, type = $3, updated_at = now() WHERE id = $4 RETURNING *', [title, message, type || null, id]);
    if (upd.rowCount === 0) return res.status(404).json({ error: 'Notification not found' });
    invalidatePublicCache('notifications');
    return res.json({ success: true, data: upd.rows[0] });
  } catch (err) {
    console.error('PUT /api/notifications/:id error', err);
    return res.status(500).json({ error: 'Failed to update notification' });
  }
});

app.delete('/api/notifications/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pgQuery('DELETE FROM notifications WHERE id = $1', [id]);
    invalidatePublicCache('notifications');
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/notifications/:id error', err);
    return res.status(500).json({ error: 'Failed to delete notification' });
  }
});

app.get('/api/admin/alerts', authMiddleware, isAdminMiddleware, async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const type = typeof req.query.type === 'string' ? req.query.type : '';
  const validStatuses = ['unread', 'read', 'archived'];
  const validTypes = ['feedback', 'support', 'complaint', 'review', 'reservation', 'order', 'system'];
  try {
    const params: any[] = [];
    const where: string[] = [];
    if (validStatuses.includes(status)) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (validTypes.includes(type)) {
      params.push(type);
      where.push(`type = $${params.length}`);
    }
    const { rows } = await pgQuery(
      `SELECT * FROM admin_alerts ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 300`,
      params
    );
    return res.json(rows.map(normalizeAdminAlert));
  } catch (err) {
    console.error('GET /api/admin/alerts error', err);
    return res.status(500).json({ error: 'Failed to fetch admin alerts' });
  }
});

app.put('/api/admin/alerts/:id/status', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['unread', 'read', 'archived'].includes(status)) {
    return res.status(400).json({ error: 'Invalid alert status' });
  }
  try {
    const upd = await pgQuery('UPDATE admin_alerts SET status = $1, updated_at = now() WHERE id = $2 RETURNING *', [status, id]);
    if (upd.rowCount === 0) return res.status(404).json({ error: 'Admin alert not found' });
    return res.json({ success: true, data: normalizeAdminAlert(upd.rows[0]) });
  } catch (err) {
    console.error('PUT /api/admin/alerts/:id/status error', err);
    return res.status(500).json({ error: 'Failed to update admin alert' });
  }
});

app.delete('/api/admin/alerts/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await pgQuery('DELETE FROM admin_alerts WHERE id = $1 RETURNING id', [id]);
    if (deleted.rowCount === 0) return res.status(404).json({ error: 'Admin alert not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/alerts/:id error', err);
    return res.status(500).json({ error: 'Failed to delete admin alert' });
  }
});


// Customer support query and feedback registration endpoint
app.post('/api/customer-feedback', async (req, res) => {
  const { customerName, customerPhone, feedbackText, rating, type } = req.body;
  const normalizedPhone = normalizePhone(customerPhone);
  if (!isValidIndianMobile(normalizedPhone) || typeof feedbackText !== 'string' || !feedbackText.trim()) {
    return res.status(400).json({ error: 'Valid customer phone and message text are required' });
  }
  if (rating !== undefined && rating !== null && (Number(rating) < 1 || Number(rating) > 5)) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  try {
    const titleText = type === 'support' ? 'Incoming Support Query! 💬' : 'New Store Feedback! ❤️';
    const body = `Message from ${customerName || 'Shopper'} (${normalizedPhone}): "${feedbackText.trim()}". Rating: ${rating || 'No Rating'} (${rating || 0}/5). Type: ${(type || 'feedback').toUpperCase()}`;
    const ins = await createAdminAlertRecord(null, {
      title: titleText,
      body,
      type: type === 'support' ? 'support' : 'feedback',
      source: 'customer_feedback',
      severity: rating !== undefined && rating !== null && Number(rating) <= 2 ? 'warning' : 'info',
      payload: { customerName: customerName || 'Shopper', customerPhone: normalizedPhone, rating: rating || null, feedbackType: type || 'feedback' }
    });
    return res.json({ success: true, data: normalizeAdminAlert(ins.rows[0]) });
  } catch (err) {
    console.error('POST /api/customer-feedback error', err);
    return res.status(500).json({ error: 'Failed to record feedback' });
  }
});


// --------------------------------------------------------
// ADVANCE PRODUCTS REQUEST APIs (Future bookings)
// --------------------------------------------------------

app.get('/api/advance-requests', async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 100;
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
    const { rows } = await pgQuery('SELECT * FROM advance_requests ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return res.json(rows.map(normalizeAdvanceRequest));
  } catch (err) {
    console.error('GET /api/advance-requests error', err);
    return res.status(500).json({ error: 'Failed to fetch advance requests' });
  }
});

app.post('/api/advance-requests', authMiddleware, async (req: any, res) => {
  const currentUser = req.currentUser;
  if (!currentUser?.id) return res.status(401).json({ error: 'Please login before creating an advance booking.' });
  const { productName, quantity, targetDate, note } = req.body;
  const customerName = currentUser.name || req.body.customerName || 'Customer';
  const customerPhone = currentUser.phone || req.body.customerPhone || '';
  const userId = currentUser.id;
  const validationErrors = validateAdvanceRequestPayload({ ...req.body, userId, customerName, customerPhone });
  if (validationErrors.length > 0) return res.status(400).json({ error: validationErrors.join('; ') });
  try {
    const normalizedPhone = normalizePhone(customerPhone);
    const cleanProductName = productName.trim();
    const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) : null;
    const cleanCustomerName = typeof customerName === 'string' && customerName.trim() ? customerName.trim().slice(0, 200) : 'Guest';
    const cleanUserId = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId)) ? userId : null;
    const ins = await pgQuery('INSERT INTO advance_requests(user_id, customer_name, customer_phone, product_name, quantity, target_date, status, note, created_at, updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) RETURNING *', [cleanUserId, cleanCustomerName, normalizedPhone, cleanProductName, Number(quantity), targetDate, 'pending', cleanNote || null]);
    const newReq = ins.rows[0];
    await createAdminAlertRecord(null, {
      title: 'New Future Product Reservation',
      body: `Reservation Request #${newReq.id} by ${customerName || 'Guest'} (${normalizedPhone}) for ${newReq.quantity} of "${newReq.product_name}" on ${newReq.target_date}. Note: ${newReq.note || 'None'}.`,
      type: 'reservation',
      source: 'advance_request',
      severity: 'info',
      payload: { advanceRequestId: newReq.id, customerPhone: normalizedPhone, productName: newReq.product_name, targetDate: newReq.target_date }
    });
    return res.json({ success: true, data: normalizeAdvanceRequest(newReq) });
  } catch (err) {
    console.error('POST /api/advance-requests error', err);
    return res.status(500).json({ error: 'Failed to create advance request' });
  }
});

app.put('/api/advance-requests/:id/status', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status, orderId } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });
  try {
    const upd = await pgQuery('UPDATE advance_requests SET status = $1, order_id = COALESCE($2,order_id), updated_at = now() WHERE id = $3 RETURNING *', [status, orderId || null, id]);
    if (upd.rowCount === 0) return res.status(404).json({ error: 'Advance request not found' });
    return res.json({ success: true, data: normalizeAdvanceRequest(upd.rows[0]) });
  } catch (err) {
    console.error('PUT /api/advance-requests/:id/status error', err);
    return res.status(500).json({ error: 'Failed to update advance request' });
  }
});


// --------------------------------------------------------
// ORDER MANAGEMENT & CHECKOUT ENGINES
// --------------------------------------------------------

// Calculate Smart Bag implementation
function computeSmartBags(totalWeightGrams: number, dbBags: any[]): CheckoutBagInfo[] {
  let remaining = totalWeightGrams;
  const sortedBags = dbBags
    .map((bag, index) => normalizeBag(bag, index))
    .filter((bag): bag is NonNullable<ReturnType<typeof normalizeBag>> => Boolean(bag) && bag.capacityGrams > 0)
    .sort((a, b) => a.capacityGrams - b.capacityGrams);
  const checkoutBags: CheckoutBagInfo[] = [];

  const addBag = (bag: typeof sortedBags[number], count = 1) => {
    const existing = checkoutBags.find((entry) => entry.size === bag.size);
    if (existing) {
      existing.count += count;
      existing.cost += count * bag.price;
    } else {
      checkoutBags.push({ size: bag.size, count, cost: count * bag.price });
    }
  };

  if (remaining > 0 && sortedBags.length > 0) {
    const largestBag = sortedBags[sortedBags.length - 1];
    if (remaining > largestBag.capacityGrams) {
      const count = Math.floor(remaining / largestBag.capacityGrams);
      addBag(largestBag, count);
      remaining -= count * largestBag.capacityGrams;
    }
    if (remaining > 0) {
      const fittingBag = sortedBags.find(b => b.capacityGrams >= remaining) || largestBag;
      addBag(fittingBag, 1);
    }
  }
  return checkoutBags;
}

// NOTE: order creation is handled by the Postgres-backed transactional endpoint earlier in the file.

// Admin orders list
app.get('/api/admin/orders', authMiddleware, requirePermission('orders:read'), async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 100;
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
    const deliveryPartnerOnly = hasAnyRole(req, ['delivery_partner']) && !hasPermission(req, 'orders:support_update') && !hasPermission(req, 'inventory:manage');
    const { rows } = deliveryPartnerOnly
      ? await pgQuery(
        `SELECT * FROM orders
         WHERE admin_archived_at IS NULL
           AND delivery_method = 'delivery'
           AND status IN ('packed','out_for_delivery','delivered')
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      )
      : await pgQuery('SELECT * FROM orders WHERE admin_archived_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return res.json(rows.map(normalizeOrder));
  } catch (err) {
    console.error('GET /api/admin/orders error', err);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/api/admin/invoice-queue', authMiddleware, requirePermission('orders:read'), async (req, res) => {
  try {
    const dateFilter = String(req.query.date || 'today').toLowerCase();
    const deliveryPartnerOnly = hasAnyRole(req, ['delivery_partner']) && !hasPermission(req, 'orders:support_update') && !hasPermission(req, 'inventory:manage');
    const { rows } = await pgQuery(`
      SELECT o.*, i.invoice_no, i.issued_at
      FROM orders o
      LEFT JOIN invoices i ON i.order_id = o.id
      WHERE o.status NOT IN ('delivered', 'cancelled')
        AND o.admin_archived_at IS NULL
        AND ($1::boolean = false OR (o.delivery_method = 'delivery' AND o.status IN ('packed','out_for_delivery')))
      ORDER BY o.created_at ASC
    `, [deliveryPartnerOnly]);
    const queued = rows
      .map((order) => {
        const queueInfo = parseOrderSlotPriority(order);
        return {
          ...normalizeOrder({
            ...order,
            invoiceQueue: {
              ...queueInfo,
              invoiceNo: order.invoice_no || null,
              invoiceIssuedAt: order.issued_at || null
            }
          }),
          invoiceNo: order.invoice_no || null
        };
      })
      .filter((order: any) => {
        if (dateFilter === 'all') return true;
        return order.invoiceQueue?.scheduledDay === dateFilter;
      })
      .sort((a: any, b: any) => {
        const rankDiff = Number(a.invoiceQueue?.priorityRank ?? 999999) - Number(b.invoiceQueue?.priorityRank ?? 999999);
        if (rankDiff !== 0) return rankDiff;
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      });
    return res.json(queued);
  } catch (err) {
    console.error('GET /api/admin/invoice-queue error', err);
    return res.status(500).json({ error: 'Failed to fetch invoice queue' });
  }
});

app.get('/api/admin/invoices', authMiddleware, requirePermission('orders:read'), async (req, res) => {
  try {
    const { rows } = await pgQuery('SELECT * FROM invoices WHERE archived_at IS NULL ORDER BY issued_at DESC, created_at DESC');
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/admin/invoices error', err);
    return res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

app.get('/api/admin/orders/:id/invoice-link', authMiddleware, requirePermission('orders:read'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await runTransaction(async (client) => {
      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
      if (orderRes.rowCount === 0) throw new HttpError(404, 'Order not found');
      const order = orderRes.rows[0];
      const invoice = await createInvoiceRecord(
        client,
        order,
        order.delivery_method === 'pickup' && order.selected_slot === 'In-store Direct Purchase' ? 'offline_pos' : 'online_order'
      );
      if (!invoice) throw new HttpError(500, 'Unable to create invoice link');
      return { order, invoice };
    });
    const invoiceUrl = invoicePublicUrl(req, result.invoice);
    return res.json({
      success: true,
      invoiceNo: result.invoice.invoice_no,
      invoiceUrl,
      invoiceText: buildOrderInvoiceMessageWithLink(result.order, invoiceUrl)
    });
  } catch (err: any) {
    console.error('GET /api/admin/orders/:id/invoice-link error', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create invoice link' });
  }
});

app.delete('/api/admin/invoices/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pgQuery('UPDATE invoices SET archived_at = COALESCE(archived_at, now()), updated_at = now() WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Invoice not found' });
    return res.json({ success: true, archived: true });
  } catch (err) {
    console.error('DELETE /api/admin/invoices/:id error', err);
    return res.status(500).json({ error: 'Failed to archive invoice' });
  }
});

app.get('/invoice/:invoiceNo', async (req, res) => {
  const { invoiceNo } = req.params;
  const token = String(req.query.token || '').trim();
  if (!token || !/^[a-f0-9]{32,80}$/i.test(token)) {
    return res.status(403).send('Invalid invoice link.');
  }
  try {
    const { rows } = await pgQuery(
      `SELECT i.*, o.status, o.order_ref, o.payment_method, o.payment_ref, o.delivery_method, o.selected_slot, o.delivery_address, o.created_at AS order_created_at, o.id AS order_real_id
       FROM invoices i
       JOIN orders o ON o.id = i.order_id
       WHERE i.invoice_no = $1 AND i.public_token = $2
       LIMIT 1`,
      [invoiceNo, token]
    );
    if (rows.length === 0) return res.status(404).send('Invoice not found or link expired.');
    const row = rows[0];
    const order = {
      id: row.order_real_id,
      status: row.status,
      order_ref: row.order_ref,
      payment_method: row.payment_method,
      payment_ref: row.payment_ref,
      delivery_method: row.delivery_method,
      selected_slot: row.selected_slot,
      delivery_address: row.delivery_address,
      created_at: row.order_created_at
    };
    return res.type('html').send(renderPublicInvoiceHtml(row, order));
  } catch (err) {
    console.error('GET /invoice/:invoiceNo error', err);
    return res.status(500).send('Unable to open invoice.');
  }
});

app.get('/api/admin/payment-records', authMiddleware, requirePermission('orders:read'), async (req, res) => {
  try {
    const { rows } = await pgQuery('SELECT * FROM payment_records ORDER BY created_at DESC');
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/admin/payment-records error', err);
    return res.status(500).json({ error: 'Failed to fetch payment records' });
  }
});

app.post('/api/admin/orders/:id/send-whatsapp-invoice', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pgQuery('SELECT * FROM orders WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = rows[0];
    const completedOrCancelled = order.status === 'delivered' || order.status === 'cancelled';
    if (!completedOrCancelled) {
      return res.status(400).json({ error: 'WhatsApp bill can be sent only after the order is delivered or cancelled.' });
    }
    const canSendAnyInvoice = hasPermission(req, 'invoices:send');
    const canSendDeliveredInvoice = hasPermission(req, 'invoices:send_delivered')
      && order.status === 'delivered'
      && order.delivery_method === 'delivery';
    if (!canSendAnyInvoice && !canSendDeliveredInvoice) {
      return res.status(403).json({ error: 'Permission denied. Delivery partner can send WhatsApp bill only after successful delivery.' });
    }
    const recipient = normalizeWhatsAppRecipient(order.customer_phone);
    if (!recipient) {
      return res.status(400).json({ error: 'Customer phone is not a valid WhatsApp-capable Indian mobile number.' });
    }
    if (!isWhatsAppConfigured()) {
      return res.status(503).json({ error: 'WhatsApp Business API is not configured. Add WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env.' });
    }

    const invoice = await runTransaction(async (client) => createInvoiceRecord(
      client,
      order,
      order.delivery_method === 'pickup' && order.selected_slot === 'In-store Direct Purchase' ? 'offline_pos' : 'online_order'
    ));
    if (!invoice) return res.status(500).json({ error: 'Unable to create invoice link.' });
    const invoiceUrl = invoicePublicUrl(req, invoice);
    const body = buildOrderInvoiceMessageWithLink(order, invoiceUrl);
    const result = await sendWhatsAppText(recipient, body);
    return res.json({ success: true, provider: 'whatsapp_cloud_api', invoiceUrl, result });
  } catch (err: any) {
    console.error('POST /api/admin/orders/:id/send-whatsapp-invoice error', err);
    return res.status(err.statusCode || 500).json({
      error: err.message || 'Failed to send WhatsApp invoice',
      details: err.details || undefined
    });
  }
});

app.post('/api/admin/orders/:id/collect-cod-payment', authMiddleware, requirePermission('payments:collect_cod'), async (req, res) => {
  const { id } = req.params;
  const providerRef = String(req.body?.providerRef || '').trim();
  if (!/^[A-Za-z0-9]{8,30}$/.test(providerRef)) {
    return res.status(400).json({ error: 'Enter a valid 8 to 30 character UPI reference / UTR number.' });
  }
  try {
    const result = await runTransaction(async (client) => {
      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
      if (orderRes.rowCount === 0) throw new HttpError(404, 'Order not found');
      const order = orderRes.rows[0];
      if (order.payment_method !== 'cod') throw new HttpError(400, 'This collection flow is only for COD orders.');
      if (order.payment_status === 'paid') throw new HttpError(400, 'This order is already marked paid.');
      if (order.delivery_method !== 'delivery') throw new HttpError(400, 'Delivery partner COD collection is only for delivery orders.');
      if (!['packed', 'out_for_delivery', 'delivered'].includes(order.status)) {
        throw new HttpError(400, 'COD collection is available only after the order is packed or out for delivery.');
      }

      const currentUserId = (req as any).currentUser?.id || null;
      const meta = {
        codCollection: {
          source: 'delivery_partner_upi_qr',
          submittedBy: currentUserId,
          submittedAt: new Date().toISOString(),
          providerRef,
          exactAmount: Number(order.final_amount || 0)
        }
      };
      const updated = await client.query(
        `UPDATE orders
         SET payment_status = 'submitted',
             payment_ref = $1,
             meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb,
             updated_at = now()
         WHERE id = $3
         RETURNING *`,
        [providerRef, JSON.stringify(meta), id]
      );
      await createPaymentRecord(client, updated.rows[0], {
        provider: 'upi_cod_collection',
        providerRef,
        method: 'upi',
        amount: Number(order.final_amount || 0),
        status: 'pending',
        payload: { source: 'delivery_partner_cod_qr', submittedBy: currentUserId, orderRef: order.order_ref || null }
      });
      await createAdminAlertRecord(client, {
        title: 'COD UPI Payment Submitted',
        body: `Delivery partner submitted UPI ref ${providerRef} for order #${order.order_ref || id}. Owner must verify before marking paid.`,
        type: 'payment',
        source: 'delivery_cod_collection',
        severity: 'info',
        payload: { orderId: id, orderRef: order.order_ref || null, providerRef }
      });
      return updated.rows[0];
    });
    return res.json({ success: true, order: normalizeOrder(result) });
  } catch (err: any) {
    console.error('POST /api/admin/orders/:id/collect-cod-payment error', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Failed to submit COD collection' });
  }
});

app.post('/api/admin/orders/:id/collect-cod-cash', authMiddleware, requirePermission('payments:collect_cod'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await runTransaction(async (client) => {
      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
      if (orderRes.rowCount === 0) throw new HttpError(404, 'Order not found');
      const order = orderRes.rows[0];
      if (order.payment_method !== 'cod') throw new HttpError(400, 'Cash collection is only for COD orders.');
      if (order.payment_status === 'paid') throw new HttpError(400, 'This order is already marked paid.');
      if (order.delivery_method !== 'delivery') throw new HttpError(400, 'Delivery partner cash collection is only for delivery orders.');
      if (!['packed', 'out_for_delivery', 'delivered'].includes(order.status)) {
        throw new HttpError(400, 'COD cash collection is available only after the order is packed or out for delivery.');
      }

      const currentUserId = (req as any).currentUser?.id || null;
      const cashRef = `CASH-${String(order.order_ref || id).replace(/[^A-Za-z0-9]/g, '').slice(-12)}-${Date.now().toString(36).toUpperCase()}`;
      const meta = {
        codCollection: {
          source: 'delivery_partner_cash',
          collectedBy: currentUserId,
          collectedAt: new Date().toISOString(),
          providerRef: cashRef,
          exactAmount: Number(order.final_amount || 0)
        }
      };
      const updated = await client.query(
        `UPDATE orders
         SET payment_status = 'paid',
             payment_ref = $1,
             meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb,
             updated_at = now()
         WHERE id = $3
         RETURNING *`,
        [cashRef, JSON.stringify(meta), id]
      );
      await createPaymentRecord(client, updated.rows[0], {
        provider: 'cod_cash_collection',
        providerRef: cashRef,
        method: 'cash',
        amount: Number(order.final_amount || 0),
        status: 'paid',
        paidAt: new Date(),
        payload: { source: 'delivery_partner_cod_cash', collectedBy: currentUserId, orderRef: order.order_ref || null }
      });
      await createAdminAlertRecord(client, {
        title: 'COD Cash Collected',
        body: `Delivery partner marked cash collected for order #${order.order_ref || id}. Amount: Rs ${Number(order.final_amount || 0).toFixed(2)}.`,
        type: 'payment',
        source: 'delivery_cod_cash',
        severity: 'info',
        payload: { orderId: id, orderRef: order.order_ref || null, providerRef: cashRef }
      });
      return updated.rows[0];
    });
    return res.json({ success: true, order: normalizeOrder(result) });
  } catch (err: any) {
    console.error('POST /api/admin/orders/:id/collect-cod-cash error', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Failed to mark COD cash collected' });
  }
});

app.delete('/api/admin/orders/:id', authMiddleware, isAdminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await runTransaction(async (client) => {
      const archived = await client.query(
        `UPDATE orders
         SET admin_archived_at = COALESCE(admin_archived_at, now()),
             updated_at = now(),
             meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('adminArchivedReason', 'invoice_list_cleanup')
         WHERE id = $1
         RETURNING id, order_ref`,
        [id]
      );
      if (archived.rowCount > 0) {
        await client.query('UPDATE invoices SET archived_at = COALESCE(archived_at, now()), updated_at = now() WHERE order_id = $1', [id]);
      }
      return archived.rows[0] || null;
    });
    if (!result) return res.status(404).json({ error: 'Order not found' });
    return res.json({ success: true, archived: true });
  } catch (err) {
    console.error('DELETE /api/admin/orders/:id error', err);
    return res.status(500).json({ error: 'Failed to archive order' });
  }
});

// Customer orders list
app.get('/api/orders', async (req, res) => {
  const { phone } = req.query;
  try {
    if (phone) {
      const { rows } = await pgQuery(
        `SELECT * FROM orders
         WHERE customer_phone = $1
           AND NOT ((payment_method IN ('upi', 'cashfree')) AND payment_status = 'pending' AND payment_ref IS NULL)
         ORDER BY created_at DESC`,
        [phone]
      );
      return res.json(rows.map(normalizeOrder));
    }
    const { rows } = await pgQuery(
      `SELECT * FROM orders
       WHERE NOT (payment_method = 'cashfree' AND payment_status = 'pending' AND payment_ref IS NULL)
       ORDER BY created_at DESC`
    );
    return res.json(rows.map(normalizeOrder));
  } catch (err) {
    console.error('GET /api/orders error', err);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Update Order Status (Admin & Customer)
app.put('/api/orders/:id/status', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status, paymentStatus } = req.body;
  const validStatuses = ['pending', 'pending_delivery_approval', 'accepted', 'packed', 'out_for_delivery', 'delivered', 'cancelled', 'delivery_rejected'];
  const validPaymentStatuses = ['pending', 'submitted', 'paid', 'failed', 'refunded', 'user_dropped'];
  if (status !== undefined && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status' });
  }
  if (paymentStatus !== undefined && !validPaymentStatuses.includes(paymentStatus)) {
    return res.status(400).json({ error: 'Invalid payment status' });
  }
  try {
    const result = await runTransaction(async (client) => {
      const ores = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
      if (ores.rowCount === 0) throw new HttpError(404, 'Order not found');
      const order = ores.rows[0];
      const prevStatus = order.status;
      const newStatus = status || order.status;
      const newPaymentStatus = paymentStatus || order.payment_status;
      const currentUser = (req as any).currentUser;
      const roleSource = currentUser?.roles ?? (req as any).user?.roles ?? [];
      let roles: string[] = [];
      if (Array.isArray(roleSource)) roles = roleSource;
      else if (typeof roleSource === 'string') {
        try {
          const parsed = JSON.parse(roleSource || '[]');
          roles = Array.isArray(parsed) ? parsed : [];
        } catch {
          roles = [];
        }
      }
      const isAdmin = roles.includes('admin');
      const isCustomerCare = roles.includes('customer_care');
      const isDeliveryPartner = roles.includes('delivery_partner');
      if (paymentStatus !== undefined && !isAdmin) {
        throw new HttpError(403, 'Only owner can verify or change payment status');
      }
      if (order.user_id && currentUser?.id !== order.user_id && !isAdmin && !isCustomerCare && !isDeliveryPartner) {
        throw new HttpError(403, 'Not allowed to update this order');
      }
      if (isDeliveryPartner && !isAdmin) {
        if (order.delivery_method !== 'delivery') throw new HttpError(403, 'Delivery partner can update delivery orders only');
        const allowedDeliveryMoves = [
          `${order.status}->out_for_delivery`,
          `${order.status}->delivered`
        ];
        if (!allowedDeliveryMoves.includes(`${order.status}->${newStatus}`)) {
          throw new HttpError(403, 'Delivery partner can only move assigned orders to out for delivery or delivered');
        }
        if (newStatus === 'delivered' && order.payment_method === 'cod' && !['submitted', 'paid'].includes(order.payment_status)) {
          throw new HttpError(400, 'Submit COD payment reference before marking the order delivered.');
        }
      }
      if (isCustomerCare && !isAdmin && newStatus === 'cancelled') {
        throw new HttpError(403, 'Only owner can cancel orders');
      }
      if (order.status === 'pending_delivery_approval' && !isAdmin) {
        throw new HttpError(403, 'Only owner can approve or reject outside-coverage delivery requests');
      }
      if (newPaymentStatus === 'paid' && order.payment_status !== 'paid' && newStatus !== 'cancelled') {
        await assertOrderItemsInStock(client, id);
      }
      await client.query('UPDATE orders SET status = $1, payment_status = $2, updated_at = now() WHERE id = $3', [newStatus, newPaymentStatus, id]);

      if (newStatus === 'cancelled' && prevStatus !== 'cancelled') {
        const stockWasDeducted = await client.query(
          "SELECT 1 FROM inventory_logs WHERE reference_id = $1 AND source = 'order' AND delta < 0 LIMIT 1",
          [id]
        );
        if (stockWasDeducted.rowCount > 0) {
          const itemsRes = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [id]);
          for (const it of itemsRes.rows) {
            await client.query('UPDATE products SET stock_count = stock_count + $1, updated_at = now() WHERE id = $2', [it.quantity, it.product_id]);
            await client.query('INSERT INTO inventory_logs(product_id, delta, reason, source, reference_id, metadata, created_at) VALUES($1,$2,$3,$4,$5,$6,now())', [it.product_id, it.quantity, 'order_cancel_restore', 'order', id, { orderId: id, orderRef: order.order_ref || null }]);
          }
        }
        await createAdminAlertRecord(client, {
          title: 'Order Cancelled',
          body: `Order #${order.order_ref || id} was cancelled. Stock restored.`,
          type: 'order',
          source: 'order_status',
          severity: 'warning',
          payload: { orderId: id, orderRef: order.order_ref || null }
        });
      }

      const fres = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
      let sideEffectError = '';
      await client.query('SAVEPOINT order_status_side_effects');
      try {
        if (['upi', 'cashfree'].includes(fres.rows[0]?.payment_method) && fres.rows[0]?.payment_status === 'paid' && fres.rows[0]?.status !== 'delivery_rejected') {
          await finalizePaidOrderEffects(client, fres.rows[0]);
        } else {
          await applyOrderRewards(client, fres.rows[0]);
        }
        await client.query('RELEASE SAVEPOINT order_status_side_effects');
      } catch (effectErr: any) {
        sideEffectError = effectErr?.message || 'Order status side effects failed';
        await client.query('ROLLBACK TO SAVEPOINT order_status_side_effects');
        await client.query('RELEASE SAVEPOINT order_status_side_effects');
        await client.query(
          `UPDATE orders
           SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('lastStatusSideEffectError', $1, 'lastStatusSideEffectAt', now()::text),
               updated_at = now()
           WHERE id = $2`,
          [sideEffectError, id]
        );
        if (['upi', 'cashfree'].includes(fres.rows[0]?.payment_method) && fres.rows[0]?.payment_status === 'paid') {
          const rewardError = await applyOrderRewardsBestEffort(client, fres.rows[0]);
          if (rewardError) sideEffectError = `${sideEffectError}; ${rewardError}`;
        }
        console.error('Order status updated, but side effects failed:', effectErr);
      }
      const finalOrder = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
      return { order: finalOrder.rows[0], sideEffectError };
    });
    const normalizedOrder = normalizeOrder(result.order);
    notifyPushUser(result.order.user_id, {
      title: 'Order status updated',
      body: `Order #${normalizedOrder.orderRef || normalizedOrder.id} is now ${String(normalizedOrder.status || '').replace(/_/g, ' ')}.`,
      type: 'order',
      tag: `order-${normalizedOrder.id}`,
      url: '/',
      data: {
        orderId: normalizedOrder.id,
        orderRef: normalizedOrder.orderRef || null,
        status: normalizedOrder.status,
        paymentStatus: normalizedOrder.paymentStatus
      }
    });
    return res.json({ success: true, order: normalizedOrder, warning: result.sideEffectError || undefined });
  } catch (err: any) {
    console.error('PUT /api/orders/:id/status error', err);
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message || 'Failed to update order status' });
    }
    try {
      const fallback = await pgQuery(
        `UPDATE orders
         SET status = COALESCE($1, status),
             payment_status = COALESCE($2, payment_status),
             meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('lastStatusFallbackError', $3::text, 'lastStatusFallbackAt', now()::text),
             updated_at = now()
         WHERE id = $4
         RETURNING *`,
        [status || null, paymentStatus || null, err.message || 'Status side effects failed', id]
      );
      if (fallback.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
      const rewardError = ['upi', 'cashfree'].includes(fallback.rows[0]?.payment_method) && fallback.rows[0]?.payment_status === 'paid'
        ? await applyOrderRewardsBestEffort({ query: pgQuery }, fallback.rows[0])
        : '';
      const normalizedFallbackOrder = normalizeOrder(fallback.rows[0]);
      notifyPushUser(fallback.rows[0].user_id, {
        title: 'Order status updated',
        body: `Order #${normalizedFallbackOrder.orderRef || normalizedFallbackOrder.id} is now ${String(normalizedFallbackOrder.status || '').replace(/_/g, ' ')}.`,
        type: 'order',
        tag: `order-${normalizedFallbackOrder.id}`,
        url: '/',
        data: {
          orderId: normalizedFallbackOrder.id,
          orderRef: normalizedFallbackOrder.orderRef || null,
          status: normalizedFallbackOrder.status,
          paymentStatus: normalizedFallbackOrder.paymentStatus
        }
      });
      return res.json({
        success: true,
        order: normalizedFallbackOrder,
        warning: [err.message || 'Order status was saved, but follow-up processing failed.', rewardError].filter(Boolean).join('; ')
      });
    } catch (fallbackErr: any) {
      console.error('PUT /api/orders/:id/status fallback error', fallbackErr);
      return res.status(500).json({
        error: fallbackErr.message || err.message || 'Failed to update order status',
        detail: process.env.NODE_ENV !== 'production' ? {
          original: err.message,
          fallback: fallbackErr.message,
          code: fallbackErr.code || err.code || null
        } : undefined
      });
    }
  }
});


// --------------------------------------------------------
// MANUAL OFFLINE INVENTORY LOG ADJUSTMENTS APIs
// --------------------------------------------------------

app.post('/api/admin/offline-sale', authMiddleware, requirePermission('pos:use'), async (req, res) => {
  const { productId, quantity, note, items, customerName, customerPhone, paymentMethod, upiReference } = req.body;
  const isOwner = hasAnyRole(req, ['admin']);
  const normalizedCustomerPhone = normalizePhone(customerPhone);
  if (!isValidIndianMobile(normalizedCustomerPhone)) {
    return res.status(400).json({ error: 'Valid 10-digit customer phone number is required before invoice generation.' });
  }

  let saleItems: Array<any> = [];
  if (items && Array.isArray(items) && items.length > 0) saleItems = items;
  else if (productId && quantity) saleItems = [{ productId, quantity: Number(quantity) }];
  else return res.status(400).json({ error: 'Please specify items or single product parameter for this offline sale.' });
  if (saleItems.some((item) => Number(item.quantity ?? 0) <= 0 || Number(item.stockQuantity ?? item.quantity ?? 0) < 0)) {
    return res.status(400).json({ error: 'Sale item quantity cannot be negative or zero.' });
  }

  try {
    const result = await runTransaction(async (client) => {
      const orderItems: Array<{ product_id: string | null; sku: string | null; name: string; quantity: number; unit_price: number; base_unit_price: number; purchase_unit_cost: number; total_price: number; total_base_price: number; item_discount: number; weight_grams?: number; displayQuantityLabel?: string; stockQuantity?: number; isLooseLabel?: boolean }> = [];
      const pendingInventoryLogs: Array<{ productId: string | null; delta: number; reason: string; source: string; metadata: any }> = [];
      let calculatedTotal = 0;
      let baseProductSubtotal = 0;
      for (const item of saleItems) {
        const lineQuantity = nonNegativeNumber(item.quantity, 0);
        const stockQuantity = nonNegativeNumber(item.stockQuantity ?? item.quantity, lineQuantity);
        if (lineQuantity <= 0 || stockQuantity < 0) throw new Error('Sale item quantity cannot be negative or zero.');
        if (item.isUnlisted || (item.productId && String(item.productId).startsWith('unlisted_'))) {
          if (!isOwner) throw new HttpError(403, 'Only owner can bill unlisted custom items.');
          const unlistedName = item.name || 'Unlisted Product';
          const unlistedPrice = nonNegativeNumber(item.price, 0);
          const itemSubtotal = unlistedPrice * lineQuantity;
          calculatedTotal += itemSubtotal;
          baseProductSubtotal += itemSubtotal;
          pendingInventoryLogs.push({ productId: null, delta: -lineQuantity, reason: 'offline_sale', source: 'offline', metadata: { note: note || 'Unlisted item', name: unlistedName } });
          const unlistedCost = item.purchasePrice !== undefined ? nonNegativeNumber(item.purchasePrice, 0) : 0;
          orderItems.push({ product_id: null, sku: null, name: unlistedName, quantity: lineQuantity, unit_price: unlistedPrice, base_unit_price: unlistedPrice, purchase_unit_cost: unlistedCost, total_price: itemSubtotal, total_base_price: itemSubtotal, item_discount: 0 });
          continue;
        }
        const pRes = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [item.productId]);
        if (pRes.rowCount === 0) throw new Error(`Product ID ${item.productId} not found`);
        const prod = pRes.rows[0];
        if (stockQuantity <= 0) throw new Error(`Invalid stock quantity for ${prod.name}`);
        const stockUpdate = await client.query(
          'UPDATE products SET stock_count = stock_count - $1, updated_at = now() WHERE id = $2 AND stock_count >= $1 RETURNING stock_count',
          [stockQuantity, item.productId]
        );
        if (stockUpdate.rowCount === 0) throw new Error(`Insufficient stock for ${prod.name}`);
        const productMetadata = prod.metadata && typeof prod.metadata === 'object' ? prod.metadata : {};
        const isLooseLabel = Boolean(item.isLooseLabel);
        if (isLooseLabel && !productMetadata.isLooseItem) throw new HttpError(400, `${prod.name} is not configured for loose-weight billing.`);
        const looseFactor = isLooseLabel ? looseQuantityFactor(productMetadata, stockQuantity) : 0;
        const baseUnitPrice = Number(prod.base_price || 0);
        const catalogPrice = Number(prod.offer_price) > 0 ? Number(prod.offer_price) : baseUnitPrice;
        const expectedLinePrice = isLooseLabel ? catalogPrice * looseFactor : catalogPrice;
        const requestedPrice = item.price !== undefined ? nonNegativeNumber(item.price, 0) : expectedLinePrice;
        if (!isOwner && Math.abs(requestedPrice - expectedLinePrice) > 0.001) {
          throw new HttpError(403, `Only owner can override price for ${prod.name}.`);
        }
        const price = isOwner ? requestedPrice : expectedLinePrice;
        const subtotal = price * lineQuantity;
        const totalBasePrice = isLooseLabel ? baseUnitPrice * looseFactor : baseUnitPrice * lineQuantity;
        const itemDiscount = Math.max(0, totalBasePrice - subtotal);
        calculatedTotal += subtotal;
        baseProductSubtotal += totalBasePrice;
        pendingInventoryLogs.push({
          productId: item.productId,
          delta: -stockQuantity,
          reason: isLooseLabel ? (item.directLoose ? 'loose_direct_sale' : 'loose_label_sale') : 'offline_sale',
          source: 'offline',
          metadata: {
            note: note || null,
            displayQuantityLabel: item.displayQuantityLabel || null,
            scannedBarcode: item.scannedBarcode || null,
            directLoose: Boolean(item.directLoose)
          }
        });
        const purchaseUnitCost = Number(productMetadata.purchasePrice || 0);
        if (purchaseUnitCost <= 0) throw new Error(`Real item cost is missing for ${prod.name}. Update product purchase price first.`);
        const displayQuantityLabel = item.displayQuantityLabel || (isLooseLabel ? looseQuantityLabel(stockQuantity, normalizeLooseStockUnit(productMetadata.stockUnit)) : undefined);
        orderItems.push({
          product_id: item.productId,
          sku: prod.sku || null,
          name: displayQuantityLabel ? `${prod.name} (${displayQuantityLabel})` : prod.name,
          quantity: isLooseLabel ? stockQuantity : lineQuantity,
          unit_price: isLooseLabel ? (stockQuantity > 0 ? subtotal / stockQuantity : subtotal) : price,
          base_unit_price: isLooseLabel ? (stockQuantity > 0 ? totalBasePrice / stockQuantity : baseUnitPrice) : baseUnitPrice,
          purchase_unit_cost: purchaseUnitCost,
          total_price: subtotal,
          total_base_price: totalBasePrice,
          item_discount: itemDiscount,
          weight_grams: isLooseLabel ? (normalizeLooseStockUnit(productMetadata.stockUnit) === 'g' ? stockQuantity : Number(prod.weight_grams || 0)) : Number(prod.weight_grams || 0),
          displayQuantityLabel,
          stockQuantity,
          isLooseLabel
        });
      }

      const bagOption = req.body?.bagOption || 'own';
      let bagCharge = 0;
      if (bagOption === 'need') {
        const bagRows = await client.query('SELECT * FROM bags WHERE is_enabled = true ORDER BY position ASC');
        const totalBagWeightGrams = orderItems.reduce((sum: number, item: any) => (
          sum + (item.isLooseLabel ? Number(item.weight_grams || 0) : Number(item.weight_grams || 0) * Number(item.quantity || 0))
        ), 0);
        bagCharge = computeSmartBags(totalBagWeightGrams, bagRows.rows).reduce((sum: number, bag: any) => sum + Number(bag.cost || 0), 0);
      }
      const itemDiscountValue = orderItems.reduce((sum, item) => sum + Number(item.item_discount || 0), 0);
      const finalAmount = calculatedTotal + bagCharge;
      const ordRes = await client.query('INSERT INTO orders(user_id, order_ref, customer_name, customer_phone, status, payment_method, payment_status, payment_ref, delivery_method, delivery_address, selected_slot, bag_option, items, amount_total, delivery_charge, bag_charge, discount_amount, final_amount, meta, created_at, updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now(),now()) RETURNING *', [null, generateId('ord'), customerName || 'Guest', normalizedCustomerPhone, 'delivered', paymentMethod === 'upi' ? 'upi' : 'cod', 'paid', upiReference || null, 'pickup', null, 'In-store Direct Purchase', bagOption, JSON.stringify(orderItems), baseProductSubtotal, 0, bagCharge, itemDiscountValue, finalAmount, { itemDiscount: itemDiscountValue, productSellingSubtotal: calculatedTotal }]);
      const order = ordRes.rows[0];
      for (const it of orderItems) {
        await client.query('INSERT INTO order_items(order_id, product_id, name, sku, quantity, unit_price, purchase_unit_cost, total_price) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [order.id, it.product_id, it.name, it.sku || null, it.quantity, it.unit_price, it.purchase_unit_cost, it.total_price]);
      }
      for (const log of pendingInventoryLogs) {
        await client.query(
          'INSERT INTO inventory_logs(product_id, delta, reason, source, reference_id, metadata, created_at) VALUES($1,$2,$3,$4,$5,$6,now())',
          [log.productId, log.delta, log.reason, log.source, order.id, { ...log.metadata, orderId: order.id, orderRef: order.order_ref }]
        );
      }
      await createPaymentRecord(client, order, {
        provider: paymentMethod === 'upi' ? 'upi' : 'manual',
        providerRef: upiReference || null,
        method: paymentMethod === 'upi' ? 'upi' : 'cod',
        amount: finalAmount,
        status: 'paid',
        paidAt: new Date(),
        payload: { source: 'offline_pos' }
      });
      await createInvoiceRecord(client, order, 'offline_pos');
      await applyOrderRewards(client, order);
      return { success: true, order };
    });
    return res.json(result);
  } catch (err: any) {
    console.error('POST /api/admin/offline-sale error', err);
    return res.status(500).json({ error: err.message || 'Failed to record offline sale' });
  }
});

// Get inventory logs
// Complaints / tickets
app.get('/api/complaints', async (req, res) => {
  const phone = (req.query.phone as string) || '';
  try {
    if (phone) {
      const { rows } = await pgQuery('SELECT * FROM complaints WHERE customer_phone = $1 ORDER BY created_at DESC LIMIT 50', [phone]);
      return res.json({ tickets: rows });
    }
    const currentUser = await getOptionalCurrentUser(req);
    if (!currentUser || !hasPermission({ currentUser }, 'complaints:manage')) {
      return res.status(403).json({ error: 'Permission denied', permission: 'complaints:manage' });
    }
    const { rows } = await pgQuery('SELECT * FROM complaints ORDER BY created_at DESC LIMIT 100');
    return res.json({ tickets: rows });
  } catch (err) {
    console.error('GET /api/complaints error', err);
    return res.status(500).json({ error: 'Failed to fetch complaints' });
  }
});

app.post('/api/complaints', async (req, res) => {
  const { userId, customerName, customerPhone, subject, category, description, priority } = req.body;
  const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
  const cleanDescription = typeof description === 'string' ? description.trim() : '';
  const cleanPhone = normalizePhone(customerPhone);
  const cleanName = typeof customerName === 'string' ? customerName.trim().slice(0, 160) : null;
  const cleanCategory = ['delivery', 'product', 'billing', 'support', 'faq_question', 'other'].includes(category) ? category : 'other';
  const cleanPriority = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';
  const cleanUserId = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId)) ? userId : null;
  if (!cleanSubject || !cleanDescription) return res.status(400).json({ error: 'Subject and description are required' });
  if (cleanSubject.length > 160) return res.status(400).json({ error: 'Subject must be 160 characters or less' });
  if (cleanDescription.length > 1500) return res.status(400).json({ error: 'Description must be 1500 characters or less' });
  if (!isValidIndianMobile(cleanPhone)) return res.status(400).json({ error: 'Valid 10-digit customer phone number is required' });
  try {
    const ticket = await runTransaction(async (client) => {
      const ins = await client.query('INSERT INTO complaints(user_id, customer_name, customer_phone, subject, category, description, priority, status, created_at, updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) RETURNING *', [cleanUserId, cleanName, cleanPhone, cleanSubject, cleanCategory, cleanDescription, cleanPriority, 'open']);
      const createdTicket = ins.rows[0];
      await createAdminAlertRecord(client, {
        title: cleanCategory === 'faq_question' ? 'New Customer FAQ Question' : 'New Customer Complaint',
        body: `${cleanName || 'Customer'} (${cleanPhone}) raised a ${cleanPriority} priority ${cleanCategory.replace('_', ' ')} ticket: ${cleanSubject}`,
        type: cleanCategory === 'faq_question' ? 'support' : 'complaint',
        source: 'customer_ticket',
        severity: cleanPriority === 'high' ? 'critical' : cleanPriority === 'medium' ? 'warning' : 'info',
        payload: { complaintId: createdTicket.id, category: cleanCategory, priority: cleanPriority, customerPhone: cleanPhone }
      });
      return createdTicket;
    });
    return res.json({ ticket });
  } catch (err) {
    console.error('POST /api/complaints error', err);
    return res.status(500).json({ error: 'Failed to create complaint' });
  }
});

app.delete('/api/complaints/:id', authMiddleware, requirePermission('complaints:manage'), async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await pgQuery('DELETE FROM complaints WHERE id = $1 RETURNING id', [id]);
    if (deleted.rowCount === 0) return res.status(404).json({ error: 'Complaint not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/complaints/:id error', err);
    return res.status(500).json({ error: 'Failed to delete complaint' });
  }
});

app.put('/api/complaints/:id/status', authMiddleware, requirePermission('complaints:manage'), async (req, res) => {
  const { id } = req.params;
  const { status, adminAnswer } = req.body;
  if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) return res.status(400).json({ error: 'Valid status is required' });
  const cleanAnswer = typeof adminAnswer === 'string' ? adminAnswer.trim().slice(0, 2000) : undefined;
  try {
    const ticket = await runTransaction(async (client) => {
      const upd = await client.query(
        'UPDATE complaints SET status = $1, admin_answer = COALESCE($2, admin_answer), answered_at = CASE WHEN $2 IS NULL THEN answered_at ELSE now() END, updated_at = now() WHERE id = $3 RETURNING *',
        [status, cleanAnswer || null, id]
      );
      if (upd.rowCount === 0) return null;
      return upd.rows[0];
    });
    if (!ticket) return res.status(404).json({ error: 'Complaint not found' });
    return res.json({ success: true, ticket });
  } catch (err) {
    console.error('PUT /api/complaints/:id/status error', err);
    return res.status(500).json({ error: 'Failed to update complaint' });
  }
});

app.get('/api/admin/inventory-logs', authMiddleware, requirePermission('inventory:manage'), async (req, res) => {
  const { date, from, to } = req.query;
  try {
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 100;
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
    const params: any[] = [];
    const where: string[] = [];
    if (date) {
      params.push(date);
      where.push(`il.created_at >= $${params.length}::date AND il.created_at < ($${params.length}::date + interval '1 day')`);
    }
    if (from) {
      params.push(from);
      where.push(`il.created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      where.push(`il.created_at < ($${params.length}::date + interval '1 day')`);
    }
    params.push(limit);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pgQuery(`
      SELECT
        il.*,
        p.name AS product_name,
        p.sku AS product_sku,
        p.stock_count AS stock_after,
        o.order_ref AS order_ref,
        o.id AS order_id
      FROM inventory_logs il
      LEFT JOIN products p ON p.id = il.product_id
      LEFT JOIN orders o ON o.id = il.reference_id
      ${whereSql}
      ORDER BY il.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `, params);
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/admin/inventory-logs error', err);
    return res.status(500).json({ error: 'Failed to fetch inventory logs' });
  }
});

app.delete('/api/admin/inventory-logs/cleanup', authMiddleware, requirePermission('inventory:manage'), async (req, res) => {
  const { olderThan } = req.query;
  const allowed: Record<string, string> = {
    '1w': "7 days",
    '1m': "1 month",
    '2m': "2 months",
    '3m': "3 months",
    '5m': "5 months"
  };
  const interval = allowed[String(olderThan || '')];
  if (!interval) {
    return res.status(400).json({ error: 'Invalid cleanup range. Use 1w, 1m, 2m, 3m, or 5m.' });
  }
  try {
    const result = await pgQuery(`DELETE FROM inventory_logs WHERE created_at < now() - $1::interval`, [interval]);
    return res.json({ success: true, deletedCount: result.rowCount || 0 });
  } catch (err) {
    console.error('DELETE /api/admin/inventory-logs/cleanup error', err);
    return res.status(500).json({ error: 'Failed to delete inventory logs' });
  }
});


// --------------------------------------------------------
// ADMIN REPORTS & METRICS CALCULATIONS
// --------------------------------------------------------

app.get('/api/admin/reports', authMiddleware, isAdminMiddleware, async (req, res) => {
  try {
    const revenueRow = await pgQuery("SELECT COALESCE(SUM(final_amount),0) AS revenue FROM orders WHERE status != 'cancelled' AND payment_status = 'paid'");
    const revenue = Number(revenueRow.rows[0].revenue || 0);
    const ordersCountRow = await pgQuery("SELECT COUNT(*) AS total_orders FROM orders WHERE status != 'cancelled'");
    const totalOrdersPlaced = Number(ordersCountRow.rows[0].total_orders || 0);
    const lowStockRow = await pgQuery(`
      SELECT COUNT(*)::int AS cnt
      FROM products
      WHERE is_enabled IS DISTINCT FROM false
        AND stock_count <= COALESCE(low_stock_threshold, 10)
    `);
    const lowStockProductsCount = Number(lowStockRow.rows[0].cnt || 0);
    const topProductsRes = await pgQuery(`
      SELECT oi.product_id, p.name, SUM(oi.quantity) AS quantity, SUM(oi.total_price) AS sales
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status != 'cancelled' AND o.payment_status = 'paid'
      GROUP BY oi.product_id, p.name
      ORDER BY sales DESC
      LIMIT 5
    `);
    const topProducts = topProductsRes.rows;
    const profitRes = await pgQuery("SELECT SUM((oi.unit_price - COALESCE(NULLIF(oi.purchase_unit_cost, 0), (p.metadata->>'purchasePrice')::numeric, oi.unit_price))*oi.quantity) AS profit FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id JOIN orders o ON o.id = oi.order_id WHERE o.status != 'cancelled' AND o.payment_status = 'paid'");
    const totalProfit = Number(profitRes.rows[0].profit || 0);

    const dailyRes = await pgQuery("SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day, COALESCE(SUM(final_amount),0) AS total FROM orders WHERE status != 'cancelled' AND payment_status = 'paid' GROUP BY day ORDER BY day DESC LIMIT 7");
    const salesTrend = dailyRes.rows.map(r => ({ date: r.day, total: Number(r.total) })).reverse();

    const dailyChartRes = await pgQuery(`
      SELECT to_char(created_at::date, 'YYYY-MM-DD') AS label, COALESCE(SUM(final_amount),0) AS total, COUNT(*)::int AS orders
      FROM orders
      WHERE status != 'cancelled' AND payment_status = 'paid' AND created_at >= now() - interval '13 days'
      GROUP BY created_at::date
      ORDER BY created_at::date ASC
    `);
    const monthlyChartRes = await pgQuery(`
      SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS label, COALESCE(SUM(final_amount),0) AS total, COUNT(*)::int AS orders, date_trunc('month', created_at) AS bucket
      FROM orders
      WHERE status != 'cancelled' AND payment_status = 'paid' AND created_at >= date_trunc('month', now()) - interval '11 months'
      GROUP BY bucket
      ORDER BY bucket ASC
    `);
    const yearlyChartRes = await pgQuery(`
      SELECT to_char(date_trunc('year', created_at), 'YYYY') AS label, COALESCE(SUM(final_amount),0) AS total, COUNT(*)::int AS orders, date_trunc('year', created_at) AS bucket
      FROM orders
      WHERE status != 'cancelled' AND payment_status = 'paid' AND created_at >= date_trunc('year', now()) - interval '4 years'
      GROUP BY bucket
      ORDER BY bucket ASC
    `);
    const birthdayUsersRes = await pgQuery(`
      SELECT id, phone, name, email, date_of_birth, roles
      FROM users
      WHERE date_of_birth IS NOT NULL
        AND is_active IS DISTINCT FROM false
    `);
    const upcomingBirthdays = buildUpcomingBirthdayRows(birthdayUsersRes.rows).filter((row: any) => row.daysUntil === 1);

    const mapChartRows = (rows: any[]) => rows.map(r => ({
      label: r.label,
      total: Number(r.total || 0),
      orders: Number(r.orders || 0)
    }));

    return res.json({
      revenue,
      totalOrdersPlaced,
      lowStockCount: lowStockProductsCount,
      totalProfit,
      topProducts,
      salesTrend,
      salesAnalytics: {
        daily: mapChartRows(dailyChartRes.rows),
        monthly: mapChartRows(monthlyChartRes.rows),
        yearly: mapChartRows(yearlyChartRes.rows)
      },
      upcomingBirthdays
    });
  } catch (err) {
    console.error('GET /api/admin/reports error', err);
    return res.status(500).json({ error: 'Failed to generate reports' });
  }
});


// --------------------------------------------------------
// CUSTOMER DIRECTORIES (ADMIN)
// --------------------------------------------------------

app.get('/api/admin/customers', authMiddleware, isAdminMiddleware, async (req, res) => {
  try {
    const rows = await pgQuery(`SELECT u.phone, u.name, u.email, u.date_of_birth, COUNT(o.id) AS order_count, COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.final_amount ELSE 0 END),0) AS total_spent FROM users u LEFT JOIN orders o ON o.customer_phone = u.phone WHERE u.roles @> ARRAY['customer']::text[] GROUP BY u.phone, u.name, u.email, u.date_of_birth ORDER BY total_spent DESC`);
    return res.json(rows.rows.map(r => ({ phone: r.phone, name: r.name, email: r.email, dateOfBirth: r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : '', orderCount: Number(r.order_count), totalSpent: Number(r.total_spent) })));
  } catch (err) {
    console.error('GET /api/admin/customers error', err);
    return res.status(500).json({ error: 'Failed to fetch customers' });
  }
});


// --------------------------------------------------------
// VITE DEV SERVER OR CLIENT BUNDLE PROXYING
// --------------------------------------------------------

function isPortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close(() => resolve(true));
      })
      .listen(port, '0.0.0.0');
  });
}

async function resolveDevPort(preferredPort: number) {
  let port = preferredPort;
  while (!(await isPortAvailable(port))) {
    console.warn(`Port ${port} is already in use. Trying ${port + 1}...`);
    port += 1;
  }
  return port;
}

async function ensureRuntimeSchemaCompatibility() {
  await pgQuery('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pgQuery('ALTER TABLE users ALTER COLUMN phone DROP NOT NULL');
  await pgQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_login_id varchar(40)');
  await pgQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_staff_login_id ON users(staff_login_id) WHERE staff_login_id IS NOT NULL');
  await runTransaction(async (client) => {
    const staffWithoutIds = await client.query(
      `SELECT id, roles, metadata
       FROM users
       WHERE staff_login_id IS NULL
         AND roles && ARRAY['inventory_manager','delivery_partner','customer_care']::text[]
         AND NOT (roles @> ARRAY['admin']::text[])`
    );
    for (const staff of staffWithoutIds.rows) {
      const role = primaryStaffRole(Array.isArray(staff.roles) ? staff.roles : []);
      if (!role) continue;
      const staffLoginId = await generateStaffLoginId(client, role);
      const metadata = { ...(staff.metadata || {}), staffLoginId };
      await client.query('UPDATE users SET staff_login_id = $1, metadata = $2, updated_at = now() WHERE id = $3', [staffLoginId, metadata, staff.id]);
    }
  });
  await pgQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true');
  await pgQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text');
  await pgQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth date');
  await pgQuery('ALTER TABLE advance_requests ADD COLUMN IF NOT EXISTS customer_name varchar(200)');
  await pgQuery('ALTER TABLE advance_requests ADD COLUMN IF NOT EXISTS customer_phone varchar(32)');
  await pgQuery('ALTER TABLE advance_requests ADD COLUMN IF NOT EXISTS order_id uuid');
  await pgQuery('ALTER TABLE advance_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()');
  await pgQuery('ALTER TABLE order_items ADD COLUMN IF NOT EXISTS purchase_unit_cost numeric NOT NULL DEFAULT 0');
  await pgQuery('ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES categories(id) ON DELETE SET NULL');
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS product_categories (
      product_id uuid REFERENCES products(id) ON DELETE CASCADE,
      category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
      is_primary boolean DEFAULT false,
      created_at timestamptz DEFAULT now(),
      PRIMARY KEY (product_id, category_id)
    )
  `);
  await pgQuery(`
    INSERT INTO product_categories(product_id, category_id, is_primary)
    SELECT id, category_id, true
    FROM products
    WHERE category_id IS NOT NULL
    ON CONFLICT (product_id, category_id) DO UPDATE SET is_primary = product_categories.is_primary OR EXCLUDED.is_primary
  `);
  await pgQuery(`
    INSERT INTO product_categories(product_id, category_id, is_primary)
    SELECT id, subcategory_id, false
    FROM products
    WHERE subcategory_id IS NOT NULL
    ON CONFLICT (product_id, category_id) DO NOTHING
  `);
  await pgQuery('ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_archived_at timestamptz');
  await pgQuery('ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS free_delivery_radius_km numeric DEFAULT 0');
  await pgQuery("ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '[]'");
  await pgQuery('ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS allow_extended_delivery boolean DEFAULT false');
  await pgQuery('ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS extended_delivery_message text');
  await pgQuery('ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS extended_delivery_note text');
  await pgQuery("ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS barcode_label_print_settings jsonb DEFAULT '{\"labelWidthMm\":50,\"labelHeightMm\":25,\"columnsPerRow\":2,\"horizontalGapMm\":0,\"verticalGapMm\":0}'::jsonb");
  await pgQuery("ALTER TABLE banners ADD COLUMN IF NOT EXISTS link_type varchar(50) DEFAULT 'none'");
  await pgQuery("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS audience varchar(30) DEFAULT 'customer'");
  await pgQuery("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()");
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(200) NOT NULL,
      occasion varchar(50) NOT NULL DEFAULT 'custom',
      audience varchar(50) NOT NULL DEFAULT 'all',
      title varchar(240) NOT NULL,
      subtitle text,
      start_date date NOT NULL,
      end_date date NOT NULL,
      banner_image_url text,
      coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL,
      priority integer DEFAULT 0,
      is_active boolean DEFAULT true,
      metadata jsonb DEFAULT '{}',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      CONSTRAINT chk_campaign_dates CHECK (end_date >= start_date),
      CONSTRAINT chk_campaign_occasion CHECK (occasion IN ('festival','weekend','fresh_stock','clearance','free_delivery','own_brand','custom')),
      CONSTRAINT chk_campaign_audience CHECK (audience IN ('all','new_customers','birthday_customers','returning_customers'))
    )
  `);
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS campaign_products (
      campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
      product_id uuid REFERENCES products(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      PRIMARY KEY (campaign_id, product_id)
    )
  `);
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS campaign_categories (
      campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
      category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      PRIMARY KEY (campaign_id, category_id)
    )
  `);
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_campaigns_active_dates ON campaigns(is_active, start_date, end_date, priority DESC)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_inventory_created_at ON inventory_logs(created_at DESC)');
  const missingSkuProducts = await pgQuery("SELECT id, name FROM products WHERE sku IS NULL OR trim(sku) = '' LIMIT 500");
  for (const product of missingSkuProducts.rows) {
    const sku = await generateUniqueProductSku({ query: pgQuery }, product.name);
    await pgQuery('UPDATE products SET sku = $1, updated_at = now() WHERE id = $2 AND (sku IS NULL OR trim(sku) = \'\')', [sku, product.id]);
  }
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS complaints (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      customer_name varchar(200),
      customer_phone varchar(32),
      subject varchar(400) NOT NULL,
      category varchar(100) DEFAULT 'other',
      description text NOT NULL,
      admin_answer text,
      answered_at timestamptz,
      priority varchar(32) DEFAULT 'medium',
      status varchar(32) DEFAULT 'open',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);
  await pgQuery('ALTER TABLE complaints ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()');
  await pgQuery('ALTER TABLE complaints ADD COLUMN IF NOT EXISTS admin_answer text');
  await pgQuery('ALTER TABLE complaints ADD COLUMN IF NOT EXISTS answered_at timestamptz');
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      role varchar(40) NOT NULL DEFAULT 'customer',
      audience varchar(40) NOT NULL DEFAULT 'customer',
      endpoint text NOT NULL UNIQUE,
      p256dh text NOT NULL,
      auth text NOT NULL,
      user_agent text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_audience ON push_subscriptions(audience)');
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS admin_alerts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title varchar(400) NOT NULL,
      body text NOT NULL,
      type varchar(50) NOT NULL DEFAULT 'system',
      source varchar(80),
      severity varchar(32) NOT NULL DEFAULT 'info',
      status varchar(32) NOT NULL DEFAULT 'unread',
      payload jsonb DEFAULT '{}',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);
  await pgQuery(`
    INSERT INTO admin_alerts(title, body, type, source, severity, status, payload, created_at, updated_at)
    SELECT
      COALESCE(title, 'Internal Alert'),
      COALESCE(body, ''),
      CASE
        WHEN payload ? 'complaintId' THEN 'complaint'
        WHEN payload ? 'customerPhone' THEN 'feedback'
        WHEN COALESCE(type, '') = 'order' THEN 'order'
        ELSE 'system'
      END,
      'legacy_notification',
      CASE WHEN COALESCE(type, '') = 'order' THEN 'warning' ELSE 'info' END,
      'unread',
      COALESCE(payload, '{}'::jsonb),
      COALESCE(created_at, now()),
      now()
    FROM notifications
    WHERE COALESCE(audience, 'customer') <> 'customer'
       OR COALESCE(type, '') = 'order'
       OR payload ? 'complaintId'
       OR payload ? 'customerPhone'
       OR title ILIKE 'New Customer%'
       OR title ILIKE 'Incoming Support%'
       OR title ILIKE 'New Store Feedback%'
       OR title ILIKE 'Order Cancelled%'
       OR title ILIKE 'New Future Product Reservation%'
  `);
  await pgQuery(`
    DELETE FROM notifications
    WHERE COALESCE(audience, 'customer') <> 'customer'
       OR COALESCE(type, '') = 'order'
       OR payload ? 'complaintId'
       OR payload ? 'customerPhone'
       OR title ILIKE 'New Customer%'
       OR title ILIKE 'Incoming Support%'
       OR title ILIKE 'New Store Feedback%'
       OR title ILIKE 'Order Cancelled%'
       OR title ILIKE 'New Future Product Reservation%'
  `);
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS roles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code varchar(64) UNIQUE NOT NULL,
      name varchar(120) NOT NULL,
      description text,
      permissions jsonb DEFAULT '{}',
      is_system boolean DEFAULT true,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS user_roles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      role_id uuid REFERENCES roles(id) ON DELETE CASCADE,
      assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
      assigned_at timestamptz DEFAULT now(),
      UNIQUE(user_id, role_id)
    )
  `);
  await pgQuery(`
    INSERT INTO roles(code, name, description, permissions) VALUES
      ('admin', 'Admin / Owner', 'Owner role with access to all admin modules and settings.', '{"all": true}'),
      ('inventory_manager', 'Inventory Manager', 'Can manage products, categories, stock, bags, and inventory logs.', '{"products": true, "categories": true, "inventory": true, "bags": true}'),
      ('delivery_partner', 'Delivery Partner', 'Can view assigned orders and update delivery status.', '{"orders": "delivery"}'),
      ('customer_care', 'Customer Care', 'Can manage complaints, tickets, customer support, and order assistance.', '{"complaints": true, "orders": "support"}'),
      ('customer', 'Customer', 'Customer storefront profile role.', '{"storefront": true}')
    ON CONFLICT (code) DO NOTHING
  `);
  await pgQuery(`
    INSERT INTO user_roles(user_id, role_id)
    SELECT u.id, r.id
    FROM users u
    CROSS JOIN LATERAL unnest(COALESCE(u.roles, ARRAY['customer']::text[])) AS role_code
    JOIN roles r ON r.code = role_code
    ON CONFLICT (user_id, role_id) DO NOTHING
  `);
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS wishlists (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      product_id uuid REFERENCES products(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      UNIQUE(user_id, product_id)
    )
  `);
  await pgQuery(`
    INSERT INTO wishlists(user_id, product_id)
    SELECT u.id, wishlist_product_id
    FROM users u
    CROSS JOIN LATERAL unnest(COALESCE(u.wishlist, ARRAY[]::uuid[])) AS wishlist_product_id
    ON CONFLICT (user_id, product_id) DO NOTHING
  `);
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS product_barcodes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      barcode_value varchar(100) NOT NULL UNIQUE,
      barcode_type varchar(30) DEFAULT 'EAN/UPC',
      is_primary boolean DEFAULT false,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_product_barcodes_product_id ON product_barcodes(product_id)');
  const productsForOwnBarcode = await pgQuery("SELECT id, sku FROM products WHERE sku IS NOT NULL AND trim(sku) <> ''");
  for (const product of productsForOwnBarcode.rows) {
    await syncGeneratedProductBarcode({ query: pgQuery }, product.id, product.sku);
  }
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
      provider varchar(100),
      provider_ref varchar(200),
      amount numeric,
      status varchar(50),
      payload jsonb DEFAULT '{}',
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS payment_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      provider varchar(100) DEFAULT 'manual',
      provider_ref varchar(200),
      method varchar(32) NOT NULL DEFAULT 'cod',
      amount numeric NOT NULL DEFAULT 0,
      currency varchar(12) DEFAULT 'INR',
      status varchar(50) NOT NULL DEFAULT 'pending',
      paid_at timestamptz,
      payload jsonb DEFAULT '{}',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
      invoice_no varchar(100) UNIQUE NOT NULL,
      invoice_type varchar(50) NOT NULL DEFAULT 'online_order',
      customer_name varchar(200),
      customer_phone varchar(32),
      billing_address jsonb,
      line_items jsonb NOT NULL DEFAULT '[]',
      subtotal numeric NOT NULL DEFAULT 0,
      delivery_charge numeric NOT NULL DEFAULT 0,
      bag_charge numeric NOT NULL DEFAULT 0,
      discount_amount numeric NOT NULL DEFAULT 0,
      total_amount numeric NOT NULL DEFAULT 0,
      payment_status varchar(50) DEFAULT 'pending',
      invoice_text text,
      public_token varchar(120),
      whatsapp_status varchar(50) DEFAULT 'not_sent',
      whatsapp_sent_at timestamptz,
      metadata jsonb DEFAULT '{}',
      archived_at timestamptz,
      issued_at timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);
  await pgQuery('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS archived_at timestamptz');
  await pgQuery('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS public_token varchar(120)');
  await pgQuery("UPDATE invoices SET public_token = encode(gen_random_bytes(24), 'hex') WHERE public_token IS NULL");
  await pgQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_public_token ON invoices(public_token)');
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS customer_search_history (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      term varchar(200) NOT NULL,
      metadata jsonb DEFAULT '{}',
      searched_at timestamptz DEFAULT now()
    )
  `);
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
      type varchar(50) NOT NULL,
      points integer NOT NULL,
      amount_value numeric NOT NULL DEFAULT 0,
      metadata jsonb DEFAULT '{}',
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS referrals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      referral_code varchar(40) NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'pending',
      qualifying_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
      qualifying_amount numeric NOT NULL DEFAULT 0,
      reward_points integer NOT NULL DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      qualified_at timestamptz,
      UNIQUE(referred_user_id)
    )
  `);
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_orders_admin_archived ON orders(admin_archived_at)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_product_categories_product ON product_categories(product_id)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_payment_records_order ON payment_records(order_id)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_search_history_user ON customer_search_history(user_id)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user ON loyalty_transactions(user_id)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_order ON loyalty_transactions(order_id)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_complaints_phone ON complaints(customer_phone)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_admin_alerts_status ON admin_alerts(status, created_at DESC)');
  await pgQuery('CREATE INDEX IF NOT EXISTS idx_admin_alerts_type ON admin_alerts(type, created_at DESC)');
  await pgQuery("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS customer_name varchar(200)");
  await pgQuery("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS customer_phone varchar(32)");
  await pgQuery("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false");
  await pgQuery(`
    DELETE FROM reviews
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY product_id, user_id ORDER BY created_at DESC, id DESC) AS row_no
        FROM reviews
        WHERE user_id IS NOT NULL
      ) ranked
      WHERE ranked.row_no > 1
    )
  `);
  await pgQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_one_per_user_product ON reviews(product_id, user_id) WHERE user_id IS NOT NULL');
  await pgQuery(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_phone_format') THEN
        ALTER TABLE users DROP CONSTRAINT chk_users_phone_format;
      END IF;
      ALTER TABLE users ADD CONSTRAINT chk_users_phone_format CHECK (phone IS NULL OR phone ~ '^[0-9]{10,32}$');
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_roles_allowed') THEN
        ALTER TABLE users ADD CONSTRAINT chk_users_roles_allowed CHECK (roles <@ ARRAY['admin','inventory_manager','delivery_partner','customer_care','customer']::text[]);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_roles_code_allowed') THEN
        ALTER TABLE roles ADD CONSTRAINT chk_roles_code_allowed CHECK (code IN ('admin','inventory_manager','delivery_partner','customer_care','customer'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_prices_nonnegative') THEN
        ALTER TABLE products ADD CONSTRAINT chk_products_prices_nonnegative CHECK (base_price >= 0 AND offer_price >= 0);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_stock_nonnegative') THEN
        ALTER TABLE products ADD CONSTRAINT chk_products_stock_nonnegative CHECK (stock_count >= 0);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_weight_nonnegative') THEN
        ALTER TABLE products ADD CONSTRAINT chk_products_weight_nonnegative CHECK (weight_grams >= 0);
      END IF;
      UPDATE order_items SET quantity = 0 WHERE quantity < 0;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_items_quantity_nonnegative') THEN
        ALTER TABLE order_items ADD CONSTRAINT chk_order_items_quantity_nonnegative CHECK (quantity >= 0);
      END IF;
      UPDATE advance_requests SET quantity = 0 WHERE quantity < 0;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_advance_requests_quantity_nonnegative') THEN
        ALTER TABLE advance_requests ADD CONSTRAINT chk_advance_requests_quantity_nonnegative CHECK (quantity >= 0);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_status') THEN
        ALTER TABLE orders DROP CONSTRAINT chk_orders_status;
      END IF;
      ALTER TABLE orders ADD CONSTRAINT chk_orders_status CHECK (status IN ('pending','pending_delivery_approval','accepted','packed','out_for_delivery','delivered','cancelled','delivery_rejected'));
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_payment_method') THEN
        ALTER TABLE orders DROP CONSTRAINT chk_orders_payment_method;
      END IF;
      ALTER TABLE orders ADD CONSTRAINT chk_orders_payment_method CHECK (payment_method IN ('cod','upi','cash','card','cashfree'));
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_payment_status') THEN
        ALTER TABLE orders DROP CONSTRAINT chk_orders_payment_status;
      END IF;
      ALTER TABLE orders ADD CONSTRAINT chk_orders_payment_status CHECK (payment_status IN ('pending','submitted','paid','failed','refunded','user_dropped'));
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payments_status') THEN
        ALTER TABLE payments DROP CONSTRAINT chk_payments_status;
      END IF;
      ALTER TABLE payments ADD CONSTRAINT chk_payments_status CHECK (status IN ('pending','paid','failed','cancelled','refunded','user_dropped'));
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_records_status') THEN
        ALTER TABLE payment_records DROP CONSTRAINT chk_payment_records_status;
      END IF;
      ALTER TABLE payment_records ADD CONSTRAINT chk_payment_records_status CHECK (status IN ('pending','paid','failed','cancelled','refunded','user_dropped'));
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_records_method') THEN
        ALTER TABLE payment_records DROP CONSTRAINT chk_payment_records_method;
      END IF;
      ALTER TABLE payment_records ADD CONSTRAINT chk_payment_records_method CHECK (method IN ('cod','upi','cash','card','manual','cashfree'));
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_complaints_status') THEN
        ALTER TABLE complaints ADD CONSTRAINT chk_complaints_status CHECK (status IN ('open','in_progress','resolved','closed'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_complaints_priority') THEN
        ALTER TABLE complaints ADD CONSTRAINT chk_complaints_priority CHECK (priority IN ('low','medium','high'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_referrals_status') THEN
        ALTER TABLE referrals ADD CONSTRAINT chk_referrals_status CHECK (status IN ('pending','qualified','cancelled'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_referrals_no_self') THEN
        ALTER TABLE referrals ADD CONSTRAINT chk_referrals_no_self CHECK (referrer_user_id <> referred_user_id);
      END IF;
    END $$;
  `);
}

async function startServer() {
  try {
    await ensureRuntimeSchemaCompatibility();
  } catch (err) {
    console.warn('Database compatibility check skipped or failed:', err);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log("Starting server in DEVELOPMENT with Vite middleware mode...");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.ENABLE_HMR === 'true' ? { port: Number(process.env.VITE_HMR_PORT || 24679) } : false,
        watch: process.env.ENABLE_HMR === 'true' ? {} : null
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const shouldServeFrontend = process.env.SERVE_FRONTEND !== 'false';
    const staticDir = process.env.STATIC_DIR || 'dist';
    if (shouldServeFrontend) {
      console.log(`Starting server in PRODUCTION with express static directory: ${staticDir}`);
      app.use(express.static(staticDir));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(staticDir, 'index.html'));
      });
    } else {
      console.log("Starting server in PRODUCTION API-only mode...");
      app.get('/', (req, res) => {
        res.json({ status: 'SVAYIRO API running' });
      });
    }
  }

  // Use configured container port or fallback to 3000
  const preferredPort = Number(process.env.PORT || 3000);
  const PORT = process.env.NODE_ENV === 'production' ? preferredPort : await resolveDevPort(preferredPort);
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`SVAYIRO Server successfully running on port ${PORT}`);
    if (PORT !== preferredPort) {
      console.log(`Open http://localhost:${PORT} because ${preferredPort} was busy.`);
    }
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the existing server or set PORT to another value.`);
      return;
    }
    throw err;
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch(err => {
    console.error("Critical error starting backend server:", err);
  });
}

export { app };
