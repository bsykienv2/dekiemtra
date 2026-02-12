import mammoth from 'mammoth';
import { Question } from './types';

/**
 * Upload ảnh base64 lên Google Drive thông qua Apps Script
 * @param base64Data - Data URI (data:image/png;base64,...)
 * @param fileName - Tên file
 * @returns Drive file ID
 */
export const uploadImageToDrive = async (
  base64Data: string, 
  fileName: string,
  scriptUrl: string
): Promise<string> => {
  try {
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'uploadImage',
        imageData: base64Data,
        fileName: fileName
      })
    });

    const result = await response.json();
    
    if (result.status === 'success' && result.data.fileId) {
      return result.data.fileId;
    } else {
      throw new Error(result.message || 'Upload failed');
    }
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

/**
 * Chuyển đổi file Word sang HTML và upload tất cả ảnh lên Drive
 * Thay thế ảnh base64 bằng [IMAGE:drive_id]
 */
export const extractHtmlFromDocxWithDriveImages = async (
  file: File,
  scriptUrl: string,
  onProgress?: (current: number, total: number) => void
): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        
        // Chuyển Word sang HTML (ảnh sẽ là base64)
        const result = await mammoth.convertToHtml({ arrayBuffer });
        let htmlContent = result.value;
        
        // Tìm tất cả ảnh base64 trong HTML
        const imgRegex = /<img[^>]*src=["'](data:image\/[^;]+;base64,[^"']+)["'][^>]*>/gi;
        const matches = [...htmlContent.matchAll(imgRegex)];
        
        if (matches.length === 0) {
          // Không có ảnh, trả về HTML nguyên
          resolve(htmlContent);
          return;
        }

        console.log(`Tìm thấy ${matches.length} ảnh, bắt đầu upload lên Drive...`);
        
        // Upload từng ảnh lên Drive
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          const base64Data = match[1];
          const fileName = `image_${Date.now()}_${i + 1}.png`;
          
          try {
            // Upload lên Drive
            const driveId = await uploadImageToDrive(base64Data, fileName, scriptUrl);
            
            // Thay thế <img src="base64..."> bằng [IMAGE:drive_id]
            htmlContent = htmlContent.replace(
              match[0], 
              `[IMAGE:${driveId}]`
            );
            
            if (onProgress) {
              onProgress(i + 1, matches.length);
            }
            
            console.log(`✓ Upload ảnh ${i + 1}/${matches.length}: ${driveId}`);
          } catch (error) {
            console.error(`✗ Lỗi upload ảnh ${i + 1}:`, error);
            // Giữ nguyên base64 nếu upload thất bại
          }
        }
        
        resolve(htmlContent);
      } catch (error) {
        reject(new Error("Lỗi đọc file Word: " + error));
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Parse câu hỏi từ HTML (đã có [IMAGE:id] thay cho base64)
 */
export const parseQuestionsFromHtmlWithImages = (
  htmlContent: string, 
  defaultGrade: number, 
  defaultTopic: string
): Partial<Question>[] => {
  const questions: Partial<Question>[] = [];
  
  // Parse HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  
  const elements = Array.from(doc.body.children);
  let currentQuestion: Partial<Question> | null = null;
  let currentBuffer: string[] = [];

  const flushQuestion = () => {
    if (currentQuestion && currentBuffer.length > 0) {
      const fullHtml = currentBuffer.join('');
      processQuestionContent(currentQuestion, fullHtml);
      questions.push(currentQuestion);
    }
  };

  // Regex nhận diện bắt đầu câu
  const startRegex = /^(?:<strong[^>]*>)?(?:Câu|Bài|Question)\s+\d+[:.]/i;

  elements.forEach((el) => {
    const textContent = el.textContent?.trim() || '';
    const htmlContent = el.outerHTML;

    if (startRegex.test(textContent) || (el.tagName === 'P' && startRegex.test(el.innerHTML))) {
      flushQuestion();

      currentQuestion = {
        grade: defaultGrade,
        topic: defaultTopic,
        level: 'Thông hiểu',
        quiz_level: 1,
        question_type: 'Trắc nghiệm',
        answer_key: 'A',
        solution: ''
      };
      currentBuffer = [htmlContent];
    } else {
      if (currentQuestion) {
        currentBuffer.push(htmlContent);
      }
    }
  });

  flushQuestion();
  return questions;
};

/**
 * Xử lý nội dung câu hỏi - tách đề và đáp án nếu có
 */
function processQuestionContent(q: Partial<Question>, html: string) {
  // Lưu toàn bộ HTML (bao gồm [IMAGE:id])
  q.question_text = html;
  
  // Khởi tạo options rỗng
  q.option_A = "";
  q.option_B = "";
  q.option_C = "";
  q.option_D = "";
  
  // Thử tách đáp án nếu có format rõ ràng
  // Pattern: A. hoặc A) ở đầu dòng
  const optionRegex = /([A-D])[.)]\s*([^\n]+)/gi;
  const textOnly = html.replace(/<[^>]+>/g, ' ').replace(/\[IMAGE:[^\]]+\]/g, '');
  
  const optionMatches = [...textOnly.matchAll(optionRegex)];
  
  if (optionMatches.length >= 4) {
    // Tìm thấy đủ 4 đáp án
    q.question_type = 'Trắc nghiệm';
    
    // Tách phần đề (trước đáp án đầu tiên)
    const firstOptionIndex = html.toLowerCase().indexOf(optionMatches[0][0].toLowerCase());
    if (firstOptionIndex > 0) {
      q.question_text = html.substring(0, firstOptionIndex).trim();
    }
    
    // Gán các đáp án (bao gồm cả [IMAGE:id] nếu có)
    optionMatches.forEach(match => {
      const key = match[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
      // Tìm phần HTML tương ứng với đáp án này
      const startIdx = html.indexOf(match[0]);
      if (startIdx >= 0) {
        // Tìm đến hết dòng hoặc đến đáp án tiếp theo
        const nextMatch = optionMatches[optionMatches.indexOf(match) + 1];
        const endIdx = nextMatch 
          ? html.indexOf(nextMatch[0], startIdx + match[0].length)
          : html.length;
        
        const optionContent = html.substring(startIdx, endIdx > 0 ? endIdx : html.length)
          .replace(/^[A-D][.)]/, '') // Bỏ "A." ở đầu
          .trim();
        
        q[`option_${key}` as keyof Question] = optionContent;
      }
    });
  } else {
    // Không tìm thấy đáp án rõ ràng -> Tự luận
    q.question_type = 'Trả lời ngắn';
  }
}

/**
 * Legacy function - giữ cho tương thích
 */
export const extractTextFromDocx = async (file: File): Promise<string> => {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const result = await mammoth.convertToHtml({ arrayBuffer });
        resolve(result.value.replace(/<[^>]*>?/gm, ''));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};
