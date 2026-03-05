import { ReactNode } from "react";

interface PolarisAppLayoutProps {
  children: ReactNode;
}

const PolarisAppLayout = ({ children }: PolarisAppLayoutProps) => {
  return (
    <div className="min-h-screen bg-secondary px-4 sm:px-0">
      {children}
    </div>
  );
};

export default PolarisAppLayout;
