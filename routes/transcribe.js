const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const { Datastore } = require('@google-cloud/datastore');

const datastore = new Datastore();

const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();

const speech = require('@google-cloud/speech');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });
const client = new speech.SpeechClient();

const upsertRecord = async (kind, id, data) => {
  const key = datastore.key([kind, id]);
  
  const entity = {
    key,
    data: Object.entries(data).map(([name, value]) => ({ 
      name, 
      value, 
      excludeFromIndexes: ['transcriptionText', 'transcriptionJson'].includes(name) // Exclude transcriptionText and transcriptionJson from indexes
    })),
  };

  try {
    await datastore.save(entity);
    console.log(`Upserted ${key}: ${data}`);
  } catch (err) {
    console.error('ERROR:', err);
  }
};

router.get('/', async (req, res) => {
  try {
    const query = datastore.createQuery('transcription');
    const [transcriptions] = await datastore.runQuery(query);
    res.render('transcribe', { transcriptions, datastore });
  } catch (error) {
    console.error('ERROR:', error);
    res.status(500).send('An error occurred');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    // Retrieve the transcription from the datastore using the ID
    const key = datastore.key(['transcription', id]);
    const [data] = await datastore.get(key);
    gsUri = data.audioFileLink;
    const bucketName = gsUri.split('/')[2];
    const objectName = gsUri.split('/').slice(3).join('/');
    const audioUrl = `http://storage.googleapis.com/${bucketName}/${objectName}`;


    // Get formatted text...
    const transcriptionJson = JSON.parse(data.transcriptionJson);

    const formatTime = (seconds, nanos) => {
      const formattedSeconds = seconds || '0';
      const formattedNanos = nanos || '0';
      return parseFloat(`${formattedSeconds}.${formattedNanos}`);
    };

    const spans = transcriptionJson.results.flatMap((result) =>
      result.alternatives.flatMap((alternative) => {
        const sentenceSpans = alternative.words.map((word) =>
          `<span data-start-time="${formatTime(word.startTime.seconds, word.startTime.nanos)}"
                data-end-time="${formatTime(word.endTime.seconds, word.endTime.nanos)}">${word.word}</span>`
        );
        return `<p class="sentence">${sentenceSpans.join(' ')}</p>`;
      })
    );
    
    const html = spans.join(' ');

    // Render the view_transcription page with the retrieved transcription data
    res.render('view_transcription', { textHtml: html, audioUrl: audioUrl, transcription: data || {} });
  } catch (error) {
    console.error('ERROR:', error);
    // Handle any errors that occur during retrieval
    res.status(500).send('An error occurred while retrieving the transcription');
  }
});

router.post('/', upload.single('audio'), async (req, res) => {
  const io = req.app.get('socketio');

  //===================== create DB record ==================== 
  const id = uuidv4();

  const initialData = {
    id: id,
    originalFileName: req.file.originalname,
    newFileName: 'generating...',
    notes: "testtest notedd",
    transcriptionStatus: false,
    uploadStatus: false
  }

  upsertRecord('transcription', id, initialData)

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
  
  const secondData = {...initialData, ...{uploadStatus: true, audioFileLink: gcsUri}}
  // Create an entity object with the key and data
  upsertRecord('transcription', id, secondData)
  
  // Start a poll to check if file exists before proceeding to transcription
  let fileExists = false;
  let retries = 0;
  const maxRetries = 20; // set your max retries here
  const delay = 1000; // delay in milliseconds between each retry

  const checkFileExists = async () => {
      const [exists] = await storage.bucket(bucketName).file(convertedFileName).exists();
      fileExists = exists;
      if (fileExists || retries >= maxRetries) {
          if (!fileExists) {
              io.emit('transcribeStatus', 'Error: File not found in Google Cloud Storage after all retries.');
              return;
          }
          io.emit('transcribeStatus', 'Transcription started, please wait...');
          
          const audio = { uri: gcsUri };
          const config = {
            enableAutomaticPunctuation: true,
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

              const tdata = {
                transcriptionText: transcription,
                transcriptionJson: JSON.stringify(result),
                transcriptionStatus: true
              };

              thirdData = {...secondData, ...tdata}

              upsertRecord('transcription', id, thirdData)

              io.emit('transcribeStatus', `Transcription complete!`);
              io.emit('transcribeResult', JSON.stringify(result));
            })
            .on('error', (error) => {
              io.emit('transcribeStatus', `Error: ${error}`);
            });
      } else {
          retries++;
          setTimeout(checkFileExists, delay);
      }
  }

  checkFileExists();

  const query = datastore.createQuery('transcription');
  const [transcriptions] = await datastore.runQuery(query);
  res.render('transcribe', { transcriptions, datastore });
});

module.exports = router;

// data: [
//   { name: 'audioFileLink', value: data.audioFileLink, excludeFromIndexes: false },
//   { name: 'transcriptionJson', value: data.jsonTranscriptionLink, excludeFromIndexes: false },
//   { name: 'createdTime', value: data.createdTime, excludeFromIndexes: false },
//   { name: 'updatedTime', value: data.updatedTime, excludeFromIndexes: false },
//   { name: 'caseName', value: data.caseName, excludeFromIndexes: false },
//   { name: 'notes', value: data.notes, excludeFromIndexes: false },
//   { name: 'transcriptionStatus', value: data.transcriptionStatus, excludeFromIndexes: false },
//   { name: 'uploadStatus', value: data.uploadStatus, excludeFromIndexes: false },
//   { name: 'title', value: data.title, excludeFromIndexes: false },
//   { name: 'duration', value: data.duration, excludeFromIndexes: false },
//   { name: 'wordLength', value: data.wordLength, excludeFromIndexes: false },
//   { name: 'summary', value: data.summary, excludeFromIndexes: false },
//   { name: 'highlights', value: JSON.stringify(data.highlights), excludeFromIndexes: false },
// ],