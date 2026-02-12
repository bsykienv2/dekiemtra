// services/wordToSheetService.ts

import { parseWordToExam } from './mathWordParserService';
import { SheetQuestion } from '../types';

// ✅ Gọi proxy cùng origin (Vercel serverless): /api/uploadImage
const UPLOAD_PROXY_URL = '/api/uploadImage';

// ============================================================================
// INLINE IMAGE MARKERS
// - From parser: [IMAGE:img_0] or fallback [IMAGE_RID:rId12]
// - After upload: replace -> [IMAGE:<driveFileId>]
// ============================================================================

function replaceInlineImageMarkers(
  input: string,
  imgIdToDriveId: Map<string, string>,
  rIdToDriveId: Map<string, string>
): string {
  if (!input) return '';

  let out = input;

  // [IMAGE:img_0] -> [IMAGE:driveId]
  out = out.replace(/\[IMAGE:(img_\d+)\]/g, (m, imgId: string) => {
    const driveId = imgIdToDriveId.get(imgId);
    return driveId ? `[IMAGE:${driveId}]` : m;
  });

  // [IMAGE_RID:rId12] -> [IMAGE:driveId]
  out = out.replace(/\[IMAGE_RID:(rId\d+)\]/g, (m, rid: string) => {
    const driveId = rIdToDriveId.get(rid);
    return driveId ? `[IMAGE:${driveId}]` : m;
  });

  // cleanup spacing (nhẹ nhàng để không phá LaTeX)
  out = out.replace(/\s+\[IMAGE:/g, ' [IMAGE:');
  out = out.replace(/\]\s+/g, '] ');

  return out.trim();
}

// ============================================================================
// UPLOAD ẢNH (via Vercel Proxy -> Apps Script)
// ============================================================================

async function uploadImageToDrive(imageData: string, fileName: string): Promise<string> {
  console.log(`📤 Uploading: ${fileName}`);

  const res = await fetch(UPLOAD_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData, fileName })
  });

  const text = await res.text();

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Proxy trả không phải JSON: ${text}`);
  }

  if (!res.ok) {
    throw new Error(`Proxy lỗi HTTP ${res.status}: ${text}`);
  }

  if (json.status !== 'success') {
    throw new Error(json.message || 'Upload ảnh thất bại');
  }

  if (!json.data?.fileId) {
    throw new Error('Upload thành công nhưng thiếu fileId');
  }

  console.log(`   ✅ Uploaded: ${fileName} -> ${json.data.fileId}`);
  return json.data.fileId as string;
}

// ============================================================================
// MAIN: Parse Word -> Upload Images -> Replace Markers -> Return SheetQuestions
// ============================================================================

export async function parseWordToSheetQuestions(file: File): Promise<SheetQuestion[]> {
  // 1) Parse Word => ExamData (có images[] và text chứa marker)
  const examData = await parseWordToExam(file);

  // 2) Upload tất cả images lên Drive
  const imageIdMap = new Map<string, string>(); // img_0 -> driveId
  const rIdToDriveId = new Map<string, string>(); // rId12 -> driveId

  if (examData.images && examData.images.length > 0) {
    console.log(`📤 Uploading ${examData.images.length} images to Google Drive...`);

    let uploadedCount = 0;
    const failedUploads: string[] = [];

    for (let i = 0; i < examData.images.length; i++) {
      const img = examData.images[i];

      if (!img.base64) {
        console.warn(`⚠️ Skipping ${img.id} - no base64 data`);
        failedUploads.push(`${img.id} (no data)`);
        continue;
      }

      try {
        const base64Data = `data:${img.contentType};base64,${img.base64}`;
        const fileName = img.filename || `${img.id}.png`;

        console.log(`[${i + 1}/${examData.images.length}] Uploading ${fileName}...`);

        const driveId = await uploadImageToDrive(base64Data, fileName);

        imageIdMap.set(img.id, driveId);

        const rid = (img as any).rId || (img as any).rid || '';
        if (rid) rIdToDriveId.set(String(rid), driveId);

        uploadedCount++;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(`❌ Upload image failed for ${img.filename}:`, errorMsg);
        failedUploads.push(`${img.filename}: ${errorMsg}`);

        // không throw để upload ảnh khác tiếp tục
        console.warn(`⚠️ Image ${img.filename} will be missing in questions`);
      }
    }

    console.log(`\n📊 Upload summary:`);
    console.log(`   ✅ Success: ${uploadedCount}/${examData.images.length}`);
    console.log(`   ❌ Failed: ${failedUploads.length}/${examData.images.length}`);

    // ⚠️ nếu bạn chạy trong React, alert có thể không phù hợp ở service.
    // Nếu muốn giữ alert: bạn có thể bắn lỗi lên UI để toast.
    if (failedUploads.length > 0) {
      console.warn(`\n⚠️ Failed uploads:`, failedUploads);
    } else {
      console.log(`\n🎉 All images uploaded successfully!`);
    }
  }

  // 3) Convert questions -> SheetQuestion[] (thay marker đúng vị trí)
  const sheetQuestions: SheetQuestion[] = examData.questions.map((q, idx) => {
    const questionText = replaceInlineImageMarkers(q.text || '', imageIdMap, rIdToDriveId);

    let optionA = '';
    let optionB = '';
    let optionC = '';
    let optionD = '';

    if (q.options && q.options.length > 0) {
      q.options.forEach((opt) => {
        const optText = replaceInlineImageMarkers(opt.text || '', imageIdMap, rIdToDriveId);
        const letter = String(opt.letter || '').toUpperCase();
        if (letter === 'A') optionA = optText;
        else if (letter === 'B') optionB = optText;
        else if (letter === 'C') optionC = optText;
        else if (letter === 'D') optionD = optText;
      });
    }

    const answerKey = q.correctAnswer ? String(q.correctAnswer).trim() : 'A';

    return {
      exam_id: `Q${Date.now()}_${idx}`,
      level: 'Thông hiểu',
      question_type:
        q.type === 'multiple_choice'
          ? 'Trắc nghiệm'
          : q.type === 'true_false'
          ? 'Đúng sai'
          : q.type === 'short_answer'
          ? 'Trả lời ngắn'
          : 'Trắc nghiệm',
      question_text: questionText,

      // inline images nằm trong text => cột image_id để rỗng
      image_id: '',

      option_A: optionA,
      option_B: optionB,
      option_C: optionC,
      option_D: optionD,
      answer_key: answerKey,
      solution: replaceInlineImageMarkers(q.solution || '', imageIdMap, rIdToDriveId),
      topic: '',
      grade: 12,
      quiz_level: 1
    };
  });

  return sheetQuestions;
}
