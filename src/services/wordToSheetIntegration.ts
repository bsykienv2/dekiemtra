// ============================================================================
// WORD TO SHEET WITH IMAGE UPLOAD - INTEGRATION SERVICE
// Kết hợp mathWordParserService + upload ảnh lên Drive
// ============================================================================

import { parseWordToExam, validateExamData } from './mathWordParserService';
import { Question, ExamData, ImageData } from '../types';
import { GOOGLE_SCRIPT_URL } from './sheetService';

/**
 * Upload một ảnh base64 lên Google Drive
 * @returns Google Drive file ID
 */
async function uploadSingleImage(
  base64Data: string,
  fileName: string,
  onProgress?: (message: string) => void
): Promise<string | null> {
  try {
    if (onProgress) onProgress(`Đang upload ${fileName}...`);

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'uploadImage',
        imageData: `data:image/png;base64,${base64Data}`,
        fileName: fileName
      })
    });

    const result = await response.json();

    if (result.status === 'success' && result.data?.fileId) {
      console.log(`✅ Uploaded: ${fileName} → ${result.data.fileId}`);
      return result.data.fileId;
    } else {
      console.error(`❌ Upload failed: ${fileName}`, result);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error uploading ${fileName}:`, error);
    return null;
  }
}

/**
 * Parse Word file và upload tất cả ảnh lên Drive
 * Trả về câu hỏi với image_id (Google Drive file ID)
 */
export async function parseWordAndUploadImages(
  file: File,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{
  examData: ExamData;
  uploadedImages: Map<string, string>; // imageId -> driveFileId
}> {
  
  console.log('📄 Step 1: Parsing Word file...');
  if (onProgress) onProgress(0, 100, 'Đang đọc file Word...');

  // 1. Parse Word file (extract base64 images)
  const examData = await parseWordToExam(file);
  
  console.log(`✅ Parsed: ${examData.questions.length} questions, ${examData.images?.length || 0} images`);
  if (onProgress) onProgress(30, 100, `Tìm thấy ${examData.questions.length} câu hỏi, ${examData.images?.length || 0} ảnh`);

  const uploadedImages = new Map<string, string>();

  // 2. Upload images to Drive
  if (examData.images && examData.images.length > 0) {
    console.log('📤 Step 2: Uploading images to Drive...');
    if (onProgress) onProgress(40, 100, `Đang upload ${examData.images.length} ảnh lên Drive...`);

    for (let i = 0; i < examData.images.length; i++) {
      const img = examData.images[i];
      const fileName = img.filename || `image_${i + 1}.png`;

      const driveFileId = await uploadSingleImage(
        img.base64,
        fileName,
        (msg) => {
          if (onProgress) {
            const percent = 40 + Math.floor((i / examData.images.length) * 40);
            onProgress(percent, 100, msg);
          }
        }
      );

      if (driveFileId) {
        uploadedImages.set(img.id, driveFileId);
        console.log(`✅ ${i + 1}/${examData.images.length}: ${img.id} → ${driveFileId}`);
      } else {
        console.warn(`⚠️ Failed to upload: ${img.id} (${fileName})`);
      }
    }

    console.log(`✅ Uploaded ${uploadedImages.size}/${examData.images.length} images`);
  }

  if (onProgress) onProgress(80, 100, 'Đang xử lý câu hỏi...');

  // 3. Update questions với Drive file IDs
  examData.questions = examData.questions.map(q => {
    const updatedQuestion = { ...q };

    // Nếu câu hỏi có ảnh
    if (q.images && q.images.length > 0) {
      q.images.forEach(img => {
        const driveFileId = uploadedImages.get(img.id);
        if (driveFileId) {
          // Thêm [IMAGE:driveFileId] vào cuối text nếu chưa có
          if (!updatedQuestion.text.includes('[IMAGE:')) {
            updatedQuestion.text = `${updatedQuestion.text} [IMAGE:${driveFileId}]`;
          }
        }
      });
    }

    return updatedQuestion;
  });

  if (onProgress) onProgress(100, 100, 'Hoàn thành!');

  console.log('✅ All done!');
  return { examData, uploadedImages };
}

/**
 * Convert Question (từ mathWordParserService) sang format Sheet
 */
export function convertToSheetFormat(
  questions: Question[],
  grade: number,
  topic: string,
  uploadedImages: Map<string, string>
): Array<Record<string, any>> {
  
  return questions.map((q, idx) => {
    // Tạo exam_id unique
    const examId = `Q${String(idx + 1).padStart(3, '0')}_${Date.now()}`;

    // Xử lý image_id (lấy Drive file ID đầu tiên nếu có)
    let imageId = '';
    if (q.images && q.images.length > 0) {
      const firstImage = q.images[0];
      imageId = uploadedImages.get(firstImage.id) || '';
    }

    // Convert question type
    let questionType = 'Trắc nghiệm';
    if (q.type === 'true_false') {
      questionType = 'Đúng/Sai';
    } else if (q.type === 'short_answer' || q.type === 'writing') {
      questionType = 'Trả lời ngắn';
    }

    // Xử lý answer key
    let answerKey = q.correctAnswer || 'A';
    if (questionType === 'Đúng/Sai') {
      // Convert "a,b,c" → "Đ-S-Đ-S"
      if (answerKey && answerKey.includes(',')) {
        const trueStatements = answerKey.toLowerCase().split(',');
        const answerArray = ['S', 'S', 'S', 'S'];
        trueStatements.forEach(letter => {
          const index = letter.charCodeAt(0) - 'a'.charCodeAt(0);
          if (index >= 0 && index < 4) {
            answerArray[index] = 'Đ';
          }
        });
        answerKey = answerArray.join('-');
      }
    }

    // Xử lý options
    const optionMap: Record<string, string> = {};
    if (q.options && q.options.length > 0) {
      q.options.forEach(opt => {
        const letter = opt.letter.toUpperCase();
        optionMap[`option_${letter}`] = opt.text || '';
      });
    }

    return {
      exam_id: examId,
      level: 'Thông hiểu',
      question_type: questionType,
      question_text: q.text || '',
      image_id: imageId, // ⭐ Google Drive file ID
      option_A: optionMap.option_A || '',
      option_B: optionMap.option_B || '',
      option_C: optionMap.option_C || '',
      option_D: optionMap.option_D || '',
      answer_key: answerKey,
      solution: q.solution || '',
      topic: topic,
      grade: grade,
      quiz_level: 1
    };
  });
}

/**
 * Save questions to Google Sheet
 */
export async function saveQuestionsToSheet(
  questions: Array<Record<string, any>>,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{
  success: number;
  failed: number;
  errors: string[];
}> {
  
  console.log(`💾 Saving ${questions.length} questions to Sheet...`);
  
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    
    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveQuestion',
          ...q
        })
      });

      const result = await response.json();
      
      if (result.status === 'success') {
        success++;
        console.log(`✅ Saved ${i + 1}/${questions.length}: ${q.exam_id}`);
        
        if (onProgress) {
          const percent = Math.floor((i + 1) / questions.length * 100);
          onProgress(i + 1, questions.length, `Đã lưu ${i + 1}/${questions.length} câu`);
        }
      } else {
        failed++;
        errors.push(`Câu ${i + 1}: ${result.message || 'Unknown error'}`);
        console.error(`❌ Failed ${i + 1}:`, result.message);
      }
    } catch (error) {
      failed++;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Câu ${i + 1}: ${errorMsg}`);
      console.error(`❌ Error saving ${i + 1}:`, error);
    }
  }

  console.log(`✅ Save complete: ${success}/${questions.length} success, ${failed} failed`);
  
  return { success, failed, errors };
}

/**
 * FULL WORKFLOW: Parse Word → Upload Images → Convert → Save to Sheet
 */
export async function importWordToSheetComplete(
  file: File,
  grade: number,
  topic: string,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{
  examData: ExamData;
  sheetQuestions: Array<Record<string, any>>;
  uploadResult: { success: number; failed: number; errors: string[] };
  imageUploadStats: { total: number; uploaded: number; failed: number };
}> {
  
  console.log('🚀 Starting full import workflow...');

  // 1. Parse Word + Upload Images
  const { examData, uploadedImages } = await parseWordAndUploadImages(
    file,
    (current, total, message) => {
      if (onProgress) onProgress(current * 0.6, 100, message); // 0-60%
    }
  );

  if (onProgress) onProgress(60, 100, 'Đang chuyển đổi sang format Sheet...');

  // 2. Convert to Sheet format
  const sheetQuestions = convertToSheetFormat(
    examData.questions,
    grade,
    topic,
    uploadedImages
  );

  console.log(`✅ Converted ${sheetQuestions.length} questions to Sheet format`);

  if (onProgress) onProgress(70, 100, 'Đang lưu vào Google Sheet...');

  // 3. Save to Sheet
  const uploadResult = await saveQuestionsToSheet(
    sheetQuestions,
    (current, total, message) => {
      const percent = 70 + (current / total) * 30; // 70-100%
      if (onProgress) onProgress(percent, 100, message);
    }
  );

  const imageUploadStats = {
    total: examData.images?.length || 0,
    uploaded: uploadedImages.size,
    failed: (examData.images?.length || 0) - uploadedImages.size
  };

  console.log('🎉 Import workflow complete!');
  console.log('   Images:', imageUploadStats);
  console.log('   Questions:', uploadResult);

  return {
    examData,
    sheetQuestions,
    uploadResult,
    imageUploadStats
  };
}
