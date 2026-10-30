import React, { useState, useEffect } from 'react';
import { getAppLogoPath, getAppLogoScale } from '../utils/logoHelper';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  withText?: boolean;
  origin?: 'left center' | 'center' | 'right center';
}

export function Logo({ className = '', origin = 'left center' }: LogoProps) {
  const [logoSrc, setLogoSrc] = useState<string>(getAppLogoPath());
  const [logoScale, setLogoScale] = useState<number>(getAppLogoScale());

  useEffect(() => {
    const handleUpdate = () => {
      setLogoSrc(getAppLogoPath());
      setLogoScale(getAppLogoScale());
    };
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('logoUpdated', handleUpdate);
    return () => {
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('logoUpdated', handleUpdate);
    };
  }, []);

  return (
    <div
      className={`flex items-center shrink-0 ${className}`}
      style={{ backgroundColor: 'transparent' }}
    >
      {/* Transparent Logo Image with Dynamic Scale */}
      <img
        src={logoSrc}
        alt="Logotipo Sistema"
        style={{
          height: `${Math.round(48 * logoScale)}px`,
          width: 'auto',
          maxHeight: '220px',
          objectFit: 'contain',
          backgroundColor: 'transparent',
          transformOrigin: origin,
          transition: 'all 0.15s ease-out',
        }}
        className="block shrink-0"
        onError={(e) => {
          if (!logoSrc.startsWith('data:') && e.currentTarget.src !== window.location.origin + '/assets/logo.png') {
            e.currentTarget.src = '/assets/logo.png';
          }
        }}
      />
    </div>
  );
}

