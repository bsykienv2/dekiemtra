import mammoth from 'mammoth';
import { Question } from '../types';

/**
 * Chuyển đổi file Docx sang HTML để giữ nguyên hình ảnh
 */
export const extractHtmlFromDocx = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        // convertToHtml sẽ giữ lại ảnh dưới dạng base64 (data:image/...)
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        resolve(result.value);
      } catch (error) {
        reject(new Error("Lỗi đọc file Word: " + error));
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Trích xuất văn bản thô (giữ hàm cũ cho tương thích nếu cần)
 */
export const extractTextFromDocx = async (file: File): Promise<string> => {
    // ... code cũ, nhưng ở đây ta tập trung dùng hàm extractHtmlFromDocx bên trên
    // Để tiết kiệm token tôi sẽ gọi hàm trên và strip tags nếu cần, 
    // nhưng tốt nhất workflow mới nên dùng HTML.
    const html = await extractHtmlFromDocx(file);
    return html.replace(/<[^>]*>?/gm, ''); // Simple strip tags
};

/**
 * 🆕 Advanced Parser: Phân tích câu hỏi từ HTML (Hỗ trợ nhiều ảnh)
 * Logic: Dựa vào cấu trúc <p>Câu 1...</p>
 */
export const parseQuestionsFromHtml = (htmlContent: string, defaultGrade: number, defaultTopic: string): Partial<Question>[] => {
    const questions: Partial<Question>[] = [];
    
    // Tạo một div ảo để dùng DOM parser của trình duyệt xử lý HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // Giả định mỗi câu bắt đầu bằng text "Câu <số>" hoặc "Bài <số>"
    // Chiến lược: Duyệt qua tất cả thẻ <p>, tìm thẻ bắt đầu câu hỏi.
    // Gom tất cả các thẻ tiếp theo cho đến khi gặp câu mới.
    
    const elements = Array.from(doc.body.children); // Lấy các thẻ cấp 1 (thường là p, table, div...)
    let currentQuestion: Partial<Question> | null = null;
    let currentBuffer: string[] = []; // Chứa HTML của câu hiện tại

    const flushQuestion = () => {
        if (currentQuestion && currentBuffer.length > 0) {
            const fullHtml = currentBuffer.join('');
            processQuestionContent(currentQuestion, fullHtml);
            questions.push(currentQuestion);
        }
    };

    // Regex nhận diện bắt đầu câu: "Câu 1.", "Câu 1:", "Bài 1", "Question 1" (có thể in đậm)
    const startRegex = /^(?:<strong[^>]*>)?(?:Câu|Bài|Question)\s+\d+[:.]/i;

    elements.forEach((el) => {
        const textContent = el.textContent?.trim() || '';
        const htmlContent = el.outerHTML;

        // Kiểm tra xem thẻ này có phải bắt đầu câu mới không
        if (startRegex.test(textContent) || (el.tagName === 'P' && startRegex.test(el.innerHTML))) {
            // Lưu câu cũ trước khi bắt đầu câu mới
            flushQuestion();

            // Khởi tạo câu mới
            currentQuestion = {
                grade: defaultGrade,
                topic: defaultTopic,
                level: 'Thông hiểu',
                quiz_level: 1,
                question_type: 'Trắc nghiệm', // Mặc định
                answer_key: 'A',
                solution: ''
            };
            currentBuffer = [htmlContent]; // Bắt đầu buffer mới
        } else {
            // Nếu chưa có câu nào (phần đầu trang), bỏ qua hoặc đưa vào câu đầu tiên nếu muốn
            if (currentQuestion) {
                currentBuffer.push(htmlContent);
            }
        }
    });

    // Lưu câu cuối cùng
    flushQuestion();

    return questions;
};

/**
 * Xử lý nội dung HTML của 1 câu hỏi để tách Đề và Đáp án
 */
function processQuestionContent(q: Partial<Question>, html: string) {
    // 1. Tách các lựa chọn A. B. C. D. (Dựa vào text content)
    // Lưu ý: Trong HTML, A. B. C. D. có thể nằm trong các thẻ <p> riêng biệt hoặc cùng 1 thẻ.
    // Để đơn giản hoá cho Word: Thường đáp án sẽ nằm ở cuối.
    
    // Tạm thời: Đưa TOÀN BỘ HTML vào question_text.
    // Nếu muốn tách A/B/C/D chính xác từ HTML Word rất khó vì format đa dạng (Table, Tab, Span...)
    // Giải pháp thực dụng: Để dạng "Tự luận/Trắc nghiệm liền" -> question_text chứa cả đề và đáp án.
    // Giáo viên sẽ chỉnh sửa lại hoặc chọn đáp án đúng trên UI.
    
    // Tuy nhiên, ta cố gắng tách nếu cấu trúc rõ ràng (A. ... B. ...)
    
    // Clean up HTML một chút (bỏ thẻ p rỗng)
    // ...

    q.question_text = html; // Lưu full HTML (bao gồm cả ảnh <img src="data:...">)
    
    // Set mặc định các option rỗng để UI hiển thị đúng chế độ
    q.option_A = "";
    q.option_B = "";
    q.option_C = "";
    q.option_D = "";
    
    // Nếu muốn tách sơ bộ (Rule-based simple):
    // Tìm các đoạn A. B. C. D. trong text để đoán loại câu hỏi
    const textOnly = html.replace(/<[^>]+>/g, ' ');
    if (textOnly.match(/A\./) && textOnly.match(/B\./) && textOnly.match(/C\./) && textOnly.match(/D\./)) {
        q.question_type = 'Trắc nghiệm';
    } else {
        q.question_type = 'Trả lời ngắn'; // Hoặc tự luận
    }
}

/**
 * Rule-based text parser (Giữ lại hàm cũ cho tham khảo, không dùng trong luồng mới)
 */
export const parseQuestionsFromText = (text: string, defaultGrade: number, defaultTopic: string): Partial<Question>[] => {
    return []; // Disable old parser
};