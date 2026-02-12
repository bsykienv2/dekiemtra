import React from 'react';

interface LoadingProps {
  message?: string;
}

const Loading: React.FC<LoadingProps> = ({ message = "Đang tải dữ liệu..." }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 min-h-[50vh]">
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-teal-600 mb-4"></div>
      <p className="text-teal-700 font-semibold text-lg animate-pulse">{message}</p>
    </div>
  );
};

export default Loading;