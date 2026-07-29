/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShopProfile, Category, Product, Bag, Coupon, Banner, Review, Notification, Order, AdvanceRequest, InventoryLog, User, Address, Role, StaffUser, Invoice, PaymentRecord, RoleCode, AdminAlert } from './types';

const API_BASE = '/api';

/**
 * Helper to fetch and throw on error
 */
async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('svayiro_auth_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {})
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers
  });
  
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Server request failed');
  }
  return data as T;
}

function normalizeAdvanceRequest(row: any): AdvanceRequest {
  return {
    ...row,
    userId: row.userId || row.user_id,
    customerName: row.customerName || row.customer_name || 'Guest',
    customerPhone: row.customerPhone || row.customer_phone || '',
    productName: row.productName || row.product_name || '',
    quantity: Number(row.quantity || 1),
    targetDate: row.targetDate || (row.target_date ? String(row.target_date).slice(0, 10) : ''),
    orderId: row.orderId || row.order_id,
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at
  };
}

function normalizeRole(row: any): Role {
  return {
    ...row,
    isSystem: row.isSystem ?? row.is_system,
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at
  };
}

function normalizeStaffUser(row: any): StaffUser {
  return {
    ...row,
    phone: row.phone || '',
    staffLoginId: row.staffLoginId || row.staff_login_id || row.metadata?.staffLoginId || '',
    isActive: row.isActive ?? row.is_active ?? true,
    savedAddresses: Array.isArray(row.savedAddresses) ? row.savedAddresses : Array.isArray(row.saved_addresses) ? row.saved_addresses : [],
    savedForLater: Array.isArray(row.savedForLater) ? row.savedForLater : Array.isArray(row.saved_for_later) ? row.saved_for_later : [],
    wishlist: Array.isArray(row.wishlist) ? row.wishlist : [],
    roles: Array.isArray(row.roles) ? row.roles : [],
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at
  };
}

function normalizePaymentRecord(row: any): PaymentRecord {
  return {
    ...row,
    orderId: row.orderId ?? row.order_id,
    userId: row.userId ?? row.user_id,
    providerRef: row.providerRef ?? row.provider_ref,
    paidAt: row.paidAt ?? row.paid_at,
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at,
    amount: Number(row.amount || 0)
  };
}

function normalizeInvoice(row: any): Invoice {
  return {
    ...row,
    orderId: row.orderId ?? row.order_id,
    invoiceNo: row.invoiceNo ?? row.invoice_no,
    invoiceType: row.invoiceType ?? row.invoice_type,
    customerName: row.customerName ?? row.customer_name,
    customerPhone: row.customerPhone ?? row.customer_phone,
    billingAddress: row.billingAddress ?? row.billing_address,
    lineItems: row.lineItems ?? row.line_items ?? [],
    deliveryCharge: Number(row.deliveryCharge ?? row.delivery_charge ?? 0),
    bagCharge: Number(row.bagCharge ?? row.bag_charge ?? 0),
    discountAmount: Number(row.discountAmount ?? row.discount_amount ?? 0),
    totalAmount: Number(row.totalAmount ?? row.total_amount ?? 0),
    paymentStatus: row.paymentStatus ?? row.payment_status,
    invoiceText: row.invoiceText ?? row.invoice_text,
    whatsappStatus: row.whatsappStatus ?? row.whatsapp_status,
    whatsappSentAt: row.whatsappSentAt ?? row.whatsapp_sent_at,
    issuedAt: row.issuedAt ?? row.issued_at,
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at,
    subtotal: Number(row.subtotal || 0)
  };
}

function normalizeInventoryLog(row: any): InventoryLog {
  return {
    ...row,
    productId: row.productId ?? row.product_id,
    productName: row.productName ?? row.product_name,
    quantityChange: Number(row.quantityChange ?? row.delta ?? 0),
    referenceId: row.referenceId ?? row.reference_id,
    orderId: row.orderId ?? row.order_id ?? row.reference_id,
    orderRef: row.orderRef ?? row.order_ref ?? row.metadata?.orderRef,
    stockAfter: Number(row.stockAfter ?? row.stock_after ?? 0),
    createdAt: row.createdAt || row.created_at
  };
}

function normalizeReview(row: any): Review {
  return {
    ...row,
    productId: row.productId ?? row.product_id,
    productName: row.productName ?? row.product_name,
    productSku: row.productSku ?? row.product_sku,
    userId: row.userId ?? row.user_id,
    customerName: row.customerName ?? row.customer_name ?? row.customer_name_snapshot ?? 'Customer',
    customerPhone: row.customerPhone ?? row.customer_phone,
    customerEmail: row.customerEmail ?? row.customer_email,
    isHidden: Boolean(row.isHidden ?? row.is_hidden ?? false),
    reply: row.reply ?? row.owner_reply ?? undefined,
    date: row.date ?? row.created_at ?? row.createdAt,
    createdAt: row.createdAt || row.created_at,
    rating: Number(row.rating || 0),
    comment: row.comment || ''
  };
}

function normalizeCoupon(row: any): Coupon {
  const metadata = row?.metadata || {};
  const usageLimit = row?.usageLimit ?? row?.maxUses ?? row?.max_uses ?? undefined;
  const expiryValue = row?.expiryDate ?? row?.expiresAt ?? row?.expires_at ?? '';
  const expiryDate = expiryValue
    ? (typeof expiryValue === 'string' ? expiryValue.slice(0, 10) : new Date(expiryValue).toISOString().slice(0, 10))
    : '';

  return {
    ...row,
    id: row.id,
    code: row.code || '',
    description: row.description || '',
    discountType: row.discountType || row.discount_type || 'flat',
    discountValue: Number(row.discountValue ?? row.discount_value ?? 0),
    minOrderValue: Number(row.minOrderValue ?? row.min_order_value ?? 0),
    maxUses: usageLimit,
    usageLimit,
    currentUsage: Number(row.currentUsage ?? metadata.currentUsage ?? metadata.current_usage ?? 0),
    expiryDate,
    metadata,
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at
  };
}

function normalizeNotification(row: any): Notification {
  return {
    ...row,
    message: row.message ?? row.body ?? '',
    audience: row.audience ?? row.payload?.audience ?? 'customer',
    payload: row.payload || {},
    isActive: row.isActive ?? row.is_active ?? true,
    createdAt: row.createdAt || row.created_at,
    date: row.date || row.created_at || row.createdAt
  };
}

function normalizeAdminAlert(row: any): AdminAlert {
  return {
    ...row,
    message: row.message ?? row.body ?? '',
    source: row.source || '',
    severity: row.severity || 'info',
    status: row.status || 'unread',
    payload: row.payload || {},
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at,
    date: row.date || row.created_at || row.createdAt
  };
}

export const api = {
  // Auth APIs
  sendOtp: (phone: string) => 
    apiRequest<{ success: boolean; message: string; devOtp?: string; expiresInSeconds?: number; resendAfterSeconds?: number }>('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone })
    }),

  sendPasswordResetOtp: (email: string) =>
    apiRequest<{ success: boolean; message: string; devOtp?: string; expiresInSeconds?: number; resendAfterSeconds?: number }>('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),

  sendRegistrationOtp: (email: string, phone?: string) =>
    apiRequest<{ success: boolean; message: string; devOtp?: string; expiresInSeconds?: number; resendAfterSeconds?: number }>('/auth/send-registration-otp', {
      method: 'POST',
      body: JSON.stringify({ email, phone })
    }),

  // Geocode an address string to lat/lng using Google Maps or OpenStreetMap fallback
  geocode: (address: string) =>
    apiRequest<{ success: true; lat: number; lng: number; formattedAddress: string; state: string; district: string; city: string; pincode: string; source?: string; results?: any[] }>('/geocode', {
      method: 'POST',
      body: JSON.stringify({ address })
    }),

  reverseGeocode: (lat: number, lng: number) =>
    apiRequest<{ success: true; lat: number; lng: number; formattedAddress: string; state: string; district: string; city: string; pincode: string; source?: string }>('/reverse-geocode', {
      method: 'POST',
      body: JSON.stringify({ lat, lng })
    }),

  // Calculate distance between two addresses using Google Maps Directions API (primary) or smart fallback
  calculateDistance: (origin: string, destination: string, originLat?: number, originLng?: number, destLat?: number, destLng?: number) =>
    apiRequest<{ success: true; distanceKm: number; distanceText: string; durationText: string; source: string }>('/calculate-distance', {
      method: 'POST',
      body: JSON.stringify({ origin, destination, originLat, originLng, destLat, destLng })
    }),
    
  verifyOtp: (phone: string, code: string, name?: string) =>
    apiRequest<{ success: boolean; user: User; token: string; refreshToken: string }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, code, name })
    }),

  registerCustomer: (payload: { name: string; email: string; phone: string; code: string; password: string; dateOfBirth: string; termsAccepted: boolean }) =>
    apiRequest<{ success: boolean; user: User; token: string; refreshToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  loginCustomer: (email: string, password: string) =>
    apiRequest<{ success: boolean; user: User; token: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),

  loginConsole: (loginId: string, password: string) =>
    apiRequest<{ success: boolean; user: User; token: string; refreshToken: string }>('/auth/staff-login', {
      method: 'POST',
      body: JSON.stringify({ loginId, password })
    }),

  resetPassword: (email: string, code: string, password: string) =>
    apiRequest<{ success: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, password })
    }),

  refreshAuth: (phone: string, refreshToken: string) =>
    apiRequest<{ success: boolean; user: User; token: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ phone, refreshToken })
    }),

  getCurrentUser: () =>
    apiRequest<{ success: boolean; user: User }>('/auth/me'),

  deleteCurrentUser: (confirmation: string) =>
    apiRequest<{ success: boolean }>('/auth/me', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation })
    }),

  getUserProfile: (phone: string) =>
    apiRequest<User>(`/auth/user/${phone}`),

  updateProfile: (phone: string, update: Partial<User>) =>
    apiRequest<{ success: boolean; user: User }>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ phone, ...update })
    }),

  updateWishlist: (phone: string, wishlist: string[]) =>
    apiRequest<{ success: boolean; user: User }>('/auth/wishlist', {
      method: 'PUT',
      body: JSON.stringify({ phone, wishlist })
    }),

  updateSaveLater: (phone: string, savedForLater: { productId: string; quantity: number }[]) =>
    apiRequest<{ success: boolean; user: User }>('/auth/save-later', {
      method: 'PUT',
      body: JSON.stringify({ phone, savedForLater })
    }),

  // Shop Profile APIs
  getShopProfile: () => 
    apiRequest<ShopProfile>('/shop-profile'),
    
  updateShopProfile: (details: Partial<ShopProfile>) =>
    apiRequest<{ success: boolean; data: ShopProfile }>('/shop-profile', {
      method: 'PUT',
      body: JSON.stringify(details)
    }),

  // Categories APIs
  getCategories: () =>
    apiRequest<Category[]>('/categories'),
    
  getAdminCategories: () =>
    apiRequest<Category[]>('/admin/categories'),
    
  createCategory: (category: Partial<Category>) =>
    apiRequest<{ success: boolean; data: Category }>('/categories', {
      method: 'POST',
      body: JSON.stringify(category)
    }),
    
  updateCategory: (id: string, category: Partial<Category>) =>
    apiRequest<{ success: boolean; data: Category }>(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(category)
    }),
    
  deleteCategory: (id: string) =>
    apiRequest<{ success: boolean; data: boolean }>(`/categories/${id}`, {
      method: 'DELETE'
    }),

  // Products APIs
  getProducts: (params: { limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));
    const suffix = query.toString();
    return apiRequest<Product[]>(`/products${suffix ? `?${suffix}` : ''}`);
  },

  searchProducts: (params: { search?: string; categoryId?: string | null; limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.search?.trim()) query.set('search', params.search.trim());
    if (params.categoryId) query.set('categoryId', params.categoryId);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));
    const suffix = query.toString();
    return apiRequest<Product[]>(`/products${suffix ? `?${suffix}` : ''}`);
  },

  getSearchConfig: () =>
    apiRequest<{ useDelay: boolean; delayMs: number }>('/search-config'),
    
  createProduct: (product: Partial<Product>) =>
    apiRequest<{ success: boolean; data: Product }>('/products', {
      method: 'POST',
      body: JSON.stringify(product)
    }),
    
  updateProduct: (id: string, product: Partial<Product> & { logNote?: string }) =>
    apiRequest<{ success: boolean; data: Product }>(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(product)
    }),
    
  deleteProduct: (id: string) =>
    apiRequest<{ success: boolean; data: boolean }>(`/products/${id}`, {
      method: 'DELETE'
    }),

  // Bags Configuration APIs
  getBags: () =>
    apiRequest<Bag[]>('/bags'),
    
  updateBags: (bags: Bag[]) =>
    apiRequest<{ success: boolean; data: Bag[] }>('/bags', {
      method: 'PUT',
      body: JSON.stringify({ bags })
    }),

  // Coupon / Offes APIs
  getCoupons: () =>
    apiRequest<any[]>('/coupons').then((rows) => rows.map(normalizeCoupon)),
    
  createCoupon: (coupon: Partial<Coupon>) =>
    apiRequest<{ success: boolean; data: Coupon }>('/coupons', {
      method: 'POST',
      body: JSON.stringify(coupon)
    }).then((res) => ({ ...res, data: normalizeCoupon(res.data) })),
    
  deleteCoupon: (id: string) =>
    apiRequest<{ success: boolean; data: boolean }>(`/coupons/${id}`, {
      method: 'DELETE'
    }),
    
  validateCoupon: (code: string, orderValue: number) =>
    apiRequest<{ valid: boolean; coupon: any }>(`/coupons/validate/${code}?orderValue=${orderValue}`)
      .then((res) => ({ ...res, coupon: normalizeCoupon(res.coupon) })),

  // Homepage Banners APIs
  getBanners: () =>
    apiRequest<Banner[]>('/banners'),
    
  createBanner: (banner: Partial<Banner>) =>
    apiRequest<{ success: boolean; data: Banner }>('/banners', {
      method: 'POST',
      body: JSON.stringify(banner)
    }),
    
  deleteBanner: (id: string) =>
    apiRequest<{ success: boolean; data: boolean }>(`/banners/${id}`, {
      method: 'DELETE'
    }),

  // Product Reviews APIs
  getReviews: () =>
    apiRequest<any[]>('/reviews').then((rows) => rows.map(normalizeReview)),

  createReview: (review: { productId: string; customerName: string; customerPhone?: string; rating: number; comment?: string }) =>
    apiRequest<{ success: boolean; data: any }>('/reviews', {
      method: 'POST',
      body: JSON.stringify(review)
    }).then((res) => ({ ...res, data: normalizeReview(res.data) })),

  replyToReview: (id: string, reply: string) =>
    apiRequest<{ success: boolean; data: any }>(`/reviews/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply })
    }).then((res) => ({ ...res, data: normalizeReview(res.data) })),

  toggleHideReview: (id: string) =>
    apiRequest<{ success: boolean; data: any }>(`/reviews/${id}/toggle-hide`, {
      method: 'PUT'
    }).then((res) => ({ ...res, data: normalizeReview(res.data) })),

  // Broadcast System Notifications APIs
  getNotifications: () =>
    apiRequest<any[]>('/notifications').then((rows) => rows.map(normalizeNotification)),
    
  createNotification: (notif: { title: string; message: string; type: 'offer' | 'order' | 'holiday' | 'announcement' }) =>
    apiRequest<{ success: boolean; data: Notification }>('/notifications', {
      method: 'POST',
      body: JSON.stringify(notif)
    }),

  updateNotification: (id: string, notif: { title: string; message: string; type: 'offer' | 'order' | 'holiday' | 'announcement' }) =>
    apiRequest<{ success: boolean; data: Notification }>(`/notifications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(notif)
    }),

  deleteNotification: (id: string) =>
    apiRequest<{ success: boolean }>(`/notifications/${id}`, {
      method: 'DELETE'
    }),

  submitFeedback: (feedback: { customerName: string; customerPhone: string; feedbackText: string; rating?: number; type?: 'support' | 'feedback' }) =>
    apiRequest<{ success: boolean; data: AdminAlert }>('/customer-feedback', {
      method: 'POST',
      body: JSON.stringify(feedback)
    }).then((res) => ({ ...res, data: normalizeAdminAlert(res.data) })),

  getAdminAlerts: (filters?: { status?: string; type?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters?.type && filters.type !== 'all') params.set('type', filters.type);
    const qs = params.toString();
    return apiRequest<any[]>(`/admin/alerts${qs ? `?${qs}` : ''}`).then((rows) => rows.map(normalizeAdminAlert));
  },

  updateAdminAlertStatus: (id: string, status: 'unread' | 'read' | 'archived') =>
    apiRequest<{ success: boolean; data: any }>(`/admin/alerts/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    }).then((res) => ({ ...res, data: normalizeAdminAlert(res.data) })),

  deleteAdminAlert: (id: string) =>
    apiRequest<{ success: boolean }>(`/admin/alerts/${id}`, {
      method: 'DELETE'
    }),

  // Advance Future Bookings APIs
  getAdvanceRequests: () =>
    apiRequest<any[]>('/advance-requests').then((rows) => rows.map(normalizeAdvanceRequest)),
    
  createAdvanceRequest: (req: { userId?: string; customerName: string; customerPhone: string; productName: string; quantity: number; targetDate: string; note?: string }) =>
    apiRequest<{ success: boolean; data: any }>('/advance-requests', {
      method: 'POST',
      body: JSON.stringify(req)
    }).then((res) => ({ ...res, data: normalizeAdvanceRequest(res.data) })),

  updateAdvanceRequestStatus: (id: string, status: string, orderId?: string) =>
    apiRequest<{ success: boolean; data: any }>(`/advance-requests/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, orderId })
    }).then((res) => ({ ...res, data: normalizeAdvanceRequest(res.data) })),

  // Customers (Admin)
  getCustomers: () =>
    apiRequest<{ phone: string; name: string; email: string; orderCount: number; totalSpent: number }[]>('/admin/customers'),

  getRoles: () =>
    apiRequest<any[]>('/admin/roles').then((rows) => rows.map(normalizeRole)),

  getStaff: () =>
    apiRequest<any[]>('/admin/staff').then((rows) => rows.map(normalizeStaffUser)),

  createStaff: (staff: { name: string; password: string; role: Exclude<RoleCode, 'admin' | 'customer'>; isActive: boolean }) =>
    apiRequest<{ success: boolean; user: any }>('/admin/staff', {
      method: 'POST',
      body: JSON.stringify(staff)
    }).then((res) => ({ ...res, user: normalizeStaffUser(res.user) })),

  updateStaffRoles: (id: string, roles: Exclude<RoleCode, 'admin' | 'customer'>[], isActive = true) =>
    apiRequest<{ success: boolean; user: any }>(`/admin/staff/${id}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roles, isActive })
    }).then((res) => ({ ...res, user: normalizeStaffUser(res.user) })),

  updateStaff: (id: string, staff: { name: string; password?: string; role: Exclude<RoleCode, 'admin' | 'customer'>; isActive: boolean }) =>
    apiRequest<{ success: boolean; user: any }>(`/admin/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(staff)
    }).then((res) => ({ ...res, user: normalizeStaffUser(res.user) })),

  deleteStaff: (id: string) =>
    apiRequest<{ success: boolean }>(`/admin/staff/${id}`, {
      method: 'DELETE'
    }),

  // Inventory logs & adjustments
  getInventoryLogs: (filters?: { date?: string; from?: string; to?: string }) => {
    const params = new URLSearchParams();
    if (filters?.date) params.set('date', filters.date);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    const query = params.toString();
    return apiRequest<any[]>(`/admin/inventory-logs${query ? `?${query}` : ''}`).then((rows) => rows.map(normalizeInventoryLog));
  },

  cleanupInventoryLogs: (olderThan: '1w' | '1m' | '2m' | '3m' | '5m') =>
    apiRequest<{ success: boolean; deletedCount: number }>(`/admin/inventory-logs/cleanup?olderThan=${olderThan}`, {
      method: 'DELETE'
    }),
    
  recordOfflineSale: (payload: {
    productId?: string;
    quantity?: number;
    note?: string;
    items?: { productId: string; quantity: number; name?: string; price?: number; isUnlisted?: boolean }[];
    customerName?: string;
    customerPhone?: string;
    paymentMethod?: 'cod' | 'upi';
    upiReference?: string;
    bagOption?: 'own' | 'need';
    bagCharge?: number;
  }) =>
    apiRequest<{ success: boolean; order: Order }>('/admin/offline-sale', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Orders & Checkouts APIs
  customerOrders: (phone?: string) =>
    apiRequest<Order[]>(`/orders${phone ? `?phone=${phone}` : ''}`),
    
  adminOrders: () =>
    apiRequest<Order[]>('/admin/orders'),

  adminInvoiceQueue: (date: 'today' | 'tomorrow' | 'all' = 'today') =>
    apiRequest<Order[]>(`/admin/invoice-queue?date=${date}`),

  adminInvoices: () =>
    apiRequest<any[]>('/admin/invoices').then((rows) => rows.map(normalizeInvoice)),

  adminPaymentRecords: () =>
    apiRequest<any[]>('/admin/payment-records').then((rows) => rows.map(normalizePaymentRecord)),

  sendWhatsAppInvoice: (orderId: string) =>
    apiRequest<{ success: boolean; provider: string; invoiceUrl?: string; result?: any }>(`/admin/orders/${orderId}/send-whatsapp-invoice`, {
      method: 'POST'
    }),

  adminInvoiceLink: (orderId: string) =>
    apiRequest<{ success: boolean; invoiceNo: string; invoiceUrl: string; invoiceText: string }>(`/admin/orders/${orderId}/invoice-link`),
    
  placeOrder: (order: {
    userId?: string;
    customerName: string;
    customerPhone: string;
    deliveryMethod: 'pickup' | 'delivery';
    shopBranchId?: string | null;
    deliveryAddress?: Address | null;
    selectedSlot: string;
    bagOption: 'own' | 'need';
    couponCode?: string | null;
    deliveryCharge?: number;
    bagCharge?: number;
    discountAmount?: number;
    finalAmount?: number;
    loyaltyRedeemPoints?: number;
    items: { productId: string; quantity: number }[];
    paymentMethod: 'cod' | 'upi';
    paymentStatus?: 'pending' | 'paid' | 'failed' | 'submitted';
    upiReference?: string | null;
  }) =>
    apiRequest<{ success: boolean; order: Order }>('/orders', {
      method: 'POST',
      body: JSON.stringify(order)
    }),
    
  createUpiPayment: (orderId: string, amount: number) =>
    apiRequest<{ success: boolean; payment: any; upiUrl: string }>('/payments/upi/create', {
      method: 'POST',
      body: JSON.stringify({ orderId, amount })
    }),

  confirmUpiPayment: (paymentId: string, providerRef: string) =>
    apiRequest<{ success: boolean }>('/payments/upi/confirm', {
      method: 'POST',
      body: JSON.stringify({ paymentId, providerRef })
    }),

  getLoyaltySummary: () =>
    apiRequest<{
      points: number;
      earnedPoints: number;
      redeemedPoints: number;
      totalSpend: number;
      totalOrders: number;
      earnRateAmount: number;
      redeemBlockPoints: number;
      redeemBlockValue: number;
      nextRewardAt: number;
    }>('/loyalty/summary'),

  getMyReferrals: () =>
    apiRequest<{
      code: string;
      referrals: any[];
      leaderboard: any[];
      receivedReferral?: any;
    }>('/referrals/me'),

  applyReferralCode: (referralCode: string) =>
    apiRequest<{ success: boolean; referral: any }>('/referrals/apply', {
      method: 'POST',
      body: JSON.stringify({ referralCode })
    }),

  getAdminReferrals: () =>
    apiRequest<{ leaderboard: any[]; referrals: any[] }>('/admin/referrals'),

  updateOrderStatus: (id: string, status: string, paymentStatus?: string) =>
    apiRequest<{ success: boolean; order: Order }>(`/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, paymentStatus })
    }),

  collectCodPayment: (id: string, providerRef: string) =>
    apiRequest<{ success: boolean; order: Order }>(`/admin/orders/${id}/collect-cod-payment`, {
      method: 'POST',
      body: JSON.stringify({ providerRef })
    }),

  collectCodCashPayment: (id: string) =>
    apiRequest<{ success: boolean; order: Order }>(`/admin/orders/${id}/collect-cod-cash`, {
      method: 'POST'
    }),

  deleteOrder: (id: string) =>
    apiRequest<{ success: boolean }>(`/admin/orders/${id}`, {
      method: 'DELETE'
    }),

  deleteInvoice: (id: string) =>
    apiRequest<{ success: boolean }>(`/admin/invoices/${id}`, {
      method: 'DELETE'
    }),

  calculateDeliveryDistance: (origin: string, destination: string) =>
    apiRequest<{
      success: boolean;
      distanceKm: number;
      distanceText: string;
      durationText: string;
      source: 'google-maps' | 'estimation-fallback';
    }>('/calculate-distance', {
      method: 'POST',
      body: JSON.stringify({ origin, destination })
    }),

  // Complaints
  getComplaints: (phone?: string) =>
    apiRequest<{ tickets: any[] }>(`/complaints${phone ? `?phone=${phone}` : ''}`),
  
  createComplaint: (data: { userId?: string; customerName?: string; customerPhone?: string; subject: string; category?: string; description: string; priority?: 'low' | 'medium' | 'high' }) =>
    apiRequest<{ ticket: any }>('/complaints', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  
  updateComplaintStatus: (id: string, status: string, adminAnswer?: string) =>
    apiRequest<{ success: boolean; ticket: any }>(`/complaints/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, adminAnswer })
    }),

  deleteComplaint: (id: string) =>
    apiRequest<{ success: boolean }>(`/complaints/${id}`, {
      method: 'DELETE'
    }),

  // Dashboard Aggregates APIs (Admin)
  getDashboardReports: () =>
    apiRequest<{
      revenue: number;
      totalOrdersPlaced: number;
      lowStockCount: number;
      totalProfit: number;
      topProducts: { name: string; quantity: number; sales: number }[];
      salesTrend: { date: string; total: number }[];
      salesAnalytics?: {
        daily: { label: string; total: number; orders: number }[];
        monthly: { label: string; total: number; orders: number }[];
        yearly: { label: string; total: number; orders: number }[];
      }; upcomingBirthdays?: { id: string; name: string; phone: string; email: string; roles?: string[]; roleLabel?: string; dateOfBirth: string; birthdayDayMonth?: string; nextBirthday: string; daysUntil: number; isToday: boolean }[];
    }>('/admin/reports'),
    
   // 🟢 ADD THIS FUNCTION AT THE END OF THE api OBJECT:
  getPublicOrderInvoice: async (orderId: string) => {
   return apiRequest<any>(`/public/orders/${orderId}`);
  }, 

};
