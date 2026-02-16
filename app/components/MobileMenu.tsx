import { X, LogOut, Settings, CreditCard } from "lucide-react";
import { NavLink, useNavigate } from "react-router";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { toast } from "../hooks/use-toast";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { title: "Dashboard", url: "/dashboard" },
  { title: "Shipments", url: "/tagged-shipments" },
  { title: "Help", url: "/help" },
  { title: "Settings", url: "/settings" },
];

const dummyUser = {
  name: "Marcus Chen",
  email: "marcus@luminary.co",
  shop: "Luminary Goods",
};

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet Content */}
      <div className="fixed inset-y-0 left-0 w-3/4 max-w-sm bg-card border-r border-border p-6 shadow-xl animate-in slide-in-from-left duration-300">
        <div className="flex items-center justify-between mb-8">
          <span className="text-xl font-serif font-medium tracking-tight">ink.</span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex flex-col space-y-4">
          {navItems.map((item) => (
            <NavLink
              key={item.title}
              to={item.url}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "text-lg font-medium transition-colors hover:text-foreground",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )
              }
            >
              {item.title}
            </NavLink>
          ))}
        </nav>

        <div className="mt-8 pt-8 border-t border-border">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-sm font-medium">
              MC
            </div>
            <div>
              <p className="font-medium text-foreground">{dummyUser.name}</p>
              <p className="text-sm text-muted-foreground">{dummyUser.shop}</p>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => {
                onClose();
                navigate("/settings?tab=account");
              }}
              className="flex items-center gap-3 w-full p-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-md transition-colors"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
            <button
              onClick={() => {
                onClose();
                navigate("/settings?tab=account");
              }}
              className="flex items-center gap-3 w-full p-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-md transition-colors"
            >
              <CreditCard className="h-4 w-4" />
              Billing
            </button>
            <button
              onClick={() => {
                onClose();
                toast({ description: "Signed out", duration: 1500 });
                navigate("/");
              }}
              className="flex items-center gap-3 w-full p-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-md transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
