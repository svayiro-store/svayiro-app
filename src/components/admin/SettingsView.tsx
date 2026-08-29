import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Edit3,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Link2,
  MapPin,
  Package,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Truck,
  Upload,
  Wallet,
  Globe2,
  Printer
} from 'lucide-react';
import { Bag, BarcodeLabelPrintSettings, RoleCode, ShopAddress, ShopProfile, StaffUser } from '../../types';
import { api } from '../../api';
import GoogleMapPicker from '../customer/GoogleMapPicker';
import { compressAndUploadImage } from '../../utils/cloudinaryUpload';

interface Props {
  shop: ShopProfile;
  isDarkMode: boolean;
  showToast: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void;
  refresh: () => void | Promise<void>;
}

const emptyBranch = (): ShopAddress => ({
  id: `branch_${Date.now()}`,
  branchName: 'New Branch',
  flatAndHouse: '',
  areaAndStreet: '',
  landmark: '',
  pincode: '',
  state: '',
  district: '',
  taluk: '',
  cityOrVillage: '',
  phone: '',
  lat: undefined,
  lng: undefined,
  isDefault: false
});

const defaultSlots = [
  '07:00 AM - 10:00 AM',
  '11:00 AM - 02:00 PM',
  '04:00 PM - 07:00 PM',
  'Store hours standard pickup (07:00 AM - 09:00 PM)'
];

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100   ';
const labelClass = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500';
const sectionClass = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm  ';
const maxLogoUploadBytes = 2 * 1024 * 1024;
const defaultBarcodeLabelPrintSettings: BarcodeLabelPrintSettings = {
  labelWidthMm: 50,
  labelHeightMm: 25,
  columnsPerRow: 2,
  horizontalGapMm: 0,
  verticalGapMm: 0
};
const defaultDeliverySurchargeSettings = { distanceAfterKm: 0, distanceCharge: 0, peakStartHour: 0, peakEndHour: 0, peakCharge: 0 };

function normalizeBarcodeLabelPrintSettings(value: any): BarcodeLabelPrintSettings {
  const source = value && typeof value === 'object' ? value : {};
  const positive = (input: any, fallback: number) => Number.isFinite(Number(input)) && Number(input) > 0 ? Number(input) : fallback;
  const gap = (input: any, fallback: number) => Number.isFinite(Number(input)) && Number(input) >= 0 ? Number(input) : fallback;
  return {
    labelWidthMm: positive(source.labelWidthMm, defaultBarcodeLabelPrintSettings.labelWidthMm),
    labelHeightMm: positive(source.labelHeightMm, defaultBarcodeLabelPrintSettings.labelHeightMm),
    columnsPerRow: Math.max(1, Math.round(positive(source.columnsPerRow, defaultBarcodeLabelPrintSettings.columnsPerRow))),
    horizontalGapMm: gap(source.horizontalGapMm, defaultBarcodeLabelPrintSettings.horizontalGapMm),
    verticalGapMm: gap(source.verticalGapMm, defaultBarcodeLabelPrintSettings.verticalGapMm)
  };
}

function normalizePhone(value?: string) {
  return String(value || '').replace(/\D/g, '');
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

function normalizeShopDetails(shop: ShopProfile): Partial<ShopProfile> {
  return {
    ...shop,
    isOpen: normalizeBoolean((shop as any).isOpen ?? (shop as any).is_open, true),
    isHolidayMode: normalizeBoolean((shop as any).isHolidayMode ?? (shop as any).holiday_mode, false),
    workingHours: shop.workingHours || (shop as any).operational_timings || '07:00 AM - 09:00 PM',
    announcement: shop.announcement || '',
    holidayMessage: shop.holidayMessage || (shop as any).holiday_message || '',
    upiId: shop.upiId || (shop as any).upi_id || '',
    paymentQrCodeUrl: shop.paymentQrCodeUrl || (shop as any).payment_qr_code_url || '',
    socialLinks: Array.isArray(shop.socialLinks)
      ? shop.socialLinks
      : Array.isArray((shop as any).social_links)
        ? (shop as any).social_links
        : [],
    freeDeliveryRadiusKm: Number(shop.freeDeliveryRadiusKm ?? (shop as any).free_delivery_radius_km ?? 0),
    minimumDeliveryOrderAmount: Number(shop.minimumDeliveryOrderAmount ?? (shop as any).minimum_delivery_order_amount ?? 0),
    deliverySurchargeSettings: { ...defaultDeliverySurchargeSettings, ...(shop.deliverySurchargeSettings || (shop as any).delivery_surcharge_settings || {}) },
    allowExtendedDelivery: normalizeBoolean((shop as any).allowExtendedDelivery ?? (shop as any).allow_extended_delivery, false),
    extendedDeliveryMessage: (shop as any).extendedDeliveryMessage || (shop as any).extended_delivery_message || 'Your address is outside our regular delivery area. You can choose Store Pickup or request extended delivery for owner approval.',
    extendedDeliveryNote: (shop as any).extendedDeliveryNote || (shop as any).extended_delivery_note || '',
    barcodeLabelPrintSettings: normalizeBarcodeLabelPrintSettings((shop as any).barcodeLabelPrintSettings || (shop as any).barcode_label_print_settings)
  };
}

function normalizeBags(bags: any[]): Bag[] {
  return bags.map((bag, index) => ({
    id: bag.id || `bag_${index}`,
    size: bag.size || bag.size_label || `Bag ${index + 1}`,
    capacityGrams: Number(bag.capacityGrams ?? bag.capacity_grams ?? 0),
    price: Number(bag.price ?? 0),
    isEnabled: bag.isEnabled ?? bag.is_enabled ?? true,
    position: Number(bag.position ?? index)
  }));
}

export default function SettingsView({ shop, isDarkMode, showToast, refresh }: Props) {
  const [details, setDetails] = useState<Partial<ShopProfile>>(() => normalizeShopDetails(shop));
  const [branches, setBranches] = useState<ShopAddress[]>(shop.addresses || []);
  const [openBranchId, setOpenBranchId] = useState<string | null>(shop.addresses?.[0]?.id || null);
  const [deliverySlots, setDeliverySlots] = useState<string[]>(shop.deliverySlots?.length ? shop.deliverySlots : defaultSlots);
  const [bags, setBags] = useState<Bag[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [staffForm, setStaffForm] = useState({
    name: '',
    password: '',
    staffLoginId: '',
    role: 'inventory_manager' as Exclude<RoleCode, 'admin' | 'customer'>,
    isActive: true
  });
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingBags, setSavingBags] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [showStaffPassword, setShowStaffPassword] = useState(false);

  useEffect(() => {
    setDetails(normalizeShopDetails(shop));
    setBranches(shop.addresses?.length ? shop.addresses : []);
    setOpenBranchId((current) => current && shop.addresses?.some((branch) => branch.id === current) ? current : (shop.addresses?.[0]?.id || null));
    setDeliverySlots(shop.deliverySlots?.length ? shop.deliverySlots : defaultSlots);
  }, [shop]);

  useEffect(() => {
    api.getBags()
      .then((rows) => setBags(normalizeBags(rows as any[])))
      .catch((err: any) => showToast(err.message || 'Failed to load smart bag pricing', 'error'));
    api.getStaff()
      .then((rows) => setStaffUsers(rows as StaffUser[]))
      .catch(() => setStaffUsers([]));
  }, []);

  const qrPreviewUrl = useMemo(() => {
    const upiId = details.upiId || 'svayiro.essentials@upi';
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(details.name || 'SVAYIRO')}&am=100.00&cu=INR&tn=TestPayment`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(upiUrl)}`;
  }, [details.name, details.upiId]);

  const updateDetail = (key: keyof ShopProfile, value: any) => {
    setDetails((prev) => ({ ...prev, [key]: value }));
  };
  const labelPrintSettings = normalizeBarcodeLabelPrintSettings(details.barcodeLabelPrintSettings);
  const updateLabelPrintSetting = (key: keyof BarcodeLabelPrintSettings, value: string) => {
    const numeric = Number(value);
    setDetails((prev) => ({
      ...prev,
      barcodeLabelPrintSettings: { ...normalizeBarcodeLabelPrintSettings(prev.barcodeLabelPrintSettings), [key]: Number.isFinite(numeric) ? numeric : 0 }
    }));
  };
  const socialLinks = Array.isArray(details.socialLinks) ? details.socialLinks : [];
  const staffRoleLabels: Record<Exclude<RoleCode, 'admin' | 'customer'>, string> = {
    inventory_manager: 'Inventory Manager',
    delivery_partner: 'Delivery Partner',
    customer_care: 'Customer Care'
  };
  const staffRolePrefixes: Record<Exclude<RoleCode, 'admin' | 'customer'>, string> = {
    inventory_manager: 'INV',
    delivery_partner: 'DEL',
    customer_care: 'CARE'
  };

  const updateSocialLink = (index: number, patch: Partial<{ label: string; url: string }>) => {
    setDetails((prev) => {
      const current = Array.isArray(prev.socialLinks) ? prev.socialLinks : [];
      return {
        ...prev,
        socialLinks: current.map((link, idx) => idx === index ? { ...link, ...patch } : link)
      };
    });
  };

  const addSocialLink = () => {
    setDetails((prev) => ({
      ...prev,
      socialLinks: [...(Array.isArray(prev.socialLinks) ? prev.socialLinks : []), { label: '', url: '' }]
    }));
  };

  const removeSocialLink = (index: number) => {
    setDetails((prev) => ({
      ...prev,
      socialLinks: (Array.isArray(prev.socialLinks) ? prev.socialLinks : []).filter((_, idx) => idx !== index)
    }));
  };

  const updateBranch = (id: string, patch: Partial<ShopAddress>) => {
    setBranches((prev) => prev.map((branch) => branch.id === id ? { ...branch, ...patch } : branch));
  };

  const addBranch = () => {
    const branch = emptyBranch();
    setBranches((prev) => [...prev, branch]);
    setOpenBranchId(branch.id);
  };

  const setMainBranch = (id: string) => {
    setBranches((prev) => prev.map((branch) => ({ ...branch, isDefault: branch.id === id })));
  };

  const handleLogoUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please upload a valid image file for the logo.', 'warning');
      return;
    }
    if (file.size > maxLogoUploadBytes) {
      showToast('Logo image must be 2 MB or smaller.', 'warning');
      return;
    }

    try {
      const logo = await compressAndUploadImage(file, { folder: 'logo', maxWidth: 512, maxHeight: 512, quality: 0.82 });
      updateDetail('logoUrl', logo);
    } catch {
      showToast('Unable to optimize the selected logo image.', 'error');
    }
  };

  const handleRegisterStaff = async () => {
    if (!staffForm.name.trim()) {
      showToast('Enter staff name.', 'warning');
      return;
    }
    if (staffForm.password.length < 8 || !/[A-Za-z]/.test(staffForm.password) || !/\d/.test(staffForm.password)) {
      showToast('Staff password must be at least 8 characters with letters and numbers.', 'warning');
      return;
    }
    setSavingStaff(true);
    try {
      await api.createStaff({
        name: staffForm.name.trim(),
        password: staffForm.password,
        role: staffForm.role,
        isActive: staffForm.isActive
      });
      showToast('Staff role account registered.', 'success');
      setStaffForm({ name: '', password: '', staffLoginId: '', role: 'inventory_manager', isActive: true });
      const rows = await api.getStaff();
      setStaffUsers(rows as StaffUser[]);
    } catch (err: any) {
      showToast(err.message || 'Failed to register staff.', 'error');
    } finally {
      setSavingStaff(false);
    }
  };

  const resetStaffForm = () => {
    setEditingStaffId(null);
    setShowStaffPassword(false);
    setStaffForm({ name: '', password: '', staffLoginId: '', role: 'inventory_manager', isActive: true });
  };

  const handleEditStaff = (staff: StaffUser) => {
    const staffRole = staff.roles?.find((role) => role !== 'admin' && role !== 'customer') as Exclude<RoleCode, 'admin' | 'customer'> | undefined;
    setEditingStaffId(staff.id);
    setStaffForm({
      name: staff.name || '',
      password: '',
      staffLoginId: staff.staffLoginId || '',
      role: staffRole || 'inventory_manager',
      isActive: staff.isActive !== false
    });
  };

  const handleSaveStaffEdit = async () => {
    if (!editingStaffId) return;
    if (!staffForm.name.trim()) {
      showToast('Enter staff name.', 'warning');
      return;
    }
    if (staffForm.password && (staffForm.password.length < 8 || !/[A-Za-z]/.test(staffForm.password) || !/\d/.test(staffForm.password))) {
      showToast('New staff password must be at least 8 characters with letters and numbers.', 'warning');
      return;
    }
    setSavingStaff(true);
    try {
      await api.updateStaff(editingStaffId, {
        name: staffForm.name.trim(),
        password: staffForm.password || undefined,
        role: staffForm.role,
        isActive: staffForm.isActive
      });
      showToast('Staff account updated.', 'success');
      resetStaffForm();
      const rows = await api.getStaff();
      setStaffUsers(rows as StaffUser[]);
    } catch (err: any) {
      showToast(err.message || 'Failed to update staff.', 'error');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleDeleteStaff = async (staff: StaffUser) => {
    if (!window.confirm(`Delete staff account ${staff.name || staff.staffLoginId}? This cannot be undone.`)) return;
    setSavingStaff(true);
    try {
      await api.deleteStaff(staff.id);
      showToast('Staff account deleted.', 'success');
      if (editingStaffId === staff.id) resetStaffForm();
      const rows = await api.getStaff();
      setStaffUsers(rows as StaffUser[]);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete staff.', 'error');
    } finally {
      setSavingStaff(false);
    }
  };

  const validateProfile = () => {
    const name = details.name?.trim();
    const email = details.email?.trim();
    const upiId = details.upiId?.trim();
    const phoneFields = [
      ['Primary contact number', details.contactNumber],
      ['WhatsApp hotline number', details.whatsAppNumber],
      ['Personal phone number', details.personalPhoneNumber],
      ['Customer support number', details.supportPhoneNumber]
    ];

    if (!name || !/^[A-Za-z][A-Za-z .'-]{1,79}$/.test(name)) {
      return 'Shop name must be 2-80 characters and contain only letters, spaces, apostrophes, periods, or hyphens.';
    }
    if (details.logoUrl && !/^https?:\/\//.test(details.logoUrl) && !/^data:image\//.test(details.logoUrl)) {
      return 'Logo must be a valid image URL or an uploaded image file.';
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Please enter a valid support email.';
    for (const [label, value] of phoneFields) {
      const digits = normalizePhone(value);
      if (digits && !/^[6-9]\d{9}$/.test(digits)) return `${label} must be a valid 10-digit Indian mobile number.`;
    }
    if (upiId && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{2,64}$/.test(upiId)) {
      return 'Please enter a valid UPI ID, like name@bank.';
    }
    for (const link of socialLinks) {
      if (!link.label.trim() && !link.url.trim()) continue;
      if (!link.label.trim()) return 'Every social media link needs a label, like Instagram or YouTube.';
      if (!/^https?:\/\/\S+$/i.test(link.url.trim())) return `${link.label || 'Social media'} link must start with http:// or https://.`;
    }
    if (!details.workingHours?.trim() || details.workingHours.trim().length < 5) {
      return 'Operational store timings are required.';
    }
    if ((details.announcement || '').length > 300) {
      return 'Broadcast alert text must be 300 characters or fewer.';
    }
    if ((details.holidayMessage || '').length > 300) {
      return 'Shop closed broadcast message must be 300 characters or fewer.';
    }
    if (Number(details.freeDeliveryRadiusKm || 0) > Number(details.deliveryRadius || 10)) {
      return 'Free home delivery distance cannot be greater than maximum delivery radius.';
    }
    const labelSettings = details.barcodeLabelPrintSettings as any;
    if (!labelSettings || Number(labelSettings.labelWidthMm) <= 0 || Number(labelSettings.labelHeightMm) <= 0) {
      return 'Barcode label width and height must be greater than 0.';
    }
    if (!Number.isInteger(Number(labelSettings.columnsPerRow)) || Number(labelSettings.columnsPerRow) < 1) {
      return 'Barcode label columns per row must be at least 1.';
    }
    if (Number(labelSettings.horizontalGapMm) < 0 || Number(labelSettings.verticalGapMm) < 0) {
      return 'Barcode label gaps cannot be negative.';
    }
    const cleanedSlots = deliverySlots.map((slot) => slot.trim()).filter(Boolean);
    if (cleanedSlots.length === 0) {
      return 'At least one delivery slot is required.';
    }
    if (cleanedSlots.some((slot) => slot.length > 80)) {
      return 'Every delivery slot must be 80 characters or fewer.';
    }
    for (const branch of branches) {
      if (!branch.branchName.trim()) return 'Every store branch needs a branch name.';
      const branchPhone = normalizePhone(branch.phone);
      if (branchPhone && !/^[6-9]\d{9}$/.test(branchPhone)) return `${branch.branchName} phone must be a valid 10-digit Indian mobile number.`;
      if (branch.pincode && !/^[1-9]\d{5}$/.test(branch.pincode)) return `${branch.branchName} pincode must be a valid 6-digit Indian pincode.`;
      const lat = Number(branch.lat);
      const lng = Number(branch.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return `${branch.branchName} needs a pinned map location with valid latitude and longitude.`;
      }
    }
    return '';
  };

  const handleSave = async () => {
    const validationMessage = validateProfile();
    if (validationMessage) {
      showToast(validationMessage, 'warning');
      return;
    }

    const sanitizedBranches = branches.map((branch) => ({
      ...branch,
      phone: normalizePhone(branch.phone),
      pincode: normalizePhone(branch.pincode).slice(0, 6),
      lat: Number(branch.lat),
      lng: Number(branch.lng)
    }));
    const sanitizedDeliverySlots = deliverySlots.map((slot) => slot.trim()).filter(Boolean);
    const sanitizedSocialLinks = socialLinks
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.label && link.url);

    setSaving(true);
    try {
      const isOpen = normalizeBoolean(details.isOpen, true);
      const isHolidayMode = normalizeBoolean(details.isHolidayMode, false);
      const shopPayload: Partial<ShopProfile> & Record<string, any> = {
        name: details.name?.trim(),
        tagline: details.tagline?.trim(),
        description: details.description?.trim(),
        email: details.email?.trim(),
        address: typeof details.address === 'string' ? details.address.trim() : '',
        googleMapsLink: details.googleMapsLink?.trim(),
        logoUrl: details.logoUrl || '',
        logo_url: details.logoUrl || '',
        bannerUrl: details.bannerUrl || '',
        banner_url: details.bannerUrl || '',
        contactNumber: normalizePhone(details.contactNumber),
        whatsAppNumber: normalizePhone(details.whatsAppNumber),
        personalPhoneNumber: normalizePhone(details.personalPhoneNumber),
        supportPhoneNumber: normalizePhone(details.supportPhoneNumber),
        upiId: details.upiId?.trim(),
        upi_id: details.upiId?.trim(),
        paymentQrCodeUrl: details.paymentQrCodeUrl || '',
        payment_qr_code_url: details.paymentQrCodeUrl || '',
        deliveryRadius: Number(details.deliveryRadius || 10),
        freeDeliveryRadiusKm: Number(details.freeDeliveryRadiusKm || 0),
        free_delivery_radius_km: Number(details.freeDeliveryRadiusKm || 0),
        baseDeliveryCharge: Number(details.baseDeliveryCharge || 0),
        deliveryChargePerKm: Number(details.deliveryChargePerKm || 0),
        minimumDeliveryOrderAmount: Number(details.minimumDeliveryOrderAmount || 0),
        minimum_delivery_order_amount: Number(details.minimumDeliveryOrderAmount || 0),
        deliverySurchargeSettings: details.deliverySurchargeSettings || defaultDeliverySurchargeSettings,
        delivery_surcharge_settings: details.deliverySurchargeSettings || defaultDeliverySurchargeSettings,
        isOpen,
        is_open: isOpen,
        isHolidayMode,
        holiday_mode: isHolidayMode,
        workingHours: details.workingHours?.trim(),
        operational_timings: details.workingHours?.trim(),
        announcement: details.announcement?.trim(),
        holidayMessage: details.holidayMessage?.trim(),
        holiday_message: details.holidayMessage?.trim(),
        deliverySlots: sanitizedDeliverySlots,
        delivery_slots: sanitizedDeliverySlots,
        socialLinks: sanitizedSocialLinks,
        social_links: sanitizedSocialLinks,
        allowExtendedDelivery: Boolean(details.allowExtendedDelivery),
        allow_extended_delivery: Boolean(details.allowExtendedDelivery),
        extendedDeliveryMessage: details.extendedDeliveryMessage?.trim(),
        extended_delivery_message: details.extendedDeliveryMessage?.trim(),
        extendedDeliveryNote: details.extendedDeliveryNote?.trim(),
        extended_delivery_note: details.extendedDeliveryNote?.trim(),
        barcodeLabelPrintSettings: details.barcodeLabelPrintSettings,
        barcode_label_print_settings: details.barcodeLabelPrintSettings,
        addresses: sanitizedBranches
      };
      const result = await api.updateShopProfile(shopPayload);
      setDetails(normalizeShopDetails(result.data));
      setBranches(result.data.addresses?.length ? result.data.addresses : sanitizedBranches);
      setDeliverySlots(result.data.deliverySlots?.length ? result.data.deliverySlots : sanitizedDeliverySlots);
      showToast('Store settings saved.', 'success');
      await refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to update store settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBags = async () => {
    const invalid = bags.find((bag) => !bag.size.trim() || Number(bag.capacityGrams) <= 0 || Number(bag.price) < 0);
    if (invalid) {
      showToast('Each carrier bag needs a label, capacity greater than 0, and non-negative price.', 'warning');
      return;
    }
    setSavingBags(true);
    try {
      const result = await api.updateBags(bags);
      setBags(normalizeBags(result.data as any[]));
      showToast('Smart bag pricing saved.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save smart bag pricing', 'error');
    } finally {
      setSavingBags(false);
    }
  };

  const storeIsOpen = normalizeBoolean(details.isOpen, true);
  const holidayAdvisoryEnabled = normalizeBoolean(details.isHolidayMode, false);

  return (
    <div className={`space-y-6 ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5  md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold">Configure SVAYIRO configs and parameters</h2>
          <p className="text-xs text-slate-500">Adjust branding, physical address, support helplines, operational schedules, and delivery limits.</p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white shadow-lg shadow-indigo-900/20 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Store Settings'}
        </button>
      </div>

      <section className={sectionClass}>
        <SectionTitle icon={Building2} title="SVAYIRO Store Branding & Metadata Profile" />
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.35fr]">
          <Field label="Shop / Franchise Name">
            <input className={inputClass} value={details.name || ''} onChange={(e) => updateDetail('name', e.target.value)} />
          </Field>
          <Field label="Brand Slogan / Tagline">
            <input className={inputClass} value={details.tagline || ''} onChange={(e) => updateDetail('tagline', e.target.value)} />
          </Field>
          <Field label="Logo Image">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className={`${inputClass} pl-9`}
                  placeholder="Paste image URL or upload from device"
                  value={details.logoUrl || ''}
                  onChange={(e) => updateDetail('logoUrl', e.target.value)}
                />
              </div>
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100   ">
                <Upload className="h-4 w-4" />
                Upload
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => {
                    handleLogoUpload(event.target.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50  ">
                {details.logoUrl ? (
                  <img src={details.logoUrl} alt="Logo preview" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-slate-400" />
                )}
              </div>
            </div>
          </Field>
        </div>
      </section>

      <section className={sectionClass}>
        <SectionTitle icon={Printer} title="Barcode Label Print Settings" />
        <p className="mb-4 text-xs text-slate-500">These values control the barcode-label print document. They are saved for this shop and are not tied to A4 or Letter paper.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="Label Width (mm)"><input className={inputClass} type="number" min="0.1" step="0.1" value={labelPrintSettings.labelWidthMm} onChange={(event) => updateLabelPrintSetting('labelWidthMm', event.target.value)} /></Field>
          <Field label="Label Height (mm)"><input className={inputClass} type="number" min="0.1" step="0.1" value={labelPrintSettings.labelHeightMm} onChange={(event) => updateLabelPrintSetting('labelHeightMm', event.target.value)} /></Field>
          <Field label="Columns per Row"><input className={inputClass} type="number" min="1" step="1" value={labelPrintSettings.columnsPerRow} onChange={(event) => updateLabelPrintSetting('columnsPerRow', event.target.value)} /></Field>
          <Field label="Horizontal Gap (mm)"><input className={inputClass} type="number" min="0" step="0.1" value={labelPrintSettings.horizontalGapMm} onChange={(event) => updateLabelPrintSetting('horizontalGapMm', event.target.value)} /></Field>
          <Field label="Vertical Gap (mm)"><input className={inputClass} type="number" min="0" step="0.1" value={labelPrintSettings.verticalGapMm} onChange={(event) => updateLabelPrintSetting('verticalGapMm', event.target.value)} /></Field>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3  ">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold uppercase text-slate-500">
            <span>Print preview — row width {(labelPrintSettings.labelWidthMm * labelPrintSettings.columnsPerRow + labelPrintSettings.horizontalGapMm * (labelPrintSettings.columnsPerRow - 1)).toFixed(1)} mm</span>
            <span>{labelPrintSettings.labelWidthMm} × {labelPrintSettings.labelHeightMm} mm · {labelPrintSettings.columnsPerRow} columns</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-dashed border-slate-300 bg-white p-3  ">
            <div
              className="grid w-max"
              style={{
                gridTemplateColumns: `repeat(${labelPrintSettings.columnsPerRow}, minmax(74px, ${Math.max(74, labelPrintSettings.labelWidthMm * 2.4)}px))`,
                gap: `${Math.max(0, labelPrintSettings.verticalGapMm * 2.4)}px ${Math.max(0, labelPrintSettings.horizontalGapMm * 2.4)}px`
              }}
            >
              {Array.from({ length: labelPrintSettings.columnsPerRow * 3 }, (_, index) => (
                <div key={index} className="flex items-center justify-center border border-indigo-400 bg-indigo-50 text-[10px] font-semibold text-indigo-700  " style={{ height: Math.max(40, labelPrintSettings.labelHeightMm * 2.4) }}>
                  LABEL {index + 1}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <SectionTitle icon={MapPin} title="Helplines, Addresses & Personal Contact Info" />
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4">
            <Field label="Physical Shop Address">
              <textarea className={`${inputClass} min-h-20 resize-y`} value={details.address || ''} onChange={(e) => updateDetail('address', e.target.value)} />
            </Field>
            <Field label="Google Maps Coordinates Link">
              <input className={inputClass} value={details.googleMapsLink || ''} onChange={(e) => updateDetail('googleMapsLink', e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <PhoneField label="Primary Contact No." value={details.contactNumber} onChange={(value) => updateDetail('contactNumber', value)} />
            <PhoneField label="WhatsApp Hotline No." value={details.whatsAppNumber} onChange={(value) => updateDetail('whatsAppNumber', value)} />
            <PhoneField label="Personal Phone Number" value={details.personalPhoneNumber} onChange={(value) => updateDetail('personalPhoneNumber', value)} />
            <PhoneField label="Customer Support Helpdesk No." value={details.supportPhoneNumber} onChange={(value) => updateDetail('supportPhoneNumber', value)} />
            <Field label="Store Support Email">
              <input className={inputClass} type="email" value={details.email || ''} onChange={(e) => updateDetail('email', e.target.value)} />
            </Field>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-indigo-700 pb-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-indigo-700 ">
            <Globe2 className="h-4 w-4" />
            Social Media Links
          </div>
          <button type="button" onClick={addSocialLink} className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white">
            <Plus className="h-4 w-4" />
            Add Link
          </button>
        </div>
        <div className="space-y-3">
          {socialLinks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-xs font-semibold text-slate-500 ">
              No social links added. Add Instagram, Facebook, YouTube, WhatsApp channel, website, or any public page.
            </div>
          ) : socialLinks.map((link, index) => (
            <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-3  md:grid-cols-[0.45fr_1fr_auto]">
              <Field label="Platform / Label">
                <input className={inputClass} value={link.label} onChange={(e) => updateSocialLink(index, { label: e.target.value })} placeholder="Instagram" />
              </Field>
              <Field label="Public URL">
                <input className={inputClass} value={link.url} onChange={(e) => updateSocialLink(index, { url: e.target.value })} placeholder="https://instagram.com/yourshop" />
              </Field>
              <button type="button" title="Delete social link" onClick={() => removeSocialLink(index)} className="self-end rounded-lg border border-rose-100 p-2 text-rose-500 hover:bg-rose-50 ">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-indigo-700 pb-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-indigo-700 ">
            <Building2 className="h-4 w-4" />
            Store Branches & Facility Addresses
          </div>
          <button type="button" onClick={addBranch} className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white">
            <Plus className="h-4 w-4" />
            Add Store Branch
          </button>
        </div>
        <div className="space-y-3">
          {branches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-xs font-semibold text-slate-500 ">
              No branches added. Add the main shop branch first so delivery distance can be calculated from a pinned origin.
            </div>
          ) : branches.map((branch, index) => {
            const isOpen = openBranchId === branch.id;
            const branchSummary = [
              branch.areaAndStreet,
              branch.cityOrVillage,
              branch.district,
              branch.pincode
            ].filter(Boolean).join(', ') || 'Address not completed';
            return (
              <div key={branch.id} className={`overflow-hidden rounded-xl border ${branch.isDefault ? 'border-indigo-300 bg-indigo-50/40  ' : 'border-slate-300 bg-white  '}`}>
                <button
                  type="button"
                  onClick={() => setOpenBranchId(isOpen ? null : branch.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase text-slate-500">Branch {index + 1}</span>
                      <span className="truncate text-sm font-semibold">{branch.branchName || 'Unnamed Branch'}</span>
                      {branch.isDefault && <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-semibold text-indigo-700  ">Main Branch</span>}
                      {branch.lat && branch.lng && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700  ">Pinned</span>}
                    </div>
                    <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">{branchSummary}</p>
                  </div>
                  <div className="shrink-0 rounded-lg border border-slate-200 bg-white p-2  ">
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-200 p-4 ">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <input className={`${inputClass} font-semibold`} value={branch.branchName} onChange={(e) => updateBranch(branch.id, { branchName: e.target.value })} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input className={inputClass} placeholder="Flat / building" value={branch.flatAndHouse} onChange={(e) => updateBranch(branch.id, { flatAndHouse: e.target.value })} />
                      <input className={inputClass} placeholder="Area / street" value={branch.areaAndStreet} onChange={(e) => updateBranch(branch.id, { areaAndStreet: e.target.value })} />
                      <input className={inputClass} placeholder="Landmark" value={branch.landmark} onChange={(e) => updateBranch(branch.id, { landmark: e.target.value })} />
                      <input className={inputClass} placeholder="Phone" inputMode="numeric" maxLength={16} value={branch.phone || ''} onChange={(e) => updateBranch(branch.id, { phone: e.target.value.replace(/\D/g, '') })} />
                      <input className={inputClass} placeholder="City / village" value={branch.cityOrVillage} onChange={(e) => updateBranch(branch.id, { cityOrVillage: e.target.value })} />
                      <input className={inputClass} placeholder="Taluk" value={branch.taluk} onChange={(e) => updateBranch(branch.id, { taluk: e.target.value })} />
                      <input className={inputClass} placeholder="District" value={branch.district} onChange={(e) => updateBranch(branch.id, { district: e.target.value })} />
                      <input className={inputClass} placeholder="State" value={branch.state} onChange={(e) => updateBranch(branch.id, { state: e.target.value })} />
                      <input className={inputClass} placeholder="Pincode" inputMode="numeric" maxLength={6} value={branch.pincode} onChange={(e) => updateBranch(branch.id, { pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
                    </div>
                    <div className="mt-3 rounded-xl border border-indigo-100 bg-white p-3  ">
                      <div className="mb-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700 ">Pinned branch location</p>
                          <p className="text-[10px] font-semibold text-slate-500">Used as route origin for delivery billing.</p>
                        </div>
                      </div>
                      <GoogleMapPicker
                        className="mb-3"
                        lat={branch.lat}
                        lng={branch.lng}
                        label="Pin branch on map"
                        helperText="Click or drag the marker to the exact shop or warehouse entrance."
                        onChange={(coords) => updateBranch(branch.id, { lat: coords.lat, lng: coords.lng })}
                        onResolvedAddress={(resolved) => updateBranch(branch.id, {
                          state: resolved.state || branch.state,
                          district: resolved.district || branch.district,
                          cityOrVillage: resolved.city || branch.cityOrVillage,
                          pincode: resolved.pincode || branch.pincode
                        })}
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input className={inputClass} placeholder="Latitude e.g. 12.9715987" inputMode="decimal" value={branch.lat ?? ''} onChange={(e) => updateBranch(branch.id, { lat: e.target.value === '' ? undefined : Number(e.target.value) })} />
                        <input className={inputClass} placeholder="Longitude e.g. 77.5945627" inputMode="decimal" value={branch.lng ?? ''} onChange={(e) => updateBranch(branch.id, { lng: e.target.value === '' ? undefined : Number(e.target.value) })} />
                      </div>
                      <p className="mt-2 text-[10px] font-semibold text-amber-700 ">
                        For accurate pointing, enter the exact latitude and longitude from Google Maps: open the location, long-press/right-click the pin, then copy the coordinates.
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-200 pt-3 ">
                      {!branch.isDefault && <button type="button" onClick={() => setMainBranch(branch.id)} className="text-xs font-semibold text-indigo-700 ">Set Main Branch</button>}
                      <button type="button" title="Delete branch" onClick={() => {
                        setBranches((prev) => prev.filter((item) => item.id !== branch.id));
                        setOpenBranchId((current) => current === branch.id ? null : current);
                      }} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 ">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={sectionClass}>
          <SectionTitle icon={Clock} title="Core Operational Timings & Schedules" />
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold ${
            storeIsOpen
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800   '
              : 'border-rose-200 bg-rose-50 text-rose-800   '
          }`}>
            {storeIsOpen
              ? 'Store is OPEN. Customers can browse, add to cart, and place checkout orders.'
              : 'Store is CLOSED. Customers can browse and save cart items, but checkout is blocked.'}
          </div>
          <Toggle
            label="SVAYIRO Store Open Status"
            checked={storeIsOpen}
            checkedLabel="Open"
            uncheckedLabel="Closed"
            onChange={(checked) => updateDetail('isOpen', checked)}
          />
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold ${
            holidayAdvisoryEnabled
              ? 'border-amber-200 bg-amber-50 text-amber-800   '
              : 'border-slate-200 bg-slate-50 text-slate-600   '
          }`}>
            {holidayAdvisoryEnabled
              ? 'Holiday advisory is ENABLED. This broadcast message is shown above the customer banner, including when the store is closed.'
              : 'Holiday advisory is DISABLED. No holiday advisory message will be shown.'}
          </div>
          <Toggle
            label="Holiday Schedule Advisory"
            checked={holidayAdvisoryEnabled}
            checkedLabel="Enabled"
            uncheckedLabel="Disabled"
            onChange={(checked) => updateDetail('isHolidayMode', checked)}
          />
          <Field label="Operational Store Timings">
            <input className={inputClass} value={details.workingHours || ''} onChange={(e) => updateDetail('workingHours', e.target.value)} />
          </Field>
          <Field label="Broadcast Alert Text Line">
            <textarea className={`${inputClass} min-h-16`} value={details.announcement || ''} onChange={(e) => updateDetail('announcement', e.target.value)} />
          </Field>
          <Field label="Holiday / Shop Closed Broadcast Message">
            <textarea className={`${inputClass} min-h-16`} value={details.holidayMessage || ''} onChange={(e) => updateDetail('holidayMessage', e.target.value)} />
          </Field>
        </section>

        <section className={sectionClass}>
          <SectionTitle icon={Truck} title="Independent Slotted Home Delivery Parameters" accent="emerald" />
          <Field label="Maximum Delivery Radius (Kilometers)">
            <input className={inputClass} type="number" min={1} value={details.deliveryRadius ?? 10} onChange={(e) => updateDetail('deliveryRadius', Number(e.target.value))} />
          </Field>
          <Field label="Free Home Delivery Up To (Kilometers)">
            <input className={inputClass} type="number" min={0} max={details.deliveryRadius ?? 10} step="0.1" value={details.freeDeliveryRadiusKm ?? 0} onChange={(e) => updateDetail('freeDeliveryRadiusKm', Number(e.target.value))} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base Delivery Charge (₹)">
              <input className={inputClass} type="number" min={0} value={details.baseDeliveryCharge ?? 30} onChange={(e) => updateDetail('baseDeliveryCharge', Number(e.target.value))} />
            </Field>
            <Field label="Per KM Charge (₹ / KM)">
              <input className={inputClass} type="number" min={0} value={details.deliveryChargePerKm ?? 12} onChange={(e) => updateDetail('deliveryChargePerKm', Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Minimum Product Order for Home Delivery (₹)">
            <input className={inputClass} type="number" min={0} step="1" value={details.minimumDeliveryOrderAmount ?? 0} onChange={(e) => updateDetail('minimumDeliveryOrderAmount', Number(e.target.value))} />
            <p className="mt-1 text-[10px] font-semibold text-slate-500">Set 0 to allow delivery for any product total. Store pickup is never restricted by this amount.</p>
          </Field>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
            <p className="mb-3 text-xs font-bold text-violet-900">Distance & urgent delivery surcharge</p>
            <p className="mb-3 text-[10px] font-semibold text-violet-700">Distance charges apply automatically. The urgent charge applies only when the customer selects urgent delivery at checkout. Set charges to 0 to disable a rule.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Add charge after distance (KM)"><input className={inputClass} type="number" min={0} step="0.1" value={details.deliverySurchargeSettings?.distanceAfterKm ?? 0} onChange={(e) => updateDetail('deliverySurchargeSettings', { ...defaultDeliverySurchargeSettings, ...details.deliverySurchargeSettings, distanceAfterKm: Number(e.target.value) })} /></Field>
              <Field label="Distance surcharge (₹)"><input className={inputClass} type="number" min={0} value={details.deliverySurchargeSettings?.distanceCharge ?? 0} onChange={(e) => updateDetail('deliverySurchargeSettings', { ...defaultDeliverySurchargeSettings, ...details.deliverySurchargeSettings, distanceCharge: Number(e.target.value) })} /></Field>
              <Field label="Urgent delivery surcharge (₹)"><input className={inputClass} type="number" min={0} value={details.deliverySurchargeSettings?.peakCharge ?? 0} onChange={(e) => updateDetail('deliverySurchargeSettings', { ...defaultDeliverySurchargeSettings, ...details.deliverySurchargeSettings, peakCharge: Number(e.target.value) })} /></Field>
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4  ">
            <Toggle
              label="Allow Out-of-Range Delivery Requests"
              checked={Boolean(details.allowExtendedDelivery)}
              checkedLabel="Allowed"
              uncheckedLabel="Blocked"
              onChange={(checked) => updateDetail('allowExtendedDelivery', checked)}
            />
            <p className="mt-2 text-[11px] font-semibold leading-relaxed text-amber-800 ">
              If enabled, customers outside normal radius can request owner approval. The order waits as an outside-coverage request and stock/payment effects are not finalized automatically.
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Field label="Message shown to outside-range customers">
                <textarea
                  className={`${inputClass} min-h-20`}
                  value={details.extendedDeliveryMessage || ''}
                  onChange={(e) => updateDetail('extendedDeliveryMessage', e.target.value)}
                  placeholder="This address is outside regular delivery range. Choose Store Pickup or request extended delivery approval."
                />
              </Field>
              <Field label="Internal owner handling note">
                <textarea
                  className={`${inputClass} min-h-20`}
                  value={details.extendedDeliveryNote || ''}
                  onChange={(e) => updateDetail('extendedDeliveryNote', e.target.value)}
                  placeholder="Example: Contact customer, confirm custom shipping, then accept/reject."
                />
              </Field>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4  ">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase text-emerald-700 ">
              <span>Edit Slotted Delivery Timings</span>
              <span>{deliverySlots.length} Slots</span>
            </div>
            <div className="space-y-2">
              {deliverySlots.map((slot, index) => (
                <div key={`${slot}_${index}`} className="flex gap-2">
                  <input className={inputClass} value={slot} onChange={(e) => setDeliverySlots((prev) => prev.map((item, i) => i === index ? e.target.value : item))} />
                  <button type="button" onClick={() => setDeliverySlots((prev) => prev.filter((_, i) => i !== index))} className="rounded-lg border border-rose-100 px-3 text-rose-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setDeliverySlots((prev) => [...prev, ''])} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-400 px-3 py-2 text-xs font-semibold text-emerald-700 ">
                <Plus className="h-4 w-4" />
                Add New Delivery Slot
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className={sectionClass}>
        <SectionTitle icon={ShieldCheck} title="Staff Role Account Registration" />
        <p className="mb-4 text-xs text-slate-500">
          Owner creates worker console IDs here. Workers sign in only with this ID and password; password changes must be done by the owner.
        </p>
        {editingStaffId && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800   ">
            Editing staff account. Console ID is locked unless the role changes; leave password blank to keep the current password.
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_1fr_1fr_0.8fr]">
          <Field label="1. Select Role">
            <select className={inputClass} value={staffForm.role} onChange={(e) => setStaffForm((prev) => ({ ...prev, role: e.target.value as any }))}>
              <option value="inventory_manager">Inventory Manager</option>
              <option value="delivery_partner">Delivery Partner</option>
              <option value="customer_care">Customer Care</option>
            </select>
          </Field>
          <Field label="2. Staff Name">
            <input className={inputClass} value={staffForm.name} onChange={(e) => setStaffForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Worker name" />
          </Field>
          <Field label="3. Login ID">
            <input
              className={`${inputClass} font-mono`}
              value={editingStaffId ? staffForm.staffLoginId || 'Regenerated if role changed' : `${staffRolePrefixes[staffForm.role]}-AUTO`}
              readOnly
              title="Backend generates the exact ID when saved."
            />
          </Field>
          <Field label="4. Password">
            <div className="relative">
              <input
                className={`${inputClass} pr-11`}
                type={showStaffPassword ? 'text' : 'password'}
                value={staffForm.password}
                onChange={(e) => setStaffForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder={editingStaffId ? 'Blank = keep current' : 'Letters + numbers'}
              />
              <button
                type="button"
                onClick={() => setShowStaffPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100  "
                aria-label={showStaffPassword ? 'Hide password' : 'Show password'}
                title={showStaffPassword ? 'Hide password' : 'Show password'}
              >
                {showStaffPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="5. Status">
            <select className={inputClass} value={staffForm.isActive ? 'active' : 'inactive'} onChange={(e) => setStaffForm((prev) => ({ ...prev, isActive: e.target.value === 'active' }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={editingStaffId ? handleSaveStaffEdit : handleRegisterStaff} disabled={savingStaff} className="rounded-lg bg-indigo-800 px-4 py-3 text-xs font-semibold uppercase text-white disabled:opacity-60">
            {savingStaff ? 'Saving...' : editingStaffId ? 'Save Staff Changes' : 'Register Staff Account'}
          </button>
          {editingStaffId && (
            <button type="button" onClick={resetStaffForm} disabled={savingStaff} className="rounded-lg border border-slate-200 px-4 py-3 text-xs font-semibold uppercase text-slate-600 hover:bg-slate-50 disabled:opacity-60   ">
              Cancel Edit
            </button>
          )}
        </div>
        <div className="mt-5 overflow-auto rounded-xl border border-slate-200 ">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 ">
              <tr>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Login ID</th>
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staffUsers.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-5 text-center text-slate-500">No staff accounts registered yet.</td></tr>
              ) : staffUsers.map((staff) => (
                <tr key={staff.id} className="border-t border-slate-100 ">
                  <td className="px-3 py-2 font-bold">{staff.name}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-indigo-700 ">{staff.staffLoginId || 'Not generated'}</td>
                  <td className="px-3 py-2">{staffRoleLabels[(staff.roles?.find((role) => role !== 'admin' && role !== 'customer') as Exclude<RoleCode, 'admin' | 'customer'>) || 'inventory_manager']}</td>
                  <td className="px-3 py-2">{staff.isActive === false ? 'Inactive' : 'Active'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleEditStaff(staff)} className="inline-flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-[10px] font-semibold uppercase text-indigo-700 hover:bg-indigo-50   ">
                        <Edit3 className="h-3 w-3" />
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDeleteStaff(staff)} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-[10px] font-semibold uppercase text-rose-700 hover:bg-rose-50   ">
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={sectionClass}>
        <SectionTitle icon={Wallet} title="Online UPI Payment Configurations" />
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <Field label="Merchant UPI ID">
            <input className={inputClass} value={details.upiId || ''} onChange={(e) => updateDetail('upiId', e.target.value.trim())} />
          </Field>
          <div className="flex items-center gap-4 rounded-xl border border-slate-900 p-4 ">
            <img src={qrPreviewUrl} alt="UPI QR preview" className="h-28 w-28 rounded-lg border bg-white p-2" />
            <div>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-700">Auto-generated live preview</span>
              <p className="mt-2 font-serif text-lg font-semibold">Dynamic QR Code Working</p>
              <p className="text-xs text-slate-500">Scan this sample QR to test routing to {details.upiId || 'svayiro.essentials@upi'} with a test value of ₹100.00.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <SectionTitle icon={Package} title="Carrier Smart Bags & Packaging Configurations" />
        <p className="mb-4 text-xs text-slate-500">Configure dynamic pricing and maximum carrying capacity in grams. Checkout uses these thresholds to allocate packaging by order weight.</p>
        <div className="space-y-3">
          {bags.map((bag, index) => (
            <div key={bag.id || index} className="grid gap-3 rounded-xl border border-slate-200 p-3  md:grid-cols-[1.2fr_1fr_1fr_auto]">
              <Field label="Bag Label / Size Name">
                <input className={inputClass} value={bag.size} onChange={(e) => setBags((prev) => prev.map((item, i) => i === index ? { ...item, size: e.target.value } : item))} />
              </Field>
              <Field label="Max Capacity (Grams)">
                <input className={inputClass} type="number" min={1} value={bag.capacityGrams} onChange={(e) => setBags((prev) => prev.map((item, i) => i === index ? { ...item, capacityGrams: Number(e.target.value) } : item))} />
              </Field>
              <Field label="Bag Price (₹ INR)">
                <input className={inputClass} type="number" min={0} value={bag.price} onChange={(e) => setBags((prev) => prev.map((item, i) => i === index ? { ...item, price: Number(e.target.value) } : item))} />
              </Field>
              <button type="button" title="Delete bag" onClick={() => setBags((prev) => prev.filter((_, i) => i !== index))} className="self-end rounded-lg border border-rose-100 p-2 text-rose-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-col gap-3 md:flex-row">
          <button type="button" onClick={() => setBags((prev) => [...prev, { id: `bag_${Date.now()}`, size: 'New Carrier Bag', capacityGrams: 1000, price: 0, isEnabled: true, position: prev.length }])} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-indigo-400 px-4 py-3 text-xs font-semibold text-indigo-700 ">
            <Plus className="h-4 w-4" />
            Add New Carrier Bag Type
          </button>
          <button type="button" onClick={handleSaveBags} disabled={savingBags} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-800 px-4 py-3 text-xs font-semibold uppercase text-white disabled:opacity-60">
            <CreditCard className="h-4 w-4" />
            {savingBags ? 'Saving...' : 'Save Smart Bag Pricing'}
          </button>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, accent = 'indigo' }: { icon: any; title: string; accent?: 'indigo' | 'emerald' }) {
  const color = accent === 'emerald' ? 'text-emerald-700 border-emerald-700 ' : 'text-indigo-700 border-indigo-700 ';
  return (
    <div className={`mb-4 flex items-center gap-2 border-b pb-2 text-xs font-semibold uppercase ${color}`}>
      <Icon className="h-4 w-4" />
      {title}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function PhoneField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input className={inputClass} inputMode="numeric" maxLength={16} value={value || ''} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} />
    </Field>
  );
}

function Toggle({
  label,
  checked,
  checkedLabel = 'On',
  uncheckedLabel = 'Off',
  onChange
}: {
  label: string;
  checked: boolean;
  checkedLabel?: string;
  uncheckedLabel?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <span className="text-sm font-semibold">{label}</span>
        <p className={`text-[11px] font-bold ${checked ? 'text-emerald-600 ' : 'text-rose-600 '}`}>
          Current: {checked ? checkedLabel : uncheckedLabel}
        </p>
      </div>
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-semibold  ">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-md px-3 py-1.5 transition-colors duration-75 ease-out ${checked ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 '}`}
          aria-pressed={checked}
        >
          {checkedLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-md px-3 py-1.5 transition-colors duration-75 ease-out ${!checked ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 '}`}
          aria-pressed={!checked}
        >
          {uncheckedLabel}
        </button>
      </div>
    </div>
  );
}
