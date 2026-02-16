import { type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Toaster } from "./ui/toaster";
import Header from "./Header";

interface AppLayoutProps {
  children: ReactNode;
  pageTitle?: string;
  pageSubtitle?: string;
  backTo?: string;
  backLabel?: string;
  onBack?: () => void;
}

const AppLayout = ({ children, pageTitle, pageSubtitle, backTo, backLabel, onBack }: AppLayoutProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backTo) {
      navigate(backTo);
    }
  };

  const BackButton = () => {
    if (!backTo && !onBack) return null;
    
    return (
      <button
        onClick={handleBack}
        className="flex items-center justify-center w-10 h-10 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={backLabel || "Go back"}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
    );
  };

  return (
    <div className="min-h-screen flex flex-col w-full">
      {/* Skip link for keyboard users */}


      <Header />
      <Toaster />


      {/* Main Content */}
      <main 
        id="main-content" 
        className="flex-1 bg-secondary"
        tabIndex={-1}
      >
        <div className="max-w-[1400px] mx-auto py-6 px-4 sm:py-8 sm:px-6 lg:px-10">
          {/* Page Header - Clean editorial style with integrated back button */}
          {pageTitle && (
            <header className="pt-2 pb-4 sm:pt-4 sm:pb-6">
              <div className="flex items-center gap-1">
                <BackButton />
                <h1 className="text-2xl sm:text-[32px] font-light text-foreground leading-tight">
                  {pageTitle}
                </h1>
              </div>
              {pageSubtitle && (
                <p className={`mt-1 text-sm sm:text-[15px] text-muted-foreground ${backTo || onBack ? 'ml-9' : ''}`}>
                  {pageSubtitle}
                </p>
              )}
            </header>
          )}
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
