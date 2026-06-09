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
