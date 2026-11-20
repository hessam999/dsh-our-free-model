import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Assemble base components in shadcn source style, importing only primitives needed at this stage.
export const cn = (...values: ClassValue[]) => twMerge(clsx(values))

type ButtonVariant = 'default' | 'outline' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

/**
 * Button. When `asChild`, renders as Slot (Radix), hanging styles on the caller-provided child element.
 * forwardRef is required: motion hooks attach ref to the real DOM to write CSS variables.
 */
export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: ButtonSize; busy?: boolean; asChild?: boolean
}>(function Button({ className, variant = 'default', size, busy = false, asChild = false, children, disabled, ...props }, ref) {
  const Component = asChild ? Slot : 'button'
  return <Component type="button" ref={ref} className={cn('ui-button', `ui-button-${variant}`, size && `ui-button-${size}`, busy && 'is-busy', className)}
    disabled={disabled || busy} data-busy={busy || undefined} {...props}>
    {busy && <Spinner className="ui-button-spinner" aria-hidden="true" />}{children}
  </Component>
})

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }>(
  function Card({ className, interactive = false, ...props }, ref) {
    return <div ref={ref} className={cn('ui-card', interactive && 'ui-card-interactive', className)} {...props} />
  })

export function Badge({ className, tone = 'neutral', dot = false, children, ...props }:
  React.HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'success' | 'warning' | 'blue'; dot?: boolean }) {
  return <span className={cn('ui-badge', `ui-badge-${tone}`, className)} {...props}>
    {dot && <span className="ui-badge-dot" aria-hidden="true" />}{children}
  </span>
}

export function Input({ className, invalid = false, ...props }:
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={cn('ui-input', invalid && 'is-invalid', className)} {...props} />
}

/** 16px rotation indicator, used with button busy state or standalone; animates only transform. */
export function Spinner({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('ui-spinner', className)} role="status" aria-label="Loading" {...props} />
}

/** Pure CSS tooltip: put text in tip, visible on hover/focus. No positioning dependency. */
export function Tooltip({ className, tip, children, ...props }:
  React.HTMLAttributes<HTMLSpanElement> & { tip: string }) {
  return <span className={cn('ui-tooltip', className)} data-tip={tip} {...props}>{children}</span>
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <kbd className={cn('ui-kbd', className)} {...props} />
}

/** Controlled small switch: class contract identical to existing .ui-switch (on means on). */
export function Switch({ className, checked = false, onCheckedChange, disabled, ...props }:
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & { checked?: boolean; onCheckedChange?: (next: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} disabled={disabled}
    className={cn('ui-switch', checked && 'on', className)}
    onClick={event => { props.onClick?.(event); if (!event.defaultPrevented) onCheckedChange?.(!checked) }} {...props}>
    <span aria-hidden="true" />
  </button>
}
