import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

/**
 * Shared outer-geometry tokens for signed-in pages.
 *
 * These govern chrome clearance and responsive gutters only. Individual
 * modules intentionally retain their own max-width and local spacing.
 */
export const SIGNED_IN_DESKTOP_DRAWER_OFFSET_CLASS = 'lg:pl-[250px]';
export const SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS = 'lg:left-[250px]';
export const SIGNED_IN_PAGE_GUTTER_CLASS = 'px-6 sm:px-12';
export const SIGNED_IN_TOP_CLEARANCE_VAR =
  'var(--app-chrome-offset, 2.25rem)';

/**
 * Footer reserve includes the existing floating footer and the device safe
 * area. Pages with another fixed action region can add its height through
 * `--app-local-fixed-action-height`.
 */
export const SIGNED_IN_FOOTER_CLEARANCE_CLASS =
  'pb-[calc(var(--app-footer-clearance,7rem)+env(safe-area-inset-bottom,0px)+var(--app-local-fixed-action-height,0px))]';

type SignedInClearanceStyle = CSSProperties & {
  '--app-local-fixed-action-height'?: string;
};

export interface SignedInPageScrollProps
  extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  reserveFooter?: boolean;
  /** CSS length reserved above the footer for a page-local fixed action. */
  localFixedActionHeight?: string;
}

/**
 * Incremental scroll-area primitive for signed-in pages. Adoption is
 * intentionally page-by-page so existing product surfaces do not shift.
 */
export function SignedInPageScroll({
  children,
  className,
  reserveFooter = true,
  localFixedActionHeight = '0px',
  style,
  ...props
}: SignedInPageScrollProps) {
  const clearanceStyle: SignedInClearanceStyle = {
    ...style,
    '--app-local-fixed-action-height': localFixedActionHeight,
  };

  return (
    <main
      className={cn(
        'min-h-0 flex-1 overflow-x-hidden overflow-y-auto',
        reserveFooter && SIGNED_IN_FOOTER_CLEARANCE_CLASS,
        className,
      )}
      style={clearanceStyle}
      {...props}
    >
      {children}
    </main>
  );
}
