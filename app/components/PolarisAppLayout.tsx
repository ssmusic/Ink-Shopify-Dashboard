import { ReactNode } from "react";
import { Link } from "react-router";
import { Avatar } from "@shopify/polaris";
import TopNav from "./TopNav";

interface PolarisAppLayoutProps {
  children: ReactNode;
}

const PolarisAppLayout = ({ children }: PolarisAppLayoutProps) => {
  return (
    <div className="min-h-screen bg-secondary flex flex-col">
      <header className="w-full bg-white border-b border-border sticky top-0 z-50">
        <TopNav />
      </header>
      <main className="flex-1 px-4 sm:px-0 max-w-[1400px] w-full mx-auto py-6">
        {children}
      </main>
    </div>
  );
};

export default PolarisAppLayout;
