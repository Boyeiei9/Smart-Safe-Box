import React, { useState } from 'react';
import { Printer, Download, X, FileCheck, Building2, Calendar, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { arabicToThaiBaht } from '../utils/thaiBaht';

export default function TaxDocumentModal({ isOpen, onClose, documentData }) {
  if (!isOpen || !documentData) return null;

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
  };

  const formatDateOnly = (date) => {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(d);
  };

  const handlePrint = () => {
    window.print();
  };

  const templeName = documentData.templeName || 'วัดโคก';
  const totalAmount = documentData.amount || 0;
  const bahtText = arabicToThaiBaht(totalAmount);
  const items = documentData.items || [];
  const isGrouped = items.length > 0;
  const docNo = documentData.docNo || `TAX-${Date.now().toString().slice(-6)}`;
  const issueDate = formatDateOnly(new Date());

  return (
    <div className="modal-backdrop print-modal-backdrop">
      <div className="modal-box tax-document-modal">
        {/* Action bar (hidden when printing) */}
        <div className="modal-action-bar no-print">
          <div className="action-bar-title">
            <FileCheck size={20} className="text-indigo" />
            <span>ตัวอย่างเอกสารทางการเงิน / ยื่นภาษี</span>
          </div>
          <div className="action-bar-buttons">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              <X size={16} /> ปิดหน้าต่าง
            </button>
            <button type="button" className="btn btn-primary" onClick={handlePrint}>
              <Printer size={16} /> พิมพ์เอกสาร / บันทึกเป็น PDF
            </button>
          </div>
        </div>

        {/* Printable Tax Statement Document */}
        <div className="tax-document-printable">
          {/* Header */}
          <div className="tax-doc-header">
            <div className="temple-emblem">
              <Building2 size={36} color="var(--primary, #4f46e5)" />
            </div>
            <div className="temple-info">
              <h1 className="tax-doc-temple-name">{templeName}</h1>
              <p className="tax-doc-subtext">ระบบตู้บริจาคเงินอัจฉริยะ (Smart Donate System)</p>
              <h2 className="tax-doc-title">
                ใบสรุปยอดเงินบริจาคเพื่อยื่นภาษีทางการเงิน / ใบสำคัญรับเงิน
              </h2>
            </div>
          </div>

          <div className="tax-doc-divider" />

          {/* Document Meta Info */}
          <div className="tax-doc-meta-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="meta-item">
              <span className="meta-label">เลขที่เอกสาร:</span>
              <span className="meta-value font-mono">{docNo}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">วันที่ออกเอกสาร:</span>
              <span className="meta-value">{issueDate}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">รอบ/ประจำ:</span>
              <span className="meta-value" style={{ color: '#4F46E5' }}>
                {documentData.periodLabel || (documentData.timestamp ? formatDateOnly(documentData.timestamp) : '-')}
              </span>
            </div>
          </div>

          {/* Breakdown Table */}
          <div className="tax-doc-table-wrapper">
            <table className="tax-doc-table">
              <thead>
                <tr>
                  <th style={{ width: '8%', textAlign: 'center' }}>ลำดับ</th>
                  <th>วันที่รีเซ็ต</th>
                  <th>รายละเอียด</th>
                  <th style={{ width: '22%', textAlign: 'right' }}>จำนวนเงิน (บาท)</th>
                </tr>
              </thead>
              <tbody>
                {isGrouped ? (
                  items.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td>{formatDateOnly(item.timestamp)}</td>
                      <td>ยอดเงินบริจาค</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>฿{formatCurrency(item.amount)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td style={{ textAlign: 'center' }}>1</td>
                    <td>{formatDateOnly(documentData.timestamp)}</td>
                    <td>ยอดเงินบริจาค</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>฿{formatCurrency(totalAmount)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td colSpan="3" style={{ textAlign: 'right', fontWeight: 700 }}>
                    ยอดเงินรวมทั้งสิ้น (Total Amount):
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '1.15rem', color: '#047857' }}>
                    ฿{formatCurrency(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Thai Baht Text Box */}
          <div className="tax-doc-baht-box">
            <span className="baht-label">จำนวนเงินตัวอักษร (Baht Text):</span>
            <span className="baht-text">({bahtText})</span>
          </div>

          {/* Signatures */}
          <div className="tax-doc-signatures" style={{ gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: '600px', margin: '0 auto 2rem auto' }}>
            <div className="sig-card">
              <div className="sig-line"></div>
              <p className="sig-name">( ............................................ )</p>
              <p className="sig-title">เหรัญญิก / ไวยาวัจกร {templeName}</p>
              <p className="sig-date">วันที่ ......../......../........</p>
            </div>
            <div className="sig-card">
              <div className="sig-line"></div>
              <p className="sig-name">( ............................................ )</p>
              <p className="sig-title">เจ้าอาวาส {templeName}</p>
              <p className="sig-date">วันที่ ......../......../........</p>
            </div>
          </div>

          {/* Official Footer Disclaimer */}
          <div className="tax-doc-footer">
            <div className="tax-doc-footer-badge">
              <ShieldCheck size={16} />
              <span>เอกสารทางการเงินออกโดยอัตโนมัติจากระบบตู้บริจาคเงินอัจฉริยะ {templeName}</span>
            </div>
            <p className="tax-doc-footer-note">
              เอกสารฉบับนี้ใช้สำหรับเป็นหลักฐานประกอบการลงบัญชีทางการเงินและยื่นต่อกรมสรรพากร/หน่วยงานที่เกี่ยวข้อง
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
