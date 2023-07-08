const express = require('express');
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

  // const filename = `${uuidv4()}_${file.originalname}`;

  // // Upload the audio file to Google Cloud Storage
  // await storage.bucket(bucketName).upload(file.path, {
  //   destination: filename,
  // });

  // Get the GCS URI for the uploaded audio file
  // const gcsUri = `gs://${bucketName}/${filename}`;
  const gcsUri = "gs://main_bucket3214/my_voice.wav"

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

        const fileName = "transcriptions.txt";
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
