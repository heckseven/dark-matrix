import * as React from 'react';

export function Link({ href, children, className = '', ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-current underline underline-offset-2 ${className}`}
      {...props}
    >
      {children}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}
