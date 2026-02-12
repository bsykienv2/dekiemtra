import React, { useState } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface QuestionImageProps {
  imageId: string;
  alt?: string;
  className?: string;
}

/**
 * Component hiển thị ảnh từ Google Drive
 * Sử dụng image_id để tạo URL public
 */
const QuestionImage: React.FC<QuestionImageProps> = ({ 
  imageId, 
  alt = 'Question Image', 
  className = '' 
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [urlIndex, setUrlIndex] = useState(0);

  if (!imageId || imageId.trim() === '') {
    return null;
  }

  const cleanId = imageId.trim();

  // ✅ Danh sách các URL format để thử (theo thứ tự ưu tiên)
  const imageUrls = [
    // Format mới nhất - ổn định nhất
    `https://drive.usercontent.google.com/download?id=${cleanId}&export=view`,
    // Thumbnail API - backup tốt
    `https://drive.google.com/thumbnail?id=${cleanId}&sz=w1000`,
    // lh3 googleusercontent
    `https://lh3.googleusercontent.com/d/${cleanId}`,
    // Format cũ (fallback)
    `https://drive.google.com/uc?export=view&id=${cleanId}`,
  ];

  const currentUrl = imageUrls[urlIndex];

  const handleImageLoad = () => {
    setLoading(false);
    setError(false);
  };

  const handleImageError = () => {
    // Thử URL tiếp theo nếu còn
    if (urlIndex < imageUrls.length - 1) {
      setUrlIndex(prev => prev + 1);
    } else {
      setLoading(false);
      setError(true);
    }
  };

  const handleRetry = () => {
    setUrlIndex(0);
    setLoading(true);
    setError(false);
  };

  return (
    <div className={`my-4 relative flex justify-center ${className}`}>
      {loading && !error && (
        <div className="flex items-center justify-center p-6 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 max-w-md mx-auto">
          <Loader2 className="animate-spin text-teal-600 mr-2" size={20} />
          <span className="text-gray-500 text-sm">Đang tải hình ảnh...</span>
        </div>
      )}
      
      {error && (
        <div className="flex flex-col items-center justify-center p-4 bg-red-50 rounded-xl border-2 border-dashed border-red-300 max-w-md mx-auto">
          <AlertCircle className="text-red-500 mb-2" size={20} />
          <div className="text-sm text-center">
            <div className="font-bold text-red-800 text-xs">Không thể tải ảnh</div>
            <div className="text-red-600 text-[10px] mt-1 font-mono">ID: {cleanId}</div>
            <div className="flex gap-2 mt-2 justify-center">
              <button
                onClick={handleRetry}
                className="flex items-center gap-1 px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-[10px] font-medium transition-colors"
              >
                <RefreshCw size={10} />
                Thử lại
              </button>
              <a 
                href={`https://drive.google.com/file/d/${cleanId}/view`}
                target="_blank" 
                rel="noopener noreferrer"
                className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-[10px] font-medium transition-colors"
              >
                Mở trong Drive
              </a>
            </div>
          </div>
        </div>
      )}

      <img
        src={currentUrl}
        alt={alt}
        className={`h-auto rounded-xl shadow-md border border-gray-200 mx-auto ${loading || error ? 'hidden' : 'block'}`}
        style={{ maxWidth: '320px', maxHeight: '280px', objectFit: 'contain' }}
        onLoad={handleImageLoad}
        onError={handleImageError}
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

export default QuestionImage;
