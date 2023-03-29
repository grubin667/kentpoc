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

const initializeForProcessing = async (clientName) => {

  // Not sure yet how this is going to work eventually.
  // For now, if clientName.length === 0, we will place new files into /ServerSide/clients/noname/newAudios.
  // Otherwise, we will work in /ServerSide/clients/${clientName}/newAudios.
  const watcher = chokidar.watch(`../clients/${clientName.length === 0 ? 'noname' : clientName}/newAudios`, {
    interval: 2500,
    binaryInterval: 2000,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  })

  watcher.on('all', async (event, path) => {

    pino.info(`${path} triggered ${event}`)
  })

  readyToProcess = true;
}

(async () => {

  try {

    const app = Express();
    app.use(cors());
    app.use(Express.json());

    app.post('/initialize', async (req, res) => {

      pino.info(`Enter "/initialize" post route`);
      try {

        await initializeForProcessing(req.body.clientName || '');

        res.json({

          success: true,
          payload: {initialized: readyToProcess}
        })
      } catch (x) {

        pino.info(`Error in "/initialize" post route: ${x.message}`);
        res.json({

          success: false,
          payload: x.message
        });
      } finally {

        pino.info(`Exit "/initialize" post route`);
      }
    })

    app.listen(port, () => {

      console.log(`console: Watcher listening on port ${port}`);
      pino.info(`pino: Watcher listening on port ${port}`);
    })
  } catch (x) {

    pino.info(`Error in Watcher: ${x.message}`);
  }
})();
