import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

// Local shadcn/ui component: CVA variants + Radix composition; owned by this app.
const buttonVariants = cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4', {
  variants: { variant: {
    default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
    outline: 'border border-border bg-surface text-foreground hover:bg-muted',
  }, size: { default: 'h-10 px-4 py-2', sm: 'h-9 px-3' } },
  defaultVariants: { variant: 'default', size: 'default' },
});
type Props = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };
export function Button({ className, variant, size, asChild = false, ...props }: Props) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
