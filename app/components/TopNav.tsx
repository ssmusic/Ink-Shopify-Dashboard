import { useLocation, Link } from "react-router";

const navItems = [
  { label: "Dashboard", path: "/app/dashboard" },
  { label: "Shipments", path: "/app/tagged-shipments" },
  { label: "Settings", path: "/app/settings" },
  { label: "Billing", path: "/app/billing" },
  { label: "Help", path: "/app/help" },
];

const TopNav = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/app/tagged-shipments") return location.pathname.startsWith("/app/tagged-shipments");
    if (path === "/app/settings") return location.pathname.startsWith("/app/settings");
    return location.pathname === path;
  };

  return (
    <div className="bg-white border-b border-border px-4 sm:px-6">
      <div className="flex items-center gap-6 h-11">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                relative h-full flex items-center text-[13px] font-medium transition-colors
                ${
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              {item.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default TopNav;
