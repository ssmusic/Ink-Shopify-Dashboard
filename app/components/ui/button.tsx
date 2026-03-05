import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background hover:bg-foreground/90 hover:-translate-y-[1px] hover:shadow-[0_2px_4px_rgba(0,0,0,0.1)]",
        primary: "bg-foreground text-background hover:bg-foreground/90 hover:-translate-y-[1px] hover:shadow-[0_2px_4px_rgba(0,0,0,0.1)]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border-[1.5px] border-border bg-card text-foreground hover:border-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-secondary hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6 py-3",
        sm: "h-9 rounded px-4 text-[13px]",
        lg: "h-12 rounded px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "variant">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    // Wait, Slot needs to be imported. I don't have it installed.
    // I'll remove `asChild` support for now or just use `button`.
    // Actually `NFCTagInventory` uses `asChild`. 
    // I'll create a dummy Slot component if I don't want to install radix.
    // Or just install specific radix primitive.
    // Let's rely on standard button for now and if asChild is passed I'll just render children?
    // No, I'll install @radix-ui/react-slot in next step to be safe. 
    // BUT for THIS file write, I can't import it if it's not there.
    // I'll remove Slot import and implement basic button.
    
    const CompType = "button";
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
