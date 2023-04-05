///////////////////////////////////
// step1Watcher
//

import { createRequire } from "module";
const require = createRequire(import.meta.url);
require('dotenv').config();
const path = require('path');
const Express = require('express');
const fs = require('fs');
const exec = require('child_process').exec;
const cors = require('cors');

const cron = require('node-cron');
const chokidar = require('chokidar');
const pino = require('pino')();

import { Configuration, OpenAIApi } from "openai";

const apiKey = process.env.OPENAI_SECRET;
const configuration = new Configuration({ apiKey: apiKey });
const openai = new OpenAIApi(configuration);

const port = 8201;
let readyToProcess = false;
let watcher = null

// When a client is added, we do the following:
// 1. Create a folder named for the client under ServerSide/clients. The folder will contain
//    two folders (/new and /processed) and a file called settings.json. settings.json must contain
//    at least three properties: good_words, bad_words and email. *_words are either an array of words or a comma-sep
//    string of words. email is where we send activity reports.
// 2. A client, however, isn't truly active until we receive a message to /addClientDir?clientName. "Add" here
//    means add clientName to the set of clients for whom we're scanning for files. Once a client is
//    active, that state must survive restarts, etc. until a message to /removeClientDir?clientName
//    is received.
let activeClients = []

const initializeCronJob = () => {

  // We start the cron job to check Files.com for any incoming work whether or not
  // any clients are active. The task will run every 10 minutes (eventually), but every 1 minute
  // to start.
  let cronStage = 0
  pino.info(`Starting cron job`)
  const task = cron.schedule('* * * * *', () => {

    if (activeClients.length === 0) {

      pino.info(`cron has hit, but no clients are active yet - so nothing to do`)
    } else {

      pino.info(`cron has hit - looking for files`)
      let continueRunning = true;
      try {

        task.stop();

        // See if there are any files waiting for us at files.com.
        // Grab them and copy (move?) them into clients/${clientName}/new where
        // they'll be picked up by chokidar.
        let filesComCommand = ``
        if (cronStage === 0) {

          filesComCommand = `"files-cli config set --subdomain independentcall --username jerry@rubintech.com"`
        }
        exec(filesComCommand, {}, (error, stdout, stderr) => {

          if (error) {

            continueRunning = false;
            throw error;
          }
        })
      } catch (x) {

        pino.error(`Error in cron loop: ${x.message}. We've stopped looking.`)
      } finally {

        if (continueRunning) {

          task.start();
        }
      }
    }
  })
}

const initializeWatcher = () => {

  watcher = chokidar.watch([], {

    alwaysStat: false,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    },
    cwd: '../clients',
    depth: 1,
    disableGlobbing: true,
    ignoreInitial: false,
    ignorePermissionErrors: true,
    persistent: true,
  })

  watcher.on('add', (path, stats) => {

    // An audio (presumed) file has been identified.
    // path is of the form ${client}/new/filename.ext, because we're using option cwd.
    // We process only extensions mp3, mp4, mpeg, mpga, m4a, wav, and webm.
    const goodextensions = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']

    // pino.info(`"add" event for "${path}"`);
    const re = /^(.+)\/new\/(.+)\.(.+)$/gm;
    const splitstring = path.split(re)
    const clientName = splitstring[1]
    const filename = splitstring[2]
    const ext = splitstring[3]
    if (!goodextensions.includes(ext)) {

      // invalid extension - skipping it
      pino.error(`Skipping ${path}. It has non-audio extension "${ext}".`)
    } else {

      triggerWhisper(path, clientName, filename, ext)
    }
  })

  readyToProcess = true;
}

const addClientDir = (clientName) => {

  // pino.info('-------------------------------------------');
  // pino.info(`Adding ${clientName}/new`)
  watcher.add(`${clientName}/new`);

  // Read client's settings.json.
  const settings = fs.readFileSync(path.resolve('../clients', clientName, 'settings.json'), { encoding: 'utf8', flag: 'r' });

  activeClients[clientName] = JSON.parse(settings);

  // pino.info(`Now watching ${JSON.stringify(watcher.getWatched())}`)
  // pino.info(`activeClients: ${JSON.stringify(activeClients)}`)
}

const removeClientDir = (clientName) => {

  // pino.info('-------------------------------------------');
  // pino.info(`Removing ${clientName}/new`)
  watcher.unwatch(`${clientName}/new`);
  activeClients = activeClients.filter(x => x != `${clientName}/new`)
  // pino.info(`Now watching ${JSON.stringify(watcher.getWatched())}`)
  // pino.info(`activeClients: ${JSON.stringify(activeClients)}`)
}

const triggerScoring = async (fpath, clientName, recog) => {

  const settings = activeClients[clientName]
  const good_words = settings.good_words;
  const bad_words = settings.bad_words;
  const space = " ";
  const rwords = removePunctuation(recog).split(space); // need to strip attached punctuation

  let good_score = 0;
  let bad_score = 0;

  for (let word of rwords) {

    if (good_words.includes(word)) good_score++
    if (bad_words.includes(word)) bad_score++
  }

  pino.info(`goods add 1. bads subtract 0.5.`)
  const score = good_score - (bad_score / 2);
  pino.info(`Good: ${good_score}    Bad: ${bad_score}    Score: ${score}`)
}

const triggerWhisper = async (fpath, clientName, filename, ext) => {

  // Send file at fpath to Whisper.
  // When complete, move input file to clients/${clientName}/processed.
  let audioFile = null
  // pino.info(`In triggerWhisper for ${fpath}`);
  try {

    audioFile = fs.createReadStream(path.resolve('../clients', fpath))
  } catch (error) {

    pino.error(`Error received reading ${fpath}: ${error.message}`)
  }

  if (audioFile) {

    try {

      const response = await openai.createTranscription(

        audioFile,
        "whisper-1"
      )
      if (response.data.text.length) {

        // pino.info(`Got non-empty response back from Whisper."`)
        triggerScoring(fpath, clientName, response.data.text)
      } else {

        pino.info(`Got back zero-length output from Whisper.`)
      }
    } catch (error) {

      pino.error(`Error from openai (Whisper): ${error.message}`)
    }
  }
}

const removePunctuation = (text) => {

  var punctuation = /[\.,?!]/g;
  var newText = text.replace(punctuation, "");
  return newText;
}

(async () => {

  try {

    const app = Express();
    app.use(cors());
    app.use(Express.json());

    initializeCronJob();
    initializeWatcher();

    app.post('/addClientDir', async (req, res) => {

      // pino.info(`req.query = ${JSON.stringify(req.query)}`)
      // pino.info(`Enter "/addClientDir" post route for ${req.query.clientName}`);
      try {

        addClientDir(req.query.clientName);

        res.json({

          success: true,
          payload: { added: req.query.clientName }
        })
      } catch (x) {

        pino.info(`Error in "/addClientDir" post route: ${x.message}`);
        res.json({

          success: false,
          payload: x.message
        });
      } finally {

        // pino.info(`Exit "/addClientDir" post route`);
      }
    })

    app.post('/removeClientDir', async (req, res) => {

      // pino.info(`Enter "/removeClientDir" post route for ${req.body.clientName}`);
      try {

        removeClientDir(req.body.clientName);

        res.json({

          success: true,
          payload: { removed: req.body.clientName }
        })
      } catch (x) {

        pino.info(`Error in "/removeClientDir" post route: ${x.message}`);
        res.json({

          success: false,
          payload: x.message
        });
      } finally {

        // pino.info(`Exit "/removeClientDir" post route`);
      }
    })

    app.listen(port, () => {

      pino.info(`pino: Watcher listening on port ${port}`);
    })
  } catch (x) {

    pino.info(`Error in Watcher: ${x.message}`);
  }
})();
