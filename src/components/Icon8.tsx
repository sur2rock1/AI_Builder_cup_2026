import React from 'react';

/** Icons8 iOS glyphs downloaded via MCP (ios7). Invert to white on dark UI. */
export type Icon8Name = 'email' | 'lock' | 'user' | 'plus' | 'logout' | 'parent' | 'star' | 'forward';

export const Icon8: React.FC<{
  name: Icon8Name;
  size?: number;
  className?: string;
  alt?: string;
}> = ({ name, size = 18, className = '', alt = '' }) => (
  <img
    src={`/icons/${name}.png`}
    width={size}
    height={size}
    alt={alt}
    className={`inline-block align-middle brightness-0 invert ${className}`}
  />
);
