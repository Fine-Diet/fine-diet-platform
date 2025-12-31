/**
 * API Route: Generate Results PDF
 * 
 * GET /api/assessments/results-pdf?submissionId=xxx
 * 
 * Generates a PDF document with assessment results.
 * Uses the same results pack data as the results screen.
 * 
 * Testing locally:
 * 1. Start dev server: npm run dev
 * 2. Visit: http://localhost:3000/api/assessments/results-pdf?submissionId=<actual-submission-id>
 * 3. Browser should download a PDF file that opens in Preview/Chrome PDF viewer
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import PDFDocument from 'pdfkit';
import { resolveResultsPack } from '@/lib/assessments/results/resolveResultsPack';
import { GUT_CHECK_RESULTS_CONTENT_VERSION } from '@/lib/assessments/results/constants';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const submissionId = req.query.submissionId as string;

    if (!submissionId) {
      return res.status(400).json({
        error: 'Missing required query parameter: submissionId',
      });
    }

    // Dynamic import to avoid build-time env var checks
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    // Fetch submission from database (include metadata for resultsPackRef)
    const { data: submission, error: submissionError } = await supabaseAdmin
      .from('assessment_submissions')
      .select(
        'id, primary_avatar, secondary_avatar, score_map, normalized_score_map, confidence_score, assessment_type, assessment_version, session_id, metadata'
      )
      .eq('id', submissionId)
      .single();

    if (submissionError || !submission) {
      // Log error without PII (submissionId)
      console.error('Error fetching submission for PDF generation');
      return res.status(404).json({
        error: 'Submission not found',
      });
    }

    // Resolve results pack (CMS-first with pinning)
    const levelId = submission.primary_avatar;
    const resultsVersion = GUT_CHECK_RESULTS_CONTENT_VERSION;
    
    // Get user role for preview support (silent - don't send error response if not authenticated)
    let userRole: 'user' | 'editor' | 'admin' = 'user';
    try {
      // Use getCurrentUserWithRoleFromApi to check auth (returns null if not authenticated)
      const { getCurrentUserWithRoleFromApi } = await import('@/lib/authServer');
      const user = await getCurrentUserWithRoleFromApi(req, res);
      
      if (user) {
        userRole = user.role;
      }
    } catch {
      // Not authenticated or error - default to 'user' (silent failure)
      // PDF generation should work even without auth
    }

    // Check for existing resultsPackRef in metadata
    const existingRef = submission.metadata?.resultsPackRef as any;
    const preview = req.query.preview === '1' || req.query.preview === 'true';

    const resolveResult = await resolveResultsPack({
      assessmentType: submission.assessment_type,
      resultsVersion: resultsVersion,
      levelId: levelId,
      preview,
      userRole,
      resultsPackRef: existingRef || undefined,
    });

    const pack = resolveResult.pack;

    // Pin the pack reference if not already pinned (non-blocking for PDF generation)
    if (!existingRef && resolveResult.resultsPackRef) {
      const existingMetadata = submission.metadata || {};
      const mergedMetadata = {
        ...existingMetadata,
        resultsPackRef: resolveResult.resultsPackRef,
      };
      // Update asynchronously (don't await) - wrap in Promise.resolve to get proper Promise type
      Promise.resolve(
        supabaseAdmin
          .from('assessment_submissions')
          .update({ metadata: mergedMetadata })
          .eq('id', submissionId)
      )
        .then(() => {
          // Success
        })
        .catch((err) => {
          console.warn('Failed to pin results pack ref in PDF generation (non-blocking):', err);
        });
    }

    // Get flow content for PDF
    const flow = pack.flow as any;
    const page1Content = flow?.page1 || null;
    const page2Content = flow?.page2 || null;
    const page3Content = flow?.page3 || null;

    // Generate PDF buffer
    const pdfBuffer = await generatePdf(pack, page1Content, page2Content, page3Content);

    // Set PDF response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fine-diet-gut-check-results-${submissionId}.pdf"`);

    return res.send(pdfBuffer);
  } catch (error) {
    // Log error without PII
    console.error('PDF generation error:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({
      error: 'Failed to generate PDF. Please try again later.',
    });
  }
}

/**
 * Generate PDF document using PDFKit
 * 
 * Creates a structured PDF with:
 * - Header with Fine Diet branding
 * - Page 1: headline + body + snapshot bullets
 * - Page 2: First Steps + reframe (if present)
 * - Page 3: closing orientation + CTA
 * - Footer with disclaimer
 */
async function generatePdf(
  pack: any,
  page1Content: any,
  page2Content: any,
  page3Content: any
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 50,
    });

    const chunks: Buffer[] = [];

    // Collect PDF data chunks
    doc.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      resolve(pdfBuffer);
    });

    doc.on('error', (error: Error) => {
      reject(error);
    });

    try {
      // Header - Fine Diet branding
      doc
        .fontSize(24)
        .font('Helvetica-Bold')
        .text('Fine Diet', { align: 'center' })
        .moveDown(0.5)
        .fontSize(16)
        .font('Helvetica')
        .text('Gut Check Results', { align: 'center' })
        .moveDown(2);

      // Page 1 Content: Headline + Body + Snapshot
      if (page1Content?.headline) {
        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .text(page1Content.headline)
          .moveDown(1);
      } else if (pack.label) {
        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .text(pack.label)
          .moveDown(1);
      }

      // Page 1 Body paragraphs
      if (page1Content?.body && Array.isArray(page1Content.body)) {
        doc.fontSize(12).font('Helvetica');
        page1Content.body.forEach((paragraph: string) => {
          doc.text(paragraph, { align: 'left' }).moveDown(0.8);
        });
      } else if (pack.summary) {
        doc.fontSize(12).font('Helvetica').text(pack.summary).moveDown(1);
      }

      // Snapshot section
      if (page1Content?.snapshotTitle) {
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .moveDown(1)
          .text(page1Content.snapshotTitle)
          .moveDown(0.5)
          .fontSize(12)
          .font('Helvetica');
      }

      if (page1Content?.snapshotBullets && Array.isArray(page1Content.snapshotBullets)) {
        page1Content.snapshotBullets.forEach((bullet: string) => {
          doc.text(`• ${bullet}`, { indent: 20 }).moveDown(0.5);
        });
      }

      if (page1Content?.snapshotCloser) {
        doc
          .moveDown(0.5)
          .font('Helvetica-Oblique')
          .text(page1Content.snapshotCloser)
          .moveDown(1.5);
      }

      // Page 2: First Steps
      if (pack.firstFocusAreas && pack.firstFocusAreas.length > 0) {
        // Add new page if we're getting close to the bottom
        if (doc.y > 650) {
          doc.addPage();
        }

        doc
          .fontSize(16)
          .font('Helvetica-Bold')
          .moveDown(1)
          .text('First Steps')
          .moveDown(0.5)
          .fontSize(12)
          .font('Helvetica');

        pack.firstFocusAreas.forEach((area: string) => {
          doc.text(`• ${area}`, { indent: 20 }).moveDown(0.5);
        });
      }

      // Page 2: Reframe (if present)
      if (page2Content?.reframeTitle && page2Content?.reframeBody) {
        if (doc.y > 600) {
          doc.addPage();
        }

        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .moveDown(1.5)
          .text(page2Content.reframeTitle)
          .moveDown(0.5)
          .fontSize(12)
          .font('Helvetica');

        if (Array.isArray(page2Content.reframeBody)) {
          page2Content.reframeBody.forEach((paragraph: string) => {
            doc.text(paragraph).moveDown(0.8);
          });
        }
      }

      // Page 3: Flow v2 structure (if present)
      if (page3Content?.mechanismTitle) {
        if (doc.y > 600) {
          doc.addPage();
        }

        // Missing Mechanism Section
        doc
          .fontSize(16)
          .font('Helvetica-Bold')
          .moveDown(1.5)
          .text(page3Content.mechanismTitle)
          .moveDown(0.5)
          .fontSize(12)
          .font('Helvetica');

        if (page3Content.mechanismBodyTop) {
          doc.text(page3Content.mechanismBodyTop).moveDown(0.8);
        }

        // Missing Mechanism Pills (if present)
        if (page3Content.mechanismPills && Array.isArray(page3Content.mechanismPills) && page3Content.mechanismPills.length > 0) {
          doc.moveDown(0.5);
          page3Content.mechanismPills.forEach((pill: string) => {
            doc
              .fontSize(11)
              .font('Helvetica-Bold')
              .text(`• ${pill}`, { indent: 20 })
              .moveDown(0.4);
          });
        }

        if (page3Content.mechanismBodyBottom) {
          doc
            .fontSize(12)
            .font('Helvetica')
            .moveDown(0.5)
            .text(page3Content.mechanismBodyBottom)
            .moveDown(1);
        }

        // Method Section
        if (page3Content.methodTitle) {
          doc
            .fontSize(16)
            .font('Helvetica-Bold')
            .moveDown(1)
            .text(page3Content.methodTitle)
            .moveDown(0.5)
            .fontSize(12)
            .font('Helvetica');
        }

        if (page3Content.methodBody && Array.isArray(page3Content.methodBody)) {
          page3Content.methodBody.forEach((paragraph: string) => {
            doc.text(paragraph).moveDown(0.8);
          });
        }

        // "In the video, you'll learn" section
        if (page3Content.methodLearnTitle) {
          doc
            .moveDown(0.8)
            .fontSize(14)
            .font('Helvetica-Bold')
            .text(page3Content.methodLearnTitle)
            .moveDown(0.5)
            .fontSize(12)
            .font('Helvetica');
        }

        if (page3Content.methodLearnBullets && Array.isArray(page3Content.methodLearnBullets)) {
          page3Content.methodLearnBullets.forEach((bullet: string) => {
            doc.text(`• ${bullet}`, { indent: 20 }).moveDown(0.5);
          });
        }

        // Method CTA
        if (page3Content.methodCtaLabel) {
          const methodUrl = page3Content.methodCtaUrl || 'https://myfinediet.com/method';
          doc
            .moveDown(1)
            .font('Helvetica-Bold')
            .text(page3Content.methodCtaLabel, {
              link: methodUrl.startsWith('http') ? methodUrl : `https://myfinediet.com${methodUrl}`,
            });
          // Add URL as footnote for clarity
          doc
            .fontSize(9)
            .font('Helvetica')
            .moveDown(0.3)
            .text(`Link: ${methodUrl}`, {
              align: 'left',
            });
        }
      } else if (page3Content?.closingTitle && page3Content?.closingBody) {
        // Legacy Page 3 structure
        if (doc.y > 600) {
          doc.addPage();
        }

        doc
          .fontSize(16)
          .font('Helvetica-Bold')
          .moveDown(1.5)
          .text(page3Content.closingTitle)
          .moveDown(0.5)
          .fontSize(12)
          .font('Helvetica');

        if (Array.isArray(page3Content.closingBody)) {
          page3Content.closingBody.forEach((paragraph: string) => {
            doc.text(paragraph).moveDown(0.8);
          });
        }
      }

      // Legacy CTA / Method positioning (fallback)
      if (!page3Content && pack.methodPositioning) {
        if (doc.y > 600) {
          doc.addPage();
        }

        doc
          .fontSize(12)
          .font('Helvetica')
          .moveDown(1.5)
          .text(pack.methodPositioning)
          .moveDown(1)
          .font('Helvetica-Bold')
          .text('Learn The Fine Diet Method: myfinediet.com/method', {
            link: 'https://myfinediet.com/method',
          });
      }

      // Footer - Disclaimer
      if (doc.y > 650) {
        doc.addPage();
      }

      doc
        .fontSize(9)
        .font('Helvetica-Oblique')
        .moveDown(2)
        .text(
          'This assessment is for educational purposes only and is not a medical diagnosis. It does not replace personalized medical advice.',
          {
            align: 'center',
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          }
        );

      // Finalize PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

