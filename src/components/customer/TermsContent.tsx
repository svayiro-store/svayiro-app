import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { ShopProfile } from '../../types';

interface TermsContentProps {
  shop: ShopProfile;
  isDarkMode?: boolean;
  compact?: boolean;
}

const sectionClass = 'rounded-xl border border-slate-200 bg-white/70 p-3  ';

export default function TermsContent({ shop, compact = false }: TermsContentProps) {
  const shopName = shop.name || 'SVAYIRO';
  const supportPhone = shop.contactNumber || shop.supportPhoneNumber || '+91 98765 43210';
  const supportEmail = shop.email || 'support@svayiro.com';
  const shopAddress = shop.address || 'the registered store address';

  const terms = [
    {
      title: '1. Acceptance of Terms',
      body: `By using ${shopName}, creating an account, placing an order, making a payment, submitting a review, using coupons, or requesting support, you agree to these Terms & Conditions. If you do not agree, you should not use the customer app or place orders through this service.`
    },
    {
      title: '2. Customer Account and Registration',
      body: 'Customers must provide accurate name, mobile number, email address, date of birth, and delivery information. Phone number and verified email are treated as identity details and may be locked from editing after verification. One phone number must represent one customer account. You are responsible for keeping your password and device access secure.'
    },
    {
      title: '3. Date of Birth, Birthday Offers, and Abuse Prevention',
      body: 'Date of birth is collected to provide birthday greetings and eligible birthday coupons. Customers must enter the correct date of birth during registration. Birthday offers are account-specific, valid only on the eligible birthday period configured by the store, and cannot be transferred, sold, or used by another customer. Misuse, duplicate accounts, false birthday details, or repeated attempts to claim benefits may lead to coupon cancellation or account restriction.'
    },
    {
      title: '4. Products, Pricing, Stock, and Availability',
      body: 'Product prices, offer prices, descriptions, images, weights, and stock availability are maintained by the store admin and may change without prior notice. Orders are accepted subject to actual stock availability. If an item is unavailable, the store may contact you for replacement, partial fulfilment, refund adjustment, or cancellation.'
    },
    {
      title: '5. Order Placement and Confirmation',
      body: 'An order is created only after the checkout flow is completed with the required customer details, valid mobile number, selected fulfilment method, and applicable payment information. Online payments are confirmed only after gateway verification. COD payments may be collected as cash or through a delivery-side QR shown by the owner or delivery partner.'
    },
    {
      title: '6. UPI, COD, and Payment Verification',
      body: 'Online payments are processed on Cashfree’s hosted checkout. We do not ask customers to enter a UTR, card number, CVV, PIN, or bank-login details on SVAYIRO. An order is confirmed only after Cashfree reports a successful payment to our server. Failed, cancelled, or incomplete payments do not create a confirmed order. COD and self-pickup payment status can be marked paid only by authorized staff after collection.'
    },
    {
      title: '7. Delivery, Distance, Slots, and Self-Pickup',
      body: `Home delivery is available only within the store's configured delivery area and selected delivery slots. Distance, delivery charge, free delivery limit, base charge, and per-kilometre charge are calculated from the address and shop settings configured by the admin. Delivery timing is an estimate and can be affected by stock preparation, traffic, weather, holidays, or operational issues. Self-pickup orders must be collected from ${shopAddress} during the selected pickup/store timing.`
    },
    {
      title: '8. Smart Bags and Packaging',
      body: 'Bag allocation and packaging charges are calculated using the store-configured bag capacity and pricing. The system attempts to choose suitable bag capacity based on order weight, but final packing may be adjusted by staff for product safety, hygiene, and handling.'
    },
    {
      title: '9. Cancellations, Returns, and Replacements',
      body: 'Cancellation may be available before packing, dispatch, or completion depending on order status. Perishable, custom-packed, milled, opened, or used products may not be returnable unless damaged, incorrect, expired, or quality-defective. Customers must report damaged or wrong products within 24 hours of delivery/pickup with clear details. Approved claims may be resolved through replacement, store credit, refund adjustment, or other store-approved resolution.'
    },
    {
      title: '10. Coupons, Savings Points, Referrals, and Rewards',
      body: 'Coupons, savings points, referral rewards, birthday coupons, leaderboard benefits, and promotional offers are controlled by the store owner. They may have minimum order value, payment method restrictions, expiry, usage limit, customer eligibility, and anti-abuse conditions. Referral benefits are unlocked only when the referred customer completes an eligible paid order as configured by the store. Rewards cannot be exchanged for cash unless explicitly stated by the owner.'
    },
    {
      title: '11. Reviews, Feedback, Complaints, and Support Tickets',
      body: 'Customers may submit product reviews, feedback, complaints, and FAQ questions. Reviews and tickets must be genuine, relevant, and respectful. The store may moderate, hide, or remove abusive, misleading, spam, duplicate, or irrelevant submissions. Support responses depend on store working hours and operational capacity.'
    },
    {
      title: '12. Notifications and WhatsApp Updates',
      body: 'The app may show in-app alerts, order updates, shop notices, holiday messages, fresh stock alerts, birthday notices, and payment/order status changes. WhatsApp or SMS updates may be sent only when the store has configured the required provider credentials and the customer has provided a reachable mobile number.'
    },
    {
      title: '13. Privacy and Data Use',
      body: 'The store uses customer data to manage login, orders, delivery addresses, payment verification, support, coupons, rewards, complaints, and service communication. Online payment details are collected and processed by Cashfree on its hosted checkout; SVAYIRO receives only the payment result and gateway reference needed for reconciliation. Personal information is not intended to be sold to third-party advertisers. Location coordinates, address details, phone number, and order history must be handled carefully by the store and authorized staff.'
    },
    {
      title: '14. Account Deletion',
      body: 'Customers may request/delete their account from the profile settings where available. Account deletion is intended to remove customer-related profile data and connected customer records according to the app design. Some transaction records may still be retained if required for legal, tax, audit, payment, fraud prevention, or business compliance purposes.'
    },
    {
      title: '15. Staff, Admin, and Access Control',
      body: 'Admin, inventory manager, delivery partner, and customer care access must be created and managed by the owner. Staff must use only the access granted to them. Unauthorized access, sharing staff credentials, modifying orders without reason, or exposing customer data is prohibited.'
    },
    {
      title: '16. Limitation of Liability',
      body: `${shopName} aims to provide accurate product, order, delivery, and payment information, but the service may be affected by network issues, device problems, payment gateway limitations, incorrect customer input, map accuracy, stock mismatch, or operational delays. The store is not liable for indirect losses arising from such issues beyond the value of the affected order where legally applicable.`
    },
    {
      title: '17. Changes to Terms',
      body: 'The store may update these Terms & Conditions as the business, app features, policies, laws, payment methods, or delivery process changes. Continued use of the service after updates means you accept the latest terms shown in the customer profile and footer.'
    },
    {
      title: '18. Contact',
      body: `For support, complaints, payment questions, order issues, or policy clarification, contact ${shopName} at ${supportPhone} or ${supportEmail}.`
    }
  ];

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex items-start gap-3 border-b border-slate-200 pb-3 ">
        <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600  ">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-serif text-lg font-semibold text-slate-900 ">Terms & Conditions</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 ">
            These terms apply to orders, payments, delivery, pickup, rewards, account use, and support on {shopName}.
          </p>
        </div>
      </div>

      <div className={compact ? 'max-h-[420px] space-y-3 overflow-y-auto pr-1' : 'space-y-3'}>
        {terms.map((term) => (
          <section key={term.title} className={sectionClass}>
            <h4 className="text-xs font-semibold text-slate-900 ">{term.title}</h4>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600 ">{term.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
