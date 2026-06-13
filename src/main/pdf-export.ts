import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import { dialog } from 'electron';

export interface ExportedVerse {
  timestamp: string;
  reference: string;
  text: string;
}

export async function exportSessionPdf(verses: ExportedVerse[]): Promise<boolean> {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export Session Scripture Log',
    defaultPath: `Scripture-Session-Log-${new Date().toISOString().slice(0, 10)}.pdf`,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });

  if (!filePath) return false;

  return new Promise<boolean>((resolve) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);
      
      doc.pipe(stream);

      // Document Header
      doc.fontSize(22).fillColor('#1a1a1a').text('Scripture Presenter', { align: 'center' });
      doc.fontSize(12).fillColor('#666666').text('Sermon Scripture Utilization Log', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(9).text(`Exported on: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(1.5);

      // Draw horizontal line
      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#e5e7eb').stroke();
      doc.moveDown(1.5);

      if (verses.length === 0) {
        doc.fontSize(11).fillColor('#4b5563').text('No scriptures were projected during this session.', { align: 'center' });
      } else {
        // Table headers
        const startY = doc.y;
        doc.fontSize(10).fillColor('#111827').text('Time', 50, startY, { width: 80, underline: true });
        doc.text('Reference', 140, startY, { width: 120, underline: true });
        doc.text('Scripture Content', 270, startY, { width: 290, underline: true });
        doc.moveDown(1.2);

        // List verses
        for (const item of verses) {
          // Check for page boundary
          if (doc.y > 700) {
            doc.addPage();
          }
          
          const currentY = doc.y;
          
          // Timestamp
          doc.fontSize(9).fillColor('#4b5563').text(item.timestamp, 50, currentY, { width: 80 });
          
          // Reference
          doc.fontSize(10).fillColor('#1f2937').text(item.reference, 140, currentY, { width: 120 });
          
          // Text
          doc.fontSize(10).fillColor('#374151').text(item.text, 270, currentY, { width: 290 });
          
          doc.moveDown(1.5);
          
          // Draw subtle divider line
          doc.moveTo(50, doc.y - 5).lineTo(562, doc.y - 5).strokeColor('#f3f4f6').lineWidth(1).stroke();
        }
      }

      doc.end();
      stream.on('finish', () => resolve(true));
      stream.on('error', () => resolve(false));
    } catch (err) {
      console.error('PDF Export Error:', err);
      resolve(false);
    }
  });
}

export async function exportSermonReportPdf(markdownText: string): Promise<boolean> {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export Sermon Report & Scripture Sheet',
    defaultPath: `Sermon-Report-${new Date().toISOString().slice(0, 10)}.pdf`,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });

  if (!filePath) return false;

  return new Promise<boolean>((resolve) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);
      
      doc.pipe(stream);

      // Page header / title watermark
      doc.fontSize(8).fillColor('#9ca3af').text('Scripture Presenter — Automated Sermon Report', { align: 'right' });
      doc.moveDown(1);

      const lines = markdownText.split('\n');
      for (const line of lines) {
        // Page boundary check
        if (doc.y > 700) {
          doc.addPage();
          doc.fontSize(8).fillColor('#9ca3af').text('Scripture Presenter — Automated Sermon Report', { align: 'right' });
          doc.moveDown(1);
        }

        const trimmed = line.trim();
        if (!trimmed) {
          doc.moveDown(0.4);
          continue;
        }

        if (trimmed.startsWith('# ')) {
          const content = trimmed.substring(2);
          doc.fontSize(22).fillColor('#111827').font('Helvetica-Bold').text(content);
          doc.moveDown(0.8);
          // Draw subtle primary colored accent line below title
          doc.moveTo(50, doc.y).lineTo(150, doc.y).strokeColor('#c9a227').lineWidth(2).stroke();
          doc.moveDown(1);
        } else if (trimmed.startsWith('## ')) {
          const content = trimmed.substring(3);
          doc.fontSize(14).fillColor('#1e3a8a').font('Helvetica-Bold').text(content);
          doc.moveDown(0.5);
          // Divider line below section
          doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
          doc.moveDown(0.6);
        } else if (trimmed.startsWith('### ')) {
          const content = trimmed.substring(4);
          doc.fontSize(11).fillColor('#374151').font('Helvetica-Bold').text(content);
          doc.moveDown(0.4);
        } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          const content = trimmed.substring(2);
          
          // Bullet list indentation
          const startX = 65;
          const currentY = doc.y;
          
          // Draw bullet
          doc.fontSize(10).fillColor('#c9a227').font('Helvetica-Bold').text('•', 50, currentY);
          
          // Draw content text
          doc.fontSize(10).fillColor('#374151').font('Helvetica').text(content, startX, currentY, {
            width: 497,
            align: 'left'
          });
          doc.moveDown(0.4);
        } else {
          // Normal body text
          if (trimmed.startsWith('**') && trimmed.includes('**:')) {
            const parts = trimmed.split('**:');
            const boldPart = parts[0].substring(2);
            const normalPart = parts.slice(1).join('**:');
            
            doc.fontSize(10).fillColor('#111827').font('Helvetica-Bold').text(boldPart + ':', { continued: true });
            doc.font('Helvetica').fillColor('#374151').text(normalPart);
          } else {
            doc.fontSize(10).fillColor('#374151').font('Helvetica').text(trimmed);
          }
          doc.moveDown(0.4);
        }
      }

      doc.end();
      stream.on('finish', () => resolve(true));
      stream.on('error', () => resolve(false));
    } catch (err) {
      console.error('PDF Sermon Export Error:', err);
      resolve(false);
    }
  });
}

