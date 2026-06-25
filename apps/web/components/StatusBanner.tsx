import React from 'react';

type StatusBannerProps = {
  message: string;
  variant: 'error' | 'success';
  onClose?: () => void;
};

const variantStyles = {
  error: 'bg-red-500',
  success: 'bg-green-500',
} as const;

export const StatusBanner: React.FC<StatusBannerProps> = ({ message, variant, onClose }) => {
  const colorClass = variantStyles[variant];
  // Lightweight toast for errors/success with optional dismiss.
  return (
    <div className={`absolute top-20 left-1/2 -translate-x-1/2 ${colorClass} text-white p-3 rounded-md shadow-lg z-20 max-w-md text-center`}>
      <p>{message}</p>
      {onClose && (
        <button
          onClick={onClose}
          className="absolute -top-1 -right-1 text-2xl font-bold bg-black/20 rounded-full h-6 w-6 flex items-center justify-center leading-none"
          aria-label="Dismiss"
        >
          &times;
        </button>
      )}
    </div>
  );
};
