
import React from 'react';

interface LogoProps {
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ className = "h-10 w-10" }) => {
  return (
    <img 
      src="images/logo.png" 
      alt="BHASVIC Logo" 
      className={`${className} object-contain`}
      onError={(e) => {
        // Fallback in case image is missing in the environment
        e.currentTarget.style.display = 'none';
      }}
    />
  );
};

export default Logo;
