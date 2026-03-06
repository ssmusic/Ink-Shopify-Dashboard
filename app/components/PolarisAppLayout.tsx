import { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Avatar } from "@shopify/polaris";

interface PolarisAppLayoutProps {
  children: ReactNode;
}

const TopNavbar = () => {
  const location = useLocation();

  const navItems = [
    { label: "Dashboard", path: "/app/dashboard" },
    { label: "Shipments", path: "/app/tagged-shipments" },
    { label: "Help", path: "/app/help" },
    { label: "Settings", path: "/app/settings" },
  ];

  const isActive = (path: string) => {
    // For exact match
    if (path === "/app/settings" && location.pathname.startsWith("/app/settings")) {
       return true;
    }
    return location.pathname === path;
  };

  return (
    <header className="w-full h-14 bg-white border-b border-border flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-12">
        <Link to="/app/dashboard" className="text-xl font-bold text-foreground">
          ink.
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`text-[13px] transition-colors relative h-14 flex items-center ${
                isActive(item.path)
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
              {isActive(item.path) && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
              )}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        {/* We can hardcode initials for now based on the screenshot "MC" */}
        <Avatar initials="MC" size="sm" />
      </div>
    </header>
  );
};

const PolarisAppLayout = ({ children }: PolarisAppLayoutProps) => {
  return (
    <div className="min-h-screen bg-secondary flex flex-col">
      <TopNavbar />
      <main className="flex-1 px-4 sm:px-0 max-w-[1400px] w-full mx-auto py-6">
        {children}
      </main>
    </div>
  );
};

export default PolarisAppLayout;
