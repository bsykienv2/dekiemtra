// ============================================================================
// ADMIN PANEL - COMPLETE FULL FEATURES VERSION
// All 4 Tabs: Questions, Theory, Exam Creator, Students
// ============================================================================

import React, { useState, useEffect } from 'react';
import { 
  Trash2, Edit, Plus, CheckCircle, XCircle, RefreshCw, Loader2, 
  Sparkles, Eye, Link as LinkIcon, Copy, Send, LayoutList, GraduationCap, 
  ClipboardList, UserCheck, FileUp, Save, FileType, Layers, AlertCircle, 
  BookOpen, Medal, Ban, Clock, TrendingUp, AlertTriangle, Target, 
  User as UserIcon, ArrowLeft, EyeOff, Zap
} from 'lucide-react';

import { 
  GOOGLE_SCRIPT_URL, createInstantExam, uploadPDFToGAS, 
  fetchAllTheories, saveTheory, deleteTheory, 
  fetchStudentDetail, fetchResultDetail,
  assignExamToClass,
  getAssignmentsByClass,
} from '../services/sheetService';

import { extractHtmlFromDocx, parseQuestionsFromHtml } from '../services/wordService';
import { parseWordToSheetQuestions } from '../services/wordToSheetService';
import ContentWithInlineImages from './ContentWithInlineImages';
import { performOCR, parseQuestionsFromMarkdown, generateTheoryFromAI } from '../services/geminiService';
import MathText from './MathText';
import Button from './Button';
import Loading from './Loading';
import { Question, Theory, StudentDetail, ResultDetail } from '../types';

interface AdminProps {
  onLogout: () => void;
}

const GRADES = [6, 7, 8, 9, 10, 11, 12];
const LEVELS = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'];
const THEORY_LEVELS = [1, 2, 3, 4, 5];

interface ExamStructureItem {
  id: string;
  topic: string;
  level: string;
  count: number;
}


interface GeneratedExamLink {
  name: string;
  link: string;
  examId?: string;
  examTitle?: string;
  grade?: number;
  studentEmail?: string;
  studentName?: string;
}

interface AssignmentItem {
  assignmentId: string;
  examId: string;
  examTitle: string;
  grade: number | string;
  className: string;
  assignedBy: string;
  openAt: string;
  dueAt: string;
  durationMinutes: number;
  maxAttempts: number;
  settings?: any;
  status?: string;
  createdAt?: string;
}


export const AdminPanel: React.FC<AdminProps> = ({ onLogout }) => {
  // ==================== STATE MANAGEMENT ====================
  
  const [activeTab, setActiveTab] = useState<'questions' | 'theory' | 'exam-creator' | 'students'>('questions');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  // Data states
  const [questions, setQuestions] = useState<Question[]>([]);
  const [theories, setTheories] = useState<Theory[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [topics, setTopics] = useState<string[]>([]);

  const classOptions = Array.from(new Set(
    students
      .map((s: any) => String((s.className ?? s.class ?? s.lop ?? s.class_name ?? '')).trim())
      .filter(Boolean)
  )).sort();
  
  // Edit states
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question> | null>(null);
  const [editingTheory, setEditingTheory] = useState<Partial<Theory> | null>(null);
  
  // Student detail states
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [studentDetailData, setStudentDetailData] = useState<StudentDetail | null>(null);
  const [selectedResult, setSelectedResult] = useState<ResultDetail | null>(null);
  const [studentViewMode, setStudentViewMode] = useState<'list' | 'overview' | 'result-detail'>('list');
  
  // AI Theory Generator
  const [theoryGenConfig, setTheoryGenConfig] = useState({ grade: 12, topic: '', level: 1 });
  const [isGeneratingTheory, setIsGeneratingTheory] = useState(false);
  
  // OCR Import
  const [importMode, setImportMode] = useState(false);
  const [importedQuestions, setImportedQuestions] = useState<Partial<Question>[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const [importDefaultGrade, setImportDefaultGrade] = useState(12);
  const [importDefaultTopic, setImportDefaultTopic] = useState('Tổng hợp');
  const [showSettings, setShowSettings] = useState(false);
  // Exam Creator
  const [examConfig, setExamConfig] = useState({ 
    grade: 12, 
    generationMode: 'batch' as 'batch' | 'personalized', 
    batchCount: 4 
  });
  const [builderSelection, setBuilderSelection] = useState({ topic: '', level: 'Thông hiểu', count: 1 });
  const [examStructure, setExamStructure] = useState<ExamStructureItem[]>([]);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [generatedBatchResult, setGeneratedBatchResult] = useState<GeneratedExamLink[]>([]);


  // LMS Assignments (Giao đề cho lớp)
  const [assignClassName, setAssignClassName] = useState<string>('');
  const [assignOpenAt, setAssignOpenAt] = useState<string>(''); // ISO or empty => now
  const [assignDueAt, setAssignDueAt] = useState<string>('');
  const [assignDurationMinutes, setAssignDurationMinutes] = useState<number>(45);
  const [assignMaxAttempts, setAssignMaxAttempts] = useState<number>(1);
  const [assignSettings, setAssignSettings] = useState({ shuffleQuestions: true, shuffleOptions: true, showAnswerAfter: false });

  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [assignmentClassFilter, setAssignmentClassFilter] = useState<string>('');
  const [isLoadingAssignments, setIsLoadingAssignments] = useState<boolean>(false);

  // ==================== LOAD DATA ====================
  
  useEffect(() => {
    if (questions.length === 0) loadQuestions();
    if (activeTab === 'theory' && theories.length === 0) loadTheories();

    const needStudents =
      (activeTab === 'students' && studentViewMode === 'list') ||
      activeTab === 'exam-creator';

    if (needStudents && students.length === 0) loadStudents();

    if (activeTab === 'exam-creator') loadTopics(examConfig.grade);
  }, [activeTab, studentViewMode, examConfig.grade]);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getAllQuestions`);
      const data = await res.json();
      if (data.status === 'success') setQuestions(data.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadTheories = async () => {
    setLoading(true);
    try {
      const data = await fetchAllTheories();
      setTheories(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadStudents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getAllStudents`);
      const data = await res.json();
      if (data.status === 'success') setStudents(data.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadTopics = async (grade: number) => {
    try {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getTopics&grade=${grade}`);
      const data = await res.json();
      if (data.status === 'success') setTopics(data.data);
    } catch (e) { console.error(e); }
  };

  // ==================== QUESTION HANDLERS ====================

  const handleSaveEdit = async () => {
    if (!editingQuestion) return;
    setLoading(true);
    try {
      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'saveQuestion', ...editingQuestion })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setMessage({ type: 'success', text: 'Đã lưu câu hỏi thành công!' });
        setEditingQuestion(null);
        loadQuestions();
      }
    } catch (e) { setMessage({ type: 'error', text: 'Lỗi khi lưu câu hỏi' }); }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xác nhận xóa câu hỏi này?')) return;
    setLoading(true);
    await fetch(`${GOOGLE_SCRIPT_URL}?action=deleteQuestion&exam_id=${id}`);
    loadQuestions();
  };

  // ==================== THEORY HANDLERS ====================

  const handleGenerateTheory = async () => {
    if (!theoryGenConfig.topic) {
      alert('Vui lòng nhập chủ đề');
      return;
    }

    setIsGeneratingTheory(true);
    try {
      const generated = await generateTheoryFromAI(
        theoryGenConfig.grade,
        theoryGenConfig.topic,
        theoryGenConfig.level
      );

      if (generated) {
        setEditingTheory(generated);
        setMessage({ type: 'success', text: 'Đã tạo lý thuyết từ AI! Hãy kiểm tra và chỉnh sửa.' });
      } else {
        setMessage({ type: 'error', text: 'Không thể tạo lý thuyết. Vui lòng thử lại.' });
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Lỗi khi gọi AI' });
    }
    setIsGeneratingTheory(false);
  };

  const handleSaveTheory = async () => {
    if (!editingTheory || !editingTheory.title || !editingTheory.content) {
      alert('Vui lòng điền đầy đủ tiêu đề và nội dung');
      return;
    }

    setLoading(true);
    try {
      const success = await saveTheory(editingTheory);
      if (success) {
        setMessage({ type: 'success', text: 'Đã lưu lý thuyết thành công!' });
        setEditingTheory(null);
        loadTheories();
      } else {
        setMessage({ type: 'error', text: 'Lỗi khi lưu lý thuyết' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Lỗi khi lưu lý thuyết' });
    }
    setLoading(false);
  };

  const handleDeleteTheory = async (id: string) => {
    if (!confirm('Xác nhận xóa lý thuyết này?')) return;
    setLoading(true);
    const success = await deleteTheory(id);
    if (success) {
      setMessage({ type: 'success', text: 'Đã xóa lý thuyết' });
      loadTheories();
    } else {
      setMessage({ type: 'error', text: 'Lỗi khi xóa' });
    }
    setLoading(false);
  };

  // ==================== STUDENT DETAIL HANDLERS ====================

  const handleViewStudentDetail = async (email: string) => {
    setLoading(true);
    setSelectedStudent(email);
    const data = await fetchStudentDetail(email);
    setStudentDetailData(data);
    setStudentViewMode('overview');
    setLoading(false);
  };

  const handleViewResultDetail = async (resultId: string) => {
    setLoading(true);
    const detail = await fetchResultDetail(resultId);
    setSelectedResult(detail);
    setStudentViewMode('result-detail');
    setLoading(false);
  };

  const handleBackToStudentList = () => {
    setStudentViewMode('list');
    setSelectedStudent(null);
    setStudentDetailData(null);
    setSelectedResult(null);
  };

  const handleBackToStudentOverview = () => {
    setStudentViewMode('overview');
    setSelectedResult(null);
  };

  // ==================== UTILITY FUNCTIONS ====================

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}p ${secs}s`;
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('vi-VN', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return dateStr;
    }
  };

  const getViolationIcon = (type: string) => {
    switch(type) {
      case 'tab_switch': return <Ban className="text-orange-500" size={16} />;
      case 'session_conflict': return <AlertTriangle className="text-red-500" size={16} />;
      default: return <AlertCircle className="text-gray-500" size={16} />;
    }
  };

  const getViolationLabel = (type: string) => {
    const labels: Record<string, string> = {
      'tab_switch': 'Chuyển tab',
      'session_conflict': 'Đăng nhập đồng thời',
      'copy_paste': 'Copy/Paste',
      'devtools': 'Mở DevTools',
      'timeout': 'Hết giờ'
    };
    return labels[type] || type;
  };

  // ==================== FILE IMPORT HANDLERS ====================

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  setIsProcessingFile(true);
  setImportedQuestions([]);
  setImportStatus('Đang phân tích file...');

  try {
    let extractedQs: Partial<Question>[] = [];

    if (file.name.endsWith('.docx')) {
      // ✨ MỚI: Dùng wordToSheetService
      setImportStatus('Đang đọc file Word...');
      
      extractedQs = await parseWordToSheetQuestions(
        file,
        importDefaultGrade,
        importDefaultTopic,
        (current, total, message) => {
          setImportStatus(`${message} (${current}%)`);
        }
      );
      
      console.log(`✓ Parsed ${extractedQs.length} questions from Word`);
    } 
    else if (file.name.toLowerCase().endsWith('.pdf')) {
      setImportStatus('Đang tải PDF lên Server OCR...');
      const ocrResult = await uploadPDFToGAS(file);
      setImportStatus('Đang xử lý kết quả OCR...');
      extractedQs = await parseQuestionsFromMarkdown(ocrResult.allMarkdownDataUri, importDefaultGrade, importDefaultTopic);
    } 
    else if (file.type.startsWith('image/') || /\.(jpg|jpeg|png)$/i.test(file.name)) {
      setImportStatus('Đang nhận diện hình ảnh...');
      const base64 = await fileToBase64(file);
      const mime = file.type || (file.name.endsWith('.png') ? 'image/png' : 'image/jpeg');
      const text = await performOCR(base64, mime);
      if (text) {
        setImportStatus('Đang chuẩn hóa LaTeX...');
        extractedQs = await parseQuestionsFromMarkdown(text, importDefaultGrade, importDefaultTopic);
      }
    }

    setImportedQuestions(extractedQs);
    
    if (extractedQs.length > 0) {
      setMessage({ 
        type: 'success', 
        text: `✓ Đã trích xuất ${extractedQs.length} câu hỏi! ${file.name.endsWith('.docx') ? '(Bao gồm ảnh inline)' : ''}` 
      });
    } else {
      setMessage({ 
        type: 'error', 
        text: 'Không tìm thấy câu hỏi nào hoặc cấu trúc file không hợp lệ.' 
      });
    }
  } catch (err: any) {
    console.error(err);
    setMessage({ 
      type: 'error', 
      text: `Lỗi: ${err.message || 'Không thể đọc file'}` 
    });
  } finally {
    setIsProcessingFile(false);
    setImportStatus('');
    e.target.value = ''; // Reset input
  }
};

  const handleSaveImported = async () => {
    if (importedQuestions.length === 0) return;
    if (!confirm(`Xác nhận lưu ${importedQuestions.length} câu hỏi vào ngân hàng?`)) return;

    setLoading(true);
    let successCount = 0;
    
    for (const q of importedQuestions) {
       try {
         await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'saveQuestion', ...q })
         });
         successCount++;
       } catch (e) { console.error(e); }
    }

    setLoading(false);
    setMessage({ type: 'success', text: `Đã lưu thành công ${successCount}/${importedQuestions.length} câu hỏi!` });
    setImportMode(false);
    setImportedQuestions([]);
    loadQuestions();
  };

  const removeImportedQuestion = (index: number) => {
    const newQs = [...importedQuestions];
    newQs.splice(index, 1);
    setImportedQuestions(newQs);
  };

  // ==================== EXAM CREATOR HANDLERS ====================

  const getAvailableCount = (topic: string, level: string) => {
    return questions.filter(q => 
      Number(q.grade) === examConfig.grade && 
      q.topic === topic && 
      q.level === level
    ).length;
  };

  const getTopicTotalCount = (topic: string) => {
    return questions.filter(q => 
      Number(q.grade) === examConfig.grade && 
      q.topic === topic
    ).length;
  };

  const handleAddStructure = () => {
    if (!builderSelection.topic) { alert('Vui lòng chọn chủ đề'); return; }
    
    const available = getAvailableCount(builderSelection.topic, builderSelection.level);
    if (available === 0) { alert('Không có câu hỏi nào trong kho cho lựa chọn này!'); return; }
    if (builderSelection.count > available) { alert(`Chỉ còn ${available} câu hỏi khả dụng!`); return; }
    if (builderSelection.count <= 0) { alert('Số lượng phải lớn hơn 0'); return; }

    const newItem: ExamStructureItem = {
      id: Date.now().toString(),
      topic: builderSelection.topic,
      level: builderSelection.level,
      count: Number(builderSelection.count)
    };

    setExamStructure([...examStructure, newItem]);
  };

  const handleRemoveStructure = (id: string) => {
    setExamStructure(examStructure.filter(item => item.id !== id));
  };

  const getTotalExamQuestions = () => examStructure.reduce((sum, item) => sum + item.count, 0);

  const generateExams = async () => {
    if (examStructure.length === 0) { alert('Vui lòng thêm ít nhất một nhóm câu hỏi vào cấu trúc đề.'); return; }
    
    setIsGeneratingBatch(true);
    setGeneratedBatchResult([]);

    try {
      const results: GeneratedExamLink[] = [];
      
      const masterPool: Record<string, Question[]> = {};
      examStructure.forEach(req => {
         const key = `${req.topic}_${req.level}`;
         if (!masterPool[key]) {
            masterPool[key] = questions.filter(q => 
               Number(q.grade) === examConfig.grade && 
               q.topic === req.topic && 
               q.level === req.level
            );
         }
      });

      const generateSingleExamSet = (): Question[] => {
         let examQuestions: Question[] = [];
         
         examStructure.forEach(req => {
            const key = `${req.topic}_${req.level}`;
            const pool = masterPool[key] || [];
            const selected = [...pool].sort(() => 0.5 - Math.random()).slice(0, req.count);
            examQuestions = [...examQuestions, ...selected];
         });
         
         return examQuestions.sort(() => 0.5 - Math.random());
      };

      if (examConfig.generationMode === 'batch') {
        for (let i = 1; i <= examConfig.batchCount; i++) {
          const examSet = generateSingleExamSet();
          const exam = await createInstantExam(`Đề ${100 + i} - Tổng hợp`, examConfig.grade, examSet);
          if (exam) {
            results.push({ 
              name: `Mã đề ${100 + i}`, 
              examId: exam.examId,
              examTitle: `Đề ${100 + i} - Tổng hợp`,
              grade: examConfig.grade,
              link: `${window.location.origin}${window.location.pathname}?examId=${exam.examId}` 
            });
          }
        }
      } else {
        for (const student of students) {
          const examSet = generateSingleExamSet();
          const exam = await createInstantExam(`Đề của: ${student.name}`, examConfig.grade, examSet);
          if (exam) {
            results.push({ 
              name: `HS: ${student.name}`, 
              studentName: student.name,
              studentEmail: student.email,
              examId: exam.examId,
              examTitle: `Đề của: ${student.name}`,
              grade: examConfig.grade,
              link: `${window.location.origin}${window.location.pathname}?examId=${exam.examId}` 
            });
          }
        }
      }
      
      setGeneratedBatchResult(results);
      setMessage({ type: 'success', text: `Đã tạo thành công ${results.length} đề thi!` });
    } catch (e) { 
        console.error(e);
        alert('Lỗi khi tạo đề thi'); 
    }
    setIsGeneratingBatch(false);
  };

  // ==================== LMS: ASSIGNMENTS ====================

  const handleAssignExamToClass = async (exam: GeneratedExamLink) => {
    if (!exam.examId) { alert('Thiếu examId'); return; }
    if (!assignClassName.trim()) { alert('Vui lòng chọn/nhập lớp'); return; }

    setLoading(true);
    try {
      const payload = {
        examId: exam.examId,
        examTitle: exam.examTitle || exam.name,
        grade: exam.grade ?? examConfig.grade,
        className: assignClassName.trim(),
        openAt: assignOpenAt ? new Date(assignOpenAt).toISOString() : new Date().toISOString(),
        dueAt: assignDueAt ? new Date(assignDueAt).toISOString() : '',
        durationMinutes: Number(assignDurationMinutes) || 45,
        maxAttempts: Number(assignMaxAttempts) || 1,
        settings: assignSettings
      };

      const res = await assignExamToClass(payload);
      if (res) {
        setMessage({ type: 'success', text: `Đã giao đề "${payload.examTitle}" cho lớp ${payload.className}` });
        // refresh list
        if (assignmentClassFilter.trim() === payload.className.trim()) {
          await loadAssignments(payload.className.trim());
        }
      } else {
        setMessage({ type: 'error', text: 'Giao đề thất bại (API trả về null)' });
      }
    } catch (e: any) {
      console.error(e);
      setMessage({ type: 'error', text: e?.message || 'Lỗi khi giao đề' });
    }
    setLoading(false);
  };

  const loadAssignments = async (className: string) => {
    if (!className.trim()) return;
    setIsLoadingAssignments(true);
    try {
      const res = await getAssignmentsByClass(className.trim());
      setAssignments(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error(e);
      setAssignments([]);
    }
    setIsLoadingAssignments(false);
  };

// ==================== RENDER FUNCTIONS ====================

  const renderStudentResultDetail = () => {
    if (!selectedResult) return null;

    return (
      <div className="space-y-6">
        <button onClick={handleBackToStudentOverview} className="flex items-center gap-2 text-teal-600 hover:text-teal-800 font-bold">
          <ArrowLeft size={20} /> Quay lại tổng quan
        </button>

        <div className="bg-white rounded-3xl shadow-lg p-8 border border-slate-200">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-black text-slate-800 mb-2">Chi tiết bài làm</h2>
              <p className="text-slate-500">{selectedResult.topic} • Level {selectedResult.level} • {formatDate(selectedResult.timestamp)}</p>
            </div>
            <div className="text-right">
              <div className={`text-5xl font-black mb-2 ${selectedResult.status === 'PASS' ? 'text-green-600' : 'text-red-600'}`}>
                {selectedResult.percentage}%
              </div>
              <div className="text-sm text-slate-500">{selectedResult.score}/{selectedResult.total} câu đúng</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <Clock size={18} />
                <span className="text-xs font-bold uppercase">Thời gian</span>
              </div>
              <div className="text-xl font-black text-slate-800">{formatTime(selectedResult.timeSpent)}</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
              <div className="flex items-center gap-2 text-purple-600 mb-1">
                <Target size={18} />
                <span className="text-xs font-bold uppercase">Trạng thái</span>
              </div>
              <div className="text-xl font-black text-slate-800">{selectedResult.status}</div>
            </div>
            <div className={`p-4 rounded-2xl border ${selectedResult.submissionReason === 'normal' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
              <div className={`flex items-center gap-2 mb-1 ${selectedResult.submissionReason === 'normal' ? 'text-green-600' : 'text-red-600'}`}>
                <AlertCircle size={18} />
                <span className="text-xs font-bold uppercase">Nộp bài</span>
              </div>
              <div className="text-lg font-black text-slate-800">
                {selectedResult.submissionReason === 'normal' ? 'Bình thường' : selectedResult.submissionReason === 'cheat_tab' ? 'Thoát tab' : selectedResult.submissionReason === 'cheat_conflict' ? 'Đăng nhập khác' : 'Khác'}
              </div>
            </div>
          </div>

          <h3 className="text-xl font-black text-slate-800 mb-4">Chi tiết từng câu hỏi</h3>
          
          <div className="space-y-4">
            {selectedResult.detailedAnswers.map((ans, idx) => {
              const q = ans.questionDetails;
              if (!q) return null;

              return (
                <div key={idx} className={`p-6 rounded-2xl border-2 ${ans.correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${ans.correct ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                        {idx + 1}
                      </div>
                      <div>
                        <span className={`text-xs font-black uppercase px-2 py-1 rounded ${ans.correct ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                          {ans.correct ? 'Đúng' : 'Sai'}
                        </span>
                      </div>
                    </div>
                    <div className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded">
                      {q.question_type}
                    </div>
                  </div>

                  <div className="mb-4 text-slate-900 font-medium">
                    <MathText content={q.question_text} />
                  </div>

                  {q.question_type === 'Trắc nghiệm' && (
                    <div className="grid grid-cols-2 gap-3">
                      {['A', 'B', 'C', 'D'].map(opt => {
                        const isUserAnswer = ans.userAnswer === opt;
                        const isCorrectAnswer = q.answer_key === opt;
                        const optionKey = `option_${opt}` as keyof typeof q;
                        
                        return (
                          <div key={opt} className={`p-3 rounded-xl border-2 ${isCorrectAnswer ? 'border-green-500 bg-green-100' : isUserAnswer ? 'border-red-500 bg-red-100' : 'border-slate-200 bg-white'}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-black">{opt}.</span>
                              {isCorrectAnswer && <CheckCircle size={16} className="text-green-600" />}
                              {isUserAnswer && !isCorrectAnswer && <XCircle size={16} className="text-red-600" />}
                            </div>
                            <div className="text-sm">
                              <MathText content={String(q[optionKey] || '')} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.question_type === 'Đúng/Sai' && (
                    <div className="space-y-2">
                      {['A', 'B', 'C', 'D'].map((part, pIdx) => {
                        const userParts = (ans.userAnswer || 'N-N-N-N').split('-');
                        const correctParts = (q.answer_key || 'N-N-N-N').split('-');
                        const optionKey = `option_${part}` as keyof typeof q;
                        
                        return (
                          <div key={part} className="flex items-center gap-3 p-2">
                            <span className="font-bold w-6">{part})</span>
                            <div className="flex-1 text-sm">
                              <MathText content={String(q[optionKey] || '')} />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${correctParts[pIdx] === 'Đ' ? 'bg-green-200 text-green-800' : 'bg-orange-200 text-orange-800'}`}>
                                Đáp án: {correctParts[pIdx] === 'Đ' ? 'Đúng' : 'Sai'}
                              </span>
                              <span className={`px-2 py-1 rounded text-xs font-bold ${userParts[pIdx] === correctParts[pIdx] ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                Chọn: {userParts[pIdx] === 'Đ' ? 'Đúng' : userParts[pIdx] === 'S' ? 'Sai' : 'Chưa chọn'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.question_type === 'Trả lời ngắn' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-red-100 border border-red-200 rounded-xl">
                        <div className="text-xs font-bold text-red-800 mb-1">Trả lời của học sinh:</div>
                        <div className="font-mono font-bold text-red-900">{ans.userAnswer || '(Không trả lời)'}</div>
                      </div>
                      <div className="p-3 bg-green-100 border border-green-200 rounded-xl">
                        <div className="text-xs font-bold text-green-800 mb-1">Đáp án đúng:</div>
                        <div className="font-mono font-bold text-green-900">{q.answer_key}</div>
                      </div>
                    </div>
                  )}

                  {q.solution && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                      <div className="text-xs font-bold text-blue-800 mb-2">💡 Lời giải:</div>
                      <div className="text-sm text-slate-700">
                        <MathText content={q.solution} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderStudentOverview = () => {
    if (!studentDetailData) return null;

    const { student, results, violations, stats } = studentDetailData;

    return (
      <div className="space-y-6">
        <button onClick={handleBackToStudentList} className="flex items-center gap-2 text-slate-600 hover:text-teal-600 font-bold">
          <ArrowLeft size={20} /> Quay lại danh sách
        </button>

        <div className="bg-gradient-to-r from-teal-500 to-blue-500 rounded-3xl p-8 text-white shadow-xl">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center">
              <UserIcon size={48} className="text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-black mb-2">{student.name}</h1>
              <div className="flex gap-4 text-white/90">
                <span>📧 {student.email}</span>
                <span>🎓 Lớp {student.class}</span>
                <span>⭐ Điểm: {student.totalScore}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Target className="text-blue-600" size={24} />
              </div>
              <div>
                <div className="text-2xl font-black text-slate-800">{stats.totalAttempts}</div>
                <div className="text-xs text-slate-500 font-bold uppercase">Lần làm bài</div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-green-100 rounded-xl">
                <CheckCircle className="text-green-600" size={24} />
              </div>
              <div>
                <div className="text-2xl font-black text-slate-800">{stats.passedAttempts}</div>
                <div className="text-xs text-slate-500 font-bold uppercase">Đạt yêu cầu</div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-purple-100 rounded-xl">
                <TrendingUp className="text-purple-600" size={24} />
              </div>
              <div>
                <div className="text-2xl font-black text-slate-800">{stats.avgPercentage}%</div>
                <div className="text-xs text-slate-500 font-bold uppercase">Điểm TB</div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-3 rounded-xl ${stats.totalViolations > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                <AlertTriangle className={stats.totalViolations > 0 ? 'text-red-600' : 'text-gray-400'} size={24} />
              </div>
              <div>
                <div className="text-2xl font-black text-slate-800">{stats.totalViolations}</div>
                <div className="text-xs text-slate-500 font-bold uppercase">Vi phạm</div>
              </div>
            </div>
          </div>
        </div>

        {violations.length > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6">
            <h3 className="text-lg font-black text-red-800 mb-4 flex items-center gap-2">
              <AlertTriangle size={20} /> Cảnh báo vi phạm
            </h3>
            <div className="space-y-2">
              {violations.slice(0, 5).map((v, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-xl">
                  {getViolationIcon(v.type)}
                  <div className="flex-1">
                    <span className="font-bold text-slate-800">{getViolationLabel(v.type)}</span>
                    {v.topic && <span className="text-slate-500 ml-2">• {v.topic}</span>}
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(v.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-lg p-6 border border-slate-200">
          <h3 className="text-xl font-black text-slate-800 mb-6">Lịch sử làm bài</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b-2 border-slate-200">
                <tr>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase">Thời gian</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase">Chủ đề</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase">Level</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase text-center">Kết quả</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase text-center">Tình trạng</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((result, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="p-4 text-sm text-slate-600">{formatDate(result.timestamp)}</td>
                    <td className="p-4">
                      <div className="font-bold text-slate-800">{result.topic}</div>
                      <div className="text-xs text-slate-400">Lớp {result.grade}</div>
                    </td>
                    <td className="p-4">
                      <span className="bg-teal-100 text-teal-700 text-xs font-bold px-2 py-1 rounded">Level {result.level}</span>
                    </td>
                    <td className="p-4 text-center">
                      <div className={`text-2xl font-black ${result.passed ? 'text-green-600' : 'text-red-600'}`}>{result.percentage}%</div>
                      <div className="text-xs text-slate-500">{result.score}/{result.totalQuestions}</div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${result.submissionReason === 'normal' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {result.submissionReason === 'normal' ? '✓ Bình thường' : result.submissionReason === 'cheat_tab' ? '⚠ Thoát tab' : result.submissionReason === 'cheat_conflict' ? '⚠ Đa thiết bị' : 'Khác'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => handleViewResultDetail(result.resultId || '')} className="px-4 py-2 bg-teal-100 text-teal-700 rounded-xl font-bold hover:bg-teal-200 transition flex items-center gap-2 ml-auto">
                        <Eye size={16} /> Xem chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ==================== MAIN RENDER ====================

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <GraduationCap className="text-teal-600" size={32} />
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            Hệ thống Quản trị <span className="text-teal-500 font-medium">| Thầy Phúc Rùa</span>
          </h1>
        </div>
        <button onClick={onLogout} className="px-5 py-2 text-slate-500 hover:text-red-600 font-bold border border-slate-200 rounded-xl transition hover:bg-red-50">
          Đăng xuất
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 bg-white border-r border-slate-200 p-6 space-y-3 shadow-sm">
          {[
            { id: 'questions', icon: ClipboardList, label: 'Ngân hàng câu hỏi' },
            { id: 'theory', icon: BookOpen, label: 'Ngân hàng lý thuyết' },
            { id: 'exam-creator', icon: Sparkles, label: 'Giao đề thi' },
            { id: 'students', icon: UserCheck, label: 'Theo dõi học sinh' }
          ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              className={`w-full text-left px-5 py-4 rounded-2xl font-bold flex items-center gap-4 transition-all ${
                activeTab === tab.id 
                  ? 'bg-teal-600 text-white shadow-lg shadow-teal-100' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-teal-600'
              }`}
            >
              <tab.icon size={22} /> {tab.label}
            </button>
          ))}
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-y-auto bg-[#f8fafc]">
          {/* Message Alert */}
          {message && (
            <div className={`mb-8 p-5 rounded-2xl flex justify-between items-center animate-fade-in ${
              message.type === 'success' 
                ? 'bg-green-50 text-green-700 border border-green-200' 
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              <span className="font-bold flex items-center gap-2">
                {message.type === 'success' ? <CheckCircle size={20}/> : <XCircle size={20}/>} 
                {message.text}
              </span>
              <button onClick={() => setMessage(null)} className="opacity-50 hover:opacity-100">
                <XCircle size={18}/>
              </button>
            </div>
          )}

          {/* TAB: QUESTIONS */}
          {activeTab === 'questions' && (
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-black text-slate-800">Ngân hàng câu hỏi</h2>
                  <p className="text-slate-400 font-medium">Quản lý và biên tập nội dung học liệu toán học</p>
                </div>
                <div className="flex gap-3">
                   <Button onClick={() => setImportMode(true)} variant="secondary" className="flex items-center gap-2 border-2 border-teal-200 bg-white hover:bg-teal-50">
                     <FileUp size={20}/> Nhập từ File (OCR)
                   </Button>
                   <Button onClick={() => setEditingQuestion({ question_type: 'Trắc nghiệm', grade: 12, topic: 'Hàm số', level: 'Thông hiểu', quiz_level: 1 })} variant="primary" className="flex items-center gap-2">
                     <Plus size={20}/> Thêm thủ công
                   </Button>
                   <button onClick={loadQuestions} className="p-4 bg-white border border-slate-200 rounded-2xl hover:bg-teal-50 text-teal-600 transition shadow-sm">
                     <RefreshCw size={22} className={loading ? 'animate-spin' : ''}/>
                   </button>
                </div>
              </div>

              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
                {loading ? <Loading message="Đang tải câu hỏi..." /> : (
                  <table className="w-full text-left">
                    <thead className="bg-slate-50/50 border-b">
                      <tr>
                        <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest">Phân loại</th>
                        <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest">Nội dung</th>
                        <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {questions.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-8 text-center text-slate-400">
                            Chưa có câu hỏi nào. Nhấn "Thêm thủ công" hoặc "Nhập từ File" để bắt đầu.
                          </td>
                        </tr>
                      ) : (
                        questions.map(q => (
                          <tr key={q.exam_id} className="hover:bg-slate-50/30 transition group">
                            <td className="p-5">
                              <div className="font-bold text-slate-700">{q.question_type}</div>
                              <div className="text-[10px] text-teal-600 font-black uppercase mt-1 px-2 py-0.5 bg-teal-50 rounded-md inline-block">{q.level}</div>
                            </td>
                            <td className="p-5">
                              <div className="text-slate-600 font-medium max-w-2xl line-clamp-1">{q.question_text.replace(/<[^>]*>?/gm, '')}</div>
                              <div className="text-[10px] text-slate-300 italic mt-1 font-bold">{q.topic} • Lớp {q.grade}</div>
                            </td>
                            <td className="p-5 text-right">
                              <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-all">
                                <button onClick={() => setEditingQuestion(q)} className="p-2.5 text-teal-600 hover:bg-teal-50 rounded-xl transition">
                                  <Edit size={20}/>
                                </button>
                                <button onClick={() => handleDelete(q.exam_id)} className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition">
                                  <Trash2 size={20}/>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB: THEORY */}
          {activeTab === 'theory' && (
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-black text-slate-800">Ngân hàng lý thuyết</h2>
                  <p className="text-slate-400 font-medium">Quản lý tài liệu lý thuyết theo chủ đề và cấp độ</p>
                </div>
                <div className="flex gap-3">
                   <button onClick={loadTheories} className="p-4 bg-white border border-slate-200 rounded-2xl hover:bg-teal-50 text-teal-600 transition shadow-sm">
                     <RefreshCw size={22} className={loading ? 'animate-spin' : ''}/>
                   </button>
                </div>
              </div>

              {/* AI Theory Generator Panel */}
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-8 rounded-3xl border-2 border-purple-100 shadow-lg">
                <div className="flex items-center gap-3 mb-6">
                  <Sparkles className="text-purple-600" size={32} />
                  <div>
                    <h3 className="text-2xl font-black text-slate-800">Tạo lý thuyết bằng AI</h3>
                    <p className="text-slate-500 text-sm">Gemini sẽ soạn bài giảng chi tiết theo yêu cầu</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-12 gap-4 mb-6">
                  <div className="col-span-3">
                    <label className="text-xs font-bold text-slate-500 mb-2 block">Khối lớp</label>
                    <select className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold" value={theoryGenConfig.grade} onChange={e => setTheoryGenConfig({...theoryGenConfig, grade: Number(e.target.value)})}>
                      {GRADES.map(g => <option key={g} value={g}>Lớp {g}</option>)}
                    </select>
                  </div>
                  <div className="col-span-5">
                    <label className="text-xs font-bold text-slate-500 mb-2 block">Chủ đề</label>
                    <input type="text" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold" placeholder="VD: Hàm số bậc hai" value={theoryGenConfig.topic} onChange={e => setTheoryGenConfig({...theoryGenConfig, topic: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-500 mb-2 block">Level</label>
                    <select className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold" value={theoryGenConfig.level} onChange={e => setTheoryGenConfig({...theoryGenConfig, level: Number(e.target.value)})}>
                      {THEORY_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-500 mb-2 block opacity-0">Action</label>
                    <Button onClick={handleGenerateTheory} disabled={isGeneratingTheory} fullWidth className="bg-purple-600 hover:bg-purple-700 h-[48px]">
                      {isGeneratingTheory ? <><Loader2 className="animate-spin inline mr-2" size={18}/> Đang tạo...</> : <><Sparkles className="inline mr-2" size={18}/> Tạo AI</>}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Theories List */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                {loading ? <Loading message="Đang tải lý thuyết..." /> : (
                  <table className="w-full text-left">
                    <thead className="bg-slate-50/50 border-b">
                      <tr>
                        <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest">Phân loại</th>
                        <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest">Tiêu đề</th>
                        <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {theories.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-8 text-center text-slate-400">
                            Chưa có lý thuyết nào. Sử dụng AI Generator để tạo lý thuyết mới.
                          </td>
                        </tr>
                      ) : (
                        theories.map(theory => (
                          <tr key={theory.id} className="hover:bg-slate-50/30 transition group">
                            <td className="p-5">
                              <div className="font-bold text-slate-700">Lớp {theory.grade}</div>
                              <div className="text-[10px] text-blue-600 font-black uppercase mt-1 px-2 py-0.5 bg-blue-50 rounded-md inline-block">Level {theory.level}</div>
                            </td>
                            <td className="p-5">
                              <div className="text-slate-800 font-bold">{theory.title}</div>
                              <div className="text-xs text-slate-400 mt-1">{theory.topic}</div>
                            </td>
                            <td className="p-5 text-right">
                              <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-all">
                                <button onClick={() => setEditingTheory(theory)} className="p-2.5 text-teal-600 hover:bg-teal-50 rounded-xl transition">
                                  <Edit size={20}/>
                                </button>
                                <button onClick={() => handleDeleteTheory(theory.id || '')} className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition">
                                  <Trash2 size={20}/>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB: EXAM CREATOR */}
          {activeTab === 'exam-creator' && (
            <div className="max-w-6xl mx-auto space-y-8">
              <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 rounded-full -mr-16 -mt-16 opacity-30"></div>
                
                <h2 className="text-4xl font-black text-slate-800 mb-2 flex items-center gap-4">
                  <Sparkles className="text-teal-500" size={40}/> Trình tạo đề thi
                </h2>
                <p className="text-slate-400 font-medium mb-8">Xây dựng ma trận đề thi linh hoạt từ ngân hàng câu hỏi.</p>
                
                <div className="grid grid-cols-12 gap-8">
                    {/* LEFT: BUILDER CONTROLS */}
                    <div className="col-span-5 space-y-6">
                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
                            <h3 className="font-black text-slate-700 mb-4 flex items-center gap-2">
                              <Layers size={20}/> Cấu hình Khối & Chủ đề
                            </h3>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Khối lớp</label>
                                    <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700" 
                                        value={examConfig.grade} 
                                        onChange={e => {
                                            setExamConfig({...examConfig, grade: Number(e.target.value)}); 
                                            loadTopics(Number(e.target.value));
                                            setExamStructure([]);
                                        }}>
                                        {GRADES.map(g => <option key={g} value={g}>Lớp {g}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                      Chủ đề (Tổng số câu)
                                    </label>
                                    <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700" 
                                        value={builderSelection.topic} 
                                        onChange={e => setBuilderSelection({...builderSelection, topic: e.target.value})}>
                                        <option value="">-- Chọn chủ đề --</option>
                                        {topics.map(t => (
                                            <option key={t} value={t}>{t} ({getTopicTotalCount(t)})</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Mức độ</label>
                                        <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700" 
                                            value={builderSelection.level} 
                                            onChange={e => setBuilderSelection({...builderSelection, level: e.target.value})}>
                                            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Số lượng</label>
                                        <input type="number" min="1" className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700" 
                                            value={builderSelection.count} 
                                            onChange={e => setBuilderSelection({...builderSelection, count: Number(e.target.value)})}
                                        />
                                    </div>
                                </div>

                                {builderSelection.topic && (
                                    <div className="flex justify-between items-center text-xs font-bold px-1">
                                        <span className="text-slate-400">Khả dụng trong kho:</span>
                                        <span className={`px-2 py-1 rounded ${
                                          getAvailableCount(builderSelection.topic, builderSelection.level) >= builderSelection.count 
                                            ? 'bg-green-100 text-green-700' 
                                            : 'bg-red-100 text-red-700'
                                        }`}>
                                            {getAvailableCount(builderSelection.topic, builderSelection.level)} câu
                                        </span>
                                    </div>
                                )}

                                <Button onClick={handleAddStructure} fullWidth className="bg-slate-800 text-white hover:bg-slate-900 shadow-slate-300">
                                    <Plus size={18} className="mr-2 inline"/> Thêm vào cấu trúc
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: MATRIX TABLE */}
                    <div className="col-span-7 bg-white border-2 border-dashed border-slate-200 rounded-3xl p-6 flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-black text-slate-700 text-lg">Ma trận đề thi</h3>
                            <span className="bg-teal-100 text-teal-700 px-3 py-1 rounded-xl font-black text-sm">
                                Tổng: {getTotalExamQuestions()} câu
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                            {examStructure.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                    <LayoutList size={48} className="mb-2 opacity-50"/>
                                    <p className="font-medium text-sm">Chưa có thành phần nào.</p>
                                    <p className="text-xs">Hãy chọn chủ đề và thêm vào đây.</p>
                                </div>
                            ) : (
                                examStructure.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-teal-200 transition">
                                        <div>
                                            <div className="font-bold text-slate-800">{item.topic}</div>
                                            <div className="text-xs font-bold text-slate-400 uppercase mt-1">{item.level}</div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="font-mono font-black text-teal-600 text-lg bg-teal-50 px-3 py-1 rounded-lg">
                                                {item.count} câu
                                            </div>
                                            <button onClick={() => handleRemoveStructure(item.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                                                <Trash2 size={18}/>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* BOTTOM: GENERATION ACTIONS */}
                <div className="mt-8 pt-8 border-t border-slate-100">
                    <div className="flex gap-6 items-end">
                        <div className="flex-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">
                              Chế độ xuất bản
                            </label>
                            <div className="flex gap-4">
                                <button onClick={() => setExamConfig({...examConfig, generationMode: 'batch'})} 
                                  className={`flex-1 p-4 rounded-2xl border-2 transition-all text-left flex items-center gap-3 ${
                                    examConfig.generationMode === 'batch' 
                                      ? 'border-teal-500 bg-teal-50' 
                                      : 'border-slate-200 hover:border-teal-200'
                                  }`}>
                                    <div className={`p-2 rounded-lg ${
                                      examConfig.generationMode === 'batch' 
                                        ? 'bg-teal-200 text-teal-800' 
                                        : 'bg-slate-100 text-slate-500'
                                    }`}>
                                      <LayoutList size={20}/>
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 text-sm">Tạo mã đề</div>
                                        <div className="text-xs text-slate-400">Trộn ngẫu nhiên thành 4-6 đề</div>
                                    </div>
                                </button>
                                <button onClick={() => setExamConfig({...examConfig, generationMode: 'personalized'})} 
                                  className={`flex-1 p-4 rounded-2xl border-2 transition-all text-left flex items-center gap-3 ${
                                    examConfig.generationMode === 'personalized' 
                                      ? 'border-teal-500 bg-teal-50' 
                                      : 'border-slate-200 hover:border-teal-200'
                                  }`}>
                                    <div className={`p-2 rounded-lg ${
                                      examConfig.generationMode === 'personalized' 
                                        ? 'bg-teal-200 text-teal-800' 
                                        : 'bg-slate-100 text-slate-500'
                                    }`}>
                                      <UserCheck size={20}/>
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 text-sm">Mỗi bạn 1 đề</div>
                                        <div className="text-xs text-slate-400">Đề riêng cho từng học sinh</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                        {examConfig.generationMode === 'batch' && (
                          <div className="w-32">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Số đề</label>
                            <input type="number" min="1" max="10" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-center" 
                              value={examConfig.batchCount} 
                              onChange={e => setExamConfig({...examConfig, batchCount: Number(e.target.value)})} 
                            />
                          </div>
                        )}
                        <div className="w-1/3">
                             <Button onClick={generateExams} disabled={isGeneratingBatch || examStructure.length === 0} fullWidth size="lg" className="bg-teal-600 h-[88px] text-xl rounded-2xl shadow-lg shadow-teal-100">
                                {isGeneratingBatch ? <><Loader2 className="animate-spin mr-3 inline"/> Đang xử lý...</> : <><Send className="mr-3 inline"/> Bắt đầu tạo đề</> }
                            </Button>
                        </div>
                    </div>
                </div>
              </div>

              {/* Generated Links */}
              {generatedBatchResult.length > 0 && (
                <div className="bg-white p-8 rounded-[2.5rem] border border-teal-100 animate-slide-in shadow-lg">
                  <h3 className="font-black text-slate-800 mb-6 flex items-center gap-3 text-2xl">
                    <LinkIcon className="text-teal-500" size={28}/> Danh sách link đề thi:
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {generatedBatchResult.map((res, i) => (
                      <div key={i} className="p-5 bg-slate-50 rounded-2xl flex justify-between items-center border border-transparent hover:border-teal-200 transition-all">
                        <span className="font-bold text-slate-700 truncate mr-4">{res.name}</span>
                        <div className="flex gap-2">
                          <button onClick={() => window.open(res.link)} className="p-3 text-teal-600 bg-white rounded-xl border border-slate-200 hover:bg-teal-50 transition-all">
                            <Eye size={18}/>
                          </button>
                          <button onClick={() => {
                            navigator.clipboard.writeText(res.link); 
                            alert('Đã Copy Link!');
                          }} className="p-3 text-teal-600 bg-white rounded-xl border border-slate-200 hover:bg-teal-50 transition-all">
                            <Copy size={18}/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}


              {/* LMS: Giao đề cho lớp */}
              {generatedBatchResult.length > 0 && (
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-black text-slate-800 flex items-center gap-3 text-2xl">
                      <ClipboardList className="text-teal-500" size={28}/> Giao đề cho lớp (LMS)
                    </h3>
                    <div className="text-sm text-slate-500 font-medium">
                      * Khuyến nghị: dùng <span className="font-bold text-slate-700">Batch</span> để giao 1 mã đề cho cả lớp.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Lớp</label>
                      <div className="flex gap-2">
                        <select
                          value={assignClassName}
                          onChange={(e) => setAssignClassName(e.target.value)}
                          className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white font-bold text-slate-700"
                        >
                          <option value="">-- Chọn lớp --</option>
                          {classOptions.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div className="text-xs text-slate-400 mt-2">
                        Nếu chưa có danh sách lớp, bạn có thể nhập tay trong ô “Lớp” ở tab Học sinh.
                      </div>
                    </div>

                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Mở đề lúc</label>
                        <input
                          type="datetime-local"
                          value={assignOpenAt}
                          onChange={(e) => setAssignOpenAt(e.target.value)}
                          className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white font-bold text-slate-700"
                        />
                        <div className="text-xs text-slate-400 mt-1">Để trống = mở ngay</div>
                      </div>

                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Hạn nộp</label>
                        <input
                          type="datetime-local"
                          value={assignDueAt}
                          onChange={(e) => setAssignDueAt(e.target.value)}
                          className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white font-bold text-slate-700"
                        />
                        <div className="text-xs text-slate-400 mt-1">Để trống = không giới hạn</div>
                      </div>

                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Thời lượng (phút)</label>
                        <input
                          type="number"
                          min={1}
                          value={assignDurationMinutes}
                          onChange={(e) => setAssignDurationMinutes(Number(e.target.value))}
                          className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white font-bold text-slate-700"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Số lần làm tối đa</label>
                        <input
                          type="number"
                          min={1}
                          value={assignMaxAttempts}
                          onChange={(e) => setAssignMaxAttempts(Number(e.target.value))}
                          className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white font-bold text-slate-700"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 items-center">
                    <label className="flex items-center gap-2 font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={assignSettings.shuffleQuestions}
                        onChange={(e) => setAssignSettings({ ...assignSettings, shuffleQuestions: e.target.checked })}
                      />
                      Đảo câu hỏi
                    </label>
                    <label className="flex items-center gap-2 font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={assignSettings.shuffleOptions}
                        onChange={(e) => setAssignSettings({ ...assignSettings, shuffleOptions: e.target.checked })}
                      />
                      Đảo đáp án
                    </label>
                    <label className="flex items-center gap-2 font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={assignSettings.showAnswerAfter}
                        onChange={(e) => setAssignSettings({ ...assignSettings, showAnswerAfter: e.target.checked })}
                      />
                      Hiện đáp án sau khi nộp
                    </label>
                  </div>

                  <div className="bg-slate-50 rounded-3xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                      <div className="font-black text-slate-800">Chọn đề để giao</div>
                      <div className="text-xs text-slate-500 font-medium">
                        Batch: giao 1 đề cho cả lớp • Personalized: nên gửi theo từng học sinh
                      </div>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {generatedBatchResult.map((ex, i) => (
                        <div key={i} className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-black text-slate-800 truncate">{ex.examTitle || ex.name}</div>
                            <div className="text-sm text-slate-500 font-medium truncate">{ex.link}</div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => window.open(ex.link)}
                              className="px-4 py-3 rounded-2xl border border-slate-200 bg-white font-black text-teal-600 hover:bg-teal-50"
                            >
                              Xem
                            </button>
                            <button
                              onClick={() => { navigator.clipboard.writeText(ex.link); alert('Đã copy link!'); }}
                              className="px-4 py-3 rounded-2xl border border-slate-200 bg-white font-black text-slate-700 hover:bg-slate-50"
                            >
                              Copy link
                            </button>
                            <button
                              onClick={() => handleAssignExamToClass(ex)}
                              className="px-5 py-3 rounded-2xl bg-teal-600 text-white font-black hover:bg-teal-700 disabled:opacity-50"
                              disabled={loading || !assignClassName.trim() || !ex.examId}
                            >
                              Giao đề
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="font-black text-slate-800 flex items-center gap-2">
                        <LayoutList size={18} className="text-slate-500" /> Danh sách đề đã giao
                      </div>

                      <div className="flex flex-wrap gap-2 items-center">
                        <select
                          value={assignmentClassFilter}
                          onChange={(e) => setAssignmentClassFilter(e.target.value)}
                          className="px-4 py-3 rounded-2xl border border-slate-200 bg-white font-bold text-slate-700"
                        >
                          <option value="">-- Chọn lớp --</option>
                          {classOptions.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => loadAssignments(assignmentClassFilter)}
                          className="px-5 py-3 rounded-2xl bg-slate-900 text-white font-black hover:bg-slate-800 disabled:opacity-50"
                          disabled={!assignmentClassFilter.trim() || isLoadingAssignments}
                        >
                          {isLoadingAssignments ? 'Đang tải...' : 'Tải danh sách'}
                        </button>
                      </div>
                    </div>

                    <div className="p-6">
                      {isLoadingAssignments ? (
                        <Loading message="Đang tải danh sách đề đã giao..." />
                      ) : assignments.length === 0 ? (
                        <div className="text-slate-500 font-medium">Chưa có dữ liệu. Hãy chọn lớp và bấm “Tải danh sách”.</div>
                      ) : (
                        <div className="space-y-3">
                          {assignments.map((a) => (
                            <div key={a.assignmentId} className="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-black text-slate-800 truncate">{a.examTitle}</div>
                                <div className="text-sm text-slate-500 font-medium">
                                  Lớp: <span className="font-bold text-slate-700">{a.className}</span> • Mở: {formatDate(a.openAt)} • Hạn: {a.dueAt ? formatDate(a.dueAt) : '—'}
                                </div>
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <button
                                  onClick={() => {
                                    const link = `${window.location.origin}${window.location.pathname}?examId=${a.examId}`;
                                    navigator.clipboard.writeText(link);
                                    alert('Đã copy link đề!');
                                  }}
                                  className="px-4 py-3 rounded-2xl border border-slate-200 bg-white font-black text-slate-700 hover:bg-white"
                                >
                                  Copy link
                                </button>
                                <button
                                  onClick={() => window.open(`${window.location.origin}${window.location.pathname}?examId=${a.examId}`)}
                                  className="px-4 py-3 rounded-2xl border border-slate-200 bg-white font-black text-teal-600 hover:bg-teal-50"
                                >
                                  Xem đề
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

          {/* TAB: STUDENTS */}
          {activeTab === 'students' && (
            <>
              {studentViewMode === 'result-detail' && renderStudentResultDetail()}
              {studentViewMode === 'overview' && renderStudentOverview()}
              {studentViewMode === 'list' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-3xl font-black text-slate-800">Danh sách học sinh</h2>
                      <p className="text-slate-400 font-medium">Quản lý và theo dõi tiến độ học tập</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="bg-teal-100 text-teal-700 px-5 py-2 rounded-2xl font-black text-sm">
                        Tổng: {students.length} học sinh
                      </div>
                      <button onClick={loadStudents} className="p-4 bg-white border border-slate-200 rounded-2xl hover:bg-teal-50 text-teal-600 transition shadow-sm">
                        <RefreshCw size={22} className={loading ? 'animate-spin' : ''}/>
                      </button>
                    </div>
                  </div>

                  {loading ? (
                    <Loading message="Đang tải danh sách học sinh..." />
                  ) : (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b-2 border-slate-200">
                          <tr>
                            <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest">STT</th>
                            <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest">Họ và Tên</th>
                            <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest">Email</th>
                            <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest">Lớp</th>
                            <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Điểm tích lũy</th>
                            <th className="p-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {students.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-slate-400">
                                Chưa có học sinh nào trong hệ thống
                              </td>
                            </tr>
                          ) : (
                            students.map((s, i) => (
                              <tr key={i} className="hover:bg-teal-50/10 transition-colors group">
                                <td className="p-5 text-slate-500 font-bold">{i + 1}</td>
                                <td className="p-5 font-black text-slate-800">{s.name}</td>
                                <td className="p-5 text-slate-500 text-sm font-mono">{s.email}</td>
                                <td className="p-5 text-slate-600 font-bold">{s.class}</td>
                                <td className="p-5 text-right">
                                  <div className="font-mono font-black text-teal-600 text-xl">{s.totalScore}</div>
                                </td>
                                <td className="p-5 text-right">
                                  <button 
                                    onClick={() => handleViewStudentDetail(s.email)}
                                    className="opacity-0 group-hover:opacity-100 px-4 py-2 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition inline-flex items-center gap-2 shadow-sm"
                                  >
                                    <Eye size={16} /> Xem chi tiết
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* MODAL: EDIT QUESTION */}
      {editingQuestion && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[2.5rem] w-full max-w-7xl max-h-[92vh] overflow-hidden shadow-2xl flex border border-white/20 animate-fade-in">
            <div className="flex-1 p-10 overflow-y-auto border-r border-slate-100">
               <h3 className="text-3xl font-black text-slate-800 mb-8 flex items-center gap-4">
                 <Edit className="text-teal-600" size={32}/> Chỉnh sửa câu hỏi
               </h3>
               <div className="space-y-8">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dạng câu hỏi</label>
                      <select className="w-full p-5 bg-white border border-slate-300 rounded-3xl font-bold text-slate-900 focus:ring-2 ring-teal-500" 
                        value={editingQuestion.question_type} 
                        onChange={e => setEditingQuestion({...editingQuestion, question_type: e.target.value as any})}>
                        <option value="Trắc nghiệm">Trắc nghiệm</option>
                        <option value="Đúng/Sai">Đúng/Sai</option>
                        <option value="Trả lời ngắn">Trả lời ngắn</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mức độ tư duy</label>
                      <select className="w-full p-5 bg-white border border-slate-300 rounded-3xl font-bold text-slate-900 focus:ring-2 ring-teal-500" 
                        value={editingQuestion.level} 
                        onChange={e => setEditingQuestion({...editingQuestion, level: e.target.value})}>
                        {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Nội dung (Hỗ trợ LaTeX $...$)
                    </label>
                    <textarea className="w-full p-6 bg-white border border-slate-300 rounded-[2rem] h-40 font-medium text-slate-900 focus:ring-2 ring-teal-500 outline-none leading-relaxed" 
                      value={editingQuestion.question_text} 
                      onChange={e => setEditingQuestion({...editingQuestion, question_text: e.target.value})} 
                      placeholder="Nhập đề bài tại đây..." 
                    />
                  </div>

                  {(editingQuestion.question_type === 'Trắc nghiệm' || editingQuestion.question_type === 'Đúng/Sai') && (
                    <div className="grid grid-cols-2 gap-6">
                       {['A', 'B', 'C', 'D'].map(opt => (
                         <div key={opt} className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              {editingQuestion.question_type === 'Trắc nghiệm' ? `Lựa chọn ${opt}` : `Mệnh đề ${opt}`}
                            </label>
                            <input className="w-full p-5 bg-white border border-slate-300 rounded-3xl font-medium text-slate-900 focus:ring-2 ring-teal-500" 
                              value={editingQuestion[`option_${opt}` as keyof Question] as string} 
                              onChange={e => setEditingQuestion({...editingQuestion, [`option_${opt}` as keyof Question]: e.target.value})} 
                            />
                         </div>
                       ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Đáp án đúng</label>
                      <input className="w-full p-5 bg-teal-50 border border-teal-200 rounded-3xl font-black text-teal-900 placeholder:text-teal-400 focus:ring-2 ring-teal-500" 
                        value={editingQuestion.answer_key} 
                        onChange={e => setEditingQuestion({...editingQuestion, answer_key: e.target.value})} 
                        placeholder={editingQuestion.question_type === 'Đúng/Sai' ? 'Đ-S-Đ-S' : 'A'} 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lớp</label>
                         <select className="w-full p-5 bg-white border border-slate-300 rounded-3xl font-bold text-slate-900" 
                           value={editingQuestion.grade} 
                           onChange={e => setEditingQuestion({...editingQuestion, grade: Number(e.target.value)})}>
                           {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                         </select>
                       </div>
                       <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chủ đề</label>
                         <input className="w-full p-5 bg-white border border-slate-300 rounded-3xl font-bold text-slate-900" 
                           value={editingQuestion.topic} 
                           onChange={e => setEditingQuestion({...editingQuestion, topic: e.target.value})} 
                         />
                       </div>
                    </div>
                  </div>
               </div>

               <div className="flex gap-4 mt-12">
                  <Button onClick={handleSaveEdit} className="bg-teal-600 flex-1 h-16 text-lg rounded-3xl shadow-lg shadow-teal-50">
                    Cập nhật hệ thống
                  </Button>
                  <Button onClick={() => setEditingQuestion(null)} variant="secondary" className="px-10 rounded-3xl h-16">
                    Hủy
                  </Button>
               </div>
            </div>

            {/* Preview Pane */}
            <div className="w-[450px] bg-white p-10 overflow-y-auto border-l border-slate-100">
               <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-3">
                 <Eye size={16}/> Xem trước nội dung
               </h3>
               <div className="bg-slate-50 p-8 rounded-[2rem] shadow-inner border border-slate-200 min-h-[500px] flex flex-col">
                  <div className="text-[10px] font-black bg-teal-100 text-teal-700 px-3 py-1 rounded-lg inline-block mb-4 uppercase self-start">
                    {editingQuestion.question_type}
                  </div>
                  <div className="text-lg font-bold text-slate-900 leading-relaxed mb-8">
                    <MathText content={editingQuestion.question_text || 'Chưa có nội dung...'} />
                  </div>
                  
                  {editingQuestion.question_type === 'Trắc nghiệm' && (
                    <div className="space-y-3">
                       {['A', 'B', 'C', 'D'].map(opt => (
                         <div key={opt} className="p-4 border border-slate-200 rounded-2xl text-sm flex gap-3 bg-white shadow-sm">
                            <span className="font-black text-teal-700">{opt}.</span>
                            <div className="text-slate-900 font-medium w-full">
                                <MathText content={editingQuestion[`option_${opt}` as keyof Question] as string || ''} />
                            </div>
                         </div>
                       ))}
                    </div>
                  )}

                  {editingQuestion.question_type === 'Đúng/Sai' && (
                    <div className="space-y-4 mt-4">
                       {['A', 'B', 'C', 'D'].map(opt => (
                         <div key={opt} className="p-4 border border-slate-200 rounded-2xl text-xs bg-white shadow-sm">
                            <div className="font-black mb-2 text-teal-700">{opt})</div>
                            <div className="text-slate-900 font-medium w-full">
                                <MathText content={editingQuestion[`option_${opt}` as keyof Question] as string || ''} />
                            </div>
                         </div>
                       ))}
                    </div>
                  )}

                  {editingQuestion.question_type === 'Trả lời ngắn' && (
                    <div className="mt-auto pt-6 border-t border-dashed border-slate-300 text-xs text-slate-500 italic flex items-center gap-2">
                      <Send size={14}/> Ô nhập liệu của học sinh...
                    </div>
                  )}
               </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT THEORY */}
      {editingTheory && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl flex border border-white/20">
            <div className="flex-1 p-10 overflow-y-auto">
               <h3 className="text-3xl font-black text-slate-800 mb-8 flex items-center gap-4">
                 <BookOpen className="text-purple-600" size={32}/> Chỉnh sửa lý thuyết
               </h3>
               <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-400 mb-2 block">Khối lớp</label>
                      <select className="w-full p-3 bg-white border border-slate-300 rounded-2xl font-bold" 
                        value={editingTheory.grade} 
                        onChange={e => setEditingTheory({...editingTheory, grade: Number(e.target.value)})}>
                        {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400 mb-2 block">Chủ đề</label>
                      <input className="w-full p-3 bg-white border border-slate-300 rounded-2xl font-bold" 
                        value={editingTheory.topic} 
                        onChange={e => setEditingTheory({...editingTheory, topic: e.target.value})} 
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400 mb-2 block">Level</label>
                      <select className="w-full p-3 bg-white border border-slate-300 rounded-2xl font-bold" 
                        value={editingTheory.level} 
                        onChange={e => setEditingTheory({...editingTheory, level: Number(e.target.value)})}>
                        {THEORY_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-xs font-bold text-slate-400 mb-2 block">Tiêu đề</label>
                    <input className="w-full p-4 bg-white border border-slate-300 rounded-2xl font-bold text-lg" 
                      value={editingTheory.title} 
                      onChange={e => setEditingTheory({...editingTheory, title: e.target.value})} 
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs font-bold text-slate-400 mb-2 block">
                      Nội dung (Hỗ trợ LaTeX $...$)
                    </label>
                    <textarea className="w-full p-4 bg-white border border-slate-300 rounded-2xl h-48 font-medium leading-relaxed" 
                      value={editingTheory.content} 
                      onChange={e => setEditingTheory({...editingTheory, content: e.target.value})} 
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs font-bold text-slate-400 mb-2 block">Ví dụ minh họa</label>
                    <textarea className="w-full p-4 bg-white border border-slate-300 rounded-2xl h-32 font-medium" 
                      value={editingTheory.examples} 
                      onChange={e => setEditingTheory({...editingTheory, examples: e.target.value})} 
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs font-bold text-slate-400 mb-2 block">Mẹo & Lưu ý</label>
                    <textarea className="w-full p-4 bg-white border border-slate-300 rounded-2xl h-24 font-medium" 
                      value={editingTheory.tips} 
                      onChange={e => setEditingTheory({...editingTheory, tips: e.target.value})} 
                    />
                  </div>
               </div>

               <div className="flex gap-4 mt-8">
                  <Button onClick={handleSaveTheory} className="bg-purple-600 flex-1 h-14 text-lg rounded-2xl shadow-lg">
                    Lưu vào hệ thống
                  </Button>
                  <Button onClick={() => setEditingTheory(null)} variant="secondary" className="px-10 rounded-2xl h-14">
                    Hủy
                  </Button>
               </div>
            </div>

            {/* Preview Pane */}
            <div className="w-[450px] bg-slate-50 p-8 overflow-y-auto border-l border-slate-200">
               <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Xem trước</h3>
               <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <div className="text-[10px] font-black bg-purple-100 text-purple-700 px-2 py-1 rounded inline-block mb-4">
                    Level {editingTheory.level}
                  </div>
                  <h4 className="text-xl font-black text-slate-900 mb-4">
                    <MathText content={editingTheory.title || 'Chưa có tiêu đề'} />
                  </h4>
                  <div className="text-sm text-slate-700 leading-relaxed mb-4 whitespace-pre-wrap">
                    <MathText content={editingTheory.content || 'Chưa có nội dung...'} />
                  </div>
                  {editingTheory.examples && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-xl">
                      <div className="font-bold text-xs text-blue-900 mb-2">VÍ DỤ</div>
                      <div className="text-sm text-slate-700">
                        <MathText content={editingTheory.examples} />
                      </div>
                    </div>
                  )}
                  {editingTheory.tips && (
                    <div className="mt-4 p-4 bg-yellow-50 rounded-xl">
                      <div className="font-bold text-xs text-yellow-900 mb-2">MẸO & LƯU Ý</div>
                      <div className="text-sm text-slate-700">{editingTheory.tips}</div>
                    </div>
                  )}
               </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IMPORT OCR */}
      {importMode && (
         <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-6 animate-fade-in">
             <div className="bg-white rounded-[2rem] w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl border border-white/20">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-[2rem]">
                   <div>
                      <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                        <FileUp className="text-teal-600"/> Nhập đề thi từ File
                      </h3>
                      <p className="text-slate-400 text-sm mt-1">
                        Hỗ trợ Word (.docx), PDF và Ảnh. Hệ thống tự động nhận diện công thức LaTeX.
                      </p>
                   </div>
                   <button onClick={() => setImportMode(false)} className="bg-slate-100 p-2 rounded-full hover:bg-slate-200 text-slate-500">
                     <XCircle size={24}/>
                   </button>
                </div>

                <div className="flex-1 overflow-hidden flex">
                   {/* Left: Upload Area */}
                   <div className="w-1/3 bg-slate-50 p-8 border-r border-slate-100 flex flex-col">
                      <div className="border-2 border-dashed border-teal-300 bg-teal-50 rounded-2xl h-48 flex flex-col items-center justify-center cursor-pointer hover:bg-teal-100 transition relative group">
                          <input type="file" accept=".docx,.pdf,.png,.jpg,.jpeg" onChange={handleFileImport} className="absolute inset-0 opacity-0 cursor-pointer" disabled={isProcessingFile} />
                          {isProcessingFile ? (
                              <div className="text-center">
                                  <Loader2 className="animate-spin text-teal-600 mx-auto mb-2" size={32}/>
                                  <span className="text-teal-700 font-bold text-sm">{importStatus}</span>
                              </div>
                          ) : (
                              <div className="text-center group-hover:scale-105 transition">
                                  <div className="bg-white p-3 rounded-full shadow-sm inline-block mb-3">
                                    <FileUp size={24} className="text-teal-600"/>
                                  </div>
                                  <p className="font-bold text-teal-800">Chọn file để tải lên</p>
                                  <p className="text-xs text-teal-600 mt-1">Word, PDF hoặc Ảnh</p>
                              </div>
                          )}
                      </div>
                      
                      
                    
                    {/* Trong render */}
                    <div className="mt-6">
                      <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className="w-full flex items-center justify-between p-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition"
                      >
                        <span className="font-black text-slate-700 text-sm uppercase">
                          ⚙️ Cài đặt mặc định
                        </span>
                        <span className="text-xs text-slate-500">
                          {showSettings ? '▲ Thu gọn' : '▼ Mở rộng'}
                        </span>
                      </button>
                      
                      {showSettings && (
                        <div className="mt-3 space-y-3 animate-slide-in">
                          <div>
                            <label className="text-xs font-bold text-slate-400 block mb-1">Khối lớp</label>
                            <select 
                              value={importDefaultGrade}
                              onChange={(e) => setImportDefaultGrade(Number(e.target.value))}
                              className="w-full p-2 rounded-lg border border-slate-200 bg-white text-sm"
                            >
                              {GRADES.map(g => <option key={g} value={g}>Lớp {g}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400 block mb-1">Chủ đề</label>
                            <input 
                              type="text"
                              value={importDefaultTopic}
                              onChange={(e) => setImportDefaultTopic(e.target.value)}
                              className="w-full p-2 rounded-lg border border-slate-200 text-sm" 
                              placeholder="VD: Hàm số" 
                            />
                          </div>
                        </div>
                      )}
                    </div>
                      
                      <div className="mt-auto pt-6 border-t border-slate-200">
                         <div className="flex items-center gap-2 text-slate-500 text-xs mb-4 bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                            <FileType size={16} className="text-yellow-600 shrink-0"/>
                            <span>Mẹo: File Word sẽ giữ định dạng tốt nhất. PDF/ảnh dùng AI để nhận diện.</span>
                         </div>
                         <Button onClick={handleSaveImported} disabled={importedQuestions.length === 0} fullWidth className="bg-teal-600 shadow-teal-200 h-12 rounded-xl flex items-center justify-center gap-2">
                            <Save size={18}/> Lưu {importedQuestions.length} câu hỏi
                         </Button>
                      </div>
                   </div>

                   {/* Right: Preview List */}
                   <div className="flex-1 bg-white p-8 overflow-y-auto">
                      <div className="flex justify-between items-center mb-6">
                         <h4 className="font-black text-slate-800 text-lg">
                           Xem trước kết quả ({importedQuestions.length})
                         </h4>
                         {importedQuestions.length > 0 && (
                           <button onClick={() => setImportedQuestions([])} className="text-red-500 text-sm font-bold hover:underline">
                             Xóa tất cả
                           </button>
                         )}
                      </div>
                      
                      {importedQuestions.length === 0 ? (
                         <div className="h-64 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-3xl">
                            <LayoutList size={48} className="mb-4 opacity-50"/>
                            <p className="font-medium">Chưa có câu hỏi nào được trích xuất.</p>
                         </div>
                      ) : (
                         <div className="space-y-4">
                            {importedQuestions.map((q, idx) => (
                               <div key={idx} className="p-6 border border-slate-200 rounded-2xl bg-white shadow-sm hover:border-teal-300 transition group relative">
                                  <button onClick={() => removeImportedQuestion(idx)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                                    <Trash2 size={18}/>
                                  </button>
                                  <div className="flex gap-3 mb-3">
                                     <span className="bg-teal-100 text-teal-700 text-[10px] font-black px-2 py-1 rounded uppercase">
                                       {q.question_type}
                                     </span>
                                     <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-1 rounded">
                                       {q.level}
                                     </span>
                                  </div>
                                  <div className="font-medium text-slate-900 mb-3">
                                    {/* Hiển thị cả inline images nếu có */}
                                    {q.question_text?.includes('[IMAGE:') ? (
                                      <ContentWithInlineImages content={q.question_text || ''} className="" />
                                    ) : (
                                      <MathText content={q.question_text || ''} />
                                    )}
                                  </div>
                                  {q.question_type === 'Trắc nghiệm' && (
                                     <div className="grid grid-cols-2 gap-2 text-sm text-slate-700">
                                        <div className={q.answer_key === 'A' ? 'text-teal-600 font-bold' : ''}>
                                          A. <MathText content={q.option_A || ''}/>
                                        </div>
                                        <div className={q.answer_key === 'B' ? 'text-teal-600 font-bold' : ''}>
                                          B. <MathText content={q.option_B || ''}/>
                                        </div>
                                        <div className={q.answer_key === 'C' ? 'text-teal-600 font-bold' : ''}>
                                          C. <MathText content={q.option_C || ''}/>
                                        </div>
                                        <div className={q.answer_key === 'D' ? 'text-teal-600 font-bold' : ''}>
                                          D. <MathText content={q.option_D || ''}/>
                                        </div>
                                     </div>
                                  )}
                               </div>
                            ))}
                         </div>
                      )}
                   </div>
                </div>
             </div>
         </div>
      )}
    </div>
  );
};
