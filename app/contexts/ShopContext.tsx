import { createContext, useContext, useState, ReactNode } from "react";

interface Shop {
  id: string;
  name: string;
  domain: string;
}

interface ShopContextType {
  currentShop: Shop | null;
  loading: boolean;
  setShop: (shop: Shop) => void;
}

const ShopContext = createContext<ShopContextType | undefined>(undefined);

export function ShopProvider({ children }: { children: ReactNode }) {
  const [currentShop, setShop] = useState<Shop | null>({
    id: "1",
    name: "Music Official",
    domain: "music-official.myshopify.com",
  });
  const [loading, setLoading] = useState(false);

  return (
    <ShopContext.Provider value={{ currentShop, loading, setShop }}>
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const context = useContext(ShopContext);
  if (context === undefined) {
    throw new Error("useShop must be used within a ShopProvider");
  }
  return context;
}
