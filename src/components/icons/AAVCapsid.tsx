import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  title?: string;
}

export const AAVCapsid: React.FC<IconProps> = ({ 
  size = 24, 
  className = '', 
  title 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden={!title}
  >
    {title && <title>{title}</title>}
    <polygon points="12,2 20.66,7 20.66,17 12,22 3.34,17 3.34,7" />
    <polygon points="12,8.5 15.03,13.75 8.97,13.75" />
    <path d="M12 2 L12 8.5 M20.66 7 L12 8.5 M3.34 7 L12 8.5 M20.66 7 L15.03 13.75 M20.66 17 L15.03 13.75 M12 22 L15.03 13.75 M12 22 L8.97 13.75 M3.34 17 L8.97 13.75 M3.34 7 L8.97 13.75" />
  </svg>
);