const multer = require('multer');
const path = require('path');
const pdfParse = require('pdf-parse');
const UserModel = require('../models/user.model');
const PdfAnalysisModel = require('../models/pdfAnalysis.model');
const GroqPdfService = require('../services/groqPdf.service');

// Configure multer for memory storage (no disk write)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

const uploadMiddleware = upload.single('file');

/**
 * Analyze a PDF document
 * POST /api/pdf/analyze
 */
async function analyzePdf(req, res) {
    try {
        const userId = req.userId;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Extract text from PDF
        const pdfData = await pdfParse(req.file.buffer);
        const extractedText = pdfData.text;

        if (!extractedText || extractedText.trim().length < 50) {
            return res.status(400).json({
                success: false,
                message: 'PDF contains insufficient text for analysis'
            });
        }

        console.log(`📄 Analyzing PDF: ${req.file.originalname} (${Math.round(req.file.size / 1024)} KB, ${extractedText.length} chars)`);

        // Call Groq for analysis
        const analysis = await GroqPdfService.analyzeDocument(extractedText, req.file.originalname);

        // Save to database
        const savedAnalysis = await PdfAnalysisModel.create({
            user_id: userId,
            file_name: req.file.originalname,
            file_size: req.file.size,
            summary: analysis.summary || "Analysis completed",
            key_entities: Array.isArray(analysis.keyEntities) ? analysis.keyEntities : [],
            technologies: Array.isArray(analysis.technologies) ? analysis.technologies : [],
            requirements: Array.isArray(analysis.requirements) ? analysis.requirements : [],
            recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : [],
            full_analysis: analysis.fullAnalysis || "Analysis completed successfully."
        });

        res.json({
            success: true,
            data: {
                id: savedAnalysis.id,
                file_name: savedAnalysis.file_name,
                file_size: savedAnalysis.file_size,
                summary: savedAnalysis.summary,
                keyEntities: savedAnalysis.key_entities,
                technologies: savedAnalysis.technologies,
                requirements: savedAnalysis.requirements,
                recommendations: savedAnalysis.recommendations,
                fullAnalysis: savedAnalysis.full_analysis,
                created_at: savedAnalysis.created_at
            }
        });

    } catch (error) {
        console.error('PDF analysis error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to analyze PDF'
        });
    }
}

/**
 * Get user's analysis history
 * GET /api/pdf/history
 */
async function getAnalysisHistory(req, res) {
    try {
        const userId = req.userId;

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const analyses = await PdfAnalysisModel.findByUser(userId);

        // Transform each analysis to camelCase for frontend
        const transformedAnalyses = analyses.map(analysis => ({
            id: analysis.id,
            file_name: analysis.file_name,
            file_size: analysis.file_size,
            summary: analysis.summary,
            keyEntities: analysis.key_entities || [],
            technologies: analysis.technologies || [],
            requirements: analysis.requirements || [],
            recommendations: analysis.recommendations || [],
            fullAnalysis: analysis.full_analysis,
            created_at: analysis.created_at
        }));

        res.json({
            success: true,
            data: {
                analyses: transformedAnalyses,
                total: transformedAnalyses.length
            }
        });

    } catch (error) {
        console.error('Get analysis history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get analysis history'
        });
    }
}

/**
 * Get specific analysis by ID
 * GET /api/pdf/history/:id
 */
async function getAnalysisById(req, res) {
    try {
        const { id } = req.params;
        const userId = req.userId;

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const analysis = await PdfAnalysisModel.findById(id, userId);

        if (!analysis) {
            return res.status(404).json({
                success: false,
                message: 'Analysis not found'
            });
        }

        // Transform database fields to camelCase for frontend
        const transformedAnalysis = {
            id: analysis.id,
            file_name: analysis.file_name,
            file_size: analysis.file_size,
            summary: analysis.summary,
            keyEntities: analysis.key_entities || [],      // Map key_entities → keyEntities
            technologies: analysis.technologies || [],
            requirements: analysis.requirements || [],
            recommendations: analysis.recommendations || [],
            fullAnalysis: analysis.full_analysis,          // Map full_analysis → fullAnalysis
            created_at: analysis.created_at
        };

        res.json({
            success: true,
            data: transformedAnalysis
        });

    } catch (error) {
        console.error('Get analysis by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get analysis'
        });
    }
}

/**
 * Delete analysis
 * DELETE /api/pdf/history/:id
 */
async function deleteAnalysis(req, res) {
    try {
        const { id } = req.params;
        const userId = req.userId;

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        await PdfAnalysisModel.delete(id, userId);

        res.json({
            success: true,
            message: 'Analysis deleted successfully'
        });

    } catch (error) {
        console.error('Delete analysis error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete analysis'
        });
    }
}

module.exports = {
    uploadMiddleware,
    analyzePdf,
    getAnalysisHistory,
    getAnalysisById,
    deleteAnalysis
};