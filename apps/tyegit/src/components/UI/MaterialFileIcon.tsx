import React from 'react';
import { getIcon } from 'material-file-icons';

interface MaterialFileIconProps {
  filename: string;
  className?: string;
}

export const MaterialFileIcon: React.FC<MaterialFileIconProps> = ({ filename, className = "w-4 h-4" }) => {
  const icon = getIcon(filename);
  
  return (
    <div 
      className={`flex-shrink-0 flex items-center justify-center ${className}`}
      dangerouslySetInnerHTML={{ __html: icon.svg }}
    />
  );
};
