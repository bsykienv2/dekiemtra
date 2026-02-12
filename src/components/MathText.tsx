import React, { useEffect, useRef, memo } from 'react';

interface Props {
  content: string;
  className?: string;
  block?: boolean;
}

const MathText: React.FC<Props> = ({ content, className = '', block = false }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderMath = async () => {
      if ((window as any).MathJax && ref.current) {
        // Xử lý nội dung: Nếu không phải mode block, hãy chuyển $$ thành $ để ép hiển thị inline
        let processedContent = content;
        if (!block) {
            // Thay thế $$...$$ thành $...$ để ép inline
            processedContent = content.replace(/\$\$/g, '$');
        }

        // Gán nội dung
        ref.current.innerHTML = processedContent;
        
        try {
          ref.current.removeAttribute('data-mathjax-type');
          // Yêu cầu MathJax render
          await (window as any).MathJax.typesetPromise([ref.current]);
        } catch (err) {
          console.warn('MathJax error:', err);
        }
      }
    };

    renderMath();
  }, [content, block]);

  const Component = block ? 'div' : 'span';

  return (
    <Component 
      ref={ref} 
      className={`${className} ${!block ? 'inline-math-wrapper' : ''}`}
      style={{ display: block ? 'block' : 'inline' }}
    />
  );
};

export default memo(MathText);
