import React from 'react';
import { 
  ShoppingBag, Minus, Plus, Trash2, ArrowRight, MapPin, Loader2, AlertCircle, Building, Check 
} from 'lucide-react';
import { CustomerTab, Product, Coupon, CheckoutBagInfo, ShopProfile } from '../../types';

const productImageFallback = 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=600';

interface CartViewProps {
  cart: { productId: string; quantity: number }[];
  products: Product[];
  totals: {
    productTotal: number;
    totalWeightGrams: number;
    itemsList: { product: Product; quantity: number }[];
    computedBags: CheckoutBagInfo[];
    bagCost: number;
    deliveryCost: number;
    discount: number;
    loyaltyDiscount?: number;
    finalTotal: number;
    deliveryDistanceKm: number;
  };
  updateCartQty: (pId: string, qty: number) => void;
  removeFromCart: (pId: string) => void;
  clearCart: () => void;
  setActiveTab: (tab: CustomerTab) => void;
  bagOption: 'own' | 'need';
  setBagOption: (option: 'own' | 'need') => void;
  appliedCoupon: Coupon | null;
  isShopClosed: boolean;
  activeUser: any;
  setIsAuthOpen: (open: boolean) => void;
  setIsCheckoutOpen: (open: boolean) => void;
  isDarkMode: boolean;
  shop: ShopProfile;
  deliveryMethod: 'pickup' | 'delivery';
  setDeliveryMethod: (method: 'pickup' | 'delivery') => void;
  selectedAddressIndex: number;
  setSelectedAddressIndex: (index: number) => void;
  selectedShopBranchId: string;
  setSelectedShopBranchId: (id: string) => void;
  isCalculatingDistance: boolean;
  googleMapsDistanceText: string;
  googleMapsDurationText: string;
  suggestedCoupons?: Coupon[];
  onUseCoupon?: (code: string) => void;
  loyaltySummary?: {
    points: number;
    totalSpend: number;
    totalOrders: number;
    redeemBlockPoints?: number;
    redeemBlockValue?: number;
    earnRateAmount?: number;
  };
  loyaltyRedeemPoints?: number;
  setLoyaltyRedeemPoints?: (points: number) => void;
}

export default function CartView({
  cart,
  products,
  totals,
  updateCartQty,
  removeFromCart,
  clearCart,
  setActiveTab,
  bagOption,
  setBagOption,
  appliedCoupon,
  isShopClosed,
  activeUser,
  setIsAuthOpen,
  setIsCheckoutOpen,
  isDarkMode,
  shop,
  deliveryMethod,
  setDeliveryMethod,
  selectedAddressIndex,
  setSelectedAddressIndex,
  selectedShopBranchId,
  setSelectedShopBranchId,
  isCalculatingDistance,
  googleMapsDistanceText,
  googleMapsDurationText,
  suggestedCoupons = [],
  onUseCoupon,
  loyaltySummary,
  loyaltyRedeemPoints = 0,
  setLoyaltyRedeemPoints
}: CartViewProps) {
  const selectedAddress = (activeUser && activeUser.savedAddresses && activeUser.savedAddresses.length > 0)
    ? activeUser.savedAddresses[selectedAddressIndex]
    : null;

  const isOutOfRange = deliveryMethod === 'delivery' && !!selectedAddress && (totals.deliveryDistanceKm ?? 0) > (shop.deliveryRadius || 10);
  const redeemBlockPoints = loyaltySummary?.redeemBlockPoints || 10;
  const redeemBlockValue = loyaltySummary?.redeemBlockValue || 20;
  const maxRedeemBlocks = Math.floor((loyaltySummary?.points || 0) / redeemBlockPoints);
  const activeRedeemBlocks = Math.floor(loyaltyRedeemPoints / redeemBlockPoints);

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl font-black text-left">Shopping Bag Summary</h2>
      
      {cart.length === 0 ? (
        <div className={`p-12 text-center rounded-2xl border ${isDarkMode ? 'border-[#1e293b] bg-[#1e293b]/20' : 'border-slate-200 bg-slate-50'}`}>
          <ShoppingBag className="h-12 w-12 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-bold opacity-75">Your shopping bag is empty</p>
          <p className="text-xs opacity-60 mt-1">Pick freshly processed flours and daily consumables to fill your pantry bag!</p>
          <button onClick={() => setActiveTab('home')} className="mt-4 bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-full">Explore Ingredients</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Cart items list */}
          <div className="lg:col-span-2 space-y-4">
            {totals.itemsList.map(({ product, quantity }) => (
              <div 
                key={product.id}
                className={`flex gap-4 p-4 border rounded-2xl relative ${isDarkMode ? 'border-[#1e293b] bg-[#1e293b]/20' : 'border-slate-200 bg-white'}`}
              >
                <img src={product.images?.[0] || productImageFallback} alt={product.name} className="w-20 h-20 rounded-xl object-cover" referrerPolicy="no-referrer" />
                <div className="flex-1 space-y-1.5 min-w-0 text-left">
                  <h4 className="font-bold text-sm tracking-tight truncate pr-8">{product.name}</h4>
                  <p className="text-xs opacity-70">Price: ₹{product.offerPrice > 0 ? product.offerPrice : product.basePrice} | Weight: {product.weight / 1000} kg</p>
                  
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1 border border-slate-300 dark:border-slate-700 rounded-full py-0.5 px-2 bg-slate-50 dark:bg-slate-900">
                      <button onClick={() => updateCartQty(product.id, quantity - 1)} className="p-1"><Minus className="h-3 w-3" /></button>
                      <span className="text-xs font-bold w-4 text-center">{quantity}</span>
                      <button onClick={() => updateCartQty(product.id, quantity + 1)} className="p-1"><Plus className="h-3 w-3" /></button>
                    </div>

                    <button onClick={() => removeFromCart(product.id)} className="text-xs text-rose-500 font-bold hover:underline">
                      Remove
                    </button>
                  </div>
                </div>

                <div className="text-right flex flex-col justify-between">
                  <span className="font-extrabold text-sm text-indigo-600 dark:text-indigo-400">
                    ₹{(product.offerPrice > 0 ? product.offerPrice : product.basePrice) * quantity}
                  </span>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <button onClick={clearCart} className="text-xs text-rose-500 font-bold hover:underline flex items-center gap-1">
                <Trash2 className="h-3.5 w-3.5" />
                <span>Empty Bag</span>
              </button>
              <button onClick={() => setActiveTab('home')} className="text-xs text-indigo-500 font-bold hover:underline">
                + Add more items
              </button>
            </div>
          </div>

          {/* Bill Summary and smart bag estimates */}
          <div className={`p-6 border rounded-2xl h-fit space-y-5 text-left ${isDarkMode ? 'border-[#1e293b] bg-[#1e293b]/40' : 'border-slate-200 bg-slate-50'}`}>
            <h3 className="font-bold text-lg font-serif">Bill Summary</h3>

            {activeUser && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs dark:border-indigo-900 dark:bg-indigo-950/20">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-black uppercase text-indigo-700 dark:text-indigo-300">Savings Points</span>
                  <span className="font-mono text-lg font-black text-indigo-700 dark:text-indigo-300">{loyaltySummary?.points || 0}</span>
                </div>
                <p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Earn 1 point for every Rs {(loyaltySummary?.earnRateAmount || 200).toLocaleString('en-IN')} purchase.
                </p>
                {maxRedeemBlocks > 0 ? (
                  <div className="mt-3 rounded-lg bg-white p-2 dark:bg-slate-950">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase text-slate-500">Redeem</span>
                      <span className="text-[10px] font-bold text-emerald-600">
                        {redeemBlockPoints} pts = Rs {redeemBlockValue}
                      </span>
                    </div>
                    <select
                      id="cart_loyalty_redeem"
                      name="cart_loyalty_redeem"
                      className="mt-1 w-full rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-2 text-xs font-bold text-indigo-900 outline-none dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
                      value={activeRedeemBlocks}
                      onChange={(event) => setLoyaltyRedeemPoints?.(Number(event.target.value) * redeemBlockPoints)}
                    >
                      <option value={0}>Do not redeem now</option>
                      {Array.from({ length: maxRedeemBlocks }).map((_, index) => {
                        const blocks = index + 1;
                        return (
                          <option key={blocks} value={blocks}>
                            {blocks * redeemBlockPoints} points for Rs {blocks * redeemBlockValue} off
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ) : (
                  <p className="mt-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    Collect {redeemBlockPoints} points to redeem Rs {redeemBlockValue} on a future bill.
                  </p>
                )}
              </div>
            )}

            {suggestedCoupons.length > 0 && (
              <div className="space-y-2 rounded-xl border border-emerald-100 bg-white p-3 dark:border-emerald-900 dark:bg-slate-950">
                <p className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">Available Offers</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedCoupons.slice(0, 3).map((coupon) => (
                    <button
                      key={coupon.id || coupon.code}
                      type="button"
                      onClick={() => onUseCoupon?.(coupon.code)}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                    >
                      Apply {coupon.code}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* FULFILLMENT MODE CHOICE */}
            <div className="space-y-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
              <span className="text-xs font-bold leading-none text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                🚚 Choose Fulfillment Method
              </span>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeliveryMethod('delivery')}
                  className={`flex flex-col items-center justify-center p-3 border rounded-xl transition-all gap-1 text-center ${
                    deliveryMethod === 'delivery'
                      ? 'border-indigo-600 bg-indigo-50/25 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-bold'
                      : 'border-slate-150 bg-slate-50/20 dark:bg-slate-900/10 text-slate-600 dark:text-slate-400 opacity-80'
                  }`}
                >
                  <MapPin className="h-4.5 w-4.5" />
                  <span className="text-[11px] font-bold">Doorstep Delivery</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeliveryMethod('pickup')}
                  className={`flex flex-col items-center justify-center p-3 border rounded-xl transition-all gap-1 text-center ${
                    deliveryMethod === 'pickup'
                      ? 'border-indigo-600 bg-indigo-50/25 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-bold'
                      : 'border-slate-150 bg-slate-50/20 dark:bg-slate-900/10 text-slate-600 dark:text-slate-400 opacity-80'
                  }`}
                >
                  <Building className="h-4.5 w-4.5" />
                  <span className="text-[11px] font-bold">Store Self-Pickup</span>
                </button>
              </div>

              {/* DETAILS FOR DELIVERY */}
              {deliveryMethod === 'delivery' && (
                <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-850">
                  {activeUser ? (
                    activeUser.savedAddresses && activeUser.savedAddresses.length > 0 ? (
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase opacity-80">
                          Deliver To Address:
                        </label>
                        <select
                          id="cart_delivery_address"
                          name="cart_delivery_address"
                          value={selectedAddressIndex}
                          onChange={(e) => setSelectedAddressIndex(Number(e.target.value))}
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500"
                        >
                          {activeUser.savedAddresses.map((addr: any, index: number) => (
                            <option key={addr.id || index} value={index}>
                              {addr.label} ({addr.flatAndHouse}, {addr.pincode})
                            </option>
                          ))}
                        </select>

                        {/* LIVE DISTANCE CALCULATION SUMMARY */}
                        <div className="p-3 rounded-lg bg-indigo-50/20 dark:bg-indigo-950/10 border border-indigo-100/50 dark:border-indigo-950/30 space-y-1">
                          {isCalculatingDistance ? (
                            <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-bold">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Calculating real-time distance...</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex justify-between items-center">
                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Google Maps Route:</span>
                                <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">
                                  {googleMapsDistanceText || `${totals.deliveryDistanceKm?.toFixed(1)} km`}
                                </span>
                              </div>
                              {googleMapsDurationText && (
                                <p className="text-[10px] opacity-70">Estimated travel time: {googleMapsDurationText}</p>
                              )}
                              
                              {/* Range constraint check */}
                              {isOutOfRange ? (
                                <div className="flex gap-1.5 mt-1.5 p-1.5 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded border border-rose-100 dark:border-rose-950/40 text-[10px] font-semibold leading-normal">
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                  <span>Out of Delivery Range! Maximum allowed delivery radius is {shop.deliveryRadius || 10} km. Please select another address or choose self-pickup.</span>
                                </div>
                              ) : (
                                <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 mt-1">
                                  <Check className="h-3 w-3" /> Within delivery range ({shop.deliveryRadius || 10} km limit)
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 text-center bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/50 rounded-xl space-y-2">
                        <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">⚠️ No saved delivery addresses found.</p>
                        <button
                          type="button"
                          onClick={() => setActiveTab('profile')}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-bold transition-colors"
                        >
                          Add Address in Profile
                        </button>
                      </div>
                    )
                  ) : (
                    <div className="p-3 text-center bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                      <p className="text-[10px] opacity-80 font-semibold">Please log in to register/select your delivery address and see maps distance charges.</p>
                      <button
                        type="button"
                        onClick={() => setIsAuthOpen(true)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-bold transition-colors shadow-sm"
                      >
                        🔐 Log In / Sign Up
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* DETAILS FOR SELF PICKUP */}
              {deliveryMethod === 'pickup' && (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-850">
                  {shop.addresses && shop.addresses.length > 0 ? (
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold uppercase opacity-80">
                        Select SVAYIRO Branch Location:
                      </label>
                      <select
                        id="cart_pickup_branch"
                        name="cart_pickup_branch"
                        value={selectedShopBranchId}
                        onChange={(e) => setSelectedShopBranchId(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500"
                      >
                        {shop.addresses.map((addr) => (
                          <option key={addr.id} value={addr.id}>
                            {addr.branchName} ({addr.cityOrVillage || addr.taluk})
                          </option>
                        ))}
                      </select>

                      {/* Branch Info Details */}
                      {(() => {
                        const activeBranch = shop.addresses.find(b => b.id === selectedShopBranchId) || shop.addresses.find(b => b.isDefault) || shop.addresses[0];
                        if (!activeBranch) return null;
                        return (
                          <div className="p-2.5 bg-emerald-50/10 dark:bg-emerald-950/10 border border-emerald-100/50 dark:border-emerald-950/30 rounded-lg text-[10px] leading-relaxed">
                            <p className="font-bold text-slate-800 dark:text-slate-200">🏠 Store: {activeBranch.flatAndHouse}, {activeBranch.areaAndStreet}</p>
                            <p className="opacity-75">Landmark: {activeBranch.landmark || 'N/A'} | {activeBranch.cityOrVillage}, {activeBranch.pincode}</p>
                            {activeBranch.phone && <p className="font-bold text-slate-600 dark:text-slate-350 mt-0.5">📞 Contact: {activeBranch.phone}</p>}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className="text-[10px] opacity-70">Pickup from our registered corporate address: {shop.address}</p>
                  )}
                </div>
              )}
            </div>

            {/* Smart Packaging Estimation */}
            <div className="space-y-3 bg-indigo-50/50 dark:bg-indigo-950/10 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Smart Bag packing optimizer</span>
                <span className="text-[10px] font-mono opacity-80">{(totals.totalWeightGrams / 1000).toFixed(2)} kg order weight</span>
              </div>

              <div className="space-y-1.5">
                <div className="space-y-2 text-xs">
                  <span className="block font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Do you need carrier bags?</span>
                  <div className="grid grid-cols-2 gap-2 text-[11px] sm:text-xs">
                    <button 
                      type="button"
                      onClick={() => setBagOption('own')}
                      className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 py-3 font-black shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] ${
                        bagOption === 'own'
                          ? 'border-emerald-500 bg-emerald-600 text-white shadow-emerald-600/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
                      }`}
                    >
                      {bagOption === 'own' ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
                      Own bag
                    </button>
                    <button 
                      type="button"
                      onClick={() => setBagOption('need')}
                      className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 py-3 font-black shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] ${
                        bagOption === 'need'
                          ? 'border-indigo-500 bg-indigo-600 text-white shadow-indigo-600/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
                      }`}
                    >
                      {bagOption === 'need' ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
                      Need bags
                    </button>
                  </div>
                </div>

                {bagOption === 'need' && (
                  <div className="space-y-1 pt-1.5 border-t border-slate-200/50 dark:border-slate-800/50">
                    {totals.computedBags.map((bag, i) => (
                      <div key={i} className="flex justify-between text-[10px] opacity-80 font-mono">
                        <span>+ {bag.count}x {bag.size}</span>
                        <span>₹{bag.cost}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Calculations */}
            <div className="space-y-2 text-sm border-t border-slate-200 dark:border-slate-800 pt-4">
              <div className="flex justify-between">
                <span className="opacity-75">Items Net Subtotal</span>
                <span>₹{totals.productTotal}</span>
              </div>
              {bagOption === 'need' && (
                <div className="flex justify-between text-xs">
                  <span className="opacity-75">Configured Smart Bags Cost</span>
                  <span>₹{totals.bagCost}</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="opacity-75">Delivery Charge</span>
                <span>{deliveryMethod === 'pickup' ? '₹0 (Self-Pickup)' : (totals.deliveryCost === 0 ? 'FREE' : `₹${totals.deliveryCost}`)}</span>
              </div>
              {appliedCoupon && (
                <div className="flex justify-between text-xs text-emerald-600">
                  <span>Discount ({appliedCoupon.code})</span>
                  <span>-₹{totals.discount}</span>
                </div>
              )}
              {(totals.loyaltyDiscount || 0) > 0 && (
                <div className="flex justify-between text-xs text-indigo-600">
                  <span>Savings Points redemption</span>
                  <span>-Rs {totals.loyaltyDiscount}</span>
                </div>
              )}

              <div className="flex justify-between font-black text-base border-t border-dashed border-slate-300 dark:border-slate-700 pt-3">
                <span>Store Checkout Total</span>
                <span className="text-indigo-600 dark:text-indigo-400">₹{totals.finalTotal}</span>
              </div>
            </div>

            {/* Checkout buttons */}
            {isShopClosed ? (
              <button 
                disabled
                className="w-full py-3 rounded-full text-center text-xs font-bold bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed"
              >
                Store is Closed
              </button>
            ) : (
              <button 
                disabled={isOutOfRange}
                onClick={() => {
                  if (!activeUser) {
                    setIsAuthOpen(true);
                  } else {
                    setIsCheckoutOpen(true);
                  }
                }}
                className={`w-full py-3 rounded-full text-xs font-bold shadow text-center flex items-center justify-center gap-1.5 ${
                  isOutOfRange 
                    ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                <span>Proceed To Secure Checkout</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
