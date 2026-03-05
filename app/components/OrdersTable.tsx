import { useState, Fragment } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { LifecycleBadge, type LifecycleState } from "./ui/lifecycle-badge";
import { ChevronDown, ChevronUp, ExternalLink, Box, Smartphone } from "lucide-react";
import { Button } from "./ui/button";

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerAddress?: {
    address1: string;
    city: string;
    provinceCode: string;
    zip: string;
  };
  date: string;
  total: string;
  subtotal: string;
  currency: string;
  status: string;
  items: Array<{
    title: string;
    quantity: number;
    price: string;
    sku: string;
  }>;
  metafields: {
    nfc_uid?: string;
    proof_reference?: string;
    warehouse_gps?: string;
    [key: string]: any;
  };
}

interface OrdersTableProps {
  orders: Order[];
  searchQuery: string;
  sortBy: string;
  statusFilter: string;
  onViewDetail?: (order: Order) => void;
}

export default function OrdersTable({ orders, searchQuery, sortBy, statusFilter, onViewDetail }: OrdersTableProps) {
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const toggleExpand = (orderId: string) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  // Filter Logic
  const filteredOrders = (orders || []).filter(order => {
    // Search
    const matchesSearch = 
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) || 
      order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerEmail.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Status Filter
    if (statusFilter === "all") return matchesSearch;
    // Normalized check
    const normalizedStatus = order.status.toLowerCase();
    
    if (statusFilter === "active") return matchesSearch && (normalizedStatus === "pending" || normalizedStatus === "active");
    return matchesSearch && normalizedStatus === statusFilter;
  });

  // Sort Logic
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (sortBy === "new") return new Date(b.date).getTime() - new Date(a.date).getTime();
    if (sortBy === "old") return new Date(a.date).getTime() - new Date(b.date).getTime();
    return 0;
  });

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">ORDER</TableHead>
            <TableHead>CUSTOMER</TableHead>
            <TableHead>DATE</TableHead>
            <TableHead className="text-right">TOTAL</TableHead>
            <TableHead className="w-[150px]">STATUS</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedOrders.length === 0 ? (
             <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                No orders found.
              </TableCell>
            </TableRow>
          ) : (
            sortedOrders.map((order) => {
              const isExpanded = expandedOrders[order.id];
              return (
                <Fragment key={order.id}>
                  <TableRow 
                    key={order.id} 
                    className="cursor-pointer"
                    onClick={() => toggleExpand(order.id)}
                  >
                    <TableCell className="font-medium align-top">{order.orderNumber}</TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col">
                        <span className="font-medium">{order.customerName}</span>
                        <span className="text-muted-foreground text-xs">{order.customerEmail}</span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">{order.date}</TableCell>
                    <TableCell className="text-right align-top">{parseFloat(order.total).toLocaleString('en-US', { style: 'currency', currency: order.currency })}</TableCell>
                    <TableCell className="align-top">
                      <LifecycleBadge state={order.status as LifecycleState} />
                    </TableCell>
                    <TableCell className="align-top">
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                  </TableRow>
                  
                  {/* Expanded Row Content */}
                  {isExpanded && (
                    <TableRow className="hover:bg-transparent bg-muted/30">
                      <TableCell colSpan={6} className="p-0 border-t-0">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-medium">Order Details</h3>
                                <Button variant="outline" size="sm" className="gap-2" onClick={(e) => { e.stopPropagation(); onViewDetail?.(order); }}>
                                    <ExternalLink className="h-4 w-4" />
                                    View Full Record
                                </Button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Left Column: Customer & Products */}
                                <div className="space-y-6">
                                    <div>
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Customer</h4>
                                        <div className="text-sm">
                                            <p className="font-medium">{order.customerName}</p>
                                            <p className="text-muted-foreground">{order.customerEmail}</p>
                                            {order.customerAddress && (
                                                <div className="text-muted-foreground mt-1">
                                                    <p>{order.customerAddress.address1}</p>
                                                    <p>{order.customerAddress.city}, {order.customerAddress.provinceCode} {order.customerAddress.zip}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Products</h4>
                                        <div className="space-y-3">
                                            {order.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between text-sm">
                                                    <div>
                                                        <p className="font-medium">{item.title}</p>
                                                        <p className="text-muted-foreground text-xs">{item.sku} × {item.quantity}</p>
                                                    </div>
                                                    <p className="font-medium">{parseFloat(item.price).toLocaleString('en-US', { style: 'currency', currency: order.currency })}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-4 pt-4 border-t border-border/50">
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-muted-foreground">Subtotal</span>
                                                <span>${order.subtotal}</span>
                                            </div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-muted-foreground">Shipping</span>
                                                <span>Free</span>
                                            </div>
                                            <div className="flex justify-between font-medium mt-2">
                                                <span>Total</span>
                                                <span>{parseFloat(order.total).toLocaleString('en-US', { style: 'currency', currency: order.currency })}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Events & Warehouse */}
                                <div className="space-y-6">
                                    <div>
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Events</h4>
                                        <div className="flex gap-2 mb-4">
                                            {/* Dummy event badges based on status */}
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-border text-xs font-medium text-foreground shadow-sm">
                                                <Box className="h-3 w-3" /> Write
                                            </span>
                                            {order.status === 'verified' && (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-border text-xs font-medium text-foreground shadow-sm">
                                                    <Smartphone className="h-3 w-3" /> Tap
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <p className="text-muted-foreground text-xs mb-1">NFC Tag UID</p>
                                                <p className="font-mono text-xs">{order.metafields.nfc_uid || "—"}</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground text-xs mb-1">Proof ID</p>
                                                <p className="font-mono text-xs">{order.metafields.proof_reference || "—"}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
