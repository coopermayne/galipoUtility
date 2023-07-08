// =========================== CONFIG ================================ //
const express = require('express');
const axios = require('axios');
const multer = require('multer');

const { Client } = require("@notionhq/client")

const { Configuration, OpenAIApi } = require("openai");
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const speech = require('@google-cloud/speech');
const textToSpeech = require('@google-cloud/text-to-speech');
const {Storage} = require('@google-cloud/storage');
const storage = new Storage();
const myBucket = storage.bucket('main_bucket3214');

// Server set up
const app = express();
app.use(express.json());  // This line allows Express to parse JSON bodies
const server = require('http').createServer(app);
const port = process.env.PORT || 1337;
const io = require('socket.io')(server);

// Config App
app.use('/assets', express.static(__dirname + '/public'));
app.use('/session/assets', express.static(__dirname + '/public'));

app.set('view engine', 'ejs');

// Google Cloud set up
const speechClient = new speech.SpeechClient(); // Creates a client
const textToSpeechClient = new textToSpeech.TextToSpeechClient();
const secretClient = new SecretManagerServiceClient();

// Global variable for OpenAI password
let openai;


const upload = multer();


// =========================== NOTION INTEGRATION ================================ //
async function testNotion() {
  const { Client } = require('@notionhq/client');

  const notion = new Client({ auth: NOTION_TOKEN});

  (async () => {
    const databaseId = '949b7a7987464d428f5cfb9b043a3b32';
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        "property": "Team",
        "multi_select": {
            "contains": "CAM"
       }
     }
    });

    const pageId = '8569e66ac87f461d85777cb63eaaf34d';
    const propertyId = "fBEZ"
    const response2 = await notion.pages.properties.retrieve({ page_id: pageId, property_id: propertyId });
    console.log(response2.results[0].rich_text);

  })();
}
// =========================== TODOIST INTEGRATION ================================ //

const TODOIST_API_URL = 'https://api.todoist.com/rest/v2';

async function getProjectNames() {
  const response = await axios.get(`${TODOIST_API_URL}/projects`, {
    headers: {
      'Authorization': `Bearer ${TODOIST_BEARER_TOKEN}`
    }
  });

  const projects = response.data;
  const projectNames = {};

  projects.forEach(project => {
    projectNames[project.id] = project.name;
  });

  return projectNames;
}

async function getTasksForTodayAndTomorrow() {
  const response = await axios.get(`${TODOIST_API_URL}/tasks`, {
    headers: {
      'Authorization': `Bearer ${TODOIST_BEARER_TOKEN}`
    }
  });

  const tasks = response.data;
  const projectNames = await getProjectNames();

  const today = new Date();
  today.setHours(23, 59, 59, 999); // Set the time to the start of today

  const tasksForTodayAndTomorrow = tasks.filter(task => {
    const dueDate = new Date(task.due?.date);
    return dueDate <= today;
  });

  tasksForTodayAndTomorrow.forEach(task => {
    if (task.project_id) {
      task.project_name = projectNames[task.project_id];
    }
  });

  let tasksForTodayAndTomorrowFiltered = tasksForTodayAndTomorrow.map(task => {
    return {
      project_name: task.project_name,
      content: task.content,
      due_date: task.due ? task.due.date : null, // Check if 'due' exists to avoid errors
      priority: task.priority
    };
  });

  return tasksForTodayAndTomorrowFiltered;
}


// =========================== ROUTES ================================ //

app.get('/', function (req, res) {
    res.render('index', {});
});

app.post('/transcribefile', upload.single('audio'), async (req, res) => {
  const audioBuffer = req.file.buffer;

  
  const config = {
    encoding: 'LINEAR16',
    sampleRateHertz: 16000,
    languageCode: 'en-US',
  };

  const audio = {
    content: audioBuffer.toString('base64'),
  };

  const request = {
    config: config,
    audio: audio,
  };

  const [operation] = await speechClient.longRunningRecognize(request);

  const [response] = await operation.promise();

  response.results.forEach(result => {
    console.log(`Transcription: ${result.alternatives[0].transcript}`);
    result.alternatives[0].words.forEach(wordInfo => {
      const startSecs = `${wordInfo.startTime.seconds}.${wordInfo.startTime.nanos / 100000000}`;
      const endSecs = `${wordInfo.endTime.seconds}.${wordInfo.endTime.nanos / 100000000}`;
      console.log(`Word: ${wordInfo.word}`);
      console.log(`\t ${startSecs} secs - ${endSecs} secs`);
    });
  });
});


app.use('/', function (req, res, next) {
    next(); // console.log(`Request Url: ${req.url}`);
});

// =========================== START SERVER ================================ //

async function fetchSecret() {
  const [version] = await secretClient.accessSecretVersion({
    name: "projects/1080939268751/secrets/OpenAI_API_Key/versions/1",
  });
  const password_openai = version.payload.data.toString();

  const configuration = new Configuration({
    apiKey: password_openai,
  });
  openai = new OpenAIApi(configuration);

  const [version2] = await secretClient.accessSecretVersion({
    name: "projects/1080939268751/secrets/todoisttoken/versions/1",
  });
  TODOIST_BEARER_TOKEN = version2.payload.data.toString();

  const [version3] = await secretClient.accessSecretVersion({
    name: "projects/1080939268751/secrets/notionapikey/versions/1",
  });
  NOTION_TOKEN = version3.payload.data.toString();

  // Start the server after fetching the secret
  server.listen(port, "127.0.0.1", function () { //http listen, to make socket work
      // app.address = "127.0.0.1";
      console.log('Server started on port:' + port)
  });
}

fetchSecret().catch((err) => {
  console.error('Error fetching secret:', err);
  process.exit(1);
});
