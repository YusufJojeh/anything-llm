const multer = require("multer");

/**
 * In-memory audio upload shared by the existing AnythingLLM transcription
 * route and Yusuf OS. Audio is bounded and never persisted to disk.
 */
function uploadAudio(request, response, done) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => {
      if (!file.mimetype?.startsWith("audio/"))
        return callback(new Error("Only audio uploads are allowed."));
      callback(null, true);
    },
  }).single("audio");
  upload(request, response, done);
}

function handleAudioUpload(request, response, next) {
  uploadAudio(request, response, (error) => {
    if (error)
      return response.status(500).json({
        success: false,
        error: `Invalid audio upload. ${error.message}`,
      });
    next();
  });
}

function handleYusufAudioUpload(request, response, next) {
  uploadAudio(request, response, (error) => {
    if (error)
      return response.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid voice audio upload.",
          requestId: response.locals?.yusufOS?.requestId || null,
          details: { reason: error.code || "INVALID_AUDIO" },
        },
      });
    next();
  });
}

module.exports = { handleAudioUpload, handleYusufAudioUpload };
