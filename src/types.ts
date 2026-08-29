/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ShopProfile {
  logoUrl: string;
  bannerUrl: string;
  name: string;
  description: string;
  tagline: string;
  contactNumber: string;
  whatsAppNumber: string;
  email: string;
  address: string;
  googleMapsLink: string;
  deliveryRadius: number; // in kilometers
  workingHours: string;
  holidayTimings: string;
  socialFacebook: string;
  socialInstagram: string;
  socialTwitter: string;
  socialLinks?: { label: string; url: string }[];
  isOpen: boolean;
  isHolidayMode: boolean;
  announcement: string;
  holidayMessage: string;
  personalPhoneNumber?: string;
  supportPhoneNumber?: string;
  upiId?: string;
  paymentQrCodeUrl?: string;
  deliverySlots?: string[];
  deliveryChargePerKm?: number;
  baseDeliveryCharge?: number;
  minimumDeliveryOrderAmount?: number;
  deliverySurchargeSettings?: {
    distanceAfterKm: number;
    distanceCharge: number;
    peakStartHour: number;
    peakEndHour: number;
    peakCharge: number;
  };
  freeDeliveryRadiusKm?: number;
  allowExtendedDelivery?: boolean;
  extendedDeliveryMessage?: string;
  extendedDeliveryNote?: string;
  barcodeLabelPrintSettings?: BarcodeLabelPrintSettings;
  addresses?: ShopAddress[];
}

export interface BarcodeLabelPrintSettings {
  labelWidthMm: number;
  labelHeightMm: number;
  columnsPerRow: number;
  horizontalGapMm: number;
  verticalGapMm: number;
}

export type CustomerTab = 'home' | 'search' | 'categories' | 'wishlist' | 'cart' | 'orders' | 'profile';

export interface ShopAddress {
  id: string;
  branchName: string; // e.g. "Main Facility", "Bengaluru South Branch"
  flatAndHouse: string;
  areaAndStreet: string;
  landmark: string;
  pincode: string;
  state: string;
  district: string;
  taluk: string;
  cityOrVillage: string;
  phone?: string;
  isDefault?: boolean;
  lat?: number;
  lng?: number;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string;
  slug: string;
  description: string;
  imageUrl: string;
  isEnabled: boolean;
  order: number;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  categoryId: string;
  categoryIds?: string[];
  subcategoryId?: string;
  sku?: string;
  name: string;
  slug: string;
  description: string;
  basePrice: number;
  offerPrice: number;
  stockCount: number;
  minimumOrderQuantity?: number;
  weight: number; // in grams
  unit?: string;
  packageQuantity?: number;
  packageLabel?: string;
  isEnabled: boolean;
  lowStockAlertThreshold?: number;
  metadata?: Record<string, any>;
  images?: string[];
  externalBarcodes?: string[];
  ratingAverage?: number;
  ratingCount?: number;
  createdAt?: string;
  updatedAt?: string;
  purchasePrice?: number;
  isDailyEssential?: boolean;
  isFeatured?: boolean;
  isSvayiroProduct?: boolean;
  isLooseItem?: boolean;
  looseSection?: string;
  pluCode?: string;
  stockUnit?: 'g' | 'ml' | 'piece';
  sellingUnit?: string;
}

export interface OrderItem {
  productId?: string | null;
  productName: string;
  quantity: number;
  price: number;
  weightGrams?: number;
  sku?: string;
  unitPrice?: number;
  totalPrice?: number;
}

export interface Order {
  id: string;
  orderRef?: string;
  userId: string;
  customerName: string;
  customerPhone: string;
  status: 'pending' | 'pending_delivery_approval' | 'accepted' | 'packed' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'delivery_rejected';
  paymentMethod: 'cod' | 'upi' | 'cashfree';
  paymentStatus: 'pending' | 'submitted' | 'paid' | 'failed' | 'refunded' | 'user_dropped';
  paymentRef?: string;
  deliveryMethod: 'pickup' | 'delivery';
  deliveryAddress?: any;
  selectedSlot?: string;
  bagOption: 'own' | 'need';
  items: OrderItem[];
  amountTotal: number;
  deliveryCharge: number;
  bagCharge: number;
  discountAmount: number;
  finalAmount: number;
  couponCode?: string;
  invoiceType?: 'online_order' | 'offline_pos';
  paymentDetails?: {
    method: string;
    status: string;
    upiReference?: string;
  };
  extendedDelivery?: {
    requested?: boolean;
    message?: string | null;
    note?: string | null;
  };
  cashfree?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  // Aliases for customer app
  productTotal?: number;
  deliveryCost?: number;
  bagCost?: number;
  discount?: number;
  finalTotal?: number;
  invoiceQueue?: {
    scheduledDate?: string | null;
    scheduledDateDisplay?: string | null;
    scheduledDay?: 'today' | 'tomorrow' | 'later' | 'unknown';
    slotLabel?: string | null;
    slotStartMinutes?: number | null;
    slotEndMinutes?: number | null;
    priorityLabel?: string;
    priorityRank?: number;
    isDueSoon?: boolean;
    isDelayed?: boolean;
  };
}

export interface Address {
  id: string;
  label: string;
  flatAndHouse: string;
  areaAndStreet: string;
  landmark: string;
  pincode: string;
  cityOrVillage: string;
  taluk: string;
  district: string;
  state: string;
  name?: string;
  phone: string;
  pickupPersonName?: string;
  pickupPersonPhone?: string;
  isDefault: boolean;
  lat?: number;
  lng?: number;
}

export interface User {
  id: string;
  phone: string;
  staffLoginId?: string;
  name: string;
  email: string;
  dateOfBirth?: string;
  isActive?: boolean;
  savedAddresses: Address[];
  savedForLater: { productId: string; quantity?: number; addedAt?: string }[];
  wishlist: string[];
  roles: string[];
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export type RoleCode = 'admin' | 'inventory_manager' | 'delivery_partner' | 'customer_care' | 'customer';

export interface Role {
  id: string;
  code: RoleCode;
  name: string;
  description?: string;
  permissions?: Record<string, any>;
  isSystem?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffUser extends User {
  roles: RoleCode[];
}

export interface PaymentRecord {
  id: string;
  orderId?: string | null;
  userId?: string | null;
  provider: string;
  providerRef?: string | null;
  method: 'cod' | 'upi' | 'cash' | 'card' | 'manual' | 'cashfree';
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'user_dropped';
  paidAt?: string | null;
  payload?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Invoice {
  id: string;
  orderId: string;
  invoiceNo: string;
  invoiceType: 'online_order' | 'offline_pos';
  customerName?: string;
  customerPhone?: string;
  billingAddress?: Address | null;
  lineItems: OrderItem[];
  subtotal: number;
  deliveryCharge: number;
  bagCharge: number;
  discountAmount: number;
  totalAmount: number;
  paymentStatus: string;
  invoiceText?: string;
  whatsappStatus?: string;
  whatsappSentAt?: string | null;
  metadata?: Record<string, any>;
  issuedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface Coupon {
  id: string;
  code: string;
  description?: string;
  discountType: 'flat' | 'percentage';
  discountValue: number;
  minOrderValue: number;
  maxUses?: number;
  usageLimit?: number;
  currentUsage?: number;
  expiryDate: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export type CampaignOccasion = 'festival' | 'weekend' | 'fresh_stock' | 'clearance' | 'free_delivery' | 'own_brand' | 'custom';
export type CampaignAudience = 'all' | 'new_customers' | 'birthday_customers' | 'returning_customers';

export interface Campaign {
  id: string;
  name: string;
  occasion: CampaignOccasion;
  audience: CampaignAudience;
  title: string;
  subtitle?: string;
  startDate: string;
  endDate: string;
  bannerImageUrl?: string;
  couponId?: string | null;
  couponCode?: string;
  priority: number;
  isActive: boolean;
  productIds: string[];
  categoryIds: string[];
  products?: Product[];
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkType: 'product' | 'category' | 'url' | 'none';
  linkId?: string;
  position: number;
  isEnabled: boolean;
  createdAt?: string;
}

export interface Review {
  id: string;
  productId: string;
  productName?: string;
  productSku?: string;
  userId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  rating: number;
  comment: string;
  isHidden: boolean;
  reply?: string;
  date?: string;
  createdAt?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'offer' | 'order' | 'holiday' | 'announcement';
  audience?: 'customer' | 'admin';
  payload?: Record<string, any>;
  isActive: boolean;
  date?: string;
  createdAt?: string;
}

export interface AdminAlert {
  id: string;
  title: string;
  message: string;
  type: 'feedback' | 'support' | 'complaint' | 'review' | 'reservation' | 'order' | 'system';
  source?: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'unread' | 'read' | 'archived';
  payload?: Record<string, any>;
  date?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdvanceRequest {
  id: string;
  userId?: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  quantity: number;
  targetDate: string;
  status: 'pending' | 'accepted' | 'rejected' | 'arranged' | 'converted_to_order';
  note?: string;
  orderId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName?: string;
  quantityChange: number;
  type: 'in_bound' | 'out_bound' | 'adjustment' | 'offline_sale';
  reason: string;
  source: string;
  referenceId?: string;
  orderId?: string;
  orderRef?: string;
  metadata?: Record<string, any>;
  stockAfter: number;
  createdAt?: string;
}

export interface Bag {
  id: string;
  size: string;
  capacityGrams: number;
  price: number;
  isEnabled: boolean;
  position: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CheckoutBagInfo {
  size: string;
  count: number;
  cost: number;
}

export interface PaymentDetails {
  method: string;
  status: string;
  upiReference?: string;
}

export interface DeliveryAddressInfo {
  flatAndHouse: string;
  areaAndStreet: string;
  landmark: string;
  pincode: string;
  cityOrVillage: string;
  taluk: string;
  district: string;
  state: string;
  lat?: number;
  lng?: number;
}
