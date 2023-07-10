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

async function processFile(file, id, initialData) {
  const bucketName = 'main_bucket3214';

  // Convert audio file to WAV using FFmpeg
  const convertedFileName = `converted_${file.originalname}_${uuidv4()}.wav`;
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
  const httpUrl = `https://storage.googleapis.com/${bucketName}/${convertedFileName}`;

  
  const secondData = {...initialData, ...{uploadStatus: true, audioFileGs: gcsUri, audioFileHttp: httpUrl}}
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
              console.error('Error: File not found in Google Cloud Storage after all retries.');
              return;
          }
          
          const audio = { uri: gcsUri };
          const config = {
            enableAutomaticPunctuation: true,
            enableWordTimeOffsets: true,
            languageCode: 'en-US' 
          };

          const request = { audio: audio, config: config };
          
          const [operation] = await client.longRunningRecognize(request);
          
          operation
            .on('complete', async (result, apiResponse) => {
              const transcription = result.results
                .map((result) => result.alternatives[0].transcript)
                .join('\n');
                
              // Format the transcription JSON into HTML spans
              const formatTime = (seconds, nanos) => {
                const formattedSeconds = seconds || '0';
                const formattedNanos = nanos || '0';
                return parseFloat(`${formattedSeconds}.${formattedNanos}`);
              };
        
              const spans = result.results.flatMap((result) =>
                result.alternatives.flatMap((alternative) => {
                  const sentenceSpans = alternative.words.map((word) =>
                    `<span data-start-time="${formatTime(word.startTime.seconds, word.startTime.nanos)}"
                          data-end-time="${formatTime(word.endTime.seconds, word.endTime.nanos)}">${word.word}</span>`
                  );
                  return `<p class="sentence">${sentenceSpans.join(' ')}</p>`;
                })
              );
        
              const htmlSpans = spans.join(' ');
        
              const tdata = {
                transcriptionText: transcription,
                transcriptionJson: JSON.stringify(result),
                transcriptionStatus: true,
                transcriptionHtml: htmlSpans, // Save the HTML spans to the database
              };
        
              thirdData = {...secondData, ...tdata}
        
              await upsertRecord('transcription', id, thirdData)
            })
            .on('error', (error) => {
              console.error(`Error: ${error}`);
            });
      } else {
          retries++;
          setTimeout(checkFileExists, delay);
      }
  }

  checkFileExists();
}

router.post('/', upload.single('audio'), async (req, res) => {
  const id = uuidv4();

  const initialData = {
    id: id,
    originalFileName: req.file.originalname,
    newFileName: 'generating...',
    notes: "testtest notedd",
    transcriptionStatus: false,
    uploadStatus: false
  }

  // Save initial data to the database
  upsertRecord('transcription', id, initialData)

  // Redirect the user to the view page for this transcription
  res.redirect(`/transcribe`);

  // Start processing the file asynchronously
  processFile(req.file, id, initialData);
});

router.get('/', async (req, res) => {
  try {
    const query = datastore.createQuery('transcription');
    const [transcriptions] = await datastore.runQuery(query);
    res.render('transcribe', { 
      transcriptions, 
      datastore, 
      title: 'Transcription', 
      customRoute: 'transcribe'
    });
  } catch (error) {
    console.error('ERROR:', error);
    res.status(500).send('An error occurred');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    // Retrieve the transcription from the datastore using the ID
    const [data] = await datastore.get(datastore.key(['transcription', id]));

    // Render the view_transcription page with the retrieved transcription data
    res.render('view_transcription', { 
      datastore: datastore,
      title: "Transcription",
      customRoute: "view_transcription",
      transcription: data || {} });
  } catch (error) {
    console.error('ERROR:', error);
    // Handle any errors that occur during retrieval
    res.status(500).send('An error occurred while retrieving the transcription');
  }
});

router.post('/:id/delete', async (req, res) => {
  const id = req.params.id;
  const transcriptionKey = datastore.key(['transcription', id]);
  try {
    await datastore.delete(transcriptionKey);
    res.redirect('/transcribe');
  } catch (error) {
    console.error('ERROR:', error);
    res.status(500).send('An error occurred');
  }
});

module.exports = router;