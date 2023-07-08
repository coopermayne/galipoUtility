const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { Storage } = require('@google-cloud/storage');
const speech = require('@google-cloud/speech');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });
const storage = new Storage();
const client = new speech.SpeechClient();

router.get('/', (req, res) => {
  res.render('transcribe');
});

router.post('/', upload.single('audio'), async (req, res) => {
  const io = req.app.get('socketio');

  //===================== file upload ==================== 
  // const file = req.file;
  const bucketName = 'main_bucket3214';

  const file = req.file;
  const fileName = file.originalname;

  // Convert audio file to WAV using FFmpeg
  const convertedFileName = `converted_${fileName}_${uuidv4()}.wav`;
  const convertedFile = storage.bucket(bucketName).file(convertedFileName);
  await new Promise((resolve, reject) => {
    ffmpeg(file.path)
      .audioChannels(1) // Convert to mono (single channel)
      .toFormat('wav')
      .output(convertedFile.createWriteStream({ resumable: false }))
      .on('end', () => {
        // Remove the original file
        fs.unlinkSync(file.path);
        console.log('Conversion completed successfully');
        resolve();
      })
      .on('error', (error) => {
        // Handle any errors that occur during conversion
        console.error('Error converting file:', error);
        reject(error);
      })
      .run();
  });
  const gcsUri = `gs://${bucketName}/${convertedFileName}`;

  io.emit('transcribeStatus', 'Transcription started, please wait...');

  const audio = { uri: gcsUri };
  const config = {
    enableWordTimeOffsets: true,
    languageCode: 'en-US' 
  };

  const request = { audio: audio, config: config };
  
  const [operation] = await client.longRunningRecognize(request);

  operation
    .on('progress', (metadata, apiResponse) => {
      console.log('progress')
      io.emit('transcribeStatus', `Progress: ${metadata.progressPercent}%`);
    })
    .on('complete', (result, apiResponse) => {
      const transcription = result.results
        .map((result) => result.alternatives[0].transcript)
        .join('\n');

        const fileName = `transcriptions_${uuidv4()}.txt`;
        const file = storage.bucket(bucketName).file(fileName);
        file.save(transcription, function(err) {
          if (!err) {
             console.log('Transcription saved to Google Cloud Storage!');
          } else {
             console.log('Error saving transcription to Google Cloud Storage:', err);
          }
        });
      io.emit('transcribeStatus', `Transcription complete!`);
      io.emit('transcribeResult', transcription);
    })
    .on('error', (error) => {
      io.emit('transcribeStatus', `Error: ${error}`);
    });
  
  res.render('transcribe', { transcription: 'Processing...' });

});

module.exports = router;

