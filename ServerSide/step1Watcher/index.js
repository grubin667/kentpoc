///////////////////////////////////
// step1Watcher
//

const path = require('path');
const Express = require('express');
const fs = require('fs');
const cors = require('cors');
const chokidar = require('chokidar');
const pino = require('pino')();

const port = 8201;
let readyToProcess = false;
let watcher = null
let activeClients = []

const initializeWatcher = () => {

  watcher = chokidar.watch([], {

    alwaysStat: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    },
    cwd: '../clients',
    depth: 1,
    disableGlobbing: true,
    ignoreInitial: false,
    ignorePermissionErrors: true,
  })

  watcher.on('add', (path, stats) => {

    pino.info(`"add" event for "${path}"`);
    triggerWhisper(path)
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

const triggerWhisper = (path) => {

  pino.info('In triggerWhisper');
  // pino.info('Start Whisper');
  // pino.info('Move new input file to processed');
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
