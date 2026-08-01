import { useEffect, useState } from 'react';
import { api } from '../../../api';
import { ShopProfile, Order, AdvanceRequest, InventoryLog, Review, Bag } from '../../../types';

export function useAdminData(roles: string[] = ['admin']) {
  const isOwner = roles.includes('admin');
  const canUseOrders = isOwner || roles.some((role) => ['inventory_manager', 'delivery_partner', 'customer_care'].includes(role));
  const canUseInventory = isOwner || roles.includes('inventory_manager');
  const canUseReviews = isOwner || roles.includes('customer_care');
  const [reports, setReports] = useState<any>({
    revenue: 0,
    totalOrdersPlaced: 0,
    lowStockCount: 0,
    totalProfit: 0,
    topProducts: [],
    salesTrend: [],
    salesAnalytics: { daily: [], monthly: [], yearly: [] }
  });
  const [reportsLoading, setReportsLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [advRequests, setAdvRequests] = useState<AdvanceRequest[]>([]);
  const [invLogs, setInvLogs] = useState<InventoryLog[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [bags, setBags] = useState<Bag[]>([]);

  const fetchDashboardReports = async () => {
    setReportsLoading(true);
    try {
      const res = await api.getDashboardReports();
      setReports(res);
    } catch (err) {
      console.error(err);
    } finally {
      setReportsLoading(false);
    }
  };

  const fetchOrdersList = async () => {
    try {
      const res = await api.adminOrders({ limit: 100, offset: 0 });
      setOrders(res);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAdvanceRequests = async () => {
    try {
      const res = await api.getAdvanceRequests({ limit: 100, offset: 0 });
      setAdvRequests(res);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchInventoryLogs = async () => {
    try {
      const res = await api.getInventoryLogs({ limit: 100, offset: 0 });
      setInvLogs(res);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchReviews = async () => {
    try {
      const res = await api.getReviews();
      setReviews(res);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBagsList = async () => {
    try {
      const res = await api.getBags();
      setBags(res || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOwner) fetchDashboardReports();
    if (canUseOrders) fetchOrdersList();
    if (isOwner) fetchAdvanceRequests();
    if (canUseInventory) fetchInventoryLogs();
    if (canUseReviews) fetchReviews();
    if (canUseInventory) fetchBagsList();

    let pollCount = 0;
    const poll = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      pollCount += 1;
      if (canUseOrders) fetchOrdersList();
      if (pollCount % 2 === 0) {
        if (canUseReviews) fetchReviews();
        if (isOwner) fetchAdvanceRequests();
      }
    }, 30000);
    return () => clearInterval(poll);
  }, [roles.join('|')]);

  return {
    reports,
    reportsLoading,
    orders,
    advRequests,
    invLogs,
    reviews,
    bags,
    setInventoryLogs: setInvLogs,
    refresh: () => {
      if (isOwner) fetchDashboardReports();
      if (canUseOrders) fetchOrdersList();
      if (isOwner) fetchAdvanceRequests();
      if (canUseInventory) fetchInventoryLogs();
      if (canUseReviews) fetchReviews();
      if (canUseInventory) fetchBagsList();
    }
  };
}
