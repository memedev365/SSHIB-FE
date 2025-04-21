// AppBar.tsx
import dynamic from 'next/dynamic';
import React, { useState } from "react";
import { useAutoConnect } from '../contexts/AutoConnectProvider';

export const AppBar: React.FC = () => {
  const { autoConnect, setAutoConnect } = useAutoConnect();
  const [isNavOpen, setIsNavOpen] = useState(false);
  
  return (
    <div>
      {/* NavBar / Header */}
      <div id="navBg">
        {/* Empty div to balance the flex space */}
        <div className="flex-1"></div>
        
        {/* Centered content */}
        <div id="walletCenter" className="flex items-center justify-center gap-4">
          {/* Logo - hidden on mobile */}
          <div className="hidden sm:inline w-22 h-22 md:p-2">
            <img className='logo' src=""/>
          </div>
        </div>
        
        {/* Empty div to balance the flex space */}
        <div className="flex-1"></div>
      </div>
    </div>
  );
};