// ============================================================================
// WORD IMPORT COMPONENT - WITH IMAGE UPLOAD TO DRIVE
// Dùng service mới: wordToSheetIntegration.ts
// ============================================================================

import React, { useState } from 'react';
import { Upload, CheckCircle, XCircle, AlertCircle, Loader2, Image, FileText } from 'lucide-react';
import { importWordToSheetComplete } from '../services/wordToSheetIntegration';

export const WordImportWithImages: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [grade, setGrade] = useState<number>(12);
  const [topic, setTopic] = useState<string>('');
  
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 100, message: '' });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const handleImport = async () => {
    if (!file || !topic.trim()) {
      setError('Vui lòng chọn file và nhập tên chuyên đề');
      return;
    }

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const importResult = await importWordToSheetComplete(
        file,
        grade,
        topic.trim(),
        (current, total, message) => {
          setProgress({ current, total, message });
        }
      );

      setResult(importResult);
      console.log('Import result:', importResult);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      console.error('Import error:', err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-2xl bg-teal-100 flex items-center justify-center">
            <Upload className="text-teal-600" size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900">Import Word File</h2>
            <p className="text-sm text-gray-500">Upload file Word với hình ảnh lên Drive</p>
          </div>
        </div>

        {/* Input Fields */}
        <div className="space-y-4 mb-6">
          {/* Grade */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Khối lớp</label>
            <select
              value={grade}
              onChange={(e) => setGrade(Number(e.target.value))}
              disabled={importing}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-200 outline-none"
            >
              {[6, 7, 8, 9, 10, 11, 12].map(g => (
                <option key={g} value={g}>Lớp {g}</option>
              ))}
            </select>
          </div>

          {/* Topic */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Tên chuyên đề</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={importing}
              placeholder="Ví dụ: Phương trình bậc hai"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-200 outline-none"
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">File Word (.docx)</label>
            <input
              type="file"
              accept=".docx"
              onChange={handleFileChange}
              disabled={importing}
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
            />
            {file && (
              <div className="mt-2 text-sm text-gray-600 flex items-center gap-2">
                <FileText size={16} />
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 flex items-start gap-2">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-bold">Lỗi</div>
              <div className="text-sm mt-1">{error}</div>
            </div>
          </div>
        )}

        {/* Progress */}
        {importing && (
          <div className="mb-6 p-4 rounded-2xl bg-blue-50 border border-blue-200">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="animate-spin text-blue-600" size={20} />
              <div className="font-bold text-blue-900">{progress.message}</div>
            </div>
            <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-2 bg-blue-600 transition-all duration-300"
                style={{ width: `${progress.current}%` }}
              />
            </div>
            <div className="text-xs text-blue-700 mt-1 text-right">
              {Math.round(progress.current)}%
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mb-6 space-y-4">
            {/* Image Upload Stats */}
            <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200">
              <div className="flex items-center gap-2 mb-3">
                <Image className="text-purple-600" size={20} />
                <div className="font-bold text-purple-900">Kết quả upload ảnh</div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="text-center p-3 bg-white rounded-xl border border-purple-100">
                  <div className="text-2xl font-black text-purple-600">
                    {result.imageUploadStats.total}
                  </div>
                  <div className="text-purple-700 mt-1">Tổng ảnh</div>
                </div>
                <div className="text-center p-3 bg-white rounded-xl border border-green-100">
                  <div className="text-2xl font-black text-green-600">
                    {result.imageUploadStats.uploaded}
                  </div>
                  <div className="text-green-700 mt-1">Đã upload</div>
                </div>
                <div className="text-center p-3 bg-white rounded-xl border border-red-100">
                  <div className="text-2xl font-black text-red-600">
                    {result.imageUploadStats.failed}
                  </div>
                  <div className="text-red-700 mt-1">Thất bại</div>
                </div>
              </div>
            </div>

            {/* Question Save Stats */}
            <div className="p-4 rounded-2xl bg-green-50 border border-green-200">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="text-green-600" size={20} />
                <div className="font-bold text-green-900">Kết quả lưu câu hỏi</div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="text-center p-3 bg-white rounded-xl border border-green-100">
                  <div className="text-2xl font-black text-green-600">
                    {result.uploadResult.success}
                  </div>
                  <div className="text-green-700 mt-1">Thành công</div>
                </div>
                <div className="text-center p-3 bg-white rounded-xl border border-red-100">
                  <div className="text-2xl font-black text-red-600">
                    {result.uploadResult.failed}
                  </div>
                  <div className="text-red-700 mt-1">Thất bại</div>
                </div>
              </div>
              
              {result.uploadResult.errors && result.uploadResult.errors.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-red-600 cursor-pointer hover:text-red-700">
                    Xem chi tiết lỗi ({result.uploadResult.errors.length})
                  </summary>
                  <div className="mt-2 p-3 bg-red-50 rounded-xl border border-red-100 text-xs text-red-700 space-y-1 max-h-40 overflow-auto">
                    {result.uploadResult.errors.map((err: string, idx: number) => (
                      <div key={idx}>• {err}</div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* Success Message */}
            {result.uploadResult.success > 0 && (
              <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800">
                <div className="font-bold mb-1">🎉 Import thành công!</div>
                <div className="text-sm">
                  • {result.examData.questions.length} câu hỏi đã được parse
                  <br />
                  • {result.imageUploadStats.uploaded} ảnh đã upload lên Drive folder "LMS_Images"
                  <br />
                  • {result.uploadResult.success} câu hỏi đã lưu vào Sheet
                  <br />
                  • Kiểm tra Google Drive để xem các ảnh đã upload
                </div>
              </div>
            )}
          </div>
        )}

        {/* Import Button */}
        <button
          onClick={handleImport}
          disabled={importing || !file || !topic.trim()}
          className="w-full py-4 rounded-2xl bg-teal-600 text-white font-black hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {importing ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Đang xử lý...
            </>
          ) : (
            <>
              <Upload size={20} />
              Import Word File
            </>
          )}
        </button>

        {/* Info */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl text-sm text-blue-800">
          <div className="font-bold mb-2">ℹ️ Lưu ý:</div>
          <ul className="list-disc list-inside space-y-1">
            <li>File Word phải có format .docx (không dùng .doc cũ)</li>
            <li>Ảnh trong Word sẽ tự động upload lên Google Drive folder "LMS_Images"</li>
            <li>Câu hỏi sẽ chứa [IMAGE:fileId] để hiển thị ảnh inline</li>
            <li>Hệ thống tự động detect đáp án từ underline trong Word</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default WordImportWithImages;
