import React, { useRef } from 'react';
import { User } from '../types';
import { jsPDF } from 'jspdf';
import { Download } from 'lucide-react';

interface Props {
  user: User;
  topic: string;
  score: number;
}

const Certificate: React.FC<Props> = ({ user, topic, score }) => {
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    // Decorative Border
    doc.setLineWidth(2);
    doc.setDrawColor(13, 148, 136); // Teal 600
    doc.rect(10, 10, 277, 190);
    
    doc.setLineWidth(1);
    doc.setDrawColor(20, 184, 166); // Teal 500
    doc.rect(15, 15, 267, 180);

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(36);
    doc.setTextColor(13, 148, 136);
    doc.text("GIAY KHEN", 148.5, 40, { align: "center" });
    
    // Subheader
    doc.setFont("helvetica", "normal");
    doc.setFontSize(18);
    doc.setTextColor(80, 80, 80);
    doc.text("LMS Thay Phuc Toan Dong Nai", 148.5, 55, { align: "center" });
    
    doc.setFontSize(14);
    doc.text("Vinh danh học sinh:", 148.5, 75, { align: "center" });

    // Student Name
    doc.setFont("times", "bolditalic");
    doc.setFontSize(40);
    doc.setTextColor(0, 0, 0);
    doc.text(user.name, 148.5, 95, { align: "center" });
    
    // Details
    doc.setFont("helvetica", "normal");
    doc.setFontSize(16);
    doc.setTextColor(60, 60, 60);
    doc.text(`Đã hoàn thành xuất sắc chủ đề: ${topic}`, 148.5, 115, { align: "center" });
    doc.text(`Đạt kết quả: ${score}/100 điểm`, 148.5, 125, { align: "center" });
    
    // Signature area
    doc.text("Ngày ..... tháng ..... năm 202...", 220, 150, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.text("Giao Vien", 220, 160, { align: "center" });
    doc.setFont("times", "italic");
    doc.text("Thay Phuc", 220, 180, { align: "center" });

    doc.save(`GiayKhen_${user.name}.pdf`);
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-lg border-2 border-primary-200">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-primary-700 mb-2">Chúc Mừng!</h2>
        <p className="text-gray-600">Bạn đã đạt {score}% điểm bài thi {topic}.</p>
      </div>

      <div ref={canvasRef} className="relative w-full max-w-lg bg-white p-8 border-4 border-double border-primary-600 shadow-xl mb-6 text-center">
         <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary-600"></div>
         <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary-600"></div>
         <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary-600"></div>
         <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary-600"></div>
         
         <h3 className="text-2xl font-bold text-primary-800 tracking-widest uppercase mb-1">Giấy Khen</h3>
         <p className="text-xs text-gray-500 mb-6">LMS Thầy Phúc Toán Đồng Nai</p>
         
         <p className="text-sm text-gray-600">Vinh danh học sinh</p>
         <p className="text-2xl font-serif italic font-bold text-gray-900 my-4">{user.name}</p>
         <p className="text-sm text-gray-600">Đã hoàn thành xuất sắc chủ đề <span className="font-bold">{topic}</span></p>
      </div>

      <button 
        onClick={handleDownload}
        className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 px-6 rounded-full transition-all shadow-md"
      >
        <Download size={20} />
        Tải Giấy Khen PDF
      </button>
    </div>
  );
};

export default Certificate;