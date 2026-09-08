import React, { useState, useRef, useEffect } from 'react';
import { Printer, Download, X, FileCheck, Building2, Calendar, ShieldCheck, CheckCircle2, Image as ImageIcon, ExternalLink, Info } from 'lucide-react';
import { arabicToThaiBaht } from '../utils/thaiBaht';
import templeLogo from '../assets/temple-logo.jpg';

export default function TaxDocumentModal({ isOpen, onClose, documentData }) {
  if (!isOpen || !documentData) return null;

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [mobileScale, setMobileScale] = useState(1);
  const [pageHeights, setPageHeights] = useState({});
  const printRef = useRef(null);

  // Automatically keep document scaled to fit screen width on mobile/tablet without any manual toggling
  useEffect(() => {
    const updateMobileScale = () => {
      if (typeof window !== 'undefined') {
        const screenW = window.innerWidth;
        const availableW = Math.min(screenW - 24, 820);
        if (availableW < 820 && availableW > 0) {
          setMobileScale(availableW / 820);
        } else {
          setMobileScale(1);
        }
      }
    };
    updateMobileScale();
    const timer = setTimeout(updateMobileScale, 80);
    window.addEventListener('resize', updateMobileScale);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateMobileScale);
    };
  }, [isOpen]);

  const isLineBrowser = typeof navigator !== 'undefined' && /Line\//i.test(navigator.userAgent);

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

  const generatePageCanvas = async (pageElement) => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    const html2canvas = (await import('html2canvas')).default;

    return await html2canvas(pageElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1024,
      onclone: (clonedDoc) => {
        // Reset any mobile scaling in canvas export
        const clonedWrappers = clonedDoc.querySelectorAll('.tax-doc-scaled-wrapper');
        clonedWrappers.forEach((w) => {
          w.style.height = 'auto';
          w.style.overflow = 'visible';
          w.style.marginBottom = '0';
        });
        const clonedPages = clonedDoc.querySelectorAll('.tax-document-page');
        clonedPages.forEach((p) => {
          p.style.transform = 'none';
        });

        const clonedFrame = clonedDoc.querySelector('.tax-document-frame');
        if (clonedFrame) {
          clonedFrame.style.width = '840px';
          clonedFrame.style.minWidth = '840px';
          clonedFrame.style.maxWidth = '840px';
          clonedFrame.style.padding = '24px 28px';
          clonedFrame.style.margin = '0 auto';
          clonedFrame.style.boxSizing = 'border-box';
          clonedFrame.style.backgroundColor = '#ffffff';

          // Show footer in PDF/image export
          const pdfFooter = clonedFrame.querySelector('.pdf-only-footer');
          if (pdfFooter) {
            pdfFooter.style.display = 'block';
          }
        }
      }
    });
  };

  const handleDownloadPdf = async () => {
    if (!printRef.current || isGeneratingPdf) return;
    setIsGeneratingPdf(true);

    try {
      if (isLineBrowser) {
        // LINE In-App browser blocks direct Blob file downloads
        alert('เบราว์เซอร์ของแอป LINE บล็อกการดาวน์โหลดไฟล์ PDF โดยตรง ระบบจะเปิดรูปภาพเอกสารให้ท่านแตะค้างเพื่อ "บันทึกรูปภาพ" ลงเครื่องแทนครับ (หรือกดปุ่ม "เปิดใน Chrome/Safari" ด้านบนเพื่อโหลด PDF)');
        const firstPageEl = printRef.current.querySelector('.tax-document-page') || printRef.current;
        const canvas = await generatePageCanvas(firstPageEl);
        const imgData = canvas.toDataURL('image/png');
        setPreviewImage(imgData);
        return;
      }

      const { jsPDF } = await import('jspdf');
      const pageElements = printRef.current.querySelectorAll('.tax-document-page');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const margin = 8;
      const printWidth = pageWidth - (margin * 2);
      const maxPageContentHeightMm = pageHeight - (margin * 2);

      for (let pIdx = 0; pIdx < pageElements.length; pIdx++) {
        const pageEl = pageElements[pIdx];
        const canvas = await generatePageCanvas(pageEl);

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const actualPrintHeightMm = Math.min((canvas.height * printWidth) / canvas.width, maxPageContentHeightMm);

        if (pIdx > 0) {
          pdf.addPage();
        }
        pdf.addImage(imgData, 'JPEG', margin, margin, printWidth, actualPrintHeightMm);
      }

      pdf.save(`${docNo}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('เกิดข้อผิดพลาดในการสร้าง PDF กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSaveImage = async () => {
    if (!printRef.current || isGeneratingImage) return;
    setIsGeneratingImage(true);

    try {
      const firstPageEl = printRef.current.querySelector('.tax-document-page') || printRef.current;
      const canvas = await generatePageCanvas(firstPageEl);
      const imgData = canvas.toDataURL('image/png');
      setPreviewImage(imgData);
    } catch (error) {
      console.error('Error generating image:', error);
      alert('เกิดข้อผิดพลาดในการสร้างรูปภาพ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleOpenExternal = () => {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('openExternalBrowser', '1');
    window.location.href = currentUrl.toString();
  };

  const templeName = documentData.templeName || 'วัดโคกเสือ';
  const totalAmount = documentData.amount || 0;
  const bahtText = arabicToThaiBaht(totalAmount);
  const rawItems = documentData.items || [];
  // Sort items ascending by date/month (earliest month first, cascading downwards)
  const items = [...rawItems].sort((a, b) => {
    const ta = a.timestamp ? (a.timestamp instanceof Date ? a.timestamp.getTime() : (typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime())) : 0;
    const tb = b.timestamp ? (b.timestamp instanceof Date ? b.timestamp.getTime() : (typeof b.timestamp.toDate === 'function' ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime())) : 0;
    return ta - tb;
  });
  const isGrouped = items.length > 0;
  const docNo = documentData.docNo || `TAX-${Date.now().toString().slice(-6)}`;
  const issueDate = formatDateOnly(new Date());

  // Helper: Chunk items into pages intelligently
  // A single page can comfortably hold up to 18 items with full header + signatures + footer.
  const chunkItemsForPages = (list) => {
    if (!list || list.length === 0) return [[]];
    const totalCount = list.length;
    // Up to 18 items fit comfortably on a single A4 page with header, table, totals, signatures, and stamps.
    if (totalCount <= 18) {
      return [list];
    }
    // 2 Pages (19 to 38 items):
    // Page 1 has no totals or signatures, so fill it generously (18 to 20 items) so Page 1 looks full and dignified.
    // Leave at least 5 items for Page 2 to accompany the summary totals and signature blocks.
    if (totalCount <= 38) {
      const minLastPage = 5;
      const page1Count = Math.min(20, Math.max(14, totalCount - minLastPage));
      return [list.slice(0, page1Count), list.slice(page1Count)];
    }
    // 3+ Pages
    const pages = [];
    const p1Count = 20;
    pages.push(list.slice(0, p1Count));
    let remaining = list.slice(p1Count);
    while (remaining.length > 0) {
      if (remaining.length <= 16) {
        pages.push(remaining);
        remaining = [];
      } else if (remaining.length <= 34) {
        const lastCount = Math.max(5, Math.min(14, remaining.length - 18));
        const midCount = remaining.length - lastCount;
        pages.push(remaining.slice(0, midCount));
        pages.push(remaining.slice(midCount));
        remaining = [];
      } else {
        pages.push(remaining.slice(0, 20));
        remaining = remaining.slice(20);
      }
    }
    return pages;
  };

  const pageChunks = isGrouped
    ? chunkItemsForPages(items)
    : [[{ amount: totalAmount, timestamp: documentData.timestamp, note: documentData.note }]];
  const totalPages = pageChunks.length;

  return (
    <div className="modal-backdrop print-modal-backdrop">
      <div className="modal-box tax-document-modal">
        {/* Action bar (hidden when printing) */}
        <div className="modal-action-bar no-print">
          <div className="action-bar-title">
            <FileCheck size={20} className="text-indigo" />
            <span>ตัวอย่างเอกสารการเงิน</span>    
          </div>
          <div className="action-bar-right">
            <div className="action-bar-buttons">
              <button type="button" className="btn btn-primary btn-print" onClick={handlePrint}>
                <Printer size={16} /> พิมพ์เอกสาร
              </button>
              <button type="button" className="btn btn-primary btn-download" onClick={handleDownloadPdf} disabled={isGeneratingPdf}
                style={{ backgroundColor: '#059669' }}>
                <Download size={16} /> {isGeneratingPdf ? 'กำลังสร้าง...' : 'บันทึกเป็น PDF'}
              </button>
              <button type="button" className="btn btn-secondary btn-image" onClick={handleSaveImage} disabled={isGeneratingImage}
                style={{ borderColor: '#6366F1', color: '#4F46E5', fontWeight: 600 }}>
                <ImageIcon size={16} /> {isGeneratingImage ? 'กำลังแปลง...' : 'บันทึกเป็นรูปภาพ'}
              </button>
            </div>
            <button type="button" className="btn-close-modal" onClick={onClose} title="ปิดหน้าต่าง" aria-label="ปิด">
              <X size={20} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* LINE In-App Browser Notice */}
        {isLineBrowser && (
          <div className="no-print" style={{
            backgroundColor: '#EFF6FF',
            borderBottom: '1px solid #BFDBFE',
            padding: '0.65rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            fontSize: '0.825rem',
            color: '#1E40AF'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Info size={16} style={{ flexShrink: 0 }} />
              <span>เปิดใน LINE: แนะนำใช้ <b>บันทึกเป็นรูปภาพ</b> หรือเปิดเบราว์เซอร์หลักเพื่อโหลด PDF</span>
            </div>
            <button
              type="button"
              onClick={handleOpenExternal}
              style={{
                backgroundColor: '#2563EB',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.775rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}>
              <ExternalLink size={12} /> เปิดใน Chrome/Safari
            </button>
          </div>
        )}

        {/* Image Preview Overlay for saving to album */}
        {previewImage && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            zIndex: 999999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.85rem 1.25rem',
                borderBottom: '1px solid #E2E8F0',
                backgroundColor: '#F8FAFC'
              }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#1E293B', fontWeight: 700 }}>
                  📸 รูปภาพเอกสาร (กดค้างที่รูปเพื่อบันทึก)
                </h3>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                  <X size={20} />
                </button>
              </div>
              <div style={{ padding: '1rem', overflowY: 'auto', textAlign: 'center' }}>
                <p style={{ margin: '0 0 10px 0', fontSize: '0.825rem', color: '#059669', fontWeight: 600 }}>
                  👉 แตะค้างที่รูปภาพด้านล่าง แล้วเลือก "บันทึกรูปภาพ" (Save Image)
                </p>
                <img
                  src={previewImage}
                  alt="Tax Document"
                  style={{
                    width: '100%',
                    height: 'auto',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                  }}
                />
              </div>
              <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #E2E8F0', textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPreviewImage(null)}
                  style={{ width: '100%', justifyContent: 'center' }}>
                  ปิดหน้าต่างรูปภาพ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Printable Tax Statement Document (Paginated) */}
        <div className="tax-document-printable" ref={printRef}>
          {pageChunks.map((chunk, pageIdx) => {
            const isFirstPage = pageIdx === 0;
            const isLastPage = pageIdx === totalPages - 1;
            const pageStartIdx = pageChunks.slice(0, pageIdx).reduce((acc, c) => acc + c.length, 0);
            const shouldScale = mobileScale < 1;

            return (
              <div
                key={pageIdx}
                className="tax-doc-scaled-wrapper"
                style={shouldScale ? {
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  height: pageHeights[pageIdx] ? `${Math.round((pageHeights[pageIdx] + 30) * mobileScale)}px` : undefined,
                  overflow: 'visible',
                  marginBottom: '1rem'
                } : undefined}
              >
                <div
                  ref={(el) => {
                    if (el && !pageHeights[pageIdx]) {
                      setPageHeights(prev => ({ ...prev, [pageIdx]: el.offsetHeight }));
                    }
                  }}
                  className="tax-document-page"
                  style={shouldScale ? {
                    transform: `scale(${mobileScale})`,
                    transformOrigin: 'top center',
                    marginBottom: 0
                  } : undefined}
                >
                  {/* Formal Certificate Outer Frame */}
                  <div className="tax-document-frame">

                  {isFirstPage ? (
                    <>
                      {/* Header with Temple Logo */}
                      <div className="tax-doc-header">
                        <div className="temple-logo-wrapper">
                          <img
                            src={templeLogo}
                            alt={`ตราสัญลักษณ์ ${templeName}`}
                            className="temple-logo-img"
                            crossOrigin="anonymous"
                          />
                        </div>
                        <div className="temple-info">
                          <div className="temple-header-top">
                            <h1 className="tax-doc-temple-name">{templeName}</h1>
                            <span className="temple-jurisdiction">สังกัดคณะสงฆ์มหานิกาย</span>
                          </div>
                          <p className="tax-doc-address">
                            ตำบลโคกเสือ อำเภอบางไทร จังหวัดพระนครศรีอยุธยา 13190
                          </p>
                          <div className="tax-doc-title-banner">
                            <h2 className="tax-doc-title">
                              ใบสำคัญรับเงิน / ใบสรุปยอดเงินบริจาค
                            </h2>
                            <span className="tax-doc-subtitle">
                              ระบบตู้บริจาคเงินอัจฉริยะ (Smart Safe Box System)
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="tax-doc-divider-double" />

                      {/* Document Meta Info Card */}
                      <div className="tax-doc-meta-card">
                        <div className="meta-card-grid">
                          <div className="meta-col">
                            <div className="meta-row">
                              <span className="meta-lbl">หน่วยงานผู้ออก:</span>
                              <span className="meta-val">{templeName} (ฝ่ายการเงินและศาสนสมบัติ)</span>
                            </div>
                            <div className="meta-row">
                              <span className="meta-lbl">ประเภทเอกสาร:</span>
                              <span className="meta-val">สรุปรายงานยอดบริจาคตู้เซฟอัจฉริยะ</span>
                            </div>
                            <div className="meta-row">
                              <span className="meta-lbl">วัตถุประสงค์:</span>
                              <span className="meta-val">เพื่อบำรุงพระอาราม บูรณปฏิสังขรณ์ และสาธารณประโยชน์</span>
                            </div>
                          </div>

                          <div className="meta-col meta-col-right">
                            <div className="meta-row">
                              <span className="meta-lbl">เลขที่เอกสาร:</span>
                              <span className="meta-val font-mono meta-val-highlight">{docNo}</span>
                            </div>
                            <div className="meta-row">
                              <span className="meta-lbl">วันที่ออกเอกสาร:</span>
                              <span className="meta-val">{issueDate}</span>
                            </div>
                            <div className="meta-row">
                              <span className="meta-lbl">รอบการจัดเก็บ:</span>
                              <span className="meta-val meta-val-period">
                                {documentData.periodLabel || (documentData.timestamp ? formatDateOnly(documentData.timestamp) : '-')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Compact Continuation Header for Subsequent Pages */}
                      <div className="tax-doc-header-continuation">
                        <div className="cont-header-left">
                          <h2 className="cont-temple-name">{templeName}</h2>
                          <span className="cont-doc-title">ใบสำคัญรับเงิน / ใบสรุปยอดเงินบริจาค (ต่อ)</span>
                        </div>
                        <div className="cont-header-right">
                          <span>เลขที่เอกสาร: <b>{docNo}</b></span>
                          <span>รอบการจัดเก็บ: <b>{documentData.periodLabel || '-'}</b></span>
                        </div>
                      </div>
                      <div className="tax-doc-divider-gold" />
                    </>
                  )}

                  {/* Breakdown Table for this page chunk */}
                  <div className="tax-doc-table-wrapper">
                    <table className="tax-doc-table">
                      <thead>
                        <tr>
                          <th style={{ width: '8%', textAlign: 'center' }}>ลำดับ</th>
                          <th style={{ width: '22%', textAlign: 'center' }}>วันที่ทำรายการ</th>
                          <th style={{ width: '45%', textAlign: 'left' }}>รายการ / วัตถุประสงค์การบริจาค</th>
                          <th style={{ width: '25%', textAlign: 'right' }}>จำนวนเงิน (บาท)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isGrouped ? (
                          chunk.map((item, idx) => {
                            const globalIdx = pageStartIdx + idx;
                            return (
                              <tr key={item.id || globalIdx}>
                                <td style={{ textAlign: 'center', fontWeight: 600 }}>{globalIdx + 1}</td>
                                <td style={{ textAlign: 'center' }}>{formatDateOnly(item.timestamp)}</td>
                                <td style={{ textAlign: 'left' }}>
                                  <span className="item-title">
                                    เงินบริจาคสมทบทุน {templeName}
                                  </span>
                                  <span className="item-subtitle">
                                    {item.note || `รอบการรีเซ็ตตู้บริจาคอัจฉริยะ (${item.resetBy || 'ผู้ดูแลระบบ'})`}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 700 }} className="font-mono">
                                  {formatCurrency(item.amount)}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>1</td>
                            <td style={{ textAlign: 'center' }}>{formatDateOnly(documentData.timestamp)}</td>
                            <td style={{ textAlign: 'left' }}>
                              <span className="item-title">
                                เงินบริจาคสมทบทุน {templeName}
                              </span>
                              <span className="item-subtitle">
                                {documentData.note || 'สรุปยอดเงินบริจาคจากตู้บริจาคอัจฉริยะประจำรอบ'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }} className="font-mono">
                              {formatCurrency(totalAmount)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {isLastPage && (
                        <tfoot>
                          <tr className="total-row">
                            <td colSpan="3" style={{ textAlign: 'right', fontWeight: 700 }}>
                              ยอดเงินรวมสุทธิทั้งสิ้น (Total Net Amount):
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '1.25rem', color: '#047857' }} className="font-mono">
                              <span className="total-amount-display">
                                {formatCurrency(totalAmount)}
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>

                  {!isLastPage && (
                    <div className="tax-doc-continuation-note">
                      — มีรายการต่อในแผ่นถัดไป (หน้า {pageIdx + 1}/{totalPages}) —
                    </div>
                  )}

                  {isLastPage && (
                    <>
                      {/* Thai Baht Text Box */}
                      <div className="tax-doc-baht-box">
                        <span className="baht-label">จำนวนเงินตัวอักษร (Baht Text):</span>
                        <span className="baht-text">( {bahtText} )</span>
                      </div>

                      {/* Official Signatures & Seal Section */}
                      <div className="tax-doc-signatures-wrapper">
                        <div className="tax-doc-signatures">
                          {/* Signatory 1: Treasurer */}
                          <div className="sig-card">
                            <p className="sig-role-header">ผู้จัดทำรายงาน / ผู้ส่งมอบเงิน</p>
                            <div className="sig-space">
                              <div className="sig-line"></div>
                            </div>
                            <p className="sig-name">( ............................................................ )</p>
                            <p className="sig-title">เหรัญญิก / คณะกรรมการฝ่ายการเงิน</p>
                            <p className="sig-date">วันที่ .......... / .......... / ................</p>
                          </div>

                          {/* Seal Stamp Placeholder */}
                          <div className="seal-card">
                            <div className="seal-circle">
                              <div className="seal-inner">
                                <span className="seal-text-top">ประทับตรา</span>
                                <span className="seal-text-main">วัดโคกเสือ</span>
                                <span className="seal-text-sub">(สำคัญ)</span>
                              </div>
                            </div>
                            <p className="seal-caption">ตราประทับวัดประจำหน่วยงาน</p>
                          </div>

                          {/* Signatory 2: Abbot */}
                          <div className="sig-card">
                            <p className="sig-role-header">ผู้รับรองรายงาน / เจ้าอาวาส</p>
                            <div className="sig-space">
                              <div className="sig-line"></div>
                            </div>
                            <p className="sig-name">( ............................................................ )</p>
                            <p className="sig-title">เจ้าอาวาส {templeName}</p>
                            <p className="sig-date">วันที่ .......... / .......... / ................</p>
                          </div>
                        </div>
                      </div>

                      {/* Official Footer Disclaimer (hidden in preview, shown in PDF/image export) */}
                      <div className="tax-doc-footer pdf-only-footer">
                        <div className="tax-doc-footer-badge">
                          <ShieldCheck size={16} />
                          <span>เอกสารการเงินออกโดยระบบตู้บริจาคเงินอัจฉริยะ (Smart Safe Box) — {templeName}</span>
                        </div>
                        <p className="tax-doc-footer-note">
                          เอกสารนี้เป็นหลักฐานทางการเงินที่ถูกต้อง ใช้สำหรับตรวจสอบบัญชีศาสนสมบัติและประกอบการยื่นรายงานต่อคณะสงฆ์และหน่วยงานทางการเงิน
                        </p>
                      </div>
                    </>
                  )}

                  {/* Official Page Number Indicator */}
                  <div className="tax-doc-page-number">
                    หน้า {pageIdx + 1} จาก {totalPages}
                  </div>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      </div>
    </div>
  );
}
