///////////////////////////////////
// step1Watcher
//

import { createRequire } from "module";
const require = createRequire(import.meta.url);
require('dotenv').config();
const path = require('path');
const Express = require('express');
const fs = require('fs');
const cors = require('cors');

const chokidar = require('chokidar');
const pino = require('pino')();

import { Configuration, OpenAIApi } from "openai";

const apiKey = process.env.OPENAI_SECRET;

const configuration = new Configuration({
  apiKey: apiKey,
});
const openai = new OpenAIApi(configuration);

const port = 8201;
let readyToProcess = false;
let watcher = null
let activeClients = []

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

    // path is of the form ${client}/new/filename.ext, because we're using option cwd.
    // We process only extensions mp3, mp4, mpeg, mpga, m4a, wav, and webm.
    const goodextensions = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']
    // pino.info(`"add" event for "${path}"`);
    const re = /^(.+)\/new\/(.+)\.(.+)$/gm;
    const splitstring = path.split(re)
    const clientName = splitstring[0]
    const filename = splitstring[2]
    const ext = splitstring[3]
    if (!goodextensions.includes(ext)) {
      // invalid extension - skipping it
      pino.error(`Skipping ${path}. It has non-audio extension`)
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
  activeClients.push(`${clientName}/new`);
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

const triggerWhisper = async (fpath, clientName, filename, ext) => {

  // Start Whisper processing of file at fpath.
  // When complete, move input file to clients/${clientName}/processed.
  let audioFile = null
  pino.info(`In triggerWhisper for ${fpath}`);
  try {

    audioFile = fs.createReadStream(path.resolve('../clients', fpath))
  } catch(error) {

    pino.error(`Error received reading ${fpath}: ${error.message}`)
  }
  
  if (audioFile) {

    try {

      const response = await openai.createTranscription(

        audioFile,
        "whisper-1"
      )
      pino.info(`Got back "${response.data.text}. Will score, etc."`)
    } catch(error) {

      pino.error(`Error from openai: ${error.message}`)
    }
  }
}

  // Not sure yet how this is going to work eventually, but for now....
  //
  // There is a settings.json file in ../clients/${clientName}. It takes the place
  // of using a database (at least for now). It has this format:
  /*
    {
      version: 110,
      clientName: 'XYZ Hospital Corp.',
      good_words: [],
      bad_words: [],
    }
  */
  // We will start a file watcher in ../clients/${clientName}/new.
  //

(async () => {

  try {

    const app = Express();
    app.use(cors());
    app.use(Express.json());

    initializeWatcher();

    app.post('/addClientDir', async (req, res) => {

      pino.info(`req.query = ${JSON.stringify(req.query)}`)
      pino.info(`Enter "/addClientDir" post route for ${req.query.clientName}`);
      try {

        addClientDir(req.query.clientName);

        res.json({

          success: true,
          payload: {added: req.query.clientName}
        })
      } catch (x) {

        pino.info(`Error in "/addClientDir" post route: ${x.message}`);
        res.json({

          success: false,
          payload: x.message
        });
      } finally {

        pino.info(`Exit "/addClientDir" post route`);
      }
    })

    app.post('/removeClientDir', async (req, res) => {

      pino.info(`Enter "/removeClientDir" post route for ${req.body.clientName}`);
      try {

        removeClientDir(req.body.clientName);

        res.json({

          success: true,
          payload: {removed: req.body.clientName}
        })
      } catch (x) {

        pino.info(`Error in "/removeClientDir" post route: ${x.message}`);
        res.json({

          success: false,
          payload: x.message
        });
      } finally {

        pino.info(`Exit "/removeClientDir" post route`);
      }
    })

    app.listen(port, () => {

      pino.info(`pino: Watcher listening on port ${port}`);
    })
  } catch (x) {

    pino.info(`Error in Watcher: ${x.message}`);
  }
})();
