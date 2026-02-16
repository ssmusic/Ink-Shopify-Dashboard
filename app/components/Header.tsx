import { useCallback, useState } from "react";
import { Menu, LogOut, Settings, CreditCard } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import MobileMenu from "./MobileMenu";
import { cn } from "../lib/utils";
import { toast } from "../hooks/use-toast";

const navItems = [
  { title: "Dashboard", url: "/app/dashboard" },
  { title: "Shipments", url: "/app/tagged-shipments" },
  { title: "Help", url: "/app/help" },
  { title: "Settings", url: "/app/settings" },
];

const dummyUser = {
  name: "Marcus Chen",
  email: "marcus@luminary.co",
  initials: "MC",
  shop: "Luminary Goods",
};

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);

  const isActive = (path: string) => {
    // If it's exact match or base match
    if (path === "/app") return location.pathname === "/app" || location.pathname === "/app/";
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <header className="sticky top-0 z-[100] h-[60px] bg-card border-b border-border bg-white">
        <div className="flex items-center justify-between h-full px-4 lg:px-8 max-w-[1600px] mx-auto">
          {/* Mobile: Hamburger (left) */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden -ml-2"
            onClick={(e) => {
              e.stopPropagation();
              setIsMobileMenuOpen(true);
            }}
            aria-label="Open navigation menu"
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>

          {/* Logo */}
          <NavLink 
            to="/app/dashboard" 
            className="text-3xl lg:text-xl font-serif font-medium tracking-tight text-foreground lg:order-first order-last"
          >
            ink.
          </NavLink>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8 ml-12 flex-1" aria-label="Main navigation">
            {navItems.map((item) => {
              const active = isActive(item.url);
              return (
                <NavLink
                  key={item.title}
                  to={item.url}
                  className={cn(
                    "text-sm py-1 border-b-2 transition-colors",
                    active
                      ? "text-foreground border-foreground"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {item.title}
                </NavLink>
              );
            })}
          </nav>

          {/* Account Avatar Dropdown - Desktop */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:flex h-9 w-9 rounded-full"
                aria-label="Account menu"
              >
                <Avatar className="h-8 w-8 border border-border">
                  <AvatarFallback className="bg-secondary text-foreground text-xs font-medium">
                    {dummyUser.initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-card border-border z-[200]">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium text-foreground">{dummyUser.name}</p>
                  <p className="text-xs text-muted-foreground">{dummyUser.email}</p>
                  <p className="text-xs text-muted-foreground">{dummyUser.shop}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/app/settings?tab=account")} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Account Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/app/settings?tab=account")} className="cursor-pointer">
                <CreditCard className="mr-2 h-4 w-4" />
                Billing
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  toast({ description: "Signed out", duration: 1500 });
                  navigate("/");
                }}
                className="cursor-pointer text-muted-foreground"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={closeMobileMenu}
      />
    </>
  );
};

export default Header;
