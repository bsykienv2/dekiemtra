/**
 * Gemini AI Service - AI Tutor cho LMS
 * Hỗ trợ học sinh và Giáo viên
 * Package: @google/genai v1.30.0
 */
import { GoogleGenAI } from "@google/genai";
import { TutorContext, TutorResponse, Question, Theory, ChatMessage } from '../types';

// API Key từ environment - QUAN TRỌNG: Dùng import.meta.env cho Vite
const ai = new GoogleGenAI({ 
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' 
});

// Track hint levels per question
const hintLevels: Map<string, number> = new Map();

/**
 * Lấy hint level hiện tại cho một câu hỏi
 */
export const getHintLevel = (questionId: string): number => {
  return hintLevels.get(questionId) || 0;
};

/**
 * Tăng hint level cho một câu hỏi
 */
export const incrementHintLevel = (questionId: string): number => {
  const current = getHintLevel(questionId);
  const newLevel = Math.min(current + 1, 3);
  hintLevels.set(questionId, newLevel);
  return newLevel;
};

/**
 * Reset hint level cho một câu hỏi
 */
export const resetHintLevel = (questionId: string): void => {
  hintLevels.delete(questionId);
};

/**
 * Reset tất cả hint levels
 */
export const resetAllHints = (): void => {
  hintLevels.clear();
};

/**
 * Helper: Clean and Parse JSON safely
 */
function safeJSONParse(text: string): any {
  if (!text) return {};
  
  // 1. Remove Markdown code blocks
  let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
  
  try {
    return JSON.parse(cleanText);
  } catch (error) {
    console.warn('First JSON parse attempt failed, trying to sanitize backslashes...', error);
    return null;
  }
}

/**
 * Helper: Tách ảnh base64 ra khỏi markdown để giảm token
 */
function extractImages(markdown: string): { cleanText: string; imageMap: Map<string, string> } {
  const imageMap = new Map<string, string>();
  let counter = 0;
  
  // Regex bắt pattern ![alt](data:image...)
  const cleanText = markdown.replace(/!\[(.*?)\]\((data:image\/[^)]+)\)/g, (match, alt, dataUri) => {
    const placeholder = `{{__IMG_${counter}__}}`;
    imageMap.set(placeholder, match); 
    counter++;
    return placeholder; 
  });

  return { cleanText, imageMap };
}

/**
 * Helper: Khôi phục lại ảnh từ placeholder
 */
function restoreImages(text: string, imageMap: Map<string, string>): string {
  let restoredText = text;
  imageMap.forEach((originalImageTag, placeholder) => {
    restoredText = restoredText.split(placeholder).join(originalImageTag);
  });
  return restoredText;
}

/**
 * Hỏi AI Tutor - Hỗ trợ chat history
 * @param chatHistory - Lịch sử chat trước đó
 * @param userMessage - Tin nhắn hiện tại của user
 * @param context - Context về bài toán hiện tại
 */
export const askAITutor = async (
  chatHistory: ChatMessage[],
  userMessage: string,
  context?: TutorContext
): Promise<string> => {
  const hintLevel = context?.questionId ? getHintLevel(context.questionId) : 0;
  
  // Build system prompt với context đầy đủ hơn
  const systemPrompt = `Bạn là Trợ Lý Thầy Phúc - AI tutor hỗ trợ học sinh giải toán.

NGUYÊN TẮC:
- Dùng LaTeX $...$ cho công thức toán
- Giải thích rõ ràng, dễ hiểu
- Khuyến khích học sinh tự suy nghĩ trước khi đưa đáp án
- Trả lời ngắn gọn, súc tích

${context ? `THÔNG TIN BÀI TOÁN HIỆN TẠI:
- Lớp: ${(context as any).grade || 'N/A'}
- Chủ đề: ${(context as any).topic || 'N/A'}
- Level: ${(context as any).level || 'N/A'}
- Loại câu hỏi: ${(context as any).questionType || 'N/A'}
- Nội dung: ${(context as any).question || context.questionText || 'N/A'}
- Học sinh đang chọn: ${context.userAnswer || 'Chưa chọn'}
` : ''}

Hãy trả lời một cách thân thiện và hữu ích!`;

  // Build chat prompt with history
  let fullPrompt = systemPrompt + '\n\n=== LỊCH SỬ CHAT ===\n';
  
  // Add recent chat history (last 6 messages for context)
  const recentHistory = Array.isArray(chatHistory) ? chatHistory.slice(-6) : [];
  for (const msg of recentHistory) {
    if (msg && msg.role && msg.content) {
      fullPrompt += `${msg.role === 'user' ? 'Học sinh' : 'Trợ lý'}: ${msg.content}\n`;
    }
  }
  
  // Add current user message
  fullPrompt += `\n=== CÂU HỎI MỚI ===\nHọc sinh: ${userMessage}\n\nTrợ lý:`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullPrompt,
      config: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
      },
    });
    
    // QUAN TRỌNG: Với @google/genai, response.text là property
    const message = response.text;
    
    if (message && typeof message === 'string') {
      if (context?.questionId && userMessage.toLowerCase().includes('gợi ý')) {
        incrementHintLevel(context.questionId);
      }
      return message;
    }
    return "Mình gặp lỗi khi trả lời. Bạn thử lại nhé.";
  } catch (error) {
    console.error('AI Tutor error:', error);
    return "Hệ thống AI đang bận hoặc gặp sự cố. Em hãy thử lại sau nhé.";
  }
};

/**
 * Tạo câu hỏi mới từ AI (Giáo viên)
 */
export const generateQuestionFromAI = async (
  grade: number,
  topic: string,
  level: string, 
  type: 'Trắc nghiệm' | 'Đúng/Sai' | 'Trả lời ngắn',
  sourceText?: string
): Promise<Partial<Question> | null> => {
  try {
    let prompt = `Tạo một câu hỏi toán học Lớp ${grade}, Chủ đề "${topic}", Mức độ "${level}", Dạng câu hỏi "${type}".\n`;
    
    if (sourceText) {
      const { cleanText } = extractImages(sourceText);
      prompt += `\n[QUAN TRỌNG] Dựa vào nội dung văn bản sau để tạo câu hỏi:\n"""${cleanText}"""\n`;
    }

    prompt += `
    \n[YÊU CẦU ĐỊNH DẠNG JSON & LATEX]:
    1. Output phải là một JSON Object hợp lệ.
    2. TẤT CẢ công thức toán phải viết dưới dạng LaTeX và đặt trong dấu $.
    3. QUAN TRỌNG: Trong chuỗi JSON, ký tự backslash (\\) của LaTeX phải được ESCAPE (viết thành \\\\).
    `;

    if (type === 'Trắc nghiệm') {
      prompt += `Yêu cầu output JSON format:
      {
        "question_text": "Nội dung câu hỏi (LaTeX $\\\\dots$)",
        "option_A": "Đáp án A",
        "option_B": "Đáp án B",
        "option_C": "Đáp án C",
        "option_D": "Đáp án D",
        "answer_key": "A",
        "solution": "Lời giải chi tiết"
      }`;
    } else if (type === 'Đúng/Sai') {
      prompt += `Yêu cầu output JSON format:
      {
        "question_text": "Nội dung câu hỏi chính",
        "option_A": "Mệnh đề a",
        "option_B": "Mệnh đề b",
        "option_C": "Mệnh đề c",
        "option_D": "Mệnh đề d",
        "answer_key": "Đ-S-Đ-S",
        "solution": "Giải thích từng mệnh đề"
      }`;
    } else {
      prompt += `Yêu cầu output JSON format:
      {
        "question_text": "Nội dung câu hỏi",
        "answer_key": "Giá trị số",
        "solution": "Lời giải chi tiết"
      }`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.7 
      }
    });

    const json = safeJSONParse(response.text || '{}');
    if (!json) return null;

    return { ...json, grade, topic, level, question_type: type };

  } catch (error) {
    console.error('Gen Question Error:', error);
    return null;
  }
};

/**
 * Thực hiện OCR (Trích xuất văn bản từ Ảnh hoặc PDF)
 */
export const performOCR = async (base64Data: string, mimeType: string): Promise<string | null> => {
  try {
    // QUAN TRỌNG: Cắt bỏ phần header (ví dụ: "data:application/pdf;base64,")
    const cleanBase64 = base64Data.includes('base64,') 
      ? base64Data.split('base64,')[1] 
      : base64Data;

    const prompt = `Hãy đóng vai trò là một công cụ OCR Toán học chuyên nghiệp. 
    Nhiệm vụ của bạn là trích xuất toàn bộ nội dung văn bản và công thức toán học từ tài liệu này (Ảnh hoặc PDF).
    
    Yêu cầu:
    1. Giữ nguyên định dạng công thức toán học, chuyển đổi chúng sang định dạng LaTeX chuẩn (đặt trong dấu $...$ hoặc $$...$$).
    2. Nếu có nhiều câu hỏi, hãy trích xuất tất cả.
    3. Không thêm lời bình luận, chỉ trả về nội dung thô đã trích xuất.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64
            }
          },
          { text: prompt }
        ]
      }
    });

    return response.text || null;
  } catch (error) {
    console.error('OCR Error:', error);
    return null;
  }
};

/**
 * Parse Markdown to Questions
 */
export const parseQuestionsFromMarkdown = async (markdownText: string, grade: number, topic: string): Promise<Partial<Question>[]> => {
  const { cleanText, imageMap } = extractImages(markdownText);

  const prompt = `
    Bạn là hệ thống trích xuất đề thi Toán thông minh.
    Nhiệm vụ: Phân tích văn bản Markdown bên dưới và trích xuất TOÀN BỘ danh sách câu hỏi thành mảng JSON.

    [VĂN BẢN ĐỀ THI]:
    """
    ${cleanText}
    """

    [YÊU CẦU OUTPUT JSON]:
    - Output là một JSON Array: [ {...}, {...} ]
    - Trường "question_type" tự động nhận diện: "Trắc nghiệm" (có A,B,C,D), "Đúng/Sai" (có a,b,c,d), hoặc "Trả lời ngắn".
    - Các trường bắt buộc: "question_type", "question_text", "option_A", "option_B", "option_C", "option_D".
    - "answer_key": Nếu có đáp án, hãy điền. Nếu không, để trống.
    - "solution": Lời giải (nếu có).
    - LaTeX phải được double-escape (\\\\frac instead of \\frac).
  `;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: 65536 
        }
    });
    
    const parsed = safeJSONParse(response.text || '[]');
    if (!Array.isArray(parsed)) return [];
    
    return parsed.map((q: any) => ({
        ...q,
        image_id: q.image_id && imageMap.has(q.image_id) ? imageMap.get(q.image_id) : q.image_id,
        grade,
        topic,
        level: 'Thông hiểu',
        quiz_level: 1
    }));
  } catch (error) {
    console.error("Error parsing questions:", error);
    return [];
  }
};

/**
 * Generate Theory from AI
 */
export const generateTheoryFromAI = async (grade: number, topic: string, level: number): Promise<Partial<Theory> | null> => {
    try {
        const prompt = `
Tạo một bài giảng lý thuyết Toán học cho:
- Khối lớp: ${grade}
- Chủ đề: ${topic}
- Mức độ: Level ${level}

Yêu cầu output JSON format:
{
  "title": "Tiêu đề bài giảng (ngắn gọn)",
  "content": "Nội dung lý thuyết đầy đủ (hỗ trợ LaTeX $...$)",
  "examples": "Các ví dụ minh họa (tùy chọn)",
  "tips": "Mẹo và lưu ý quan trọng (tùy chọn)"
}

Lưu ý:
- Viết nội dung bằng tiếng Việt, rõ ràng, dễ hiểu
- Sử dụng LaTeX cho công thức toán (ví dụ: $x^2 + y^2 = z^2$)
- Nội dung phù hợp với trình độ học sinh lớp ${grade}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                temperature: 0.8,
                maxOutputTokens: 8192
            }
        });

        const json = safeJSONParse(response.text || '{}');
        if (!json || !json.title || !json.content) return null;

        return {
            grade,
            topic,
            level,
            title: json.title,
            content: json.content,
            examples: json.examples || '',
            tips: json.tips || ''
        };
    } catch (error) {
        console.error('Generate Theory Error:', error);
        return null;
    }
};
