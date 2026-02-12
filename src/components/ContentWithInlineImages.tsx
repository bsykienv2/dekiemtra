import React from 'react';
import QuestionImage from './QuestionImage';

interface ContentWithInlineImagesProps {
  content: string;
  className?: string;
}

/**
 * Component render nội dung text có thể chứa nhiều ảnh inline
 * Format: [IMAGE:drive_file_id] hoặc [IMG:drive_file_id]
 * 
 * Ví dụ:
 * "Cho hình vẽ [IMAGE:1abc...xyz] và biểu đồ [IMAGE:2def...uvw] sau đây..."
 */
const ContentWithInlineImages: React.FC<ContentWithInlineImagesProps> = ({ 
  content, 
  className = '' 
}) => {
  if (!content) return null;

  // Regex để tìm pattern [IMAGE:id] hoặc [IMG:id]
  const imagePattern = /\[(?:IMAGE|IMG):([^\]]+)\]/gi;
  
  // Tách content thành các phần (text và image)
  const parts: Array<{ type: 'text' | 'image'; content: string }> = [];
  let lastIndex = 0;
  let match;
  
  // Reset regex để tìm từ đầu
  imagePattern.lastIndex = 0;
  
  while ((match = imagePattern.exec(content)) !== null) {
    // Thêm phần text trước image (nếu có)
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.substring(lastIndex, match.index)
      });
    }
    
    // Thêm image
    parts.push({
      type: 'image',
      content: match[1].trim() // ID của image
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Thêm phần text còn lại (nếu có)
  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.substring(lastIndex)
    });
  }
  
  // Nếu không có image nào, trả về text thuần
  if (parts.length === 0 || (parts.length === 1 && parts[0].type === 'text')) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: content }} />;
  }

  // Render các phần
  return (
    <div className={className}>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <span 
              key={`text-${index}`}
              dangerouslySetInnerHTML={{ __html: part.content }}
            />
          );
        } else {
          return (
            <QuestionImage
              key={`image-${index}`}
              imageId={part.content}
              alt={`Hình ${index + 1}`}
            />
          );
        }
      })}
    </div>
  );
};

export default ContentWithInlineImages;
