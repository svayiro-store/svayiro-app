import React from 'react';
import { Bell, BookOpen, CheckCircle, CreditCard, Gift, Image, Package, Settings, ShieldCheck, ShoppingBag, Star, Ticket, Truck, Users } from 'lucide-react';

interface Props {
  roles: string[];
  isDarkMode: boolean;
}

type ManualSection = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  roles: string[];
  allowedAccess: string[];
  dailyFlow: string[];
  restrictions: string[];
  detailedWorkflows?: {
    title: string;
    icon: React.ElementType;
    steps: string[];
    notes?: string[];
  }[];
};

const roleLabels: Record<string, string> = {
  admin: 'Owner / Admin',
  inventory_manager: 'Inventory Manager',
  delivery_partner: 'Delivery Partner',
  customer_care: 'Customer Care'
};

const sections: ManualSection[] = [
  {
    id: 'admin',
    title: 'Owner / Admin Manual',
    subtitle: 'Full control of store operations, staff, payments, settings, and reports.',
    icon: ShieldCheck,
    roles: ['admin'],
    allowedAccess: [
      'Dashboard, sales reports, low-stock reports, referral performance, and birthday alerts.',
      'POS billing, products, categories, orders, coupons, banners, alerts, complaints, and reviews.',
      'Store settings, staff registration, UPI settings, delivery slots, smart bag pricing, and shop status.'
    ],
    dailyFlow: [
      'Start the day by checking pending payments, invoice queue, low stock, and customer alerts.',
      'Verify UPI/COD submitted references in your bank or UPI app before marking an order as paid.',
      'Create staff console IDs by selecting role, entering staff name, assigning password, and setting account status.',
      'Archive invoices only to keep the admin list clean; sales reports and customer order history remain preserved.'
    ],
    restrictions: [
      'Do not share the owner login phone or password with staff. Staff must use their owner-created console ID.',
      'Keep WhatsApp Business and UPI credentials private.',
      'Only owner should create coupons, change pricing rules, and delete/archive admin records.',
      'Owner and worker console accounts are not customer shopping accounts. Use a separate customer account to shop.'
    ],
    detailedWorkflows: [
      {
        title: 'Create Normal Public Coupon',
        icon: Gift,
        steps: [
          'Open Offers Coupons, then click New Coupon.',
          'Enter a clear coupon code such as SAVE20, WEEKEND50, or FIRSTORDER.',
          'Set Coupon Purpose as Normal public coupon.',
          'Choose Discount Type: Flat for fixed rupee discount, or Percentage for percent discount.',
          'Enter Discount Value. Example: Flat 50 means Rs 50 off; Percentage 10 means 10% off.',
          'Set Min Order Value so the coupon does not create loss. Example: Rs 500 minimum for Rs 50 off.',
          'Set Expiry Date if this is a limited offer. Leave Usage Limit empty only for long-running public offers.',
          'Click Create Coupon. Customers can use this code during checkout if it is active, not expired, and minimum order is met.'
        ],
        notes: [
          'Use normal coupons for public campaigns, festival sales, first-order discounts, and daily promotions.',
          'Avoid high percentage coupons without a minimum order value.'
        ]
      },
      {
        title: 'Create Birthday Coupon',
        icon: Gift,
        steps: [
          'Open Offers Coupons and click New Coupon.',
          'Use a simple code such as BDAY, BIRTHDAY, or BDAYGIFT.',
          'Set Coupon Purpose as Birthday coupon - account birthday only.',
          'Choose Flat or Percentage discount and enter the value.',
          'Set Min Order Value. This is important because customers must meet the minimum order to redeem the birthday gift.',
          'Set Usage Limit if needed. The backend restricts birthday use to the matching customer birthday account.',
          'Click Create Coupon. On the customer birthday date, the customer app shows the birthday gift bubble and coupon.'
        ],
        notes: [
          'Customer date of birth is locked after registration to reduce misuse.',
          'The birthday coupon should not be advertised as a normal public coupon.'
        ]
      },
      {
        title: 'Create Refer & Win Coupon',
        icon: Users,
        steps: [
          'Open Offers Coupons and click New Coupon.',
          'Set Coupon Purpose as Refer & Win - qualified referrers only.',
          'Enter a code that clearly belongs to referral rewards, for example REFER5 or REFERWIN.',
          'Set a controlled discount and minimum order value.',
          'Create the coupon. Referral rewards unlock only after the referred customer completes a qualifying order of Rs 100 or more.',
          'Check Dashboard referral performance before issuing large referral campaigns.'
        ],
        notes: [
          'Only successful purchases should count for referral rewards.',
          'Keep referral discounts modest so the owner does not lose margin.'
        ]
      },
      {
        title: 'Create Referral Leaderboard Coupon',
        icon: Star,
        steps: [
          'Open Offers Coupons and click New Coupon.',
          'Set Coupon Purpose as Referral leaderboard coupon.',
          'Use a code like TOPREF1, TOPREF2, or YEARWINNER.',
          'Set discount based on the year-end leaderboard position.',
          'Use Usage Limit to control redemption. For a winner-specific coupon, keep usage small.',
          'After creating it, share or assign the coupon only to eligible leaderboard customers.'
        ],
        notes: [
          'Leaderboard coupons are owner-issued rewards, not automatic public coupons.',
          'Verify the leaderboard before giving high-value rewards.'
        ]
      },
      {
        title: 'Publish Alert Bulletins',
        icon: Bell,
        steps: [
          'Open Alert Bulletins.',
          'Enter a short title that customers can understand immediately.',
          'Select bulletin type: Announcement, Offer, Order, or Holiday.',
          'Write the message clearly. Example: Fresh vegetables available today, shop closed for holiday, or delivery delayed due to rain.',
          'Click Publish. The message appears in the customer notification area.',
          'To change a bulletin, click Edit, update title/type/message, then click Update.',
          'To remove an old bulletin, click Delete. Deleted bulletins should not appear to customers.'
        ],
        notes: [
          'Use Offer for sale messages, Holiday for closed/holiday notices, Announcement for general shop updates, and Order only for order-related customer notices.',
          'Do not publish complaints, private feedback, or customer-specific issues as public bulletins.'
        ]
      },
      {
        title: 'Store Settings And Staff Accounts',
        icon: Settings,
        steps: [
          'Open Store Settings to manage shop branding, logo, helplines, branches, delivery slots, UPI ID, smart bags, and staff accounts.',
          'For staff, select role first, enter staff name, set password, choose Active or Inactive, then save.',
          'The system generates the staff login ID based on role, such as INV-0001, DEL-0001, or CARE-0001.',
          'Give the staff member only their generated ID and password.',
          'If a staff member forgets password, owner edits the account and sets a new password. Staff cannot reset it themselves.',
          'Deactivate staff instead of deleting when you want to temporarily block access.'
        ],
        notes: [
          'Admin/owner is not treated as staff.',
          'Worker console IDs are separate from customer accounts.'
        ]
      },
      {
        title: 'Orders, Payment Verification, And Invoice Handling',
        icon: ShoppingBag,
        steps: [
          'Open Invoice & Orders to review online orders, pickup orders, delivery orders, payment state, and invoice queue.',
          'For UPI orders, treat submitted UTR/reference as proof submitted, not proof paid.',
          'Verify payment in bank/UPI app before marking payment as paid or accepting the order.',
          'Use invoice queue to prioritize orders by selected delivery/pickup slot.',
          'Archive invoices only for admin list cleanliness. Sales reports and customer history should remain preserved by backend records.',
          'Use resend invoice only when WhatsApp Business API is configured.'
        ],
        notes: [
          'Never accept UPI order only because the customer typed a reference number.',
          'For COD QR collection, delivery partner submits reference; owner verifies final paid status.'
        ]
      }
    ]
  },
  {
    id: 'inventory_manager',
    title: 'Inventory Manager Manual',
    subtitle: 'Manage products, categories, stock, smart bags, and walk-in billing.',
    icon: Package,
    roles: ['inventory_manager'],
    allowedAccess: [
      'Walk-In Billing (POS).',
      'Products Catalogue.',
      'Manage Categories.',
      'Inventory logs and smart bag data needed by POS.'
    ],
    dailyFlow: [
      'Update stock, product price, images, SKU/product code, low-stock threshold, and category mapping.',
      'Use POS for walk-in customers by selecting catalog products, entering quantity, and generating receipt.',
      'Use parallel POS queue when multiple customers are being billed at the counter.',
      'Check inventory log book after stock updates or POS sales.'
    ],
    restrictions: [
      'Custom/unlisted POS items are owner-only.',
      'Manual price override is owner-only.',
      'Inventory manager cannot create coupons, change store settings, verify payments, archive invoices, or switch into the customer storefront from staff login.'
    ],
    detailedWorkflows: [
      {
        title: 'Create Or Update Products',
        icon: Package,
        steps: [
          'Open Products Catalogue.',
          'Select category, enter product name, description, purchase cost, selling price, offer price, weight, stock, and low-stock threshold.',
          'Upload product images. Customer product card uses these images; keep them square and clear.',
          'Save the product. Backend generates SKU/product code if missing.',
          'After stock edits, check Real-Time Warehouse Inventory Log Book in POS to confirm the stock change is recorded.'
        ],
        notes: [
          'Purchase cost is owner/internal data and must not be displayed to customers.',
          'Low-stock warning appears to customers only when stock reaches the product threshold.'
        ]
      },
      {
        title: 'Use POS Billing',
        icon: CreditCard,
        steps: [
          'Open Walk-In Billing POS.',
          'Select catalog product, enter quantity, then click Add Catalog.',
          'Use Parallel Queue when another customer arrives before the current bill is completed.',
          'Enter customer phone before generating invoice.',
          'Select Cash/Card or UPI. If UPI is selected, show the QR for exact payable amount and enter UTR/reference.',
          'Complete and print receipt. Stock is deducted and inventory log is updated.'
        ],
        notes: [
          'Do not use custom item or price override unless owner permission is available.',
          'For barcode scanner future use, scan can map to SKU/product code and auto-add the product.'
        ]
      },
      {
        title: 'Manage Categories',
        icon: Ticket,
        steps: [
          'Open Manage Categories.',
          'Create category with name, image, and ordering position.',
          'Use edit to correct category name/image.',
          'Delete only if the category is no longer needed and products are moved or handled.'
        ],
        notes: [
          'There is no disabled category workflow now. If admin needs a category, keep it; otherwise edit or delete it.'
        ]
      }
    ]
  },
  {
    id: 'delivery_partner',
    title: 'Delivery Partner Manual',
    subtitle: 'Handle delivery order movement and COD collection through cash or fixed-amount UPI QR.',
    icon: Truck,
    roles: ['delivery_partner'],
    allowedAccess: [
      'Invoice & Orders page for delivery workflow.',
      'Delivery orders that are packed, out for delivery, or delivered.',
      'COD cash collection and exact-amount UPI QR collection.'
    ],
    dailyFlow: [
      'Open Invoice & Orders and check delivery orders assigned to the delivery workflow.',
      'Move packed orders to Out for Delivery when leaving the shop.',
      'For COD orders, click Collect COD and ask the customer whether they are paying by cash or QR.',
      'If the customer pays cash, collect the exact cash amount and mark Cash Collected.',
      'If the customer pays by QR, show the exact amount QR, enter the customer payment UTR/reference, and submit it for owner verification.',
      'Mark delivery completed only after cash is collected, QR reference is submitted, or payment is already paid.',
      'After successful delivery, use Send WhatsApp Bill if the customer wants the invoice on WhatsApp.'
    ],
    restrictions: [
      'Delivery partner can mark COD cash as paid only after collecting cash from the customer.',
      'Delivery partner cannot verify QR/UPI payment as paid. Owner must verify the UTR/reference before final paid approval.',
      'Delivery partner cannot access products, settings, coupons, reports, staff management, or customer storefront from staff login.'
    ],
    detailedWorkflows: [
      {
        title: 'Delivery Order Flow',
        icon: Truck,
        steps: [
          'Open Invoice & Orders.',
          'Check orders marked packed or out for delivery.',
          'When leaving shop, update packed order to Out for Delivery.',
          'At customer location, ask COD customer: Cash or QR?',
          'For cash, collect exact cash and tap Cash Collected.',
          'For QR, show exact-amount QR, ask customer to pay, collect UTR/reference, then submit it.',
          'Mark delivered only after the payment condition is satisfied.',
          'After delivery is marked delivered, tap Send WhatsApp Bill to send the invoice to the customer number.'
        ],
        notes: [
          'Customer cannot change the amount in the generated QR easily because QR is created for the bill total.',
          'Owner performs final QR/UPI payment verification. Cash collection is recorded immediately with delivery partner audit data.'
        ]
      }
    ]
  },
  {
    id: 'customer_care',
    title: 'Customer Care Manual',
    subtitle: 'Support customers through orders, complaints, tickets, invoices, and product reviews.',
    icon: Users,
    roles: ['customer_care'],
    allowedAccess: [
      'Invoice & Orders for support reference.',
      'Complaints & Tickets.',
      'Quality Reviews.',
      'WhatsApp invoice resend when WhatsApp Business API is configured.'
    ],
    dailyFlow: [
      'Check new complaints and FAQ questions from customers.',
      'Update complaint status as open, in progress, resolved, or closed.',
      'Review product ratings and reply where needed.',
      'Resend invoices to customers when requested.'
    ],
    restrictions: [
      'Customer care cannot verify payments as paid.',
      'Customer care cannot cancel orders unless owner handles it.',
      'Customer care cannot change prices, inventory, coupons, banners, store settings, or customer storefront from staff login.'
    ],
    detailedWorkflows: [
      {
        title: 'Handle Complaints And FAQ Questions',
        icon: Users,
        steps: [
          'Open Complaints & Tickets.',
          'Read customer name, phone, subject, category, and message.',
          'Update status as open, in progress, resolved, or closed based on action taken.',
          'Write admin answer when the customer asks a question from Help/FAQ.',
          'Keep replies polite, specific, and short enough for customers to understand.'
        ],
        notes: [
          'Do not publish private complaint details as customer notifications.',
          'Escalate refund, cancellation, or payment disputes to owner.'
        ]
      },
      {
        title: 'Manage Quality Reviews',
        icon: Star,
        steps: [
          'Open Quality Reviews.',
          'Sort by rating when checking negative or high-priority reviews.',
          'Review customer name, product name, rating, message, and publish status.',
          'Hide abusive or irrelevant reviews. Keep genuine low-rating feedback for quality improvement.',
          'Reply where needed, especially for product quality, packaging, or delivery complaints.'
        ],
        notes: [
          'Customers can rate without writing a message.',
          'One customer should not create repeated reviews for the same product; edit/update flow should be preferred.'
        ]
      }
    ]
  }
];

export default function UserManualView({ roles, isDarkMode }: Props) {
  const visibleSections = sections.filter((section) => section.roles.some((role) => roles.includes(role)));
  const displayRoles = roles.filter((role) => roleLabels[role]).map((role) => roleLabels[role]).join(', ') || 'Console User';
  const cardClass = `rounded-xl border p-4 shadow-sm ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`;
  const subtleCardClass = `rounded-lg border p-3 ${isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`;

  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-600" />
              <h2 className="font-serif text-2xl font-semibold">Admin Console User Manual</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">This page shows only the operating instructions for your current role.</p>
          </div>
          <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">
            Current access: {displayRoles}
          </div>
        </div>
      </div>

      {visibleSections.map((section) => {
        const Icon = section.icon;
        return (
          <section key={section.id} className={cardClass}>
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-xl bg-indigo-600 p-2 text-white">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{section.title}</h3>
                <p className="text-xs text-slate-500">{section.subtitle}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className={subtleCardClass}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-600">Allowed Access</p>
                <ul className="space-y-2 text-xs font-semibold leading-relaxed">
                  {section.allowedAccess.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={subtleCardClass}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-indigo-600">Daily Operating Flow</p>
                <ol className="space-y-2 text-xs font-semibold leading-relaxed">
                  {section.dailyFlow.map((item, index) => (
                    <li key={item} className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">{index + 1}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className={subtleCardClass}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-rose-600">Important Restrictions</p>
                <ul className="space-y-2 text-xs font-semibold leading-relaxed">
                  {section.restrictions.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {section.detailedWorkflows?.length ? (
              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Detailed Operating Instructions</p>
                  <p className="mt-1 text-xs text-slate-500">Follow these steps exactly for common role tasks.</p>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {section.detailedWorkflows.map((workflow) => {
                    const WorkflowIcon = workflow.icon;
                    return (
                      <div key={workflow.title} className={`rounded-xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-950/70' : 'border-slate-100 bg-slate-50/80'}`}>
                        <div className="mb-3 flex items-start gap-3">
                          <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                            <WorkflowIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold">{workflow.title}</h4>
                            <p className="text-[10px] text-slate-500">Step-by-step workflow</p>
                          </div>
                        </div>
                        <ol className="space-y-2 text-xs font-semibold leading-relaxed">
                          {workflow.steps.map((step, index) => (
                            <li key={step} className="flex gap-2">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-100 dark:bg-slate-900 dark:text-indigo-200 dark:ring-slate-800">
                                {index + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                        {workflow.notes?.length ? (
                          <div className={`mt-4 rounded-lg border p-3 ${isDarkMode ? 'border-amber-900/60 bg-amber-950/20' : 'border-amber-100 bg-amber-50'}`}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-300">Notes</p>
                            <ul className="space-y-1.5 text-[11px] font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                              {workflow.notes.map((note) => (
                                <li key={note} className="flex gap-2">
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                  <span>{note}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}

      {roles.includes('delivery_partner') && (
        <section className={cardClass}>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-semibold">COD Collection Rule</h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Ask the customer whether they are paying by cash or QR. Cash can be marked paid only after collecting the exact amount. QR payments stay submitted until the owner verifies the UTR/reference in the bank or UPI app and marks it paid.
          </p>
        </section>
      )}
    </div>
  );
}
