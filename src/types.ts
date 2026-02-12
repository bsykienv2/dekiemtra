
// ==================== VIEW STATES ====================

export enum ViewState {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  TOPIC_SELECT = 'TOPIC_SELECT',
  QUIZ = 'QUIZ',
  RESULT = 'RESULT',
  LEADERBOARD = 'LEADERBOARD',
  THEORY_REVIEW = 'THEORY_REVIEW',
  ADMIN_PANEL = 'ADMIN_PANEL', // New view for teachers
}

// ==================== OCR TYPES ====================

export enum AppState {
  IDLE = 'IDLE',
  UPLOADING_OCR = 'UPLOADING_OCR',
  OCR_COMPLETE = 'OCR_COMPLETE',
  CORRECTING = 'CORRECTING',
  ERROR = 'ERROR'
}

export interface OCRResult {
  fileName: string;
  fileId: string;
  pageCount: number;
  totalImages: number;
  totalChars: number;
  allMarkdownDataUri: string; // Markdown chứa data URI hoặc Image ID
}

// ==================== USER ====================

export interface User {
  email: string;
  name: string;
  class: string;
  avatar?: string;
  totalScore: number;
  currentLevel?: number;
  progress?: Record<string, number>; 
  role?: 'student' | 'teacher' | 'admin'; // Added role
}

export interface Session {
  user: User;
  sessionToken: string;
  deviceId: string;
  loginTime: string;
}

// ==================== QUESTIONS ====================

export type QuestionType = 'Trắc nghiệm' | 'Đúng/Sai' | 'Trả lời ngắn';

export interface Question {
  exam_id: string;
  level: string; 
  question_type: QuestionType | string; // Updated type
  question_text: string;
  image_id?: string;
  option_A: string; // Trắc nghiệm: Đáp án A. Đúng/Sai: Mệnh đề a)
  option_B: string; // Trắc nghiệm: Đáp án B. Đúng/Sai: Mệnh đề b)
  option_C: string; // Trắc nghiệm: Đáp án C. Đúng/Sai: Mệnh đề c)
  option_D: string; // Trắc nghiệm: Đáp án D. Đúng/Sai: Mệnh đề d)
  answer_key: string; 
  // Trắc nghiệm: "A"
  // Đúng/Sai: "Đ-S-Đ-S" (tương ứng a,b,c,d)
  // Trả lời ngắn: "15" (Giá trị đúng)
  solution: string;
  topic: string;
  grade: number;
  quiz_level?: number;
}

// ==================== THEORY & RESOURCES ====================

export interface Theory {
  id?: string;
  grade: number;
  topic: string;
  level: number;
  title: string;
  content: string;      
  examples?: string;    
  tips?: string;        
  videoUrl?: string;    
  relatedTopics?: string[]; 
}

export interface DocumentResource {
  id: string;
  name: string;
  content: string; // OCR text
  uploadedAt: string;
}

// ==================== QUIZ STATE ====================

export interface QuizState {
  questions: Question[];
  currentQuestionIndex: number;
  // User answers storage:
  // Trắc nghiệm: "A"
  // Đúng/Sai: "Đ-S-?-?" (User đang chọn)
  // Trả lời ngắn: "15.5"
  userAnswers: (string | null)[]; 
  startTime: number;
  endTime?: number;
  timeSpent?: number;
  tabSwitchCount: number;
  isSubmitting?: boolean;
  isComplete: boolean;
  score: number;
  submissionReason: 'normal' | 'cheat_tab' | 'cheat_conflict' | 'timeout';
}

export interface QuizResult {
  resultId?: string;
  email: string;
  topic: string;
  grade: number;
  level: number;
  score: number;
  totalQuestions: number;
  percentage: number;
  passed: boolean;
  canAdvance: boolean;
  nextLevel?: number;
  timeSpent: number;
  submissionReason: 'normal' | 'cheat_tab' | 'cheat_conflict' | 'timeout';
  theory?: Theory;  
  message: string;
  answers?: Array<{ questionId: string; userAnswer: string; correct: boolean }>;
  timestamp: string;
}

// ==================== VIOLATIONS ====================

export interface Violation {
  violationId?: string;
  email: string;
  type: 'tab_switch' | 'session_conflict' | 'copy_paste' | 'devtools' | 'timeout';
  topic?: string;
  level?: number;
  details: string;
  timestamp: string;
}

// ==================== TOPIC & PROGRESS ====================

export interface Topic {
  id: string;
  name: string;
  grade: number;
  description?: string;
  totalLevels: number;
  icon?: string;
}

export interface TopicProgress {
  topic: string;
  grade: number;
  currentLevel: number;
  maxLevel: number;
  completedLevels: number[];
  lastAttempt?: string;
}

// ==================== API RESPONSES ====================

export interface SheetResponse<T> {
  status: 'success' | 'error';
  data: T;
  message?: string;
}

export interface SessionValidation {
  valid: boolean;
  reason?: 'expired' | 'session_conflict' | 'invalid_token' | 'no_session';
  user?: User;
}

// ==================== CHAT / AI TUTOR ====================

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface TutorContext {
  questionId?: string;
  questionText?: string;
  options?: string[];
  userAnswer?: string;
  correctAnswer?: string;
  hintLevel: number; // 0-3
}

export interface TutorResponse {
  message: string;
  hintLevel: number;
  isFullSolution: boolean;
}

// ==================== LEADERBOARD ====================

export interface LeaderboardEntry {
  rank: number;
  email: string;
  name: string;
  class: string;
  avatar?: string;
  totalScore: number;
  questionsCompleted?: number;
  streak?: number;
}

// ==================== CERTIFICATE ====================

export interface Certificate {
  id: string;
  email: string;
  name: string;
  topic: string;
  grade: number;
  score: number;
  issuedAt: string;
  verificationCode: string;
}

// ==================== UTILITY TYPES ====================

export type AnswerKey = 'A' | 'B' | 'C' | 'D';

export type DifficultyLevel = 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao';

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}
// ==================== LMS ASSIGNMENTS ====================

export type AssignmentState = 'OPEN' | 'UPCOMING' | 'CLOSED';

export interface AssignmentSettings {
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showAnswerAfter?: boolean;
}

export interface Assignment {
  assignmentId: string;
  examId: string;
  examTitle: string;
  grade: number | string;
  class: string;
  assignedBy?: string;
  openAt?: string;
  dueAt?: string;
  durationMinutes?: number;
  maxAttempts?: number;
  settings?: AssignmentSettings;
  status?: 'ACTIVE' | 'ARCHIVED';
  createdAt?: string;
}

export interface AssignedExam extends Assignment {
  state: AssignmentState;
  attemptsUsed: number;
  bestPercentage?: number | string;
  lastSubmittedAt?: string;
}

export interface AssignmentAttempt {
  attemptId: string;
  assignmentId: string;
  examId: string;
  email: string;
  startedAt: string;
  submittedAt?: string;
  timeSpent?: number | string;
  score?: number | string;
  totalQuestions?: number | string;
  percentage?: number | string;
  status?: 'STARTED' | 'SUBMITTED';
  submissionReason?: string;
  resultId?: string;
}

// ==================== ADMIN DETAIL TYPES ====================

export interface StudentDetail {
  user: User;
  results: Array<{
    resultId: string;
    email: string;
    topic: string;
    grade: number;
    level: number;
    score: number;
    totalQuestions: number;
    percentage: number;
    status: string;
    timeSpent: number;
    submissionReason: string;
    timestamp: string;
  }> | null;
  violations: Array<{
    id: string;
    type: string;
    topic: string;
    level: string | number;
    details: any;
    timestamp: string;
  }>;
}

export interface ResultDetail {
  resultId: string;
  email: string;
  topic: string;
  grade: number;
  level: number;
  score: number;
  totalQuestions: number;
  percentage: number;
  status: string;
  timeSpent: number;
  submissionReason: string;
  answers: any[];
  timestamp: string;
}
